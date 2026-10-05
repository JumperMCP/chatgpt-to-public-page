# 0.1.6 — read actual Cloudflare update metadata

The updater now reads the migration tag from the active Worker's version (`resources.script_runtime.migration_tag`), rather than from `/settings`, where Cloudflare does not return it. Completion reconciliation reads the version's top-level `annotations`. Both response shapes were verified against the live operator Worker and Cloudflare's API schema.

A missing tag, a different migration tag, or a deployment splitting traffic across versions still blocks upload. Successful reconciliation clears a stale upload error and avoids a duplicate upload after a lost response. Regression tests now use Cloudflare's actual response shape instead of invented settings fields.

Includes the 0.1.5 native-fetch repair and 0.1.4 consent diagnostics. Existing old updaters need the documented bootstrap correction; changing the release version label or migration tags does not fix them. No schema migration, password reset, or authentication-policy changes. Independent update completion and ChatGPT consent remain pending.
