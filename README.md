# Consilium

A local Windows calendar and contextual assistant built with Tauri, Rust, React and SQLite.

## Run or build

Use target/release/consilium-desktop.exe or target/release/bundle/nsis/Consilium_1.0.0_x64-setup.exe. Installer is unsigned. Existing 0.1/0.2 installers are older builds.

For development, install Node.js, Rust MSVC, Visual Studio C++ build tools and WebView2. Run npm ci and npm run tauri -- dev. npm run dev is a read-only browser preview.

## Daily use

Create tasks with Ctrl+N or click a date/hour. Use Day/Week for minute-positioned scheduling. Labels can be colored and filtered. Type directly in the top search field; use sidebar Search for a full search tab. Settings stays open when navigating.

Settings supports local Ollama/OpenAI-compatible models, Gemini and OpenRouter. Name and select a saved API key, save provider/model settings, then test the connection. API keys stay in Windows Credential Manager. Assistant → Context & history stores your goals, time constraints and preferences locally. Describe the schedule naturally and send; inspect proposed tasks and date coverage before adding them. A cloud send shares the current context, request and relevant tasks with the selected provider. Context preview is optional; historical versions stay local.

Calendars start empty. No notes/resources/video interface, telemetry or cloud sync setup appears. The vault lives under %LOCALAPPDATA%\Consilium. SQLite stores calendars, labels and context history; backups include these records. Supabase/LAN/phone access is not enabled in this release.

## Verification

Run cargo test --workspace --exclude consilium --locked, npm test, npm run build and npm run tauri -- build. From apps/desktop run node tests/calendar-smoke.mjs for the isolated Windows smoke test. Tests use synthetic data and simulated providers.

See [release status](docs/release-status.md), [validation](docs/validation.md), [AI setup](docs/cloud-and-sync.md), and the [Android companion prompt](docs/android-companion-prompt.md). Fonts use one locally bundled Google Sans family with its OFL license. User-provided PNG logos are retained in apps/desktop/public; native assets are generated under src-tauri/icons.
