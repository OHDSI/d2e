#!/usr/bin/env bash
# R package provisioning for the hades group: restores renv.lock (CRAN snapshot
# + OHDSI GitHub packages incl. the d2e forks) into the pixi env's own R
# library so rpy2 finds everything without configuration. Runs as the pixi
# `setup-r` task, cwd = plugin dir; compiles against the conda toolchain.
set -euo pipefail
# R CMD INSTALL runs --vanilla (no R profiles), so rJava's -Xmx512m default
# cannot be aligned with JAVA_TOOL_OPTIONS during package installs; -Xms1g
# would exceed it and abort JVM init at lazy-load (SqlRender). Runtime flow
# processes get the alignment via R_PROFILE_USER (rprofile_java.R).
unset JAVA_TOOL_OPTIONS
R CMD javareconf
Rscript -e 'if (!requireNamespace("renv", quietly = TRUE)) install.packages("renv", repos = "https://packagemanager.posit.co/cran/2025-09-22")'

# linux-aarch64: the CRAN packages conda-forge ships are already installed as
# conda binaries (pyproject.toml's linux-aarch64 target), so renv restores only
# the rest (renv.aarch64.lock, see build/sync_aarch64_renv_lock.py).
#
# duckdb is the exception: conda-forge has no linux-aarch64 r-duckdb, and its
# source build is the heaviest in the stack (~3h under the worker image's
# QEMU-emulated arm64 build). Posit Package Manager serves an aarch64 binary of
# the same CRAN snapshot. Unlike PPM binaries in general (RENV_CONFIG_PPM_ENABLED
# is off in pyproject.toml), it bundles DuckDB and links only libR and the C/C++
# runtime, so it loads into the conda R. Refuse anything but that binary: a
# source tarball here would silently turn into the multi-hour compile.
lockfile=renv.lock
if [ "$(uname -m)" = "aarch64" ]; then
  lockfile=renv.aarch64.lock
  snapshot=https://packagemanager.posit.co/cran/__linux__/noble/2025-09-22
  v=$(python3 -c 'import json; print(json.load(open("renv.lock"))["Packages"]["duckdb"]["Version"])')
  r_ver=$(Rscript -e 'cat(format(getRversion()))')
  tgz=$(mktemp --suffix=.tar.gz)
  curl -fsSL --retry 3 -A "R (${r_ver} aarch64-unknown-linux-gnu aarch64 linux-gnu)" \
    -o "$tgz" "${snapshot}/src/contrib/duckdb_${v}.tar.gz"
  if ! tar -xzOf "$tgz" duckdb/DESCRIPTION | grep -qE "^Built: R [0-9.]+; aarch64-" \
     || ! tar -xzOf "$tgz" duckdb/DESCRIPTION | grep -qx "Version: ${v}"; then
    echo "setup_r: ${snapshot} did not serve an aarch64 binary of duckdb ${v}" >&2
    exit 1
  fi
  R CMD INSTALL --library="$(Rscript -e 'cat(.Library)')" "$tgz"
  rm -f "$tgz"
fi
Rscript -e "renv::restore(lockfile = \"${lockfile}\", library = .Library, prompt = FALSE)"
