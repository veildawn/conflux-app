#!/usr/bin/env bash
# Sub-Store fetcher for Conflux
# Downloads Sub-Store backend and frontend from GitHub releases
#
# Environment variables:
#   SUBSTORE_VERSION - Version to download (default: latest)
#   SUBSTORE_BACKEND_REPO - Backend GitHub repository (default: sub-store-org/Sub-Store)
#   SUBSTORE_FRONTEND_REPO - Frontend GitHub repository (default: sub-store-org/Sub-Store-Front-End)
#   SUBSTORE_TARGET_DIR - Target directory (default: $ROOT_DIR/src-tauri/resources)
#   PYTHON_BIN - Python binary to use (default: auto-detect)
#   GITHUB_TOKEN - GitHub token for API authentication (optional)
#   API_TIMEOUT - API request timeout in seconds (default: 30)
#   DOWNLOAD_TIMEOUT - Download timeout in seconds (default: 300)
set -euo pipefail

# Determine script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_DIR="${SUBSTORE_TARGET_DIR:-$ROOT_DIR/src-tauri/resources}"
BACKEND_REPO="${SUBSTORE_BACKEND_REPO:-sub-store-org/Sub-Store}"
FRONTEND_REPO="${SUBSTORE_FRONTEND_REPO:-sub-store-org/Sub-Store-Front-End}"
VERSION="${SUBSTORE_VERSION:-latest}"
PYTHON_BIN="${PYTHON_BIN:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
API_TIMEOUT="${API_TIMEOUT:-30}"
DOWNLOAD_TIMEOUT="${DOWNLOAD_TIMEOUT:-300}"

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

# Build API URL function
build_api_url() {
  local repo="$1"
  local version="$2"
  if [[ "$version" == "latest" ]]; then
    echo "https://api.github.com/repos/$repo/releases/latest"
  else
    echo "https://api.github.com/repos/$repo/releases/tags/$version"
  fi
}

# Fetch release info with retry and timeout
fetch_release_info() {
  local repo="$1"
  local version="$2"
  local output_file="$3"
  local api_url

  api_url="$(build_api_url "$repo" "$version")"
  echo "Fetching release info from $api_url..."

  local max_retries=3
  local retry_count=0

  while [[ $retry_count -lt $max_retries ]]; do
    if curl -fsSL --max-time "$API_TIMEOUT" --connect-timeout 10 \
         ${CURL_AUTH_ARGS[@]+"${CURL_AUTH_ARGS[@]}"} \
         "$api_url" > "$output_file" 2>/dev/null; then
      echo "✓ Successfully fetched release info"
      return 0
    fi

    retry_count=$((retry_count + 1))
    if [[ $retry_count -lt $max_retries ]]; then
      echo "⚠ API request failed (attempt $retry_count/$max_retries), retrying in 2s..."
      sleep 2
    fi
  done

  echo "✗ Failed to fetch release info after $max_retries attempts" >&2
  return 1
}

# Create temp files
tmp_backend_json="$(mktemp)"
tmp_frontend_json="$(mktemp)"
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
  rm -f "$tmp_backend_json" "$tmp_frontend_json" 2>/dev/null || true
  rm -rf "$work_dir" 2>/dev/null || true
}
trap cleanup EXIT

# Fetch backend release info
echo ""
echo "================================================"
echo "Fetching Backend Release Info"
echo "================================================"
if ! fetch_release_info "$BACKEND_REPO" "$VERSION" "$tmp_backend_json"; then
  echo "Error: Failed to fetch backend release info" >&2
  exit 1
fi

backend_tag="$("$PYTHON_BIN" -c "
import json
with open(r'$(python_path "$tmp_backend_json")', encoding='utf-8') as f:
    data = json.load(f)
print(data.get('tag_name', 'unknown'))
")"

echo "Backend release: $backend_tag"

# Fetch frontend release info
# Note: Frontend uses 'latest' because it has different release cycle than backend
echo ""
echo "================================================"
echo "Fetching Frontend Release Info"
echo "================================================"
frontend_tag=""
frontend_available=false

if fetch_release_info "$FRONTEND_REPO" "latest" "$tmp_frontend_json"; then
  frontend_tag="$("$PYTHON_BIN" -c "
import json
with open(r'$(python_path "$tmp_frontend_json")', encoding='utf-8') as f:
    data = json.load(f)
print(data.get('tag_name', 'unknown'))
" 2>/dev/null || echo "")"

  if [[ -n "$frontend_tag" && "$frontend_tag" != "unknown" ]]; then
    echo "Frontend release: $frontend_tag"
    frontend_available=true
  else
    echo "⚠ Frontend release info invalid, will skip frontend download"
  fi
else
  echo "⚠ Frontend API unavailable, will skip frontend download"
fi

mkdir -p "$TARGET_DIR"

# Download asset function
download_asset() {
  local json_file="$1"
  local asset_pattern="$2"
  local target_name="$3"

  local url
  local tmp_json_path
  tmp_json_path="$(python_path "$json_file")"
  url="$("$PYTHON_BIN" -c "
import json
with open(r'$tmp_json_path', encoding='utf-8') as f:
    data = json.load(f)
for asset in data.get('assets', []):
    if asset.get('name', '') == '$asset_pattern':
        print(asset.get('browser_download_url', ''))
        break
" 2>/dev/null || echo "")"

  if [[ -z "$url" ]]; then
    echo "⚠ Asset '$asset_pattern' not found in release, skipping..." >&2
    return 1
  fi

  local asset_path="$work_dir/$asset_pattern"
  local target_path="$TARGET_DIR/$target_name"

  echo "Downloading $asset_pattern..."
  if ! curl -fL --max-time "$DOWNLOAD_TIMEOUT" --retry 3 --retry-delay 2 \
            -o "$asset_path" "$url"; then
    echo "✗ Failed to download $asset_pattern" >&2
    return 1
  fi

  # Verify download
  if [[ ! -s "$asset_path" ]]; then
    echo "✗ Downloaded file is empty: $asset_pattern" >&2
    return 1
  fi

  # Create target directory if needed
  mkdir -p "$(dirname "$target_path")"

  # Move to target
  mv "$asset_path" "$target_path"

  echo "  ✓ $target_path ($(du -h "$target_path" 2>/dev/null | cut -f1 || echo "size unknown"))"
  return 0
}

# Download and extract zip function
download_and_extract_zip() {
  local json_file="$1"
  local asset_pattern="$2"
  local target_subdir="$3"

  local url
  local tmp_json_path
  tmp_json_path="$(python_path "$json_file")"
  url="$("$PYTHON_BIN" -c "
import json
with open(r'$tmp_json_path', encoding='utf-8') as f:
    data = json.load(f)
for asset in data.get('assets', []):
    if asset.get('name', '') == '$asset_pattern':
        print(asset.get('browser_download_url', ''))
        break
" 2>/dev/null || echo "")"

  if [[ -z "$url" ]]; then
    echo "⚠ Asset '$asset_pattern' not found in release, skipping..." >&2
    return 1
  fi

  local asset_path="$work_dir/$asset_pattern"
  local target_path="$TARGET_DIR/$target_subdir"

  echo "Downloading $asset_pattern..."
  if ! curl -fL --max-time "$DOWNLOAD_TIMEOUT" --retry 3 --retry-delay 2 \
            -o "$asset_path" "$url"; then
    echo "✗ Failed to download $asset_pattern" >&2
    return 1
  fi

  # Verify download
  if [[ ! -s "$asset_path" ]]; then
    echo "✗ Downloaded file is empty: $asset_pattern" >&2
    return 1
  fi

  echo "  Extracting to $target_subdir..."

  # Remove existing directory
  rm -rf "$target_path"
  mkdir -p "$target_path"

  # Extract zip
  local extract_dir="$work_dir/extracted_$$"
  mkdir -p "$extract_dir"

  if command -v unzip >/dev/null 2>&1; then
    if ! unzip -q -o "$asset_path" -d "$extract_dir" 2>/dev/null; then
      echo "✗ Failed to extract $asset_pattern" >&2
      rm -rf "$extract_dir"
      return 1
    fi
  elif command -v 7z >/dev/null 2>&1; then
    if ! 7z x -y -o"$extract_dir" "$asset_path" >/dev/null 2>&1; then
      echo "✗ Failed to extract $asset_pattern" >&2
      rm -rf "$extract_dir"
      return 1
    fi
  else
    echo "✗ Neither unzip nor 7z found for extracting zip files" >&2
    rm -rf "$extract_dir"
    return 1
  fi

  # Move extracted contents to target
  # Check if there's a single directory inside
  local extracted_items
  extracted_items=$(ls -A "$extract_dir" 2>/dev/null)
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

  echo "  ✓ $target_path ($(du -sh "$target_path" 2>/dev/null | cut -f1 || echo "size unknown"))"
  return 0
}

echo ""
echo "================================================"
echo "Downloading Sub-Store Components"
echo "================================================"

# Create sub-store directory
SUBSTORE_DIR="$TARGET_DIR/sub-store"
mkdir -p "$SUBSTORE_DIR"

# Download backend bundle
echo ""
echo "--- Backend Bundle ---"
if download_asset "$tmp_backend_json" "sub-store.bundle.js" "sub-store/sub-store.bundle.js"; then
  echo "✓ Backend bundle downloaded successfully"
else
  echo "✗ Failed to download backend bundle" >&2
  exit 1
fi

# Download frontend if available
if [[ "$frontend_available" == true ]]; then
  echo ""
  echo "--- Frontend ---"

  # Try to find and download frontend dist package
  # Common patterns: dist.zip, frontend.zip, build.zip, Sub-Store-Front-End.zip
  frontend_downloaded=false

  for pattern in "dist.zip" "frontend.zip" "build.zip" "Sub-Store-Front-End.zip"; do
    if download_and_extract_zip "$tmp_frontend_json" "$pattern" "sub-store/frontend"; then
      echo "✓ Frontend downloaded and extracted successfully from $pattern"
      frontend_downloaded=true
      break
    fi
  done

  if [[ "$frontend_downloaded" == false ]]; then
    echo "⚠ No frontend package found in release"
    echo "  Tried patterns: dist.zip, frontend.zip, build.zip, Sub-Store-Front-End.zip"
    echo "  Available assets:"
    "$PYTHON_BIN" -c "
import json
with open(r'$(python_path "$tmp_frontend_json")', encoding='utf-8') as f:
    data = json.load(f)
for asset in data.get('assets', []):
    print(f\"    - {asset.get('name', 'unknown')}\")
" 2>/dev/null || echo "    (unable to list assets)"
  fi
else
  echo ""
  echo "⚠ Skipping frontend download (API unavailable or version mismatch)"
fi

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
process.env.SUB_STORE_BACKEND_API_PORT = process.env.SUB_STORE_BACKEND_API_PORT || '39001';
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
echo "✅ Download Complete"
echo "================================================"
echo ""
echo "Backend: $backend_tag"
if [[ "$frontend_available" == true && "$frontend_downloaded" == true ]]; then
  echo "Frontend: $frontend_tag (local)"
elif [[ "$frontend_available" == true ]]; then
  echo "Frontend: $frontend_tag (download failed)"
else
  echo "Frontend: (not available)"
fi
echo ""
echo "Directory structure:"
ls -lhR "$SUBSTORE_DIR" 2>/dev/null || tree "$SUBSTORE_DIR" 2>/dev/null || find "$SUBSTORE_DIR" -type f -exec ls -lh {} \;
echo ""
echo "================================================"
