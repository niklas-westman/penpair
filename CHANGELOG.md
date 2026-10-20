# Changelog

## 0.1.1

The packages are split so that each way of running Penpot has its own command package, and `@penpair/core` is a pure library.

- **`@penpair/web`**: the `penpair` command for Penpot on the web (the default). Install this one.
- **`@penpair/docker`**: the same command with the Docker commands added (`up`, `down`, `status`, `backup`, `backup verify`, `restore`). It includes everything in the core, so install it instead of `@penpair/web`, not beside it.
- **`@penpair/core`**: the library and engine, with the skills. It no longer has a command, and it knows nothing about Docker: it offers a plug-in point (`runCli`, `LocalProfile`) that `@penpair/docker` uses.
- Version 0.1.0 of `@penpair/core` contained the command and the Docker code together; Docker users of 0.1.0 move to `@penpair/docker`.
- `penpair` (the short name for `@penpair/web`) waits for npm to allow the name.

## 0.1.0

First version. Published as `@penpair/core`; the short `penpair` wrapper waits for npm to allow the name.

- `penpair setup`: one guided command from nothing to a working connection. Penpot on the web is the default (design.penpot.app or your team's own); Docker on your computer is the alternative.
- `penpair connect`: takes your personal MCP key without showing it, refuses a key that belongs to another Penpot, stores it in a git-ignored `.env.local`, waits for the editor and plugin.
- `penpair doctor [--json]`: what works, what does not, what to do about it; also that `.env.local` is kept out of git.
- Read and write your Penpot file safely: `pages`, `tree`, `audit`, `tokens dump|diff`, `export`, `archive`, `probe` (and `probe --deep --write`), `run` for your own snippets. A change looks first, writes once and reads back.
- `penpair baselines`: export a page's frames as approved reference images with a manifest and ready-made Reflection cases; a changed design is replaced only with `--update`. Run end to end against Reflection.
- Skills for AI agents, installed with `penpair skills install`: `penpair-setup`, `penpot-design`, `design-judgment`.
- Docker, as its own opt-in package `@penpair/docker`: one Penpot per project with generated secrets, `up`, `down`, `status`, `backup`, `backup verify`, `restore`. Web users carry none of it; without the package the command says how to install it.
- Checked against Penpot 2.18.3 (Docker) and the hosted Penpot 2.18.4; see `docs/compatibility.md`. Not proven yet: a large file with a shared library on the hosted service, paid plans, two editors in one file, and a full `.penpot` export and import round trip.
