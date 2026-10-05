# 0.1.8 — allow updates while publication retries are pending

Remove the update admission guard that rejected every pending publication. A retrying activation could otherwise prevent installing the very update needed to repair or diagnose it. Publisher already serializes owner requests and alarms, prioritizes queued updates, and resumes stored publication operations after the update completes or fails.

The runtime regression reproduces the old busy error and checks authenticated update admission, CSRF rejection, update priority, preservation of pending operation state and uploaded bytes, and resumption after both successful and failed updates. No migration or credential changes. Includes the publication reconciliation and safe Cloudflare diagnostics from 0.1.7.
