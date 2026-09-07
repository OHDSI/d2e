import os, glob

from prefect import task
from prefect.logging import get_run_logger
from prefect.cache_policies import NONE

from .const import *
from .utils import *


def initialize_id_sequence(conn):
    conn.execute('CREATE SEQUENCE IF NOT EXISTS main.id_sequence;')

def create_table(conn, sql_file, schema_name=None):
    with open(sql_file, 'r') as file:
        sql_qry = file.read()
        if "@schema_name" in sql_qry:
            sql_qry = sql_qry.replace('@schema_name', schema_name)
        conn.execute(sql_qry)

def make_table_name(file_path):
    basename = os.path.basename(file_path)
    table_name = basename.split('.')[0]
    pathname = os.path.dirname(file_path)
    dirname = os.path.basename(pathname)
    return f"mimiciv_{dirname}.{table_name}", dirname

@task(log_prints=True, cache_policy=NONE)
def load_mimic_data(conn, mimic_dir):
    logger = get_run_logger()
    initialize_id_sequence(conn)
    create_table(conn, MIMICCreateSql)
    csv_files = glob.glob(os.path.join(mimic_dir, "**/*.csv*"), recursive=True)
    for file_path in csv_files:
        table_name, dir_name = make_table_name(file_path)
        if not dir_name in ['hosp','icu']:
            continue
        try:
            sql_qry = f"""COPY {table_name} FROM '{file_path}' (ESCAPE '\"', HEADER);"""
            conn.execute(sql_qry)
            logger.info(f"Loading {table_name} done")
        except Exception as e:
            logger.error(f"Error loading {file_path}: {str(e)}")
            raise Exception()

@task(log_prints=True, cache_policy=NONE)
def load_vocab(conn, vocab_dir):
    logger = get_run_logger()
    create_schema(conn, 'mimic_staging')
    create_table(conn, CreatVocabTable)
    # insert vocab tables
    csv_files = glob.glob(os.path.join(vocab_dir, "**/*.csv*"), recursive=True)
    for file in csv_files:
        if 'CONCEPT_CPT4' in file:
            continue
        csv_name = os.path.basename(file).split('.')[0].lower()
        table_name = '_'.join(['mimic_staging.tmp', csv_name])
        try:
            query = f"""
            TRUNCATE TABLE {table_name};
            COPY {table_name} FROM '{file}' (DATEFORMAT '%Y%m%d', DELIMITER '\t', FORMAT CSV, HEADER, QUOTE '"',ESCAPE '\"');
            """
            conn.execute(query)
            logger.info(f"Loading {table_name.replace("mimic_staging.tmp_", "")} done")
        except Exception as e:
            logger.error(f"Error loading {file}: {str(e)}")
            raise Exception()
    # generate_custom_vocab
    try: 
        execute_raw_sql_from_file(conn, CustomVocabDir, CustomVocabSqls, CustomVocabLogs)
    except Exception as e:
        logger.error(f"Error generating custom vocabulories: {str(e)}")
        raise Exception()
