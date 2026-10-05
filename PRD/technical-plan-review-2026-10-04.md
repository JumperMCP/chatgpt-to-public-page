# Technical plan review (2026-10-04)

Review of `technical-plan.md` against current Cloudflare and OpenAI documentation. Sections are ordered by impact: verified claims, wrong assumptions that will cause bugs, missing pieces, then easy wins.

## 1. Verified claims

- **Developer-mode removal on October 1, 2026** is confirmed by an OpenAI Plugins staff post. The menu path is currently **chatgpt.com/plugins → Add → "Create MCP App"**, which OpenAI says will be renamed "Create custom MCP server". The README should name both labels. [OpenAI post](https://community.openai.com/t/developer-mode-missing-from-security-login-on-chatgpt-pro/1402157/10)
- **File params** are declared via `_meta["openai/fileParams"]`. ChatGPT always sends `download_url` and `file_id`, and may omit `mime_type` and `file_name`. The docs do not say whether model-generated images or code-interpreter files can be passed, so experiment 2 is justified. [OpenAI plugin reference](https://developers.openai.com/plugins/reference#file-apis)
- **Durable Object storage:** the row/BLOB limit is 2 MB, so 512 KiB chunks are safe. Free accounts have 5 GB total DO storage. [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/)
- **Cloudflare public OAuth clients** exist (June 2026). Public clients (`token_endpoint_auth_method: none`) require PKCE with S256. [Changelog](https://developers.cloudflare.com/changelog/post/2026-06-03-public-oauth-clients/), [Create an OAuth client](https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/)

## 2. Wrong assumptions and likely bugs

### 2.1 Free-plan Worker CPU limit

A free-plan Worker gets **10 ms CPU per request**, 50 subrequests and 128 MB memory. Unzipping a 25 MiB project, hashing it, base64 handling and parsing large tool arguments will not fit. A SQLite-backed Durable Object gets **30 s CPU per request even on the free plan**, but only 6 simultaneous outgoing connections. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/)

- The Worker routes and authenticates only. All file processing and Cloudflare API orchestration runs in the Durable Object.
- Stream archives and uploads. Never hold the archive, the extracted files and base64 copies in memory at the same time.
- Add an acceptance test: publish a maximum-size project (100 files, 25 MiB) on a free account.

### 2.2 SameSite and "host-only" cookies do not protect the Publisher

The Publisher and every published site share `<account>.workers.dev`, so browsers treat them as the **same site**. A published page (AI-generated code, third-party scripts) can set cookies on `.<account>.workers.dev` that shadow the Publisher's cookies (cookie tossing), and SameSite does not block its requests to the Publisher.

- Use `__Host-`-prefixed cookies.
- Use CSRF tokens plus `Origin` checks. Do not rely on SameSite.

### 2.3 Gaps in Cloudflare OAuth

- **Public visibility:** until the client is public, only members of the creating account can authorize it. Going public requires DNS TXT verification of the client's domain and **cannot be reverted**. Experiment 1 must use a separate Cloudflare account.
- **Optional scopes:** users can deselect optional scopes on the consent screen. Mark every scope as required, and still check the `scope` field in the token response before reporting success. [InfoQ](https://infoq.com/news/2026/09/cloudflare-optional-oauth-scopes)
- **Refresh tokens:** the docs do not state their lifetime, rotation policy or expiry on inactivity. If idle tokens expire, the "edit it six months later" workflow breaks.
  - Add a Cron Trigger that refreshes the grant regularly and records credential health.
  - If refresh tokens rotate, persist the new refresh token before using the new access token. A lost write would otherwise brick the installation.
  - Extend experiment 1 to measure token lifetimes and rotation behavior.
- **Third option to evaluate:** use the OAuth grant once, during installation, to mint an account-owned API token scoped to the deployment permissions. This removes refresh handling entirely. It only works if Cloudflare exposes an OAuth scope that permits token creation.

### 2.4 Publisher self-update can destroy data

- Uploading a new Publisher script through the API without keeping existing secrets wipes the encryption key, which makes the stored Cloudflare credential unrecoverable. Keep secrets explicitly on every upload.
- Each upload must carry the Durable Object migration tags. Never rename the Durable Object class.
- Add both to the upgrade-compatibility tests.

### 2.5 The account's `workers.dev` subdomain

- A fresh account may not have a `workers.dev` subdomain yet. The installer must detect this and create it.
- Cloudflare often derives the default from the account email, which would put the user's identity in every public URL. Changing it later changes every site's URL. Let the user choose it during installation.
- New hostnames can take a while to become reachable. The post-deployment check retries with backoff instead of reporting a failed publish.
- Unverified-email accounts may be blocked from deploying Workers (not confirmed). Check this in the installer's preflight.

### 2.6 Compiled frontend output needs per-project serving settings

- Single-page apps return 404 on deep links unless the site uses `not_found_handling: "single-page-application"`. Store this setting per project and auto-detect it (for example, a `404.html` file means `404-page` mode).
- Cloudflare interprets uploaded `_headers`, `_redirects` and `.assetsignore` files. Decide whether to allow them as a feature or reject them. They are not inert bytes.

### 2.7 The model elides content in full-file rewrites

Full-file replacement invites placeholders such as `<!-- rest unchanged -->`, which "preserve submitted bytes" would publish as-is.

- Add an `edit_file` tool with exact string replacement (`old_string` must match uniquely, replaced by `new_string`).
- Reject or warn on common elision markers, and on files that shrink sharply relative to the base revision.
- `read_files` on a large page may be truncated in tool output. Support line ranges and add a `search_files` tool.

### 2.8 The README contradicts the plan

The README still promises "Cloudflare KV as a decentralized Git alternative", which the plan explicitly drops. `random-notes.md` promises a "no clicks" workflow, but ChatGPT asks for confirmation on write tools. Correct the README now rather than at launch.

### 2.9 MCP transport on Workers

Use a Workers-native transport: either `createMcpHandler` from Cloudflare's `agents` package, or the MCP SDK's web-standard Streamable HTTP transport. Do not use the Node transport.

## 3. Missing from the plan

- **Redirect-URI allowlist:** the OAuth-provider library accepts dynamic client registration from anyone. For v1, allow only ChatGPT's callback URL, which blocks phishing through look-alike consent screens. Test whether ChatGPT registers dynamically or uses Client ID Metadata Documents.
- **Prompt injection and accidental exposure:** files the model reads back can carry injected instructions, and publishing turns conversation content into a public page. Mark write tools with `openWorldHint`, and make "this will be public" explicit in the publish result and the first-publish prompt.
- **Full uninstall:** document and implement removal of the Publisher, the Durable Object namespace, the OAuth KV namespace, all site Workers and the OAuth grant. The plan only covers per-project deletion.
- **Abuse risk:** Cloudflare may flag AI-generated pages that look like phishing (for example a demo login page), which puts the user's whole account at risk. State this in the README.
- **Shared account quotas:** the free plan allows 100 Workers per account, shared with the user's other Workers. Hostname collisions can come from those Workers too, not only from this tool's projects.
- **Observability:** the owner UI shows the last operation error and the Cloudflare credential's health.

## 4. Easy wins

- **Tool annotations:** mark `list_projects`, `get_project` and `read_files` with `readOnlyHint` so ChatGPT skips confirmation. Mark `publish_project` with `idempotentHint`, keyed on the staging ID.
- **One confirmation per publish:** offer a combined stage-and-publish call for the common case, keeping the operation state machine internal.
- **Discoverable undo:** `restore_revision` defaults to the previous revision. Every publish result returns the URL, the revision number and "say 'undo' to revert".
- **MCP server `instructions`:** describe the workflow in the initialize response (read → patch → publish, never elide content). This costs almost nothing and steers every session.
- **Assets-only site Workers:** deploy websites with no Worker script. Static-asset requests should then not count toward the 100,000 requests/day free quota (to verify).
- **`noindex` toggle:** offer a per-project option that emits `X-Robots-Tag: noindex` through `_headers`.
- **Defer MCP resources to v1.1:** ChatGPT does not hand them to the model automatically, and they double the resource/tool parity test matrix. The read tools already cover the need.

## 5. Proposed changes to the acceptance tests

- Publish a maximum-size project on a free account within the Worker and Durable Object CPU and memory limits.
- Publisher pages reject state-changing requests from a published sibling site, including requests carrying a tossed cookie.
- After a Publisher update, secrets and Durable Object data survive, and the stored Cloudflare credential still decrypts.
- An OAuth grant with a deselected scope is detected and reported during installation.
- The Cloudflare credential still works after a long idle period (measure, then simulate).
- An edit containing an elision marker, or one that sharply shrinks a file, is rejected or flagged.
- SPA deep links resolve after publication.
- A newly created hostname that is briefly unreachable does not produce a false publish failure.
