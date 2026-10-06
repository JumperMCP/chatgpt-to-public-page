import { escapeHtml as e, form } from "../ui";

export interface InstallationView {
  step: string;
  csrf: string;
  accounts?: { id: string; name: string }[];
  worker?: string;
  subdomain?: string;
  setup?: string;
  error?: string;
  expires?: number;
}

const icon = (name: string, className = "") =>
  `<img class="icon ${className}" src="/design/${name}.svg" width="24" height="24" alt="" aria-hidden="true">`;
const arrow = icon("arrow-up-right");

export function installerPage(
  title: string,
  body: string,
  status = 200,
  poll = false,
) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="description" content="Give your ChatGPT creations a public home in your own Cloudflare account. Install Publisher by Jumper MCP."><title>${e(title)} · Publisher</title><link rel="icon" href="/design/publisher-mark.webp"><link rel="preload" href="/design/outfit-variable.ttf" as="font" type="font/ttf" crossorigin><link rel="stylesheet" href="/design/installer.css">${poll ? '<script src="/design/progress.js" defer></script>' : ""}</head><body><a class="skip-link" href="#main">Skip to content</a><div class="site-shell"><header class="site-header"><a class="brand" href="/"><img src="/design/publisher-mark.webp" alt="" width="40" height="40"><span>Publisher<small>by Jumper MCP</small></span></a><nav aria-label="Main navigation"><a href="/#how-it-works">How it works</a><a href="/#before-you-install">Before you install</a></nav></header><main id="main">${body}</main><footer class="site-footer"><a href="https://jumpermcp.dev">A little more internet. By Jumper MCP. ${arrow}</a><span>Your ideas. Your Cloudflare account.</span></footer></div></body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "Referrer-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": `default-src 'none'; ${poll ? "script-src 'self'; connect-src 'self'; " : ""}style-src 'self'; img-src 'self'; font-src 'self'; form-action 'self' https://dash.cloudflare.com; frame-ancestors 'none'; base-uri 'none'`,
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
  const inProgress =
    ["preflight", "storage", "publisher", "handoff"].includes(state.step) &&
    !state.error;
  let title = "Made in chat.<br><span>Shared with the world.</span>";
  let subtitle =
    "Give your ChatGPT creations a home on the web, in your own Cloudflare account.";
  let action = form(
    "/start",
    state.csrf,
    `<button class="button primary install-button" type="submit">Install on my Cloudflare ${arrow}</button>`,
  );
  let context = "";
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
    title = "Installed in<br><span>your Cloudflare.</span>";
    subtitle = `Your Publisher is running at ${state.worker}.${state.subdomain}.workers.dev in your Cloudflare account. Open it to create the password for your private control panel.`;
    action = `<a class="button primary" href="https://${e(state.worker)}.${e(state.subdomain)}.workers.dev/setup?token=${e(state.setup)}">Open my Publisher ${arrow}</a>`;
    context = `In your ChatGPT > Plugins, click “Add custom MCP server” and use the MCP URL from your Publisher’s ChatGPT connection → Installation receipt.${refreshVerified ? "" : " In your Publisher settings, enter a Cloudflare API token. Step-by-step instructions explain how to create it."}`;
  } else if (state.step !== "authorize") {
    const [heading, detail] = steps[state.step] ?? [
      "Setting things up",
      "Your installation is in progress.",
    ];
    title = `${e(heading)}${inProgress ? '<span class="progress-orbit" aria-hidden="true"></span>' : ""}`;
    subtitle = detail;
    action = `<div class="progress-state" role="status"><span>${icon(state.error ? "arrow-back-up" : "cloud-upload")}${state.error ? "Your installation needs attention" : e(heading)}</span></div>${state.error ? `<p class="error-message" role="alert">${e(state.error)}</p>${form("/resume", state.csrf, `<button class="button primary" type="submit">Resume installation ${arrow}</button>`)}` : ""}<a class="text-link" href="/">Refresh progress ${icon("arrow-right")}</a>`;
    context = inProgress
      ? "Progress updates here automatically. You can leave this page open while installation continues."
      : "Installation is paused. Resolve the issue above, then resume.";
  }
  return installerPage(
    "Install ChatGPT-to-Public",
    `
    <div class="bento-grid" data-installation-poll="${inProgress}">
      <section class="tile hero-tile" aria-labelledby="hero-title">
        <div class="eyebrow">A home for what you make</div>
        <h1 id="hero-title">${title}</h1>
        <p class="hero-description">${e(subtitle)}</p>
        <div class="installation-action">${action}</div>
        ${context ? `<p class="action-context" data-progress-notice>${e(context)}</p>` : ""}
      </section>
      <figure class="tile art-tile">
        <img class="launch-art" src="/design/publisher-technicolor.webp" alt="Glowing chat bubbles flowing into a browser above a connected world" width="1920" height="1080" fetchpriority="high">
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
      <ol class="setup-steps"><li><span class="step-symbol">${icon("cloud-upload")}</span><h3>Connect Cloudflare</h3><p>Authorize Publisher and choose your account.</p></li><li><span class="step-symbol">${icon("lock")}</span><h3>Make it yours</h3><p>Create an owner password on your own Publisher.</p></li><li><span class="step-symbol">${icon("arrow-up-right")}</span><h3>Connect ChatGPT</h3><p>In ChatGPT → Plugins, choose Add custom MCP server. Use the MCP URL from your Publisher’s ChatGPT connection → Installation receipt.</p></li></ol>
    </section>
    <section class="before-section" id="before-you-install" aria-labelledby="before-title">
      <div class="before-intro"><h2 id="before-title">Frequently Asked Questions</h2></div>
      <div class="questions">
        <details open><summary>What do I need? <span aria-hidden="true">+</span></summary><p>A Cloudflare account and a ChatGPT account that lets you add a custom MCP server. Our tester completed the workflow with free accounts. Check that the option is available in your ChatGPT account before installing.</p></details>
        <details><summary>How do I add Publisher to ChatGPT? <span aria-hidden="true">+</span></summary><p>Open Plugins in ChatGPT and look for the option to add a custom MCP server. Copy the full MCP server URL from your Publisher’s installation receipt, including <code>/mcp</code> at the end. The control-panel address alone will not work.</p></details>
        <details><summary>I cannot find the custom MCP option. What now? <span aria-hidden="true">+</span></summary><p>Check ChatGPT on the web and confirm which account and workspace you are using. Our tester found the option after enabling Developer mode in Settings → Security and login. Menu names and availability can vary. See <a href="https://learn.chatgpt.com/docs/plugins" target="_blank" rel="noreferrer">OpenAI’s plugin guide</a> for current guidance.</p></details>
        <details><summary>Why do I need a Cloudflare API token after approving installation? <span aria-hidden="true">+</span></summary><p>${refreshVerified ? "Cloudflare approval connects Publisher to your account. If that access expires or is revoked, reconnect in Publisher’s Cloudflare settings." : "Your first approval lets the installer create Publisher. Your Publisher then needs its own publishing key, called an API token, to create and update websites. Open Cloudflare settings in your Publisher and follow the steps there. The key is encrypted and stays in your Cloudflare account; do not paste it into ChatGPT."}</p></details>
        <details><summary>Which password am I creating? <span aria-hidden="true">+</span></summary><p>A password for your private Publisher control panel, hosted in your Cloudflare account. It is not a new Jumper MCP account. Use this same owner password when connecting Publisher to ChatGPT.</p></details>
        <details><summary>Can I edit a site from another chat or my phone? <span aria-hidden="true">+</span></summary><p>Yes. Projects are saved in Publisher, not in a single chat. In a new chat with Publisher available, ask it to find your project and make the edit. Our tester also did this successfully from a smartphone.</p></details>
        <details><summary>Why is Publisher missing on another device or account? <span aria-hidden="true">+</span></summary><p>First check that you are signed into the ChatGPT account and workspace where you connected Publisher. A second account may need its own connection. Seeing a plugin on another account does not by itself confirm that it has access.</p></details>
        <details><summary>ChatGPT says publishing failed. Should I start over? <span aria-hidden="true">+</span></summary><p>Check Recent operations in your Publisher first. “Uploading” or “activating” can still mean it is working or retrying; retries may take up to five minutes. Refresh the panel before creating another project. If the error continues, copy the error shown there, including any HTTP status or code, when asking for help.</p></details>
        <details><summary>When is my site ready to share? <span aria-hidden="true">+</span></summary><p>Wait for Publisher to show Published, then open the public link. If it says the address is not reachable yet, or Cloudflare shows “There is nothing here yet,” wait and check again. A proposed URL in ChatGPT is not confirmation that the site is live.</p></details>
        <details><summary>What stays with Jumper MCP? <span aria-hidden="true">+</span></summary><p>The installer removes its saved Cloudflare authorization when installation completes. Your Publisher, files, publishing key, and websites stay in your Cloudflare account. Future publishing runs there.</p></details>
        <details><summary>Can I rename Publisher in Cloudflare? <span aria-hidden="true">+</span></summary><p>Changing the Worker name changes its address and can break your ChatGPT connection and updates. Treat it as a move to a new address: the Publisher configuration and ChatGPT connection must be updated together. Changing the account’s workers.dev subdomain can also change your website addresses.</p></details>
      </div>
    </section>`,
    200,
    inProgress,
  );
}

export function installationError(
  message: string,
  status: number,
  csrf?: string,
) {
  return installerPage(
    "Installation needs attention",
    `<section class="tile error-tile"><span class="step-symbol">${icon("arrow-back-up")}</span><h1>Let's get you<br>back on track.</h1><p role="alert">${e(message)}</p><a class="button primary" href="/">Return to installation ${arrow}</a>${csrf ? form("/restart", csrf, `<button class="button primary" type="submit">Start a new installation ${arrow}</button><p class="action-context">This discards the previous installer authorization. Any resources already created in Cloudflare remain in your account.</p>`) : ""}</section>`,
    status,
  );
}
