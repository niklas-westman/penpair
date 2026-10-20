# penpair

**Design together. Build together.**

penpair makes a [Penpot](https://penpot.app) design file the source of truth for a project's UI, and lets people and AI coding agents work on it together, safely and repeatably.

Status: **0.1.0, early.** Expect rough edges and quick fixes; the plan and what is not proven yet are in [PLAN.md](https://github.com/niklas-westman/penpair/blob/main/PLAN.md).

## Quick start (about ten minutes)

You need Node.js (current LTS) and a terminal. In your project's folder:

```
npx penpair setup
```

It asks where your Penpot is and does the rest, saying what it is doing in plain words:

1. **On the web** (the default): design.penpot.app with a free account, or your team's own Penpot. Nothing else to install.
2. **On this computer**: Penpot in Docker, for offline work or data that stays with you. Needs Docker Desktop.

Then it writes the config, takes your personal key **without showing it**, waits for you to connect the plugin in your browser (File, MCP Server, Connect), reads your file once to prove it works, and installs the rules your AI assistant follows. Run it again any time; it continues where it stopped. `npx penpair doctor` checks the connection whenever something seems off.

Step by step with the browser screens: [docs/getting-started.md](https://github.com/niklas-westman/penpair/blob/main/docs/getting-started.md).

## For an AI agent

If you were told to set penpair up, read [the setup skill](https://github.com/niklas-westman/penpair/blob/main/packages/core/skills/penpair-setup/SKILL.md) first and follow it. In short:

- Run `npx penpair doctor --json` to see where things stand; every failing check carries a `remedy`.
- Web is the default; Docker only when the person asks for offline or local data.
- **The personal MCP key never goes through you.** The person pastes it themselves into `npx penpair connect` (hidden prompt) or pipes it from their clipboard.
- Done means `doctor` reports `ok: true` and "editor and plugin" connected. After that, `npx penpair skills install` gives you the rules for working in Penpot (`penpot-design`) and for judging a screen (`design-judgment`).

## Web or Docker, and how they connect

penpair works the same against both; the only difference is who runs Penpot. The connection is always your personal key in `.env.local` plus a Penpot file open in a visible browser tab.

| | Web (default) | Docker on this computer |
| --- | --- | --- |
| Install | Nothing | Docker Desktop, 2 GB first download |
| Sharing | An invite | One computer |
| Backup | Penpot's version history and `.penpot` export | `penpair backup`, `verify`, `restore` |
| Command | `penpair setup --web` | `penpair setup --docker` |

The full comparison, what is checked and how to switch: [web-or-docker.md](https://github.com/niklas-westman/penpair/blob/main/packages/core/skills/penpair-setup/references/web-or-docker.md).

## What it does

- **Connect it:** point it at a Penpot on the web or your own, with one command and a check that it works.
- **Drive it:** an agent works through Penpot's MCP and plugin API with safe, tested operations: inspect, build, audit, export, archive, manage design tokens. Each change looks first, writes once and reads back.
- **Know it:** the rules and the written-down quirks of the tool ship with the code as skills the agent follows.
- **Extend it:** a project plugs in its component library, its checks and its own snippets. Nothing project-specific lives in the core.
- **Run it yourself (optional):** one Docker Penpot per project with generated secrets, backups and restore.

It is the other half of [Reflection](https://github.com/niklas-westman/reflection): Reflection checks that an implementation matches its design; penpair holds and drives the design that everything is measured against.

## Using it from code

The library is `@penpair/core` (`npm i -D @penpair/core`): `defineSnippet` for your own Penpot operations, the connection, the safe write runner. The command is `penpair`.

## Commands

`npx penpair --help` lists them all. The ones you need first:

| Command | What it does |
| --- | --- |
| `setup [--web \| --docker]` | The guided path from nothing to a working connection |
| `connect [--replace]` | Only the connection: your key (hidden), then waits for the editor |
| `doctor [--json]` | What works, what does not, and what to do about it |
| `pages`, `tree`, `audit`, `tokens dump` | Read your Penpot file |
| `export <shapeId> <out.png>` | A stable PNG of a frame |
| `skills install` | The agent's rules, into `.skills/`, visible to Codex and Claude Code |
| `up`, `down`, `backup`, `restore` | Docker only |

## Layout

| Path | What |
| --- | --- |
| `packages/core` | `@penpair/core`: the neutral core: connection, safe write runner, operations, setup and instance lifecycle (`penpair`) |
| `packages/penpair` | `penpair`: the short name for the command (`npx penpair`); it runs `@penpair/core` |
| `packages/core/skills` | The knowledge packs: setup, the Penpot skill, design judgment. Installed into a project's `.skills/` with `penpair skills install` |
| `packages/core/src/docker` | The Docker way of running Penpot, kept apart from the connection so it can become `@penpair/docker` |
| `docker` | Notes on the pinned Penpot compose template |
| `docs` | Getting started, the guide to extension points, the compatibility matrix |
