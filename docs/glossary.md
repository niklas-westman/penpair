# Glossary

Words that mean two or three things in this repository, with one agreed meaning
each. They are here because the skills' purpose and exclusion statements depend
on them: a boundary written with an ambiguous word does not hold.

Two rules for this page:

- **A term another guide owns is cited, not redefined.** Where an entry says
  "owner", that guide is canonical and this page is a pointer. Restating it here
  would create a second truth that drifts.
- **Entries name symbols and files, not line numbers.** Line numbers drift, and
  a stale `file:line` has already produced several wrong conclusions in this
  repository's own design work.

This page ships with the `@penpair/web` and `@penpair/docker` commands, so it
must stand on its own: it links only to other pages in `docs/`, never into
`docs/designs/`, which is filtered out of those tarballs.

Installed **skills** cannot link here either — the skill checker follows
in-project links and refuses escapes, so a partial install would leave the link
dangling. Skills therefore use the word plainly and this page settles what it
means.

## contract

Three senses, each already owned elsewhere. This entry is a pointer.

1. **Architecture contract** — a directory's `EGM.md`, stating that directory's
   interface, invariants and side effects. Owners are the repository's root
   `EGM.md` (the system map) and `AGENTS.md`; both are contributor files and are
   not part of the installed package, so they are named here rather than linked.
2. **Map contract** — the canonical journey or integration map record, written by
   `writeMapContract` in `maps/store.ts`. Owners: [journey maps](journey-maps.md)
   and [integration maps](integration-maps.md).
3. **Command contract** — the CLI's output envelope, exit codes and completeness
   promise. Owner: [command contract](command-contract.md).

Say which one. An unqualified "contract" in a skill body means the map contract,
because that is the only sense a skill operates on.

## design

Three senses, narrowed but not closed by renaming `penpair-design-release` to
`penpair-release`.

1. **The artifact in Penpot** — frames, tokens, components, exports. The skill
   that operates on it is `penpair-design`.
2. **The composition judgment** — deciding hierarchy, density, content and
   screen states. The skill that owns it is `design-judgment`.
3. **A released screen set** — the frames assembled and finalized by
   `penpair-release`. Owner: [design releases](design-releases.md).

Rule: unqualified "design" means sense 1, the artifact. For sense 2 write
"composition decision"; for sense 3 write "design release". The distinction
matters because design readiness and implementation acceptance are reported
separately and never imply each other.

## prerequisite

A cross-reference marked `Requires:`. The named skill produces an input this one
needs, so it is read first.

See [successor](#successor) for the opposite direction. There are only these two
kinds because they are the two that change a reader's next action: everything
else a skill might say about a neighbour is a statement about ownership, which
belongs in that skill's `## What this owns` section.

## recipe

Three senses. **This is the term a rename did not close**, because the third
sense is in shipped code.

1. **Kit recipe** — a named, parameterised build routine in the kit:
   `RecipeInfo` in `kit.ts`, surfaced by the `recipes` CLI command in
   `cli-main.ts`. Used in this sense by
   `penpair-construct/references/build-flow.md` and the [cookbook](cookbook.md).
2. **Screen recipe** — a default composition for a screen archetype, in
   `design-judgment/references/recipes/`. A project's approved design replaces
   its recipe.
3. **Retired:** the build procedure formerly named `penpair-recipes`. That skill
   is now `penpair-construct`, and it held none of the recipes its old name
   claimed — which is why it was renamed.

Rule: unqualified "recipe" means sense 1, the kit recipe, because that is the
sense in code and in the CLI. For sense 2 write "screen recipe" or name the file.

## revision

Three senses. The one that causes the most confusion is the first, because it is
file-level rather than frame-level.

1. **Penpot file revision** — `penpot.currentFile.revn`, captured into an
   export's capture identity in `export.ts`. It is a counter for the **whole
   file**, so it moves when anything in that file changes, including work
   unrelated to the frame being captured. What that means for approval is owned
   by [approvals](approvals.md), which records it as a deliberate conservative
   invalidation boundary rather than a defect: an unrelated edit may require
   fresh approval even when the pixels are identical.
2. **Map source revision** — the optional source pin on a map contract, declared
   in `maps/types.ts`. It records which revision of a source the map was built
   from.
3. **Contract revision** — a new revision of a managed diagram's contract,
   recorded by `penpair-diagrams` when a native edit is imported as a proposal.

Rule: say which. Unqualified "revision" in a capture, export or approval context
means sense 1.

## successor

A cross-reference marked `Next:`. Work flows to the named skill when this
skill's work is done.

**A line saying "that work is not mine" is not a successor.** It is an
exclusion, and belongs in the skill's `## What this owns` section. Confusing the
two is what made the skill graph read as a cycle: three jurisdiction redirects
in `penpair-verify` were initially marked as successors, and the resulting
cycles are what exposed the error. The successor edges are acyclic.

See [prerequisite](#prerequisite).

## verify

Three senses, **two of them in the same file**, which is why this term needs an
entry more than it looks like it does.

1. **Release lifecycle `verified`** — one of a design release's statuses in
   `design-releases/types.ts`. It means the release's own evidence has been
   verified.
2. **Implementation assessment `verified`** — a separate status in that same
   file, on the implementation assessment. It means an implementation was
   assessed, which is a different claim about a different thing.
3. **Browser comparison** — the `penpair-verify` skill, comparing a running
   frontend against its approved design. Owners: [coverage](coverage.md) for
   cases and baselines, [artifacts](artifacts.md) for what the evidence is.

Rule: never write "verified" without saying which. Senses 1 and 2 are
deliberately independent: a verified release does not accept an implementation,
and an assessed implementation does not verify a release.
