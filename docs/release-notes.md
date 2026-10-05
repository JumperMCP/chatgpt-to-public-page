# 0.1.7 — publication reconciliation and actionable Cloudflare errors

Publication reconciliation now reads top-level Worker version annotations, matching Cloudflare's actual API shape. Previously the adapter could not identify an activated asset deployment as its own operation. The updater's corresponding correction was already included in 0.1.6.

Cloudflare failures now include the request method/path, HTTP status, and numeric provider error codes. Provider message bodies, tokens, and query strings are not exposed. Tests cover activation with the actual annotation shape and redaction of provider details.

The independent tester reported a failed first website activation. Operator-account probes for a new Worker's empty deployment list and an empty assets-only activation both succeeded; temporary Workers were removed. These probes do not establish the tester's actual rejection. Use the improved error details to diagnose the existing publication rather than creating another project. No migration or credential changes.
