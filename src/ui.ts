export const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export function page(
  title: string,
  body: string,
  status = 200,
  headers: HeadersInit = {},
  formRedirect?: string,
) {
  const out = new Headers(headers);
  out.set("Content-Type", "text/html; charset=utf-8");
  out.set("Cache-Control", "no-store, no-transform");
  out.set("Referrer-Policy", "same-origin");
  out.set("X-Content-Type-Options", "nosniff");
  out.set(
    "Content-Security-Policy",
    `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'${formRedirect ? " " + new URL(formRedirect).origin : ""}; frame-ancestors 'none'; base-uri 'none'`,
  );
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Publisher</title><style>body{font:17px/1.6 system-ui;max-width:850px;margin:48px auto;padding:0 24px;color:#172b3a;background:#f7faf9}h1{line-height:1.15}a{color:#075c58}form,section{background:white;border:1px solid #ccdcd8;border-radius:12px;padding:20px;margin:20px 0}label{display:block;margin:10px 0}input,textarea,button{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}input,textarea{width:100%}button{background:#075c58;color:white;border:0;border-radius:5px;cursor:pointer}code,pre{overflow-wrap:anywhere;white-space:pre-wrap}small{color:#475c62}</style><nav><a href="/">Your Publisher</a></nav><main><h1>${escapeHtml(title)}</h1>${body}</main></html>`,
    { status, headers: out },
  );
}
export function hidden(name: string, value: unknown) {
  return `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`;
}
export function form(action: string, csrf: string, body: string) {
  return `<form method="post" action="${escapeHtml(action)}">${hidden("csrf", csrf)}${body}</form>`;
}
