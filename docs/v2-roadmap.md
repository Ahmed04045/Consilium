# Consilium v2 — staged development

## Milestone 1: reliability and workspace controls

Implemented in 2.0.0-alpha.1:

- One connection-test feedback area beside Save. Unsaved model settings must be saved before testing; a new operation clears old feedback. A 503 is described as temporary provider unavailability, not evidence of an invalid key.
- Buffered model requests retry explicit HTTP 502/503/504 responses twice with bounded delays. A 429 retries only with a short numeric Retry-After. Authentication and malformed-request failures do not retry. Cancellation drops the retry wait. This cannot prevent Gemini outages; failed requests preserve accepted work.
- Label management uses a modal with color swatches and an existing-label list.
- Assistant has a retained full-width tab. This milestone still proposes new tasks; it does not yet implement conversational threads or modify/delete existing tasks through AI.
- Saved app palette/action accent, month-row minimum height, row/column spacing and hourly scale. Task time positions and durations scale together. These preferences are local to this device.

Verification: 11 browser regressions passed, including stale connection messages, label dialog keyboard dismissal, retained Assistant drafts, persistent customization and exact task positions after scaling. Adapter suite: 11 passed, one explicit Windows integration test excluded from this run (passed during v1 verification). Retry tests use a synthetic local HTTP server; no real API keys or live provider charges.

The Windows alpha executable and NSIS installer built successfully. The packaged smoke test passed onboarding, CRUD, persistence, colors, model identity, repair, failed repair, acceptance, cancellation, export, conflicts, backup and new window using an isolated vault and mock provider. SHA256 is recorded in v2-installer.sha256. No clean-machine installation test was performed.

## Milestone 2: documents for tasks and labels

Implemented in 2.0.0-alpha.2: task clicks open retained workspace tabs with Wordcraft documents, folder links and task/label chat. Delayed hover previews offer Complete / Mark incomplete buttons. Edit task retains scheduling controls.

The implementation stores authoritative rich JSON in revisioned SQLite records, with an atomic previous-version recovery copy and derived plain text. This keeps documents in existing consistent database backups. Documents can export to DOCX. Task scopes use task IDs; shared label scopes currently use the existing exact label names. Stable label IDs and migration are required before introducing label renaming.

Wordcraft 0.8.0 is bundled as WebAssembly at commit e6c5a701ddff5be16e266028168c70658aae39d9, with a small host in integrations/wordcraft. The upstream crates remain unmodified. See [integration details and limits](wordcraft-integration.md).

The Services bridge connects file imports, exports and dirty-state notifications. Consilium owns revision checks and autosave, and the editor acknowledges only drafts matching persisted snapshots. Runtime assets are bundled, with Google Sans for editor controls and editable document typography.

Advanced document fidelity, clipboard, IME, accessibility, printing and GPU compatibility still need broader testing. Do not treat the upstream application's full feature list as certified here.

Licensing: upstream offers MIT OR Apache-2.0. When bundling, retain the selected license, copyright, NOTICE and applicable third-party attributions. Its ArtCraft name/logos have separate trademark terms and must not be reused as Consilium branding. Inspect bundled fonts, images and other assets separately. Source: https://github.com/storytold/wordcraft

## Milestone 3: conversations and reviewable task management

Alpha.2 provides locally persisted task/label conversations with bounded recent history and optional saved document excerpts. These chats are read-only; the remainder below is planned.

Persist Thread and Message records locally. Threads have a global, label or task scope; the sidebar contains New chat, label workspaces and recent conversations. Keep navigation context separate from the selected model. Switching providers must clearly show the new destination before sending.

The assistant can return a conversational answer, a clarification, or a structured proposed change set. Supported proposed operations: create, update, reschedule, complete and delete tasks. Every operation references known IDs and expected revisions. Rust validates dates, durations, labels, collisions, completed/locked work and scope. Render a before/after review, including deletions, before applying one transaction. A chat reply alone cannot mutate calendars. Invalid output gets one schema repair; failure preserves the conversation and existing tasks.

Context composition: current request + confirmed profile constraints + selected workspace summary + relevant tasks + recent turns + a small number of retrieved document excerpts. Reserve output capacity and a safety margin first. Summarize older turns with source message IDs, retain originals locally, and retrieve details when relevant. Never send every document or the full transcript on each turn. Keep derived summaries distinguishable from confirmed user facts. If essential constraints cannot fit, ask the user to narrow the request rather than silently dropping them. Show a compact context indicator and optional inspection, without making preview a required action.

Evaluation cases: casual discussion must not generate a plan; explicit planning must respect requested date coverage; moving one task must preserve unrelated tasks; ambiguous "move it" asks for clarification; stale approvals fail safely; injected document instructions cannot grant capabilities; cancellation preserves drafts and accepted work.

## Milestone 4: folders and navigation

Alpha.2 provides native folder selection, Explorer opening and unlinking for task/label workspaces. Automatic reading/indexing is not enabled. Remaining navigation and indexing work follows.

Assign a folder through a native picker to a task or label. A folder link is a local reference; it grants no automatic write, deletion or execution rights. Folder chats reuse the scoped thread model. Index only user-selected supported files, with size/type limits, exclusion rules and source hashes; skip credentials and hidden/system folders by default. Resolve canonical paths and prevent traversal outside the selected scope. Revoke access and remove derived chunks when unlinking. For cloud chat, show which excerpts are included before sending; never upload an entire directory automatically.

Calendar navigation adds a collapsible mini-calendar, Create, calendar visibility toggles and label filters. Assistant navigation adds label workspaces and recent chats. Contacts, shared schedules, public holiday subscriptions and booking pages are deferred until they have real data sources and a useful workflow; do not add nonfunctional sections.

## Release boundaries

This is a development alpha, not a completed v2 release. The 1.0 Preview installer is retained separately. The alpha uses the same local vault as v1, adding revisioned workspace records. Back up before moving between versions. Signing, clean-machine installation, live-provider quality, full accessibility and performance certification remain outstanding. Cloud synchronization and external folder indexing are not enabled.
