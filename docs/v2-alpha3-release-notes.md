# Consilium 2.0.0-alpha.3 — Gemini compatibility

- Gemini generation no longer sends custom sampling parameters. Earlier builds sent `temperature: 0.2`; [Google's current guidance](https://ai.google.dev/gemini-api/docs/troubleshooting) deprecates these overrides for Gemini 3.6+ and warns of HTTP 400 enforcement. Other providers retain their existing sampling configuration.
- Provider diagnostics recognize Google's array-wrapped error responses, root messages and string errors. Only the bounded message is shown, with the selected API key redacted. The app no longer assumes an unreadable response means the model ID or key is incorrect.
- Streaming and model-list HTTP errors use the same diagnostic path. Explicit transient failures keep their bounded retry policy; HTTP 400 is not blindly retried. JSON schema guidance and local validation remain in place.

Verification: 13 adapter tests passed; one explicit Credential Manager integration test was not run in this check. New regressions cover Google error envelopes, credential redaction and Gemini sampling defaults while preserving the complete task schema. Rust formatting, the production build and NSIS packaging passed. The packaged Windows smoke test passed calendar workflows, structured-output repair, cancellation, model identity, real Wordcraft persistence/DOCX round trips, scoped chat and folder privacy checks with a synthetic provider. Its WebView profile is now explicitly isolated so it can run alongside an installed app. Installer SHA256 is in `v2-installer.sha256`.

Two small live connection probes used the selected Windows credential and synthetic test text only. Neither yielded a usable HTTP response in the diagnostic environment: the first failed at transport level, and the bounded follow-up timed out. The user's original 400 has therefore not been reproduced or conclusively attributed to a particular parameter. This update removes a documented incompatibility and makes a subsequent provider rejection actionable; it does not claim a confirmed live-service fix.

An optional explicit diagnostic is available as `cargo run -p consilium-adapters --example gemini_connection -- <model-id>`. It uses the selected credential without printing it, submits no personal context, and stops after 45 seconds. It is never run automatically.

Close the running app before installing this update. Saved calendars, documents and named keys use the existing storage. This remains an unsigned alpha.
