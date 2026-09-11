from io import StringIO
import os
from _shared_flow_utils.api.FhirAPI import FhirAPI
import ibis
import json
import duckdb
import logging
from typing import Any
import traceback as tb
from rpy2 import robjects
from functools import partial
from jsonpath_ng import parse
from asyncio import iscoroutine, run

import pandas as pd
from pandas.api.types import is_list_like, is_dict_like
import sqlalchemy as sql

from genson import SchemaBuilder
from genson.schema.node import SchemaGenerationError

from prefect import task, flow

from .hooks import *
from .flowutils import *
from .types import (NodeType,
                    TableSourceType,
                    DataMappingType,
                    ConceptMappingType)



from .nodeutils.querygenerator import *
from .nodeutils.csvutils import load_csv_from_storage
from .fhirutils.utils import omop_transform_utils
from _shared_flow_utils.dao.DBDao import DBDao
from _shared_flow_utils.types import SupportedDatabaseDialects
from _shared_flow_utils.api.SupabaseStorageAPI import SupabaseStorageAPI
from subprocess import Popen, PIPE

# Resolved relative to this module rather than hardcoded to /app/flows/... -
# run-flow.sh stages each plugin under a per-run directory (e.g.
# /var/lib/d2e-flows/data-transformation-flow/<sha>/flows/dataflow_ui_plugin),
# not a fixed /app/flows path (/app only holds the worker's own scripts).
_PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))


class Node:
    def __init__(self, name, node):
        self.id = node["id"]
        self.name = name
        self.type = node["type"]


class Flow(Node):
    def __init__(self, name, _node):
        super().__init__(name, _node)
        self.graph = _node["graph"]
        self.executor_type = _node["executor_options"]["executor_type"]
        self.executor_host = _node["executor_options"]["executor_address"]["host"]
        self.executor_port = _node["executor_options"]["executor_address"]["port"]
        self.ssl = _node["executor_options"]["executor_address"]["ssl"]
        self.sorted_nodes = get_node_list(self.graph)


class Result:
    def __init__(self, error: bool, data, node: Node, task_run_context):
        self.error = error
        self.node = node
        self.result = data # preserves the actual data of the node result
        self.task_run_id = str(task_run_context.get("id"))
        self.task_run_name = str(task_run_context.get("name"))
        self.flow_run_id = str(task_run_context.get("flow_run_id"))


    def serialize_result(self):
        base_result = {
            "error": self.error,
            "errorMessage": self.result if self.error else None,
            "nodeName": self.node.name
        }

        if self.error: return base_result
        base_result.update(self.__create_result_schema(self.result))
        return base_result
    

    def __is_strictly_list_like(self, obj):
        return is_list_like(obj) and not is_dict_like(obj)
    

    def __create_result_schema(self, result_value: Any):
        result_schema = {
            "length": len(result_value) if hasattr(result_value, "__len__") else None,
            "type": str(type(result_value))
        }

        if isinstance(result_value, pd.DataFrame):
            result_schema["schema"] = result_value.dtypes.apply(lambda x: x.name).to_dict()
            return result_schema

        try:
            builder = SchemaBuilder()
            if self.__is_strictly_list_like(result_value):
                builder.add_object(list(result_value))
            elif is_dict_like(result_value):
                builder.add_object(result_value)
            else:
                return result_schema

            schema = builder.to_schema()
            schema.pop("$schema", None)
            schema.pop("required", None)
            result_schema["schema"] = schema


        except SchemaGenerationError:
            if self.__is_strictly_list_like(result_value):
                result_schema["schema"] = [self.__create_result_schema(v) for v in result_value]
            elif is_dict_like(result_value):
                result_schema["schema"] = {k: self.__create_result_schema(v) for k, v in result_value.items()}
            
        return result_schema


class Py2TableNode(Node):
    """
    Retrieves a table using a specified path in a python object and return as table.
    
    Attributes:
        path: str
        source: str
    """
    def __init__(self, name, _node):
        super().__init__(name, _node)
        self.map = _node.get("map")
        self.ui_map = _node.get("uiMap")


    def _get_matches(self, json_to_parse: dict, json_path: str):
        expression = parse(json_path)

        matched: list = expression.find(json_to_parse)

        # Assume only one match so return index 0
        return matched[0].value
    
    def __create_dataframe(self, data: dict|list) -> pd.DataFrame:
        if isinstance(data, dict):
            if all(not isinstance(v, list) for v in data.values()):
                # If values are all scalar, need to pass in index
                index = [0]
                return pd.DataFrame(data, index=index)
            else:
                return pd.DataFrame.from_dict(data)
        else:
            # Data is list
            return pd.DataFrame(data)

    def _exec(self, _input: dict[str, Result]) -> pd.DataFrame:
        source_node = self.ui_map.get("source").split(".")[0]
        path = self.ui_map.get("path")
        result_obj = _input.get(source_node).result

        if isinstance(result_obj, pd.DataFrame):
            return result_obj
        elif isinstance(result_obj, dict):
            # If result from input node is already a json/dict object, use jsonpath to access data
            data = self._get_matches(result_obj, path)
        else:
            # Assume result from input node is an instance of a class
            # Remove first element and use it to access the attribute that stores the data
            path_list: list = path.split(".")
            data_attribute = path_list.pop(0)
            json_to_parse = getattr(result_obj, data_attribute)
            data = self._get_matches(json_to_parse, ".".join(path_list))

        df = self.__create_dataframe(data)
        return df
    
    def _check_input(self, _input: dict[str, Result], task_run_context) -> Result | None:
        source_node = self.ui_map.get("source", "").split(".")[0]
        upstream = _input.get(source_node)
        if upstream is None or upstream.result is None:
            return Result(True, f"No input data: no result received from '{source_node}'", self, task_run_context)
        if upstream.error:
            return Result(True, f"No input data: upstream node '{source_node}' failed, fix that node first", self, task_run_context)
        if isinstance(upstream.result, (str, bytes, int, float, bool)):
            return Result(True, f"No input data: result from '{source_node}' is not a table or object", self, task_run_context)
        return None

    def test(self, _input: dict[str, Result], task_run_context):
        try:
            no_input = self._check_input(_input, task_run_context)
            if no_input:
                return no_input
            table_df = self._exec(_input)
            return Result(False,  table_df, self, task_run_context)
        except Exception as e:
            return Result(True, tb.format_exc(), self, task_run_context)


    def task(self, _input: dict[str, Result], task_run_context):
        try:
            no_input = self._check_input(_input, task_run_context)
            if no_input:
                return no_input
            table_df = self._exec(_input)
            return Result(False,  table_df, self, task_run_context)
        except Exception as e:
            return Result(True, tb.format_exc(), self, task_run_context)


class SqlNode(Node):
    """
    Execute queries on pandas dataframes using duckdb as backend.
    
    Attributes:
        tables: A dictionary mapping of a user input table name to a dataframe from an incoming node. 
        sql: The sql query to execute.
    """
    def __init__(self, name, _node):
        super().__init__(name, _node)
        self.sql = _node["sql"]
        
    def __exec_query(self, _input: dict[str, Result]) -> pd.DataFrame:
        con = None
        try:
            # create temporary in-memory table and register input dfs as tables
            con = duckdb.connect()
            # If _input is empty i.e. no linked nodes assume dummy query and execute
            if _input == {}:
                result_df = con.execute(self.sql).fetch_df()
            else:
                for nodename, input_node_result in _input.items():
                    data = input_node_result.result

                    # Register incoming dfs as tables using nodename
                    if isinstance(data, str):
                        temp_df = pd.DataFrame(json.loads(data))
                        con.register(nodename, temp_df)
                    else:
                        
                        con.register(nodename, data)
                result_df = con.execute(self.sql).fetch_df()
            return result_df
        except Exception as e:
            raise e
        finally:
            if con:
                con.close()
        
            
    def task(self, _input: dict[str, Result], task_run_context)  -> pd.DataFrame:
        try:
            result_df = self.__exec_query(_input)
            return Result(False,  result_df, self, task_run_context)
        except Exception as e:
            return Result(True, tb.format_exc(), self, task_run_context)

    def test(self, _input: dict[str, Result], task_run_context):
        return self.task(_input, task_run_context)


class PythonNode(Node):
    def __init__(self, name, _node):
        super().__init__(name, _node)
        self.source_code = _node["python_code"] + '\noutput = exec(myinput)'
        self.test_source_code = _node["python_code"]+'\noutput = test_exec(myinput)'
        
    def test(self, _input: dict[str, Result],
             shared_variables: dict[str, str],
             importlibs: list[str],
             task_run_context):
        return self.task(_input, shared_variables, importlibs, task_run_context)

    def task(self, _input: dict[str, Result],
             shared_variables: list[dict[str, str]],
             importlibs: list[str],
             task_run_context,
             databases: list[dict] = None,
             schemas: list[dict] = None):
        params = {"myinput": _input, "output": {}}
        try:
            if shared_variables:
                for item in shared_variables:
                    params[item["key"]] = item["value"]
            if databases:
                for db in databases:
                    params[db["name"]] = db["code"]
            if schemas:
                for s in schemas:
                    params[s["name"]] = s["schema"]
            if importlibs:
                exec("\n".join(importlibs), params)
            code = compile(self.source_code, '<string>', 'exec')

            data = exec(code, params)
            output = params["output"]
            # If python code was async, output will be a coroutine
            if iscoroutine(output):
                params["output"] = run(output)
            return Result(False,  params["output"], self, task_run_context)
        except Exception as e:
            return Result(True, tb.format_exc(), self, task_run_context)


class RNode(Node):
    def __init__(self, name, _node):
        super().__init__(name, _node)
        self.r_code = ''''''+_node["r_code"]+''''''

    def test(self, _input: dict[str, Result], task_run_context):
        
        with robjects.conversion.localconverter(robjects.default_converter):
            r_inst = robjects.r(self.r_code)
            r_test_exec = robjects.globalenv['test_exec']
            global_params = {"r_test_exec": r_test_exec, "convert_R_to_py": convert_R_to_py,
                             "myinput": convert_py_to_R(_input), "output": {}}
            e = exec(
                f'output = convert_R_to_py(r_test_exec(myinput))', global_params)
        output = global_params["output"]
        return output

    def task(self, _input: dict[str, Result], task_run_context):
        try:
            with robjects.conversion.localconverter(robjects.default_converter):
                r_inst = robjects.r(self.r_code)
                r_exec = robjects.globalenv['exec']
                global_params = {"r_exec": r_exec, "convert_R_to_py": convert_R_to_py,
                                 "myinput": convert_py_to_R(_input), "output": {}}
                e = exec(f'output = convert_R_to_py(r_exec(myinput))',
                         global_params)
            output = global_params["output"]
            return Result(False,  output, self, task_run_context)
        except Exception as e:
            return Result(True, tb.format_exc(), self, task_run_context)


class CsvNode(Node):
    def __init__(self, name, _node):
        super().__init__(name, _node)
        self.file = _node["file"]
        self.delimiter = _node["delimiter"]

        self.names = _node["columns"]
        self.hasheader = _node["hasheader"]
        self.encoding = _node.get("encoding", "utf8")

    def test(self, task_run_context):
        df = load_csv_from_storage(
            node_id=self.id,
            filename=self.file,
            hasheader=self.hasheader,
            delimiter=self.delimiter,
            names=self.names,
            encoding=self.encoding
        )
        return df

    def task(self, task_run_context) -> Result:
        try:
            df = load_csv_from_storage(
                node_id=self.id,
                filename=self.file,
                hasheader=self.hasheader,
                delimiter=self.delimiter,
                names=self.names,
                encoding=self.encoding
            )
            return Result(False,  df, self, task_run_context)
        except Exception as e:
            return Result(True, tb.format_exc(), self, task_run_context)


class TransformFhirDataNode(Node):
    def __init__(self, name, _node):
        super().__init__(name, _node)
        self.structure_map = _node["structure_map"]
        self.dataframe = _node["dataframe"]

    def _expand_list_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        expanded_rows = []

        for _, row in df.iterrows():
            row_dict = row.to_dict()
            list_lengths = [len(value) for value in row_dict.values() if isinstance(value, list)]

            if not list_lengths:
                expanded_rows.append(row_dict)
                continue

            max_len = max(list_lengths)
            for index in range(max_len):
                expanded_row = {}
                for column, value in row_dict.items():
                    if isinstance(value, list):
                        if not value:
                            expanded_row[column] = None
                        elif len(value) == 1:
                            expanded_row[column] = value[0]
                        else:
                            expanded_row[column] = value[index] if index < len(value) else None
                    else:
                        expanded_row[column] = value
                expanded_rows.append(expanded_row)

        if not expanded_rows:
            return df.iloc[0:0].copy()

        return pd.DataFrame(expanded_rows)
        
    def get_fhir_structure_definition(self, folder: str, source_resource_name: str) -> dict:
        # Previous implementation (kept for reference, do not remove):
        # fhir_api = FhirAPI()
        # print("Getting source structure definition from FHIR server...")
        # print(f"URL: {url}")
        # query = f"?url={url}"
        # response = fhir_api.get(resource_type="StructureDefinition", query=query)
        # if response:
        #     entries = response.get("entry", [])
        #     return entries[0].get("resource", {}) if entries else {}

        print("Getting source structure definition from local folder...")
        print(f"FHIR Resource: {source_resource_name}")

        if not os.path.isdir(folder):
            return {}

        resource_file = os.path.join(folder, f"{source_resource_name}.json")
        if os.path.isfile(resource_file):
            with open(resource_file, "r", encoding="utf8") as f:
                return json.load(f)

        return {}
    
    def get_omop_structure_definition_by_url(self, folder: str, incoming_url: str) -> dict:
        for fname in os.listdir(folder):
            if fname.endswith('.json'):
                file_path = os.path.join(folder, fname)
                with open(file_path, "r", encoding="utf8") as f:
                    try:
                        data = json.load(f)
                    except Exception:
                        raise Exception("Target omop structure definition file not found")
                    if data.get("url") == incoming_url:
                        return data
        raise Exception(f"OMOP Structure Definition not found for url: {incoming_url}")

    def omop_table_name(self, target_structure_definition_url: str) -> str:
        return omop_transform_utils.omop_tables.get(target_structure_definition_url)

    def transform_fhir_data(self, input_fhir_df: pd.DataFrame = None) -> pd.DataFrame | None:
        if input_fhir_df is None:
            raise Exception("Input FHIR Dataframe is None")
        if self.structure_map is None:
            raise Exception("Structure map is not defined")

        source_structure_definition_url = ""
        target_structure_definition_url = ""
        structure_list = json.loads(self.structure_map).get("structure", [])
        for struct in structure_list:
            if struct['mode'] == 'source':
                source_structure_definition_url = struct['url']
            elif struct['mode'] == 'target':
                target_structure_definition_url = struct['url']

        if not source_structure_definition_url:
            raise Exception("Source Structure Definition URL is missing in structure map")
        if not target_structure_definition_url:
            raise Exception("Target Structure Definition URL is missing in structure map")

        omop_table_name = self.omop_table_name(target_structure_definition_url)
        if omop_table_name is None:
            raise Exception(f"OMOP table mapping not found for target structure definition url: {target_structure_definition_url}")

        source_resource_name = source_structure_definition_url.rstrip("/").split("/")[-1]
        folder = os.path.join(_PLUGIN_DIR, "fhirutils", "fhir_structureDefinition")
        source_structure_definition = self.get_fhir_structure_definition(folder, source_resource_name)
        if not source_structure_definition:
            raise Exception(f"Source Structure Definition not found for url: {source_structure_definition_url}")

        folder = os.path.join(_PLUGIN_DIR, "fhirutils", "omop_structureDefinition")
        target_structure_definition = self.get_omop_structure_definition_by_url(folder, target_structure_definition_url)

        fhir_resource = None
        if "_raw" in input_fhir_df.columns:
            content_list = input_fhir_df["_raw"].tolist()
            fhir_resource = content_list if content_list else None

        transformed_omop = []
        script_path = os.path.join(_PLUGIN_DIR, "fhirutils", "fhir_transform.js")

        print("Starting FHIR Transform...")
        if fhir_resource:
            with Popen(
                [
                    'node',
                    script_path,
                    self.structure_map,
                    json.dumps(fhir_resource),
                    json.dumps(source_structure_definition),
                    json.dumps(target_structure_definition)
                ],
                stdout=PIPE,
                stderr=PIPE,
                text=True
            ) as process:
                stdout, stderr = process.communicate()
                if process.returncode != 0:
                    raise Exception(f"FHIR Transform failed with error: {stderr or stdout}")
                results = json.loads(stdout)
                for transformed_data in results:
                    transformed_data = omop_transform_utils.apply_casts(transformed_data, omop_transform_utils.target_field_types.get(omop_table_name, {}))
                    transformed_omop.append(transformed_data)
            df = pd.json_normalize(transformed_omop)
            df = self._expand_list_columns(df)
            data_columns = [col for col in df.columns if col != "meta.profile"]
            if data_columns:
                non_empty_mask = df[data_columns].notna().any(axis=1)
                filtered_count = int((~non_empty_mask).sum())
                if filtered_count:
                    print(f"Filtered {filtered_count} empty transformed rows")
                df = df.loc[non_empty_mask].reset_index(drop=True)
            print(f"FHIR Transform completed successfully")
            print(f"Transformed DataFrame shape: {df.shape}")
            print("Transformed DataFrame dtypes:")
            print(df.dtypes.to_string())
            print("Transformed DataFrame rows:")
            with pd.option_context(
                "display.max_rows", None,
                "display.max_columns", None,
                "display.width", None,
                "display.max_colwidth", None,
            ):
                print(df.to_string(index=False))
        else:
            df = None
        return df

    def test(self, task_run_context) -> Result:
        try:
            df = self.transform_fhir_data()
            return Result(False, df, self, task_run_context)
        except Exception as e:
            return Result(True, tb.format_exc(), self, task_run_context)

    def task(self, _input: dict[str, Result], task_run_context) -> Result:
        try:
            upstream = _input.get(self.dataframe)
            if upstream is None or upstream.result is None or len(upstream.result) == 0:
                return Result(True, f"No input data: the incoming dataframe from '{self.dataframe}' is empty", self, task_run_context)
            if upstream.error:
                return Result(True, f"No input data: upstream node '{self.dataframe}' failed, fix that node first", self, task_run_context)
            df_to_write = upstream.result
            if not isinstance(df_to_write, pd.DataFrame):
                return Result(True, f"No input data: result from '{self.dataframe}' is not a dataframe", self, task_run_context)
            if "_raw" not in df_to_write.columns or df_to_write["_raw"].dropna().empty:
                return Result(True, f"No input data: the incoming dataframe from '{self.dataframe}' has no FHIR resources in the '_raw' column", self, task_run_context)
            df = self.transform_fhir_data(df_to_write)
            if df is None:
                raise Exception("Transformation resulted in empty dataframe")
            df = df.drop(columns=["meta.profile"], errors='ignore')
            df = df.drop(columns=["resourceType"], errors='ignore')
            return Result(False, df, self, task_run_context)
        except Exception as e:
            return Result(True, tb.format_exc(), self, task_run_context)

class GenericFileNode(Node):
    """
    Loads a file or a zip file and return its address.
    """
    def __init__(self, name, _node):
        super().__init__(name, _node)
        self.file = _node["file"]
        logging.info(f"GenericFileNode: file={self.file}")

    def task(self, task_run_context) -> Result:
        try:
            node_id = self.id
            filename = self.file

            result = {
                "node_id": node_id,
                "filename": filename
            }
            return Result(False, result, self, task_run_context)

        except Exception as e:
            return Result(True, tb.format_exc(), self, task_run_context)
        
class DbWriter(Node):
    def __init__(self, name, _node):
        super().__init__(name, _node)
        self.schema_name = _node["schemaname"]
        self.table_name = _node["dbtablename"]
        self.database = _node["database"]
        self.dataframe = _node["dataframe"]
        self.truncate = _node.get("truncate", False)

    def test(self, _input: dict[str, Result], task_run_context):
        return False

    def _truncate_table(self, dbconn, dialect: str) -> None:
        if dialect == SupportedDatabaseDialects.BIGQUERY.value:
            truncate_sql = f"TRUNCATE TABLE `{self.schema_name}`.`{self.table_name}`"
            with dbconn.connect() as conn:
                conn.execute(sql.text(truncate_sql))
        else:
            with dbconn.begin() as conn:
                conn.execute(sql.text(f'TRUNCATE TABLE "{self.schema_name}"."{self.table_name}"'))

    def task(self, _input: dict[str, Result], task_run_context):
        try:
            upstream = _input.get(self.dataframe)
            if upstream is None:
                return Result(True, f"No input data: upstream node '{self.dataframe}' did not run", self, task_run_context)
            if upstream.error:
                return Result(True, f"No input data: upstream node '{self.dataframe}' failed, fix that node first", self, task_run_context)
            if upstream.result is not None and not isinstance(upstream.result, pd.DataFrame):
                return Result(True, f"No input data: result from '{self.dataframe}' is not a dataframe", self, task_run_context)

            dbutils = DBDao(database_code=self.database)
            if dbutils.dialect == SupportedDatabaseDialects.TREX.value:
                return Result(True, f"Writing to a trex database ('{self.database}') is not supported by the DB writer node", self, task_run_context)
            dbconn = dbutils.engine

            # Truncate whenever the upstream ran validly, even with zero rows - it's a
            # full-refresh semantics (empty source this run should mean an empty table,
            # not a stale one left over from a previous run), distinct from an upstream
            # that errored or never ran, which is left untouched above.
            if self.truncate:
                self._truncate_table(dbconn, dbutils.dialect)

            df_to_write = upstream.result
            if df_to_write is None or len(df_to_write) == 0:
                note = "Table truncated; " if self.truncate else ""
                return Result(False, f"{note}no rows to write: the incoming dataframe from '{self.dataframe}' is empty", self, task_run_context)

            result = df_to_write.to_sql(
                self.table_name,
                dbconn,
                schema=self.schema_name,
                if_exists='append',
                index=False,
            )
            return Result(False, result, self, task_run_context)
        except Exception as e:
            return Result(True, tb.format_exc(), self, task_run_context)

class DBReader(Node):
    def __init__(self, name, _node):
        super().__init__(name, _node)
        self.sqlquery = _node["sqlquery"]
        self.schemaname = "cdmdefault" # Use as the default schema for all dialects
        self.database = _node["database"]
        self.testdata = _node["testdata"]

    def test(self, task_run_context):
        return Result(False,  pd.read_json(json.dumps(self.testdata), orient="split"), self, task_run_context)

    def task(self, task_run_context) -> Result:
        try:
            dbutils = DBDao(database_code=self.database)
            if dbutils.dialect == SupportedDatabaseDialects.TREX.value:
                df = dbutils.query_dataframe(self.sqlquery)
            else:
                df = pd.read_sql_query(self.sqlquery, dbutils.engine)
            return Result(False,  df, self, task_run_context)
        except Exception as e:
            return Result(True, tb.format_exc(), self, task_run_context)

class ConceptMappingNode(Node):
    def __init__(self, name, _node):
        super().__init__(name, _node)

        self.concept_mapping_data = _node["data"]["csvData"]["data"]
        
    def test(self, task_run_context) -> Result:
        return self.task(task_run_context)
    
    def task(self, task_run_context) -> Result:
        try:
            checked_concepts = (
                {
                    "domain_id": cm.domainId,
                    "concept_id": cm.conceptId,
                    "concept_name": cm.conceptName,
                    "concept_code": cm.conceptCode,
                    "vocabulary_id": cm.vocabularyId,
                    "source_code": cm.source_code,
                    "validity": cm.validity if cm.validity else None
                } for item in self.concept_mapping_data
                if (cm := ConceptMappingType(**item)).status == "checked"
            )
            concept_mapping_df = pd.DataFrame(checked_concepts)
            return Result(False,  concept_mapping_df, self, task_run_context)
        except Exception as e:
            return Result(True, tb.format_exc(), self, task_run_context)


class WhiteRabbitNode(Node):
    def __init__(self, name, _node):
        super().__init__(name, _node)
        self.scan_metadata = _node["scanMetadata"]
    
    def test(self, task_run_context) -> Result:
        return Result(False,  "White Rabbit Node Test Successful", self, task_run_context)

    def task(self, task_run_context) -> Result:
        try:
            scan_metadata = self.scan_metadata
            scan_metadata["node_id"] = self.id
            return Result(False,  scan_metadata, self, task_run_context)
        except Exception as e:
            return Result(True, tb.format_exc(), self, task_run_context)


class DataMappingNode(Node):
    def __init__(self, name, _node):
        super().__init__(name, _node)


        # Fail node generation if scan report data validation fails
        self.etl_mapping = DataMappingType(**_node["data"])

    def create_target_table_df(self, target_table_name: str, scan_metadata: dict) -> pd.DataFrame:
        """
        Creates and returns a pandas DataFrame for the specified target table.
        Args:
            target_table_name (str): The name of the target table.
            scan_metadata (dict): The scan metadata from the White Rabbit Node.
        Returns:
            pd.DataFrame: A DataFrame containing the data from the target table.
        Raises:
            Exception: Propagates any exceptions encountered during database connection or querying.
        """
        table_source = scan_metadata.get("dataType")

        db_con = None
        try:
            if table_source == TableSourceType.CSV:
                # Use duckdb as ibis backend for csv files
                db_con = ibis.duckdb.connect()
                target_df = self.generate_query(db_con, target_table_name, table_source, scan_metadata)

            if table_source  == TableSourceType.DB:
                database_code = scan_metadata.get("databaseCode")
                # Use db as ibis backend depending on database_code
                db_con = DBDao(database_code=database_code).ibis_connect()
                with db_con as con:
                    target_df = self.generate_query(con, target_table_name, table_source, scan_metadata)

        except Exception as e:
            raise
        finally:
            if db_con and table_source == TableSourceType.CSV:
                db_con.disconnect()

        return target_df
    
    def _load_source_table(self, con, source_table_name: str, table_source: TableSourceType, scan_metadata: dict):
        """
        Loads source table data and registers it in the connection.
        
        Args:
            con: Database connection
            source_table_name: Name of the source table
            table_source: Type of source (CSV or DB)
            scan_metadata: Metadata containing source information
            
        Returns:
            Ibis table expression for the source table
        """
        if table_source == TableSourceType.CSV:
            csv_file_name = scan_metadata.get("fileName")
            delimiter = scan_metadata.get("delimiter", ",")
            node_id = scan_metadata.get("node_id")

            source_df = load_csv_from_storage(
                node_id=node_id,
                filename=csv_file_name,
                delimiter=delimiter,
                names=None,
                encoding="utf8"
            )
            temp_table_obj = con.create_table(source_table_name, source_df)
        else:  # TableSourceType.DB
            schema_name = scan_metadata.get("schemaName")
            temp_table_obj = con.table(source_table_name, database=schema_name)
        
        # Cast integer columns to int64 for consistency
        return temp_table_obj.mutate({
            name: temp_table_obj[name].cast("int64") if dtype.is_integer() else temp_table_obj[name]
            for name, dtype in temp_table_obj.schema().items()
        })
    
    def _process_column_mappings(self, source_table_obj, source_table_name: str, 
                                 target_table_name: str, target_column_properties):
        """
        Processes column mappings between source and target tables.
        
        Args:
            source_table_obj: Ibis table expression for source data
            source_table_name: Name of the source table
            target_table_name: Name of the target table
            target_column_properties: List of target column properties
            
        Returns:
            Tuple of (selected_columns list, mapped_target_columns set)
        """
        column_mappings = self.etl_mapping.field.edges
        selected_columns = []
        mapped_target_columns = set()
        
        for column_mapping in column_mappings:
            if (column_mapping.sourceHandle.startswith(source_table_name) and 
                column_mapping.targetHandle.startswith(target_table_name)):
                
                source_column_name = column_mapping.sourceHandle.split("-")[-1]
                target_column_name = column_mapping.targetHandle.split("-")[-1]
                
                mapped_target_columns.add(target_column_name)
                
                selected_columns.append(
                    apply_ibis_func(
                        expr=source_table_obj[source_column_name],
                        table_columns=target_column_properties,
                        target_column=target_column_name
                    )
                    .cast(convert_column_type(target_column_name, target_column_properties))
                    .name(target_column_name)
                )
        
        return selected_columns, mapped_target_columns
    
    def _add_constant_columns(self, target_column_properties, mapped_target_columns: set):
        """
        Adds columns with constant values to the selection.
        
        Args:
            target_column_properties: List of target column properties
            mapped_target_columns: Set to track mapped columns
            
        Returns:
            List of constant value column expressions
        """
        constant_columns = []
        
        for col in target_column_properties:
            if col.data.constantValue:
                constant_columns.append(
                    ibis.literal(
                        convert_value(col.data.constantValue, col.data.columnType)
                    ).name(col.data.label)
                )
                mapped_target_columns.add(col.data.label)
        
        return constant_columns
    
    def _add_unmapped_columns(self, target_column_properties, mapped_target_columns: set):
        """
        Adds null-valued columns for unmapped target columns.
        
        Args:
            target_column_properties: List of target column properties
            mapped_target_columns: Set of already mapped column names
            
        Returns:
            List of null column expressions with appropriate types
        """
        target_column_names = [col.data.label for col in target_column_properties]
        unmapped_target_columns = set(target_column_names) - mapped_target_columns
        
        return [
            ibis.null()
            .cast(convert_column_type(col_name, target_column_properties))
            .name(col_name)
            for col_name in unmapped_target_columns
        ]
    

    def generate_query(self, con, target_table_name: str, table_source: TableSourceType, scan_metadata: dict) -> pd.DataFrame:
        """
        Generates and executes a query to transform source table(s) to a target table.
        
        This method processes ETL mappings to generate SQL queries that transform source data
        into the target table format. It handles column mappings, type conversions, constant values,
        and unmapped columns. For multiple source tables, it combines them using UNION ALL.
        
        Args:
            con: Database connection (ibis or duckdb connection object)
            target_table_name: Name of the target table to generate data for
            table_source: Source type (CSV or DB) from TableSourceType enum
            scan_metadata: Metadata dictionary containing source information:
                - For CSV: 'fileName', 'delimiter', 'node_id'
                - For DB: 'schemaName', 'databaseCode'
        
        Returns:
            pd.DataFrame: Transformed data matching the target table schema
        
        Raises:
            Exception: If there are issues loading source data, creating tables, or executing queries
        
        Note:
            - Loads CSV files using load_csv_from_storage for CSV sources
            - Automatically handles type casting and null values for unmapped columns
            - Applies transformation functions specified in the ETL mapping
            - Uses UNION ALL to combine multiple source tables mapped to the same target
        """
        table_mappings = self.etl_mapping.table.edges
        source_table_queries = {}
        
        # Process each source table mapped to the target table
        for mapping in table_mappings:
            if mapping.targetHandle != target_table_name:
                continue
            
            source_table_name = mapping.sourceHandle
            field_map_key = mapping.id
            target_column_properties = self.etl_mapping.fieldMap[field_map_key].targetHandles
            
            # Load source table data
            source_table_obj = self._load_source_table(
                con, source_table_name, table_source, scan_metadata
            )
            
            # Process column mappings
            selected_columns, mapped_target_columns = self._process_column_mappings(
                source_table_obj, source_table_name, target_table_name, target_column_properties
            )
            
            # Add constant value columns
            constant_columns = self._add_constant_columns(
                target_column_properties, mapped_target_columns
            )
            selected_columns.extend(constant_columns)
            
            # Add null columns for unmapped target columns
            unmapped_columns = self._add_unmapped_columns(
                target_column_properties, mapped_target_columns
            )
            selected_columns.extend(unmapped_columns)
            
            # Create query for this source table
            query = source_table_obj.select(selected_columns)
            source_table_queries[source_table_name] = query

        # Combine multiple source tables using UNION ALL if needed
        union_all_query = (
            union_all_tables(source_table_queries) 
            if len(source_table_queries) > 1 
            else list(source_table_queries.values())[0]
        )
        
        # Log the generated SQL for debugging
        union_all_sql = union_all_query.compile(pretty=True)
        print(f"SQL Query for {target_table_name}:")
        print(union_all_sql)
        
        # Execute and return the result
        return con.execute(union_all_query)

        
    def test(self, _input: dict[str, Result], task_run_context) -> Result:
        return self.task(_input, task_run_context)


    def task(self, _input: dict[str, Result], task_run_context) -> Result:
        try:
            table_mapping = self.etl_mapping.table.edges
            target_table_list = set(t.targetHandle for t in table_mapping)
            scan_metadata = next(iter(_input.values())).result

            # store output dataframes for each target table
            target_table_dfs = {}
            for target_table in target_table_list:
                target_table_dfs[target_table] = self.create_target_table_df(target_table, scan_metadata)

        except Exception as e:
            return Result(True, tb.format_exc(), self, task_run_context)
        else:
            return Result(False, target_table_dfs, self, task_run_context)

class FhirMappingNode(Node):
    """
    Queries {omop_table_name}_source_value and {omop_table_name}_id
    from the OMOP table, then upserts the FHIR→OMOP lineage into the fhir_mapping schema.
    Re-runs are idempotent via ON CONFLICT DO UPDATE.
    Schema: {database_code}_{schema_name}_fhir_mapping
    """
    def __init__(self, name, node):
        super().__init__(name, node)
        self.database_code = node["database_code"]
        self.schema_name = node["schema_name"]
        self.omop_table_name = node["omop_table_name"]
        self.fhir_resource_type = node["fhir_resource_type"]
        self.write_key_map = node.get("write_key_map", True)
        self.source_value_col = node.get("source_value_col") or f"{self.omop_table_name}_source_value"
    
    def _ensure_mapping_schema(self, database_code: str, schema_name: str, dao: DBDao) -> None:
        schema = f"{database_code}_{schema_name}_fhir_mapping"

        # dao is the trexDao
        if not dao.check_schema_exists(schema):
            dao.create_schema(schema)

        escaped_schema = schema.replace('"', '""')

        dao.execute_sql(f"""
            CREATE TABLE IF NOT EXISTS "{escaped_schema}".data_source (
                fhir_resource_type VARCHAR NOT NULL,
                fhir_resource_id   VARCHAR NOT NULL,
                omop_table_name    VARCHAR NOT NULL,
                omop_id            VARCHAR,
                flow_run_id        VARCHAR,
                transformed_at     TIMESTAMP DEFAULT NOW()
            )
        """)

        dao.execute_sql(f"""
            CREATE TABLE IF NOT EXISTS "{escaped_schema}".fhir_omop_key_map (
                fhir_id            VARCHAR NOT NULL,
                fhir_resource_type VARCHAR NOT NULL,
                omop_table_name    VARCHAR NOT NULL,
                omop_id            VARCHAR,
                transformed_at     TIMESTAMP DEFAULT NOW()
            )
        """)

        dao.execute_sql(f"""
            DROP INDEX IF EXISTS "{escaped_schema}".fhir_omop_key_map_fhir_id_fhir_resource_type_idx
        """)

        dao.execute_sql(f"""
            CREATE UNIQUE INDEX IF NOT EXISTS fhir_omop_key_map_fhir_id_type_table_omop_id_idx
            ON "{escaped_schema}".fhir_omop_key_map (fhir_id, fhir_resource_type, omop_table_name, omop_id)
        """)

    def task(self, _input: dict[str, Result], task_run_context) -> Result:
        try:
            mapping_schema = f"{self.database_code}_{self.schema_name}_fhir_mapping"
            # connect to source db to get omop_id and source_value pairs from the omop table, then connect to mapping db to upsert the lineage mapping
            omop_dao = DBDao(database_code=self.database_code)
            # mapping schema is in cache
            mapping_dao = DBDao(dialect=SupportedDatabaseDialects.TREX, database_code=self.database_code)
            self._ensure_mapping_schema(self.database_code, self.schema_name, mapping_dao)

            source_value_col = self.source_value_col
            omop_id_col = f"{self.omop_table_name}_id"
            flow_run_id = str(task_run_context.get("flow_run_id"))

            inspector = sql.inspect(omop_dao.engine)
            existing_columns = [col["name"] for col in inspector.get_columns(self.omop_table_name, schema=self.schema_name)]
            if source_value_col not in existing_columns:
                raise ValueError(
                    f"Column '{source_value_col}' does not exist in {self.schema_name}.{self.omop_table_name}. "
                    f"Available columns: {existing_columns}"
                )

            escaped_schema = self.schema_name.replace('"', '""')
            escaped_table = self.omop_table_name.replace('"', '""')
            escaped_source_value_col = source_value_col.replace('"', '""')
            escaped_omop_id_col = omop_id_col.replace('"', '""')

            omop_rows_df = pd.read_sql_query(
                sql.text(
                    f'''SELECT "{escaped_source_value_col}" AS fhir_id, "{escaped_omop_id_col}" AS omop_id
                        FROM "{escaped_schema}"."{escaped_table}"
                        WHERE "{escaped_source_value_col}" IS NOT NULL'''
                ),
                omop_dao.engine,
            )
            omop_rows = list(omop_rows_df.itertuples(index=False, name=None))

            # Reconcile rather than upsert-only: existing lineage rows for this
            # (omop_table_name, fhir_resource_type) were written against whatever
            # omop_id values the OMOP table had at that time. If the upstream
            # DbWriter truncated and re-inserted that table since, the old omop_id
            # values may no longer exist or may now belong to a different row -
            # ON CONFLICT DO NOTHING on the insert below would never catch that,
            # since a freshly-assigned omop_id doesn't collide with the stale one.
            # Clearing unconditionally (before the empty-check, so a truncate-to-
            # nothing run still clears out the now-orphaned old rows) keeps the
            # mapping in sync with current OMOP contents whether this run's write
            # was a full refresh or incremental.
            mapping_escaped_schema = mapping_schema.replace('"', '""')
            escaped_resource_type = self.fhir_resource_type.replace("'", "''")
            escaped_omop_table_name = self.omop_table_name.replace("'", "''")
            mapping_dao.execute_sql(f"""
                DELETE FROM "{mapping_escaped_schema}".data_source
                WHERE omop_table_name = '{escaped_omop_table_name}' AND fhir_resource_type = '{escaped_resource_type}'
            """)
            if self.write_key_map:
                mapping_dao.execute_sql(f"""
                    DELETE FROM "{mapping_escaped_schema}".fhir_omop_key_map
                    WHERE omop_table_name = '{escaped_omop_table_name}' AND fhir_resource_type = '{escaped_resource_type}'
                """)

            if not omop_rows:
                return Result(False, {"inserted": 0, "updated": 0}, self, task_run_context)

            data_source_values = [
                {
                    "fhir_resource_type": self.fhir_resource_type,
                    "fhir_resource_id": str(fhir_id),
                    "omop_table_name": self.omop_table_name,
                    "omop_id": str(omop_id),
                    "flow_run_id": flow_run_id,
                }
                for fhir_id, omop_id in omop_rows
            ]

            key_map_values = [
                {
                    "fhir_id": str(fhir_id),
                    "fhir_resource_type": self.fhir_resource_type,
                    "omop_table_name": self.omop_table_name,
                    "omop_id": str(omop_id),
                }
                for fhir_id, omop_id in omop_rows
            ]

            mapping_dao.batch_insert_values(
                mapping_schema,
                "data_source",
                ["fhir_resource_type", "fhir_resource_id", "omop_table_name", "omop_id", "flow_run_id"],
                [
                    (
                        row["fhir_resource_type"],
                        row["fhir_resource_id"],
                        row["omop_table_name"],
                        row["omop_id"],
                        row["flow_run_id"],
                    )
                    for row in data_source_values
                ],
            )

            if self.write_key_map:
                mapping_dao.batch_insert_values(
                    mapping_schema,
                    "fhir_omop_key_map",
                    ["fhir_id", "fhir_resource_type", "omop_table_name", "omop_id"],
                    [
                        (
                            row["fhir_id"],
                            row["fhir_resource_type"],
                            row["omop_table_name"],
                            row["omop_id"],
                        )
                        for row in key_map_values
                    ],
                    on_conflict="ON CONFLICT (fhir_id, fhir_resource_type, omop_table_name, omop_id) DO NOTHING",
                )

            return Result(False, {"inserted": len(omop_rows), "updated": len(omop_rows)}, self, task_run_context)
        except Exception as e:
            return Result(True, tb.format_exc(), self, task_run_context)


@flow(name="generate-nodes",
      flow_run_name="generate-nodes-flowrun",
      log_prints=True)
def generate_nodes_flow(graph, sorted_nodes):
    for nodename in sorted_nodes:
        node = graph["nodes"][nodename]
        nodetype = node["type"]

        # check if node is a subflow
        if nodetype == NodeType.SUBFLOW:
            subflow_obj = Flow(nodename, node)
            graph["nodes"][nodename]["nodeobj"] = subflow_obj
            for subflow_nodename in subflow_obj.sorted_nodes:
                subflow_nodegraph = subflow_obj.graph["nodes"][subflow_nodename]
                subflow_nodetype = subflow_nodegraph["type"]
                # create task run to generate node obj for each subflow node
                subflow_node_obj = generate_node_task(
                    subflow_nodename, subflow_nodegraph, subflow_nodetype)
                graph["nodes"][nodename]["graph"]["nodes"][subflow_nodename]["nodeobj"] = subflow_node_obj
        else:
            node_task_generation_wo = generate_node_task.with_options(
                on_completion=[partial(
                    node_task_generation_hook, **dict(nodename=nodename, nodetype=nodetype))],
                on_failure=[partial(node_task_generation_hook,
                                    **dict(nodename=nodename, nodetype=nodetype))]
            )

            nodeobj = node_task_generation_wo(nodename, node, nodetype)

            graph["nodes"][nodename]["nodeobj"] = nodeobj
    return graph


@task(task_run_name="generate-node-taskrun-{nodename}",
      log_prints=True
      )
def generate_node_task(nodename, node, nodetype):
    nodeobj = None
    match nodetype:
        case NodeType.CSV:
            nodeobj = CsvNode(nodename, node)
        case NodeType.FILE:
            nodeobj = GenericFileNode(nodename, node)
        case NodeType.SQL:
            nodeobj = SqlNode(nodename, node)
        case NodeType.PYTHON:
            nodeobj = PythonNode(nodename, node)
        case NodeType.PY2TABLE:
            nodeobj = Py2TableNode(nodename, node)
        case NodeType.RNODE:
            nodeobj = RNode(nodename, node)
        case NodeType.DBREADER:
            nodeobj = DBReader(nodename, node)
        case NodeType.DBWRITER:
            nodeobj = DbWriter(nodename, node)
        case NodeType.WHITERABBIT:
            nodeobj = WhiteRabbitNode(nodename, node)
        case NodeType.DATAMAPPING:
            nodeobj = DataMappingNode(nodename, node)
        case NodeType.CONCEPTMAPPING:
            nodeobj = ConceptMappingNode(nodename, node)
        case NodeType.TRANSFORMFHIRDATA:
            nodeobj = TransformFhirDataNode(nodename, node)
        case NodeType.FHIRMAPPING:
            nodeobj = FhirMappingNode(nodename, node)
        case _:
            logging.error("ERR: Unknown Node "+node["type"])
            logging.error(tb.StackSummary())
    return nodeobj
