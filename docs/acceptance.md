# Acceptance ledger

The plan remains [PRD/technical-plan.md](../PRD/technical-plan.md). This ledger distinguishes implemented local behavior from external evidence. Live installer hosting and OAuth-start smoke checks are recorded below. The tester confirmed independent-account installation, owner access, and receipt/MCP URL retrieval on 2026-10-05. Enabling ChatGPT developer mode exposed custom MCP creation; dynamic client registration now succeeds after the tester configured the observed callback. The next failure is a generic error at `/authorize` following owner login. Its live cause is still unconfirmed; publishing and broader novice usability remain unverified.

| Area | Local implementation/evidence | Still required |
| --- | --- | --- |
| Owner access | Single-use setup/recovery, password hashing, throttling, host cookie, origin/CSRF checks; security and runtime tests | Dashboard recovery and sibling-site browser recording |
| Publisher OAuth/MCP | Official SDK Web Standard HTTP transport and OAuth provider; registration/callback policy; real local consent/token/stage/read/export test | Eligible ChatGPT account, exact callbacks and registration identity mechanism; new-chat workflow |
| Files | ZIP streaming/limits/path/symlink/duplicate checks; exact approved download hosts; file-input schemas | Real approved artifact and generated-image transfer; expired references and user fallback |
| Project memory | Immutable chunked data, transactions, patches, conflicts, idempotency, search/ranges, retention, undo, export/delete tests | Free-plan quota/capacity measurement |
| Publication | Provider adapter, durable alarms, version/deployment reconciliation, reachability state; fault-injection tests | Real assets-only direct upload/activation, ownership API contract, no preview URLs, SPA and serving rules |
| Installer | Browser PKCE, account selection, durable progress/retry, grant expiry/erasure, signed release, token fallback | Independent-account install, owner setup and receipt retrieval confirmed by tester on 2026-10-05; still test permission denial, resource-level partial-install recovery and actual publishing |
| Cloudflare refresh | Encrypted credentials, serialized refresh, durable replacement, interrupted-rotation reconnect tests | Handoff on public client, expiry/rotation/idle/revocation observations; no lifetime assumptions |
| Updates | Signed manifest/checksums, compatibility checks, owner review, durable self-update/reconciliation, secret/binding preservation metadata | Actual self-upload preserving encryption key, DO data/class/tag, failed-update and known-good recovery |
| Distribution | MIT, pinned dependencies/lockfile, CI; signed 0.1.5 hosted on installer domain, HTTPS downloads and signature verified | Independently distributed key, issued build provenance |
| Documentation/media | Current scope, setup/recovery/uninstall, source-linked architecture, comparisons | Real screenshots, README GIF, captioned video, recorded novice test |

## Experiment 1: Cloudflare ownership

Use the operator's account first for iteration. Then use a separate free account that is not a member of the operator's account. Record account plan, public-client method, public visibility, required/granted scopes, initial subdomain state, installation steps, resource IDs and ownership tags, successful setup, grant metadata without bearer values, and token fallback if needed.

Interrupt provisioning after each resource creation and after the Publisher upload. Resume and verify no duplicate namespaces or unrelated resource overwrites. Lose the handoff response and retry. Let an abandoned installation expire and confirm credentials are erased. Test an incomplete grant before provisioning. Confirm account verification/subdomain activation instructions resume correctly.

Test independent refresh at the installed Publisher; observe token expiry and rotation, lose a refresh response/write, revoke access, and simulate expired credentials after idle use. Keep `REFRESH_HANDOFF_VERIFIED=false` until this passes. If it cannot pass, use the visible API-token fallback. Stop the installer and confirm existing sites and ordinary publishing still work.

## Experiment 2: actual ChatGPT

2026-10-05: the tester reached custom MCP creation after enabling developer mode.
The public authorization-server discovery endpoint is reachable and advertises
S256, issuer identification, and DCR. A diagnostic registration using OpenAI's
documented stable callback and `token_endpoint_auth_method: none` reproduced the
reported HTTP 400. This diagnostic is not a capture of ChatGPT's actual request.
The local policy rejects an empty allowlist and accepts that same metadata with
the exact callback configured. Discovery also advertises secret authentication
methods, while our registration policy accepts only `none`; inspect ChatGPT's
actual method before attributing the failure exclusively to callback selection.
The tester subsequently observed `https://chatgpt.com/connector_platform_oauth_redirect`
in the New Plugin dialog. Both source deployment configurations now allow that
exact callback. This verifies the displayed callback only, not successful
registration, consent, or token exchange. The tester must update the existing
Worker variable separately; no tester configuration was changed by our diagnostic.

On an eligible account, record the current custom-MCP creation interface and exact callback/registration behavior. Configure only those callbacks. Exercise every tool while authenticated and confirm calls fail without authorization or with an invalid audience/scope. Observe authorized file download hosts without copying signed URLs into logs. Configure only those hosts.

Publish an approved static website plus a generated image through authorized file inputs. Verify actual bytes, first-publish confirmation, resulting URL, and durable operation status. From a fresh chat discover, read, patch, publish, and undo. Test expired/inaccessible attachments and the simplest export/attach fallback. If the target ChatGPT surface cannot perform this workflow, block launch.

## Experiment 3: operating envelope

Build a fixture with 100 files, 25 MiB uncompressed total, a 10 MiB file, and binary images. Publish on a free account, recording edge CPU, DO CPU, peak memory, request count, upload time and alarms. Test a compressible ZIP bomb separately. Lower product defaults if the proposed maxima cannot be supported reliably.

Confirm the public deployment is assets-only with no script, admin bindings, credentials, or public version previews. Verify ordinary 404s, explicit SPA deep links, `_headers` and `_redirects`, unpublish, re-publish, and delayed hostname reachability. Inject upload failures and ambiguous activation responses; the previous publication must survive incomplete uploads.

## Recordings

After the successful workflow, record a novice with eligible ChatGPT access completing installation without coding help, first publish, fresh-chat edit, and undo. Every required field and step must have an explanation. Record the actual UI; do not fabricate screenshots or use generated art as product evidence.

Produce:

- A short README GIF of **prompt → public site → fresh-chat edit → undo**.
- A captioned video of the complete one-time setup, followed by a clearly separate everyday workflow.
- Screenshots of the tested connection path and two distinct authorization steps.
- A dashboard recovery/uninstall recording showing unrelated resources remain intact.

Redact tokens, passwords, authorization codes, setup links, private account details, and signed file URLs before distribution. Record dates, release checksum, account plan, and measured limits next to the evidence.

## Installer hosting smoke check — 2026-10-05

Deployed installer source `80e5792e3420d1394ae5f15cf7d629a15e38c142`, Cloudflare
version `095ad058-24a9-4490-858a-5d3611e6b341`. Public release manifest, bundle,
and checksums returned 200 without redirects, matched archived bytes, and passed
signature/checksum verification. Root session cookie/no-store behavior and the
CSRF-protected S256 OAuth-start redirect passed. All 25 local tests and GitHub CI
passed. Consent, token exchange, user-account provisioning, grant refresh, and
ChatGPT connection are not covered by this smoke check.

## Owner sign-in and consent error recovery — 2026-10-05

The tester confirmed registration succeeded after configuring the observed callback, then reported a generic error at `/authorize` after password submission. The real local Worker test exercises signed-out authorization, correct owner login and redirect, successful consent rendering, incorrect-password retry with retained connection destination, and an unknown-client authorization request. The latter exposed that SDK `AuthorizationError` was classified as an internal error. Version 0.1.4 renders its wire-safe description/code and a same-origin consent retry link instead. The incorrect-password form is also retained. This improves recovery and diagnosis without establishing the cause of the tester's live failure; refresh/connection retry and token exchange are still pending.

## Independent updater failure — 2026-10-05

The tester reported queued → failed with a generic error when updating to 0.1.4; the earlier consent error was therefore still running on old code. A minimal workerd reproduction returned `TypeError: Illegal invocation` for `const client = { fetcher: fetch }; await client.fetcher(url)`. The actual bundled Cloudflare adapter regression also failed before the fix and passes after calling the stored fetch function without an object receiver. This affects both authenticated API calls and unauthenticated reachability probes. Version 0.1.5 includes the fix. A one-time dashboard repair is required to bootstrap the old updater; independent update completion and live OAuth consent remain unverified.
