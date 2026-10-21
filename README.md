# Consilium

A local Windows calendar and contextual assistant built with Tauri, Rust, React and SQLite.

Previous preview baseline: **Consilium 1.0 Preview**. Current working build: **2.0.0-alpha.4**, with native Gemini requests and a smaller provider schema on top of task document tabs, scoped conversations and folder links. See the [Gemini update](docs/v2-alpha4-release-notes.md), [v2 roadmap](docs/v2-roadmap.md), [document integration](docs/wordcraft-integration.md), and [v1 verification](docs/release-verification.md) for the earlier release's tested scope.

## Run or build

Use target/release/consilium-desktop.exe or target/release/bundle/nsis/Consilium_2.0.0-alpha.4_x64-setup.exe for the current development build. The earlier Consilium_1.0.0_x64-setup.exe is the v1 preview. Installers are unsigned. Existing 0.1/0.2 installers are older builds.

For development, install Node.js, Rust MSVC (1.95+), Visual Studio C++ build tools and WebView2. Run npm ci, npm --prefix apps/desktop run build:editor, then npm run tauri -- dev. Packaging builds the editor automatically. npm run dev is a read-only browser preview.

## Daily use

Create tasks with Ctrl+N or click a date/hour. Use Day/Week for minute-positioned scheduling. Labels can be colored and filtered. Type directly in the top search field; use sidebar Search for a full search tab. Settings stays open when navigating.

Click a task for its document, linked folder and AI chat in a retained tab. Hover briefly for details and Complete / Mark incomplete. Documents can be dedicated to the task or shared by its label. They save locally and can export to DOCX. Scoped chat is conversational; task changes still use Edit task or the calendar Assistant.

Settings supports local Ollama/OpenAI-compatible models, Gemini and OpenRouter. Name and select a saved API key, save provider/model settings, then test the connection. API keys stay in Windows Credential Manager. Assistant → Context & history stores your goals, time constraints and preferences locally. Describe the schedule naturally and send; inspect proposed tasks and date coverage before adding them. A cloud send shares the current context, request and relevant tasks with the selected provider. Context preview is optional; historical versions stay local.

Calendars start empty. No notes/resources/video interface, telemetry or cloud sync setup appears. The vault lives under %LOCALAPPDATA%\Consilium. SQLite stores calendars, labels and context history; backups include these records. Supabase/LAN/phone access is not enabled in this release.

## Verification

Run cargo test --workspace --exclude consilium --locked, npm test, npm run build and npm run tauri -- build. From apps/desktop run node tests/calendar-smoke.mjs for the isolated Windows smoke test. Tests use synthetic data and simulated providers.

See [release status](docs/release-status.md), [validation](docs/validation.md), [AI setup](docs/cloud-and-sync.md), and the [Android companion prompt](docs/android-companion-prompt.md). The interface uses locally bundled Google Sans; Wordcraft also includes licensed fonts for editable document typography. User-provided PNG logos are retained in apps/desktop/public; native assets are generated under src-tauri/icons.
