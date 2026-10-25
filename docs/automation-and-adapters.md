# Calendar automation and local adapters (alpha.4)

## Calendar-aware workflows

Add **Goal & progress context**, choose one calendar and its past/future window, and connect its JSON output to an agent. It includes task revisions, goal targets, recorded progress and expanded occurrences with their completion overrides. It does not assume that a passed date or a revision step means more words were learned. Deleted tasks are excluded; archived history is retained. Preferences and document excerpts require explicit node options. Folder contents are never implicitly included.

Agent and Planner nodes can also inject this context directly. Context is bounded to 200 tasks, 500 occurrences and 96 KB; optional documents are at most five 1,000-character excerpts. The model profile adds a conservative request budget. Oversized context asks you to narrow the window rather than silently dropping essential records.

Use a Calendar change node for task proposals. In manual runs, review and accept the proposal as before. To schedule the graph, open Run review, inspect its scripts, resources and model destinations, then select the review checkbox. Configure the repeating interval under Automation and enable it. The first run is one interval later. Intervals measure elapsed minutes (not a fixed local wall-clock time across daylight-saving changes).

The desktop checks for due work every 15 seconds while open. Missed slots coalesce into one run; they are not replayed in a burst. The CLI `consilium [--vault PATH] tick` processes one due, previously approved schedule and exits. It does not install a Windows service. Pause stops future runs; use run cancellation to stop an active run.

Optional automatic calendar rules specify one calendar, allowed operations, a date horizon, maximum changed tasks and maximum daily timed minutes. They can create unfinished tasks, update unfinished tasks, or archive otherwise unchanged completed tasks. They cannot delete history, invent completion/progress, alter completed checklist steps or edit another calendar. Recurrence requires an end date within the approved horizon. Goal spans do not reserve every hour. Changes outside these rules remain proposals for review. Revision checks still apply transactionally.

Archived tasks disappear from the default calendar; **Show archived** restores visibility. Archive is reversible. Completing individual occurrences does not mark their entire repeating series complete.

A changed graph, model profile, program, add-on or reviewed binding requires new approval. Interrupted or failed runs pause the schedule for inspection. Uncertain side effects are not automatically replayed. Human approval nodes still pause execution.

## Reviewable adaptation

Use **Read network** to supply a saved graph to a Planner. Connect the resulting `{ "network": ... }` object to **Propose network changes**, bound to the intended target. The target identity is enforced and the new graph must compile. The result is a revision-checked ChangeSet: inspect and accept it to update the saved graph. The active run keeps its immutable snapshot. An accepted graph revision needs fresh schedule approval.

This is assisted adaptation, not unrestricted self-modifying code. Agents cannot add permissions or execute their proposed graph during the same run. Planner prompts and nested revision-loop bodies remain advanced authoring tasks.

## Try the ML and Godot examples

1. Open Settings → Program add-ons. Review either bundled example, inspect its source/contracts and confirm installation. Samples are not installed automatically.
2. Select **Create example network** on the installed add-on.
3. Select its Program add-on node and browse to the installed runtime: `node.exe` for regression or Godot's Windows console executable for scene generation.
4. Review the graph and run it. Open its report document and inspect the Output node.

The regression example fits a one-dimensional linear model to numeric `{x,y}` rows, reserving the last 30% for evaluation. It returns slope, intercept, predictions, held-out mean absolute error and a Wordcraft report. Its default synthetic dataset is exactly `y = 2x + 1`. This is a reproducible ML example, not a general training platform; there is no package installation or model download.

The Godot example generates a real `.tscn` scene with a configurable number of platforms. It runs headlessly in its own run directory and returns `scene_text` plus a report. To save a scene to your project, connect a Keep fields/Format text process to Write file, choose the destination and review it before running. For Format text use `{{scene_text}}`. The generated scene also remains in the local run directory. Godot uses its [documented command-line interface](https://docs.godotengine.org/en/latest/tutorials/editor/command_line_tutorial.html).

Both examples use the same desktop/CLI execution engine. A CLI run requires the usual reviewed run configuration and approval digest. No cloud model is needed for these deterministic samples.

## Add-on contract and trust

The version-1 `.consilium-addon.json` manifest contains an ID, name, description, runtime (`node`, `python` or `godot`), source, JSON input/output schemas and declared capabilities. See `examples/addons/` for complete manifests. Programs read JSON from stdin; Node/Python return JSON on stdout. Godot returns one `CONSILIUM_RESULT:` line containing JSON, allowing its normal engine banner.

Installation validates the manifest and requires an unchanged source digest after review; it does not execute the program. Execution validates input and output contracts and uses an explicitly selected executable. These are trusted native programs with your Windows permissions. Capability labels describe behavior; they are not an isolation boundary. Windows Job Objects provide process cancellation, not a sandbox. Provider credentials are not injected into their environments.

Disable removes availability for new runs without deleting reports. `.consilium` project packages carry referenced add-on manifests and remap their identities; imported add-ons start disabled and must be reviewed/enabled. Local executable paths, credentials and schedules are not exported. Inspect authored source and prompts before sharing.

## Subsequent integrations

The next adapters can use this contract, but are not implemented or claimed compatible yet:

- Android/department handoff: paired authenticated devices, versioned payloads, destination workflow approval, replay protection and explicit data selection.
- ESP32: choose a concrete USB serial or authenticated Wi-Fi protocol, then validate using a real board.
- PLCs: begin with read-only simulator telemetry and a specific vendor/protocol; actuator writes require separate commissioning and interlocks.
- Unity/Unreal: dedicated project-aware adapters and engine tests rather than assuming the Godot contract is sufficient.
- Rich interactive approval tools, document edit feedback, Motioncraft and live cost estimation require additional UI and adapter work.

The local add-on system establishes an extension point; it does not make arbitrary hardware, remote devices or industrial systems compatible automatically.
