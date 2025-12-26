#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_DIR="${MIHOMO_TARGET_DIR:-$ROOT_DIR/src-tauri/resources}"
REPO="${MIHOMO_REPO:-MetaCubeX/mihomo}"
VERSION="${MIHOMO_VERSION:-latest}"
PYTHON_BIN="${PYTHON_BIN:-}"

if [[ -z "$PYTHON_BIN" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN=python3
  elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN=python
  else
    echo "python3 or python is required to parse GitHub API responses." >&2
    exit 1
  fi
fi

if [[ "$VERSION" == "latest" ]]; then
  API_URL="https://api.github.com/repos/$REPO/releases/latest"
else
  API_URL="https://api.github.com/repos/$REPO/releases/tags/$VERSION"
fi

echo "Fetching release info from $API_URL..."

# Download JSON to temp file
tmp_json="$(mktemp)"
work_dir="$(mktemp -d)"
cleanup() {
  rm -f "$tmp_json"
  rm -rf "$work_dir"
}
trap cleanup EXIT

curl -fsSL "$API_URL" > "$tmp_json"

release_tag="$("$PYTHON_BIN" -c "
import json
with open('$tmp_json') as f:
    data = json.load(f)
print(data.get('tag_name', 'unknown'))
")"

echo "Found release: $release_tag"

mkdir -p "$TARGET_DIR"

# Download function
download_and_extract() {
  local asset_pattern="$1"
  local target_name="$2"
  local archive_type="$3"
  
  local url="$("$PYTHON_BIN" -c "
import json
with open('$tmp_json') as f:
    data = json.load(f)
for asset in data.get('assets', []):
    if asset.get('name', '') == '$asset_pattern':
        print(asset.get('browser_download_url', ''))
        break
")"

  if [[ -z "$url" ]]; then
    echo "Error: Asset '$asset_pattern' not found in release" >&2
    return 1
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
      unzip -q -o "$archive_path" -d "$extract_dir"
      # Find the executable
      local extracted_file
      extracted_file=$(find "$extract_dir" -type f -name "*.exe" | head -1)
      if [[ -z "$extracted_file" ]]; then
        extracted_file=$(find "$extract_dir" -type f ! -name "*.txt" | head -1)
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
    chmod 755 "$target_path"
  fi
  
  echo "  -> $target_path"
}

# Download all required binaries
download_and_extract "mihomo-windows-amd64-${release_tag}.zip" "mihomo-windows-amd64.exe" "zip"
download_and_extract "mihomo-darwin-arm64-${release_tag}.gz" "mihomo-darwin-arm64" "gz"
download_and_extract "mihomo-darwin-amd64-${release_tag}.gz" "mihomo-darwin-amd64" "gz"
download_and_extract "mihomo-linux-amd64-${release_tag}.gz" "mihomo-linux-amd64" "gz"

echo ""
echo "Successfully downloaded MiHomo $release_tag to $TARGET_DIR"
ls -la "$TARGET_DIR"
