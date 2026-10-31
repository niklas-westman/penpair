# Design records

Why a change was made, and what was decided against. These are contributor
history, not product documentation: they are excluded from the published
packages, and a reader installing the command does not need them.

**Read the relevant record before reopening a question.** Two of the five record
work that was deliberately stopped or superseded, and two record decisions the
owner has already made. Reopening any of them without reading first repeats an
argument that has been had.

Status is the first thing in each record, because a design whose status you have
not read is a design you will misuse.

| Record | Status | What it decides |
|---|---|---|
| [Fewer lost penpair runs](fewer-lost-penpair-runs.md) | **Implemented locally, with automated coverage.** | Flush scope, filter cardinality, and which controls already shipped. The owner selected A1: an explicitly falsy flush root refuses, while omitting the key deliberately retains page scope. Live-work probes, including Q-SELF, remain. |
| [Penpot revision conflicts](penpot-revision-conflicts.md) | **Not ready to build.** | Why journaled runs abort when nothing was written. One probe decides whether penpair needs any change at all, and it has not run. Nothing here is built until it does. |
| [Baselines across release pages](multi-page-baselines.md) | **Historical. Superseded 2026-10-29.** | Examined 0.8.1 at `9e32620`. Its recommendation to prioritise offline Projection composition was superseded by the owner's choice of native Penpot release membership and live verification. Its schema examples are not installation instructions. |
| [Reflection integration](reflection-integration-evaluation.md) | **Evaluation. Direction decided 2026-10-29.** | Capability, friction and delivery path for the frontend comparison. The owner chose native release membership, live verification and the engine bridge. The Projection-first sequencing is retained as history, not a recommendation. |
| [Settling what each skill owns](skill-cohesion.md) | **Built, enforced, reviewed after building. 2026-10-30.** | Examined 0.9.0. The ten skills do not read as one set: two claim the same work, the skill that owns composition is referenced by nothing, one instruction sits in three files, and the cross-references cannot be told apart. Fixes it with a `## What this owns` section per skill, two renames, a small `docs/glossary.md`, and a generated-and-asserted `docs/skills.md`. **Records that the penpair tree cannot be expressed in skill names at all** — `parseSkillMetadata` throws on a colon, three hosts produce three names from a nested directory, and a flat family scheme failed its own criterion. Nothing merges. Keeps `design-judgment` unprefixed deliberately: it is the one skill useful with no Penpot connection. Two zoom-out reviews; the first was briefed on the document rather than the goal and its scope verdict was discarded. |

For the current design-release workflow, and for the implementation and
acceptance limits that the two superseded records predate, read the maintained
[design-release guide](../design-releases.md).

## Adding a record

A record earns its place when a decision was expensive to reach and would
otherwise be re-litigated — a path rejected for a reason that is not obvious
from the code, a probe that closed a question, a primitive that turned out to be
wrong about its own guarantee.

Open with a status line. Name the version or commit examined, because a record
read against later code will mislead unless it says what it looked at. Say what
was decided *against* and why; that is the half a reader cannot reconstruct.

Review reports and session evidence stay in git-ignored `.working-docs/`. A
record is the conclusion, not the transcript.
