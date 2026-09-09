import json
import logging
from pathlib import Path

import pytest

from eq5d5l_index_calculation_plugin import scoring


@pytest.fixture(autouse=True)
def _value_set_dir(monkeypatch):
    # scoring.ValueSetDir is normally a runtime-relative path ("flows/eq5d5l_index_calculation_plugin/...")
    # that only resolves once stage_package.sh has staged the plugin. Point it at the
    # real source-tree location so these tests run directly against the source.
    real_dir = Path(__file__).resolve().parents[1] / "external" / "value_sets"
    monkeypatch.setattr(scoring, "ValueSetDir", str(real_dir))


def test_best_health_state_is_full_health():
    value_set = scoring.load_value_set("AU")
    assert scoring.health_state_to_index("11111", value_set) == 1.0


def test_worst_health_state_matches_bundled_range_low():
    value_set = scoring.load_value_set("AU")
    assert scoring.health_state_to_index("55555", value_set) == value_set["range_low"]


def test_au_health_state_matches_stata_syntax():
    # mobility=2 -> disut_mo=0.039, pain=3 -> disut_pd=0.081, no dimension at level 5
    value_set = scoring.load_value_set("AU")
    index = scoring.health_state_to_index("21131", value_set)
    assert index == round(1 - 0.039 - 0.081, 3)


def test_l5_interaction_only_fires_at_exact_level_5():
    value_set = scoring.load_value_set("AU")
    # mobility=4 alone: no dimension is exactly level 5, so no L5 interaction
    index_no_l5 = scoring.health_state_to_index("41111", value_set)
    assert index_no_l5 == round(1 - 0.237, 3)
    # mobility=5: L5 interaction (0.153) fires in addition to the MO5 main effect
    index_with_l5 = scoring.health_state_to_index("51111", value_set)
    assert index_with_l5 == round(1 - 0.242 - 0.153, 3)


def test_ca_full_health_is_not_1_0():
    # Canada's real STATA syntax (EQ_index = 1 + 0.1351 - disut_total + num45sq) does
    # NOT normalize full health to 1.0, unlike every other bundled country - a genuine
    # feature of its TTO methodology, not a bug. range_high must reflect that rather
    # than assuming "full health = 1.0" the way the old fixed-formula parser did.
    value_set = scoring.load_value_set("CA")
    assert scoring.health_state_to_index("11111", value_set) == 0.949
    assert value_set["range_high"] == 0.949


def test_ca_quadratic_num45_correction():
    # Canada's syntax has a per-dimension (not shared) "at level 4 or 5" indicator,
    # plus a quadratic correction (num45sq) on how many dimensions hit 4/5 - a formula
    # shape the old regex-based parser had no pattern for at all.
    value_set = scoring.load_value_set("CA")
    # exactly one dimension at 4/5: num45=1, so num45sq's "if num45 >= 2" doesn't fire
    one_dim_at_4 = scoring.health_state_to_index("41111", value_set)
    assert one_dim_at_4 == round(1 + 0.1351 - (0.1556 + 0.0458 + 0.0195 + 0.0444 + 0.0376) - 0.051, 3)
    # two dimensions at 4/5: num45=2, num45sq = ((2-1)**2) * 0.0085 = 0.0085
    two_dims_at_4 = scoring.health_state_to_index("44111", value_set)
    assert two_dims_at_4 == round(
        1 + 0.1351 - (0.1556 + 0.1832 + 0.0195 + 0.0444 + 0.0376) - 0.051 - 0.0584 + 0.0085, 3
    )


def test_stata_syntax_accepts_eqindex_without_underscore():
    # Real EuroQol syntax isn't 100% consistent on "EQ_index" - Trinidad and
    # Tobago's bundled download spells the result variable "EQindex" (no
    # underscore). _discover_stata_index_var() must find that name too, not just
    # the majority spelling, or this would silently raise "EQ_index unassigned"
    # for every health state in a file that actually did assign its result.
    text = """
* STATA syntax code for the computation of index values with a test value set *;
gen disut_mo = .
replace disut_mo = 0 if missing(disut_mo) & mobility == 1
replace disut_mo = 0.1 if missing(disut_mo) & mobility == 2
replace disut_mo = 0.2 if missing(disut_mo) & mobility == 3
replace disut_mo = 0.3 if missing(disut_mo) & mobility == 4
replace disut_mo = 0.4 if missing(disut_mo) & mobility == 5
gen disut_sc = .
replace disut_sc = 0 if missing(disut_sc) & selfcare == 1
replace disut_sc = 0.1 if missing(disut_sc) & selfcare == 2
replace disut_sc = 0.2 if missing(disut_sc) & selfcare == 3
replace disut_sc = 0.3 if missing(disut_sc) & selfcare == 4
replace disut_sc = 0.4 if missing(disut_sc) & selfcare == 5
gen disut_ua = .
replace disut_ua = 0 if missing(disut_ua) & activity == 1
replace disut_ua = 0.1 if missing(disut_ua) & activity == 2
replace disut_ua = 0.2 if missing(disut_ua) & activity == 3
replace disut_ua = 0.3 if missing(disut_ua) & activity == 4
replace disut_ua = 0.4 if missing(disut_ua) & activity == 5
gen disut_pd = .
replace disut_pd = 0 if missing(disut_pd) & pain == 1
replace disut_pd = 0.1 if missing(disut_pd) & pain == 2
replace disut_pd = 0.2 if missing(disut_pd) & pain == 3
replace disut_pd = 0.3 if missing(disut_pd) & pain == 4
replace disut_pd = 0.4 if missing(disut_pd) & pain == 5
gen disut_ad = .
replace disut_ad = 0 if missing(disut_ad) & anxiety == 1
replace disut_ad = 0.1 if missing(disut_ad) & anxiety == 2
replace disut_ad = 0.2 if missing(disut_ad) & anxiety == 3
replace disut_ad = 0.3 if missing(disut_ad) & anxiety == 4
replace disut_ad = 0.4 if missing(disut_ad) & anxiety == 5
gen disut_total = disut_mo + disut_sc + disut_ua + disut_pd + disut_ad
gen EQindex = .
replace EQindex = 1 - disut_total
replace EQindex = round(EQindex, .001)
"""
    parsed = scoring.parse_stata_value_set(text)
    assert parsed["index_table"]["11111"] == 1.0
    assert parsed["index_table"]["55555"] == round(1 - 5 * 0.4, 3)
    assert parsed["range_high"] == 1.0


def test_stata_syntax_rejects_ambiguous_index_var():
    text = """
gen disut_mo = .
replace disut_mo = 0 if missing(disut_mo) & mobility == 1
replace disut_mo = 0.1 if missing(disut_mo) & mobility == 2
replace disut_mo = 0.2 if missing(disut_mo) & mobility == 3
replace disut_mo = 0.3 if missing(disut_mo) & mobility == 4
replace disut_mo = 0.4 if missing(disut_mo) & mobility == 5
gen disut_sc = .
replace disut_sc = 0 if missing(disut_sc) & selfcare == 1
replace disut_sc = 0.1 if missing(disut_sc) & selfcare == 2
replace disut_sc = 0.2 if missing(disut_sc) & selfcare == 3
replace disut_sc = 0.3 if missing(disut_sc) & selfcare == 4
replace disut_sc = 0.4 if missing(disut_sc) & selfcare == 5
gen disut_ua = .
replace disut_ua = 0 if missing(disut_ua) & activity == 1
replace disut_ua = 0.1 if missing(disut_ua) & activity == 2
replace disut_ua = 0.2 if missing(disut_ua) & activity == 3
replace disut_ua = 0.3 if missing(disut_ua) & activity == 4
replace disut_ua = 0.4 if missing(disut_ua) & activity == 5
gen disut_pd = .
replace disut_pd = 0 if missing(disut_pd) & pain == 1
replace disut_pd = 0.1 if missing(disut_pd) & pain == 2
replace disut_pd = 0.2 if missing(disut_pd) & pain == 3
replace disut_pd = 0.3 if missing(disut_pd) & pain == 4
replace disut_pd = 0.4 if missing(disut_pd) & pain == 5
gen disut_ad = .
replace disut_ad = 0 if missing(disut_ad) & anxiety == 1
replace disut_ad = 0.1 if missing(disut_ad) & anxiety == 2
replace disut_ad = 0.2 if missing(disut_ad) & anxiety == 3
replace disut_ad = 0.3 if missing(disut_ad) & anxiety == 4
replace disut_ad = 0.4 if missing(disut_ad) & anxiety == 5
gen disut_total = disut_mo + disut_sc + disut_ua + disut_pd + disut_ad
gen EQ_index = .
replace EQ_index = 1 - disut_total
gen EQindex = EQ_index
"""
    with pytest.raises(ValueError, match="Multiple candidate index variables"):
        scoring.parse_stata_value_set(text)


def test_be_health_state_matches_stata_syntax():
    # cross-checked against four worked cases (originally verified against EuroQol's
    # SPSS syntax; Belgium.txt's STATA syntax - EQ_index = 1 - 0.038 - disut_total,
    # plus an explicit "IF full health, EQ_index = 1" override - encodes the same
    # formula and is parsed to the identical coefficients/interaction)
    value_set = scoring.load_value_set("BE")
    assert scoring.health_state_to_index("11111", value_set) == 1.0
    assert scoring.health_state_to_index("21111", value_set) == 0.93
    assert scoring.health_state_to_index("13214", value_set) == 0.548
    assert scoring.health_state_to_index("55555", value_set) == -0.533


def test_be_min_level_interaction_fires_whenever_not_full_health():
    # BE's "always subtract 0.038 except at full health" is a min_level interaction
    # at level=2 - it should fire for ANY dimension above its best level, not just
    # severe ones (unlike AU's exact_level=5 interaction).
    value_set = scoring.load_value_set("BE")
    full_health = scoring.health_state_to_index("11111", value_set)
    barely_off = scoring.health_state_to_index("21111", value_set)
    assert round(full_health - barely_off, 3) == round(0.032 + 0.038, 3)


def test_unsupported_country_raises_with_supported_list():
    with pytest.raises(ValueError, match="AU"):
        scoring.load_value_set("ZZ")


def test_placeholder_value_set_logs_warning(caplog, tmp_path, monkeypatch):
    # No bundled country is placeholder data any more (GB was removed once AU/BE/etc.
    # became real, verified value sets) - write a throwaway placeholder file to
    # exercise load_value_set()'s placeholder warning path in isolation.
    (tmp_path / "XX.json").write_text(json.dumps({
        "country_code": "XX",
        "method": "main_effects_interaction",
        "placeholder": True,
        "source": "test fixture",
        "intercept": 1.0,
        "coefficients": {},
        "interactions": [],
    }))
    monkeypatch.setattr(scoring, "ValueSetDir", str(tmp_path))
    with caplog.at_level(logging.WARNING):
        scoring.load_value_set("XX")
    assert "placeholder" in caplog.text.lower()


def test_verified_value_set_does_not_log_warning(caplog):
    with caplog.at_level(logging.WARNING):
        scoring.load_value_set("AU")
    assert "placeholder" not in caplog.text.lower()


def test_assemble_health_state_dimension_order():
    answers = {
        "mobility": 1,
        "self_care": 1,
        "usual_activities": 2,
        "pain_discomfort": 2,
        "anxiety_depression": 3,
    }
    assert scoring.assemble_health_state(answers) == "11223"


def test_assemble_health_state_rejects_missing_dimension():
    with pytest.raises(ValueError):
        scoring.assemble_health_state({"mobility": 1})


def test_assemble_health_state_rejects_invalid_level():
    answers = {
        "mobility": 6,
        "self_care": 1,
        "usual_activities": 1,
        "pain_discomfort": 1,
        "anxiety_depression": 1,
    }
    with pytest.raises(ValueError):
        scoring.assemble_health_state(answers)
