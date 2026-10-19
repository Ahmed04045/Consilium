# AI setup for version 1.0

1. In Settings choose Gemini, OpenRouter, Ollama or a local compatible provider.
2. For cloud providers, give your API key a name and select Save and select key. The saved-key selector confirms the active key. A failed write keeps the field intact. Existing legacy keys appear as Existing key.
3. Enter the exact compatible model ID, then Save model settings. Test saved model connection sends a synthetic JSON request. Gemini's /openai/ URL is Google's compatibility interface, not an OpenAI destination.
4. Open Assistant → Context & history. Write your goals, learning level, availability, time budget and preferred schedule. Save context. Revisions and successful request/proposal history are stored locally.
5. Enter a scheduling request and Send. The send action automatically gathers current context. Preview remains optional; the cloud destination and shared data categories are visible. Review task count, days, labels and times before accepting.

Antigravity managed agents use Google's Interactions API and are not supported by this Chat Completions adapter. Google currently documents gemini-3.8-flash in its compatibility examples. If a request fails, the app shows a bounded provider message with the selected key redacted. Do not paste API keys into issue reports.

The assistant includes only the current context version and compact tasks within the selected 31-day window. Previous context and request history are not sent automatically. Up to 64 tasks can be proposed; output capacity is reserved and truncated/invalid results never change the calendar. Smaller local model windows may require shorter context and requests. Natural-language budget interpretation requires proposal review.

Cloud embedding uploads and legacy private-memory cloud workflows remain disabled. Provider keys are not in calendar snapshots or backups. The saved key registry is private Windows Credential Manager data.

## Future phone sync

There is no Supabase configuration screen or active sync service in version 1.0. The existing additive migration under supabase/migrations remains developer material, has been tested locally for RLS/revision isolation, and has NOT been deployed. The Android companion prompt specifies the current snapshot contract and required future account/transport work. Existing unrelated community/event tables are untouched. No local firewall or public port is opened.

References: https://ai.google.dev/gemini-api/docs/openai and https://ai.google.dev/gemini-api/docs/models/antigravity-preview-09-2026 .
