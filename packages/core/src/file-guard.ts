import { executionEnvelope, maxSnippetBytes, type PenpotToolClient } from "./client.js";
import { PenpairError } from "./errors.js";
import type { ProjectFile } from "./instance/config.js";

/** A guard in the delivered execution closes the gap between a connection check and a later batch. */
export function guardFile(client: PenpotToolClient, expected: ProjectFile | undefined, options: {
  mode?: "strict" | "warn";
  anyFile?: boolean;
  warn?: (message: string) => void;
} = {}): PenpotToolClient {
  if (!expected || options.anyFile) {
    options.warn?.(options.anyFile ? "--any-file overrides the project's file guard for this run." : "No file ID is pinned. Run `penpair connect --pin-file` to protect this project's file.");
    return client;
  }
  const warningPrefix = "penpair-file-warning: ";
  return {
    ...client,
    close: () => client.close(),
    ...(client.listTools ? { listTools: () => client.listTools!() } : {}),
    async callTool(name, args) {
      if (name !== "execute_code" || typeof args.code !== "string")
        throw new PenpairError("file-mismatch", "The file guard only permits guarded execute_code calls.");
      const guard = `{ const __penpairExpectedFile = ${JSON.stringify(expected)};
const __penpairActualFile = penpot.currentFile;
if (!__penpairActualFile || __penpairActualFile.id !== __penpairExpectedFile.id) {
  const message = "Expected file " + (__penpairExpectedFile.name || __penpairExpectedFile.id) + " (" + __penpairExpectedFile.id + "), connected to " + (__penpairActualFile ? __penpairActualFile.name + " (" + __penpairActualFile.id + ")" : "no file") + ". Open the expected file and reconnect, or explicitly use --any-file.";
  ${options.mode === "warn" ? `console.warn(${JSON.stringify(warningPrefix)} + message);` : 'return { ok: false, fileMismatch: true, message };'}
} }
`;
      const code = guard + args.code;
      if (Buffer.byteLength(code, "utf8") > maxSnippetBytes)
        throw new PenpairError("snippet-too-large", "The snippet including its file guard exceeds 90 KB");
      const outcome = await client.callTool(name, { ...args, code });
      const envelope = executionEnvelope(outcome);
      const result = envelope?.result;
      if (typeof result === "object" && result !== null && "fileMismatch" in result && result.fileMismatch === true)
        throw new PenpairError("file-mismatch", String("message" in result ? result.message : "The connected file changed"));
      if (typeof envelope?.log === "string") {
        for (const line of envelope.log.split("\n")) if (line.includes(warningPrefix)) options.warn?.(line.slice(line.indexOf(warningPrefix) + warningPrefix.length));
      }
      return outcome;
    },
  };
}
