# Conflux

<p align="center">
  <img src="https://img.shields.io/github/v/release/veildawn/conflux-app?style=for-the-badge&logo=github&color=007AFF" alt="release">
  <img src="https://img.shields.io/github/downloads/veildawn/conflux-app/total?style=for-the-badge&logo=github&color=2ea44f" alt="downloads">
  <img src="https://img.shields.io/github/stars/veildawn/conflux-app?style=for-the-badge&logo=github" alt="stars">
  <img src="https://img.shields.io/github/actions/workflow/status/veildawn/conflux-app/ci.yml?branch=main&style=for-the-badge&logo=github&label=build" alt="build status">
  <img src="https://img.shields.io/github/license/veildawn/conflux-app?style=for-the-badge&color=orange" alt="license">
</p>

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

Tauri 2 + MiHomo 기반의 현대적인 크로스 플랫폼 프록시 관리 데스크톱 애플리케이션입니다.

<p align="center">
  <img src="src-tauri/icons/icon.png" width="128" height="128" alt="Conflux">
</p>

<p align="center">
  <a href="https://conflux.veildawn.com/">웹사이트</a> •
  <a href="https://github.com/veildawn/conflux-app/releases">다운로드</a> •
  <a href="docs/USER_GUIDE.md">문서</a>
</p>

## 규정 준수 및 사용 성명

- 이 프로젝트는 합법적이고 규정을 준수하는 시나리오(네트워크 디버깅, 내부 보안 액세스, 교육 및 연구 등)만을 대상으로 합니다. 귀하가 위치한 지역의 법률, 규정, 국제 협약 또는 플랫폼 약관을 위반하는 용도(규제 우회, 타인의 권리 침해 또는 불법 정보 유포를 포함하되 이에 국한되지 않음)로 사용하는 것은 엄격히 금지됩니다.
- 이 소프트웨어는 네트워크 액세스, 프록시 노드, 규칙 구독 등의 서비스를 제공하지 않습니다. 관련 구성 및 데이터 소스는 사용자가 직접 제공하고 검토해야 하며, 합법적인지 확인해야 합니다.
- 사용자는 현지 법률 및 규정을 준수해야 하며 모든 위험과 결과에 대한 책임을 집니다. 부적절한 사용으로 인해 발생하는 모든 법적 또는 경제적 책임에 대해 프로젝트 작성자 및 기여자는 책임을 지지 않습니다.
- 위 조항에 동의하지 않는 경우 즉시 설치 및 사용을 중단하십시오.

## 특징

- 🚀 **고성능** - Rust + Tauri 2, 빠른 시작, 낮은 리소스 점유율
- 🎨 **현대적인 UI** - React + Tailwind CSS, 아름답고 부드러운 인터페이스
- 📊 **실시간 모니터링** - 트래픽 통계, 연결 관리, 속도 테스트
- 🎯 **유연한 규칙** - 강력한 규칙 관리, 드래그 앤 드롭 정렬 지원
- 📦 **구독 관리** - 원격 구독, 로컬 가져오기, 자동 업데이트
- 🏪 **Sub-Store** - 내장된 고급 구독 관리 도구
- 🔧 **TUN 모드** - 가상 네트워크 카드를 통한 전역 프록시

## 설치

### Homebrew (macOS)

```bash
brew tap veildawn/cask
brew install --cask conflux
```

### 수동 다운로드

[Releases](https://github.com/veildawn/conflux-app/releases)에서 해당 플랫폼용 설치 프로그램을 다운로드하십시오.

| 플랫폼  | 형식            |
| ------- | --------------- |
| macOS   | `.dmg`          |
| Windows | `.msi` / `.exe` |

## 개발

```bash
# 의존성 설치
pnpm install

# 외부 의존성 다운로드 (MiHomo, Sub-Store, Node.js)
pnpm run fetch:all

# 개발 모드
pnpm tauri dev

# 애플리케이션 빌드
pnpm tauri build
```

> 요구 사항: Node.js >= 18, pnpm >= 8, Rust >= 1.77
>
> 시스템 의존성은 [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)를 참조하십시오

## 문서

- [📖 사용자 가이드](docs/USER_GUIDE.md)
- [🔧 MiHomo API 문서](docs/MIHOMO_API.md)

## 라이선스

[GPL-3.0 License](LICENSE)

## 감사의 말

- [Tauri](https://tauri.app/) - 크로스 플랫폼 데스크톱 애플리케이션 프레임워크
- [MiHomo](https://github.com/MetaCubeX/mihomo) - 프록시 코어
- [Sub-Store](https://github.com/sub-store-org/Sub-Store) - 구독 관리
