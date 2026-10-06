# 0.1.10 — a compact blue Publisher cockpit

The owner control panel now shares the installer's navy/teal palette and Outfit typography. Five bento panels keep projects, ChatGPT connection, recent operations, Cloudflare settings, and updates in one desktop viewport. Project and activity lists scroll independently; uncommon and destructive controls use native expandable details. Small screens use a stacked layout. Setup, login, and consent pages share the refreshed visual language.

The supplied Protected by Cloudflare badge appears in the upper right at one-third of its source width on desktop. Badge and font are embedded in the signed Worker bundle, with no external asset dependency. CSP permits only data images/fonts in addition to the existing inline styles and validated form destinations; scripts remain disabled. Existing actions, CSRF checks, project deletion confirmation, and installation receipt remain available.

Browser coverage checks desktop fit at 1440×900, 1366×768, and 1024×768 in both color schemes; mobile overflow, empty/setup states, badge rendering, and project-management form fields/submission. Includes the 0.1.9 retry scheduling fix. No migration, credential, Worker name, or origin changes.
