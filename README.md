# Conflux 汇流

[![CI](https://github.com/veildawn/conflux-app/actions/workflows/ci.yml/badge.svg)](https://github.com/veildawn/conflux-app/actions/workflows/ci.yml)
[![Release](https://github.com/veildawn/conflux-app/actions/workflows/release.yml/badge.svg)](https://github.com/veildawn/conflux-app/actions/workflows/release.yml)
[![GitHub release](https://img.shields.io/github/v/release/veildawn/conflux-app?include_prereleases)](https://github.com/veildawn/conflux-app/releases)
[![License](https://img.shields.io/github/license/veildawn/conflux-app)](LICENSE)

基于 Tauri 2 + MiHomo 的现代化跨平台代理管理桌面应用。

<p align="center">
  <img src="src-tauri/icons/icon.png" width="128" height="128" alt="Conflux 汇流">
</p>

## 特性

- 🚀 **高性能**: 基于 Rust + Tauri 2，启动快速，资源占用低
- 🎨 **现代化 UI**: React + Tailwind CSS + Radix UI，界面美观流畅
- 🔒 **安全可靠**: 本地运行，数据安全，代码开源
- 🌐 **跨平台**: 支持 Windows、macOS、Linux
- 📊 **实时监控**: 流量统计、连接管理、速度测试
- 🎯 **灵活规则**: 强大的规则管理系统，支持拖拽排序
- 📦 **订阅管理**: 支持远程订阅、本地导入、自动更新
- 🏪 **Sub-Store**: 内置高级订阅管理工具
- 🔧 **TUN 模式**: 支持虚拟网卡全局代理

## 应用截图

<!--
<p align="center">
  <img src="docs/screenshots/home.png" width="45%" alt="活动监控">
  <img src="docs/screenshots/proxy.png" width="45%" alt="策略管理">
</p>
-->

> 截图即将添加...

## 下载安装

### 通过 Homebrew 安装 (macOS)

```bash
brew tap veildawn/cask
brew install --cask conflux
```

或者直接下载安装包：

前往 [Releases](https://github.com/veildawn/conflux-app/releases) 页面下载对应平台的安装包：

| 平台    | 架构                        | 文件格式             |
| ------- | --------------------------- | -------------------- |
| macOS   | Apple Silicon (M1/M2/M3/M4) | `.dmg`               |
| macOS   | Intel (x86_64)              | `.dmg`               |
| Windows | x86_64                      | `.msi` / `.exe`      |
| Linux   | x86_64                      | `.AppImage` / `.deb` |

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
git clone https://github.com/veildawn/conflux-app.git
cd conflux-app
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 下载外部依赖

使用自动下载脚本（推荐）：

```bash
# 下载所有外部依赖
pnpm run fetch:all

# 或分别下载
pnpm run fetch:mihomo     # 下载 MiHomo 代理核心
pnpm run fetch:substore   # 下载 Sub-Store
pnpm run fetch:node       # 下载 Node.js 运行时
```

或手动从 [MiHomo Releases](https://github.com/MetaCubeX/mihomo/releases) 下载，放置到 `src-tauri/binaries/` 目录，并按 Tauri sidecar 命名规范重命名：

- macOS (Apple Silicon): `mihomo-aarch64-apple-darwin`
- macOS (Intel): `mihomo-x86_64-apple-darwin`
- Windows: `mihomo-x86_64-pc-windows-msvc.exe`
- Linux: `mihomo-x86_64-unknown-linux-gnu`

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
conflux-app/
├── src/                    # 前端源代码
│   ├── components/         # React 组件
│   │   ├── layout/         # 布局组件
│   │   ├── ui/             # UI 组件库
│   │   └── icons/          # 图标组件
│   ├── pages/              # 页面组件
│   │   ├── proxy-groups/   # 策略组管理
│   │   ├── proxy-servers/  # 服务器管理
│   │   └── settings/       # 设置页面
│   ├── services/           # IPC 通信服务
│   ├── stores/             # Zustand 状态管理
│   ├── hooks/              # 自定义 Hooks
│   ├── types/              # TypeScript 类型定义
│   └── utils/              # 工具函数
├── src-tauri/              # Tauri 后端
│   ├── src/
│   │   ├── commands/       # Tauri IPC 命令
│   │   ├── config/         # 配置管理
│   │   ├── mihomo/         # MiHomo 核心集成
│   │   ├── models/         # 数据模型
│   │   ├── system/         # 系统功能 (TUN/托盘)
│   │   ├── substore/       # Sub-Store 集成
│   │   └── utils/          # 工具函数
│   ├── binaries/           # 外部二进制文件
│   ├── resources/          # 资源文件
│   └── icons/              # 应用图标
├── docs/                   # 文档
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

### 核心功能 ✅

- [x] MiHomo 代理核心集成
- [x] 代理启动/停止/重启
- [x] 系统托盘与快捷操作
- [x] 开机自启动

### 配置管理 ✅

- [x] 远程订阅支持（自动更新）
- [x] 本地配置文件导入
- [x] 空白配置创建
- [x] 配置导出功能

### 策略与节点 ✅

- [x] 策略组管理（手动选择/自动选择/负载均衡）
- [x] 代理服务器管理
- [x] 节点延迟测速
- [x] 链接解析导入节点
- [x] 三种代理模式切换（规则/全局/直连）

### 规则系统 ✅

- [x] 可视化规则管理
- [x] 规则拖拽排序
- [x] 多种规则类型支持
- [x] 代理源/规则源管理

### 监控与日志 ✅

- [x] 实时流量统计
- [x] 上下载速度监控
- [x] 连接数统计
- [x] 实时日志查看
- [x] 日志过滤与导出

### 高级功能 ✅

- [x] TUN 模式（虚拟网卡）
- [x] Sub-Store 集成
- [x] 局域网共享
- [x] IPv6 支持
- [x] TCP 并发优化
- [x] DNS 配置

## TUN 模式说明

TUN 模式（增强模式）通过创建虚拟网卡实现系统级全局代理，可以代理所有应用程序的网络流量。

### Windows

TUN 模式需要管理员权限。Conflux 提供三种方式运行 TUN：

| 方式                     | 说明                                        | UAC 弹窗     |
| ------------------------ | ------------------------------------------- | ------------ |
| **TUN 服务模式**（推荐） | 在设置中安装 TUN 服务，之后所有操作无需权限 | 仅安装时一次 |
| **管理员运行应用**       | 右键以管理员身份运行 Conflux                | 仅启动时一次 |
| **按需提权**             | 每次开启 TUN 时弹出 UAC 对话框              | 每次开关     |

**TUN 服务安装步骤：**

1. 打开 设置 → TUN 服务
2. 点击「安装服务」（需要管理员权限）
3. 服务会自动启动，之后开关增强模式、启动/停止服务均无需再次授权

> 服务安装时会设置权限允许普通用户控制，并设为开机自动启动。

### macOS

macOS 首次启用 TUN 模式需要：

1. 授权网络扩展权限（系统设置 → 隐私与安全性）
2. 输入管理员密码以安装辅助工具

授权完成后，后续开关 TUN 模式无需再次授权。

### 计划中 🚧

- [ ] 自动更新
- [ ] 连接详情查看
- [ ] 更多平台支持优化

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

## 文档

- [📖 用户使用手册](docs/USER_GUIDE.md) - 面向新手的完整使用指南
- [MiHomo API 文档](MIHOMO_API.md) - 开发者参考

## 许可证

MIT License

## 致谢

- [Tauri](https://tauri.app/) - 跨平台桌面应用框架
- [MiHomo](https://github.com/MetaCubeX/mihomo) - 代理核心
- [React](https://react.dev/) - UI 框架
- [Tailwind CSS](https://tailwindcss.com/) - CSS 框架
- [Radix UI](https://www.radix-ui.com/) - 无障碍组件库
