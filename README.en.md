# Conflux

<p align="center">
  <img src="https://img.shields.io/github/v/release/veildawn/conflux-app?style=for-the-badge&logo=github&color=007AFF" alt="release">
  <img src="https://img.shields.io/github/downloads/veildawn/conflux-app/total?style=for-the-badge&logo=github&color=2ea44f" alt="downloads">
  <img src="https://img.shields.io/github/stars/veildawn/conflux-app?style=for-the-badge&logo=github" alt="stars">
  <img src="https://img.shields.io/github/actions/workflow/status/veildawn/conflux-app/ci.yml?branch=main&style=for-the-badge&logo=github&label=build" alt="build status">
  <img src="https://img.shields.io/github/license/veildawn/conflux-app?style=for-the-badge&color=orange" alt="license">
</p>

[English](README.en.md) | [简体中文](README.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

A modern cross-platform proxy management desktop application based on Tauri 2 + MiHomo.

<p align="center">
  <img src="src-tauri/icons/icon.png" width="128" height="128" alt="Conflux">
</p>

<p align="center">
  <a href="https://conflux.veildawn.com/">Website</a> •
  <a href="https://github.com/veildawn/conflux-app/releases">Download</a> •
  <a href="docs/USER_GUIDE.md">Docs</a>
</p>

## Compliance and Usage Statement

- This project is intended solely for legal and compliant scenarios (such as network debugging, internal secure access, education, and research). It is strictly prohibited to use it for any purpose that violates the laws, regulations, international conventions, or platform terms of your location, including but not limited to illegally bypassing regulations, infringing on the rights of others, or disseminating illegal information.
- The software does not provide any network access, proxy nodes, rule subscriptions, or other services. All configurations and data sources must be provided and audited by the user, ensuring full compliance.
- Users are solely responsible for complying with local laws and regulations and assume all risks and consequences. The project authors and contributors are not liable for any legal or economic responsibilities arising from improper use.
- If you do not agree to the above terms, please stop installing and using this software immediately.

## Features

- **High Performance** - Rust + Tauri 2, fast startup, low resource usage
- **Modern UI** - React + Tailwind CSS, beautiful and smooth interface
- **Real-time Monitoring** - Traffic statistics, connection management, speed testing
- **Flexible Rules** - Powerful rule management, supports drag-and-drop sorting
- **Subscription Management** - Remote subscriptions, local imports, auto-updates
- **Sub-Store** - Built-in advanced subscription management tool
- **TUN Mode** - Virtual network card for global proxy

## Installation

### Homebrew (macOS)

```bash
brew tap veildawn/cask
brew install --cask conflux
```

### Manual Download

Visit [Releases](https://github.com/veildawn/conflux-app/releases) to download the installer for your platform.

| Platform | Format          |
| -------- | --------------- |
| macOS    | `.dmg`          |
| Windows  | `.msi` / `.exe` |

## Development

```bash
# Install dependencies
pnpm install

# Download external dependencies (MiHomo, Sub-Store, Node.js)
pnpm run fetch:all

# Development mode
pnpm tauri dev

# Build application
pnpm tauri build
```

> Requirements: Node.js >= 18, pnpm >= 8, Rust >= 1.77
>
> System dependencies: see [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)

## Documentation

- [User Guide](docs/USER_GUIDE.md)
- [MiHomo API Docs](docs/MIHOMO_API.md)

## License

[GPL-3.0 License](LICENSE)

## Acknowledgements

- [Tauri](https://tauri.app/) - Cross-platform desktop application framework
- [MiHomo](https://github.com/MetaCubeX/mihomo) - Proxy core
- [Sub-Store](https://github.com/sub-store-org/Sub-Store) - Subscription management
