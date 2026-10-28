# Command results for scripts and tools

`--json` emits one schema-versioned stdout document for core commands and the bundled adapter. Human output remains available without it. This replaces earlier command-specific JSON roots: read `data.ok` and `data.checks` for doctor, and `data.valid` for config check. CLI progress and diagnostics go to stderr; diagnostics are also included in the result.

The outer schema is exported as `commandResultSchema`, with the TypeScript `CommandResult` type. It contains `schemaVersion: 1`, command name, outcome, phase, exit code, observed target IDs when available, run ID when available, command-owned `data`, human messages, warnings, structured errors with remedies, completeness and timings. An absent target is `null`, never inferred from a file name. Do not decide success from empty errors alone: check outcome, exitCode, completeness and the command's verification fields.

| Exit | Outcome | Meaning |
| --- | --- | --- |
| 0 | success | Command completed; an inspect/preview still does not mean it applied or visually approved a change. |
| 0 | already-satisfied | A write was not needed: its readback already held, so nothing was written (`run-file --apply`). The state is right, but this is not a successful write. |
| 1 | failed | Validation, connection, verification or command failure. Error codes distinguish configuration and transport problems. |
| 2 | drift | A valid comparison found differences or a stale snapshot. |
| 3 | incomplete | Required output is missing, truncated or unstable. |
| 4 | uncertain | A possible write lacks a confirmed outcome. Inspect the run before resuming. |
| 124 | deadline | The deadline interrupted work without a delivered write being classified uncertain. |
| 130 | cancelled | Cancellation interrupted work without a delivered write being classified uncertain. |

Tree JSON retains its truncation flag, and truncated tree output exits 3 in both formats. Baselines cannot pass with missing/unstable captures. A standalone unstable PNG export preserves its previous output and exits 3. Adapter status marks unavailable Penpot inspection incomplete instead of reporting a complete successful status.

Use `--timeout-ms <1..1800000>` for an overall CLI deadline. Each MCP request also retains a 120-second SDK timeout. SIGINT/SIGTERM abort requests and waits; SDK cancellation does not prove that plugin execution stopped. An interruption after a write was delivered therefore remains uncertain (4), with journal evidence retained. There is no forced rollback or detached background continuation. Synchronous extension code must cooperate; a JavaScript deadline cannot preempt a blocking synchronous module. Interactive setup/connect require a terminal, refuse JSON mode, and do not accept this deadline flag. Run doctor in JSON mode afterwards.

Library callers can use `runCommand(args, { signal })` to receive the same result without printing it; it enables command JSON data internally. The stdio MCP server uses this service boundary. Supply `runCommand(args, {root, signal})` for request-scoped projects; the process working directory remains unchanged. CLI calls default to the current project. Connection-specific redactors sanitize data, errors and diagnostic boundaries, including known bare key values. Never provide keys in arguments.

Adapters should write through `context.output.log/error/result` and reserve `context.log` for progress. `result(value)` sets their authoritative structured data. Existing third-party adapters that write directly to global console/process streams must migrate to this output contract; arbitrary imported code is not sandboxed or intercepted. Unsupported or ignored command flags are refused before execution, including write flags on read commands and invalid numeric budgets.

MCP transport accepts an executor envelope `{ result, log? }` in `structuredContent`, or the equivalent JSON text envelope for older servers. Structured content takes precedence and must validate; malformed structured data cannot fall back to a reassuring legacy text response. The SDK continues to handle its advertised schema checks. This is executor-envelope validation, not proof that an arbitrary snippet measured the state correctly. See the [MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

Explicit mode trials may use a separate cooperative ten-second restoration deadline after main-command cancellation. The command remains cancelled/uncertain where applicable; cleanup does not establish a successful measurement. See [mode verification](mode-verification.md).
