# Conflux Claude 开发指南

Conflux 是一个基于 Tauri 2 + MiHomo 构建的现代化跨平台代理管理桌面应用。本指南帮助 Claude 理解并高效地参与项目开发。

## 项目概述

**类型**: 桌面应用 (Tauri 2 + React)
**用途**: 基于 MiHomo 核心的代理管理应用
**架构**: Rust 后端 (Tauri) + React 前端
**语言**: 中文文档/界面

## 技术栈

### 前端

- **React 19** + TypeScript 5
- **Tailwind CSS 4** + **Radix UI** 组件库
- **Zustand** 状态管理
- **Vite 7** 构建工具
- **React Router DOM** 路由

### 后端

- **Tauri 2** 桌面框架
- **Rust 1.77+** + Tokio 异步运行时
- **MiHomo** 代理核心集成
- 系统集成（托盘、通知）

## 项目结构

```
conflux/
├── src/                    # React 前端
│   ├── components/         # UI 组件
│   ├── pages/              # 页面组件
│   ├── services/           # IPC 通信
│   ├── stores/             # Zustand 状态
│   ├── types/              # TypeScript 类型定义
│   └── utils/              # 前端工具函数
├── src-tauri/              # Rust 后端
│   ├── src/
│   │   ├── commands/       # Tauri IPC 命令
│   │   ├── config/         # 配置管理
│   │   ├── mihomo/         # MiHomo 集成
│   │   ├── models/         # 数据模型
│   │   └── main.rs         # 入口文件
│   └── binaries/           # MiHomo 二进制文件
```

## 开发命令

```bash
# 安装依赖
pnpm install

# 开发模式（热重载）
pnpm tauri dev

# 构建应用
pnpm tauri build

# 仅前端开发服务器
pnpm dev

# 代码质量
pnpm lint          # ESLint
pnpm type-check    # TypeScript
pnpm format        # Prettier
pnpm test          # Vitest

# 下载外部依赖
pnpm run fetch:mihomo      # 下载 MiHomo 二进制
pnpm run fetch:substore    # 下载 Sub-Store
pnpm run fetch:all         # 下载全部
```

## 重要文件

### 配置文件

- `package.json` - Node.js 依赖和脚本
- `src-tauri/Cargo.toml` - Rust 依赖
- `src-tauri/tauri.conf.json` - Tauri 配置
- `vite.config.ts` - 前端构建配置

### 核心源码

- `src/App.tsx` - React 主应用
- `src/services/ipc.ts` - 前后端通信
- `src-tauri/src/main.rs` - Rust 应用入口
- `src-tauri/src/commands/` - 后端 API 端点

## 开发流程

### 1. 前端开发

- 使用 `pnpm dev` 进行纯前端开发
- 使用 `pnpm tauri dev` 进行全栈开发
- 前端通过 Tauri IPC 与后端通信

### 2. 后端开发

- Rust 代码位于 `src-tauri/src/`
- 通过 `#[tauri::command]` 暴露命令给前端
- 代理设置的配置管理

### 3. IPC 通信

- 前端通过 `invoke()` 函数调用后端
- 类型定义在 `src/types/` 和 `src-tauri/src/models/`
- 异步通信模式

## 功能开发进度

### 当前阶段 (Phase 1) ✅

- MiHomo 核心集成
- 基础代理管理
- 系统托盘集成
- 配置管理
- 节点切换功能

### 计划中 (Phase 2)

- 订阅管理
- 高级节点管理
- 规则管理
- 连接管理
- 配置编辑器

### 未来 (Phase 3)

- 流量统计
- TUN 模式
- 系统集成优化
- 自动更新

## MiHomo 集成

- 二进制文件下载到 `src-tauri/binaries/`
- 平台特定二进制（Windows/macOS/Linux）
- 通过 Rust 后端控制
- REST API 通信用于状态/控制

### Sidecar 二进制命名

Tauri `externalBin` 打包后会简化文件名（去掉 target triple）：

| 环境      | 开发时 (binaries/)                  | 打包后 (安装目录) |
| --------- | ----------------------------------- | ----------------- |
| Windows   | `mihomo-x86_64-pc-windows-msvc.exe` | `mihomo.exe`      |
| macOS ARM | `mihomo-aarch64-apple-darwin`       | `mihomo`          |
| macOS x64 | `mihomo-x86_64-apple-darwin`        | `mihomo`          |
| Linux     | `mihomo-x86_64-unknown-linux-gnu`   | `mihomo`          |

`find_sidecar_binary()` 函数直接使用简化名称查找打包后的 sidecar。

## 代码风格规范

### TypeScript/React

- 函数式组件 + Hooks
- TypeScript 严格模式
- Tailwind 样式
- Radix UI 无障碍组件

### Rust

- 标准 Rust 规范
- Tokio 异步/等待
- `Result<T, E>` 错误处理
- Serde JSON 序列化

## 测试

- **前端**: Vitest 单元测试
- **后端**: Rust 内置测试框架
- **E2E**: 计划使用 Tauri 测试工具

## 构建与分发

- **开发**: `pnpm tauri dev`
- **生产**: `pnpm tauri build`
- **CI/CD**: GitHub Actions 多平台构建
- **平台**: Windows (x64), macOS (ARM64/x64), Linux (x64)

## Claude 常见任务

1. **添加新功能**: 通常涉及前端 UI 和后端命令
2. **IPC 通信**: 在 Rust 中定义命令，从 TypeScript 调用
3. **配置管理**: 更新配置模型和持久化
4. **UI 开发**: React 组件 + Tailwind CSS
5. **Bug 修复**: 检查前端和后端日志
6. **依赖管理**: 前端用 `pnpm`，Rust 用 `cargo`

## 环境要求

- **Node.js** >= 18.0.0
- **pnpm** >= 8.0.0（推荐包管理器）
- **Rust** >= 1.77.0
- **Python 3**（用于下载 MiHomo）
- **系统依赖**: 参考 Tauri 要求

## 参考资源

- [Tauri 2 文档](https://v2.tauri.app/)
- [MiHomo 文档](https://wiki.metacubex.one/)
- [项目 README](README.md) - 详细项目信息

---

_本指南应随项目发展和新功能添加而更新。_
