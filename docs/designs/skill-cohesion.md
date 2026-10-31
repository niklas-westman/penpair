# Settling what each skill owns

*   **Status:** **Decided; all seven goals built. Enforcement partly landed.**
    2026-10-30. Gate-verified: goal 6 the two renames, goal 1 the
    `## What this owns` section, goal 4 the edge markers, goal 5 the
    deduplication, goal 3 `docs/glossary.md`, goal 7 the generated
    `docs/skills.md`. Goal 2 is a decision this record makes rather than a build
    step. **All six enforcement checks are landed**, plus the cycle check and
    routing coverage, in `packages/core/test/skill-cohesion.test.ts` and
    `docs.test.ts`, each with its failure observed. Core went 1228/113 to
    1236/114. A changeset is written for all six packages. **Reviewed after
    building**, by `review-codebase` and `review-design` against the
    implementation rather than this document: two blockers, four check defects
    and one misnamed heading were found and fixed, and two design questions
    remain open — exclusions cannot express a conditional boundary, and the
    marker check rewards not naming a neighbour. Zero citation errors in that
    round. **Outstanding and owner-dependent:** the `pnpm smoke:package` install
    step, blocked on npm credentials rather than on this work, the semantic half
    of `egm-drift-report`, and 11 pre-existing dead links in the published
    tarballs. Goal 2 is a decision this record already makes — nothing merges —
    so it needs no build step. Goal 5 also resolved problem 2:
    `design-judgment` was referenced by no skill body and now carries two
    inbound `Requires:` edges. Three drafts: the first was rescoped down after a
    zoom-out review, the rescope was found to have dropped the owner's actual
    question, and this version fixes two blockers and nine major findings from
    a second zoom-out review that was briefed on the goal rather than only on
    the document. **Building it corrected five gaps in check 5 and added a
    sixth check**, all recorded at check 5 — including that the forward edges
    were not a DAG until three mismarked redirects were reclassified.
*   **Author:** Niklas Westman
*   **Date:** 2026-10-30
*   **Tree examined:** `penpair-main-2` at 0.9.0, full gate green on 2026-10-30
    (407 files clean, core 1228/113, docker 28, reflection-check 77 +1 skipped,
    marwes-ui 100, six packages at 0.9.0)
*   **Citation discipline:** every `file:line` below was opened in this tree.
    The second review found three that were wrong — including one inherited
    through two predecessor documents and never checked by any of them — and
    they are corrected here. A claim that a prior document verified something is
    not verification.

--------------------------------------------------------------------------------

## Overview

Penpair ships ten skills. Used together they do not read as one set: two claim
the same work, the skill that owns composition is referenced by nothing, one
instruction sits in three places, the cross-references cannot be told apart so
the graph reads as a cycle, and seven separate lists disagree about which skills
exist.

The instinct is to fix this by renaming — group the skills into a visible tree.
That is impossible, and the proof is in this codebase rather than in taste. What
is left is the work the names were a proxy for: **say what each skill owns, say
what it does not, and define the words those statements use.**

## The Problem

### 1. Half the set shares one procedure shape, and one pair shares its text

The shape is set-wide. Counting bolded numbered steps across the ten skills:

| Steps | Skills |
|---|---|
| 5 | `penpair-design`, `penpair-recipes`, `penpair-handoff`, `penpair-verify`, `penpair-diagrams` |
| 6 | `penpair-journey-map`, `penpair-integration-map` |
| 7 | `design-judgment` |
| 7 | `penpair-setup` (a POC walkthrough, not a workflow spine) |
| 0 | `penpair-design-release` (numbered items in plain text, not the bolded pattern) |

**The counting method, stated because getting it wrong has produced three
different wrong tables.** A step is a line matching `N. **Name.**` — a numbered
item whose bold label ends in a period inside the bold. Every other pattern was
tried and misled: matching only single-word labels missed `Render and exercise.`
and undercounted four skills; matching any bolded numbered item counted
`penpair-setup/SKILL.md:170`'s "3. **Keep this browser tab visible**" as a
spine step, which it is not. Under the stated method every skill except
`penpair-setup` counts identically either way, so setup is the only line this
distinction changes.

**Five of ten run a five-step spine, four of them closing with a review or
judgment step.** That is structure, and it is the structure the naming instinct
was reaching for. It is not a defect and this record does not remove it; see
Future Improvements, where making it visible is the deferred item it supports.

What *is* a defect is confined to one pair. `penpair-design` and
`penpair-recipes` share text, not merely shape:

| Shared | Evidence |
|---|---|
| A 12-line CLI-help preamble, byte-identical | `diff` of `penpair-design/SKILL.md:13-24` against `penpair-recipes/SKILL.md:8-19` reports no differences |
| The composition-decision instruction, verbatim | `penpair-design/SKILL.md:30`, `penpair-recipes/SKILL.md:25` |
| The reporting triple | Both report **Changed** / **Validated** / **Risks** |

Earlier drafts also cited "the same opening step name" and "a closing judgment
step" as pair-specific. They are not: `penpair-diagrams` closes with "Review and
accept" and `penpair-verify` with "Checkpoint and report". Those rows are
withdrawn. The pair-specific evidence is the three above, and all three are
duplication rather than jurisdiction.

### 2. The skill that owns composition is referenced by nothing

The composition-decision instruction — "record a short composition decision: the
primary user task, one chosen existing reference, visual hierarchy and useful
context, responsive behavior and focus order" — is the declared territory of
`design-judgment`: "choose or critique a screen's hierarchy, density, content
and loading, empty or error states."

It appears in **three** places and none is that skill:
`penpair-design/SKILL.md:30`, `penpair-recipes/SKILL.md:25` and
`docs/design-workflow.md:16` (reworded, same instruction).

`design-judgment` is substantial — seven articulated steps, with
`references/recipes/`, `references/sources.md`,
`references/critique-and-evidence.md` and `references/decision-rules.md`. It is
orphaned only in *inbound* references: no skill body mentions it, and it appears
solely in an install list. Its subject matter was copied out of it.

### 3. The cross-references read as a cycle

The `SKILL.md` files mix "go here next" with "read this first" in identical
prose, so a prerequisite edge pointing backwards looks like a mutual reference.
Two review lenses disagreed about whether cycles exist — one found five, one
found none — and the disagreement was definitional.

Marked, the forward edges form a DAG with **no mutual edges**.
`penpair-journey-map:34` is an unconditional successor;
`penpair-integration-map:30` is a conditional prerequisite.

### 4. The same word means different things, including in code

| Term | Senses |
|---|---|
| **contract** | Architecture (`AGENTS.md:23-27`, the 36 `EGM.md` files), map (`maps/store.ts:72`), command (`docs/command-contract.md`) |
| **revision** | Penpot file counter (`export.ts:30` declares the field, `:59` captures `penpot.currentFile.revn`), map source pin (`maps/types.ts:23`), contract revision (`penpair-diagrams`) |
| **recipe** | A build procedure (`penpair-recipes`), a default composition for a screen archetype (`design-judgment/references/recipes/`), **and a kit recipe in code** — `RecipeInfo` at `kit.ts:8`, a shipped `recipes` CLI command at `cli-main.ts:713`, used in that sense by `penpair-recipes/references/build-flow.md:3` and `docs/cookbook.md:5` |
| **verify** | The release lifecycle's `verified` state (`design-releases/types.ts:208`), the implementation-assessment `verified` (`design-releases/types.ts:223`), and browser comparison (`penpair-verify`) |
| **design** | File operations, composition judgment, a released screen set |
| **release** | A Penpot design release, an npm publication |

A skill cannot state its own boundary in words that mean three things.

### 5. Seven lists of which skills exist, and they disagree

`installSkills` installs all ten (`skills.ts:162`,
`chosen = options.only ?? names`, from `listBundledSkills()` at `skills.ts:23`).
What the rest of the tree says:

| Source | Claims | Checked? |
|---|---|---|
| `README.md:57` | Six, in an arrow chain | No |
| `penpair-setup/SKILL.md:94` | Six, by name | No |
| `docs/skill-installation.md:5-9` | "one canonical installation skill… the other **five**" | No |
| `docs/skill-installation.md:21` | "All **six** entrypoints" | No |
| `docs/design-workflow.md:3-9` | Seven steps naming **none** of the skills | No |
| `packages/core/EGM.md:36-45` | All ten, accurately | No — correct by luck |
| `scripts/smoke-package.mjs:232-240` | A hardcoded seven-of-ten subset | No, and it is the required pre-release gate |

One list **is** checked: `packages/core/test/skills.test.ts:16-27` asserts
`listBundledSkills()` equals all ten names exhaustively, so an added skill
already fails the suite. That is worth knowing before adding machinery: what
rots is the six unchecked lists, five of them prose, and two of those five state
*counts* that a link cannot fix.

The same rot appeared in `docs/EGM.md:46`, whose record count was one behind
`docs/designs/`. It was corrected on 2026-10-30 and that line now reads
correctly; it is cited here as the pattern, not as an outstanding defect. Two
reviewers independently flagged the earlier wording of this paragraph for
describing a defect the file no longer had — which is the same failure in
miniature, so it is recorded rather than quietly deleted.

A list nobody checks is correct only until the thing it describes changes.

### 6. Naming cannot fix any of this

Stated as a finding because it is the first fix people reach for, and it is
foreclosed:

*   `parseSkillMetadata` (`skill-metadata.ts:52-58`) validates every skill name
    against `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, caps it at 64 characters and
    requires it to equal its folder name. **`penpair:design` throws at install
    time.**
*   Nested directories yield `parent:child` in Claude Code, the bare leaf name
    in Codex, and Copilot qualifies plugin skills with a slash — three
    supported hosts, three names.
*   The Agent Skills open standard forbids colons and requires name to match the
    parent directory.
*   A flat hyphenated family scheme was drafted and failed its own criterion,
    that a sorted list should show the pipeline's shape: sorted,
    `penpair-setup` lands last and the map family sorts diagrams → integration
    → journey, the reverse of the pipeline.

**The penpair tree is not expressible in skill names.** Coherence has to come
from stated boundaries and shared vocabulary.

One correction to earlier drafts, which listed `design-judgment`'s missing
`penpair-` prefix as a defect. **It is a meaningful signal and is kept.** That
skill declares `scope: design reasoning` and an audience of "anyone designing a
screen in a design tool or in code"; it carries none of the CLI-help preamble
that the five `penpair`-operating skills share; and its authority order
(`design-judgment/SKILL.md:14-21`) is tool-agnostic. It is the one skill useful
with no Penpot connection and no `penpair` installed. Prefixing it would erase a
real distinction to buy uniformity — which is the reasoning this record rejects
everywhere else.

## Goals

1.  **Each skill states one purpose and its explicit exclusions**, in a named
    place in the file, naming the neighbour that owns the adjacent work.
    Addresses problems 1 and 2.
2.  **Merges are decided**, with the reasoning recorded for every pair, not only
    the merged ones. Addresses problem 1.
3.  **The words the skills use for their own boundaries are defined once**, in
    `docs/glossary.md`. Addresses problem 4.
4.  **Cross-references are marked successor or prerequisite.** Addresses
    problem 3.
5.  **The duplicated instruction text is removed** — the preamble enforced
    identical, the composition instruction stated once in the skill that owns
    it. This is the evidence of problems 1 and 2, so removing it is part of
    settling jurisdiction. Addresses problems 1 and 2.
6.  **The two names that mislead are fixed**, and nothing else is renamed.
    Addresses problems 4 and 6.
7.  **The list of skills is generated to `docs/skills.md` and asserted
    byte-for-byte**, and the six unchecked lists link to it. Addresses
    problem 5. Supporting rather than central: a jurisdiction claim about "the
    ten skills" is not trustworthy while six lists disagree about which ten
    exist.

Success is measurable as: every skill carries a `## What this owns` section with
a purpose and at least one exclusion; no instruction block appears in two skills
except where a test asserts the copies identical; the composition instruction
appears once in `packages/core/skills/**`; every cross-reference carries its
marker word; `design-judgment` is reachable from at least one skill body; no
prose page enumerates or counts the skill set; and `pnpm check` passes.

## Non-Goals

1.  **A gating engine.** Artifact-gated forward-only transitions already exist
    and are stricter — `assertReleaseContracts` (`design-releases/store.ts:168`)
    requires contracts to exist, to be owner-reviewed and to pin exact
    revisions. These stages also have side effects in a live Penpot file, so
    forcing a re-run means pasting boards into a real document again, which is
    the owner's original reported symptom.
2.  **A canonical or enforced statement of pipeline order.** No test exercises
    design-release → handoff → verify in sequence, so an ordering document
    would record a guess as a fact. **Narrowed from an earlier draft:** this
    forbids a canonical order *document* and any test asserting an order. It
    does **not** forbid `README.md` keeping an indicative path, which goal 7
    preserves deliberately — see the technical plan.
3.  **Any renaming beyond the two in goal 6**, and in particular any namespaced
    or nested form. The admission test for a rename is a measured word
    collision, not uniformity; `design-judgment`'s unprefixed name fails that
    test and is kept. **For a future case with no collision and no meaningful
    signal either way, the default is to add the `penpair-` prefix** —
    `design-judgment` is an exception earned by its tool-agnostic scope, not
    the rule.
4.  **A written `docs/pipeline.md`.** A document that must match code is the
    problem, not the fix.
5.  **A repository-wide glossary.** Goal 3 is scoped to the words the skills use
    about their own boundaries. Approval, capture, baseline and freshness are
    owned by `docs/approvals.md`, `coverage.md` and `artifacts.md`, and the
    glossary cites those owners rather than restating them, per `AGENTS.md`.
6.  **Frontmatter normalisation.** No machine-readable field is proposed, and
    nothing in core reads `metadata` or `compatibility`.
7.  **The approval-fingerprint change.** A different subject, and its premise is
    contested — see Q1.

## Open Questions

*   **Q1 — Is the revision invalidation boundary a defect or a product
    decision?** Three prior documents treat `approvalFingerprint`
    (`approvals.ts:36`) hashing a file-level revision as a bug.
    `docs/approvals.md:19` documents it as intended: "The latest revision is a
    conservative invalidation boundary: an unrelated design edit may require
    fresh approval even if pixels stay equal." The guide wins unless the owner
    overrules it. Out of scope either way.
*   **Q2 — Does the chain get an end-to-end sequence test?** The only fixtures
    are in `examples/design-release-maps/`, labelled synthetic and unapproved by
    their own README, and they stop at the integration map. Non-goal 2 is
    deferred until this exists.

## Critical User Journeys

### CUJ 1: An agent picks between two overlapping skills

*   **Given**: A task that could be editing a Penpot file or deriving a screen
    from an approved frame.
*   **When**: It reads either skill's `## What this owns` section.
*   **Then**: Each names the other as owning the adjacent case, in words the
    skill's own body does not contradict.

### CUJ 2: A composition decision reaches the skill that owns it

*   **Given**: Someone is about to derive a new screen.
*   **When**: They follow `penpair-design` or `penpair-construct`.
*   **Then**: Neither restates how to make a composition decision. Both carry a
    prerequisite edge to `design-judgment`, which states it once — the first
    inbound reference that skill has had.

### CUJ 3: A stale list is caught before a user follows it

*   **Given**: A contributor renames a skill, or adds one.
*   **When**: They run `pnpm test`.
*   **Then**: `skills.test.ts:16-27` already fails on an added skill. What is
    new is that the six documents which *describe* the set can no longer drift
    from it: `docs/skills.md` is byte-asserted against the generator, and no
    prose page enumerates or counts the set.

## Technical Plan

### Jurisdiction, stated as exclusions in a named section

Each skill gains a `## What this owns` section holding one purpose line and at
least one exclusion naming the neighbour that owns the adjacent work. A named
section rather than loose prose, so the enforcement check in this plan has
something to find and a contributor knows where to look.

Exclusions rather than labels, because a label taxonomy was tried and fails:
`penpair-diagrams` writes a contract revision, so it is not a pure capability,
and `design-judgment` is more stage-shaped than `penpair-design` is. A label
would have to carve out both.

| Skill | Owns | Does not own |
|---|---|---|
| `penpair-setup` | Installing penpair; connecting or repairing a Penpot connection | Work inside a connected file — `penpair-design` |
| `penpair-journey-map` | User intent, decisions and recovery paths | Implementation responsibility — `penpair-integration-map` |
| `penpair-integration-map` | Binding a reviewed journey to routes, components and data | Intent itself — `penpair-journey-map` |
| `penpair-diagrams` | Building or reconciling a native diagram for a map, and the contract revision recording it | A map's content; general file editing — `penpair-design` |
| `penpair-design` | Operations on a Penpot file: inspect, edit, audit, export | Deriving a screen or state-variant set from an approved reference — `penpair-construct`. The composition decision — `design-judgment` |
| `design-judgment` | Deciding and critiquing hierarchy, density, content and screen states | Writing to Penpot — `penpair-design` |
| `penpair-construct` (from `penpair-recipes`) | Deriving a screen or state-variant set from an approved reference, with its checkpoint evidence | Operations on a file that is not derived from a reference — `penpair-design` |
| `penpair-release` | Planning, assembling, verifying and finalizing a design release | npm publication — `docs/releasing.md` |
| `penpair-handoff` | Carrying approved design evidence into a frontend implementation | Browser comparison — `penpair-verify` |
| `penpair-verify` | Comparing a running frontend against its approved design | New implementation or missing mappings — `penpair-handoff` |

**The design/construct boundary is drawn on derivation, not on existence.** An
earlier draft said "`penpair-design` operates on what exists; the other
constructs what does not yet." That is wrong, and the file says so:
`penpair-design/SKILL.md:30` mandates "Build every board as auto layout" and its
step 3 **Change** (`:40`) is a write. `penpair-design` creates objects. The
distinction that survives is whether the work derives a screen family from an
approved reference.

**One edit this requires that earlier drafts missed.**
`penpair-design/SKILL.md:32-36` reads "For an approved-reference variant, retain
the actual source image and inspection, preserved regions and declared
deviations. Use the project-owned comparative checkpoint from `penpair-recipes`
when installed." That paragraph claims exactly the territory assigned above to
`penpair-construct`, and reaches into the asset named as its distinctive
content. It must stop claiming that work, or the skill will assert the opposite
of its own new exclusion.

**Corrected after implementation.** This paragraph originally said the line
"must become a prerequisite edge to `penpair-construct`". That was wrong by this
record's own rule: `penpair-construct` **owns** approved-reference derivation,
so pointing at it is a jurisdiction redirect, and redirects are goal 1's
exclusions rather than edges. Built as a prerequisite, it gave
`penpair-design` three primitives aimed at one neighbour — the exclusion, a
`Requires:` and a `Next:` — in two opposite directions, and that pair formed a
two-skill cycle which the first cycle check could not see because it walked only
`Next:` lines. The `Requires:` line is deleted; the exclusion and the `Next:`
edge say everything it said, and its body text duplicated
`penpair-construct`'s own.

### Merges: none, with the reasoning for each pair

`penpair-recipes` and `penpair-design` looked like an obvious merge. Reading
both settles it against.

**`penpair-recipes` is a build procedure**: Target (confirm the pinned file and
exact page/frame IDs) → Vocabulary (resolve the real token catalog and component
IDs, or list each missing dependency) → Preview (prepare one idempotent
operation with independent readback) → Build (apply, set values and fonts before
bindings, await helper flush) → Judge (export until stable, inspect twice,
audit).

Its distinctive content is narrower than an earlier draft claimed. That draft
said `penpair-design` "has no equivalent of either" reference file; for
`build-flow.md` that is false — compare `build-flow.md:5` and `:11` against
`penpair-design/references/write-protocol.md:17-27` and the same write-body
declarations, 90 KB ceiling, idempotency and run IDs appear in both, and
`build-flow.md:13` already delegates to the design skill's plugin-gotchas
reference. What is genuinely distinctive is the layout, flush and token-binding
sequence with `run-file --stages` (`build-flow.md:7-9`), and
`visual-checkpoint.md`'s screen-family evidence record.

That is enough for a boundary and not enough for two skills with the same name
for their shared text — so the duplication goes (goal 5) and the skill stays,
renamed.

**The other pairs, for the record:** `penpair-journey-map` and
`penpair-integration-map` produce distinct contracts and the second pins the
first's sha (`maps/context.ts:44-47`). `penpair-handoff` and `penpair-verify`
produce distinct artifacts on opposite sides of a running implementation — an
earlier draft also cited "different spines", which is withdrawn, since both run
five steps. `penpair-diagrams` is invoked by both map skills, so folding it into
either duplicates it into the other.

### Vocabulary: `docs/glossary.md`

The purpose and exclusion statements use words that currently mean two or three
things. Those words get one definition each in `docs/glossary.md`.

**Why a file and not a section in an existing owner.** The alternative is a
section inside a topic page. Rejected because the terms span three surfaces —
documentation, the ten skills, and code — so no existing topic page covers
them, and `AGENTS.md`'s one-canonical-home rule makes a findable canonical
location worth more than proximity. The file is small by design, and the entry
for a term another guide owns **cites that guide** rather than restating it.

| Term | Why it needs an entry |
|---|---|
| **revision** | Three senses, none of which a rename touches. The genuinely homeless one. |
| **recipe** | Three senses, and the third is in shipped code (`kit.ts:8`, `cli-main.ts:713`), so renaming the skill does **not** leave `design-judgment` sole owner. An earlier draft claimed it did; that was wrong. |
| **verify** | Three senses, two of them in one file (`types.ts:208`, `:223`). |
| **contract** | Three senses that each already have an owner, so the entry is a pointer, not a definition. |
| **design** | Partly closed by goal 6; the remainder needs disambiguating. |
| **successor**, **prerequisite** | Introduced by goal 4. Defined here as well as at the markers, because goal 3's check needs one place to look. |

Only **release** closes cleanly by rename. An earlier draft claimed three of six
did; two of those claims were wrong.

The glossary serves contributors, not installed skills: a skill cannot link
outside its own folder, because `docs/skill-validation.md:32` records that the
checker "follows in-project links and refuses escapes", and a partial install
would leave the link dangling.

### Two edge kinds

Every cross-reference is marked **successor** ("go here when this is done") or
**prerequisite** ("read this first; it produces your input"). Two markers,
because two is what problem 3 requires.

A four-marker scheme was drafted, adding *reference* (a link to a document owned
by another skill, as at `penpair-design-release:55` and `penpair-diagrams:18`)
and *jurisdiction* (a redirect, as at `design-judgment:3`). Both distinctions
are real and are kept as analysis — a link naming `penpair-design` while meaning
one file inside it is part of why the graph reads as a mesh. Neither changes a
reader's next action, and what that scheme called jurisdiction edges are now
goal 1's exclusions. The word is used in this record only for what a skill owns,
never for an edge kind. One
sentence of guidance replaces them: **a link to another skill's reference file
is not a skill edge.**

### Deduplicate what is duplicated, and only that

**The preamble is genuinely duplicated** — byte-identical across exactly five
skills, named here because "the five `penpair`-operating skills" is not a
definition a check can use: **`penpair-design`, `penpair-recipes`,
`penpair-handoff`, `penpair-verify` and `penpair-setup`**. All five are in
scope, `penpair-setup` included. It stays physically in each, with a test
asserting the copies match one canonical source. A single owner the others link
to fails on partial installs and on the link-escape refusal above.

**The canonical source is a tracked fixture,
`packages/core/test/fixtures/skill-cli-preamble.txt`**, holding the block and
nothing else. Not one of the five nominated as master, because that makes four
skills' correctness depend on an arbitrary fifth and gives a reader no way to
tell which was chosen deliberately; and not an inline constant in the test,
because the block is prose a contributor will want to edit as prose. The check
reads the fixture and asserts each of the five contains it verbatim.

One consequence accepted knowingly: freezing it also freezes its off-topic
lines. `penpair-setup` and `penpair-verify` both carry "Build and visually
critique one representative frame before expanding", irrelevant to installing
penpair and to browser verification. Trimming it means editing the fixture and
is in Future Improvements.

**The reporting triple is not duplicated and must not be enforced.** All six
skills word it differently — `penpair-diagrams:50` "with offline compilation",
`penpair-design-release:85` "retaining the current checkpoint",
`penpair-recipes:42` "with exact object/artifact IDs", and three more. An
earlier draft proposed asserting identity; it would have deleted meaning.

**The composition instruction is stated once**, in `design-judgment`. It is
removed from `penpair-design/SKILL.md:30` and `penpair-recipes/SKILL.md:25`,
which gain prerequisite edges to it.

`docs/design-workflow.md:16` is **not** emptied. An earlier draft removed it,
which contradicts the same partial-install reasoning that saved the preamble:
that page ships inside both command packages (`docs/EGM.md:23-26`) and is read
by users who may not have `design-judgment` installed. Its sentences are
replaced by a one-line summary plus a pointer, so a reader without the skill is
not left with nothing.

A caution for the implementer: `penpair-design/SKILL.md:30` holds **two**
instructions in one paragraph — the auto-layout mandate ("Build every board as
auto layout; read `auto-layout.md` before the first script") and the composition
instruction. The auto-layout mandate is a repository rule in `AGENTS.md` and
must survive. Remove the composition sentences, not the line.

### Two renames

| From | To | The measured collision it closes |
|---|---|---|
| `penpair-design-release` | `penpair-release` | "Release" means a Penpot design release and an npm publication; the skill opens by disclaiming the second |
| `penpair-recipes` | `penpair-construct` | "Recipe" has three senses and this skill holds none of them — `design-judgment/references/recipes/` holds the compositions, `kit.ts:8` holds the code sense |

`renamedSkills` (`skills.ts:102`) grows from two entries to four. It is kept for
reporting, not compatibility: `installSkills` leaves the old folder in place and
reports it.

`design-judgment` is **not** renamed; problem 6 records why.

### Generate `docs/skills.md`, and keep the one informative list

The repository already solves this for a different list:
`scripts/generate-troubleshooting.mjs` exports a function returning a page's
markdown and writes the file when run as a script;
`packages/core/test/docs.test.ts:55-57` asserts the file equals that output byte
for byte; `pnpm docs:generate` builds core then runs the generator;
`docs/EGM.md:15-18` records the invariant.

Applied here: `scripts/generate-skill-index.mjs` produces `docs/skills.md` from
`listBundledSkills()` and `parseSkillMetadata`. That parser
(`skill-metadata.ts:67-70`) returns exactly `{name, description}` — the right
tool for this page, and the wrong tool for a frontmatter key-set check, which is
why non-goal 6 is a non-goal.

**`README.md:57` keeps an indicative path.** An earlier draft replaced its
"setup → design → recipes → handoff → verification" chain with a link to the
generated page. That page is alphabetical, because `listBundledSkills()` sorts
(`skills.ts:27-30`) — so the replacement would have destroyed the only
reader-facing statement of order and replaced it with exactly the uninformative
sorted list used to reject the family scheme. Instead the line keeps a path,
reworded so it no longer implies completeness, and gains a link to
`docs/skills.md` for the full set. `README.md:57` links with absolute GitHub
URLs, so the new link must take the same form.

The other five lists stop enumerating: `penpair-setup/SKILL.md:94`,
`docs/skill-installation.md:5-9` and `:21` (both state counts, so they need
rewriting, not just linking), `docs/design-workflow.md:3-9`, and
`packages/core/EGM.md:36-45`.

**Why a generator rather than a prohibition.** The cheaper option is to assert
in `docs.test.ts` — which already walks the tree (`docs.test.ts:60-67`) — that
no prose page enumerates or counts the set, and add no generator. That check is
kept regardless. The generator earns its place because a reader still needs
somewhere to *find* the ten, and `packages/core/EGM.md` is an architecture
contract withheld from most reviewers by design, not a page a user opens.

### Enforcement

Six checks. Two extend existing tests rather than adding files. Each is
specified to the point where two engineers would write the same check, because
an earlier draft described three of them in terms that would have produced
different and non-equivalent implementations.

1.  **Generated-page identity** — `docs/skills.md` equals the generator's
    output. New, in `docs.test.ts` beside the troubleshooting assertion.
2.  **No prose page enumerates or counts the set.** Operationally: for each
    `docs/**/*.md` except `docs/skills.md` and `docs/designs/**`, fail if the
    page contains either (a) three or more bundled skill names within any ten
    consecutive lines, or (b) a number word or digit from two to twenty
    immediately preceding the word "skills" or "entrypoints"
    (`/\b(two|three|…|twenty|\d+)\s+(skills|entrypoints)\b/i`). (a) catches a
    list, (b) catches the count claims at `docs/skill-installation.md:5-9` and
    `:21` that a link does not fix. Both thresholds are arbitrary and are
    stated so they can be argued with rather than guessed at.

    **Two exemptions (a) needs, found while building goal 7.** Run as written,
    (a) produced three findings and all three were false positives, so the
    threshold is kept and the scope narrowed:

    *   **Markdown table rows are exempt** — the same exemption check 5 needs.
        `docs/skill-validation.md`'s behaviour-trial table maps one request to
        one expected skill per row. That is a test matrix, not a claim about
        which skills exist, and it must name skills to do its job.
    *   **`docs/glossary.md` is exempt**, alongside `docs/skills.md`. Its
        "design" entry names `penpair-design`, `design-judgment` and
        `penpair-release` as the owners of three senses of one word. Naming
        skills is that page's function; it never claims the set is complete.

    With both, (a) passes across all 52 pages in `docs/`, and (b) passes with
    no exemption once `docs/skill-installation.md` stops counting.
3.  **Preamble identity** — each of `penpair-design`, `penpair-construct`,
    `penpair-handoff`, `penpair-verify` and `penpair-setup` contains the
    contents of `packages/core/test/fixtures/skill-cli-preamble.txt` verbatim.
    (This entry said `penpair-recipes` until goal 6 landed; the rename is the
    point of goal 6 and the stale name here was caught while building goal 7.)
4.  **Composition-instruction uniqueness** — the sentence "record a short
    composition decision" appears exactly once across
    `packages/core/skills/**`. A substring count, not a judgment.
5.  **Marker presence and section presence.** Every skill has a
    `## What this owns` section containing at least one line matching
    `^Requires:` or `^Not here:`. And **a cross-reference line is defined as a
    line outside that section containing the name of another bundled skill**;
    every such line must begin with `Next:` or `Requires:`. The marker format
    is exactly that: the literal word, a colon, at line start, unbolded.

    **Two boundary definitions this check needs, found while building goal 1
    and absent from the first version of this record.** Without them the check
    is vacuous or wrong, so they are part of the check, not notes on it:

    *   **The section ends at the next markdown heading of any level**, or at
        end of file. Eight of the ten skills had no heading after the point
        where the section was inserted, so an undefined end made the section
        swallow the whole body and left no line outside it to check. Those
        eight gained a `## Before you start` heading over the material that
        already followed; no prose moved. `design-judgment` and
        `penpair-release` already had a following heading.
    *   **The YAML frontmatter is excluded.** Six descriptions name another
        skill on purpose — `design-judgment`'s names `penpair-design`, and
        that redirect is the field doing its job. A frontmatter line cannot
        begin with `Next:` or `Requires:` and still be valid YAML, so
        including it would make the check unsatisfiable.

    **Three more, found while building goal 4.** The same pattern: the
    definition was right about intent and wrong about text.

    *   **A skill name that appears only as part of a path is not an edge**,
        which this record already says in prose — "a link to another skill's
        reference file is not a skill edge" — but the mechanical definition
        above contradicts. Seven of the twenty candidate lines were of this
        kind. They were rewritten to explicit path form
        (`penpair-design/references/auto-layout.md` rather than "the
        `penpair-design` auto-layout reference"), which the check exempts and
        which tells the reader which file is meant.
    *   **Markdown table rows are excluded**; they cannot carry a line-start
        marker. Exactly one exists, `penpair-setup`'s install table, and goal 6
        removes it.
    *   **One edge is one line, and prose may not run on from it.** A wrapped
        marker leaves a continuation line holding a skill name and no marker,
        so the check fails on correct text; a sentence placed directly beneath
        a marker reads as part of the edge. Both occurred.

    **And a check that is not about markers at all: the work-order graph must
    be acyclic — walking `Next` together with reversed `Requires`.** Both
    markers describe one arrow from opposite ends, so a check that walks only
    `Next:` hides any cycle closing through a `Requires:`. The first version
    walked only `Next:` and reported a DAG while a design↔construct two-cycle
    stood; a later review found it. Marking every edge revealed four cycles, all through
    `penpair-verify`, whose three outbound references are jurisdiction
    redirects rather than successors — work it does not own, which this record
    assigns to goal 1's exclusions. They belonged in `## What this owns` and
    were marked `Next:` in error. Moved there, the forward graph is a DAG.
    **A complete marker set can still be wrong, and the cycle is what exposes
    it**, so the cycle check earns its place beside the marker check. This also
    retires the claim in `.working-docs/HANDOFF-3.md` §4 that the forward edges
    *already* form a DAG: they did not, until the redirects were reclassified.
    Two known cases this definition deliberately includes:
    `penpair-design/SKILL.md:44`, which names two skills in prose, must be
    rewritten into marked lines. One it deliberately excludes:
    `design-judgment/SKILL.md:47-51`'s "Where to read next" section links only
    to its own `references/`, names no bundled skill, and so is not a
    cross-reference.
6.  **Glossary coverage** — every term in a fixed list (`revision`, `recipe`,
    `verify`, `contract`, `design`, `successor`, `prerequisite`) has a heading
    in `docs/glossary.md`. Without this, goal 3 is the one deliverable an
    implementer could omit entirely with every other check green, which a
    reviewer identified as its largest gap.

**Routing coverage already exists and is extended, not added.** An earlier draft
claimed `renderSkillRouting` has no test and no assertion on routing rows. The
first half is true — no test imports the symbol. The second is false:
`skill-instructions.test.ts:64-70` installs two skills and asserts the generated
link set equals those names **and** `expect(links).toHaveLength(4)` — two
install rows plus two routing rows — so a dropped row fails it today. That test
is extended to all ten names.

That draft also named the wrong failure site. A rename does not fail the regex
at `skill-routing.ts:21`; `penpair-construct` matches it. It drops out at the
`tasksBySkill[name]` lookup at `:27-28`, which emits nothing for a key absent
from the hand-maintained map at `:1-14`.

**What is not checked, and the reuse answer for it.** Whether a purpose is
accurate, whether an exclusion is complete, whether a marker is the right kind
— these are review matters, the same limit `AGENTS.md:172-176` records for the
`EGM.md` contracts. But that limit comes with a mechanism: `egm-drift-report` is
run over the contracts before a release. Extending its remit to the skills tree
costs nothing new and is the only proposal here that addresses purpose drift
rather than text drift.

**Each check must be proven to fail without its fix, and the procedure is
specific** — a check written against the wrong path or match mode is
permanently green and looks satisfied. For each of the six: make the minimal
edit that should break it (delete a line from the fixture; add "the other five
skills" to a docs page; add a second copy of the composition sentence; strip a
marker; remove a glossary heading; hand-edit `docs/skills.md`), run only that
test, confirm it fails with a message naming the file, then revert. Record the
six observed failure messages in the implementation notes. A check whose
failure was never observed does not count as landed.

## Alternatives Considered

### Alternative A: A gating engine

*   **Pros**: Would make order executable rather than documented.
*   **Cons**: The gates exist and are stricter; gating an irreversible stage can
    manufacture the symptom it was meant to prevent.
*   **Reason for Rejection**: It would create a second, laxer readiness
    definition competing with `assertReleaseContracts`.

### Alternative B: Express the tree in skill names

*   **Pros**: Addresses the request literally.
*   **Cons**: `parseSkillMetadata` throws on a colon; three hosts produce three
    names from a nested directory; the open standard forbids colons; and the
    flat family scheme fails its own criterion.
*   **Reason for Rejection**: Four independent failures, one a thrown error.

### Alternative C: A stage/capability taxonomy applied as labels

*   **Pros**: Cheap — a table, no file rewrites.
*   **Cons**: The files contradict the split. `penpair-diagrams` writes a
    contract revision; `design-judgment` is more stage-shaped than
    `penpair-design`.
*   **Reason for Rejection**: Labels over contradictory files mis-sort readers.
    **One ground is withdrawn:** an earlier draft argued "the spines are not
    uniform, so there is no mould to sort against". Five of ten share a
    five-step spine, so there is a mould. The two cons above stand on their own.

### Alternative D: A written `docs/pipeline.md` owning membership and order

*   **Pros**: One place to read; can carry what code does not know.
*   **Cons**: A seventh hand-maintained description of a code-derived list,
    added to fix six that rotted for that reason. Its membership test would have
    parsed only the new file, so `docs/skill-installation.md` would have stayed
    wrong.
*   **Reason for Rejection**: Superseded by generation for membership, and by
    Q2 for order.

### Alternative E: `packages/core/EGM.md` as the canonical list

*   **Pros**: Already accurate, listing and linking all ten.
*   **Cons**: An architecture contract for contributors, withheld from most
    reviewers by design, and not where a user looks. Hand-maintained, so
    correct by luck.
*   **Reason for Rejection**: Rejected as the source, not as a location — it
    links to the generated page like every other description.

### Alternative F: Fix the lists by hand and add no check

*   **Pros**: An afternoon, no new machinery.
*   **Cons**: It is what produced the current state. All of them were correct
    when written.
*   **Reason for Rejection**: Without a check they rot again, invisibly until a
    user follows one.

### Alternative G: Ship only the maintenance half

A rescope after the first review reduced this record to generation, two renames
and deduplication, dropping jurisdiction, merges and vocabulary.

*   **Pros**: Every item verified, cheap, breaks almost nothing.
*   **Cons**: It answers a different question. The overlap, the orphaned skill
    and the word collisions are all measured and all survive it.
*   **Reason for Rejection**: The review that produced it was briefed on the
    document, not the goal, so its scope judgment carried no information about
    what the work was for. Its factual corrections are kept throughout.

--------------------------------------------------------------------------------

## Non-Functional Requirements

**Rollout.** Two skills change name. The owner has accepted the break
(2026-10-30), so there is no compatibility layer; `renamedSkills` reports the
folders left behind. No skill retires: the installed set stays at ten.

**Three edits that are not rename-driven and would be missed by working from
the goals alone.** They are listed here because a reviewer found each of them
reachable only by reading the technical plan's prose:

1.  `penpair-design/SKILL.md:32-36` — the approved-reference-variant paragraph
    claims the territory assigned to `penpair-construct` and reaches into
    `visual-checkpoint.md`. It becomes a prerequisite edge. **Without this edit
    the skill contradicts its own new `## What this owns` section, and no check
    catches that contradiction.**
2.  `penpair-design/SKILL.md:44` — names two skills in prose, so check 5
    requires it be rewritten as marked lines.
3.  `docs/design-workflow.md:16` — its composition sentences become a one-line
    summary plus a pointer, not a deletion.

The old names appear outside `.working-docs` in `scripts/smoke-package.mjs`,
`packages/core/test/release-skill.test.ts`, `skills.test.ts`,
`skill-instructions.test.ts`, `packages/core/src/skill-routing.ts`,
`src/help/topics.ts`, `packages/core/EGM.md`, `docs/skill-validation.md`
(including the `--only penpair-design-release` command at `:14`),
`docs/design-releases.md`, `README.md`, `AGENTS.md:90` — a markdown link that
`docs.test.ts:60-67` will fail on, whose link *text* and surrounding prose at
`:90-99` also carry the old name and are caught by no check — and the renamed skills' own `SKILL.md` and
`agents/openai.yaml`. Note that `skills.ts:138-143` and `:288` hardcode
`penpair-design` and `penpair-setup`, neither of which is renamed.

`docs/EGM.md:46`'s record count was corrected on 2026-10-30, before this record was finalized; it is not outstanding work. It is cited in problem 5 as an instance of the
same defect.

**One narrower claim than an earlier draft made.** That draft said
`docs/skill-validation.md` records legacy folders as making readiness incomplete
"rather than failing". The source is narrower: `:30` says legacy
**setup-guide** folders, and `:19` makes readiness-incomplete exit 3 — non-zero,
so it fails any CI invocation. The rename therefore needs its routing rows and
`renamedSkills` entries landed together, not as a follow-up.

From `AGENTS.md`: all six packages release together at one version, including
those that did not change; a renamed skill needs its routing row and a
changeset. `pnpm smoke:package` has never been run in this tree and is required
before release.

**Generated-file discipline.** The generator imports the core's built output, as
`generate-troubleshooting.mjs` does, so `pnpm docs:generate` must build core
first. `docs/EGM.md:15-18` and `:57-59` name their subject explicitly and must
be updated to cover `docs/skills.md`.

**Security and privacy**: unchanged. No new network calls, no credential
handling, no change to the Penpot write protocol.

**Performance**: not critical. One generator and five structural checks.

--------------------------------------------------------------------------------

### Additional Resources

*   `AGENTS.md` — neutral core, release-together, the shipped/repository skill
    split, the one-canonical-home rule, and the `egm-drift-report` mechanism.
*   `docs/EGM.md` — the generated-file invariant this record extends.
*   [skill-validation.md](../skill-validation.md) — the three-host checker, the
    link-escape refusal, and readiness exit codes.
*   `docs/approvals.md` — owns approval, capture and the revision boundary Q1
    turns on.
*   `scripts/generate-troubleshooting.mjs` and
    `packages/core/test/docs.test.ts` — the pattern goal 7 reuses.

### Future Improvements

*   **Make the shared five-step spine visible.** Five of ten skills run it, four
    closing with a review step, and the three-way split the CLI preamble reveals
    — five `penpair`-operating skills, four map-and-release skills, one
    tool-agnostic judgment skill — is the structure the naming instinct was
    reaching for. Naming cannot express it (problem 6); a documented procedure
    convention could. This is the deferred item that problems 1 and 6 both point
    at, and it should be attempted only once the boundaries in goal 1 have been
    lived with.
*   **Trim the CLI-help preamble** to what all five skills need. Enforcing
    identity freezes its off-topic lines, a known cost of goal 5.
*   **Pipeline order and per-skill artifact declarations.** Blocked on Q2.
*   **Make a map source's `revision` required** rather than optional
    (`maps/types.ts:23`). The hole a stub contract would walk through.

--------------------------------------------------------------------------------

<!-- Provenance: Indicates initial structural drafting via EGM. -->

*Drafted with EGM; three drafts, two zoom-out reviews, and one correction for
having briefed the first reviewer on the document instead of the goal*
