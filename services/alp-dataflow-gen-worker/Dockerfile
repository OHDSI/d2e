# syntax=docker/dockerfile:1
# D2E dataflow process worker: generic base (pixi + prefect) with a baked warm
# cache of the release's bundled flow plugins. Flow envs are pixi projects
# provisioned from plugin artifacts (see run-flow.sh / provision-envs.sh);
# installing or updating a flow plugin never requires rebuilding this image.
#
# Build topology: the heavy stages (hades -> data_transformation -> base) form a
# FROM lineage ending in the final image, so each heavy env exists exactly once
# as native layers — no COPY --from duplication (stage snapshot + copied layer
# overran the CI runner's disk) — and the lineage serializes them naturally (two
# concurrent bundled-duckdb links swap-thrashed the 16GB runner into a 14h
# zombie). Ordered rarest-changing first, so the cheapest and most-churned group
# sits last: a base change rebuilds base alone, data_transformation rebuilds
# dt+base, hades rebuilds all three. The light python-only groups share one
# stage that builds in parallel alongside and is COPY'd in as a single tree.
# Per-stage granularity is what the registry cache keys on (mode=max).
#
# Size: pixi-cache hardlinks dedupe only within a stage, and overlayfs copies a
# file up before linking it, so nothing can be shared across stages after the
# fact. Two consequences shape the layout. The light groups share one stage so
# their common stack (python, arrow, duckdb, the JDK) is hardlinked once by
# slim-envs.sh --dedupe before it is COPY'd — BuildKit preserves hardlinks
# within a single COPY. And every provisioning RUN strips its own build-only
# content (slim-envs.sh --strip) in the same layer that created it, because a
# later RUN can only add whiteouts. The pixi cache lives on a cache mount
# instead of in a layer for the same reason: it is a build input, and at
# runtime provision-envs.sh refills it on demand for artifact-delivered
# plugins. Residual duplication is what the separate layers cannot share: 3.2GB
# across 477 inodes >=1MB, chiefly four JDKs, ten CPython runtimes, and arrow /
# duckdb / openblas once per env. Only building the whole tree in one RUN could
# collapse it, at the cost of the per-stage registry cache.

FROM ubuntu:24.04 AS staging
RUN apt-get update && apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*
COPY plugins/flows/build /src/plugins/flows/build
COPY plugins/flows/_shared_flow_utils /src/plugins/flows/_shared_flow_utils
COPY plugins/flows/__init__.py /src/plugins/flows/__init__.py
# stage_group <repo-group-dir> <npm-short-name>: same staged layout the npm
# tarball ships (stage_package.sh is the single source of truth), so baked and
# artifact-delivered plugins are byte-identical.
COPY <<'EOF' /usr/local/bin/stage_group
#!/bin/sh
set -eu
g="$1"; short="$2"
cd "/src/plugins/flows/$g"
bash ../build/stage_package.sh
dest="/staged/$short/baked"; mkdir -p "$dest"
cp -a flows _shared_flow_utils __init__.py pyproject.toml pixi.lock "$dest/"
for extra in renv.lock setup_assets.sh setup_r.sh rprofile_java.R; do
  [ -f "$extra" ] && cp "$extra" "$dest/" || true
done
EOF
RUN chmod +x /usr/local/bin/stage_group
COPY plugins/flows/cohort_discovery /src/plugins/flows/cohort_discovery
RUN stage_group cohort_discovery cohort-discovery-flow
COPY plugins/flows/loyalty_score /src/plugins/flows/loyalty_score
RUN stage_group loyalty_score loyalty-score-flow
COPY plugins/flows/i2b2 /src/plugins/flows/i2b2
RUN stage_group i2b2 i2b2-flow
COPY plugins/flows/data_management /src/plugins/flows/data_management
RUN stage_group data_management data-management-flow
COPY plugins/flows/search_embedding /src/plugins/flows/search_embedding
RUN stage_group search_embedding search-embedding-flow
COPY plugins/flows/base /src/plugins/flows/base
RUN stage_group base d2e-flows
COPY plugins/flows/hades /src/plugins/flows/hades
RUN stage_group hades hades-flow
COPY plugins/flows/data_transformation /src/plugins/flows/data_transformation
RUN stage_group data_transformation data-transformation-flow

# Stage each plugin's manifests, lockfiles, and provisioning scripts.
FROM scratch AS dependency-staging
# cohort-discovery-flow
COPY \
    plugins/flows/cohort_discovery/pyproject.toml \
    plugins/flows/cohort_discovery/pixi.lock \
    plugins/flows/cohort_discovery/setup_assets.sh \
    /staged/cohort-discovery-flow/baked/
# loyalty-score-flow
COPY \
    plugins/flows/loyalty_score/pyproject.toml \
    plugins/flows/loyalty_score/pixi.lock \
    /staged/loyalty-score-flow/baked/
# i2b2-flow
COPY \
    plugins/flows/i2b2/pyproject.toml \
    plugins/flows/i2b2/pixi.lock \
    plugins/flows/i2b2/setup_assets.sh \
    /staged/i2b2-flow/baked/
# data-management-flow
COPY \
    plugins/flows/data_management/pyproject.toml \
    plugins/flows/data_management/pixi.lock \
    plugins/flows/data_management/setup_assets.sh \
    /staged/data-management-flow/baked/
# search-embedding-flow
COPY \
    plugins/flows/search_embedding/pyproject.toml \
    plugins/flows/search_embedding/pixi.lock \
    plugins/flows/search_embedding/setup_assets.sh \
    /staged/search-embedding-flow/baked/
# hades-flow
COPY \
    plugins/flows/hades/pyproject.toml \
    plugins/flows/hades/pixi.lock \
    plugins/flows/hades/renv.lock \
    plugins/flows/hades/setup_r.sh \
    plugins/flows/hades/rprofile_java.R \
    /staged/hades-flow/baked/
# data-transformation-flow
COPY \
    plugins/flows/data_transformation/pyproject.toml \
    plugins/flows/data_transformation/pixi.lock \
    plugins/flows/data_transformation/renv.lock \
    plugins/flows/data_transformation/setup_assets.sh \
    plugins/flows/data_transformation/setup_r.sh \
    /staged/data-transformation-flow/baked/
# d2e-flows
COPY \
    plugins/flows/base/pyproject.toml \
    plugins/flows/base/pixi.lock \
    plugins/flows/base/renv.lock \
    plugins/flows/base/setup_assets.sh \
    plugins/flows/base/setup_r.sh \
    /staged/d2e-flows/baked/

# Shared base for the env-build stages and the final image: same apt set and
# pixi binary everywhere, so envs compile in exactly the runtime they run in.
FROM ubuntu:24.04 AS runtime-base
ARG PIXI_VERSION=0.72.2
ENV PIXI_CACHE_DIR=/opt/pixi/cache \
    D2E_FLOWS_CACHE=/var/lib/d2e-flows \
    PATH=/usr/local/bin:$PATH
# xvfb: required by white_rabbit_plugin (Java AWT headless display) and not
# available on conda-forge — the one flow-specific apt package.
# git: pixi/uv fetch direct git dependencies (data_transformation's ner env)
# during provisioning, before any env exists that could provide it.
# unzip: entrypoint.sh runtime-unpacks the BigQuery JDBC driver zip (the
# Simba driver is proprietary and cannot be baked into the image — see
# entrypoint.sh for the download step).
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl git python3 unzip xvfb \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL "https://github.com/prefix-dev/pixi/releases/download/v${PIXI_VERSION}/pixi-x86_64-unknown-linux-musl" \
        -o /usr/local/bin/pixi && chmod +x /usr/local/bin/pixi

FROM runtime-base AS provisioner
COPY services/alp-dataflow-gen-worker/provision-envs.sh /app/provision-envs.sh
COPY services/alp-dataflow-gen-worker/slim-envs.sh /app/slim-envs.sh
RUN chmod 755 /app/provision-envs.sh /app/slim-envs.sh

# The five python-only groups in one stage: provisioned, stripped and
# hardlink-deduped in a single RUN, so the stack they all carry (python, arrow,
# duckdb, and a JDK in two of them) is stored once rather than five times.
# Serialising them here costs little — they are download-bound, with no renv
# compile among them — and the stage still builds in parallel with the heavy
# lineage.
FROM provisioner AS env-light
COPY --from=dependency-staging /staged/cohort-discovery-flow /var/lib/d2e-flows/cohort-discovery-flow
COPY --from=dependency-staging /staged/loyalty-score-flow /var/lib/d2e-flows/loyalty-score-flow
COPY --from=dependency-staging /staged/i2b2-flow /var/lib/d2e-flows/i2b2-flow
COPY --from=dependency-staging /staged/data-management-flow /var/lib/d2e-flows/data-management-flow
COPY --from=dependency-staging /staged/search-embedding-flow /var/lib/d2e-flows/search-embedding-flow
RUN --mount=type=cache,target=/opt/pixi/cache,sharing=locked \
    set -e; \
    for group in cohort-discovery-flow loyalty-score-flow i2b2-flow \
                 data-management-flow search-embedding-flow; do \
      MAKEFLAGS="-j$(nproc)" /app/provision-envs.sh --dir "/var/lib/d2e-flows/$group/baked"; \
    done; \
    /app/slim-envs.sh --strip /var/lib/d2e-flows/*/baked; \
    /app/slim-envs.sh --dedupe /var/lib/d2e-flows

# Heavy-env lineage (each layer lands in the final image exactly once).
#
# Ordered rarest-changing first. A stage invalidates every stage below it, so the
# group that churns most belongs last: over the six months to 2026-08, plugins/
# flows/base saw 34 commits against data_transformation's 20 and hades' 15, while
# costing the least to rebuild (~13 min, against ~25 for data_transformation and
# ~51 for hades). Leading with base meant its every change also rebuilt both R
# envs - the whole ~89 minutes - for inputs that had not changed.
FROM provisioner AS env-hades
COPY --from=dependency-staging /staged/hades-flow /var/lib/d2e-flows/hades-flow
# Secret mount, not a build-arg: the token differs per CI run and an ARG would
# poison this stage's cache key (registry cache would never hit).
RUN --mount=type=secret,id=github_pat \
    --mount=type=cache,target=/opt/pixi/cache,sharing=locked \
    MAKEFLAGS="-j$(nproc)" GITHUB_PAT="$(cat /run/secrets/github_pat 2>/dev/null || true)" \
    /app/provision-envs.sh --dir /var/lib/d2e-flows/hades-flow/baked \
 && /app/slim-envs.sh --strip /var/lib/d2e-flows/hades-flow/baked

FROM env-hades AS env-data-transformation
COPY --from=dependency-staging /staged/data-transformation-flow /var/lib/d2e-flows/data-transformation-flow
RUN --mount=type=cache,target=/opt/pixi/cache,sharing=locked \
    MAKEFLAGS="-j$(nproc)" /app/provision-envs.sh --dir /var/lib/d2e-flows/data-transformation-flow/baked \
 && /app/slim-envs.sh --strip /var/lib/d2e-flows/data-transformation-flow/baked

FROM env-data-transformation AS env-base
COPY --from=dependency-staging /staged/d2e-flows /var/lib/d2e-flows/d2e-flows
RUN --mount=type=cache,target=/opt/pixi/cache,sharing=locked \
    MAKEFLAGS="-j$(nproc)" /app/provision-envs.sh --dir /var/lib/d2e-flows/d2e-flows/baked \
 && /app/slim-envs.sh --strip /var/lib/d2e-flows/d2e-flows/baked

FROM env-base
# The worker's own Prefect environment (also pixi-managed, lockfile-pinned).
COPY services/alp-dataflow-gen-worker/pyproject.toml services/alp-dataflow-gen-worker/pixi.lock /opt/worker/
RUN --mount=type=cache,target=/opt/pixi/cache,sharing=locked \
    pixi install --locked --manifest-path /opt/worker/pyproject.toml \
 && /app/slim-envs.sh --strip /opt/worker

COPY services/alp-dataflow-gen-worker/run-flow.sh /app/
COPY services/alp-dataflow-gen-worker/entrypoint.sh /entrypoint.sh
COPY plugins/flows/drivers /app/inst/drivers/
RUN chmod 755 /app/run-flow.sh /app/provision-envs.sh /entrypoint.sh

# Light groups as one deduped tree (baked warm cache: release plugins
# provisioned at build so fresh workers are instant and offline-capable;
# runtime artifact updates land beside them). One COPY, so the hardlinks
# slim-envs.sh made in env-light survive into this layer.
COPY --from=env-light /var/lib/d2e-flows /var/lib/d2e-flows

# Copy the rest of flow files to the respective plugin directories.
COPY --from=staging /staged/cohort-discovery-flow /var/lib/d2e-flows/cohort-discovery-flow
COPY --from=staging /staged/loyalty-score-flow /var/lib/d2e-flows/loyalty-score-flow
COPY --from=staging /staged/i2b2-flow /var/lib/d2e-flows/i2b2-flow
COPY --from=staging /staged/data-management-flow /var/lib/d2e-flows/data-management-flow
COPY --from=staging /staged/search-embedding-flow /var/lib/d2e-flows/search-embedding-flow
COPY --from=staging /staged/hades-flow /var/lib/d2e-flows/hades-flow
COPY --from=staging /staged/data-transformation-flow /var/lib/d2e-flows/data-transformation-flow
COPY --from=staging /staged/d2e-flows /var/lib/d2e-flows/d2e-flows

WORKDIR /app
ENTRYPOINT ["/entrypoint.sh"]