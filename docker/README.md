# docker

The compose template is generated from code (`packages/core/src/instance/template.ts`) so each instance gets its own ports, project name and volumes; there is no static compose file to copy. Defaults come from the proof of concept Sourcer has run since 2026-10-10: official images at a pinned version, ports bound to 127.0.0.1, generated secrets in an owner-only `.env` outside git, telemetry off, local mail capture, the MCP server on (reached through the frontend at `/mcp/stream`), and a rule never to remove volumes.
