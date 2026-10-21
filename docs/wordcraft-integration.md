# Task workspaces in 2.0.0-alpha.2

Click a calendar task to open a retained tab. Its main document uses the actual Wordcraft editor, compiled to WebAssembly and bundled with Consilium. Details and AI chat live alongside the document. Returning to the calendar leaves the tab open. Hovering or focusing a task for 650 ms shows basic details and Complete / Mark incomplete buttons; Arrow Down moves keyboard focus into the preview and Escape dismisses it.

## Documents and folders

- Choose a task document or its shared label document. Documents, conversations and folder links have separate revisions. Different tasks with the same label share the label workspace.
- Rich Wordcraft JSON is authoritative in SQLite, with a plain-text derivative for explicitly shared chat excerpts. Saving uses a revision check and an atomic transaction retaining the previous saved document. Existing SQLite backups include these records.
- Autosave only acknowledges a document after Rust persists it and the editor confirms that it still matches the current draft. Conflicts retain the draft and block tab/window closure. Export the draft before reloading the saved version.
- Export DOCX through Consilium's native save dialog. Wordcraft's file picker supports importing documents and pictures; opening another document replaces the current workspace document after confirmation. Imports, snapshots and exports have an 8 MB limit.
- Folder links use a native picker and can be opened in Explorer or unlinked. Linking does not read, index or upload files.
- Label scopes currently use exact label names, matching existing task storage. Renaming/moving labels needs a stable-ID migration before a rename feature is offered. Changing a task's label while a workspace is open fails safely rather than saving into the wrong label.

## Scoped conversations

Task and label chats are stored locally. A request contains the task, up to 3,000 characters of current personal context, and up to 12 recent messages fitting a conservative context budget. The full history is retained locally (up to 1,000 messages per scope), not sent on every request. Older-message retrieval and summaries are future work.

The document is excluded unless **Include saved document excerpt** is selected (up to 6,000 characters). Folder contents and paths are excluded. Cloud sends identify the selected Gemini/OpenRouter provider. Provider/settings, document and conversation revisions are checked; malformed answers receive one repair attempt, and failure does not modify accepted work.

These chats answer questions but cannot create, move or delete tasks. Use Edit task or the calendar Assistant for now. Reviewable AI change sets and global conversation history are the next milestone.

## Building and attribution

Pinned Wordcraft: [storytold/wordcraft](https://github.com/storytold/wordcraft), commit `e6c5a701ddff5be16e266028168c70658aae39d9` (0.8.0), MIT OR Apache-2.0. The small host is in `integrations/wordcraft`; upstream source is not modified. ArtCraft brand assets are not used as Consilium branding.

Run `npm ci`, then `npm --prefix apps/desktop run build:editor` before development. Packaging runs this step automatically. Rust 1.95+ with the MSVC toolchain, the WASM target, Node.js, Windows build tools and WebView2 are needed. The script installs pinned wasm-bindgen 0.2.129 if absent, builds the locked standalone crate, generates browser bindings and collects license texts from the resolved dependency graph.

The generated editor bundle is ignored by Git and rebuilt from source. Runtime works without downloading code. Upstream licenses, NOTICE, font licenses, hyphenation attribution and Rust dependency notices ship in `public/wordcraft/licenses`. Editor controls use Google Sans; document typography remains editable.

## Alpha boundaries

The embedded ribbon exposes upstream formatting capabilities, but the full Wordcraft feature set is not certified for Consilium. Advanced import fidelity, clipboard/IME, screen-reader behavior, printing, large documents, GPU compatibility and performance still need broader testing. Native printing, arbitrary filesystem tools and automatic folder indexing are not integrated. The editor is loaded only when opening a task, but each open task currently retains its editor instance.

This remains an unsigned development alpha sharing the existing local vault. Back up before switching builds. It has not been tested on a clean Windows machine.

## Verification — 2026-10-20

- Rust workspace suite: 37 passed, two deliberately ignored (the separately invoked Credential Manager integration test and performance benchmark). The workspace test additionally passes shared-label identity, rejected stale/wrong-scope saves, separate task scope and document backup restoration.
- Browser suite: 12 passed. Coverage includes delayed hover actions, completion reversal, retained task tabs, save/reopen behavior, folder-link display, and preservation of a conflicted draft when closing a tab is attempted. These browser tests substitute the editor frame to isolate host behavior.
- Packaged Windows/WebView2 smoke test: real Wordcraft canvas startup, insertion reaching SQLite, saved acknowledgement, tab retention, DOCX export/re-import round trip and persistence after page reload passed. Task/label storage is exercised separately in Rust.
- Native scoped chat: one strict repair succeeds; failed repair preserves the conversation and calendar revision; a further message sent through the actual composer persists. Tests verify explicit document sharing, default document exclusion and absence of linked folder paths from model requests.
- Existing native calendar checks still pass: onboarding, manual task creation, colors, embedding identity switching, proposal repair, failed repair, acceptance, cancellation, ICS export, revision conflicts, backup and additional native window creation.
- Production frontend, locked WASM editor and NSIS installer build successfully. Both Rust formatting checks pass. The inspected task-workspace screenshot is `docs/screenshots/task-workspace-native.png`.

Tests use isolated temporary vaults and synthetic local model responses, not the user's data or live API keys. The actual Windows Save/folder picker dialogs are not automated; native tests check generated DOCX bytes and persisted folder links. There is no claim of full upstream editor feature parity, live-model answer quality, or clean-machine certification. Installer SHA256 is in `v2-installer.sha256`.
