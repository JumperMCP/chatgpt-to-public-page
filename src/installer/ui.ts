import { escapeHtml as e, form } from "../ui";

export interface InstallationView {
  step: string;
  csrf: string;
  accounts?: { id: string; name: string }[];
  worker?: string;
  subdomain?: string;
  setup?: string;
  error?: string;
}

const icon = (name: string, className = "") =>
  `<img class="icon ${className}" src="/design/${name}.svg" width="24" height="24" alt="" aria-hidden="true">`;
const arrow = icon("arrow-up-right");

export function installerPage(title: string, body: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="description" content="Give your ChatGPT creations a public home in your own Cloudflare account. Install Publisher by Jumper MCP."><title>${e(title)} · Publisher</title><link rel="icon" href="/design/publisher-mark.webp"><link rel="preload" href="/design/outfit-variable.ttf" as="font" type="font/ttf" crossorigin><link rel="stylesheet" href="/design/installer.css"></head><body><a class="skip-link" href="#main">Skip to content</a><div class="site-shell"><header class="site-header"><a class="brand" href="/"><img src="/design/publisher-mark.webp" alt="" width="40" height="40"><span>Publisher<small>by Jumper MCP</small></span></a><nav aria-label="Main navigation"><a href="/#how-it-works">How it works</a><a href="/#before-you-install">Before you install</a><a class="jumper-link" href="https://jumpermcp.dev">Jumper MCP ${arrow}</a></nav></header><main id="main">${body}</main><footer class="site-footer"><a href="https://jumpermcp.dev">A little more internet. By Jumper MCP. ${arrow}</a><span>Your ideas. Your Cloudflare account.</span></footer></div></body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      },
    },
  );
}

const steps: Record<string, [string, string]> = {
  preflight: [
    "Checking your account",
    "Looking for your Cloudflare Workers address and confirming the installation can proceed.",
  ],
  storage: [
    "Making room for your ideas",
    "Creating the storage your Publisher will use in your Cloudflare account.",
  ],
  publisher: [
    "Setting up your Publisher",
    "Deploying your Publisher to your own Cloudflare account.",
  ],
  handoff: [
    "Finishing the connection",
    "Preparing your private setup link and completing the installation.",
  ],
  expired: [
    "Let's start fresh",
    "This installation session has expired. Clear the installation cookie and open this page again.",
  ],
};

export function installationPage(
  state: InstallationView,
  refreshVerified: boolean,
) {
  let title = "Made in chat.<br><span>Shared with the world.</span>";
  let subtitle =
    "Give your ChatGPT creations a home on the web, in your own Cloudflare account.";
  let action = form(
    "/start",
    state.csrf,
    `<button class="button primary" type="submit">Install on my Cloudflare ${arrow}</button>`,
  );
  let context = "No business account or subscription is required.";
  if (state.step === "account") {
    title = "Your account.<br><span>Your Publisher.</span>";
    subtitle =
      "Choose where your Publisher and the websites you create will live.";
    action = form(
      "/account",
      state.csrf,
      `<label for="destination-account">Destination account</label><select id="destination-account" name="account" required>${state.accounts?.map((a) => `<option value="${e(a.id)}">${e(a.name)}</option>`).join("") ?? ""}</select><button class="button primary" type="submit">Install Publisher ${arrow}</button>`,
    );
    context =
      "Publisher will be installed in the Cloudflare account you select.";
  } else if (state.step === "complete") {
    title = "Your Publisher.<br><span>Ready for you.</span>";
    subtitle =
      "Publisher installed in your account. Create your owner password to make it yours.";
    action = `<a class="button primary" href="https://${e(state.worker)}.${e(state.subdomain)}.workers.dev/setup?token=${e(state.setup)}">Create your owner password ${arrow}</a>`;
    context = `Then connect ChatGPT using the MCP URL shown in your Publisher.${refreshVerified ? "" : " Independent OAuth refresh is unverified; enter a scoped Cloudflare API token directly in your Publisher before publishing."}`;
  } else if (state.step !== "authorize") {
    const [heading, detail] = steps[state.step] ?? [
      "Setting things up",
      "Your installation is in progress.",
    ];
    title = `${e(heading)}<span class="progress-orbit" aria-hidden="true"></span>`;
    subtitle = detail;
    action = `<div class="progress-state" role="status"><span>${icon(state.error ? "arrow-back-up" : "cloud-upload")}${state.error ? "Your installation needs attention" : e(heading)}</span></div>${state.error ? `<p class="error-message" role="alert">${e(state.error)}</p>${form("/resume", state.csrf, `<button class="button primary" type="submit">Resume installation ${arrow}</button>`)}` : ""}<a class="text-link" href="/">Refresh progress ${icon("arrow-right")}</a>`;
    context = "You can return to this page to check your progress.";
  }
  return installerPage(
    "Install ChatGPT-to-Public",
    `
    <div class="bento-grid">
      <section class="tile hero-tile" aria-labelledby="hero-title">
        <div class="eyebrow"><span class="eyebrow-line"></span> A home for what you make</div>
        <h1 id="hero-title">${title}</h1>
        <p class="hero-description">${e(subtitle)}</p>
        <div class="installation-action">${action}</div>
        <p class="action-context">${e(context)}</p>
      </section>
      <figure class="tile art-tile">
        <div class="art-caption"><span>Small idea.<br>Whole wide web.</span>${icon("world")}</div>
        <picture><source media="(prefers-color-scheme: dark)" srcset="/design/publisher-launch-dark.webp"><img class="launch-art" src="/design/publisher-launch.webp" alt="A sculptural blue browser tile lifting out of a pair of chat bubbles" width="1024" height="1024" fetchpriority="high"></picture>
        <figcaption>Make something worth sharing.</figcaption>
      </figure>
      <section class="tile ownership-tile" aria-labelledby="ownership-title">
        <div class="tile-heading">${icon("lock")}<span>Built around ownership</span></div>
        <h2 id="ownership-title">Your cloud.<br>Your rules.</h2>
        <p>Existing websites and future publishing run in your account.</p>
        <div class="ownership-seal">${icon("check")} Hosted on your Cloudflare</div>
      </section>
      <section class="tile edits-tile" aria-labelledby="edits-title">
        <div class="edit-symbol" aria-hidden="true">${icon("history")}</div>
        <h2 id="edits-title">A new chat.<br>The same site.</h2>
        <p>Pick up where you left off. Change a detail, undo an edit, or take your files with you.</p>
        <ul class="capabilities" aria-label="Publisher capabilities"><li>Edit</li><li>Undo</li><li>Export</li></ul>
      </section>
      <section class="tile file-tile" aria-labelledby="file-title">
        <div class="file-symbol" aria-hidden="true">${icon("file-code")}</div>
        <h2 id="file-title">Bring your<br>finished files.</h2>
        <p>HTML, CSS, JavaScript, and images. Ready for a public address.</p>
      </section>
    </div>
    <section class="how-section" id="how-it-works" aria-labelledby="how-title">
      <div class="section-intro"><h2 id="how-title">One setup.<br>More room to create.</h2><p>Install your Publisher, then connect it to ChatGPT.</p></div>
      <ol class="setup-steps"><li><span class="step-symbol">${icon("cloud-upload")}</span><h3>Connect Cloudflare</h3><p>Authorize Publisher and choose your account.</p></li><li><span class="step-symbol">${icon("lock")}</span><h3>Make it yours</h3><p>Create an owner password on your own Publisher.</p></li><li><span class="step-symbol">${icon("arrow-up-right")}</span><h3>Connect ChatGPT</h3><p>Add your Publisher's MCP URL in an eligible ChatGPT account.</p></li></ol>
    </section>
    <section class="before-section" id="before-you-install" aria-labelledby="before-title">
      <div class="before-intro"><span class="preview-label">Testing preview</span><h2 id="before-title">A few things<br>before you jump in.</h2><p>This first release is being tested. Cloudflare installation and ChatGPT connection are separate steps.</p></div>
      <div class="questions">
        <details open><summary>What do I need? <span aria-hidden="true">+</span></summary><p>A Cloudflare account and, for the ChatGPT connection, access to custom MCP servers. A free ChatGPT account may not offer that option.</p></details>
        <details><summary>How does publishing connect? <span aria-hidden="true">+</span></summary><p>${refreshVerified ? "Cloudflare authorization connects your Publisher to your account. You may need to reconnect if access expires or is revoked." : "For this preview, create a scoped Cloudflare API token and enter it directly into your own Publisher before publishing. The installer will guide you after setup."}</p></details>
        <details><summary>What stays with Jumper MCP? <span aria-hidden="true">+</span></summary><p>Installer credentials expire after one hour and are erased when installation completes. Your sites and future publishing run in your account.</p></details>
      </div>
    </section>`,
  );
}

export function installationError(message: string, status: number) {
  return installerPage(
    "Installation needs attention",
    `<section class="tile error-tile"><span class="step-symbol">${icon("arrow-back-up")}</span><h1>Let's get you<br>back on track.</h1><p role="alert">${e(message)}</p><a class="button primary" href="/">Return to installation ${arrow}</a></section>`,
    status,
  );
}
