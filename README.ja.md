# Conflux

<p align="center">
  <img src="https://img.shields.io/github/v/release/veildawn/conflux-app?style=for-the-badge&logo=github&color=007AFF" alt="release">
  <img src="https://img.shields.io/github/downloads/veildawn/conflux-app/total?style=for-the-badge&logo=github&color=2ea44f" alt="downloads">
  <img src="https://img.shields.io/github/stars/veildawn/conflux-app?style=for-the-badge&logo=github" alt="stars">
  <img src="https://img.shields.io/github/actions/workflow/status/veildawn/conflux-app/ci.yml?branch=main&style=for-the-badge&logo=github&label=build" alt="build status">
  <img src="https://img.shields.io/github/license/veildawn/conflux-app?style=for-the-badge&color=orange" alt="license">
</p>

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

Tauri 2 + MiHomo に基づく最新のクロスプラットフォームプロキシ管理デスクトップアプリケーション。

<p align="center">
  <img src="src-tauri/icons/icon.png" width="128" height="128" alt="Conflux">
</p>

<p align="center">
  <a href="https://conflux.veildawn.com/">公式サイト</a> •
  <a href="https://github.com/veildawn/conflux-app/releases">ダウンロード</a> •
  <a href="docs/USER_GUIDE.md">ドキュメント</a>
</p>

## コンプライアンスと使用に関する声明

- 本プロジェクトは、合法的かつコンプライアンスに則ったシナリオ（ネットワークデバッグ、内部セキュリティアクセス、教育および研究など）のみを対象としています。所在地の法律、規制、国際条約、またはプラットフォームの規約に違反する目的（規制の違法な回避、他者の権利の侵害、違法情報の拡散を含むがこれらに限定されない）での使用は固く禁じられています。
- 本ソフトウェアは、ネットワークアクセス、プロキシノード、ルール購読などのサービスを提供しません。関連する設定やデータソースは、ユーザー自身が提供および監査し、合法的であることを確認する必要があります。
- ユーザーは、所在地の法律および規制を遵守し、すべてのリスクと結果を負うものとします。不正使用により生じた法的または経済的責任について、プロジェクトの作成者および貢献者は一切の責任を負いません。
- 上記の条項に同意しない場合は、直ちにインストールおよび使用を中止してください。

## 特徴

- 🚀 **高性能** - Rust + Tauri 2、高速起動、低リソース消費
- 🎨 **モダンな UI** - React + Tailwind CSS、美しくスムーズなインターフェース
- 📊 **リアルタイム監視** - トラフィック統計、接続管理、速度テスト
- 🎯 **柔軟なルール** - 強力なルール管理、ドラッグアンドドロップによる並べ替えをサポート
- 📦 **サブスクリプション管理** - リモートサブスクリプション、ローカルインポート、自動更新
- 🏪 **Sub-Store** - 内蔵の高度なサブスクリプション管理ツール
- 🔧 **TUN モード** - 仮想ネットワークカードによるグローバルプロキシ

## インストール

### Homebrew (macOS)

```bash
brew tap veildawn/cask
brew install --cask conflux
```

### 手動ダウンロード

[Releases](https://github.com/veildawn/conflux-app/releases) から対応するプラットフォームのインストーラーをダウンロードしてください。

| プラットフォーム | 形式            |
| ---------------- | --------------- |
| macOS            | `.dmg`          |
| Windows          | `.msi` / `.exe` |

## 開発

```bash
# 依存関係のインストール
pnpm install

# 外部依存関係のダウンロード (MiHomo, Sub-Store, Node.js)
pnpm run fetch:all

# 開発モード
pnpm tauri dev

# アプリケーションのビルド
pnpm tauri build
```

> 要件：Node.js >= 18, pnpm >= 8, Rust >= 1.77
>
> システム要件については [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/) を参照してください

## ドキュメント

- [📖 ユーザーガイド](docs/USER_GUIDE.md)
- [🔧 MiHomo API ドキュメント](docs/MIHOMO_API.md)

## ライセンス

[GPL-3.0 License](LICENSE)

## 謝辞

- [Tauri](https://tauri.app/) - クロスプラットフォームデスクトップアプリケーションフレームワーク
- [MiHomo](https://github.com/MetaCubeX/mihomo) - プロキシコア
- [Sub-Store](https://github.com/sub-store-org/Sub-Store) - サブスクリプション管理
