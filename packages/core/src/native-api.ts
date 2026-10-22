import type { PenpotToolClient } from "./client.js";
import { runOperation, type OperationReport, type OperationOptions } from "./operation.js";
import { runSnippet, snippet } from "./snippet.js";

export async function validateFileIntegrity(client: PenpotToolClient): Promise<{
  supported: boolean;
  valid?: boolean;
  issues?: unknown[];
}> {
  const result = await runSnippet(
    client,
    snippet(
      "file-integrity",
      `
if (typeof penpot.currentFile.validate !== "function") return { ok: true, supported: false };
const issues = penpot.currentFile.validate();
if (!Array.isArray(issues)) return { ok: false, message: "file.validate returned no issue list" };
return { ok: true, supported: true, valid: issues.length === 0, issues };`,
      {},
      "read",
    ),
  );
  if (typeof result.supported !== "boolean") {
    throw new Error("Integrity check returned no capability result");
  }
  if (
    result.supported &&
    (!Array.isArray(result.issues) ||
      typeof result.valid !== "boolean" ||
      result.valid !== (result.issues.length === 0))
  ) {
    throw new Error("Integrity check returned incomplete or contradictory observations");
  }
  return {
    supported: result.supported,
    ...(result.supported
      ? {
          valid: result.valid === true,
          issues: result.issues as unknown[],
        }
      : {}),
  };
}

/** Version history is a recovery aid, never a substitute for a restored independent backup. */
export async function createCheckpoint(
  client: PenpotToolClient,
  checkpoint: {
    label: string;
    runId: string;
  },
  options: OperationOptions = {},
): Promise<{
  supported: boolean;
  report?: OperationReport;
}> {
  if (
    !checkpoint.label.trim() ||
    checkpoint.label.length > 120 ||
    !/^[a-zA-Z0-9-]{1,100}$/.test(checkpoint.runId)
  ) {
    throw new Error("A checkpoint requires a short label and a stable alphanumeric/hyphen run ID");
  }
  const capability = await runSnippet(
    client,
    snippet(
      "checkpoint-capability",
      `return { ok: true, fileId: penpot.currentFile.id, supported: typeof penpot.currentFile.saveVersion === "function" && typeof penpot.currentFile.findVersions === "function" };`,
      {},
      "read",
    ),
  );
  if (
    capability.ok !== true ||
    typeof capability.supported !== "boolean" ||
    typeof capability.fileId !== "string"
  ) {
    throw new Error("Checkpoint capability returned no target/presence observations");
  }
  if (capability.supported !== true) {
    return {
      supported: false,
    };
  }
  const params = {
    label: `penpair/${checkpoint.runId}/${checkpoint.label}`,
    fileId: capability.fileId,
  };
  const guard =
    'if (penpot.currentFile.id !== CFG.fileId) return { ok: false, message: "checkpoint file changed" };';
  const listing = `${guard}
const versions = (await penpot.currentFile.findVersions()).filter((version) => version.label === CFG.label);
return { ok: true, fileId: penpot.currentFile.id, versions: versions.map((version) => ({ label: version.label, createdAt: String(version.createdAt) })) };`;
  const report = await runOperation(
    client,
    {
      name: "checkpoint",
      page: () => undefined,
      inspect: () => snippet("checkpoint-inspect", listing, params, "read"),
      apply: () =>
        snippet(
          "checkpoint-apply",
          `${guard}
const versions = (await penpot.currentFile.findVersions()).filter((version) => version.label === CFG.label);
if (versions.length > 1) return { ok: false, message: "checkpoint label is ambiguous" };
if (versions.length === 1) return { ok: true, existed: true };
await penpot.currentFile.saveVersion(CFG.label);
return { ok: true, created: true };`,
          params,
          "write",
        ),
      readback: () => snippet("checkpoint-readback", listing, params, "read"),
      verify: ({ readback }) =>
        readback.fileId === params.fileId &&
        Array.isArray(readback.versions) &&
        readback.versions.length === 1 &&
        readback.versions[0]?.label === params.label
          ? []
          : [
              "Checkpoint was not independently found once in the intended file",
            ],
    },
    undefined,
    options,
  );
  return {
    supported: true,
    report,
  };
}
