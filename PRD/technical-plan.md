# ChatGPT-to-Public: technical implementation plan

## 1. Product and architectural decisions

Build an open-source Publisher that turns approved ChatGPT artifacts into public websites hosted in the user’s own Cloudflare account.

The launch experience is: **install through Jumper MCP → connect ChatGPT → publish → edit from future conversations**. Users need no GitHub account, terminal, build configuration, or OpenAI API key.

**MCP resources are deferred.** Read-only tools provide project discovery, manifests, history, search, and revision-specific files. Add resources later only for a demonstrated client need; they are not required for persistent project memory or fresh-chat editing. [MCP resource specification](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)

**Cloudflare KV remains, with a narrower role.** Use it for the authorization records managed by Cloudflare’s OAuth-provider library. Store project files, revisions, and operation state in SQLite-backed Durable Objects, whose transactional storage avoids KV’s eventual-consistency problems. This preserves the brainstorm’s persistent project memory without describing KV as a “decentralized Git replacement.” [OAuth-provider library](https://github.com/cloudflare/workers-oauth-provider), [KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/)

| Module | Responsibility |
|---|---|
| Jumper MCP installer | Cloudflare authorization, installation, progress, and installation recovery |
| User’s Publisher Worker | MCP routing, owner login, management UI, and update entry points |
| SQLite-backed Durable Object | Authoritative project files, revisions, credentials, file processing, and resumable deployment/update operations |
| `OAUTH_KV` namespace | OAuth-provider authorization records |
| Separate website Workers | Serve published static assets at independent subdomains |

Use TypeScript, the official MCP SDK with a Workers-compatible web-standard Streamable HTTP transport (not its Node HTTP transport), Cloudflare’s maintained OAuth-provider library, and Wrangler configuration. Keep the Publisher’s domain operations shared between MCP tools and its management UI. Keep the edge Worker thin: route and authenticate there; run archive processing, hashing, large request parsing, and Cloudflare API orchestration in the Durable Object. Stream input and output, bound outgoing concurrency, and avoid simultaneous archive, extracted-file, and base64 copies in memory. Validate this boundary under actual free-plan CPU and memory limits. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/)

**Launch scope:** one owner; ready-to-host HTML/CSS/JavaScript, images, and other small static assets; stable subdomains; later edits; undo; export; unpublish; deletion; user-initiated Publisher updates. Compiled frontend output is supported regardless of its originating framework.

**Product boundary:** personal pages and smallish projects that need immediate visibility. Use sensible defaults within Cloudflare’s free plan. Users manage shared account quotas, name collisions, account verification, and account-level settings; report actionable provider errors without building quota workarounds, automatic upgrades, or account-management features. Protect existing content even when a provider limit is reached. Minimize routine clicks without promising that ChatGPT will omit its own confirmations.

**Deferred:** build execution, backends, databases for generated apps, teams, custom domains, large audio/video hosting, Free-tier ChatGPT compatibility, and additional client certification. No separate website-preview system: users review in ChatGPT.

## 2. Installation, authentication, and ownership

Host the installer at `chatgpt-to-public.jumpermcp.dev`. Brand it with Jumper MCP and an optional services link; require no business account or email subscription.

The user journey:

1. Click **Install on my Cloudflare**.
2. Authorize the installer through Cloudflare and select the destination account.
3. Watch clear progress while the installer provisions the Publisher, Durable Object namespace, and OAuth KV namespace from a versioned release.
4. Open a short-lived, single-use setup link on their own Publisher and create an owner password.
5. Copy the supplied `/mcp` connection URL into **ChatGPT → Plugins → Add → Create custom MCP server**.
6. Authenticate with their Publisher and run the supplied first-publish prompt.

The setup link must prove ownership; never allow the first visitor to claim an unconfigured installation. Password reset must have a documented Cloudflare-dashboard recovery route that does not depend on Jumper MCP.

Keep two authorization relationships separate:

- **Cloudflare authorization:** permits the Publisher to deploy websites.
- **Publisher authorization:** permits ChatGPT to read or change the owner’s projects.

Use Cloudflare’s supported public-client Authorization Code flow with PKCE S256 and refresh-token support as the preferred installation path. Transfer the ongoing grant securely to the installed Publisher, serialize refreshes, and erase installer-held credentials after successful handoff. Never distribute a shared confidential-client secret to installations. Cloudflare documents public-client authentication and refresh grants, but the complete handoff must pass the initial implementation experiment. [OAuth client reference](https://developers.cloudflare.com/api/resources/iam/subresources/oauth_clients/methods/create/)

The installer’s OAuth client must also have **public visibility** to work for users outside the Jumper MCP Cloudflare account; this is distinct from being a public client without a secret. Complete domain verification and record public promotion as a one-time operator setup step; Cloudflare documents that promotion as irreversible. Test with an independent account holder. [Cloudflare OAuth client setup](https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/)

Persist rotated refresh credentials durably before relying on the replacement access token. Measure expiry and rotation behavior in the initial experiment, serialize refreshes, and test interruption during rotation. If a remote rotation succeeds but the response or local write is lost, surface reconnection rather than claiming atomicity across Cloudflare and local storage. Refresh when needed and show credential health in the owner UI. Do not add a periodic refresh cron based on an unverified inactivity-expiry assumption or promise indefinite unattended credentials. Later edits may require reconnection.

**Predetermined fallback:** if independent refresh cannot be demonstrated, retain OAuth installation and guide the owner through creating a scoped Cloudflare API token, entered directly into their own Publisher. Do not silently introduce a central credential-refresh service.

Additional requirements:

- Persist resumable installation state with bounded credential lifetime; retries reuse owned resources rather than creating duplicates.
- Request only the permissions required by provisioning and deployment, mark necessary scopes as required where supported, and validate the actual grant before declaring installation complete. Report missing permissions without proceeding to partial deployment. Do not request token-creation privileges to automate minting an account API token in v1.
- Encrypt stored Cloudflare credentials with a key held in the user’s Worker secrets.
- Use `__Host-` owner cookies with `Secure`, `HttpOnly`, `Path=/`, no `Domain`, and an appropriate SameSite setting. Require CSRF tokens and exact Publisher-origin checks on browser state-changing requests; reject unexpected origins and do not enable credentialed cross-origin access. Treat published sibling sites as untrusted: host-only cookies and SameSite alone are insufficient defenses. Apply login throttling and OAuth resource/scope validation.
- Restrict Publisher OAuth registration and redirects to the exact ChatGPT callback URLs verified in the connection experiment; no wildcard or caller-selected redirect destinations. Validate client identity as supported by the observed registration mechanism (dynamic registration or Client ID Metadata Documents), authorization state, PKCE, and explicit owner consent. A redirect allowlist is one defense, not a complete phishing defense.
- Restrict deployment operations to projects registered to this installation; never overwrite unrelated Workers.
- No website content or ongoing publishing traffic passes through Jumper MCP.
- Existing sites and ordinary publishing must survive installer downtime. Document that revocation of an OAuth application is a separate event that can require reconnection or the token fallback.
- Users remain on Cloudflare’s free plan; never enable billing or upgrade automatically. Installer hosting costs belong to Jumper MCP.

During installation, detect whether the account has a `workers.dev` subdomain. Reuse it and show the resulting public address. If Cloudflare requires first-time activation or account verification, provide a direct dashboard instruction and resume afterward; do not build a subdomain selection or renaming flow. Cloudflare’s default may contain a name derived from the owner’s email; account naming and changes remain the owner’s responsibility.

## 3. Project memory, MCP interface, and publication

Assign server-generated project IDs independent of chat sessions. Resolve projects by ID, saved public URL, or name; ask for disambiguation when names are ambiguous.

Automatically derive a short hostname from the user’s request unless they specify one. On a collision, report that the name is unavailable and let the owner choose another; never overwrite an unrelated deployment. Preserve the address through subsequent edits.

**MCP interface**

| Tools | Behavior |
|---|---|
| `list_projects`, `get_project`, `read_files`, `search_files` | Discover projects, inspect manifests/history, search text, and retrieve revision-specific files with bounded ranges and explicit continuation metadata |
| `stage_project`, `edit_file` | Import files or apply exact text replacements to a private candidate revision; each `old_string` must match uniquely, otherwise fail without partial edits |
| `publish_project`, `get_operation` | Publish an existing candidate, or stage supplied files/patches and publish in one call; report durable operation status |
| `restore_revision` | Republish a retained snapshot at the existing address; default to the snapshot preceding the current publication |
| `export_project` | Provide a short-lived download of retained project files |
| `unpublish_project` | Remove public availability while retaining editable state |

Paginate discovery and history; bounded file reads identify the revision and covered range and never silently truncate. Binary files use export/download rather than oversized text responses.

Set accurate MCP annotations: discovery, inspection, search, and operation-status tools are read-only; public deployment tools have `openWorldHint: true` and truthful destructive/idempotent hints. Annotations inform client behavior and do not enforce authorization or guarantee fewer confirmations. MCP server `instructions` describe read → exact patch → publish, retrieving fresh state before editing, and never eliding file contents. Treat retrieved project text as untrusted content, never instructions to change credentials, permissions, or publish unrelated conversation data.

The first-publish prompt and publishing tool descriptions explicitly say that selected files will become public. Return the public URL, revision, operation status, and a discoverable undo hint when a prior snapshot exists. Keep routine publish approval within ChatGPT’s normal confirmation flow; do not add a second Publisher confirmation screen.

Keep permanent deletion and Publisher upgrades in the owner management UI. ChatGPT may link users there. Permanent deletion requires an explicit confirmation identifying the affected project.

**Artifact transfer and fidelity**

- Prefer ChatGPT’s authorized file inputs for images and archives; use bounded text inputs for small code changes. Declare top-level file inputs in `_meta["openai/fileParams"]`; each file schema declares `download_url`, `file_id`, `mime_type`, and `file_name`, with only the first two required. Do not assume generated images are transferable until the experiment passes. [OpenAI file inputs](https://developers.openai.com/plugins/reference#file-apis)
- Download temporary file references immediately into durable storage; never rely on their continued availability.
- Accept ZIP bundles and individual files. Reject unsafe archive paths, symlinks, duplicate normalized paths, decompression bombs, and unsupported server/build inputs.
- Prefer exact text patches for focused edits; retain complete file replacement for new files and intentional rewrites. Apply changes and explicit deletions to the selected base revision; unmentioned files remain unchanged. Flag newly introduced elision markers or unusually large shrinkage as warnings in the diff summary. These heuristics are not proof of corruption; require clarification only when intent is unclear, and never silently repair or rewrite supplied content. In the combined publish path, run these checks before activation and leave the candidate staged if clarification is needed.
- Require an entry-point `index.html`; never run uploaded code, package managers, or build scripts.
- Validate download destinations and redirects against SSRF, enforce streaming size limits, and exclude credential-bearing URLs from logs.
- If approved artifacts cannot be accessed, stop and explain the simplest export/attach/upload route. Never silently reconstruct them.
- Preserve submitted bytes. A deployment check establishes successful hosting; it does not promise pixel-identical rendering across browsers.

**Serving settings**

Store serving settings with each revision so undo restores them as well as files. Default to ordinary static hosting; use `404-page` mode when an appropriate `404.html` is supplied. Enable `single-page-application` only when the artifact or user intent establishes SPA routing; the presence of `index.html` alone is insufficient. Verify deep links for SPA projects. [Cloudflare asset routing](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/)

Treat `_headers` and `_redirects` as explicit serving configuration: parse, validate against supported Cloudflare semantics, translate into the configuration required by the direct-upload API, and include their effects in the change summary. Retain the source files for export and undo; do not assume uploading them as ordinary assets applies their rules. [Headers](https://developers.cloudflare.com/workers/static-assets/headers/), [Redirects](https://developers.cloudflare.com/workers/static-assets/redirects/) Reject `.assetsignore` in v1 with an instruction to remove unwanted files before upload; it is upload-tool filtering, not a runtime asset rule. Do not silently filter a submitted bundle. Defer a separate `noindex` toggle; technical users may supply the header through `_headers`, and documentation must make clear that indexing directives do not provide privacy or access control.

**Storage and concurrency**

Use one SQLite-backed Durable Object per installation. Store immutable, content-addressed file data with deduplication; split binary content into 512 KiB chunks to remain below SQLite’s row-size limit. Store project manifests, publication history, and operation records alongside it. Durable Objects are available on the free plan, but remain subject to quotas. [Storage limits](https://developers.cloudflare.com/durable-objects/platform/limits/)

Start with these v1 product limits, subject to the maximum-size free-account experiment. Lower them to a verified sensible default if necessary instead of building extensive quota workarounds:

- 20 projects per installation.
- 100 files and 25 MiB uncompressed content per project.
- 10 MiB per file.
- 250 MiB total retained file content, including staging.
- Latest 20 successful publication snapshots per project.
- Abandoned staging expires after 24 hours.

Document product limits and show retained-storage usage in plain language; do not build an account-wide quota dashboard. Refuse changes that exceed capacity without damaging existing content. Prune revisions beyond the stated retention window and garbage-collect unreferenced data; never delete the current publication to make space.

Every mutation carries the revision it was based on. Stale edits return a conflict and require rereading; they never silently overwrite newer work.

**Publication lifecycle**

Persist `staged → uploading → activating → published/failed` operation state. Use the staging ID as the idempotency key for staged publishes. For the combined stage-and-publish path, require a request key and bind it to the payload digest before creating the candidate, so a retry cannot create duplicate revisions. Reject key reuse with different input. Serialize publication per project and recheck the base revision before activation. Persist progress and schedule resumable work with Durable Object alarms rather than depending on the initiating HTTP request remaining open.

Upload the complete candidate asset set before activating the new Cloudflare deployment. Retain the previous live version during upload failures. Record Cloudflare version/deployment identifiers and reconcile ambiguous timeouts before retrying activation.

The public site uses an assets-only Workers Static Assets deployment at a separate `workers.dev` hostname, with no application Worker script, Publisher credentials, or administrative bindings. Verify this deployment path in the first publishing experiment. Retry reachability checks with bounded backoff for newly created hostnames; distinguish an activated deployment awaiting reachability from a confirmed deployment failure. Disable public version-preview URLs. Unpublish disables public serving; deletion removes the managed deployment and stored project data. Neither operation can retract copies visitors already downloaded.

## 4. Releases, trust, and documentation

Publish MIT-licensed source for the installer and Publisher, plus numbered release bundles built from pinned commits and locked dependencies.

Each release includes a signed manifest, checksums, build provenance, compatibility information, and human-readable release notes. The installed Publisher shows its version and an installation receipt. Document independent comparison of deployed modules with published artifacts; provenance alone does not prove safety or establish what a hosted installer actually deployed. [GitHub artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations)

Provide **Check for updates → review changes → Update Publisher**. Verify the release before deployment, preserve installation configuration and secrets, and record progress outside the initiating HTTP request. Publisher updates do not modify users’ website content.

Every Publisher upload must explicitly preserve existing secrets, especially the credential-encryption key, as well as bindings and installation settings. Use the API’s supported secret-preservation mechanism and test the actual upload path. Track and apply Durable Object migration tags correctly for the deployed version; keep the namespace and class identity stable. Do not replay creation migrations or casually rename the class. [Worker upload API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/)

Keep v1 schema migrations additive and backward-compatible. Retain a known-good release and provide recovery through the installer and Cloudflare’s dashboard. Do not promise that code rollback reverses database changes. [Cloudflare rollback behavior](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)

The owner UI shows the last operation, a sanitized actionable error, and credential health/reconnection status; never expose tokens or signed file URLs in logs or error messages.

Provide a documented, explicit full-uninstall procedure: optionally export first, remove only installation-owned site Workers, remove the Publisher and its Durable Object and OAuth KV storage, and revoke the Cloudflare grant or fallback token. Record resource identifiers in the installation receipt so dashboard cleanup remains possible if the Publisher is unavailable. Explain which deletions permanently destroy project history. Defer a one-click self-destruct feature.

The README must contain:

- The actual account requirements and illustrated installation flow.
- Clear explanations of each authorization step and its expected result.
- The explicit scope: **personal pages; smallish projects that need immediate visibility**. Supported artifacts, sensible defaults, product limits, troubleshooting, recovery, uninstall, and data ownership. Shared account quotas, unavailable names, account naming/verification, and provider acceptable-use requirements remain the user’s responsibility.
- Correct the preliminary “zero-click” and “KV as a decentralized Git alternative” claims in the first documentation pass; explain that Durable Objects retain snapshots, while KV supports OAuth. Preserve the historical brainstorm and notes rather than rewriting them as current promises.
- The current **Create custom MCP server** setup path, illustrated from the tested UI. No obsolete button-label note or historical developer-mode explanation is needed in the installation steps.
- A sourced pros/cons comparison with manual deployment, Git-based deployment, and hosted AI website builders. Emphasize ownership and later chat editing; acknowledge setup, quotas, static-only scope, and self-hosted maintenance.
- No unsupported claims that MCP eliminates model payload limits, guarantees client compatibility, or makes all workflows confirmation-free.

Add a detailed README block for technical readers explaining **how the workflow reduces effort and how it is secured**. Write it from verified implementation behavior, with an architecture/data-flow diagram and links to relevant source modules and tests. Cover:

- One-time setup versus everyday use; automatic project discovery, stable URLs, persistent files, exact patches, combined stage-and-publish, durable retry handling, and undo. Explain which confirmations belong to ChatGPT and why no Git repository, build service, or repeated manual upload is needed.
- The two authorization relationships, minimal Cloudflare scopes, PKCE and owner consent, single-use setup, validated callbacks, grant handoff and erasure at the installer, credential encryption/key location, refresh/reconnection, and dashboard recovery. Explain that encryption at rest does not protect against malicious code running in the Publisher or a compromised Cloudflare account.
- Trust boundaries between ChatGPT, Jumper MCP, the owner’s Publisher/storage, and public website origins; what each component receives and retains. Explain sibling-site threats, `__Host-` cookies, CSRF/origin checks, scoped MCP authorization, and why uploaded scripts never execute within the Publisher’s privileged context.
- Authorized file transfer, SSRF defenses, archive/path validation, bounded processing, secret-free logs, and the distinction between reviewed public artifacts and unrelated private conversation material. Explain that tool annotations and model instructions aid UX but are not security boundaries or a complete prompt-injection defense.
- Immutable snapshots, base-revision checks, idempotency, activation reconciliation, retention and garbage collection, export, unpublish, and deletion. Explain that public copies and caches cannot be recalled and that `noindex` is not privacy.
- Pinned releases, signatures/checksums, verification trust roots, provenance limits, independent deployed-code inspection, explicit updates, secret/binding preservation, migration compatibility, and recovery. State residual installer/update trust and demonstrate what remains functional during installer downtime.

Produce a short README GIF showing **prompt → public site → fresh-chat edit → undo**, plus a captioned video demonstrating the complete setup with real UI recordings. Separate one-time setup from everyday use. Use illustrations only to explain the architecture; ComfyUI is optional for decorative assets, never fabricated product screenshots.

Preserve the original brainstorm and independent review. Keep this plan as the implementation reference under `PRD/`; update the README’s preliminary promises in the first documentation pass and use verified behavior for the final launch materials.

## 5. Implementation order and acceptance tests

**First, validate external dependencies and the default operating envelope.**

1. Install on a free Cloudflare account owned by the available independent tester, outside the installer’s Cloudflare account and without GitHub. Test public OAuth visibility, actual granted scopes, initial subdomain setup when needed, grant handoff, refresh/rotation, and publishing while Jumper MCP is unavailable. Observe expiry metadata and simulate later use with idle/expired/revoked credentials and interruption during refresh. Use the specified API-token fallback if independent refresh cannot be demonstrated.
2. Using a ChatGPT account with the required custom-MCP access, connect through the current interface, verify registration/callback behavior, transfer an approved website and generated image, publish, then retrieve and edit the same site from a fresh conversation. Test missing/expired file references and the guided transfer fallback. The independent Cloudflare tester has a free-tier ChatGPT account: use that person for Cloudflare installation/ownership testing without making their ChatGPT eligibility a launch gate. Run the ChatGPT experiment separately on an eligible account; verify availability rather than assuming free-tier access.
3. Publish a project at the proposed maximum size on a free Cloudflare account, measuring edge Worker and Durable Object CPU/memory and exercising resumable uploads. Lower product limits if required and document the verified limits. Confirm assets-only serving, SPA deep links, explicit header/redirect configuration, and delayed hostname reachability.

Do not advertise token-free onboarding or seamless generated-asset transfer until the corresponding experiment passes. If the target ChatGPT surface cannot complete the workflow, block launch rather than quietly substituting a different product surface.

Then implement the project-storage module, publication module, MCP interface, owner UI, updates, and launch materials.

Automated integration tests must cover:

- Authentication, ownership, callback/client restrictions, granted-scope validation, credential rotation/revocation and reconnection.
- State-changing owner requests from an untrusted sibling site, including cookie-tossing attempts; unauthenticated access to every read/write tool and export link.
- Unsafe archives, blocked download destinations, unsupported projects, and quota exhaustion.
- Duplicate staged and combined publish requests, request-key misuse, interrupted uploads, activation timeouts, delayed hostname reachability, and simultaneous stale edits.
- Exact-patch match failures, bounded reads/search, elision/shrinkage warnings without corrupting legitimate rewrites, SPA routing, and header/redirect validation.
- Revision retrieval, export completeness, restore, unpublish, and confirmed deletion.
- Upgrade compatibility including secret preservation, post-update credential decryption, stable Durable Object identity/data, migration tags, damaged release rejection, failed upgrades, and installer-outage independence.

Manually verify the documented dashboard recovery and full-uninstall paths, including that unrelated account resources are left intact.

Finally, run a recorded novice usability test with a participant who has eligible ChatGPT access (or arrange that access for the independent tester): the user installs without coding help, publishes the reviewed site, updates it from a new chat, and undoes that update. Require no unexplained technical fields and no undisclosed setup steps. Use the observed successful workflow as the source for the README screenshots and launch video.
