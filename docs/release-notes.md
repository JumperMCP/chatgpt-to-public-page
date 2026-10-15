# 0.1.13 — opt-in sign-in for local AI clients

The Publisher can now accept sign-in from MCP clients that run on your own computer, such as coding agents in a terminal. These clients receive the sign-in result on a `localhost` address with a changing port. This is off by default. To turn it on, set the text variable `ALLOW_LOOPBACK_CALLBACKS` to `true` in the Publisher Worker's Cloudflare settings (Settings → Variables and Secrets). Publisher updates keep this setting.

When it is on, loopback callbacks (`http://localhost`, `127.0.0.1`, `[::1]`, any port) are accepted at registration, on the approval page and at approval. The rules are unchanged otherwise: public client, PKCE S256, and no credentials, query or fragment in the callback. When it is off, such a client is refused with a message naming the setting. For a local callback, the approval page warns that any program on that computer can open it, so approve only a sign-in you just started yourself. The approval page now says "your AI client" instead of ChatGPT. The configured ChatGPT callback is unchanged.

No migration, credential, or origin changes.
