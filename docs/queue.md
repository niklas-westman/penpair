# Job queue

`penpair queue run jobs.json` runs an ordered list of `run-file --apply` jobs, one at a time, so one writer holds the file. It replaces shell loops, `pgrep` checks and hand-written monitors.

```json
{
  "version": 1,
  "retries": 2,
  "backoffMs": 5000,
  "wake": { "debugPort": 9222 },
  "stopOnFailure": false,
  "jobs": [
    {
      "id": "login-desktop",
      "file": "design/build-login.js",
      "inspect": "design/inspect-login.js",
      "readback": "design/readback-login.js",
      "page": "Candidate",
      "params": { "frame": "Login / desktop" },
      "include": ["design/kit.js"],
      "stages": 5
    }
  ]
}
```

A job takes the `run-file` options: `file`, `inspect`, `readback` (required), `page`, `params` (strings, numbers, booleans), `include`, `stages`, `layoutRoots`, `layoutScope` and `layoutMaxNodes`. Paths are relative to the project. Unknown keys, duplicate ids and unusable values refuse before anything runs. Every job is journaled like a hand-typed `run-file --apply`, so `penpair runs RUN_ID` shows its stages and evidence.

## Status

Each state change is saved to `.penpair/queues/QUEUE_ID.json` (private, git-ignored) and printed to stderr as one line per event, for example `queue q-20261028-1a2b: job 3 of 19 "login-desktop": running (attempt 1 of 3)` and `… ok in 41.2 s, run abc`. States are `queued`, `running`, `ok`, `already-satisfied`, `failed` and `uncertain`. `penpair queue status [QUEUE_ID]` lists queues or shows one, offline. The final JSON summary goes to stdout.

Exit code: 0 when every job is `ok` or `already-satisfied`, 4 when a job is `uncertain` (inspect its run), otherwise 1.

## Retries and recovery

Only failures that did not decide the job are retried, up to `retries` times with `backoffMs × attempt` between them:

- An **uncertain or incomplete run** is resumed from its journal (`--apply --resume RUN_ID`), never started again, so a write is not replayed.
- A **lost editor connection** (`No Penpot instance connected`, a deadline in `doctor`, MCP unavailable) runs `wake --debug-port` first when the queue file names `wake.debugPort`, then retries. Without a debug port the queue only waits and retries.
- A **failed verification**, a held writer lock or an invalid script is not retried. The job is `failed` with the reason and the queue goes on (or stops, with `stopOnFailure` or `--stop-on-failure`).

`penpair queue run jobs.json --resume QUEUE_ID` continues a queue after a crash or a stop: finished jobs are skipped, an uncertain job resumes its run, other jobs start again. The queue file must be unchanged since it started.

A queue does not make a multi-job batch transactional. Each job is its own journaled write; there is no rollback across jobs. A queue is not a lock: do not start a second queue or hand-run writes against the same file while one runs.

For one heavy frame, start with [staged runs](run-file.md#staged-runs); use a queue to sequence multiple builds. Each queue job can also use stages.
