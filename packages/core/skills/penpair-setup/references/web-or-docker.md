# Penpot on the web or in Docker

penpair works the same against both. The only difference is who runs Penpot. Everything you tell the assistant to do goes through the same connection: your personal key (`PENPAIR_MCP_URL` in `.env.local`) plus a Penpot file open in a visible browser tab with the plugin connected.

```
 your project ── penpair.config.json ──┬── profile "external": Penpot on the web (design.penpot.app or your team's)
 (commit the config)                   └── instance settings: Penpot in Docker on this computer
          │
          └── .env.local (never committed): PENPAIR_MCP_URL = your personal key for that one Penpot
```

## Which one

| | Web (the default) | Docker on this computer |
| --- | --- | --- |
| Install | Nothing. An account on design.penpot.app or your team's Penpot | Docker Desktop, a 2 GB download on first start |
| Start | Open the Penpot address | `penpair up` (Docker must be running) |
| Sharing with a team | An invite; Penpot's accounts decide who edits | One person's computer; others need the address and an account there |
| Where the design lives | On the Penpot service; it survives your laptop | In Docker volumes on this computer; back them up |
| Backup | Penpot's version history and the `.penpot` export in the File menu | `penpair backup`, `backup verify`, `restore` (proven on a scratch instance) |
| Offline | No | Yes |
| Data stays on your machine | No | Yes |
| Setup command | `penpair setup --web` | `penpair setup --docker` |
| Ports and containers | None | One instance per project, its own ports and volumes |

Pick **web** unless you need offline work, your data on your own machine, or an instance you can throw away. Teams that run their own Penpot use the web path with their own address: `penpair init --external https://penpot.example.org`.

## Checked and not checked

- Checked (2026-10-20): the hosted Penpot (2.18.4) and a Docker one (2.18.3) offer the same four tools and limits, and the deep check passes on both. See `docs/compatibility.md` in the repository.
- Not checked yet: a large file with a shared library on the hosted service, paid plans, two editors in one file, and whether a `.penpot` export restores everything.

## Switching

A project has one profile. To move from one to the other, set up the other kind in the project (`penpair init --external <address>` or `penpair init`), run `penpair connect --replace` with that Penpot's key, and move the design with the File menu's export and import. A key for the wrong Penpot is refused, so the two never mix by accident.
