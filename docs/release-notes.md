# 0.1.1 — browser form compatibility

Fixes native browser form submissions by using a same-origin referrer policy. Owner setup, sign-in, and consent retain strict Origin checks without the browser replacing Origin with null. Consent pages permit navigation to the validated callback origin. HTML responses prohibit proxy transformation while retaining no-store and script-blocking CSP.

The installer also permits the Cloudflare OAuth navigation and uses the requested edge-to-edge hero artwork. A Chromium regression test exercises native form submission, external OAuth redirects, and rejection of null or foreign origins.

Schema 1, migration tag v1, and Publisher Durable Object class are unchanged. The previous 0.1.0 archive remains available. Independent-account installation and ChatGPT compatibility experiments are still in progress; callback allowlists remain empty until verified.
