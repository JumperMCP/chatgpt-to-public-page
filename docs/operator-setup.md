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
