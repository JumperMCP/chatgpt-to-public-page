# 0.1.5 — repair native Workers fetch calls

Fixes Cloudflare API requests and public-site reachability probes invoking Workers native fetch with the adapter as its receiver. The runtime rejects this with an Illegal invocation TypeError. In the updater, this failed before uploading the new bundle and was displayed as a generic operation failure.

A real Workers-runtime regression now covers authenticated API calls and unauthenticated site probes. Previous Node tests used injected fetch functions and missed the runtime receiver constraint. Includes 0.1.4's owner sign-in and consent error recovery.

Existing affected Publishers require a one-time dashboard repair before the built-in updater can install this release. No storage migration, password reset, or changes to authentication policy. The live ChatGPT consent failure remains to be diagnosed after this update reaches the independent installation.
