# Provider quirks

## Cloudflare OAuth scope picker (observed 2026-10-05)

The operator's dashboard shows **Workers → Edit / Metadata read**, with
**Workers Editor** on the subsequent required/optional page. It does not expose
Workers Scripts Write. Cloudflare's in-page assistant told the operator that
the missing scope can be configured through the API. This UI limitation is
operator-reported; the API catalog independently confirms that
`workers-scripts.edit` and `workers-scripts.write` are distinct available IDs.
Do not infer the scope ID from the word Edit or substitute the newer Editor
role for the write scope required by the provisioning APIs.

The required/optional controls appear on a later page of the creation flow.
All selected scopes default to required. Leave Required enabled for the scopes
we use. **Account Settings Read** is under **Accounts & Billing**; we use it for
account discovery, without requesting billing permissions.

### Exact final configuration

For Publisher, replace the entire client scope list with:

```json
{
  "scopes": [
    "account-settings.read",
    "workers-scripts.write",
    "workers-kv-storage.write"
  ],
  "optional_scopes": []
}
```

Workers Scripts Read, Workers Editor, and Workers KV Storage Read are not
additional requirements. The relevant read APIs accept the corresponding Write
permission. The example supplied by the in-page assistant only included Workers
scopes; using it verbatim would omit our account-discovery and KV permissions.

After creating the client, use an operator API token authorized to manage OAuth
clients (OAuth Clients Write), kept locally. This permission belongs to the
operator token, not the application's end-user scope list. With local shell
variables `CF_OPERATOR_API_TOKEN` and `CF_OAUTH_CLIENT_ID` set, update it with:

```bash
curl --fail-with-body --request PATCH \
  "https://api.cloudflare.com/client/v4/accounts/a59597e6de9ff4db5364a9a24ec15524/oauth_clients/${CF_OAUTH_CLIENT_ID}" \
  --header "Authorization: Bearer ${CF_OPERATOR_API_TOKEN}" \
  --header 'Content-Type: application/json' \
  --data '{"scopes":["account-settings.read","workers-scripts.write","workers-kv-storage.write"],"optional_scopes":[]}'
```

Find the client ID on its dashboard page or through
`GET /accounts/{account_id}/oauth_clients`. Verify the saved scope list through
`GET /accounts/{account_id}/oauth_clients/{oauth_client_id}` after patching and
after subsequent dashboard edits. Cloudflare automatically manages protocol
scopes such as `offline_access` according to the grant types; these may also
appear in the response. Preserve Authorization Code and Refresh Token support.

The PATCH method, scope fields, and optional-scope semantics were checked against
Cloudflare's current OpenAPI schema. The operator subsequently supplied a successful patch response (see below).
Installation with this exact grant remains untested. The connected MCP authorization previously
returned authentication error 10000 when listing OAuth clients.

References: [OAuth client setup and required scopes](https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/),
[Worker creation permission](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/methods/create/),
[KV namespace read permissions](https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/methods/list/).

## OAuth verification TXT name

Verification is for the Client URL hostname. With Client URL
`https://chatgpt-to-public.jumpermcp.dev/`, create the TXT record in the
`jumpermcp.dev` zone with Name `chatgpt-to-public`. The resulting record name is
`chatgpt-to-public.jumpermcp.dev`. Name `@` would place it at `jumpermcp.dev`.
Copy the entire Cloudflare-provided verification value, including the
`cloudflare_oauth_client_publisher=` prefix. Follow an explicit record hostname
from the verification dialog if it differs; do not infer the name from the zone
alone. The previous operator instruction referring to verification of the root
domain was imprecise and has been corrected.

Reference: [Client URL ownership verification](https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/#client-url-domain-ownership-verification).

On 2026-10-05, the operator confirmed that TXT verification succeeded and the
client was made publicly visible.

On 2026-10-05, an operator-authorized PATCH attempt through the connected
Cloudflare MCP targeted client `af114d63e7199023c165b59009ffb38d` with the three
scopes above and `optional_scopes: []`. Cloudflare rejected it with error 10000
(Authentication error). That MCP attempt did not update the client. The operator subsequently completed
the PATCH with their own credential, as recorded below.

The operator then supplied a successful API response with update timestamp
`2026-10-05T04:47:27Z`, confirming the three configured scopes plus
`offline_access`, Authorization Code and Refresh Token grants, authentication
method `none`, response type `code`, the expected callback and Client URL,
verified domain, and public visibility. The response omitted `optional_scopes`;
it confirms the scope list but does not independently expose optional-scope
state. No independent GET readback or live authorization has been performed.

## Native browser forms and security headers

A real click on the installer failed with “This action must originate from your Publisher.” Chromium sent `Origin: null` under `Referrer-Policy: no-referrer`. An HTTP-client test with a manually supplied Origin missed this. `same-origin` preserves Origin for same-origin forms and suppresses referrers to external sites. See [MDN's Origin reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin).

Chromium also applies `form-action` to redirects after POST. The installer permits `https://dash.cloudflare.com`; Publisher consent permits only the origin of the already validated callback. Normal owner forms remain self-only. Null and foreign Origin values remain rejected. `npm run test:browser` exercises these behaviors using actual rendered forms, with the external destinations stubbed; CI installs Chromium. For local system Chrome set `BROWSER_EXECUTABLE_PATH`.

Cloudflare's auto-injected analytics beacon conflicts with the intentional script-blocking CSP and is unrelated to the Origin failure. HTML uses `Cache-Control: no-store, no-transform` to prevent proxy injection while retaining private session handling; see [Cloudflare response body inspection](https://developers.cloudflare.com/rules/configuration-rules/response-body-inspection/).

## Installer expiry and progress (independent-account test)

The tester reached account selection, then saw preflight remain spinning and eventually an expired-session page. That page linked back to itself and required manual cookie deletion. A real Durable Object regression reproduced both the recovery dead end and progress GETs waiting behind an alarm's network call.

The installer now reads existing progress without joining the mutation queue, refreshes active progress every five seconds, stops refreshing on failure, and offers a same-origin/CSRF-protected restart even after expiry. Restart erases the abandoned authorization but does not delete any Cloudflare resources. Authorization establishes a fresh bounded one-hour window (capped by the token expiry); waiting on the initial landing page no longer consumes that authorization window. The deadline is shown in UTC. Cloudflare failures show HTTP status and numeric error codes without exposing provider response bodies or credentials.

The precise timing of the tester's early expiry has not been established from the available evidence; the confirmed errors and recovery paths have regression coverage.

## Workers rejects `redirect: "error"`

Independent installation stopped at “Release metadata is invalid.” The public release passed download and signature checks in Node. A real workerd preflight regression exposed `TypeError: Invalid redirect value, must be one of "follow" or "manual"`. The failure happened before reading the release; a broad parse-error catch mislabeled it as malformed JSON.

Release downloads and credential handoff now use `redirect: "manual"` and reject every non-2xx response, preserving the no-redirect requirement. Transport failures and malformed metadata have separate errors. Hosted installer releases use the ASSETS binding directly; signature/checksum validation still rejects modified bundles. Tests cover successful verification inside workerd, corrupted modules, transport errors, malformed JSON, and redirect rejection.

Removed the visible UTC authorization deadline. Expiry remains enforced server-side, and the expiry page explains the action to take in plain language.

## Firefox blocked meta-refresh during installation

The tester had to allow approximately five automatic redirects before reaching owner setup. Removed meta-refresh. A same-origin script now reads progress and replaces the main content in place, stops on completion/errors, and offers manual refresh after repeated network failures. A real Chromium regression verifies the complete transition with only the initial navigation; Firefox’s reported redirect mechanism is no longer used.

The independent tester reached owner setup and obtained the installation receipt/MCP URL. Initially custom MCP creation was not visible; enabling developer mode later exposed it. The tester subsequently confirmed the exact stable callback and completed registration (see the dated connection log below). See https://developers.openai.com/plugins/deploy/connect-chatgpt .

## Workers native fetch must not receive an adapter as `this`

2026-10-05: the independent Publisher self-update failed before upload with a generic error. `this.fetcher(url)` where `fetcher` was assigned global `fetch` throws Workers `TypeError: Illegal invocation`. Node tests with injected arrow-function mocks did not expose it. Copy the stored function to a local variable and call `fetcher(url)`; site reachability probes need the same fix. `tests/cloudflare-runtime.test.ts` exercises both paths through the bundled adapter in workerd. For old deployments, the one-line constructor wrapper and signed 0.1.5 update procedure are in `docs/operator-setup.md`.

## Worker migration tags and version annotations

2026-10-05 live API and schema check: script `/settings` does not return `migration_tag`. Read it from the active version's `resources.script_runtime.migration_tag`. Version `annotations` is top-level, not nested under `metadata`. The old updater and mocked fixtures invented both response fields, causing a false migration mismatch and broken completion reconciliation. Fixed in 0.1.6 with mismatch/missing-tag/split-deployment rejection retained.

## Running connection and update log — 2026-10-05

This log records observations separately from explanations. Append new outcomes as testing progresses. Never include passwords, tokens, full authorization URLs, or signed file URLs.

| Step | Observed hiccup | Finding/action | Status |
| --- | --- | --- | --- |
| ChatGPT creation availability | The tester initially saw no custom MCP option. | Enabling developer mode exposed creation. This was not established as a subscription restriction. | Creation available. |
| Dynamic registration | HTTP 400 `invalid_client_metadata`, with the experimentally verified callback message. | Installed `CHATGPT_CALLBACKS` was empty. Tester observed `https://chatgpt.com/connector_platform_oauth_redirect` in New Plugin and configured that exact URL. | Registration succeeded. |
| Owner login → consent | Generic “The operation could not complete” at `/authorize`, with no useful retry. | 0.1.4 exposes public SDK authorization errors and adds a retry link; incorrect-password forms retain the connection destination. | Later revealed `invalid_target`; password failure was not the cause shown. |
| Updating the old Worker | Queued → failed; generic error. | Native fetch receiver bug reproduced in workerd. 0.1.5 fixes it; old code needs the constructor wrapper before it can update itself. | Repair advanced the updater to the next check. |
| Cloudflare version selection | Code was read-only with “only latest version is editable”; the tester switched to latest. Saving produced a new version ID and sometimes disabled Deploy. | A saved version is not necessarily the deployed version. Verify the patched version serves 100% of traffic in Deployments. A Worker version ID, storage migration tag (`v1`), and Publisher release label are different identifiers. | Tester confirmed a configuration deployment followed the patched script version. |
| Migration compatibility check | “Migration tags differ” at the updater metadata check. | `/settings` has no migration tag. Read the active version's `resources.script_runtime.migration_tag`; completion annotations are top-level. Fixed in 0.1.6 without bypassing migration equality. | Tester confirmed **Update state: complete** after 0.1.6 repair/update. |
| Original ChatGPT plugin URL | `invalid_target`: resource must name exactly one configured protected resource. | Tester copied `resource` equal to the bare Publisher origin. ChatGPT details also showed the bare origin, while discovery advertises the exact `/mcp` URL. Suggested correcting/recreating the plugin with `/mcp`. | Original entry's mismatch confirmed. |
| Uninstall/Delete visibility | Uninstall hid editing access but left Publisher visible/clickable. Delete took longer and also left an entry visible in the plugin list. | These are tester observations, not an established ChatGPT lifecycle or cache contract. Do not infer which entry is active solely from the display name. | Cause and eventual cleanup unverified. |
| Recreated plugin | A same-named recreated plugin again ended in `invalid_target`. | Tester supplied the second request's bare-origin resource and then confirmed they had used the wrong URL again. A fresh attempt with the full `/mcp` URL is starting; a distinct display name was suggested to distinguish entries. | Second URL mismatch confirmed; corrected attempt pending. No evidence of a resource-selection interoperability bug, and no audience-policy change made. |

The expected MCP Server URL is `https://publisher-c047d890.anita-nyc-tattoo.workers.dev/mcp` (no trailing slash). Its unauthenticated challenge points to `/.well-known/oauth-protected-resource/mcp`; live metadata advertises the same exact URL. The root metadata path returns 404. Local runtime checks reject the bare origin, `/mcp/`, and multiple distinct audiences while accepting `/mcp`. These checks establish the server's behavior, not the new plugin's actual request.

### Corrected URL connected; first web-chat test

The tester reported that connection worked after using the exact `/mcp` URL. “Try in chat” then showed an upgrade-to-Work popup; it was unclear whether this was a promotion or a requirement. The tester proceeded to a web-chat permission prompt, “Allow ChatGPT to use Publisher?”, and selected Always Allow. Record this as successful connection and arrival at chat permissions, not yet a successful MCP tool invocation or publication.

[OpenAI's plugin guide](https://learn.chatgpt.com/docs/plugins) describes plugin use in both Chat and Work, with availability depending on plan/workspace/plugin. It does not establish why this specific upgrade popup appeared. Continue the existing Chat test; no Work purchase requirement has been demonstrated. First check: ask Publisher to list projects, which exercises authenticated tool access without publishing. The exact scope/duration of the displayed Always Allow choice was not captured.

### First web-chat publication reached Cloudflare but did not go live

The tester reported ChatGPT created a dog-tattoo site and reported a generic Cloudflare rejection during activation. The intended workers.dev URL displayed Cloudflare's “There is nothing here yet” page and Firefox repeatedly reloaded it. Clicking the link first displayed ChatGPT's external-link confirmation with `utm_source=chatgpt.com`. These are separate observed browser/provider behaviors; neither the confirmation nor the proposed URL proves successful publication. The exact source of the placeholder reload behavior is unverified.

Operator-account probes created temporary Workers with public subdomains/previews disabled. An empty Worker's deployment list returned 200 with an empty array. An empty-manifest assets-only upload/activation returned 200. Both probe Workers were deleted. This rules out those API contracts as universally failing, not tester-specific rejection causes. Publication still read version annotations under `metadata`; 0.1.7 fixes this to top-level `annotations` and replaces the generic permissions/name/quota list with safe endpoint/status/numeric-code diagnostics. First live publication remains pending.

### Tool-call trace confirms upload, not terminal failure

The user supplied `tmp/tool-call-data.json` from ChatGPT. Inspected locally; the raw artifact and generated HTML are not included in this log or committed. The seven recorded calls show successful `list_projects` returning an empty list; an initial `publish_project` entry with no recorded output (outcome unknown); successful `stage_project` storing one 8,832-byte `index.html` with no warnings; a subsequent `publish_project` accepting that candidate; then three `get_operation` results progressing through `uploading`, `activating`, and `activating` with three attempts and the old generic `cloudflare_error`.

This directly confirms authenticated tool invocation, inline HTML staging, and completed asset upload. The final stored state is **activating**, not terminally **failed**; ChatGPT's prose summary overstated that distinction. The intended URL is not a readiness signal. The existing operation remains eligible for automatic reconciliation after 0.1.7; inspect its next status/error rather than create another project. This trace does not identify the Cloudflare endpoint/code or validate attachment/image transfer.

### Pending publication blocked its own repair update

The tester saw “Wait for publishing to finish before updating” when applying the diagnostic release while the first publication remained activating. The `/updates/apply` guard rejected any pending publication, including durable retries that cannot settle without a repair. A workerd runtime regression reproduced the exact busy response. Version 0.1.8 removes that redundant guard: requests and alarms are serialized, alarms prioritize queued updates, and pending publication operations resume after update completion or failure. The regression verifies CSRF protection and preservation of operation state and uploaded file bytes across both outcomes.

Older installations need the one-time guard removal documented in `docs/operator-setup.md` before they can install this repair. Do not delete the project, fabricate a terminal operation state, or change migration tags to unblock it. Independent-account update and activation results remain pending.
