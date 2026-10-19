# Build Consilium for Android — implementation prompt

Act as a senior Android engineer. Build a native Android companion for Consilium, an existing Windows Tauri/Rust calendar and contextual assistant. Produce an Android Studio project with a runnable debug APK build, tests and setup documentation. This is an implementation request, not a visual mockup. Do not assume a remote backend or desktop HTTP server already exists.

## Product

Use Kotlin, Jetpack Compose and Room. Dark neutral gray surfaces; one bundled font throughout (Google Sans only if the supplied OFL font and license are included; otherwise use one consistent bundled open font). Green is reserved for task creation and tasks. Use my supplied transparent PNG icon assets. No marketing slogans, demo events, ads or telemetry.

Home is a calendar with Month, Week and Day views. Day/Week views position tasks by their exact local start minute and duration, with separate all-day tasks and non-overlapping visual lanes for simultaneous events. Include task editing with title, date, start/end time, label, color, description and completion. Labels are user-editable, filterable and color-coded. Finite repeat creates individual task records; do not silently add incompatible recurrence fields.

Provide direct search, label/completion filters, context editor with revision history, proposal review, and customization (density, text size, week start and default view). Store all user content locally first. An assistant request uses the current user-authored context plus relevant calendar tasks, not the entire historical archive. Keep saved context versions and requests available locally. Model output must never directly overwrite accepted work.

## Existing desktop contract (implement exactly)

Desktop SQLite is authoritative; structured records are revisioned JSON. Do not copy an open SQLite database over the network. Calendar snapshot value:

```json
{
  "onboarded": true,
  "timezone": "Asia/Qatar",
  "labels": [{"name":"Learning","color":"green"}],
  "calendars": [{
    "id":"default", "name":"Calendar", "tasks":[{
      "id":"stable-uuid", "title":"English practice", "date":"2026-10-19",
      "time":"18:30", "minutes":40, "color":"green", "label":"Learning",
      "description":"Practice explaining an idea.", "completed":false
    }]
  }]
}
```

Missing labels defaults to []; missing task label defaults to "" for old desktop snapshots. Allowed colors: gray, blue, green, yellow, purple, red. Existing labels determine visual color; an AI can propose new labels/colors, which are accepted with the proposal. Dates are YYYY-MM-DD; time is HH:MM or an empty string for all-day tasks. A timed task must finish within its local day. Validate timezone and ambiguous/missing DST times, unique IDs, positive minutes <=1440, task title <=300 UTF-8 bytes, description <=12000 bytes, label <=80 bytes, <=30 calendars, <=100 distinct labels and <=20000 tasks per calendar. Do not invent extra fields when sending a snapshot to the current desktop backend: it rejects unknown fields. Preserve task IDs. Context/credentials are separate and excluded from calendar synchronization by default.

## Synchronization plan: implement offline first, no fake connected state

The desktop has no LAN service yet. Build an offline Android app and an abstract SyncTransport with a simulated transport test implementation first. Clearly label connectivity unavailable until a real transport is configured. Also provide a separate desktop-side implementation specification, not a claim that it already exists.

A Supabase additive migration already exists in the desktop repository at supabase/migrations/20261018_consilium_calendar_sync.sql. It creates public.consilium_calendar_snapshots(user_id UUID primary key referencing auth.users, revision BIGINT, payload JSONB, updated_at TIMESTAMPTZ), enables RLS, permits authenticated SELECT of auth.uid() rows and uses the consilium_save_calendar(expected_revision BIGINT, workspace JSONB) RPC for atomic writes. New snapshots require expected_revision=0. Stale revisions fail. Never edit the unrelated community/events tables in the supplied legacy schema. Do not embed service-role keys. Backend URL/publishable key belong to developer deployment configuration; normal users see Sign in and Sync, not a Supabase configuration form.

Current desktop sync semantics are explicit snapshot upload/download, not per-task merging. Implement compatible snapshot sync before proposing automatic merge. Preview replacements, backup local data before download, never overwrite unsynced changes without an explicit decision, and keep a baseline revision per account/project/device. Never synchronize provider API keys. Authentication tokens belong in Android Keystore-backed secure storage. Email confirmation, refresh token rotation, sign-out, offline errors, account switching and two-user isolation need tests. Do not deploy migrations or create cloud resources without a deployment step reviewed by the project owner.

For a future PC-only hosting option, propose an authenticated local service reachable over an explicitly configured private connection. It needs user pairing, certificate verification, encrypted transport, revocable per-device tokens, conflict handling and availability indicators. Do not expose an unauthenticated port, change firewall settings automatically, or promise phone access while the PC is offline. Do not implement an incompatible second data format.

## AI integration

Use a provider interface supporting Gemini and OpenRouter, with keys held securely under named profiles. Select keys clearly. Verify saving by readback; retain user input on failure. Never bundle keys in source or log them. Use supported text generation models, not Interactions-only agents with Chat Completions. Check official provider documentation during implementation.

Send means an explicit request to the visibly selected provider. Show the data categories shared and provide an optional context inspector; do not require an extra preview click. Bound context and reserve response capacity. Separate trusted application instructions from the user-authored goals and untrusted task text. Ask for clarification rather than inventing consequential preferences. Suggest tasks and label colors as a proposal. Validate JSON schema, dates, daily budget, collisions, durations, source/context revisions and complete requested coverage. Allow one strict repair. Cancellation, timeout, malformed output or unsupported models preserve accepted data and offer manual editing. Avoid silently truncating a multi-day schedule; report task/day coverage before acceptance and explicitly explain capacity limits. Keep historical requests local unless the user explicitly chooses to include them.

## Deliverables and acceptance

Deliver code, migrations only when needed, README, architecture notes, Android build instructions and tests. Include offline CRUD and restart persistence; minute positioning, DST/midnight and month-end repeats; named-key failure recovery; context-history retention and stale proposals; invalid and repaired model output; sync conflicts, interruption and two-account RLS isolation. Provide an actual APK build command and distinguish what has been run from what remains unverified. First checkpoint: runnable offline calendar with labels and context history. Second: tested provider proposals. Third: a real, explicitly configured and tested sync transport. Do not claim the app syncs with the existing PC until both sides have been tested together.
