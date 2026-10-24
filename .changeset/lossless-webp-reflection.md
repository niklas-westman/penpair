---
"@penpair/reflection-check": patch
"@penpair/web": patch
---

Accept static lossless WebP comparison evidence alongside legacy PNG, preserving exact dimensions, original-byte hashes and approval identity. Save lossless WebP by default in the browser provider with a project-pinned encoder and decoded-pixel verification. Reject lossy/animated WebP and malformed containers; existing PNG design approvals remain unchanged.
