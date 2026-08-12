#!/usr/bin/env bash
# vm-backend-smoke-test.sh
# Safe end-to-end smoke test for the Vulnerability Management backend.
#
# The script validates authentication, scanner options, dashboard access,
# repository creation, scan report upload, duplicate finding behavior,
# finding workflow updates, optional live scanner execution, and limited
# tenant-isolation behavior when a second tenant token is supplied.
#
# It never prints access tokens or passwords. Created findings are closed and
# the temporary repository is archived when cleanup is enabled. The current
# backend does not expose scan/finding delete endpoints, so historical smoke
# scan records remain available for audit.

set -Eeuo pipefail

export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"

SCRIPT_VERSION="2.3.0"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
START_EPOCH="$(date +%s)"

# Authentication and Vulnerability Management use different route prefixes.
# API_BASE_URL is used for vulnerability-management endpoints.
# LOGIN_URL is used only for authentication.
#
# Backward compatibility:
# - BASE_URL=http://host/dev2/apiv1 derives:
#     API_BASE_URL=http://host/dev2
#     LOGIN_URL=http://host/dev2/apiv1/login
# - BASE_URL=http://host/dev2 derives:
#     API_BASE_URL=http://host/dev2
#     LOGIN_URL=http://host/dev2/apiv1/login
LEGACY_BASE_URL="${BASE_URL:-}"
LEGACY_BASE_URL="${LEGACY_BASE_URL%/}"

if [[ -n "${API_BASE_URL:-}" ]]; then
  API_BASE_URL="${API_BASE_URL}"
elif [[ -n "$LEGACY_BASE_URL" && "$LEGACY_BASE_URL" == */apiv1 ]]; then
  API_BASE_URL="${LEGACY_BASE_URL%/apiv1}"
elif [[ -n "$LEGACY_BASE_URL" ]]; then
  API_BASE_URL="$LEGACY_BASE_URL"
else
  API_BASE_URL="http://127.0.0.1:8007/dev2"
fi

if [[ -n "${LOGIN_URL:-}" ]]; then
  LOGIN_URL="${LOGIN_URL}"
elif [[ -n "$LEGACY_BASE_URL" && "$LEGACY_BASE_URL" == */apiv1 ]]; then
  LOGIN_URL="${LEGACY_BASE_URL}/login"
else
  LOGIN_URL="${API_BASE_URL%/}/apiv1/login"
fi

TENANT_ID="${TENANT_ID:-hutch-tenant}"
EMAIL="${EMAIL:-}"
PASSWORD="${PASSWORD:-}"
ACCESS_TOKEN="${VM_SMOKE_ACCESS_TOKEN:-${ACCESS_TOKEN:-}}"

# Optional second-tenant credentials. When both are supplied, the script checks
# that the second tenant cannot read the repository created for TENANT_ID.
SECOND_TENANT_ID="${SECOND_TENANT_ID:-}"
SECOND_ACCESS_TOKEN="${SECOND_ACCESS_TOKEN:-}"

RUN_REPO_URL="${RUN_REPO_URL:-}"
RUN_REPO_BRANCH="${RUN_REPO_BRANCH:-main}"
RUN_SCANNER="${RUN_SCANNER:-gitleaks}"
RUN_SOURCE_TYPE="${RUN_SOURCE_TYPE:-github}"
RUN_SCAN_CATEGORY="${RUN_SCAN_CATEGORY:-secret}"

ALLOW_INSECURE_HTTP="${ALLOW_INSECURE_HTTP:-false}"
TEST_UNAUTHORIZED="${TEST_UNAUTHORIZED:-true}"
CLEANUP="${CLEANUP:-true}"
KEEP_ARTIFACTS="${KEEP_ARTIFACTS:-false}"
VERBOSE="${VERBOSE:-false}"

HTTP_CONNECT_TIMEOUT="${HTTP_CONNECT_TIMEOUT:-10}"
HTTP_TIMEOUT="${HTTP_TIMEOUT:-60}"
SCAN_POLL_INTERVAL="${SCAN_POLL_INTERVAL:-5}"
SCAN_POLL_TIMEOUT="${SCAN_POLL_TIMEOUT:-1800}"
REPORT_PATH="${REPORT_PATH:-/tmp/vm-backend-smoke-report-${RUN_ID}.json}"
ARTIFACT_DIR="${ARTIFACT_DIR:-}"

TMP_DIR=""
RESULTS_FILE=""
TOKEN=""

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
WARN_COUNT=0

REPOSITORY_ID=""
REPO_NAME=""
REPO_URL_FOR_METADATA=""
ORIGINAL_SCAN_ID=""
DUPLICATE_SCAN_ID=""
ORIGINAL_FINDING_ID=""
DUPLICATE_FINDING_ID=""
LIVE_SCAN_IDS=()

HTTP_CODE=""
HTTP_CURL_RC=0
HTTP_BODY_FILE=""
TEST_MESSAGE=""
TEST_DETAILS='{}'

usage() {
  cat <<USAGE
Usage:
  EMAIL=user@example.com PASSWORD='...' ./scripts/vm-backend-smoke-test.sh
  VM_SMOKE_ACCESS_TOKEN='...' ./scripts/vm-backend-smoke-test.sh

Options:
  --api-base-url <url>          Vulnerability API base. Default: ${API_BASE_URL}
  --login-url <url>             Authentication endpoint. Default: ${LOGIN_URL}
  --base-url <url>              Backward-compatible alias for --api-base-url.
  --tenant-id <id>              Tenant ID header. Default: ${TENANT_ID}
  --email <email>               Login email. Prefer EMAIL environment variable.
  --run-repo-url <url>          Optionally run a real server-side scanner.
  --run-repo-branch <branch>    Branch for optional scanner run.
  --run-scanner <scanner>       Scanner for optional run. Default: ${RUN_SCANNER}
  --run-source-type <type>      Source type for optional run.
  --run-scan-category <type>    Scan category for optional run.
  --report <path>               JSON report path. Default: ${REPORT_PATH}
  --artifact-dir <path>         Preserve response artifacts in this directory.
  --allow-insecure-http         Allow non-loopback HTTP API URLs.
  --keep-artifacts              Preserve the temporary response directory.
  --no-cleanup                  Do not close findings or archive the repository.
  --skip-unauthorized-test      Do not test access without a bearer token.
  --verbose                     Print sanitized JSON response summaries.
  --help                        Show help.

Environment variables:
  API_BASE_URL, LOGIN_URL, BASE_URL, TENANT_ID, EMAIL, PASSWORD, VM_SMOKE_ACCESS_TOKEN
  SECOND_TENANT_ID, SECOND_ACCESS_TOKEN
  RUN_REPO_URL, RUN_REPO_BRANCH, RUN_SCANNER
  RUN_SOURCE_TYPE, RUN_SCAN_CATEGORY
  ALLOW_INSECURE_HTTP, TEST_UNAUTHORIZED, CLEANUP, KEEP_ARTIFACTS
  HTTP_CONNECT_TIMEOUT, HTTP_TIMEOUT, SCAN_POLL_INTERVAL, SCAN_POLL_TIMEOUT
  REPORT_PATH, ARTIFACT_DIR, VERBOSE

Security notes:
  - Do not pass passwords or tokens as command-line arguments.
  - Non-loopback HTTP requires ALLOW_INSECURE_HTTP=true or
    --allow-insecure-http.
  - Use only repositories and applications you are authorized to assess.
USAGE
}

log() {
  printf '\n[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"
}

warn() {
  printf '\n[%s] WARN: %s\n' "$(date -u +%H:%M:%S)" "$*" >&2
}

err() {
  printf '\n[%s] ERROR: %s\n' "$(date -u +%H:%M:%S)" "$*" >&2
}

is_true() {
  case "${1,,}" in
    true|1|yes|y|on) return 0 ;;
    *) return 1 ;;
  esac
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --api-base-url)
        API_BASE_URL="${2:-}"
        shift 2
        ;;
      --base-url)
        local legacy_arg="${2:-}"
        legacy_arg="${legacy_arg%/}"
        if [[ "$legacy_arg" == */apiv1 ]]; then
          API_BASE_URL="${legacy_arg%/apiv1}"
          LOGIN_URL="${legacy_arg}/login"
        else
          API_BASE_URL="$legacy_arg"
          LOGIN_URL="${legacy_arg}/apiv1/login"
        fi
        shift 2
        ;;
      --login-url)
        LOGIN_URL="${2:-}"
        shift 2
        ;;
      --tenant-id)
        TENANT_ID="${2:-}"
        shift 2
        ;;
      --email)
        EMAIL="${2:-}"
        shift 2
        ;;
      --run-repo-url)
        RUN_REPO_URL="${2:-}"
        shift 2
        ;;
      --run-repo-branch)
        RUN_REPO_BRANCH="${2:-main}"
        shift 2
        ;;
      --run-scanner)
        RUN_SCANNER="${2:-gitleaks}"
        shift 2
        ;;
      --run-source-type)
        RUN_SOURCE_TYPE="${2:-github}"
        shift 2
        ;;
      --run-scan-category)
        RUN_SCAN_CATEGORY="${2:-secret}"
        shift 2
        ;;
      --report)
        REPORT_PATH="${2:-}"
        shift 2
        ;;
      --artifact-dir)
        ARTIFACT_DIR="${2:-}"
        shift 2
        ;;
      --allow-insecure-http)
        ALLOW_INSECURE_HTTP="true"
        shift
        ;;
      --keep-artifacts)
        KEEP_ARTIFACTS="true"
        shift
        ;;
      --no-cleanup)
        CLEANUP="false"
        shift
        ;;
      --skip-unauthorized-test)
        TEST_UNAUTHORIZED="false"
        shift
        ;;
      --verbose)
        VERBOSE="true"
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

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    err "Required command is missing: $command_name"
    return 1
  fi
}

validate_endpoint_url() {
  local label="$1"
  local url="$2"

  if [[ -z "$url" ]]; then
    err "$label cannot be empty"
    return 1
  fi

  if [[ ! "$url" =~ ^https?:// ]]; then
    err "$label must begin with http:// or https://"
    return 1
  fi

  if [[ "$url" =~ ^http:// ]]; then
    local host
    host="$(printf '%s' "$url" | sed -E 's#^http://([^/:]+).*$#\1#')"

    case "$host" in
      localhost|127.0.0.1|::1|\[::1\])
        ;;
      *)
        if ! is_true "$ALLOW_INSECURE_HTTP"; then
          err "Refusing credentials over non-loopback HTTP: $url"
          err "Use HTTPS, or explicitly set ALLOW_INSECURE_HTTP=true for a controlled test."
          return 1
        fi
        ;;
    esac
  fi

  return 0
}

validate_configuration() {
  local failed=0

  for command_name in curl jq mktemp date sed grep; do
    if ! require_command "$command_name"; then
      failed=1
    fi
  done

  API_BASE_URL="${API_BASE_URL%/}"
  LOGIN_URL="${LOGIN_URL%/}"

  if ! validate_endpoint_url "API_BASE_URL" "$API_BASE_URL"; then
    failed=1
  fi

  if ! validate_endpoint_url "LOGIN_URL" "$LOGIN_URL"; then
    failed=1
  fi

  if [[ -z "$TENANT_ID" ]]; then
    err "TENANT_ID cannot be empty"
    failed=1
  fi

  if [[ -z "$REPORT_PATH" ]]; then
    err "REPORT_PATH cannot be empty"
    failed=1
  fi

  if [[ ! "$HTTP_CONNECT_TIMEOUT" =~ ^[0-9]+$ || "$HTTP_CONNECT_TIMEOUT" -lt 1 ]]; then
    err "HTTP_CONNECT_TIMEOUT must be a positive integer"
    failed=1
  fi

  if [[ ! "$HTTP_TIMEOUT" =~ ^[0-9]+$ || "$HTTP_TIMEOUT" -lt 1 ]]; then
    err "HTTP_TIMEOUT must be a positive integer"
    failed=1
  fi

  if [[ ! "$SCAN_POLL_INTERVAL" =~ ^[0-9]+$ || "$SCAN_POLL_INTERVAL" -lt 1 ]]; then
    err "SCAN_POLL_INTERVAL must be a positive integer"
    failed=1
  fi

  if [[ ! "$SCAN_POLL_TIMEOUT" =~ ^[0-9]+$ || "$SCAN_POLL_TIMEOUT" -lt 1 ]]; then
    err "SCAN_POLL_TIMEOUT must be a positive integer"
    failed=1
  fi

  return "$failed"
}

initialize_workspace() {
  TMP_DIR="$(mktemp -d /tmp/vm-backend-smoke.XXXXXX)"
  chmod 700 "$TMP_DIR"
  RESULTS_FILE="$TMP_DIR/test-results.jsonl"
  : > "$RESULTS_FILE"

  mkdir -p "$(dirname "$REPORT_PATH")"

  if [[ -n "$ARTIFACT_DIR" ]]; then
    ARTIFACT_DIR="$(realpath -m "$ARTIFACT_DIR")"
    mkdir -p "$ARTIFACT_DIR"
    chmod 700 "$ARTIFACT_DIR" 2>/dev/null || true
  fi
}

record_test() {
  local name="$1"
  local status="$2"
  local message="$3"
  local duration_ms="$4"
  local details="${5:-{}}"

  case "$status" in
    passed)
      ((PASS_COUNT += 1))
      printf '✅ %-36s %s\n' "$name" "$message"
      ;;
    failed)
      ((FAIL_COUNT += 1))
      printf '❌ %-36s %s\n' "$name" "$message" >&2
      ;;
    skipped)
      ((SKIP_COUNT += 1))
      printf '⚪ %-36s %s\n' "$name" "$message"
      ;;
    warning)
      ((WARN_COUNT += 1))
      printf '⚠️  %-36s %s\n' "$name" "$message"
      ;;
    *)
      err "Unknown test status: $status"
      return 1
      ;;
  esac

  if ! jq -e . >/dev/null 2>&1 <<<"$details"; then
    details='{}'
  fi

  jq -cn \
    --arg name "$name" \
    --arg status "$status" \
    --arg message "$message" \
    --argjson durationMs "$duration_ms" \
    --argjson details "$details" \
    '{name:$name,status:$status,message:$message,durationMs:$durationMs,details:$details}' \
    >> "$RESULTS_FILE"
}

run_test() {
  local name="$1"
  shift

  local start_ms end_ms duration_ms rc
  start_ms="$(date +%s%3N)"
  TEST_MESSAGE=""
  TEST_DETAILS='{}'

  set +e
  "$@"
  rc=$?
  set -e

  end_ms="$(date +%s%3N)"
  duration_ms=$((end_ms - start_ms))

  if [[ "$rc" -eq 0 ]]; then
    record_test "$name" "passed" "${TEST_MESSAGE:-passed}" "$duration_ms" "$TEST_DETAILS"
  elif [[ "$rc" -eq 2 ]]; then
    record_test "$name" "skipped" "${TEST_MESSAGE:-skipped}" "$duration_ms" "$TEST_DETAILS"
  elif [[ "$rc" -eq 3 ]]; then
    record_test "$name" "warning" "${TEST_MESSAGE:-warning}" "$duration_ms" "$TEST_DETAILS"
  else
    record_test "$name" "failed" "${TEST_MESSAGE:-failed}" "$duration_ms" "$TEST_DETAILS"
  fi

  return "$rc"
}

status_is_expected() {
  local status="$1"
  local expected_csv="$2"
  local expected

  IFS=',' read -r -a expected <<< "$expected_csv"
  for expected in "${expected[@]}"; do
    if [[ "$status" == "$expected" ]]; then
      return 0
    fi
  done

  return 1
}

request_json() {
  local method="$1"
  local path="$2"
  local output_file="$3"
  local expected_codes="$4"
  local auth_mode="${5:-primary}"
  local payload="${6:-}"
  local tenant_override="${7:-}"
  local request_url_override="${8:-}"
  local require_json="${9:-true}"

  local tenant_header="${tenant_override:-$TENANT_ID}"
  local bearer_token=""
  local -a args

  case "$auth_mode" in
    primary) bearer_token="$TOKEN" ;;
    second) bearer_token="$SECOND_ACCESS_TOKEN" ;;
    none) bearer_token="" ;;
    *)
      HTTP_CODE="000"
      HTTP_CURL_RC=2
      HTTP_BODY_FILE="$output_file"
      printf '{"error":"invalid auth mode"}\n' > "$output_file"
      return 1
      ;;
  esac

  args=(
    --silent
    --show-error
    --connect-timeout "$HTTP_CONNECT_TIMEOUT"
    --max-time "$HTTP_TIMEOUT"
    --request "$method"
    --output "$output_file"
    --write-out '%{http_code}'
    --header 'Accept: application/json'
    --header "x-tenant-id: $tenant_header"
  )

  if [[ -n "$bearer_token" ]]; then
    args+=(--header "Authorization: Bearer $bearer_token")
  fi

  if [[ -n "$payload" ]]; then
    args+=(
      --header 'Content-Type: application/json'
      --data "$payload"
    )
  fi

  local request_url
  if [[ -n "$request_url_override" ]]; then
    request_url="$request_url_override"
  else
    request_url="${API_BASE_URL}${path}"
  fi

  set +e
  HTTP_CODE="$(curl "${args[@]}" "$request_url")"
  HTTP_CURL_RC=$?
  set -e
  HTTP_BODY_FILE="$output_file"

  if [[ "$HTTP_CURL_RC" -ne 0 ]]; then
    return 1
  fi

  if ! status_is_expected "$HTTP_CODE" "$expected_codes"; then
    return 1
  fi

  if is_true "$require_json" && [[ -s "$output_file" ]] && ! jq -e . "$output_file" >/dev/null 2>&1; then
    return 1
  fi

  return 0
}

request_multipart_upload() {
  local output_file="$1"
  local repository_id="$2"

  local -a args=(
    --silent
    --show-error
    --connect-timeout "$HTTP_CONNECT_TIMEOUT"
    --max-time "$HTTP_TIMEOUT"
    --request POST
    --output "$output_file"
    --write-out '%{http_code}'
    --header 'Accept: application/json'
    --header "x-tenant-id: $TENANT_ID"
    --header "Authorization: Bearer $TOKEN"
    --form 'scanner=manual'
    --form "sourceType=$RUN_SOURCE_TYPE"
    --form 'scanCategory=dependency'
    --form "target=$REPO_URL_FOR_METADATA"
    --form "repoUrl=$REPO_URL_FOR_METADATA"
    --form "repositoryName=$REPO_NAME"
    --form 'branch=main'
    --form "file=@$TMP_DIR/manual-vm-report.json;type=application/json"
  )

  if [[ -n "$repository_id" ]]; then
    args+=(--form "repositoryId=$repository_id")
  fi

  set +e
  HTTP_CODE="$(curl "${args[@]}" "$API_BASE_URL/vulnerability-management/scans/upload")"
  HTTP_CURL_RC=$?
  set -e
  HTTP_BODY_FILE="$output_file"

  if [[ "$HTTP_CURL_RC" -ne 0 ]]; then
    return 1
  fi

  if ! status_is_expected "$HTTP_CODE" "200,201"; then
    return 1
  fi

  jq -e . "$output_file" >/dev/null 2>&1
}

request_error_message() {
  local file="$1"
  if [[ -s "$file" ]] && jq -e . "$file" >/dev/null 2>&1; then
    jq -r '.message // .error // .data.message // empty' "$file" 2>/dev/null | head -c 400
  fi
}

verbose_json() {
  local label="$1"
  local file="$2"

  if is_true "$VERBOSE" && [[ -s "$file" ]] && jq -e . "$file" >/dev/null 2>&1; then
    log "$label"
    jq 'del(.access_token,.accessToken,.token,.data.access_token,.data.accessToken,.data.token)' "$file"
  fi
}

extract_id() {
  jq -r '._id // .id // .data._id // .data.id // empty' "$1"
}

extract_scan_id() {
  jq -r '.scanId // .data.scanId // empty' "$1"
}

extract_first_finding_id() {
  jq -r '
    if type == "array" then .[0]._id
    else .items[0]._id // .data[0]._id // .data.items[0]._id // .findings[0]._id
    end // empty
  ' "$1"
}

normalize_findings_array() {
  local input_file="$1"

  jq -c '
    if type == "array" then .
    elif (.items? | type) == "array" then .items
    elif (.data? | type) == "array" then .data
    elif (.data?.items? | type) == "array" then .data.items
    elif (.findings? | type) == "array" then .findings
    else []
    end
  ' "$input_file"
}

select_smoke_finding() {
  local input_file="$1"
  local expected_scan_id="$2"
  local expected_tag="$3"

  normalize_findings_array "$input_file" | jq -c \
    --arg scanId "$expected_scan_id" \
    --arg runId "$RUN_ID" \
    --arg expectedTag "$expected_tag" '
      def id_string($value):
        if $value == null then ""
        elif ($value | type) == "object" then (($value._id // $value.id // "") | tostring)
        else ($value | tostring)
        end;

      def belongs_to_run:
        (id_string(.scanId) == $scanId)
        or (id_string(.lastSeenScanId) == $scanId)
        or (((.metadata.runId // "") | tostring) == $runId)
        or (((.title // "") | tostring) | contains($runId));

      (
        [ .[]
          | select((.duplicateTag // "") == $expectedTag)
          | select(belongs_to_run)
        ][0]
      ) //
      (
        [ .[] | select((.duplicateTag // "") == $expectedTag) ][0]
      ) // empty
    '
}

fetch_scan_details() {
  local output_file="$1"
  local scan_id="$2"

  if [[ -z "$scan_id" ]]; then
    return 1
  fi

  # The backend scan-details endpoint is the authoritative scan-to-finding
  # lookup. It returns { scan, findings } and matches both scanId and
  # lastSeenScanId internally, avoiding unsupported list-query filters.
  request_json GET \
    "/vulnerability-management/scans/$scan_id" \
    "$output_file" \
    "200" \
    primary
}

test_authentication() {
  local output="$TMP_DIR/login.json"

  if [[ -n "$ACCESS_TOKEN" ]]; then
    TOKEN="$ACCESS_TOKEN"
    TEST_MESSAGE="using token supplied through VM_SMOKE_ACCESS_TOKEN"
    TEST_DETAILS='{"loginSkipped":true}'
    return 0
  fi

  if [[ -z "$EMAIL" ]]; then
    TEST_MESSAGE="EMAIL is required when VM_SMOKE_ACCESS_TOKEN is not supplied"
    return 1
  fi

  if [[ -z "$PASSWORD" ]]; then
    if [[ ! -t 0 ]]; then
      TEST_MESSAGE="PASSWORD is required in non-interactive mode"
      return 1
    fi

    read -r -s -p "Password for $EMAIL: " PASSWORD
    printf '\n'
  fi

  local payload
  payload="$(jq -nc --arg email "$EMAIL" --arg password "$PASSWORD" '{email:$email,password:$password}')"

  if ! request_json POST "" "$output" "200,201" none "$payload" "$TENANT_ID" "$LOGIN_URL"; then
    TEST_MESSAGE="login failed (HTTP ${HTTP_CODE}, curl ${HTTP_CURL_RC}): $(request_error_message "$output")"
    PASSWORD=""
    unset PASSWORD
    return 1
  fi

  TOKEN="$(jq -r '.access_token // .accessToken // .token // .data.access_token // .data.accessToken // .data.token // empty' "$output")"
  PASSWORD=""
  unset PASSWORD

  if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
    TEST_MESSAGE="login response did not contain a supported access-token field"
    return 1
  fi

  TEST_MESSAGE="authenticated successfully"
  TEST_DETAILS="$(jq -nc --arg httpCode "$HTTP_CODE" '{httpCode:($httpCode|tonumber)}')"
  return 0
}

test_unauthorized_access() {
  if ! is_true "$TEST_UNAUTHORIZED"; then
    TEST_MESSAGE="disabled by configuration"
    return 2
  fi

  local output="$TMP_DIR/unauthorized.json"

  # Authentication guards may return plain text for 401/403. For this test,
  # the HTTP status is authoritative; a JSON response body is not required.
  if request_json GET "/vulnerability-management/dashboard/summary" "$output" "401,403" none "" "" "" false; then
    TEST_MESSAGE="unauthenticated request was rejected with HTTP $HTTP_CODE"
    TEST_DETAILS="$(jq -nc --arg httpCode "$HTTP_CODE" '{httpCode:($httpCode|tonumber)}')"
    return 0
  fi

  if [[ "$HTTP_CURL_RC" -ne 0 ]]; then
    TEST_MESSAGE="request failed at transport level (curl $HTTP_CURL_RC)"
  else
    TEST_MESSAGE="expected HTTP 401/403, received HTTP $HTTP_CODE"
  fi
  return 1
}

test_scanner_options() {
  local output="$TMP_DIR/scan-options.json"

  if ! request_json GET "/vulnerability-management/scans/options" "$output" "200" primary; then
    TEST_MESSAGE="scanner options request failed (HTTP $HTTP_CODE): $(request_error_message "$output")"
    return 1
  fi

  local scanner_count
  scanner_count="$(jq '[.scanners[]?] | length' "$output")"
  if [[ "$scanner_count" -lt 1 ]]; then
    TEST_MESSAGE="scanner options response contains no scanners"
    return 1
  fi

  TEST_MESSAGE="$scanner_count scanner option(s) returned"
  TEST_DETAILS="$(jq -c '{scannerCount:([.scanners[]?]|length),scanners:[.scanners[]?.value]}' "$output")"
  verbose_json "Scanner options response" "$output"
  return 0
}

test_dashboard_before() {
  local output="$TMP_DIR/dashboard-before.json"

  if ! request_json GET "/vulnerability-management/dashboard/summary" "$output" "200" primary; then
    TEST_MESSAGE="dashboard summary request failed (HTTP $HTTP_CODE): $(request_error_message "$output")"
    return 1
  fi

  if [[ "$(jq -r 'type' "$output")" != "object" ]]; then
    TEST_MESSAGE="dashboard summary is not a JSON object"
    return 1
  fi

  TEST_MESSAGE="dashboard summary is accessible"
  TEST_DETAILS="$(jq -c '{keys:(keys|sort)}' "$output")"
  return 0
}

test_create_repository() {
  local output="$TMP_DIR/repository.json"
  local payload

  REPO_NAME="vm-smoke-${RUN_ID}"
  REPO_URL_FOR_METADATA="${RUN_REPO_URL:-https://github.com/grc-smoke-test/vm-smoke-test.git}"

  payload="$(jq -nc \
    --arg name "$REPO_NAME" \
    --arg repoUrl "$REPO_URL_FOR_METADATA" \
    --arg provider "$RUN_SOURCE_TYPE" \
    --arg branch "$RUN_REPO_BRANCH" \
    '{
      name:$name,
      repoUrl:$repoUrl,
      provider:$provider,
      defaultBranch:$branch,
      criticality:"medium",
      technologies:["nodejs","smoke-test"],
      isActive:true
    }')"

  if ! request_json POST "/vulnerability-management/repositories" "$output" "200,201" primary "$payload"; then
    TEST_MESSAGE="repository creation failed (HTTP $HTTP_CODE): $(request_error_message "$output")"
    return 1
  fi

  REPOSITORY_ID="$(extract_id "$output")"
  if [[ -z "$REPOSITORY_ID" ]]; then
    TEST_MESSAGE="repository response did not contain an ID"
    return 1
  fi

  TEST_MESSAGE="created temporary repository $REPO_NAME"
  TEST_DETAILS="$(jq -nc --arg repositoryId "$REPOSITORY_ID" --arg name "$REPO_NAME" '{repositoryId:$repositoryId,name:$name}')"
  verbose_json "Repository response" "$output"
  return 0
}

create_manual_report() {
  jq -n \
    --arg runId "$RUN_ID" \
    --arg title "VM backend smoke finding ${RUN_ID}" \
    '{
      findings:[
        {
          source:"manual",
          findingType:"dependency",
          title:$title,
          description:"Safe backend smoke-test finding.",
          severity:"high",
          packageName:"vm-smoke-test-package",
          packageManager:"npm",
          installedVersion:"1.0.0",
          fixedVersion:"1.0.1",
          filePath:"package-lock.json",
          remediation:"Upgrade vm-smoke-test-package to 1.0.1 or later.",
          metadata:{smokeTest:true,runId:$runId}
        }
      ]
    }' > "$TMP_DIR/manual-vm-report.json"
  chmod 600 "$TMP_DIR/manual-vm-report.json"
}

test_first_upload() {
  local output="$TMP_DIR/upload-1.json"

  if ! request_multipart_upload "$output" "$REPOSITORY_ID"; then
    TEST_MESSAGE="first report upload failed (HTTP $HTTP_CODE): $(request_error_message "$output")"
    return 1
  fi

  ORIGINAL_SCAN_ID="$(extract_scan_id "$output")"
  if [[ -z "$ORIGINAL_SCAN_ID" ]]; then
    TEST_MESSAGE="first upload did not return scanId"
    return 1
  fi

  local total
  total="$(jq -r '.totalFindings // .data.totalFindings // 0' "$output")"
  if [[ ! "$total" =~ ^[0-9]+$ || "$total" -lt 1 ]]; then
    TEST_MESSAGE="first upload did not import a finding"
    return 1
  fi

  TEST_MESSAGE="first upload created scan $ORIGINAL_SCAN_ID with $total finding(s)"
  TEST_DETAILS="$(jq -nc --arg scanId "$ORIGINAL_SCAN_ID" --argjson totalFindings "$total" '{scanId:$scanId,totalFindings:$totalFindings}')"
  verbose_json "First upload response" "$output"
  return 0
}

test_second_upload() {
  local output="$TMP_DIR/upload-2.json"

  if ! request_multipart_upload "$output" "$REPOSITORY_ID"; then
    TEST_MESSAGE="second report upload failed (HTTP $HTTP_CODE): $(request_error_message "$output")"
    return 1
  fi

  DUPLICATE_SCAN_ID="$(extract_scan_id "$output")"
  if [[ -z "$DUPLICATE_SCAN_ID" ]]; then
    TEST_MESSAGE="second upload did not return scanId"
    return 1
  fi

  if [[ "$DUPLICATE_SCAN_ID" == "$ORIGINAL_SCAN_ID" ]]; then
    TEST_MESSAGE="second upload reused the first scan ID"
    return 1
  fi

  TEST_MESSAGE="second upload created scan $DUPLICATE_SCAN_ID"
  TEST_DETAILS="$(jq -nc --arg scanId "$DUPLICATE_SCAN_ID" '{scanId:$scanId}')"
  return 0
}

test_uploaded_scan_statuses() {
  local scan_id output status
  local statuses='[]'

  for scan_id in "$ORIGINAL_SCAN_ID" "$DUPLICATE_SCAN_ID"; do
    output="$TMP_DIR/scan-status-${scan_id}.json"
    if ! request_json GET "/vulnerability-management/scans/$scan_id/status" "$output" "200" primary; then
      TEST_MESSAGE="status request failed for scan $scan_id (HTTP $HTTP_CODE)"
      return 1
    fi

    status="$(jq -r '.status // empty' "$output")"
    if [[ "$status" != "completed" ]]; then
      TEST_MESSAGE="uploaded scan $scan_id has unexpected status: ${status:-missing}"
      return 1
    fi

    statuses="$(jq -c --arg scanId "$scan_id" --arg status "$status" '. + [{scanId:$scanId,status:$status}]' <<<"$statuses")"
  done

  TEST_MESSAGE="both uploaded scans are completed"
  TEST_DETAILS="$(jq -nc --argjson scans "$statuses" '{scans:$scans}')"
  return 0
}

test_original_finding() {
  local output="$TMP_DIR/findings-original.json"
  local finding_json tag

  if ! fetch_scan_details "$output" "$ORIGINAL_SCAN_ID"; then
    TEST_MESSAGE="original scan-details query failed (HTTP $HTTP_CODE): $(request_error_message "$output")"
    return 1
  fi

  finding_json="$(select_smoke_finding "$output" "$ORIGINAL_SCAN_ID" "original")"
  if [[ -z "$finding_json" || "$finding_json" == "null" ]]; then
    local returned_count
    returned_count="$(normalize_findings_array "$output" | jq 'length')"
    TEST_MESSAGE="scan $ORIGINAL_SCAN_ID returned no original smoke finding (returned=$returned_count)"
    return 1
  fi

  ORIGINAL_FINDING_ID="$(jq -r '._id // .id // empty' <<<"$finding_json")"
  tag="$(jq -r '.duplicateTag // empty' <<<"$finding_json")"

  if [[ -z "$ORIGINAL_FINDING_ID" ]]; then
    TEST_MESSAGE="original finding response did not contain an ID"
    return 1
  fi

  if [[ "$tag" != "original" ]]; then
    TEST_MESSAGE="first finding was not tagged original (tag=${tag:-missing})"
    return 1
  fi

  TEST_MESSAGE="original finding is tagged correctly"
  TEST_DETAILS="$(jq -nc --arg findingId "$ORIGINAL_FINDING_ID" --arg duplicateTag "$tag" '{findingId:$findingId,duplicateTag:$duplicateTag}')"
  return 0
}

test_duplicate_finding() {
  local output="$TMP_DIR/findings-duplicate.json"
  local finding_json tag duplicate_of occurrence

  if ! fetch_scan_details "$output" "$DUPLICATE_SCAN_ID"; then
    TEST_MESSAGE="duplicate scan-details query failed (HTTP $HTTP_CODE): $(request_error_message "$output")"
    return 1
  fi

  finding_json="$(select_smoke_finding "$output" "$DUPLICATE_SCAN_ID" "duplicate")"
  if [[ -z "$finding_json" || "$finding_json" == "null" ]]; then
    local returned_count
    returned_count="$(normalize_findings_array "$output" | jq 'length')"
    TEST_MESSAGE="scan $DUPLICATE_SCAN_ID returned no duplicate smoke finding (returned=$returned_count)"
    return 1
  fi

  DUPLICATE_FINDING_ID="$(jq -r '._id // .id // empty' <<<"$finding_json")"
  tag="$(jq -r '.duplicateTag // empty' <<<"$finding_json")"
  duplicate_of="$(jq -r '
    .duplicateOfFindingId
    | if type == "object" then (._id // .id // empty) else (. // empty) end
    | tostring
  ' <<<"$finding_json")"
  occurrence="$(jq -r '.duplicateOccurrence // 0' <<<"$finding_json")"

  if [[ -z "$DUPLICATE_FINDING_ID" ]]; then
    TEST_MESSAGE="duplicate finding response did not contain an ID"
    return 1
  fi

  if [[ "$tag" != "duplicate" ]]; then
    TEST_MESSAGE="second finding was not tagged duplicate (tag=${tag:-missing})"
    return 1
  fi

  if [[ -z "$duplicate_of" || "$duplicate_of" != "$ORIGINAL_FINDING_ID" ]]; then
    TEST_MESSAGE="duplicate finding does not reference the original finding (expected=$ORIGINAL_FINDING_ID actual=${duplicate_of:-missing})"
    return 1
  fi

  if [[ ! "$occurrence" =~ ^[0-9]+$ || "$occurrence" -lt 2 ]]; then
    TEST_MESSAGE="duplicate occurrence counter is invalid: $occurrence"
    return 1
  fi

  TEST_MESSAGE="duplicate finding links to the original finding"
  TEST_DETAILS="$(jq -nc \
    --arg findingId "$DUPLICATE_FINDING_ID" \
    --arg duplicateOfFindingId "$duplicate_of" \
    --argjson occurrence "$occurrence" \
    '{findingId:$findingId,duplicateOfFindingId:$duplicateOfFindingId,occurrence:$occurrence}')"
  return 0
}

test_finding_workflow() {
  local update_output="$TMP_DIR/finding-update.json"
  local verify_output="$TMP_DIR/finding-verify.json"
  local payload='{"status":"in_progress","comment":"Automated VM smoke-test status update"}'

  if [[ -z "$ORIGINAL_FINDING_ID" ]]; then
    TEST_MESSAGE="original finding ID is unavailable"
    return 1
  fi

  if ! request_json PATCH "/vulnerability-management/findings/$ORIGINAL_FINDING_ID/status" "$update_output" "200" primary "$payload"; then
    TEST_MESSAGE="finding status update failed (HTTP $HTTP_CODE): $(request_error_message "$update_output")"
    return 1
  fi

  if [[ "$(jq -r '.status // empty' "$update_output")" != "in_progress" ]]; then
    TEST_MESSAGE="finding status did not change to in_progress"
    return 1
  fi

  if ! request_json POST "/vulnerability-management/findings/$ORIGINAL_FINDING_ID/verify" "$verify_output" "200,201" primary; then
    TEST_MESSAGE="finding verification failed (HTTP $HTTP_CODE): $(request_error_message "$verify_output")"
    return 1
  fi

  if [[ "$(jq -r '.status // empty' "$verify_output")" != "verified" ]]; then
    TEST_MESSAGE="verified endpoint did not set status=verified"
    return 1
  fi

  TEST_MESSAGE="finding moved through in_progress to verified"
  TEST_DETAILS="$(jq -nc --arg findingId "$ORIGINAL_FINDING_ID" '{findingId:$findingId,finalStatus:"verified"}')"
  return 0
}

test_dashboard_after() {
  local output="$TMP_DIR/dashboard-after.json"

  if ! request_json GET "/vulnerability-management/dashboard/summary" "$output" "200" primary; then
    TEST_MESSAGE="post-test dashboard request failed (HTTP $HTTP_CODE)"
    return 1
  fi

  if [[ "$(jq -r 'type' "$output")" != "object" ]]; then
    TEST_MESSAGE="post-test dashboard response is not a JSON object"
    return 1
  fi

  TEST_MESSAGE="dashboard remains accessible after imports"
  TEST_DETAILS="$(jq -c '{keys:(keys|sort)}' "$output")"
  return 0
}

test_tenant_isolation() {
  if [[ -z "$SECOND_TENANT_ID" || -z "$SECOND_ACCESS_TOKEN" ]]; then
    TEST_MESSAGE="SECOND_TENANT_ID and SECOND_ACCESS_TOKEN were not supplied"
    return 2
  fi

  if [[ -z "$REPOSITORY_ID" ]]; then
    TEST_MESSAGE="repository ID is unavailable"
    return 1
  fi

  local output="$TMP_DIR/tenant-isolation.json"

  if request_json GET "/vulnerability-management/repositories/$REPOSITORY_ID" "$output" "404" second "" "$SECOND_TENANT_ID"; then
    TEST_MESSAGE="second tenant could not read the first tenant repository"
    TEST_DETAILS="$(jq -nc --arg secondTenantId "$SECOND_TENANT_ID" '{secondTenantId:$secondTenantId,httpCode:404}')"
    return 0
  fi

  if [[ "$HTTP_CURL_RC" -ne 0 ]]; then
    TEST_MESSAGE="second-tenant request failed at transport level"
  else
    TEST_MESSAGE="expected second tenant to receive HTTP 404, received HTTP $HTTP_CODE"
  fi
  return 1
}

poll_scan_until_terminal() {
  local scan_id="$1"
  local deadline=$(( $(date +%s) + SCAN_POLL_TIMEOUT ))
  local output status progress current_step

  while (( $(date +%s) <= deadline )); do
    output="$TMP_DIR/live-scan-status-${scan_id}.json"

    if ! request_json GET "/vulnerability-management/scans/$scan_id/status" "$output" "200" primary; then
      return 1
    fi

    status="$(jq -r '.status // empty' "$output")"
    progress="$(jq -r '.progress // 0' "$output")"
    current_step="$(jq -r '.currentStep // empty' "$output")"

    printf '[%s] Scan %s: %s (%s%%) %s\n' \
      "$(date -u +%H:%M:%S)" "$scan_id" "${status:-unknown}" "$progress" "$current_step"

    case "$status" in
      completed) return 0 ;;
      failed|cancelled) return 1 ;;
      queued|running) sleep "$SCAN_POLL_INTERVAL" ;;
      *) sleep "$SCAN_POLL_INTERVAL" ;;
    esac
  done

  return 124
}

test_optional_live_scan() {
  if [[ -z "$RUN_REPO_URL" ]]; then
    TEST_MESSAGE="RUN_REPO_URL was not supplied"
    return 2
  fi

  local output="$TMP_DIR/run-scan.json"
  local payload

  payload="$(jq -nc \
    --arg scanner "$RUN_SCANNER" \
    --arg sourceType "$RUN_SOURCE_TYPE" \
    --arg scanCategory "$RUN_SCAN_CATEGORY" \
    --arg repoUrl "$RUN_REPO_URL" \
    --arg branch "$RUN_REPO_BRANCH" \
    --arg repositoryId "$REPOSITORY_ID" \
    --arg repositoryName "$REPO_NAME" \
    '{
      scanner:$scanner,
      sourceType:$sourceType,
      scanCategory:$scanCategory,
      repositoryId:$repositoryId,
      repositoryName:$repositoryName,
      repoUrl:$repoUrl,
      target:$repoUrl,
      branch:$branch,
      triggerType:"api",
      keepWorkspace:false
    }')"

  if ! request_json POST "/vulnerability-management/scans/run" "$output" "200,201,202" primary "$payload"; then
    TEST_MESSAGE="server-side scan queue request failed (HTTP $HTTP_CODE): $(request_error_message "$output")"
    return 1
  fi

  mapfile -t LIVE_SCAN_IDS < <(jq -r '.scanIds[]? // .scans[]?.scanId // empty' "$output" | awk 'NF && !seen[$0]++')

  if [[ "${#LIVE_SCAN_IDS[@]}" -eq 0 ]]; then
    TEST_MESSAGE="scan queue response did not contain scan IDs"
    return 1
  fi

  local scan_id poll_rc=0
  local completed='[]'

  for scan_id in "${LIVE_SCAN_IDS[@]}"; do
    set +e
    poll_scan_until_terminal "$scan_id"
    local rc=$?
    set -e

    if [[ "$rc" -ne 0 ]]; then
      poll_rc="$rc"
      local status_file="$TMP_DIR/live-scan-status-${scan_id}.json"
      local final_status="unknown"
      local scan_error=""
      if [[ -s "$status_file" ]]; then
        final_status="$(jq -r '.status // "unknown"' "$status_file")"
        scan_error="$(jq -r '.error // empty' "$status_file" | head -c 400)"
      fi
      TEST_MESSAGE="live scan $scan_id ended with ${final_status}; ${scan_error}"
      [[ "$rc" -eq 124 ]] && TEST_MESSAGE="live scan $scan_id exceeded ${SCAN_POLL_TIMEOUT}s"
      return 1
    fi

    completed="$(jq -c --arg scanId "$scan_id" '. + [$scanId]' <<<"$completed")"
  done

  TEST_MESSAGE="${#LIVE_SCAN_IDS[@]} live scan job(s) completed"
  TEST_DETAILS="$(jq -nc --argjson scanIds "$completed" '{scanIds:$scanIds}')"
  return "$poll_rc"
}

cleanup_resources() {
  if ! is_true "$CLEANUP"; then
    record_test "Resource cleanup" "skipped" "disabled by configuration" 0 '{}'
    return 0
  fi

  if [[ -z "$REPOSITORY_ID" && -z "$ORIGINAL_FINDING_ID" && -z "$DUPLICATE_FINDING_ID" ]]; then
    record_test "Resource cleanup" "skipped" "no test resources were created" 0 '{}'
    return 0
  fi

  local cleanup_failures=0
  local closed='[]'
  local finding_id output payload
  payload='{"status":"closed","comment":"Automated VM smoke-test cleanup"}'

  for finding_id in "$ORIGINAL_FINDING_ID" "$DUPLICATE_FINDING_ID"; do
    [[ -z "$finding_id" ]] && continue
    output="$TMP_DIR/cleanup-finding-${finding_id}.json"
    if request_json PATCH "/vulnerability-management/findings/$finding_id/status" "$output" "200" primary "$payload"; then
      closed="$(jq -c --arg findingId "$finding_id" '. + [$findingId]' <<<"$closed")"
    else
      cleanup_failures=$((cleanup_failures + 1))
    fi
  done

  local repository_archived=false
  if [[ -n "$REPOSITORY_ID" ]]; then
    output="$TMP_DIR/cleanup-repository.json"
    if request_json PATCH "/vulnerability-management/repositories/$REPOSITORY_ID/archive" "$output" "200" primary; then
      repository_archived=true
    else
      cleanup_failures=$((cleanup_failures + 1))
    fi
  fi

  local details
  details="$(jq -nc \
    --argjson closedFindingIds "$closed" \
    --argjson repositoryArchived "$repository_archived" \
    --arg note "The backend currently has no scan/finding delete endpoints; historical smoke records remain for audit." \
    '{closedFindingIds:$closedFindingIds,repositoryArchived:$repositoryArchived,note:$note}')"

  if [[ "$cleanup_failures" -eq 0 ]]; then
    record_test "Resource cleanup" "passed" "repository archived and $(jq 'length' <<<"$closed") finding(s) closed" 0 "$details"
  else
    record_test "Resource cleanup" "warning" "$cleanup_failures cleanup action(s) failed" 0 "$details"
  fi
}

copy_artifacts() {
  if [[ -n "$ARTIFACT_DIR" ]]; then
    cp -a "$TMP_DIR/." "$ARTIFACT_DIR/"
    return 0
  fi

  if is_true "$KEEP_ARTIFACTS"; then
    ARTIFACT_DIR="/tmp/vm-backend-smoke-artifacts-${RUN_ID}"
    mkdir -p "$ARTIFACT_DIR"
    chmod 700 "$ARTIFACT_DIR" 2>/dev/null || true
    cp -a "$TMP_DIR/." "$ARTIFACT_DIR/"
  fi
}

finalize_report() {
  local completed_at end_epoch duration_ms overall_status
  completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  end_epoch="$(date +%s)"
  duration_ms=$(( (end_epoch - START_EPOCH) * 1000 ))

  if [[ "$FAIL_COUNT" -gt 0 ]]; then
    overall_status="failed"
  elif [[ "$WARN_COUNT" -gt 0 ]]; then
    overall_status="passed_with_warnings"
  else
    overall_status="passed"
  fi

  jq -s \
    --arg schemaVersion "1.0" \
    --arg scriptVersion "$SCRIPT_VERSION" \
    --arg runId "$RUN_ID" \
    --arg status "$overall_status" \
    --arg startedAt "$STARTED_AT" \
    --arg completedAt "$completed_at" \
    --argjson durationMs "$duration_ms" \
    --arg apiBaseUrl "$API_BASE_URL" \
    --arg loginUrl "$LOGIN_URL" \
    --arg tenantId "$TENANT_ID" \
    --arg repositoryId "$REPOSITORY_ID" \
    --arg repositoryName "$REPO_NAME" \
    --arg originalScanId "$ORIGINAL_SCAN_ID" \
    --arg duplicateScanId "$DUPLICATE_SCAN_ID" \
    --arg originalFindingId "$ORIGINAL_FINDING_ID" \
    --arg duplicateFindingId "$DUPLICATE_FINDING_ID" \
    --argjson liveScanIds "$(printf '%s\n' "${LIVE_SCAN_IDS[@]:-}" | awk 'NF' | jq -R . | jq -s .)" \
    --arg artifactDir "${ARTIFACT_DIR:-}" \
    --argjson passed "$PASS_COUNT" \
    --argjson failed "$FAIL_COUNT" \
    --argjson skipped "$SKIP_COUNT" \
    --argjson warnings "$WARN_COUNT" \
    '{
      schemaVersion:$schemaVersion,
      scriptVersion:$scriptVersion,
      runId:$runId,
      status:$status,
      startedAt:$startedAt,
      completedAt:$completedAt,
      durationMs:$durationMs,
      api:{baseUrl:$apiBaseUrl,apiBaseUrl:$apiBaseUrl,loginUrl:$loginUrl,tenantId:$tenantId},
      counts:{passed:$passed,failed:$failed,skipped:$skipped,warnings:$warnings},
      resources:{
        repositoryId:(if ($repositoryId|length)>0 then $repositoryId else null end),
        repositoryName:(if ($repositoryName|length)>0 then $repositoryName else null end),
        originalScanId:(if ($originalScanId|length)>0 then $originalScanId else null end),
        duplicateScanId:(if ($duplicateScanId|length)>0 then $duplicateScanId else null end),
        originalFindingId:(if ($originalFindingId|length)>0 then $originalFindingId else null end),
        duplicateFindingId:(if ($duplicateFindingId|length)>0 then $duplicateFindingId else null end),
        liveScanIds:$liveScanIds
      },
      artifactDir:(if ($artifactDir|length)>0 then $artifactDir else null end),
      tests:.
    }' "$RESULTS_FILE" > "$REPORT_PATH"

  chmod 600 "$REPORT_PATH" 2>/dev/null || true

  if [[ ! -s "$REPORT_PATH" ]] || ! jq -e . "$REPORT_PATH" >/dev/null 2>&1; then
    err "Could not generate a valid smoke-test report: $REPORT_PATH"
    return 1
  fi
}

main() {
  parse_args "$@"

  if ! validate_configuration; then
    exit 2
  fi

  initialize_workspace

  log "VM backend smoke test ${SCRIPT_VERSION}"
  log "Run ID: $RUN_ID"
  log "API: $API_BASE_URL"
  log "Login: $LOGIN_URL"
  log "Tenant: $TENANT_ID"
  log "Report: $REPORT_PATH"

  if ! run_test "Authentication" test_authentication; then
    warn "Authentication is required; remaining API tests cannot run."
    return 1
  fi

  run_test "Unauthorized access rejection" test_unauthorized_access || true
  run_test "Scanner options endpoint" test_scanner_options || true
  run_test "Dashboard summary before" test_dashboard_before || true

  if run_test "Create temporary repository" test_create_repository; then
    create_manual_report

    if run_test "Upload original manual report" test_first_upload; then
      if run_test "Upload duplicate manual report" test_second_upload; then
        run_test "Uploaded scan statuses" test_uploaded_scan_statuses || true
        run_test "Original finding classification" test_original_finding || true
        run_test "Duplicate finding classification" test_duplicate_finding || true
        run_test "Finding status workflow" test_finding_workflow || true
      fi
    fi

    run_test "Cross-tenant repository isolation" test_tenant_isolation || true
    run_test "Optional server-side scanner" test_optional_live_scan || true
  else
    record_test "Upload original manual report" "skipped" "repository creation failed" 0 '{}'
    record_test "Upload duplicate manual report" "skipped" "repository creation failed" 0 '{}'
    record_test "Uploaded scan statuses" "skipped" "repository creation failed" 0 '{}'
    record_test "Original finding classification" "skipped" "repository creation failed" 0 '{}'
    record_test "Duplicate finding classification" "skipped" "repository creation failed" 0 '{}'
    record_test "Finding status workflow" "skipped" "repository creation failed" 0 '{}'
    record_test "Cross-tenant repository isolation" "skipped" "repository creation failed" 0 '{}'
    record_test "Optional server-side scanner" "skipped" "repository creation failed" 0 '{}'
  fi

  run_test "Dashboard summary after" test_dashboard_after || true
  return 0
}

MAIN_RC=0

set +e
main "$@"
MAIN_RC=$?
set -e

if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then
  if [[ -n "$TOKEN" ]]; then
    cleanup_resources || true
  fi

  copy_artifacts || warn "Could not preserve response artifacts"
  finalize_report

  rm -rf "$TMP_DIR"
fi

printf '\n======================================\n'
printf 'VM Backend Smoke Test Result\n'
printf '======================================\n'
printf 'Run ID:    %s\n' "$RUN_ID"
printf 'Passed:    %s\n' "$PASS_COUNT"
printf 'Warnings:  %s\n' "$WARN_COUNT"
printf 'Failed:    %s\n' "$FAIL_COUNT"
printf 'Skipped:   %s\n' "$SKIP_COUNT"
printf 'Report:    %s\n' "$REPORT_PATH"
if [[ -n "${ARTIFACT_DIR:-}" ]]; then
  printf 'Artifacts: %s\n' "$ARTIFACT_DIR"
fi
printf '======================================\n'

if [[ "$FAIL_COUNT" -gt 0 || "$MAIN_RC" -ne 0 ]]; then
  exit 1
fi

exit 0