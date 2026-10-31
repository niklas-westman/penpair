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
