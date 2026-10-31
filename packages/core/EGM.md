# @penpair/core Blueprint

## System Overview

`@penpair/core` is the library and engine behind the `penpair` command: it
connects an AI agent and a person to the same Penpot design file, safely.

The package has **no command of its own**. It offers two plug-in points —
`runCli` (in `src/cli-main.ts`) and `LocalProfile` (in `src/local-profile.ts`) — and the two command
packages (`@penpair/web`, `@penpair/docker`) depend on it. The dependency runs
one way only: the core never imports from a command package, which is why the
two can never fight over the name `penpair`. Tests enforce this.

The package is also deliberately **neutral**. Project-specific knowledge lives
in adapters, which register through `defineAdapter` and are loaded by specifier
from the project's configuration; the core names none of them. A test
(`test/neutrality.test.ts`) walks every file under `src/` and `skills/`,
lowercases it, and fails the build if it finds the name of an adopting project
or component library. It scans documentation files too.

What the engine actually provides, in layers: a transport to a live Penpot
editor, a five-phase operation protocol that makes a write to a shared design
file recoverable, a sandbox-JavaScript snippet system with a hard size ceiling,
and the artifact layers above them — inspections, structural snapshots, image
baselines, design tokens, maps and design releases.

## Subdirectories & System Boundaries

| Directory | Contract | Role |
| --- | --- | --- |
| `src` | [`./src/EGM.md`](./src/EGM.md) | The entire engine: command dispatch and the plug-in surface, MCP transport, the write protocol and its guards, kits and skills, design artifacts and tokens, and eight subdirectories of its own. |
| `skills` | one `SKILL.md` per folder, listed below | Markdown skill definitions shipped to a consuming project, not source. They are scanned by the neutrality test alongside `src`. |

Skills live in `./skills/`, one directory each, every one self-describing
through its `SKILL.md` frontmatter. **Which skills exist is not listed here**:
`listBundledSkills()` reads the directory, and
[docs/skills.md](../../docs/skills.md) is generated from it and asserted
byte-for-byte. A list in this contract would be a second truth that drifts the
first time a skill is added or renamed — which is what happened to six other
lists before they were replaced by that page.

The invariant this directory does carry: each skill directory's name equals its
`SKILL.md` `name` field, enforced by `parseSkillMetadata`, and a renamed skill
needs an entry in `renamedSkills` so an adopting project's stale folder is
reported rather than silently left behind.

Not documented here: `test/` holds the vitest suite (test-only, including the
neutrality and version guards), and `dist/` is build output.

## Global Invariants

- **No command in this package.** Adding a `bin` entry here would put the core
  in competition with the command packages for the name `penpair`. Tests enforce
  the absence.
- **One-way dependency.** The core depends on neither command package nor any
  adapter. A local-Penpot implementation arrives injected as a `LocalProfile`;
  adapters arrive through `defineAdapter` and dynamic import.
- **Neutral core.** No file under `src/` or `skills/` may name an adopting
  project or component library — in code, in a comment, or in documentation.
  This is the invariant most likely to break a build from a documentation edit.
- **Every Penpot change follows the write protocol**: read-only inspect, a
  pinned snapshot, one idempotent write, an independent readback, and an export
  that is looked at. A first export after a write or a page switch can be stale,
  so it is looked at twice.
- **Snippets stay under 90 KB.** `maxSnippetBytes = 90 * 1024` in
  `src/client.ts`, because Penpot's proxy refuses bodies of about 110 KB. The
  check happens at snippet construction, before any network call.
- **Kit sources are capped at 32 KiB each and 48 KiB combined**, enforced in
  `src/kit.ts`. The sandbox JavaScript lives inside `String.raw` template
  literals in `src/kit-source.ts` and `src/kit-instances.ts`, which is what keeps
  Biome from reformatting it.
- **No secret in the repository, in output or in logs.** The MCP URL carries a
  personal key: it is redacted everywhere, never printed, never committed.
- **All six repository packages release together at one version.**
  `src/version.ts` holds the single string and a test asserts it matches
  `package.json`. Never bump a version by hand; `prepublishOnly` refuses a
  solo publish.
- **The Penpot version is pinned** (`testedPenpotVersion` in
  `src/instance/config.ts`); run the smoke test before bumping it.

## Global Side Effects

- **Penpot**, over a streamable-HTTP MCP transport, one tool call at a time:
  read-only inspections and projections, and — only behind `--apply` — snippet
  writes that create, move and remove shapes, write `sharedPluginData`, and save
  a version.
- **The project tree**: `.penpair/` for locks, journalled runs and private
  evidence (gitignored on creation); `design/` for approvals, baselines, shots,
  specs and releases; `penpair.config.json`, `.env.local` at mode `0600`, and
  `.gitignore`; and the installer-owned routing block inside `AGENTS.md` or
  `CLAUDE.md`. Design artifacts are written atomically, but the project-setup
  files in this list are not: `penpair.config.json` (both on init and when a file
  pin is added) and `.env.local` use a plain `writeFile` plus `chmod`, and the
  `.gitignore` entry is appended.
- **The local machine**: process spawning without a shell, a loopback browser
  debug connection for the native clipboard path, the OS keychain or an
  owner-private file for the credential, and `sharp` loaded dynamically only for
  a WebP encode.
- **Published surface**: `dist/`, `assets/`, `skills/`, `LICENSE` and
  `README.md` only. `assets/` carries the release cover and map-spot images that
  the renderers load at runtime, so it ships even though it is not code.
  `README.md` is published to npm; it is the package's public front page and is
  maintained by hand.

## System Verification

- Run: `pnpm test` from `packages/core` (`vitest run`).
- `pnpm check` at the repository root is the full gate — style and path checks,
  build, typecheck, executable convention examples, tests and the version check.
  Run it before proposing a change for review.
- `pnpm smoke:package` packs all six packages, installs them into an empty
  project and runs them. Required before any release.
