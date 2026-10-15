# TODO

## Per-client access list and revoke

Approved MCP clients (ChatGPT, local AI clients via localhost callbacks) keep access until the owner resets the password, which signs out every client at once. Add a control-panel list of granted clients (name, callback, approval date, last use) with a revoke button per client. `@cloudflare/workers-oauth-provider` exposes grant listing and revocation (`listUserGrants`, `revokeGrant`). This matters most once `ALLOW_LOOPBACK_CALLBACKS` is on, because any local program can request access and the client name is self-reported.
