#!/usr/bin/env bash

set -euo pipefail
umask 077

export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"

REPO_URL=""
BRANCH="main"
SCANNER="all"
OUTPUT_DIR="./scanner-results"
WORKSPACE=""
TARGET_PATH=""
KEEP_WORKSPACE="false"
PARALLEL="true"
FAIL_ON_SCANNER_ERROR="false"
WORKSPACE_CREATED_BY_SCRIPT="false"

# VM metadata written to summary.json for backend parsing and auditing.
SOURCE_TYPE=""
SCAN_CATEGORY=""
TARGET=""
TARGET_URL=""
TARGET_IMAGE=""
TARGET_HOST=""
TARGET_PORT=""
API_SPEC_URL=""
API_SPEC_FILE=""

# Token handling. Prefer VM_REPO_TOKEN or --repo-token-file over --repo-token.
REPO_TOKEN="${VM_REPO_TOKEN:-}"
REPO_TOKEN_FILE=""
REPO_USERNAME="${VM_REPO_USERNAME:-x-access-token}"
ASKPASS_SCRIPT=""
TOKEN_PROVIDED="false"

SCAN_STARTED_AT_EPOCH="$(date +%s)"
SCAN_STARTED_AT_ISO="$(date -Iseconds)"

# Timeout and performance tunables.
: "${VM_SCAN_TIMEOUT:=900}"
: "${VM_SEMGREP_TIMEOUT:=$VM_SCAN_TIMEOUT}"
: "${VM_NPM_AUDIT_TIMEOUT:=600}"
: "${VM_GITLEAKS_TIMEOUT:=600}"
: "${VM_OSV_TIMEOUT:=$VM_SCAN_TIMEOUT}"
: "${VM_TRIVY_TIMEOUT:=$VM_SCAN_TIMEOUT}"
: "${VM_NPM_CACHE:=/tmp/vm-scanner-npm-cache}"
: "${VM_SEMGREP_JOBS:=2}"
: "${VM_SEMGREP_MAX_MEMORY:=2048}"
: "${VM_NPM_GENERATE_LOCKFILE:=false}"
: "${VM_GITLEAKS_FULL_HISTORY:=false}"
: "${VM_GIT_CLONE_DEPTH:=1}"

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/vm-scan.sh --repo <repo_url> [--branch main] [--scanner all] [--output ./scanner-results]
  bash scripts/vm-scan.sh --target-path <local_path> [--scanner trivy_iac] [--output ./scanner-results]

Private repo token options:
  VM_REPO_TOKEN=<token> bash scripts/vm-scan.sh --repo <clean_repo_url>
  bash scripts/vm-scan.sh --repo <clean_repo_url> --repo-token-file /secure/token/file

Options:
  --repo <url>                 Git repository URL to clone
  --repo-token <token>         Token for private repo clone. Avoid: it may appear in the process list
  --repo-token-file <file>     File containing repo token. Recommended for backend/server usage
  --repo-username <username>   Git username for token auth. Default: x-access-token
  --branch <branch>            Git branch to scan. Default: main
  --scanner <name>             npm_audit | semgrep | gitleaks | osv | trivy_iac | trivy_fs | all
  --source-type <type>         github | gitlab | bitbucket | local_path | web_url | docker_image | ip_address etc.
  --scan-category <category>   Optional category override for backend/audit metadata
  --target <value>             Generic target value for backend/audit metadata
  --target-url <url>           URL target metadata
  --target-image <image>       Container image target metadata
  --target-host <host>         Host/IP target metadata
  --target-port <port>         Port metadata
  --api-spec-url <url>         OpenAPI/Postman spec URL metadata
  --api-spec-file <file>       OpenAPI/Postman spec file metadata
  --output <dir>               Output directory. Default: ./scanner-results
  --workspace <dir>            Workspace directory for clone
  --target-path <dir>          Scan an existing local directory instead of cloning
  --keep-workspace             Do not delete a cloned workspace
  --sequential                 Run scanners one-by-one instead of parallel mode
  --fail-on-scanner-error      Exit non-zero if any scanner fails or times out
  --help                       Show help

Current runnable scanners:
  npm_audit     Dependency scan for Node.js packages
  osv           Dependency/SCA scan using the OSV database
  semgrep       SAST/code security scan
  gitleaks      Secret scan
  trivy_iac     IaC/configuration misconfiguration scan
  trivy_fs      Filesystem scan for vulnerabilities, secrets, IaC, and license risks

Important environment variables:
  VM_REPO_TOKEN                Token for private repository clone
  VM_REPO_USERNAME             Git username for token authentication
  VM_SCAN_TIMEOUT              Default scanner timeout in seconds. Default: 900
  VM_NPM_AUDIT_TIMEOUT         Default: 600 seconds
  VM_SEMGREP_TIMEOUT           Default: VM_SCAN_TIMEOUT
  VM_GITLEAKS_TIMEOUT          Default: 600 seconds
  VM_OSV_TIMEOUT               Default: VM_SCAN_TIMEOUT
  VM_TRIVY_TIMEOUT             Default: VM_SCAN_TIMEOUT
  VM_NPM_CACHE                 Default: /tmp/vm-scanner-npm-cache
  VM_SEMGREP_JOBS              Default: 2
  VM_SEMGREP_MAX_MEMORY        Default: 2048 MB
  VM_NPM_GENERATE_LOCKFILE     true to generate an inferred package-lock.json when missing. Default: false
  VM_GITLEAKS_FULL_HISTORY     true to clone full Git history. Default: false
  VM_GIT_CLONE_DEPTH           Shallow clone depth. Default: 1
USAGE
}

now_ms() {
  local value
  value="$(date +%s%3N 2>/dev/null || true)"
  if [[ "$value" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$value"
  else
    printf '%s\n' "$(( $(date +%s) * 1000 ))"
  fi
}

redact_repo_url() {
  local url="$1"
  printf '%s\n' "$url" | sed -E \
    -e 's#(https?://)[^/@]+@#\1***@#g' \
    -e 's#([?&](access_token|token|auth|key)=)[^&]+#\1***#Ig'
}

redact_text() {
  local text="${1:-}"
  if [[ -n "${REPO_TOKEN:-}" ]]; then
    text="${text//${REPO_TOKEN}/***}"
  fi
  printf '%s' "$text"
}

extract_token_from_repo_url_if_present() {
  if [[ "$REPO_URL" =~ ^(https?://)([^/@:\ ]+)(:([^/@\ ]+))?@(.+)$ ]]; then
    local protocol="${BASH_REMATCH[1]}"
    local username_part="${BASH_REMATCH[2]}"
    local password_part="${BASH_REMATCH[4]:-}"
    local rest="${BASH_REMATCH[5]}"

    if [[ -z "$REPO_TOKEN" ]]; then
      if [[ -n "$password_part" ]]; then
        REPO_TOKEN="$password_part"
      else
        REPO_TOKEN="$username_part"
      fi
    fi

    REPO_URL="${protocol}${rest}"
  fi
}

setup_git_askpass() {
  if [[ -z "$REPO_TOKEN" ]]; then
    return 0
  fi

  ASKPASS_SCRIPT="$(mktemp /tmp/vm-git-askpass.XXXXXX)"

  cat > "$ASKPASS_SCRIPT" <<'ASKPASS'
#!/usr/bin/env bash
case "$1" in
  *Username*|*username*)
    printf '%s\n' "${VM_GIT_USERNAME:-x-access-token}"
    ;;
  *Password*|*password*)
    printf '%s\n' "${VM_REPO_TOKEN:-}"
    ;;
  *)
    printf '%s\n' "${VM_REPO_TOKEN:-}"
    ;;
esac
ASKPASS

  chmod 700 "$ASKPASS_SCRIPT"
}

cleanup() {
  if [[ "$WORKSPACE_CREATED_BY_SCRIPT" == "true" && "$KEEP_WORKSPACE" != "true" && -n "${WORKSPACE:-}" ]]; then
    case "$WORKSPACE" in
      /tmp/vm-scan-*|/tmp/vm-scanner-*) rm -rf -- "$WORKSPACE" || true ;;
      *)
        # A caller-supplied workspace is removed only when it was empty/nonexistent before clone.
        rm -rf -- "$WORKSPACE" || true
        ;;
    esac
  fi

  if [[ -n "${ASKPASS_SCRIPT:-}" && -f "$ASKPASS_SCRIPT" ]]; then
    rm -f -- "$ASKPASS_SCRIPT" || true
  fi
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO_URL="${2:-}"
      shift 2
      ;;
    --repo-token)
      REPO_TOKEN="${2:-}"
      echo "WARNING: --repo-token may expose the token in the process list. Prefer VM_REPO_TOKEN or --repo-token-file." >&2
      shift 2
      ;;
    --repo-token-file)
      REPO_TOKEN_FILE="${2:-}"
      shift 2
      ;;
    --repo-username)
      REPO_USERNAME="${2:-x-access-token}"
      shift 2
      ;;
    --branch)
      BRANCH="${2:-main}"
      shift 2
      ;;
    --scanner)
      SCANNER="${2:-all}"
      shift 2
      ;;
    --source-type)
      SOURCE_TYPE="${2:-}"
      shift 2
      ;;
    --scan-category)
      SCAN_CATEGORY="${2:-}"
      shift 2
      ;;
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    --target-url)
      TARGET_URL="${2:-}"
      shift 2
      ;;
    --target-image)
      TARGET_IMAGE="${2:-}"
      shift 2
      ;;
    --target-host)
      TARGET_HOST="${2:-}"
      shift 2
      ;;
    --target-port)
      TARGET_PORT="${2:-}"
      shift 2
      ;;
    --api-spec-url)
      API_SPEC_URL="${2:-}"
      shift 2
      ;;
    --api-spec-file)
      API_SPEC_FILE="${2:-}"
      shift 2
      ;;
    --output)
      OUTPUT_DIR="${2:-./scanner-results}"
      shift 2
      ;;
    --workspace)
      WORKSPACE="${2:-}"
      shift 2
      ;;
    --target-path)
      TARGET_PATH="${2:-}"
      shift 2
      ;;
    --keep-workspace)
      KEEP_WORKSPACE="true"
      shift
      ;;
    --sequential)
      PARALLEL="false"
      shift
      ;;
    --fail-on-scanner-error)
      FAIL_ON_SCANNER_ERROR="true"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$REPO_TOKEN" && -n "$REPO_TOKEN_FILE" ]]; then
  if [[ ! -f "$REPO_TOKEN_FILE" ]]; then
    echo "Invalid --repo-token-file. File does not exist: $REPO_TOKEN_FILE" >&2
    exit 2
  fi

  REPO_TOKEN="$(tr -d '\r\n' < "$REPO_TOKEN_FILE")"
fi

if [[ -n "$REPO_TOKEN" ]]; then
  TOKEN_PROVIDED="true"
fi

if [[ -z "$REPO_URL" && -z "$TARGET_PATH" ]]; then
  echo "Missing required argument: --repo or --target-path" >&2
  usage >&2
  exit 2
fi

if [[ -n "$REPO_URL" && -n "$TARGET_PATH" ]]; then
  echo "Use only one source: --repo or --target-path" >&2
  exit 2
fi

if [[ -n "$REPO_URL" ]]; then
  extract_token_from_repo_url_if_present
  if [[ -n "$REPO_TOKEN" ]]; then
    TOKEN_PROVIDED="true"
  fi
fi

case "$SCANNER" in
  npm_audit|semgrep|gitleaks|osv|trivy_iac|trivy_fs|all) ;;
  *)
    echo "Invalid scanner: $SCANNER" >&2
    echo "Allowed values: npm_audit, semgrep, gitleaks, osv, trivy_iac, trivy_fs, all" >&2
    exit 2
    ;;
esac

SCANNERS_TO_RUN=()
case "$SCANNER" in
  all) SCANNERS_TO_RUN=(npm_audit semgrep gitleaks osv trivy_iac trivy_fs) ;;
  *) SCANNERS_TO_RUN=("$SCANNER") ;;
esac

if [[ -z "$SOURCE_TYPE" ]]; then
  if [[ -n "$TARGET_PATH" ]]; then
    SOURCE_TYPE="local_path"
  elif [[ "$REPO_URL" == *"gitlab"* ]]; then
    SOURCE_TYPE="gitlab"
  elif [[ "$REPO_URL" == *"bitbucket"* ]]; then
    SOURCE_TYPE="bitbucket"
  elif [[ "$REPO_URL" == *"github"* ]]; then
    SOURCE_TYPE="github"
  else
    SOURCE_TYPE="git"
  fi
fi

# Do not invent an unsupported "multi" enum value. For all scans, summary.json
# contains scanCategories as an array and scanCategory remains null unless supplied.
if [[ -z "$SCAN_CATEGORY" && "$SCANNER" != "all" ]]; then
  case "$SCANNER" in
    gitleaks) SCAN_CATEGORY="secret" ;;
    npm_audit|osv) SCAN_CATEGORY="dependency" ;;
    semgrep) SCAN_CATEGORY="sast" ;;
    trivy_iac) SCAN_CATEGORY="iac" ;;
    trivy_fs) SCAN_CATEGORY="" ;;
  esac
fi

if [[ -z "$TARGET" ]]; then
  TARGET="${REPO_URL:-${TARGET_PATH:-}}"
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required to generate validated machine-readable scanner results." >&2
  exit 127
fi

if ! command -v timeout >/dev/null 2>&1; then
  echo "GNU timeout is required to enforce scanner time limits." >&2
  exit 127
fi

if [[ -n "$REPO_URL" ]] && ! command -v git >/dev/null 2>&1; then
  echo "git is required when --repo is used." >&2
  exit 127
fi

OUTPUT_DIR="$(realpath -m "$OUTPUT_DIR")"
STATUS_DIR="$OUTPUT_DIR/scanner-status"
EVENTS_FILE="$OUTPUT_DIR/scan-events.jsonl"
EVENTS_LOCK_FILE="$OUTPUT_DIR/.events.lock"
SUMMARY_FILE="$OUTPUT_DIR/summary.json"
EXECUTION_SUMMARY_FILE="$OUTPUT_DIR/execution-summary.json"
ERRORS_FILE="$OUTPUT_DIR/errors.json"

mkdir -p "$OUTPUT_DIR" "$STATUS_DIR" "$VM_NPM_CACHE"
chmod 700 "$OUTPUT_DIR" "$STATUS_DIR" 2>/dev/null || true

# Remove only files generated by this script so stale reports cannot be reused.
rm -f -- \
  "$OUTPUT_DIR/npm-audit.json" "$OUTPUT_DIR/npm-audit.log" \
  "$OUTPUT_DIR/semgrep.json" "$OUTPUT_DIR/semgrep.log" \
  "$OUTPUT_DIR/gitleaks.json" "$OUTPUT_DIR/gitleaks.log" \
  "$OUTPUT_DIR/osv.json" "$OUTPUT_DIR/osv.log" \
  "$OUTPUT_DIR/trivy-iac.json" "$OUTPUT_DIR/trivy-iac.log" \
  "$OUTPUT_DIR/trivy-fs.json" "$OUTPUT_DIR/trivy-fs.log" \
  "$SUMMARY_FILE" "$EXECUTION_SUMMARY_FILE" "$ERRORS_FILE" \
  "$EVENTS_FILE" "$EVENTS_LOCK_FILE"
rm -f -- "$STATUS_DIR"/*.json 2>/dev/null || true
: > "$EVENTS_FILE"

append_event_line() {
  local line="$1"
  if command -v flock >/dev/null 2>&1; then
    (
      flock -x 200
      printf '%s\n' "$line" >> "$EVENTS_FILE"
    ) 200>"$EVENTS_LOCK_FILE"
  else
    printf '%s\n' "$line" >> "$EVENTS_FILE"
  fi
}

event() {
  local step="$1"
  local status="$2"
  local progress="$3"
  local message="${4:-}"
  local ts payload
  ts="$(date -Iseconds)"
  message="$(redact_text "$message")"

  payload="$(jq -cn \
    --arg ts "$ts" \
    --arg step "$step" \
    --arg status "$status" \
    --argjson progress "$progress" \
    --arg message "$message" \
    '{timestamp:$ts, step:$step, status:$status, progress:$progress, message:$message}')"

  append_event_line "$payload"
  printf '[%s%%] %s - %s%s\n' "$progress" "$step" "$status" "${message:+ - $message}"
}

resolve_tool() {
  local command_name="$1"
  local fallback_path="${2:-}"

  if command -v "$command_name" >/dev/null 2>&1; then
    command -v "$command_name"
    return 0
  fi

  if [[ -n "$fallback_path" && -x "$fallback_path" ]]; then
    printf '%s\n' "$fallback_path"
    return 0
  fi

  return 1
}

get_tool_version() {
  local scanner_name="$1"
  local binary="$2"
  local version="unknown"

  case "$scanner_name" in
    npm_audit) version="$($binary --version 2>/dev/null | head -n 1 || true)" ;;
    semgrep) version="$($binary --version 2>/dev/null | head -n 1 || true)" ;;
    gitleaks) version="$($binary version 2>/dev/null | head -n 1 || true)" ;;
    osv) version="$($binary --version 2>/dev/null | head -n 1 || true)" ;;
    trivy_iac|trivy_fs) version="$($binary --version 2>/dev/null | head -n 1 || true)" ;;
  esac

  version="${version:-unknown}"
  printf '%s\n' "$version"
}

write_scanner_result() {
  local scanner_name="$1"
  local status="$2"
  local exit_code="$3"
  local started_at="$4"
  local completed_at="$5"
  local duration_ms="$6"
  local tool_version="$7"
  local report_path="$8"
  local report_validated="$9"
  local finding_count="${10}"
  local error_message="${11}"
  local log_path="${12}"
  local scan_mode="${13:-}"
  local inferred="${14:-false}"

  error_message="$(redact_text "$error_message")"

  jq -n \
    --arg scanner "$scanner_name" \
    --arg status "$status" \
    --argjson exitCode "$exit_code" \
    --arg startedAt "$started_at" \
    --arg completedAt "$completed_at" \
    --argjson durationMs "$duration_ms" \
    --arg toolVersion "$tool_version" \
    --arg reportPath "$report_path" \
    --argjson reportValidated "$report_validated" \
    --argjson findingCount "$finding_count" \
    --arg error "$error_message" \
    --arg logPath "$log_path" \
    --arg scanMode "$scan_mode" \
    --argjson inferred "$inferred" \
    '{
      scanner: $scanner,
      status: $status,
      exitCode: $exitCode,
      startedAt: $startedAt,
      completedAt: $completedAt,
      durationMs: $durationMs,
      toolVersion: $toolVersion,
      report: {
        path: (if $reportPath == "" then null else $reportPath end),
        validated: $reportValidated
      },
      logPath: (if $logPath == "" then null else $logPath end),
      findingCount: $findingCount,
      error: (if $error == "" then null else $error end),
      scanMode: (if $scanMode == "" then null else $scanMode end),
      inferredInput: $inferred
    }' > "$STATUS_DIR/$scanner_name.json"
}

finish_scanner() {
  local scanner_name="$1"
  local status="$2"
  local exit_code="$3"
  local started_at="$4"
  local start_ms="$5"
  local tool_version="$6"
  local report_path="$7"
  local report_validated="$8"
  local finding_count="$9"
  local error_message="${10}"
  local log_path="${11}"
  local scan_mode="${12:-}"
  local inferred="${13:-false}"
  local completed_at end_ms duration_ms event_status

  completed_at="$(date -Iseconds)"
  end_ms="$(now_ms)"
  duration_ms=$(( end_ms - start_ms ))

  write_scanner_result \
    "$scanner_name" "$status" "$exit_code" "$started_at" "$completed_at" \
    "$duration_ms" "$tool_version" "$report_path" "$report_validated" \
    "$finding_count" "$error_message" "$log_path" "$scan_mode" "$inferred"

  case "$status" in
    success|findings_detected|skipped) event_status="$status" ;;
    *) event_status="failed" ;;
  esac
  event "$scanner_name" "$event_status" 80 "${error_message:-Scanner finished with status: $status}"

  case "$status" in
    failed|timed_out|partial) return 1 ;;
    *) return 0 ;;
  esac
}

validate_npm_report() {
  jq -e 'type == "object" and (has("vulnerabilities") or has("advisories") or has("metadata"))' "$1" >/dev/null 2>&1
}

validate_semgrep_report() {
  jq -e 'type == "object" and (.results | type == "array")' "$1" >/dev/null 2>&1
}

validate_gitleaks_report() {
  jq -e 'type == "array"' "$1" >/dev/null 2>&1
}

validate_osv_report() {
  jq -e 'type == "object" and (.results | type == "array")' "$1" >/dev/null 2>&1
}

validate_trivy_report() {
  jq -e 'type == "object" and (.Results | type == "array")' "$1" >/dev/null 2>&1
}

count_npm_findings() {
  jq -r '
    if (.metadata.vulnerabilities.total? | type) == "number" then
      .metadata.vulnerabilities.total
    elif (.vulnerabilities? | type) == "object" then
      (.vulnerabilities | length)
    elif (.advisories? | type) == "object" then
      (.advisories | length)
    else 0 end
  ' "$1"
}

count_semgrep_findings() {
  jq -r '.results | length' "$1"
}

count_gitleaks_findings() {
  jq -r 'length' "$1"
}

count_osv_findings() {
  jq -r '[.. | objects | .vulnerabilities? // empty | .[]?] | length' "$1"
}

count_trivy_findings() {
  jq -r '[
    .Results[]? |
    (.Vulnerabilities // [])[],
    (.Misconfigurations // [])[],
    (.Secrets // [])[],
    (.Licenses // [])[]
  ] | length' "$1"
}

classify_valid_report_status() {
  local exit_code="$1"
  local finding_count="$2"

  if [[ "$exit_code" -eq 124 || "$exit_code" -eq 137 ]]; then
    printf '%s\n' "timed_out"
  elif [[ "$exit_code" -eq 0 || "$exit_code" -eq 1 ]]; then
    if [[ "$finding_count" -gt 0 ]]; then
      printf '%s\n' "findings_detected"
    elif [[ "$exit_code" -eq 0 ]]; then
      printf '%s\n' "success"
    else
      printf '%s\n' "failed"
    fi
  elif [[ "$finding_count" -gt 0 ]]; then
    printf '%s\n' "partial"
  else
    printf '%s\n' "failed"
  fi
}

event "init" "running" 1 "Initializing vulnerability scan"

SAFE_REPO_URL="${REPO_URL:-N/A}"
printf '%s\n' "======================================"
printf '%s\n' "Vulnerability Scan Started"
printf '%s\n' "======================================"
printf 'Repo: %s\n' "$(redact_repo_url "$SAFE_REPO_URL")"
printf 'Target Path: %s\n' "${TARGET_PATH:-N/A}"
printf 'Source Type: %s\n' "$SOURCE_TYPE"
printf 'Scan Category: %s\n' "${SCAN_CATEGORY:-Multiple categories}"
printf 'Target: %s\n' "${TARGET:-N/A}"
printf 'Branch: %s\n' "$BRANCH"
printf 'Scanner: %s\n' "$SCANNER"
printf 'Output: %s\n' "$OUTPUT_DIR"
printf 'Parallel: %s\n' "$PARALLEL"
printf 'Repo Token: %s\n' "$([[ "$TOKEN_PROVIDED" == "true" ]] && echo Provided || echo 'Not Provided')"
printf '%s\n' "======================================"

event "tools_check" "running" 5 "Checking scanner infrastructure"
event "tools_check" "completed" 10 "Scanner infrastructure is available"

if [[ -n "$TARGET_PATH" ]]; then
  WORKSPACE="$(realpath -m "$TARGET_PATH")"

  if [[ ! -d "$WORKSPACE" ]]; then
    event "target_ready" "failed" 15 "Target path does not exist"
    echo "Invalid --target-path. Directory does not exist: $WORKSPACE" >&2
    exit 2
  fi

  event "target_ready" "completed" 20 "Using existing target path"
else
  if [[ -z "$WORKSPACE" ]]; then
    WORKSPACE="/tmp/vm-scan-$(date +%s)-$RANDOM"
  else
    WORKSPACE="$(realpath -m "$WORKSPACE")"
  fi

  if [[ -e "$WORKSPACE" && -n "$(find "$WORKSPACE" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
    event "clone_repository" "failed" 12 "Workspace already exists and is not empty"
    echo "Workspace already exists and is not empty: $WORKSPACE" >&2
    exit 2
  fi

  event "clone_repository" "running" 12 "Cloning repository"
  setup_git_askpass

  clone_args=(clone --single-branch --branch "$BRANCH")
  if [[ "$VM_GITLEAKS_FULL_HISTORY" != "true" ]]; then
    clone_args+=(--depth "$VM_GIT_CLONE_DEPTH")
  fi
  clone_args+=("$REPO_URL" "$WORKSPACE")

  if [[ -n "$REPO_TOKEN" ]]; then
    if GIT_TERMINAL_PROMPT=0 \
      GIT_ASKPASS="$ASKPASS_SCRIPT" \
      VM_REPO_TOKEN="$REPO_TOKEN" \
      VM_GIT_USERNAME="$REPO_USERNAME" \
      git -c credential.helper= "${clone_args[@]}"; then
      clone_rc=0
    else
      clone_rc=$?
    fi
  else
    if GIT_TERMINAL_PROMPT=0 git -c credential.helper= "${clone_args[@]}"; then
      clone_rc=0
    else
      clone_rc=$?
    fi
  fi

  if [[ "$clone_rc" -ne 0 ]]; then
    event "clone_repository" "failed" 20 "Repository clone failed with exit code $clone_rc"
    exit "$clone_rc"
  fi

  WORKSPACE_CREATED_BY_SCRIPT="true"

  # Remove token material as soon as cloning is complete.
  REPO_TOKEN=""
  if [[ -n "$ASKPASS_SCRIPT" && -f "$ASKPASS_SCRIPT" ]]; then
    rm -f -- "$ASKPASS_SCRIPT"
    ASKPASS_SCRIPT=""
  fi

  event "clone_repository" "completed" 20 "Repository cloned"
fi

# Scanner outputs must remain outside the source tree. Otherwise scanners can
# scan their own changing reports and parallel jobs can produce unstable results.
case "$OUTPUT_DIR/" in
  "$WORKSPACE/"*)
    event "target_validation" "failed" 22 "Output directory must be outside the scanned workspace"
    echo "Invalid output directory: $OUTPUT_DIR is inside $WORKSPACE" >&2
    echo "Choose an external path, for example: --output /tmp/vm-scan-results" >&2
    exit 2
    ;;
esac

run_npm_audit() {
  local scanner_name="npm_audit"
  local output="$OUTPUT_DIR/npm-audit.json"
  local log="$OUTPUT_DIR/npm-audit.log"
  local started_at start_ms npm_bin tool_version rc status finding_count inferred

  started_at="$(date -Iseconds)"
  start_ms="$(now_ms)"
  event "$scanner_name" "running" 30 "Running npm audit"

  if ! npm_bin="$(resolve_tool npm)"; then
    finish_scanner "$scanner_name" "failed" 127 "$started_at" "$start_ms" "missing" "" false 0 \
      "npm is not installed or available in PATH" ""
    return $?
  fi
  tool_version="$(get_tool_version "$scanner_name" "$npm_bin")"

  if [[ ! -f "$WORKSPACE/package.json" ]]; then
    finish_scanner "$scanner_name" "skipped" 0 "$started_at" "$start_ms" "$tool_version" "" false 0 \
      "package.json was not found" ""
    return $?
  fi

  inferred="false"
  if [[ ! -f "$WORKSPACE/package-lock.json" && ! -f "$WORKSPACE/npm-shrinkwrap.json" && "$VM_NPM_GENERATE_LOCKFILE" == "true" ]]; then
    inferred="true"
  fi

  if (
    cd "$WORKSPACE"

    if [[ ! -f package-lock.json && ! -f npm-shrinkwrap.json ]]; then
      if [[ "$VM_NPM_GENERATE_LOCKFILE" != "true" ]]; then
        exit 20
      fi

      if timeout --signal=TERM --kill-after=10s "$VM_NPM_AUDIT_TIMEOUT" \
        "$npm_bin" install --package-lock-only --ignore-scripts --prefer-offline \
        --no-audit --cache "$VM_NPM_CACHE"; then
        :
      else
        install_rc=$?
        exit "$install_rc"
      fi
    fi

    timeout --signal=TERM --kill-after=10s "$VM_NPM_AUDIT_TIMEOUT" \
      "$npm_bin" audit --json --cache "$VM_NPM_CACHE" > "$output"
  ) > "$log" 2>&1; then
    rc=0
  else
    rc=$?
  fi

  # An exit code of 20 is internal to this wrapper and means no authoritative npm lockfile.
  if [[ "$rc" -eq 20 ]]; then
    finish_scanner "$scanner_name" "skipped" 0 "$started_at" "$start_ms" "$tool_version" "" false 0 \
      "No package-lock.json or npm-shrinkwrap.json was found; scan skipped to avoid inventing dependencies" \
      "$(basename "$log")"
    return $?
  fi

  if [[ "$rc" -eq 124 || "$rc" -eq 137 ]]; then
    rm -f -- "$output"
    finish_scanner "$scanner_name" "timed_out" "$rc" "$started_at" "$start_ms" "$tool_version" "" false 0 \
      "npm audit timed out" "$(basename "$log")" "" "$inferred"
    return $?
  fi

  if [[ ! -s "$output" ]] || ! validate_npm_report "$output"; then
    rm -f -- "$output"
    finish_scanner "$scanner_name" "failed" "$rc" "$started_at" "$start_ms" "$tool_version" "" false 0 \
      "npm audit did not produce a valid JSON report" "$(basename "$log")" "" "$inferred"
    return $?
  fi

  finding_count="$(count_npm_findings "$output")"
  status="$(classify_valid_report_status "$rc" "$finding_count")"
  if [[ "$status" == "failed" || "$status" == "partial" ]]; then
    finish_scanner "$scanner_name" "$status" "$rc" "$started_at" "$start_ms" "$tool_version" \
      "$(basename "$output")" true "$finding_count" "npm audit exited unexpectedly" \
      "$(basename "$log")" "" "$inferred"
  else
    finish_scanner "$scanner_name" "$status" "$rc" "$started_at" "$start_ms" "$tool_version" \
      "$(basename "$output")" true "$finding_count" "" "$(basename "$log")" "" "$inferred"
  fi
}

run_semgrep() {
  local scanner_name="semgrep"
  local output="$OUTPUT_DIR/semgrep.json"
  local log="$OUTPUT_DIR/semgrep.log"
  local started_at start_ms binary tool_version rc status finding_count

  started_at="$(date -Iseconds)"
  start_ms="$(now_ms)"
  event "$scanner_name" "running" 30 "Running Semgrep"

  if ! binary="$(resolve_tool semgrep "$HOME/.local/bin/semgrep")"; then
    finish_scanner "$scanner_name" "failed" 127 "$started_at" "$start_ms" "missing" "" false 0 \
      "Semgrep is not installed or available in PATH" ""
    return $?
  fi
  tool_version="$(get_tool_version "$scanner_name" "$binary")"

  if timeout --signal=TERM --kill-after=10s "$VM_SEMGREP_TIMEOUT" "$binary" scan \
    --config auto --json --jobs "$VM_SEMGREP_JOBS" --max-memory "$VM_SEMGREP_MAX_MEMORY" \
    "$WORKSPACE" > "$output" 2> "$log"; then
    rc=0
  else
    rc=$?
  fi

  if [[ "$rc" -eq 124 || "$rc" -eq 137 ]]; then
    rm -f -- "$output"
    finish_scanner "$scanner_name" "timed_out" "$rc" "$started_at" "$start_ms" "$tool_version" "" false 0 \
      "Semgrep timed out" "$(basename "$log")"
    return $?
  fi

  if [[ ! -s "$output" ]] || ! validate_semgrep_report "$output"; then
    rm -f -- "$output"
    finish_scanner "$scanner_name" "failed" "$rc" "$started_at" "$start_ms" "$tool_version" "" false 0 \
      "Semgrep did not produce a valid JSON report" "$(basename "$log")"
    return $?
  fi

  finding_count="$(count_semgrep_findings "$output")"
  status="$(classify_valid_report_status "$rc" "$finding_count")"
  if [[ "$status" == "failed" || "$status" == "partial" ]]; then
    finish_scanner "$scanner_name" "$status" "$rc" "$started_at" "$start_ms" "$tool_version" \
      "$(basename "$output")" true "$finding_count" "Semgrep exited unexpectedly" "$(basename "$log")"
  else
    finish_scanner "$scanner_name" "$status" "$rc" "$started_at" "$start_ms" "$tool_version" \
      "$(basename "$output")" true "$finding_count" "" "$(basename "$log")"
  fi
}

run_gitleaks() {
  local scanner_name="gitleaks"
  local output="$OUTPUT_DIR/gitleaks.json"
  local log="$OUTPUT_DIR/gitleaks.log"
  local started_at start_ms binary tool_version rc status finding_count scan_mode

  started_at="$(date -Iseconds)"
  start_ms="$(now_ms)"
  event "$scanner_name" "running" 30 "Running Gitleaks"

  if ! binary="$(resolve_tool gitleaks /usr/local/bin/gitleaks)"; then
    finish_scanner "$scanner_name" "failed" 127 "$started_at" "$start_ms" "missing" "" false 0 \
      "Gitleaks is not installed or available in PATH" ""
    return $?
  fi
  tool_version="$(get_tool_version "$scanner_name" "$binary")"

  if [[ "$VM_GITLEAKS_FULL_HISTORY" == "true" ]]; then
    scan_mode="full_history"
  elif [[ -n "$TARGET_PATH" ]]; then
    scan_mode="local_repository_available_history"
  else
    scan_mode="shallow_history_depth_${VM_GIT_CLONE_DEPTH}"
  fi

  if timeout --signal=TERM --kill-after=10s "$VM_GITLEAKS_TIMEOUT" "$binary" detect \
    --source "$WORKSPACE" --report-format json --report-path "$output" --redact --exit-code 1 \
    > "$log" 2>&1; then
    rc=0
  else
    rc=$?
  fi

  if [[ "$rc" -eq 124 || "$rc" -eq 137 ]]; then
    rm -f -- "$output"
    finish_scanner "$scanner_name" "timed_out" "$rc" "$started_at" "$start_ms" "$tool_version" "" false 0 \
      "Gitleaks timed out" "$(basename "$log")" "$scan_mode"
    return $?
  fi

  if [[ ! -s "$output" ]] || ! validate_gitleaks_report "$output"; then
    rm -f -- "$output"
    finish_scanner "$scanner_name" "failed" "$rc" "$started_at" "$start_ms" "$tool_version" "" false 0 \
      "Gitleaks did not produce a valid JSON report" "$(basename "$log")" "$scan_mode"
    return $?
  fi

  finding_count="$(count_gitleaks_findings "$output")"
  status="$(classify_valid_report_status "$rc" "$finding_count")"
  if [[ "$status" == "failed" || "$status" == "partial" ]]; then
    finish_scanner "$scanner_name" "$status" "$rc" "$started_at" "$start_ms" "$tool_version" \
      "$(basename "$output")" true "$finding_count" "Gitleaks exited unexpectedly" "$(basename "$log")" "$scan_mode"
  else
    finish_scanner "$scanner_name" "$status" "$rc" "$started_at" "$start_ms" "$tool_version" \
      "$(basename "$output")" true "$finding_count" "" "$(basename "$log")" "$scan_mode"
  fi
}

run_osv() {
  local scanner_name="osv"
  local output="$OUTPUT_DIR/osv.json"
  local log="$OUTPUT_DIR/osv.log"
  local started_at start_ms binary tool_version rc status finding_count

  started_at="$(date -Iseconds)"
  start_ms="$(now_ms)"
  event "$scanner_name" "running" 30 "Running OSV Scanner"

  if ! binary="$(resolve_tool osv-scanner /usr/local/bin/osv-scanner)"; then
    finish_scanner "$scanner_name" "failed" 127 "$started_at" "$start_ms" "missing" "" false 0 \
      "OSV Scanner is not installed or available in PATH" ""
    return $?
  fi
  tool_version="$(get_tool_version "$scanner_name" "$binary")"

  if timeout --signal=TERM --kill-after=10s "$VM_OSV_TIMEOUT" "$binary" scan source \
    --recursive --format json "$WORKSPACE" > "$output" 2> "$log"; then
    rc=0
  else
    rc=$?
  fi

  if [[ "$rc" -eq 124 || "$rc" -eq 137 ]]; then
    rm -f -- "$output"
    finish_scanner "$scanner_name" "timed_out" "$rc" "$started_at" "$start_ms" "$tool_version" "" false 0 \
      "OSV Scanner timed out" "$(basename "$log")"
    return $?
  fi

  if [[ ! -s "$output" ]] || ! validate_osv_report "$output"; then
    rm -f -- "$output"
    finish_scanner "$scanner_name" "failed" "$rc" "$started_at" "$start_ms" "$tool_version" "" false 0 \
      "OSV Scanner did not produce a valid JSON report" "$(basename "$log")"
    return $?
  fi

  finding_count="$(count_osv_findings "$output")"
  status="$(classify_valid_report_status "$rc" "$finding_count")"
  if [[ "$status" == "failed" || "$status" == "partial" ]]; then
    finish_scanner "$scanner_name" "$status" "$rc" "$started_at" "$start_ms" "$tool_version" \
      "$(basename "$output")" true "$finding_count" "OSV Scanner exited unexpectedly" "$(basename "$log")"
  else
    finish_scanner "$scanner_name" "$status" "$rc" "$started_at" "$start_ms" "$tool_version" \
      "$(basename "$output")" true "$finding_count" "" "$(basename "$log")"
  fi
}

run_trivy_iac() {
  local scanner_name="trivy_iac"
  local output="$OUTPUT_DIR/trivy-iac.json"
  local log="$OUTPUT_DIR/trivy-iac.log"
  local started_at start_ms binary tool_version rc status finding_count

  started_at="$(date -Iseconds)"
  start_ms="$(now_ms)"
  event "$scanner_name" "running" 30 "Running Trivy IaC/configuration scan"

  if ! binary="$(resolve_tool trivy /usr/local/bin/trivy)"; then
    finish_scanner "$scanner_name" "failed" 127 "$started_at" "$start_ms" "missing" "" false 0 \
      "Trivy is not installed or available in PATH" ""
    return $?
  fi
  tool_version="$(get_tool_version "$scanner_name" "$binary")"

  if timeout --signal=TERM --kill-after=10s "$VM_TRIVY_TIMEOUT" "$binary" config \
    --format json --output "$output" --exit-code 1 "$WORKSPACE" > "$log" 2>&1; then
    rc=0
  else
    rc=$?
  fi

  if [[ "$rc" -eq 124 || "$rc" -eq 137 ]]; then
    rm -f -- "$output"
    finish_scanner "$scanner_name" "timed_out" "$rc" "$started_at" "$start_ms" "$tool_version" "" false 0 \
      "Trivy IaC scan timed out" "$(basename "$log")"
    return $?
  fi

  if [[ ! -s "$output" ]] || ! validate_trivy_report "$output"; then
    rm -f -- "$output"
    finish_scanner "$scanner_name" "failed" "$rc" "$started_at" "$start_ms" "$tool_version" "" false 0 \
      "Trivy IaC scan did not produce a valid JSON report" "$(basename "$log")"
    return $?
  fi

  finding_count="$(count_trivy_findings "$output")"
  status="$(classify_valid_report_status "$rc" "$finding_count")"
  if [[ "$status" == "failed" || "$status" == "partial" ]]; then
    finish_scanner "$scanner_name" "$status" "$rc" "$started_at" "$start_ms" "$tool_version" \
      "$(basename "$output")" true "$finding_count" "Trivy IaC scan exited unexpectedly" "$(basename "$log")"
  else
    finish_scanner "$scanner_name" "$status" "$rc" "$started_at" "$start_ms" "$tool_version" \
      "$(basename "$output")" true "$finding_count" "" "$(basename "$log")"
  fi
}

run_trivy_fs() {
  local scanner_name="trivy_fs"
  local output="$OUTPUT_DIR/trivy-fs.json"
  local log="$OUTPUT_DIR/trivy-fs.log"
  local started_at start_ms binary tool_version rc status finding_count fallback_used

  started_at="$(date -Iseconds)"
  start_ms="$(now_ms)"
  event "$scanner_name" "running" 30 "Running Trivy filesystem scan"

  if ! binary="$(resolve_tool trivy /usr/local/bin/trivy)"; then
    finish_scanner "$scanner_name" "failed" 127 "$started_at" "$start_ms" "missing" "" false 0 \
      "Trivy is not installed or available in PATH" ""
    return $?
  fi
  tool_version="$(get_tool_version "$scanner_name" "$binary")"
  fallback_used="false"

  if timeout --signal=TERM --kill-after=10s "$VM_TRIVY_TIMEOUT" "$binary" fs \
    --format json --output "$output" --exit-code 1 \
    --scanners vuln,secret,misconfig,license "$WORKSPACE" > "$log" 2>&1; then
    rc=0
  else
    rc=$?
  fi

  if [[ "$rc" -eq 124 || "$rc" -eq 137 ]]; then
    rm -f -- "$output"
    finish_scanner "$scanner_name" "timed_out" "$rc" "$started_at" "$start_ms" "$tool_version" "" false 0 \
      "Trivy filesystem scan timed out" "$(basename "$log")"
    return $?
  fi

  # Older Trivy versions may not support the license scanner. Retry only when
  # the first execution did not create a valid report.
  if [[ ! -s "$output" ]] || ! validate_trivy_report "$output"; then
    fallback_used="true"
    rm -f -- "$output"
    printf '\nRetrying without the license scanner for compatibility.\n' >> "$log"

    if timeout --signal=TERM --kill-after=10s "$VM_TRIVY_TIMEOUT" "$binary" fs \
      --format json --output "$output" --exit-code 1 \
      --scanners vuln,secret,misconfig "$WORKSPACE" >> "$log" 2>&1; then
      rc=0
    else
      rc=$?
    fi
  fi

  if [[ "$rc" -eq 124 || "$rc" -eq 137 ]]; then
    rm -f -- "$output"
    finish_scanner "$scanner_name" "timed_out" "$rc" "$started_at" "$start_ms" "$tool_version" "" false 0 \
      "Trivy filesystem scan timed out" "$(basename "$log")" "compatibility_fallback=$fallback_used"
    return $?
  fi

  if [[ ! -s "$output" ]] || ! validate_trivy_report "$output"; then
    rm -f -- "$output"
    finish_scanner "$scanner_name" "failed" "$rc" "$started_at" "$start_ms" "$tool_version" "" false 0 \
      "Trivy filesystem scan did not produce a valid JSON report" "$(basename "$log")" \
      "compatibility_fallback=$fallback_used"
    return $?
  fi

  finding_count="$(count_trivy_findings "$output")"
  status="$(classify_valid_report_status "$rc" "$finding_count")"
  if [[ "$status" == "failed" || "$status" == "partial" ]]; then
    finish_scanner "$scanner_name" "$status" "$rc" "$started_at" "$start_ms" "$tool_version" \
      "$(basename "$output")" true "$finding_count" "Trivy filesystem scan exited unexpectedly" \
      "$(basename "$log")" "compatibility_fallback=$fallback_used"
  else
    finish_scanner "$scanner_name" "$status" "$rc" "$started_at" "$start_ms" "$tool_version" \
      "$(basename "$output")" true "$finding_count" "" "$(basename "$log")" \
      "compatibility_fallback=$fallback_used"
  fi
}

run_selected_scanner() {
  local scanner_name="$1"

  case "$scanner_name" in
    npm_audit) run_npm_audit ;;
    semgrep) run_semgrep ;;
    gitleaks) run_gitleaks ;;
    osv) run_osv ;;
    trivy_iac) run_trivy_iac ;;
    trivy_fs) run_trivy_fs ;;
    *)
      local started_at start_ms
      started_at="$(date -Iseconds)"
      start_ms="$(now_ms)"
      finish_scanner "$scanner_name" "failed" 2 "$started_at" "$start_ms" "unknown" "" false 0 \
        "Unsupported scanner requested" ""
      ;;
  esac
}

event "scanners" "running" 25 "Starting selected scanners"

if [[ "$PARALLEL" == "true" && "${#SCANNERS_TO_RUN[@]}" -gt 1 ]]; then
  declare -A PIDS=()
  for scanner_name in "${SCANNERS_TO_RUN[@]}"; do
    (run_selected_scanner "$scanner_name") &
    PIDS["$scanner_name"]=$!
  done

  # wait failures are expected for failed scanners; status files are authoritative.
  for scanner_name in "${SCANNERS_TO_RUN[@]}"; do
    if wait "${PIDS[$scanner_name]}"; then
      :
    else
      :
    fi
  done
else
  for scanner_name in "${SCANNERS_TO_RUN[@]}"; do
    if run_selected_scanner "$scanner_name"; then
      :
    else
      :
    fi
  done
fi

# Every requested scanner must produce a status record. Missing records are failures.
for scanner_name in "${SCANNERS_TO_RUN[@]}"; do
  if [[ ! -s "$STATUS_DIR/$scanner_name.json" ]]; then
    write_scanner_result "$scanner_name" "failed" 1 "$SCAN_STARTED_AT_ISO" "$(date -Iseconds)" 0 \
      "unknown" "" false 0 "Scanner ended without producing a status record" "" "" false
  fi
done

jq -s 'sort_by(.scanner)' "$STATUS_DIR"/*.json > "$EXECUTION_SUMMARY_FILE"

FAILED_COUNT="$(jq '[.[] | select(.status == "failed" or .status == "timed_out" or .status == "partial")] | length' "$EXECUTION_SUMMARY_FILE")"
COMPLETED_COUNT="$(jq '[.[] | select(.status == "success" or .status == "findings_detected")] | length' "$EXECUTION_SUMMARY_FILE")"
FINDINGS_SCANNER_COUNT="$(jq '[.[] | select(.status == "findings_detected")] | length' "$EXECUTION_SUMMARY_FILE")"
SKIPPED_COUNT="$(jq '[.[] | select(.status == "skipped")] | length' "$EXECUTION_SUMMARY_FILE")"
TOTAL_FINDINGS="$(jq '[.[].findingCount] | add // 0' "$EXECUTION_SUMMARY_FILE")"

if [[ "$FAILED_COUNT" -gt 0 && "$COMPLETED_COUNT" -gt 0 ]]; then
  OVERALL_STATUS="partial"
elif [[ "$FAILED_COUNT" -gt 0 ]]; then
  OVERALL_STATUS="failed"
elif [[ "$COMPLETED_COUNT" -eq 0 && "$SKIPPED_COUNT" -gt 0 ]]; then
  OVERALL_STATUS="skipped"
elif [[ "$FINDINGS_SCANNER_COUNT" -gt 0 ]]; then
  OVERALL_STATUS="findings_detected"
else
  OVERALL_STATUS="success"
fi

jq '{
  failedScanners: [.[] | select(.status == "failed" or .status == "timed_out" or .status == "partial") | .scanner],
  failures: [.[] | select(.status == "failed" or .status == "timed_out" or .status == "partial") |
    {scanner, status, exitCode, error}]
}' "$EXECUTION_SUMMARY_FILE" > "$ERRORS_FILE"

if [[ "$FAILED_COUNT" -gt 0 ]]; then
  event "scanners" "$OVERALL_STATUS" 90 "One or more scanners failed or timed out"
else
  event "scanners" "completed" 90 "All runnable scanners finished"
fi

SCAN_COMPLETED_AT_EPOCH="$(date +%s)"
SCAN_COMPLETED_AT_ISO="$(date -Iseconds)"
DURATION_MS=$(( (SCAN_COMPLETED_AT_EPOCH - SCAN_STARTED_AT_EPOCH) * 1000 ))

event "summary" "running" 95 "Writing scan summary"

SCAN_CATEGORIES_JSON="$(printf '%s\n' "${SCANNERS_TO_RUN[@]}" | jq -R . | jq -s '
  map(
    if . == "gitleaks" then ["secret"]
    elif . == "npm_audit" or . == "osv" then ["dependency"]
    elif . == "semgrep" then ["sast"]
    elif . == "trivy_iac" then ["iac"]
    elif . == "trivy_fs" then ["dependency", "secret", "iac", "license"]
    else ["unknown"] end
  ) | add | unique
')"

jq -n \
  --arg repoUrl "$REPO_URL" \
  --arg branch "$BRANCH" \
  --arg scanner "$SCANNER" \
  --arg sourceType "$SOURCE_TYPE" \
  --arg scanCategory "$SCAN_CATEGORY" \
  --argjson scanCategories "$SCAN_CATEGORIES_JSON" \
  --arg target "$TARGET" \
  --arg targetUrl "$TARGET_URL" \
  --arg targetImage "$TARGET_IMAGE" \
  --arg targetHost "$TARGET_HOST" \
  --arg targetPort "$TARGET_PORT" \
  --arg apiSpecUrl "$API_SPEC_URL" \
  --arg apiSpecFile "$API_SPEC_FILE" \
  --arg workspace "$WORKSPACE" \
  --arg outputDir "$OUTPUT_DIR" \
  --arg status "$OVERALL_STATUS" \
  --arg startedAt "$SCAN_STARTED_AT_ISO" \
  --arg completedAt "$SCAN_COMPLETED_AT_ISO" \
  --argjson durationMs "$DURATION_MS" \
  --argjson totalFindings "$TOTAL_FINDINGS" \
  --argjson failedScannerCount "$FAILED_COUNT" \
  --argjson skippedScannerCount "$SKIPPED_COUNT" \
  --argjson parallel "$PARALLEL" \
  --argjson tokenProvided "$TOKEN_PROVIDED" \
  --slurpfile scannerResults "$EXECUTION_SUMMARY_FILE" \
  '{
    status: $status,
    repoUrl: (if $repoUrl == "" then null else $repoUrl end),
    branch: $branch,
    scanner: $scanner,
    sourceType: $sourceType,
    scanCategory: (if $scanCategory == "" then null else $scanCategory end),
    scanCategories: $scanCategories,
    target: $target,
    targetUrl: (if $targetUrl == "" then null else $targetUrl end),
    targetImage: (if $targetImage == "" then null else $targetImage end),
    targetHost: (if $targetHost == "" then null else $targetHost end),
    targetPort: (if $targetPort == "" then null else $targetPort end),
    apiSpecUrl: (if $apiSpecUrl == "" then null else $apiSpecUrl end),
    apiSpecFile: (if $apiSpecFile == "" then null else $apiSpecFile end),
    workspace: $workspace,
    outputDir: $outputDir,
    parallel: $parallel,
    tokenProvided: $tokenProvided,
    startedAt: $startedAt,
    completedAt: $completedAt,
    durationMs: $durationMs,
    totalFindings: $totalFindings,
    failedScannerCount: $failedScannerCount,
    skippedScannerCount: $skippedScannerCount,
    scanners: $scannerResults[0],
    files: {
      npmAudit: "npm-audit.json",
      semgrep: "semgrep.json",
      gitleaks: "gitleaks.json",
      osv: "osv.json",
      trivyIac: "trivy-iac.json",
      trivyFs: "trivy-fs.json",
      scannerStatuses: "scanner-status/",
      executionSummary: "execution-summary.json",
      events: "scan-events.jsonl",
      errors: "errors.json"
    }
  }' > "$SUMMARY_FILE"

event "scan" "$OVERALL_STATUS" 100 "Scan finished with status: $OVERALL_STATUS"

printf '\n%s\n' "======================================"
printf '%s\n' "Scan Finished"
printf '%s\n' "======================================"
printf 'Status: %s\n' "$OVERALL_STATUS"
printf 'Results: %s\n' "$OUTPUT_DIR"
printf 'Events: %s\n' "$EVENTS_FILE"
printf 'Summary: %s\n' "$SUMMARY_FILE"
printf 'Execution summary: %s\n' "$EXECUTION_SUMMARY_FILE"
printf 'Total findings: %s\n' "$TOTAL_FINDINGS"
printf 'Failed scanners: %s\n' "$FAILED_COUNT"
printf '%s\n' "======================================"

if [[ "$FAIL_ON_SCANNER_ERROR" == "true" && "$FAILED_COUNT" -gt 0 ]]; then
  exit 1
fi

exit 0