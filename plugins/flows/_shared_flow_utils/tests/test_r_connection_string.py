from _shared_flow_utils.dao.daobase import build_bigquery_r_connection_string


def test_bigquery_r_connection_string_shape():
    result = build_bigquery_r_connection_string(
        project="my-gcp-project",
        client_email="svc@my-gcp-project.iam.gserviceaccount.com",
        key_path="/tmp/google-sa.json",
        path_to_driver="/app/inst/drivers",
    )
    assert "dbms = 'bigquery'" in result
    assert (
        "connectionString = 'jdbc:bigquery://https://www.googleapis.com/bigquery/v2:443;"
        "ProjectId=my-gcp-project;OAuthType=0;"
        "OAuthServiceAcctEmail=svc@my-gcp-project.iam.gserviceaccount.com;"
        "OAuthPvtKeyPath=/tmp/google-sa.json;"
        "EnableSession=1'" in result
    )
    assert "user = ''" in result and "password = ''" in result
