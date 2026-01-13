# Conflux 汇流

<p align="center">
  <img src="https://img.shields.io/github/v/release/veildawn/conflux-app?style=for-the-badge&logo=github&color=007AFF" alt="release">
  <img src="https://img.shields.io/github/downloads/veildawn/conflux-app/total?style=for-the-badge&logo=github&color=2ea44f" alt="downloads">
  <img src="https://img.shields.io/github/stars/veildawn/conflux-app?style=for-the-badge&logo=github" alt="stars">
  <img src="https://img.shields.io/github/actions/workflow/status/veildawn/conflux-app/ci.yml?branch=main&style=for-the-badge&logo=github&label=build" alt="build status">
  <img src="https://img.shields.io/github/license/veildawn/conflux-app?style=for-the-badge&color=orange" alt="license">
</p>

基于 Tauri 2 + MiHomo 的现代化跨平台代理管理桌面应用。

<p align="center">
  <img src="src-tauri/icons/icon.png" width="128" height="128" alt="Conflux 汇流">
</p>

<p align="center">
  <a href="https://conflux.veildawn.com/">官网</a> •
  <a href="https://github.com/veildawn/conflux-app/releases">下载</a> •
  <a href="docs/USER_GUIDE.md">文档</a>
</p>

## 合规与使用声明

- 本项目仅面向合法合规场景（如网络调试、内部安全访问、教育与研究）。严禁用于任何违反中华人民共和国法律法规、监管政策或平台条款的用途，包括但不限于规避监管、侵害他人权益或传播违法信息。
- 软件不提供任何网络接入、代理节点、规则订阅等服务，相关配置、数据来源均由用户自行提供与审核，务必确保合法合规。
- 使用者应自行遵守所在地法律法规并承担全部风险与后果；因违规使用所产生的任何法律或经济责任由用户自负，项目作者及贡献者不承担任何责任。
- 如不同意上述条款，请立即停止安装与使用。

## 特性

- 🚀 **高性能** - Rust + Tauri 2，启动快速，资源占用低
- 🎨 **现代化 UI** - React + Tailwind CSS，界面美观流畅
- 📊 **实时监控** - 流量统计、连接管理、速度测试
- 🎯 **灵活规则** - 强大的规则管理，支持拖拽排序
- 📦 **订阅管理** - 远程订阅、本地导入、自动更新
- 🏪 **Sub-Store** - 内置高级订阅管理工具
- 🔧 **TUN 模式** - 虚拟网卡全局代理

## 安装

### Homebrew (macOS)

```bash
brew tap veildawn/cask
brew install --cask conflux
```

### 手动下载

前往 [Releases](https://github.com/veildawn/conflux-app/releases) 下载对应平台安装包。

| 平台    | 格式            |
| ------- | --------------- |
| macOS   | `.dmg`          |
| Windows | `.msi` / `.exe` |

## 开发

```bash
# 安装依赖
pnpm install

# 下载外部依赖 (MiHomo, Sub-Store, Node.js)
pnpm run fetch:all

# 开发模式
pnpm tauri dev

# 构建应用
pnpm tauri build
```

> 环境要求：Node.js >= 18, pnpm >= 8, Rust >= 1.77
>
> 系统依赖参考 [Tauri 前置要求](https://v2.tauri.app/start/prerequisites/)

## 文档

- [📖 用户使用手册](docs/USER_GUIDE.md)
- [🔧 MiHomo API 文档](docs/MIHOMO_API.md)

## 许可证

[GPL-3.0 License](LICENSE)

## 致谢

- [Tauri](https://tauri.app/) - 跨平台桌面应用框架
- [MiHomo](https://github.com/MetaCubeX/mihomo) - 代理核心
- [Sub-Store](https://github.com/sub-store-org/Sub-Store) - 订阅管理
