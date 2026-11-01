# Sanity review — 1 November 2026

Target: Consilium Next 3.0.0-alpha.14, Windows preview.

## Changes

- Settings has six sections. Profile, assistant context and phone connection share one page; connected files and backups share another. Help, shortcuts and About are grouped together. Existing menu destinations still resolve to the appropriate group.
- Search recognizes related terms, including account, phone sync, recovery and keyboard shortcuts. Switching sections keeps unfinished settings drafts. Headings and controls use the existing type and spacing scales.
- Instructions describe actual behavior: Assistant conversations stay in the Assistant; downloads replace calendar snapshots after a backup. Release notes use readable headings and paragraphs. Backup and context saves report success in their own sections.
- Context saves carry the editor's expected revision. A competing edit cannot be silently overwritten. The draft remains available after a conflict.
- Account loading is explicit. Check connection contacts Auth only when requested. Refresh responses must contain nonempty tokens and the expected account identity before replacing a saved credential. Phone sessions also require a valid expiry.
- Interface density now changes navigation/list spacing. The completed-task preference initializes new calendar views. Invalid persisted appearance values fall back to supported defaults.
- The phone validates synchronized records and cached snapshots before displaying them. Malformed records, duplicate IDs, broken references and cyclic parents are rejected without replacing the current calendar copy.

## Verification

- Desktop browser coverage (29 checks passed, including targeted appearance checks): calendar, documents, tabs, assistant retries, menus, settings, task defaults, workflow editing and narrow layouts.
- Phone browser coverage (passed): failed sign-in, confirmation flow, explicit round trip, concurrent-write conflict, malformed records, sign-out and cached-data reload. These account responses are simulated.
- Rust: 33 workspace/application tests and two account-adapter tests passed.
- Database migration tests: account isolation, confirmed-email requirement, anonymous/direct-access denial, size/count limits, revision conflicts and quotas passed in the isolated test database.
- Runtime JavaScript dependency audit: no known vulnerabilities reported. This does not constitute a full security audit of Rust dependencies or the hosted service.
- Packaged native desktop/CLI acceptance passed: learning and code/data workflows, ML linear regression, recovery, review, document saves and CLI execution. It used an isolated temporary vault and 21 simulated local-model requests.

## Remaining release boundary

Keep preview status. Live signup, email delivery, redirect settings and a real desktop/phone synchronization round trip still require verification against the configured hosted project. This review does not establish clean-machine installer behavior or code signing. No stable tag or public release was created.
