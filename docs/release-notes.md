# 0.1.11 — quieter cockpit and clearer setup help

Remove the cockpit header navigation and main heading, place the bold sign-out control beside the hosting footer, clarify Cloudflare settings and installed-version labels, and add a link to the installer. Panel scrollbars are wider and higher contrast, with 10px styling where supported and native-width Firefox scrollbars.

Checking the currently installed release keeps its review notes visible without offering Update Publisher. The server also rejects same-version apply requests without queuing an update. Regression coverage checks the review-only behavior, blocked submission, and normal update admission for a different release.

The installer replaces its preview introduction with Frequently Asked Questions, simplifies all answers, and adds practical guidance from independent testing: exact /mcp URL, account/workspace selection, publishing key and owner password, mobile/fresh-chat editing, delayed publication, and renaming. Remove the extra header link, decorative eyebrow dash, and redundant installation line. No migration, credential, or origin changes.
