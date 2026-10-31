---
"@penpair/core": minor
"@penpair/docker": minor
"@penpair/web": minor
"penpair": minor
"@penpair/marwes-ui": minor
"@penpair/reflection-check": minor
---

The ten shipped skills now state what each one owns, and two are renamed

**`penpair-design-release` is now `penpair-release`, and `penpair-recipes` is now
`penpair-construct`.** Both old names misled. "Release" meant a Penpot design
release and an npm publication, and the skill opened by disclaiming the second.
"Recipe" meant three different things — a kit recipe in shipped code
(`RecipeInfo`, the `recipes` command), a default composition for a screen
archetype, and that skill — and the skill held none of the recipes its name
claimed; the compositions live in `design-judgment`. An existing project that
installs over an older one is told about the leftover folder rather than left
with two copies: `penpair skills install` reports it with the new name to move
to. The `design-release` command is unchanged, so the `penpair-release` skill
drives a command that keeps its old name.

**Every skill opens with a `## What this owns` section** giving one purpose line
and naming the neighbour that owns the adjacent work. Before this, two skills
claimed the same work, one instruction appeared in three files, and the skill
that owns composition decisions was referenced by no other skill — it existed
only in an install list. Reading any one skill now tells you where its
responsibility stops.

**Cross-references say which direction they go.** A link is marked `Next:` when
work flows there once this skill's work is done, or `Requires:` when it produces
this skill's input. Previously both read as identical prose, which is why the
skill set looked like a cycle; the successor edges are now acyclic and a test
keeps them that way.

**Duplicated instructions are gone.** The composition instruction is stated once,
in `design-judgment`, and the skills that need it point there. The shared
CLI-help preamble stays in each skill that needs it standalone, but a test now
asserts the five copies are byte-identical to one fixture, so they cannot drift
apart.

**Two new documentation pages.** `docs/glossary.md` defines the seven words that
meant two or three things each — revision, recipe, verify, contract, design,
successor, prerequisite — citing the guide that owns a term rather than
redefining it. `docs/skills.md` is generated from the skills themselves and
asserted byte-for-byte, and is now the only maintained list of which skills
exist; six pages that each kept their own list, two of them with counts that had
been wrong for several releases, link to it instead.

**`penpair-verify` now says when it may fix a mismatch itself.** The step told
the agent to fix mismatches "within scope" and never defined the scope, so the
boundary with `penpair-handoff` had no stopping rule. It now fixes only where the
approved reference, mapping and case already exist, the change stays in the
component's markup or styling, and nothing new is added, and it recaptures at
most twice. Anything else is reported as outside the skill. A check fails if a
skill again says "within scope" without defining it.

Internal: six checks plus a cycle check and routing coverage enforce all of the
above, each one landed only after its failure was observed. Two of those checks
were found to be passing while testing nothing before that step caught them.
