# Project-pinned stdio tools

```sh
penpair mcp --root /absolute/path/to/project
```

Use the project's reviewed local executable. Startup requires an absolute root, valid project config and owner-confirmed file pin. The server keeps that target for its lifetime and refuses a changed target until restart/review. Each call gets request-scoped root state; it never calls `process.chdir`. Even basic reads use strict same-execution file guards. Environment/project `.env.local` endpoint resolution remains available; unrelated global Codex/Claude endpoint fallback is disabled. Keep credentials in the private connection flow, outside client configuration examples.

Default tool names are `pages`, `tree`, `audit`, `inspect`, `tokens_dump`, `run_status`, `baselines_status`, `project_status`, `doctor`, `design_spec` and `export`. These cover bounded live inspection, offline run/baseline evidence, diagnostics, derived specs and stable export to a path inside the project. Export creates/replaces a local file and has a write annotation. There is no raw-code tool or unrestricted command forwarding. Each typed input is validated independently of the client schema. No Penpot write tool is advertised by default.

Explicit `--allow-writes` additionally advertises `run_registered` and `design_release_copy`. The first runs registered operations; the second provides the typed native-copy workflow described below. `run_registered` accepts a registered operation name and scalar parameters, defaults to inspection, and requires explicit `apply:true` for design writes. Explicit `resume` requires apply and the original journal; file/instance guards, local/shared advisory lease, same-execution preconditions, checkpoints supported by the underlying command, and independent readback remain in the same services. Registered modules execute trusted project code, including imports; they must keep stdout for MCP and log through the command context. This is not an execution sandbox. Adapter-specific commands remain available through the CLI; the neutral server does not guess library-specific tool schemas. `run_registered` passes only the operation name, scalar parameters, `apply`, `resume` and `checkpoint`, so it cannot pass `--layout-root`, `--layout-scope` or `--stages`: an operation driven over MCP is observed against the whole page. Drive a heavy staged build through the CLI (`run-file --stages`) instead.

## Native release-page copy

Start the reviewed project executable with write tools enabled only when those
operations are authorized:

```sh
penpair mcp --root /absolute/path/to/project --allow-writes
```

The `design_release_copy` tool previews by default. Example input, with observed
source board IDs substituted:

```json
{
  "sourcePage": "Screens",
  "frameIds": ["SOURCE_BOARD_ID", "ANOTHER_BOARD_ID"],
  "releaseVersion": "1.2.0",
  "apply": false
}
```

Explicit `apply: true` also requires `debugPort` (1–65535) for an already enabled
loopback browser debugging endpoint and existing clipboard read/write capability.
Penpair does not grant browser permissions; denied or unavailable access stops
before paste. `resume` requires apply and the original run ID/inputs. Copy uses the pinned file, preserves originals, and creates or appends
to `release/1.2.0`; it changes browser focus and selection and replaces the system
clipboard. The bundled transport clears stale data before Copy, validates the
native payload against the pinned file and selected boards inside the browser,
and rechecks its digest before Paste. Raw clipboard data is not returned, logged
or persisted by that transport. An uncertain paste is reconciled rather than
automatically replayed.
An incomplete native/pixel result is not a completed transfer or release
approval. See [native copy, evidence and recovery](copy-between-pages.md).

This tool is absent from the default server. There is no MCP `wake` tool: explicit
browser activation remains the CLI `penpair wake` command. Native browser/computer
controls supplied by an assistant host are separate tools and are not installed
or exposed by Penpair's server.

Requests return the version-1 CLI envelope as text plus structured content. Default cooperative deadline: 60 seconds; SDK cancellation propagates into the service. Arbitrary trusted code can ignore cancellation. A 256 KiB response cap returns an explicit incomplete envelope rather than apparently successful truncated data; uncertain writes retain their uncertain outcome/run ID. Use narrower inspection or CLI artifact output for larger evidence. Stdio has no HTTP listener or background polling.

## Tool annotations

Every advertised tool explicitly declares boolean `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint` values. These are advisory metadata; file guards, typed validation and write opt-in still enforce the boundaries.

| Tools | readOnlyHint | destructiveHint | idempotentHint | openWorldHint |
| --- | --- | --- | --- | --- |
| `run_status`, `baselines_status` (offline local evidence) | true | false | true | false |
| `pages`, `tree`, `audit`, `inspect`, `tokens_dump`, `project_status`, `doctor`, `design_spec` (may contact Penpot or its deployment) | true | false | true | true |
| `export` (creates or replaces a local image from live Penpot) | false | true | false | true |
| `run_registered` (opt-in trusted code, potentially mutating) | false | true | false | true |
| `design_release_copy` (opt-in native clipboard transfer) | false | false | false | true |

`export` can overwrite an existing artifact, so its destructive hint is true. It captures the current design, so callers must not assume repeated calls preserve the earlier image. `run_registered` retains conservative hints even when a particular invocation only previews: its metadata must cover the registered code's possible effects. `design_release_copy` preserves source boards and existing destination content, but is still mutating and non-idempotent: it can create native copies, change selection/focus and replace the clipboard. Its preview does not change that tool-wide annotation. `archive` is an internal registered operation invoked through `run_registered`, not a separately advertised MCP tool.

## Code execution boundaries

The host calls layout-settling policy as an ordinary imported function. The same self-contained function is serialized into generated Penpot snippets; the host does not evaluate its source. Project snippet validation parses JavaScript without running it. Registered project modules remain trusted executable code, and design snippets still execute in the connected Penpot editor under the existing guards.

## Client registration

These are reviewable examples; no client settings were edited. Replace executable/root paths for each developer. The executable should be the reviewed project installation, not an automatically fetched latest package.

Claude Code supports project `.mcp.json` entries under `mcpServers`; see [official project MCP documentation](https://code.claude.com/docs/en/mcp#project-scope).

```json
{
  "mcpServers": {
    "project-design": {
      "command": "/absolute/path/to/project/node_modules/.bin/penpair",
      "args": ["mcp", "--root", "/absolute/path/to/project"]
    }
  }
}
```

For authorized native-copy work, change that Claude entry's `args` to:

```json
["mcp", "--root", "/absolute/path/to/project", "--allow-writes"]
```

Restart or reconnect the server to discover `design_release_copy`. This enables
tool visibility; it does not apply a copy or grant browser permissions. The tool
must be present in the installed Penpair version's tool list. Registering only
Penpot's upstream MCP server does not expose Penpair's project tools.
The tool
still previews by default. Apply requires `apply: true`, `debugPort`, the pinned
project/plugin connection and existing clipboard read/write access in the
browser on the Penpair process's computer. The standard CDP route needs no
additional Claude computer-control integration. The injected native-UI driver
used in the core-service trial is not a public fallback; bundled CDP/Penpot
qualification remains pending. See [host prerequisites and qualification](copy-between-pages.md#using-from-claude-or-other-hosts).

Codex uses project `.codex/config.toml` for trusted projects, with a server table; see [official Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

```toml
[mcp_servers.project_design]
command = "/absolute/path/to/project/node_modules/.bin/penpair"
args = ["mcp", "--root", "/absolute/path/to/project"]
```

Restart/reconnect after reviewed target or tool-capability changes. Keep the actual Penpot editor visible. SDK in-memory tests establish discovery, typed input refusal, explicit write opt-in, root isolation and target-change refusal; actual agent/editor compatibility remains a pending I12 trial.

For explicit tab activation, heartbeat diagnostics and the limits of background operation, see [recovering a suspended Penpot tab](browser-sessions.md). The CLI `wake` action is separate from the read-only doctor tool.
