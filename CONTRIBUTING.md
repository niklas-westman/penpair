# Contributing to Penpair

Documentation fixes, reproducible bug reports and focused pull requests are welcome. You can contribute without connecting to a live Penpot file.

## Report a problem

[Open an issue](https://github.com/niklas-westman/penpair/issues) with:

- What you expected and what happened.
- The smallest reproduction, including the command or workflow.
- Penpair, Node.js and Penpot versions, and whether you use web or Docker.
- Redacted diagnostics or screenshots when useful.

Your MCP address contains a personal key. Keep it, private connection files and account data out of issues, screenshots and logs. Use [SECURITY](SECURITY.md) for vulnerability reports.

## Run the source

Fork and clone the repository, then work from its root. Use Node.js 24.22.1, pinned in `.nvmrc` (`nvm use` or `fnm use`), and the pnpm version declared in `package.json`. CI, releases and local development run that exact version; the published packages still declare `>=22` for people who install them.

```sh
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` runs formatting/path checks, the build, typechecking, executable convention examples, tests and package-version consistency. It does not require a live Penpot connection. Read [AGENTS.md](AGENTS.md) and the maintained guides relevant to your change before editing.

## Find the right place

| Change | Location |
| --- | --- |
| Shared engine, CLI behavior and shipped skills | `packages/core` |
| Web command entry point | `packages/web` |
| Local Penpot and Docker lifecycle | `packages/docker` |
| Component-library integration | `packages/marwes-ui` |
| Frontend comparison contract | `packages/reflection-check` |
| Short-name web wrapper | `packages/penpair` |
| Maintained guides and reusable examples | `docs` and `examples` |
| What a directory exposes, preserves and touches | its `EGM.md`, mapped from [EGM.md](EGM.md) |
| Why a change was made, and what was rejected | [`docs/designs`](docs/designs/README.md) |

The core stays independent of projects and component libraries. Project-specific knowledge belongs in an adapter or the adopting project. Docker lifecycle code stays separate from the web connection. Tests enforce these boundaries.

Read [code conventions](docs/conventions/README.md) before adding or restructuring files. Use kebab-case paths, descriptive names and focused modules. Keep public imports and persisted schemas stable when moving code.

Internal plans, session reports and draft handoffs belong in git-ignored `.working-docs/`. Fresh clones and packages must not depend on those files. Keep reusable instructions and limitations in maintained documentation.

Update a directory's `EGM.md` in the same change that alters its interface, invariants or side effects — a renamed export, a new ceiling, a changed guard, a new write target. A refactor that changes none of those needs no contract edit. Do not copy a number that a maintained guide owns; cite the guide, or the two will disagree. A test checks that every code-bearing directory has a contract with the required sections, but it cannot tell whether the contract is still true.

## Verify your change

Run the relevant tests while working. Before opening a pull request:

```sh
pnpm format
pnpm check
pnpm smoke:package
```

The package smoke check packs all six packages, installs them in temporary projects and runs them. It checks what users actually install; it does not publish anything. See [validation](docs/validation.md) for source builds and additional browser or live checks.

If your change writes to Penpot, follow the [write protocol](packages/core/skills/penpair-design/references/write-protocol.md): inspect, pin a snapshot, write once, independently read back and inspect an export. Use an explicitly authorized scratch target for live trials. Report live checks as pending when you have not run them; automated fixtures do not prove live compatibility.

## Add a release note

Package or script changes need a Changeset:

```sh
pnpm changeset
```

Select the affected package and bump level. For a change with no release impact, use `pnpm changeset --empty`. All packages receive the highest pending bump together. Do not edit versions or generated changelogs in feature PRs.

Automation collects notes into a reviewed **Release Penpair** PR. Merging that PR authorizes publication through the protected release workflow when owner activation is complete. Individual packages cannot be published separately. See [releasing](docs/releasing.md).

## Open the pull request

Explain the problem, what changes for the user, how you verified it and any remaining limitations. Keep the diff focused and include relevant documentation. Do not include keys, private trial evidence or generated local package copies.

You do not need to publish a package or make changes to a production Penpot file to contribute.
