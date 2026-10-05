# Recovery and full uninstall

These are implementation-based procedures requiring a recorded live dashboard verification before launch. Dashboard labels can change; capture the tested labels in the final installation video.

## Lost owner password

You must control the Cloudflare account containing the Publisher. Jumper MCP is not required.

1. Open the Publisher Worker in the Cloudflare dashboard, then its Variables and Secrets settings.
2. Generate a cryptographically random one-time token on a trusted device. Store only its SHA-256 hex digest as `RECOVERY_TOKEN_HASH`; set `RECOVERY_EXPIRES_AT` to an epoch-millisecond time no more than one hour ahead. Never alter `CREDENTIAL_KEY` for a password reset.
3. Deploy the setting change while preserving all bindings and secrets.
4. Open `https://<publisher>/recover?token=<original-token>`, choose a new owner password, then reconnect ChatGPT. Successful recovery invalidates all owner sessions and earlier MCP owner epochs.
5. Remove the recovery settings after use. The Durable Object also records token consumption so it cannot be reused.

A local token helper is available as `npm run recovery-token`. It prints a token and its digest for your own dashboard session; do not paste that output into chat, issues, or build logs.

## Cloudflare credential failure

Sign in to the owner UI and enter a replacement account-scoped Workers Scripts Edit token. No website files need to be rebuilt. Credential rotation can require reconnection if Cloudflare rotated a token but its replacement response or durable write was lost. A revoked OAuth application is not equivalent to installer downtime.

If credential decryption fails after an update, restore the original `CREDENTIAL_KEY` Worker secret. A different key cannot decrypt the old ciphertext. If the original is unavailable, reconnect Cloudflare with a new credential. Do not destroy the Durable Object to recover a password or credential.

## Failed Publisher update

Keep the installation receipt and a known-good signed release outside the Publisher. Use Cloudflare's Worker deployment rollback or redeploy that bundle while explicitly preserving secrets and bindings. Keep the namespace, `Publisher` class, and deployed migration tag stable. Do not replay `new_sqlite_classes` against an existing installation. Code rollback does not undo database changes. The updater accepts only the current additive-compatible v1 schema/tag.

Independent inspection: download the installed Worker modules through the Cloudflare dashboard/API and compare each module checksum to the numbered release manifest. Validate the manifest signature against your previously recorded trust root. Build provenance attests a build, not the safety of the code or the contents of a particular installation. Verify deployed settings and bindings as well as code.

## Unpublish and delete a single project

Unpublish disables its `workers.dev` endpoint and preview URLs, keeping all retained files editable. Permanent deletion is available only in the owner UI and requires typing the project's exact ID. It removes the owned site Worker and that project's revisions; garbage collection removes unreferenced bytes. Downloaded public copies and external caches remain outside your control.

## Full uninstall

1. Optionally export every project you want to keep. Exports include original source files, including `_headers` and `_redirects`. Download each short-lived link promptly.
2. Save the receipt: Cloudflare account, Publisher Worker name, installation ID, Durable Object instance/class/namespace (from the Publisher binding in the dashboard), OAuth KV namespace ID, and each owned site Worker ID/name/tag. The UI shows the identifiers it knows; confirm namespace IDs in Cloudflare before deleting the Publisher.
3. Delete only site Workers whose names/IDs and `publisher:<installation>:<project>` ownership tags match that receipt. Do not delete unrelated Workers, namespaces, routes, or account settings.
4. Remove the Publisher Worker and its dedicated Durable Object namespace/storage. Cloudflare may require removing the binding/class through its supported migration/namespace cleanup path before deleting storage. Verify the namespace is gone: deleting code alone is not evidence storage was erased. This permanently destroys retained project history and encrypted credentials.
5. Delete the dedicated `OAUTH_KV` namespace. This removes client registrations/grants for this Publisher. Never delete a shared namespace.
6. Revoke the Cloudflare OAuth authorization or fallback API token used by this installation. Review whether the credential is used anywhere else before revocation.
7. If installation failed partway, use its progress record and the installation-specific namespace title (`publisher-oauth-<installation-id>`) and Worker ownership tag (`publisher-install:<installation-id>`) to identify leftover resources. Do not infer ownership from a friendly name alone.

There is no one-click self-destruct or account-wide cleanup operation. Perform and record this procedure against a disposable installation before advertising it as verified.
