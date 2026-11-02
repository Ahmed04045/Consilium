# Consilium 3.1.0-beta.1 — whiteboard preview

- Draw, circle and highlight directly on calendars and network canvases.
- Pen, highlight blocks, eraser, custom colors, width controls, and drawing-specific undo/redo.
- Network drawings follow pan and zoom without changing executable workflow revisions.
- Calendar drawings stay separate by calendar, view and period.
- Autosave, unsaved-draft recovery, and drawings in portable projects and backups.

This unsigned test build preserves the existing app identity and vault. Drawings are currently desktop-only and are not included in AI context. See [the drawing guide](whiteboard.md). The published stable release remains 3.0.0.

# Consilium 3.0.0 — first stable release

- A Windows workspace for calendars, documents, conversations and visual AI workflows.
- Independent tabs, customizable Home, calendar labels, recurring tasks, goal spans and checklist steps.
- Local models, Gemini and OpenRouter with named credentials, scoped context and reviewed AI changes.
- Visual workflow editing, reviewed execution, file/document/calendar operations, approvals, run history and the consi terminal runner.
- Optional calendar synchronization with the phone companion at https://nsl-eight.vercel.app/consilium/phone. Transfers are reviewed and manual.
- Consolidated settings, custom appearance controls, backups and portable project files.

This release uses the existing Consilium Next app identity and data folder. The Windows installer is unsigned. Updates are installed manually.

The owner completed normal-use and phone testing and approved this stable release. Automated checks and packaging evidence are recorded in release-status.md.

## Development history

# Consilium Next — 3.0.0-alpha.14

- Combined sparse settings pages into Profile & context, Files & backups, and Help & about. Settings search now recognizes related terms such as phone sync and keyboard shortcuts.
- Refined headings, instructions, release-note formatting, save feedback and spacing. Context drafts remain available while switching settings sections.
- Added an explicit account connection check, clearer loading state and protection against incomplete or changed-account refresh responses.
- Interface density and completed-task defaults now affect the workspace and new calendar views.
- Context saves check the revision so another window’s edits cannot be silently replaced.

## Previous sync update (alpha.13)

- Removed the default icon from the empty destination picker.
- Account sign-in now rejects incomplete authentication responses and reports invalid credentials; account creation clearly prompts for email confirmation.
- Settings remains reachable in long workspaces, and opening it only waits for the active document editor.
- Optional account-based calendar sync under Settings → Account, with explicit upload/download review.
- Added a mobile browser companion for viewing calendars and editing daily tasks. HTTPS hosting is required.
- Sync uses confirmed accounts, revision checks, bounded payloads, per-account quotas and backups before desktop downloads.
- Documents, conversations, networks, folders and model credentials are excluded from this first sync version.
- All-day tasks now show their completed state in the calendar timeline.

## Previous navigation update (alpha.12)

- Back controls align consistently in the title bar, calendar toolbar and Create dialog.
- Create-step Back sits beside the heading. Settings keeps Back to app visible while scrolling.
- Title-bar Back, View > Back and Alt+Left return from Settings to the app without changing the underlying workspace.

## Previous assistant update (alpha.11)

- Compact chat composer with an attachment/mode menu, model picker, and icon-only Send and Stop.
- Destination picker shows icons and names, with creation offered when no destinations exist.
- Conversations stay within one Assistant workspace tab; new chats are saved only on first send.
- Failed messages remain visible across restarts and can be resent after changing models.
- Plan proposals use a compact review card. Search heading spacing is corrected.

## Previous workspace update (alpha.10)

- Conversation history remains visible when selecting a chat; removed the duplicate recent-conversations group from workspace navigation.
- Calendar save/export actions now use a three-dot menu; removed the local-draft banner. Transient menus close when clicking outside or pressing Escape.
- Workspace items offer right-click and three-dot Open/Delete actions, with revision-checked deletion.
- Networks show bound input and expected output files in the right inspector, with local text/JSON/Markdown previews.
- New projects save as .consi, with .consilium compatibility retained.
- Includes a synthetic four-minute recording demo kit.

## Previous Settings update (alpha.9)

- Settings now opens as a dedicated screen with its own sidebar and Back to app. Workspace tabs and settings drafts remain intact.
- Custom background colors adapt surfaces and text for light or dark colors.
- Tab close controls appear on hover and keyboard focus without shifting tab labels.
- Added Edit, View and Help menus, text editing actions, tab navigation, zoom, full screen and local help pages. Wordcraft retains its own editing toolbar and shortcuts.

## Previous design update (alpha.8)

- Tabs now retain readable widths and automatically scroll the selected workspace into view instead of compressing into one another.
- The assistant composer stays bounded; mode selection is removed in favor of intent inferred from the request and destination. Replies include an optional short title suggestion.
- Task and label colors accept custom colors and choose readable text contrast. Home cards can be dragged with visible handles and resized in Customize.
- Network save/export/validate actions sit in the three-dot menu. Task folders can be chosen in the task view with a clearer explanation of how the local link works. The default calendar view opens on today.
- Removed the duplicate Settings shortcut and the stray disclosure arrow beside File. Typography and hover/focus feedback use a more consistent scale.

## Previous context and Home update (alpha.7)

- Home now prioritizes recent work, with clearer workspace sections and collapsible navigation groups for calendars, networks, documents and conversations.
- Navigation highlights the active page and remembers collapsed groups; Settings stays within reach.
- Assistant requests use estimated token budgets including instructions, schemas, output capacity and a safety margin.
- Repairs omit repeated history and attachment content while preserving the complete failed candidate and validation errors. Oversized repairs explain the original failure without changing existing work.

Token counts are estimates, not provider tokenizer measurements. This remains an unsigned preview.

## Previous conversation update (alpha.6)

- Starting a conversation keeps the current tab, submitted prompt and waiting state visible until the reply arrives.
- Failed replies keep the prompt available for retry in the same conversation; duplicate submissions are blocked.
- Opening a saved conversation reuses its existing tab, while starting another chat gets a separate draft.

## Previous authoring update (alpha.5)

- File attachments with separate local workflow-input and model-content sharing controls.
- Staged network authoring, with backend-enforced single-node implementation and repair.
- Typed resource setup and separate structural, resource and sample-test readiness.
- Reviewed sample execution with exact expected-output comparison and approval pauses, including testing proposed revisions before acceptance.
- Revised assistant instructions against invented inputs, placeholder success and unsupported claims of validation.

See [authoring and test guide](network-authoring.md). This remains an unsigned preview; tests with a local model fixture do not certify cloud-model quality.

## Previous automation update (alpha.4)

- Goal/progress context nodes include recurring completion evidence and optional bounded document excerpts.
- Reviewed repeating runs, with optional calendar rules for creating/updating upcoming tasks and archiving completed work.
- Planner, network-read and network-proposal nodes support reviewable workflow adaptation without changing an active run.
- Optional local program add-ons with source review, schema validation and installed runtime selection.
- Included examples: Node.js regression with a held-out evaluation report, and Godot platform-scene generation.
- Archive visibility controls and CLI `tick` for one due approved automation.

Scheduled runs require the desktop app to remain open or an explicit CLI tick. This is still an unsigned preview. Android handoff, ESP32/PLC adapters and additional Craft applications are not included.

## Previous project files update (alpha.3)

- Native file/folder pickers directly in node properties, including script inputs and file/DOCX output destinations.
- Calendar and network Save / Save as with visible locations and protection against overwriting external edits.
- Portable `.consilium` files and folder exports, with or without selected input content.
- Transactional project imports with new identities, restored inputs, preserved calendar exceptions and no automatic execution.
- Local network draft recovery and clear documentation of vault versus project storage.

## Previous usability update (alpha.2)
- Grouped node folders with icons, drag-to-place, larger connection pins and descriptions.
- Icon nodes for agents, files, calendars and logic; process blocks expose simple properties inline.
- Readable property controls, a program editor and linked program files; JSON remains available under Advanced.
- Built-in field selection and text formatting, with output connections to files, Wordcraft documents and reviewed calendar changes.
- Network conversations automatically use the network assistant; stronger graph proposal instructions and clean-canvas refresh after acceptance.

## Previous foundation (alpha.1)

Consilium now opens into a customizable Home workspace, with independent tabs for calendars, tasks, Wordcraft documents, conversations and Neural networks.

- Calendar-owned and explicitly shared labels, recurring series, goal spans, checklist steps and dated child tasks.
- Named model profiles and scoped conversations with reviewable, revision-checked AI changes.
- A visual workflow editor with search, grouping, typed connections, validation and a persistent run console.
- Local agents, native processes, file inputs/outputs, document creation/export and reviewed calendar proposals, shared between desktop and the bundled CLI.
- Copy-only preview migration, isolated Next data/credentials, resumable execution and protection against repeating completed writes.

This is an **unsigned development preview**, not a stable release. Advanced schemas and loop bodies still use JSON. Live collaboration, an always-on scheduling service and optional Craft applications are deferred. The original Consilium preview remains separate.

See [the guide](next-guide.md) and [verification status](next-implementation.md) before using workflows with important data. Native scripts execute with your user permissions after run review; they are not sandboxed.
