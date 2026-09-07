"""
EQ-5D-5L health-state -> utility index scoring.

Pure functions, no DB access - unit-testable in isolation. See external/value_sets/
for the bundled per-country EuroQol value sets and README.md for sourcing/verification
notes.
"""
import itertools
import json
import operator
import os
import re
from pathlib import Path
from typing import Dict

from .types import ValueSetDir, DIMENSION_ORDER

DIMENSION_CODES = {
    "mobility": "MO",
    "self_care": "SC",
    "usual_activities": "UA",
    "pain_discomfort": "PD",
    "anxiety_depression": "AD",
}

# Two ways a value set's formula can reach health_state_to_index():
#   - "main_effects_interaction": a hand-authored <name>.json declares an intercept,
#     a per-dimension-level main-effect decrement (level >= 2), and zero or more
#     "interaction" decrements triggered by the worst level reached across all 5
#     dimensions ("min_level": any dimension >= N; "exact_level": any dimension == N).
#     This is for value sets EuroQol only publishes as SPSS/SAS syntax, which nothing
#     here parses - a human transcribes the formula into this fixed shape once.
#   - "stata_simulation": a bundled <name>.txt STATA syntax file, executed directly
#     (see "STATA syntax parsing" below) rather than pattern-matched into a
#     predetermined formula shape - so it isn't limited to main-effects-plus-simple-
#     interaction models the way the JSON path is.
SUPPORTED_METHODS = {"main_effects_interaction", "stata_simulation"}


# --- STATA syntax parsing ---------------------------------------------------
# EuroQol publishes some value sets only as STATA syntax - see e.g.
# external/value_sets/Australia.txt. Earlier versions of this module tried to
# pattern-match specific known line shapes (a main-effect block, an "any dimension at
# level N" interaction, an intercept-minus-a-constant term) into a JSON-like
# coefficients/interactions dict. That broke on Canada's real syntax (Canada.txt),
# which needed things no fixed pattern anticipated: level 1 isn't always a 0
# coefficient, a per-dimension (not shared-across-dimensions) "at level 4 or 5"
# indicator for each of the 5 dimensions, a count of how many dimensions hit 4/5, and
# a quadratic correction term on that count added (not subtracted) into EQ_index.
# Every new country risked needing another special case.
#
# Instead, this is a tiny interpreter for the small STATA subset EuroQol's value-set
# syntax files actually use (arithmetic +-*/^, comparisons ==/!=/>=/<=/<>, boolean
# &/|, missing()/round(), and `gen`/`replace ... [if ...]` statements) - it runs the
# bundled .txt's actual statements, in file order, once per possible health state
# (5 dimensions x 5 levels = 3125 combinations - cheap to brute-force), and reads off
# whatever `EQ_index` each run ends up with. That sidesteps needing to recognize the
# formula's shape at all: as long as a country's real STATA syntax stays within this
# subset (no loops, macros, or dataset operations - none of EuroQol's value-set files
# use those), it's interpreted exactly as STATA would execute it, coefficients-model
# or not. It does NOT execute real Stata and cannot run arbitrary `.do` files -
# anything outside this subset (an unrecognized statement or function) raises
# ValueError rather than silently mis-scoring.
_MISSING = object()  # sentinel: STATA's "." (not-yet-assigned), distinct from 0


def _stata_truthy(value) -> bool:
    return value is not None and value != 0.0


_STATA_COMPARATORS = {
    "==": operator.eq, "!=": operator.ne,
    ">=": operator.ge, "<=": operator.le,
    "<": operator.lt, ">": operator.gt,
}

_STATA_TOKEN_RE = re.compile(r"""
    \s*(?:
        (?P<NUMBER>\d+\.\d+|\.\d+|\d+)
      | (?P<MISSING>\.)
      | (?P<IDENT>[A-Za-z_]\w*)
      | (?P<OP>==|!=|>=|<=|[()+\-*/^,&|<>])
    )
""", re.VERBOSE)


def _stata_tokenize(expr: str) -> list:
    tokens, pos = [], 0
    while pos < len(expr):
        m = _STATA_TOKEN_RE.match(expr, pos)
        if not m or m.end() == pos:
            if expr[pos:].strip() == "":
                break
            raise ValueError(f"Cannot tokenize STATA expression at {expr[pos:pos + 20]!r}")
        pos = m.end()
        if m.lastgroup:
            tokens.append((m.lastgroup, m.group(m.lastgroup)))
    return tokens


def _stata_call(name: str, arg_fns: list):
    name = name.lower()
    if name == "missing":
        if len(arg_fns) != 1:
            raise ValueError("missing() takes exactly 1 argument")
        (arg,) = arg_fns
        return lambda env: 1.0 if arg(env) is None else 0.0
    if name == "round":
        if len(arg_fns) != 2:
            raise ValueError("round() takes exactly 2 arguments")
        x_fn, y_fn = arg_fns
        def _round(env):
            x, y = x_fn(env), y_fn(env)
            return round(x / y) * y
        return _round
    raise ValueError(f"Unsupported STATA function '{name}()' - only missing()/round() are understood")


class _StataExprParser:
    """Recursive-descent compiler: STATA expression text -> a function env -> value."""

    def __init__(self, tokens: list, text: str):
        self.tokens = tokens
        self.pos = 0
        self.text = text

    def _peek(self):
        return self.tokens[self.pos] if self.pos < len(self.tokens) else (None, None)

    def _advance(self):
        tok = self._peek()
        self.pos += 1
        return tok

    def _expect(self, value):
        kind, val = self._advance()
        if val != value:
            raise ValueError(f"Expected {value!r} in STATA expression {self.text!r}, got {val!r}")

    def parse(self):
        result = self.parse_or()
        if self.pos != len(self.tokens):
            raise ValueError(f"Unexpected trailing content in STATA expression {self.text!r}")
        return result

    def parse_or(self):
        left = self.parse_and()
        while self._peek()[1] == "|":
            self._advance()
            right = self.parse_and()
            l, r = left, right
            left = lambda env, l=l, r=r: 1.0 if (_stata_truthy(l(env)) or _stata_truthy(r(env))) else 0.0
        return left

    def parse_and(self):
        left = self.parse_cmp()
        while self._peek()[1] == "&":
            self._advance()
            right = self.parse_cmp()
            l, r = left, right
            left = lambda env, l=l, r=r: 1.0 if (_stata_truthy(l(env)) and _stata_truthy(r(env))) else 0.0
        return left

    def parse_cmp(self):
        left = self.parse_add()
        if self._peek()[1] in _STATA_COMPARATORS:
            op = self._advance()[1]
            right = self.parse_add()
            l, r, fn = left, right, _STATA_COMPARATORS[op]
            def _cmp(env, l=l, r=r, fn=fn):
                lv, rv = l(env), r(env)
                if lv is None or rv is None:
                    return 0.0
                return 1.0 if fn(lv, rv) else 0.0
            return _cmp
        return left

    def parse_add(self):
        left = self.parse_mul()
        while self._peek()[1] in ("+", "-"):
            op = self._advance()[1]
            right = self.parse_mul()
            l, r = left, right
            left = (lambda env, l=l, r=r: l(env) + r(env)) if op == "+" else \
                   (lambda env, l=l, r=r: l(env) - r(env))
        return left

    def parse_mul(self):
        left = self.parse_unary()
        while self._peek()[1] in ("*", "/"):
            op = self._advance()[1]
            right = self.parse_unary()
            l, r = left, right
            left = (lambda env, l=l, r=r: l(env) * r(env)) if op == "*" else \
                   (lambda env, l=l, r=r: l(env) / r(env))
        return left

    def parse_unary(self):
        if self._peek()[1] == "-":
            self._advance()
            operand = self.parse_unary()
            return lambda env, operand=operand: -operand(env)
        return self.parse_pow()

    def parse_pow(self):
        base = self.parse_atom()
        if self._peek()[1] == "^":
            self._advance()
            exponent = self.parse_unary()
            b, e = base, exponent
            return lambda env, b=b, e=e: b(env) ** e(env)
        return base

    def parse_atom(self):
        kind, val = self._advance()
        if kind == "NUMBER":
            v = float(val)
            return lambda env, v=v: v
        if kind == "MISSING":
            return lambda env: None
        if kind == "IDENT":
            name = val
            if self._peek()[1] == "(":
                self._advance()
                args = []
                if self._peek()[1] != ")":
                    args.append(self.parse_or())
                    while self._peek()[1] == ",":
                        self._advance()
                        args.append(self.parse_or())
                self._expect(")")
                return _stata_call(name, args)
            def _lookup(env, name=name):
                if name not in env:
                    raise ValueError(f"STATA syntax references undefined variable '{name}'")
                v = env[name]
                return None if v is _MISSING else v
            return _lookup
        if val == "(":
            inner = self.parse_or()
            self._expect(")")
            return inner
        raise ValueError(f"Unexpected token {val!r} in STATA expression {self.text!r}")


def _compile_stata_expr(text: str):
    return _StataExprParser(_stata_tokenize(text), text).parse()


_STATA_GEN_RE = re.compile(r"^gen(?:erate)?\s+(?P<var>[A-Za-z_]\w*)\s*=\s*(?P<expr>.+)$", re.IGNORECASE)
_STATA_REPLACE_RE = re.compile(r"^replace\s+(?P<var>[A-Za-z_]\w*)\s*=\s*(?P<rest>.+)$", re.IGNORECASE)
_STATA_IF_SPLIT_RE = re.compile(r"\bif\b", re.IGNORECASE)
_STATA_DISUT_VAR_RE = re.compile(
    r"replace\s+disut_(?P<suffix>mo|sc|ua|pd|ad)\s*=\s*[\d.]+\s+if\s+missing\(disut_(?P=suffix)\)"
    r"\s*&\s*(?P<var>[A-Za-z_]\w*)\s*==",
    re.IGNORECASE,
)


def _parse_stata_source_comment(text: str) -> str:
    lines = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line.startswith("*"):
            continue
        line = line.strip("*").strip().rstrip(";").strip()
        if line:
            lines.append(line)
    return " ".join(lines)


def _compile_stata_statements(text: str) -> list:
    """
    Compile every non-comment `gen`/`replace [... if ...]` line into
    ("gen", var, expr_fn) or ("replace", var, expr_fn, cond_fn_or_None), in file
    order. Anything else non-blank (an unrecognized statement) raises ValueError -
    this interpreter understands exactly this narrow statement shape, not general
    STATA/`.do`-file syntax (no macros, loops, line continuations, or `#delimit ;`).
    """
    statements = []
    for raw in text.splitlines():
        line = raw.strip().rstrip(";").strip()
        if not line or line.startswith("*"):
            continue
        m = _STATA_GEN_RE.match(line)
        if m:
            statements.append(("gen", m.group("var"), _compile_stata_expr(m.group("expr").strip())))
            continue
        m = _STATA_REPLACE_RE.match(line)
        if m:
            parts = _STATA_IF_SPLIT_RE.split(m.group("rest"), maxsplit=1)
            expr_fn = _compile_stata_expr(parts[0].strip())
            cond_fn = _compile_stata_expr(parts[1].strip()) if len(parts) == 2 else None
            statements.append(("replace", m.group("var"), expr_fn, cond_fn))
            continue
        raise ValueError(f"Unrecognized STATA statement (not a gen/replace line): {line!r}")
    return statements


def _run_stata_statements(statements: list, env: dict) -> None:
    for stmt in statements:
        if stmt[0] == "gen":
            _, var, expr_fn = stmt
            value = expr_fn(env)
            env[var] = _MISSING if value is None else value
        else:
            _, var, expr_fn, cond_fn = stmt
            if cond_fn is None or _stata_truthy(cond_fn(env)):
                value = expr_fn(env)
                env[var] = _MISSING if value is None else value


def _discover_stata_dimension_vars(text: str) -> Dict[str, str]:
    """{DIM code ("MO"/"SC"/"UA"/"PD"/"AD") -> the STATA variable name a country's
    syntax uses for that dimension (e.g. "mobility"), found from the main-effect
    lines' own `& <var> ==` clause - so the interpreter doesn't need to assume any
    particular variable naming, only the disut_<code> convention EuroQol's templates
    use for the per-dimension disutility accumulators."""
    dim_vars = {}
    for m in _STATA_DISUT_VAR_RE.finditer(text):
        dim_vars.setdefault(m.group("suffix").upper(), m.group("var"))
    missing = set(DIMENSION_CODES.values()) - dim_vars.keys()
    if missing:
        raise ValueError(
            f"Could not find main-effect 'replace disut_<code> = ... if missing(...) & "
            f"<var> == <level>' lines for dimension code(s) {sorted(missing)} in STATA syntax"
        )
    return dim_vars


def parse_stata_value_set(text: str) -> dict:
    """
    Interpret EuroQol's published STATA syntax for an EQ-5D-5L value set by actually
    running it - once per one of the 3125 possible 5-dimension/5-level health states -
    and recording each run's final EQ_index. Returns {source_comment, index_table,
    range_low, range_high}; index_table maps every "MMSCUAPDAD"-style 5-digit health
    state string to its computed index value, so health_state_to_index() becomes a
    plain lookup for a STATA-derived value set, regardless of what formula shape
    produced those numbers.
    """
    dim_vars = _discover_stata_dimension_vars(text)
    statements = _compile_stata_statements(text)
    stata_var_for_dimension = {dim: dim_vars[DIMENSION_CODES[dim]] for dim in DIMENSION_ORDER}

    index_table = {}
    for levels in itertools.product(range(1, 6), repeat=len(DIMENSION_ORDER)):
        env = {stata_var_for_dimension[dim]: float(level) for dim, level in zip(DIMENSION_ORDER, levels)}
        _run_stata_statements(statements, env)
        eq_index = env.get("EQ_index", _MISSING)
        if eq_index is _MISSING:
            health_state = "".join(str(l) for l in levels)
            raise ValueError(f"STATA syntax left EQ_index unassigned for health_state='{health_state}'")
        index_table["".join(str(l) for l in levels)] = round(float(eq_index), 3)

    return {
        "source_comment": _parse_stata_source_comment(text),
        "index_table": index_table,
        "range_low": min(index_table.values()),
        "range_high": max(index_table.values()),
    }


# --- Value set loading -------------------------------------------------------

# ISO 3166-1 alpha-2 country_code -> value_set file stem. EuroQol's own downloads are
# named after the country ("Australia.txt"), not its ISO code, but the plugin's public
# `country_code` contract (package.json's dropdown enum, types.py, OMOP/FHIR
# convention elsewhere in this codebase) is ISO codes - this is the one place that
# naming mismatch is resolved, so callers/tests keep passing "AU" rather than needing
# to know EuroQol's file-naming choice.
COUNTRY_CODE_TO_FILE_STEM = {
    "AU": "Australia",
    "BE": "Belgium",
    "CA": "Canada",
    "CN": "China",
    "DK": "Denmark",
    "EG": "Egypt",
    "ET": "Ethiopia",
    "FR": "France",
    "DE": "Germany",
    "GH": "Ghana",
}
_FILE_STEM_TO_COUNTRY_CODE = {stem.lower(): code for code, stem in COUNTRY_CODE_TO_FILE_STEM.items()}


def _value_set_dir() -> Path:
    return Path(ValueSetDir)


def _file_stem(country_code: str) -> str:
    return COUNTRY_CODE_TO_FILE_STEM.get(country_code.upper(), country_code.upper())


def list_supported_countries() -> list:
    value_set_dir = _value_set_dir()
    stems = {p.stem for p in value_set_dir.glob("*.json")} | {p.stem for p in value_set_dir.glob("*.txt")}
    codes = {_FILE_STEM_TO_COUNTRY_CODE.get(stem.lower(), stem.upper()) for stem in stems}
    return sorted(codes)


def load_value_set(country_code: str) -> dict:
    """
    Load the bundled EuroQol value set for `country_code` (an ISO 3166-1 alpha-2
    code, e.g. "AU") - the only input the caller needs to supply, resolved to a
    bundled file via COUNTRY_CODE_TO_FILE_STEM. A `<name>.json` file (hand-authored,
    for value sets only published as SPSS/SAS syntax) takes precedence; otherwise a
    bundled `<name>.txt` STATA syntax file is parsed on the fly (see
    parse_stata_value_set()).
    """
    value_set_dir = _value_set_dir()
    stem = _file_stem(country_code)
    json_path = value_set_dir / f"{stem}.json"
    txt_path = value_set_dir / f"{stem}.txt"

    if os.path.exists(json_path):
        with open(json_path) as f:
            value_set = json.load(f)
    elif os.path.exists(txt_path):
        with open(txt_path) as f:
            parsed = parse_stata_value_set(f.read())
        value_set = {
            "country_code": country_code.upper(),
            "method": "stata_simulation",
            "placeholder": False,
            "source": f"Parsed at load time from bundled STATA syntax ({txt_path.name}): {parsed['source_comment']}",
            "index_table": parsed["index_table"],
            "range_low": parsed["range_low"],
            "range_high": parsed["range_high"],
        }
    else:
        supported = list_supported_countries()
        raise ValueError(
            f"No EuroQol value set bundled for country_code='{country_code}'. "
            f"Supported: {supported}"
        )

    method = value_set.get("method")
    if method not in SUPPORTED_METHODS:
        raise ValueError(
            f"Value set for country_code='{country_code}' declares method='{method}', "
            f"which scoring.py does not implement. Supported methods: {sorted(SUPPORTED_METHODS)}"
        )
    if value_set.get("placeholder"):
        import logging
        logging.getLogger(__name__).warning(
            f"Value set for country_code='{country_code}' is placeholder/example data, "
            f"not verified EuroQol coefficients - do not use for real scoring until replaced."
        )
    return value_set


def assemble_health_state(dimension_answers: Dict[str, int]) -> str:
    """
    Join the 5 dimension levels (1-5 each) into the 5-digit EQ-5D-5L health state
    code, e.g. {"mobility": 1, "self_care": 1, "usual_activities": 2,
    "pain_discomfort": 2, "anxiety_depression": 3} -> "11223".
    """
    missing = [d for d in DIMENSION_ORDER if d not in dimension_answers]
    if missing:
        raise ValueError(f"Missing dimension answers: {missing}")
    levels = []
    for dim in DIMENSION_ORDER:
        level = int(dimension_answers[dim])
        if level not in (1, 2, 3, 4, 5):
            raise ValueError(f"Dimension '{dim}' has invalid level {level}; expected 1-5")
        levels.append(str(level))
    return "".join(levels)


def _interaction_applies(trigger: dict, levels: list) -> bool:
    kind = trigger["trigger"]
    level = trigger["level"]
    if kind == "min_level":
        return any(l >= level for l in levels)
    if kind == "exact_level":
        return any(l == level for l in levels)
    raise ValueError(f"Unknown interaction trigger '{kind}'")


def health_state_to_index(health_state: str, value_set: dict) -> float:
    """
    For a STATA-derived value_set (method="stata_simulation"), a direct lookup in its
    precomputed index_table (see parse_stata_value_set()). For a hand-authored
    method="main_effects_interaction" value_set:
      index = intercept
              - sum(main-effect coefficient for each dimension at its level, for level >= 2)
              - sum(interaction coefficient for each interaction whose trigger condition is met)
    """
    if len(health_state) != 5 or not health_state.isdigit():
        raise ValueError(f"health_state must be a 5-digit string, got '{health_state}'")

    index_table = value_set.get("index_table")
    if index_table is not None:
        if health_state not in index_table:
            raise ValueError(f"health_state='{health_state}' not found in value set's index_table")
        return index_table[health_state]

    coefficients = value_set["coefficients"]
    intercept = value_set.get("intercept", 1.0)
    levels = [int(c) for c in health_state]
    index = intercept

    for dim, level in zip(DIMENSION_ORDER, levels):
        if level >= 2:
            key = f"{DIMENSION_CODES[dim]}{level}"
            index -= coefficients.get(key, 0.0)

    for interaction in value_set.get("interactions", []):
        if _interaction_applies(interaction, levels):
            index -= interaction["coefficient"]

    return round(index, 3)
