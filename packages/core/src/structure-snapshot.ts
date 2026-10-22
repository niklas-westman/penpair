import { withCleanupDeadline } from "./command-result.js";
import {
  withPageSession,
  observePage,
  selectPage,
  rememberPage,
  pinPageSnippet,
} from "./page-session.js";
import { mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { captureInspection, type InspectionDocument } from "./inspection.js";
import { validateDesignInspection } from "./design-spec.js";
import { observationHash } from "./journal.js";
import { atomicWriteFile } from "./atomic-output.js";
import { designDataBlock, resolveProjectInput, resolveProjectOutput } from "./project-input.js";
import { runSnippet, snippet } from "./snippet.js";
import type { ExecuteOptions, PenpotToolClient } from "./client.js";
import { version } from "./version.js";

export interface StructuralPage {
  schemaVersion: 1;
  kind: "page-structure";
  fileId: string;
  pageId: string;
  revision: number;
  name: string;
  nodes: Record<string, unknown>[];
}
export interface StructuralTokens {
  schemaVersion: 1;
  kind: "token-structure";
  fileId: string;
  revision: number;
  sets: Record<string, unknown>[];
  themes: Record<string, unknown>[];
}
export interface StructuralSnapshot {
  schemaVersion: 1;
  kind: "structural-snapshot";
  fileId: string;
  revision: number;
  pages: StructuralPage[];
  tokens: StructuralTokens;
  fidelity: "review-only";
}
export interface StructuralManifest {
  schemaVersion: 1;
  kind: "structural-snapshot-manifest";
  fileId: string;
  revision: number;
  producer: string;
  fidelity: "review-only";
  pages: Array<{
    id: string;
    name: string;
    file: string;
    hash: string;
  }>;
  tokens: {
    file: "tokens.json";
    hash: string;
  };
  hash: string;
}
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(ordered);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [
        k,
        ordered(v),
      ]),
  );
}
export const structuralJson = (value: unknown): string =>
  JSON.stringify(ordered(value), null, 2) + "\n";
export function structuralPage(raw: InspectionDocument, name: string): StructuralPage {
  const capture = validateDesignInspection(raw);
  return {
    schemaVersion: 1,
    kind: "page-structure",
    fileId: capture.fileId,
    pageId: capture.pageId!,
    revision: capture.revision,
    name,
    nodes: structuredClone(capture.nodes).sort((a, b) =>
      String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0,
    ),
  };
}
export function assembleStructuralSnapshot(
  pages: StructuralPage[],
  rawTokens: InspectionDocument,
): StructuralSnapshot {
  if (
    rawTokens.schemaVersion !== 1 ||
    rawTokens.kind !== "token-inspection" ||
    rawTokens.complete !== true ||
    rawTokens.redacted === true ||
    rawTokens.reasons.length ||
    !Array.isArray(rawTokens.sets) ||
    !Array.isArray(rawTokens.themes)
  ) {
    throw new Error("Complete unredacted token inspection required");
  }
  if (
    !pages.length ||
    pages.length > 100 ||
    new Set(pages.map((p) => p.pageId)).size !== pages.length ||
    pages.some((p) => p.fileId !== rawTokens.fileId || p.revision !== rawTokens.revision) ||
    pages.reduce((n, p) => n + p.nodes.length, 0) > 50000
  ) {
    throw new Error("Snapshot identity/revision/page/node budget mismatch");
  }
  for (const page of pages) {
    validateDesignInspection({
      schemaVersion: 1,
      kind: "shape-inspection",
      fileId: page.fileId,
      pageId: page.pageId,
      revision: page.revision,
      complete: true,
      counts: {},
      reasons: [],
      producer: {
        name: "penpair",
        version,
      },
      nodes: page.nodes,
    });
    if (Buffer.byteLength(structuralJson(page)) > 8 * 1024 * 1024) {
      throw new Error("Page snapshot exceeds 8 MiB; no partial snapshot was published");
    }
  }
  const snapshot: StructuralSnapshot = {
    schemaVersion: 1,
    kind: "structural-snapshot",
    fileId: rawTokens.fileId,
    revision: rawTokens.revision,
    pages: structuredClone(pages).sort((a, b) =>
      a.pageId < b.pageId ? -1 : a.pageId > b.pageId ? 1 : 0,
    ),
    tokens: {
      schemaVersion: 1,
      kind: "token-structure",
      fileId: rawTokens.fileId,
      revision: rawTokens.revision,
      sets: structuredClone(rawTokens.sets),
      themes: structuredClone(rawTokens.themes),
    },
    fidelity: "review-only",
  };
  if (
    Buffer.byteLength(structuralJson(snapshot.tokens)) > 8 * 1024 * 1024 ||
    Buffer.byteLength(structuralJson(snapshot)) > 128 * 1024 * 1024
  ) {
    throw new Error("Snapshot token/total byte budget exceeded");
  }
  return snapshot;
}
const listingSnippet = () =>
  snippet(
    "snapshot-pages",
    `
if (penpot.currentFile.pages.length > 100) return {ok:false,message:"Snapshot supports at most 100 pages"};
return {ok:true,fileId:penpot.currentFile.id,revision:penpot.currentFile.revn,pages:penpot.currentFile.pages.map(p=>({id:p.id,name:p.name}))};`,
    {},
    "read",
  );
export interface SnapshotProgress {
  pageId: string;
  stage: "start" | "complete";
  elapsedMs: number;
}
export class SnapshotCaptureError extends Error {
  constructor(
    message: string,
    readonly progress: SnapshotProgress[],
    readonly restorationError?: string,
  ) {
    super(
      message +
        (restorationError ? `; visible-page restoration also failed: ${restorationError}` : ""),
    );
  }
}
export async function captureStructuralSnapshot(
  client: PenpotToolClient,
  options: ExecuteOptions & {
    signal?: AbortSignal;
    onStep?: (message: string) => void;
    onProgress?: (event: SnapshotProgress) => void;
  } = {},
): Promise<StructuralSnapshot> {
  return withPageSession(client, async () => {
    const started = Date.now();
    const progress: SnapshotProgress[] = [];
    const budget = () => {
      const remaining = Math.min(300000, options.timeoutMs ?? 300000) - (Date.now() - started);
      if (remaining < 1) {
        throw new Error("Snapshot collection exceeded time budget");
      }
      return {
        maxTotalBytes: 8 * 1024 * 1024,
        timeoutMs: Math.min(60000, remaining),
      };
    };
    const original = await observePage(client, {
      ...options,
      timeoutMs: budget().timeoutMs,
    });
    rememberPage(client, original);
    let result: StructuralSnapshot | undefined;
    let failure: unknown;
    let restorationError: string | undefined;
    const notify = (pageId: string, stage: SnapshotProgress["stage"]) => {
      const event = {
        pageId,
        stage,
        elapsedMs: Date.now() - started,
      };
      progress.push(event);
      options.onProgress?.(event);
      options.onStep?.(`snapshot ${stage}: page ${pageId} (${event.elapsedMs} ms)`);
    };
    try {
      const before = await runSnippet(client, pinPageSnippet(client, listingSnippet()), {
        ...options,
        timeoutMs: budget().timeoutMs,
      });
      if (
        !Array.isArray(before.pages) ||
        !before.pages.length ||
        typeof before.fileId !== "string" ||
        !Number.isInteger(before.revision)
      ) {
        throw new Error("Snapshot listing identity missing");
      }
      const pages = before.pages as Array<{
        id: string;
        name: string;
      }>;
      if (
        pages.some((p) => typeof p.id !== "string" || !p.id || typeof p.name !== "string") ||
        new Set(pages.map((p) => p.id)).size !== pages.length ||
        new Set(pages.map((p) => p.name)).size !== pages.length
      ) {
        throw new Error("Ambiguous page identity/name; page selection must be explicit and unique");
      }
      const captures: StructuralPage[] = [];
      let nodes = 0;
      for (const page of pages) {
        options.signal?.throwIfAborted();
        notify(page.id, "start");
        await selectPage(
          client,
          {
            id: page.id,
          },
          {
            ...options,
            timeoutMs: budget().timeoutMs,
          },
        );
        const capture = await captureInspection(
          client,
          {
            kind: "shape",
            shapeId: "@page-root",
            page: page.name,
            depth: 10000,
            maxNodes: 50000,
            documentBytes: 8 * 1024 * 1024,
          },
          budget(),
        );
        await observePage(client, {
          ...options,
          timeoutMs: budget().timeoutMs,
        });
        if (
          !capture.complete ||
          capture.kind !== "shape-inspection" ||
          capture.pageId !== page.id
        ) {
          throw new Error(
            `Snapshot page ${page.id} inspection incomplete or selected identity changed`,
          );
        }
        const data = structuralPage(capture as InspectionDocument, page.name);
        nodes += data.nodes.length;
        if (nodes > 50000) {
          throw new Error("Snapshot file exceeds 50000 nodes");
        }
        captures.push(data);
        notify(page.id, "complete");
      }
      const tokens = await captureInspection(
        client,
        {
          kind: "tokens",
          documentBytes: 8 * 1024 * 1024,
        },
        budget(),
      );
      const after = await runSnippet(client, pinPageSnippet(client, listingSnippet()), {
        ...options,
        timeoutMs: budget().timeoutMs,
      });
      if (
        !tokens.complete ||
        tokens.kind !== "token-inspection" ||
        observationHash(before, true) !== observationHash(after, true)
      ) {
        throw new Error("Snapshot source changed or token inspection incomplete");
      }
      result = assembleStructuralSnapshot(captures, tokens as InspectionDocument);
      if (result.fileId !== before.fileId || result.revision !== before.revision) {
        throw new Error("Snapshot source changed during collection");
      }
    } catch (error) {
      failure = error;
    } finally {
      try {
        await withCleanupDeadline(async () => {
          const current = await runSnippet(
            client,
            snippet(
              "restore-page-state",
              "return {ok:true,fileId:penpot.currentFile.id,pageId:penpot.currentPage.id};",
              {},
              "read",
            ),
            {
              retries: 0,
              timeoutMs: 5000,
            },
          );
          if (current.fileId !== original.fileId || typeof current.pageId !== "string") {
            throw new Error("Original file no longer open; cannot restore its visible page");
          }
          rememberPage(client, {
            fileId: original.fileId,
            pageId: current.pageId,
          });
          if (current.pageId !== original.pageId) {
            await selectPage(
              client,
              {
                id: original.pageId,
              },
              {
                timeoutMs: 5000,
              },
            );
          }
        }, 10000);
      } catch (error) {
        restorationError = error instanceof Error ? error.message : String(error);
      }
    }
    if (failure || restorationError) {
      throw new SnapshotCaptureError(
        failure instanceof Error
          ? failure.message
          : failure
            ? String(failure)
            : "Snapshot visible-page restoration failed",
        progress,
        restorationError,
      );
    }
    return result!;
  });
}

async function readBounded(file: string, maximum: number): Promise<unknown> {
  if ((await stat(file)).size > maximum) {
    throw new Error("Structural artifact exceeds byte budget");
  }
  return JSON.parse(await readFile(file, "utf8"));
}
export async function writeStructuralSnapshot(
  root: string,
  out: string,
  snapshot: StructuralSnapshot,
  redact?: (text: string) => string,
): Promise<StructuralManifest> {
  snapshot = assembleStructuralSnapshot(snapshot.pages, {
    ...snapshot.tokens,
    kind: "token-inspection",
    pageId: null,
    complete: true,
    reasons: [],
    counts: {},
    producer: {
      name: "penpair",
      version,
    },
  });
  const pointer = await resolveProjectOutput(root, path.join(out, "snapshot.json"));
  await mkdir(path.dirname(pointer), {
    recursive: true,
  });
  const lock = await open(pointer + ".lock", "wx", 0o600);
  try {
    return await publishStructuralSnapshot(root, out, snapshot, redact);
  } finally {
    await lock.close();
    await unlink(pointer + ".lock");
  }
}
async function publishStructuralSnapshot(
  root: string,
  out: string,
  snapshot: StructuralSnapshot,
  redact?: (text: string) => string,
): Promise<StructuralManifest> {
  const artifacts = new Map<string, unknown>();
  const pages = snapshot.pages.map((page) => {
    const file = `page-${observationHash(page.pageId).slice(0, 16)}.json`;
    artifacts.set(file, page);
    return {
      id: page.pageId,
      name: page.name,
      file,
      hash: observationHash(page),
    };
  });
  artifacts.set("tokens.json", snapshot.tokens);
  const body = {
    schemaVersion: 1 as const,
    kind: "structural-snapshot-manifest" as const,
    fileId: snapshot.fileId,
    revision: snapshot.revision,
    producer: `penpair@${version}`,
    fidelity: "review-only" as const,
    pages,
    tokens: {
      file: "tokens.json" as const,
      hash: observationHash(snapshot.tokens),
    },
  };
  const manifest = {
    ...body,
    hash: observationHash(body),
  };
  const encoded = structuralJson({
    manifest,
    artifacts: [
      ...artifacts,
    ],
  });
  if (redact && redact(encoded) !== encoded) {
    throw new Error("Snapshot evidence requires redaction; previous artifacts preserved");
  }
  const pointer = await resolveProjectOutput(root, path.join(out, "snapshot.json"));
  try {
    const old = await readStructuralSnapshot(root, out);
    if (old.fileId !== snapshot.fileId || old.revision > snapshot.revision) {
      throw new Error("Refusing to replace another file's or newer structural snapshot");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  for (const [file, data] of artifacts) {
    const target = await resolveProjectOutput(
      root,
      path.join(out, "generations", manifest.hash, file),
    );
    await mkdir(path.dirname(target), {
      recursive: true,
    });
    try {
      await atomicWriteFile(target, structuralJson(data));
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "EEXIST" ||
        observationHash(await readBounded(target, 8 * 1024 * 1024)) !== observationHash(data)
      ) {
        throw error;
      }
    }
  }
  await atomicWriteFile(pointer, structuralJson(manifest), {
    replace: true,
  });
  return manifest;
}
export async function readStructuralSnapshot(
  root: string,
  folder: string,
): Promise<StructuralSnapshot> {
  const manifest = (await readBounded(
    await resolveProjectInput(root, path.join(folder, "snapshot.json")),
    1024 * 1024,
  )) as StructuralManifest;
  const { hash, ...body } = manifest;
  if (
    manifest.schemaVersion !== 1 ||
    manifest.kind !== "structural-snapshot-manifest" ||
    manifest.fidelity !== "review-only" ||
    !/^[a-f0-9]{64}$/.test(hash) ||
    hash !== observationHash(body) ||
    !Array.isArray(manifest.pages) ||
    !manifest.pages.length ||
    manifest.pages.length > 100 ||
    manifest.tokens.file !== "tokens.json"
  ) {
    throw new Error("Unsupported or altered structural manifest");
  }
  const read = async (file: string, expected: string) => {
    const data = await readBounded(
      await resolveProjectInput(root, path.join(folder, "generations", hash, file)),
      8 * 1024 * 1024,
    );
    if (observationHash(data) !== expected) {
      throw new Error("Structural artifact hash mismatch");
    }
    return data;
  };
  const pages: StructuralPage[] = [];
  for (const entry of manifest.pages) {
    if (!/^page-[a-f0-9]{16}\.json$/.test(entry.file)) {
      throw new Error("Invalid structural page artifact path");
    }
    const page = (await read(entry.file, entry.hash)) as StructuralPage;
    if (
      page.kind !== "page-structure" ||
      page.pageId !== entry.id ||
      page.name !== entry.name ||
      page.fileId !== manifest.fileId ||
      page.revision !== manifest.revision
    ) {
      throw new Error("Structural page identity mismatch");
    }
    pages.push(page);
  }
  const tokens = (await read("tokens.json", manifest.tokens.hash)) as StructuralTokens;
  if (
    tokens.kind !== "token-structure" ||
    tokens.fileId !== manifest.fileId ||
    tokens.revision !== manifest.revision
  ) {
    throw new Error("Structural token identity mismatch");
  }
  return assembleStructuralSnapshot(pages, {
    ...tokens,
    kind: "token-inspection",
    pageId: null,
    complete: true,
    reasons: [],
    counts: {},
    producer: {
      name: "penpair",
      version,
    },
  });
}
export function diffStructuralSnapshots(
  before: StructuralSnapshot,
  after: StructuralSnapshot,
  limit = 1000,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) {
    throw new Error("Structural diff limit must be 1–10000");
  }
  if (before.fileId !== after.fileId) {
    throw new Error(
      "Structural snapshots belong to different files; identities are not comparable",
    );
  }
  const changes: Array<{
    kind: string;
    pageId?: string;
    nodeId?: string;
    before: unknown;
    after: unknown;
  }> = [];
  let totalChanges = 0;
  const add = (change: (typeof changes)[number]) => {
    totalChanges++;
    if (changes.length < limit) {
      changes.push(change);
    }
  };
  const oldPages = new Map(
    before.pages.map((p) => [
      p.pageId,
      p,
    ]),
  );
  const newPages = new Map(
    after.pages.map((p) => [
      p.pageId,
      p,
    ]),
  );
  for (const id of [
    ...new Set([
      ...oldPages.keys(),
      ...newPages.keys(),
    ]),
  ].sort()) {
    const a = oldPages.get(id);
    const b = newPages.get(id);
    if (!a || !b) {
      add({
        kind: a ? "page-removed" : "page-added",
        pageId: id,
        before: a ?? null,
        after: b ?? null,
      });
      continue;
    }
    if (a.name !== b.name) {
      add({
        kind: "page-name",
        pageId: id,
        before: a.name,
        after: b.name,
      });
    }
    const oldNodes = new Map(
      a.nodes.map((n) => [
        n.id,
        n,
      ]),
    );
    const newNodes = new Map(
      b.nodes.map((n) => [
        n.id,
        n,
      ]),
    );
    for (const nodeId of [
      ...new Set([
        ...oldNodes.keys(),
        ...newNodes.keys(),
      ]),
    ].sort()) {
      const x = oldNodes.get(nodeId);
      const y = newNodes.get(nodeId);
      if (!x || !y) {
        add({
          kind: x ? "node-removed" : "node-added",
          pageId: id,
          nodeId: String(nodeId),
          before: x ?? null,
          after: y ?? null,
        });
        continue;
      }
      for (const key of [
        ...new Set([
          ...Object.keys(x),
          ...Object.keys(y),
        ]),
      ].sort()) {
        if (observationHash(x[key] ?? null) !== observationHash(y[key] ?? null)) {
          add({
            kind: key,
            pageId: id,
            nodeId: String(nodeId),
            before: x[key] ?? null,
            after: y[key] ?? null,
          });
        }
      }
    }
  }
  if (
    observationHash(before.tokens.sets) !== observationHash(after.tokens.sets) ||
    observationHash(before.tokens.themes) !== observationHash(after.tokens.themes)
  ) {
    add({
      kind: "tokens",
      before: before.tokens,
      after: after.tokens,
    });
  }
  return {
    schemaVersion: 1,
    kind: "structural-diff",
    fileId: before.fileId,
    beforeRevision: before.revision,
    afterRevision: after.revision,
    totalChanges,
    complete: totalChanges <= limit,
    changes,
    fidelity: "review-only",
  };
}
export const renderStructuralDiff = (diff: ReturnType<typeof diffStructuralSnapshots>): string =>
  "# Structural design diff\n\nReview evidence; not a full-fidelity backup or restore archive.\n\n" +
  designDataBlock(diff);
