# Operator setup and first experiments

The installer is a separate Worker at `chatgpt-to-public.jumpermcp.dev`. The existing sibling repository `../jumpermcp.dev/` is an Astro/Starlight Cloudflare Pages site; it does not contain a Publisher OAuth client. No changes to that repository are required to build this application. Add a marketing link only after the launch gates pass.

## Accounts and people

Your own Cloudflare account is suitable for operator setup, local-to-cloud development, and publishing experiments. Your own ChatGPT account is suitable if it actually offers **Create custom MCP server**. Do not infer eligibility from a plan name: inspect the account's current interface.

The independent tester needs a separate free Cloudflare account that is not a member of the installer's account. They must be able to authorize the public OAuth client, select their destination account, create Workers and OAuth KV storage, activate `workers.dev` if needed, and access their dashboard for recovery/uninstall. They do not need GitHub, coding experience, or an OpenAI API key. Their free ChatGPT account does not block the independent Cloudflare experiment. Run ChatGPT integration on your eligible account separately. The final novice usability test does require eligible ChatGPT access.

Do not ask testers to send passwords, OAuth codes, grants, or API tokens in chat. They complete authentication directly at Cloudflare or their Publisher.

## Cloudflare OAuth client (operator action)

Status on 2026-10-05: the operator reports successful TXT verification for
`chatgpt-to-public.jumpermcp.dev` and promotion of Publisher to public visibility.
The operator-provided client ID `af114d63e7199023c165b59009ffb38d` is recorded
in installer configuration. The operator supplied a successful PATCH response
(updated at `2026-10-05T04:47:27Z`) confirming `account-settings.read`,
`workers-scripts.write`, `workers-kv-storage.write`, and `offline_access`.
It also confirms the expected Client URL/callback, `code` response type,
`authorization_code` and `refresh_token` grants, token authentication `none`,
verified domain, and public visibility. This is operator-supplied API evidence;
external-account authorization and a live installation remain untested.

1. In the Jumper MCP Cloudflare account, open Manage Account → OAuth clients and create a client.
2. Use Authorization Code, public-client authentication method `none`, PKCE S256, and refresh support. Set the exact callback to `https://chatgpt-to-public.jumpermcp.dev/callback`. No shared client secret is shipped to Publishers.
3. Configure the three final scopes below. The dashboard currently omits Workers Scripts Write: create the client, then use the API workaround in [QUIRKS.md](../QUIRKS.md) to set the exact list. On the later required/optional page, leave **Required** enabled; all selected scopes default to required. Their IDs were confirmed against the live `GET /client/v4/oauth/scopes` catalog; `REQUIRED_SCOPES` in `wrangler.installer.jsonc` already contains this list.

   | Permission | Access to select | Exact OAuth scope ID |
   | --- | --- | --- |
   | Account Settings (Accounts & Billing) | Read | `account-settings.read` |
   | Workers Scripts | Write via API; absent from the observed UI | `workers-scripts.write` |
   | Workers KV Storage | Write (the legacy UI may call this Edit) | `workers-kv-storage.write` |

   Do not additionally select Workers Scripts Read or Workers KV Storage Read: the relevant read endpoints accept the Write permission. The API update replaces the temporary dashboard **Workers Editor** (`workers-scripts.edit`) selection with **Workers Scripts Write**: the newer Editor role cannot create or delete Workers. Account Settings remains Read only. No Workers Routes, DNS, billing, token-creation, or separate Durable Objects permission is needed by this implementation; Durable Objects are created through Worker upload migrations.

   The Workers permission covers creating Workers, uploading code/assets and migrations, reading versions/deployments/settings, and enabling their `workers.dev` addresses. KV Write provisions the OAuth storage namespace. Account Settings Read supports account discovery. These are the configured scopes for the live installation experiment; successful provisioning with this exact OAuth grant still needs to be observed.

4. Configure the application's URL, name, and logo, verify the Client URL hostname `chatgpt-to-public.jumpermcp.dev` through the requested DNS proof (in the `jumpermcp.dev` DNS zone, use TXT Name `chatgpt-to-public`, not `@`; copy the complete provided value including its prefix), then deliberately promote the application's visibility to public. **Public visibility promotion is irreversible** and distinct from public-client authentication. The external-account experiment cannot pass while visibility is private.
5. Set `CLIENT_ID` in `wrangler.installer.jsonc`. Record grant scope and expiry metadata from the experiment without storing bearer values in notes.

Exact values for the creation form:

| Field | Value |
| --- | --- |
| Name | `Publisher` |
| Response Type | **Code** only |
| Grant Type | **Authorization Code**, plus **Refresh Token** if offered |
| Token authentication method | **None** (`none`, public client) |
| Client URL | `https://chatgpt-to-public.jumpermcp.dev/` |
| Redirect URL | `https://chatgpt-to-public.jumpermcp.dev/callback` |
| Logo | Upload [the first logo](../assets/publisher-oauth-logo.png) or [the ComfyUI variant](../assets/publisher-oauth-logo-v2-comfy.png) |

The Client URL is optional for initial creation but required for public visibility. Configure the intended installer URL now; deploy it and complete domain verification before public promotion. This client belongs to the operator account; the separate tester later authorizes it in their own account. The user reported that their free ChatGPT account shows **Create plugin**, without the documented custom-MCP option. Treat that as an observed UI difference, not proof of remote-MCP eligibility; continue the Cloudflare-only experiment independently.

References: [client setup and visibility](https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/), [authorization/token endpoints](https://developers.cloudflare.com/fundamentals/oauth/integrate-with-cloudflare/).

## Releases and installer configuration

Create an Ed25519 signing key outside the repository, store the private key securely, and publish its public-key fingerprint independently. `RELEASE_PUBLIC_KEY` is the base64-encoded raw 32-byte public key, not a PEM document. `RELEASE_SIGNING_KEY_FILE` points to the private PEM key for the release script.

Configured on 2026-10-05 from the operator-provided SSH public key `id_ed25519_chatgpt-to-public.pub`. Its 32-byte Ed25519 public key was extracted and successfully imported with Web Crypto; `RELEASE_PUBLIC_KEY` now contains that raw key in base64. SSH fingerprint: `SHA256:Y4l70X4r8JwpPchts+vjZezbaXBA3kwtdKIKsuCn3x0`. The operator converted the private key to PKCS#8 PEM outside the repository. On 2026-10-05, a local check confirmed that the converted key matches the configured public key, a sign/verify round trip passed, and file permissions are 0600. No release has been signed yet. Independent fingerprint publication remains pending.

From a clean committed source tree, install locked dependencies, run checks/tests, build, and run `npm run release`. Archive `release.json`, `worker.js`, and `SHA256SUMS` under `public/releases/<version>/`. The installer serves this directory as static assets at `https://chatgpt-to-public.jumpermcp.dev/releases/<version>/`, without redirects or installation cookies. Existing version directories are immutable: add a new version instead of replacing files. The manifest contains a source commit, schema/tag/class compatibility, checksums, and release notes. Archive the previous working bundle. The manual release workflow signs and attests both Worker bundles. Configure the protected `release` environment and its `RELEASE_SIGNING_KEY` secret before running it. The validation workflow has passed; the manual signing/attestation workflow has not run and no build provenance has yet been issued.

Set these installer values:

| Setting | Meaning |
| --- | --- |
| `INSTALLER_ORIGIN` | Exact HTTPS installer origin |
| `CLIENT_ID`, `REQUIRED_SCOPES` | Verified public client's ID and required scope array |
| `INSTALLER_KEY` (secret) | Random 32-byte key encoded as 64 hex characters, for temporary grant encryption |
| `RELEASE_BASE_URL` | Pinned, numbered release directory |
| `RELEASE_PUBLIC_KEY` | Independently distributed Ed25519 trust root |
| `CHATGPT_CALLBACKS` | Exact HTTPS redirect URLs observed in the ChatGPT connection experiment; initially `[]` |
| `FILE_DOWNLOAD_HOSTS` | Exact approved HTTPS artifact hosts observed in the file experiment; initially `[]` |
| `REFRESH_HANDOFF_VERIFIED` | Leave `false` until the independent refresh/rotation experiment passes |

Map the installer Worker to the planned custom domain. This operator configuration is not an end-user custom-domain feature. Keep logging of request URLs/bodies disabled: setup, OAuth, and download URLs can contain sensitive values. Installer hosting costs belong to Jumper MCP; never upgrade the user's plan automatically.

The installer stores session state for one hour, reuses namespaces by its unpredictable installation-specific title, validates a signed release before provisioning, creates the Publisher's SQLite namespace through the `Publisher` class migration, and supplies the encryption/setup secrets. On completion it erases its temporary grant and handoff secrets. In fallback mode the installed Publisher remains disconnected until the owner enters an API token directly there. Keep the fallback visible to the user.

## Direct developer installation

For the initial experiments, a developer may configure a private copy of `wrangler.jsonc` and deploy with Wrangler. This is a development route, not the advertised novice onboarding flow.

Provision a dedicated `OAUTH_KV` namespace and replace its ID. Choose the actual account, activated account subdomain, random installation UUID, and exact Publisher origin. Set `OAUTH_KV_ID` as a visible receipt value. Keep the Durable Object binding named `PUBLISHER`, the class named `Publisher`, and the creation migration `v1` stable.

Supply `CREDENTIAL_KEY` as a random 64-character hex Worker secret. Generate a random setup token, put its SHA-256 hex digest in the `SETUP_TOKEN_HASH` secret, and set `SETUP_EXPIRES_AT` to an epoch-millisecond timestamp within one hour. Open `/setup?token=<original-token>` only on that Publisher. Keep the original token private. The Worker refuses arbitrary first-visitor claiming.

For OAuth handoff testing also configure `HANDOFF_TOKEN_HASH`, `CF_OAUTH_CLIENT_ID`, and `REQUIRED_CF_SCOPES`. Set the exact callbacks and file hosts only after observing them. The CLI and manual token route are for developers; launch still requires the browser-only installer experiment.

## Updates

The owner's **Check for updates** downloads and verifies the configured release; **Update Publisher** explicitly approves the reviewed candidate. To offer a later release, the installation's trusted `RELEASE_BASE_URL` must point to that numbered release directory. An automatic release-index discovery service is not implemented. Do not silently replace the contents of a versioned release directory.

The updater accepts additive-compatible schema/tag v1 releases, inherits bindings/settings, preserves all `secret_text` bindings, and records its operation before self-upload. A subsequent alarm reconciles the deployment annotation. Keep a known-good bundle and test real secret preservation, migration identity, and credential decryption before enabling public updates. Do not treat local metadata tests as evidence the remote upload path has passed.

## Read-only preflight observed during implementation

The connected session could list the operator account and fetch `/oauth/scopes`. The catalog includes `workers-scripts.write` (Workers Scripts Write), `workers-kv-storage.write` (Workers KV Storage Write), and `account-settings.read` (Account Settings Read). The installer now configures these three scopes. The documented Workers creation/upload APIs require Workers Scripts Write; Workers subdomain/version/deployment reads and KV namespace listing accept the corresponding Write permission. Live provisioning with this exact OAuth grant remains an acceptance check.

Listing the account's OAuth clients returned Cloudflare error 10000 (authentication error), although account discovery and the scope catalog succeeded. The connected authorization therefore cannot currently perform the OAuth-client setup. Use an appropriately authorized dashboard session or reconnect with OAuth-client permissions. No account resources were created or changed during this read-only preflight.

Permission references: [create Worker](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/methods/create/), [upload Worker and migrations](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/), [read deployments](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/list/), [read account subdomain](https://developers.cloudflare.com/api/resources/workers/subresources/subdomains/methods/get/), [list KV namespaces](https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/methods/list/), [Workers Editor limitations](https://developers.cloudflare.com/workers/authorization/workers/).

## Convert an existing OpenSSH signing key

Run `scripts/convert-release-key.py SOURCE DESTINATION` with Python and the
`cryptography` package installed. On NixOS, from the project root:

```bash
nix-shell -p 'python3.withPackages (ps: [ ps.cryptography ])' --run 'python3 scripts/convert-release-key.py ~/.ssh/id_ed25519_chatgpt-to-public ~/.ssh/publisher-release.pem'
export RELEASE_SIGNING_KEY_FILE="$HOME/.ssh/publisher-release.pem"
```

Adjust the source path to the actual private key location. The converter prompts
for the existing passphrase if needed, verifies the public key against installer
configuration, preserves the original, and refuses to overwrite the destination.
The output is an unencrypted PKCS#8 PEM with mode 0600, matching the current
release signer's requirements. Keep it outside the repository. Conversion alone
does not sign or publish a release.

## Installer deployment

The installer configuration includes the operator account, custom domain, and
static release assets from `public/`. Worker preview URLs and `workers.dev` are
disabled. The first archived release is `0.1.0`, signed from source commit
`6886d79168e6e9d510e8f958d8cc5c3621c1bc4b`. Its source manifest remains unchanged.

For the first deployment, generate `INSTALLER_KEY` as 32 random bytes encoded in
hex and supply it using Wrangler's `deploy --secrets-file` option with a private
temporary JSON file. Delete the temporary file afterward. Deployments preserve
existing secrets; do not regenerate this key on routine updates because active
installation grants depend on it.

```bash
npm run check
npm run format:check
npm run build
npm run build:installer
npm test
npx wrangler deploy --config wrangler.installer.jsonc
```

Keep the static archive in deployments so older installed Publishers can still
fetch their pinned release. Verify each file with redirects disabled and verify
the downloaded manifest signature and module digest against the configured key.
The root installer page must still create a private session; static release
downloads must not create installation sessions.

### First live deployment — 2026-10-05

Installer source: `80e5792e3420d1394ae5f15cf7d629a15e38c142`. Cloudflare version:
`095ad058-24a9-4490-858a-5d3611e6b341`. The custom domain is active and
`INSTALLER_KEY` was supplied as a secret at first deployment; the temporary
secret file was deleted afterward.

Verified over public HTTPS: all three `0.1.0` release files return 200 without
redirects or session cookies and exactly match the local archived bytes. The
manifest signature and module checksum pass verification. The root page returns
200 with a Secure/HttpOnly host-only installation cookie and `no-store`. A
CSRF-authenticated start request returns the expected Cloudflare authorization
redirect with the configured client ID, callback, permission scopes, and S256.
No browser consent or user-account provisioning was performed by this check.
All 25 local tests and the GitHub validation workflow passed.

Next: open the installer in the independent tester's browser, click **Install on
my Cloudflare**, authorize Publisher, and select the independent account. Record
errors without sharing authorization codes, cookies, or setup tokens. The API
token fallback remains enabled; ChatGPT callbacks and file-host allowlists remain
empty pending the separate client experiment.

### Browser form patch: 0.1.1

The installer now selects `/releases/0.1.1/`, signed from source `1d426a284e4a7bf9444065662eb1e060604e9e64`. This patch fixes native form Origin suppression and OAuth redirect CSP handling for both installation and owner setup/consent. Version 0.1.0 remains archived. Built from a clean checkout with locked dependencies; type, format, 26 automated tests, and the native Chromium form regression passed before signing. This is a locally signed release; GitHub provenance remains pending.

### Workers release-download patch: 0.1.2

Current installer release: `/releases/0.1.2/`, signed from clean source `9ae1cd260427734b09b7dbf3183da8e4ed19841d`. Workers rejects `redirect: "error"`; release downloads now use manual redirects and reject non-success responses. Hosted installer releases use the ASSETS binding with signature/checksum verification. All 33 tests and the browser form regression passed before signing. Previous archives are unchanged; GitHub build provenance remains pending.

### Owner setup and progress update: 0.1.3

Current installer release: `/releases/0.1.3/`, signed from clean source `8cee1822069e2e76a2ee512955e765110b6e0479`. Includes distinct owner UI, explicit ownership and publishing-token instructions, the MCP URL in Settings → Cloudflare → Installation receipt, and in-place progress updates instead of meta-refresh. Verified by 33 tests, two browser regressions, and 12 owner viewport/theme checks. Existing independent Publisher installations are not automatically changed.

To update an existing 0.1.2 Publisher after its owner has connected a publishing token: in that Worker's Cloudflare Settings → Variables and Secrets, set `RELEASE_BASE_URL` to `https://chatgpt-to-public.jumpermcp.dev/releases/0.1.3/` and deploy that configuration. Then use Check for updates in the Publisher owner UI, review 0.1.3, and select Update Publisher. Preserve all other bindings and secrets. No reinstall is needed. Actual owner-approved updates remain a live acceptance experiment.

### ChatGPT registration rejected before connection

`invalid_client_metadata: Only experimentally verified ChatGPT callbacks with public-client PKCE are enabled.` comes from the installed Publisher's registration policy. It does not mean Cloudflare installation failed. An empty `CHATGPT_CALLBACKS` rejects all registrations.

Capture the exact OAuth redirect URI shown by ChatGPT's MCP management/creation interface. In the **installed Publisher Worker in the owner's Cloudflare account**, open Settings → Variables and Secrets and set `CHATGPT_CALLBACKS` to a JSON array containing that exact URI, then deploy the configuration and retry ChatGPT creation. This is a Publisher variable, not the Cloudflare installer OAuth client's `/callback` setting. Changing the operator's installer variable alone does not update an existing Publisher.

[OpenAI's authentication documentation](https://developers.openai.com/plugins/build/auth) specifies `https://chatgpt.com/connector_platform_oauth_redirect` for servers supporting issuer identification, and `https://chatgpt.com/connector/oauth/{callback_id}` otherwise. Our discovery advertises issuer identification, so the stable URI is expected, but confirm the actual selection rather than inventing a callback ID or allowing a wildcard. If the creation screen provides no redirect URI, capture only `redirect_uris` and `token_endpoint_auth_method` from registration diagnostics; do not collect authorization headers, tokens, or full request logs. Registration currently also requires the explicit authentication method `none`. The SDK discovery advertises additional secret methods, so a rejection after configuring the callback needs the actual method checked.

The tester confirmed the stable URI in the New Plugin dialog on 2026-10-05. For this installation, set the text variable `CHATGPT_CALLBACKS` to `["https://chatgpt.com/connector_platform_oauth_redirect"]`, save/deploy, then retry Create in ChatGPT. The source configurations now include this exact URI for future deployments. Registration and token exchange remain unverified until the retry succeeds.

### Owner sign-in and consent error recovery: 0.1.4

Release `/releases/0.1.4/` is signed from clean source `2e2a8eab7e6facfc7c082eccb94dba165c9e59f0`. All 33 automated tests and two native browser tests passed. OAuth validation errors now show a public description/code and a same-origin retry link; incorrect passwords retain the sign-in form and ChatGPT connection destination. The exact live consent failure remains unconfirmed, so this is a recovery/diagnostic fix, not evidence of successful ChatGPT authorization.

If refreshing the tester's `/authorize` page still fails, update the existing Publisher to obtain the actionable error: in the Worker's Cloudflare Settings → Variables and Secrets, set `RELEASE_BASE_URL` to `https://chatgpt-to-public.jumpermcp.dev/releases/0.1.4/`, save/deploy, then open the Publisher homepage and select Check for updates → review 0.1.4 → Update Publisher. A connected publishing API token is required for self-update. Preserve `CHATGPT_CALLBACKS` and all other secrets/bindings. Return to ChatGPT and start Connect again; record only the visible public error, never the authorization query string. Existing passwords and projects are preserved. Live self-update remains an acceptance experiment. This release is locally signed; GitHub provenance is still pending.

### Repair the old updater once, then install 0.1.5

The independent tester's update to 0.1.4 failed before uploading code. Its old adapter invokes native Workers `fetch` with an object receiver, which throws `TypeError: Illegal invocation`. Both the isolated native-fetch reproduction and the bundled adapter runtime test reproduce this. A failed updater cannot install its own repair.

In the tester's Cloudflare account, open Workers & Pages → `publisher-c047d890` → Edit code. In `worker.js`, find the single line `this.fetcher = fetcher;` in the Cloudflare adapter constructor and replace it with:

```js
this.fetcher = (...args) => fetcher(...args);
```

Deploy that one-line repair. It preserves all bindings, secrets, owner passwords and project data. The exact wrapper was checked in workerd and changed the native fetch reproduction from HTTP 500 (Illegal invocation) to HTTP 200. This temporary edit is then replaced by the signed release below.

In Settings → Variables and Secrets, set `RELEASE_BASE_URL` to `https://chatgpt-to-public.jumpermcp.dev/releases/0.1.5/` and save/deploy. In Publisher, select Check for updates, review **0.1.5**, and Update Publisher. Confirm both **Update state: complete** and **Publisher 0.1.5** before retrying ChatGPT connection. Do not manually change `RELEASE_VERSION` to make an unsuccessful update look complete. If it fails, copy the visible error; do not keep retrying or reset the password.

Release 0.1.5 is signed from clean source `19cd582c4d56d6dea7819e164dfb165ef52fc534`. All 34 automated tests and two browser tests pass. Includes the 0.1.4 consent-error recovery improvements. The tester's actual OAuth consent failure remains unconfirmed until the corrected version runs. Previous archives remain intact; signing is local and GitHub provenance remains pending.

### Correct the old migration lookup, then install 0.1.6

After the native-fetch repair, the tester reached “Migration tags differ”. The old updater reads a nonexistent `/settings` migration tag. Do not change tags or set `RELEASE_VERSION` manually. Cloudflare's active-version response supplies `resources.script_runtime.migration_tag`; completion annotations are top-level on that same version response.

In the latest editable `worker.js`, find these two consecutive lines in the updater:

```js
const settings = await this.api.api(path + "/settings");
const metadata = updateMetadata(op.release.manifest, settings, op.id);
```

Replace both lines with:

```js
const settings = await this.api.api(path + "/settings");
const currentDeployment = await this.api.api(path + "/deployments");
const activeVersions = currentDeployment.deployments[0]?.versions ?? [];
requireThat(activeVersions.length === 1 && activeVersions[0].percentage === 100,
  "ambiguous_deployment", "Expected one active Publisher version.");
const activeVersion = await this.api.api(path + "/versions/" + encodeURIComponent(activeVersions[0].version_id));
settings.migration_tag = activeVersion.resources?.script_runtime?.migration_tag;
const metadata = updateMetadata(op.release.manifest, settings, op.id);
```

Keep the native-fetch wrapper and deploy. The original migration equality check still runs on the retrieved tag and rejects a mismatch. The exact bootstrap edit was exercised against the archived 0.1.2 bundle in workerd with the observed Cloudflare response structure and reached upload.

Set `RELEASE_BASE_URL` to `https://chatgpt-to-public.jumpermcp.dev/releases/0.1.6/`, save/deploy, then Check for updates → review **0.1.6** → Update Publisher. The new version also fixes completion reconciliation. Confirm **Publisher 0.1.6** and **Update state: complete** before retrying ChatGPT. If compatibility still fails, retain the error and stop; do not invent a tag.

0.1.6 is signed from clean source `53f94836abbeac3877587edc2b0c06b124de3c6d`; 34 automated and two browser tests passed. Older archives are unchanged. Independent update/consent and GitHub build provenance remain pending.

### Publication diagnostics and reconciliation: 0.1.7

0.1.7 is signed from clean source `ac57fb815562ee0259260025a39079defad6f2a1`. All 35 automated and two browser tests passed. Publication reconciliation now reads top-level version annotations; Cloudflare errors include only method/path, HTTP status and numeric codes, without response bodies or credentials. The independent tester's activation rejection remains unidentified until the new diagnostics are observed.

For a functioning 0.1.6 updater, set `RELEASE_BASE_URL` to `https://chatgpt-to-public.jumpermcp.dev/releases/0.1.7/`, deploy the configuration, then Check for updates → review 0.1.7 → Update Publisher. No manual code repair is needed. Keep the existing project and inspect its operation after update completion. An operation still activating will reconcile automatically; if it remains unsuccessful, record the exact safe endpoint/status/code error. Do not mistake the intended URL or Cloudflare's placeholder page for an activated site.

## 0.1.8: unblock updates behind a retrying publication

If an existing Publisher rejects an update with “Wait for publishing to finish before updating”, open that Publisher Worker in Cloudflare → Edit code and select the latest editable version. Search for that exact message. Remove only this check immediately inside the `/updates/apply` branch:

```js
requireThat(
  !this.publications.pending().length,
  "busy",
  "Wait for publishing to finish before updating."
);
```

Leave `this.updates.request(...)`, `this.schedule()`, and the preceding authentication/CSRF checks in place. Deploy the edited version and verify it serves all traffic. Set `RELEASE_BASE_URL` to `https://chatgpt-to-public.jumpermcp.dev/releases/0.1.8/` and deploy that configuration on top of the patched version. Leave `RELEASE_VERSION` unchanged: the updater sets it after installing the bundle. Check for updates, review 0.1.8, and apply it.

This is safe between steps because Publisher serializes requests and alarms. Updates take priority; the existing stored publication resumes after the update settles. Do not delete the project or change its operation state. Once the update completes, inspect the existing publication's next result; any remaining Cloudflare failure now includes its method/path, HTTP status, and numeric provider codes. Local runtime coverage confirms operation/file preservation and resumption after both successful and failed updates. Independent-account confirmation remains pending.

## 0.1.9: preserve retry timers during status checks

The independent tester confirmed the 0.1.8 update succeeded. A separate runtime regression found that MCP status calls reset retry alarms and could keep deferring publication. The 0.1.9 scheduler preserves earlier alarms. For an installation already running 0.1.8, set `RELEASE_BASE_URL` to `https://chatgpt-to-public.jumpermcp.dev/releases/0.1.9/`, deploy that configuration, and use the normal reviewed update. No code edit is needed; leave `RELEASE_VERSION` to the updater.

This does not establish the underlying Cloudflare activation error. Obtain the displayed Publisher version and the exact Recent operations entry, including method/path, HTTP status and numeric codes. “Private / unpublished” describes project visibility, not whether its operation is retrying. Record actual provider diagnostics rather than ChatGPT's paraphrase.

## 0.1.10: blue owner cockpit

Set the installed Publisher's `RELEASE_BASE_URL` to `https://chatgpt-to-public.jumpermcp.dev/releases/0.1.10/` and deploy that configuration. Leave `RELEASE_VERSION` unchanged, then check/review/apply 0.1.10 in Publisher. It includes the 0.1.9 timer fix, so 0.1.8 installations can update directly. No code edit, reinstall, Worker rename, or ChatGPT reconnection is needed for this design update.

The redesign preserves native owner forms and uses the supplied Cloudflare badge to identify the hosting boundary. See `docs/owner-cockpit-design.md` for layout and local browser verification. Renaming the Worker is a separate origin migration with user-visible connection effects, documented in QUIRKS.md; it is not part of this release.

## 0.1.11: cockpit refinements and clearer FAQs

The public installer receives its FAQ and header changes on deployment. Existing Publisher owners can set `RELEASE_BASE_URL` to `https://chatgpt-to-public.jumpermcp.dev/releases/0.1.11/`, deploy that configuration, and check/review/apply the release. Leave `RELEASE_VERSION` unchanged. Once 0.1.11 is installed, checking that same source retains release notes without offering another install. Older UI code will continue to offer the redundant button until updated.

## 0.1.12: compact project list

Use `https://chatgpt-to-public.jumpermcp.dev/releases/0.1.12/` for `RELEASE_BASE_URL`, deploy that configuration, then check/review/apply the update in Publisher. Leave `RELEASE_VERSION` unchanged. This release shortens the brand/project headings and places each collapsed project link, status and Manage control on a single row. Expanded controls remain native forms; no reconnect or migration is needed.
