# Conflux 构建指南

本文档说明如何构建 Conflux 应用,包括下载所需的依赖资源。

## 概述

Conflux 依赖以下外部资源:
- **MiHomo**: 代理核心二进制文件
- **Node.js**: 用于运行 Sub-Store 的 Node.js 运行时
- **Sub-Store**: 订阅管理后端和前端

这些资源需要在构建前下载到本地。

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 下载所需资源

#### 方式一: 自动下载所有资源(推荐)

```bash
pnpm run fetch:all
```

这会自动下载 MiHomo、Node.js 和 Sub-Store 的所有资源。

#### 方式二: 分别下载

如果你只需要更新特定资源:

```bash
# 下载 MiHomo 二进制文件
pnpm run fetch:mihomo

# 下载 Node.js 二进制文件
pnpm run fetch:node

# 下载 Sub-Store
pnpm run fetch:substore
```

### 3. 开发模式

```bash
pnpm run tauri:dev
```

### 4. 构建生产版本

```bash
# 前端构建会自动运行 prebuild 钩子下载资源
pnpm run build

# 构建 Tauri 应用
pnpm run tauri:build
```

## 资源下载脚本详解

### fetch-mihomo.sh

下载 MiHomo 代理核心的平台特定二进制文件。

**支持的平台:**
- macOS (ARM64, x86_64)
- Windows (x86_64)
- Linux (x86_64)

**环境变量:**
- `MIHOMO_VERSION`: MiHomo 版本 (默认: latest)
- `MIHOMO_PLATFORM`: 特定平台 (如: darwin-arm64, windows-amd64)
- `MIHOMO_TARGET_DIR`: 目标目录 (默认: src-tauri/resources)
- `GITHUB_TOKEN`: GitHub API token (可选,用于避免速率限制)

**示例:**

```bash
# 下载特定版本
MIHOMO_VERSION=v1.18.0 pnpm run fetch:mihomo

# 仅下载当前平台
MIHOMO_PLATFORM=darwin-arm64 pnpm run fetch:mihomo

# 使用 GitHub token
GITHUB_TOKEN=your_token pnpm run fetch:mihomo
```

### fetch-node.sh

下载 Node.js 独立二进制文件,用于运行 Sub-Store。

**支持的平台:**
- macOS (ARM64, x86_64)
- Windows (x86_64)
- Linux (x86_64)

**环境变量:**
- `NODE_VERSION`: Node.js 版本 (默认: v20.18.2)
- `NODE_PLATFORM`: 特定平台 (如: darwin-arm64, win-x64)
- `NODE_TARGET_DIR`: 目标目录 (默认: src-tauri/binaries)

**示例:**

```bash
# 下载特定版本
NODE_VERSION=v20.18.2 pnpm run fetch:node

# 仅下载当前平台
NODE_PLATFORM=darwin-arm64 pnpm run fetch:node
```

### fetch-substore.sh

下载 Sub-Store 后端 bundle 和前端资源。

**环境变量:**
- `SUBSTORE_VERSION`: Sub-Store 版本 (默认: latest)
- `SUBSTORE_REPO`: GitHub 仓库 (默认: sub-store-org/Sub-Store)
- `SUBSTORE_TARGET_DIR`: 目标目录 (默认: src-tauri/resources)
- `GITHUB_TOKEN`: GitHub API token (可选)

**示例:**

```bash
# 下载特定版本
SUBSTORE_VERSION=v2.14.0 pnpm run fetch:substore

# 使用 GitHub token
GITHUB_TOKEN=your_token pnpm run fetch:substore
```

## 目录结构

构建后的资源目录结构:

```
conflux-app/
├── src-tauri/
│   ├── binaries/                           # Node.js 二进制文件
│   │   ├── node-aarch64-apple-darwin       # macOS ARM64
│   │   ├── node-x86_64-apple-darwin        # macOS x86_64
│   │   ├── node-x86_64-unknown-linux-gnu   # Linux x86_64
│   │   └── node-x86_64-pc-windows-msvc.exe # Windows x86_64
│   └── resources/
│       ├── mihomo-darwin-arm64             # MiHomo macOS ARM64
│       ├── mihomo-darwin-amd64             # MiHomo macOS x86_64
│       ├── mihomo-linux-amd64              # MiHomo Linux
│       ├── mihomo-windows-amd64.exe        # MiHomo Windows
│       └── sub-store/                      # Sub-Store 资源
│           ├── frontend/                   # Sub-Store 前端
│           ├── sub-store.bundle.js         # Sub-Store 后端
│           ├── run-substore.js             # 启动脚本
│           └── package.json                # Package 配置
└── scripts/                                # 构建脚本
    ├── fetch-mihomo.sh
    ├── fetch-node.sh
    └── fetch-substore.sh
```

## 构建流程

### 开发构建

1. 运行 `pnpm install` 安装前端依赖
2. 运行 `pnpm run fetch:all` 下载所有资源
3. 运行 `pnpm run tauri:dev` 启动开发服务器
4. Tauri 会自动编译 Rust 代码并启动应用

### 生产构建

1. 运行 `pnpm run fetch:all` 确保所有资源都已下载
2. 运行 `pnpm run build` 构建前端
3. 运行 `pnpm run tauri:build` 构建应用
4. 构建产物位于 `src-tauri/target/release/bundle/`

### 构建验证

在 `src-tauri/build.rs` 中有资源验证逻辑:

- **开发模式**: 如果缺少资源会显示警告,但允许继续构建
- **生产模式/CI**: 如果缺少资源会报错并终止构建

## 常见问题

### Q: 如何更新 MiHomo 版本?

```bash
MIHOMO_VERSION=v1.18.0 pnpm run fetch:mihomo
```

### Q: 如何更新 Sub-Store 版本?

```bash
SUBSTORE_VERSION=v2.14.0 pnpm run fetch:substore
```

### Q: GitHub API 速率限制怎么办?

设置 GitHub token:

```bash
export GITHUB_TOKEN=your_personal_access_token
pnpm run fetch:all
```

### Q: 仅为当前平台下载资源?

```bash
# macOS ARM64
MIHOMO_PLATFORM=darwin-arm64 pnpm run fetch:mihomo
NODE_PLATFORM=darwin-arm64 pnpm run fetch:node

# Windows
MIHOMO_PLATFORM=windows-amd64 pnpm run fetch:mihomo
NODE_PLATFORM=win-x64 pnpm run fetch:node
```

### Q: 构建失败提示缺少资源?

运行:

```bash
pnpm run fetch:all
```

然后重新构建。

## CI/CD 集成

在 CI 环境中构建时,确保在构建步骤前运行:

```yaml
- name: Download resources
  run: pnpm run fetch:all
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

- name: Build
  run: pnpm run tauri:build
```

## 跨平台构建

要为所有平台构建,需要:

1. 下载所有平台的资源: `pnpm run fetch:all`
2. 在对应平台上运行构建,或使用交叉编译工具

注意: Tauri 不支持直接交叉编译,每个平台需要在对应的 OS 上构建。

## 许可证

MiHomo、Node.js 和 Sub-Store 各自有独立的许可证,请查看对应项目的许可证文件。
