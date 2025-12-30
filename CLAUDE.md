# Claude Development Guide for Conflux

Conflux is a modern cross-platform proxy management desktop application built with Tauri 2 + MiHomo. This guide helps Claude understand and work with the project effectively.

## Project Overview

**Type**: Desktop Application (Tauri 2 + React)
**Purpose**: Proxy management application with MiHomo core
**Architecture**: Rust backend (Tauri) + React frontend
**Language**: Primarily Chinese documentation/UI

## Technology Stack

### Frontend
- **React 19** with TypeScript 5
- **Tailwind CSS 4** + **Radix UI** components
- **Zustand** for state management
- **Vite 7** for build tooling
- **React Router DOM** for routing

### Backend
- **Tauri 2** desktop framework
- **Rust 1.77+** with Tokio async runtime
- **MiHomo** proxy core integration
- System integration (tray, notifications)

## Key Project Structure

```
conflux/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── pages/              # Page components
│   ├── services/           # IPC communication
│   ├── stores/             # Zustand stores
│   ├── types/              # TypeScript definitions
│   └── utils/              # Frontend utilities
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── commands/       # Tauri IPC commands
│   │   ├── config/         # Configuration management
│   │   ├── mihomo/         # MiHomo integration
│   │   ├── models/         # Data models
│   │   └── main.rs         # Entry point
│   └── resources/          # MiHomo binaries
```

## Development Commands

```bash
# Install dependencies
pnpm install

# Development mode (hot reload)
pnpm tauri dev

# Build application
pnpm tauri build

# Frontend-only dev server
pnpm dev

# Code quality
pnpm lint          # ESLint
pnpm type-check    # TypeScript
pnpm format        # Prettier
pnpm test          # Vitest

# Fetch external dependencies
pnpm run fetch:mihomo      # Download MiHomo binary
pnpm run fetch:substore    # Download Sub-Store
pnpm run fetch:all         # Download all
```

## Important Files to Know

### Configuration
- `package.json` - Node.js dependencies and scripts
- `src-tauri/Cargo.toml` - Rust dependencies
- `src-tauri/tauri.conf.json` - Tauri configuration
- `vite.config.ts` - Frontend build configuration

### Key Source Files
- `src/App.tsx` - Main React application
- `src/services/ipc.ts` - Frontend-backend communication
- `src-tauri/src/main.rs` - Rust application entry
- `src-tauri/src/commands/` - Backend API endpoints

## Development Workflow

### 1. Frontend Development
- Use `pnpm dev` for frontend-only development
- Use `pnpm tauri dev` for full-stack development
- Frontend communicates with backend via Tauri IPC

### 2. Backend Development
- Rust code in `src-tauri/src/`
- Commands exposed to frontend via `#[tauri::command]`
- Configuration management for proxy settings

### 3. IPC Communication
- Frontend calls backend via `invoke()` functions
- Types defined in `src/types/` and `src-tauri/src/models/`
- Async communication pattern

## Key Features Being Developed

### Current (Phase 1) ✅
- MiHomo core integration
- Basic proxy management
- System tray integration
- Configuration management
- Node switching functionality

### Planned (Phase 2)
- Subscription management
- Advanced node management
- Rule management
- Connection management
- Configuration editor

### Future (Phase 3)
- Traffic statistics
- TUN mode
- System integration optimization
- Auto-updater

## MiHomo Integration

- Binary downloaded to `src-tauri/resources/`
- Platform-specific binaries (Windows/macOS/Linux)
- Controlled via Rust backend
- REST API communication for status/control

## Code Style & Conventions

### TypeScript/React
- Functional components with hooks
- TypeScript strict mode
- Tailwind for styling
- Radix UI for accessible components

### Rust
- Standard Rust conventions
- Async/await with Tokio
- Error handling with `Result<T, E>`
- Serde for JSON serialization

## Testing

- **Frontend**: Vitest for unit tests
- **Backend**: Rust built-in test framework
- **E2E**: Planned with Tauri testing tools

## Build & Distribution

- **Development**: `pnpm tauri dev`
- **Production**: `pnpm tauri build`
- **CI/CD**: GitHub Actions for multi-platform builds
- **Platforms**: Windows (x64), macOS (ARM64/x64), Linux (x64)

## Common Tasks for Claude

1. **Adding new features**: Usually involves both frontend UI and backend commands
2. **IPC communication**: Defining commands in Rust and calling from TypeScript
3. **Configuration management**: Updating config models and persistence
4. **UI development**: React components with Tailwind CSS
5. **Bug fixes**: Check both frontend and backend logs
6. **Dependencies**: Use `pnpm` for frontend, `cargo` for Rust

## Environment Requirements

- **Node.js** >= 18.0.0
- **pnpm** >= 8.0.0 (preferred package manager)
- **Rust** >= 1.77.0
- **Python 3** (for downloading MiHomo)
- **System dependencies**: Per Tauri requirements

## Useful Resources

- [Tauri 2 Documentation](https://v2.tauri.app/)
- [MiHomo Documentation](https://wiki.metacubex.one/)
- [Project README](README.md) - Comprehensive project information

---

*This guide should be updated as the project evolves and new features are added.*