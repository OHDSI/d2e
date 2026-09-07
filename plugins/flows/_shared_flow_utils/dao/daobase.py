import os
import re
import json
from typing import Optional, Tuple
from datetime import datetime
from abc import ABC, abstractmethod
from pydantic import BaseModel
from sqlalchemy import text

from prefect.variables import Variable
from prefect.blocks.system import Secret
from _shared_flow_utils.types import UserType
from _shared_flow_utils.api.PrefectAPI import build_user_from_token, GetAuthTokens

from _shared_flow_utils.api.OpenIdAPI import OpenIdAPI
from _shared_flow_utils.types import (
    SupportedDatabaseDialects,
    UserType,
    DBCredentialsType,
    CacheDBCredentialsType,
    AuthMode,
)

# List of system schemas by database
SYSTEM_SCHEMAS = {"postgres": ["information_schema", "pg_catalog", "public"]}


def build_bigquery_r_connection_string(
    project: str, client_email: str, key_path: str, path_to_driver: str
) -> str:
    """Build R DatabaseConnector connection string for BigQuery."""
    conn_url = (
        "jdbc:bigquery://https://www.googleapis.com/bigquery/v2:443;"
        f"ProjectId={project};OAuthType=0;"
        f"OAuthServiceAcctEmail={client_email};"
        f"OAuthPvtKeyPath={key_path};"
        "EnableSession=1"
    )
    return (
        "connectionDetails <- DatabaseConnector::createConnectionDetails("
        f"dbms = 'bigquery', connectionString = '{conn_url}', "
        f"user = '', password = '', pathToDriver = '{path_to_driver}')"
    )


class DialectDrivers(BaseModel):
    class jdbc:
        postgres: str = "jdbc:postgresql"
        hana: str = "jdbc:sap"
        duckdb: str = "jdbc:duckdb"
        bigquery: str = "jdbc:bigquery"
        trex: str = "jdbc:postgresql"

    class sqlalchemy:
        postgres: str = "postgresql+psycopg2"
        hana: str = "hana+hdbcli"
        duckdb: str = "duckdb"
        bigquery: str = "bigquery"
        snowflake: str = "snowflake"
        trex: str = "postgresql+psycopg2"

    class ibis:
        postgres: str = "postgres"
        duckdb: str = "duckdb"
        bigquery: str = "bigquery"
        trex: str = "postgres"

    class database_connector:
        postgres: str = "postgresql"
        hana: str = "hana"
        bigquery: str = "bigquery"
        trex: str = "postgresql"

    class cachedb:
        postgres: str = "postgresql"
        hana: str = "hana"
        duckdb: str = "duckdb"


class DaoBase(ABC):
    path_to_driver = "/app/inst/drivers"
    database_code: str
    user_type: Optional[UserType] = UserType.ADMIN_USER

    def __init__(
        self,
        database_code: str,
        user_type: UserType = UserType.ADMIN_USER,
        cache_id: Optional[str] = None,
    ):
        secret_block = Secret.load("database-credentials").get()
        if secret_block is None:
            raise ValueError("'DATABASE_CREDENTIALS' secret block is undefined!")
        self.database_code = database_code
        self.user_type = user_type
        # cache_id defaults to database_code so callers that don't supply
        # one still get a usable pgwire dbname.
        self.cache_id = cache_id or self.database_code

    # --- Property methods ---
    @property
    def dialect(self):
        return self.tenant_configs.dialect

    @property
    def read_user(self):
        return self.tenant_configs.readUser

    @property
    def read_role(self):
        return self.tenant_configs.readRole

    @property
    def tenant_configs(self) -> DBCredentialsType | CacheDBCredentialsType:
        return self.__extract_database_credentials()

    @property
    def pa_cdm_config(self) -> dict:
        """
        The dataset's PA/CDM config id/version
        """
        if getattr(self, "_pa_cdm_config", None) is None:
            result = {}
            if (
                self.dialect == SupportedDatabaseDialects.HANA
                and self.cache_id != self.database_code
            ):
                try:
                    from _shared_flow_utils.api.PortalServerAPI import PortalServerAPI
                    result = PortalServerAPI().pa_cdm_config_session_vars(self.cache_id)
                except Exception as e:
                    from _shared_flow_utils.logger.logger import Logger
                    Logger().warning(
                        f"Could not resolve PA/CDM config session variables for "
                        f"dataset '{self.cache_id}'; proceeding without them: {e}"
                    )
                    result = {}
            self._pa_cdm_config = result
        return self._pa_cdm_config

    # --- Create methods ---

    @abstractmethod
    def create_schema(self, schema: str):
        pass

    @abstractmethod
    def create_table(self, schema: str, table: str, columns: dict):
        pass

    # --- Read methods ---

    @abstractmethod
    def check_schema_exists(self, schema: str) -> bool:
        pass

    @abstractmethod
    def check_empty_schema(self, schema: str) -> bool:
        pass

    @abstractmethod
    def check_table_exists(self, schema: str, table: str) -> bool:
        pass

    @abstractmethod
    def get_table_names(self, schema: str, include_views=False) -> list[str]:
        pass

    @abstractmethod
    def get_columns(self, schema: str, table: str) -> list[str]:
        pass

    @abstractmethod
    def get_table_row_count(self, schema: str, table: str) -> int:
        pass

    @abstractmethod
    def get_distinct_count(self, schema: str, table: str, column: str) -> int:
        pass

    @abstractmethod
    def get_value(self, schema: str, table: str, column: str) -> str:
        pass

    @abstractmethod
    def get_next_record_id(self, schema: str, table: str, id_column: int) -> int:
        pass

    @abstractmethod
    def get_last_executed_changeset(self, schema: str) -> str:
        pass

    @abstractmethod
    def get_datamodel_created_date(self, schema: str) -> datetime:
        pass

    @abstractmethod
    def get_datamodel_updated_date(self, schema: str) -> datetime:
        pass

    # --- Update methods ---

    @abstractmethod
    def update_cdm_version(self, schema: str, cdm_version: str):
        pass

    @abstractmethod
    def insert_values_into_table(
        self, schema: str, table: str, column_value_mapping: list[dict]
    ):
        pass

    # --- Delete methods ---

    @abstractmethod
    def drop_schema(self, schema: str, cascade: bool = False):
        pass

    @abstractmethod
    def truncate_table(self, schema: str, table: str):
        # Ibis already uses truncate_table
        pass

    # --- User methods ---

    #@abstractmethod
    def check_user_exists(self, user: str) -> bool:
        pass

    # @abstractmethod
    def check_role_exists(self, role_name: str) -> bool:
        pass

    # @abstractmethod
    def create_read_role(self, role_name: str):
        pass

    # @abstractmethod
    def create_user(self, user: str, password: str = None):
        pass

    # @abstractmethod
    def create_and_assign_role(self, user: str, role_name: str):
        pass

    # @abstractmethod
    def grant_read_privileges(self, schema: str, role_name: str):
        pass

    # @abstractmethod
    def grant_cohort_write_privileges(self, schema: str, role_name: str):
        pass

    # --- Static methods ---
    @staticmethod
    def validate_schema_name(schema_name: str) -> None:
        if len(schema_name.encode("utf-8")) > 63:
            raise ValueError(f"Schema name '{schema_name}' should not exceed 63 bytes!")

    @staticmethod
    def create_ibis_connection_url(
        dialect: SupportedDatabaseDialects,
        database_name: str = None,
        user: str = None,
        password: str = None,
        host: str = None,
        port: int = None,
    ) -> str:
        match dialect:
            case SupportedDatabaseDialects.DUCKDB:
                # "duckdb://" will connect to in-memory ephemeral database
                base_url = f"{getattr(DialectDrivers.ibis, dialect)}://{database_name}"
            case SupportedDatabaseDialects.HANA:
                raise ValueError(
                    f"'{SupportedDatabaseDialects.HANA}' database dialect not supported!"
                )
            case _:
                base_url = f"{getattr(DialectDrivers.ibis, dialect)}://{user}:{password}@{host}:{port}/{database_name}"
        return base_url

    @staticmethod
    def create_sqlalchemy_connection_url(
        dialect: SupportedDatabaseDialects,
        database_name: str = None,
        auth_mode: AuthMode = AuthMode.PASSWORD,
        user: str = None,
        password: str = None,
        host: str = None,
        port: int = None,
        db_credentials: DBCredentialsType = None,
        pa_cdm_config: dict = None,
    ) -> Tuple[str, dict]:
        connect_args = {}
        match dialect:
            case SupportedDatabaseDialects.DUCKDB:
                base_url = (
                    f"{getattr(DialectDrivers.sqlalchemy, dialect)}://{database_name}"
                )
                connect_args = {"user": user, "password": password.get_secret_value()}
            case SupportedDatabaseDialects.BIGQUERY:
                big_query_key_path = Secret.load("google-service-account-json").get()
                 # Check if file exists
                if not os.path.isfile(big_query_key_path):
                    DaoBase.create_service_account_credentials_file(db_credentials)
                base_url = f"{getattr(DialectDrivers.sqlalchemy, dialect)}://{host}/{database_name}?credentials_path={big_query_key_path}"
            case SupportedDatabaseDialects.SNOWFLAKE:
                from cryptography.hazmat.primitives import serialization
                account = host
                user_str = user.get_secret_value() if hasattr(user, "get_secret_value") else user
                sf_schema = getattr(db_credentials, "snowflakeSchema", None)
                warehouse = getattr(db_credentials, "warehouse", None)
                role = getattr(db_credentials, "role", None)
                base_url = f"{getattr(DialectDrivers.sqlalchemy, dialect)}://{user_str}@{account}/{database_name}"
                if sf_schema:
                    base_url += f"/{sf_schema}"
                params = []
                if warehouse:
                    params.append(f"warehouse={warehouse}")
                if role:
                    params.append(f"role={role}")
                if params:
                    base_url += "?" + "&".join(params)
                if not db_credentials.privateKey:
                    raise ValueError("Snowflake key-pair auth requires db_credentials.privateKey")
                pem = db_credentials.privateKey.get_secret_value().encode()
                passphrase = (
                    db_credentials.privateKeyPassphrase.get_secret_value().encode()
                    if db_credentials.privateKeyPassphrase else None
                )
                pkey = serialization.load_pem_private_key(pem, password=passphrase)
                connect_args = {
                    "private_key": pkey.private_bytes(
                        encoding=serialization.Encoding.DER,
                        format=serialization.PrivateFormat.PKCS8,
                        encryption_algorithm=serialization.NoEncryption(),
                    )
                }
            case _:
                base_url = f"{getattr(DialectDrivers.sqlalchemy, dialect)}://{host}:{port}/{database_name}"
                if auth_mode == AuthMode.PASSWORD:
                    connect_args = {
                        "user": user,
                        "password": password.get_secret_value(),
                    }
                elif auth_mode == AuthMode.JWT:
                    connect_args = {"user": user}

        if dialect == SupportedDatabaseDialects.HANA:
            hana_connect_args = {"encrypt": True, "sslValidateCertificate": False}
            if auth_mode == AuthMode.JWT:
                token = GetAuthTokens().get_third_party_token()
                hana_connect_args["password"] = token.get_secret_value()

            else:
                token = GetAuthTokens().get_auth_token()
                hana_connect_args.update(
                    {"user": user, "password": password.get_secret_value()}
                )

            # Add APPLICATION and APPLICATIONUSER as session variables for Hana
            app_name = f"d2e-{os.environ.get('plugin_name')}"
            token_user = build_user_from_token(token)
            hana_connect_args["sessionVariable:APPLICATION"] = app_name
            hana_connect_args["sessionVariable:APPLICATIONUSER"] = token_user.email if token_user.email else token_user.user_id
            if pa_cdm_config:
                hana_connect_args.update(pa_cdm_config)
            return base_url, hana_connect_args

        return base_url, connect_args

    def create_cachedb_connection_url(
        self,
        database_name: str = None,
        user: str = None,
        password: str = None,
        host: str = None,
        port: int = None,
    ) -> str:
        # postgresql used for all trex connections
        base_url = f"postgresql://{user}:{password}@{host}:{port}/{database_name}"
        return base_url

    def get_r_database_connector_connection_string(
        self,
        user_type: UserType = UserType.READ_USER,
        release_date: str = None,
    ):
        """
        Used for Database Connector package
        """

        database_credentials = self.tenant_configs

        database_connector_dialect = getattr(
            DialectDrivers.database_connector, database_credentials.dialect
        )
        dialect = database_credentials.dialect
        host = database_credentials.host
        port = database_credentials.port
        database_name = database_credentials.databaseName

        match dialect:
            case SupportedDatabaseDialects.POSTGRES:
                conn_url = f"{getattr(DialectDrivers.jdbc, dialect)}://{host}:{port}/{database_name}"
            case SupportedDatabaseDialects.HANA:
                encrypt = database_credentials.encrypt or "TRUE"
                validateCertificate = (
                    database_credentials.validateCertificate or "FALSE"
                )
                conn_url = f"{getattr(DialectDrivers.jdbc, dialect)}://{host}:{port}?databaseName={database_name}&encrypt={encrypt}&validateCertificate={validateCertificate}"
                extra_config = (
                    f"&sessionVariable:TEMPORAL_SYSTEM_TIME_AS_OF={release_date}"
                    if release_date
                    else None
                )
                conn_url += extra_config
            case SupportedDatabaseDialects.BIGQUERY:
                key_path = Secret.load("google-service-account-json").get()
                if not os.path.isfile(key_path):
                    DaoBase.create_service_account_credentials_file(database_credentials)
                return build_bigquery_r_connection_string(
                    project=host,
                    client_email=database_credentials.client_email,
                    key_path=key_path,
                    path_to_driver=DaoBase.path_to_driver,
                )

        match user_type:
            case UserType.ADMIN_USER:
                user = database_credentials.adminUser
                password = database_credentials.adminPassword
            case UserType.READ_USER:
                user = database_credentials.readUser
                password = database_credentials.readPassword

        if dialect == SupportedDatabaseDialects.HANA:
            if database_credentials.authMode == AuthMode.JWT:
                token = GetAuthTokens().get_third_party_token()
                user = ""
                password = token
            else:
                token = GetAuthTokens().get_auth_token()

            # Add APPLICATION and APPLICATIONUSER as session variables for Hana
            app_name = f"d2e-{os.environ.get('plugin_name')}"
            token_user = build_user_from_token(token)
            conn_url_with_app = f"{conn_url}&sessionVariable:APPLICATION={app_name}&sessionVariable:APPLICATIONUSER={token_user.email if token_user.email else token_user.user_id}"
            for session_key, value in self.pa_cdm_config.items():
                conn_url_with_app += f"&{session_key}={value}"
            return f"""connectionDetails <- DatabaseConnector::createConnectionDetails(dbms = '{database_connector_dialect}', connectionString = '{conn_url_with_app}', user = '{user}', password = '{password.get_secret_value()}', pathToDriver = '{DaoBase.path_to_driver}')"""

        return f"""connectionDetails <- DatabaseConnector::createConnectionDetails(dbms = '{database_connector_dialect}', connectionString = '{conn_url}', user = '{user}', password = '{password.get_secret_value()}', pathToDriver = '{DaoBase.path_to_driver}')"""

    def get_database_connector_connection_string(self) -> str:
        """
        Generate JDBC connection string for PostgreSQL database.
        """
        database_credentials = self.tenant_configs
        database_connector_dialect = getattr(
            DialectDrivers.database_connector, database_credentials.dialect
        )
        host = self.tenant_configs.host
        port = self.tenant_configs.port
        database_name = database_credentials.databaseName
        dialect = database_credentials.dialect
        release_date = None

        match dialect:
            case SupportedDatabaseDialects.POSTGRES:
                conn_url = f"{getattr(DialectDrivers.jdbc, dialect)}://{host}:{port}/{database_name}"
            case SupportedDatabaseDialects.HANA:
                encrypt = database_credentials.encrypt or "TRUE"
                validateCertificate = (
                    database_credentials.validateCertificate or "FALSE"
                )
                conn_url = f"{getattr(DialectDrivers.jdbc, dialect)}://{host}:{port}?databaseName={database_name}&encrypt={encrypt}&validateCertificate={validateCertificate}"
                extra_config = (
                    f"&sessionVariable:TEMPORAL_SYSTEM_TIME_AS_OF={release_date}"
                    if release_date
                    else None
                )
                conn_url += extra_config
        return conn_url

    def get_database_connector_dbms_val(self) -> str:
        database_credentials = self.tenant_configs
        database_connector_dialect = getattr(
            DialectDrivers.database_connector, database_credentials.dialect
        )
        return database_connector_dialect

    @staticmethod
    def set_db_driver_env() -> str:
        """
        Updates path to driver class variable and returns R code
        """
        database_connector_jar_folder = DaoBase.path_to_driver
        set_jar_file_path = f"Sys.setenv('DATABASECONNECTOR_JAR_FOLDER' = '{database_connector_jar_folder}')"
        return set_jar_file_path

    @staticmethod
    def compile_sql_with_params(sqlquery: str, bind_params: dict) -> str:
        """
        Compiles an sqlalchemy

        e.g. select * from table where id = :id, {"id": 1}
        """
        if not bind_params:
            return sqlquery
        raw_sql = (
            text(sqlquery)
            .bindparams(**bind_params)
            .compile(compile_kwargs={"literal_binds": True})
        )
        return str(raw_sql)

    # --- Helper methods ---

    def __extract_database_credentials(self) -> DBCredentialsType:

        database_credentials_list = Secret.load("database-credentials").get()
        if not database_credentials_list:
            raise ValueError(f"'DATABASE_CREDENTIALS' secret is empty")

        _db = next(filter(lambda x: x["databaseCode"] ==
                   self.database_code, database_credentials_list), None)

        if _db is None:
            raise ValueError(
                f"Database code '{self.database_code}' not found in 'DATABASE_CREDENTIALS' secret"
            )

        database_credentials = DBCredentialsType(**_db)
        match database_credentials.dialect:
            case SupportedDatabaseDialects.HANA:
                database_credentials.readRole = "TENANT_READ_ROLE"
            case (
                SupportedDatabaseDialects.POSTGRES | SupportedDatabaseDialects.BIGQUERY
            ):
                database_credentials.readRole = "postgres_tenant_read_role"
            case SupportedDatabaseDialects.TREX:
                # Trex pgwire has a single sql user; no separate read role.
                database_credentials.readRole = ""
            case SupportedDatabaseDialects.SNOWFLAKE:
                # Snowflake key-pair auth has no separate read role.
                database_credentials.readRole = ""
            case _:
                dialect_err = f"Dialect {database_credentials.dialect} not supported. Unable to find corresponding dialect read role."
                raise ValueError(dialect_err)
        return database_credentials

    def __create_cachedb_db_name(
        self,
        database_credentials: DBCredentialsType,
        schema_name: str,
        vocab_schema_name: str,
    ) -> str:
        if database_credentials.dialect == SupportedDatabaseDialects.POSTGRES:
            database_credentials.dialect = "postgresql"
        match self.user_type:
            case UserType.READ_USER:
                connection_type = "read"
            case UserType.ADMIN_USER:
                connection_type = "write"
        db_name = (
            f"B|{database_credentials.dialect}|{connection_type}|{self.database_code}"
        )
        if database_credentials.dialect == SupportedDatabaseDialects.DUCKDB:
            db_name += f"|{schema_name}|{vocab_schema_name}"
        return db_name

    def __sanitize_inputs(self, input: str):
        # Allow only alphanumeric characters, underscores, and periods
        if not all(char.isalnum() or char in ("_", ".") for char in input):
            raise ValueError("Invalid characters in idenitifier")
        return re.sub(r"[^a-zA-Z0-9_.]", "", input)

    def _casefold(self, obj_name: str) -> str:
        if not obj_name.startswith("GDM."):
            return obj_name.casefold()
        else:
            return obj_name
        
    def create_service_account_credentials_file(db_credentials: DBCredentialsType):
        """
        Write Google service account credentials to a JSON file and set the environment variable for BigQuery access.
        """
        google_service_account_json_path = Secret.load("google-service-account-json").get()

        google_application_credentials = {
            "type": db_credentials.type,
            "project_id": db_credentials.project_id,
            "private_key_id": db_credentials.private_key_id,
            "private_key": db_credentials.private_key,
            "client_email": db_credentials.client_email,
            "client_id": db_credentials.client_id,
            "auth_uri": db_credentials.auth_uri,
            "token_uri": db_credentials.token_uri,
            "auth_provider_x509_cert_url": db_credentials.auth_provider_x509_cert_url,
            "client_x509_cert_url": db_credentials.client_x509_cert_url,
            "universe_domain": db_credentials.universe_domain
        }
        with open(google_service_account_json_path, "w") as f:
            json.dump(google_application_credentials, f)
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = google_service_account_json_path