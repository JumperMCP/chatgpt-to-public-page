# 0.1.2 — Workers-compatible release downloads

Fixes release downloads in Cloudflare Workers by using manual redirect handling and rejecting non-success responses. Workers does not implement redirect mode `error`; previously its exception was mislabeled as invalid release metadata. Download and JSON parse failures now have separate actionable messages. Signatures and checksums remain mandatory.

The installer uses its direct static-assets binding for hosted releases, supports restarting expired sessions, and keeps progress responsive with automatic refresh. Technical expiry timestamps are no longer shown to users.

Schema 1, migration tag v1, and the Publisher class are unchanged. Previous releases remain archived. Independent-account installation and ChatGPT compatibility testing are still in progress.
