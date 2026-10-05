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
