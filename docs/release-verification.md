# Consilium 1.0 Preview verification

Date: 2026-10-19. Scope: local source based on commit 07978cc plus the credential-storage fix and documentation changes in the working tree. Nothing was published by this verification.

## Findings and checks

- Fixed a credential capacity bug: all named keys previously shared one Windows credential blob. Keys now use individual entries and a compact manifest. Existing bundled and single-key records migrate on the next mutation. Saves verify readback; provider keys are never returned to the frontend.
- Rust workspace: 34 tests passed. Windows credential integration separately passed with ten synthetic 1,000-character keys, reload, selection and deletion. Test entries use a unique namespace and are removed afterward. No real API credentials were used.
- Existing frontend validation: 8 browser tests passed before this Rust-only change. TypeScript and production frontend build passed again during packaging.
- Rebuilt Windows executable and NSIS installer successfully. The rebuilt executable passed the native smoke test: onboarding, CRUD, persistence, colors, model identity, repair, failed repair, acceptance, cancellation, export, conflicts, backup and new window. Installer SHA256 is recorded in installer.sha256; Authenticode status is NotSigned.
- Gitleaks 8.30.1: no findings in the repository's one commit or the tracked/nonignored source snapshot. Downloaded scanner archive was checked against its release checksum. Scanning is evidence, not proof that every possible secret or private document is absent.
- npm audit: zero reported vulnerabilities.
- cargo-audit 0.22.2: zero entries in the vulnerability list. Five informational warnings remain: proc-macro-error (RUSTSEC-2024-0370), zbus_names (RUSTSEC-2026-0371), zvariant (RUSTSEC-2026-0370), zvariant_derive (RUSTSEC-2026-0372), and glib unsoundness (RUSTSEC-2024-0429). None appeared in the resolved x86_64-pc-windows-msvc dependency tree. These must be reassessed before supporting other targets. Advisory database revision: 999ec89d5d3f10f20be14750ec8c2d8b44e0ac9b.

## Preview limitations

- The installer is unsigned. Clean-machine installation has not been tested; no spare Windows PC or VM is available. The owner explicitly chose to retain Preview status.
- Packaged smoke tests use a temporary vault and a simulated local model. They do not certify live Gemini/OpenRouter output quality, billing behavior or uptime. Review generated task dates, coverage, duration and objectives before accepting.
- No phone synchronization service is enabled. Android and account synchronization remain future work.
- A full accessibility review and current performance targets have not been certified.
- Runtime vaults, local database schema notes, credentials and backups are excluded from source publication. Publish source through Git and release artifacts individually, not a zip of the entire working folder.

Use the release title **Consilium 1.0 Preview** and mark any GitHub release as a prerelease. Internal package version 1.0.0 does not imply stable status. See validation.md and installer.sha256 for build verification.
