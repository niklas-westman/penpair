import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile } from "../atomic-output.js";
import { observationHash } from "../journal.js";
import type { PenpotBackendClient } from "../penpot-backend.js";
import { resolveProjectOutput } from "../project-input.js";
import { subtreeSignature, type BackendObjects } from "./backend-compare.js";
import { rootBoardIds, subtreeObjects, verifyBackendPairs } from "./backend-evidence.js";

export interface AttestPage {
  id: string;
  name: string;
}

export interface AttestRequest {
  fileId: string;
  origin: string;
  releaseVersion: string;
  /** Pages in the file, from the editor. */
  pages: AttestPage[];
  /** Source pages to match against; every page that is not a release page when omitted. */
  sourcePages?: string[];
}

export interface AttestOptions {
  backend: PenpotBackendClient;
  /** Owner's words; the record is written only when this is given. */
  write?: {
    note: string;
    by: string;
    replace?: boolean;
  };
  redact?: (text: string) => string;
  signal?: AbortSignal;
  now?: () => Date;
}

export interface AttestedFrame {
  name: string;
  releaseFrameId: string;
  sourceFrameId: string;
  sourcePage: string;
  /** Hash of the stored subtree of the release board and of its source; either changes when the board changes. */
  releaseHash: string;
  sourceHash: string;
  nodes: number;
  layoutDriven: boolean;
}

export interface ReleaseAttestation {
  schemaVersion: 1;
  kind: "release-attestation";
  release: string;
  penpot: {
    origin: string;
    fileId: string;
    pageId: string;
    page: string;
  };
  evidence: "backend";
  attestedAt: string;
  approval: {
    by: string;
    note: string;
  };
  totals: {
    frames: number;
    nodes: number;
    layoutDrivenFrames: number;
  };
  frames: AttestedFrame[];
}

export type AttestStatus =
  | "verified"
  | "attested"
  | "already-attested"
  | "failed"
  | "changed-since-attestation";

export interface AttestReport {
  schemaVersion: 1;
  kind: "release-attestation-report";
  release: string;
  status: AttestStatus;
  evidence: "backend";
  /** Where the record is, or would be written. */
  record: string;
  frames: number;
  nodes: number;
  layoutDrivenFrames: number;
  problems: string[];
  /** Release boards that differ from the recorded attestation (status changed-since-attestation). */
  changed: string[];
  elapsedMs: number;
  note: string;
}

export function attestationPath(releaseVersion: string): string {
  return `design/releases/${releaseVersion}.attestation.json`;
}

function releasePageName(releaseVersion: string): string {
  return `release/${releaseVersion}`;
}

async function readRecorded(
  root: string,
  releaseVersion: string,
): Promise<ReleaseAttestation | undefined> {
  const file = await resolveProjectOutput(root, attestationPath(releaseVersion));
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  const record = JSON.parse(text) as ReleaseAttestation;
  if (record.kind !== "release-attestation" || record.schemaVersion !== 1) {
    throw new Error(`${attestationPath(releaseVersion)} is not a release attestation record`);
  }
  return record;
}

function sameFrames(left: AttestedFrame[], right: AttestedFrame[]): string[] {
  const recorded = new Map(
    left.map((frame) => [
      frame.releaseFrameId,
      frame,
    ]),
  );
  const changed: string[] = [];
  for (const frame of right) {
    const before = recorded.get(frame.releaseFrameId);
    if (
      !before ||
      before.releaseHash !== frame.releaseHash ||
      before.sourceHash !== frame.sourceHash ||
      before.sourceFrameId !== frame.sourceFrameId
    ) {
      changed.push(frame.name);
    }
  }
  for (const frame of left) {
    if (!right.some((item) => item.releaseFrameId === frame.releaseFrameId)) {
      changed.push(frame.name);
    }
  }
  return changed;
}

/**
 * Proves a release page equals its sources from Penpot's stored data alone and records the owner's words.
 * Reads only; the one write is the attestation record in the project. No board is rendered.
 */
export async function attestRelease(
  root: string,
  request: AttestRequest,
  options: AttestOptions,
): Promise<AttestReport> {
  const started = Date.now();
  const clean = options.redact ?? ((text: string): string => text);
  const releasePage = request.pages.find(
    (page) => page.name === releasePageName(request.releaseVersion),
  );
  if (!releasePage) {
    throw new Error(`The file has no page named release/${request.releaseVersion}`);
  }
  const sourcePages = request.sourcePages?.length
    ? request.sourcePages.map((name) => {
        const page = request.pages.find((item) => item.name === name);
        if (!page) {
          throw new Error(`The file has no page named ${name}`);
        }
        return page;
      })
    : request.pages.filter((page) => !page.name.startsWith("release/"));
  const read = async (page: AttestPage): Promise<BackendObjects> =>
    (await options.backend.getPage(request.fileId, page.id, options.signal)).objects;
  const [releaseObjects, ...sourceObjectsByPage] = await Promise.all([
    read(releasePage),
    ...sourcePages.map(read),
  ]);
  const allObjects: BackendObjects = {
    ...Object.assign({}, ...sourceObjectsByPage),
    ...releaseObjects,
  };
  const candidates = new Map<
    string,
    Array<{
      id: string;
      page: string;
    }>
  >();
  for (const [index, page] of sourcePages.entries()) {
    const objects = sourceObjectsByPage[index]!;
    for (const id of rootBoardIds(objects)) {
      const key = `${objects[id]?.name}\u0000${subtreeSignature(objects, id)}`;
      candidates.set(key, [
        ...(candidates.get(key) ?? []),
        {
          id,
          page: page.name,
        },
      ]);
    }
  }
  const problems: string[] = [];
  const pairs: Array<{
    sourceFrameId: string;
    targetFrameId: string;
    sourcePage: string;
  }> = [];
  for (const id of rootBoardIds(releaseObjects)) {
    const name = String(releaseObjects[id]?.name);
    const matches = candidates.get(`${name}\u0000${subtreeSignature(releaseObjects, id)}`) ?? [];
    if (matches.length === 1) {
      pairs.push({
        sourceFrameId: matches[0]!.id,
        targetFrameId: id,
        sourcePage: matches[0]!.page,
      });
    } else if (matches.length === 0) {
      problems.push(`${name}: no source board with this name and structure`);
    } else {
      problems.push(
        `${name}: ${matches.length} source boards match (${matches.map((match) => match.page).join(", ")}); name the source page with --source-page`,
      );
    }
  }
  const verdict = verifyBackendPairs(
    allObjects,
    allObjects,
    pairs.map((pair) => ({
      sourceFrameId: pair.sourceFrameId,
      targetFrameId: pair.targetFrameId,
    })),
  );
  problems.push(...verdict.problems);
  const drivenFrames = new Set(verdict.layoutDriven.frames);
  const frames: AttestedFrame[] = pairs.map((pair) => ({
    name: String(allObjects[pair.targetFrameId]?.name),
    releaseFrameId: pair.targetFrameId,
    sourceFrameId: pair.sourceFrameId,
    sourcePage: pair.sourcePage,
    releaseHash: observationHash(subtreeObjects(allObjects, pair.targetFrameId)),
    sourceHash: observationHash(subtreeObjects(allObjects, pair.sourceFrameId)),
    nodes: Object.keys(subtreeObjects(allObjects, pair.targetFrameId)).length,
    layoutDriven: drivenFrames.has(pair.sourceFrameId),
  }));
  const record = attestationPath(request.releaseVersion);
  const report = (status: AttestStatus, changed: string[], note: string): AttestReport => ({
    schemaVersion: 1,
    kind: "release-attestation-report",
    release: request.releaseVersion,
    status,
    evidence: "backend",
    record,
    frames: frames.length,
    nodes: verdict.nodes,
    layoutDrivenFrames: drivenFrames.size,
    problems: problems.map(clean),
    changed,
    elapsedMs: Date.now() - started,
    note,
  });
  if (problems.length || !frames.length) {
    return report(
      "failed",
      [],
      "The release page does not match its sources; nothing was recorded. Fix the differences or the page, then run again.",
    );
  }
  const recorded = await readRecorded(root, request.releaseVersion);
  const changed = recorded ? sameFrames(recorded.frames, frames) : [];
  if (recorded && !changed.length) {
    return report(
      "already-attested",
      [],
      `Nothing has changed since ${recorded.attestedAt}: approved by ${recorded.approval.by}.`,
    );
  }
  if (recorded && !options.write?.replace) {
    return report(
      "changed-since-attestation",
      changed,
      options.write
        ? "The release page differs from the recorded attestation. Review the changed boards, then run again with --replace to record new owner words."
        : "The release page differs from the recorded attestation. Review the changed boards; recording again needs --write --replace.",
    );
  }
  if (!options.write) {
    return report(
      "verified",
      [],
      "The release page equals its sources on Penpot's stored data. Nothing was written; add --write --by --note with the owner's words to record it.",
    );
  }
  const attestation: ReleaseAttestation = {
    schemaVersion: 1,
    kind: "release-attestation",
    release: request.releaseVersion,
    penpot: {
      origin: request.origin,
      fileId: request.fileId,
      pageId: releasePage.id,
      page: releasePage.name,
    },
    evidence: "backend",
    attestedAt: (options.now?.() ?? new Date()).toISOString(),
    approval: {
      by: options.write.by,
      note: options.write.note,
    },
    totals: {
      frames: frames.length,
      nodes: verdict.nodes,
      layoutDrivenFrames: drivenFrames.size,
    },
    frames,
  };
  const encoded = `${JSON.stringify(attestation, null, 2)}\n`;
  if (clean(encoded) !== encoded) {
    throw new Error("The attestation needs credential redaction; no record was written");
  }
  const output = await resolveProjectOutput(root, record);
  await mkdir(path.dirname(output), {
    recursive: true,
  });
  // Exclusive unless the owner asked to replace: a first record never overwrites a file that appeared meanwhile.
  await atomicWriteFile(output, encoded, {
    replace: options.write.replace === true,
  });
  return report("attested", [], `Recorded in ${record}.`);
}
