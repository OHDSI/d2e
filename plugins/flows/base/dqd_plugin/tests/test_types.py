from dqd_plugin.types import DqdOptionsType, DqdParams

BASE = dict(
    datasetId="ds1",
    schemaName="cdm",
    databaseCode="db1",
    cdmVersionNumber="5.4",
    vocabSchemaName="vocab",
    resultsSchemaName="cdm_results",
    releaseDate="2026-01-01",
)


def test_use_trex_connection_defaults_to_true():
    opts = DqdOptionsType(**BASE)
    assert opts.useSourceConnection is False
    assert opts.use_trex_connection is True


def test_use_source_connection_disables_trex_connection():
    opts = DqdOptionsType(**BASE, useSourceConnection=True)
    assert opts.use_trex_connection is False


def test_use_source_connection_survives_model_dump_roundtrip():
    opts = DqdOptionsType(**BASE, useSourceConnection=True)
    again = DqdOptionsType(**opts.model_dump())
    assert again.use_trex_connection is False


def test_flow_params_inherit_the_source_connection_choice():
    # flow.py builds DqdParams from the options dump; the params object must
    # report the same connection choice, since set_trex_env_var reads it.
    opts = DqdOptionsType(**BASE, useSourceConnection=True)
    params = DqdParams(
        **opts.model_dump(),
        setDBDriverEnv="",
        connectionDetails="",
        use_trex_connection=opts.use_trex_connection,
    )
    assert params.use_trex_connection is False
