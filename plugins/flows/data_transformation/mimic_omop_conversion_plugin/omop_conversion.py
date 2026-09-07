from prefect import task
from prefect.logging import get_run_logger
from prefect.cache_policies import NONE

from sqlalchemy import text
import duckdb
import numpy as np

from .const import *
from .utils import *
from .load_data import *
from _shared_flow_utils.types import SupportedDatabaseDialects


@task(log_prints=True, cache_policy=NONE)
def staging_mimic_data(conn):
    create_schema(conn, 'mimic_etl')
    execute_raw_sql_from_file(conn, StagDir, StagSql, StagLogs)


@task(log_prints=True, cache_policy=NONE)
def ETL_transformation(conn):
    logger = get_run_logger()
    try:
        execute_raw_sql_from_file(conn, ETLDir, ETLSqls, ETLLogs)
    except Exception as e:
        logger.error(f"Error tranforming mimic: {str(e)}")
        raise Exception()


@task(log_prints=True, cache_policy=NONE)
def final_cdm_tables(conn):
    logger = get_run_logger()
    try:
        create_schema(conn, 'cdm')
        execute_raw_sql_from_file(conn, CdmDir, CdmSqls, CdmLogs)
    except Exception as e:
        logger.error(f"Error creating final cdm data: {str(e)}")
        raise Exception()


@task(log_prints=True, cache_policy=NONE) 
def export_data(duckdb_file_name, schema_name, to_dbdao, overwrite_schema, chunk_size):
    logger = get_run_logger()
    db_credentials = to_dbdao.tenant_configs
    dialect = to_dbdao.dialect
    if to_dbdao.check_schema_exists(schema_name):
        if overwrite_schema:
            to_dbdao.drop_schema(schema_name, cascade=True)
        else:
            logger.error(f"Schema '{schema_name}'exist! To overwrite the existing schema, set 'Overwrite Schema' to True")
            raise ValueError()
    to_dbdao.create_schema(schema_name)
    match dialect:
        case SupportedDatabaseDialects.POSTGRES:
            attach_qry = f"""ATTACH 'host={db_credentials.host} port={db_credentials.port} dbname={db_credentials.databaseName} 
            user={db_credentials.adminUser} password={db_credentials.adminPassword.get_secret_value()}' 
            AS pg (TYPE POSTGRES, SCHEMA {schema_name});
            """
            # Attach Posgres Database
            with duckdb.connect(duckdb_file_name) as conn:
                conn.execute(attach_qry)
                # Creat schema and tables in postgres database
                create_table(conn, PostgresDDL, schema_name=schema_name)
                tables = conn.execute(f"SELECT table_name FROM duckdb_tables() WHERE (database_name = 'pg')").fetchall()
                tables = [x[0] for x in tables]
                for table in tables:
                    logger.info(f"Inserting into {schema_name}.{table}")
                    conn.execute(f"""
                    INSERT INTO pg.{schema_name}.{table}
                    SELECT * FROM cdm.{table};    
                    """)
                conn.execute("DETACH pg;")

        case SupportedDatabaseDialects.HANA:
            create_sqls = open(HANADDL).read().replace('@schema_name', schema_name).split(';')[:-1]
            for create_sql in create_sqls:
                with to_dbdao.engine.connect() as hana_conn:
                    hana_conn.execute(text(create_sql))
                    hana_conn.commit()
            tables = to_dbdao.get_table_names(schema=schema_name)
            for table in tables:
                logger.info(f"Inserting into {schema_name}.{table}")
                tmp = 0
                for chunk, percent in read_table_chunks(duckdb_file_name, table, chunk_size=chunk_size):   
                    if percent != tmp: 
                        flag = True
                        tmp = percent  
                    else:
                        flag = False           
                    if not chunk.empty:
                        insert_to_hana_direct(to_dbdao, chunk, schema_name, table)
                    if flag: 
                        logger.info(f"{int(percent)}% of table '{table}' is inserted")
                logger.info(f"100% of table '{table}' is inserted")


def read_table_chunks(duckdb_file_name, table, chunk_size):
    with duckdb.connect(duckdb_file_name) as conn:
        count = conn.execute(f"SELECT COUNT(*) FROM cdm.{table}").fetchone()[0]
        for offset in range(0, count, chunk_size):
            chunk = conn.execute(f"""
                SELECT * FROM cdm.{table}
                LIMIT {chunk_size} OFFSET {offset}
            """).df()
            percent = (offset/count * 100)//10 * 10
            yield chunk, percent


def insert_to_hana_direct(to_dbdao, chunk, schema_name, table):
    with to_dbdao.engine.connect() as hana_conn:
        # Use Upper case for HANA
        chunk.columns = chunk.columns.str.upper()
        # Replace np.nan with None
        chunk.replace([np.nan], [None], inplace=True)
        columns = chunk.columns.tolist()
        columns_str = ', '.join(f'"{col}"' for col in columns)
        placeholders = ','.join(f':{col}' for col in columns)
        insert_stmt = f'INSERT INTO {schema_name}.{table} ({columns_str}) VALUES ({placeholders})'
        data = chunk.to_dict('records')
        hana_conn.execute(text(insert_stmt), data)
        hana_conn.commit()
    to_dbdao.engine.dispose()