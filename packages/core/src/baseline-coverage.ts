import { open } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { resolveProjectOutput } from "./project-input.js";
import { pngSize } from "./png.js";
import { matchesDesignViewport } from "./design-viewport.js";
import {
  validateBaselines,
  type BaselineCase,
  type BaselinesConfig,
  type CoverageRequirement,
} from "./baselines-config.js";
import type { BaselineResult } from "./baselines.js";
import { observationHash } from "./journal.js";

export interface CoverageRow {
  requirement: CoverageRequirement;
  status:
    | "missing-case"
    | "missing-capture"
    | "unapproved-metadata"
    | "changed-unapproved"
    | "approved-design-intent"
    | "unsupported";
  frameIds: string[];
  reason?: string;
}
export interface BaselineCoverage {
  schemaVersion: 1;
  kind: "baseline-coverage";
  configured: boolean;
  designCasesComplete: boolean;
  rows: CoverageRow[];
  unknown: {
    id: string;
    fields: string[];
  }[];
  browserVerification: "not-run";
  accessibility: "not-assessed";
}
export const designCaseKey = (route: string, value: BaselineCase): string =>
  observationHash({
    route,
    viewport: {
      width: value.viewport.width,
      height: value.viewport.height,
    },
    theme: value.theme,
    state: value.state,
    fixture: value.fixture,
  });
export function baselineCoverage(
  config: BaselinesConfig,
  results: BaselineResult[] = [],
): BaselineCoverage {
  const rows: CoverageRow[] = [];
  for (const requirement of config.coverage?.required ?? []) {
    const key = designCaseKey(requirement.route, requirement);
    const unsupported = config.coverage?.unsupported?.find(
      (value) => designCaseKey(value.route, value) === key,
    );
    const frames = config.frames.filter(
      (frame) => frame.route && frame.case && designCaseKey(frame.route, frame.case) === key,
    );
    const frameIds = frames.map((frame) => frame.id);
    if (unsupported) {
      rows.push({
        requirement,
        status: "unsupported",
        frameIds,
        reason: unsupported.reason,
      });
      continue;
    }
    if (!frames.length) {
      rows.push({
        requirement,
        status: "missing-case",
        frameIds,
      });
      continue;
    }
    const captures = frames.flatMap((frame) => {
      const found = results.find((result) => result.id === frame.id);
      return found
        ? [
            {
              frame,
              result: found,
            },
          ]
        : [];
    });
    if (!captures.length || captures.every(({ result }) => !result.approved)) {
      rows.push({
        requirement,
        status: "missing-capture",
        frameIds,
      });
      continue;
    }
    const approved = captures.some(({ frame, result }) => {
      const evidence = result.approved && "case" in result.approved ? result.approved : undefined;
      return (
        evidence?.approval?.kind !== "forced-reference" &&
        ![
          "missing",
          "renamed",
          "unstable",
          "case-mismatch",
        ].includes(result.status) &&
        evidence?.case &&
        observationHash(evidence.case) === observationHash(frame.case) &&
        result.sha256 === evidence.sha256 &&
        evidence.frameId === result.frameId &&
        evidence.file === result.file &&
        (!result.captured ||
          (evidence.fileId === result.captured.fileId &&
            evidence.pageId === result.captured.pageId)) &&
        matchesDesignViewport(evidence.designSize, frame.case!.viewport) &&
        result.imageWidth === Math.round(frame.case!.viewport.width * evidence.scale) &&
        result.imageHeight === Math.round(frame.case!.viewport.height * evidence.scale) &&
        (!frame.case!.activeThemeIds ||
          (evidence.activeThemeIds &&
            observationHash(
              [
                ...frame.case!.activeThemeIds,
              ].sort(),
            ) ===
              observationHash(
                [
                  ...evidence.activeThemeIds,
                ].sort(),
              )))
      );
    });
    const changed =
      approved &&
      captures.some(
        ({ result }) =>
          result.status === "changed" &&
          result.captured &&
          result.approved &&
          result.captured.sha256 !== result.approved.sha256,
      );
    rows.push({
      requirement,
      status: changed
        ? "changed-unapproved"
        : approved
          ? "approved-design-intent"
          : "unapproved-metadata",
      frameIds,
      ...(!approved
        ? {
            reason:
              captures.flatMap(({ result }) => result.problems ?? []).join("; ") ||
              "Approved case/viewport/theme evidence is absent or mismatched",
          }
        : {}),
    });
  }
  const unknown = config.frames.flatMap((frame) => {
    const fields: string[] = [];
    if (!frame.case) {
      fields.push("viewport", "theme", "state", "fixture", "font environment");
    } else {
      if (frame.case.fonts === undefined) {
        fields.push("declared fonts absent");
      } else if (frame.case.fonts.length) {
        fields.push("font loading/version not observed");
      }
      if (frame.case.activeThemeIds === undefined) {
        fields.push("theme activation not asserted; label is design intent");
      }
    }
    const result = results.find((result) => result.id === frame.id);
    if (frame.case && !result?.captured?.renderEnvironment) {
      fields.push("renderer environment not observed");
    }
    return fields.length
      ? [
          {
            id: frame.id,
            fields,
          },
        ]
      : [];
  });
  return {
    schemaVersion: 1,
    kind: "baseline-coverage",
    configured: Boolean(config.coverage),
    designCasesComplete:
      rows.length > 0 && rows.every((row) => row.status === "approved-design-intent"),
    rows,
    unknown,
    browserVerification: "not-run",
    accessibility: "not-assessed",
  };
}

async function boundedRead(file: string, maximum: number): Promise<Buffer> {
  const handle = await open(file, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > maximum) {
      throw new Error("Artifact exceeds the coverage read budget or is not a regular file");
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}
/** Offline coverage validates the approved image bytes, never only a manifest's claims. */
export async function readBaselineCoverage(
  root: string,
  config: BaselinesConfig,
  expectedFileId?: string,
): Promise<BaselineCoverage> {
  config = structuredClone(config);
  validateBaselines(config, (message) => {
    throw new Error(message);
  });
  const file = await resolveProjectOutput(root, path.join(config.root, "penpair-baselines.json"));
  let manifest:
    | {
        schemaVersion?: number;
        fileId?: string;
        frames?: BaselineResult[];
      }
    | undefined;
  try {
    manifest = JSON.parse((await boundedRead(file, 16 * 1024 * 1024)).toString("utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  if (!manifest) {
    return baselineCoverage(config);
  }
  if (
    manifest.schemaVersion !== 2 ||
    !Array.isArray(manifest.frames) ||
    manifest.frames.length > 1000
  ) {
    throw new Error(
      "Coverage needs a bounded schema-2 baseline manifest; regenerate a reviewed capture",
    );
  }
  if (expectedFileId && manifest.fileId !== expectedFileId) {
    throw new Error("Coverage manifest belongs to a different pinned file");
  }
  const ids = new Set<string>();
  for (const value of manifest.frames) {
    if (
      !value ||
      typeof value.id !== "string" ||
      !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value.id) ||
      ids.has(value.id) ||
      ![
        "new",
        "same",
        "changed",
        "missing",
        "renamed",
        "unstable",
        "case-mismatch",
      ].includes(value.status) ||
      typeof value.file !== "string" ||
      !value.file
    ) {
      throw new Error("Malformed baseline frame records");
    }
    ids.add(value.id);
  }
  const results = manifest.frames.map((value) => ({
    ...value,
  }));
  for (const result of results) {
    if (!result.approved) {
      continue;
    }
    try {
      if (
        typeof result.file !== "string" ||
        path.isAbsolute(result.file) ||
        result.file.split(/[\\/]/).includes("..")
      ) {
        throw new Error("Approved image path leaves its baseline folder");
      }
      if ("fileId" in result.approved && result.approved.fileId !== manifest.fileId) {
        throw new Error("Approved image provenance belongs to a different file");
      }
      const target = await resolveProjectOutput(root, path.join(config.root, result.file));
      const bytes = await boundedRead(target, 64 * 1024 * 1024);
      const size = pngSize(bytes);
      if (
        !size ||
        size.width < 1 ||
        size.height < 1 ||
        createHash("sha256").update(bytes).digest("hex") !== result.approved.sha256 ||
        result.sha256 !== result.approved.sha256
      ) {
        throw new Error("Approved PNG bytes do not match their manifest");
      }
      result.imageWidth = size.width;
      result.imageHeight = size.height;
    } catch (error) {
      result.status = "case-mismatch";
      result.problems = [
        error instanceof Error ? error.message : String(error),
      ];
    }
  }
  return baselineCoverage(config, results);
}
