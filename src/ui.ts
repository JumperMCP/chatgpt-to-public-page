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
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Publisher</title><style>*{box-sizing:border-box}html{color-scheme:light dark;scroll-padding-top:24px}body{--bg:#f1f3ef;--card:#fff;--ink:#20352c;--muted:#57675f;--line:#d5dfd7;--accent:#246447;margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 ui-sans-serif,system-ui,sans-serif}body>nav,main,footer{max-width:1000px;margin:auto;padding:28px 32px}body>nav{display:flex;justify-content:space-between;gap:24px;border-bottom:1px solid var(--line)}nav .brand{font-size:20px;font-weight:700;text-decoration:none;color:var(--ink)}nav small{display:block;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:var(--muted)}nav .links{display:flex;gap:24px;align-items:center;font-size:14px}main{padding-top:44px;padding-bottom:60px}h1{font-size:clamp(30px,4vw,44px);line-height:1.15;letter-spacing:-1.3px;margin:0 0 22px}h2{font-size:24px;line-height:1.3;margin:0 0 15px;letter-spacing:-.5px}h3{font-size:19px;margin:26px 0 12px}p{max-width:76ch;margin:12px 0;color:var(--muted)}a{color:var(--accent);text-underline-offset:3px}a:hover{text-decoration-thickness:2px}.lead{font-size:19px;max-width:650px}.identity{background:#e2ece4;border:1px solid var(--line);padding:20px 24px;border-radius:14px;margin:24px 0}.identity span,.eyebrow{display:block;font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:700;margin:0 0 6px;color:var(--accent)}.identity strong{display:block;font-size:18px;overflow-wrap:anywhere}.identity p{font-size:14px;margin-bottom:0}section,main>form{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:28px;margin:24px 0;box-shadow:0 3px 10px #18352505}section section,section form{box-shadow:none}form{margin:20px 0}label{display:block;font-weight:600;margin:15px 0 6px}input,textarea,button{font:inherit}input,textarea{display:block;width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink)}input[type=password]{max-width:560px}input[readonly]{background:var(--bg);font-family:ui-monospace,monospace;font-size:14px}button{display:inline-block;background:var(--accent);color:#fff;border:0;border-radius:8px;font-weight:600;padding:12px 20px;margin-top:12px;cursor:pointer}button:hover{filter:brightness(.9)}button:active{transform:translateY(1px)}a:focus-visible,button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid #699780;outline-offset:4px}code,pre{font-family:ui-monospace,monospace;font-size:13px;overflow-wrap:anywhere;white-space:pre-wrap}code{background:var(--bg);padding:2px 5px;border-radius:4px}pre{padding:18px;background:var(--bg);border-radius:8px}small,.help{font-size:13px;color:var(--muted)}summary{font-weight:600;cursor:pointer;padding:12px 0}details{border-top:1px solid var(--line);margin-top:18px}li{padding-left:4px;margin:12px 0;color:var(--muted)}#installation-receipt{border-top:1px solid var(--line);margin-top:28px}footer{font-size:12px;color:var(--muted);border-top:1px solid var(--line)}.skip-link{position:absolute;left:16px;top:-100px;background:var(--card);padding:12px}.skip-link:focus{top:10px}@media(prefers-color-scheme:dark){body{--bg:#14221c;--card:#1c2d24;--ink:#edf3ed;--muted:#b8c8bd;--line:#36513f;--accent:#94d0ab}.identity{background:#233d2c}button{color:#15271d}}@media(max-width:600px){body>nav,main,footer{padding:22px 18px}body>nav{align-items:flex-start}.links{flex-direction:column;gap:5px!important}section,main>form{padding:22px 18px}button{max-width:100%;white-space:normal}ol{padding-left:22px}.identity{padding:18px}h1{margin-top:12px}}</style><a class="skip-link" href="#main">Skip to content</a><nav><a class="brand" href="/">Your Publisher<small>Private control panel</small></a><div class="links"><a href="/#settings">Settings</a><a href="/#installation-receipt">Installation receipt</a></div></nav><main id="main"><h1>${escapeHtml(title)}</h1>${body}</main><footer>Hosted in your Cloudflare account · You control this Publisher</footer></html>`,
    { status, headers: out },
  );
}
export function hidden(name: string, value: unknown) {
  return `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`;
}
export function form(action: string, csrf: string, body: string) {
  return `<form method="post" action="${escapeHtml(action)}">${hidden("csrf", csrf)}${body}</form>`;
}
