# Consilium Next implementation and verification

Updated 2026-10-23. Version **3.0.0-alpha.3**, unsigned development preview.

Baseline: commit `258765e`, branch `preview/2.0-alpha.4`. Development branch: `next-workspaces`. The preview executable, installer, vault and credential namespace are preserved.

## Delivered

- [x] Separate Next application identifier, vault and Windows credential namespace; bundled desktop and terminal client.
- [x] Home, retained independent tabs, configurable reference widgets, direct search, lazy document editors and appearance settings.
- [x] Stable calendar-owned/shared labels, independent workspaces, transactional copy migration and recoverable unused/orphan records.
- [x] Timed/flexible tasks, nonblocking goal spans, progress, steps, children, lazy recurrence and occurrence/following/series edits.
- [x] Independent Wordcraft documents, conflict recovery and save checks before closing.
- [x] Scoped persisted conversations, named model profiles, bounded context, optional inspection and one repair attempt.
- [x] Revision-checked transactional ChangeSets and reviewed network proposals.
- [x] React Flow canvas, palette, search, inspector, grouping, undo/redo, keyboard connections and run console.
- [x] Shared compiler/runtime with explicit bounded loops, branches/joins, approval gates, durable nested steps and cross-process leases.
- [x] Native processes with explicit executable/arguments, limited environment, Windows Job Objects and cancellation.
- [x] File/folder, model, calendar-proposal and Wordcraft document/DOCX nodes.
- [x] CLI validate, compile, run/resume, runs, inspect, cancel, export, import and proposal acceptance.
- [x] Versioned portable graph packages, omitted runtime inputs/credentials/bindings/history, explicit script inclusion and stopped imports.
- [x] Learning and code/data acceptance workflows through desktop and CLI with synthetic model responses.

## Verification evidence

### Alpha.3 project files

- Five portable-project Rust tests cover input restoration, algorithm-only exports with program source, calendar occurrence/document identity, external-edit conflicts, traversal rejection and stopped imports. Application/workflow suites total 42 passing tests.
- Six Next browser checks cover existing editor behavior plus Save/Export formats, cancellation and accessible format controls.
- Windows file dialogs use the existing native `rfd` integration. Native acceptance additionally exercises explicit DOCX destinations, project write/status/read through IPC, and unchanged run counts after import.
- Project files are manually saved snapshots. Open imports a local copy; file associations/double-click opening and automatic folder synchronization are not implemented.

### Alpha.2 usability update

- Node library folders, icon nodes, drag placement, visible pins, movement, inline process fields and network-only assistant controls are covered by **5 passing Next browser tests**.
- The application/workflow suites pass **37 tests**, including simple process operations, missing-field failures, linked program source snapshots, changed-code approval invalidation and correction of legacy network thread modes.
- Readable property controls cover model instructions, files/folders, calendars, documents, program source and simple transformations. Full configuration, loop bodies and output schemas remain under Advanced.
- Native acceptance additionally checks linked JavaScript files through desktop and CLI, simple field selection/text formatting, plain-text Wordcraft output and the network assistant's effective mode and authoring instructions. Model responses are synthetic; live-provider proposal quality still needs normal use.

### Foundation verification (alpha.1)

- Rust: **69 passed**, **2 intentionally ignored** (optional real Windows Credential Manager roundtrip and historical 10,000-note performance baseline). Covers domain rules, Gemini schema adaptation, retries/cancellation, storage restoration, label migration, stale proposals, series splitting, loops, native Node execution and persistent model budgets.
- Browser: the original 12 preview regressions plus 4 Next workspace/editor tests pass. Includes label isolation, retained settings drafts, direct title-bar search, dialog overflow, Home keyboard resizing and graph measurement/search/grouping.
- Native acceptance: isolated temporary vault and local deterministic Ollama-compatible provider; no personal keys or data. Learning creates a Wordcraft study document, reviewed weekly span, recurring sessions and dated children. Code/data runs Node on synthetic JSON, validates and branches, interprets through an agent, and writes a report/artifact. Both workflows also run through the CLI while desktop remains open.
- Native checks include one repair followed by malformed-response failure with unchanged history, reviewable AI network creation, export/import without auto-execution, real Wordcraft editing and SQLite persistence, DOCX output and visible network canvas controls. Edits immediately before switching tabs or closing the window are saved.
- NSIS packaging succeeded and includes `cli/consilium.exe`. Installation, same-version upgrade and the complete native acceptance run from the installed copy passed in a dedicated test directory on the development machine. Upgrade preserved an unrelated marker file; silent uninstall removed the application and registration while preserving that file. This is **not** clean-machine verification. The installer digest is in [next-installer.sha256](next-installer.sha256).

## Release gates and deliberate boundaries

- Remain preview: clean Windows installation, broader real-model quality trials and several days of normal use are still outstanding.
- No cloud account, live collaboration, scheduled network triggers, extra Craft applications or model training.
- Native scripts are trusted code with the user's OS permissions. Job Objects manage ordinary child processes and do not isolate filesystem/network access.
- Profile credentials are not migrated from the old preview namespace. Re-enter named keys and select profiles for imported conversations.
- JSON is available under Advanced for custom contracts and nested loop bodies. Logical bindings must be assigned on each device.
- Run outputs/history and recovery archives remain plaintext local data. Authored scripts and prompts are intentionally included in graph exports; inspect them before sharing.

## Reproduction

```powershell
cargo fmt --all -- --check
cargo test --workspace --exclude consilium --locked
npm test
npm run tauri -- build
```

Then, from `apps/desktop`:

```powershell
node tests/next-native.mjs
```

Optional `CONSILIUM_NEXT_BINARY` and `CONSILIUM_NEXT_CLI` environment variables select an installed build for that test. The test still isolates its vault, WebView profile and model endpoint.

Defaults: two concurrent nodes, five loop iterations, twenty model requests including repair/transient retry attempts, thirty minutes per run, 120 seconds per model call and five minutes per native process. Completed nested loop steps are reused after explicitly reviewed retries. Model usage and elapsed time survive resume.
