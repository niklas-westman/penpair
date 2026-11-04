# Copy native boards between pages

`penpair design-release copy` is an experimental native-editor transfer within
the project's pinned Penpot file. It copies selected boards to
`release/<version>`, leaves their originals in place and independently captures
source and destination evidence. It uses the browser's native clipboard rather
than trying to move a plugin shape proxy between pages.

This is a page-copy operation, not a complete design-release assembly or owner
approval. It produces a private transfer receipt, not a fabricated
`release.json`. The stricter [design release verification](design-releases.md)
requirements still apply before a full release can be finalized.

## Prerequisites and preview

Use the reviewed project installation, with a valid configuration, an
owner-confirmed file pin and a connected responsive Penpot plugin. Choose one
source page and 1–100 distinct board IDs from that page. IDs must identify boards,
not arbitrary shapes; selecting a board together with its descendant board is
refused. Boards nested in sections can be selected by their IDs.
The PoC bounds each observed page to 20,000 nodes and the native clipboard
payload to 16 MiB; exceeding either limit stops the transfer.

```sh
# Replace these board IDs and page name with observed source identities.
penpair design-release copy --source-page "Screens" \
  --frame SOURCE_BOARD_ID --frame ANOTHER_BOARD_ID --release 1.2.0
```

Preview resolves the source and destination, inventories existing content and
reports the planned selection. It does not create a page, alter selection or
use the clipboard. The destination is always `release/1.2.0` in the same pinned
file; this command does not copy between files or deployments.

A unique existing destination can be reused without replacing its content.
Missing destinations are created on apply. Ambiguous page names, finalized
release ownership and conflicting ownership markers are refused. New copies
are arranged separately from existing destination content; existing frames are
not moved or normalized.

## Apply through the native editor

Review the preview and authorize the actual transfer before applying:

```sh
penpair design-release copy --source-page "Screens" \
  --frame SOURCE_BOARD_ID --frame ANOTHER_BOARD_ID --release 1.2.0 \
  --debug-port 9222 --apply
```

The browser must already expose a loopback debugging port. See
[browser setup and recovery](browser-sessions.md) for an isolated-profile example.
Clipboard APIs also require a secure browser context, normally HTTPS or local
loopback HTTP. See the browser vendor's [clipboard access guidance](https://web.dev/articles/async-clipboard).
Penpair adds no browser dependency or browser download and does not start a
managed session. It verifies the browser origin and pinned file; configured local
instances may use the equivalent `localhost`/`127.0.0.1` HTTP origin on the same
port. Hosted deployments require the exact configured origin.

The bundled transport also requires the browser's existing clipboard read/write
capability for that editor. Penpair does not grant clipboard permissions. If the
capability is unavailable, denied or waiting for a browser prompt, the operation
fails closed before paste. Complete any intended browser permission decision
separately; a debugging connection alone does not establish clipboard access.

Applying changes page and board selection, foregrounds the editor and dispatches
native Copy/Paste. The Penpot canvas must have focus, with no text field,
content-editable region, plugin iframe or dialog focused. Penpair refuses unsafe
focus instead of sending shortcuts into another control. This replaces the
system clipboard contents; previous clipboard contents are not automatically
restored. Avoid using the clipboard or changing editor focus during the transfer.
A local clipboard lease excludes cooperating Penpair sessions, not unrelated
applications or manual actions.

Before dispatching Copy, the transport clears the clipboard to a unique sentinel.
It then waits for an actual native Penpot JSON/verbose-Transit payload matching
the pinned file and selected board UUIDs. Validation and SHA-256 calculation run
inside the browser; the bundled transport does not return, log or persist raw
clipboard contents. Immediately before Paste it revalidates the payload digest.
Missing, stale, unrelated or changed clipboard data prevents paste rather than
reusing whatever was previously on the clipboard. Clearing the clipboard can
therefore replace its contents even when the transfer subsequently stops.

The command captures source inspections and one render per frame, prepares the
same-file destination, fences one native paste attempt, identifies the new
boards and arranges only those copies. Independent readback checks the copied
boards and the unchanged originals. It records structural findings and decoded
pixel comparisons. A pair whose single renders differ beyond the tolerance is
rendered again with two identical renders on both sides; the result's `render`
field lists which pairs needed that. Review the saved source/target exports visually as part of
acceptance; a technical result does not supply human approval.

## Faster verification with a personal access token

Reading every shape through the editor plugin is the slow part of a copy: for 14 heavy
frames it took about 130 s of a 339 s run. With a Penpot personal access token
(Profile, Access tokens), `design-release copy` reads the stored data from the Penpot
backend instead: one request per page, about 1.5 s for a page of 1000 shapes.

```sh
# In the shell, or as a line in the git-ignored .env.local of the project:
export PENPAIR_PAT_TOKEN=...      # never paste it into chat or commit it
penpair design-release copy ... --debug-port 9222 --apply
```

- The token is optional. Without it the plugin route is used, as before, and the
  result says `evidence: "plugin"`. `--evidence backend` refuses to run without a token,
  `--evidence plugin` ignores it.
- The backend is only read. The copy itself is still the editor's own paste, and the
  token is redacted from every output and receipt.
- Every attribute of every shape is compared, including component references and which
  properties are overridden, which the plugin cannot see. The `caveats` entry about
  component instances does not appear on this route.
- Pixels are a second check over every pair. `--verify-pixels all` (default) renders each
  copy and its original once and renders again, settled, only a pair that differs; the
  stored data proves geometry, text and styling, the pixels show fonts, images and effects as
  Penpot draws them. `sample` renders only the first, the last and the largest pair, and
  `none` skips rendering and leaves `pixelsMatch` out. The receipt says what was and was
  not compared.
- A few localised pixels may differ even when the stored data is identical: hairline
  strokes (zero-height lines with a stroke) are rounded differently when rasterised.
  Up to 0.05 % of a frame's pixels is accepted then and listed in `pixels.differences`
  as `localized-with-identical-data`. Without identical data the stricter limit applies.
- The editor saves to the backend a little later than it shows a change. The tool waits
  up to 90 s for the pasted and the arranged boards to appear (measured 12 to 15 s for
  19 frames; `backendWaitMs` in the result).
- 14 heavy frames: about 100 s in total, instead of 339 s on the plugin route. This is an
  internal Penpot API; the version is pinned like the rest of Penpair.

## Results and recovery

The result includes a `runId`, source/target board pairs, `nativeVerified`,
`pixelsMatch`, problems and a receipt path:

```text
.penpair/native-copy/<run-id>/receipt.json
```

The receipt and its referenced inspections/exports are private operation evidence.
A successful fully verified transfer reports `status: "copied"`; missing native
proof or a pixel mismatch can leave `status: "incomplete"` and exit 3 even when
boards already exist in the destination. Read the findings before doing anything
else. Existing verification limits remain strict: component overrides, masks,
paths, mixed text styles and other unobserved native fields cannot be accepted
merely because exported pixels match.

Do not rerun a fresh apply to recover a lost response. Inspect the journal and
destination independently, then use the original inputs and run ID:

```sh
penpair runs RUN_ID
penpair design-release copy --source-page "Screens" \
  --frame SOURCE_BOARD_ID --frame ANOTHER_BOARD_ID --release 1.2.0 \
  --debug-port 9222 --resume RUN_ID --apply
```

Resume reconciles the observed destination against the original transfer. A
paste-attempt fence prevents blind replay after an uncertain paste. Changed
inputs, changed originals or an ambiguous destination require explicit
reconciliation; neither resume nor browser activation promises rollback.

### Symptoms, causes and fixes

Learned on Penpot 2.18/2.19 (design.penpot.app), November 2026. Find the row that matches
the message before retrying; most of these looked like permission or timeout problems and
were not.

| You see | Actual cause | What to do |
| --- | --- | --- |
| `This operation was aborted`, or `Native clipboard session deadline of N ms exceeded`, with the clipboard already holding `copied-shapes` | Penpot 2.18+ wraps each copied shape in a Transit `~#shape` tag and an older validator rejected the payload forever. Fixed in 0.10.1. | Upgrade. To confirm on any version run with `--diagnose`: polls reporting `validated:false` with `head` starting `{"~:type":"~:copied-shapes"` mean the copy worked and the validator is wrong. |
| `Browser clipboard read permission is required` | Permission can be fine. A read also fails with `NotAllowedError: Document is not focused` when the tab has no OS focus. | `--diagnose` prints `clipboardRead` (permission) and `read.errorMessage` (focus) separately. Bring the tab forward; the tool now waits 0.5 s for focus. |
| `The editor tab lost focus while waiting` | Focus was taken during the copy. | Keep the window in front until the copy finishes, then run again. |
| `MCP error -32001: Request timed out` after the paste | A paste of many heavy boards keeps the editor busy longer than the 120 s request limit. The paste itself usually succeeded. | Do not paste again. Check the destination page, then `--resume RUN_ID --apply` with the original inputs. 0.10.1 waits this out by itself. |
| `File revision changed during step inspection` or `Inspection cursor is stale` | The file revision moved while a long capture was running (autosave, another person or tab). | The revision is stable when idle. Wait a minute and `--resume` again. |
| `Command deadline exceeded` during verification | Verifying about 14 heavy frames takes more than 9 minutes. | Pass a larger `--timeout-ms` (maximum 1800000). Resume never pastes again. |
| `Another writer is running design-release-copy` after a cancelled run | The shared writer marker in the file lasts 15 minutes. 0.10.1 releases it on cancel; earlier versions left it. | Wait for it to expire, or coordinate and use `--force-lock` only if nobody else is writing. |
| `Native fidelity ...: Native board sizing / constraints / Mask / path content / Component override ... unobservable`, or `Native copy changed text, hierarchy, layout, geometry ...` on a copy that looks identical | Strict checks written before Penpot's real values were known: boards report `fill`, shapes inside groups or auto layouts report null constraints, sizes carry float noise (`1193.9999999999995`), moved paths carry float32 noise (`246.00009`). All handled in 0.10.1. | Upgrade. If a new value still blocks a real copy, compare `source/frame-N.json` and the newest `target-*/frame-N.json` under `.penpair/native-copy/RUN_ID/` offline with `semanticInspection`; it names the field. |
| `status: incomplete` with only `Exported pixels differ` | Pasted vectors can differ by a few anti-aliased pixels. A frame within 0.05 % of its pixels and 16 per channel counts as matching; `pixelDifferences` in the receipt lists every measured frame. | Look at the listed counts. Larger differences are real. |
| `incomplete` with many `width differs`, `selrect differs` and similar lines, and a `diagnosis` saying only sizes and positions differ | Penpot recomputes automatic layouts while pasting. A source whose stored sizes no longer match its own layout (buttons clipped in its render, text boxes too narrow) is copied with the recomputed sizes. Seen on the Teams and access page: 245 shapes, and copying the copy again was identical. | Look at the source's render. If the copy is the correct one, copy the copy (or refresh the source's layout in Penpot and copy again) to confirm it is stable. Do not accept the result without looking. |
| `Reading page ... from the Penpot backend failed` or `did not show the expected shapes` | The token is missing, expired or refused (`access-token-rejected`), or the editor had not saved yet. | Create a new token under Profile, Access tokens, or remove `PENPAIR_PAT_TOKEN` to use the plugin route. A run that stopped here is `uncertain`: `--resume` it, never paste again. |
| A `MCP error -32001: Request timed out` before the paste, right after the page was created | The editor is busy after creating the page. Reads before the paste now ask again for up to 80 s. | Nothing to do with this version; on older ones `--abandon` the run (no paste fence) and repeat. |
| `export: http error` on a many-frame render, or a very slow verification | Penpot refuses answers of a few megabytes, and a heavy page renders about 5 s per frame. 0.10.1 renders and inspects concurrently, halves a group that is refused, and shows why a frame fell back with `PENPAIR_TRACE_EXPORT=1`. | Nothing to do; use the trace if a run is slower than about 30 s per 4 frames. |
| `Copy run ... already covers this transfer or requires reconciliation` | An earlier journal for the same file did not verify, or the same request already completed. | A run that never pasted no longer blocks (0.10.1). Otherwise `--resume` it, or `--abandon RUN_ID --reason TEXT` if no paste was dispatched. Never move `.penpair/runs/*.json` by hand. |

How the cause was found, for the next problem like this: add observation before
theorising. A timestamped trace of every poll (length, first bytes, error name and
message) separated four hypotheses in one run, and the answer was none of the four.
Read the real clipboard payload, then read the validator that rejected it.

### Diagnosing and abandoning

When a copy fails or stalls, look before retrying:

```sh
# Read-only: tab focus, clipboard permission and readability. Changes nothing.
penpair design-release copy --diagnose --debug-port 9222
# With --apply, adds a timestamped trace of every clipboard stage on stderr.
penpair design-release copy ... --debug-port 9222 --apply --diagnose
```

A run that failed before any paste (no paste-attempt fence) never changed the
destination and no longer blocks the next copy. To close it on the record:

```sh
penpair design-release copy --abandon RUN_ID --reason "why it was dropped"
```

Abandon refuses a run whose paste was dispatched; reconcile that one with
`--resume`, or, once you have inspected what was pasted, close it with
`--abandon RUN_ID --reason TEXT --destination-inspected`. A new engine version
cannot resume an older run (its plan hash differs), so this is also the way to
close runs left over from an upgrade.

The transfer receipt is not the receipt-list schema consumed by
`design-release verify --receipts`. Do not rename it to `release.json` or pass it
as an approved release. Full release plans, maps, source evidence, native-copy
mapping and exact owner reviews remain separate requirements. Compatibility
between copy-created page ownership and the full assembly workflow must be
validated before treating a copied page as an assembled release.

## MCP discovery

The typed `design_release_copy` tool appears only when the project's Penpair
stdio server starts with `--allow-writes`. Its inputs are `sourcePage`,
`frameIds`, `releaseVersion`, optional `debugPort`, `apply`, `resume`, and, with
apply, `evidence` and `verifyPixels`. Preview is the default; apply requires
`debugPort`, and resume requires apply. A second tool, `design_release_copy_recover`,
runs `--diagnose` and `--abandon` for a host that has no terminal; see
[Recovering a copy](mcp.md#recovering-a-copy). The copy tool may run for up to 30
minutes (a copy takes minutes) and reports progress to clients that ask. The tool
returns the same operation result and keeps the same target/recovery safeguards.
It does not expose raw page code. See [MCP tools](mcp.md).

## Using from Claude or other hosts

The standard copy route is host-neutral: an assistant can invoke the installed
CLI or call the typed Penpair MCP tool. It requires the configured project,
owner-confirmed file pin and responsive plugin connection described above. Apply
also requires a debugging-enabled browser on the same computer as the Penpair
process, the explicit debugging port and existing clipboard read/write access.
These are the same prerequisites in Claude, Codex and other CLI/MCP-capable hosts.

Claude does not need an additional computer-control integration for the standard
CDP route. Register the reviewed Penpair executable with `--allow-writes` to expose
`design_release_copy`, or use the CLI directly. Preview first; tool visibility
alone neither applies the copy nor grants browser permissions. See the
[Claude registration example](mcp.md#client-registration).

The native-UI keyboard driver used in the trial below was an injected test
driver, not a public CLI/MCP fallback supplied to Claude or other hosts. That
trial establishes the core-service proof described below; qualification of the
bundled CDP clipboard path against Penpot remains pending. Installing Penpair or
adding host computer controls does not turn that pending qualification into a
passing result.

## Evidence and API boundary

The hardened bundled CDP transport has not passed end-to-end browser
qualification. In a disposable unauthenticated Brave fixture, it stopped while
awaiting clipboard read access and dispatched no paste. Earlier shortcut-only
fixture results do not establish that the current payload-validation path works
end to end. A separate native-UI experiment also does not qualify the bundled
CDP transport or provide a public CLI fallback.

An owner-authorized hosted Penpot trial on 25 October 2026 copied two synthetic
240 × 160 boards with simple rectangle/ellipse children into a disposable release
page. It used an injected native-UI keyboard driver through the same core copy
service because that existing browser profile had no debugging port. The actual
JSON/verbose-Transit clipboard payload was checked locally against the pinned
file, selected board identities and digest before one paste; arranging the new
copies was a separate idempotent step. Independent inspection/native-fidelity
comparison and decoded RGBA pixel hashes passed for both boards, with four mapped
nodes. Source and copied stable PNG exports were visually inspected.

The original trial run then completed explicit resume with `status: "copied"`,
`nativeVerified: true`, `pixelsMatch: true` and no problems. The copies were
arranged, the original source hashes remained unchanged, the receipt was saved
and the journal reached `verified`. Revision drift had safely interrupted the
first final capture; bounded read-only recapture and reconciliation completed
verification without another Copy or Paste dispatch.

This establishes the limited native-UI/core-service proof of concept. End-to-end
Penpot qualification of the bundled CDP clipboard transport remains pending;
the native-UI result does not establish that qualification or record owner
approval. Unsupported content remains incomplete. Full release assembly adoption
is not implemented by this transfer proof of concept.

The direct plugin API limitation remains: a disposable two-page trial on local
Penpot 2.18.3 tested a board with one rectangle child. `clone()` remained on the
source page, and cross-page `appendChild`/`insertChild` attempts failed with
`Cannot modify a page that is not currently active`. Independent readback found
the originals unchanged and no destination children. The native clipboard route
avoids that unsupported operation; it does not make cross-page reparenting safe.

The [upstream shape implementation](https://github.com/penpot/penpot/blob/develop/frontend/src/app/plugins/shape.cljs)
checks active-page ownership. The [Board API](https://doc.plugins.penpot.app/interfaces/Board)
provides cloning and reparenting, but no cross-page transfer operation. Penpair
does not patch proxy internals, reconstruct the design from screenshots or
submit unauthenticated raw backend file changes as a fallback.
