# Consilium Next — 3.0.0-alpha.4

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
