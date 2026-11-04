# Release status and recovery

Use `design-release status --from RELEASE_FILE` as the entry point. Its reported
step and blockers describe the next valid work; a persisted lifecycle label is
historical state. Offline checks verify saved evidence only. `--live` adds current
Penpot observations and must report connection failures or missing proof rather
than silently falling back to offline freshness.

## Interpret the evidence

| Observation | Required response |
| --- | --- |
| Base record or approval is missing | Keep planning/adoption incomplete; identify the missing exact artifact or review. |
| Draft assembly is interrupted | Inspect the journal, current destination and pinned inputs before proposing recovery. |
| Assembly parent journal is verified but a map journal is failed or absent | Treat assembly as partial; inspect the child `publish-map` journal and read back Penpot before any resume. |
| Retained frame blocked: capture environment unknown (Penpot sandbox hides the browser) | Strict rule stays. Offer the opt-in `penpot-native-export-v1` capture policy, which needs fresh owner approval; never promote older approvals. |
| Transfer succeeded but fidelity is unknown | Verify native structure and stable source/target exports; do not advance on acknowledgment. |
| Retained frame changed or disappeared | Block readiness; preserve the earlier finalized record and diagnose source drift. |
| Candidate verified but review missing | Present the exact candidate for the missing review; do not synthesize owner words. |
| Finalized design has later drift | Preserve finalized history and report current invalidity; prepare a new reviewed generation. |
| Design is final but browser work is missing | Hand off implementation; do not reopen or rewrite the design to fit the app. |
| Returned browser cases pass but some are pending | Report implementation comparison incomplete. |

## Native copy results and runs

Read `design-release copy --apply` results before moving on. Everything here is a
fact the result or the journal states; none of it approves a release.

| You see | Meaning and next step |
| --- | --- |
| `status: "copied"`, `evidence: "backend"` | Structure was compared on Penpot's stored data and pixels as `pixels.mode` says. `pixels.notCompared` is what was not rendered. |
| `evidence: "plugin"` with `caveats` | No access token: structure was read through the editor and component overrides were not compared. Say so when reporting. |
| `alreadyCopied: { runId }` | This exact transfer was verified earlier and is still in place; nothing was pasted. Report it as already done. |
| `status: "incomplete"` with a `diagnosis` | Only sizes and positions differ: Penpot recomputed an automatic layout while pasting. Look at the source's render and ask the owner; copying the copy confirms stability. Never accept silently. |
| `status: "incomplete"` with other `problems` | A real difference. Read the named shape and attribute; do not retry the paste. |
| `Copy run ... already covers this transfer or requires reconciliation` | An earlier run pasted and did not verify. `--resume RUN_ID --apply` with the same inputs, or after inspecting its destination page `--abandon RUN_ID --reason TEXT --destination-inspected`. |
| Anything stuck or unclear before a paste | `penpair design-release copy --diagnose --debug-port PORT` reads tab focus and clipboard state and changes nothing. |

Never delete `.penpair/runs/*.json` by hand, and never paste again to "see if it works".
The troubleshooting table in the native copy guide maps messages to causes.

## Interrupted native operations

Keep the original run/journal identity. An early preparation run ID does not prove
that a journal, paste or resumable write exists. Inspect actual destination IDs
and reconcile any recorded receipt before retrying. Use a supported resume action
only when the journal exists and its pinned inputs still match. Do not start a
duplicate background transfer or infer a successful write from a lost response.

After an uncertain finalization, compare the immutable bundle, remote marker and
local pointer. Evidence is saved before the guarded marker; independent marker
readback precedes the finalized local pointer. These are separate operations,
not a transaction across local storage and Penpot. Let the CLI reconcile its
recorded state; never hand-edit a final pointer or approval to force progress.

If status cannot name an exact safe recovery command, report the missing journal,
input or observation and obtain it first. Owner authorization remains required
for writes outside the previously authorized scope.
