#!/usr/bin/env bash
# Node.js binary fetcher for Conflux
# Downloads standalone Node.js binaries for bundling with Sub-Store
# Supports: macOS (ARM64, x86_64), Windows (x86_64), Linux (x86_64)
#
# Environment variables:
#   NODE_VERSION - Node.js version to download (default: v20.18.2)
#   NODE_PLATFORM - Specific platform to download (e.g., darwin-arm64, darwin-x64, win-x64, linux-x64)
#                   If not set, downloads all platforms
#   NODE_TARGET_DIR - Target directory for binaries (default: $ROOT_DIR/src-tauri/binaries)
set -euo pipefail

# Determine script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_DIR="${NODE_TARGET_DIR:-$ROOT_DIR/src-tauri/binaries}"
NODE_VERSION="${NODE_VERSION:-v20.18.2}"
NODE_PLATFORM="${NODE_PLATFORM:-}"

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
echo "Node.js Version: $NODE_VERSION"

# Create temp directory
work_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$work_dir" 2>/dev/null || true
}
trap cleanup EXIT

# Create target directory
mkdir -p "$TARGET_DIR"

# Download and extract function
download_and_extract() {
  local platform="$1"
  local arch="$2"
  local target_name="$3"

  local download_url
  local archive_name

  if [[ "$platform" == "win" ]]; then
    # Windows uses zip format
    archive_name="node-${NODE_VERSION}-${platform}-${arch}.zip"
    download_url="https://nodejs.org/dist/${NODE_VERSION}/${archive_name}"
  else
    # Linux and macOS use tar.gz format
    archive_name="node-${NODE_VERSION}-${platform}-${arch}.tar.gz"
    download_url="https://nodejs.org/dist/${NODE_VERSION}/${archive_name}"
  fi

  local archive_path="$work_dir/$archive_name"
  local target_path="$TARGET_DIR/$target_name"

  echo "Downloading Node.js for ${platform}-${arch}..."
  echo "  URL: $download_url"

  # Download with retry
  curl -fL --retry 3 --retry-delay 1 -o "$archive_path" "$download_url"

  echo "  Extracting archive..."

  if [[ "$platform" == "win" ]]; then
    # Extract Windows zip
    local extract_dir="$work_dir/extracted_${platform}_${arch}"
    mkdir -p "$extract_dir"

    if command -v unzip >/dev/null 2>&1; then
      unzip -q -o "$archive_path" -d "$extract_dir"
    elif command -v 7z >/dev/null 2>&1; then
      7z x -y -o"$extract_dir" "$archive_path" >/dev/null
    else
      echo "Error: Neither unzip nor 7z found for extracting zip files" >&2
      return 1
    fi

    # Find node.exe
    local node_exe
    node_exe=$(find "$extract_dir" -type f -name "node.exe" | head -1)

    if [[ -z "$node_exe" ]]; then
      echo "  Error: Could not find node.exe in archive" >&2
      return 1
    fi

    cp "$node_exe" "$target_path"
    rm -rf "$extract_dir"
  else
    # Extract Linux/macOS tar.gz
    local extract_dir="$work_dir/extracted_${platform}_${arch}"
    mkdir -p "$extract_dir"
    tar -xzf "$archive_path" -C "$extract_dir"

    # Find node binary
    local node_binary
    node_binary=$(find "$extract_dir" -type f -name "node" ! -path "*/include/*" | head -1)

    if [[ -z "$node_binary" ]]; then
      echo "  Error: Could not find node binary in archive" >&2
      return 1
    fi

    cp "$node_binary" "$target_path"
    chmod 755 "$target_path"
    rm -rf "$extract_dir"
  fi

  echo "  -> $target_path ($(du -h "$target_path" 2>/dev/null | cut -f1 || echo "size unknown"))"
}

echo ""
if [[ -n "$NODE_PLATFORM" ]]; then
  echo "Downloading Node.js binary for platform: $NODE_PLATFORM"
else
  echo "Downloading Node.js binaries for all platforms..."
fi
echo "================================================"

# Download based on NODE_PLATFORM or all platforms
if [[ -z "$NODE_PLATFORM" || "$NODE_PLATFORM" == "darwin-arm64" ]]; then
  download_and_extract "darwin" "arm64" "node-aarch64-apple-darwin"
fi

if [[ -z "$NODE_PLATFORM" || "$NODE_PLATFORM" == "darwin-x64" ]]; then
  download_and_extract "darwin" "x64" "node-x86_64-apple-darwin"
fi

if [[ -z "$NODE_PLATFORM" || "$NODE_PLATFORM" == "linux-x64" ]]; then
  download_and_extract "linux" "x64" "node-x86_64-unknown-linux-gnu"
fi

if [[ -z "$NODE_PLATFORM" || "$NODE_PLATFORM" == "win-x64" ]]; then
  download_and_extract "win" "x64" "node-x86_64-pc-windows-msvc.exe"
fi

echo ""
echo "================================================"
echo "✅ Successfully downloaded Node.js $NODE_VERSION"
echo ""
echo "Downloaded files:"
ls -lh "$TARGET_DIR"/node-* 2>/dev/null || dir "$TARGET_DIR"
