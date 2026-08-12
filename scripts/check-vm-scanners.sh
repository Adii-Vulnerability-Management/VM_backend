#!/usr/bin/env bash
# check-vm-scanners.sh
# Read-only health and compatibility check for the vulnerability scanner toolchain.
# This script does not install, upgrade, download databases, or modify scanner state.

set -Euo pipefail
umask 077

export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"

SCRIPT_VERSION="2.0.0"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
STARTED_EPOCH_MS="$(date +%s%3N 2>/dev/null || echo "$(( $(date +%s) * 1000 ))")"

# Keep these pins aligned with install-vm-scanners.sh.
SEMGREP_VERSION="${SEMGREP_VERSION:-1.171.0}"
GITLEAKS_VERSION="${GITLEAKS_VERSION:-8.30.1}"
OSV_VERSION="${OSV_VERSION:-2.4.0}"
TRIVY_VERSION="${TRIVY_VERSION:-0.72.0}"
DEPENDENCY_CHECK_VERSION="${DEPENDENCY_CHECK_VERSION:-12.2.2}"
CHECKOV_VERSION="${CHECKOV_VERSION:-3.3.8}"
PROWLER_VERSION="${PROWLER_VERSION:-5.36.0}"
SCOUTSUITE_VERSION="${SCOUTSUITE_VERSION:-5.14.0}"

NODE_MIN_MAJOR="${VM_NODE_MIN_MAJOR:-20}"
NPM_MIN_MAJOR="${VM_NPM_MIN_MAJOR:-10}"
JAVA_MIN_MAJOR="${VM_JAVA_MIN_MAJOR:-17}"
PYTHON_MIN_VERSION="${VM_PYTHON_MIN_VERSION:-3.10.0}"
PYTHON_MAX_VERSION_EXCLUSIVE="${VM_PYTHON_MAX_VERSION_EXCLUSIVE:-3.14.0}"

REPORT_FILE="${VM_SCANNER_HEALTH_REPORT:-./scanner-health-report.json}"
CHECK_CLOUD_TOOLS="true"
CHECK_DEPENDENCY_CHECK="true"
CHECK_ZAP="true"
REQUIRE_ZAP="${VM_ZAP_REQUIRED:-false}"
REQUIRE_DATABASES="${VM_SCANNER_DATABASES_REQUIRED:-false}"
EXACT_VERSIONS="${VM_SCANNER_EXACT_VERSIONS:-true}"
FAIL_ON_WARNING="false"
DB_MAX_AGE_HOURS="${VM_SCANNER_DB_MAX_AGE_HOURS:-168}"
COMMAND_TIMEOUT="${VM_SCANNER_HEALTH_TIMEOUT:-20}"

RESULTS_TSV=""
FAILURES=0
WARNINGS=0
HEALTHY=0
SKIPPED=0

usage() {
  cat <<USAGE
Usage:
  ./scripts/check-vm-scanners.sh [options]

Options:
  --report <path>              JSON health-report path.
                               Default: ${REPORT_FILE}
  --skip-cloud-tools           Do not require Checkov, Prowler, or ScoutSuite.
  --skip-dependency-check      Do not require OWASP Dependency-Check or Java.
  --skip-zap-check             Do not check OWASP ZAP readiness.
  --require-zap                Treat configured ZAP mode as required.
  --require-databases          Require local Trivy and Dependency-Check database data.
  --allow-version-drift        Require runnable tools, but do not fail exact-version mismatch.
  --db-max-age-hours <hours>   Warn/fail when local scanner database files are older.
                               Default: ${DB_MAX_AGE_HOURS}
  --command-timeout <seconds>  Timeout for each read-only version/readiness command.
                               Default: ${COMMAND_TIMEOUT}
  --fail-on-warning            Return non-zero when optional checks produce warnings.
  --help                       Show this help.

Pinned scanner versions:
  Semgrep:                 ${SEMGREP_VERSION}
  Gitleaks:                ${GITLEAKS_VERSION}
  OSV-Scanner:             ${OSV_VERSION}
  Trivy:                   ${TRIVY_VERSION}
  OWASP Dependency-Check:  ${DEPENDENCY_CHECK_VERSION}
  Checkov:                 ${CHECKOV_VERSION}
  Prowler:                 ${PROWLER_VERSION}
  ScoutSuite:              ${SCOUTSUITE_VERSION}

Exit codes:
  0  All required checks passed.
  1  One or more required checks failed, or --fail-on-warning was triggered.
  2  Invalid command-line arguments.
USAGE
}

log()  { printf '\n[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
warn() { printf '\n[%s] WARN: %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
err()  { printf '\n[%s] ERROR: %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }

is_true() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

is_non_negative_integer() {
  [[ "${1:-}" =~ ^[0-9]+$ ]]
}

sanitize_field() {
  printf '%s' "${1:-}" | tr '\t\r\n' '   '
}

now_ms() {
  date +%s%3N 2>/dev/null || echo "$(( $(date +%s) * 1000 ))"
}

elapsed_ms() {
  local started="$1"
  local ended
  ended="$(now_ms)"
  echo "$(( ended - started ))"
}

record_check() {
  local name="$1"
  local label="$2"
  local category="$3"
  local required="$4"
  local status="$5"       # healthy | warning | failed | skipped
  local reason="$6"
  local expected="$7"
  local actual="$8"
  local path="$9"
  local duration_ms="${10}"
  local message="${11}"

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$(sanitize_field "$name")" \
    "$(sanitize_field "$label")" \
    "$(sanitize_field "$category")" \
    "$(sanitize_field "$required")" \
    "$(sanitize_field "$status")" \
    "$(sanitize_field "$reason")" \
    "$(sanitize_field "$expected")" \
    "$(sanitize_field "$actual")" \
    "$(sanitize_field "$path")" \
    "$(sanitize_field "$duration_ms")" \
    "$(sanitize_field "$message")" \
    >> "$RESULTS_TSV"

  case "$status" in
    healthy) HEALTHY=$((HEALTHY + 1)) ;;
    warning) WARNINGS=$((WARNINGS + 1)) ;;
    failed)  FAILURES=$((FAILURES + 1)) ;;
    skipped) SKIPPED=$((SKIPPED + 1)) ;;
  esac

  local icon="✅"
  case "$status" in
    warning) icon="⚠️" ;;
    failed)  icon="❌" ;;
    skipped) icon="⚪" ;;
  esac

  printf '%s %-28s %s' "$icon" "$label" "$status"
  [[ -n "$actual" ]] && printf ' — %s' "$actual"
  [[ -n "$message" ]] && printf ' (%s)' "$message"
  printf '\n'
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --report)
        [[ $# -ge 2 ]] || { err "--report requires a path"; exit 2; }
        REPORT_FILE="$2"
        shift 2
        ;;
      --skip-cloud-tools)
        CHECK_CLOUD_TOOLS="false"
        shift
        ;;
      --skip-dependency-check)
        CHECK_DEPENDENCY_CHECK="false"
        shift
        ;;
      --skip-zap-check)
        CHECK_ZAP="false"
        shift
        ;;
      --require-zap)
        REQUIRE_ZAP="true"
        CHECK_ZAP="true"
        shift
        ;;
      --require-databases)
        REQUIRE_DATABASES="true"
        shift
        ;;
      --allow-version-drift)
        EXACT_VERSIONS="false"
        shift
        ;;
      --db-max-age-hours)
        [[ $# -ge 2 ]] || { err "--db-max-age-hours requires a number"; exit 2; }
        is_non_negative_integer "$2" || { err "Invalid --db-max-age-hours value: $2"; exit 2; }
        DB_MAX_AGE_HOURS="$2"
        shift 2
        ;;
      --command-timeout)
        [[ $# -ge 2 ]] || { err "--command-timeout requires a number"; exit 2; }
        is_non_negative_integer "$2" || { err "Invalid --command-timeout value: $2"; exit 2; }
        [[ "$2" -gt 0 ]] || { err "--command-timeout must be greater than zero"; exit 2; }
        COMMAND_TIMEOUT="$2"
        shift 2
        ;;
      --fail-on-warning)
        FAIL_ON_WARNING="true"
        shift
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        err "Unknown option: $1"
        usage
        exit 2
        ;;
    esac
  done
}

resolve_command() {
  local command_name="$1"
  shift

  local resolved
  resolved="$(command -v "$command_name" 2>/dev/null || true)"
  if [[ -n "$resolved" && -x "$resolved" ]]; then
    printf '%s\n' "$resolved"
    return 0
  fi

  local candidate
  for candidate in "$@"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

extract_semver() {
  local text="${1:-}"
  printf '%s\n' "$text" | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+([+~-][0-9A-Za-z.-]+)?' | head -n 1 | sed -E 's/[+~-].*$//' || true
}

version_ge() {
  local actual="$1"
  local minimum="$2"
  [[ -n "$actual" && -n "$minimum" ]] || return 1
  [[ "$(printf '%s\n%s\n' "$minimum" "$actual" | sort -V | head -n 1)" == "$minimum" ]]
}

version_lt() {
  local actual="$1"
  local maximum="$2"
  [[ -n "$actual" && -n "$maximum" ]] || return 1
  [[ "$actual" != "$maximum" ]] && [[ "$(printf '%s\n%s\n' "$actual" "$maximum" | sort -V | head -n 1)" == "$actual" ]]
}

capture_command() {
  local output_file="$1"
  shift

  : > "$output_file"
  timeout --signal=TERM --kill-after=2s "$COMMAND_TIMEOUT" "$@" > "$output_file" 2>&1
}

check_presence() {
  local name="$1"
  local label="$2"
  local category="$3"
  local required="$4"
  local command_name="$5"
  shift 5

  local started path duration
  started="$(now_ms)"
  path="$(resolve_command "$command_name" "$@" || true)"
  duration="$(elapsed_ms "$started")"

  if [[ -z "$path" ]]; then
    if is_true "$required"; then
      record_check "$name" "$label" "$category" "$required" "failed" "missing" "installed" "missing" "" "$duration" "Required command is not available"
    else
      record_check "$name" "$label" "$category" "$required" "warning" "missing" "optional" "missing" "" "$duration" "Optional command is not available"
    fi
    return 1
  fi

  record_check "$name" "$label" "$category" "$required" "healthy" "present" "installed" "present" "$path" "$duration" ""
  return 0
}

check_exact_version() {
  local name="$1"
  local label="$2"
  local category="$3"
  local required="$4"
  local command_name="$5"
  local expected="$6"
  local fallback="$7"
  shift 7
  local version_args=("$@")

  local started path output_file rc raw actual duration
  started="$(now_ms)"
  path="$(resolve_command "$command_name" "$fallback" || true)"

  if [[ -z "$path" ]]; then
    duration="$(elapsed_ms "$started")"
    if is_true "$required"; then
      record_check "$name" "$label" "$category" "$required" "failed" "missing" "$expected" "missing" "" "$duration" "Required scanner is not installed"
    else
      record_check "$name" "$label" "$category" "$required" "warning" "missing" "$expected" "missing" "" "$duration" "Optional scanner is not installed"
    fi
    return 1
  fi

  output_file="$(mktemp /tmp/vm-health-command.XXXXXX)"
  if capture_command "$output_file" "$path" "${version_args[@]}"; then
    rc=0
  else
    rc=$?
  fi
  raw="$(head -c 2048 "$output_file" | tr '\r\n' '  ' | sed -E 's/[[:space:]]+/ /g' | sed -E 's/^ +| +$//g')"
  rm -f "$output_file"
  actual="$(extract_semver "$raw")"
  duration="$(elapsed_ms "$started")"

  if [[ "$rc" -ne 0 ]]; then
    if is_true "$required"; then
      record_check "$name" "$label" "$category" "$required" "failed" "command_failed" "$expected" "${actual:-unknown}" "$path" "$duration" "Version command exited with code $rc"
    else
      record_check "$name" "$label" "$category" "$required" "warning" "command_failed" "$expected" "${actual:-unknown}" "$path" "$duration" "Version command exited with code $rc"
    fi
    return 1
  fi

  if [[ -z "$actual" ]]; then
    if is_true "$required"; then
      record_check "$name" "$label" "$category" "$required" "failed" "unparseable_version" "$expected" "${raw:-unknown}" "$path" "$duration" "Could not parse semantic version"
    else
      record_check "$name" "$label" "$category" "$required" "warning" "unparseable_version" "$expected" "${raw:-unknown}" "$path" "$duration" "Could not parse semantic version"
    fi
    return 1
  fi

  if is_true "$EXACT_VERSIONS" && [[ "$actual" != "$expected" ]]; then
    if is_true "$required"; then
      record_check "$name" "$label" "$category" "$required" "failed" "version_mismatch" "$expected" "$actual" "$path" "$duration" "Pinned version mismatch"
    else
      record_check "$name" "$label" "$category" "$required" "warning" "version_mismatch" "$expected" "$actual" "$path" "$duration" "Pinned version mismatch"
    fi
    return 1
  fi

  local message=""
  if ! is_true "$EXACT_VERSIONS" && [[ "$actual" != "$expected" ]]; then
    message="Version drift allowed; pinned version is $expected"
  fi

  record_check "$name" "$label" "$category" "$required" "healthy" "version_ok" "$expected" "$actual" "$path" "$duration" "$message"
  return 0
}

check_minimum_major() {
  local name="$1"
  local label="$2"
  local category="$3"
  local required="$4"
  local command_name="$5"
  local minimum_major="$6"
  local fallback="$7"
  shift 7
  local version_args=("$@")

  local started path output_file rc raw actual major duration
  started="$(now_ms)"
  path="$(resolve_command "$command_name" "$fallback" || true)"

  if [[ -z "$path" ]]; then
    duration="$(elapsed_ms "$started")"
    record_check "$name" "$label" "$category" "$required" "failed" "missing" ">=${minimum_major}.0.0" "missing" "" "$duration" "Required runtime is not installed"
    return 1
  fi

  output_file="$(mktemp /tmp/vm-health-command.XXXXXX)"
  if capture_command "$output_file" "$path" "${version_args[@]}"; then rc=0; else rc=$?; fi
  raw="$(head -c 2048 "$output_file" | tr '\r\n' '  ' | sed -E 's/[[:space:]]+/ /g' | sed -E 's/^ +| +$//g')"
  rm -f "$output_file"
  actual="$(extract_semver "$raw")"
  major="${actual%%.*}"
  duration="$(elapsed_ms "$started")"

  if [[ "$rc" -ne 0 || -z "$actual" || ! "$major" =~ ^[0-9]+$ ]]; then
    record_check "$name" "$label" "$category" "$required" "failed" "runtime_check_failed" ">=${minimum_major}.0.0" "${actual:-unknown}" "$path" "$duration" "Could not verify runtime version"
    return 1
  fi

  if (( major < minimum_major )); then
    record_check "$name" "$label" "$category" "$required" "failed" "version_too_old" ">=${minimum_major}.0.0" "$actual" "$path" "$duration" "Runtime major version is below minimum"
    return 1
  fi

  record_check "$name" "$label" "$category" "$required" "healthy" "version_ok" ">=${minimum_major}.0.0" "$actual" "$path" "$duration" ""
  return 0
}

check_python_range() {
  local started path output_file rc raw actual duration
  started="$(now_ms)"
  path="$(resolve_command python3 "" || true)"

  if [[ -z "$path" ]]; then
    duration="$(elapsed_ms "$started")"
    record_check "python3" "Python" "runtime" "true" "failed" "missing" ">=${PYTHON_MIN_VERSION},<${PYTHON_MAX_VERSION_EXCLUSIVE}" "missing" "" "$duration" "Python is required by pipx scanners"
    return 1
  fi

  output_file="$(mktemp /tmp/vm-health-command.XXXXXX)"
  if capture_command "$output_file" "$path" --version; then rc=0; else rc=$?; fi
  raw="$(cat "$output_file")"
  rm -f "$output_file"
  actual="$(extract_semver "$raw")"
  duration="$(elapsed_ms "$started")"

  if [[ "$rc" -ne 0 || -z "$actual" ]]; then
    record_check "python3" "Python" "runtime" "true" "failed" "runtime_check_failed" ">=${PYTHON_MIN_VERSION},<${PYTHON_MAX_VERSION_EXCLUSIVE}" "${actual:-unknown}" "$path" "$duration" "Could not verify Python version"
    return 1
  fi

  if ! version_ge "$actual" "$PYTHON_MIN_VERSION" || ! version_lt "$actual" "$PYTHON_MAX_VERSION_EXCLUSIVE"; then
    record_check "python3" "Python" "runtime" "true" "failed" "unsupported_version" ">=${PYTHON_MIN_VERSION},<${PYTHON_MAX_VERSION_EXCLUSIVE}" "$actual" "$path" "$duration" "Python version is outside the supported scanner range"
    return 1
  fi

  record_check "python3" "Python" "runtime" "true" "healthy" "version_ok" ">=${PYTHON_MIN_VERSION},<${PYTHON_MAX_VERSION_EXCLUSIVE}" "$actual" "$path" "$duration" ""
  return 0
}

newest_file_in_dirs() {
  local pattern="$1"
  shift

  local dir result=""
  for dir in "$@"; do
    [[ -n "$dir" && -d "$dir" ]] || continue
    result="$(find "$dir" -maxdepth 4 -type f -name "$pattern" -printf '%T@\t%p\n' 2>/dev/null | sort -nr | head -n 1 || true)"
    if [[ -n "$result" ]]; then
      printf '%s\n' "${result#*$'\t'}"
      return 0
    fi
  done
  return 1
}

file_age_hours() {
  local file="$1"
  local modified now
  modified="$(stat -c %Y "$file" 2>/dev/null || echo 0)"
  now="$(date +%s)"
  if [[ "$modified" -le 0 || "$now" -lt "$modified" ]]; then
    echo 0
  else
    echo "$(( (now - modified) / 3600 ))"
  fi
}

check_database_file() {
  local name="$1"
  local label="$2"
  local required="$3"
  local pattern="$4"
  shift 4
  local dirs=("$@")

  local started file age duration
  started="$(now_ms)"
  file="$(newest_file_in_dirs "$pattern" "${dirs[@]}" || true)"
  duration="$(elapsed_ms "$started")"

  if [[ -z "$file" ]]; then
    if is_true "$required"; then
      record_check "$name" "$label" "database" "$required" "failed" "database_missing" "local database data" "missing" "" "$duration" "Run one authorized scan or database update to initialize the cache"
    else
      record_check "$name" "$label" "database" "$required" "warning" "database_missing" "local database data" "missing" "" "$duration" "Cache will normally be downloaded on the first authorized scan"
    fi
    return 1
  fi

  age="$(file_age_hours "$file")"
  if (( age > DB_MAX_AGE_HOURS )); then
    if is_true "$required"; then
      record_check "$name" "$label" "database" "$required" "failed" "database_stale" "<=${DB_MAX_AGE_HOURS}h" "${age}h" "$file" "$duration" "Local scanner data is older than the allowed threshold"
    else
      record_check "$name" "$label" "database" "$required" "warning" "database_stale" "<=${DB_MAX_AGE_HOURS}h" "${age}h" "$file" "$duration" "Local scanner data is older than the recommended threshold"
    fi
    return 1
  fi

  record_check "$name" "$label" "database" "$required" "healthy" "database_ready" "<=${DB_MAX_AGE_HOURS}h" "${age}h" "$file" "$duration" ""
  return 0
}

check_docker_zap() {
  local required="$1"
  local started docker_path duration output_file rc image
  started="$(now_ms)"
  docker_path="$(resolve_command docker "" || true)"

  if [[ -z "$docker_path" ]]; then
    duration="$(elapsed_ms "$started")"
    if is_true "$required"; then
      record_check "zap" "OWASP ZAP Docker" "optional_scanner" "$required" "failed" "docker_missing" "Docker daemon and approved ZAP image" "missing" "" "$duration" "Docker is required for VM_ZAP_RUN_MODE=docker"
    else
      record_check "zap" "OWASP ZAP Docker" "optional_scanner" "$required" "warning" "docker_missing" "Docker daemon and approved ZAP image" "missing" "" "$duration" "ZAP Docker mode is unavailable"
    fi
    return 1
  fi

  output_file="$(mktemp /tmp/vm-health-command.XXXXXX)"
  if capture_command "$output_file" "$docker_path" info --format '{{json .ServerVersion}}'; then rc=0; else rc=$?; fi
  rm -f "$output_file"
  if [[ "$rc" -ne 0 ]]; then
    duration="$(elapsed_ms "$started")"
    if is_true "$required"; then
      record_check "zap" "OWASP ZAP Docker" "optional_scanner" "$required" "failed" "docker_daemon_unavailable" "Docker daemon and approved ZAP image" "daemon unavailable" "$docker_path" "$duration" "Current user cannot reach the Docker daemon"
    else
      record_check "zap" "OWASP ZAP Docker" "optional_scanner" "$required" "warning" "docker_daemon_unavailable" "Docker daemon and approved ZAP image" "daemon unavailable" "$docker_path" "$duration" "Current user cannot reach the Docker daemon"
    fi
    return 1
  fi

  image="${VM_ZAP_DOCKER_IMAGE:-}"
  if [[ -z "$image" ]]; then
    duration="$(elapsed_ms "$started")"
    if is_true "$required"; then
      record_check "zap" "OWASP ZAP Docker" "optional_scanner" "$required" "failed" "image_not_configured" "Approved immutable image" "not configured" "$docker_path" "$duration" "Set VM_ZAP_DOCKER_IMAGE; prefer an @sha256 digest"
    else
      record_check "zap" "OWASP ZAP Docker" "optional_scanner" "$required" "warning" "image_not_configured" "Approved immutable image" "not configured" "$docker_path" "$duration" "Docker is healthy, but no ZAP image is configured"
    fi
    return 1
  fi

  output_file="$(mktemp /tmp/vm-health-command.XXXXXX)"
  if capture_command "$output_file" "$docker_path" image inspect "$image"; then rc=0; else rc=$?; fi
  rm -f "$output_file"
  duration="$(elapsed_ms "$started")"

  if [[ "$rc" -ne 0 ]]; then
    if is_true "$required"; then
      record_check "zap" "OWASP ZAP Docker" "optional_scanner" "$required" "failed" "image_missing" "$image" "not present locally" "$docker_path" "$duration" "Pull the approved image before running ZAP scans"
    else
      record_check "zap" "OWASP ZAP Docker" "optional_scanner" "$required" "warning" "image_missing" "$image" "not present locally" "$docker_path" "$duration" "Configured ZAP image is not present locally"
    fi
    return 1
  fi

  local message=""
  if [[ "$image" != *@sha256:* ]]; then
    message="Image uses a mutable tag; an @sha256 digest is recommended"
    record_check "zap" "OWASP ZAP Docker" "optional_scanner" "$required" "warning" "mutable_image" "Immutable @sha256 image" "$image" "$docker_path" "$duration" "$message"
    return 0
  fi

  record_check "zap" "OWASP ZAP Docker" "optional_scanner" "$required" "healthy" "ready" "$image" "$image" "$docker_path" "$duration" ""
  return 0
}

check_local_zap() {
  local required="$1"
  local started path duration
  started="$(now_ms)"
  path="$(resolve_command zap-baseline.py "/usr/local/bin/zap-baseline.py" || true)"
  duration="$(elapsed_ms "$started")"

  if [[ -z "$path" ]]; then
    if is_true "$required"; then
      record_check "zap" "OWASP ZAP baseline" "optional_scanner" "$required" "failed" "missing" "zap-baseline.py" "missing" "" "$duration" "Install ZAP locally or use Docker mode"
    else
      record_check "zap" "OWASP ZAP baseline" "optional_scanner" "$required" "warning" "missing" "zap-baseline.py" "missing" "" "$duration" "Local ZAP mode is unavailable"
    fi
    return 1
  fi

  record_check "zap" "OWASP ZAP baseline" "optional_scanner" "$required" "healthy" "present" "zap-baseline.py" "present" "$path" "$duration" ""
  return 0
}

write_report() {
  local completed_at completed_epoch_ms duration_ms overall_status
  completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  completed_epoch_ms="$(now_ms)"
  duration_ms="$(( completed_epoch_ms - STARTED_EPOCH_MS ))"

  overall_status="healthy"
  if [[ "$FAILURES" -gt 0 ]]; then
    overall_status="unhealthy"
  elif [[ "$WARNINGS" -gt 0 ]]; then
    overall_status="degraded"
  fi

  mkdir -p "$(dirname "$REPORT_FILE")"

  if command -v python3 >/dev/null 2>&1; then
    python3 - "$RESULTS_TSV" "$REPORT_FILE" <<PY
import csv
import json
import pathlib
import platform
import sys

results_path = pathlib.Path(sys.argv[1])
report_path = pathlib.Path(sys.argv[2])
checks = []

if results_path.exists():
    with results_path.open("r", encoding="utf-8", errors="replace", newline="") as handle:
        for row in csv.reader(handle, delimiter="\t"):
            row += [""] * (11 - len(row))
            name, label, category, required, status, reason, expected, actual, path, duration_ms, message = row[:11]
            checks.append({
                "name": name,
                "label": label,
                "category": category,
                "required": required.lower() == "true",
                "status": status,
                "reason": reason or None,
                "expectedVersion": expected or None,
                "actualVersion": actual or None,
                "path": path or None,
                "durationMs": int(duration_ms or 0),
                "message": message or None,
            })

report = {
    "schemaVersion": "1.0",
    "checkerVersion": "${SCRIPT_VERSION}",
    "runId": "${RUN_ID}",
    "status": "${overall_status}",
    "startedAt": "${STARTED_AT}",
    "completedAt": "${completed_at}",
    "durationMs": ${duration_ms},
    "configuration": {
        "exactVersions": "${EXACT_VERSIONS}".lower() == "true",
        "cloudToolsChecked": "${CHECK_CLOUD_TOOLS}".lower() == "true",
        "dependencyCheckChecked": "${CHECK_DEPENDENCY_CHECK}".lower() == "true",
        "zapChecked": "${CHECK_ZAP}".lower() == "true",
        "zapRequired": "${REQUIRE_ZAP}".lower() == "true",
        "databasesRequired": "${REQUIRE_DATABASES}".lower() == "true",
        "databaseMaxAgeHours": ${DB_MAX_AGE_HOURS},
        "commandTimeoutSeconds": ${COMMAND_TIMEOUT},
    },
    "host": {
        "hostname": platform.node(),
        "system": platform.system(),
        "machine": platform.machine(),
    },
    "counts": {
        "total": len(checks),
        "healthy": ${HEALTHY},
        "warnings": ${WARNINGS},
        "failures": ${FAILURES},
        "skipped": ${SKIPPED},
    },
    "checks": checks,
}

report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
PY
  elif command -v jq >/dev/null 2>&1; then
    jq -n \
      --arg schemaVersion "1.0" \
      --arg checkerVersion "$SCRIPT_VERSION" \
      --arg runId "$RUN_ID" \
      --arg status "$overall_status" \
      --arg startedAt "$STARTED_AT" \
      --arg completedAt "$completed_at" \
      --argjson durationMs "$duration_ms" \
      --argjson healthy "$HEALTHY" \
      --argjson warnings "$WARNINGS" \
      --argjson failures "$FAILURES" \
      --argjson skipped "$SKIPPED" \
      '{schemaVersion:$schemaVersion,checkerVersion:$checkerVersion,runId:$runId,status:$status,startedAt:$startedAt,completedAt:$completedAt,durationMs:$durationMs,counts:{healthy:$healthy,warnings:$warnings,failures:$failures,skipped:$skipped},checks:[]}' \
      > "$REPORT_FILE"
  else
    err "Could not write JSON report because both Python and jq are unavailable"
    return 1
  fi

  chmod 0600 "$REPORT_FILE" 2>/dev/null || true
  log "Health report: $REPORT_FILE"
}

print_summary() {
  local status="healthy"
  if [[ "$FAILURES" -gt 0 ]]; then
    status="unhealthy"
  elif [[ "$WARNINGS" -gt 0 ]]; then
    status="degraded"
  fi

  echo ""
  echo "======================================"
  echo "Scanner Health Result"
  echo "======================================"
  printf 'Status:    %s\n' "$status"
  printf 'Healthy:   %s\n' "$HEALTHY"
  printf 'Warnings:  %s\n' "$WARNINGS"
  printf 'Failures:  %s\n' "$FAILURES"
  printf 'Skipped:   %s\n' "$SKIPPED"
  printf 'Report:    %s\n' "$REPORT_FILE"
  echo "======================================"
}

main() {
  parse_args "$@"

  RESULTS_TSV="$(mktemp /tmp/vm-scanner-health.XXXXXX)"
  trap 'rm -f "${RESULTS_TSV:-}"' EXIT INT TERM

  log "VM scanner health checker ${SCRIPT_VERSION}"
  log "Exact pinned versions: ${EXACT_VERSIONS}"

  # Core command-line dependencies.
  check_presence "git" "Git" "core" "true" "git" || true
  check_presence "jq" "jq" "core" "true" "jq" || true
  check_presence "timeout" "GNU timeout" "core" "true" "timeout" || true
  check_presence "curl" "curl" "core" "true" "curl" || true

  check_python_range || true
  check_minimum_major "node" "Node.js" "runtime" "true" "node" "$NODE_MIN_MAJOR" "" --version || true
  check_minimum_major "npm" "npm" "runtime" "true" "npm" "$NPM_MIN_MAJOR" "" --version || true

  # Repository and source-code scanners.
  check_exact_version "semgrep" "Semgrep" "scanner" "true" "semgrep" "$SEMGREP_VERSION" "$HOME/.local/bin/semgrep" --version || true
  check_exact_version "gitleaks" "Gitleaks" "scanner" "true" "gitleaks" "$GITLEAKS_VERSION" "/usr/local/bin/gitleaks" version || true
  check_exact_version "osv-scanner" "OSV-Scanner" "scanner" "true" "osv-scanner" "$OSV_VERSION" "/usr/local/bin/osv-scanner" --version || true
  check_exact_version "trivy" "Trivy" "scanner" "true" "trivy" "$TRIVY_VERSION" "/usr/local/bin/trivy" --version || true
  check_presence "nmap" "Nmap" "scanner" "true" "nmap" "/usr/bin/nmap" || true

  if is_true "$CHECK_DEPENDENCY_CHECK"; then
    check_minimum_major "java" "Java" "runtime" "true" "java" "$JAVA_MIN_MAJOR" "" -version || true
    check_exact_version "dependency-check" "OWASP Dependency-Check" "scanner" "true" "dependency-check.sh" "$DEPENDENCY_CHECK_VERSION" "/usr/local/bin/dependency-check.sh" --version || true
  else
    record_check "java" "Java" "runtime" "false" "skipped" "disabled" "not requested" "not checked" "" "0" "Dependency-Check checks disabled"
    record_check "dependency-check" "OWASP Dependency-Check" "scanner" "false" "skipped" "disabled" "$DEPENDENCY_CHECK_VERSION" "not checked" "" "0" "Dependency-Check checks disabled"
  fi

  if is_true "$CHECK_CLOUD_TOOLS"; then
    check_exact_version "checkov" "Checkov" "scanner" "true" "checkov" "$CHECKOV_VERSION" "$HOME/.local/bin/checkov" --version || true
    check_exact_version "prowler" "Prowler" "scanner" "true" "prowler" "$PROWLER_VERSION" "$HOME/.local/bin/prowler" -v || true
    check_exact_version "scoutsuite" "ScoutSuite" "scanner" "true" "scout" "$SCOUTSUITE_VERSION" "$HOME/.local/bin/scout" --version || true
  else
    record_check "checkov" "Checkov" "scanner" "false" "skipped" "disabled" "$CHECKOV_VERSION" "not checked" "" "0" "Cloud scanner checks disabled"
    record_check "prowler" "Prowler" "scanner" "false" "skipped" "disabled" "$PROWLER_VERSION" "not checked" "" "0" "Cloud scanner checks disabled"
    record_check "scoutsuite" "ScoutSuite" "scanner" "false" "skipped" "disabled" "$SCOUTSUITE_VERSION" "not checked" "" "0" "Cloud scanner checks disabled"
  fi

  # Local cache/database readiness is advisory unless explicitly required.
  local trivy_required="false"
  local dependency_db_required="false"
  is_true "$REQUIRE_DATABASES" && trivy_required="true"
  is_true "$REQUIRE_DATABASES" && is_true "$CHECK_DEPENDENCY_CHECK" && dependency_db_required="true"

  check_database_file \
    "trivy-db" "Trivy vulnerability DB" "$trivy_required" "trivy.db" \
    "${TRIVY_CACHE_DIR:-}" \
    "${VM_TRIVY_CACHE_DIR:-}" \
    "$HOME/.cache/trivy" \
    "/var/lib/trivy" \
    "/var/lib/vm-scanners/trivy" || true

  if is_true "$CHECK_DEPENDENCY_CHECK"; then
    check_database_file \
      "dependency-check-db" "Dependency-Check DB" "$dependency_db_required" "odc.mv.db" \
      "${VM_DEPENDENCY_CHECK_DATA_DIR:-}" \
      "/var/lib/vm-scanners/dependency-check" \
      "$HOME/.cache/vm-scanners/dependency-check" \
      "/opt/dependency-check/data" || true
  fi

  if is_true "$CHECK_ZAP"; then
    case "${VM_ZAP_RUN_MODE:-docker}" in
      docker) check_docker_zap "$REQUIRE_ZAP" || true ;;
      local)  check_local_zap "$REQUIRE_ZAP" || true ;;
      *)
        if is_true "$REQUIRE_ZAP"; then
          record_check "zap" "OWASP ZAP" "optional_scanner" "true" "failed" "invalid_mode" "docker|local" "${VM_ZAP_RUN_MODE:-}" "" "0" "VM_ZAP_RUN_MODE must be docker or local"
        else
          record_check "zap" "OWASP ZAP" "optional_scanner" "false" "warning" "invalid_mode" "docker|local" "${VM_ZAP_RUN_MODE:-}" "" "0" "Ignoring invalid optional ZAP mode"
        fi
        ;;
    esac
  else
    record_check "zap" "OWASP ZAP" "optional_scanner" "false" "skipped" "disabled" "not requested" "not checked" "" "0" "ZAP readiness check disabled"
  fi

  write_report || true
  print_summary

  if [[ "$FAILURES" -gt 0 ]]; then
    exit 1
  fi
  if is_true "$FAIL_ON_WARNING" && [[ "$WARNINGS" -gt 0 ]]; then
    exit 1
  fi
  exit 0
}

main "$@"