// Update status in place: meta refresh can trigger Firefox's redirect blocker.
(() => {
  let failures = 0;
  async function poll() {
    if (!document.querySelector('[data-installation-poll="true"]')) return;
    try {
      const response = await fetch("/", {
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      const next = new DOMParser().parseFromString(
        await response.text(),
        "text/html",
      );
      const content = next.querySelector("main");
      if (
        !content ||
        !response.headers.get("content-type")?.includes("text/html")
      )
        throw new Error("Progress unavailable");
      document.querySelector("main").replaceWith(content);
      document.title = next.title;
      failures = 0;
      setTimeout(poll, 3000);
    } catch {
      if (++failures < 3) setTimeout(poll, 5000);
      else {
        const notice = document.querySelector("[data-progress-notice]");
        if (notice)
          notice.textContent =
            "Automatic checks paused. Select Refresh progress to check again.";
      }
    }
  }
  setTimeout(poll, 3000);
})();
