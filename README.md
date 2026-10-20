# penpair

**Design together. Build together.**

penpair is a framework that makes a Penpot design file the source of truth for a project's UI, and lets people and AI coding agents work on it together, safely and repeatably.

- **Run it:** one Penpot instance per project, started with one command (Docker), with secrets generated outside git, backups and restore.
- **Drive it:** connect an agent through Penpot's MCP and plugin API, and use a set of safe, tested operations: inspect, build, audit, export, archive, manage design tokens.
- **Know it:** the rules and the written-down quirks of the tool ship with the code, as skills the agent follows.
- **Extend it:** a project plugs in its component library, its checks and its own snippets. Nothing project-specific lives in the core.

It is the other half of [Reflection](../../../reflection/CODE/reflection): Reflection checks that an implementation matches its design; penpair holds and drives the design that everything is measured against.

Status: **draft, not published.** See [PLAN.md](PLAN.md).

## Layout

| Path | What |
| --- | --- |
| `packages/core` | The neutral core: connection, safe write runner, operations, instance lifecycle (`penpair`) |
| `docker` | The pinned Penpot compose template and its notes |
| `skills` | The knowledge packs installed into a project's `.skills/` |
| `docs` | The guide: extension points and the checklist an adopter works through |
