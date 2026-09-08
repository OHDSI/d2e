## EQ-5D-5L Index Calculation Plugin

Calculates EQ-5D-5L utility index (health state) scores from EQ-5D-5L questionnaire
responses already present in the OMOP `observation` table, and writes the result
into the OMOP `measurement` table, linked back to the source person/visit.

This plugin does **not** read FHIR data or run any FHIR->OMOP transform itself. It
assumes the upstream `EQ5D5L-to-OMOP-Observation` FHIR StructureMap
(`EQ-5D-5LObservationMap.json`) - plus its downstream concept-resolution step - has
already turned each EQ-5D-5L `QuestionnaireResponse` into 5 `observation` rows per
administration (one per dimension) - see "Reading responses" below for the exact
contract this plugin expects from that pipeline.

EQ-5D-5L is a 5-dimension, 5-level health-related quality-of-life questionnaire
(mobility, self-care, usual activities, pain/discomfort, anxiety/depression). Each
response's 5-digit health state (e.g. `11223`) is converted into a single utility
index using the EuroQol value set for the run's `country_code` - value sets are
country-specific because they're derived from general-population surveys in each
country. Source: https://euroqol.org/eq-5d-instruments/eq-5d-5l-about/valuation/eq-5d-5l-value-sets/

### Bundled value sets

`scoring.load_value_set(country_code)` takes an ISO 3166-1 alpha-2 `country_code`
(e.g. `"AU"`) and resolves it to a bundled file via
`scoring.COUNTRY_CODE_TO_FILE_STEM` - EuroQol's own downloads are named after the
country (`Australia.txt`), not its ISO code, so this mapping is the one place that
naming mismatch is handled; callers/tests/`package.json`'s dropdown enum all stay on
ISO codes. For a given stem, a `<name>.json` file takes precedence if present,
otherwise a `<name>.txt` is parsed on the fly - see "STATA syntax parsing" below for
exactly what shape of `.txt` syntax is understood.

Currently bundled, all as real (non-placeholder) EuroQol STATA syntax used as-is,
parsed at `load_value_set()` time (nothing is pre-converted or cached to disk, so
there's no separate transcription that could drift out of sync with these files):

| `country_code` | file | value set |
| --- | --- | --- |
| `AU` | `Australia.txt` | DCE with duration and dead |
| `BE` | `Belgium.txt` | DCE and TTO hybrid |
| `CA` | `Canada.txt` | TTO |
| `CN` | `China.txt` | TTO |
| `DE` | `Germany.txt` | DCE and TTO hybrid |
| `DK` | `Denmark.txt` | DCE and TTO hybrid |
| `EG` | `Egypt.txt` | TTO |
| `ET` | `Ethiopia.txt` | DCE and TTO hybrid |
| `FR` | `France.txt` | DCE and TTO hybrid |
| `GH` | `Ghana.txt` | DCE and TTO hybrid, adapted EuroQol protocol |

Note `CA`/Canada is the one bundled value set that does **not** put full health
(`11111`) at index `1.0` - it comes out to `0.949`. That's a real, documented feature
of Canada's TTO value set methodology, not a bug: `parse_stata_value_set()` computes
`range_high` as the actual max over all 3125 possible health states rather than
assuming "full health = 1.0", specifically so a country like this is scored correctly
instead of silently forced onto an assumption that happens to hold for the other 9.

Adding a real country is either: dropping in EuroQol's official STATA syntax
unmodified as `external/value_sets/<Country name>.txt` (see "STATA syntax parsing"
below for exactly what subset of STATA is understood), or, for SPSS/SAS-only value
sets, hand-transcribing a correctly-authored `external/value_sets/<Country name>.json`
file (see "Value set file format" below as a template - no bundled example
currently, since every country found so far had real STATA syntax available). Either
way, also add the ISO code -> file stem mapping to `COUNTRY_CODE_TO_FILE_STEM` in
`scoring.py`. No other code changes are needed for a `.txt` file, even one with a
formula shape no other bundled country uses (see below) - that's the point of
interpreting the syntax rather than pattern-matching it.

`country_code` is also declared as a JSON Schema `enum` in `package.json` (currently
`["AU", "BE", "CA", "CN", "DE", "DK", "EG", "ET", "FR", "GH"]`), so the job-trigger UI
renders it as a dropdown. That list is **not** auto-derived from this directory -
it's a static, hand-maintained mirror for
the UI only (`country_code` itself stays a plain string in `types.py`, not a Python
`Enum`, so nothing at the validation layer requires it to be kept in sync). Adding a
country file without updating this enum still works if `country_code` is passed
directly (e.g. via the API); it just won't appear in the dropdown. Update both when
adding a country intended for UI use.

### Value set file format

Two ways `load_value_set()` can build a value set, tagged by its `method` field -
`health_state_to_index()` branches on which is present:

A `<name>.txt` file (`Australia.txt`, `Belgium.txt`, `Canada.txt`, ...) is EuroQol's
STATA syntax, unmodified. `scoring.parse_stata_value_set()` (see "STATA syntax
parsing" below) actually runs it - once per each of the 3125 possible 5-dimension
health states - and returns `method: "stata_simulation"` plus an `index_table`
mapping every `"MMSCUAPDAD"`-style health state string directly to its computed
index value (`range_low`/`range_high`/`source` are also filled in automatically,
from that table and the file's own `*` comment header, respectively).

A `<name>.json` file is hand-authored directly in this shape (no bundled example
currently, since every country found so far had real STATA syntax to run instead)
- kept for value sets EuroQol only publishes as SPSS/SAS syntax, which nothing here
parses:

```json
{
  "country_code": "BE",
  "method": "main_effects_interaction",
  "source": "<citation/link to the specific EuroQol value set used>",
  "range_low": -0.533,
  "range_high": 1.0,
  "intercept": 1.0,
  "coefficients": { "MO2": 0.032, "MO3": 0.059, "...": "..." },
  "interactions": [
    { "name": "not_full_health", "trigger": "min_level", "level": 2, "coefficient": 0.038 }
  ]
}
```

`method: "main_effects_interaction"` covers only a narrow, fixed formula shape: for
each dimension at level >= 2, subtract that dimension+level's coefficient from the
intercept; then subtract the coefficient of each `interactions` entry whose trigger
condition is met by the worst level reached across all 5 dimensions. Two trigger
shapes are supported:
- `"min_level"` - fires if any dimension is at level >= `level` (e.g. a "level 3 or
  worse" interaction, commonly named `N3`)
- `"exact_level"` - fires if any dimension is at exactly `level` (e.g. a `L5` term
  that fires only when a dimension is exactly level 5)

This fixed shape is a much narrower model than what `parse_stata_value_set()` can
handle (see below) - it exists only because a hand-transcribed JSON file has no
syntax to run, so `scoring.py` must know the formula's shape up front. A `.json` file
declaring any other `method` is rejected by `load_value_set()` rather than silently
misapplied.

### STATA syntax parsing

For a `<name>.txt` file, `scoring.parse_stata_value_set()` doesn't try to recognize a
particular formula shape (an earlier version of this module did - matching a
main-effect block, an "any dimension at level N" interaction, and an
intercept-minus-a-constant term - and broke the first time a real country needed
something that fixed pattern hadn't anticipated: Canada's syntax has a nonzero level-1
coefficient, a separate "at level 4 or 5" indicator *per dimension* rather than one
shared across all 5, a count of how many dimensions hit 4/5, and a quadratic
correction on that count *added* into `EQ_index`, not subtracted). Every new country
under that approach risked needing another special case.

Instead, `scoring.py` has a small interpreter (`_compile_stata_statements()` /
`_run_stata_statements()`) for the actual STATA subset EuroQol's value-set syntax
files use - `gen`/`replace <var> = <expr> [if <cond>]`, arithmetic (`+ - * / ^`),
comparisons (`== != >= <= < >`), booleans (`& |`), and the `missing()`/`round()`
functions - and it runs the bundled file's real statements, in file order, once for
every one of the 5^5 = 3125 possible health states (~100ms per country; trivial next
to `load_value_set()` being called once per flow run, not per row). Whatever value
`EQ_index` ends up with in each run is recorded into `index_table`. This is not a
general STATA/`.do`-file parser or interpreter - no macros, loops, line
continuations, or `#delimit ;` - and it does not run real Stata (no `pystata`/
`stata_kernel`, so no licensed Stata install needed just to read ~20-40 numbers per
country); it understands exactly the statement/expression subset above, and raises
`ValueError` on anything else (an unrecognized statement, an unsupported function, a
malformed expression) rather than silently mis-scoring. Because it executes the
actual syntax instead of matching it against a predetermined shape, whatever formula
a country's real EuroQol download encodes - main effects only, shared interactions,
per-dimension interactions, counts, quadratic terms, additive vs. subtractive
constants - is handled correctly as long as it stays within that subset, with no
`scoring.py` changes needed per country.

One piece of domain knowledge it does still rely on: EuroQol's own STATA templates
consistently accumulate each dimension's disutility into a `disut_mo`/`disut_sc`/
`disut_ua`/`disut_pd`/`disut_ad` variable (mobility/self-care/usual-activities/
pain-discomfort/anxiety-depression respectively) via a `missing(disut_<code>) & <var>
== <level>`-guarded main-effect line - `_discover_stata_dimension_vars()` reads that
line's `<var>` (e.g. `mobility`) per dimension code, so the interpreter doesn't need
to assume any fixed variable naming beyond the `disut_<code>` convention itself. A
file that doesn't follow that convention isn't a fit for `.txt` - use a hand-authored
`.json` file instead (see "Value set file format" above).

### Reading responses - the `observation` contract this plugin expects

`EQ-5D-5LObservationMap.json` is a two-stage transform: the FHIR StructureMap itself
(stage 1) produces intermediate `Observation` rows per dimension, without resolving
concept ids - it stashes `"<qrId>::<linkId>"` in `observation_source_value` and the
raw FHIR answer code (e.g. `"1"` or `"no-problems"`) in `value_source_value`. A
downstream python_node (stage 2, not part of this plugin) resolves concept ids from
the EQ-5D-5L `Questionnaire` resource and restores `observation_source_value` to the
plain source `QuestionnaireResponse.id` (`qrId`). This plugin reads the **final,
stage-2-resolved** rows:

- **Dimension identity**: `observation_concept_id` identifies which of the 5
  dimensions a row is. This plugin always uses `DIMENSION_CONCEPT_ID_MAP` in
  `types.py`, which mirrors the concept ids `templates/fhir/EQ-5D-5LQuestionnaire.json`
  declares for each dimension (the same values `EQ5D5L-to-OMOP-Observation` writes to
  `observation_concept_id`) - there's no per-run config for this, so a deployment
  whose FHIR->OMOP pipeline used different concept ids than that template needs a
  code change to `DIMENSION_CONCEPT_ID_MAP`, not a config override.
- **Grouping**: the 5 rows belonging to one questionnaire administration share the
  same (restored) `observation_source_value`, i.e. the plain `qrId` -
  `calculate_index_rows()` groups on exactly this column. A group missing any of the
  5 dimensions is skipped (logged as a warning), not partially scored. Rows in a
  group that disagree on `person_id` are also skipped, as a data-integrity guard.
- **Answer value**: the 1-5 level is read from `value_source_value`. A purely numeric
  code (`"1"`-`"5"`) is used directly; anything else is looked up in
  `answer_code_level_map` (`{"no-problems": 1, ...}`), an optional config override -
  per the StructureMap's own doc comment, the code vocabulary isn't guaranteed
  numeric, and there's no safe default mapping for real answer codes. A code that's
  neither numeric nor found in the map is treated as missing for that dimension.
- **Linkage**: `person_id` and `visit_occurrence_id` are taken directly from the
  observation rows (no separate FHIR->OMOP key-map lookup needed, since
  `observation` already carries standard OMOP linkage columns).

If the real stage-2 output ends up differing from this contract (e.g.
`observation_source_value` isn't reliably restored to plain `qrId`, or answer codes
need per-dimension rather than global disambiguation), update
`calculate_index_rows()`/`read_eq5d5l_observations()` in `flow.py` accordingly -
this is what's confirmed today against `EQ-5D-5LObservationMap.json`, not something
this plugin can verify against the real pipeline's output on its own.

### Re-run / overwrite behavior

Re-running for the same `schema_name` (dataset) - including with a different
`country_code` - overwrites the previously stored index values rather than creating
duplicates: in a single transaction, all `measurement` rows in that schema tagged
with the resolved EQ-5D-5L `measurement_concept_id` are deleted, then the freshly
computed set is inserted. If a run computes zero valid rows (e.g. no responses
matched), existing rows are left untouched rather than being wiped with nothing to
replace them.

### FHIR lineage (fhir_omop_key_map)

After writing to `measurement`, this plugin also upserts one `fhir_omop_key_map` row
per computed index measurement - `(fhir_id=qrId, fhir_resource_type="QuestionnaireResponse",
omop_table_name="measurement", omop_id=<measurement_id>)` - into
`{database_code}_{schema_name}_fhir_mapping.fhir_omop_key_map`, mirroring how
`FhirMappingNode` (`plugins/flows/data_transformation/dataflow_ui_plugin/nodes.py`)
records lineage for the observation/measurement rows the upstream FHIR transform
writes directly.

This targets an `ON CONFLICT (fhir_id, fhir_resource_type, omop_table_name, omop_id)`
arbiter, wider than `FhirMappingNode`'s current `(fhir_id, fhir_resource_type)` unique
index - the narrower shape allows only one `omop_table_name` per `(qrId,
"QuestionnaireResponse")` pair, which can't hold this instrument's 5 `observation` +
2 `measurement` rows per `qrId` side by side. **This requires `fhir_omop_key_map`'s
unique index to already be widened to the 4-column shape - a prerequisite fix to
`FhirMappingNode`/its table DDL, tracked separately from this plugin.** Until that
fix lands, this write fails loudly (`no unique or exclusion constraint matching the
ON CONFLICT specification`) rather than silently upserting against the old, too-narrow
index.

### Parameters

```
{
  "options": {
    "config": {
      "schema_name": "cdmdefault",          # Required: OMOP CDM schema of the dataset being scored
      "database_code": "alpdev_pg",          # Required: CDM database code
      "omop_dataset_id": "alpdev_pg",          # Required: OMOP dataset id passed through to DBDao as cache_id
      "country_code": "AU",                   # Required: selects the EuroQol value set; single country per run
      "answer_code_level_map": null,          # Optional: non-numeric answer code -> level 1-5, e.g. {"no-problems": 1}
      "measurement_concept_id": null,         # Optional: override the "EQ-5D-5L index value" concept (default 42537273)
      "measurement_type_concept_id": 32862,   # Optional: defaults to the type concept from EQ-5D-5LQuestionnaire.json
      "dry_run": false                        # Optional: compute but don't write to measurement
    }
  }
}
```
