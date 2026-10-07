# Publisher: OpenAI MCP Extensions deep dive

Date: 2026-10-05  
Status: Research follow-up; no implementation authorized  
Follows: [OpenAI MCP Extensions evaluation](mcp-extensions-evaluation-2026-10-05.md)  
Related plan: [Technical implementation plan](technical-plan.md)  
Source examined: [`openai/mcp-extensions`](https://github.com/openai/mcp-extensions) at commit `ca16cb3` (2026-10-02), npm `@openai/mcp-extensions@0.1.0` (published 2026-09-29)

## Summary

The first evaluation's direction holds: adopt incrementally, keep tools as the complete fallback, and fix authorization and publishing first. A closer reading of the spec, the SDK source, the Bits & Bolts example, and Publisher's own MCP code changes five things:

1. **Two layers, two availability levels.** The value comes from two stacked layers. *MCP Apps* (inline UI returned by a tool, plus ChatGPT's widget file APIs) is the broadly available base. *OpenAI MCP Extensions* (sidebar/thread entrypoints, settings, mentions, forms, file handlers) adds to it, and at launch the extensions reach the web only in the **Work browser**, not classic ChatGPT. Publisher's likely users are personal accounts on classic web. Build on the base layer and treat the extensions as progressive enhancement.
2. **File transfer has a candidate UI path.** Publisher's main unverified launch risk is getting exact artifact bytes, including generated images, from ChatGPT to the Worker ([acceptance ledger](../docs/acceptance.md)). A small MCP App could let the user pick or drop files and pass ChatGPT-hosted file references to the existing `stage_project` import path. That path does not rely on the model relaying file references correctly. It is unverified, but it targets the actual blocker. Extension file handlers and form file pickers do **not** solve this for a remote Worker (see below).
3. **Form elicitation is incompatible with Publisher today.** Publisher builds a fresh stateless server per request with JSON responses. Legacy elicitation needs a server-to-client request during a tool call. MRTR needs a newer protocol than SDK 1.32 implements. Defer forms.
4. **Plugin-identity features fit poorly.** Onboarding skills, deep links, directory listing, and per-plugin widget domains assume one shared plugin. Each Publisher is a separate, user-owned server URL. These features would need a central plugin in the path, which the architecture rejects.
5. **One plan amendment is needed before any UI work.** The technical plan defers MCP resources, and any MCP App needs a `ui://` resource. Server-only extensions (settings, mentions, forms) need none (see [Which features need a `ui://` resource](#which-features-need-a-ui-resource)). The first evaluation's preview panel is dropped: ChatGPT's split-pane view already previews the website before anything reaches Publisher, which is why the plan excludes a preview system.

Recommended order: **(0)** finish the OAuth/publishing gate → **(1)** a one-day capability probe → **(2)** an inline "publish files" MCP App, if the probe shows UI renders → **(3)** a project browser with "edit in new chat" → **(4)** optional settings, mentions, and desktop file handling.

## What the repository actually contains

| Part | Content | Relevance to Publisher |
| --- | --- | --- |
| [`docs/spec.md`](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md) | Wire-level definitions for every extension, with a platform matrix | Authoritative behavior; most features need only `_meta` fields and a few tools |
| `typescript/src/server` (~800 lines) | `OpenAIExtensions(server)` → `settings.register`, `mentions.setHandler`, `elicitInput`; Zod schemas for entrypoint/display-mode metadata | Thin helpers. Publisher can emit the same wire format directly |
| `typescript/src/app` (~700 lines) | Wrappers over `@modelcontextprotocol/ext-apps` `App`: `modelContext`, `message`, `deepLink`, `resources`, `files`, styles | Useful in an MCP App bundle; each API is `undefined` when the host does not advertise it |
| `typescript/styles.css` | ChatGPT-matching controls (`btn`, `card`, `form-control`, `cursor-interaction`) | Inline it; the iframe CSP blocks external stylesheets |
| `plugins/bits-and-bolts` | Kitchen-sink reference (stdio, local Node, React/Three.js) | Shows registration patterns; the store, file paths, and stdio transport do not transfer to a Worker |
| `python/` | Equivalent server package | Not relevant |

The package is version 0.1.0 and four days old at the time of writing. Comments still say "Codex" in places. Treat the API as unstable.

## Feature-by-feature assessment

"Availability" restates the repository's [platform matrix](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md#platform-support). It describes expected DevDay support, not verified behavior for a developer-mode custom connector.

| Mechanism | Availability | Fit for Publisher | Verdict |
| --- | --- | --- | --- |
| Inline MCP App (tool `_meta.ui.resourceUri` → `ui://` HTML) | Base MCP Apps; renders on classic web too | Project cards, operation status, upload widget | **Build first**, after the probe |
| Widget file APIs `uploadFile`, `selectFiles`, `getFileDownloadUrl` ([reference](https://developers.openai.com/plugins/reference#file-apis)) | ChatGPT widget runtime, feature-detected; the file library "may not be available to all users" | Direct route to exact bytes, including library and generated images | **Highest-value experiment** |
| App-only tools (`_meta.ui.visibility: ["app"]`) | MCP Apps | UI helpers without enlarging the model's tool list | Use for UI plumbing only |
| Global (sidebar) and thread entrypoints | All platforms, but web means the Work browser only | Project browser opened without a prompt | Add to the same app as an enhancement |
| `ui/message` with `target: "new"` | Desktop and web; mobile active thread only | "Edit in a new chat" button that seeds project ID and revision | **Strong fit** for the fresh-chat editing promise |
| `ui/update-model-context` | All platforms | Attach the selected project/revision as removable context, or `audience: ["assistant"]` hidden context | Good fit; convenience, never authorization |
| Display modes | All | Fullscreen browser, inline status cards | Trivial metadata |
| Structured settings | All platforms | Few real preferences. Buttons could show Publisher status or open the control panel | Low value; cheap if it appears for custom connectors |
| Composer mentions | Desktop only | `@my-portfolio` to target a project in a fresh chat | Later; desktop-only |
| File entrypoint, resource read/write/subscribe, `openai/files/open`, `_meta["openai/resource"].path` | Desktop only | Operates on **host** files: ChatGPT intercepts `resources/read`, and paths name the user's machine | Not a Publisher file editor. Possible desktop "publish this local ZIP/folder" later |
| OpenAI form elicitation (thumbnails, suggestions, resource picker) | Desktop and Work web; not mobile | Hostname choice, warning acknowledgement | **Blocked** by stateless transport; see below |
| Plugin onboarding skill | Requires a plugin manifest | Setup guidance | Needs a shared plugin identity; poor fit |
| Deep links | Need a public plugin ID or marketplace name | Links into a project page | Poor fit for per-user servers |

## Findings that change the first evaluation

### MCP Apps, not extensions, is the broad base

The platform matrix says: "Web refers to the Work browser; classic ChatGPT is excluded." The official overview adds that web extensions are "coming soon to ChatGPT Free and Go users." Classic-web Plus and Pro users get neither the sidebar nor the thread entrypoint today. Inline MCP App UI is the standard Apps mechanism and is not in that matrix.

The project browser should therefore be **one MCP App reachable three ways**:

- inline, from a model-visible tool such as `open_projects`;
- from a global entrypoint where supported;
- from a thread entrypoint where supported.

Entrypoint tools must accept `{}` and render their first result without a second call. Unsupported hosts ignore the extra metadata.

### Which features need a `ui://` resource

Most of the extensions are additions *to* an MCP App, so they need a `ui://` resource. Three are server-only.

| Needs an MCP App (`ui://` resource + tool `_meta.ui.resourceUri`) | Server-only (tools, capabilities, or server requests) |
| --- | --- |
| Global, thread, file, and settings-page entrypoints (each opens an app) | Structured settings: two tools plus an `initialize` capability. Plain-tool buttons show the result text as a tooltip; only an "MCP App tool" button needs UI |
| `ui/update-model-context`, `ui/message`, deep links, display modes | Composer mentions: one `search_mentions` tool with `visibility: ["app"]` returning resource links. "app" here means host-invoked; no resource needed |
| Resource read/write/subscribe and `openai/files/open` (app-side APIs) | OpenAI form elicitation: a server-to-client request (blocked by transport, see below) |
| Widget file APIs (`uploadFile`, `selectFiles`) | Plugin onboarding: a plugin manifest field (blocked by plugin identity) |

The server-only items are the cheapest way to test whether a custom connector receives extensions at all. They are also the least valuable for Publisher: mentions are desktop-only, settings have little to configure, and forms are blocked.

### MCP Apps works with Publisher's current stack

MCP Apps is the official optional MCP extension `io.modelcontextprotocol/ui` ([spec](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)), not an OpenAI addition. It requires no protocol upgrade and no SDK change:

- Register a resource with MIME type `text/html;profile=mcp-app` through `McpServer.registerResource`, and set `_meta.ui.resourceUri` on a tool. SDK 1.32 passes tool `_meta` through unchanged. The `@modelcontextprotocol/ext-apps` server helpers are optional sugar.
- The stateless, per-request transport is fine. The app talks to ChatGPT over `postMessage`. ChatGPT forwards the app's `tools/call` and `resources/read` as ordinary requests over the user's existing OAuth connection, so the app never holds a token.
- Hosts without Apps support ignore the metadata and show the tool's text result, so the existing text output remains the fallback.

Two things are open. Is `ui://` rendering available to developer-mode custom connectors on the tester's plan? (The probe below answers this.) And the technical plan's resource deferral needs its narrow amendment. The constraint is the plan, not the technology.

### Plan and tool access

A third-party guide dated 2026-05-07 states: "Plus and Pro can install a custom MCP connector. They can call any read-only tool. They cannot call write-shaped tools," and "Write-capable custom MCP is currently limited to Business, Enterprise, and Edu workspaces." This is not verified against current OpenAI documentation; record it in the probe. If true, Work accounts are both where write tools work and where web extensions launch first. That would affect who Publisher can serve at all, not just the UI.

### File transfer: what can and cannot carry bytes

| Path | Bytes reach the Worker? | Notes |
| --- | --- | --- |
| Model passes `openai/fileParams` reference (current design, [`src/mcp.ts:111`](../src/mcp.ts)) | Yes, if the model selects the right attachment | Unverified; depends on model behavior and attachment state |
| Widget `uploadFile` / `selectFiles` → `getFileDownloadUrl` → app calls `stage_project` with `{ download_url, file_id }` | Yes, via the existing allowlisted download in [`importFiles`](../src/mcp.ts) | The user picks the bytes explicitly. Needs verification that app-initiated calls accept file objects and which host serves the URL |
| Widget reads a dropped file and sends base64 through an app-only chunk tool | Yes, but bounded by the 1 MiB MCP body and base64 overhead | Requires new chunked-staging code; fallback only |
| Form resource picker (`x-openai-input`, `userOptions`) | **No** for a remote server | Returns URIs such as `file:///…` from the user's host. Web forms from apps forbid uploads |
| File entrypoint `resources/read` | Only via the app, desktop only | Reads a host file the user opened. The app could relay a ZIP to `stage_project` |

The widget route keeps Publisher's guarantees intact. The domain operation stays `stage_project`, with the same limits, ZIP checks, candidate privacy, and explicit publish. It also addresses the acceptance item "Real approved artifact and generated-image transfer". Feature-detect `window.openai?.uploadFile` and `selectFiles`, and fall back to the attach/export instruction.

### Elicitation cannot run on Publisher's transport

[`handleMcp`](../src/mcp.ts) constructs a new `McpServer` per HTTP request. It uses `sessionIdGenerator: undefined` and `enableJsonResponse: true` ([`src/mcp.ts:301`](../src/mcp.ts)). The SDK's `elicitInput` has two requirements. First, `getClientCapabilities()` must show `extensions["openai/elicitation"]`. A per-request server never sees `initialize`, so this is always undefined and the helper throws. Second, the server must send a request back to the client mid-call, which JSON-response mode cannot do.

The spec's alternative, MRTR, requires protocol `2026-07-28`. The installed SDK 1.32.0 tops out at `2025-11-25` and has no MRTR or `server/discover`. Forms need either sessions, which conflicts with the stateless Durable Object routing, or an SDK v2 migration. Neither is justified for the first UI increment. Publisher's flows don't need forms: ChatGPT already confirms write tools, and warnings use `acknowledge_warnings`.

### Per-user servers and plugin identity

Bits & Bolts ships as a Codex plugin with `.codex-plugin/plugin.json`, a marketplace entry, and an `onboardingSkill`. It is also listed once in the ChatGPT plugin directory. Deep links name `pluginId@marketplace`. `_meta.ui.domain` is "required when submitting a plugin with UI; must be unique per plugin."

Every Publisher has its own origin and OAuth server, so no single listing can point at all of them. The only ways to get these features are:

- a central Jumper plugin that routes to each Publisher, which reintroduces the central dependency the architecture avoids;
- per-user local marketplace packaging, which is Codex/desktop-only.

Keep developer-mode custom connectors, and do not plan around onboarding, deep links, or directory listing.

One upside of self-hosting: each Publisher serves its own `ui://` resource. CSP fields (`connectDomains`, `frameDomains`, `openai/widgetCSP.redirect_domains`) can be generated per installation, for example to allow `openExternal` to the owner's `*.<subdomain>.workers.dev` sites. The UI code also ships inside the signed release, so the existing [release verification](../src/releases.ts) covers it.

### The first proposal's file viewer/editor needs restating

File entrypoints open *host* files, and ChatGPT, not the server, answers `resources/read` for them. A "Publisher file editor" that edits stored revisions would be an ordinary MCP App calling `read_files` and `edit_file`, with `base_revision` and conflict handling. It would not be a file entrypoint. A desktop file handler is useful only for the opposite direction: opening a local site ZIP and publishing it. Even then, registering `.html` would replace ChatGPT's default HTML viewer for every HTML file. Prefer `.zip` if this is ever pursued.

## Compatibility notes for the Worker

- **Dependencies.** `@openai/mcp-extensions` peers `@modelcontextprotocol/sdk ^1.29.0` (Publisher pins 1.32.0, compatible) and `@modelcontextprotocol/ext-apps ^1.7.5`. ext-apps 2.x has moved to the split SDK v2 packages, so pin 1.7.x. The package pins `zod 4.4.3` while Publisher pins 4.6.5, which bundles two Zod copies. `settings.register` mixes schemas across them. Its server-side value is small, so emit settings and mention wire format directly from Publisher code. Use the app package only inside the UI bundle. `@cfworker/json-schema` is Workers-friendly.
- **Icons.** SDK 1.32's `McpServer` tools/list emits `title`, `annotations`, and `_meta` but drops `icons`. Entrypoint icons then fall back to `serverInfo.icons`, so set an SVG icon in the `McpServer` implementation info.
- **Capabilities.** `registerCapabilities({ extensions: … })` validates in SDK 1.32, and per-request servers still answer `initialize` correctly, so settings capability advertisement works statelessly.
- **Build.** Publisher has no frontend build; HTML lives in template strings ([`src/owner-ui.ts`](../src/owner-ui.ts)). An MCP App needs one bundled, inlined HTML document. esbuild ships with Wrangler and can produce it. Avoid React to keep the Worker bundle small. Version the `ui://` URI per release (Bits & Bolts uses `app-v14`), because hosts cache templates.
- **Structured output.** Tools now return JSON as text. UI rendering wants `structuredContent`, which can be added alongside the text block without changing tool contracts. Mark text that duplicates structured content `audience: ["assistant"]`.

## Security requirements

These add to the first evaluation's requirements; they do not replace them.

1. **The widget is privileged.** Through the host bridge it can call every Publisher tool with the user's grant. An XSS in the widget equals full project write and publish access. Render all project names, paths, file contents, and provider errors as text, never HTML.
2. **Never render user-site HTML inside the widget.** ChatGPT's split pane already previews sites before publishing, so Publisher has no reason to. Keep the default CSP, which blocks subframes; do not add `frameDomains` or `srcdoc` frames. Uploaded site scripts would otherwise run next to the tool bridge. Show manifests, diffs, history, and the public URL via `openExternal`.
3. **App-only tools get no special privileges.** `visibility: ["app"]` hides a tool from the model, not from any caller holding the token. Every app tool keeps ownership, scope, epoch, and `base_revision` checks. Never add an app-only shortcut that publishes without a fresh base.
4. **Publish stays a separate, explicit action.** Selecting a project, updating model context, or opening a new chat must not stage or publish. Check whether ChatGPT shows its write confirmation for app-initiated `publish_project`. If not, the widget's Publish button is the user's only confirmation and must state that files become public.
5. **Credentials never enter the UI.** API tokens, owner passwords, and update approval stay in the owner UI. Settings buttons may link to the owner control panel but must not proxy its actions.

## Plan amendment required

**Resources:** permit `ui://` MCP App templates only. Keep project data on tools; the deferral of project resources stands. A future mentions feature may return `resource_link` items that the model resolves with `get_project`, without implementing `resources/read` for projects.

The plan's "No separate website-preview system: users review in ChatGPT" stays unchanged. ChatGPT's split-pane view previews the site on ChatGPT's domain before anything is published. The first evaluation's "conversation preview panel" is withdrawn; any Publisher app covers project state, not rendering.

## Proposed sequence

**0. Gate (unchanged).** Fix the `/authorize` failure. Then complete the publishing and fresh-chat acceptance experiments with tools only.

**1. Capability probe (about one day, operator account first).** On a branch, log a sanitized summary of each `initialize` request: `clientInfo`, protocol version, and the keys under `capabilities.extensions` and `capabilities.experimental`. Never log tokens. Add one throwaway `ui://` resource and a `{}` tool carrying `global` and `thread` entrypoints and `preferredDisplayMode: "fullscreen"`. In the app, log `hostCapabilities` (`openai/modelContext`, `openai/message`, `openai/files`, `openai/resource`) and the presence of `window.openai.uploadFile` and `selectFiles`. Record results for each surface: classic web, Work web if available, desktop, and mobile. Also record account plan and whether write tools are permitted. Add the results to [acceptance](../docs/acceptance.md).

**2. Publish-files app, if the probe shows inline UI and file APIs.** An inline app offered by the model when attachments are missing or ambiguous. The user selects or drops a ZIP or files, and the app calls `stage_project` with the obtained reference. It then shows the candidate manifest and warnings, and requires an explicit Publish click that calls `publish_project` with `base_revision`. Accept when exact bytes, including a generated image, arrive through this path. Without the app, the tool path and the attach/export fallback must still work.

**3. Project browser.** Same app, with project list, history, publication state, and public links. Add "Edit in a new chat" through `ui/message { target: "new" }`, with project ID and current revision as text. Use model-context updates for the selected project. Add global and thread entrypoints where they are advertised. Accept with the first evaluation's criteria, minus the preview panel (review happens in ChatGPT's split pane).

**4. Optional.** Composer mentions on desktop, using the existing `list_projects` search. Settings, only if they appear for custom connectors and there is a real preference to expose. A desktop `.zip` file handler. Forms, only after an SDK migration with MRTR.

## Open questions for the probe

- Do developer-mode custom connectors receive entrypoints and settings at all, or only registered plugins?
- Can app-initiated `tools/call` carry `openai/fileParams` objects, and which host serves `getFileDownloadUrl` URLs? Add only that host to `FILE_DOWNLOAD_HOSTS`.
- Does ChatGPT apply write-tool confirmation to app-initiated calls?
- Are `uploadFile` and `selectFiles` available on the tester's plan, and can `selectFiles` return images ChatGPT generated in the conversation?
- What size limits apply to widget uploads compared with Publisher's 25 MiB project and 10 MiB file limits?

## Sources

- [Repository README](https://github.com/openai/mcp-extensions/blob/main/README.md), [spec](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md), [TypeScript SDK README](https://github.com/openai/mcp-extensions/blob/main/typescript/README.md), [Bits & Bolts](https://github.com/openai/mcp-extensions/tree/main/plugins/bits-and-bolts): read at commit `ca16cb3`, including `typescript/src/server/{settings,mentions,ui}.ts`, `forms/elicitation.ts`, and `plugins/bits-and-bolts/src/server/register.ts`
- [OpenAI plugin extensions overview](https://developers.openai.com/plugins/build/extensions) (web availability, MRTR requirement)
- [OpenAI plugin reference](https://developers.openai.com/plugins/reference) (CSP fields, `ui.domain`, widget file APIs, tool visibility)
- npm registry metadata for `@openai/mcp-extensions`, `@modelcontextprotocol/ext-apps`, `@modelcontextprotocol/sdk` (checked 2026-10-05)
- Installed `@modelcontextprotocol/sdk@1.32.0` source (`LATEST_PROTOCOL_VERSION`, `McpServer` tools/list, streamable HTTP JSON mode)
- Third-party, unverified: [MCP Playground, "How to Test Your MCP Server with ChatGPT"](https://mcpplaygroundonline.com/blog/test-mcp-server-with-chatgpt-and-openai) (2026-05-07) on developer-mode write restrictions by plan
