# Phone connection

The companion is hosted at **https://nsl-eight.vercel.app/consilium/phone** on the existing No Suits Labs Vercel project. Its production route, assets, security headers and mobile sign-in screen were verified on 2 November 2026. The project owner confirmed that the callback URL was added to Supabase. A real account/email and two-device sync test is still required.

The desktop remains usable without an account. Connecting is optional and does not upload anything until **Review sync → Upload calendars**. This release syncs calendars, labels, tasks, steps, goals, recurrence definitions and occurrence overrides. It does not sync documents, conversations, model profiles, API keys, file bindings, networks or run logs.

## Deployment

1. Apply `supabase/migrations/20261029_consilium_phone_sync.sql` once in the configured project's SQL Editor. It creates dedicated Consilium tables and RPCs; the existing community tables are untouched. Do not run `db/schema.sql`, which is only a schema reference.
2. In Supabase **Authentication → Sign In / Providers**, enable email/password sign-in and allow new users to sign up. Keep email confirmation enabled. Configure SMTP under **Authentication → SMTP Settings**; without working email delivery, a new account cannot be confirmed. Set **Authentication → URL Configuration → Site URL** to the companion's final HTTPS URL and add that URL to the allowed redirect URLs.
3. Configure Auth rate limits and SMTP before wider distribution. The supplied publishable key is intentionally public; never substitute a secret/service-role key.
4. Host the files in `apps/phone/` (or extract `target/phone-companion.zip`) at an HTTPS static origin. Publish `index.html`, `app.js`, `style.css`, `config.json`, and `_headers`. There is no build step or backend server. Keep `config.json` pointed at the same Supabase project as the desktop. Serve `_headers` where supported, or apply equivalent headers in your host.
5. On the phone, open the deployed HTTPS URL in a browser, choose **Create account**, then open the confirmation email and follow its link. Return to the companion and **Sign in** using that confirmed account. The email link should return to the configured Site URL.
6. In desktop **Settings → Profile & context → Connect with phone**, sign in to that same Supabase account. Choose **Review sync → Upload calendars** on desktop; on the phone, choose **Review sync → Download calendars**. Then edit a task or its completion on the phone, review and upload, and review and download on desktop. Downloads replace the calendar copy on that device; desktop creates a consistent vault backup first. Conflicting uploads are rejected and require downloading/reviewing the newer copy. This is explicit snapshot sync, not automatic merging or background synchronization.

### Account troubleshooting

- **Invalid email or password:** check that the email and password match, that the account belongs to this Supabase project, and that email confirmation is complete. The service rejects unknown accounts and incorrect passwords.
- **Account request submitted; check your email:** signup was accepted but email confirmation is required before sign-in. Check spam and verify SMTP delivery.
- **Signups are disabled:** enable new-user signups in Supabase Auth, or use an account created by an administrator.
- **The phone test seems to accept any password:** the Playwright sync test uses a mock Auth endpoint; it does not verify real accounts. A live check must use the deployed companion and the real Supabase project.

## Phone companion limits

The companion supports viewing calendars, adding flexible daily tasks and completing non-recurring tasks. Recurring series are identified separately; occurrence editing and rich documents remain in the desktop. Phone edits are saved in IndexedDB under the account/project identity. Tokens remain in memory, so a page reload requires signing in again. Sign-out does not erase the device's calendar copy. The phone must be able to reach the account service to sign in and sync. An open signed-in page can continue making calendar edits while offline.

## Protection boundaries

- Supabase Auth verifies identity; sync requires a confirmed email address. Access is through authenticated RPCs only, with no anonymous or direct table access. User identity comes from `auth.uid()`, never a client-supplied owner ID. RLS is enabled as defense in depth; the narrowly scoped security-definer RPCs enforce ownership explicitly.
- Atomic expected revisions prevent stale writes. Payloads are bounded to 2 MB, with at most 5,000 records per kind. The desktop uses a 1.9 MB serialized limit and validates references, parent cycles and occurrence rules before applying a download transaction.
- The database permits 10 successful writes and 60 successful reads per account per minute. Failed transactions roll back their quota increments. This is an account quota, not a global DDoS or account-creation defense. Apply gateway-level abuse controls and monitor usage before public rollout.
- Auth's built-in rate limits and email confirmation are essential. For a public self-service launch, add a supported CAPTCHA/browser-auth flow before enabling CAPTCHA enforcement (the desktop password form currently cannot complete that challenge). Until then, a controlled/invite-only preview is recommended; disable open signup in Auth if abuse appears. No UI claims that the service is abuse-proof.
- Windows refresh tokens use Credential Manager. Browser tokens are memory-only. No service-role key is bundled. Passwords and response contents are not written to diagnostic logs. TLS protects transport; synchronized calendar data is stored in the account's database and is not end-to-end encrypted.
- Network execution, file access and model credentials cannot be enabled by sync. No listener is opened on the desktop.

## Verification and operations

Run `node apps/desktop/tests/phone-sync-schema.mjs` for SQL isolation, anonymous/direct denial, confirmed-account checks, payload/count limits, stale revisions and quota reset tests. Run `cargo test -p consilium-application next::phone --locked` for desktop validation and transactional restores. Run `npm --prefix apps/desktop test -- --config playwright.phone.config.ts` for the simulated phone round trip and conflict preservation.

The SQL tests use an isolated PostgreSQL-compatible test engine, not the production database. A real desktop/phone account round trip is still required after HTTPS hosting. Do not treat simulated-provider tests as a live phone installation test.

Account-service configuration is in `schemas/phone-service.json`, copied to the companion's `config.json`. It contains public connection values only. Build-time `CONSILIUM_SUPABASE_URL` and `CONSILIUM_SUPABASE_PUBLISHABLE_KEY` override defaults; an existing explicitly configured desktop account project takes precedence.

Sources: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), [CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha).

The Account section also offers **Check connection**, which explicitly refreshes the saved session and checks the confirmed account with the authentication service. Opening Settings only reads the saved sign-in state; it does not perform a background sign-in request.
