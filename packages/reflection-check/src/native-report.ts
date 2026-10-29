import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { observationHash, resolveProjectInput } from "@penpair/core";
import { hashImageBytes } from "./image-evidence.js";
import type { NativeEngineApi, NativeReflectionRequest } from "./native-types.js";
import type { NativeConfiguration } from "./native-config.js";
import type { ProviderEvidence } from "./types.js";

export interface NativeCaseEvidence extends ProviderEvidence {
  diff: string;
  screenshotHash: string;
  rawReport: {
    path: string;
    sha256: string;
  };
  comparator: {
    name: string;
    version: string;
    threshold: number;
    includeAA: boolean;
  };
}

interface NativeArtifact {
  path: string;
  role?: string;
  sha256: string;
  bytes: number;
}

interface NativeCheck {
  id: string;
  suite: string;
  status: string;
  metadata: Record<string, unknown>;
  artifacts: NativeArtifact[];
  evidence?: Array<{
    kind: string;
    data?: Record<string, unknown>;
  }>;
}

export async function readNativeReport(
  root: string,
  runDirectory: string,
  expectedVersion: string,
  request: NativeReflectionRequest,
  config: NativeConfiguration,
  api: NativeEngineApi,
  expectedInputs: Array<Record<string, unknown>>,
  exitCode: number,
): Promise<{
  evidence: Map<string, NativeCaseEvidence>;
  failures: Map<string, string>;
}> {
  const reportPath = await resolveProjectInput(
    root,
    path.relative(root, path.join(runDirectory, "report.json")),
  );
  if ((await stat(reportPath)).size > 16 * 1024 * 1024) {
    throw new Error("Reflection report exceeds 16 MiB");
  }
  const reportBytes = await readFile(reportPath);
  const report = JSON.parse(reportBytes.toString("utf8")) as {
    schemaVersion: number;
    runId: string;
    mode: string;
    status: string;
    environment: {
      reflectionVersion?: string;
    };
    checks: NativeCheck[];
    inputs: Array<Record<string, unknown>>;
    resultHash: {
      verdict: string;
      measured: string;
    };
  };

  if (
    report.schemaVersion !== 2 ||
    report.runId !== path.basename(runDirectory) ||
    report.mode !== "smoke" ||
    report.environment?.reflectionVersion !== expectedVersion ||
    !Array.isArray(report.checks) ||
    new Set(report.checks.map((check) => check.id)).size !== report.checks.length ||
    !Array.isArray(report.inputs) ||
    report.inputs.some((input) => input.missing || !input.sha256) ||
    observationHash(report.inputs) !== observationHash(expectedInputs) ||
    observationHash(api.computeResultHash(report.checks)) !== observationHash(report.resultHash) ||
    ![
      0,
      1,
    ].includes(exitCode) ||
    report.status === "error" ||
    (report.status === "fail" ? exitCode !== 1 : exitCode !== 0)
  ) {
    throw new Error(
      "Reflection raw report has invalid identity, inputs, result hashes or process outcome",
    );
  }

  const visualChecks = report.checks.filter((check) => check.suite === "visual");
  if (
    visualChecks.length !== request.cases.length ||
    visualChecks.some((check) => !request.cases.some((entry) => check.id === `visual.${entry.id}`))
  ) {
    throw new Error("Reflection report does not cover the exact requested case inventory");
  }
  if (
    report.checks.some(
      (check) => check.suite !== "visual" && check.suite !== "browser" && check.status !== "pass",
    )
  ) {
    throw new Error("Reflection setup, route or environment evidence is incomplete");
  }

  const evidence = new Map<string, NativeCaseEvidence>();
  for (const check of report.checks) {
    if (!Array.isArray(check.artifacts)) {
      throw new Error("Reflection check has no artifact inventory");
    }
    for (const artifact of check.artifacts) {
      if (
        !artifact.path ||
        path.isAbsolute(artifact.path) ||
        artifact.path.split(/[\\/]/).includes("..") ||
        !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
        !Number.isSafeInteger(artifact.bytes) ||
        artifact.bytes < 0 ||
        artifact.bytes > 64 * 1024 * 1024
      ) {
        throw new Error("Reflection artifact has invalid identity or size");
      }
      const file = await resolveProjectInput(
        root,
        path.relative(root, path.join(runDirectory, artifact.path)),
      );
      const bytes = await readFile(file);
      if (bytes.byteLength !== artifact.bytes || hashImageBytes(bytes) !== artifact.sha256) {
        throw new Error("Reflection artifact bytes changed");
      }
    }
  }

  const failures = new Map<string, string>();
  for (const implementationCase of request.cases) {
    try {
      const check = visualChecks.find((entry) => entry.id === `visual.${implementationCase.id}`)!;
      const nativeCase = config.contracts.browser.visualSmoke.find(
        (entry) => entry.id === implementationCase.id,
      )!;
      const routeChecks = report.checks.filter(
        (entry) =>
          entry.suite === "browser" &&
          entry.metadata.routeId === nativeCase.route &&
          entry.metadata.viewport === nativeCase.viewport &&
          entry.metadata.state === nativeCase.state,
      );
      if (routeChecks.length !== 1 || routeChecks[0]!.status !== "pass") {
        throw new Error(
          `Reflection case ${implementationCase.id} has no unique passing browser route evidence`,
        );
      }

      const route = config.contracts.browser.routes.find((entry) => entry.id === nativeCase.route)!;
      const states = route.states as
        | Array<{
            id: string;
            path?: string;
          }>
        | undefined;
      const state = states?.find((entry) => entry.id === nativeCase.state);
      const routePath = state?.path ?? route.path;
      if (typeof routePath !== "string") {
        throw new Error("Native route has no reviewed path");
      }
      const expectedUrl = new URL(routePath, config.contracts.browser.baseUrl);
      if (
        expectedUrl.origin !== new URL(config.contracts.browser.baseUrl).origin ||
        expectedUrl.username ||
        expectedUrl.password
      ) {
        throw new Error("Native route must stay on its reviewed application origin");
      }
      const measurements = check.evidence?.filter(
        (entry) => entry.kind === "browser-capture-observation",
      );
      const measured = measurements?.length === 1 ? measurements[0]!.data : undefined;
      const actual = check.artifacts.filter((artifact) => artifact.role === "actual");
      const differences = check.artifacts.filter((artifact) => artifact.role === "diff");
      const comparator = check.metadata.comparator as NativeCaseEvidence["comparator"] | undefined;
      const threshold = check.metadata.threshold as
        | {
            maxDiffPixelRatio?: number;
          }
        | undefined;

      if (
        ![
          "pass",
          "fail",
          "warn",
        ].includes(check.status) ||
        ![
          "visual-match",
          "visual-diff",
        ].includes(String(check.metadata.classification)) ||
        check.metadata.ref !== implementationCase.reference ||
        check.metadata.routeId !== nativeCase.route ||
        check.metadata.viewport !== nativeCase.viewport ||
        check.metadata.state !== nativeCase.state ||
        check.metadata.baselinePath !== path.basename(implementationCase.baseline.path) ||
        threshold?.maxDiffPixelRatio !== implementationCase.threshold ||
        check.metadata.dimensionMismatch !== false ||
        comparator?.name !== "pixelmatch" ||
        !comparator.version ||
        comparator.threshold !== 0.1 ||
        comparator.includeAA !== false ||
        !measured ||
        measured.url !== expectedUrl.href ||
        !measured.capture ||
        actual.length !== 1 ||
        differences.length !== 1
      ) {
        throw new Error(
          `Reflection case ${implementationCase.id} lacks exact reference, policy or measured capture evidence`,
        );
      }

      evidence.set(implementationCase.id, {
        schemaVersion: 1,
        id: implementationCase.id,
        route: implementationCase.route,
        setup: implementationCase.setup,
        baselineHash: implementationCase.baseline.sha256,
        observed: measured.observed as ProviderEvidence["observed"],
        fonts: measured.fonts as string[],
        fontsReady: measured.fontsReady as boolean,
        capture: measured.capture as ProviderEvidence["capture"],
        screenshot: path.relative(root, path.join(runDirectory, actual[0]!.path)),
        rawReport: {
          path: path.relative(root, reportPath),
          sha256: hashImageBytes(reportBytes),
        },
        comparator: comparator!,
        diff: path.relative(root, path.join(runDirectory, differences[0]!.path)),
        screenshotHash: actual[0]!.sha256,
        diffPixelRatio: check.metadata.diffRatio as number,
        provider: {
          name: "reflection-native-measured",
          version: expectedVersion,
        },
      });
    } catch (error) {
      failures.set(implementationCase.id, error instanceof Error ? error.message : String(error));
    }
  }

  return {
    evidence,
    failures,
  };
}
