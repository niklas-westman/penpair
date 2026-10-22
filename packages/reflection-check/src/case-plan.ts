import path from "node:path";
import {
  observationHash,
  validateBaselineCase,
  type ArtifactProvenance,
  type BaselineCase,
  type BaselineResult,
  type BaselinesConfig,
} from "@penpair/core";
import type { CasePlan, ImplementationCase, ImplementationMapping } from "./types.js";

function validateMapping(mapping: ImplementationMapping): void {
  if (
    !mapping ||
    mapping.schemaVersion !== 1 ||
    !Array.isArray(mapping.cases) ||
    mapping.cases.length > 1000
  ) {
    throw new Error("Unsupported implementation mapping");
  }

  const mappedIds = new Set<string>();

  for (const entry of mapping.cases) {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      !entry.id ||
      mappedIds.has(entry.id) ||
      typeof entry.setup !== "string" ||
      !/^[a-zA-Z][\w.-]{0,100}$/.test(entry.setup)
    ) {
      throw new Error("Duplicate/invalid explicit setup mapping");
    }

    mappedIds.add(entry.id);
  }
}

function matchingCaseApproval(
  result: BaselineResult | undefined,
  intent: BaselineCase,
): ArtifactProvenance | undefined {
  const approved = result?.approved && !("legacy" in result.approved) ? result.approved : undefined;

  if (
    !result ||
    !approved?.case ||
    !result.captured ||
    approved.approval?.kind === "forced-reference"
  ) {
    return undefined;
  }

  if (
    ![
      "same",
      "new",
      "changed",
    ].includes(result.status)
  ) {
    return undefined;
  }

  const matchesCase = observationHash(approved.case) === observationHash(intent);
  const matchesCapture =
    approved.sha256 === result.captured.sha256 &&
    approved.frameId === result.frameId &&
    approved.fileId === result.captured.fileId &&
    approved.pageId === result.captured.pageId &&
    approved.revision === result.captured.revision &&
    approved.file === result.file;

  return matchesCase && matchesCapture ? approved : undefined;
}

export function planImplementationCases(
  config: BaselinesConfig,
  results: BaselineResult[],
  mapping: ImplementationMapping,
): CasePlan {
  validateMapping(mapping);

  const cases: ImplementationCase[] = [];
  const pending: CasePlan["pending"] = [];

  for (const frame of config.frames) {
    if (!frame.route) {
      continue;
    }

    const result = results.find((baselineResult) => baselineResult.id === frame.id);
    const setup = mapping.cases.find((entry) => entry.id === frame.id)?.setup;
    const approved =
      frame.case && result && setup ? matchingCaseApproval(result, frame.case) : undefined;

    if (!frame.case || !result || !approved || !setup) {
      pending.push({
        id: frame.id,
        reason:
          "Requires current exact approved case provenance and an explicit implementation setup; legacy cases keep the existing generated Reflection path",
      });
      continue;
    }

    validateBaselineCase(frame.case, (message) => {
      throw new Error(message);
    });
    cases.push({
      id: frame.id,
      route: frame.route,
      intent: structuredClone(frame.case),
      setup,
      baseline: {
        path: path.join(config.root, result.file),
        sha256: approved.sha256,
        scale: approved.scale,
      },
      threshold: config.threshold ?? 0.05,
    });
  }

  for (const entry of mapping.cases) {
    if (!config.frames.some((frame) => frame.id === entry.id)) {
      pending.push({
        id: entry.id,
        reason: "Mapping refers to no configured baseline",
      });
    }
  }

  return {
    schemaVersion: 1,
    kind: "implementation-case-plan",
    cases,
    pending,
    complete: pending.length === 0 && cases.length > 0,
    visualApproval: false,
  };
}
