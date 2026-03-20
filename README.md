# OneThought (Tauri 版)

与上层目录的 **OneThought**（Electron 版）功能对应，本工程使用 **Tauri 2 + React + TypeScript** 实现，用于尝试更小的安装包体积（约 5–15MB，依赖系统 WebView）。

**现有 Electron 工程保持不变**，本目录为独立新工程，可在此逐步迁移功能。

开发过程中遇到的典型问题与解决思路已整理为文档，便于回顾学习：

- **[docs/开发问题与经验记录.md](./docs/开发问题与经验记录.md)**

## 环境要求

- Node.js 18+
- **Rust**：必须先安装 [rustup](https://rustup.rs/)（`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`），否则 `npm run tauri dev` 会报 `cargo: No such file or directory`。
- Windows：已安装 [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)（Win10/11 通常已带）
- macOS：系统 WebView
- Linux：webkit2gtk 等（见 [Tauri 文档](https://v2.tauri.app/start/prerequisites/)）

## 快速开始

```bash
cd one_thought_tauri
npm install
npm run tauri dev
```

打包（本机）：

```bash
npm run release
```

产物在 `src-tauri/target/release/`，安装包在 `src-tauri/target/release/bundle/`。

### Windows + macOS 自动构建（推荐）

本仓库已提供 GitHub Actions 工作流：`.github/workflows/windows-release.yml`。

- 手动触发：Actions -> `Build Desktop Releases` -> `Run workflow`
- 自动触发：推送 tag（如 `v0.1.1`）

推送 tag 后会自动：

- 在 Windows runner 上构建 `exe/msi`
- 在 macOS runner 上构建 `dmg`
- 上传安装包为 workflow artifacts
- 自动创建/更新同名 GitHub Release，并附上所有安装包

## 从 OneThought (Electron) 迁移

### 可复用

- **前端**：`../src/renderer/` 下的 React 组件、样式、工具函数可复制到本工程 `src/`，按需改为使用 `@tauri-apps/api` 替代 `window.oneThought` 的 IPC。
- **数据格式**：thought 的 JSON 结构、配置结构可保持一致，便于共用或后续同步。
- **图标**：可从 `../build/icon.png`、`../build/icon.ico` 复制到 `src-tauri/icons/`，并在 `tauri.conf.json` 的 `bundle.icon` 中配置多尺寸/多平台图标。

### 需在 Rust 侧实现

- **数据存储**：用 Rust 读写本地文件（如 JSON 或 SQLite），通过 Tauri Command 暴露给前端。
- **托盘与快捷键**：Tauri 的 [Tray](https://v2.tauri.app/plugin/tray/)、[Global Shortcut](https://v2.tauri.app/plugin/global-shortcut/) 或系统 API。
- **多窗口**：主窗口 + 快捷记录小窗，用 Tauri 的 [Window](https://v2.tauri.app/api/js/window/) 与 Rust 创建/显示窗口。
- **LLM 调用**：在 Rust 中发 HTTP 请求，或通过 Tauri Command 调用前端配置的 API。

### 参考

- [Tauri 2 文档](https://v2.tauri.app/)
- [Tauri Commands](https://v2.tauri.app/develop/commands/)
- [前端调用 Rust](https://v2.tauri.app/develop/invoke/)

## 目录结构

```text
one_thought_tauri/
├── docs/                # 开发笔记与问题记录
├── src/                 # React 前端（Vite）
├── src-tauri/           # Tauri 2 后端（Rust）
│   ├── src/main.rs
│   ├── capabilities/    # 权限配置
│   └── icons/
├── package.json
├── vite.config.ts
└── README.md
```

## 图标

当前使用占位图 `src-tauri/icons/icon.png`。正式打包建议：

- 在上级项目执行 `npm run build:icon` 生成 `../build/icon.ico`、`../build/icon.png`
- 复制到 `src-tauri/icons/` 并更新 `tauri.conf.json` 的 `bundle.icon` 列表（含 32x32、128x128、ico、icns 等）
