import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "jiti";
import { observationHash, resolveProjectInput, resolveProjectOutput } from "@penpair/core";
import { hashImageBytes } from "./image-evidence.js";
import { executeNativeEngine, resolveNativeEngine } from "./native-engine.js";
import { nativeCaseReference, validateNativeConfiguration } from "./native-config.js";
import { readNativeReport } from "./native-report.js";
import { bindNativeArtifactManifests } from "./native-artifacts.js";
import { type NativeReflectionOptions, type NativeReflectionRequest } from "./native-types.js";
import { validateReleaseComparison } from "./release-binding.js";
import { runImplementationCases } from "./run-cases.js";
import type { CasePlan, ImplementationReport } from "./types.js";

/** Runs only the installed project's pinned public CLI; never promotes output into owner approval. */
export async function runNativeReflectionCases(
  root: string,
  plan: CasePlan,
  options: NativeReflectionOptions,
): Promise<ImplementationReport> {
  root = await realpath(root);
  if (options.release) {
    await validateReleaseComparison(root, plan, options.release, options.fileId);
  }
  if (
    !plan.complete ||
    plan.pending.length ||
    !plan.cases.length ||
    new Set(plan.cases.map((entry) => entry.id)).size !== plan.cases.length
  ) {
    return incompleteReport(
      plan,
      "Native batch requires a complete unique implementation case plan",
    );
  }

  const configFile = await resolveProjectInput(root, options.configFile);
  const { api, cli } = await resolveNativeEngine(path.dirname(configFile), options.engineVersion);
  const runRoot = await resolveProjectOutput(root, `.penpair/reflection/native/${randomUUID()}`);
  const baselineRoot = path.join(runRoot, "references");
  await mkdir(baselineRoot, {
    recursive: true,
  });

  const request: NativeReflectionRequest = {
    schemaVersion: 1,
    cases: [],
    baselineRoot,
    runRoot,
  };
  for (const implementationCase of plan.cases) {
    const original = await resolveProjectInput(root, implementationCase.baseline.path);
    const bytes = await readFile(original);
    if (hashImageBytes(bytes) !== implementationCase.baseline.sha256) {
      throw new Error(`Approved baseline bytes changed for ${implementationCase.id}`);
    }
    const extension = path.extname(original);
    if (
      ![
        ".png",
        ".webp",
      ].includes(extension) ||
      !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(implementationCase.id)
    ) {
      throw new Error("Native cases require safe case IDs and PNG/WebP references");
    }
    const copied = path.join(baselineRoot, `${implementationCase.id}${extension}`);
    await writeFile(copied, bytes, {
      flag: "wx",
      mode: 0o400,
    });
    await chmod(copied, 0o400);
    request.cases.push({
      ...structuredClone(implementationCase),
      reference: nativeCaseReference(implementationCase),
      baseline: {
        ...implementationCase.baseline,
        path: copied,
      },
    });
  }

  const projectModule = (await createJiti(configFile, {
    moduleCache: false,
    tryNative: false,
  }).evalModule(await readFile(configFile, "utf8"), {
    filename: configFile,
    async: true,
    forceTranspile: true,
  })) as {
    createReflectionConfig?: (request: NativeReflectionRequest) => Promise<unknown> | unknown;
  };
  if (typeof projectModule.createReflectionConfig !== "function") {
    throw new Error("Native engine config must export createReflectionConfig(request)");
  }
  const nativeConfig = validateNativeConfiguration(
    await projectModule.createReflectionConfig(structuredClone(request)),
    request,
  );
  const declared = [];
  for (const input of nativeConfig.inputs) {
    const absolute = await resolveProjectInput(
      root,
      path.relative(root, path.resolve(path.dirname(configFile), input.path)),
    );
    declared.push({
      ...input,
      path: absolute,
    });
  }
  declared.push({
    role: "project-config",
    path: configFile,
  });
  for (const implementationCase of plan.cases) {
    declared.push({
      role: "approved-original",
      path: await resolveProjectInput(root, implementationCase.baseline.path),
    });
  }

  const requestFile = path.join(runRoot, "request.json");
  const generatedConfig = path.join(runRoot, "reflection.config.mjs");
  const reportRoot = path.join(runRoot, "engine");
  await writeFile(
    requestFile,
    JSON.stringify({
      request,
      declared,
    }),
    {
      flag: "wx",
    },
  );
  const wrapper = [
    'import { readFile } from "node:fs/promises";',
    `import { createReflectionConfig } from ${JSON.stringify(pathToFileURL(configFile).href)};`,
    `const input = JSON.parse(await readFile(${JSON.stringify(requestFile)}, "utf8"));`,
    "const config = await createReflectionConfig(input.request);",
    "export default { ...config, inputs: input.declared };",
  ].join("\n");
  await writeFile(generatedConfig, wrapper, {
    flag: "wx",
  });
  declared.push({
    role: "case-plan",
    path: requestFile,
  });
  await writeFile(
    requestFile,
    JSON.stringify({
      request,
      declared,
    }),
  );
  const hashInputs = {
    configDir: runRoot,
    configFile: generatedConfig,
    declared,
    baselineFiles: request.cases.map((entry) => entry.baseline.path),
  };
  const before = await api.hashReportInputs(hashInputs);
  if (before.some((entry) => entry.missing || !entry.sha256)) {
    throw new Error("Native engine inputs are missing");
  }

  let report: ImplementationReport;
  try {
    options.onProgress?.(`Starting native Reflection batch: ${plan.cases.length} cases\n`);
    const exitCode = await executeNativeEngine(
      root,
      cli,
      generatedConfig,
      reportRoot,
      plan.cases.map((entry) => entry.id),
      options.onProgress,
      options.signal,
    );
    const runs = (
      await readdir(path.join(reportRoot, "runs"), {
        withFileTypes: true,
      })
    )
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    if (runs.length !== 1) {
      throw new Error("Native invocation must produce exactly one raw run report");
    }
    const after = await api.hashReportInputs(hashInputs);
    if (observationHash(before) !== observationHash(after)) {
      throw new Error("Native engine inputs or approved references changed during execution");
    }
    const { evidence, failures } = await readNativeReport(
      root,
      path.join(reportRoot, "runs", runs[0]!),
      options.engineVersion,
      request,
      nativeConfig,
      api,
      before,
      exitCode,
    );
    await bindNativeArtifactManifests(root, request, evidence);
    report = await runImplementationCases(root, plan, {
      runCase: async (implementationCase) => {
        const result = evidence.get(implementationCase.id);
        if (!result) {
          throw new Error(
            failures.get(implementationCase.id) ?? "Native report omitted a requested case",
          );
        }
        return result;
      },
    });
    if (options.release) {
      await validateReleaseComparison(root, plan, options.release, options.fileId);
    }
    for (const caseReport of report.cases) {
      if (
        caseReport.complete &&
        caseReport.screenshotHash !== evidence.get(caseReport.id)?.screenshotHash
      ) {
        throw new Error("Native screenshot changed during final evidence validation");
      }
    }
  } catch (error) {
    report = incompleteReport(plan, error instanceof Error ? error.message : String(error));
  }

  if (options.release) {
    report.release = structuredClone(options.release);
  }
  await writeFile(
    path.join(runRoot, "implementation-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    {
      flag: "wx",
    },
  );
  options.onProgress?.(
    `Native report: ${path.relative(root, path.join(runRoot, "implementation-report.json"))}\n`,
  );
  return report;
}

function incompleteReport(plan: CasePlan, reason: string): ImplementationReport {
  return {
    schemaVersion: 1,
    kind: "implementation-case-evidence",
    complete: false,
    cases: plan.cases.map((entry) => ({
      id: entry.id,
      complete: false,
      threshold: entry.threshold,
      reason,
    })),
    pending: structuredClone(plan.pending),
    visualApproval: false,
    verdict: "owner-review-required",
    accessibility: "not-assessed",
  };
}
