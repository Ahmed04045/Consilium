# Consilium 2.0.0-alpha.4 — Gemini task generation

Gemini now uses Google's native `generateContent` and `streamGenerateContent` endpoints, with an API-key header. The Settings endpoint reflects this change automatically; existing named keys and model settings remain usable. OpenRouter and local providers retain their existing request contracts.

## Reproduced failure and correction

A tiny structured connection test succeeded on `gemini-3.6-flash`, while the complete calendar task request returned HTTP 400 on both `gemini-3.6-flash` and `gemini-3.8-flash`. The diagnostic used a temporary vault with two synthetic calendars; no real calendars, context or documents were sent.

Removing regular-expression and string-length constraints from the provider schema alone did not resolve the rejection. Moving the task array's `maxItems: 64` bound out of the provider schema then allowed the same two-calendar task workflow to pass on `gemini-3.6-flash`. Google's generic error does not identify an internal cause, but the result is consistent with its documented schema-complexity limitations.

The Gemini schema now keeps structural types, required fields, enum values and supported constraints, while conveying patterns, string lengths and array upper bounds as descriptions. **The original full JSON Schema and scheduling rules are still enforced in Rust.** Invalid dates, overly long titles, more than 64 tasks, overlapping times and other invalid proposals remain rejected before acceptance. This does not add blind retries for HTTP 400 or allow AI responses to change accepted calendars automatically.

See [Google's structured-output limitations](https://ai.google.dev/gemini-api/docs/structured-output) and [native generation contract](https://ai.google.dev/api/generate-content).

## Verification

- 47 Rust tests passed; two opt-in tests were skipped. New coverage checks native request fields, protected credential headers, model-path validation, completed versus truncated/blocked responses, streaming completion, preserved local schema limits and exclusion of other calendars' tasks.
- All 12 browser scenarios passed across the full run and a targeted rerun. One old assertion was updated to expect the native Gemini endpoint.
- A live Gemini 3.6 connection test passed. A live calendar proposal passed the app's actual schema and scheduling validation, with the correct date, start time, duration, label and color. Both synthetic calendars remained unchanged until acceptance.
- Gemini 3.8 streaming and calendar probes timed out, including a final calendar check with the app's two-minute timeout. Live Gemini 3.8 operation is **not verified**; Gemini 3.6 is the model verified in this update. Transient provider failures remain possible.
- Production build and NSIS packaging completed. The packaged Windows smoke test passed in an isolated vault: calendar CRUD, persistence, colors, model identity, repair/failure paths, acceptance, cancellation, export, conflicts, backup, new windows, real Wordcraft document persistence and DOCX round trips, retained tabs, folder links and scoped chat.

Optional explicit diagnostics, using the selected Windows credential without printing it:

```text
cargo run -p consilium-adapters --example gemini_connection -- <model-id>
cargo run -p consilium-adapters --example gemini_connection -- <model-id> --model-info
cargo run -p consilium-adapters --example gemini_connection -- <model-id> --stream
cargo run -p consilium-application --example gemini_calendar -- <model-id>
```

The adapter diagnostic stops after 45 seconds; the calendar diagnostic stops after 120 seconds. These tools are never invoked automatically. The calendar diagnostic creates and removes a temporary synthetic vault and never accepts a proposal.

Close Consilium before installing alpha.4, then test the saved model connection. There is no need to remove either calendar or re-enter a saved key. This remains an unsigned development alpha. Installer hashes are in `v2-installer.sha256`.
