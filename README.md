<p align="center">
  <img src="https://raw.githubusercontent.com/niklas-westman/penpair/main/docs/assets/logo.png" alt="penpair" width="120" height="120">
</p>

<h1 align="center">penpair</h1>

<p align="center"><strong>Design together. Build together.</strong></p>

<p align="center">
  One command connects your AI coding assistant to your <a href="https://penpot.app">Penpot</a> design file,<br>
  so people and agents work on the same design, safely and repeatably.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@penpair/core"><img alt="npm" src="https://img.shields.io/npm/v/@penpair/core?color=0A5CFF&label=%40penpair%2Fcore"></a>
  <a href="https://github.com/niklas-westman/penpair/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/niklas-westman/penpair/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/niklas-westman/penpair/blob/main/LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-0A5CFF"></a>
  <img alt="Node 22 or later" src="https://img.shields.io/badge/node-%E2%89%A522-0A5CFF">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#web-or-docker">Web or Docker</a> ·
  <a href="#add-penpair-to-your-repo">Add to your repo</a> ·
  <a href="#packages">Packages</a> ·
  <a href="#use-it-with-marwes">Marwes</a> ·
  <a href="#for-an-ai-agent">For an AI agent</a>
</p>

---

penpair makes a Penpot design file the **source of truth** for your project's UI. Your assistant reads the real design, changes it with tested operations that look first, write once and read back, and follows written-down rules for how to work in Penpot. You review the result in Penpot as usual.

|  |  |
| --- | --- |
| **Connect it** | Point it at Penpot on the web, or your own, with one guided command and a check that it works. |
| **Drive it** | Inspect, build, audit, export, archive and manage design tokens through Penpot's MCP and plugin API. |
| **Know it** | The rules and the quirks of the tool ship with the code as skills your agent follows. |
| **Extend it** | Plug in your component library, your checks and your own snippets. The core stays neutral. |

## Quick start

> **New here, or not a terminal person?** Follow the step-by-step guide with the browser steps: **[Getting started →](https://github.com/niklas-westman/penpair/blob/main/docs/getting-started.md)**

You need [Node.js](https://nodejs.org) 22 or later and a terminal. In your project's folder:

```bash
npx penpair setup
```

It asks where your Penpot is and does the rest, saying in plain words what it is doing and what it is waiting for:

1. writes a small config you can commit (`penpair.config.json`, no secrets),
2. takes your personal key **without showing it** and keeps it in a git-ignored `.env.local`,
3. waits while you connect the plugin in your browser (**File, MCP Server, Connect**),
4. reads your file once to prove it works,
5. installs the rules your AI assistant follows.

Run it again any time; it continues where it stopped. `npx penpair doctor` tells you what works, what does not and what to do about it.

## Web or Docker

Two ways to run Penpot, one way to connect. Pick one; you can switch later.

|  | **On the web** (recommended) | **In Docker, on your computer** |
| --- | --- | --- |
| What | [design.penpot.app](https://design.penpot.app) (free account) or your team's own Penpot | A private Penpot per project on your machine |
| Install | Nothing | Docker Desktop, a 2 GB first download |
| Good for | Getting going fast, sharing with a team by invite | Offline work, data that stays with you, an instance you can throw away |
| Backup | Penpot's version history and its `.penpot` export | `penpair backup`, `backup verify`, `restore` |
| Set it up | `npx penpair setup --web` | `npx penpair setup --docker` |

The full comparison, what is checked and how to switch: **[Web or Docker →](https://github.com/niklas-westman/penpair/blob/main/packages/core/skills/penpair-setup/references/web-or-docker.md)**

## Add penpair to your repo

```bash
cd your-project
npx penpair setup            # asks: web or this computer
```

Then commit what it made (not `.env.local`; it is already in `.gitignore`):

```bash
git add penpair.config.json .gitignore .skills .agents .claude
git commit -m "Add penpair"
```

Everyone who works with the assistant does their own `npx penpair connect`: the key belongs to a person, not to the repo. To pin penpair for the team, add it as a dev dependency: `npm i -D penpair`. To write your own Penpot operations, use the library: `npm i -D @penpair/core` and `import { defineSnippet } from "@penpair/core"`.

## Packages

| Package | What it is | Status |
| --- | --- | --- |
| [`penpair`](https://www.npmjs.com/package/penpair) | The command: `npx penpair …` | 0.1.0 |
| [`@penpair/core`](https://www.npmjs.com/package/@penpair/core) | The library, the command, the skills, and both ways of running Penpot | 0.1.0 |
| `@penpair/docker` | The Docker way of running Penpot, as its own opt-in package | Planned. Today it is inside `@penpair/core` and you choose with `setup --docker`; web users will then not carry it. |
| `@penpair/marwes` | The adapter for the Marwes component library | Planned, see below |

## Use it with Marwes

Using [Marwes UI](https://marwes.io), the themeable component library for React, Vue and Svelte? Connecting Marwes is the recommended setup: your Penpot file then speaks the same tokens and components as your code, so what is designed is what gets built. The adapter, `@penpair/marwes`, is the next package on the plan: it will import the Marwes tokens into your Penpot file and check that frames use them. Until it ships, set up penpair as above and name Marwes as your library in the project facts the setup skill asks you to fill in; the assistant then works against Marwes's tokens and components.

## For an AI agent

If you were told to set penpair up, read [the setup skill](https://github.com/niklas-westman/penpair/blob/main/packages/core/skills/penpair-setup/SKILL.md) first and follow it. In short:

- Run `npx penpair doctor --json` to see where things stand; every failing check carries a `remedy`.
- Web is the default; use Docker only when the person asks for offline or local data.
- **The personal MCP key never goes through you.** The person pastes it themselves into `npx penpair connect` (a hidden prompt), or pipes it from their clipboard.
- Done means `doctor` reports `ok: true` and "editor and plugin" connected. Then `npx penpair skills install` gives you the rules for working in Penpot (`penpot-design`) and for judging a screen (`design-judgment`).

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

## Good to know

- Penpot's plugin needs the **editor tab open and visible** while the assistant works, so penpair cannot run unattended overnight. It acts on one Penpot at a time, on the page you have open.
- Checked against Penpot 2.18.3 (Docker) and the hosted Penpot 2.18.4: the same tools and limits, and a full deep check on both ([compatibility](https://github.com/niklas-westman/penpair/blob/main/docs/compatibility.md)). Not proven yet: a large file with a shared library on the hosted service, paid plans, two editors in one file, and a full `.penpot` export and import round trip.
- penpair is early (0.1.0). Expect rough edges and quick fixes. The plan and the open questions are in [PLAN.md](https://github.com/niklas-westman/penpair/blob/main/PLAN.md).

## Documentation

- [Getting started](https://github.com/niklas-westman/penpair/blob/main/docs/getting-started.md): step by step, for designers and for whoever sets it up
- [Guide](https://github.com/niklas-westman/penpair/blob/main/docs/guide.md): extension points, instances, commands
- [Compatibility](https://github.com/niklas-westman/penpair/blob/main/docs/compatibility.md): what was checked on which Penpot
- [Releasing](https://github.com/niklas-westman/penpair/blob/main/docs/releasing.md), [Changelog](https://github.com/niklas-westman/penpair/blob/main/CHANGELOG.md)

penpair is the other half of [Reflection](https://github.com/niklas-westman/reflection): Reflection checks that an implementation matches its design; penpair holds and drives the design that everything is measured against.

## Contributing and security

Issues and small pull requests are welcome: see [CONTRIBUTING](https://github.com/niklas-westman/penpair/blob/main/CONTRIBUTING.md). Your Penpot MCP key is a password; read [SECURITY](https://github.com/niklas-westman/penpair/blob/main/SECURITY.md) before you report a problem.

## Licence

[MIT](https://github.com/niklas-westman/penpair/blob/main/LICENSE)
