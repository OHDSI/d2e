from functools import wraps
from typing import Any, Callable
from datetime import datetime

import sqlalchemy as sql
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql.schema import Table, Column
from sqlalchemy.schema import CreateSchema, DropSchema, DropTable

from _shared_flow_utils.dao.daobase import DaoBase
from _shared_flow_utils.types import SupportedDatabaseDialects, UserType


class SqlAlchemyDao(DaoBase):
    """
    Using SQLAlchemy for implementation
    """

    def __init__(
        self,
        database_code: str,
        user_type: UserType = UserType.ADMIN_USER,
    ):
        super().__init__(database_code, user_type)

    # --- Property methods ---

    @property
    def engine(self):
        # Todo: Switch to session
        configs = self.tenant_configs
        match configs.dialect:
            case SupportedDatabaseDialects.HANA:
                database_name = (
                    configs.databaseName
                    + f"?encrypt={configs.encrypt}?sslValidateCertificate={configs.validateCertificate}"
                )
            case _:
                database_name = configs.databaseName

        connection_string, connect_args = self.create_sqlalchemy_connection_url(
            dialect=configs.dialect,
            auth_mode=configs.authMode,
            user=configs.adminUser,
            password=configs.adminPassword,
            host=configs.host,
            port=configs.port,
            database_name=database_name,
            db_credentials=configs,
            pa_cdm_config=self.pa_cdm_config
        )
        return sql.create_engine(connection_string, connect_args=connect_args)

    @property
    def inspector(self):
        return sql.inspect(self.engine)

    # --- Create methods ---
    def create_schema(self, schema: str) -> None:
        self.validate_schema_name(schema)
        schema_exists = self.check_schema_exists(schema)
        if not schema_exists:
            with self.engine.connect() as connection:
                connection.execute(CreateSchema(schema))
                connection.commit()

    def create_table(self, schema: str, table: str, columns: dict):
        metadata_obj = sql.MetaData(schema=schema)
        with self.engine.connect() as connection:
            new_table = sql.Table(
                table,
                metadata_obj,
                *(sql.Column(name, dtype) for name, dtype in columns.items()),
            )
            metadata_obj.create_all(self.engine)
            connection.commit()

    # --- Read methods ---

    def check_schema_exists(self, schema: str) -> bool:
        if self.dialect == SupportedDatabaseDialects.HANA:
            schema = schema.upper()
        return self.inspector.has_schema(schema)

    def check_empty_schema(self, schema: str) -> bool:
        tables = self.get_table_names(schema)
        return False if tables else True

    def check_table_exists(self, schema: str, table: str) -> bool:
        return self.inspector.has_table(schema=schema, table_name=table)

    def get_schema_names(self) -> list[str]:
        return self.inspector.get_schema_names()

    def get_table_names(self, schema: str, include_views: bool = False) -> list[str]:
        tables = self.inspector.get_table_names(schema=schema)
        if include_views:
            views = self.inspector.get_view_names(schema=schema)
        else:
            views = []
        return tables + views

    def get_indexes_for_table(self, schema: str, table: str) -> list[dict]:
        # Doesn't return indexes created on primary key
        return self.inspector.get_indexes(schema=schema, table_name=table)

    def get_indexes_for_pk(self, schema: str, table: str) -> dict:
        # To get indexes created on primary key
        # returns { "constrained_columns": [str], "name": str, comment: str|None }
        return self.inspector.get_pk_constraint(schema=schema, table_name=table)

    def get_columns(self, schema: str, table: str) -> list[str]:
        all_columns = self.inspector.get_columns(schema=schema, table_name=table)
        column_names = [col.get("name") for col in all_columns]
        return column_names

    def get_table_row_count(self, schema: str, table: str) -> int:
        if self.dialect == SupportedDatabaseDialects.HANA:
            schema = schema.upper()
            table = table.upper()
        with self.engine.connect() as connection:
            metadata_obj = sql.MetaData(schema=schema)
            table = sql.Table(table, metadata_obj, autoload_with=connection)
            select_count_stmt = sql.select(sql.func.count()).select_from(table)
            row_count = connection.execute(select_count_stmt).scalar()
        return row_count

    def get_distinct_count(self, schema: str, table: str, column: str) -> int:
        if self.dialect == SupportedDatabaseDialects.HANA:
            schema = schema.upper()
            table = table.upper()
        with self.engine.connect() as connection:
            metadata_obj = sql.MetaData(schema=schema)
            table = sql.Table(table, metadata_obj, autoload_with=connection)
            distinct_count = connection.execute(
                sql.func.count(sql.func.distinct(getattr(table.c, column)))
            ).scalar()
        return distinct_count

    def get_last_executed_changeset(self, schema: str) -> str:
        with self.engine.connect() as connection:
            metadata_obj = sql.MetaData(schema=schema)
            table = sql.Table(
                "databasechangelog".casefold(), metadata_obj, autoload_with=connection
            )
            filename_col = getattr(table.c, "filename".casefold())
            dateexecuted_col = getattr(table.c, "dateexecuted".casefold())
            select_stmt = (
                sql.select(filename_col).order_by(sql.desc(dateexecuted_col)).limit(1)
            )
            latest_changeset = connection.execute(select_stmt).scalar()
            return latest_changeset

    def get_datamodel_created_date(self, schema: str) -> datetime:
        with self.engine.connect() as connection:
            metadata_obj = sql.MetaData(schema=schema)
            table = sql.Table(
                "databasechangelog".casefold(), metadata_obj, autoload_with=connection
            )
            dateexecuted_col = getattr(table.c, "dateexecuted".casefold())
            select_stmt = (
                sql.select(dateexecuted_col)
                .order_by(sql.asc(dateexecuted_col))
                .limit(1)
            )
            created_date = connection.execute(select_stmt).scalar()
            return created_date

    def get_datamodel_updated_date(self, schema: str) -> datetime:
        with self.engine.connect() as connection:
            metadata_obj = sql.MetaData(schema=schema)
            table = sql.Table(
                "databasechangelog".casefold(), metadata_obj, autoload_with=connection
            )
            dateexecuted_col = getattr(table.c, "dateexecuted".casefold())
            select_stmt = (
                sql.select(dateexecuted_col)
                .order_by(sql.desc(dateexecuted_col))
                .limit(1)
            )
            updated_date = connection.execute(select_stmt).scalar()
            return updated_date

    def get_value(self, schema: str, table: str, column: str) -> str:
        if self.dialect == SupportedDatabaseDialects.HANA:
            schema = schema.upper()
            table = table.upper()
            # column = column.upper()
        with self.engine.connect() as connection:
            metadata_obj = sql.MetaData(schema=schema)
            table_obj = sql.Table(table, metadata_obj, autoload_with=connection)
            stmt = sql.select(table_obj.c[column]).select_from(table_obj)
            value = connection.execute(stmt).scalar()
            return value

    def get_next_record_id(self, schema: str, table: str, id_column: int) -> int:
        metadata_obj = sql.MetaData(schema=schema)
        table_obj = sql.Table(table, metadata_obj, autoload_with=self.engine)
        id_column_obj = getattr(table_obj.c, id_column.casefold())
        last_record_id_stmt = sql.select(sql.func.max(id_column_obj))
        last_record_id = self.execute_sqlalchemy_statement(
            last_record_id_stmt, self.get_single_value
        )
        if last_record_id is None:
            return 1
        else:
            return int(last_record_id) + 1

    def select_rows_where_in(
        self, schema: str, table: str, columns: list[str], where_column: str, where_values: list
    ) -> list[dict]:
        """
        Select `columns` from `table` where `where_column` is in `where_values`.
        Returns one dict per row, keyed by the requested column names.
        """
        with self.engine.connect() as connection:
            metadata_obj = sql.MetaData(schema=schema)
            table_obj = sql.Table(table, metadata_obj, autoload_with=connection)
            select_cols = [table_obj.c[col] for col in columns]
            stmt = sql.select(*select_cols).where(table_obj.c[where_column].in_(where_values))
            result = connection.execute(stmt).mappings().all()
        return [dict(row) for row in result]

    # --- Update methods ---

    def update_cdm_version(self, schema: str, cdm_version: str):
        with self.engine.connect() as connection:
            metadata_obj = sql.MetaData(schema=schema)
            table = sql.Table(
                "cdm_source".casefold(), metadata_obj, autoload_with=connection
            )
            cdm_source_col = getattr(table.c, "cdm_source_name".casefold())
            update_stmt = (
                sql.update(table)
                .where(cdm_source_col == schema)
                .values(cdm_version=cdm_version)
            )
            res = connection.execute(update_stmt)
            connection.commit()

    def insert_values_into_table(
        self, schema: str, table: str, column_value_mapping: list[dict]
    ):
        with self.engine.connect() as connection:
            metadata_obj = sql.MetaData(schema=schema)
            table_obj = sql.Table(table, metadata_obj, autoload_with=connection)
            res = connection.execute(table_obj.insert(), column_value_mapping)
            connection.commit()

    def delete_and_insert_rows(
        self,
        schema: str,
        table: str,
        delete_column: str,
        delete_value,
        insert_rows: list[dict],
        id_column: str = None,
    ) -> list[dict]:
        """
        Atomically (single transaction): delete every row where delete_column ==
        delete_value, then insert insert_rows. If id_column is given, each inserted
        row is assigned a sequential id continuing from the table's current max
        (computed after the delete, in the same transaction) - the returned rows
        carry that assigned id_column value. Use this instead of a separate
        delete_records()/insert_values_into_table() pair when the delete and
        insert must not be observable as two separate commits (e.g. an
        overwrite-on-rerun that must never leave the table with the old rows
        deleted and nothing inserted in their place).
        """
        with self.engine.begin() as connection:
            metadata_obj = sql.MetaData(schema=schema)
            table_obj = sql.Table(table, metadata_obj, autoload_with=connection)

            connection.execute(
                table_obj.delete().where(table_obj.c[delete_column] == delete_value)
            )

            if id_column:
                last_id = connection.execute(
                    sql.select(sql.func.max(table_obj.c[id_column]))
                ).scalar()
                next_id = (int(last_id) + 1) if last_id is not None else 1
                insert_rows = [
                    {**row, id_column: next_id + i} for i, row in enumerate(insert_rows)
                ]

            if insert_rows:
                connection.execute(table_obj.insert(), insert_rows)

        return insert_rows

    def update_data_ingestion_date(self, schema: str):
        with self.engine.connect() as connection:
            metadata_obj = sql.MetaData(schema=schema)
            table_obj = sql.Table(
                "dataset_metadata".casefold(), metadata_obj, autoload_with=connection
            )
            condition_col = getattr(table_obj.c, "schema_name".casefold())
            update_stmt = (
                sql.update(table_obj)
                .where(condition_col == schema)
                .values(data_ingestion_date=datetime.now())
            )
            print(f"Updating data ingestion date for schema {schema}")
            res = connection.execute(update_stmt)
            connection.commit()
            print(f"Updated data ingestion date for {schema}")

    # --- Delete methods ---

    

    def drop_table(self, schema: str, table: str, cascade: bool = False):
        with self.engine.connect() as connection:
            metadata_obj = sql.MetaData(schema=schema)
            table_obj = sql.Table(table, metadata_obj, autoload_with=connection)

            # BigQuery has no DROP TABLE ... CASCADE — appending it turns every
            # drop into a syntax error (first hit: repeat DC runs on a webapi
            # BigQuery dataset). BQ tables have no dependent objects CASCADE
            # would cover, so dropping plain is equivalent there.
            supports_cascade = connection.dialect.name != "bigquery"

            @compiles(DropTable, connection.dialect.name)
            def _compile_drop_table(element, compiler, **kwargs):
                sql_str = compiler.visit_drop_table(element)
                if cascade and supports_cascade:
                    sql_str += " CASCADE"
                return sql_str

            table_obj.drop(connection)
            connection.commit()

    def drop_schema(self, schema: str, cascade: bool = False):
        with self.engine.connect() as connection:
            connection.execute(DropSchema(schema, cascade=cascade))
            connection.commit()

    def delete_records(self, schema: str, table: str, conditions: list):
        metadata_obj = sql.MetaData(schema=schema)
        table_obj = sql.Table(table, metadata_obj, autoload_with=self.engine)
        delete_from_conditions = sql.and_(*conditions)
        delete_from_statement = table_obj.delete().where(delete_from_conditions)
        result = self.execute_sqlalchemy_statement(
            delete_from_statement, SqlAlchemyDao.return_affected_rowcounts
        )
        return result

    def truncate_table(self, schema: str, table: str):
        with self.engine.connect() as connection:
            trans = connection.begin()
            try:
                truncate_sql = sql.text(f"delete from {schema}.{table}")
                connection.execute(truncate_sql)
                trans.commit()
            except Exception as e:
                trans.rollback()
                print(f"Failed to truncate table '{schema}.{table}': {e}")
                raise e
            else:
                print(f"Table '{schema}.{table}' truncated successfully!")
                self.engine.dispose()

    # --- Static methods ---

    @staticmethod
    def return_affected_rowcounts(result) -> int:
        return result.rowcount

    @staticmethod
    def get_single_value(result):
        return result.scalar()

    def dispose_engine_after_use(func):
        """
        To dispose of engine
        """

        @wraps(func)
        def wrapper(*args, **kwargs):
            # Extract the engine from the class instance
            self = args[0]
            engine = getattr(self, "engine", None)
            if engine is None:
                raise AttributeError(
                    "Class instance does not have an 'engine' attached."
                )

            try:
                # Execute the decorated method
                result = func(*args, **kwargs)
            finally:
                engine.dispose()
                print(f"engine disposed")
            return result

        return wrapper

    def get_sqlalchemy_columns(
        self, schema: str, table: str, column_names: list[str]
    ) -> dict[str, Column]:
        """
        Returns a dictionary mapping column names to sqlalchemy Column objects
        """
        with self.engine.connect() as connection:
            metadata_obj = sql.MetaData(schema=schema)
            table_obj = Table(table, metadata_obj, autoload_with=connection)
            return {
                column_name: getattr(table_obj.c, column_name.casefold())
                for column_name in column_names
            }

    def execute_sqlalchemy_statement(
        self, sqlalchemy_statement, callback: Callable
    ) -> Any | None:
        """
        Executed on default schema if no schema name specified
        """
        with self.engine.connect() as connection:
            res = connection.execute(sqlalchemy_statement)
            connection.commit()
            return callback(res)

    def check_user_exists(self, user: str) -> bool:
        with self.engine.connect() as connection:
            if self.dialect == SupportedDatabaseDialects.POSTGRES:
                select_stmt = sql.text("select * from pg_user where usename = :x")
                print(f"Executing check user exists statement..")
                res = connection.execute(select_stmt, {"x": user}).fetchall()
            elif SupportedDatabaseDialects.HANA:
                schema_name = "SYS"
                metadata_obj = sql.MetaData(schema=schema_name)
                table = Table(
                    "USERS".casefold(), metadata_obj, autoload_with=connection
                )
                user_col = getattr(table.c, "USER_NAME".casefold())
                select_stmt = sql.select(table).where(user_col == user)
                print(f"Executing check user exists statement..")
                res = connection.execute(select_stmt).fetchall()
            if res == []:
                return False
            else:
                return True

    def check_role_exists(self, role_name: str) -> bool:
        with self.engine.connect() as connection:
            if self.dialect == SupportedDatabaseDialects.POSTGRES:
                select_stmt = sql.text("select * from pg_roles where rolname = :x")
                print(f"Executing check role exists statement..")
                res = connection.execute(select_stmt, {"x": role_name}).fetchall()
            elif SupportedDatabaseDialects.HANA:
                schema_name = "SYS"
                metadata_obj = sql.MetaData(schema=schema_name)
                table = Table(
                    "ROLES".casefold(), metadata_obj, autoload_with=connection
                )
                role_col = getattr(table.c, "ROLE_NAME".casefold())
                select_stmt = sql.select(table).where(role_col == role_name)
                print(f"Executing check role exists statement..")
                res = connection.execute(select_stmt).fetchall()
            if res == []:
                return False
            else:
                return True

    def create_read_role(self, role_name: str):
        match self.dialect:
            case SupportedDatabaseDialects.POSTGRES:
                create_role_stmt = sql.text(f"CREATE ROLE {role_name}")
            case SupportedDatabaseDialects.HANA:
                create_role_stmt = sql.text(
                    f"CREATE ROLE {role_name} NO GRANT TO CREATOR"
                )
        with self.engine.connect() as connection:
            print("Executing create read role statement..")
            create_role_res = connection.execute(create_role_stmt)
            connection.commit()
            print(f"{role_name} role Created Successfully")

    def create_user(self, user: str, password: str = None):
        if user == self.read_user:
            password = self.tenant_configs.get("readPassword")
        else:
            raise ValueError("Password cannot be empty")

        match self.dialect:
            case SupportedDatabaseDialects.POSTGRES:
                create_user_stmt = sql.text(
                    f'CREATE USER {user} WITH PASSWORD "{password}"'
                )
            case SupportedDatabaseDialects.HANA:
                create_user_stmt = sql.text(
                    f'CREATE USER {user} PASSWORD "{password}" NO FORCE_FIRST_PASSWORD_CHANGE'
                )
        with self.engine.connect() as connection:
            print("Executing create user statement..")
            create_user_res = connection.execute(create_user_stmt)
            connection.commit()
            print(f"{user} User Created Successfully")

    def create_and_assign_role(self, user: str, role_name: str):
        with self.engine.connect() as connection:
            create_role_stmt = sql.text(f"CREATE ROLE {role_name}")
            print("Executing create role statement..")
            create_role_res = connection.execute(create_role_stmt)
            print(f"{role_name} role Created Successfully")

            grant_role_stmt = sql.text(f"GRANT {role_name} TO {user}")
            print("Executing grant role to user statement..")
            grant_role_res = connection.execute(
                grant_role_stmt, {"x": role_name, "y": user}
            )
            connection.commit()
            print(f" {role_name} Role Granted to {user} User Successfully")

    def grant_read_privileges(self, schema: str, role_name: str):
        match self.dialect:
            case SupportedDatabaseDialects.POSTGRES:
                grant_read_stmt = sql.text(f"""
                    GRANT USAGE ON SCHEMA {schema} TO {role_name};
                    GRANT SELECT ON ALL TABLES IN SCHEMA {schema} TO {role_name};
                    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA {schema} TO {role_name};
                    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA {schema} TO {role_name};
                    GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA {schema} TO {role_name};
                    ALTER DEFAULT PRIVILEGES IN SCHEMA {schema} GRANT SELECT ON TABLES TO {role_name};
                    ALTER DEFAULT PRIVILEGES IN SCHEMA {schema} GRANT USAGE, SELECT ON SEQUENCES TO {role_name};
                    ALTER DEFAULT PRIVILEGES IN SCHEMA {schema} GRANT EXECUTE ON FUNCTIONS TO {role_name};""")
            case SupportedDatabaseDialects.HANA:
                grant_read_stmt = sql.text(
                    f"GRANT SELECT, EXECUTE, CREATE TEMPORARY TABLE ON SCHEMA {schema} to {role_name}"
                )
        with self.engine.connect() as connection:
            print("Executing grant read privilege statement..")
            grant_read_res = connection.execute(grant_read_stmt)
            connection.commit()
            print(f"Granted Read privileges Successfully")

    def grant_cohort_write_privileges(self, schema: str, role_name: str):
        with self.engine.connect() as connection:
            grant_cohort_write_stmt = sql.text(
                f"GRANT DELETE, INSERT, UPDATE ON {schema}.cohort TO {role_name}"
            )
            grant_cohort_def_write_stmt = sql.text(
                f"GRANT DELETE, INSERT, UPDATE ON {schema}.cohort_definition TO {role_name}"
            )
            print("Executing grant cohort write privilege statement..")
            try:
                grant_cohort_write_res = connection.execute(grant_cohort_write_stmt)
                grant_cohort_def_write_res = connection.execute(
                    grant_cohort_def_write_stmt
                )
                connection.commit()
            except Exception as e:
                raise e
            else:
                print(
                    f"Granted cohort and cohort definition Write privileges Successfully"
                )


    def enable_auditing(self):
        with self.engine.connect() as connection:
            stmt = sql.text(
                f"ALTER SYSTEM ALTER CONFIGURATION ('global.ini','SYSTEM') set ('auditing configuration','global_auditing_state' ) = 'true' with reconfigure"
            )
            print("Executing enable audit statement..")
            res = connection.execute(stmt)
            connection.commit()
            print(f"Altered system configuration successfully")

    def create_system_audit_policy(self):
        with self.engine.connect() as connection:
            check_audit_policy = sql.text(
                f"SELECT * from SYS.AUDIT_POLICIES WHERE AUDIT_POLICY_NAME = 'alp_conf_changes'"
            )
            print("Executing check system audit policy statement..")
            check_audit_policy_res = connection.execute(check_audit_policy).fetchall()
            if check_audit_policy_res == []:
                create_audit_policy = sql.text(
                    f"""CREATE AUDIT POLICY "alp_conf_changes" AUDITING SUCCESSFUL SYSTEM CONFIGURATION CHANGE LEVEL INFO"""
                )
                print("Executing create system audit policy statement..")
                create_audit_policy_res = connection.execute(create_audit_policy)
                print("Executing alter system audit policy statement..")
                alter_audit_policy = sql.text(
                    f"""ALTER AUDIT POLICY "alp_conf_changes" ENABLE"""
                )
                alter_audit_policy.res = connection.execute(alter_audit_policy)
                connection.commit()
                print(
                    "New audit policy for system configuration created & enabled successfully!"
                )
            else:
                print("Audit policy for system configuration already exists!")

    def create_schema_audit_policy(self, schema: str):
        with self.engine.connect() as connection:
            schema_audit_policy = f"ALP_AUDIT_POLICY_{schema}"
            check_schema_audit_policy = sql.text(
                f"SELECT * from SYS.AUDIT_POLICIES WHERE AUDIT_POLICY_NAME = '{schema_audit_policy}'"
            )
            print("Executing check system audit policy statement..")
            check_schema_audit_policy_res = connection.execute(
                check_schema_audit_policy
            ).fetchall()
            if check_schema_audit_policy_res == []:
                create_audit_policy = sql.text(f"""
                    CREATE AUDIT POLICY {schema_audit_policy}
                    AUDITING ALL INSERT, SELECT, UPDATE, DELETE ON
                    {schema}.* LEVEL INFO
                    """)
                print("Executing create schema audit policy statement..")
                create_audit_policy_res = connection.execute(create_audit_policy)
                alter_audit_policy = sql.text(
                    f"""ALTER AUDIT POLICY ALP_AUDIT_POLICY_{schema} ENABLE"""
                )
                print("Executing alter schema audit policy statement..")
                alter_audit_policy_res = connection.execute(alter_audit_policy)
                connection.commit()
                print(
                    f"New audit policy for {schema} '{schema_audit_policy}' created & enabled successfully!"
                )
            else:
                print(
                    f"Audit policy for schema '{schema_audit_policy}' already exists!"
                )
