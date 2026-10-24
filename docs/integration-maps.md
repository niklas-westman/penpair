# Integration maps

An integration map links a reviewed user journey to the screens, routes,
components, state, data and verification work needed to implement it. It gives
agents a shared project record of what the solution must present and what the
current implementation actually presents.

Start with the [journey map](journey-maps.md) and complete [design evidence](handoff.md).
Inspect existing code before proposing new modules. Reuse project architecture;
a visual frame does not justify inventing a backend or component framework.

## Local commands

```sh
penpair integration-map check --from design/integrations/reset-password/map.json
penpair integration-map render --from design/integrations/reset-password/map.json --out design/integrations/reset-password/rendered
penpair integration-map context --from design/integrations/reset-password/map.json --out design/integrations/reset-password/context.json
```

Use the local project command when installed as a dependency. Add `--live` to a
check only when an explicit fresh Penpot observation is needed; ordinary saved
input validation does not establish current live freshness.

## Record the gaps before building

Use stable requirements and connect each to relevant design cases, proposed or
existing code responsibilities, data contracts and verification evidence. Mark
claims `observed`, `proposed`, `owner-decision` or `unknown`. Distinguish visible
screen state from inferred behavior, and application intent from observed code.
Keep unresolved component identity, API behavior and accessibility semantics
explicit.

| Requirement | Design observation | Implementation observation | Finding and next action |
| --- | --- | --- | --- |
| `reset-error-retry` | Illustrative design has a retryable error with the address retained | Hypothetical implementation clears the address after a failed request | Blocking: the person must retype their address. Preserve the value and verify the failed-request/retry path; this example is not observed project evidence. |

Compare both directions: intended requirements without implementation, and
implemented behavior without an agreed rationale. Link concrete source/evidence
rather than reporting that a diagram or passing build proves completeness.

## Contract, drawings and edits

A schema-1 `integration-map` contract uses the same sources, nodes, edges,
requirements and findings as a journey contract. Its `journey` reference binds the
project-relative path and exact SHA-256 of its journey map. Component mapping
still requires exact source identities as described in [handoff](handoff.md);
familiar labels are insufficient.

The `integration-map` command family checks a contract, renders derived diagrams,
publishes managed native objects, imports native edits as a reviewable proposal,
accepts a proposal, records supplied owner review and emits bounded context.
Read installed help for exact arguments. Do not equate `accept` of an edit
proposal with owner `approve`, image approval or implementation acceptance.

Canonical JSON is authoritative. Mermaid, drawing plans and native Penpot boards
are derived views tied to its hash. A managed Penpot edit must become a proposal
against that hash; inspect the changes before accepting them. Unmanaged shapes
and ambiguous identities are not automatic contract edits. Publishing and
updating native drawings follow the full Penpot write protocol.

Semantic native import writes both the canonical proposal and a bound adjacent
`<proposal>.native.json` observation. Preserve both. Native acceptance rechecks
the live observation read-only before changing the canonical contract and saved
baseline; afterward republish explicitly to update native contract metadata.
A purely local semantic proposal without native observation can be accepted
offline. If canonical acceptance succeeded but saving the projection failed,
reconcile with the same proposal rather than blindly publishing again.

Geometry-only edits use a separate `map-presentation-proposal`. Acceptance checks
the exact canonical hash, saved baseline and current observed projection, captures
fresh stable evidence and adopts presentation without changing canonical bytes.
Renew native visual review: old review does not automatically cover new render
evidence. Future publication preserves accepted node positions and sizes.
Unsupported style/ownership changes and unmanaged objects remain conflicts.

Use clear typography, short labels and a neutral diagram theme. The diagram's
font defaults to Inter; an explicit presentation override belongs to the map.
Diagram presentation must not modify the application's tokens or theme.

## Linked detail maps

Decompose oversized maps explicitly; Penpair does not automatically partition a
contract. Give each detail map its own canonical contract, native publication
and owner review. In the parent, a `kind: "detail-link"` node references exactly
one `sourceId`: that source must have `kind: "contract"`, a project-relative
`path`, the raw file-byte `sha256`, and exact `fileId`, `pageId` and `frameId` of
the published detail board in the same pinned file. This source byte hash is
distinct from the canonical hash used by a journey reference.

The linked child must have the same map kind as the parent. The link covers at
least one parent requirement through `requirementIds`, and the child retains
all those requirement IDs. Generated Markdown links to the contract; the native
card uses a `NavigateTo` interaction to its declared board. Missing/stale source
bytes or incompatible child requirements prevent readiness.

Parent context identifies the child handoff and its independent review rather
than inlining the child graph. Later agents must read that child contract too.
Include every parent and linked detail contract in the design release with its
own exact review. Publishing or approving the parent does not publish or approve
its detail maps.

## Implementation context

A context result should identify the exact map and journey, review/freshness,
open findings, requirements and linked source evidence. Bounded or truncated
context must say so; missing evidence remains pending. Freshness against supplied
saved files does not assert live Penpot freshness or functional correctness.

Later agents should:

1. Read the current map context and linked sources before implementing.
2. Surface stale inputs and blocking findings before relying on approval.
3. Implement within the reviewed scope; propose changes to intent separately.
4. Attach actual route/state, browser and behavior evidence to the project record.
5. Reconcile findings and seek implementation acceptance independently.

Use [Reflection Check](adapters.md#check-the-frontend-against-the-design) for actual
browser comparisons. It supplies visual evidence; behavior and accessibility
need their own checks. A low pixel difference does not approve architecture or
prove a working recovery flow.

## Design readiness and implementation readiness

A [design release](design-releases.md) can finalize a reviewed, internally
consistent design package while implementation is still `not-assessed`. That
separation is intentional: agents need stable approved design context before
they build. Never mark implementation accepted because a map was approved.

See the [worked reset-password example](../examples/design-release-maps/README.md)
for a proposed journey and integration map with visible unknowns.

Every local requirement must appear in a node or edge's `requirementIds`, and an
integration map retains all requirement IDs from its linked journey. Omitted
coverage prevents readiness and design finalization; drafts can still be checked
and rendered. Drawing plans explicitly become incomplete above a 16,384 px axis
or 64 KiB serialized plan budget. Split the map instead of publishing clipped
content.

## Publication recovery

After an uncertain write, inspect the actual target and retained run first. Resume
the original journal explicitly, keeping the original contract, sources and
target flags (including whether `--board-id` was omitted):

```sh
penpair integration-map publish --from design/integrations/reset-password/map.json \
  --page-id PAGE_ID --apply --resume RUN_ID
```

Use the original `--board-id` and `--projection` options if they were supplied.
Resume independently reconciles readback and exports; it does not blindly repeat
the write. Changed input or code signatures must refuse reuse. Inspect again and
start a new explicitly authorized run when needed; do not bypass those guards.
