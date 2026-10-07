# Publisher: OpenAI MCP Extensions evaluation

Date: 2026-10-05  
Status: Proposed follow-up; implementation deferred  
Related plan: [Technical implementation plan](technical-plan.md)

## Decision

OpenAI's MCP Extensions repository is relevant to Publisher as an optional interface layer inside ChatGPT. Adopt it incrementally after installation, authorization, publishing, and updates work reliably in the independent-account experiment.

The first candidate is a project browser with a conversation preview panel. Preserve the existing MCP tools as the complete fallback. The repository does not establish a fix for Publisher's current Cloudflare updater or OAuth consent failures, and it does not replace the user-owned Cloudflare architecture.

This document records research findings and a proposed product direction. It does not authorize implementation or change the launch scope of the existing technical plan.

## Problem and opportunity

Publisher already exposes tools for discovering projects, reading revision-specific files, staging edits, publishing, undo, and export. Users would benefit from seeing which project they are editing, reviewing a candidate visually, and opening an existing project in a new conversation.

The extensions provide ChatGPT entrypoints and app interactions that could support those tasks without moving project storage or publication into a central Jumper MCP service.

## Verified findings

- The TypeScript package, `@openai/mcp-extensions`, extends the official MCP and MCP Apps SDKs. It exposes separate server and app entrypoints and can be added to an existing `McpServer`. This is compatible in architectural direction with Publisher's current MCP SDK use; exact dependency compatibility and Workers execution have not been tested. [TypeScript SDK](https://github.com/openai/mcp-extensions/blob/main/typescript/README.md)
- Supported extension mechanisms include sidebar apps, conversation panels, plugin settings, file viewers/editors, deep links, model–app context sharing, composer mentions, rich forms, and onboarding. Their availability depends on the host and platform. [Official extension overview](https://developers.openai.com/plugins/build/extensions)
- The SDK includes resource reading, subscriptions, and writes with conflict handling. These are useful building blocks for a file interface, but do not by themselves provide a verified ChatGPT-to-Cloudflare artifact-transfer path. Filesystem examples using local Node filesystem APIs cannot be assumed to work on a remote Publisher Worker. [TypeScript SDK](https://github.com/openai/mcp-extensions/blob/main/typescript/README.md)
- Extensions can be unavailable even after initialization. Integrations must detect supported capabilities and retain fallbacks. [TypeScript SDK](https://github.com/openai/mcp-extensions/blob/main/typescript/README.md)

## Platform constraints

The repository's platform matrix describes **expected support at DevDay launch**. Its “Web” column means the **Work browser**, explicitly excluding classic ChatGPT. It is not evidence that every tester account has these features.

| Mechanism | Desktop | Work browser | iOS / Android |
| --- | --- | --- | --- |
| Global/sidebar and thread entrypoints | Supported | Supported | Supported |
| Structured settings | Supported | Supported | Supported |
| File entrypoints, file opening, and file resources | Supported | Not supported | Not supported |
| Composer mentions | Supported | Not supported | Not supported |
| OpenAI form elicitation | Supported | Supported | Not supported |

Source: [Repository platform matrix](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md#platform-support).

The official overview also says web extensions are coming soon to Free and Go users. Consequently, account eligibility, rollout, and the exact ChatGPT surface must be checked again before implementation. Do not present desktop file capabilities as a solution to the current browser tester's file-transfer needs. [Official extension overview](https://developers.openai.com/plugins/build/extensions)

## Proposed Publisher features

These are product proposals inferred from the extension mechanisms, not existing Publisher functionality.

| Priority | Proposed feature | User benefit |
| --- | --- | --- |
| First | Sidebar project browser | Find existing websites and inspect publication status and revision history. |
| First | Conversation preview panel | Review a selected candidate beside the conversation, with clear publish controls. |
| First | Selected-project context sharing | Keep ChatGPT informed of the project and revision the user selected. |
| Later | Composer project mentions | Select an existing project when starting a fresh desktop conversation. |
| Later | File viewer/editor | Open supported files in a Publisher-specific preview or editor on compatible hosts. |
| Later | Structured preferences and onboarding | Explain supported setup steps and expose ordinary product preferences inside ChatGPT. |

## Requirements and boundaries

1. Reuse Publisher's domain operations and revision checks; do not create a second publishing or storage implementation inside the app UI.
2. Treat selected-project context as a convenience, not authorization. Validate project ownership and revision freshness on every server operation.
3. Require explicit publishing intent. Opening a preview, selecting a project, or editing a file must not publish it automatically.
4. Keep Cloudflare API tokens and owner-password setup in the user's Publisher. Do not move credential entry into conversation context or model-visible settings.
5. Isolate untrusted website previews from privileged Publisher controls and credentials. Select the preview isolation approach before implementing the panel.
6. Retain existing MCP tool workflows on hosts without extensions. Unsupported capabilities must not break connection or ordinary publishing.
7. Preserve the technical plan's deferral of MCP resources until a concrete UI requirement justifies them. Adding an interface is not permission to rewrite the existing tool contracts.
8. Keep file-transfer validation as a separate acceptance experiment, including authorization, actual bytes, supported hosts, expiry, and size limits.

## Delivery and acceptance

Start only after the core independent-account workflow is reliable. Then run a bounded integration experiment with the TypeScript SDK on the existing Worker and one supported ChatGPT surface.

The first increment is successful when a user can open the project browser, select a project, see its current revision and publication state, review a candidate beside the chat, and explicitly publish through existing operations. A stale revision must still be rejected. Selecting or previewing a project must cause no publication side effects.

Record the tested ChatGPT surface, account eligibility, SDK versions, and supported capabilities. Demonstrate the same project workflow through ordinary tools when extensions are absent. Reassess desktop mentions and file handling only after this first increment passes.

## Conclusion

The repository offers a useful route to a more discoverable and visual Publisher experience. Prioritize a small project browser and preview panel after core reliability; treat desktop file handling and mentions as subsequent enhancements. No repository or deployment changes are required merely to keep this option open.
