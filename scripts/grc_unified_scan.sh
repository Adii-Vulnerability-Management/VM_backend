#!/usr/bin/env bash
# grc_unified_scan.sh
# Unified open-source scanner orchestrator for authorized cloud, IaC, repository,
# host, and Kubernetes assessments.

set -Eeuo pipefail
umask 077

export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
STARTED_EPOCH="$(date +%s)"

# Safe defaults: no cloud or host-root scan occurs unless explicitly requested.
OUTPUT_DIR="/tmp/grc-scan-output/${RUN_ID}"
CLOUD="none"                         # aws | azure | gcp | all | none
TOOLS="prowler,scoutsuite,checkov,trivy,os"
FAIL_ON_SCANNER_ERROR="false"
ALLOW_INSECURE_UPLOAD="false"
KEEP_ARCHIVE="false"

# Cloud parameters.
AWS_PROFILE=""
AWS_REGIONS=""
AZURE_AUTH="cli"                     # cli | sp-env | browser | managed-identity
AZURE_TENANT_ID=""
AZURE_SUBSCRIPTIONS=""
GCP_CREDENTIALS_FILE=""
GCP_PROJECT_IDS=""

# Kubernetes, IaC, repository, and host parameters.
KUBECONFIG_FILE=""
K8S_CONTEXT=""
K8S_NAMESPACES=""
IAC_PATH="./infra"
REPO_PATH="."
HOST_PATH=""                         # Disabled by default. Pass --host-path / explicitly.
CHECKOV_FRAMEWORK="all"
TRIVY_SEVERITY="UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL"
TRIVY_SKIP_DIRS="/proc,/sys,/dev,/run,/tmp,/var/lib/docker,/var/lib/containerd"

# Optional GRC import endpoint.
GRC_UPLOAD_URL=""
GRC_API_TOKEN_ENV="GRC_API_TOKEN"

# Command overrides. Values are parsed with Python shlex and executed as arrays;
# they are never passed to bash -c.
SCOUT_CMD="${SCOUT_CMD:-scout}"
PROWLER_CMD="${PROWLER_CMD:-prowler}"
CHECKOV_CMD="${CHECKOV_CMD:-checkov}"
TRIVY_CMD="${TRIVY_CMD:-trivy}"

# Tunables.
: "${GRC_CLOUD_SCAN_TIMEOUT:=3600}"
: "${GRC_CHECKOV_TIMEOUT:=1800}"
: "${GRC_TRIVY_TIMEOUT:=1800}"
: "${GRC_OS_TIMEOUT:=600}"
: "${GRC_UPLOAD_TIMEOUT:=300}"
: "${GRC_COMMAND_KILL_AFTER:=15}"
: "${GRC_MAX_LOG_BYTES:=10485760}"
: "${GRC_TRIVY_CACHE_DIR:=/tmp/grc-trivy-cache}"

STATUS_DIR=""
EVENTS_FILE=""
EVENTS_LOCK_FILE=""
EXECUTION_SUMMARY_FILE=""
ERRORS_FILE=""
MANIFEST_FILE=""
SUMMARY_FILE=""
UPLOAD_RESPONSE_FILE=""
UPLOAD_STATUS_FILE=""
ARCHIVE_FILE=""

LAST_RC=0
LAST_DURATION_MS=0
LAST_STARTED_AT=""
LAST_COMPLETED_AT=""

PROWLER_BASE=()
SCOUT_BASE=()
CHECKOV_BASE=()
TRIVY_BASE=()
SELECTED_TOOLS=()
SPLIT_ARR=()

usage() {
  cat <<USAGE
Usage:
  ./grc_unified_scan.sh [options]

Core options:
  --cloud aws|azure|gcp|all|none       Cloud provider. Default: none
  --tools list                         Comma-separated: prowler,scoutsuite,checkov,trivy,os
  --output-dir path                    Output directory. Default: /tmp/grc-scan-output/<run-id>
  --fail-on-scanner-error              Exit non-zero if any selected job fails, times out, or is partial
  --keep-archive                       Keep the generated upload archive after the run

AWS:
  --aws-profile profile
  --aws-regions "r1,r2"

Azure:
  --azure-auth cli|sp-env|browser|managed-identity
  --azure-tenant-id tenant-id
  --azure-subscriptions "id1,id2"

GCP:
  --gcp-credentials-file path.json
  --gcp-project-ids "project1,project2"

Kubernetes with Prowler:
  --kubeconfig path
  --k8s-context context
  --k8s-namespaces "ns1,ns2"

IaC, repository, and host:
  --iac-path path                      Default: ./infra
  --repo-path path                     Default: .
  --host-path path                     Disabled by default; pass / explicitly for host rootfs
  --checkov-framework framework
  --trivy-severity list

Optional GRC upload:
  --grc-upload-url https://...          Multipart upload endpoint
  --grc-api-token-env ENV_NAME         Bearer-token environment variable
  --allow-insecure-upload              Permit HTTP upload (local/test only)

Command overrides:
  --scout-cmd "command"
  --prowler-cmd "command"
  --checkov-cmd "command"
  --trivy-cmd "command"

Environment tunables:
  GRC_CLOUD_SCAN_TIMEOUT               Default: 3600 seconds
  GRC_CHECKOV_TIMEOUT                  Default: 1800 seconds
  GRC_TRIVY_TIMEOUT                    Default: 1800 seconds
  GRC_OS_TIMEOUT                       Default: 600 seconds
  GRC_UPLOAD_TIMEOUT                   Default: 300 seconds
  GRC_MAX_LOG_BYTES                    Default: 10485760 bytes
  GRC_TRIVY_CACHE_DIR                  Default: /tmp/grc-trivy-cache

Examples:
  ./grc_unified_scan.sh --cloud aws --tools prowler,scoutsuite \
    --aws-profile prod-readonly --aws-regions "ap-south-1,us-east-1"

  ./grc_unified_scan.sh --cloud none --tools checkov,trivy,os \
    --iac-path ./terraform --repo-path . --output-dir /tmp/grc-results

  ./grc_unified_scan.sh --cloud none --tools trivy,os \
    --repo-path . --host-path / --output-dir /var/tmp/grc-results
USAGE
}

log()  { printf '\n[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
warn() { printf '\n[%s] WARN: %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
err()  { printf '\n[%s] ERROR: %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }

now_ms() {
  local value
  value="$(date +%s%3N 2>/dev/null || true)"
  if [[ "$value" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$value"
  else
    printf '%s\n' "$(( $(date +%s) * 1000 ))"
  fi
}

json_bool() {
  [[ "${1:-false}" == "true" ]] && printf 'true\n' || printf 'false\n'
}

sanitize_id() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_.-]+/_/g; s/^_+//; s/_+$//'
}

relative_to_output() {
  python3 - "$OUTPUT_DIR" "$1" <<'PY'
import os, sys
root, path = map(os.path.abspath, sys.argv[1:])
try:
    rel = os.path.relpath(path, root)
except ValueError:
    rel = path
print(rel if not rel.startswith('../') else path)
PY
}

path_is_within() {
  python3 - "$1" "$2" <<'PY'
import os, sys
child, parent = map(os.path.abspath, sys.argv[1:])
try:
    print('true' if os.path.commonpath([child, parent]) == parent else 'false')
except ValueError:
    print('false')
PY
}

split_to_array() {
  local raw="${1:-}"
  raw="${raw//,/ }"
  read -r -a SPLIT_ARR <<< "$raw"
}

normalize_tools() {
  local raw="${TOOLS,,}"
  raw="${raw//[[:space:]]/}"
  IFS=',' read -r -a requested <<< "$raw"
  SELECTED_TOOLS=()
  local item existing duplicate

  for item in "${requested[@]}"; do
    [[ -z "$item" ]] && continue
    case "$item" in
      prowler|scoutsuite|checkov|trivy|os) ;;
      *) err "Invalid tool in --tools: $item"; exit 2 ;;
    esac

    duplicate="false"
    for existing in "${SELECTED_TOOLS[@]:-}"; do
      [[ "$existing" == "$item" ]] && duplicate="true" && break
    done
    [[ "$duplicate" == "false" ]] && SELECTED_TOOLS+=("$item")
  done

  if [[ "${#SELECTED_TOOLS[@]}" -eq 0 ]]; then
    err "--tools must contain at least one supported tool"
    exit 2
  fi

  TOOLS="$(IFS=,; printf '%s' "${SELECTED_TOOLS[*]}")"
}

has_tool_enabled() {
  local wanted="$1" item
  for item in "${SELECTED_TOOLS[@]}"; do
    [[ "$item" == "$wanted" ]] && return 0
  done
  return 1
}

parse_command_string() {
  local raw="$1" destination="$2" parsed_json
  local -a parsed=()

  [[ "$raw" != *$'\n'* && "$raw" != *$'\r'* ]] || {
    err "Command overrides cannot contain newline characters"
    exit 2
  }

  if ! parsed_json="$(python3 - "$raw" <<'PY'
import json, shlex, sys
try:
    parts = shlex.split(sys.argv[1])
except ValueError as exc:
    print(str(exc), file=sys.stderr)
    raise SystemExit(2)
if not parts:
    raise SystemExit(2)
print(json.dumps(parts))
PY
  )"; then
    err "Invalid command override: $raw"
    exit 2
  fi

  mapfile -t parsed < <(jq -r '.[]' <<< "$parsed_json")
  if [[ "${#parsed[@]}" -eq 0 ]]; then
    err "Command override is empty"
    exit 2
  fi

  local -n destination_ref="$destination"
  destination_ref=("${parsed[@]}")
}

command_available() {
  local executable="$1"
  if [[ "$executable" == */* ]]; then
    [[ -x "$executable" ]]
  else
    command -v "$executable" >/dev/null 2>&1
  fi
}

get_tool_version() {
  local tool="$1"; shift
  local -a command=("$@") version_command=()
  local result="unknown"

  case "$tool" in
    prowler) version_command=("${command[@]}" --version) ;;
    scoutsuite) version_command=("${command[@]}" --version) ;;
    checkov) version_command=("${command[@]}" --version) ;;
    trivy) version_command=("${command[@]}" --version) ;;
    native_os) printf 'system-package-manager\n'; return 0 ;;
    upload) printf 'curl\n'; return 0 ;;
    *) printf 'unknown\n'; return 0 ;;
  esac

  set +e
  result="$(timeout 10 "${version_command[@]}" 2>/dev/null | head -n 1)"
  set -e
  printf '%s\n' "${result:-unknown}"
}

truncate_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  local size
  size="$(stat -c '%s' "$file" 2>/dev/null || wc -c < "$file")"
  if [[ "$size" -gt "$GRC_MAX_LOG_BYTES" ]]; then
    local tmp="${file}.tail"
    {
      printf '%s\n' "[log truncated; last ${GRC_MAX_LOG_BYTES} bytes retained]"
      tail -c "$GRC_MAX_LOG_BYTES" "$file"
    } > "$tmp"
    mv -f "$tmp" "$file"
  fi
}

append_event() {
  local payload="$1"
  if command -v flock >/dev/null 2>&1; then
    (
      flock -x 200
      printf '%s\n' "$payload" >> "$EVENTS_FILE"
    ) 200>"$EVENTS_LOCK_FILE"
  else
    printf '%s\n' "$payload" >> "$EVENTS_FILE"
  fi
}

event() {
  local step="$1" status="$2" progress="$3" message="${4:-}"
  local payload
  payload="$(jq -cn \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg step "$step" \
    --arg status "$status" \
    --argjson progress "$progress" \
    --arg message "$message" \
    '{timestamp:$timestamp,step:$step,status:$status,progress:$progress,message:$message}')"
  append_event "$payload"
  printf '[%s%%] %s - %s%s\n' "$progress" "$step" "$status" "${message:+ - $message}"
}

execute_command() {
  local name="$1" log_file="$2" timeout_seconds="$3"; shift 3
  local -a command=("$@")
  local start_ms end_ms

  mkdir -p "$(dirname "$log_file")"
  : > "$log_file"
  printf 'Job: %s\nExecutable: %s\nStarted: %s\n\n' \
    "$name" "${command[0]}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$log_file"

  LAST_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  start_ms="$(now_ms)"
  log "Running $name"

  set +e
  timeout --signal=TERM --kill-after="${GRC_COMMAND_KILL_AFTER}s" \
    "$timeout_seconds" "${command[@]}" >> "$log_file" 2>&1
  LAST_RC=$?
  set -e

  end_ms="$(now_ms)"
  LAST_DURATION_MS=$(( end_ms - start_ms ))
  LAST_COMPLETED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  truncate_file "$log_file"
}

execute_to_report() {
  local name="$1" log_file="$2" report_file="$3" timeout_seconds="$4"; shift 4
  local -a command=("$@")
  local start_ms end_ms

  mkdir -p "$(dirname "$log_file")" "$(dirname "$report_file")"
  : > "$log_file"
  : > "$report_file"
  printf 'Job: %s\nExecutable: %s\nStarted: %s\n\n' \
    "$name" "${command[0]}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$log_file"

  LAST_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  start_ms="$(now_ms)"
  log "Running $name"

  set +e
  timeout --signal=TERM --kill-after="${GRC_COMMAND_KILL_AFTER}s" \
    "$timeout_seconds" "${command[@]}" > "$report_file" 2>> "$log_file"
  LAST_RC=$?
  set -e

  end_ms="$(now_ms)"
  LAST_DURATION_MS=$(( end_ms - start_ms ))
  LAST_COMPLETED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  truncate_file "$log_file"
}

classify_timeout_or_failure() {
  local rc="$1"
  if [[ "$rc" -eq 124 || "$rc" -eq 137 ]]; then
    printf 'timed_out\n'
  else
    printf 'failed\n'
  fi
}

validate_json() {
  [[ -s "$1" ]] && jq empty "$1" >/dev/null 2>&1
}

validate_sarif() {
  [[ -s "$1" ]] && jq -e \
    'type == "object" and (.version == "2.1.0") and (.runs | type == "array")' \
    "$1" >/dev/null 2>&1
}

validate_nonempty() {
  [[ -s "$1" ]]
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    python3 - "$1" <<'PY'
import hashlib, sys
h = hashlib.sha256()
with open(sys.argv[1], 'rb') as f:
    for block in iter(lambda: f.read(1024 * 1024), b''):
        h.update(block)
print(h.hexdigest())
PY
  fi
}

report_entry() {
  local file="$1" format="$2" validated="$3"
  local size=0 digest="" relative
  relative="$(relative_to_output "$file")"
  if [[ -f "$file" ]]; then
    size="$(stat -c '%s' "$file" 2>/dev/null || wc -c < "$file")"
    [[ -s "$file" ]] && digest="$(sha256_file "$file")"
  fi

  jq -cn \
    --arg path "$relative" \
    --arg format "$format" \
    --argjson validated "$(json_bool "$validated")" \
    --argjson sizeBytes "$size" \
    --arg sha256 "$digest" \
    '{path:$path,format:$format,validated:$validated,sizeBytes:$sizeBytes,sha256:(if $sha256=="" then null else $sha256 end)}'
}

collect_reports() {
  local directory="$1"
  local entries='[]' file format valid entry
  [[ -d "$directory" ]] || { printf '[]\n'; return 0; }

  while IFS= read -r -d '' file; do
    case "$file" in
      *.json)
        format="json"; validate_json "$file" && valid=true || valid=false ;;
      *.sarif)
        format="sarif"; validate_sarif "$file" && valid=true || valid=false ;;
      *.csv)
        format="csv"; validate_nonempty "$file" && valid=true || valid=false ;;
      *.html|*.htm)
        format="html"; validate_nonempty "$file" && valid=true || valid=false ;;
      *.js)
        format="javascript"; validate_nonempty "$file" && valid=true || valid=false ;;
      *.txt)
        format="text"; validate_nonempty "$file" && valid=true || valid=false ;;
      *) continue ;;
    esac
    entry="$(report_entry "$file" "$format" "$valid")"
    entries="$(jq -cn --argjson current "$entries" --argjson item "$entry" '$current + [$item]')"
  done < <(find "$directory" -type f \
    ! -name '*.log' \
    ! -name 'grc_upload_response.txt' \
    ! -name 'grc_upload_http_status.txt' \
    -print0 | sort -z)

  printf '%s\n' "$entries"
}

write_job_result() {
  local job="$1" scanner="$2" target_type="$3" status="$4" exit_code="$5"
  local started_at="$6" completed_at="$7" duration_ms="$8" tool_version="$9"
  local finding_count="${10}" finding_reliable="${11}" error_message="${12}"
  local log_path="${13}" reports_json="${14}" optional="${15:-false}"
  local safe_job
  safe_job="$(sanitize_id "$job")"

  jq -n \
    --arg job "$job" \
    --arg scanner "$scanner" \
    --arg targetType "$target_type" \
    --arg status "$status" \
    --argjson exitCode "$exit_code" \
    --arg startedAt "$started_at" \
    --arg completedAt "$completed_at" \
    --argjson durationMs "$duration_ms" \
    --arg toolVersion "$tool_version" \
    --argjson findingCount "$finding_count" \
    --argjson findingCountReliable "$(json_bool "$finding_reliable")" \
    --arg error "$error_message" \
    --arg logPath "$log_path" \
    --argjson reports "$reports_json" \
    --argjson optional "$(json_bool "$optional")" \
    '{
      job:$job,
      scanner:$scanner,
      targetType:$targetType,
      status:$status,
      exitCode:$exitCode,
      startedAt:$startedAt,
      completedAt:$completedAt,
      durationMs:$durationMs,
      toolVersion:$toolVersion,
      findingCount:$findingCount,
      findingCountReliable:$findingCountReliable,
      error:(if $error=="" then null else $error end),
      logPath:(if $logPath=="" then null else $logPath end),
      optional:$optional,
      reports:$reports
    }' > "$STATUS_DIR/${safe_job}.json"

  case "$status" in
    failed|timed_out|partial) event "$job" "$status" 80 "${error_message:-Job failed}" ;;
    *) event "$job" "$status" 80 "Job finished with status: $status" ;;
  esac
}

record_missing_tool() {
  local job="$1" scanner="$2" target_type="$3" executable="$4"
  write_job_result "$job" "$scanner" "$target_type" "failed" 127 \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" 0 \
    "unknown" 0 false "Required command is unavailable: $executable" "" '[]' false
}

record_skipped() {
  local job="$1" scanner="$2" target_type="$3" reason="$4" optional="${5:-false}"
  write_job_result "$job" "$scanner" "$target_type" "skipped" 0 \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" 0 \
    "unknown" 0 false "$reason" "" '[]' "$optional"
}

count_checkov_findings() {
  jq -r '
    if type == "array" then
      ([.[] | .results.failed_checks[]?] | length)
    elif type == "object" then
      ([.results.failed_checks[]?] | length)
    else 0 end
  ' "$1" 2>/dev/null || printf '0\n'
}

count_trivy_findings() {
  jq -r '[
    .Results[]? |
    (.Vulnerabilities[]? // empty),
    (.Misconfigurations[]? // empty),
    (.Secrets[]? // empty),
    (.Licenses[]? // empty)
  ] | length' "$1" 2>/dev/null || printf '0\n'
}

count_prowler_findings() {
  local total=0 file count
  while IFS= read -r -d '' file; do
    validate_json "$file" || continue
    count="$(jq -r '
      if type == "array" then length
      elif (.findings? | type) == "array" then (.findings | length)
      elif (.items? | type) == "array" then (.items | length)
      else 0 end
    ' "$file" 2>/dev/null || printf '0')"
    [[ "$count" =~ ^[0-9]+$ ]] || count=0
    total=$(( total + count ))
  done < <(find "$1" -maxdepth 1 -type f -name '*.json' -print0)
  printf '%s\n' "$total"
}

validate_prowler_primary_report() {
  local file
  while IFS= read -r -d '' file; do
    validate_json "$file" && return 0
  done < <(find "$1" -maxdepth 1 -type f -name '*.json' -print0)
  return 1
}

validate_scoutsuite_reports() {
  find "$1" -type f \( -name '*.html' -o -name '*.js' -o -name '*.json' \) -size +0c -print -quit | grep -q .
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --cloud) CLOUD="${2:-}"; shift 2 ;;
      --tools) TOOLS="${2:-}"; shift 2 ;;
      --output-dir) OUTPUT_DIR="${2:-}"; shift 2 ;;
      --aws-profile) AWS_PROFILE="${2:-}"; shift 2 ;;
      --aws-regions) AWS_REGIONS="${2:-}"; shift 2 ;;
      --azure-auth) AZURE_AUTH="${2:-}"; shift 2 ;;
      --azure-tenant-id) AZURE_TENANT_ID="${2:-}"; shift 2 ;;
      --azure-subscriptions) AZURE_SUBSCRIPTIONS="${2:-}"; shift 2 ;;
      --gcp-credentials-file) GCP_CREDENTIALS_FILE="${2:-}"; shift 2 ;;
      --gcp-project-ids) GCP_PROJECT_IDS="${2:-}"; shift 2 ;;
      --kubeconfig) KUBECONFIG_FILE="${2:-}"; shift 2 ;;
      --k8s-context) K8S_CONTEXT="${2:-}"; shift 2 ;;
      --k8s-namespaces) K8S_NAMESPACES="${2:-}"; shift 2 ;;
      --iac-path) IAC_PATH="${2:-}"; shift 2 ;;
      --repo-path) REPO_PATH="${2:-}"; shift 2 ;;
      --host-path) HOST_PATH="${2:-}"; shift 2 ;;
      --checkov-framework) CHECKOV_FRAMEWORK="${2:-}"; shift 2 ;;
      --trivy-severity) TRIVY_SEVERITY="${2:-}"; shift 2 ;;
      --grc-upload-url) GRC_UPLOAD_URL="${2:-}"; shift 2 ;;
      --grc-api-token-env) GRC_API_TOKEN_ENV="${2:-}"; shift 2 ;;
      --allow-insecure-upload) ALLOW_INSECURE_UPLOAD="true"; shift ;;
      --fail-on-scanner-error) FAIL_ON_SCANNER_ERROR="true"; shift ;;
      --keep-archive) KEEP_ARCHIVE="true"; shift ;;
      --scout-cmd) SCOUT_CMD="${2:-}"; shift 2 ;;
      --prowler-cmd) PROWLER_CMD="${2:-}"; shift 2 ;;
      --checkov-cmd) CHECKOV_CMD="${2:-}"; shift 2 ;;
      --trivy-cmd) TRIVY_CMD="${2:-}"; shift 2 ;;
      --help|-h) usage; exit 0 ;;
      *) err "Unknown option: $1"; usage; exit 2 ;;
    esac
  done

  case "$CLOUD" in aws|azure|gcp|all|none) ;;
    *) err "Invalid --cloud value: $CLOUD"; exit 2 ;;
  esac

  case "$AZURE_AUTH" in cli|sp-env|browser|managed-identity) ;;
    *) err "Invalid --azure-auth value: $AZURE_AUTH"; exit 2 ;;
  esac

  [[ "$GRC_API_TOKEN_ENV" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
    err "Invalid --grc-api-token-env name"
    exit 2
  }

  [[ "$TRIVY_SEVERITY" =~ ^(UNKNOWN|LOW|MEDIUM|HIGH|CRITICAL)(,(UNKNOWN|LOW|MEDIUM|HIGH|CRITICAL))*$ ]] || {
    err "Invalid --trivy-severity value: $TRIVY_SEVERITY"
    exit 2
  }

  local numeric
  for numeric in "$GRC_CLOUD_SCAN_TIMEOUT" "$GRC_CHECKOV_TIMEOUT" "$GRC_TRIVY_TIMEOUT" \
                 "$GRC_OS_TIMEOUT" "$GRC_UPLOAD_TIMEOUT" "$GRC_COMMAND_KILL_AFTER" \
                 "$GRC_MAX_LOG_BYTES"; do
    [[ "$numeric" =~ ^[1-9][0-9]*$ ]] || {
      err "Timeout and size tunables must be positive integers"
      exit 2
    }
  done

  normalize_tools
}

initialize_paths() {
  OUTPUT_DIR="$(realpath -m "$OUTPUT_DIR")"
  IAC_PATH="$(realpath -m "$IAC_PATH")"
  REPO_PATH="$(realpath -m "$REPO_PATH")"
  [[ -n "$HOST_PATH" ]] && HOST_PATH="$(realpath -m "$HOST_PATH")"
  [[ -n "$GCP_CREDENTIALS_FILE" ]] && GCP_CREDENTIALS_FILE="$(realpath -m "$GCP_CREDENTIALS_FILE")"
  [[ -n "$KUBECONFIG_FILE" ]] && KUBECONFIG_FILE="$(realpath -m "$KUBECONFIG_FILE")"

  if [[ "$OUTPUT_DIR" == "/" || "$OUTPUT_DIR" == "/tmp" || "$OUTPUT_DIR" == "/var" ]]; then
    err "Refusing unsafe output directory: $OUTPUT_DIR"
    exit 2
  fi

  if [[ -d "$REPO_PATH" && "$(path_is_within "$OUTPUT_DIR" "$REPO_PATH")" == "true" ]]; then
    err "Output directory must not be inside repo path. Output: $OUTPUT_DIR Repo: $REPO_PATH"
    exit 2
  fi

  if [[ -d "$IAC_PATH" && "$(path_is_within "$OUTPUT_DIR" "$IAC_PATH")" == "true" ]]; then
    err "Output directory must not be inside IaC path. Output: $OUTPUT_DIR IaC: $IAC_PATH"
    exit 2
  fi

  [[ -n "$GCP_CREDENTIALS_FILE" && ! -r "$GCP_CREDENTIALS_FILE" ]] && {
    err "GCP credentials file is not readable: $GCP_CREDENTIALS_FILE"
    exit 2
  }

  [[ -n "$KUBECONFIG_FILE" && ! -r "$KUBECONFIG_FILE" ]] && {
    err "Kubeconfig is not readable: $KUBECONFIG_FILE"
    exit 2
  }

  if [[ -d "$OUTPUT_DIR" ]] && find "$OUTPUT_DIR" -mindepth 1 -print -quit | grep -q .; then
    err "Output directory already exists and is not empty: $OUTPUT_DIR"
    err "Use a new output directory to prevent stale reports from being accepted."
    exit 2
  fi

  mkdir -p "$OUTPUT_DIR" "$GRC_TRIVY_CACHE_DIR"
  STATUS_DIR="$OUTPUT_DIR/scanner-status"
  EVENTS_FILE="$OUTPUT_DIR/scan-events.jsonl"
  EVENTS_LOCK_FILE="$OUTPUT_DIR/.scan-events.lock"
  EXECUTION_SUMMARY_FILE="$OUTPUT_DIR/execution-summary.json"
  ERRORS_FILE="$OUTPUT_DIR/errors.json"
  MANIFEST_FILE="$OUTPUT_DIR/scan_manifest.json"
  SUMMARY_FILE="$OUTPUT_DIR/summary.json"
  UPLOAD_RESPONSE_FILE="$OUTPUT_DIR/grc_upload_response.txt"
  UPLOAD_STATUS_FILE="$OUTPUT_DIR/grc_upload_http_status.txt"
  ARCHIVE_FILE="${OUTPUT_DIR}.tar.gz"
  mkdir -p "$STATUS_DIR"
  : > "$EVENTS_FILE"
}

initialize_commands() {
  parse_command_string "$PROWLER_CMD" PROWLER_BASE
  parse_command_string "$SCOUT_CMD" SCOUT_BASE
  parse_command_string "$CHECKOV_CMD" CHECKOV_BASE
  parse_command_string "$TRIVY_CMD" TRIVY_BASE
}

run_prowler_provider() {
  local provider="$1" job="prowler_${1}" out="$OUTPUT_DIR/prowler/${1}"
  local log_file="$out/prowler_${provider}.log" tool_version reports findings status error_message=""
  mkdir -p "$out"

  if ! command_available "${PROWLER_BASE[0]}"; then
    record_missing_tool "$job" "prowler" "$provider" "${PROWLER_BASE[0]}"
    return 0
  fi

  tool_version="$(get_tool_version prowler "${PROWLER_BASE[@]}")"
  local -a cmd=("${PROWLER_BASE[@]}" "$provider" -M csv json-ocsf html -o "$out" \
    -F "prowler_${provider}_${RUN_ID}" --status FAIL)

  case "$provider" in
    aws)
      [[ -n "$AWS_PROFILE" ]] && cmd+=(--profile "$AWS_PROFILE")
      if [[ -n "$AWS_REGIONS" ]]; then
        split_to_array "$AWS_REGIONS"
        cmd+=(-f "${SPLIT_ARR[@]}")
      fi
      ;;
    azure)
      case "$AZURE_AUTH" in
        cli) cmd+=(--az-cli-auth) ;;
        sp-env) cmd+=(--sp-env-auth) ;;
        browser)
          cmd+=(--browser-auth)
          [[ -n "$AZURE_TENANT_ID" ]] && cmd+=(--tenant-id "$AZURE_TENANT_ID")
          ;;
        managed-identity) cmd+=(--managed-identity-auth) ;;
      esac
      if [[ -n "$AZURE_SUBSCRIPTIONS" ]]; then
        split_to_array "$AZURE_SUBSCRIPTIONS"
        cmd+=(--subscription-ids "${SPLIT_ARR[@]}")
      fi
      ;;
    gcp)
      [[ -n "$GCP_CREDENTIALS_FILE" ]] && cmd+=(--credentials-file "$GCP_CREDENTIALS_FILE")
      if [[ -n "$GCP_PROJECT_IDS" ]]; then
        split_to_array "$GCP_PROJECT_IDS"
        cmd+=(--project-ids "${SPLIT_ARR[@]}")
      fi
      ;;
    kubernetes)
      [[ -n "$KUBECONFIG_FILE" ]] && cmd+=(--kubeconfig-file "$KUBECONFIG_FILE")
      [[ -n "$K8S_CONTEXT" ]] && cmd+=(--context "$K8S_CONTEXT")
      if [[ -n "$K8S_NAMESPACES" ]]; then
        split_to_array "$K8S_NAMESPACES"
        cmd+=(--namespaces "${SPLIT_ARR[@]}")
      fi
      ;;
  esac

  execute_command "Prowler $provider" "$log_file" "$GRC_CLOUD_SCAN_TIMEOUT" "${cmd[@]}"
  reports="$(collect_reports "$out")"

  if [[ "$LAST_RC" -eq 124 || "$LAST_RC" -eq 137 ]]; then
    status="timed_out"
    error_message="Prowler execution timed out"
  elif [[ "$LAST_RC" -ne 0 && "$LAST_RC" -ne 3 ]]; then
    status="failed"
    error_message="Prowler execution failed with exit code $LAST_RC"
  elif ! validate_prowler_primary_report "$out"; then
    status="failed"
    error_message="Prowler did not produce a valid JSON-OCSF report"
  elif [[ "$LAST_RC" -eq 3 ]]; then
    status="findings_detected"
    findings="$(count_prowler_findings "$out")"
  else
    findings="$(count_prowler_findings "$out")"
    [[ "$findings" -gt 0 ]] && status="findings_detected" || status="success"
  fi
  findings="${findings:-0}"

  write_job_result "$job" "prowler" "$provider" "$status" "$LAST_RC" \
    "$LAST_STARTED_AT" "$LAST_COMPLETED_AT" "$LAST_DURATION_MS" "$tool_version" \
    "$findings" true "$error_message" "$(relative_to_output "$log_file")" "$reports" false
}

run_prowler() {
  has_tool_enabled prowler || return 0
  if [[ "$CLOUD" == "none" ]]; then
    record_skipped "prowler_cloud" "prowler" "cloud" "Cloud scanning disabled by --cloud none"
  elif [[ "$CLOUD" == "all" ]]; then
    run_prowler_provider aws
    run_prowler_provider azure
    run_prowler_provider gcp
  else
    run_prowler_provider "$CLOUD"
  fi

  if [[ -n "$KUBECONFIG_FILE" || -n "$K8S_CONTEXT" || -n "$K8S_NAMESPACES" ]]; then
    run_prowler_provider kubernetes
  fi
}

run_scout_provider() {
  local provider="$1" job="scoutsuite_${1}" out="$OUTPUT_DIR/scoutsuite/${1}"
  local log_file="$out/scoutsuite_${provider}.log" tool_version reports status error_message=""
  mkdir -p "$out"

  if ! command_available "${SCOUT_BASE[0]}"; then
    record_missing_tool "$job" "scoutsuite" "$provider" "${SCOUT_BASE[0]}"
    return 0
  fi

  tool_version="$(get_tool_version scoutsuite "${SCOUT_BASE[@]}")"
  local -a cmd=("${SCOUT_BASE[@]}" "$provider" --no-browser --report-dir "$out")

  case "$provider" in
    aws)
      [[ -n "$AWS_PROFILE" ]] && cmd+=(--profile "$AWS_PROFILE")
      if [[ -n "$AWS_REGIONS" ]]; then
        split_to_array "$AWS_REGIONS"
        for region in "${SPLIT_ARR[@]}"; do cmd+=(--regions "$region"); done
      fi
      ;;
    azure)
      case "$AZURE_AUTH" in
        cli) cmd+=(--cli) ;;
        sp-env) cmd+=(--service-principal) ;;
        browser) cmd+=(--user-account-browser) ;;
        managed-identity) cmd+=(--msi) ;;
      esac
      [[ -n "$AZURE_TENANT_ID" ]] && cmd+=(--tenant "$AZURE_TENANT_ID")
      if [[ -n "$AZURE_SUBSCRIPTIONS" ]]; then
        split_to_array "$AZURE_SUBSCRIPTIONS"
        for subscription in "${SPLIT_ARR[@]}"; do cmd+=(--subscriptions "$subscription"); done
      fi
      ;;
    gcp)
      if [[ -n "$GCP_CREDENTIALS_FILE" ]]; then
        cmd+=(--service-account "$GCP_CREDENTIALS_FILE")
      else
        cmd+=(--user-account)
      fi
      if [[ -n "$GCP_PROJECT_IDS" ]]; then
        split_to_array "$GCP_PROJECT_IDS"
        for project in "${SPLIT_ARR[@]}"; do cmd+=(--project-id "$project"); done
      fi
      ;;
  esac

  execute_command "ScoutSuite $provider" "$log_file" "$GRC_CLOUD_SCAN_TIMEOUT" "${cmd[@]}"
  reports="$(collect_reports "$out")"

  if [[ "$LAST_RC" -eq 124 || "$LAST_RC" -eq 137 ]]; then
    status="timed_out"
    error_message="ScoutSuite execution timed out"
  elif [[ "$LAST_RC" -ne 0 ]]; then
    status="failed"
    error_message="ScoutSuite execution failed with exit code $LAST_RC"
  elif validate_scoutsuite_reports "$out"; then
    status="success"
  else
    status="failed"
    error_message="ScoutSuite completed without a usable report"
  fi

  write_job_result "$job" "scoutsuite" "$provider" "$status" "$LAST_RC" \
    "$LAST_STARTED_AT" "$LAST_COMPLETED_AT" "$LAST_DURATION_MS" "$tool_version" \
    0 false "$error_message" "$(relative_to_output "$log_file")" "$reports" false
}

run_scoutsuite() {
  has_tool_enabled scoutsuite || return 0
  if [[ "$CLOUD" == "none" ]]; then
    record_skipped "scoutsuite_cloud" "scoutsuite" "cloud" "Cloud scanning disabled by --cloud none"
  elif [[ "$CLOUD" == "all" ]]; then
    run_scout_provider aws
    run_scout_provider azure
    run_scout_provider gcp
  else
    run_scout_provider "$CLOUD"
  fi
}

run_checkov() {
  has_tool_enabled checkov || return 0
  local job="checkov_iac" out="$OUTPUT_DIR/checkov" log_file="$OUTPUT_DIR/checkov/checkov.log"
  local json_report="$out/checkov.json" sarif_report="$out/checkov.sarif"
  local tool_version reports findings=0 status error_message=""

  if [[ ! -d "$IAC_PATH" ]]; then
    record_skipped "$job" "checkov" "iac" "IaC path does not exist: $IAC_PATH"
    return 0
  fi

  if ! command_available "${CHECKOV_BASE[0]}"; then
    record_missing_tool "$job" "checkov" "iac" "${CHECKOV_BASE[0]}"
    return 0
  fi

  mkdir -p "$out"
  tool_version="$(get_tool_version checkov "${CHECKOV_BASE[@]}")"
  local -a cmd=("${CHECKOV_BASE[@]}" -d "$IAC_PATH" --framework "$CHECKOV_FRAMEWORK" \
    -o cli -o json -o sarif \
    --output-file-path "console,$json_report,$sarif_report" --quiet)

  execute_command "Checkov IaC" "$log_file" "$GRC_CHECKOV_TIMEOUT" "${cmd[@]}"
  reports="$(collect_reports "$out")"

  if [[ "$LAST_RC" -eq 124 || "$LAST_RC" -eq 137 ]]; then
    status="timed_out"
    error_message="Checkov execution timed out"
  elif [[ "$LAST_RC" -ne 0 && "$LAST_RC" -ne 1 ]]; then
    status="failed"
    error_message="Checkov execution failed with exit code $LAST_RC"
  elif ! validate_json "$json_report"; then
    status="failed"
    error_message="Checkov did not produce a valid primary JSON report"
  else
    findings="$(count_checkov_findings "$json_report")"
    if [[ "$LAST_RC" -eq 1 || "$findings" -gt 0 ]]; then
      status="findings_detected"
    else
      status="success"
    fi
    if [[ -s "$sarif_report" ]] && ! validate_sarif "$sarif_report"; then
      warn "Checkov SARIF report is invalid; JSON remains authoritative"
    fi
  fi

  write_job_result "$job" "checkov" "iac" "$status" "$LAST_RC" \
    "$LAST_STARTED_AT" "$LAST_COMPLETED_AT" "$LAST_DURATION_MS" "$tool_version" \
    "$findings" true "$error_message" "$(relative_to_output "$log_file")" "$reports" false
}

convert_trivy_to_sarif() {
  local json_report="$1" sarif_report="$2" log_file="$3"
  set +e
  timeout --signal=TERM --kill-after="${GRC_COMMAND_KILL_AFTER}s" "$GRC_TRIVY_TIMEOUT" \
    "${TRIVY_BASE[@]}" convert --format sarif --output "$sarif_report" "$json_report" \
    >> "$log_file" 2>&1
  local rc=$?
  set -e
  truncate_file "$log_file"
  [[ "$rc" -eq 0 ]] && validate_sarif "$sarif_report"
}

run_trivy_fs() {
  local job="trivy_fs" out="$OUTPUT_DIR/trivy" log_file="$OUTPUT_DIR/trivy/trivy_fs.log"
  local json_report="$out/trivy_fs.json" sarif_report="$out/trivy_fs.sarif"
  local tool_version reports findings=0 status error_message=""

  if [[ ! -d "$REPO_PATH" ]]; then
    record_skipped "$job" "trivy" "filesystem" "Repository path does not exist: $REPO_PATH"
    return 0
  fi

  if ! command_available "${TRIVY_BASE[0]}"; then
    record_missing_tool "$job" "trivy" "filesystem" "${TRIVY_BASE[0]}"
    return 0
  fi

  mkdir -p "$out"
  tool_version="$(get_tool_version trivy "${TRIVY_BASE[@]}")"
  local -a cmd=("${TRIVY_BASE[@]}" fs --format json --output "$json_report" \
    --scanners vuln,secret,misconfig --severity "$TRIVY_SEVERITY" \
    --cache-dir "$GRC_TRIVY_CACHE_DIR" --exit-code 0 "$REPO_PATH")

  execute_command "Trivy repository/filesystem" "$log_file" "$GRC_TRIVY_TIMEOUT" "${cmd[@]}"

  if [[ "$LAST_RC" -eq 124 || "$LAST_RC" -eq 137 ]]; then
    status="timed_out"
    error_message="Trivy filesystem scan timed out"
  elif [[ "$LAST_RC" -ne 0 ]]; then
    status="failed"
    error_message="Trivy filesystem scan failed with exit code $LAST_RC"
  elif validate_json "$json_report" && jq -e 'type=="object" and (.Results|type=="array")' "$json_report" >/dev/null 2>&1; then
    findings="$(count_trivy_findings "$json_report")"
    [[ "$findings" -gt 0 ]] && status="findings_detected" || status="success"
    if ! convert_trivy_to_sarif "$json_report" "$sarif_report" "$log_file"; then
      warn "Trivy SARIF conversion failed; JSON remains authoritative"
      rm -f "$sarif_report"
    fi
  else
    status="failed"
    error_message="Trivy filesystem scan produced invalid JSON"
  fi

  reports="$(collect_reports "$out")"
  write_job_result "$job" "trivy" "filesystem" "$status" "$LAST_RC" \
    "$LAST_STARTED_AT" "$LAST_COMPLETED_AT" "$LAST_DURATION_MS" "$tool_version" \
    "$findings" true "$error_message" "$(relative_to_output "$log_file")" "$reports" false
}

run_trivy_rootfs() {
  local job="trivy_rootfs" out="$OUTPUT_DIR/trivy" log_file="$OUTPUT_DIR/trivy/trivy_rootfs.log"
  local json_report="$out/trivy_rootfs.json" tool_version reports findings=0 status error_message=""

  if [[ -z "$HOST_PATH" ]]; then
    record_skipped "$job" "trivy" "rootfs" "Host rootfs scanning was not requested" true
    return 0
  fi

  if [[ ! -d "$HOST_PATH" ]]; then
    record_skipped "$job" "trivy" "rootfs" "Host path does not exist: $HOST_PATH"
    return 0
  fi

  if ! command_available "${TRIVY_BASE[0]}"; then
    record_missing_tool "$job" "trivy" "rootfs" "${TRIVY_BASE[0]}"
    return 0
  fi

  mkdir -p "$out"
  tool_version="$(get_tool_version trivy "${TRIVY_BASE[@]}")"
  split_to_array "$TRIVY_SKIP_DIRS"
  local -a skip_args=() cmd
  local skip_dir
  for skip_dir in "${SPLIT_ARR[@]}"; do skip_args+=(--skip-dirs "$skip_dir"); done
  if [[ "$(path_is_within "$OUTPUT_DIR" "$HOST_PATH")" == "true" ]]; then
    skip_args+=(--skip-dirs "$OUTPUT_DIR")
  fi

  cmd=("${TRIVY_BASE[@]}" rootfs --format json --output "$json_report" \
    --pkg-types os,library --scanners vuln --severity "$TRIVY_SEVERITY" \
    --cache-dir "$GRC_TRIVY_CACHE_DIR" --exit-code 0 \
    "${skip_args[@]}" "$HOST_PATH")

  execute_command "Trivy host rootfs" "$log_file" "$GRC_TRIVY_TIMEOUT" "${cmd[@]}"

  if [[ "$LAST_RC" -eq 124 || "$LAST_RC" -eq 137 ]]; then
    status="timed_out"
    error_message="Trivy rootfs scan timed out"
  elif [[ "$LAST_RC" -ne 0 ]]; then
    status="failed"
    error_message="Trivy rootfs scan failed with exit code $LAST_RC"
  elif validate_json "$json_report" && jq -e 'type=="object" and (.Results|type=="array")' "$json_report" >/dev/null 2>&1; then
    findings="$(count_trivy_findings "$json_report")"
    [[ "$findings" -gt 0 ]] && status="findings_detected" || status="success"
  else
    status="failed"
    error_message="Trivy rootfs scan produced invalid JSON"
  fi

  reports="$(collect_reports "$out")"
  write_job_result "$job" "trivy" "rootfs" "$status" "$LAST_RC" \
    "$LAST_STARTED_AT" "$LAST_COMPLETED_AT" "$LAST_DURATION_MS" "$tool_version" \
    "$findings" true "$error_message" "$(relative_to_output "$log_file")" "$reports" false
}

run_trivy() {
  has_tool_enabled trivy || return 0
  run_trivy_fs
  run_trivy_rootfs
}

native_package_manager() {
  if command -v apt >/dev/null 2>&1; then printf 'apt\n'
  elif command -v dnf >/dev/null 2>&1; then printf 'dnf\n'
  elif command -v yum >/dev/null 2>&1; then printf 'yum\n'
  elif command -v apk >/dev/null 2>&1; then printf 'apk\n'
  elif command -v zypper >/dev/null 2>&1; then printf 'zypper\n'
  else printf 'unknown\n'
  fi
}

count_nonempty_lines() {
  awk 'NF {count++} END {print count+0}' "$1"
}

run_native_os_outdated() {
  has_tool_enabled os || return 0
  local job="native_os_outdated" out="$OUTPUT_DIR/os" log_file="$OUTPUT_DIR/os/os_outdated.log"
  local report="$out/outdated_packages.txt" inventory="$out/os_inventory.json"
  local manager tool_version="system-package-manager" reports findings=0 status error_message=""
  mkdir -p "$out"

  manager="$(native_package_manager)"
  jq -n \
    --arg runId "$RUN_ID" \
    --arg hostname "$(hostname 2>/dev/null || printf unknown)" \
    --arg osRelease "$(cat /etc/os-release 2>/dev/null || printf unknown)" \
    --arg packageManager "$manager" \
    '{runId:$runId,hostname:$hostname,osRelease:$osRelease,packageManager:$packageManager,note:"Outdated-package inventory only; use Trivy rootfs for CVE-level OS vulnerability data."}' \
    > "$inventory"

  case "$manager" in
    apt)
      execute_to_report "APT outdated packages" "$log_file" "$report" "$GRC_OS_TIMEOUT" apt list --upgradable
      # apt includes a header line when updates are listed.
      findings="$(awk 'NF && $0 !~ /^Listing/ {count++} END {print count+0}' "$report")"
      ;;
    dnf)
      execute_to_report "DNF outdated packages" "$log_file" "$report" "$GRC_OS_TIMEOUT" dnf -q check-update
      findings="$(count_nonempty_lines "$report")"
      ;;
    yum)
      execute_to_report "YUM outdated packages" "$log_file" "$report" "$GRC_OS_TIMEOUT" yum -q check-update
      findings="$(count_nonempty_lines "$report")"
      ;;
    apk)
      execute_to_report "APK outdated packages" "$log_file" "$report" "$GRC_OS_TIMEOUT" apk version -l '<'
      findings="$(count_nonempty_lines "$report")"
      ;;
    zypper)
      execute_to_report "Zypper outdated patches" "$log_file" "$report" "$GRC_OS_TIMEOUT" zypper --non-interactive list-patches
      findings="$(count_nonempty_lines "$report")"
      ;;
    unknown)
      record_skipped "$job" "native_os" "host_packages" "No supported package manager was found"
      return 0
      ;;
  esac

  if [[ "$LAST_RC" -eq 0 || "$LAST_RC" -eq 100 ]]; then
    [[ "$findings" -gt 0 ]] && status="findings_detected" || status="success"
  elif [[ "$LAST_RC" -eq 124 || "$LAST_RC" -eq 137 ]]; then
    status="timed_out"
    error_message="Native package inventory timed out"
  else
    status="failed"
    error_message="Native package inventory failed with exit code $LAST_RC"
  fi

  reports="$(collect_reports "$out")"
  write_job_result "$job" "native_os" "host_packages" "$status" "$LAST_RC" \
    "$LAST_STARTED_AT" "$LAST_COMPLETED_AT" "$LAST_DURATION_MS" "$tool_version" \
    "$findings" true "$error_message" "$(relative_to_output "$log_file")" "$reports" false
}

build_execution_summary() {
  local files=("$STATUS_DIR"/*.json)
  if [[ ! -e "${files[0]}" ]]; then
    printf '[]\n' > "$EXECUTION_SUMMARY_FILE"
  else
    jq -s 'sort_by(.job)' "$STATUS_DIR"/*.json > "$EXECUTION_SUMMARY_FILE"
  fi
}

determine_overall_status() {
  local failed completed findings skipped
  failed="$(jq '[.[] | select((.status=="failed" or .status=="timed_out" or .status=="partial") and (.optional|not))] | length' "$EXECUTION_SUMMARY_FILE")"
  completed="$(jq '[.[] | select(.status=="success" or .status=="findings_detected")] | length' "$EXECUTION_SUMMARY_FILE")"
  findings="$(jq '[.[] | select(.status=="findings_detected")] | length' "$EXECUTION_SUMMARY_FILE")"
  skipped="$(jq '[.[] | select(.status=="skipped")] | length' "$EXECUTION_SUMMARY_FILE")"

  if [[ "$failed" -gt 0 && "$completed" -gt 0 ]]; then printf 'partial\n'
  elif [[ "$failed" -gt 0 ]]; then printf 'failed\n'
  elif [[ "$completed" -eq 0 && "$skipped" -gt 0 ]]; then printf 'skipped\n'
  elif [[ "$findings" -gt 0 ]]; then printf 'findings_detected\n'
  else printf 'success\n'
  fi
}

write_final_manifest() {
  local overall_status="$1" completed_at duration_ms total_findings failed_count skipped_count reports
  completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  duration_ms=$(( ($(date +%s) - STARTED_EPOCH) * 1000 ))
  total_findings="$(jq '[.[] | .findingCount] | add // 0' "$EXECUTION_SUMMARY_FILE")"
  failed_count="$(jq '[.[] | select((.status=="failed" or .status=="timed_out" or .status=="partial") and (.optional|not))] | length' "$EXECUTION_SUMMARY_FILE")"
  skipped_count="$(jq '[.[] | select(.status=="skipped")] | length' "$EXECUTION_SUMMARY_FILE")"
  reports="$(jq '[.[].reports[]?] | unique_by(.path)' "$EXECUTION_SUMMARY_FILE")"

  jq -n \
    --arg schemaVersion "1.0" \
    --arg runId "$RUN_ID" \
    --arg status "$overall_status" \
    --arg startedAt "$STARTED_AT" \
    --arg completedAt "$completed_at" \
    --argjson durationMs "$duration_ms" \
    --arg cloud "$CLOUD" \
    --arg tools "$TOOLS" \
    --arg iacPath "$IAC_PATH" \
    --arg repoPath "$REPO_PATH" \
    --arg hostPath "$HOST_PATH" \
    --argjson totalFindings "$total_findings" \
    --argjson failedJobCount "$failed_count" \
    --argjson skippedJobCount "$skipped_count" \
    --argjson jobs "$(cat "$EXECUTION_SUMMARY_FILE")" \
    --argjson reports "$reports" \
    '{
      schemaVersion:$schemaVersion,
      runId:$runId,
      status:$status,
      startedAt:$startedAt,
      completedAt:$completedAt,
      durationMs:$durationMs,
      cloud:$cloud,
      tools:($tools|split(",")),
      targets:{
        iacPath:$iacPath,
        repoPath:$repoPath,
        hostPath:(if $hostPath=="" then null else $hostPath end)
      },
      totalFindings:$totalFindings,
      failedJobCount:$failedJobCount,
      skippedJobCount:$skippedJobCount,
      jobs:$jobs,
      reports:$reports,
      files:{
        executionSummary:"execution-summary.json",
        errors:"errors.json",
        events:"scan-events.jsonl",
        statuses:"scanner-status/"
      }
    }' > "$MANIFEST_FILE"

  cp "$MANIFEST_FILE" "$SUMMARY_FILE"
  jq '{
    failedScanners:[.[] | select((.status=="failed" or .status=="timed_out" or .status=="partial") and (.optional|not)) | .job],
    failures:[.[] | select((.status=="failed" or .status=="timed_out" or .status=="partial") and (.optional|not)) | {job,scanner,status,exitCode,error}]
  }' "$EXECUTION_SUMMARY_FILE" > "$ERRORS_FILE"
}

validate_upload_url() {
  [[ -z "$GRC_UPLOAD_URL" ]] && return 0
  if [[ "$GRC_UPLOAD_URL" =~ ^https:// ]]; then return 0; fi
  if [[ "$ALLOW_INSECURE_UPLOAD" == "true" && "$GRC_UPLOAD_URL" =~ ^http:// ]]; then return 0; fi
  err "Upload URL must use HTTPS. Use --allow-insecure-upload only for controlled local testing."
  return 1
}

upload_results() {
  [[ -z "$GRC_UPLOAD_URL" ]] && return 0
  local job="grc_upload" token http_code curl_rc status error_message="" reports='[]'
  local archive_sha archive_size tool_version="curl"

  if ! validate_upload_url; then
    write_job_result "$job" "upload" "grc_api" "failed" 2 \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" 0 \
      "$tool_version" 0 false "Unsafe upload URL" "" '[]' false
    return 0
  fi

  if ! command -v curl >/dev/null 2>&1; then
    record_missing_tool "$job" "upload" "grc_api" "curl"
    return 0
  fi

  token="${!GRC_API_TOKEN_ENV:-}"
  if [[ -z "$token" ]]; then
    write_job_result "$job" "upload" "grc_api" "failed" 2 \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" 0 \
      "$tool_version" 0 false "Upload token environment variable is empty: $GRC_API_TOKEN_ENV" "" '[]' false
    return 0
  fi

  tar -czf "$ARCHIVE_FILE" -C "$(dirname "$OUTPUT_DIR")" "$(basename "$OUTPUT_DIR")"
  chmod 600 "$ARCHIVE_FILE"
  archive_sha="$(sha256_file "$ARCHIVE_FILE")"
  archive_size="$(stat -c '%s' "$ARCHIVE_FILE" 2>/dev/null || wc -c < "$ARCHIVE_FILE")"

  LAST_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local start_ms="$(now_ms)" end_ms
  set +e
  http_code="$(curl -sS \
    --connect-timeout 30 \
    --max-time "$GRC_UPLOAD_TIMEOUT" \
    -X POST "$GRC_UPLOAD_URL" \
    -H "Authorization: Bearer $token" \
    -F "run_id=${RUN_ID}" \
    -F "archive_sha256=${archive_sha}" \
    -F "file=@${ARCHIVE_FILE};type=application/gzip" \
    -o "$UPLOAD_RESPONSE_FILE" \
    -w '%{http_code}' 2> "$OUTPUT_DIR/grc_upload.log")"
  curl_rc=$?
  set -e
  end_ms="$(now_ms)"
  LAST_DURATION_MS=$(( end_ms - start_ms ))
  LAST_COMPLETED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '%s\n' "$http_code" > "$UPLOAD_STATUS_FILE"
  truncate_file "$UPLOAD_RESPONSE_FILE"
  truncate_file "$OUTPUT_DIR/grc_upload.log"

  if [[ "$curl_rc" -ne 0 ]]; then
    status="failed"
    error_message="Upload failed with curl exit code $curl_rc"
  elif [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
    status="success"
  else
    status="failed"
    error_message="Upload endpoint returned HTTP ${http_code:-000}"
  fi

  reports="$(jq -cn \
    --arg path "$ARCHIVE_FILE" \
    --argjson sizeBytes "$archive_size" \
    --arg sha256 "$archive_sha" \
    '[{path:$path,format:"tar.gz",validated:true,sizeBytes:$sizeBytes,sha256:$sha256}]')"

  write_job_result "$job" "upload" "grc_api" "$status" "$curl_rc" \
    "$LAST_STARTED_AT" "$LAST_COMPLETED_AT" "$LAST_DURATION_MS" "$tool_version" \
    0 false "$error_message" "grc_upload.log" "$reports" false

  if [[ "$KEEP_ARCHIVE" != "true" ]]; then
    rm -f "$ARCHIVE_FILE"
  fi
}

cleanup() {
  rm -f "${EVENTS_LOCK_FILE:-}" 2>/dev/null || true
  if [[ "$KEEP_ARCHIVE" != "true" && -n "${ARCHIVE_FILE:-}" ]]; then
    rm -f "$ARCHIVE_FILE" 2>/dev/null || true
  fi
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

main() {
  parse_args "$@"

  for required in jq python3 timeout realpath tar; do
    command -v "$required" >/dev/null 2>&1 || {
      err "Required orchestration dependency is missing: $required"
      exit 2
    }
  done

  initialize_paths
  initialize_commands

  event "init" "running" 1 "Initializing unified authorized scan"
  log "Run ID: $RUN_ID"
  log "Output directory: $OUTPUT_DIR"
  log "Cloud: $CLOUD"
  log "Selected tools: $TOOLS"

  run_prowler
  run_scoutsuite
  run_checkov
  run_trivy
  run_native_os_outdated

  build_execution_summary
  local overall_status
  overall_status="$(determine_overall_status)"
  write_final_manifest "$overall_status"

  # Upload the finalized manifest and reports. The upload result is then added to
  # the local execution summary and summary, but is not recursively included in
  # the archive that was already sent.
  upload_results
  if [[ -n "$GRC_UPLOAD_URL" ]]; then
    build_execution_summary
    overall_status="$(determine_overall_status)"
    write_final_manifest "$overall_status"
  fi

  event "scan" "$overall_status" 100 "Unified scan finished with status: $overall_status"

  local failed_count total_findings
  failed_count="$(jq '.failedJobCount' "$MANIFEST_FILE")"
  total_findings="$(jq '.totalFindings' "$MANIFEST_FILE")"

  printf '\n%s\n' "======================================"
  printf '%s\n' "Unified Scan Finished"
  printf '%s\n' "======================================"
  printf 'Status: %s\n' "$overall_status"
  printf 'Run ID: %s\n' "$RUN_ID"
  printf 'Results: %s\n' "$OUTPUT_DIR"
  printf 'Manifest: %s\n' "$MANIFEST_FILE"
  printf 'Execution summary: %s\n' "$EXECUTION_SUMMARY_FILE"
  printf 'Total findings: %s\n' "$total_findings"
  printf 'Failed jobs: %s\n' "$failed_count"
  printf '%s\n' "======================================"

  if [[ "$FAIL_ON_SCANNER_ERROR" == "true" && "$failed_count" -gt 0 ]]; then
    exit 1
  fi
}

main "$@"