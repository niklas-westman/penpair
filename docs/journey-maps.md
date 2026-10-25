# Journey maps

A journey map records what a person is trying to accomplish, which states they
encounter, and the decisions still needed before implementation. It is a
project-owned contract that later agents can read without recovering earlier
chats. Use an [integration map](integration-maps.md) to connect the journey to
application structure, and a [design release](design-releases.md) to freeze a
reviewed design handoff.

## Local commands

```sh
penpair journey-map check --from design/journeys/reset-password/map.json
penpair journey-map render --from design/journeys/reset-password/map.json --out design/journeys/reset-password/rendered
penpair journey-map context --from design/journeys/reset-password/map.json --out design/journeys/reset-password/context.json
```

Use your project's local command, such as `pnpm exec penpair`, when installed as
an application dependency. Rendering with `--out` writes local derived artifacts;
it does not publish into Penpot. Context is intended for reviewed inputs; drafts
must be explicit and cannot imply readiness.

## Start from observed intent

Inspect the actual frames and existing application before drafting. Record the
user goal, entry points, successful outcome, alternate paths and recovery. Use
stable requirement and node IDs so a finding can refer to the same requirement
through review and implementation. A frame establishes visible design facts;
it does not establish what a button does, how an API behaves or how keyboard
focus moves.

Every node, edge and requirement declares its origin:

| Origin | Meaning |
| --- | --- |
| `observed` | Directly supported by the referenced design, code or evidence |
| `proposed` | An AI or designer recommendation awaiting a decision |
| `owner-decision` | A decision actually supplied by the owner |
| `unknown` | Missing information; retain it as a question |

An origin is provenance, not approval. In particular, an `owner-decision` label
cannot replace a review record binding the owner's actual words to the exact
contract hash. Do not turn guesses into observations or invent approval notes.

## Keep the flow readable

Use short, specific node titles (`label`), optional one-line `summary` and longer
`description` text for evidence, decisions and unknowns. The map itself also
accepts optional `summary` and `description`. Origin badges distinguish observed
facts from proposals without repeating that status in every title. Optional
semantic `icon` values use fixed native vectors. Full notes remain available
below the flow and in Markdown/context; legacy contracts need no new fields.
See [titles and descriptions](integration-maps.md#readable-titles-and-descriptions).
These optional fields are part of reviewed canonical intent, so changing them
needs renewed approval.

## Contract and review

The schema-1 JSON contract contains `kind: "journey-map"`, `id`, `title`, `goal`,
`sources`, `nodes`, `edges`, `requirements` and `findings`. Sources retain their
SHA-256 and available path/file/page/frame/revision identity. Nodes and edges
carry readable labels and stable IDs; requirement links connect them to the
intended outcomes. Open blocking findings keep readiness pending. Resolving a
finding requires an explicit resolution, rather than deleting its history.

The `journey-map` command family supports checking, rendering, publishing,
importing managed edits as proposals, accepting proposals, recording supplied
approval, and producing bounded context. Consult the installed command's help
for arguments. Checking and rendering locally do not approve or publish a map.
Native publication is a Penpot write and needs the normal inspection, pinned
snapshot, one idempotent write, independent readback and inspected stable export.
Check the exported typeface against the canvas: a font available to the editor
can still be unavailable to its exporter. Correct font metadata and identical
consecutive exports do not prove font fidelity. Visible font substitution needs
correction before visual approval.

The contract is authoritative; Mermaid and native Penpot objects are derived
views. Managed native edits become a proposal against the exact prior contract
hash. Review the diff and accept it explicitly before regenerating dependent
views. A changed label or connector must not silently rewrite accepted intent.
An old proposal cannot overwrite a newer contract.

Owner review is a separate `artifact-review` record containing the artifact
identity, exact hash, supplied words, identity, date and record hash. Review is
not authenticated identity. Changed contracts or source hashes need fresh review;
matching saved inputs do not prove the live file is unchanged.

## Review gates

1. **Intent ready:** the goal, success/recovery paths, evidence and unknowns are
   explicit. Blocking questions are answered or remain visibly blocking.
2. **Contract reviewed:** the owner reviewed the exact map and supporting
   decisions. Technical checks and a neat diagram do not supply acceptance.
3. **Handoff ready:** the integration map references this exact journey hash,
   required design cases exist, and outstanding implementation work is explicit.

## Reset-password example

The [worked example](../examples/design-release-maps/README.md) describes an
illustrative reset flow. An observed confirmation frame is distinct from a
proposed submission transition and an unknown expiry policy. The example is
unapproved and contains no fabricated inspection or owner evidence.

Keep loading, empty, error and success states proportionate to the feature.
Capture keyboard entry, focus movement, error announcements and responsive
behavior as explicit requirements or unknowns. The map does not establish that
any of these behaviors has been implemented or tested.

Contracts are bounded to 16 MiB, 1,000 nodes and 2,000 edges. Context has a
128 KiB limit and reports omissions explicitly. Source paths remain inside the
project. Labels and descriptions are escaped literal data in generated views.

Every local requirement must be connected through node/edge `requirementIds`.
A readable graph with unmapped requirements remains incomplete for readiness.
Drawing plans also refuse complete native publication above a 16,384 px axis or
64 KiB serialized plan size; split large maps into reviewable parts. Semantic
native imports retain a bound adjacent `.native.json` observation and require
fresh live readback during acceptance. Pure geometry changes instead produce a
presentation proposal, preserve canonical intent and require fresh visual review.

For explicit decomposition, use [linked detail maps](integration-maps.md#linked-detail-maps).
Journey details remain journey contracts, with independent publication and review;
parent approval does not cover a child map automatically.

## Publication recovery

After an uncertain write, inspect the actual target and retained run first. Resume
the original journal explicitly, keeping the original contract, sources and
target flags (including whether `--board-id` was omitted):

```sh
penpair journey-map publish --from design/journeys/reset-password/map.json \
  --page-id PAGE_ID --apply --resume RUN_ID
```

Use the original `--board-id` and `--projection` options if they were supplied.
Resume independently reconciles readback and exports; it does not blindly repeat
the write. Changed input or code signatures must refuse reuse. Inspect again and
start a new explicitly authorized run when needed; do not bypass those guards.
