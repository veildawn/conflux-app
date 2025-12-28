#!/usr/bin/env bash
# Sub-Store fetcher for Conflux
# Downloads Sub-Store backend and frontend from GitHub releases
#
# Environment variables:
#   SUBSTORE_VERSION - Version to download (default: latest)
#   SUBSTORE_REPO - GitHub repository (default: sub-store-org/Sub-Store)
#   SUBSTORE_TARGET_DIR - Target directory (default: $ROOT_DIR/src-tauri/resources)
#   PYTHON_BIN - Python binary to use (default: auto-detect)
#   GITHUB_TOKEN - GitHub token for API authentication (optional)
set -euo pipefail

# Determine script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_DIR="${SUBSTORE_TARGET_DIR:-$ROOT_DIR/src-tauri/resources}"
REPO="${SUBSTORE_REPO:-sub-store-org/Sub-Store}"
VERSION="${SUBSTORE_VERSION:-latest}"
PYTHON_BIN="${PYTHON_BIN:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"

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
with open(r'$(python_path "$tmp_json")') as f:
    data = json.load(f)
print(data.get('tag_name', 'unknown'))
")"

echo "Found release: $release_tag"
mkdir -p "$TARGET_DIR"

# Download asset function
download_asset() {
  local asset_pattern="$1"
  local target_name="$2"

  local url
  local tmp_json_path
  tmp_json_path="$(python_path "$tmp_json")"
  url="$("$PYTHON_BIN" -c "
import json
with open(r'$tmp_json_path') as f:
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

  local asset_path="$work_dir/$asset_pattern"
  local target_path="$TARGET_DIR/$target_name"

  echo "Downloading $asset_pattern..."
  curl -fL --retry 3 --retry-delay 1 -o "$asset_path" "$url"

  # Move to target
  mv "$asset_path" "$target_path"

  echo "  -> $target_path ($(du -h "$target_path" 2>/dev/null | cut -f1 || echo "size unknown"))"
}

# Download and extract zip function
download_and_extract_zip() {
  local asset_pattern="$1"
  local target_subdir="$2"

  local url
  local tmp_json_path
  tmp_json_path="$(python_path "$tmp_json")"
  url="$("$PYTHON_BIN" -c "
import json
with open(r'$tmp_json_path') as f:
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

  local asset_path="$work_dir/$asset_pattern"
  local target_path="$TARGET_DIR/$target_subdir"

  echo "Downloading $asset_pattern..."
  curl -fL --retry 3 --retry-delay 1 -o "$asset_path" "$url"

  echo "  Extracting to $target_subdir..."

  # Remove existing directory
  rm -rf "$target_path"
  mkdir -p "$target_path"

  # Extract zip
  local extract_dir="$work_dir/extracted_$$"
  mkdir -p "$extract_dir"

  if command -v unzip >/dev/null 2>&1; then
    unzip -q -o "$asset_path" -d "$extract_dir"
  elif command -v 7z >/dev/null 2>&1; then
    7z x -y -o"$extract_dir" "$asset_path" >/dev/null
  else
    echo "Error: Neither unzip nor 7z found for extracting zip files" >&2
    return 1
  fi

  # Move extracted contents to target
  # Check if there's a single directory inside
  local extracted_items
  extracted_items=$(ls -A "$extract_dir")
  local item_count
  item_count=$(echo "$extracted_items" | wc -l | tr -d ' ')

  if [[ $item_count -eq 1 ]] && [[ -d "$extract_dir/$extracted_items" ]]; then
    # Single directory - move its contents
    mv "$extract_dir/$extracted_items"/* "$target_path/" 2>/dev/null || true
    mv "$extract_dir/$extracted_items"/.[!.]* "$target_path/" 2>/dev/null || true
  else
    # Multiple items or single file - move all
    mv "$extract_dir"/* "$target_path/" 2>/dev/null || true
    mv "$extract_dir"/.[!.]* "$target_path/" 2>/dev/null || true
  fi

  rm -rf "$extract_dir"

  echo "  -> $target_path ($(du -sh "$target_path" 2>/dev/null | cut -f1 || echo "size unknown"))"
}

echo ""
echo "Downloading Sub-Store components..."
echo "================================================"

# Create sub-store directory
SUBSTORE_DIR="$TARGET_DIR/sub-store"
mkdir -p "$SUBSTORE_DIR"

# Download backend bundle
download_asset "sub-store.bundle.js" "sub-store/sub-store.bundle.js"

# Note: Sub-Store 2.x has frontend embedded in the bundle
# No need to download separate frontend files

# Create package.json for sub-store
echo "Creating package.json..."
cat > "$SUBSTORE_DIR/package.json" << 'EOF'
{
  "type": "commonjs"
}
EOF

# Copy run-substore.js if it doesn't exist or create a default one
if [[ ! -f "$SUBSTORE_DIR/run-substore.js" ]]; then
  echo "Creating run-substore.js..."
  cat > "$SUBSTORE_DIR/run-substore.js" << 'EOFSCRIPT'
#!/usr/bin/env node

// Sub-Store 启动脚本
// 这个脚本会加载 sub-store.bundle.js 并启动服务

const path = require('path');
const fs = require('fs');

// ============= 路径初始化 =============

// 获取资源目录路径
const resourcesDir = __dirname;
const substorePath = path.join(resourcesDir, 'sub-store.bundle.js');

// 检查 bundle 文件是否存在
if (!fs.existsSync(substorePath)) {
  console.error('[Sub-Store] Error: sub-store.bundle.js not found at:', substorePath);
  process.exit(1);
}

// ============= 环境变量配置 =============

// 基础配置
process.env.SUB_STORE_BACKEND_API_PORT = process.env.SUB_STORE_BACKEND_API_PORT || '3001';
process.env.SUB_STORE_FRONTEND_BACKEND_PATH = '/api';
process.env.SUB_STORE_BACKEND_MERGE = 'true';

// 前端路径配置 - 优先使用环境变量
// Sub-Store 2.x 前端已嵌入 bundle,不需要单独的前端目录
if (!process.env.SUB_STORE_FRONTEND_PATH) {
  const frontendPath = path.join(resourcesDir, 'frontend');
  if (fs.existsSync(frontendPath)) {
    process.env.SUB_STORE_FRONTEND_PATH = frontendPath;
    console.log('[Sub-Store] Using external frontend directory');
  } else {
    // 前端已嵌入 bundle,不设置路径
    console.log('[Sub-Store] Using embedded frontend (no external frontend directory)');
  }
}

// ============= 数据目录配置 =============

// 设置数据目录 - 使用环境变量传入的数据目录
if (process.env.SUB_STORE_DATA_DIR) {
  // 验证数据目录是否存在
  if (!fs.existsSync(process.env.SUB_STORE_DATA_DIR)) {
    console.error('[Sub-Store] Error: Data directory does not exist:', process.env.SUB_STORE_DATA_DIR);
    process.exit(1);
  }

  // 设置所有可能的数据目录相关环境变量
  process.env.SUB_STORE_DATA_BASE_DIR = process.env.SUB_STORE_DATA_DIR;

  // 确保工作目录设置为数据目录,防止在其他位置创建文件
  try {
    process.chdir(process.env.SUB_STORE_DATA_DIR);
    console.log('[Sub-Store] Working directory changed to:', process.cwd());
  } catch (error) {
    console.error('[Sub-Store] Error: Failed to change working directory:', error.message);
    process.exit(1);
  }
} else {
  console.warn('[Sub-Store] Warning: SUB_STORE_DATA_DIR not set, using current directory');
  process.env.SUB_STORE_DATA_BASE_DIR = process.cwd();
}

// ============= 启动信息 =============

console.log('========================================');
console.log('[Sub-Store] Starting Sub-Store...');
console.log('[Sub-Store] Platform:', process.platform);
console.log('[Sub-Store] Node Version:', process.version);
console.log('[Sub-Store] API Port:', process.env.SUB_STORE_BACKEND_API_PORT);
console.log('[Sub-Store] Frontend Path:', process.env.SUB_STORE_FRONTEND_PATH);
console.log('[Sub-Store] Data Directory:', process.env.SUB_STORE_DATA_BASE_DIR);
console.log('[Sub-Store] Working Directory:', process.cwd());
console.log('========================================');

// ============= 错误处理 =============

// 捕获未处理的异常
process.on('uncaughtException', (error) => {
  console.error('[Sub-Store] Uncaught Exception:', error);
  process.exit(1);
});

// 捕获未处理的 Promise 拒绝
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Sub-Store] Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// 优雅退出处理
process.on('SIGINT', () => {
  console.log('\n[Sub-Store] Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Sub-Store] Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// ============= 加载并运行 Sub-Store =============

try {
  console.log('[Sub-Store] Loading Sub-Store bundle...');
  require(substorePath);
  console.log('[Sub-Store] Sub-Store loaded successfully');
} catch (error) {
  console.error('[Sub-Store] Error starting Sub-Store:', error);
  console.error('[Sub-Store] Stack trace:', error.stack);
  process.exit(1);
}
EOFSCRIPT
fi

echo ""
echo "================================================"
echo "✅ Successfully downloaded Sub-Store $release_tag"
echo ""
echo "Directory structure:"
ls -lh "$SUBSTORE_DIR" 2>/dev/null || dir "$SUBSTORE_DIR"
