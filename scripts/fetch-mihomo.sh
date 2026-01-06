#!/usr/bin/env bash
# MiHomo binary fetcher for Conflux
# Supports: macOS (ARM64, x86_64), Windows (x86_64), Linux (x86_64)
#
# Environment variables:
#   MIHOMO_PLATFORM - Specific platform to download (e.g., darwin-arm64, darwin-amd64, windows-amd64, linux-amd64)
#                     If not set, downloads all platforms
set -euo pipefail

# Determine script directory (works on bash/zsh/Git Bash)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_DIR="${MIHOMO_TARGET_DIR:-$ROOT_DIR/src-tauri/binaries}"
REPO="${MIHOMO_REPO:-MetaCubeX/mihomo}"
VERSION="${MIHOMO_VERSION:-latest}"
PYTHON_BIN="${PYTHON_BIN:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
MIHOMO_PLATFORM="${MIHOMO_PLATFORM:-}"

# Build curl auth header if token is available
CURL_AUTH_ARGS=()
if [[ -n "$GITHUB_TOKEN" ]]; then
  CURL_AUTH_ARGS=(-H "Authorization: Bearer $GITHUB_TOKEN")
  echo "Using GitHub token for API authentication"
fi

# Detect OS
detect_os() {
  case "$(uname -s)" in
    Darwin) echo "darwin" ;;
    Linux) echo "linux" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *) echo "unknown" ;;
  esac
}

OS_TYPE="$(detect_os)"
echo "Detected OS: $OS_TYPE"

# Find Python
if [[ -z "$PYTHON_BIN" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN=python3
  elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN=python
  else
    echo "Error: python3 or python is required to parse GitHub API responses." >&2
    exit 1
  fi
fi

echo "Using Python: $PYTHON_BIN"

# Build API URL
if [[ "$VERSION" == "latest" ]]; then
  API_URL="https://api.github.com/repos/$REPO/releases/latest"
else
  API_URL="https://api.github.com/repos/$REPO/releases/tags/$VERSION"
fi

echo "Fetching release info from $API_URL..."

# Create temp files
tmp_json="$(mktemp)"
work_dir="$(mktemp -d)"

# Helper to get path for Python (converts to Windows path on Windows)
python_path() {
  if [[ "$OS_TYPE" == "windows" ]]; then
    cygpath -w "$1"
  else
    echo "$1"
  fi
}

cleanup() {
  rm -f "$tmp_json" 2>/dev/null || true
  rm -rf "$work_dir" 2>/dev/null || true
}
trap cleanup EXIT

# Download release info
curl -fsSL ${CURL_AUTH_ARGS[@]+"${CURL_AUTH_ARGS[@]}"} "$API_URL" > "$tmp_json"

release_tag="$("$PYTHON_BIN" -c "
import json
with open(r'$(python_path "$tmp_json")', encoding='utf-8') as f:
    data = json.load(f)
print(data.get('tag_name', 'unknown'))
")"

echo "Found release: $release_tag"
mkdir -p "$TARGET_DIR"

# Download and extract function
download_and_extract() {
  local asset_pattern="$1"
  local target_name="$2"
  local archive_type="$3"

  local url
  local tmp_json_path
  tmp_json_path="$(python_path "$tmp_json")"
  url="$("$PYTHON_BIN" -c "
import json
with open(r'$tmp_json_path', encoding='utf-8') as f:
    data = json.load(f)
for asset in data.get('assets', []):
    if asset.get('name', '') == '$asset_pattern':
        print(asset.get('browser_download_url', ''))
        break
")"

  if [[ -z "$url" ]]; then
    echo "Warning: Asset '$asset_pattern' not found in release, skipping..." >&2
    return 0
  fi

  local archive_path="$work_dir/$asset_pattern"
  local target_path="$TARGET_DIR/$target_name"

  echo "Downloading $asset_pattern..."
  curl -fL --retry 3 --retry-delay 1 -o "$archive_path" "$url"

  case "$archive_type" in
    gz)
      echo "  Extracting gzip archive..."
      gunzip -c "$archive_path" > "$target_path"
      ;;
    zip)
      echo "  Extracting zip archive..."
      local extract_dir="$work_dir/extracted_$$"
      mkdir -p "$extract_dir"

      # Use unzip or 7z depending on availability
      if command -v unzip >/dev/null 2>&1; then
        unzip -q -o "$archive_path" -d "$extract_dir"
      elif command -v 7z >/dev/null 2>&1; then
        7z x -y -o"$extract_dir" "$archive_path" >/dev/null
      else
        echo "Error: Neither unzip nor 7z found for extracting zip files" >&2
        return 1
      fi

      # Find the executable
      local extracted_file
      extracted_file=$(find "$extract_dir" -type f -name "*.exe" 2>/dev/null | head -1)
      if [[ -z "$extracted_file" ]]; then
        extracted_file=$(find "$extract_dir" -type f ! -name "*.txt" ! -name "*.md" 2>/dev/null | head -1)
      fi

      if [[ -n "$extracted_file" ]]; then
        cp "$extracted_file" "$target_path"
      else
        echo "  Error: Could not find executable in zip" >&2
        return 1
      fi
      rm -rf "$extract_dir"
      ;;
  esac

  # Set executable permission for non-Windows binaries
  if [[ "$target_name" != *.exe ]]; then
    chmod 755 "$target_path" 2>/dev/null || true
  fi

  echo "  -> $target_path ($(du -h "$target_path" 2>/dev/null | cut -f1 || echo "size unknown"))"
}

echo ""
if [[ -n "$MIHOMO_PLATFORM" ]]; then
  echo "Downloading MiHomo binary for platform: $MIHOMO_PLATFORM"
else
  echo "Downloading MiHomo binaries for all platforms..."
fi
echo "================================================"

# Download based on MIHOMO_PLATFORM or all platforms
if [[ -z "$MIHOMO_PLATFORM" || "$MIHOMO_PLATFORM" == "windows-amd64" ]]; then
  download_and_extract "mihomo-windows-amd64-${release_tag}.zip" "mihomo-x86_64-pc-windows-msvc.exe" "zip"
fi

if [[ -z "$MIHOMO_PLATFORM" || "$MIHOMO_PLATFORM" == "darwin-arm64" ]]; then
  download_and_extract "mihomo-darwin-arm64-${release_tag}.gz" "mihomo-aarch64-apple-darwin" "gz"
fi

if [[ -z "$MIHOMO_PLATFORM" || "$MIHOMO_PLATFORM" == "darwin-amd64" ]]; then
  download_and_extract "mihomo-darwin-amd64-${release_tag}.gz" "mihomo-x86_64-apple-darwin" "gz"
fi

if [[ -z "$MIHOMO_PLATFORM" || "$MIHOMO_PLATFORM" == "linux-amd64" ]]; then
  download_and_extract "mihomo-linux-amd64-${release_tag}.gz" "mihomo-x86_64-unknown-linux-gnu" "gz"
fi

echo ""
echo "================================================"
echo "✅ Successfully downloaded MiHomo $release_tag"
echo ""
echo "Downloaded files:"
ls -la "$TARGET_DIR" 2>/dev/null || dir "$TARGET_DIR"
