export type PenpairErrorCode =
  | "endpoint-unconfigured"
  | "endpoint-invalid"
  | "mcp-unavailable"
  | "auth-rejected"
  | "plugin-disconnected"
  | "plugin-suspended"
  | "tool-failed"
  | "snippet-too-large";

// Every failure tells the person running the command what to do next. Remedies never contain credentials.
const remedies: Record<PenpairErrorCode, string> = {
  "endpoint-unconfigured":
    "Set PENPAIR_MCP_URL in the shell or in a git-ignored .env.local to the MCP URL from Penpot (Account, Integrations, MCP Server; do not regenerate the key), or configure an MCP server named 'penpot' for Codex or Claude Code.",
  "endpoint-invalid": "The configured MCP URL must be a complete http or https URL.",
  "mcp-unavailable": "Start the Penpot instance and check the MCP URL. Run `penpair probe` to see what answers.",
  "auth-rejected": "Penpot rejected the MCP key. Use the key from Account, Integrations, MCP Server.",
  "plugin-disconnected":
    "In the open Penpot file choose File, MCP Server, Connect, and keep that tab visible, then run the command again.",
  "plugin-suspended":
    "The browser put the Penpot tab to sleep. Bring it to the foreground and keep it visible while a command runs. A suspended-tab error does not mean nothing was written: read the page before running a write again.",
  "tool-failed": "Penpot's tool reported a failure; the message above says what.",
  "snippet-too-large": "Split the snippet. Penpot's proxy refuses request bodies of about 110 KB, so snippets stay under 90 KB.",
};

export class PenpairError extends Error {
  readonly code: PenpairErrorCode;
  readonly remedy: string;

  constructor(code: PenpairErrorCode, message: string) {
    super(`${message}\n→ ${remedies[code]}`);
    this.name = "PenpairError";
    this.code = code;
    this.remedy = remedies[code];
  }
}
