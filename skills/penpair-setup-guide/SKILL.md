---
name: penpair-setup-guide
description: Guide first-time Penpair installation through recommended assisted setup or user-run manual steps. Use when someone wants to install Penpair, connect an assistant to Penpot or choose an installation route. Use penpair-setup for a focused repair of an existing connection and penpair-design for work in a connected design file.
metadata:
  version: "0.1.0"
  audience: any AI coding assistant (Claude Code, Codex, GitHub Copilot) guiding a person through a first setup
compatibility: Node 22 or later and a terminal. A Penpot account on the web, or Docker Desktop for Penpot on this computer. The person does the browser steps and pastes their own key.
---

# penpair setup guide

You are the person's guide from "I have heard of penpair" to "my assistant just designed something in my Penpot file". penpair connects an AI assistant to a [Penpot](https://penpot.app) design file, with tested operations and written rules, so the assistant can build and check real pages. The person may be a designer who rarely opens a terminal, or a developer who has never used Penpot; read the cues and adjust your words.

## Choose how the person wants to install

Installation route and Penpot hosting are separate choices. Web is the default hosting choice in either route; Docker remains optional.

- **Assisted — recommended:** use the guided steps below. Explain each action, run permitted project commands and hand browser/key steps to the person.
- **Manual:** when the person asks to install it themselves, read https://raw.githubusercontent.com/niklas-westman/penpair/main/docs/getting-started.md and give them the relevant commands and expected results. Do not execute installation, initialization, skill writes or connection commands for them. Run diagnostics only if they ask you to. Wait for their result when guiding one step at a time.

Honor a route already stated. For an otherwise unspecified first installation, recommend assisted setup and offer manual; do not add this choice to a focused repair request. Read https://raw.githubusercontent.com/niklas-westman/penpair/main/docs/installation.md when explaining the alternatives, including the person-operated terminal wizard. If a reference cannot be read, say so and use the steps in this skill as the manual instructions without executing them.

When switching routes, keep the chosen command package, package manager, config, credentials and completed steps. Inspect progress before running a new initialization; do not reset a working setup. Both routes need the same file pin, healthy doctor/pages checks and reviewed skill/instruction installation. Connection-ready is separate from comparison-ready. Manual instructions or a user-reported result are not checks you performed yourself.

For the assisted route, work as a guide, not an installer: **one step at a time, one question at a time**. Say what you are about to do and why in a sentence, do it, show the result, and move on. Ask only the questions listed below, at the moment they matter. Wait for the person whenever a step needs their browser or their key; never guess that they are done.

## You may only have this file

The person may have linked this file into a chat in their own project, with no copy of penpair anywhere. Everything you need to guide them is on this page; nothing has to be cloned. penpair is open source at https://github.com/niklas-westman/penpair and installs from npm. When you need more than this page, read these raw files (plain Markdown, fetchable):

| Read it for | URL |
| --- | --- |
| The overview, every package and command | https://raw.githubusercontent.com/niklas-westman/penpair/main/README.md |
| The same setup by hand, with browser steps | https://raw.githubusercontent.com/niklas-westman/penpair/main/docs/getting-started.md |
| Web or Docker, the full comparison | https://raw.githubusercontent.com/niklas-westman/penpair/main/packages/core/skills/penpair-setup/references/web-or-docker.md |
| Companion adapters: why, installation, registration and browser readiness | https://raw.githubusercontent.com/niklas-westman/penpair/main/docs/adapters.md |
| Marwes tokens: config, commands, CI | https://raw.githubusercontent.com/niklas-westman/penpair/main/docs/marwes-tokens.md |
| Extension points, snippets, instances | https://raw.githubusercontent.com/niklas-westman/penpair/main/docs/guide.md |

`npx penpair --help` lists every command of the installed version, and `npx penpair --version` says which one that is. The version on npm can be older than the repository; when this page and `--help` differ, `--help` is right for the person's install.

### Which packages exist, and which to install

| Package | Install it when | What it gives |
| --- | --- | --- |
| `@penpair/web` | Penpot runs on the web (design.penpot.app or a team's server). The default | The `penpair` command and the library |
| `@penpair/docker` | Penpot should run in Docker on this computer | Everything in `@penpair/web`, plus `up`, `down`, `status`, `backup`, `restore`. Install it **instead of** `@penpair/web`, never beside it: both provide the `penpair` command |
| `@penpair/marwes-ui` | The project's app uses Marwes UI (`@marwes-ui/*`) and the person wants its tokens in Penpot | `penpair marwes tokens …`. Goes next to one of the two above |
| `@penpair/reflection-check` | Recommended when implementing a frontend from Penpot and verifying it in a browser | Approved design cases mapped to real browser/provider comparison evidence; install next to one command package at the same version |
| `@penpair/core` | Not for setup. Only for someone writing their own tooling on the library | Comes with the two command packages anyway |
| `penpair` (no scope) | Never: the name is not on npm yet | Nothing |

So one command package, the library companion when that library is used, and the recommended Reflection Check companion for frontend verification. Adapter installation and registration are separate from approved-baseline and browser-provider readiness. Install them as dev dependencies; then `npx penpair <command>` runs the project's own copy. **Without a local install, bare `npx penpair` fails** (that name is not on npm): use `npx @penpair/web <command>` (or `npx @penpair/docker <command>`) instead.

### The commands this guide uses

| Command | What it does |
| --- | --- |
| `penpair init --external <address> --gitignore` | Web: writes `penpair.config.json` for that Penpot, keeps `.env.local` out of git |
| `penpair init --gitignore [--port 9002]` then `penpair up` | Docker: writes the config and a private `.penpair/` folder, then starts Penpot (about 2 GB the first time) |
| `penpair connect [--replace]` | Takes the person's MCP link through a hidden prompt (or a pipe), saves it in `.env.local`, then waits up to five minutes for the plugin |
| `penpair doctor [--json]` | Every check, `ok` or not, each with a `remedy`. `--json` is for you |
| `penpair pages` | The open file and its pages: the quickest proof the connection works |
| `penpair skills install` | Copies the agent rules (`penpair-setup`, `penpair-design`, `penpair-recipes`, `penpair-handoff`, `penpair-verify`, `design-judgment`) into the project and links them for Claude Code and Codex |
| `penpair marwes tokens snapshot --write`, `push [--apply]` | Marwes only: build the expected tokens, then make Penpot match (looks first; `--apply` writes) |
| `penpair setup` | The same path as a guided terminal wizard, for a person who prefers to do it alone. It asks questions you cannot answer for them, so you use the steps below instead |

Everything that changes a Penpot file looks first and writes only with `--apply`.

## The key is the person's password

The MCP link Penpot gives the person contains a personal key. Anyone with it can edit their Penpot files. So:

- It never goes through you: not in chat, not in a command you run, not in a file you write, not in a commit.
- The person pastes it into `penpair connect`, which hides it and saves it to `.env.local` as `PENPAIR_MCP_URL` (readable only by them, git-ignored).
- If they paste it into the chat anyway, tell them plainly that it is now exposed and ask them to get a new key in Penpot (switch the MCP server off and on, or regenerate it if Penpot offers that, and check the address changed), then connect with `npx penpair connect --replace`. Do not repeat the link back.

This matters more than speed; a guide that leaks the key has failed even if everything else works.

## The path

Keep a short checklist in your replies so the person sees where they are:

```
1 Check  2 Web or Docker  3 Account  4 Install  5 Plugin  6 MCP link  7 Verify  8 Companions  9 Rules  10 First POC
```

### 1. Check where things stand

- `node -v`: penpair needs 22 or later. If it is missing or older, point them to https://nodejs.org (the LTS installer) and wait.
- **Find the right folder.** penpair is set up per project, in the root of the project whose design it will hold. Look at where you are:
  - **A project of theirs** (a `package.json`, an app): the normal case. Confirm it is the one they mean.
  - **A clone of the penpair repository itself** (root `package.json` named `penpair-workspace`, a `packages/core` folder): that is penpair's source, not a place to set it up. Ask which project it is for, and work there. Installing from npm in that project is right even if they cloned penpair; linking the clone is only for people changing penpair.
  - **No project at all** (an empty folder, or a designer who just wants to try it): offer to make one, for example `mkdir penpair-trial && cd penpair-trial && npm init -y`. A `package.json` is all penpair needs.
  - **A monorepo:** install at the workspace root (pnpm needs `-w`, Yarn 1 needs `-W`), unless they want it in one package.
- Pick the package manager from the lockfile (`pnpm-lock.yaml`, `yarn.lock`, else npm) and use it in every install command. The commands here are written for npm.
- **Already started?** If `penpair.config.json` exists, install the project's dependencies first (`npm install`), then run `npx penpair doctor --json` (no local package in `package.json`? use `npx @penpair/web doctor --json`). All `ok` means penpair is set up: say so and jump to step 8. A failing check names a `remedy`; the usual ones are in step 7. Fix it and continue from the step it belongs to.

### 2. Ask: Penpot on the web, or in Docker?

Ask once, recommend web, take the answer:

> Where should Penpot run? **On the web** (recommended): a free account at design.penpot.app or your team's own Penpot, nothing else to install, easy to share. **In Docker on this computer**: works offline and keeps the data on your machine, but needs Docker Desktop and a 2 GB download.

If they have a team Penpot, use its address everywhere this guide says `https://design.penpot.app`. The full comparison is in the web-or-Docker file listed above.

While they decide, set one expectation early: penpair works through the Penpot tab in their browser, so that tab has to stay open and visible while the assistant works. It cannot design unattended overnight.

### 3. A Penpot account and a design file

- **Web:** they open https://design.penpot.app, sign up (with email or one of the sign-in buttons), confirm the email if asked, then create a project and a design file for this work. A fresh file is best for the first try.
- **Docker:** do step 4 first, because Penpot has to be running. Then they create the account on the local address `up` prints (no email confirmation there), and a project and a design file.

Wait until they say they have a design file open.

### 4. Install penpair and write the config

Install it as a dev dependency so the whole team gets the same version. Install one command package, never both.

- **Web:**
  ```bash
  npm i -D @penpair/web
  npx penpair init --external https://design.penpot.app --gitignore
  ```
- **Docker:** Docker Desktop must be running (`docker info` answers).
  ```bash
  npm i -D @penpair/docker
  npx penpair init --gitignore      # add --port 9002 if 9001 is taken
  npx penpair up                    # the first start downloads about 2 GB
  ```
  When `up` prints the address (for example http://127.0.0.1:9001), do step 3 there.

`init` writes `penpair.config.json` (no secrets, meant to be committed; `instance` is just a name, from the folder) and adds `.env.local` to `.gitignore`. Show them the config in a sentence or two. Some versions print `next: penpair connect` here; do step 5 first anyway, because `connect` waits for the plugin.

### 5. Switch on MCP and connect the plugin

The plugin comes first because `penpair connect` (step 6) waits for it, and then confirms right away.

1. In Penpot, open your **account menu** (your name or avatar), then **Integrations**, then **MCP Server**. Switch it on and **copy the address** it shows. It is your personal key; treat it like a password, and do not paste it here.
2. Open the design file. Choose **File**, then **MCP Server**, then **Connect**. A small window may appear; leave it.
3. **Keep this browser tab visible** while the assistant works. A tab in the background goes to sleep and the connection pauses; bringing it to the front resumes it.

### 6. Where the MCP link goes

The link goes into `.env.local` in the project, as `PENPAIR_MCP_URL=…`. `penpair connect` puts it there for them: it takes the link through a hidden prompt, refuses one that belongs to a different Penpot, makes the file readable only by them and keeps it out of git. You cannot answer a hidden prompt, and you should not see the key anyway, so the person runs it, with the link from step 5.1 still on their clipboard:

- **Their own terminal**, in this project folder: `npx penpair connect`, paste, Enter. Nothing appears as they paste; that is on purpose.
- **In Claude Code**, without leaving the chat (macOS): type `! pbpaste | npx penpair connect`. It reads the clipboard, so the key never enters the conversation. (Linux: `xclip -selection clipboard -o` instead of `pbpaste`.)

When `connect` offers to pin the file, have the person check its name and ID before accepting. If they skipped it, verify the correct file is open before asking them to run `npx penpair connect --pin-file`; that flag accepts without another confirmation.

It ends with "Connected to the file …" and the file's pages. If it says it did not see the editor, the key is already saved: redo step 5.2 and 5.3, then run `npx penpair connect` again (it reuses the saved key). By hand, that single line in `.env.local` is all it is; the file must stay out of git.

### 7. Verify

Run `npx penpair doctor --json` and read `data.ok` and each `data.checks` entry (the exit code is non-zero while anything fails). Done when `data.ok` is `true` and the `editor and plugin` check says connected. Then run `npx penpair pages` and read the page names back to them: proof that you can see their file.

A failing check carries a `remedy`; say it in plain words and let them act. The usual ones: Docker not running (start Docker Desktop), containers not running (`npx penpair up`), the key belongs to another Penpot (`npx penpair connect --replace` with this Penpot's link), plugin not connected or the tab is asleep (redo step 5.2 and 5.3).

**An address that is not theirs, before `connect` has run.** Until `.env.local` exists, penpair borrows a Penpot MCP server from the assistant's own configuration (`~/.codex/config.toml` or `~/.claude.json`, a server named `penpot`), and `doctor` names it: `(from codex-config)` or `(from claude-config)`. That is often an old local Penpot, for example `http://localhost:9001`, and the check fails with "points at … which is not …". It is not their mistake and nothing needs deleting: the order is environment, then `.env.local`, then those configurations, so step 6 fixes it. Its remedy says to put the address in `.env.local`; that is what `connect` does, so do not edit the file for them.

### 8. Choose companion adapters

Explain the library and implementation-checking roles using the adapter guide above. Keep existing adapter entries and align directly installed versions with `npx penpair --version`.

**Library companion**

First look: does any `package.json` in the project depend on `@marwes-ui/*`? Then ask, with what you found:

> Do you want to use **Marwes UI** ([marwes.io](https://marwes.io)), the themeable component library for React, Vue and Svelte? With it, your Penpot file gets the same design tokens as your code, and penpair warns you when they drift apart. (I can see your project already uses it. / Your project does not use it yet; you can skip this and add it any time.)

- **No:** skip the library part and continue to the frontend-verification recommendation below.
- **Yes, and the project uses Marwes:**
  1. `npm i -D @penpair/marwes-ui`
  2. Append to the existing `adapters` array in `penpair.config.json`: `"@penpair/marwes-ui"` and a `marwes` block. Find their theme file (search for the Marwes theme export) and ask them to confirm it; leave `themes` out if they use the plain Marwes theme. Read the Marwes tokens file listed above for the block's settings and an example.
  3. `npx penpair marwes tokens snapshot --write`, and tell them to commit the snapshot file.
  4. `npx penpair marwes tokens push` first, without `--apply`: it only shows what would change in Penpot. Show them the summary and ask before running it with `--apply`: it writes to their Penpot file. Review ownership and designer-edit conflicts; require an explicit adopt/overwrite decision instead of silently replacing intentional values.
- **Yes, but the project does not use Marwes yet:** installing a component library in their app is a bigger decision than this setup. Note it as a next step and continue to the frontend-verification recommendation.

**Frontend-verification companion**

When the requested workflow includes frontend implementation and visual checking, recommend `@penpair/reflection-check`. Explain: approved Penpot references plus explicit case mappings and a real project browser provider let the agent compare the implemented route/theme/state with the intended design. It can be used with or without the library companion.

Use the adapter guide for the matching-version install and append `"@penpair/reflection-check"` to the existing `adapters` array. Keep the project's package manager and dependency location. Record installed/registered separately from references approved, cases mapped, provider configured and browser verified. The package does not bundle a browser or configure the application's states. A design-only setup can defer it; a frontend handoff should explicitly recommend it and record missing integration work rather than leave the companion invisible.

Continue to the handoff skill once installed. A reusable browser starter is available at https://github.com/niklas-westman/penpair/blob/main/examples/reflection-browser/README.md; project-specific state hooks and a real provider are still required. No owner approval or browser result may be inferred from a successful install.

### 9. Install the rules the assistant follows

**Just trying it?** Use a throwaway project folder, install the skills with an explicit instruction destination below and keep unknown project facts marked as pending. A commit can wait; the first design trial remains optional.

```bash
npx penpair skills install --agents AGENTS.md --dry-run
npx penpair skills install --agents AGENTS.md
npx penpair skills check --agents AGENTS.md --json
```

Review the preview before applying. This installs setup, design, recipe, handoff, verification and judgment skills, creates discovery links and adds task routing to the selected instruction file. Use `CLAUDE.md` instead if that is the project's chosen file. Existing text outside the owned section is preserved. Discovery checks do not prove actual skill use in a session. Even in a trial folder, select the instruction destination explicitly so routing can be verified.

Then fill in `penpair-design/references/project-facts.md` (in the skills folder the install named) together with them: which Penpot file, the token sets, the names they use, who approves a design. Ask; do not invent. Placeholders they cannot answer yet can stay, marked as open.

In a git repository, offer to commit the setup (ask first; they may want to review it). No repository: skip this, or offer `git init` if they want one.

```bash
git add penpair.config.json .gitignore AGENTS.md .skills .agents .claude   # whichever exist; never .env.local
git commit -m "Add penpair"
```

Teammates later run only `npm install` and `npx penpair connect` with their own key: the key belongs to a person, not to the repo.

### 10. A first POC that shows what is possible

Now the fun part: a small test proof of concept that shows the whole loop, on its own page so nothing they have is touched.

1. **They make the page.** penpair works only on the page that is open in the editor, so ask them to add a page called **penpair POC** (the + next to Pages, in the left sidebar), click it so it is the open page, and keep the tab visible.
2. **They pick what to build.** Offer two or three prompts; they should be able to say it in their own words next time:
   - "Do a test POC: a sign-in screen for phone on the page penpair POC, with a small token set for its colours. Then export it and show me."
   - "Do a test POC: a small dashboard with a header, three stat cards and a table. Audit it for off-scale spacing and show me the export."
   - With Marwes: "Do a test POC: a settings page that uses only our Marwes tokens. Export it and show me."
3. **Learn the rules first.** Read the installed `penpair-design` skill (`.skills/penpair-design/SKILL.md`, or https://raw.githubusercontent.com/niklas-westman/penpair/main/packages/core/skills/penpair-design/SKILL.md if step 9 was skipped) and its plugin gotchas before your first script. In short: every change to Penpot is a **project snippet**, a `.mjs` file whose default export has `inspect` (looks and returns what would change), `apply` (writes once, safe to run again) and `readback` (checks from scratch and returns `problems: []`). Each part is plain Penpot plugin code, under 90 KB.
4. **Start from the example.** https://raw.githubusercontent.com/niklas-westman/penpair/main/skills/penpair-setup-guide/references/poc-snippet.mjs is a phone sign-in board with a small colour token set and a button component. Save it as `snippets/poc-sign-in.mjs` in the project. Its `page` constant must be the exact name of the page they opened; change it if they named it differently. Adapt the content to what they picked (and rename the snippet's `name` if it is no longer a sign-in).
5. **Register it.** Add one key to `penpair.config.json`, keeping the JSON valid:
   ```json
   "snippets": ["snippets"]
   ```
   Then `npx penpair snippets check` should say `ok every snippet is valid plugin code and small enough`, and `npx penpair snippets` lists it as `[project]`.
6. **Run it, look, then write.**
   ```bash
   npx penpair run poc-sign-in                 # looks only: what would change
   npx penpair run poc-sign-in --apply         # writes once, then reads back; problems must be empty
   npx penpair tree --page "penpair POC"       # find the board's id
   npx penpair export <boardId> poc.png --page "penpair POC"
   npx penpair audit --page "penpair POC" --prefix POC
   ```
   Export twice and look at the second image; the first after a write can be stale. The audit lists unbound colours, off-scale spacing, overflow and empty text: on this first POC, unbound colours are expected and make a good next step.
7. **Show and explain.** Show the image and name what it proved: you read the real file, wrote in one verified step, made tokens and a component, checked your own work. Then what they can ask for next: bind the colours to the tokens, a tablet variant, an audit of an existing page, or Reflection baselines to check the coded page against the design (`penpair baselines`, in the README).

## Wrapping up

Close with a short summary: where Penpot runs, what was installed, where the key lives (`.env.local`, never committed), whether Marwes is connected, and the daily routine:

1. Open the design file in Penpot, **File, MCP Server, Connect**, keep the tab visible.
2. (Docker only) `npx penpair up` if the computer was restarted; `npx penpair down` to stop.
3. When something feels off: `npx penpair doctor`.

Say plainly which steps were skipped or not verified, if any.

## Rules

- Run commands only in the project folder the person confirmed. Never run `up`, `down`, `restore` or `init` anywhere else.
- Writes to their Penpot (a token push, the POC) happen only after they said yes, and the POC goes on its own new page.
- Never run `penpair probe --deep --write` unless they call the file a scratch file.
- If a command or menu here does not match what they see, trust what they see, check `npx penpair --help`, and tell them the guide is out of date at that point.
