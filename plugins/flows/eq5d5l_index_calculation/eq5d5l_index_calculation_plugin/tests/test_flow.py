import datetime
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from prefect import flow as prefect_flow
from prefect.testing.utilities import prefect_test_harness

from eq5d5l_index_calculation_plugin import flow, scoring
from eq5d5l_index_calculation_plugin.types import Eq5d5lCalculateConfig


@pytest.fixture(autouse=True, scope="session")
def _prefect_test_fixture():
    # Run task/flow-decorated functions against a temp SQLite Prefect API,
    # mirroring dataflow_ui_plugin/tests/conftest.py's convention.
    with prefect_test_harness():
        yield


@pytest.fixture(autouse=True)
def _value_set_dir(monkeypatch):
    real_dir = Path(scoring.__file__).resolve().parent / "external" / "value_sets"
    monkeypatch.setattr(scoring, "ValueSetDir", str(real_dir))
    monkeypatch.setattr("eq5d5l_index_calculation_plugin.flow.load_value_set", scoring.load_value_set)


@prefect_flow
def _run(fn, *args, **kwargs):
    # get_run_logger() (called by every @task and by calculate_eq5d5l_index itself)
    # requires an active flow or task run context. Tests call task functions via
    # `.fn` (the raw, undecorated function - skipping Prefect's own task-run
    # orchestration/persistence) or call the plain `calculate_eq5d5l_index` function
    # directly, so this thin `@flow` wrapper is what supplies that context.
    return fn(*args, **kwargs)


def _observation_row(observation_id, person_id, observation_concept_id, qr_id, answer_code,
                      visit_occurrence_id=None, observation_date=datetime.date(2024, 1, 1)):
    return {
        "observation_id": observation_id,
        "person_id": person_id,
        "observation_concept_id": observation_concept_id,
        "observation_source_value": qr_id,
        "value_source_value": answer_code,
        "observation_date": observation_date,
        "observation_datetime": None,
        "visit_occurrence_id": visit_occurrence_id,
    }


def _full_health_group(qr_id="qr-1", person_id=101, visit_occurrence_id=201):
    # One row per dimension, all at level 1 ("11111" - full health).
    from eq5d5l_index_calculation_plugin.types import DIMENSION_CONCEPT_ID_MAP
    return [
        _observation_row(idx, person_id, concept_id, qr_id, "1", visit_occurrence_id)
        for idx, concept_id in enumerate(DIMENSION_CONCEPT_ID_MAP.values())
    ]


class TestCalculateIndexRows:
    def test_groups_by_qr_id_and_scores_full_health(self):
        from eq5d5l_index_calculation_plugin.types import DIMENSION_CONCEPT_ID_MAP
        value_set = scoring.load_value_set("AU")
        rows = _run(
            flow.calculate_index_rows.fn,
            observation_rows=_full_health_group(),
            dimension_concept_id_map=DIMENSION_CONCEPT_ID_MAP,
            value_set=value_set,
        )
        assert len(rows) == 1
        row = rows[0]
        assert row["person_id"] == 101
        assert row["visit_occurrence_id"] == 201
        assert row["value_source_value"] == "11111"
        assert row["value_as_number"] == 1.0
        assert row["measurement_source_value"] == "qr-1"
        assert row["measurement_date"] == datetime.date(2024, 1, 1)
        assert row["measurement_type_concept_id"] == 32862

    def test_skips_dimension_with_non_numeric_code(self):
        # answer_code_level_map has been removed - a non-numeric value_source_value
        # is unconditionally unparseable now, so this dimension (and therefore the
        # whole group, missing one of the 5) is skipped rather than scored.
        from eq5d5l_index_calculation_plugin.types import DIMENSION_CONCEPT_ID_MAP
        value_set = scoring.load_value_set("AU")
        concept_ids = list(DIMENSION_CONCEPT_ID_MAP.values())
        observation_rows = [
            _observation_row(0, 1, concept_ids[0], "qr-2", "no-problems"),
            _observation_row(1, 1, concept_ids[1], "qr-2", "1"),
            _observation_row(2, 1, concept_ids[2], "qr-2", "1"),
            _observation_row(3, 1, concept_ids[3], "qr-2", "1"),
            _observation_row(4, 1, concept_ids[4], "qr-2", "1"),
        ]
        rows = _run(
            flow.calculate_index_rows.fn,
            observation_rows=observation_rows,
            dimension_concept_id_map=DIMENSION_CONCEPT_ID_MAP,
            value_set=value_set,
        )
        assert rows == []

    def test_skips_group_missing_a_dimension(self):
        from eq5d5l_index_calculation_plugin.types import DIMENSION_CONCEPT_ID_MAP
        value_set = scoring.load_value_set("AU")
        incomplete = _full_health_group()[:4]  # drop the 5th dimension's row
        rows = _run(
            flow.calculate_index_rows.fn,
            observation_rows=incomplete,
            dimension_concept_id_map=DIMENSION_CONCEPT_ID_MAP,
            value_set=value_set,
        )
        assert rows == []

    def test_skips_group_with_disagreeing_person_id(self):
        from eq5d5l_index_calculation_plugin.types import DIMENSION_CONCEPT_ID_MAP
        value_set = scoring.load_value_set("AU")
        concept_ids = list(DIMENSION_CONCEPT_ID_MAP.values())
        observation_rows = [
            _observation_row(0, 1, concept_ids[0], "qr-3", "1"),
            _observation_row(1, 2, concept_ids[1], "qr-3", "1"),  # different person_id
            _observation_row(2, 1, concept_ids[2], "qr-3", "1"),
            _observation_row(3, 1, concept_ids[3], "qr-3", "1"),
            _observation_row(4, 1, concept_ids[4], "qr-3", "1"),
        ]
        rows = _run(
            flow.calculate_index_rows.fn,
            observation_rows=observation_rows,
            dimension_concept_id_map=DIMENSION_CONCEPT_ID_MAP,
            value_set=value_set,
        )
        assert rows == []

    def test_ignores_rows_for_unmapped_observation_concept_id(self):
        from eq5d5l_index_calculation_plugin.types import DIMENSION_CONCEPT_ID_MAP
        value_set = scoring.load_value_set("AU")
        rows_in = _full_health_group() + [_observation_row(5, 101, 999, "qr-1", "1")]
        rows = _run(
            flow.calculate_index_rows.fn,
            observation_rows=rows_in,
            dimension_concept_id_map=DIMENSION_CONCEPT_ID_MAP,
            value_set=value_set,
        )
        assert len(rows) == 1


class TestWriteMeasurements:
    def test_noop_when_no_rows_leaves_existing_rows_untouched(self):
        dbdao = MagicMock()
        result = _run(
            flow.write_measurements.fn,
            dbdao=dbdao, schema_name="cdmdefault", measurement_concept_id=42537273, rows=[],
        )
        assert result == []
        dbdao.delete_and_insert_rows.assert_not_called()

    def test_delegates_to_delete_and_insert_rows(self):
        dbdao = MagicMock()
        dbdao.delete_and_insert_rows.return_value = [{"measurement_id": 1}]
        rows = [{"person_id": 101}]
        result = _run(
            flow.write_measurements.fn,
            dbdao=dbdao, schema_name="cdmdefault", measurement_concept_id=42537273, rows=rows,
        )
        assert result == [{"measurement_id": 1}]
        dbdao.delete_and_insert_rows.assert_called_once_with(
            schema="cdmdefault",
            table="measurement",
            delete_column="measurement_concept_id",
            delete_value=42537273,
            insert_rows=rows,
            id_column="measurement_id",
        )


class TestWriteFhirKeyMap:
    def test_noop_when_no_rows(self, monkeypatch):
        dbdao_factory = MagicMock()
        monkeypatch.setattr(flow, "DBDao", dbdao_factory)
        _run(flow.write_fhir_key_map.fn, database_code="alpdev_pg", schema_name="cdmdefault", rows=[])
        dbdao_factory.assert_not_called()

    def test_upserts_when_mapping_table_already_exists(self, monkeypatch):
        mapping_dao = MagicMock()
        mapping_dao.check_schema_exists.return_value = True
        mapping_dao.check_table_exists.return_value = True
        monkeypatch.setattr(flow, "DBDao", MagicMock(return_value=mapping_dao))

        rows = [{"measurement_source_value": "qr-1", "measurement_id": 555}]
        _run(flow.write_fhir_key_map.fn, database_code="alpdev_pg", schema_name="cdmdefault", rows=rows)

        mapping_dao.check_schema_exists.assert_called_once_with("alpdev_pg_cdmdefault_fhir_mapping")
        mapping_dao.check_table_exists.assert_called_once_with(
            "alpdev_pg_cdmdefault_fhir_mapping", "fhir_omop_key_map"
        )
        # This plugin never creates the mapping schema/table itself.
        mapping_dao.create_schema.assert_not_called()
        mapping_dao.execute_sql.assert_not_called()
        mapping_dao.batch_insert_values.assert_called_once_with(
            "alpdev_pg_cdmdefault_fhir_mapping",
            "fhir_omop_key_map",
            ["fhir_id", "fhir_resource_type", "omop_table_name", "omop_id"],
            [("qr-1", "QuestionnaireResponse", "measurement", "555")],
            on_conflict="ON CONFLICT (fhir_id, fhir_resource_type, omop_table_name, omop_id) DO NOTHING",
        )

    def test_fails_loudly_when_mapping_schema_missing(self, monkeypatch):
        mapping_dao = MagicMock()
        mapping_dao.check_schema_exists.return_value = False
        monkeypatch.setattr(flow, "DBDao", MagicMock(return_value=mapping_dao))

        rows = [{"measurement_source_value": "qr-1", "measurement_id": 555}]
        with pytest.raises(ValueError, match="does not exist"):
            _run(flow.write_fhir_key_map.fn, database_code="alpdev_pg", schema_name="cdmdefault", rows=rows)

        mapping_dao.batch_insert_values.assert_not_called()

    def test_fails_loudly_when_mapping_table_missing(self, monkeypatch):
        mapping_dao = MagicMock()
        mapping_dao.check_schema_exists.return_value = True
        mapping_dao.check_table_exists.return_value = False
        monkeypatch.setattr(flow, "DBDao", MagicMock(return_value=mapping_dao))

        rows = [{"measurement_source_value": "qr-1", "measurement_id": 555}]
        with pytest.raises(ValueError, match="does not exist"):
            _run(flow.write_fhir_key_map.fn, database_code="alpdev_pg", schema_name="cdmdefault", rows=rows)

        mapping_dao.batch_insert_values.assert_not_called()


class TestWriteAlgorithmMetadata:
    def test_overwrites_existing_row_and_inserts_the_new_one(self):
        dbdao = MagicMock()
        dbdao.delete_and_insert_rows.return_value = [{"metadata_id": 7}]
        value_set = {
            "method": "stata_simulation",
            "source": "Parsed at load time from bundled STATA syntax (Australia.txt): some citation",
        }

        _run(
            flow.write_algorithm_metadata.fn,
            dbdao=dbdao, schema_name="cdmdefault", country_code="au", value_set=value_set,
        )

        assert dbdao.delete_and_insert_rows.call_count == 1
        _, kwargs = dbdao.delete_and_insert_rows.call_args
        assert kwargs["schema"] == "cdmdefault"
        assert kwargs["table"] == "metadata"
        # Overwrite-on-rerun: scoped to delete only this plugin's own metadata row,
        # by name, before inserting the freshly computed one - same shape as
        # write_measurements()'s delete_column/delete_value scoping by concept id.
        assert kwargs["delete_column"] == "name"
        assert kwargs["delete_value"] == "EQ-5D-5L Index Calculation Algorithm"
        assert kwargs["id_column"] == "metadata_id"
        [row] = kwargs["insert_rows"]
        assert "metadata_id" not in row  # assigned by delete_and_insert_rows itself
        assert row["metadata_concept_id"] == 0
        assert row["metadata_type_concept_id"] == 0
        assert row["name"] == "EQ-5D-5L Index Calculation Algorithm"
        assert "country_code=AU" in row["value_as_string"]
        assert "method=stata_simulation" in row["value_as_string"]
        assert len(row["value_as_string"]) <= 250

    def test_truncates_long_source_to_fit_column(self):
        dbdao = MagicMock()
        value_set = {"method": "stata_simulation", "source": "x" * 500}

        _run(
            flow.write_algorithm_metadata.fn,
            dbdao=dbdao, schema_name="cdmdefault", country_code="AU", value_set=value_set,
        )

        [row] = dbdao.delete_and_insert_rows.call_args.kwargs["insert_rows"]
        assert len(row["value_as_string"]) == 250


class TestCalculateEq5d5lIndexEndToEnd:
    def _config(self, **overrides):
        defaults = dict(
            schema_name="cdmdefault",
            database_code="alpdev_pg",
            omop_dataset_id="alpdev_pg",
            country_code="AU",
        )
        defaults.update(overrides)
        return Eq5d5lCalculateConfig(**defaults)

    def _patch_daos(self, monkeypatch, observation_rows):
        main_dao = MagicMock()
        main_dao.select_rows_where_in.return_value = observation_rows
        main_dao.delete_and_insert_rows.side_effect = (
            lambda insert_rows, id_column, **_: [
                {**row, id_column: i + 1} for i, row in enumerate(insert_rows)
            ]
        )
        mapping_dao = MagicMock()
        mapping_dao.check_schema_exists.return_value = True
        mapping_dao.check_table_exists.return_value = True

        def _dao_factory(*args, **kwargs):
            return mapping_dao if kwargs.get("dialect") is not None else main_dao

        monkeypatch.setattr(flow, "DBDao", _dao_factory)
        return main_dao, mapping_dao

    @staticmethod
    def _delete_and_insert_calls_for(main_dao, table):
        return [c for c in main_dao.delete_and_insert_rows.call_args_list if c.kwargs["table"] == table]

    def test_writes_measurement_key_map_and_metadata_rows(self, monkeypatch):
        main_dao, mapping_dao = self._patch_daos(monkeypatch, _full_health_group())

        rows = _run(flow.calculate_eq5d5l_index, self._config())

        assert len(rows) == 1
        assert rows[0]["value_as_number"] == 1.0
        assert main_dao.delete_and_insert_rows.call_count == 2
        mapping_dao.batch_insert_values.assert_called_once()
        [metadata_call] = self._delete_and_insert_calls_for(main_dao, "metadata")
        assert metadata_call.kwargs["delete_column"] == "name"
        assert metadata_call.kwargs["delete_value"] == "EQ-5D-5L Index Calculation Algorithm"
        [metadata_row] = metadata_call.kwargs["insert_rows"]
        assert "country_code=AU" in metadata_row["value_as_string"]

    def test_dry_run_skips_all_writes(self, monkeypatch):
        main_dao, mapping_dao = self._patch_daos(monkeypatch, _full_health_group())

        rows = _run(flow.calculate_eq5d5l_index, self._config(dry_run=True))

        assert len(rows) == 1
        main_dao.delete_and_insert_rows.assert_not_called()
        mapping_dao.batch_insert_values.assert_not_called()

    def test_no_valid_groups_skips_measurement_and_metadata_writes(self, monkeypatch):
        # Drop one dimension row so the single group is incomplete and skipped.
        main_dao, mapping_dao = self._patch_daos(monkeypatch, _full_health_group()[:4])

        rows = _run(flow.calculate_eq5d5l_index, self._config())

        assert rows == []
        main_dao.delete_and_insert_rows.assert_not_called()
        mapping_dao.batch_insert_values.assert_not_called()

    def test_raises_when_fhir_mapping_table_missing(self, monkeypatch):
        main_dao, mapping_dao = self._patch_daos(monkeypatch, _full_health_group())
        mapping_dao.check_schema_exists.return_value = False

        with pytest.raises(ValueError, match="does not exist"):
            _run(flow.calculate_eq5d5l_index, self._config())

        # measurement rows were written before the missing-mapping-table error;
        # metadata is written after the key-map, so it never got a chance to run.
        assert main_dao.delete_and_insert_rows.call_count == 1
        assert self._delete_and_insert_calls_for(main_dao, "measurement")
        assert not self._delete_and_insert_calls_for(main_dao, "metadata")

    def test_rerun_with_different_country_overwrites_both_measurement_and_metadata(self, monkeypatch):
        # Same dataset (schema_name/database_code), re-run with a different
        # country_code - both write_measurements() and write_algorithm_metadata()
        # must target the *same* delete scope on each run (measurement_concept_id /
        # metadata row name), not one keyed by country, so the second run's DELETE
        # actually clears the first run's rows instead of leaving them behind
        # alongside the new ones.
        main_dao, mapping_dao = self._patch_daos(monkeypatch, _full_health_group())

        _run(flow.calculate_eq5d5l_index, self._config(country_code="AU"))
        _run(flow.calculate_eq5d5l_index, self._config(country_code="CA"))

        measurement_calls = self._delete_and_insert_calls_for(main_dao, "measurement")
        metadata_calls = self._delete_and_insert_calls_for(main_dao, "metadata")
        assert len(measurement_calls) == 2
        assert len(metadata_calls) == 2

        # Both runs delete-scope on the same measurement_concept_id...
        assert measurement_calls[0].kwargs["delete_value"] == measurement_calls[1].kwargs["delete_value"]
        # ...and the same metadata row name...
        assert metadata_calls[0].kwargs["delete_value"] == metadata_calls[1].kwargs["delete_value"]
        assert metadata_calls[0].kwargs["delete_value"] == "EQ-5D-5L Index Calculation Algorithm"
        # ...while the metadata content itself reflects each run's own country.
        [au_row] = metadata_calls[0].kwargs["insert_rows"]
        [ca_row] = metadata_calls[1].kwargs["insert_rows"]
        assert "country_code=AU" in au_row["value_as_string"]
        assert "country_code=CA" in ca_row["value_as_string"]
