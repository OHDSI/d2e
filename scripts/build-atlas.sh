#!/usr/bin/env bash
# Build the Atlas plugin (and its in-repo Atlas3 sub-plugins) and stage the packed
# tarball into services/trex/plugin-artifacts/ so the trex image bakes it in via the
# existing plugin-artifacts extract step. Reproducible counterpart to the CI atlas job.
#
# The sub-plugins (network, notebook-plugin, strategus, studies) live in the
# trex-notebook submodule (plugins/atlas/trex-notebook) and are not published, so
# they are built from source here; plugins/atlas references them via file: deps.
# results-viewer is consumed prebuilt from GitHub Packages (@ohdsi/results-viewer)
# with its WebR/shinylive runtime included, so no R toolchain is needed here.
#
# Requires a GitHub token with read:packages (public @ohdsi/atlas3, @ohdsi/atlas-ui,
# @ohdsi/pythia-* still need auth on GitHub Packages). Reads GITHUB_TOKEN or, locally,
# falls back to `gh auth token`.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# The Atlas3 sub-plugins come from the trex-notebook submodule pinned here. It is a
# SECOND checkout of that repo: plugins/ui/libs/react-notebook stays on the older,
# single-package commit that the portal's webr-notebook builds against, while this one
# tracks the restructured monorepo. Keeping it out of plugins/ui also keeps its deps
# out of that bun workspace.
SUBMODULE="plugins/atlas/trex-notebook"
PLUGIN_DIR="$SUBMODULE/plugins"
ATLAS_DIR="plugins/atlas"
ARTIFACTS_DIR="services/trex/plugin-artifacts"

# Atlas3 sub-plugins built from the submodule (dir name under $PLUGIN_DIR).
SUBPLUGINS=(network notebook-plugin strategus studies)

: "${GITHUB_TOKEN:=$(gh auth token 2>/dev/null || true)}"
if [ -z "${GITHUB_TOKEN}" ]; then
  echo "[build-atlas] ERROR: GITHUB_TOKEN not set and 'gh auth token' unavailable." >&2
  echo "[build-atlas] A token with read:packages is required for @ohdsi GitHub Packages." >&2
  exit 1
fi
export GITHUB_TOKEN
export NODE_AUTH_TOKEN="$GITHUB_TOKEN"

echo "[build-atlas] Ensuring trex-notebook submodule is checked out..."
git submodule update --init --recursive "$SUBMODULE"

# notebook-plugin bundles source from the sibling notebook app, which imports `webr`;
# install the app's deps so that import resolves during the wrapper build.
if printf '%s\n' "${SUBPLUGINS[@]}" | grep -qx notebook-plugin; then
  echo "[build-atlas] Installing notebook app deps (provides webr for notebook-plugin)..."
  ( cd "$PLUGIN_DIR/notebook" && npm install )
fi

for p in "${SUBPLUGINS[@]}"; do
  echo "[build-atlas] Building sub-plugin: $p"
  # Prefer build:pkg (targets dist/); the plain build targets the sibyl dev host.
  ( cd "$PLUGIN_DIR/$p" && npm install \
    && npm run "$(node -e "process.stdout.write(require('./package.json').scripts['build:pkg'] ? 'build:pkg' : 'build')")" )
  if [ ! -f "$PLUGIN_DIR/$p/dist/index.system.js" ]; then
    echo "[build-atlas] ERROR: $p did not produce dist/index.system.js" >&2
    exit 1
  fi
done

DQ_DIR="$ATLAS_DIR/subplugins/data-quality"
echo "[build-atlas] Building sub-plugin: data-quality ($DQ_DIR)"
( cd "$DQ_DIR" && npm install && npm run build )
if [ ! -f "$DQ_DIR/dist/index.system.js" ]; then
  echo "[build-atlas] ERROR: data-quality did not produce dist/index.system.js" >&2
  exit 1
fi

echo "[build-atlas] Building the Atlas plugin (assembles Atlas3 + sub-plugin dists)..."
( cd "$ATLAS_DIR" && npm install && npm run build )

# Patient Analytics ships as an Atlas plugin too, but lives in the UI monorepo
# (not the trex-notebook submodule), so it is built and staged separately —
# after the atlas npm install, whose postinstall recreates resources/atlas.
# --workspaces=false keeps npm from resolving the whole bun-managed monorepo.
PA_DIR="plugins/ui/apps/vue-mri-ui-lib"
echo "[build-atlas] Building sub-plugin: patient-analytics ($PA_DIR)"
( cd "$PA_DIR" && npm install --workspaces=false --legacy-peer-deps && npm run build:atlas )
if [ ! -f "$PA_DIR/dist-atlas/index.system.js" ]; then
  echo "[build-atlas] ERROR: patient-analytics did not produce dist-atlas/index.system.js" >&2
  exit 1
fi
PA_DEST="$ATLAS_DIR/resources/atlas/plugins/patient-analytics"
rm -rf "$PA_DEST"
mkdir -p "$PA_DEST"
cp -r "$PA_DIR/dist-atlas/." "$PA_DEST/"
echo "[build-atlas] Staged patient-analytics at /atlas/plugins/patient-analytics"

echo "[build-atlas] Packing Atlas plugin into $ARTIFACTS_DIR ..."
mkdir -p "$ARTIFACTS_DIR"
rm -f "$ARTIFACTS_DIR"/data2evidence-atlas-*.tgz
# --silent quiets npm itself but not the prepack hook, whose verify-plugins
# output would otherwise end up in $TARBALL. The filename is the last line.
TARBALL="$(cd "$ATLAS_DIR" && npm pack --silent | tail -n 1)"
mv "$ATLAS_DIR/$TARBALL" "$ARTIFACTS_DIR/"
echo "[build-atlas] Staged $ARTIFACTS_DIR/$TARBALL"
echo "[build-atlas] Done. Build the trex image to bake it in (docker compose build trex)."
