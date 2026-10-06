import { cloudflareBadge } from "./owner-assets";
import { ownerStyle } from "./owner-style";
export const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export function page(
  title: string,
  body: string,
  status = 200,
  headers: HeadersInit = {},
  formRedirect?: string,
  cockpit = false,
  footerActions = "",
) {
  const out = new Headers(headers);
  out.set("Content-Type", "text/html; charset=utf-8");
  out.set("Cache-Control", "no-store, no-transform");
  out.set("Referrer-Policy", "same-origin");
  out.set("X-Content-Type-Options", "nosniff");
  out.set(
    "Content-Security-Policy",
    `default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'self'${formRedirect ? " " + new URL(formRedirect).origin : ""}; frame-ancestors 'none'; base-uri 'none'`,
  );
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Publisher</title><style>${ownerStyle}</style></head><body class="${cockpit ? "cockpit" : "owner-page"}"><a class="skip-link" href="#main">Skip to content</a><div class="shell"><header class="topbar"><div class="brand-block"><a class="brand" href="/">Publisher<small>In your Cloudflare account</small></a></div><img class="cloudflare-badge" src="${cloudflareBadge}" width="254" height="88" alt="Protected by Cloudflare"></header><main class="page-main" id="main">${cockpit ? "" : `<h1>${escapeHtml(title)}</h1>`}${body}</main><footer><div class="footer-owner"><span>Hosted in your Cloudflare account · You control this Publisher</span>${footerActions}</div><a href="https://jumpermcp.dev" target="_blank" rel="noreferrer">Made by Jumper MCP</a></footer></div></body></html>`,
    { status, headers: out },
  );
}
export function hidden(name: string, value: unknown) {
  return `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`;
}
export function form(action: string, csrf: string, body: string) {
  return `<form method="post" action="${escapeHtml(action)}">${hidden("csrf", csrf)}${body}</form>`;
}
