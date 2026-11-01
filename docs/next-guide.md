# Consilium Next guide

Stable release: **3.0.0**. See release-status.md for current verification; dated development notes below are historical.

## Workspace

Home is the starting tab. Create a calendar or network, pin existing objects, and use Customize to reorder, hide or resize reference widgets. Widgets do not duplicate records, start workflows or load document editors. Search in the title bar, or open the independent Search tab. Ctrl+K focuses search; Ctrl+N opens Create; Ctrl+P opens Assistant. Tabs retain their own selected items and drafts. Saved document editors unload when inactive.

## Calendars and labels

Create always shows the destination. A label belongs to one calendar unless explicitly shared Across all calendars. Same-named labels remain independent. Renaming preserves identity. Unsharing copies its document, conversation history and folder reference into each calendar using it; tasks keep their calendars.

Tasks can be timed, flexible for a day, or nonblocking goal spans. Goal progress is entered independently from step completion. Child tasks have independent schedules. A timed task has explicit start/end local dates and times. The IANA timezone stays with the task. Ambiguous/nonexistent daylight-saving times are flagged for resolution.

Daily, weekly, weekday, monthly and yearly series expand only into requested windows. Invalid monthly dates are skipped. Edit one occurrence, this and following, or the entire series. Completion, document overrides and exceptions stay specific to their occurrences. Goal spans appear above hourly slots; timed children occupy the slots.

Click a task for its workspace, main document, label document, conversations, child tasks and folder link. Hover or keyboard-focus a task for its completion button. Wordcraft documents have independent tabs and revisions. Conflicting drafts remain available to export or save as a separate document; closing waits for a successful save.

## Assistant

Create a named model profile in Settings. Select a provider, exact model ID, context budget and named credential. Different threads and agent nodes can use different profiles without changing one another. The UI displays the receiving provider/model beside Send.

A thread has a fixed calendar, label, task or network destination. Start another thread to change destination. Schedule chat discusses the selected scope. Schedule planning proposes complete, revision-checked task/label/document changes. Network creation proposes validated graph revisions. Nothing applies until its before/after review is accepted.

The full history remains local. Each request uses the selected scope, current preferences, relevant records, recent turns and a bounded derived history with source IDs. Older summaries are not confirmed personal facts. Other calendars and linked folder contents are not added automatically. Context inspection is optional. Malformed output gets one repair attempt; errors preserve existing work and the composer draft.

## Networks

Drag nodes from the grouped Node library onto the canvas. Clicking a library item shows its explanation; Place in canvas centre is the keyboard alternative. Drag an icon or process block to move it. Drag a right output pin to another node's left input pin. Conditions have separate Yes and No outputs. The inspector provides model, file, calendar, document and process controls. JSON contracts, nested loop definitions, resource IDs and keyboard connection controls live under Advanced. Save, Validate, then Review & run.

Simple Process operations keep selected fields or format text using placeholders such as `{{title}}` and `{{input}}`; these need no installed runtime. Their properties also appear inside the process block. For code, select Run a program, an installed runtime and Python or JavaScript. Write source in the editor or select a read-only program file binding. JSON arrives on stdin and must be printed to stdout. Review captures linked program source; changing that file invalidates the previous run approval. Execution uses the reviewed copy. Program imports and external dependencies still need to be available to the configured runtime.

A process can transform a read file and send its result to Write file. To edit a calendar, return `{"changes":[...]}` with revision-checked Change records and connect Propose calendar changes; the user accepts the resulting proposal. A text result can connect directly to Write document, while structured headings/lists/tables use a blocks array. Selecting an existing document captures its revision, so newer edits are protected from overwrite.

Network assistant conversations automatically use Build & discuss network. A request to change the graph should produce a proposal, while questions can receive a conversational answer. Accepted proposals refresh a clean open canvas; unsaved graph edits are preserved with a load-new-revision choice. Real-model output remains subject to validation and may need retry.

Create local bindings in Settings for input files, folders, installed runtimes and writable output files. Bindings have logical IDs; paths stay on the current device. Imported graphs need their logical profile/resource references rebound through the inspector. Imports never start automatically.

Supported nodes: input/output, agent, process, file/folder read, file write, calendar read/proposal, document read/write/DOCX export, condition, parallel/join, bounded loop, JSON validation and human approval. Scripts receive JSON on stdin and must produce one JSON value on stdout. Executables and arguments are separate values; model output is never interpolated into a shell command. The process environment is deliberately limited and excludes provider credentials.

Agent prompts and output schemas are explicit. Structured document writes accept heading, paragraph, list and table blocks; an adapter constructs real Wordcraft documents. Calendar writes produce a proposal that needs a separate review. Ordinary connections are acyclic. Loops have an explicit body, stop condition and maximum; place human approval outside loop bodies.

Review displays graph revision, scripts, model destinations, bound resources, writes and limits. Defaults are two parallel nodes, five loop iterations, twenty model requests including retries/repairs, and thirty minutes per run. Agent calls time out after 120 seconds; scripts default to five minutes. Native scripts are trusted code with the user's Windows permissions, not isolated code.

Run states, outputs, nested loop steps and events persist. Cancellation stops ordinary child processes. Interrupted or failed steps require explicit retry review; completed nested writes are reused. A crash can leave a side effect uncertain, so retry only after inspecting its result. Run limits and model-call usage survive resume. No automatic script/write retries occur.

## CLI

The installed terminal client is `cli/consilium.exe`. It uses the same Next vault (including a configured vault-location file), compiler, validation and runtime as the desktop. `--vault PATH` selects a different vault.

```powershell
consilium validate network.json
consilium compile network.json
consilium import portable.network.json
consilium review NETWORK_ID
consilium run approved-run.json
consilium runs
consilium inspect RUN_ID
consilium cancel RUN_ID
consilium inspect CHANGESET_ID --kind changeset
consilium accept CHANGESET_ID --approve
consilium export NETWORK_ID portable.network.json --include-scripts
```

A new approved run configuration contains `network_id`, saved `revision`, the exact `approval_digest` from review, and JSON `input`. Export it from the desktop review after checking its approval box, or construct it after reading CLI review output. Changing the graph, script, profile or binding invalidates that approval.

A resume configuration contains `run_id`, the saved review's `approval_digest`, `approved_nodes` and `retry_nodes` arrays. Pass it to `consilium run`. Exit code 2 means execution stopped incomplete, including a pending approval; code 1 reports an error. Noninteractive runs stop when human approval is required.

Export packages contain versioned graph definitions and explicitly included script source. They omit runtime input values, keys, absolute binding paths, conversation context and run logs. Authored source and prompts are included: review their text before sharing. Import creates a new network ID and never executes it.

## Import and recovery

Settings → Copy preview vault copies a consistent SQLite snapshot into an empty Next workspace. It never opens the preview database for writing. Backups are made before import; a transaction and completion marker prevent duplicate migration. Legacy labels are copied independently for each calendar using them. Original records, unused labels and orphan workspaces remain in the migration archive, exportable from Settings. Original Markdown files are copied into the import archive.

Credentials are not copied from the preview namespace. Add named keys and profiles in Next, then choose profiles for imported conversations. Existing preview installers, app data and credentials remain separate.

Create backup saves Markdown and a consistent SQLite snapshot. Export local records and migration archives contain personal information and should be kept private. Recovery is local; there is no account or hosted synchronization in this release.

## Current release boundary

This is a development preview. Both acceptance workflows use a deterministic local provider to verify routing, validation and persistence; that does not establish the quality of every real Gemini/OpenRouter/local model. Real-provider trials, longer normal use and clean-machine installer checks remain release gates. JSON schemas and nested loop bodies still use Advanced configuration. Live collaboration, an always-on scheduling service and other Craft applications are intentionally deferred. Reviewed interval schedules are available while the app remains open.

## Project files and save locations (alpha.3)

The local working vault defaults to `%LOCALAPPDATA%\Consilium Next\` (or the vault chosen in Settings). It is working storage, not a disposable cache: it contains records, documents, conversations and run history. Network canvas drafts also use WebView local recovery storage. Back up the vault before removing or moving it.

Calendar and Network toolbars now have **Save**, **Save as…**, and **Export…**. The location is shown beside these controls, with the full path in its tooltip. Save as lets you select a `.consilium` file or put `project.consilium` in a chosen folder. Subsequent Save updates that file; it detects external file edits and asks you to use Save as instead. Working drafts remain local until explicitly saved or exported. Opening another task or editing a calendar does not automatically rewrite a saved portable file: press Save to update the snapshot.

Export offers:

- **Folder with input files:** a new named folder containing `project.consilium` and an `assets` folder with copies of selected read-only input files/folders.
- **Folder without input content:** the same project structure without data inputs or Input node values. Linked program source is retained as part of the algorithm.
- **Single Consilium file:** a versioned, self-contained `.consilium` project. Choose whether to include input content. This is an open JSON-based format, not encryption or a lock preventing other tools from reading it.

All formats include the selected calendar/network and connected calendar tasks, labels, occurrence overrides and documents. They exclude credentials, model-profile records, runtime logs and local binding paths. They do not package every object in the app, unrelated conversations or arbitrary folder links. Authored scripts, prompts and documents may themselves contain private information; review before sharing. Included input content is limited to 64 MB and 2,000 entries. Junctions/symlinks are rejected rather than following them outside the selected folder.

Use **File → Open project…** or Settings → Open Consilium project to import a local copy from a `.consilium` file; for a folder export, select its `project.consilium`. Copies get new record identities and restored inputs under the local vault's `project-inputs` folder. Original files and projects are preserved. Select model profiles, installed runtimes and output destinations again; importing does not execute any node. Save the imported copy to a destination when ready. Legacy `.network.json` remains supported through the legacy import control and CLI.

In a file/folder node, **Browse file…** or **Browse folder…** opens the native Windows picker and creates a local binding automatically. **Choose output location…** opens Save As for Write file and Export document nodes. Linked program files and installed runtimes can be selected directly too. DOCX export nodes without a chosen destination retain the earlier local run-output behavior.

“Next” is the preview channel name. Its separate installer identity, vault and credential namespace protect the earlier Consilium preview; it is not a required permanent product name.

## Automation and real-world examples (alpha.4)

See [calendar automation and adapters](automation-and-adapters.md) for scheduled runs, bounded calendar changes, workflow revision proposals, optional program add-ons, and the ML/Godot examples.

## Attachments and tested network authoring (alpha.5)

See [network authoring and sample tests](network-authoring.md) for file sharing controls, single-node repair, guided resource setup, and testing proposed graph revisions before accepting them.

## Home and navigation (alpha.7)

Home surfaces recent work across calendars, networks, documents and conversations. Use Customize to rearrange reference widgets, or pin items for quicker access. Navigation groups can be collapsed with the mouse or keyboard and retain their state between launches. Opening another item preserves unrelated tabs and drafts. Settings remains at the foot of the sidebar.

## Settings and desktop menus (alpha.9)

Settings opens a separate screen with category navigation. Back to app restores the active workspace, including open tabs and unsaved settings drafts. Appearance offers a custom background and accent; text and surrounding surfaces adapt to the background. Selecting a palette clears the custom background.

Edit acts on the last focused text field; Wordcraft uses its own editing toolbar and shortcuts. View provides sidebar visibility, tab navigation, zoom and full screen. Help opens bundled guidance, shortcuts, release notes and About. Ctrl+, opens Settings, Ctrl+PageUp/PageDown changes tabs, Ctrl+W closes the active tab, Ctrl+0 restores zoom, and F11 toggles full screen.

Validation: nine browser checks passed, plus a final focused check of light/dark contrast and the 940px window layout. Production TypeScript/Vite compilation passed. This remains an unsigned preview; clean-machine installer verification is still outstanding.

## Recording demo (alpha.10)

The synthetic kit in examples/friends-demo includes a four-minute outline, calendar/network prompts, reading.json and expected-output.json. The expected output is only a comparison example; bind a new study-summary.json destination for the generated result.

Calendar save/export lives in its three-dot menu. Workspace sidebar items and conversations offer right-click or three-dot Open/Delete actions. Calendar deletion also removes its tasks and owned labels from active views; disk files are not removed by item deletion. Network Files shows explicit input/output bindings, and Preview reads a chosen UTF-8 file locally (maximum 1 MB) without sending it to a model.

New project files use .consi; existing .consilium files remain accepted. Eleven browser cases passed (the moved save action was rechecked after updating its selector), along with nine workspace service tests and six portable-project tests. No live provider request was made for the demo kit; rehearse it with your selected model before recording.
