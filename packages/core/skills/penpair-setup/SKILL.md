---
name: penpair-setup
description: Set up penpair in a project and connect it to a Penpot, on the web (the default) or in Docker on this computer. Use when a project has no penpair.config.json, when `penpair doctor` reports a failure, when the user asks to install, start, connect, repair or move their Penpot connection, or when an agent is told "set up penpair". Do not use for editing a Penpot file (penpair-design) or deciding how a screen looks (design-judgment).
metadata:
  version: "0.1.0"
  scope: setup and connection
  audience: any AI agent helping a person get from nothing to a working Penpot connection
compatibility: Node 22 and a terminal; a Penpot account on the web, or Docker Desktop for the on-computer variant.
---

# penpair-setup

Two ways to run Penpot, one way to connect. **Web** (design.penpot.app, or a team's own Penpot) is the default: the package `@penpair/web`, nothing else to install. **Docker** (the package `@penpair/docker`, which includes everything in `@penpair/web`) puts a private Penpot on this computer: offline, own data, throwaway per project. Both end the same way: the person's personal key in `.env.local` as `PENPAIR_MCP_URL`, the Penpot file open in a visible browser tab with its plugin connected, and `penpair doctor` all `ok`.

## The key never passes through you

The MCP key is the person's password to their Penpot. Keep it out of chat, logs, commands and commits. The person pastes it themselves into a prompt that hides it (`penpair connect`), or pipes it from their clipboard (`pbpaste | npx @penpair/web connect`). Your shell cannot answer a hidden prompt, so hand that one step to the person with the exact words below.

## Steps

1. **Look.** If `penpair.config.json` exists, run `npx @penpair/web doctor --json` and read its versioned envelope: `data.ok`, then `data.checks`. Done when you can name the first failing check, or say all pass. If all pass, skip connection repair and check the companion recommendations in step 7 before reporting setup complete.
2. **Choose where Penpot runs.** Recommend web. Choose Docker when the person asks for offline work, data that stays on this computer, or a disposable instance. Ask once, in one sentence, and take the answer. Done when the choice is stated. The decision table and what is checked: [references/web-or-docker.md](references/web-or-docker.md).
3. **Initialise.**
   - Web: `npx @penpair/web init --external https://design.penpot.app --gitignore` (a team's own Penpot: its address instead).
   - Docker: `npm i -D @penpair/docker` (the same command as `@penpair/web` with the Docker commands added; install it instead of `@penpair/web`, not beside it), then `npx penpair init --gitignore` and `npx penpair up` (the first start downloads about 2 GB; Docker Desktop must be running). Done when `up` says Penpot is up. For a person at a terminal, `npx @penpair/docker setup --docker` does it in one go.
   - The one-command alternative for a person at a terminal is `npx @penpair/web setup` (add `--web` or `--docker` to skip the question).
4. **Hand the browser steps to the person**, in these words, adapted to the choice:
   1. Open Penpot (the address `init` or `up` printed), log in or create an account, create a design file.
   2. Account, Integrations, MCP Server: switch it on and copy the address.
   3. In your own terminal, in this folder, run `npx @penpair/web connect` and paste the address (nothing is shown as you paste).
   4. In the design file: File, then MCP Server, then Connect. Keep that tab in front while we work.
5. **Verify.** Run `npx @penpair/web doctor --json` after the person says they are done. Done when `data.ok` is true and the check named `editor and plugin` says it is connected. A failing check carries a `remedy`; say it in plain words and let the person act. Common ones:

   | Check says | Meaning and fix |
   | --- | --- |
   | docker: not answering | Docker Desktop is not running. Start it, wait until it says running. |
   | containers / backend not ready | Docker projects only: run `npx penpair up`; wait ten seconds; check again. |
   | editor and plugin: points at another instance | The key in `.env.local` belongs to a different Penpot. Run `npx @penpair/web connect --replace` and paste this Penpot's key. |
   | editor and plugin: not connected or suspended | The tab is asleep or the plugin is not connected. Do step 4.4 again; keep the tab in front. |
   | key file: git would commit it | Add `.env.local` to `.gitignore`; `penpair connect` does it. |

6. **Install the rules.** Run `npx @penpair/web skills install`, add the printed rows to the project's agent guide, then fill in `.skills/penpair-design/references/project-facts.md` with the person (the Penpot file, token sets, naming, who approves). Done when that file has no `<...>` placeholders left.

7. **Recommend companions for the task.** Read the [adapter guide](https://github.com/niklas-westman/penpair/blob/main/docs/adapters.md). A library adapter brings the project's chosen component-library tokens and recipes into the workflow. When frontend implementation/comparison is in scope, recommend `@penpair/reflection-check`, installed at the same version as the command/core and merged into the existing `adapters` list. State the remaining requirements: approved baselines, explicit case mappings and a real browser provider. Record those as pending until configured and exercised; connection-ready does not mean comparison-ready. Design-only projects can defer comparison setup.

## Moving between web and Docker

A project has one profile. To switch, keep the old `penpair.config.json` aside, run `init` again for the other kind, then `penpair connect --replace` with the new Penpot's key (keys belong to one Penpot; a key for the other one is refused). Designs do not move on their own: export from the old Penpot (the File menu's export, as `.penpot`) and import into the new one.

## Rules

- Never run `up`, `down`, `restore` or `init` outside the project folder the person named.
- Never run `penpair probe --deep --write` on a file the person has not called a scratch file; it creates and removes a temporary board.
- Read `penpair --help` for the current commands; this skill names only the setup ones.
- Report each check you did not run.

## Private references and rotation

A person can configure `PENPAIR_MCP_URL_FILE` or a `connection.credential` file/macOS Keychain reference. Resolve it only at connection time and keep returned values out of messages. Connect reuses the reference without copying its URL into `.env.local`. Rotate that value in private storage, reconnect the intended visible editor and confirm the same public file pin with doctor. The legacy hidden `connect --replace` flow handles pasted URLs. Treat permission/history warnings as owner review tasks; retain historical metadata without printing old keys or rewriting history automatically.
