# Working on a shared design

Run `penpair onboard` (or `--json`) in the project for a checklist generated from its configured origin and pinned file. It works offline and does not load adapters. The owner invites each colleague's own account to the shared file. Each person creates their own MCP key, runs `penpair connect`, opens the pinned file and connects the MCP plugin. Share configuration and the file pin through Git; keep personal keys and `.penpair/` recovery evidence private.

A direct file link is included when the pin is known. If Penpot needs team context, use the owner's complete editor link and confirm the file ID with doctor. A Docker `localhost` origin is only reachable on that computer; colleagues need a shared deployment. Onboarding does not grant access or provision accounts.

## Coordinating writes

Journaled CLI archive/registered operations and adapter token pushes acquire an exclusive local file for this checkout and, when supported, a shared `penpair/writer` marker on the Penpot file. The marker contains a random ownership token, run ID, operation, username and times. Another active writer refuses the operation. Read-only inspection stays available. Independent readback confirms ownership after acquisition; every step checks it again. The marker expires after 15 minutes and a longer run stops before its next step. There is no background renewal.

Agree on a write window and keep the editor awake. A human can still edit. Penpot's [shared plugin-data API](https://doc.plugins.penpot.app/interfaces/File) supplies separate reads/writes rather than an atomic compare-and-swap, so this is advisory across machines. It cannot prevent two simultaneous acquisitions or act as a distributed mutex. The local lock protects this checkout, not other clones or computers. When shared methods are absent, the command warns and uses only the local lock.

A crashed local process can leave a lock behind. Inspect its run with `penpair runs <run-id>`, check the file, and coordinate with the named writer before explicitly adding `--force-lock --apply` to the original command. A still-running local process cannot be forced out. The override can replace a foreign shared marker or abandoned local lock; it is not a safe way to interrupt someone. Simultaneous forced takeovers have no exclusion guarantee. Malformed shared marker data requires manual inspection; force does not silently discard it.

Revisions are checked inside each journaled operation mutation. Archive also rechecks candidate IDs and geometry. Adapter pushes compare the CLI's source snapshot before planning and recheck the just-inspected token state inside each mutation. These guards detect stale input but do not make a multi-step build transactional. Known self-writes, including checkpoint and marker creation, occur before subsequent revision observations. Custom snippet authors must verify their own relevant content preconditions as well.

Direct library calls that omit journal options, native checkpoint helpers invoked separately, and the explicitly destructive scratch deep probe do not acquire the journal's writer lease. Coordinate those manually. No live two-editor trial has been run for this change. See [recovery](recovery.md) after an uncertain write; do not automatically roll back intervening work.
