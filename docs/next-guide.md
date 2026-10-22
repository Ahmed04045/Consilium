# Consilium Next guide

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

Add nodes from the palette, connect handles or use Connect with keyboard, then configure the inspector. Search locates existing nodes. Shift-select nodes and assign a group to move them together. Configuration is JSON in this alpha, with profile selectors and copyable resource references. Save, Validate, then Review & run.

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

This is a development preview. Both acceptance workflows use a deterministic local provider to verify routing, validation and persistence; that does not establish the quality of every real Gemini/OpenRouter/local model. Real-provider trials, longer normal use and clean-machine installer checks remain release gates. Workflow setup still exposes configuration JSON. Live collaboration, scheduled triggers and other Craft add-ons are intentionally deferred.
