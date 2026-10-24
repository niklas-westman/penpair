<p align="center">
  <img src="https://raw.githubusercontent.com/niklas-westman/penpair/main/docs/assets/logo.png" alt="Penpair: a pen nib between blue code brackets" width="120" height="120">
</p>

# penpair

**Design together. Build together.**

Penpair helps people and AI coding assistants work on the same Penpot design, then carry that design into frontend code. Your assistant can inspect a real file, build a page in reviewed steps and check the result. You stay in control of what changes and what gets approved.

**Design in Penpot → build in your app → compare the result.**

[Install](#install) · [First task](#try-your-first-task) · [Companions](#add-your-companions) · [Contribute](#contribute) · [Documentation](#documentation)

[![M8ven Score](https://m8ven.ai/badge/mcp/niklas-westman-penpair-637i3e?v=4c3a3cf6e76f527306a6b8d2974a4cdb)](https://m8ven.ai/mcp/niklas-westman-penpair-637i3e?s=readme)

## What it does

Penpot holds the design. Penpair adds project configuration, reusable operations and skills: written instructions that teach your assistant how to work with that design.

| From an idea to a checked page | What Penpair helps with |
| --- | --- |
| **Understand the design** | Read pages, inspect components and tokens, audit spacing and export frames. |
| **Work on it together** | Pin the intended file, inspect before writing, take snapshots and independently read changes back. |
| **Build the frontend** | Hand design references and component mappings to the coding assistant. |
| **Check the implementation** | Add Reflection Check to compare approved references with real browser captures. |

Use your existing frontend stack. Library-specific knowledge lives in optional adapters; the core stays independent of any component library.

## Install

You need **Node.js 22 or newer**, a project folder with a `package.json`, and a Penpot account. Start with Penpot on the web or your team's server. You do **not** need to clone this repository to use Penpair.

### 1. Add Penpair to your project

In your application's folder:

```sh
pnpm add -D @penpair/web
```

Using npm? Run `npm install --save-dev @penpair/web`, then use `npx penpair` wherever this guide uses `pnpm exec penpair`. In a pnpm workspace, add `-w` if the dependency belongs at the workspace root.

### 2. Connect your design file

Open the intended file in Penpot and connect its MCP plugin. Keep the editor tab visible while Penpair works. The [browser walkthrough](https://github.com/niklas-westman/penpair/blob/main/docs/getting-started.md) covers the account and plugin steps.

```sh
pnpm exec penpair init --external https://design.penpot.app --gitignore
pnpm exec penpair connect
pnpm exec penpair doctor
pnpm exec penpair pages
```

Use your team's Penpot address in place of `https://design.penpot.app` when needed. Paste your personal MCP address only into the hidden `connect` prompt. It contains your key: never paste it into chat or commit it. Each teammate connects with their own key.

When `connect` offers to pin the file, check its name and ID before accepting. If you skipped that step, verify the correct file is open before running `pnpm exec penpair connect --pin-file`; that flag accepts the pin without another confirmation. You are connected when `doctor` reports healthy checks and `pages` lists the intended file's pages. If a check fails, follow its suggested remedy or use [troubleshooting](https://github.com/niklas-westman/penpair/blob/main/docs/troubleshooting.md).

### 3. Give your assistant its instructions

Preview the installation, review the changes, then apply it:

```sh
pnpm exec penpair skills install --agents AGENTS.md --dry-run
pnpm exec penpair skills install --agents AGENTS.md
pnpm exec penpair skills check --agents AGENTS.md --json
```

Use `CLAUDE.md` instead if that is your project's instruction file. The installer copies skills, creates discovery links and adds task routing to the chosen file while preserving text outside its owned section. Fill in the installed `penpair-design/references/project-facts.md` with your file, tokens, naming and approval rules. See [skill installation](https://github.com/niklas-westman/penpair/blob/main/docs/skill-installation.md) for existing setups and other destinations.

Commit the dependency and lockfile, `penpair.config.json`, Git ignore rules, and reviewed skill/instruction files. Keep `.env.local` private. Discovery checks verify installation; actual skill use still needs to be observed in your assistant's session.

**Prefer guided setup?** After installation, `pnpm exec penpair setup --web --agents AGENTS.md` walks through configuration, connection and skill installation. Confirm the file pin afterward. For conversational help, point your assistant to the [setup guide skill](https://github.com/niklas-westman/penpair/blob/main/skills/penpair-setup-guide/SKILL.md).

**Want Penpot on your computer?** Install `@penpair/docker` instead of `@penpair/web`, then run `pnpm exec penpair setup --docker --agents AGENTS.md`. It needs Docker Desktop. Install only one command package; both provide the `penpair` command. [Compare web and Docker](https://github.com/niklas-westman/penpair/blob/main/packages/core/skills/penpair-setup/references/web-or-docker.md).

## Try your first task

Start with a read-only request to your assistant:

> Read the installed penpair-design skill. Inspect the pinned design file, summarize its pages and tokens, and suggest one small improvement. Do not change the file yet.

Then choose a scratch page and agree on a small design task. The workflow is: inspect, snapshot, write once, independently read back, export and look at the result. The [design workflow](https://github.com/niklas-westman/penpair/blob/main/docs/design-workflow.md) explains the review points and recovery steps.

The installed skills cover **setup → design → recipes → handoff → verification**, with `design-judgment` for visual hierarchy. Ask the assistant to name the skill it uses. For frontend work, `penpair-handoff` carries design evidence into implementation; `penpair-verify` guides browser comparison, image review, fixes and recapture. [Check skill discovery and behavior](https://github.com/niklas-westman/penpair/blob/main/docs/skill-validation.md).

## Add your companions

| Package | Add it when | What it contributes |
| --- | --- | --- |
| **`@penpair/marwes-ui`** | Your application uses Marwes UI | Bring library and project tokens into Penpot, detect drift and compose library-aware recipes. |
| **`@penpair/reflection-check`** | You build a frontend from the design | Map approved design cases to real browser captures and comparison evidence. **Recommended for design-to-code work.** |

Install companions at the **same version** as your command package, then register them in `penpair.config.json`. Both can work together; Reflection Check can also be used without Marwes. Follow [installation and registration](https://github.com/niklas-westman/penpair/blob/main/docs/adapters.md).

**Penpair manages the design workflow. Marwes connects the component library. Reflection Check connects implementation evidence.** The comparison adapter does not bundle a browser or a Reflection engine: your project supplies a browser/checker provider. Start with the [real-browser example](https://github.com/niklas-westman/penpair/blob/main/examples/reflection-browser/README.md). Installing the adapter alone does not complete verification, and a passing comparison does not replace visual review or human approval.

## Know the boundaries

- Penpair uses Penpot's MCP and plugin APIs. The editor must stay open and visible; this is an interactive workflow.
- A healthy connection does not authorize design changes. Review the target and intended work before writing.
- Keep backups and prove a restore on scratch before relying on them. See [backup and restore](https://github.com/niklas-westman/penpair/blob/main/docs/backup.md).
- Penpair is early software. Check [compatibility](https://github.com/niklas-westman/penpair/blob/main/docs/compatibility.md) for tested environments and remaining gaps. The installed command's `--help` is the reference for its available options.

Use the scoped command packages above. The unscoped `penpair` wrapper currently has a publishing exception. `@penpair/core` is the underlying library and ships transitively; it has no command of its own.

## Contribute

Found a rough edge? [Open an issue](https://github.com/niklas-westman/penpair/issues) with what you tried, what you expected, your versions and a redacted reproduction. Documentation fixes, reproducible bug reports and focused pull requests are welcome. Report vulnerabilities through [SECURITY](https://github.com/niklas-westman/penpair/blob/main/SECURITY.md).

To develop Penpair itself, fork and clone this repository, then:

```sh
pnpm install --frozen-lockfile
pnpm check
```

Use the pnpm version declared in `package.json`. Read [CONTRIBUTING](https://github.com/niklas-westman/penpair/blob/main/CONTRIBUTING.md) for choosing a package, conventions, release notes and package smoke checks. A live Penpot connection is not required for the standard automated checks.

## Documentation

| You want to… | Read |
| --- | --- |
| Set up by hand or join a team | [Getting started](https://github.com/niklas-westman/penpair/blob/main/docs/getting-started.md) · [Team setup](https://github.com/niklas-westman/penpair/blob/main/docs/team.md) |
| Work on a design and build from it | [Design workflow](https://github.com/niklas-westman/penpair/blob/main/docs/design-workflow.md) · [Handoff](https://github.com/niklas-westman/penpair/blob/main/docs/handoff.md) |
| Connect a library or browser checker | [Companion adapters](https://github.com/niklas-westman/penpair/blob/main/docs/adapters.md) |
| Find commands, recipes or extension points | [Guide](https://github.com/niklas-westman/penpair/blob/main/docs/guide.md) · [Cookbook](https://github.com/niklas-westman/penpair/blob/main/docs/cookbook.md) · [MCP tools](https://github.com/niklas-westman/penpair/blob/main/docs/mcp.md) |
| Diagnose or recover a failure | [Troubleshooting](https://github.com/niklas-westman/penpair/blob/main/docs/troubleshooting.md) · [Recovery](https://github.com/niklas-westman/penpair/blob/main/docs/recovery.md) |
| Validate a source build or prepare a release | [Validation](https://github.com/niklas-westman/penpair/blob/main/docs/validation.md) · [Releasing](https://github.com/niklas-westman/penpair/blob/main/docs/releasing.md) |

[Changelog](https://github.com/niklas-westman/penpair/blob/main/CHANGELOG.md) · [MIT licence](https://github.com/niklas-westman/penpair/blob/main/LICENSE)
