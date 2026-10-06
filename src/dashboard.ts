import type { Projects } from "./projects";
import type { Operation } from "./types";
import type { Update } from "./updates";
import { cloudflareSettings } from "./owner-ui";
import { escapeHtml as e, form, hidden } from "./ui";

export function dashboard(input: {
  origin: string;
  account: string;
  version: string;
  csrf: string;
  projects: ReturnType<Projects["list"]>;
  operations: Operation[];
  connected: boolean;
  update?: Update;
  receipt: unknown;
}) {
  const {
    origin,
    account,
    version,
    csrf,
    projects,
    operations,
    connected,
    update,
    receipt,
  } = input;
  const rows = projects.projects
    .map(
      (p) =>
        `<article class="project-row"><div class="project-title"><h3>${e(p.name)}</h3><span class="status ${p.live ? "live" : ""}">${p.live ? "Published" : "Private / unpublished"}</span></div><a class="project-url" href="${e(p.url)}" target="_blank" rel="noreferrer">${e(new URL(p.url).hostname)} ↗</a><details><summary>Manage project</summary><small>Project ID: ${e(p.id)}</small><div class="project-actions">${p.head ? form("/export", csrf, hidden("project", p.id) + '<button class="quiet-button">Export files</button>') : ""}${form("/unpublish", csrf, hidden("project", p.id) + hidden("base", p.head) + '<button class="quiet-button">Unpublish</button>')}</div><details><summary>Delete permanently</summary>${form("/delete", csrf, hidden("project", p.id) + hidden("base", p.head) + `<label>Enter <code>${e(p.id)}</code> to delete this project and its history<input name="confirmation" required autocomplete="off"></label><button class="danger">Delete project permanently</button>`)}</details></details></article>`,
    )
    .join("");
  const activity = operations
    .map((op) => {
      const project = projects.projects.find((p) => p.id === op.project);
      return `<article class="operation"><div class="operation-head"><strong>${e(project?.name ?? op.kind)}</strong><span>${e(op.state)}</span></div><time datetime="${e(new Date(op.created).toISOString())}">${e(new Date(op.created).toISOString().replace("T", " ").slice(0, 16))} UTC · ${e(op.kind)}</time>${op.reachable === false ? "<p>Awaiting public address availability</p>" : ""}${op.error ? `<p>${e(op.error.message)}</p>` : ""}<details><summary>Operation details</summary><code>${e(op.id)}</code><p>Attempts: ${e(op.attempts)}</p></details></article>`;
    })
    .join("");
  return `<div class="workspace"><section class="panel projects-panel"><div class="panel-heading"><h2>Your public projects</h2><small>${projects.projects.length} projects · ${(projects.retained_bytes / 1024 / 1024).toFixed(2)} / 250 MiB</small></div><div class="panel-scroll" tabindex="0" role="region" aria-label="Projects">${rows || '<div class="empty"><strong>Your first site starts in a chat.</strong><p>Connect ChatGPT, choose the files you want to share, and ask Publisher to publish them here.</p></div>'}${projects.next_cursor ? '<p class="help">Showing the first 50 projects. Ask Publisher in ChatGPT to list more.</p>' : ""}</div></section>
<section class="panel connect-panel" id="installation-receipt"><div class="panel-heading"><h2>ChatGPT connection</h2></div><div class="panel-scroll" tabindex="0" role="region" aria-label="ChatGPT connection and installation receipt"><p>Publish from a chat. Pick up from any session.</p><label for="mcp-url">MCP server URL</label><input id="mcp-url" readonly value="${e(origin)}/mcp"><p class="help">Use this URL from your Cloudflare installation receipt in ChatGPT → Plugins → Add custom MCP server.</p><details><summary>Installation receipt & connection help</summary><p>If the option is missing, check Settings → Security and login → Developer mode. Availability depends on your ChatGPT account and workspace.</p><pre>${e(JSON.stringify(receipt, null, 2))}</pre></details></div></section>
<section class="panel activity-panel"><div class="panel-heading"><h2>Recent operations</h2><a href="/" class="help">Refresh</a></div><div class="panel-scroll" tabindex="0" role="region" aria-label="Recent operations">${activity || "<p>No operations yet. Publication progress will appear here.</p>"}</div></section>
${cloudflareSettings(origin, account, csrf, connected)}
<section class="panel updates-panel"><div class="panel-heading"><h2>Publisher updates</h2></div><div class="panel-scroll" tabindex="0" role="region" aria-label="Publisher updates"><p>Installed version: <strong>${e(version)}</strong></p><p>Installed from: <a href="https://chatgpt-to-public.jumpermcp.dev/" target="_blank" rel="noreferrer">jumpermcp.dev</a></p><p>Update state: ${e(update?.state ?? "No update checked")}.</p>${update?.error ? `<p role="alert">${e(update.error.message)}</p>` : ""}${form("/updates/check", csrf, "<button>Check for updates</button>")}${update?.state === "review" ? `<h3>Review ${e(update.release.manifest.version)}</h3><pre>${e(update.release.manifest.notes)}</pre>${update.release.manifest.version === version ? '<p role="status">You already have this version installed.</p>' : form("/updates/apply", csrf, hidden("update", update.id) + "<button>Update Publisher</button>")}` : ""}<details><summary>How updates work</summary><p>Publishing pauses between steps during an update and resumes afterward. Your projects stay in your Cloudflare account.</p></details></div></section></div><div class="inline-meta"><small>${e(new URL(origin).hostname)}</small><span class="status ${connected ? "live" : ""}">${connected ? "Website publishing connected" : "Connect Cloudflare in Settings"}</span></div>`;
}
