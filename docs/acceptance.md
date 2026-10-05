# Acceptance ledger

The plan remains [PRD/technical-plan.md](../PRD/technical-plan.md). This ledger distinguishes implemented local behavior from external evidence. On 2026-10-05 the tester confirmed independent-account installation, owner access, receipt/MCP URL retrieval, ChatGPT connection, and successful updates through 0.1.8. The pending site subsequently became published on 0.1.8, before installing 0.1.9. Publishing, editing, and discovery/reference plus editing from an unrelated session started on a smartphone all succeeded in the tester's reported trials. The dated entries below preserve the troubleshooting history; their earlier pending statements are superseded by these later observations. Attachment/image transfer, refresh behavior, operating-envelope measurements, and the complete recorded novice workflow remain open.

| Area | Local implementation/evidence | Still required |
| --- | --- | --- |
| Owner access | Single-use setup/recovery, password hashing, throttling, host cookie, origin/CSRF checks; security and runtime tests | Dashboard recovery and sibling-site browser recording |
| Publisher OAuth/MCP | Official SDK transport/OAuth; local consent/token/stage/read/export test; tester confirmed ChatGPT connection and fresh-session smartphone editing | Capture actual registration identity/authentication method and longer-lived authorization behavior |
| Files | ZIP streaming/limits/path/symlink/duplicate checks; exact approved download hosts; file-input schemas | Real approved artifact and generated-image transfer; expired references and user fallback |
| Project memory | Immutable chunked data, transactions, patches, conflicts, idempotency, search/ranges, retention, undo, export/delete tests | Free-plan quota/capacity measurement |
| Publication | Provider adapter and fault-injection tests; tester confirmed first publication recovered on 0.1.8 and subsequent publishing/editing worked | Inspect deployed assets-only configuration and preview exposure; exercise SPA and serving rules |
| Installer | Browser PKCE, account selection, durable progress/retry, grant expiry/erasure, signed release, token fallback | Independent install, setup, receipt retrieval and publishing confirmed by tester; still test permission denial and resource-level partial-install recovery |
| Cloudflare refresh | Encrypted credentials, serialized refresh, durable replacement, interrupted-rotation reconnect tests | Handoff on public client, expiry/rotation/idle/revocation observations; no lifetime assumptions |
| Updates | Signed manifest/checksums and reconciliation tests; tester confirmed updates through 0.1.8 with existing project subsequently published | Explicit preservation audit, controlled failed-update/known-good recovery, independent 0.1.9 update |
| Distribution | MIT, pinned dependencies/lockfile, CI; signed 0.1.9 hosted on installer domain, HTTPS downloads and signature verified | Independently distributed key, issued build provenance |
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

## Migration lookup and reconciliation API contract — 2026-10-05

After deploying the native-fetch repair, the tester reached `incompatible_migration`. Cloudflare's live operator `/settings` response has no migration tag. The active version response contains `resources.script_runtime.migration_tag` (`v1` for the operator installer); version annotations are top-level, not inside `metadata`. Both match Cloudflare's API schema. The old test fixtures incorrectly invented both fields, allowing two contract bugs to pass. Version 0.1.6 uses the observed API shape and tests mismatch/missing-tag/split-deployment rejection and lost-upload-response reconciliation without duplicate upload. This is operator API evidence; the independent tester's actual tag and completion remain to be verified by the corrected updater.

## Independent update complete; OAuth audience mismatch — 2026-10-05

The tester confirmed `Update state: complete` after the 0.1.6 bootstrap repair and deployment. The next ChatGPT connection reached the new public OAuth error: `invalid_target`, “The resource parameter must name exactly one configured protected resource”. Live unauthenticated discovery returns a single resource ending exactly in `/mcp`; `/mcp` returns 401 with a challenge pointing to `/.well-known/oauth-protected-resource/mcp`, which returns that same resource and issuer. The root well-known resource URL returns 404. The tester supplied the original `resource` value: the bare Publisher origin, matching the original plugin details, which omitted `/mcp`. After Uninstall/Delete (both left a list entry visible), the tester recreated a same-named plugin for the corrected URL but again saw `invalid_target`. The tester then supplied the second bare-origin resource value and confirmed they had used the wrong URL again. A fresh attempt with the full `/mcp` URL is pending. Neither stale-entry behavior nor a client interoperability bug has been established. No audience-policy change has been made. Runtime regressions verify rejection of the origin alone, a trailing slash, and two distinct resource values while the exact `/mcp` flow remains valid.

The chronological troubleshooting observations, actions, and pending checks are maintained in [QUIRKS.md](../QUIRKS.md#running-connection-and-update-log--2026-10-05).

## Correct `/mcp` connection succeeded — 2026-10-05

The tester confirmed that connection succeeded with the correct `/mcp` URL and is testing web Chat. “Try in chat” showed an ambiguous Work-upgrade prompt, followed by “Allow ChatGPT to use Publisher?”; the tester chose Always Allow. This establishes user-reported connection success and arrival at Chat tool permissions. A successful authenticated tool result, publication, fresh-chat edit, and refresh behavior remain unverified. The Work popup is logged in QUIRKS.md without treating it as proof of a paid-plan requirement.

## First chat publication attempt — 2026-10-05

After connecting the corrected `/mcp` URL, the tester used web Chat to create a site. ChatGPT reported an activation failure and the expected URL served Cloudflare's placeholder. This is user-reported tool-driven staging/publication activity, not a confirmed live site. Operator API probes for empty deployments and empty assets-only activation succeeded and were cleaned up. Version 0.1.7 fixes the remaining publication annotation lookup and exposes safe Cloudflare status/codes; the tester's rejection still needs those details. Preserve and inspect the existing project/operation rather than recreate it.

## First publication tool trace inspected — 2026-10-05

The tester supplied `tmp/tool-call-data.json`. It confirms successful authenticated `list_projects`, staging of one inline 8,832-byte HTML file without warnings, publication acceptance, and progression from uploading to activating. Final operation status remains activating with three attempts and a generic Cloudflare error; it is not a terminal failure. Asset upload is confirmed by the transition to activating. The initial combined `publish_project` call has no recorded output, so its outcome cannot be inferred. Raw trace/site content remains local and uncommitted. Actual activation/readiness and the new numeric error diagnostics remain pending.

## Pending publication/update deadlock — 2026-10-05

The tester could not apply an update because an activation retry remained pending. The real Worker route reproduced the exact busy error. Version 0.1.8 removes the redundant admission guard while retaining serialized execution and update priority. Runtime coverage verifies CSRF rejection, retained operation/file data, and publication resumption after both update outcomes. This local evidence does not establish the tester's underlying Cloudflare rejection or successful live activation; the existing installation requires the documented one-time guard repair.

Release 0.1.8 was built and signed from clean source commit `935df265468c94aaf731aef0e7e6da435b65e854`. Type checks, formatting, 36 Node/runtime tests, and two browser tests passed. This is a local signed release; CI provenance has not been issued.

## Update succeeded, publication still pending — 2026-10-05

The tester confirmed the 0.1.8 update succeeded. The project remained private and ChatGPT repeated the earlier generic provider-error explanation. Requested the exact current Recent operations diagnostic and displayed Publisher version; activation remains unverified. Independently reproduced a timer starvation defect through the actual MCP get_operation route: every poll postponed an existing retry alarm. Version 0.1.9 preserves earlier deadlines while advancing distant alarms. This local finding does not identify the tester's Cloudflare rejection.

Release 0.1.9 was built and signed from clean source `caf506200251a02a3a7a3b3a96985c0133829fc8`. Type checks, formatting, 36 Node/runtime tests and two browser tests passed. Local signing does not constitute CI provenance.

## Publication and fresh-session smartphone workflow succeeded — 2026-10-05

The tester confirmed that the previously pending site switched to Published while still running 0.1.8; 0.1.9 had not been installed. They then successfully tested publishing, editing, and referencing/editing the existing project from an unrelated ChatGPT session begun on a smartphone. These are user-reported live acceptance results. The original activation rejection was not captured with endpoint/code diagnostics, but the blocked-publication outcome is resolved. The later retry-timer correction is independently tested and must not be credited with this recovery.

During testing, the user discovered two ChatGPT accounts were in use. After an action described as adding the second account to the first test account, Publisher became visible on both accounts and both devices, although it initially was absent from the second account. The exact action and authorization identities remain unrecorded. This establishes reported plugin visibility and the successful smartphone workflow, not verified independent authorization/tool execution from both accounts or a general cross-account synchronization contract. See QUIRKS.md for the observation.
