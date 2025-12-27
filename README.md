# Conflux

基于 Tauri 2 + MiHomo 的现代化跨平台代理管理桌面应用。

## 特性

- 🚀 **高性能**: 基于 Rust + Tauri 2，启动快速，资源占用低
- 🎨 **现代化 UI**: React + Tailwind CSS + Shadcn/ui
- 🔒 **安全可靠**: 本地运行，数据安全
- 🌐 **跨平台**: 支持 Windows、macOS、Linux
- 📊 **实时统计**: 流量监控、连接管理、速度测试
- 🎯 **灵活规则**: 强大的规则管理系统

## 下载安装

前往 [Releases](https://github.com/yourusername/conflux/releases) 页面下载对应平台的安装包：

| 平台 | 架构 | 文件格式 |
|------|------|----------|
| macOS | Apple Silicon (M1/M2/M3) | `.dmg` |
| macOS | Intel (x86_64) | `.dmg` |
| Windows | x86_64 | `.msi` / `.exe` |

## 技术栈

### 前端
- React 19
- TypeScript 5
- Tailwind CSS 4
- Radix UI
- Zustand (状态管理)
- Vite 7

### 后端
- Tauri 2
- Rust 1.77+
- Tokio (异步运行时)
- MiHomo (代理核心)

## 开发环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Rust >= 1.77.0
- Python 3 (用于下载 MiHomo)
- 系统依赖（参考 [Tauri 前置要求](https://v2.tauri.app/start/prerequisites/)）

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/yourusername/conflux.git
cd conflux
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 下载 MiHomo 二进制文件

使用自动下载脚本（推荐）：

```bash
./scripts/fetch-mihomo.sh
```

或手动从 [MiHomo Releases](https://github.com/MetaCubeX/mihomo/releases) 下载，放置到 `src-tauri/resources/` 目录：

- Windows: `mihomo-windows-amd64.exe`
- macOS (Apple Silicon): `mihomo-darwin-arm64`
- macOS (Intel): `mihomo-darwin-amd64`
- Linux: `mihomo-linux-amd64`

### 4. 开发模式

```bash
pnpm tauri dev
```

### 5. 构建应用

```bash
# 构建当前平台
pnpm tauri build

# 指定目标平台 (macOS)
pnpm tauri build --target aarch64-apple-darwin  # Apple Silicon
pnpm tauri build --target x86_64-apple-darwin   # Intel

# 指定目标平台 (Windows)
pnpm tauri build --target x86_64-pc-windows-msvc
```

## 项目结构

```
conflux/
├── src/                    # 前端源代码
│   ├── components/         # React 组件
│   ├── pages/              # 页面组件
│   ├── services/           # IPC 服务
│   ├── stores/             # Zustand 状态管理
│   ├── hooks/              # 自定义 Hooks
│   ├── types/              # TypeScript 类型定义
│   └── utils/              # 工具函数
├── src-tauri/              # Tauri 后端
│   ├── src/
│   │   ├── commands/       # Tauri 命令
│   │   ├── config/         # 配置管理
│   │   ├── mihomo/         # MiHomo 核心集成
│   │   ├── models/         # 数据模型
│   │   ├── system/         # 系统功能
│   │   └── utils/          # 工具函数
│   ├── resources/          # MiHomo 二进制文件
│   └── icons/              # 应用图标
├── scripts/                # 构建脚本
├── .github/workflows/      # CI/CD 配置
└── package.json
```

## CI/CD 流程

本项目使用 GitHub Actions 实现自动化构建和发布。

### 持续集成 (CI)

每次推送到 `main` 或 `develop` 分支，以及 Pull Request 时自动运行：

- **前端检查**: ESLint、TypeScript 类型检查、构建测试
- **Rust 检查**: Clippy、格式检查、多平台构建测试
- **单元测试**: Vitest 测试

### 发布构建

推送 `v*` 格式的 tag 时自动触发多平台构建：

```bash
# 创建新版本
git tag v0.1.0
git push origin v0.1.0
```

构建完成后会在 Releases 页面生成草稿，包含以下产物：
- `Conflux_x.x.x_aarch64.dmg` - macOS ARM64
- `Conflux_x.x.x_x64.dmg` - macOS x86_64
- `Conflux_x.x.x_x64-setup.exe` - Windows NSIS 安装程序
- `Conflux_x.x.x_x64_en-US.msi` - Windows MSI 安装程序

### 手动构建测试

可在 GitHub Actions 页面手动触发 "Build Test" workflow，支持选择性构建单个或全部平台。

### 代码签名配置（可选）

在 GitHub Secrets 中配置以下变量启用代码签名：

**macOS:**
- `APPLE_CERTIFICATE` - Base64 编码的 .p12 证书
- `APPLE_CERTIFICATE_PASSWORD` - 证书密码
- `APPLE_SIGNING_IDENTITY` - 签名标识
- `APPLE_ID` - Apple ID
- `APPLE_PASSWORD` - App 专用密码
- `APPLE_TEAM_ID` - Team ID

**Windows:**
- `TAURI_SIGNING_PRIVATE_KEY` - 签名私钥
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` - 私钥密码

## 功能列表

### 阶段一 (当前) ✅
- [x] 项目初始化
- [x] MiHomo 核心集成
- [x] 基础配置管理
- [x] 基础 UI 界面
- [x] 代理启动/停止
- [x] 节点切换功能
- [x] 系统托盘

### 阶段二 (计划中)
- [ ] 订阅管理
- [ ] 高级节点管理
- [ ] 规则管理
- [ ] 连接管理
- [ ] 配置文件编辑器

### 阶段三 (计划中)
- [ ] 流量统计
- [ ] TUN 模式
- [ ] 系统集成优化
- [ ] 性能优化
- [ ] 自动更新

## 开发命令

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm tauri dev

# 构建应用
pnpm tauri build

# 代码检查
pnpm lint
pnpm lint:fix

# 类型检查
pnpm type-check

# 运行测试
pnpm test

# 代码格式化
pnpm format
```

## 开发文档

- [MiHomo API 文档](MIHOMO_API.md)

## 许可证

MIT License

## 致谢

- [Tauri](https://tauri.app/) - 跨平台桌面应用框架
- [MiHomo](https://github.com/MetaCubeX/mihomo) - 代理核心
- [React](https://react.dev/) - UI 框架
- [Tailwind CSS](https://tailwindcss.com/) - CSS 框架
- [Radix UI](https://www.radix-ui.com/) - 无障碍组件库
