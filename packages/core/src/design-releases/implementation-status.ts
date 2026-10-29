import { observationHash } from "../journal.js";
import { readArtifact } from "./artifact-paths.js";
import { releaseCaseIds } from "./status-evaluation.js";
import type { DesignRelease, ReleaseArtifactRef, ReleaseMember } from "./types.js";
import type { ReleaseImplementationStatus } from "./status-types.js";

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function sameIds(raw: unknown, expected: string[]): boolean {
  return (
    Array.isArray(raw) &&
    raw.length === expected.length &&
    new Set(raw).size === raw.length &&
    raw.every((id) => typeof id === "string" && expected.includes(id))
  );
}

async function validateCase(
  root: string,
  raw: unknown,
  member: ReleaseMember,
  release: DesignRelease,
): Promise<boolean> {
  const entry = object(raw);
  const evidence = object(entry?.evidence);
  const approval =
    member.disposition === "changed"
      ? (release.receipts.find((receipt) => receipt.sourceId === member.id)?.approval ??
        member.approval)
      : member.approval;
  const intent = member.case;
  const threshold = member.comparisonThreshold ?? 0.05;
  const loadedFonts = Array.isArray(evidence?.fonts) ? evidence.fonts : [];
  const fontsMatch = (intent?.fonts ?? []).every((font) => loadedFonts.includes(font));
  if (
    !entry ||
    !evidence ||
    !intent ||
    !approval ||
    entry.complete !== true ||
    typeof entry.withinThreshold !== "boolean" ||
    entry.threshold !== threshold ||
    evidence.id !== member.id ||
    evidence.route !== member.route ||
    evidence.baselineHash !== approval.image.sha256 ||
    evidence.fontsReady !== true ||
    !Array.isArray(evidence.fonts) ||
    !fontsMatch
  ) {
    throw new Error(
      `Implementation case ${member.id} is not bound to its approved reference, route, fonts and policy`,
    );
  }
  const observed = {
    viewport: intent.viewport,
    theme: intent.theme,
    state: intent.state,
    fixture: intent.fixture,
  };
  if (
    observationHash(evidence.observed ?? null) !== observationHash(observed) ||
    typeof evidence.diffPixelRatio !== "number" ||
    !Number.isFinite(evidence.diffPixelRatio) ||
    evidence.diffPixelRatio < 0 ||
    evidence.diffPixelRatio > 1 ||
    entry.withinThreshold !== evidence.diffPixelRatio <= threshold
  ) {
    throw new Error(
      `Implementation case ${member.id} has wrong observed intent or inconsistent measurements`,
    );
  }
  if (typeof evidence.screenshot !== "string" || typeof entry.screenshotHash !== "string") {
    throw new Error(`Implementation case ${member.id} is missing immutable screenshot evidence`);
  }
  await readArtifact(
    root,
    {
      path: evidence.screenshot,
      sha256: entry.screenshotHash,
    },
    64 * 1024 * 1024,
  );
  return !entry.withinThreshold;
}

/** Assess separately stored implementation evidence without changing finalized design history. */
export async function assessReleaseImplementation(
  root: string,
  release: DesignRelease,
  designHash: string,
  comparison?: ReleaseArtifactRef,
): Promise<ReleaseImplementationStatus> {
  const expected = releaseCaseIds(release);
  const result: ReleaseImplementationStatus = {
    recorded: release.implementation.status,
    comparison: "not-assessed",
    complete: false,
    caseIds: expected,
    reasons: [],
    ownerAcceptance: "not-recorded",
  };
  const references = comparison
    ? [
        comparison,
      ]
    : release.implementation.evidence;
  if (!references.length) {
    if (release.implementation.status === "verified") {
      result.comparison = "incomplete";
      result.reasons.push("Recorded implementation status has no bound comparison evidence");
    }
    return result;
  }
  let anyDrift = false;
  for (const reference of references) {
    try {
      const raw = object(JSON.parse((await readArtifact(root, reference)).toString("utf8")));
      const report = raw?.kind === "implementation-case-evidence" ? raw : object(raw?.data);
      const binding = object(report?.release);
      if (
        !report ||
        report.schemaVersion !== 1 ||
        report.kind !== "implementation-case-evidence" ||
        binding?.designHash !== designHash
      ) {
        throw new Error("Implementation report is not bound to this exact release design hash");
      }
      if (
        raw !== report &&
        (object(raw?.completeness)?.complete !== true ||
          !(
            (raw?.exitCode === 0 && raw.outcome === "success") ||
            (raw?.exitCode === 2 && raw.outcome === "drift")
          ))
      ) {
        throw new Error("Implementation command outcome is incomplete, failed or inconsistent");
      }
      if (
        !expected.length ||
        !sameIds(binding.caseIds, expected) ||
        report.complete !== true ||
        !Array.isArray(report.pending) ||
        report.pending.length ||
        !Array.isArray(report.cases) ||
        !sameIds(
          report.cases.map((entry: unknown) => object(entry)?.id),
          expected,
        )
      ) {
        throw new Error("Implementation report does not cover the complete release inventory");
      }
      let reportDrift = false;
      for (const entry of report.cases) {
        const member = release.members!.find((candidate) => candidate.id === object(entry)!.id)!;
        reportDrift = (await validateCase(root, entry, member, release)) || reportDrift;
      }
      if (raw !== report && reportDrift !== (raw?.exitCode === 2)) {
        throw new Error("Implementation command verdict differs from its measured cases");
      }
      anyDrift ||= reportDrift;
    } catch (error) {
      result.reasons.push(error instanceof Error ? error.message : String(error));
    }
  }
  result.complete = result.reasons.length === 0;
  result.comparison = result.complete ? (anyDrift ? "drift" : "passed") : "incomplete";
  return result;
}
