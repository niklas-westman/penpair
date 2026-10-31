<p align="center">
  <img src="https://raw.githubusercontent.com/niklas-westman/penpair/main/docs/assets/banner.png" alt="Penpair: Design together. Build together. A shared workflow from design and contracts to build, verification and human review." width="100%">
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

Choose how you want to get started. Both routes set up the same project and agent skills.

| Route | Best for | Start here |
| --- | --- | --- |
| **Set it up with your assistant — recommended** | You want guidance, help with browser steps and checks along the way. | [Guided installation](https://github.com/niklas-westman/penpair/blob/main/docs/installation.md#recommended-set-it-up-with-your-assistant) |
| **Install it yourself** | You prefer to run each command and review the configuration yourself. | [Manual installation](https://github.com/niklas-westman/penpair/blob/main/docs/getting-started.md) |

For the recommended route, open your application's project in your coding assistant and paste:

```text
Read https://raw.githubusercontent.com/niklas-westman/penpair/main/packages/core/skills/penpair-setup/SKILL.md
and follow its recommended assisted route to set up Penpair in this project.
Keep my MCP key out of chat and check with me before changing a design file.
```

You need **Node.js 22 or newer**, a Mac or Linux computer (the guides do not cover Windows), a project folder and a Penpot account. Your assistant helps check the prerequisites; you handle your personal key and browser. No clone of this repository is needed. Prefer a terminal wizard? The [installation guide](https://github.com/niklas-westman/penpair/blob/main/docs/installation.md#prefer-a-terminal-wizard) covers that too.

## Try your first task

Start with a read-only request to your assistant:

> Read the installed penpair-design skill. Inspect the pinned design file, summarize its pages and tokens, and suggest one small improvement. Do not change the file yet.

Then choose a scratch page and agree on a small design task. The workflow is: inspect, snapshot, write once, independently read back, export and look at the result. The [design workflow](https://github.com/niklas-westman/penpair/blob/main/docs/design-workflow.md) explains the review points and recovery steps.

A common path through the installed skills is **setup → design → construct → handoff → verification**, with `design-judgment` for composition and hierarchy. That is one route and not the whole set: [the full list is generated from the skills themselves](https://github.com/niklas-westman/penpair/blob/main/docs/skills.md). Ask the assistant to name the skill it uses. For frontend work, `penpair-handoff` carries design evidence into implementation; `penpair-verify` guides browser comparison, image review, fixes and recapture. [Check skill discovery and behavior](https://github.com/niklas-westman/penpair/blob/main/docs/skill-validation.md).

## Where the command and tools live

Install one command package in your application project. Both expose the same
`penpair` command; the core library is installed as a dependency.

| Surface | Where it comes from | How you discover it |
| --- | --- | --- |
| Hosted/team Penpot CLI | `@penpair/web` | `pnpm exec penpair --help` |
| CLI with local Penpot containers | `@penpair/docker` | The same command, plus instance lifecycle commands |
| Engine and shipped agent skills | `@penpair/core` | Library exports and `penpair skills`; core has no executable |
| Penpair MCP tools | Your installed command, started as a stdio server | Register the executable with `mcp --root /absolute/path/to/project` in your assistant |
| Your assistant's browser/computer controls | The assistant host, separately from Penpair | Host configuration; installing Penpair does not add these controls |

For example, register `/absolute/path/to/project/node_modules/.bin/penpair` with
arguments `["mcp", "--root", "/absolute/path/to/project"]`. That exposes typed
inspection, status, doctor, spec and export tools for the pinned project. It does
not expose every CLI command or arbitrary browser control. See the
[tool inventory and client configuration](https://github.com/niklas-westman/penpair/blob/main/docs/mcp.md).

Explicit `--allow-writes` additionally exposes registered operations and the
experimental `design_release_copy` tool. Both preview by default; applying a
native copy also requires a loopback browser debugging port and existing browser
clipboard read/write capability. Penpair does not grant those permissions. The equivalent CLI
starts with `penpair design-release copy --source-page PAGE --frame BOARD_ID
--release 1.2.0`. Copying creates native boards and transfer evidence; it does not
approve a full design release. Read the
[native copy guide](https://github.com/niklas-westman/penpair/blob/main/docs/copy-between-pages.md)
before applying it. `penpair wake` remains CLI-only.
For Claude and other hosts, read the [CLI/MCP prerequisites and current qualification](https://github.com/niklas-westman/penpair/blob/main/docs/copy-between-pages.md#using-from-claude-or-other-hosts); the native-UI test driver is not shipped as a fallback.

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
| Set up by hand or join a team | [Choose an installation route](https://github.com/niklas-westman/penpair/blob/main/docs/installation.md) · [Team setup](https://github.com/niklas-westman/penpair/blob/main/docs/team.md) |
| Work on a design and build from it | [Design workflow](https://github.com/niklas-westman/penpair/blob/main/docs/design-workflow.md) · [Handoff](https://github.com/niklas-westman/penpair/blob/main/docs/handoff.md) |
| Connect a library or browser checker | [Companion adapters](https://github.com/niklas-westman/penpair/blob/main/docs/adapters.md) |
| Find commands, recipes or extension points | [Guide](https://github.com/niklas-westman/penpair/blob/main/docs/guide.md) · [Cookbook](https://github.com/niklas-westman/penpair/blob/main/docs/cookbook.md) · [MCP tools](https://github.com/niklas-westman/penpair/blob/main/docs/mcp.md) |
| Diagnose or recover a failure | [Troubleshooting](https://github.com/niklas-westman/penpair/blob/main/docs/troubleshooting.md) · [Recovery](https://github.com/niklas-westman/penpair/blob/main/docs/recovery.md) |
| Understand design investigations and proposed changes | [Flush scope and build diagnostics](docs/designs/fewer-lost-penpair-runs.md) · [Revision conflicts](docs/designs/penpot-revision-conflicts.md) · [Baselines across release pages](docs/designs/multi-page-baselines.md) · [Reflection integration evaluation](docs/designs/reflection-integration-evaluation.md) |
| Validate a source build or prepare a release | [Validation](https://github.com/niklas-westman/penpair/blob/main/docs/validation.md) · [Releasing](https://github.com/niklas-westman/penpair/blob/main/docs/releasing.md) |
| Change the code, or understand why it is the way it is | [Architecture contracts](https://github.com/niklas-westman/penpair/blob/main/EGM.md) · [Design records](https://github.com/niklas-westman/penpair/blob/main/docs/designs/README.md) · [Contributing](https://github.com/niklas-westman/penpair/blob/main/CONTRIBUTING.md) |

Discover installed commands offline with `penpair help --all`, `penpair help export batch`
and `penpair help --search progress`. Read [CLI help and streaming progress](docs/cli-help-progress.md)
for iterative builds, capture workflows and wrapper guidance.

## Keeping the documentation honest

Every directory that holds code carries an `EGM.md` stating what it exposes, what
a change must preserve, and what it touches. A test checks that each one exists
with the right sections; nothing automatic can check whether one is still *true*.

The design and review workflow that produces them is the Elephant-Goldfish Model
plugin, installed per user rather than carried in this repository:

```sh
claude plugin marketplace add google/elephant-goldfish-model
claude plugin install egm@egm
```

**Run `/egm:egm-drift-report` regularly** — before a release, after a refactor that
moves exported symbols, and whenever a contract has gone a while without being
read. It compares each contract against the code and reports only the
divergences. The first run after this workflow was adopted found around
twenty-five: wrong counts, misattributed symbols, and enforcement claimed from
tests that did not check it. Documentation that is merely out of date is worse
than none, because it gets trusted.

[Changelog](https://github.com/niklas-westman/penpair/blob/main/CHANGELOG.md) · [MIT licence](https://github.com/niklas-westman/penpair/blob/main/LICENSE)
