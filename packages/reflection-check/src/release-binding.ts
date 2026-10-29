import { loadReleaseComparison, observationHash } from "@penpair/core";
import { assertReleaseComparisonBinding, type ReleaseComparisonBinding } from "./native-types.js";
import type { CasePlan } from "./types.js";

/** Context is a selector; only frozen, independently validated release evidence authorizes its case plan. */
export async function validateReleaseComparison(
  root: string,
  plan: CasePlan,
  binding: ReleaseComparisonBinding,
  expectedFileId?: string,
): Promise<void> {
  assertReleaseComparisonBinding(binding, plan);
  const canonical = await loadReleaseComparison(root, binding.reference);

  if (
    (expectedFileId !== undefined && canonical.fileId !== expectedFileId) ||
    canonical.designHash !== binding.designHash ||
    observationHash(
      [
        ...canonical.caseIds,
      ].sort(),
    ) !==
      observationHash(
        [
          ...binding.caseIds,
        ].sort(),
      ) ||
    observationHash(canonical.caseThresholds) !== observationHash(binding.caseThresholds)
  ) {
    throw new Error("Release context differs from its canonical finalized evidence");
  }

  for (const selected of plan.cases) {
    const approved = canonical.cases.find((entry) => entry.id === selected.id);
    const source = selected.baseline.source;
    if (
      !approved ||
      !source ||
      selected.baseline.sha256 !== approved.sha256 ||
      selected.baseline.scale !== approved.scale ||
      source.fileId !== approved.fileId ||
      source.pageId !== approved.pageId ||
      source.frameId !== approved.frameId ||
      selected.route !== approved.route ||
      selected.threshold !== approved.threshold ||
      observationHash(selected.intent) !== observationHash(approved.intent)
    ) {
      throw new Error(
        `Case ${selected.id} does not match the release's exact approved source, intent and policy`,
      );
    }
  }
}
