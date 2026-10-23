# Consilium Next

A local Windows workspace for calendars, documents, conversations and visual AI workflows. Built with Tauri 2, Rust, React, SQLite, React Flow and the bundled Wordcraft editor.

Current development release: **3.0.0-alpha.2 — unsigned preview**. Consilium Next has a separate application identity, vault and credential namespace. The previous daily-use preview is preserved at commit `258765e` on `preview/2.0-alpha.4`; this work is on `next-workspaces`.

## Start here

- [Next guide and CLI](docs/next-guide.md)
- [Implementation and verification](docs/next-implementation.md)
- [Release notes](docs/next-release-notes.md)
- [Wordcraft licensing and build details](docs/wordcraft-integration.md)

Build artifacts: `target/release/consilium-next.exe`, terminal client `target/release/consilium.exe`, and `target/release/bundle/nsis/Consilium Next_3.0.0-alpha.2_x64-setup.exe`. The installer includes the terminal client in its `cli` directory. It does not add it to PATH.

## Build and verify

Windows 11 x64, Node.js 24, Rust MSVC 1.95+, Visual Studio C++ build tools and WebView2 are required.

```powershell
npm ci
npm --prefix apps/desktop run build:editor
npm run tauri -- dev
```

```powershell
cargo fmt --all -- --check
cargo test --workspace --exclude consilium --locked
npm test
npm run tauri -- build
```

From `apps/desktop`, run `node tests/next-native.mjs` after packaging. This starts a separate temporary vault and local synthetic provider, runs both acceptance workflows through desktop and CLI, and checks actual Wordcraft editing and graph rendering. It does not use personal API keys or the preview vault.

Use Tauri's build command for packaged desktop binaries. A direct Cargo build requires `--features tauri/custom-protocol`; otherwise it uses the development server URL.

## Data and execution

Runtime data lives in `%LOCALAPPDATA%\Consilium Next`, outside this repository. Named API keys use Windows Credential Manager's `ConsiliumNext` namespace. Local models, Gemini and OpenRouter are supported through independently selected profiles. Cloud messages go only to the displayed provider after Send or an approved workflow run.

Networks are manually started after review. Native scripts run with the user's permissions; Windows Job Objects control ordinary child-process lifetime and are not a sandbox. Linking a folder does not upload its contents. Exports omit credentials, bindings, run history and literal run inputs; inspect authored scripts and prompts before sharing them.

No account, sync service, telemetry, automatic model download or always-on workflow scheduler is required. Live collaboration and optional Craft add-ons are later work. Keep this an unsigned preview until clean-machine installation and normal-use validation are complete.
