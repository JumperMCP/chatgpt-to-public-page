# 0.1.3 — clearer ownership and connection setup

Adds a distinct private-control-panel design for owner setup and settings. The hosting address, password ownership, reason for a publishing token, token-creation steps, and MCP URL location are explicit. The MCP URL is shown under Settings → Cloudflare → Installation receipt, alongside clearer ChatGPT plugin instructions.

Installer completion makes the handoff to the user’s Cloudflare-hosted Publisher clear. Progress updates in place instead of using meta-refresh, which Firefox blocked for the tester.

No storage migration or authentication changes. Existing projects, credentials, and owner passwords remain intact. Independent-account installation and receipt retrieval have been confirmed; ChatGPT testing awaits an account with custom MCP access.
