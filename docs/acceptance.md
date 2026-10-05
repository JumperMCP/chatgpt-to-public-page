# Acceptance ledger

The plan remains [PRD/technical-plan.md](../PRD/technical-plan.md). This ledger distinguishes implemented local behavior from external evidence. Live installer hosting and OAuth-start smoke checks are recorded below. The tester confirmed independent-account installation, owner access, and receipt/MCP URL retrieval on 2026-10-05. ChatGPT end-to-end testing is blocked by the tester account’s missing custom-MCP option; publishing and broader novice usability remain unverified.

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
| Distribution | MIT, pinned dependencies/lockfile, CI; signed 0.1.2 hosted on installer domain, HTTPS downloads and signature verified | Independently distributed key, issued build provenance |
| Documentation/media | Current scope, setup/recovery/uninstall, source-linked architecture, comparisons | Real screenshots, README GIF, captioned video, recorded novice test |

## Experiment 1: Cloudflare ownership

Use the operator's account first for iteration. Then use a separate free account that is not a member of the operator's account. Record account plan, public-client method, public visibility, required/granted scopes, initial subdomain state, installation steps, resource IDs and ownership tags, successful setup, grant metadata without bearer values, and token fallback if needed.

Interrupt provisioning after each resource creation and after the Publisher upload. Resume and verify no duplicate namespaces or unrelated resource overwrites. Lose the handoff response and retry. Let an abandoned installation expire and confirm credentials are erased. Test an incomplete grant before provisioning. Confirm account verification/subdomain activation instructions resume correctly.

Test independent refresh at the installed Publisher; observe token expiry and rotation, lose a refresh response/write, revoke access, and simulate expired credentials after idle use. Keep `REFRESH_HANDOFF_VERIFIED=false` until this passes. If it cannot pass, use the visible API-token fallback. Stop the installer and confirm existing sites and ordinary publishing still work.

## Experiment 2: actual ChatGPT

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
