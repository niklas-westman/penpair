import { executeCode, type PenpotToolClient } from "./client.js";
import { runDeepCheck, type DeepOptions, type DeepReport } from "./deep-check.js";
import { guardFile } from "./file-guard.js";

/** A live write probe is never scheduled blindly: the caller explicitly identifies a disposable file and tested version. */
export async function runLiveSmoke(
  client: PenpotToolClient,
  options: DeepOptions & {
    scratchFileId: string;
    expectedVersion: string;
    confirmedScratch: boolean;
  },
): Promise<DeepReport> {
  if (
    !options.confirmedScratch ||
    !options.scratchFileId.trim() ||
    !/^\d+\.\d+\.\d+$/.test(options.expectedVersion)
  ) {
    throw new Error(
      "Live smoke requires an explicitly confirmed scratch file ID and expected Penpot version",
    );
  }
  const guarded = guardFile(client, {
    id: options.scratchFileId,
  });
  const { result } = await executeCode(
    guarded,
    "return { version: penpot.version, fileId: penpot.currentFile.id };",
    {
      effect: "read",
      retries: 0,
    },
  );
  const actual = result as {
    version?: string;
    fileId?: string;
  } | null;
  if (actual?.version !== options.expectedVersion || actual?.fileId !== options.scratchFileId) {
    throw new Error(
      "Live smoke target/version differs from the pinned expectation. No probe was applied.",
    );
  }
  return runDeepCheck(guarded, options);
}
