# Conflux 构建快速参考

## 🚀 快速开始

```bash
# 完整设置
pnpm install && pnpm run fetch:all && pnpm run tauri:dev
```

## 📦 资源下载命令

| 命令 | 说明 | 用途 |
|------|------|------|
| `pnpm run fetch:all` | 下载所有资源 | 首次设置或更新所有组件 |
| `pnpm run fetch:mihomo` | 仅下载 MiHomo | 更新代理核心 |
| `pnpm run fetch:node` | 仅下载 Node.js | 更新 Node.js 运行时 |
| `pnpm run fetch:substore` | 仅下载 Sub-Store | 更新订阅管理后端 |

## 🔧 环境变量

### MiHomo
```bash
MIHOMO_VERSION=v1.18.0 pnpm run fetch:mihomo
MIHOMO_PLATFORM=darwin-arm64 pnpm run fetch:mihomo
GITHUB_TOKEN=xxx pnpm run fetch:mihomo
```

### Node.js
```bash
NODE_VERSION=v20.18.2 pnpm run fetch:node
NODE_PLATFORM=darwin-arm64 pnpm run fetch:node
```

### Sub-Store
```bash
SUBSTORE_VERSION=v2.14.0 pnpm run fetch:substore
GITHUB_TOKEN=xxx pnpm run fetch:substore
```

## 🏗️ 构建命令

| 命令 | 说明 |
|------|------|
| `pnpm run tauri:dev` | 开发模式 |
| `pnpm run tauri:build` | 生产构建 |
| `pnpm run build` | 仅构建前端 |
| `cargo check` | 检查 Rust 代码 |

## 📁 重要目录

```
src-tauri/
├── binaries/              # Node.js 二进制
│   └── node-*
├── resources/             # 资源文件
│   ├── mihomo-*          # MiHomo 二进制
│   └── sub-store/        # Sub-Store 资源
└── build.rs              # 构建脚本
```

## ⚠️ 常见问题

### 构建失败:缺少资源
```bash
pnpm run fetch:all
```

### GitHub API 速率限制
```bash
export GITHUB_TOKEN=your_token
pnpm run fetch:all
```

### 仅为当前平台下载
```bash
# macOS ARM64
MIHOMO_PLATFORM=darwin-arm64 pnpm run fetch:mihomo
NODE_PLATFORM=darwin-arm64 pnpm run fetch:node

# macOS x86_64
MIHOMO_PLATFORM=darwin-amd64 pnpm run fetch:mihomo
NODE_PLATFORM=darwin-x64 pnpm run fetch:node

# Windows x64
MIHOMO_PLATFORM=windows-amd64 pnpm run fetch:mihomo
NODE_PLATFORM=win-x64 pnpm run fetch:node

# Linux x64
MIHOMO_PLATFORM=linux-amd64 pnpm run fetch:mihomo
NODE_PLATFORM=linux-x64 pnpm run fetch:node
```

## 🔍 调试

### 查看资源状态
```bash
ls -lh src-tauri/binaries/
ls -lh src-tauri/resources/
ls -lh src-tauri/resources/sub-store/
```

### 测试 build.rs
```bash
cd src-tauri && cargo check
```

### 清理并重新构建
```bash
rm -rf src-tauri/binaries/node-*
rm -rf src-tauri/resources/mihomo-*
rm -rf src-tauri/resources/sub-store/
pnpm run fetch:all
cargo clean && cargo check
```

## 📚 详细文档

- **完整构建指南**: [BUILD.md](BUILD.md)
- **实现总结**: [SETUP_SUMMARY.md](SETUP_SUMMARY.md)

## 💡 提示

1. 首次克隆项目后必须运行 `pnpm run fetch:all`
2. 构建前会自动运行 `prebuild` 钩子下载资源
3. 开发模式缺少资源会警告但不会报错
4. 生产构建缺少资源会终止构建
5. 使用 GitHub Token 可以避免 API 限制
