# Changelog

## 0.1.0

First version.

- `penpair setup`: one guided command from nothing to a working connection. Penpot on the web is the default (design.penpot.app or your team's own); Docker on your computer is the alternative.
- `penpair connect`: takes your personal MCP key without showing it, refuses a key that belongs to another Penpot, stores it in a git-ignored `.env.local`, waits for the editor and plugin.
- `penpair doctor [--json]`: what works, what does not, what to do about it; also that `.env.local` is kept out of git.
- Read and write your Penpot file safely: `pages`, `tree`, `audit`, `tokens dump|diff`, `export`, `archive`, `probe` (and `probe --deep --write`), `run` for your own snippets. A change looks first, writes once and reads back.
- `penpair baselines`: export a page's frames as approved reference images with a manifest and ready-made Reflection cases; a changed design is replaced only with `--update`. Run end to end against Reflection.
- Skills for AI agents, installed with `penpair skills install`: `penpair-setup`, `penpot-design`, `design-judgment`.
- Docker: one Penpot per project with generated secrets, `up`, `down`, `status`, `backup`, `backup verify`, `restore`.
- Checked against Penpot 2.18.3 (Docker) and the hosted Penpot 2.18.4; see `docs/compatibility.md`. Not proven yet: a large file with a shared library on the hosted service, paid plans, two editors in one file, and a full `.penpot` export and import round trip.
