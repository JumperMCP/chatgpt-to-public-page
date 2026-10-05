# 0.1.9 — status polling must not postpone publication retries

MCP calls previously reset the next alarm to a full retry interval from the current time. Repeated status checks could postpone publication indefinitely. Scheduling now preserves an earlier alarm while still moving distant alarms forward when work is queued.

The workerd regression calls the actual authenticated MCP get_operation route and verifies the retry deadline is preserved. It also checks moving a distant alarm earlier and retains the update/publishing pause-resume coverage. No migration or credential changes.

The independent tester confirmed the 0.1.8 update succeeded but the site remained private. This scheduling correction does not establish the cause of Cloudflare's activation rejection; obtain the current Recent operations endpoint/status/code diagnostics before changing account settings or permissions.
