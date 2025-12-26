# Conflux

基于 Tauri 2 + MiHomo 的现代化跨平台代理管理桌面应用。

## 特性

- 🚀 **高性能**: 基于 Rust + Tauri 2，启动快速，资源占用低
- 🎨 **现代化 UI**: React + Tailwind CSS + Shadcn/ui
- 🔒 **安全可靠**: 本地运行，数据安全
- 🌐 **跨平台**: 支持 Windows、macOS、Linux
- 📊 **实时统计**: 流量监控、连接管理、速度测试
- 🎯 **灵活规则**: 强大的规则管理系统

## 技术栈

### 前端
- React 18
- TypeScript 5
- Tailwind CSS 3
- Shadcn/ui
- Zustand (状态管理)
- Vite 5

### 后端
- Tauri 2
- Rust 1.75+
- Tokio (异步运行时)
- MiHomo (代理核心)

## 开发环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Rust >= 1.75.0
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

### 3. 下载 MiHomo

从 [MiHomo Releases](https://github.com/MetaCubeX/mihomo/releases) 下载对应平台的二进制文件，放置到 `src-tauri/resources/` 目录：

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
pnpm tauri build
```

## 项目结构

```
conflux/
├── src/                    # 前端源代码
├── src-tauri/             # Tauri 后端
├── public/                # 静态资源
└── package.json
```

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

## 开发文档

- [需求设计](需求设计.md)
- [架构设计](架构设计.md)
- [阶段任务详解](阶段任务详解.md)
- [开发规范](开发规范.md)
- [开发指南](开发指南.md)

## 许可证

MIT License

## 致谢

- [Tauri](https://tauri.app/) - 跨平台桌面应用框架
- [MiHomo](https://github.com/MetaCubeX/mihomo) - 代理核心
- [React](https://react.dev/) - UI 框架
- [Tailwind CSS](https://tailwindcss.com/) - CSS 框架
- [Shadcn/ui](https://ui.shadcn.com/) - 组件库
