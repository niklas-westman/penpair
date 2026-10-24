---
name: penpair-setup
description: Help with assisted or manual Penpair installation, or connect and repair a project's Penpot setup, including a failing doctor check, suspended plugin or missing configuration. Use for connection and setup work; use penpair-design to edit designs and design-judgment to choose their composition.
metadata:
  version: "0.1.0"
  scope: setup and connection
  audience: any AI agent helping a person get from nothing to a working Penpot connection
compatibility: Node 22 and a terminal; a Penpot account on the web, or Docker Desktop for the on-computer variant.
---

# penpair-setup

Two ways to run Penpot, one way to connect. **Web** (design.penpot.app, or a team's own Penpot) is the default: the package `@penpair/web`, nothing else to install. **Docker** (the package `@penpair/docker`, which includes everything in `@penpair/web`) puts a private Penpot on this computer: offline, own data, throwaway per project. Both end the same way: the person's personal key in `.env.local` as `PENPAIR_MCP_URL`, the Penpot file open in a visible browser tab with its plugin connected, and `penpair doctor` all `ok`.

## Choose how the person wants to install

Installation route and Penpot hosting are separate choices. Web is the default hosting choice in either route; Docker remains optional.

- **Assisted — recommended:** use the guided steps below. Explain each action, run permitted project commands and hand browser/key steps to the person.
- **Manual:** when the person asks to install it themselves, read https://raw.githubusercontent.com/niklas-westman/penpair/main/docs/getting-started.md and give them the relevant commands and expected results. Do not execute installation, initialization, skill writes or connection commands for them. Run diagnostics only if they ask you to. Wait for their result when guiding one step at a time.

Honor a route already stated. For an otherwise unspecified first installation, recommend assisted setup and offer manual; do not add this choice to a focused repair request. Read https://raw.githubusercontent.com/niklas-westman/penpair/main/docs/installation.md when explaining the alternatives, including the person-operated terminal wizard. If a reference cannot be read, say so and use the steps in this skill as the manual instructions without executing them.

When switching routes, keep the chosen command package, package manager, config, credentials and completed steps. Inspect progress before running a new initialization; do not reset a working setup. Both routes need the same file pin, healthy doctor/pages checks and reviewed skill/instruction installation. Connection-ready is separate from comparison-ready. Manual instructions or a user-reported result are not checks you performed yourself.

## The key never passes through you

For an existing installation, use its local command and reviewed version
(`pnpm exec penpair` in pnpm projects) in place of the first-use `npx` examples
below. Preserve its chosen command package and current profile.

The MCP key is the person's password to their Penpot. Keep it out of chat, logs, commands and commits. The person pastes it themselves into a prompt that hides it (`penpair connect`), or pipes it from their clipboard (`pbpaste | npx @penpair/web connect`). Your shell cannot answer a hidden prompt, so hand that one step to the person with the exact words below.

## Steps

1. **Look.** If `penpair.config.json` exists, run `npx @penpair/web doctor --json` and read its versioned envelope: `data.ok`, then `data.checks`. Done when you can name the first failing check, or say all pass. If all pass, skip connection repair and continue with skill/instruction checks in step 6 and companions in step 7 before reporting setup complete.
2. **Choose where Penpot runs.** Recommend web. Choose Docker when the person asks for offline work, data that stays on this computer, or a disposable instance. Ask once, in one sentence, and take the answer. Done when the choice is stated. The decision table and what is checked: [references/web-or-docker.md](references/web-or-docker.md).
3. **Initialise.**
   - Web: `npx @penpair/web init --external https://design.penpot.app --gitignore` (a team's own Penpot: its address instead).
   - Docker: `npm i -D @penpair/docker` (the same command as `@penpair/web` with the Docker commands added; install it instead of `@penpair/web`, not beside it), then `npx penpair init --gitignore` and `npx penpair up` (the first start downloads about 2 GB; Docker Desktop must be running). Done when `up` says Penpot is up. For a person at a terminal, `npx @penpair/docker setup --docker` does it in one go.
   - The terminal wizard is person-operated: use `npx @penpair/web setup --web --agents AGENTS.md`, or the Docker package's `setup --docker --agents AGENTS.md`. Do not pass `--docker` to the web package. Prefer the installed local command for repeat use.
4. **Hand the browser steps to the person**, in these words, adapted to the choice:
   1. Open Penpot (the address `init` or `up` printed), log in or create an account, create a design file.
   2. Account, Integrations, MCP Server: switch it on and copy the address.
   3. In your own terminal, in this folder, run `npx @penpair/web connect` and paste the address (nothing is shown as you paste).
   4. In the design file: File, then MCP Server, then Connect. Keep that tab in front while we work.
5. **Verify.** When connecting, ask the person to check the file name and ID before accepting the pin. If pinning was skipped, verify the intended file before `penpair connect --pin-file`; the flag accepts without another confirmation. Run `npx @penpair/web doctor --json` after the person says they are done. Done when `data.ok` is true and the check named `editor and plugin` says it is connected. A failing check carries a `remedy`; say it in plain words and let the person act. Common ones:

   | Check says | Meaning and fix |
   | --- | --- |
   | docker: not answering | Docker Desktop is not running. Start it, wait until it says running. |
   | containers / backend not ready | Docker projects only: run `npx penpair up`; wait ten seconds; check again. |
   | editor and plugin: points at another instance | The key in `.env.local` belongs to a different Penpot. Run `npx @penpair/web connect --replace` and paste this Penpot's key. |
   | editor and plugin: not connected or suspended | The tab is asleep or the plugin is not connected. Do step 4.4 again; keep the tab in front. |
   | key file: git would commit it | Add `.env.local` to `.gitignore`; `penpair connect` does it. |

6. **Install the rules.** Use the installed local command when available (`pnpm exec penpair` in pnpm projects). Preview `penpair skills install --agents AGENTS.md --dry-run`, then apply the reviewed update to the selected instruction file. Preserve project customizations and fill in the installed `penpair-design/references/project-facts.md` (file pin, token sets, naming, who approves); use the destination printed by the installer. Run `penpair skills check --agents AGENTS.md --json` (using the chosen instruction destination) for Codex discovery/routing diagnostics, selecting `--only` for intentional partial installs. A passing file check does not prove a session loaded or correctly applied a skill. Done when required project facts and diagnostics are ready, or their missing evidence is reported explicitly.

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
