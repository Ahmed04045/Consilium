# Consilium Next implementation and verification

Current release: **3.0.0 stable**, approved by the owner on 2 November 2026. Entries below preserve the development history and the limitations recorded at the time. See `release-status.md` for current status.

Updated 2026-10-27. Version **3.0.0-alpha.8**, unsigned development preview.

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

### Interface refresh (alpha.8)

- Production TypeScript/Vite build and Rust application compilation passed.
- Packaged the unsigned Windows x64 NSIS preview. SHA-256 is recorded in `next-installer.sha256`.
- Acceptance and browser test suites were not run for this interface pass.

### Context budgets and Home/navigation (alpha.7)

- 66 Rust tests passed across adapters and application; the explicit Windows credential integration test remains ignored in this run.
- Eight browser tests passed, including recent-work ordering, active navigation, persisted keyboard collapse, pins and horizontal overflow checks. Production TypeScript/Vite build passed.
- Packaged Windows acceptance passed with 21 synthetic model requests: a large prompt that exceeded the previous byte-based budget received one successful focused repair; a genuinely oversized request sent no provider traffic. Existing conversation, learning/code-data, ML and Godot desktop/CLI checks passed.
- Built the unsigned alpha.7 NSIS installer and recorded its SHA-256 in `next-installer.sha256`. This does not replace clean-machine installation or real-provider quality verification.

### Alpha.6 conversation continuity

- New-chat creation now binds the saved thread to the existing tab identity rather than opening a second empty view. Prompt, waiting/cancel state and inline failure state remain with that view. Duplicate submission is blocked and failed prompts remain in the composer.
- Seven browser regressions and the production TypeScript/Vite build passed. Packaged Windows native acceptance verifies a delayed first response without adding a tab, a duplicate-submit guard, malformed-response repair failure followed by retry in the same thread, a separate new draft, and reopening through Recent conversations without duplicating the existing tab. Existing learning/code-data/ML/Godot desktop and CLI workflows also passed against synthetic models.
- This is a UI continuity fix. It does not add crash-resumable provider requests or certify real-provider model quality. The installer remains an unsigned preview.

### Alpha.5 network authoring

- 58 Rust tests verified across application, workflow/runtime and both CLI entry points (57 in the combined run plus the new approval/stale-graph test, followed by the three readiness regressions). They cover explicit attachment sharing, snapshot tampering, wrong resource types, weak-contract warnings, independent sample comparison, approval pause/resume and invalidated approval after a graph edit.
- Seven Next browser tests and the production TypeScript/Vite build passed. The standalone `consi` executable passed pack/extract/import, twelve expected simulation results, approval pause/resume and Wordcraft persistence.
- Final Windows native acceptance passed against the packaged executable with its frontend asset hash checked against the production build. An isolated vault and local model fixture verified attachment consent/receipts, wrong-node rejection with one repair, preserved unrelated nodes/edges, actual-versus-expected output, and the visible attachment-preview/sample-test flow. Existing learning, code/data, ML and Godot workflows passed through desktop and CLI. The UI test substitutes only the native file-picker response with a synthetic file; storage, model routing and execution use real Rust IPC.
- Single-node authoring merges only the selected node under a revision check. Invalid model output gets one repair attempt; rejected repair preserves the saved network. Both assistant proposals and run-generated network revisions offer reviewed sample tests before acceptance.
- The assistant prompt is versioned at `prompts/workspace-assistant.txt`. It requires evidence, exact resource IDs and actual implementation, but does not certify model quality. File-content sharing defaults off and is cleared when the selected profile/provider/model/endpoint changes.
- External input contents are not fingerprinted in the general readiness digest. Retest after external file changes. Attachment snapshots are separately digest-checked. Tests execute real code and approved side effects; they are not sandboxed simulations.
- [Authoring and test instructions](network-authoring.md). Real Gemini/OpenRouter quality and clean-machine installation remain unverified; retain preview status.

### Alpha.4 automation and adapters

- 50 application/compiler/runtime tests passed in the final combined suite. Coverage includes recorded recurring progress, archive preservation, stale proposals, rejected deletion/fabricated progress/excess workload, aggregate per-run change limits, once-per-slot execution, changed-graph approval invalidation, dead scheduler recovery, source review and disabled add-on imports.
- Seven Next browser tests passed, including new context, planner and add-on property controls. Production TypeScript/Vite build passed.
- Native acceptance passed on Windows with an isolated vault and synthetic model responses. Existing learning and code/data workflows passed through desktop and CLI. The new Node regression example returned slope 2, intercept 1 and held-out MAE 0. The installed Godot 4.7.2 console generated an eight-platform scene and Wordcraft report. Both add-ons passed through desktop and CLI.
- A network-change node produced a pending revision; the saved target remained unchanged until acceptance. The producing run retained its original graph snapshot. Godot scene tests compare structure because engine-generated node IDs differ between runs.
- Calendar automation is polled while the app is open, or with explicit CLI `tick`; this is not an always-on Windows service. Real-provider planning quality, long-running daily automation and clean-machine installation remain unverified.
- [Usage, trust boundaries and next integrations](automation-and-adapters.md).

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
- No cloud account, live collaboration, always-on scheduler service or extra Craft applications. Optional ML example performs local regression; it is not a general training platform.
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
