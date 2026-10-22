import { resolveProjectInput } from "@penpair/core";
import { validateProviderEvidence } from "./evidence-validation.js";
import { hashPngBytes, readPngEvidence } from "./png-evidence.js";
import type {
  CasePlan,
  ImplementationCase,
  ImplementationCaseReport,
  ImplementationProvider,
  ImplementationReport,
} from "./types.js";

async function collectCaseEvidence(
  root: string,
  implementationCase: ImplementationCase,
  provider: ImplementationProvider,
): Promise<ImplementationCaseReport> {
  if (
    !(Number.isFinite(implementationCase.baseline.scale) && implementationCase.baseline.scale > 0)
  ) {
    throw new Error("Missing capture scale");
  }

  const baselineImage = await readPngEvidence(root, implementationCase.baseline.path);

  if (hashPngBytes(baselineImage.bytes) !== implementationCase.baseline.sha256) {
    throw new Error("Approved baseline bytes changed");
  }

  const evidence = await provider.runCase(structuredClone(implementationCase));
  validateProviderEvidence(evidence, implementationCase);

  const implementationImage = await readPngEvidence(root, evidence.screenshot);
  const screenshotPath = await resolveProjectInput(root, evidence.screenshot);
  const baselinePath = await resolveProjectInput(root, implementationCase.baseline.path);

  if (screenshotPath === baselinePath) {
    throw new Error("Screenshot must be independently captured, not the baseline path");
  }

  const viewport = implementationCase.intent.viewport;
  const scale = implementationCase.baseline.scale;

  if (
    implementationImage.width !== Math.round(viewport.width * scale) ||
    implementationImage.height !== Math.round(viewport.height * scale) ||
    baselineImage.width !== implementationImage.width ||
    baselineImage.height !== implementationImage.height
  ) {
    throw new Error("Provider PNG scale/viewport differs from the design case");
  }

  const baselineAfterCapture = await readPngEvidence(root, implementationCase.baseline.path);

  if (hashPngBytes(baselineAfterCapture.bytes) !== implementationCase.baseline.sha256) {
    throw new Error("Baseline changed during provider execution");
  }

  return {
    id: implementationCase.id,
    complete: true,
    withinThreshold: evidence.diffPixelRatio <= implementationCase.threshold,
    evidence,
    screenshotHash: hashPngBytes(implementationImage.bytes),
  };
}

export async function runImplementationCases(
  root: string,
  plan: CasePlan,
  provider: ImplementationProvider,
): Promise<ImplementationReport> {
  const reports: ImplementationCaseReport[] = [];

  for (const implementationCase of plan.cases) {
    try {
      reports.push(await collectCaseEvidence(root, implementationCase, provider));
    } catch (error) {
      reports.push({
        id: implementationCase.id,
        complete: false,
        reason: String((error as Error).message),
      });
    }
  }

  return {
    schemaVersion: 1,
    kind: "implementation-case-evidence",
    complete: plan.complete && reports.length > 0 && reports.every((report) => report.complete),
    cases: reports,
    pending: plan.pending,
    visualApproval: false,
    verdict: "owner-review-required",
    accessibility: "not-assessed",
  };
}
