#!/usr/bin/env python3
"""Derive a flow group's renv.aarch64.lock from its renv.lock.

The dataflow worker's arm64 image is built on amd64 runners under QEMU, where
compiling the R stack from source (renv's default) takes far longer than the
6h job limit. So on linux-aarch64 every CRAN package that conda-forge ships at
the locked version comes from a conda binary instead — pinned under
[tool.pixi.target.linux-aarch64.dependencies] in pyproject.toml — and renv
restores only the rest (OHDSI GitHub packages, packages conda-forge lacks).
Packages setup_r.sh installs from a binary itself are dropped too (duckdb,
from Posit Package Manager's aarch64 build — see hades/setup_r.sh). linux-64
is untouched: it keeps restoring the full renv.lock.

Run from plugins/flows after changing renv.lock or the pins:
    python3 build/sync_aarch64_renv_lock.py hades data_transformation base
    python3 build/sync_aarch64_renv_lock.py --check hades   # CI: fail on drift
"""
import json
import sys
import tomllib

# Installed by setup_r.sh from a Posit Package Manager binary on aarch64, not by renv.
PREBUILT = {"duckdb"}
# Pinned on aarch64 at a different version than renv.lock, on purpose:
# conda-forge's oldest r-arrow built for R 4.4 on linux-aarch64 is 22.0.0.
VERSION_DEVIATIONS = {"arrow"}


def conda_version(v):
    return v.replace("-", "_")


def derive(group):
    with open(f"{group}/pyproject.toml", "rb") as f:
        manifest = tomllib.load(f)
    pins = (
        manifest.get("tool", {}).get("pixi", {}).get("target", {})
        .get("linux-aarch64", {}).get("dependencies", {})
    )
    conda_r = {k[2:]: str(v).lstrip("=") for k, v in pins.items() if k.startswith("r-")}
    with open(f"{group}/renv.lock") as f:
        lock = json.load(f)

    errors = []
    for name, rec in lock["Packages"].items():
        pinned = conda_r.get(name.lower())
        if pinned is None or name in VERSION_DEVIATIONS:
            continue
        if pinned != conda_version(rec["Version"]):
            errors.append(f"{group}: r-{name.lower()} pinned {pinned}, renv.lock has {rec['Version']}")

    lock["Packages"] = {
        name: rec for name, rec in lock["Packages"].items()
        if name.lower() not in conda_r and name not in PREBUILT
    }
    return json.dumps(lock, indent=2, ensure_ascii=False) + "\n", errors


def main(argv):
    check = "--check" in argv
    groups = [a for a in argv if a != "--check"]
    if not groups:
        sys.exit(__doc__)
    failed = False
    for group in groups:
        text, errors = derive(group)
        for e in errors:
            print(f"error: {e}", file=sys.stderr)
        failed |= bool(errors)
        path = f"{group}/renv.aarch64.lock"
        if check:
            try:
                current = open(path).read()
            except FileNotFoundError:
                current = None
            if current != text:
                print(f"error: {path} is out of date; run build/sync_aarch64_renv_lock.py {group}", file=sys.stderr)
                failed = True
        else:
            with open(path, "w") as f:
                f.write(text)
            print(f"{path}: {len(json.loads(text)['Packages'])} packages left for renv")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
