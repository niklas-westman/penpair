# Project-pinned stdio tools

```sh
penpair mcp --root /absolute/path/to/project
```

Use the project's reviewed local executable. Startup requires an absolute root, valid project config and owner-confirmed file pin. The server keeps that target for its lifetime and refuses a changed target until restart/review. Each call gets request-scoped root state; it never calls `process.chdir`. Even basic reads use strict same-execution file guards. Environment/project `.env.local` endpoint resolution remains available; unrelated global Codex/Claude endpoint fallback is disabled. Keep credentials in the private connection flow, outside client configuration examples.

Default tools: pages, bounded tree/audit/inspection, bounded token dump, offline baseline coverage, doctor, derived spec, and stable export to a path inside the project. Export creates/replaces a local file and has a write annotation. There is no raw-code tool or unrestricted command forwarding. Each typed input is validated independently of the client schema. No Penpot write tool is advertised by default.

Explicit `--allow-writes` additionally advertises `run_registered`. It accepts a registered operation name and scalar parameters, defaults to inspection, and requires explicit `apply:true` for design writes. Explicit `resume` requires apply and the original journal; file/instance guards, local/shared advisory lease, same-execution preconditions, checkpoints supported by the underlying command, and independent readback remain in the same services. Registered modules execute trusted project code, including imports; they must keep stdout for MCP and log through the command context. This is not an execution sandbox. Adapter-specific commands remain available through the CLI; the neutral server does not guess library-specific tool schemas.

Requests return the version-1 CLI envelope as text plus structured content. Default cooperative deadline: 60 seconds; SDK cancellation propagates into the service. Arbitrary trusted code can ignore cancellation. A 256 KiB response cap returns an explicit incomplete envelope rather than apparently successful truncated data; uncertain writes retain their uncertain outcome/run ID. Use narrower inspection or CLI artifact output for larger evidence. Stdio has no HTTP listener or background polling.

## Tool annotations

Every advertised tool explicitly declares boolean `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint` values. These are advisory metadata; file guards, typed validation and write opt-in still enforce the boundaries.

| Tools | readOnlyHint | destructiveHint | idempotentHint | openWorldHint |
| --- | --- | --- | --- | --- |
| `run_status`, `baselines_status` (offline local evidence) | true | false | true | false |
| `pages`, `tree`, `audit`, `inspect`, `tokens_dump`, `project_status`, `doctor`, `design_spec` (may contact Penpot or its deployment) | true | false | true | true |
| `export` (creates or replaces a local image from live Penpot) | false | true | false | true |
| `run_registered` (opt-in trusted code, potentially mutating) | false | true | false | true |

`export` can overwrite an existing artifact, so its destructive hint is true. It captures the current design, so callers must not assume repeated calls preserve the earlier image. `run_registered` retains conservative hints even when a particular invocation only previews: its metadata must cover the registered code's possible effects. `archive` is an internal registered operation invoked through `run_registered`, not a separately advertised MCP tool.

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

Codex uses project `.codex/config.toml` for trusted projects, with a server table; see [official Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

```toml
[mcp_servers.project_design]
command = "/absolute/path/to/project/node_modules/.bin/penpair"
args = ["mcp", "--root", "/absolute/path/to/project"]
```

Restart/reconnect after reviewed target or tool-capability changes. Keep the actual Penpot editor visible. SDK in-memory tests establish discovery, typed input refusal, explicit write opt-in, root isolation and target-change refusal; actual agent/editor compatibility remains a pending I12 trial.

For explicit tab activation, heartbeat diagnostics and the limits of background operation, see [recovering a suspended Penpot tab](browser-sessions.md). The CLI `wake` action is separate from the read-only doctor tool.
