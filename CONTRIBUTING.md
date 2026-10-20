# Contributing

penpair is early; issues and small pull requests are welcome.

- Read `AGENTS.md` (the rules that do not bend) and `PLAN.md` (what is done and what is next).
- `pnpm install`, then `pnpm check` (typecheck, tests, build, and that every package has the same version) and `pnpm smoke:package` (packs every package and runs them in empty projects) before a pull request.
- The core stays neutral: it never names a project or a component library, and the Docker code stays apart from the connection (tests enforce both). Project knowledge belongs in an adapter or in the adopting project.
- A change to how a Penpot file is written follows the protocol in `packages/core/skills/penpair-design/references/write-protocol.md`: look, write once, read back, look at an export.
- Never put a real MCP key in an issue, a test or a log.
