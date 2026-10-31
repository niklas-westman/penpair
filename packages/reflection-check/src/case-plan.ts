import path from "node:path";
import {
  matchingBaselineReference,
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

export function planImplementationCases(
  config: BaselinesConfig,
  results: BaselineResult[],
  mapping: ImplementationMapping,
  verifiedReferences?: ReadonlyMap<string, ArtifactProvenance>,
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
      frame.case && result && setup
        ? verifiedReferences
          ? verifiedReferences.get(frame.id)
          : matchingBaselineReference(config, frame, result)
        : undefined;

    if (!frame.case || !result || !approved || !setup) {
      pending.push({
        id: frame.id,
        reason:
          "Requires current exact approved case provenance and an explicit implementation setup; legacy cases keep the existing generated Reflection path",
      });
      continue;
    }

    for (const threshold of [
      frame.threshold,
      config.threshold,
    ]) {
      if (
        threshold !== undefined &&
        (typeof threshold !== "number" ||
          !Number.isFinite(threshold) ||
          threshold < 0 ||
          threshold > 1)
      ) {
        throw new Error("Comparison threshold must be a finite number from 0 to 1");
      }
    }
    const threshold = frame.threshold ?? config.threshold ?? 0.05;

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
        source: {
          fileId: approved.fileId,
          pageId: approved.pageId,
          frameId: approved.frameId,
        },
      },
      threshold,
    });
  }

  for (const entry of mapping.cases) {
    const frame = config.frames.find((configured) => configured.id === entry.id);
    if (!frame) {
      pending.push({
        id: entry.id,
        reason: "Mapping refers to no configured baseline",
      });
      continue;
    }
    // A frame without a route is exported but never checked, which is deliberate.
    // Naming one in the mapping is a request to check it, so say why it cannot be.
    if (!frame.route) {
      pending.push({
        id: entry.id,
        reason:
          "Mapping names a configured baseline that has no implementation route, so it is exported but cannot be checked",
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
