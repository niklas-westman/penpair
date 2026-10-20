---
name: penpair-setup-guide
description: Guide a person, step by step and in conversation, from nothing to a working penpair setup, then into a first proof-of-concept design. Covers getting a Penpot account, choosing Penpot on the web or in Docker, installing penpair, where the personal MCP link goes (and how it stays secret), connecting the plugin, the optional Marwes UI adapter, installing the agent rules, and a small test POC that shows what is possible. Use this whenever someone wants to start with penpair or Penpot plus an AI assistant, says "set up penpair", "install penpair", "connect my assistant to Penpot", "how do I get started", "onboard me", or has just discovered penpair and does not know where to begin, even if they do not name this guide. Do not use it to repair a single failing check in a project that already works (use penpair-setup), or for design work in a connected file (use penpair-design).
metadata:
  version: "0.1.0"
  audience: any AI coding assistant (Claude Code, Codex, GitHub Copilot) guiding a person through a first setup
compatibility: Node 22 or later and a terminal. A Penpot account on the web, or Docker Desktop for Penpot on this computer. The person does the browser steps and pastes their own key.
---

# penpair setup guide

You are the person's guide from "I have heard of penpair" to "my assistant just designed something in my Penpot file". penpair connects an AI assistant to a [Penpot](https://penpot.app) design file, with tested operations and written rules, so the assistant can build and check real pages. The person may be a designer who rarely opens a terminal, or a developer who has never used Penpot; read the cues and adjust your words.

Work as a guide, not an installer: **one step at a time, one question at a time**. Say what you are about to do and why in a sentence, do it, show the result, and move on. Ask only the questions listed below, at the moment they matter. Wait for the person whenever a step needs their browser or their key; never guess that they are done.

## The key is the person's password

The MCP link Penpot gives the person contains a personal key. Anyone with it can edit their Penpot files. So:

- It never goes through you: not in chat, not in a command you run, not in a file you write, not in a commit.
- The person pastes it into `penpair connect`, which hides it and saves it to `.env.local` as `PENPAIR_MCP_URL` (readable only by them, git-ignored).
- If they paste it into the chat anyway, tell them plainly that it is now exposed and ask them to switch the MCP server off and on again in Penpot (which issues a new link), then connect with the new one. Do not repeat the link back.

This matters more than speed; a guide that leaks the key has failed even if everything else works.

## The path

Keep a short checklist in your replies so the person sees where they are:

```
1 Check  2 Web or Docker  3 Account  4 Install  5 Plugin  6 MCP link  7 Verify  8 Marwes  9 Rules  10 First POC
```

### 1. Check where things stand

- `node -v`: penpair needs 22 or later. If it is missing or older, point them to https://nodejs.org (the LTS installer) and wait.
- Confirm the folder: penpair is set up per project, in the project's root. Ask which folder if you are not in a project. In a monorepo, install at the workspace root (pnpm needs `-w`, Yarn 1 needs `-W`).
- Pick the package manager from the lockfile (`pnpm-lock.yaml`, `yarn.lock`, else npm) and use it in every install command below. The commands here are written for npm.
- If `penpair.config.json` already exists, someone started before. Install the project's dependencies first (`npm install`; `npx penpair` needs the local package), then run `npx penpair doctor --json`. All `ok` means penpair is already set up: say so and jump to step 8. A failing check: fix it with its `remedy` (the penpair-setup skill has the common ones), then continue from the step it points to.

### 2. Ask: Penpot on the web, or in Docker?

Ask once, recommend web, take the answer:

> Where should Penpot run? **On the web** (recommended): a free account at design.penpot.app or your team's own Penpot, nothing else to install, easy to share. **In Docker on this computer**: works offline and keeps the data on your machine, but needs Docker Desktop and a 2 GB download.

If they have a team Penpot, use its address everywhere this guide says `https://design.penpot.app`. Details, if they want to compare: https://github.com/niklas-westman/penpair/blob/main/packages/core/skills/penpair-setup/references/web-or-docker.md

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

`init` writes `penpair.config.json` (no secrets, meant to be committed) and adds `.env.local` to `.gitignore`. Show them the config in a sentence or two.

### 5. Switch on MCP and connect the plugin

The plugin comes first because `penpair connect` (step 6) waits for it, and then confirms right away.

1. In Penpot, open your **account menu** (your name or avatar), then **Integrations**, then **MCP Server**. Switch it on and **copy the address** it shows. It is your personal key; treat it like a password, and do not paste it here.
2. Open the design file. Choose **File**, then **MCP Server**, then **Connect**. A small window may appear; leave it.
3. **Keep this browser tab visible** while the assistant works. A tab in the background goes to sleep and the connection pauses; bringing it to the front resumes it.

### 6. Where the MCP link goes

The link goes into `.env.local` in the project, as `PENPAIR_MCP_URL=…`. `penpair connect` puts it there for them: it takes the link through a hidden prompt, refuses one that belongs to a different Penpot, makes the file readable only by them and keeps it out of git. You cannot answer a hidden prompt, and you should not see the key anyway, so the person runs it, with the link from step 5.1 still on their clipboard:

- **Their own terminal**, in this project folder: `npx penpair connect`, paste, Enter. Nothing appears as they paste; that is on purpose.
- **In Claude Code**, without leaving the chat (macOS): type `! pbpaste | npx penpair connect`. It reads the clipboard, so the key never enters the conversation. (Linux: `xclip -selection clipboard -o` instead of `pbpaste`.)

It ends with "Connected to the file …" and the file's pages. If it says it did not see the editor, the key is already saved: redo step 5.2 and 5.3, then run `npx penpair connect` again (it reuses the saved key). By hand, that single line in `.env.local` is all it is; the file must stay out of git.

### 7. Verify

Run `npx penpair doctor --json`. Done when `ok` is `true` and the `editor and plugin` check says connected. Then run `npx penpair pages` and read the page names back to them: proof that you can see their file.

A failing check carries a `remedy`; say it in plain words and let them act. The usual ones: Docker not running (start Docker Desktop), containers not running (`npx penpair up`), the key belongs to another Penpot (`npx penpair connect --replace` with this Penpot's link), plugin not connected or the tab is asleep (redo step 5.2 and 5.3).

### 8. Ask: Marwes UI or not?

First look: does any `package.json` in the project depend on `@marwes-ui/*`? Then ask, with what you found:

> Do you want to use **Marwes UI** ([marwes.io](https://marwes.io)), the themeable component library for React, Vue and Svelte? With it, your Penpot file gets the same design tokens as your code, and penpair warns you when they drift apart. (I can see your project already uses it. / Your project does not use it yet; you can skip this and add it any time.)

- **No:** skip to step 9. Nothing is lost; it can be added later.
- **Yes, and the project uses Marwes:**
  1. `npm i -D @penpair/marwes-ui`
  2. Add to `penpair.config.json`: `"adapters": ["@penpair/marwes-ui"]` and a `marwes` block. Find their theme file (search for the Marwes theme export) and ask them to confirm it; leave `themes` out if they use the plain Marwes theme. The settings: https://github.com/niklas-westman/penpair/blob/main/docs/marwes-tokens.md
  3. `npx penpair marwes tokens snapshot --write`, and tell them to commit the snapshot file.
  4. `npx penpair marwes tokens push` first, without `--apply`: it only shows what would change in Penpot. Show them the summary and ask before running it with `--apply`: it writes to their Penpot file, and Marwes wins, so a token value someone changed by hand in Penpot is put back.
- **Yes, but the project does not use Marwes yet:** installing a component library in their app is a bigger decision than this setup. Note it as a next step, and skip to step 9.

### 9. Install the rules the assistant follows

```bash
npx penpair skills install
```

This puts the rules for working in Penpot (`penpair-design`) and for judging a screen (`design-judgment`) in the project's skills folder, visible to Claude Code and Codex. It prints rows for the project's agent guide: add them to `AGENTS.md` (create it if there is none; Codex and GitHub Copilot read it) and, if the project has a `CLAUDE.md`, point it at `AGENTS.md` or add them there too.

Then fill in `penpair-design/references/project-facts.md` (in the skills folder the install named) together with them: which Penpot file, the token sets, the names they use, who approves a design. Ask; do not invent. Placeholders they cannot answer yet can stay, marked as open.

Offer to commit the setup (ask first; they may want to review it):

```bash
git add penpair.config.json .gitignore AGENTS.md .skills .agents .claude   # whichever exist; never .env.local
git commit -m "Add penpair"
```

Teammates later run only `npm install` and `npx penpair connect` with their own key: the key belongs to a person, not to the repo.

### 10. A first POC that shows what is possible

Now the fun part. Suggest a small test proof of concept, on a **new page called "penpair POC"** in their file, so nothing they already have is touched. Offer two or three prompts and let them pick or write their own; they should be able to say it in their own words next time. For example:

- "Do a test POC: design a sign-in screen for desktop and phone on a new page called penpair POC. Use auto-layout, bind the colours to tokens, then export it and show me."
- "Do a test POC: a small dashboard with a header, three stat cards and a table, in light and dark. Audit it for unbound colours and off-scale spacing, and show me the export."
- With Marwes: "Do a test POC: a settings page that uses only our Marwes tokens. Check it against the snapshot, export it and show me."

When they pick one, read the installed `penpair-design` skill (and `design-judgment` for the look) and do it, following its write protocol: look first, write once, read back, and export (twice; the first export after a write can be stale). Show the exported image and say what each part demonstrates: the assistant read the real file, built in one verified write, bound values to tokens, checked its own work. End by telling them what they can ask for next (another page, a variant for tablet, an audit of an existing page, Reflection baselines to check the built code against the design).

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
