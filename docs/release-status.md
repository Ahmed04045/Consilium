# Consilium 1.0 Preview

This release keeps the calendar and assistant local by default. Windows installer is unsigned. Phone synchronization is not enabled.

## What changed

- Editable titlebar search with immediate results; sidebar Search still opens a full tab.
- Month calendar and hourly Day/Week views. Tasks support exact start/end times and finite daily/weekday/weekly/monthly repeats. Repeats are individual editable tasks, not an infinite recurring series. Month-end dates clamp to the last day. Overnight tasks must be split.
- Named API keys per provider, explicit selection, readback verification and input retention on failure. Existing keys appear as Existing key. Provider settings still need saving separately; connection testing uses saved settings.
- Local context editor under Assistant → Context & history. Current text and each saved revision are stored in SQLite. Successful requests and their proposals are available in local history. Old context versions are never automatically sent to models. Proposals are not recorded as completed work.
- Send automatically gathers a fresh context packet. Preview is optional. The button names the cloud destination and the panel describes the shared data. Requests include current context and compact calendar task details; no entire history dump.
- User request/context specifies availability, goals and desired budgets. The assistant no longer asks for numeric day/budget settings. The implementation bounds proposals to the 31 days beginning at the selected starting date and 64 tasks. A wider request must be narrowed. The previous 12-task cap is removed and proposed task/day coverage is visible before acceptance. Model quality and compliance with natural-language preferences still need user review.
- Labels with shared palette colors, filter toggles and editing. AI can suggest new label names/colors; acceptance adds them. Existing label colors take precedence. Empty calendars remain empty until the user creates or accepts tasks.
- Appearance settings: compact/comfortable, text size, week start, default view and completed-task visibility. Preferences stay on the device.
- Updated supplied transparent PNGs; native icon sizes regenerated and in-app mark enlarged.
- Removed Supabase setup from Settings. Existing experimental sync code/migration remains for a future account-based service, but no service or LAN listener is started.

## Local data

The existing SQLite records table stores calendar_workspace (including labels), personal_context (current text and saved revisions), calendar_messages (successful requests/proposals), and reviewable calendar_proposal records. Revision checks prevent stale overwrites. Existing backup functionality includes these records. Provider keys stay in Windows Credential Manager, outside calendar data. Context is plaintext local data; use operating-system disk encryption if required.

Active context is limited to 12,000 UTF-8 bytes, with at most 200 saved revisions. Excess content is rejected rather than silently removed. Request history remains local. No training, telemetry, automatic downloads or passive monitoring is added.

## Android companion

Use android-companion-prompt.md in Google AI Studio. It specifies an offline Android app, exact desktop record contracts, and staged synchronization. The current desktop does not expose a phone-accessible endpoint. The supplied Supabase migration is additive and has not been deployed to your project. Remote access, account setup and live cross-device testing are future work, not existing features.

## Verification and remaining checks

34 Rust tests pass, plus an explicitly run Windows Credential Manager test using isolated synthetic keys. The earlier 8 browser regressions pass. One optional search benchmark remains ignored. Tests cover context history/revisions, old-calendar migration defaults, labels, direct search, minute placement, API-key failure recovery, persistence, model-output repair, cancellation and embedding identity. See validation.md and release-verification.md for evidence and limitations. Live provider quality for these expanded prompts, physical-phone integration, clean-machine install, signing and performance measurements remain outstanding. This stays a preview by the owner's decision; no separate clean Windows environment is available.


Desktop icon polish: regenerated Windows icons from windows-icon-large.png, preserving the original logo and transparency while increasing visible height from approximately 76% to 96% of the icon canvas. In-app mark unchanged.
