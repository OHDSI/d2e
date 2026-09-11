#!/usr/bin/env bash
# Environment provisioner for D2E flow plugins.
#
# Modes:
#   --artifact '<json>'   Provision one plugin from a plugin_artifact reference
#                         {path|url, sha256, name, version}. Fetches the tarball
#                         (TREX_STORAGE_URL/object/<path>, or the absolute url),
#                         verifies sha256, extracts, installs the pixi env from
#                         the committed lockfile, runs the plugin's setup tasks.
#   --dir <dir>           Provision an already-extracted plugin dir in place
#                         (used at image build for the baked release cache).
#   --watch               Poll the Prefect API for deployments carrying
#                         plugin_artifact refs and pre-warm any not yet cached.
#
# Provisioning is lockfile-only (pixi --frozen): no resolution at run time.
# A .d2e-env-ready marker (artifact sha256, or lockfile hash for --dir) makes
# every mode idempotent.
set -uo pipefail

cache_root="${D2E_FLOWS_CACHE:-/var/lib/d2e-flows}"

log() { echo "provision-envs: $*" >&2; }

# HANA driver goes INTO the default env (a separate pixi env would have its
# own empty R library — renv restores only into default). Same runtime-install
# semantics as install_hana_drivers.sh in the docker-pool images.
install_hana() { # $1 = plugin dir
  local manifest="$1/pyproject.toml"
  grep -q 'sqlalchemy-hana' "$manifest" || return 0
  pixi run --frozen --manifest-path "$manifest" \
    pip install --quiet "sqlalchemy-hana==${SQLALCHEMY_HANA_VERSION:-2.2.0}"
}

# A named environment need not be declared for every platform this image is
# built for: data_transformation's `ner` env is linux-64 only, because torch is
# pinned to an x86_64 wheel URL and nmslib-metabrainz ships no aarch64 wheel
# (see that plugin's pyproject.toml). Ask pixi which platforms the environment
# declares instead of assuming, so an unsupported env is skipped loudly rather
# than failing the whole provision.
env_declared_here() { # $1 = manifest, $2 = env name
  pixi info --json --manifest-path "$1" 2>/dev/null | python3 -c '
import json, platform, sys
mach = platform.machine()
here = {"x86_64": "linux-64", "aarch64": "linux-aarch64"}.get(mach, mach)
try:
    info = json.load(sys.stdin)
except ValueError:
    sys.exit(2)
for env in info.get("environments_info", []):
    if env.get("name") == sys.argv[1]:
        names = [p.get("name") for p in env.get("platforms", [])]
        sys.exit(0 if here in names else 1)
sys.exit(1)
' "$2"
}

install_named_env() { # $1 = manifest, $2 = env name
  env_declared_here "$1" "$2"
  case $? in
    0) pixi install --frozen -e "$2" --manifest-path "$1" || return 1 ;;
    1) log "env '$2' is not declared for $(uname -m); skipping" ;;
    # Undeterminable (pixi info failed, unreadable JSON): install anyway, so a
    # broken probe surfaces as the real error instead of a silently missing env.
    *) log "could not read platforms for env '$2'; installing anyway"
       pixi install --frozen -e "$2" --manifest-path "$1" || return 1 ;;
  esac
}

install_env() { # $1 = plugin dir
  local dir="$1" manifest="$1/pyproject.toml"
  [ -f "$manifest" ] || { log "no pyproject.toml in $dir"; return 1; }
  pixi install --frozen --manifest-path "$manifest" || return 1
  if [ "${INSTALL_SQLALCHEMY_HANA:-false}" = "true" ]; then
    install_hana "$dir" || return 1
  fi
  # Additional named environments some plugins declare (e.g. the NER stack's
  # self-contained env in data_transformation).
  if grep -qE '^ner *= \{' "$manifest"; then
    install_named_env "$manifest" ner || return 1
  fi
  # Cohort Discovery isolates Hutch Bunny in a Python 3.13 child env.
  if grep -qE '^bunny *= \{' "$manifest"; then
    install_named_env "$manifest" bunny || return 1
  fi
  if grep -q '^setup-assets' "$manifest"; then
    (cd "$dir" && pixi run --frozen --manifest-path "$manifest" setup-assets) || return 1
  fi
  if grep -q '^setup-r' "$manifest"; then
    (cd "$dir" && pixi run --frozen --manifest-path "$manifest" setup-r) || return 1
  fi
}

provision_dir() { # $1 = extracted plugin dir, $2 = marker value
  local dir="$1" stamp="$2"
  # Serialize per-dir: the background pre-warm and a flow run's own
  # provisioning check may race on the same directory.
  exec 9>"$dir/.d2e-provision.lock" || return 1
  flock 9 || return 1
  # The hana env is part of the provisioned state: an image baked without it
  # must re-provision (cheap: hardlinks + two pypi packages) when the worker
  # runs with INSTALL_SQLALCHEMY_HANA=true.
  if [ "${INSTALL_SQLALCHEMY_HANA:-false}" = "true" ] && grep -q 'sqlalchemy-hana' "$dir/pyproject.toml" 2>/dev/null; then
    stamp="$stamp:hana"
  fi
  local have
  have="$(cat "$dir/.d2e-env-ready" 2>/dev/null)"
  if [ "$have" = "$stamp" ]; then
    return 0
  fi
  # Driver present but the flag is now off: an unused sqlalchemy-hana in the
  # env is harmless, and there is nothing to undo — only setup tasks would
  # re-run.
  if [ "$have" = "$stamp:hana" ]; then
    return 0
  fi
  # Provisioned already and only the HANA driver is missing: pip-install it in
  # place. A full install_env would also re-run the plugin's setup-assets /
  # setup-r tasks, and renv restore needs a compiler toolchain that the image
  # build strips out of the baked envs (see slim-envs.sh).
  if [ "${stamp%:hana}" != "$stamp" ] && [ "$have" = "${stamp%:hana}" ]; then
    log "adding HANA driver to $dir"
    install_hana "$dir" || return 1
    printf '%s' "$stamp" > "$dir/.d2e-env-ready"
    log "ready: $dir"
    return 0
  fi
  log "provisioning $dir"
  install_env "$dir" || return 1
  printf '%s' "$stamp" > "$dir/.d2e-env-ready"
  log "ready: $dir"
}

provision_artifact() { # $1 = plugin_artifact json
  local json="$1"
  local name sha url
  name="$(printf '%s' "$json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])')" || return 1
  sha="$(printf '%s' "$json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["sha256"])')" || return 1
  url="$(printf '%s' "$json" | python3 -c '
import json, sys, os
a = json.load(sys.stdin)
if a.get("url"):
    print(a["url"])
else:
    base = os.environ.get("TREX_STORAGE_URL", "")
    if not base:
        raise SystemExit("no url in artifact and TREX_STORAGE_URL unset")
    print(base.rstrip("/") + "/object/" + a["path"].lstrip("/"))
')" || return 1

  local dest="$cache_root/$name/${sha:0:12}"
  local have
  have="$(cat "$dest/.d2e-env-ready" 2>/dev/null)"
  if [ "$have" = "$sha" ] || [ "$have" = "$sha:hana" ]; then
    # Present (possibly needing only the hana env top-up) — no re-download;
    # provision_dir handles the stamp delta.
    provision_dir "$dest" "$sha"
    return $?
  fi

  log "fetching $name@${sha:0:12} from $url"
  local tmp
  tmp="$(mktemp -d)" || return 1
  trap 'rm -rf "$tmp"' RETURN
  # Both headers on purpose: trex's authContext accepts service_role keys only
  # via `apikey`, while the embedded supabase-storage validates Authorization.
  local auth=()
  [ -n "${TREX_STORAGE_SERVICE_KEY:-}" ] && auth=(-H "apikey: $TREX_STORAGE_SERVICE_KEY" -H "Authorization: Bearer $TREX_STORAGE_SERVICE_KEY")
  curl -fLsS --retry 3 "${auth[@]}" -o "$tmp/plugin.tgz" "$url" || { log "download failed: $url"; return 1; }

  local got
  got="$(sha256sum "$tmp/plugin.tgz" | cut -d' ' -f1)"
  if [ "$got" != "$sha" ]; then
    log "sha256 mismatch for $name: expected $sha got $got"
    return 1
  fi

  rm -rf "$dest.partial" && mkdir -p "$dest.partial"
  tar -xzf "$tmp/plugin.tgz" -C "$dest.partial" --strip-components=1 || { log "extract failed"; return 1; }
  rm -rf "$dest" && mv "$dest.partial" "$dest"
  provision_dir "$dest" "$sha"
}

watch_loop() {
  local interval="${PROVISION_INTERVAL:-30}"
  log "watch: pre-warming from Prefect deployments every ${interval}s"
  while true; do
    python3 - <<'EOF' | while IFS= read -r artifact; do provision_artifact "$artifact"; done
import json, os, urllib.request
try:
    req = urllib.request.Request(
        os.environ["PREFECT_API_URL"] + "/deployments/filter",
        data=b"{}", headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        seen = set()
        for dep in json.load(r):
            a = (dep.get("job_variables") or {}).get("plugin_artifact")
            if a and a.get("sha256") and a["sha256"] not in seen:
                seen.add(a["sha256"])
                print(json.dumps(a))
except Exception as e:
    import sys
    print(f"provision-envs: deployment poll failed ({e})", file=sys.stderr)
EOF
    sleep "$interval"
  done
}

case "${1:-}" in
  --artifact) provision_artifact "$2" ;;
  --dir) provision_dir "$2" "${3:-$(cat "$2/pixi.lock" "$2/renv.lock" "$2/renv.aarch64.lock" 2>/dev/null | sha256sum | cut -d' ' -f1)}" ;;
  --watch) watch_loop ;;
  *) echo "usage: provision-envs.sh --artifact '<json>' | --dir <dir> | --watch" >&2; exit 2 ;;
esac
