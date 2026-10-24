# penpair

**Design together. Build together.** Connect people and agents to the same Penpot design, with pinned targets, recoverable writes and independent readback.

Inspect structure and tokens, compose reviewed recipes, capture references and hand design evidence to the implementation. Penpot holds the design; Git holds declarations, snapshots and review records.

**Design in Penpot → hand off to frontend code → check the implementation.** Add the companion adapters for the parts of that workflow your project uses:

| Companion | When to add it | What it helps with |
| --- | --- | --- |
| [Marwes UI adapter](docs/adapters.md#bring-your-component-library-into-penpot) | Your application uses Marwes UI | Bring library/project tokens into Penpot, detect drift and compose library-aware recipes |
| [Reflection Check adapter](docs/adapters.md#check-the-frontend-against-the-design) | You implement a frontend from Penpot and want repeatable visual checks | Connect approved design cases to real browser captures and comparison evidence |

**Reflection Check is the recommended companion for design-to-frontend verification.** Install it explicitly alongside your command package. It needs approved references and a project browser provider; the [adapter guide](docs/adapters.md) shows installation, registration and readiness steps.

## Choose your path

| You want to… | Start here |
| --- | --- |
| Set up your first project | [Getting started](docs/getting-started.md) |
| Let an agent guide setup | [Setup guide skill](skills/penpair-setup-guide/SKILL.md) |
| Join a shared file | [Team guide](docs/team.md) |
| Build and review a page | [Design workflow](docs/design-workflow.md) |
| Choose adapters or check the frontend | [Companion adapters](docs/adapters.md) |
| Resolve a failure | [Troubleshooting](docs/troubleshooting.md) |
| Extend the framework | [Guide and reference map](docs/guide.md) |

## Quick start

Use Node 22 or newer, your project folder and a visible Penpot editor. Enter the personal MCP address only in the private connection prompt.

```sh
pnpm add -D @penpair/web
pnpm exec penpair init --external https://design.penpot.app --gitignore
pnpm exec penpair connect
pnpm exec penpair connect --pin-file
pnpm exec penpair doctor --json
pnpm exec penpair skills install --dry-run
```

Confirm the owner-authorized file ID, then follow the [skill installation preview](docs/skill-installation.md). Each teammate uses their own key. Prefer a team/web Penpot; [Docker is an alternative](packages/core/skills/penpair-setup/references/web-or-docker.md).

Use the installed version's `--help` to confirm available commands. For source
builds and authorized scratch checks, follow the [validation guide](docs/validation.md).
Automated fixtures do not establish live compatibility or human acceptance.

## Packages and workflows

Install one command package: `@penpair/web`, or `@penpair/docker` for a local instance. Both use the neutral `@penpair/core` library. Add the [companion adapters](docs/adapters.md) your workflow needs. Keep their versions aligned with the command package. The unscoped `penpair` wrapper currently has a publishing exception; use the scoped command package. Every repository package is versioned together; publishing belongs to the owner.

| Shipped skill | Use |
| --- | --- |
| [penpair-setup](packages/core/skills/penpair-setup/SKILL.md) | Connect or repair project setup |
| [penpair-design](packages/core/skills/penpair-design/SKILL.md) | Inspect and operate on a design file |
| [penpair-recipes](packages/core/skills/penpair-recipes/SKILL.md) | Compose a page with reviewed recipes |
| [penpair-handoff](packages/core/skills/penpair-handoff/SKILL.md) | Map components and implement from design evidence |
| [penpair-verify](packages/core/skills/penpair-verify/SKILL.md) | Compare the real frontend, inspect images and recheck fixes |
| [design-judgment](packages/core/skills/design-judgment/SKILL.md) | Assess page structure and hierarchy |

Check a consumer's Codex installation with `pnpm exec penpair skills check --json`.
[Discovery diagnostics and behavior trials](docs/skill-validation.md) explain what
that establishes and how to verify actual skill use.

[Cookbook](docs/cookbook.md) · [MCP tools](docs/mcp.md) · [Format contracts](docs/formats.md) · [Compatibility](docs/compatibility.md) · [Recovery](docs/recovery.md) · [Validation](docs/validation.md)

See [CONTRIBUTING](CONTRIBUTING.md), [SECURITY](SECURITY.md), [release steps](docs/releasing.md), [CHANGELOG](CHANGELOG.md) and the [MIT licence](LICENSE). Comparison metrics supply evidence for review; they do not approve a design.
