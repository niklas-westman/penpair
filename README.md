# penpair

**Design together. Build together.** Connect people and agents to the same Penpot design, with pinned targets, recoverable writes and independent readback.

Inspect structure and tokens, compose reviewed recipes, capture references and hand design evidence to the implementation. Penpot holds the design; Git holds declarations, snapshots and review records.

## Choose your path

| You want to… | Start here |
| --- | --- |
| Set up your first project | [Getting started](docs/getting-started.md) |
| Let an agent guide setup | [Setup guide skill](skills/penpair-setup-guide/SKILL.md) |
| Join a shared file | [Team guide](docs/team.md) |
| Build and review a page | [Design workflow](docs/design-workflow.md) |
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

This improvement branch is **unreleased**. Registry installs do not establish that these changes are present: review the branch or use the complete packed-package trial in the [trial runbook](docs/trials.md). Live/human checks remain explicitly pending.

## Packages and workflows

Install one command package: `@penpair/web`, or `@penpair/docker` for a local instance. Both use the neutral `@penpair/core` library. `penpair` is the short-name wrapper. Optional adapters are [`@penpair/marwes-ui`](docs/marwes.md) and [`@penpair/reflection-check`](packages/reflection-check/README.md). Every package is released together at one version; publishing belongs to the owner.

| Shipped skill | Use |
| --- | --- |
| [penpair-setup](packages/core/skills/penpair-setup/SKILL.md) | Connect or repair project setup |
| [penpair-design](packages/core/skills/penpair-design/SKILL.md) | Inspect and operate on a design file |
| [penpair-recipes](packages/core/skills/penpair-recipes/SKILL.md) | Compose a page with reviewed recipes |
| [penpair-handoff](packages/core/skills/penpair-handoff/SKILL.md) | Implement from design evidence and compare |
| [design-judgment](packages/core/skills/design-judgment/SKILL.md) | Assess page structure and hierarchy |

[Cookbook](docs/cookbook.md) · [MCP tools](docs/mcp.md) · [Format contracts](docs/formats.md) · [Compatibility](docs/compatibility.md) · [Recovery](docs/recovery.md) · [Living checklist](docs/improvements.md)

See [CONTRIBUTING](CONTRIBUTING.md), [SECURITY](SECURITY.md), [release steps](docs/releasing.md), [CHANGELOG](CHANGELOG.md) and the [MIT licence](LICENSE). Comparison metrics supply evidence for review; they do not approve a design.
