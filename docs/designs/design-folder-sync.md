# The design folder as the truth: one command, not a process

**Status: decided 2026-11-05; the release half is built (`design-release attest`), `sync` is not.** Examined Penpair 0.12.0 plus the render work on `perf/render-timing-profile`.

## Decisions (owner, 2026-11-05)

1. The repository folder, reviewed in git, is the place for the reference; approval of a change means merging it.
2. The editor renderer is acceptable as the default for the folder's images, with the exporter as the fallback.
3. **Releases stay Penpot pages** (`release/VERSION`); they do not become tags of the folder. Penpot stays the place of truth for what a release is, and the folder holds the index and optional previews.
4. The release gate is Penpot's stored data, not rendered images: a release page is proven against its sources by comparing stored data, and the owner's words are saved in one small file. This is built as `design-release attest` (see [Attesting a release without rendering](../copy-between-pages.md#attesting-a-release-without-rendering)): 95 frames in about 9 seconds, no renders. The strict route stays for pixel-exact evidence.
5. `approve --frames` and `copy --pixel-renderer` were parked (removed from the branch, recoverable from commit `ff6eb16`), because they extended the heavy path.

What the two halves are now: **the release path** (copy, then `attest`) is done; **the folder path** (`sync`) below is the remaining work, as a convenience for review and for the frontend, not a gate.

## The problem

Penpair set out to make a design tool useful for ideation and to keep the truth somewhere plain: a folder in the repository. It has grown into a process around that idea. It now has 42 commands, 11 shipped skills, about 50 documents, and a documented path from intent to implementation of seven steps (stable exports, audits, owner approvals, baselines and coverage, structured handoff, a frontend comparison). Each step answered a real failure: a stale first render, a silent hang, a copy that landed in the wrong board, a missing proof. Together they hide the original idea, and an agent asked to "ship the design" must learn the vocabulary first.

The speed measurements made the cost visible. Rendering 95 frames through Penpot's exporter took 8 min 34 s; the same frames from the open editor took 1 min 50 s, and an unchanged rerun took 7 s. The fast path is also the simple path, and it is the one the process does not offer by default.

## The proposal

One everyday command, working on the pinned file:

```sh
penpair sync            # make design/ match Penpot
penpair sync --check    # exit 1 when design/ is out of date; changes nothing
```

`sync` writes a plain folder that is the reference for the frontend and for review:

```text
design/
  frames/<page>/<frame-name>.webp   current image of each frame (lossless)
  index.json                        per frame: id, name, page, size, structure hash, renderer, rendered at
  tokens.json                       the token catalog (already produced by `snapshot`/`tokens`)
```

How it behaves:

- **Incremental.** A frame whose structure hash in `index.json` is unchanged is not rendered again. The hash is an implementation detail that lives in the index, not a concept the user manages. `--full` renders everything again.
- **Review is git.** A changed frame is a changed image and a changed line in `index.json`; the pull request shows both. Approval is merging it. No owner-words records, no approval fingerprints.
- **One renderer per project**, set in the config and written into `index.json`, so images from two renderers never mix in one folder. The editor renderer is the default when a debug port is configured, the exporter otherwise.
- **Quiet safety.** The behaviours learned the hard way stay, as behaviour: a deadline per stage, a stalled render named and reported, a frame that does not settle is listed as failed and never written as if it had succeeded.

## What it reuses

Almost everything it needs exists on the branch: the render service (concurrency, per-frame failure isolation, stall handling), the editor renderer, batched fingerprints, `exportFrames`, and `snapshot`/`tokens` for the catalog. What is new is the configuration of which pages or frames belong in `design/`, the index file, the stale check, and the command itself. It is mostly composition.

## What moves aside, not away

Approvals with owner words, baselines and coverage, the stable double render as a user-visible rule, and the release machinery stay for projects that need an audit trail, as an opt-in "audit mode" with its own documentation. The everyday documentation, the skills' first pages and `penpair help` would lead with `sync`. Nothing is deleted by this proposal.

## How the folder and the release page relate

The folder shows what the design looks like now; the release page is what was released. They do not need to agree frame by frame. A release is proven by `attest` against Penpot's data and carries the owner's words; `sync` keeps previews current for people and for the frontend. `sync` never writes to Penpot and `attest` never renders, so neither can stall the other.

## Risks and open questions

1. **Trust.** If the editor renderer is the default, the folder's images are not the exporter's bytes (about 1.3 % of pixels differ on a median frame, mostly text edges; transparent areas come out in the canvas colour). That is fine for a reference people look at; it is a decision for any later automated comparison against these images.
2. **The hash is not a pixel proof.** It reads shape properties and tokens, not image bytes or fonts that loaded differently. `--full` is the answer; the proposal accepts the trade for speed.
3. **Repository weight.** Lossless images for many frames add up when many change at once; the folder may need to live under Git LFS.
4. **The release pages.** Decided: they stay Penpot pages, proven by `attest` (see Decisions). The folder is not a release.
5. **Someone has to run it.** It needs the Penpot tab open; an agent or a hook would run it, and `--check` would run in review.

## Questions that were asked, and the answers

1. Folder in git, approval means merged: yes.
2. Editor renderer as the default for the folder, exporter as the fallback: yes.
3. Releases: stay in Penpot, and make the way from design to release lighter (answered by `attest`).

## The smallest slice (not yet scheduled)

`sync` and `sync --check` on one page or a prefix of pages, writing frames and the index, using the render service as it is. No new approval, baseline or release behaviour. Measure it on the 95-frame page, then decide what else moves aside.
