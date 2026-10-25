---
"@penpair/core": patch
---

Add an explicit loopback browser wake command for the pinned Penpot file, followed by a fresh read-only readiness check. Report plugin suspension and upstream heartbeat age in doctor without treating activation as sustained keep-alive or replaying uncertain writes.
