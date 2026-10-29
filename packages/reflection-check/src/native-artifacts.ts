import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { observationHash, resolveProjectInput } from "@penpair/core";
import { hashImageBytes } from "./image-evidence.js";
import type { NativeReflectionRequest } from "./native-types.js";
import type { NativeCaseEvidence } from "./native-report.js";

export async function bindNativeArtifactManifests(
  root: string,
  request: NativeReflectionRequest,
  observations: Map<string, NativeCaseEvidence>,
): Promise<void> {
  for (const implementationCase of request.cases) {
    const evidence = observations.get(implementationCase.id);
    if (!evidence) {
      continue;
    }

    const describe = async (
      file: string,
    ): Promise<{
      path: string;
      sha256: string;
    }> => {
      const relative = path.isAbsolute(file) ? path.relative(root, file) : file;
      const bytes = await readFile(await resolveProjectInput(root, relative));
      return {
        path: relative,
        sha256: hashImageBytes(bytes),
      };
    };
    const baseline = await describe(implementationCase.baseline.path);
    const screenshot = await describe(evidence.screenshot);
    const diff = await describe(evidence.diff);
    const rawReport = await describe(evidence.rawReport.path);
    if (rawReport.sha256 !== evidence.rawReport.sha256) {
      throw new Error("Native raw report changed before artifact binding");
    }
    if (
      baseline.sha256 !== implementationCase.baseline.sha256 ||
      screenshot.sha256 !== evidence.screenshotHash
    ) {
      throw new Error("Native reference or screenshot changed before artifact binding");
    }

    const policy = {
      provider: evidence.provider,
      maxDiffPixelRatio: implementationCase.threshold,
      capture: evidence.capture,
      comparator: evidence.comparator,
    };
    const manifest = {
      schemaVersion: 1,
      kind: "implementation-comparison-artifacts",
      runId: path.basename(request.runRoot),
      id: implementationCase.id,
      route: implementationCase.route,
      setup: implementationCase.setup,
      intent: implementationCase.intent,
      observed: evidence.observed,
      rawReport,
      policy,
      policyHash: observationHash(policy),
      baseline,
      screenshot,
      diff,
      diffPixelRatio: evidence.diffPixelRatio,
    };
    const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    const file = path.join(request.runRoot, `${implementationCase.id}-artifacts.json`);
    await writeFile(file, bytes, {
      flag: "wx",
    });
    evidence.artifactManifest = {
      path: path.relative(root, file),
      sha256: hashImageBytes(bytes),
    };
  }
}
