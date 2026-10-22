# Troubleshooting

Generated from the core error remedy inventory. Regenerate with `pnpm docs:generate`; tests detect drift.

| Core code | Cause and next action |
| --- | --- |
| `auth-rejected` | Penpot rejected the MCP key. Use the key from Account, Integrations, MCP Server. |
| `endpoint-invalid` | The configured MCP URL must be a complete http or https URL. |
| `endpoint-unconfigured` | Set PENPAIR_MCP_URL in the shell or in a git-ignored .env.local to the MCP URL from Penpot (Account, Integrations, MCP Server; do not regenerate the key), or configure an MCP server named 'penpot' for Codex or Claude Code. |
| `file-mismatch` | Open the project's pinned design file and reconnect its MCP plugin. Use --any-file only when you intend to act on another file. |
| `incomplete-output` | Required output is missing, truncated or unstable. Narrow the scope or resolve the capture problem before accepting it as complete. |
| `mcp-unavailable` | Start the Penpot instance and check the MCP URL. Run `penpair probe` to see what answers. |
| `plugin-disconnected` | In the open Penpot file choose File, MCP Server, Connect, and keep that tab visible, then run the command again. |
| `plugin-suspended` | The browser put the Penpot tab to sleep. Bring it to the foreground and keep it visible while a command runs. A suspended-tab error does not mean nothing was written: read the page before running a write again. |
| `snippet-too-large` | Split the snippet. Penpot's proxy refuses request bodies of about 110 KB, so snippets stay under 90 KB. |
| `stale-inspection` | The file, revision, query or inspected content changed. Discard the old cursor/chunks and start a fresh capture. |
| `tool-failed` | Penpot's tool reported a failure; the message above says what. |
| `write-uncertain` | Do not replay this write blindly. Inspect the intended file independently and reconcile what already changed before explicitly resuming. |

## Other diagnostic domains

ConfigError uses `missing`, `unreadable`, `invalid-json` and `invalid-config`: repair the named project input; only an absent config can be initialized. Unsupported versions need the producer's migration guidance. These are config-domain codes, not aliases for core connection errors.

Command interruption uses `deadline` and `cancelled`; uncertain delivered writes retain exit 4 and their run ID. See [command outcomes](command-contract.md) and [recovery](recovery.md). Argument, lifecycle, registry and adapter errors may have service-specific messages without a stable code: read the named failing precondition instead of assuming every error belongs to this table.

For a wrong target, check [team setup](team.md) and the configured public file ID. For incomplete captures, inspect [structured evidence limits](inspection.md) and [artifact provenance](artifacts.md). For conflicting writer/ownership state, keep evidence and coordinate with the recorded owner before an explicit recovery decision.
