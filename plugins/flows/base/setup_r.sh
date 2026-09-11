#!/usr/bin/env bash
# R package provisioning for the base group: restores renv.lock (CRAN snapshot
# + OHDSI GitHub packages incl. the d2e forks) into the pixi env's own R
# library so rpy2 finds everything without configuration. Runs as the pixi
# `setup-r` task, cwd = plugin dir; compiles against the conda toolchain.
set -euo pipefail
R CMD javareconf
Rscript -e 'if (!requireNamespace("renv", quietly = TRUE)) install.packages("renv", repos = "https://packagemanager.posit.co/cran/2025-09-22")'
# linux-aarch64: the CRAN packages conda-forge ships are already installed as
# conda binaries (pyproject.toml's linux-aarch64 target); renv restores only
# the rest (renv.aarch64.lock, see build/sync_aarch64_renv_lock.py).
lockfile=renv.lock
[ "$(uname -m)" = "aarch64" ] && lockfile=renv.aarch64.lock
Rscript -e "renv::restore(lockfile = \"${lockfile}\", library = .Library, prompt = FALSE)"
