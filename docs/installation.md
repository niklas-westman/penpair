# Choose your installation route

Two ways to get the same Penpair setup. Choose who drives the steps; you can switch routes without starting over.

| Route | Who does what | Choose it when |
| --- | --- | --- |
| **Set it up with your assistant — recommended** | Your assistant checks the project, explains and runs permitted commands, then verifies progress. You handle the browser, private key and approvals. | You want help getting connected and choosing companions. |
| **Install it yourself** | You run each command, connect Penpot and review the installed instructions. Your assistant can help explain an individual step. | You want direct control over every setup step. |

You need Node.js 22 or newer, a Mac or Linux computer (the guides do not cover Windows), a project folder and a Penpot account.

## Recommended: set it up with your assistant

Open the project that will use Penpair in your coding assistant. Paste:

```text
Read https://raw.githubusercontent.com/niklas-westman/penpair/main/packages/core/skills/penpair-setup/SKILL.md
and follow its recommended assisted route to set up Penpair in this project.
Keep my MCP key out of chat and check with me before changing a design file.
```

The [setup skill](https://github.com/niklas-westman/penpair/blob/main/packages/core/skills/penpair-setup/SKILL.md) works before Penpair is installed. If your assistant cannot open the URL, give it that file's contents, or use the manual route. Linking a skill asks the assistant to read it; it does not install it globally.

Your assistant will:

1. Check Node.js 22+, your project folder and package manager. Help create a small trial project if needed.
2. Recommend web Penpot, or use Docker when you choose it.
3. Install one command package and preserve any existing project setup.
4. Walk you through connecting the visible editor and entering your key privately.
5. Confirm the intended file pin, run connection checks and preview/install the agent skills.
6. Recommend Marwes UI if your app uses it and Reflection Check for frontend verification, with missing integration work stated clearly.

You still operate the browser and paste the key into your own hidden terminal prompt. A healthy setup does not authorize design changes. A first design trial is optional and needs an agreed scratch target.

## Install it yourself

Follow [manual installation](getting-started.md). It includes dependency installation, configuration, browser connection, file pinning, diagnostics, agent instructions and companion choices.

Tell your assistant “manual installation; give me the steps, do not run them” if you want help without handing over execution. It should explain the current step and wait for your result. You can switch to assisted setup later; it should inspect progress and continue rather than initialize everything again.

## Prefer a terminal wizard?

This is another way to drive setup yourself. In your project folder, after creating a `package.json` if needed:

```sh
pnpm add -D @penpair/web
pnpm exec penpair setup --web --agents AGENTS.md
pnpm exec penpair doctor
pnpm exec penpair pages
pnpm exec penpair skills check --agents AGENTS.md --json
```

Use your team's Penpot with `setup --web --external https://your-penpot.example --agents AGENTS.md`. For npm, install with `npm install --save-dev @penpair/web` and use `npx penpair`. At a pnpm workspace root, add `-w` to the install. Select `CLAUDE.md` instead if that is your instruction file. The wizard installs skills; use the manual route when you want a dry-run preview before applying those files.

Review the displayed file name and ID when the wizard offers to pin it. If you skip pinning, verify the open file before `pnpm exec penpair connect --pin-file`; that flag accepts without another prompt. Fill in the installed `penpair-design/references/project-facts.md` and choose [companions](adapters.md) afterward. The wizard does not complete browser comparison integration.

For local Penpot, install `@penpair/docker` **instead of** `@penpair/web` and use `setup --docker --agents AGENTS.md`. Docker Desktop must be running. Web/Docker is a hosting choice, independent of assisted/manual installation.

## Same finish line

Whichever route you choose, check:

- `doctor` reports a healthy connection and intended file pin.
- `pages` lists the intended file's pages.
- Skills and routing are installed in the chosen instruction file, with project facts filled in or missing facts recorded.
- Personal credentials remain private; teammates each connect with their own key.
- Companion installation is recorded separately from approved references, browser-provider setup and completed visual checks.

See [skill installation](skill-installation.md), [troubleshooting](troubleshooting.md) and the [first task](../README.md#try-your-first-task) for what comes next.
