import type { ReleaseComparisonReference } from "@penpair/core";
import type { CasePlan, ImplementationCase } from "./types.js";

export interface ReleaseComparisonBinding {
  reference: ReleaseComparisonReference;
  designHash: string;
  caseIds: string[];
  caseThresholds: Record<string, number>;
}

/** Input to a trusted project's createReflectionConfig(request) export. */
export interface NativeReflectionRequest {
  schemaVersion: 1;
  cases: Array<
    ImplementationCase & {
      reference: string;
    }
  >;
  baselineRoot: string;
  runRoot: string;
}

export interface NativeReflectionOptions {
  configFile: string;
  engineVersion: string;
  fileId?: string;
  release?: ReleaseComparisonBinding;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}

export interface NativeEngineApi {
  reflectionCapabilities: {
    browserCaptureObservation: number;
    externallyManagedBaselines: number;
  };
  hashReportInputs(options: {
    configDir: string;
    configFile?: string;
    declared: Array<{
      role: string;
      path: string;
      canonical?: "json";
    }>;
    baselineFiles: string[];
  }): Promise<Array<Record<string, unknown>>>;
  computeResultHash(checks: unknown[]): {
    verdict: string;
    measured: string;
  };
}

export function assertReleaseComparisonBinding(
  binding: ReleaseComparisonBinding,
  plan: CasePlan,
): void {
  const actual = plan.cases.map((entry) => entry.id).sort();
  const expected = [
    ...binding.caseIds,
  ].sort();

  if (
    !binding.reference ||
    !/^[a-f0-9]{64}$/.test(binding.designHash) ||
    expected.length === 0 ||
    new Set(expected).size !== expected.length ||
    JSON.stringify(actual) !== JSON.stringify(expected) ||
    !binding.caseThresholds ||
    Object.keys(binding.caseThresholds).length !== actual.length ||
    plan.cases.some((entry) => binding.caseThresholds[entry.id] !== entry.threshold) ||
    !plan.complete ||
    plan.pending.length > 0
  ) {
    throw new Error("Release comparison requires the exact complete release case inventory");
  }
}
