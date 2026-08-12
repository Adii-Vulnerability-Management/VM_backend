#!/usr/bin/env bash
# install-vm-scanners.sh
# Installs pinned vulnerability-scanner versions with release checksum verification.
# Supported host: Linux (x86_64/amd64 and arm64/aarch64).
# Run only on systems where you are authorized to install and operate scanners.

set -Euo pipefail
umask 022

export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"

SCRIPT_VERSION="2.1.0"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Pinned versions verified against upstream release/package pages on 2026-07-27.
SEMGREP_VERSION="${SEMGREP_VERSION:-1.171.0}"
GITLEAKS_VERSION="${GITLEAKS_VERSION:-8.30.1}"
OSV_VERSION="${OSV_VERSION:-2.4.0}"
TRIVY_VERSION="${TRIVY_VERSION:-0.72.0}"
DEPENDENCY_CHECK_VERSION="${DEPENDENCY_CHECK_VERSION:-12.2.2}"
CHECKOV_VERSION="${CHECKOV_VERSION:-3.3.8}"
PROWLER_VERSION="${PROWLER_VERSION:-5.36.0}"
SCOUTSUITE_VERSION="${SCOUTSUITE_VERSION:-5.14.0}"

INSTALL_SCOPE="${VM_INSTALL_SCOPE:-system}"       # system | user
INSTALL_BASE_PACKAGES="true"
INSTALL_CLOUD_TOOLS="true"
INSTALL_DEPENDENCY_CHECK="true"
PULL_ZAP_IMAGE="false"
CHECK_ONLY="false"
ALLOW_UNVERIFIED_DOWNLOADS="${VM_ALLOW_UNVERIFIED_DOWNLOADS:-false}"
ALLOW_MUTABLE_ZAP_TAG="${VM_ALLOW_MUTABLE_ZAP_TAG:-false}"
ZAP_IMAGE="${VM_ZAP_DOCKER_IMAGE:-}"
REPORT_FILE="${VM_SCANNER_INSTALL_REPORT:-./scanner-install-report.json}"

# Optional independent SHA-256 overrides. When set, these take precedence over
# checksum files published with the GitHub release.
GITLEAKS_SHA256="${GITLEAKS_SHA256:-}"
OSV_SHA256="${OSV_SHA256:-}"
TRIVY_SHA256="${TRIVY_SHA256:-}"
DEPENDENCY_CHECK_SHA256="${DEPENDENCY_CHECK_SHA256:-}"

GITHUB_TOKEN="${GITHUB_TOKEN:-}"
TMP_DIR=""
RESULTS_TSV=""
FAILURES=0
WARNINGS=0

BIN_DIR=""
APP_DIR=""
DATA_DIR=""
PIPX_HOME_DIR=""
PIPX_BIN_DIR=""

usage() {
  cat <<USAGE
Usage:
  ./scripts/install-vm-scanners.sh [options]

Options:
  --scope system|user          Install system-wide or for the current user.
                               Default: ${INSTALL_SCOPE}
  --report <path>              Installation report JSON path.
                               Default: ${REPORT_FILE}
  --skip-base-packages         Do not install OS prerequisite packages.
  --skip-cloud-tools           Do not install Checkov, Prowler, or ScoutSuite.
  --skip-dependency-check      Do not install OWASP Dependency-Check.
  --pull-zap-image             Pull the image provided by VM_ZAP_DOCKER_IMAGE.
  --check-only                 Do not change the system; only report current tools.
  --allow-unverified-downloads Continue when an upstream checksum asset is absent.
                               Not recommended for production.
  --allow-mutable-zap-tag      Allow pulling a ZAP image without an @sha256 digest.
  --help                       Show this help.

Pinned versions:
  Semgrep:                 ${SEMGREP_VERSION}
  Gitleaks:                ${GITLEAKS_VERSION}
  OSV-Scanner:             ${OSV_VERSION}
  Trivy:                   ${TRIVY_VERSION}
  OWASP Dependency-Check:  ${DEPENDENCY_CHECK_VERSION}
  Checkov:                 ${CHECKOV_VERSION}
  Prowler:                 ${PROWLER_VERSION}
  ScoutSuite:              ${SCOUTSUITE_VERSION}

Environment variables:
  SEMGREP_VERSION, GITLEAKS_VERSION, OSV_VERSION, TRIVY_VERSION
  DEPENDENCY_CHECK_VERSION, CHECKOV_VERSION, PROWLER_VERSION
  SCOUTSUITE_VERSION

  GITLEAKS_SHA256, OSV_SHA256, TRIVY_SHA256,
  DEPENDENCY_CHECK_SHA256

  GITHUB_TOKEN                    Optional GitHub API token for rate limits.
  VM_INSTALL_SCOPE                system or user.
  VM_ZAP_DOCKER_IMAGE             Exact ZAP image. Prefer an @sha256 digest.
  VM_ALLOW_UNVERIFIED_DOWNLOADS   true only for an approved emergency exception.
USAGE
}

log()  { printf '\n[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
warn() { printf '\n[%s] WARN: %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; WARNINGS=$((WARNINGS + 1)); }
err()  { printf '\n[%s] ERROR: %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }

is_true() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

sanitize_field() {
  printf '%s' "${1:-}" | tr '\t\r\n' '   '
}

record_result() {
  local name="$1"
  local requested="$2"
  local installed="$3"
  local status="$4"
  local verified="$5"
  local path="$6"
  local message="${7:-}"

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$(sanitize_field "$name")" \
    "$(sanitize_field "$requested")" \
    "$(sanitize_field "$installed")" \
    "$(sanitize_field "$status")" \
    "$(sanitize_field "$verified")" \
    "$(sanitize_field "$path")" \
    "$(sanitize_field "$message")" \
    >> "$RESULTS_TSV"
}

mark_failure() {
  FAILURES=$((FAILURES + 1))
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --scope)
        [[ $# -ge 2 ]] || { err "--scope requires a value"; exit 2; }
        INSTALL_SCOPE="$2"
        shift 2
        ;;
      --report)
        [[ $# -ge 2 ]] || { err "--report requires a path"; exit 2; }
        REPORT_FILE="$2"
        shift 2
        ;;
      --skip-base-packages)
        INSTALL_BASE_PACKAGES="false"
        shift
        ;;
      --skip-cloud-tools)
        INSTALL_CLOUD_TOOLS="false"
        shift
        ;;
      --skip-dependency-check)
        INSTALL_DEPENDENCY_CHECK="false"
        shift
        ;;
      --pull-zap-image)
        PULL_ZAP_IMAGE="true"
        shift
        ;;
      --check-only)
        CHECK_ONLY="true"
        INSTALL_BASE_PACKAGES="false"
        shift
        ;;
      --allow-unverified-downloads)
        ALLOW_UNVERIFIED_DOWNLOADS="true"
        shift
        ;;
      --allow-mutable-zap-tag)
        ALLOW_MUTABLE_ZAP_TAG="true"
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

  case "$INSTALL_SCOPE" in
    system|user) ;;
    *) err "Invalid --scope: $INSTALL_SCOPE. Use system or user."; exit 2 ;;
  esac

  if [[ "$REPORT_FILE" != *.json ]]; then
    warn "Report path does not end in .json: $REPORT_FILE"
  fi
}

setup_paths() {
  if [[ "$INSTALL_SCOPE" == "system" ]]; then
    BIN_DIR="/usr/local/bin"
    APP_DIR="/opt/vm-scanners"
    DATA_DIR="/var/lib/vm-scanners"
    PIPX_HOME_DIR="/opt/vm-scanners/pipx"
    PIPX_BIN_DIR="/usr/local/bin"
  else
    BIN_DIR="$HOME/.local/bin"
    APP_DIR="$HOME/.local/share/vm-scanners"
    DATA_DIR="$HOME/.cache/vm-scanners"
    PIPX_HOME_DIR="$HOME/.local/share/pipx"
    PIPX_BIN_DIR="$HOME/.local/bin"
  fi

  export PATH="$PIPX_BIN_DIR:$BIN_DIR:$PATH"
}

as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
    return $?
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return $?
  fi

  err "sudo is required for system installation. Use --scope user or install sudo."
  return 127
}

install_dir() {
  local path="$1"
  local mode="${2:-0755}"

  if [[ "$INSTALL_SCOPE" == "system" ]]; then
    as_root install -d -m "$mode" "$path"
  else
    install -d -m "$mode" "$path"
  fi
}

install_file() {
  local source="$1"
  local destination="$2"
  local mode="${3:-0755}"

  if [[ "$INSTALL_SCOPE" == "system" ]]; then
    as_root install -m "$mode" "$source" "$destination"
  else
    install -m "$mode" "$source" "$destination"
  fi
}

remove_path() {
  local path="$1"
  if [[ "$INSTALL_SCOPE" == "system" ]]; then
    as_root rm -rf -- "$path"
  else
    rm -rf -- "$path"
  fi
}

create_symlink() {
  local target="$1"
  local link="$2"
  if [[ "$INSTALL_SCOPE" == "system" ]]; then
    as_root ln -sfn "$target" "$link"
  else
    ln -sfn "$target" "$link"
  fi
}

install_base_packages() {
  if [[ "$INSTALL_BASE_PACKAGES" != "true" ]]; then
    record_result "base_packages" "required" "unknown" "skipped" "false" "" "Base-package installation disabled"
    return 0
  fi

  log "Installing base packages"

  if command -v apt-get >/dev/null 2>&1; then
    as_root env DEBIAN_FRONTEND=noninteractive apt-get update || return 1
    as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y \
      git curl unzip tar jq coreutils ca-certificates \
      python3 python3-pip python3-venv pipx \
      nmap openjdk-17-jre-headless || return 1
  elif command -v dnf >/dev/null 2>&1; then
    as_root dnf install -y \
      git curl unzip tar jq coreutils ca-certificates \
      python3 python3-pip pipx nmap java-17-openjdk-headless || return 1
  elif command -v yum >/dev/null 2>&1; then
    as_root yum install -y \
      git curl unzip tar jq coreutils ca-certificates \
      python3 python3-pip nmap java-17-openjdk-headless || return 1
    if ! command -v pipx >/dev/null 2>&1; then
      python3 -m pip install --user --upgrade pipx || return 1
    fi
  else
    err "Supported package manager not found. Install prerequisites manually."
    return 1
  fi

  record_result "base_packages" "required" "installed" "success" "true" "" "OS prerequisites installed"
  return 0
}

command_version() {
  local binary="$1"
  shift
  if ! command -v "$binary" >/dev/null 2>&1; then
    return 1
  fi
  "$binary" "$@" 2>&1 | head -n 1 | tr -d '\r'
}

check_required_commands() {
  local missing=0
  local commands=()

  if [[ "$CHECK_ONLY" == "true" ]]; then
    commands=(git jq python3 timeout nmap)
  else
    commands=(git curl unzip tar jq sha256sum python3 pipx timeout nmap)
  fi

  for command_name in "${commands[@]}"; do
    if command -v "$command_name" >/dev/null 2>&1; then
      record_result "$command_name" "required" "$(command_version "$command_name" --version || true)" "present" "true" "$(command -v "$command_name")" ""
    else
      record_result "$command_name" "required" "missing" "failed" "false" "" "Required command is not installed"
      err "Required command is missing: $command_name"
      missing=1
    fi
  done

  if ! python3 - <<'PY'
import sys
raise SystemExit(0 if (3, 10) <= sys.version_info[:2] < (3, 14) else 1)
PY
  then
    record_result "python" ">=3.10,<3.14" "$(python3 --version 2>&1 || true)" "failed" "false" "$(command -v python3 2>/dev/null || true)" "Python version is incompatible with pinned Semgrep/Prowler"
    err "Python 3.10 through 3.13 is required. Found: $(python3 --version 2>&1 || echo unknown)"
    missing=1
  fi

  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    record_result "node" "required for npm audit" "$(node --version 2>&1)" "present" "true" "$(command -v node)" ""
    record_result "npm" "required for npm audit" "$(npm --version 2>&1)" "present" "true" "$(command -v npm)" ""
  else
    record_result "node_npm" "required for npm audit" "missing" "failed" "false" "" "Install a supported Node.js release with npm"
    err "Node.js and npm are required by vm-scan.sh for npm audit."
    missing=1
  fi

  if [[ "$INSTALL_DEPENDENCY_CHECK" == "true" ]]; then
    if command -v java >/dev/null 2>&1; then
      local java_version
      java_version="$(java -version 2>&1 | head -n 1)"
      record_result "java" ">=11" "$java_version" "present" "true" "$(command -v java)" ""
    else
      record_result "java" ">=11" "missing" "failed" "false" "" "Required by OWASP Dependency-Check"
      err "Java 11 or newer is required for OWASP Dependency-Check."
      missing=1
    fi
  fi

  return "$missing"
}

api_curl_args() {
  API_CURL_ARGS=(
    --proto '=https'
    --tlsv1.2
    --fail
    --silent
    --show-error
    --location
    --retry 3
    --retry-delay 2
    --connect-timeout 20
    --max-time 300
    -H 'Accept: application/vnd.github+json'
    -H 'X-GitHub-Api-Version: 2022-11-28'
  )

  if [[ -n "$GITHUB_TOKEN" ]]; then
    API_CURL_ARGS+=( -H "Authorization: Bearer ${GITHUB_TOKEN}" )
  fi
}

release_metadata_file() {
  local repo="$1"
  local tag="$2"
  local safe_repo="${repo//\//_}"
  local file="$TMP_DIR/${safe_repo}_${tag}.json"

  if [[ ! -s "$file" ]]; then
    api_curl_args
    curl "${API_CURL_ARGS[@]}" \
      "https://api.github.com/repos/${repo}/releases/tags/${tag}" \
      -o "$file" || return 1
    jq -e '.assets | type == "array"' "$file" >/dev/null 2>&1 || return 1
  fi

  printf '%s\n' "$file"
}

asset_url_from_release() {
  local metadata="$1"
  local asset_name="$2"

  jq -r --arg name "$asset_name" \
    '.assets[] | select(.name == $name) | .browser_download_url' \
    "$metadata" | head -n 1
}

checksum_url_from_release() {
  local metadata="$1"
  local asset_name="$2"

  jq -r --arg asset "$asset_name" '
    [
      .assets[]
      | select(
          .name == ($asset + ".sha256") or
          .name == ($asset + ".sha256.txt") or
          .name == ($asset + ".sha256sum")
        )
      | .browser_download_url
    ][0] // empty
  ' "$metadata"
}

generic_checksum_url_from_release() {
  local metadata="$1"

  jq -r '
    [
      .assets[]
      | select(.name | test("sha256|checksums|sha256sums"; "i"))
      | .browser_download_url
    ][0] // empty
  ' "$metadata"
}

download_url() {
  local url="$1"
  local destination="$2"

  curl \
    --proto '=https' \
    --tlsv1.2 \
    --fail \
    --silent \
    --show-error \
    --location \
    --retry 3 \
    --retry-delay 2 \
    --connect-timeout 20 \
    --max-time 900 \
    "$url" \
    -o "$destination"
}

extract_expected_sha256() {
  local checksum_file="$1"
  local asset_name="$2"

  python3 - "$checksum_file" "$asset_name" <<'PY'
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
asset = sys.argv[2]
text = path.read_text(encoding="utf-8", errors="replace")

patterns = [
    re.compile(rf"^([0-9a-fA-F]{{64}})\s+\*?{re.escape(asset)}\s*$", re.M),
    re.compile(rf"^SHA256\s*\({re.escape(asset)}\)\s*=\s*([0-9a-fA-F]{{64}})\s*$", re.M | re.I),
]

for pattern in patterns:
    match = pattern.search(text)
    if match:
        print(match.group(1).lower())
        raise SystemExit(0)

stripped = text.strip()
if re.fullmatch(r"[0-9a-fA-F]{64}", stripped):
    print(stripped.lower())
    raise SystemExit(0)

raise SystemExit(1)
PY
}

verify_release_asset() {
  local metadata="$1"
  local asset_name="$2"
  local downloaded_file="$3"
  local override_sha="$4"

  local actual_sha
  actual_sha="$(sha256sum "$downloaded_file" | awk '{print tolower($1)}')"

  if [[ -n "$override_sha" ]]; then
    if [[ "${override_sha,,}" == "$actual_sha" ]]; then
      return 0
    fi
    err "SHA-256 mismatch for ${asset_name}."
    return 1
  fi

  local checksum_url checksum_file expected_sha
  checksum_url="$(checksum_url_from_release "$metadata" "$asset_name")"
  if [[ -z "$checksum_url" ]]; then
    checksum_url="$(generic_checksum_url_from_release "$metadata")"
  fi

  if [[ -n "$checksum_url" ]]; then
    checksum_file="$TMP_DIR/${asset_name}.checksums"
    if download_url "$checksum_url" "$checksum_file"; then
      expected_sha="$(extract_expected_sha256 "$checksum_file" "$asset_name" 2>/dev/null || true)"
      if [[ -n "$expected_sha" && "$expected_sha" == "$actual_sha" ]]; then
        return 0
      fi
    fi
  fi

  if is_true "$ALLOW_UNVERIFIED_DOWNLOADS"; then
    warn "No usable upstream SHA-256 was found for ${asset_name}; continuing by explicit exception."
    return 2
  fi

  err "Could not verify ${asset_name}. Provide its approved SHA-256 through the matching *_SHA256 variable."
  return 1
}

download_verified_release_asset() {
  local repo="$1"
  local tag="$2"
  local asset_name="$3"
  local destination="$4"
  local override_sha="$5"

  local metadata url verify_rc
  metadata="$(release_metadata_file "$repo" "$tag")" || return 1
  url="$(asset_url_from_release "$metadata" "$asset_name")"

  if [[ -z "$url" ]]; then
    err "Release asset not found: ${repo} ${tag} ${asset_name}"
    return 1
  fi

  download_url "$url" "$destination" || return 1

  verify_release_asset "$metadata" "$asset_name" "$destination" "$override_sha"
  verify_rc=$?
  if [[ "$verify_rc" -eq 0 ]]; then
    printf 'verified\n'
    return 0
  fi
  if [[ "$verify_rc" -eq 2 ]]; then
    printf 'unverified_exception\n'
    return 0
  fi
  return 1
}

normalize_architecture() {
  local machine
  machine="$(uname -m)"

  case "$machine" in
    x86_64|amd64)
      GITLEAKS_ARCH="x64"
      OSV_ARCH="amd64"
      TRIVY_ARCH="64bit"
      ;;
    aarch64|arm64)
      GITLEAKS_ARCH="arm64"
      OSV_ARCH="arm64"
      TRIVY_ARCH="ARM64"
      ;;
    *)
      err "Unsupported architecture: $machine"
      return 1
      ;;
  esac

  record_result "architecture" "linux x86_64/arm64" "$machine" "supported" "true" "" ""
  return 0
}

pipx_run() {
  if [[ "$INSTALL_SCOPE" == "system" ]]; then
    as_root env \
      PIPX_HOME="$PIPX_HOME_DIR" \
      PIPX_BIN_DIR="$PIPX_BIN_DIR" \
      PIPX_DEFAULT_PYTHON="$(command -v python3)" \
      PATH="$PATH" \
      pipx "$@"
  else
    env \
      PIPX_HOME="$PIPX_HOME_DIR" \
      PIPX_BIN_DIR="$PIPX_BIN_DIR" \
      PIPX_DEFAULT_PYTHON="$(command -v python3)" \
      PATH="$PATH" \
      pipx "$@"
  fi
}

pipx_package_version() {
  local package_key="$1"
  local json
  json="$(pipx_run list --json 2>/dev/null || true)"
  [[ -n "$json" ]] || return 1

  jq -r --arg key "${package_key,,}" '
    .venvs[$key].metadata.main_package.package_version // empty
  ' <<< "$json"
}

install_pipx_scanner() {
  local display_name="$1"
  local package_name="$2"
  local package_key="$3"
  local version="$4"
  local binary="$5"
  shift 5
  local version_args=("$@")

  local installed_version path
  path="$(command -v "$binary" 2>/dev/null || true)"

  # Check-only must never inspect the system pipx home through sudo. The runtime
  # command and its reported version are sufficient for readiness validation.
  if [[ "$CHECK_ONLY" == "true" ]]; then
    if [[ -z "$path" ]]; then
      record_result "$display_name" "$version" "missing" "failed" "false" "" "Required scanner command is not installed"
      return 1
    fi

    installed_version="$(command_version "$binary" "${version_args[@]}" || echo unknown)"
    if [[ "$installed_version" == *"$version"* ]]; then
      record_result "$display_name" "$version" "$installed_version" "present_current" "true" "$path" "Check-only mode"
      return 0
    fi

    record_result "$display_name" "$version" "$installed_version" "outdated" "false" "$path" "Installed version does not match the pinned version"
    return 1
  fi

  installed_version="$(pipx_package_version "$package_key" || true)"

  if [[ "$installed_version" == "$version" && -n "$path" ]]; then
    record_result "$display_name" "$version" "$installed_version" "already_current" "true" "$path" ""
    return 0
  fi

  log "Installing ${display_name} ${version} with pipx"
  install_dir "$PIPX_HOME_DIR" 0755 || return 1
  install_dir "$PIPX_BIN_DIR" 0755 || return 1

  pipx_run install --force --python "$(command -v python3)" "${package_name}==${version}" || return 1
  hash -r

  path="$(command -v "$binary" 2>/dev/null || true)"
  installed_version="$(pipx_package_version "$package_key" || true)"

  if [[ -z "$path" || "$installed_version" != "$version" ]]; then
    record_result "$display_name" "$version" "${installed_version:-unknown}" "failed" "false" "$path" "Installed command/version could not be verified"
    return 1
  fi

  record_result "$display_name" "$version" "$installed_version" "success" "true" "$path" "Installed through isolated pipx environment"
  return 0
}

install_gitleaks() {
  local asset="gitleaks_${GITLEAKS_VERSION}_linux_${GITLEAKS_ARCH}.tar.gz"
  local archive="$TMP_DIR/$asset"
  local extracted="$TMP_DIR/gitleaks"
  local verification path installed

  path="$(command -v gitleaks 2>/dev/null || true)"
  installed="$(command_version gitleaks version || true)"

  if [[ "$CHECK_ONLY" == "true" ]]; then
    if [[ -z "$path" ]]; then
      record_result "gitleaks" "$GITLEAKS_VERSION" "missing" "failed" "false" "" "Required scanner command is not installed"
      return 1
    fi
    if [[ "$installed" == *"$GITLEAKS_VERSION"* ]]; then
      record_result "gitleaks" "$GITLEAKS_VERSION" "$installed" "present_current" "true" "$path" "Check-only mode"
      return 0
    fi
    record_result "gitleaks" "$GITLEAKS_VERSION" "$installed" "outdated" "false" "$path" "Installed version does not match the pinned version"
    return 1
  fi

  if [[ "$installed" == *"$GITLEAKS_VERSION"* && -n "$path" ]]; then
    record_result "gitleaks" "$GITLEAKS_VERSION" "$installed" "already_current" "true" "$path" ""
    return 0
  fi

  log "Installing Gitleaks ${GITLEAKS_VERSION}"
  verification="$(download_verified_release_asset \
    "gitleaks/gitleaks" "v${GITLEAKS_VERSION}" "$asset" "$archive" "$GITLEAKS_SHA256")" || return 1

  tar -tzf "$archive" >/dev/null 2>&1 || return 1
  tar -xzf "$archive" -C "$TMP_DIR" gitleaks || return 1
  [[ -x "$extracted" ]] || chmod 0755 "$extracted" || return 1
  install_file "$extracted" "$BIN_DIR/gitleaks" 0755 || return 1
  hash -r

  installed="$(command_version gitleaks version || true)"
  [[ "$installed" == *"$GITLEAKS_VERSION"* ]] || return 1
  record_result "gitleaks" "$GITLEAKS_VERSION" "$installed" "success" "$([[ "$verification" == "verified" ]] && echo true || echo false)" "$BIN_DIR/gitleaks" "$verification"
  return 0
}

install_osv_scanner() {
  local asset="osv-scanner_linux_${OSV_ARCH}"
  local binary="$TMP_DIR/$asset"
  local verification path installed

  path="$(command -v osv-scanner 2>/dev/null || true)"
  installed="$(command_version osv-scanner --version || true)"

  if [[ "$CHECK_ONLY" == "true" ]]; then
    if [[ -z "$path" ]]; then
      record_result "osv-scanner" "$OSV_VERSION" "missing" "failed" "false" "" "Required scanner command is not installed"
      return 1
    fi
    if [[ "$installed" == *"$OSV_VERSION"* ]]; then
      record_result "osv-scanner" "$OSV_VERSION" "$installed" "present_current" "true" "$path" "Check-only mode"
      return 0
    fi
    record_result "osv-scanner" "$OSV_VERSION" "$installed" "outdated" "false" "$path" "Installed version does not match the pinned version"
    return 1
  fi

  if [[ "$installed" == *"$OSV_VERSION"* && -n "$path" ]]; then
    record_result "osv-scanner" "$OSV_VERSION" "$installed" "already_current" "true" "$path" ""
    return 0
  fi

  log "Installing OSV-Scanner ${OSV_VERSION}"
  verification="$(download_verified_release_asset \
    "google/osv-scanner" "v${OSV_VERSION}" "$asset" "$binary" "$OSV_SHA256")" || return 1

  chmod 0755 "$binary" || return 1
  install_file "$binary" "$BIN_DIR/osv-scanner" 0755 || return 1
  hash -r

  installed="$(command_version osv-scanner --version || true)"
  [[ "$installed" == *"$OSV_VERSION"* ]] || return 1
  record_result "osv-scanner" "$OSV_VERSION" "$installed" "success" "$([[ "$verification" == "verified" ]] && echo true || echo false)" "$BIN_DIR/osv-scanner" "$verification"
  return 0
}

install_trivy() {
  local asset="trivy_${TRIVY_VERSION}_Linux-${TRIVY_ARCH}.tar.gz"
  local archive="$TMP_DIR/$asset"
  local extracted="$TMP_DIR/trivy"
  local verification path installed

  path="$(command -v trivy 2>/dev/null || true)"
  installed="$(command_version trivy --version || true)"

  if [[ "$CHECK_ONLY" == "true" ]]; then
    if [[ -z "$path" ]]; then
      record_result "trivy" "$TRIVY_VERSION" "missing" "failed" "false" "" "Required scanner command is not installed"
      return 1
    fi
    if [[ "$installed" == *"$TRIVY_VERSION"* ]]; then
      record_result "trivy" "$TRIVY_VERSION" "$installed" "present_current" "true" "$path" "Check-only mode"
      return 0
    fi
    record_result "trivy" "$TRIVY_VERSION" "$installed" "outdated" "false" "$path" "Installed version does not match the pinned version"
    return 1
  fi

  if [[ "$installed" == *"$TRIVY_VERSION"* && -n "$path" ]]; then
    record_result "trivy" "$TRIVY_VERSION" "$installed" "already_current" "true" "$path" ""
    return 0
  fi

  log "Installing Trivy ${TRIVY_VERSION}"
  verification="$(download_verified_release_asset \
    "aquasecurity/trivy" "v${TRIVY_VERSION}" "$asset" "$archive" "$TRIVY_SHA256")" || return 1

  tar -tzf "$archive" >/dev/null 2>&1 || return 1
  tar -xzf "$archive" -C "$TMP_DIR" trivy || return 1
  [[ -x "$extracted" ]] || chmod 0755 "$extracted" || return 1
  install_file "$extracted" "$BIN_DIR/trivy" 0755 || return 1
  hash -r

  installed="$(command_version trivy --version || true)"
  [[ "$installed" == *"$TRIVY_VERSION"* ]] || return 1
  record_result "trivy" "$TRIVY_VERSION" "$installed" "success" "$([[ "$verification" == "verified" ]] && echo true || echo false)" "$BIN_DIR/trivy" "$verification"
  return 0
}

write_dependency_check_wrapper() {
  local wrapper="$TMP_DIR/dependency-check.sh"
  local install_path="$1"
  local data_path="$2"

  cat > "$wrapper" <<WRAPPER
#!/usr/bin/env bash
set -euo pipefail
args=(--data "${data_path}")
if [[ -n "\${NVD_API_KEY:-}" ]]; then
  args+=(--nvdApiKey "\${NVD_API_KEY}")
fi
exec "${install_path}/bin/dependency-check.sh" "\${args[@]}" "\$@"
WRAPPER

  chmod 0755 "$wrapper"
  install_file "$wrapper" "$BIN_DIR/dependency-check.sh" 0755
}

install_dependency_check() {
  if [[ "$INSTALL_DEPENDENCY_CHECK" != "true" ]]; then
    record_result "dependency-check" "$DEPENDENCY_CHECK_VERSION" "not requested" "skipped" "false" "" "Installation disabled"
    return 0
  fi

  local asset="dependency-check-${DEPENDENCY_CHECK_VERSION}-release.zip"
  local archive="$TMP_DIR/$asset"
  local extraction_root="$TMP_DIR/dependency-check-extracted"
  local version_dir="$APP_DIR/dependency-check-${DEPENDENCY_CHECK_VERSION}"
  local stable_link="$APP_DIR/dependency-check"
  local data_path="$DATA_DIR/dependency-check"
  local verification path installed

  path="$(command -v dependency-check.sh 2>/dev/null || true)"
  installed="$(command_version dependency-check.sh --version || true)"

  if [[ "$CHECK_ONLY" == "true" ]]; then
    if [[ -z "$path" ]]; then
      record_result "dependency-check" "$DEPENDENCY_CHECK_VERSION" "missing" "failed" "false" "" "Required scanner command is not installed"
      return 1
    fi
    if [[ "$installed" == *"$DEPENDENCY_CHECK_VERSION"* ]]; then
      record_result "dependency-check" "$DEPENDENCY_CHECK_VERSION" "$installed" "present_current" "true" "$path" "Check-only mode"
      return 0
    fi
    record_result "dependency-check" "$DEPENDENCY_CHECK_VERSION" "$installed" "outdated" "false" "$path" "Installed version does not match the pinned version"
    return 1
  fi

  if [[ "$installed" == *"$DEPENDENCY_CHECK_VERSION"* && -n "$path" ]]; then
    record_result "dependency-check" "$DEPENDENCY_CHECK_VERSION" "$installed" "already_current" "true" "$path" ""
    return 0
  fi

  log "Installing OWASP Dependency-Check ${DEPENDENCY_CHECK_VERSION}"
  verification="$(download_verified_release_asset \
    "dependency-check/DependencyCheck" "v${DEPENDENCY_CHECK_VERSION}" "$asset" "$archive" "$DEPENDENCY_CHECK_SHA256")" || return 1

  unzip -tq "$archive" >/dev/null 2>&1 || return 1
  mkdir -p "$extraction_root" || return 1
  unzip -q "$archive" -d "$extraction_root" || return 1
  [[ -x "$extraction_root/dependency-check/bin/dependency-check.sh" ]] || chmod 0755 "$extraction_root/dependency-check/bin/dependency-check.sh" || return 1

  install_dir "$APP_DIR" 0755 || return 1
  install_dir "$data_path" 0750 || return 1
  remove_path "$version_dir" || return 1

  if [[ "$INSTALL_SCOPE" == "system" ]]; then
    as_root cp -a "$extraction_root/dependency-check" "$version_dir" || return 1
  else
    cp -a "$extraction_root/dependency-check" "$version_dir" || return 1
  fi

  create_symlink "$version_dir" "$stable_link" || return 1

  # Preserve compatibility with the previous installer path.
  if [[ "$INSTALL_SCOPE" == "system" ]]; then
    as_root ln -sfn "$stable_link" /opt/dependency-check || return 1
  fi

  write_dependency_check_wrapper "$stable_link" "$data_path" || return 1
  hash -r

  installed="$(command_version dependency-check.sh --version || true)"
  [[ "$installed" == *"$DEPENDENCY_CHECK_VERSION"* ]] || return 1
  record_result "dependency-check" "$DEPENDENCY_CHECK_VERSION" "$installed" "success" "$([[ "$verification" == "verified" ]] && echo true || echo false)" "$BIN_DIR/dependency-check.sh" "$verification; persistent data: $data_path"
  return 0
}

handle_zap_image() {
  if [[ "$PULL_ZAP_IMAGE" != "true" ]]; then
    if command -v docker >/dev/null 2>&1; then
      record_result "zap_docker" "explicit image required" "docker available" "skipped" "false" "$(command -v docker)" "Use --pull-zap-image with VM_ZAP_DOCKER_IMAGE"
    else
      record_result "zap_docker" "optional" "docker missing" "skipped" "false" "" "ZAP Docker mode unavailable"
    fi
    return 0
  fi

  if ! command -v docker >/dev/null 2>&1; then
    record_result "zap_docker" "$ZAP_IMAGE" "docker missing" "failed" "false" "" "Docker is required"
    return 1
  fi

  if [[ -z "$ZAP_IMAGE" ]]; then
    record_result "zap_docker" "pinned image" "missing" "failed" "false" "" "Set VM_ZAP_DOCKER_IMAGE"
    err "Set VM_ZAP_DOCKER_IMAGE to an approved ZAP image. Prefer an @sha256 digest."
    return 1
  fi

  if [[ "$ZAP_IMAGE" != *@sha256:* ]] && ! is_true "$ALLOW_MUTABLE_ZAP_TAG"; then
    record_result "zap_docker" "$ZAP_IMAGE" "mutable tag rejected" "failed" "false" "" "Use an @sha256 digest or --allow-mutable-zap-tag"
    err "ZAP image is not digest-pinned: $ZAP_IMAGE"
    return 1
  fi

  if [[ "$CHECK_ONLY" == "true" ]]; then
    if docker image inspect "$ZAP_IMAGE" >/dev/null 2>&1; then
      record_result "zap_docker" "$ZAP_IMAGE" "present" "present" "$([[ "$ZAP_IMAGE" == *@sha256:* ]] && echo true || echo false)" "$ZAP_IMAGE" "Check-only mode"
      return 0
    fi
    record_result "zap_docker" "$ZAP_IMAGE" "missing" "failed" "false" "$ZAP_IMAGE" "Check-only mode"
    return 1
  fi

  log "Pulling ZAP image"
  docker pull "$ZAP_IMAGE" || return 1
  docker image inspect "$ZAP_IMAGE" >/dev/null 2>&1 || return 1
  record_result "zap_docker" "$ZAP_IMAGE" "present" "success" "$([[ "$ZAP_IMAGE" == *@sha256:* ]] && echo true || echo false)" "$ZAP_IMAGE" ""
  return 0
}

run_install_step() {
  local label="$1"
  shift

  local rc=0
  if "$@"; then
    return 0
  else
    rc=$?
  fi

  err "$label failed"
  record_result "$label" "" "" "failed" "false" "" "Step returned exit code $rc"
  mark_failure
  return 0
}

write_report() {
  local final_status="success"
  [[ "$FAILURES" -gt 0 ]] && final_status="failed"

  local completed_at
  completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  mkdir -p "$(dirname "$REPORT_FILE")" 2>/dev/null || true

  if command -v python3 >/dev/null 2>&1; then
    python3 - "$RESULTS_TSV" "$REPORT_FILE" <<PY
import csv
import datetime
import json
import pathlib
import platform
import sys

results_file = pathlib.Path(sys.argv[1])
report_file = pathlib.Path(sys.argv[2])
items = []

if results_file.exists():
    with results_file.open("r", encoding="utf-8", errors="replace", newline="") as handle:
        for row in csv.reader(handle, delimiter="\t"):
            row += [""] * (7 - len(row))
            name, requested, installed, status, verified, path, message = row[:7]
            items.append({
                "name": name,
                "requestedVersion": requested or None,
                "installedVersion": installed or None,
                "status": status,
                "verified": verified.lower() == "true",
                "path": path or None,
                "message": message or None,
            })

report = {
    "schemaVersion": "1.0",
    "installerVersion": "${SCRIPT_VERSION}",
    "runId": "${RUN_ID}",
    "status": "${final_status}",
    "scope": "${INSTALL_SCOPE}",
    "checkOnly": "${CHECK_ONLY}".lower() == "true",
    "startedAt": "${STARTED_AT}",
    "completedAt": "${completed_at}",
    "host": {
        "hostname": platform.node(),
        "system": platform.system(),
        "machine": platform.machine(),
        "python": platform.python_version(),
    },
    "failureCount": ${FAILURES},
    "warningCount": ${WARNINGS},
    "tools": items,
}

report_file.parent.mkdir(parents=True, exist_ok=True)
report_file.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
PY
  else
    warn "python3 is unavailable; could not generate JSON report"
  fi

  log "Installation report: $REPORT_FILE"
}

print_versions() {
  echo ""
  echo "======================================"
  echo "Scanner Installation Result"
  echo "======================================"
  printf 'Semgrep:          %s\n' "$(command_version semgrep --version || echo missing)"
  printf 'Gitleaks:         %s\n' "$(command_version gitleaks version || echo missing)"
  printf 'OSV-Scanner:      %s\n' "$(command_version osv-scanner --version || echo missing)"
  printf 'Trivy:            %s\n' "$(command_version trivy --version || echo missing)"
  printf 'Dependency-Check: %s\n' "$(command_version dependency-check.sh --version || echo missing)"
  printf 'Checkov:          %s\n' "$(command_version checkov --version || echo missing)"
  printf 'Prowler:          %s\n' "$(command_version prowler -v || echo missing)"
  printf 'ScoutSuite:       %s\n' "$(command_version scout --version || command_version scout --help || echo missing)"
  printf 'Nmap:             %s\n' "$(command_version nmap --version || echo missing)"
  printf 'Node:             %s\n' "$(command_version node --version || echo missing)"
  printf 'npm:              %s\n' "$(command_version npm --version || echo missing)"
  echo "Report:           $REPORT_FILE"
  echo "Failures:         $FAILURES"
  echo "======================================"
}

cleanup() {
  if [[ -n "${TMP_DIR:-}" && -d "$TMP_DIR" ]]; then
    rm -rf -- "$TMP_DIR"
  fi
}

main() {
  parse_args "$@"
  setup_paths

  TMP_DIR="$(mktemp -d /tmp/vm-scanner-install.XXXXXX)"
  RESULTS_TSV="$TMP_DIR/results.tsv"
  : > "$RESULTS_TSV"
  trap cleanup EXIT INT TERM

  log "VM scanner installer ${SCRIPT_VERSION}"
  log "Scope: $INSTALL_SCOPE"
  log "Check-only: $CHECK_ONLY"

  if [[ "$CHECK_ONLY" != "true" ]]; then
    run_install_step "Base-package installation" install_base_packages
  else
    record_result "base_packages" "required" "unchanged" "skipped" "false" "" "Check-only mode"
  fi

  # Directory creation is done only after prerequisites are available.
  if [[ "$CHECK_ONLY" != "true" ]]; then
    run_install_step "Binary directory setup" install_dir "$BIN_DIR" 0755
    run_install_step "Application directory setup" install_dir "$APP_DIR" 0755
    run_install_step "Data directory setup" install_dir "$DATA_DIR" 0750
  fi

  run_install_step "Prerequisite validation" check_required_commands
  run_install_step "Architecture validation" normalize_architecture

  run_install_step "Semgrep installation" \
    install_pipx_scanner "semgrep" "semgrep" "semgrep" "$SEMGREP_VERSION" "semgrep" --version

  run_install_step "Gitleaks installation" install_gitleaks
  run_install_step "OSV-Scanner installation" install_osv_scanner
  run_install_step "Trivy installation" install_trivy
  run_install_step "Dependency-Check installation" install_dependency_check

  if [[ "$INSTALL_CLOUD_TOOLS" == "true" ]]; then
    run_install_step "Checkov installation" \
      install_pipx_scanner "checkov" "checkov" "checkov" "$CHECKOV_VERSION" "checkov" --version
    run_install_step "Prowler installation" \
      install_pipx_scanner "prowler" "prowler" "prowler" "$PROWLER_VERSION" "prowler" -v
    run_install_step "ScoutSuite installation" \
      install_pipx_scanner "scoutsuite" "ScoutSuite" "scoutsuite" "$SCOUTSUITE_VERSION" "scout" --version
  else
    record_result "checkov" "$CHECKOV_VERSION" "not requested" "skipped" "false" "" "Cloud-tool installation disabled"
    record_result "prowler" "$PROWLER_VERSION" "not requested" "skipped" "false" "" "Cloud-tool installation disabled"
    record_result "scoutsuite" "$SCOUTSUITE_VERSION" "not requested" "skipped" "false" "" "Cloud-tool installation disabled"
  fi

  run_install_step "ZAP image handling" handle_zap_image

  write_report
  print_versions

  if [[ "$FAILURES" -gt 0 ]]; then
    err "Installation completed with $FAILURES failed step(s)."
    exit 1
  fi

  log "All requested scanner installations are ready."
  echo "Next command: npm run vm:check-scanners"
}

main "$@"