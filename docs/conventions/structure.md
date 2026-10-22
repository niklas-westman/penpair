# Folder and module structure

Place code with the responsibility that owns it. The dependency direction is
command packages/adapters → core; the core never imports an adapter or names a
consumer project or component library.

| Location | Owns |
| --- | --- |
| `packages/core/src/` | Neutral engine, validation, transport and public extension contracts |
| `packages/web/`, `packages/docker/`, `packages/penpair/` | Command distribution and profile-specific lifecycle |
| `packages/<adapter>/src/` | Library/tool knowledge and its adapter commands |
| `packages/<package>/test/` | That package's behavior and integration contracts |
| `scripts/` and `scripts/lib/` | Workspace/release tooling and reusable script helpers |
| `examples/<feature>/` | Consumer-facing workflows and explicit sample project knowledge |
| `packages/core/skills/` | Shipped consumer workflows |
| `.agents/skills/` | Skills for developing this repository |
| `docs/conventions/templates/` | Checked examples, never runtime dependencies |

Use kebab-case for new code directories and filenames. Prefer a domain name such
as `capture-validation.ts` over `helpers.ts`, `utils.ts` or `manager.ts`. Add a
feature folder when several related files form one cohesive area; keep small
features as siblings rather than adding a directory around every file. Preserve
tool-required names such as `AGENTS.md`, `SKILL.md` and `README.md`.

## Split as soon as a responsibility stands on its own

Extract a responsibility when it has its own inputs/outputs, invariants or useful
tests. Do this in the change that introduces it. Typical splits are public types,
argument parsing/provider loading, pure planning, evidence validation and image
I/O. Keep a package's public `index.ts` focused on exports and adapter wiring.
Preserve public imports when moving implementations.

The comparison adapter demonstrates this shape: `case-plan.ts` plans approved
cases, `evidence-validation.ts` validates observed state, `capture-validation.ts`
checks browser geometry, `png-evidence.ts` reads bounded images, `run-cases.ts`
orchestrates evidence collection, and `command.ts` handles CLI/provider loading.

Do not split tightly coupled steps solely to make files short. Avoid one-line
forwarders and a forest of generic folders. Repeated domain code, mixed I/O and
validation, a long boolean condition, or unrelated reasons for a file to change
are stronger signals than a line count. Around 200 lines in a module or 40 lines
in a function is a review prompt, not an automatic failure or a reason to hide
complexity in another large helper.

Before extracting, identify the public contract and the tests that protect it.
After extracting, read the orchestration from top to bottom: names should explain
the workflow without opening every helper. Keep shared types below implementations
in the dependency direction and avoid circular imports or unnecessary barrels.
