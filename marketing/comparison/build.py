"""Build the README comparison chart (HTML -> PNG) and its text-table twin from one data source.

Usage: python3 build.py   writes comparison.{html,png,md} and a captionless narrow variant, comparison-narrow.{html,png}
"""

import html
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).parent

CRITERIA = [
    "Publish from your AI chat",
    "Hosted in your own account",
    "Quick to set up",
    "Edit from a later chat",
    "Version history / undo",
    "Your own domain",
    "Server code",
    "Database",
]

# State per cell: Y yes, P partly / with conditions, L planned, N no. Captions stay at two or three words.
ROWS = [
    ("Publisher", "this project", "https://chatgpt-to-public.jumpermcp.dev/", [
        ("Y", "ChatGPT + MCP"), ("Y", "Cloudflare"), ("P", "one-time install"), ("Y", ""),
        ("Y", "last 20"), ("P", "manual today ¹"), ("L", "planned ²"), ("N", "")]),
    ("WebsitePublisher.ai", "hosted AI publisher", "https://www.websitepublisher.ai/", [
        ("Y", "many AI chats"), ("N", "their platform"), ("Y", "sign in"), ("Y", ""),
        ("Y", "count by plan"), ("P", "paid plans"), ("P", "built-in only"), ("Y", "")]),
    ("ChatGPT canvas", "share link", "https://help.openai.com/en/articles/9930697-what-is-canvas", [
        ("Y", "ChatGPT only"), ("N", "chatgpt.com"), ("Y", "none"), ("P", "original chat"),
        ("P", ""), ("N", ""), ("N", ""), ("N", "")]),
    ("Claude artifact", "published link", "https://support.claude.com/en/articles/9547008-publish-and-share-artifacts", [
        ("Y", "Claude only"), ("N", "claude.ai"), ("Y", "none"), ("P", "original chat"),
        ("P", ""), ("N", ""), ("P", "AI calls only"), ("P", "paid plans, 20 MB")]),
    ("Netlify Drop", "drag and drop", "https://app.netlify.com/drop", [
        ("N", "manual"), ("Y", "once claimed ³"), ("Y", "none"), ("N", "re-upload"),
        ("Y", ""), ("Y", ""), ("P", "not via Drop"), ("P", "not via Drop")]),
    ("Cloudflare upload", "dashboard direct upload", "https://developers.cloudflare.com/pages/get-started/direct-upload/", [
        ("N", "manual"), ("Y", "Cloudflare"), ("Y", "dashboard"), ("N", "re-upload"),
        ("Y", ""), ("Y", ""), ("P", "not via upload"), ("P", "not via upload")]),
    ("Git-based hosting", "GitHub Pages, Cloudflare, Netlify", "https://developers.cloudflare.com/pages/configuration/git-integration/", [
        ("P", "repo-editing AI"), ("P", "repo on GitHub"), ("N", "Git know-how"), ("P", "via the repo"),
        ("Y", "full history"), ("Y", ""), ("P", "depends on host"), ("P", "depends on host")]),
    ("AI app builders", "Lovable, Bolt, v0", "https://docs.lovable.dev/features/custom-domain", [
        ("P", "their own chat"), ("N", "mostly theirs"), ("Y", "sign up"), ("Y", "in their editor"),
        ("Y", ""), ("P", "paid plans"), ("Y", ""), ("Y", "")]),
    ("Netlify MCP server", "for coding tools", "https://github.com/netlify/netlify-mcp", [
        ("P", "coding tools"), ("Y", "Netlify"), ("N", "developer setup"), ("P", ""),
        ("Y", ""), ("Y", ""), ("Y", ""), ("P", "")]),
]

NOTES = [
    "¹ Attach a domain to the site's Worker in Cloudflare (Settings → Domains & Routes); the domain must be on Cloudflare. Doing this from the chat is planned.",
    "² Sites are static today. Server code needs a chosen runtime, so it was left out of v1 and is planned. No database support.",
    "³ Unclaimed Netlify Drop sites are deleted within an hour.",
]

LEGEND = {"Y": "Yes", "P": "Partly, or with conditions", "L": "Planned", "N": "No"}
TEXT_MARK = {"Y": "✅", "P": "🟡", "L": "🔜", "N": "❌"}

ICONS = {
    "Y": '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="#246780"/>'
         '<path d="M8.5 14.5l3.6 3.6 7.4-8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    "P": '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="11" fill="#fff" stroke="#d9822b" stroke-width="2.4"/>'
         '<path d="M14 3a11 11 0 0 1 0 22z" fill="#d9822b"/></svg>',
    "L": '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="11" fill="#e8f1f5" stroke="#246780" stroke-width="2.2" stroke-dasharray="4 3"/>'
         '<path d="M14 8.5v6l3.8 2.4" fill="none" stroke="#246780" stroke-width="2.2" stroke-linecap="round"/></svg>',
    "N": '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="11" fill="#f1f4f5" stroke="#c3d1d8" stroke-width="2"/>'
         '<path d="M9.5 14h9" stroke="#8d9ca6" stroke-width="2.4" stroke-linecap="round"/></svg>',
}

CSS = """
:root { --bg:#edf2f4; --card:#fff; --ink:#142039; --muted:#4d6273; --line:#d5e2e8; --accent:#246780; --cf:#f38020; --cf-tint:#fff5ec; }
* { box-sizing:border-box; margin:0; }
body { background:var(--bg); color:var(--ink); font-family:Outfit, system-ui, sans-serif; width:1600px; padding:56px 52px 48px; }
header { display:flex; justify-content:space-between; align-items:flex-end; gap:40px; margin-bottom:30px; }
h1 { font-size:52px; font-weight:700; letter-spacing:-1.2px; line-height:1; }
header p { color:var(--muted); font-size:21px; margin-top:12px; }
.legend { display:flex; gap:22px; font-size:17px; color:var(--muted); white-space:nowrap; }
.legend span { display:flex; align-items:center; gap:8px; }
.legend svg { width:22px; height:22px; }
.matrix { background:var(--card); border-radius:22px; padding:10px 26px 14px; box-shadow:0 1px 2px rgba(20,32,57,.06); }
.row { display:grid; grid-template-columns:260px repeat(8, 1fr); align-items:center; border-top:1px solid var(--line); min-height:86px; padding:14px 0; }
.row.head { border-top:0; min-height:92px; }
.row.head div { font-size:16.5px; font-weight:600; color:var(--muted); text-align:center; line-height:1.25; padding:0 8px; }
.row.ours { background:var(--cf-tint); border:2px solid var(--cf); border-radius:16px; margin:2px -14px 4px; padding:0 14px; }
.row.ours + .row { border-top:0; }
.name strong { display:block; font-size:21px; font-weight:600; }
.name span { display:block; font-size:15.5px; color:var(--muted); margin-top:3px; }
.cell { display:flex; flex-direction:column; align-items:center; justify-content:flex-start; gap:7px; text-align:center; padding:0 4px; }
.cell svg { width:30px; height:30px; }
.cell small { font-size:14.5px; color:var(--muted); line-height:1.2; min-height:1.2em; white-space:nowrap; }
footer { margin-top:24px; color:var(--muted); font-size:16px; line-height:1.55; display:grid; gap:2px; }
"""

# Narrow variant for article bodies (~700px display width): no cell captions, footnote markers only.
NARROW_CSS = """
body { width:1000px; padding:44px 36px 36px; }
header { flex-direction:column; align-items:flex-start; gap:18px; margin-bottom:24px; }
h1 { font-size:46px; }
.legend { gap:18px; font-size:16px; }
.matrix { padding:6px 16px 10px; }
.row { grid-template-columns:200px repeat(8, 1fr); min-height:68px; padding:10px 0; }
.row.head { min-height:88px; }
.row.head div { font-size:14.5px; padding:0 2px; }
.row.ours { margin:2px -10px 4px; padding:0 10px; }
.name strong { font-size:19px; }
.name span { font-size:14px; }
.cell { position:relative; }
.cell svg { width:30px; height:30px; }
.cell small { position:absolute; left:calc(50% + 18px); top:-4px; min-height:0; font-size:15px; }
footer { font-size:15px; }
"""


def build_html(narrow=False):
    head = "".join(f"<div>{html.escape(c)}</div>" for c in CRITERIA)
    rows = []
    for i, (name, sub, _, cells) in enumerate(ROWS):
        tds = "".join(
            f'<div class="cell" title="{LEGEND[s]}">{ICONS[s]}<small>{html.escape(caption(cap, narrow))}</small></div>' for s, cap in cells
        )
        cls = "row ours" if i == 0 else "row"
        rows.append(f'<div class="{cls}"><div class="name"><strong>{html.escape(name)}</strong><span>{html.escape(sub)}</span></div>{tds}</div>')
    legend = "".join(f"<span>{ICONS[k]}{v}</span>" for k, v in LEGEND.items())
    notes = "".join(f"<div>{html.escape(n)}</div>" for n in NOTES)
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>How Publisher compares</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>{CSS}{NARROW_CSS if narrow else ""}</style></head><body>
<header><div><h1>How Publisher compares</h1></div><div class="legend">{legend}</div></header>
<main class="matrix"><div class="row head"><div></div>{head}</div>{''.join(rows)}</main>
<footer>{notes}</footer></body></html>"""


def caption(cap, narrow):
    return "".join(re.findall(r"[¹²³]", cap)) if narrow else cap


def render(stem, size):
    subprocess.run([
        "google-chrome", "--headless=new", "--disable-gpu", "--hide-scrollbars",
        "--force-device-scale-factor=2", f"--window-size={size}", "--virtual-time-budget=4000",
        f"--screenshot={HERE / (stem + '.png')}", (HERE / (stem + ".html")).resolve().as_uri(),
    ], check=True, capture_output=True)


def build_markdown():
    lines = ["| | " + " | ".join(CRITERIA) + " |", "|---|" + ":-:|" * len(CRITERIA)]
    for name, sub, link, cells in ROWS:
        marks = " | ".join(TEXT_MARK[s] + (f" {cap}" if cap else "") for s, cap in cells)
        lines.append(f"| **[{name}]({link})** ({sub}) | {marks} |")
    legend = " · ".join(f"{TEXT_MARK[k]} {v.lower()}" for k, v in LEGEND.items())
    return "\n".join([f"<sub>{legend}</sub>", "", *lines, "", *(f"<sub>{n}</sub><br>" for n in NOTES)])


if __name__ == "__main__":
    (HERE / "comparison.html").write_text(build_html())
    (HERE / "comparison-narrow.html").write_text(build_html(narrow=True))
    (HERE / "comparison.md").write_text(build_markdown() + "\n")
    render("comparison", "1600,1170")
    render("comparison-narrow", "1000,1040")
    print("wrote comparison.{html,md,png} and comparison-narrow.{html,png}")
