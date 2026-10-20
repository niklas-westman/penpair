---
name: penpair-setup
description: Set up penpair in a project and connect it to a Penpot, on the web (the default) or in Docker on this computer. Use when a project has no penpair.config.json, when `penpair doctor` reports a failure, when the user asks to install, start, connect, repair or move their Penpot connection, or when an agent is told "set up penpair". Do not use for editing a Penpot file (penpot-design) or deciding how a screen looks (design-judgment).
metadata:
  version: "0.1.0"
  scope: setup and connection
  audience: any AI agent helping a person get from nothing to a working Penpot connection
compatibility: Node 22 and a terminal; a Penpot account on the web, or Docker Desktop for the on-computer variant.
---

# penpair-setup

Two ways to run Penpot, one way to connect. **Web** (design.penpot.app, or a team's own Penpot) is the default: nothing to install. **Docker** puts a private Penpot on this computer: offline, own data, throwaway per project. Both end the same way: the person's personal key in `.env.local` as `PENPAIR_MCP_URL`, the Penpot file open in a visible browser tab with its plugin connected, and `penpair doctor` all `ok`.

## The key never passes through you

The MCP key is the person's password to their Penpot. Keep it out of chat, logs, commands and commits. The person pastes it themselves into a prompt that hides it (`penpair connect`), or pipes it from their clipboard (`pbpaste | npx @penpair/core connect`). Your shell cannot answer a hidden prompt, so hand that one step to the person with the exact words below.

## Steps

1. **Look.** If `penpair.config.json` exists, run `npx @penpair/core doctor --json` and read it: `ok`, then each check. Done when you can name the first failing check, or say all pass. If all pass, stop here and say so.
2. **Choose where Penpot runs.** Recommend web. Choose Docker when the person asks for offline work, data that stays on this computer, or a disposable instance. Ask once, in one sentence, and take the answer. Done when the choice is stated. The decision table and what is checked: [references/web-or-docker.md](references/web-or-docker.md).
3. **Initialise.**
   - Web: `npx @penpair/core init --external https://design.penpot.app --gitignore` (a team's own Penpot: its address instead).
   - Docker: `npx @penpair/core init --gitignore`, then `npx @penpair/core up` (the first start downloads about 2 GB; Docker Desktop must be running). Done when `up` says Penpot is up.
   - The one-command alternative for a person at a terminal is `npx @penpair/core setup` (add `--web` or `--docker` to skip the question).
4. **Hand the browser steps to the person**, in these words, adapted to the choice:
   1. Open Penpot (the address `init` or `up` printed), log in or create an account, create a design file.
   2. Account, Integrations, MCP Server: switch it on and copy the address.
   3. In your own terminal, in this folder, run `npx @penpair/core connect` and paste the address (nothing is shown as you paste).
   4. In the design file: File, then MCP Server, then Connect. Keep that tab in front while we work.
5. **Verify.** Run `npx @penpair/core doctor --json` after the person says they are done. Done when `ok` is true and the check named `editor and plugin` says it is connected. A failing check carries a `remedy`; say it in plain words and let the person act. Common ones:

   | Check says | Meaning and fix |
   | --- | --- |
   | docker: not answering | Docker Desktop is not running. Start it, wait until it says running. |
   | containers / backend not ready | Run `npx @penpair/core up`; wait ten seconds; check again. |
   | editor and plugin: points at another instance | The key in `.env.local` belongs to a different Penpot. Run `npx @penpair/core connect --replace` and paste this Penpot's key. |
   | editor and plugin: not connected or suspended | The tab is asleep or the plugin is not connected. Do step 4.4 again; keep the tab in front. |
   | key file: git would commit it | Add `.env.local` to `.gitignore`; `penpair connect` does it. |

6. **Install the rules.** Run `npx @penpair/core skills install`, add the printed rows to the project's agent guide, then fill in `.skills/penpot-design/references/project-facts.md` with the person (the Penpot file, token sets, naming, who approves). Done when that file has no `<...>` placeholders left.

## Moving between web and Docker

A project has one profile. To switch, keep the old `penpair.config.json` aside, run `init` again for the other kind, then `penpair connect --replace` with the new Penpot's key (keys belong to one Penpot; a key for the other one is refused). Designs do not move on their own: export from the old Penpot (the File menu's export, as `.penpot`) and import into the new one.

## Rules

- Never run `up`, `down`, `restore` or `init` outside the project folder the person named.
- Never run `penpair probe --deep --write` on a file the person has not called a scratch file; it creates and removes a temporary board.
- Read `penpair --help` for the current commands; this skill names only the setup ones.
- Report each check you did not run.
