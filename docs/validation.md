# Version 1.0 Preview validation — 2026-10-19

- Rust workspace suite: 34 passed. Two explicit-only tests are excluded by default: the search benchmark and Windows credential integration. The credential integration was separately run and passed. Context-history revisions, old-calendar defaults, label validation, repair/failure preservation, cancellation, storage recovery and model identity are covered. Sandbox file replacement initially failed with Access Denied; the full suite passed outside that restriction.
- Adapter regression suite: 9 passed, including legacy credential migration and failure preservation. Ten maximum-length synthetic keys were separately saved, reloaded, selected and deleted using the real Windows Credential Manager in a unique test namespace. Rust formatting passed.
- Browser suite: 8 passed. Covers CRUD/persistence/undo, retained tabs, one local font, reduced motion, overflow, direct titlebar search, labels/filtering, minute-positioned tasks, named-key save failure retention, context history, automatic context collection, month-end repeats and midnight end times.
- Native packaged consilium-desktop.exe: passed onboarding, CRUD, persistence, colors, model identity switching, successful repair, failed repair, acceptance, cancellation, export, stale conflicts, backup and new window. Uses a temporary vault and simulated local provider. No personal vault or real API credentials were used.
- Production frontend and Windows NSIS installer build succeeded. SHA256 is in installer.sha256. Both supplied PNGs have transparent corner pixels; native icon assets were regenerated.

The earlier Supabase migration tests passed local two-account isolation and revision conflicts; no remote migration was applied. Version 1.0 hides developer Supabase setup and runs locally. Phone synchronization is future work specified in android-companion-prompt.md.

Live provider quality with the expanded 64-task/context prompt, Windows Credential Manager behavior on other machines, clean-machine installer testing, signing, accessibility audit and current startup/memory benchmarks remain unverified. API-key failure recovery browser coverage uses simulated IPC; production saves perform credential readback verification.

Historical search performance is not a new v1 performance claim. Installer is unsigned.
