# Conflux 汇流 - Claude 开发指南

Conflux（汇流）是一个基于 Tauri 2 + MiHomo 构建的现代化跨平台代理管理桌面应用。本指南帮助 Claude 理解并高效地参与项目开发。

## 项目概述

| 属性     | 说明                                   |
| -------- | -------------------------------------- |
| **类型** | 桌面应用 (Tauri 2 + React)             |
| **用途** | 基于 MiHomo 核心的代理管理应用         |
| **架构** | Rust 后端 (Tauri) + React 前端         |
| **语言** | 中文文档/界面                          |
| **仓库** | https://github.com/Ashbaer/conflux-app |

## 技术栈

### 前端

- **React 19** + TypeScript 5
- **Tailwind CSS 4** + **Radix UI** 组件库
- **Zustand** 状态管理
- **Vite 7** 构建工具
- **React Router DOM** 路由
- **Recharts** 图表库
- **dnd-kit** 拖拽排序

### 后端

- **Tauri 2** 桌面框架
- **Rust 1.77+** + Tokio 异步运行时
- **MiHomo** 代理核心集成
- **Sub-Store** 订阅管理服务
- 系统集成（托盘、TUN、通知）

## 项目结构

```
conflux-app/
├── src/                          # React 前端
│   ├── components/               # UI 组件
│   │   ├── layout/               # 布局组件
│   │   │   ├── AppLayout.tsx     # 主布局
│   │   │   ├── Header.tsx        # 标题栏
│   │   │   ├── Sidebar.tsx       # 侧边栏
│   │   │   └── WindowControls.tsx# 窗口控制按钮
│   │   ├── ui/                   # Shadcn/ui 组件
│   │   └── icons/                # 图标组件
│   ├── pages/                    # 页面组件
│   │   ├── Home.tsx              # 活动监控页
│   │   ├── Proxy.tsx             # 策略管理页
│   │   ├── ProxyGroups.tsx       # 策略组列表页
│   │   ├── proxy-groups/         # 策略组相关
│   │   │   ├── ProxyGroupEditWindow.tsx  # 编辑窗口
│   │   │   ├── shared/           # 共享组件
│   │   │   ├── steps/            # 向导步骤
│   │   │   └── hooks/            # 自定义 Hooks
│   │   ├── proxy-servers/        # 服务器管理
│   │   │   ├── index.tsx         # 服务器列表页
│   │   │   ├── ProxyServerEditWindow.tsx
│   │   │   └── LinkParseDialog.tsx
│   │   ├── Subscription.tsx      # 配置管理页
│   │   ├── SubscriptionEditWindow.tsx
│   │   ├── Rules.tsx             # 规则管理页
│   │   ├── RuleEditWindow.tsx    # 规则编辑窗口
│   │   ├── RuleDatabase.tsx      # 规则数据库
│   │   ├── Providers.tsx         # 资源管理页
│   │   ├── SubStore.tsx          # Sub-Store 页
│   │   ├── Logs.tsx              # 日志查看页
│   │   ├── Settings.tsx          # 设置主页
│   │   └── settings/             # 设置子模块
│   │       ├── sections/         # 设置分区组件
│   │       ├── hooks/            # 设置相关 Hooks
│   │       └── components.tsx    # 通用组件
│   ├── services/
│   │   └── ipc.ts                # 前后端 IPC 通信封装
│   ├── stores/
│   │   ├── appStore.ts           # 应用状态
│   │   └── proxyStore.ts         # 代理状态
│   ├── hooks/
│   │   └── useToast.ts           # Toast 通知
│   ├── types/
│   │   ├── config.ts             # 配置类型定义
│   │   ├── proxy.ts              # 代理类型定义
│   │   └── proxy-configs.ts      # 代理配置类型
│   ├── utils/
│   │   ├── cn.ts                 # className 工具
│   │   ├── format.ts             # 格式化工具
│   │   ├── deleteValidation.ts   # 删除校验
│   │   ├── dragUtils.ts          # 拖拽工具
│   │   └── logger.ts             # 日志工具
│   └── styles/
│       └── globals.css           # 全局样式
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── main.rs               # 应用入口
│   │   ├── lib.rs                # 库入口
│   │   ├── tray_menu.rs          # 系统托盘
│   │   ├── commands/             # Tauri IPC 命令
│   │   │   ├── mod.rs
│   │   │   ├── proxy.rs          # 代理相关命令
│   │   │   ├── config.rs         # 配置相关命令
│   │   │   ├── profile.rs        # Profile 管理
│   │   │   └── ...
│   │   ├── config/               # 配置管理
│   │   │   ├── mod.rs
│   │   │   ├── manager.rs        # 配置管理器
│   │   │   └── profile.rs        # Profile 处理
│   │   ├── mihomo/               # MiHomo 集成
│   │   │   ├── mod.rs
│   │   │   ├── process.rs        # 进程管理
│   │   │   ├── api.rs            # REST API 客户端
│   │   │   └── config.rs         # MiHomo 配置
│   │   ├── models/               # 数据模型
│   │   ├── system/               # 系统功能
│   │   │   ├── mod.rs
│   │   │   ├── tun.rs            # TUN 模式
│   │   │   └── autostart.rs      # 开机自启
│   │   ├── substore/             # Sub-Store 集成
│   │   │   ├── mod.rs
│   │   │   └── service.rs
│   │   └── utils/                # 工具函数
│   ├── binaries/                 # 外部二进制 (sidecar)
│   │   ├── mihomo-*              # MiHomo 核心
│   │   └── node-*                # Node.js 运行时
│   ├── resources/                # 资源文件
│   │   └── sub-store/            # Sub-Store 前端
│   ├── icons/                    # 应用图标
│   ├── tauri.conf.json           # Tauri 主配置
│   ├── tauri.macos.conf.json     # macOS 特定配置
│   ├── tauri.windows.conf.json   # Windows 特定配置
│   └── Cargo.toml                # Rust 依赖
├── docs/                         # 文档
│   └── USER_GUIDE.md             # 用户手册
├── scripts/                      # 构建脚本
│   ├── fetch-mihomo.sh           # 下载 MiHomo
│   ├── fetch-node.sh             # 下载 Node.js
│   ├── fetch-substore.sh         # 下载 Sub-Store
│   └── gen-icons.mjs             # 生成图标
└── package.json
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
pnpm lint:fix      # 自动修复
pnpm type-check    # TypeScript 类型检查
pnpm format        # Prettier 格式化
pnpm test          # Vitest 测试

# 下载外部依赖
pnpm run fetch:mihomo      # 下载 MiHomo 二进制
pnpm run fetch:substore    # 下载 Sub-Store
pnpm run fetch:node        # 下载 Node.js
pnpm run fetch:all         # 下载全部
```

## 页面组件一览

| 路由             | 组件                      | 功能                                     |
| ---------------- | ------------------------- | ---------------------------------------- |
| `/`              | `Home.tsx`                | 活动监控：核心状态、流量统计、速度图表   |
| `/proxy`         | `Proxy.tsx`               | 策略管理：模式切换、策略组选择、节点切换 |
| `/proxy-groups`  | `ProxyGroups.tsx`         | 策略组列表：创建/编辑/删除策略组         |
| `/proxy-servers` | `proxy-servers/index.tsx` | 服务器列表：管理代理节点                 |
| `/subscription`  | `Subscription.tsx`        | 配置管理：订阅/本地/空白配置             |
| `/rules`         | `Rules.tsx`               | 规则管理：可视化编辑分流规则             |
| `/providers`     | `Providers.tsx`           | 资源管理：代理源/规则源                  |
| `/sub-store`     | `SubStore.tsx`            | Sub-Store：内嵌订阅管理工具              |
| `/logs`          | `Logs.tsx`                | 日志查看：实时日志、过滤、导出           |
| `/settings`      | `Settings.tsx`            | 设置：通用/网络/DNS 配置                 |

### 独立窗口

| 路由                 | 组件                         | 用途           |
| -------------------- | ---------------------------- | -------------- |
| `/proxy-group-edit`  | `ProxyGroupEditWindow.tsx`   | 策略组编辑向导 |
| `/proxy-server-edit` | `ProxyServerEditWindow.tsx`  | 服务器编辑表单 |
| `/subscription-edit` | `SubscriptionEditWindow.tsx` | 配置编辑表单   |
| `/rule-edit`         | `RuleEditWindow.tsx`         | 规则编辑表单   |

## 重要文件

### 配置文件

| 文件                        | 说明               |
| --------------------------- | ------------------ |
| `package.json`              | Node.js 依赖和脚本 |
| `src-tauri/Cargo.toml`      | Rust 依赖          |
| `src-tauri/tauri.conf.json` | Tauri 主配置       |
| `vite.config.ts`            | 前端构建配置       |
| `tailwind.config.js`        | Tailwind CSS 配置  |
| `tsconfig.json`             | TypeScript 配置    |

### 核心源码

| 文件                       | 说明                             |
| -------------------------- | -------------------------------- |
| `src/App.tsx`              | React 路由配置                   |
| `src/services/ipc.ts`      | **IPC 通信封装**（所有后端调用） |
| `src/stores/proxyStore.ts` | **代理状态管理**                 |
| `src/types/config.ts`      | **配置类型定义**                 |
| `src-tauri/src/main.rs`    | Rust 应用入口                    |
| `src-tauri/src/commands/`  | **后端 API 端点**                |
| `src-tauri/src/mihomo/`    | MiHomo 核心集成                  |

## IPC 通信模式

### 前端调用后端

```typescript
// src/services/ipc.ts
import { invoke } from '@tauri-apps/api/core';

export const ipc = {
  // 获取代理状态
  getProxyStatus: () => invoke<ProxyStatus>('get_proxy_status'),

  // 切换代理模式
  switchMode: (mode: string) => invoke('switch_mode', { mode }),

  // 获取配置
  getProfile: (id: string) => invoke<[ProfileMetadata, ProfileConfig]>('get_profile', { id }),
};
```

### 后端定义命令

```rust
// src-tauri/src/commands/proxy.rs
#[tauri::command]
pub async fn get_proxy_status(state: State<'_, AppState>) -> Result<ProxyStatus, String> {
    // 实现...
}
```

### ⚠️ Tauri 2 参数命名规则

**重要**：Tauri 2 在前后端通信时会自动转换参数名大小写格式：

| 后端 Rust (snake_case) | 前端 JS (camelCase) |
| ---------------------- | ------------------- |
| `socks_port`           | `socksPort`         |
| `allow_lan`            | `allowLan`          |
| `tcp_concurrent`       | `tcpConcurrent`     |

```typescript
// ❌ 错误：使用 snake_case
invoke('set_ports', { port, socks_port: 7891 });

// ✅ 正确：使用 camelCase
invoke('set_ports', { port, socksPort: 7891 });
```

前端调用 `invoke` 时，参数对象的 key 必须使用 **camelCase**，Tauri 会自动映射到后端的 snake_case 参数。

### 事件监听

```typescript
// 前端监听后端事件
import { listen } from '@tauri-apps/api/event';

listen('log-entry', (event) => {
  console.log('Log:', event.payload);
});
```

## 功能开发状态

### 已完成 ✅

| 模块       | 功能                                         |
| ---------- | -------------------------------------------- |
| **核心**   | MiHomo 集成、进程管理、系统托盘、开机自启    |
| **配置**   | 远程订阅、本地导入、空白创建、导出、自动更新 |
| **策略**   | 策略组 CRUD、节点选择、延迟测速、模式切换    |
| **服务器** | 服务器 CRUD、链接解析、批量测速              |
| **规则**   | 规则 CRUD、拖拽排序、多类型支持              |
| **资源**   | 代理源/规则源管理                            |
| **监控**   | 实时流量、速度图表、连接统计                 |
| **日志**   | 实时日志、级别过滤、搜索、导出               |
| **设置**   | 端口配置、TUN 模式、DNS、IPv6、TCP 并发      |
| **集成**   | Sub-Store 内嵌                               |

### 计划中 🚧

- 自动更新功能
- 连接详情查看
- 更多规则类型支持

## TUN 模式实现

TUN 模式（增强模式）通过创建虚拟网卡实现系统级全局代理。由于需要修改系统网络配置，需要管理员/root 权限。

### Windows 实现

```
src-tauri/
├── src/mihomo/manager.rs      # MihomoManager::start_elevated() - TUN 启动逻辑
├── src/system/win_service.rs  # WinServiceManager - TUN 服务管理
└── service/                   # 独立 Windows 服务项目
    ├── src/main.rs            # 服务入口
    ├── src/service.rs         # 服务生命周期
    ├── src/ipc.rs             # IPC 服务器 (端口 33211)
    └── src/mihomo.rs          # mihomo 进程管理
```

**启动优先级：**

```rust
// src-tauri/src/mihomo/manager.rs - start() 方法
if is_tun_enabled() {
    // 1. 优先：TUN 服务模式（服务已安装并运行）
    if service_installed && service_running && is_service_ipc_ready() {
        return start_via_service();  // 通过 IPC 启动，无需 UAC
    }

    // 2. 次选：应用已有管理员权限
    if is_running_as_admin() {
        return spawn_mihomo_directly();  // 直接启动，无需 UAC
    }

    // 3. 兜底：请求 UAC 提权
    return start_elevated();  // PowerShell Start-Process -Verb RunAs
}
```

**TUN 服务架构：**

- 服务名称：`ConfluxService`
- IPC 端口：`33211`
- 端点：`/health`, `/status`, `/start`, `/stop`, `/restart`
- 服务以 LocalSystem 账户运行，具有管理员权限

**关键函数：**
| 函数 | 文件 | 说明 |
|------|------|------|
| `is_running_as_admin()` | `manager.rs` | 检查当前进程是否有管理员权限 |
| `is_service_available()` | `manager.rs` | 检查服务是否可用（已安装+运行+IPC就绪） |
| `start_via_service()` | `manager.rs` | 通过 IPC 请求服务启动 mihomo |
| `start_elevated()` | `manager.rs` | 通过 PowerShell UAC 提权启动 |
| `WinServiceManager::install()` | `win_service.rs` | 安装 Windows 服务 |
| `WinServiceManager::start_mihomo()` | `win_service.rs` | 发送 IPC 请求启动 mihomo |

### macOS 实现

```
src-tauri/
├── src/system/tun.rs          # TunPermission - 权限检查和设置
└── src/mihomo/manager.rs      # 普通启动（已有 root helper）
```

macOS 使用系统的网络扩展框架，首次启用需要：

1. 用户在系统设置中批准网络扩展
2. 安装 privileged helper tool（需要管理员密码）

授权后 helper tool 持久化，后续无需再次授权。

**关键函数：**
| 函数 | 文件 | 说明 |
|------|------|------|
| `TunPermission::check_permission()` | `tun.rs` | 检查 TUN 权限状态 |
| `TunPermission::setup_permission()` | `tun.rs` | 请求设置 TUN 权限 |

### 前端交互

```typescript
// src/stores/proxyStore.ts
setEnhancedMode: async (enabled: boolean) => {
  await ipc.setTunMode(enabled);
  // 失败时自动获取实际状态，确保开关正确显示
};

// src/services/ipc.ts
setTunMode: (enabled: boolean) => invoke('set_tun_mode', { enabled });
```

**错误处理：**

- Windows UAC 被拒绝 → 返回错误，前端回滚开关状态
- macOS 权限未授权 → 返回错误，提示用户授权

## MiHomo 集成

### Sidecar 二进制命名规范

| 平台      | 开发时 (binaries/)                  | 打包后       |
| --------- | ----------------------------------- | ------------ |
| Windows   | `mihomo-x86_64-pc-windows-msvc.exe` | `mihomo.exe` |
| macOS ARM | `mihomo-aarch64-apple-darwin`       | `mihomo`     |
| macOS x64 | `mihomo-x86_64-apple-darwin`        | `mihomo`     |
| Linux     | `mihomo-x86_64-unknown-linux-gnu`   | `mihomo`     |

### MiHomo REST API

MiHomo 启动后在本地端口提供 REST API：

```
GET  /proxies          # 获取所有代理
GET  /proxies/:name    # 获取特定代理
PUT  /proxies/:name    # 切换代理
GET  /configs          # 获取配置
PATCH /configs         # 更新配置
GET  /connections      # 获取连接
DELETE /connections    # 关闭连接
WS   /traffic          # 流量 WebSocket
WS   /logs             # 日志 WebSocket
```

## 代码规范

### TypeScript/React

- 函数式组件 + Hooks
- TypeScript 严格模式
- Tailwind CSS 样式（使用 `cn()` 工具合并类名）
- Radix UI 无障碍组件
- 异步操作使用 `async/await`

### Rust

- 标准 Rust 2021 规范
- Tokio 异步运行时
- `Result<T, E>` 错误处理
- Serde JSON 序列化
- 使用 `thiserror` 定义错误类型

## Claude 开发任务指南

### 1. 添加新页面

1. 在 `src/pages/` 创建页面组件
2. 在 `src/App.tsx` 添加路由
3. 在 `src/components/layout/Sidebar.tsx` 添加导航项

### 2. 添加 IPC 命令

1. 在 `src-tauri/src/commands/` 添加 Rust 命令
2. 在 `src-tauri/src/lib.rs` 注册命令
3. 在 `src/services/ipc.ts` 添加 TypeScript 封装
4. 在 `src/types/` 添加类型定义

### 3. 修改配置结构

1. 更新 `src/types/config.ts` 类型定义
2. 更新 `src-tauri/src/models/` Rust 结构
3. 更新相关的 IPC 命令和前端组件

### 4. UI 开发

- 使用 `src/components/ui/` 中的基础组件
- 参考现有页面的 BentoCard 等布局模式
- 使用 Tailwind CSS，遵循现有配色方案

### 5. 调试技巧

- 前端：浏览器开发者工具
- 后端：`println!` 或 `log` crate
- IPC：检查 `invoke` 返回的错误信息

### 6. 修改版本号

修改版本号时，需要同时更新以下三个文件：

| 文件                        | 字段      | 说明          |
| --------------------------- | --------- | ------------- |
| `src-tauri/tauri.conf.json` | `version` | Tauri 主配置  |
| `src-tauri/Cargo.toml`      | `version` | Rust 项目版本 |
| `package.json`              | `version` | 前端项目版本  |

**注意**：`Cargo.lock` 会在修改 `Cargo.toml` 后自动更新，无需手动修改。

## 环境要求

- **Node.js** >= 18.0.0
- **pnpm** >= 8.0.0（推荐包管理器）
- **Rust** >= 1.77.0
- **Python 3**（用于下载脚本）
- **系统依赖**: 参考 [Tauri 前置要求](https://v2.tauri.app/start/prerequisites/)

## 参考资源

- [Tauri 2 文档](https://v2.tauri.app/)
- [MiHomo 文档](https://wiki.metacubex.one/)
- [MiHomo API 文档](MIHOMO_API.md)
- [用户使用手册](docs/USER_GUIDE.md)
- [项目 README](README.md)

---

_本指南应随项目发展和新功能添加而更新。最后更新：2024年1月_
