# Consilium 3.0.0

First stable release, approved by the project owner on 2 November 2026 after application and phone testing. The version number follows the existing 3.0.0 alpha series.

## Distribution

- Windows 11 x64 NSIS installer: `Consilium Next_3.0.0_x64-setup.exe`.
- Portable terminal runner: `consi` and `consilium`, distributed together with usage instructions.
- Phone companion: https://nsl-eight.vercel.app/consilium/phone.
- Existing `io.consilium.next` identity, vault and Credential Manager namespace are preserved for upgrades.
- Installer is unsigned. Updates are manual. Stable status does not imply Microsoft signing or certification.

## Validation

The pre-release sanity pass covered desktop browser flows, the phone's authentication/sync flow with simulated responses, 35 targeted Rust tests, database access-control tests, and packaged native desktop/CLI acceptance. Runtime JavaScript dependency audit reported no known vulnerabilities. The owner subsequently tested the deployed phone integration and approved stable publication.

Stable-version Rust workspace tests, 29 desktop browser checks, the phone browser flow, both SQL migration suites, standalone runner checks, and native desktop/CLI acceptance passed. Native acceptance exercised 12 tasks and 21 synthetic model requests. Automated acceptance uses isolated data and a synthetic provider; it does not measure every third-party model's output quality. No clean-machine installer test was performed by the build agent. The owner accepted the release based on their testing.

## Supported boundaries

Phone transfers are explicit snapshots with revision checks, rather than automatic merging. The phone can view calendars, add flexible tasks and update non-recurring task completion. Desktop remains the editor for recurrence and advanced workspace features. Provider keys, documents, conversations, networks and file bindings are not synchronized.

Scripts and optional add-ons use the user's operating-system permissions. Hardware, PLC, distributed execution and additional Craft integrations are not advertised as production capabilities in this release. Report reproducible bugs through GitHub Issues.

## Stable artifacts

The 3.0.0 NSIS installer and portable runner package were built successfully. SHA-256 checksums are in `release-sha256sums.txt` and the release assets. The source and staged changes passed credential scans; unrelated promotional and personal planning files are excluded.
