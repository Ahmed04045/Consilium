# Architecture

The React renderer has no direct filesystem, credential, or external HTTP access. `rpc` is the Tauri boundary; Rust validates its action-specific payload. `cancel` drops in-flight async work through a cancellation token. Conversational fragments stream through request-scoped events; structured plan and memory generations remain buffered until validation succeeds.

## Crates

- `domain`: plans, tracks, notes, model identities, vector normalization, deterministic fallback scheduling.
- `storage`: WAL SQLite, FTS5, atomic Markdown saves, source revisions, embedding generations/jobs, backups and exports.
- `adapters`: loopback Ollama/compatible APIs, credential storage, approved YouTube/feed discovery.
- `application`: workflows, proposal acceptance, hybrid search, memory review, session tracking, background indexing.
- `apps/desktop/src-tauri`: Windows host, cancellation registry, background worker, explicit browser opening.

The application gate serializes filesystem/database mutations. HTTP work runs outside the gate; results are checked against current revisions before becoming durable. A single embedding worker avoids duplicate claims. Pending jobs remain pending across process termination; completed jobs are identified by generation, source revision, and chunk hash.

## Retrieval

Markdown is split into overlapping Unicode-safe chunks. FTS5 and exact cosine similarity are fused with reciprocal-rank fusion. Duplicate source hits are collapsed. Active profile/tracks and accepted memories are included, then ranked evidence is budgeted conservatively by UTF-8 bytes. The provider rejects requests exceeding the configured conservative allowance instead of silently overflowing.

This initial implementation is intentionally conservative: configure the context size to match the loaded server model. Large-profile requests may require shortening input. Approximate nearest-neighbor indexing and model-specific tokenizers are future scaling work.

## Embedding generations

`embedding_indexes` stores the full identity plus explicit columns for model name, fingerprint, dimensions, normalization/chunker versions and lifecycle state. `metadata` stores selected and active generation IDs separately. `vectors` and `embedding_jobs` reference source revisions and chunk hashes.

Switching back to a compatible existing index updates the selected generation and retires the abandoned build. A model without a published fingerprint cannot be reliably distinguished after replacement under the same name; Settings exposes a force rebuild.

## Discovery boundary

Preview creates a single-use, ten-minute approval token for one immutable query. Executing discovery requires that token. No model call can execute discovery autonomously. Browser opening is a separate explicit action. Feed and video results are labeled as metadata, not inspected full content.

## Record layout

Structured records use a UUID/schema-version/revision/timestamp SQLite envelope; domain records are JSON payloads. Markdown frontmatter is a JSON object between `---` delimiters, followed by its body. The database uses `PRAGMA user_version=2`; the v1 migration preserves records and assigns stable envelope IDs. Newer vault schemas are rejected. The portable snapshot carries `schema_version=1` and preserves record keys.

## Calendar-focused interface

The current frontend calls calendar_snapshot without invoking the legacy snapshot/plan creation workflow. A single versioned calendar_workspace record owns timezone, onboarding state and named calendars with task arrays. Saves use compare-and-swap revisions. Each native window shares the Engine, and stale saves are rejected rather than merged blindly. Task changes are saved immediately; undo/redo writes previous snapshots through the same revision gate.

calendar_propose buffers a schema-guided response, validates dates, colors, lengths, positive durations and local time validity, and makes at most one repair request. Suggestions are stored separately with the base workspace revision. calendar_accept adds them only if that revision still matches, preventing replay and stale acceptance. Calendar exports use RFC 5545 text escaping, UTF-8-aware line folding, exclusive all-day end dates and UTC conversion for timed events. Ambiguous/nonexistent DST times must be resolved by selecting another local time.

The frontend exposes no Notes, Resources or video discovery screens. Existing data remains in the vault. Google Sans is bundled, and the onboarding/loading mark is a replaceable PNG under apps/desktop/public/.
