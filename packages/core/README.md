# penpair (core)

The neutral core. Nothing here names a project or a component library; `test/neutrality.test.ts` enforces that. Not published yet.

```
penpair setup [--web|--docker]  the guided path from nothing to a working connection (web is the default)
penpair connect [--replace]     your personal key (hidden), then waits for the editor and plugin
penpair init | up | down | status   write the config; Docker only: one Penpot per project
penpair doctor [--json]         what is up, what is not, and what to do
penpair skills [install]        the agent's rules, including penpair-setup
penpair backup [verify <dir>]   database and assets, checksums, a restore proof
penpair restore <dir> --yes     replace the instance's data (safety backup first)
penpair probe                   what the connected Penpot and its MCP offer, and the limits
penpair pages | tree | audit    read the file
penpair tokens dump | diff      token sets, and what a theme resolves to
penpair export <id> <out.png>   waits for two identical exports
penpair archive ... [--apply]   inspect first; one write only with --apply; read back and verified
```

The endpoint comes from `PENPAIR_MCP_URL` (shell or a git-ignored `.env.local`), then the Codex or Claude Code configuration. The URL holds a personal key and is never printed.
