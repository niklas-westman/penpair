import { matchingBaselineReference, validateBaselineReference } from "./baseline-reference.js";
import { selectPage, withPageSession } from "./page-session.js";
import { capturePhase } from "./capture-progress.js";
import { matchingApproval } from "./approvals.js";
import { matchesDesignViewport } from "./design-viewport.js";
import { pngSize } from "./png.js";
import { encodeBaselineImage } from "./image-codec.js";
import { inspectImageEvidence, type BaselineImageFormat } from "./image-evidence.js";
export { pngSize } from "./png.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { PenpotToolClient } from "./client.js";
import { baselineCoverage, type BaselineCoverage } from "./baseline-coverage.js";
import { resolveProjectOutput } from "./project-input.js";
import { validateBaselines, type BaselineCase, type BaselinesConfig } from "./baselines-config.js";
import type { LayoutResult } from "./layout.js";
import { version } from "./version.js";
import { atomicWriteFile } from "./atomic-output.js";
import { observationHash } from "./journal.js";
import { exportShapePng, type CaptureIdentity, type ExportOptions } from "./export.js";
import { runOnPage } from "./operation.js";
import { frames } from "./snippets/read.js";

export * from "./baselines-config.js";

export type BaselineStatus =
  /** No image in the folder yet. */
  | "new"
  /** The image in the folder is byte-identical to the design now. */
  | "same"
  /** The design differs from the image in the folder. Replaced only with `update`. */
  | "changed"
  /** The export never settled (two identical renders in a row), so it is not trusted. */
  | "unstable"
  /** No board matches the configured ID, or no top-level frame matches the name. */
  | "missing"
  /** An ID-resolved board no longer has its configured expected name. */
  | "renamed"
  | "case-mismatch";

export interface ArtifactProvenance extends CaptureIdentity {
  approval?:
    | {
        kind: "owner-words";
        id: string;
        recordHash: string;
      }
    | {
        kind: "forced-reference";
        reason: string;
      };
  case?: BaselineCase;
  layout?: LayoutResult;
  sha256: string;
  capturedAt: string;
  toolVersion: string;
  file: string;
}
export interface BaselineResult {
  /** Resolved configured source; schema-2 records may omit this. */
  source?: {
    page: string;
    pageId: string;
    fileId: string;
    frameId?: string;
    route?: string;
  };
  case?: BaselineCase;
  problems?: string[];
  captured?: ArtifactProvenance;
  approved?:
    | ArtifactProvenance
    | {
        legacy: true;
        sha256: string;
      };
  id: string;
  frame: string;
  frameId?: string;
  width?: number;
  height?: number;
  file: string;
  status: BaselineStatus;
  /** Whether the image was written to the folder in this run. */
  written: boolean;
  /** The image now in the folder: its hash, size in bytes and pixel size. For a design that changed and was not updated this is the old image. */
  sha256?: string;
  bytes?: number;
  imageWidth?: number;
  imageHeight?: number;
}

export interface BaselinesReport {
  coverage: BaselineCoverage;
  complete: boolean;
  fileId: string;
  pageId?: string;
  page?: string;
  pages?: {
    page: string;
    pageId: string;
  }[];
  penpotFile: string;
  revn: number;
  results: BaselineResult[];
  /** Files written: images, the manifest and the generated checks. */
  wrote: string[];
}

export interface BaselinesOptions extends ExportOptions {
  /** Encoding for new references, or the explicit migration target. */
  format?: BaselineImageFormat;
  /** Change an existing reference's encoding; apply also requires update and exact-artifact approval. */
  migrateFormat?: boolean;
  signal?: AbortSignal;
  /** Write images that are new. Without it nothing is written, whatever is found. */
  apply?: boolean;
  /** Also replace images whose design has changed. This is the act of approving the new design as the reference; it is the owner's call. */
  update?: boolean;
  /** Explicit waiver for a changed baseline; retained as a forced reference, never an owner approval. */
  forceReason?: string;
}

const sha = (buffer: Buffer): string => createHash("sha256").update(buffer).digest("hex");

const pageKey = (config: BaselinesConfig, frame: BaselinesConfig["frames"][number]): string =>
  frame.pageId ? `id:${frame.pageId.toLowerCase()}` : `name:${frame.page ?? config.page}`;

async function readIfExists(file: string, maximum = 64 * 1024 * 1024): Promise<Buffer | undefined> {
  try {
    if ((await stat(file)).size > maximum) {
      throw new Error("Baseline artifact exceeds its read budget");
    }
    const bytes = await readFile(file);
    if (bytes.length > maximum) {
      throw new Error("Baseline artifact exceeds its read budget");
    }
    return bytes;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function existingBaseline(
  projectRoot: string,
  config: BaselinesConfig,
  id: string,
  old?: BaselineResult,
): Promise<{
  file?: string;
  bytes?: Buffer;
  format?: BaselineImageFormat;
}> {
  const candidates = old
    ? [
        old.file,
      ]
    : [
        `${id}.png`,
        `${id}.webp`,
      ];
  let found: {
    file?: string;
    bytes?: Buffer;
    format?: BaselineImageFormat;
  } = {};
  for (const file of candidates) {
    if (typeof file !== "string" || path.isAbsolute(file) || file.split(/[\\/]/).includes("..")) {
      throw new Error("Existing baseline path leaves its folder");
    }
    const bytes = await readIfExists(
      await resolveProjectOutput(projectRoot, path.join(config.root, file)),
    );
    if (!bytes) {
      continue;
    }
    if (found.bytes) {
      throw new Error("Existing baseline candidates are ambiguous; inspect before capture");
    }
    found = {
      file,
      bytes,
      format: inspectImageEvidence(bytes).format,
    };
  }
  if (
    old &&
    (!found.bytes ||
      old.sha256 !== sha(found.bytes) ||
      (old.approved && old.approved.sha256 !== old.sha256))
  ) {
    throw new Error(
      "Approved baseline bytes no longer match their manifest; inspect before replacing",
    );
  }
  return found;
}

/** Resolve the exact encoding used by both approval and baseline capture. */
export async function resolveBaselineImageFormat(
  projectRoot: string,
  config: BaselinesConfig,
  baselineId: string,
  options: Pick<BaselinesOptions, "format" | "migrateFormat"> = {},
): Promise<BaselineImageFormat> {
  const target = options.format ?? config.format ?? "webp";
  if (target !== "png" && target !== "webp") {
    throw new Error("Baseline format must be png or webp");
  }
  const manifestPath = await resolveProjectOutput(
    projectRoot,
    path.join(config.root, "penpair-baselines.json"),
  );
  const bytes = await readIfExists(manifestPath, 16 * 1024 * 1024);
  const previous = bytes ? JSON.parse(bytes.toString("utf8")) : undefined;
  if (
    previous &&
    ((previous.schemaVersion !== undefined &&
      previous.schemaVersion !== 2 &&
      previous.schemaVersion !== 3) ||
      !Array.isArray(previous.frames) ||
      previous.frames.length > 1000)
  ) {
    throw new Error("Existing baseline manifest is invalid; preserve and inspect it");
  }
  const old = previous?.frames?.find((entry: BaselineResult) => entry.id === baselineId);
  const existing = await existingBaseline(projectRoot, config, baselineId, old);

  return existing.format && !options.migrateFormat ? existing.format : target;
}

/**
 * Exports the configured frames of a page as images into the project's folder: the approved design that an implementation is
 * checked against. Looks first; writes only with `apply`, and replaces an image that differs only with `update`, so a change of
 * the design never silently becomes the new reference.
 */
export async function exportBaselines(
  client: PenpotToolClient,
  projectRoot: string,
  config: BaselinesConfig,
  options: BaselinesOptions = {},
): Promise<BaselinesReport> {
  return withPageSession(client, () =>
    exportBaselinesInSession(client, projectRoot, config, options),
  );
}

async function exportBaselinesInSession(
  client: PenpotToolClient,
  projectRoot: string,
  config: BaselinesConfig,
  options: BaselinesOptions,
): Promise<BaselinesReport> {
  if (options.format !== undefined && options.format !== "png" && options.format !== "webp") {
    throw new Error("Baseline format must be png or webp");
  }
  if (options.migrateFormat && options.apply && !options.update) {
    throw new Error("Applying a baseline format migration requires update");
  }
  if (
    options.forceReason !== undefined &&
    (!options.update ||
      !options.apply ||
      !options.forceReason.trim() ||
      options.forceReason.length > 2000)
  ) {
    throw new Error("A nonempty force reason requires apply and update");
  }
  config = structuredClone(config);
  validateBaselines(config, (message) => {
    throw new Error(message);
  });
  const groups = new Map<string, typeof config.frames>();
  for (const frame of config.frames) {
    const key = pageKey(config, frame);
    groups.set(key, [
      ...(groups.get(key) ?? []),
      frame,
    ]);
  }
  const listings = new Map<
    string,
    {
      selection: Parameters<typeof frames>[0];
      listing: Awaited<ReturnType<typeof runOnPage>>;
    }
  >();
  for (const [key, selected] of groups) {
    const pageId = selected[0]!.pageId?.toLowerCase();
    const page = pageId ? undefined : (selected[0]!.page ?? config.page);
    options.onStep?.(`selecting baseline page ${pageId ?? page} (${selected.length} frames)`);
    const frameIds = selected.flatMap((entry) =>
      entry.frameId
        ? [
            entry.frameId.toLowerCase(),
          ]
        : [],
    );
    const selection = {
      ...(pageId
        ? {
            pageId,
          }
        : {
            page,
          }),
      ...(frameIds.length
        ? {
            frameIds,
            includeTopLevel: selected.some((entry) => !entry.frameId),
          }
        : {}),
    };
    const listing = await capturePhase(options, "baselines", "selection", async () => {
      if (pageId) {
        await selectPage(
          client,
          {
            id: pageId,
          },
          options,
        );
      }
      return runOnPage(client, frames(selection), page, options);
    });
    if (
      pageId &&
      (listing.pageId !== pageId ||
        typeof listing.page !== "string" ||
        !listing.page ||
        selected.some((frame) => frame.page !== undefined && frame.page !== listing.page))
    ) {
      throw new Error("Baseline page ID and expected page name do not match the observed source");
    }
    if (
      listing.ok !== true ||
      typeof listing.fileId !== "string" ||
      !listing.fileId ||
      typeof listing.pageId !== "string" ||
      !listing.pageId ||
      !Number.isInteger(listing.revn) ||
      !Array.isArray(listing.frames)
    ) {
      throw new Error("Baseline listing lacks file/page/revision evidence");
    }
    if (listing.truncated === true) {
      throw new Error(
        "Baseline frame search truncated at the page shape budget; nothing was captured",
      );
    }
    const first = listings.values().next().value?.listing;
    if (first && (listing.fileId !== first.fileId || listing.revn !== first.revn)) {
      throw new Error("Baseline source changed between pages; nothing was published");
    }
    listings.set(key, {
      selection,
      listing,
    });
  }
  const firstListing = listings.values().next().value!.listing;
  const results: BaselineResult[] = [];
  const wrote: string[] = [];
  const folder = await resolveProjectOutput(projectRoot, config.root);
  const manifestPath = await resolveProjectOutput(
    projectRoot,
    path.join(config.root, "penpair-baselines.json"),
  );
  const previousBytes = await readIfExists(manifestPath, 16 * 1024 * 1024);
  const previous = previousBytes
    ? (JSON.parse(previousBytes.toString("utf8")) as {
        schemaVersion?: number;
        frames?: BaselineResult[];
      })
    : undefined;
  if (
    previous &&
    ((previous.schemaVersion !== undefined &&
      previous.schemaVersion !== 2 &&
      previous.schemaVersion !== 3) ||
      !Array.isArray(previous.frames))
  ) {
    throw new Error("Existing baseline manifest is invalid; preserve and inspect it");
  }
  const runId = randomUUID();
  const generation = `captures/${runId}`;
  const captures = new Map<string, Buffer>();
  const orderedFrames = [
    ...groups.values(),
  ].flat();
  let currentCapturePage: string | undefined;
  for (const [index, wanted] of orderedFrames.entries()) {
    const key = pageKey(config, wanted);
    const listing = listings.get(key)!.listing;
    const page = String(listing.page ?? wanted.page ?? config.page);
    if (wanted.pageId && currentCapturePage !== key) {
      await selectPage(
        client,
        {
          id: wanted.pageId.toLowerCase(),
        },
        options,
      );
    }
    currentCapturePage = key;
    const found = listing.frames as {
      id: string;
      name: string;
      width: number;
      height: number;
      topLevel?: boolean;
    }[];
    const source = {
      page,
      pageId: String(listing.pageId),
      fileId: String(listing.fileId),
      frameId: wanted.frameId,
      route: wanted.route,
    };
    options.signal?.throwIfAborted();
    const old = previous?.frames?.find((entry) => entry.id === wanted.id);
    const existingEvidence = await existingBaseline(projectRoot, config, wanted.id, old);
    const format =
      existingEvidence.format && !options.migrateFormat
        ? existingEvidence.format
        : (options.format ?? config.format ?? "webp");
    const migrating = Boolean(existingEvidence.format && existingEvidence.format !== format);
    const existing = existingEvidence.bytes;
    const file = existingEvidence.file ?? `${wanted.id}.${format}`;
    if (path.isAbsolute(file) || file.split(/[\\/]/).includes("..")) {
      throw new Error("Existing baseline path leaves its folder");
    }
    const matches = found.filter((frame) =>
      wanted.frameId
        ? frame.id.toLowerCase() === wanted.frameId.toLowerCase()
        : frame.topLevel !== false && frame.name === wanted.frame,
    );
    if (!matches.length) {
      results.push({
        ...(wanted.case
          ? {
              case: wanted.case,
            }
          : {}),
        source,
        id: wanted.id,
        frame: wanted.frame ?? wanted.frameId!,
        frameId: wanted.frameId,
        file,
        status: "missing",
        written: false,
      });
      continue;
    }
    if (matches.length > 1) {
      throw new Error(
        `more than one top-level frame on ${page} is named ${JSON.stringify(wanted.frame)}; rename one so the design reference is unambiguous`,
      );
    }
    const frame = matches[0]!;
    if (wanted.frameId && wanted.frame !== undefined && wanted.frame !== frame.name) {
      results.push({
        source,
        id: wanted.id,
        frame: wanted.frame,
        frameId: frame.id,
        case: wanted.case,
        file,
        status: "renamed",
        problems: [
          `Expected frame name ${JSON.stringify(wanted.frame)}; current name is ${JSON.stringify(frame.name)}`,
        ],
        written: false,
      });
      continue;
    }
    options.onStep?.(`exporting ${frame.name} on ${page} (${index + 1}/${config.frames.length})`);
    const exported = await exportShapePng(client, frame.id, {
      ...options,
      onProgress: options.onProgress
        ? (event) =>
            options.onProgress?.({
              ...event,
              command: "baselines",
              message: [
                event.message,
                `page ${page}`,
              ]
                .filter(Boolean)
                .join("; "),
              frame: frame.name,
              index: index + 1,
              total: config.frames.length,
            })
        : undefined,
      page: wanted.pageId ? undefined : page,
      stable: true,
    });
    const base = {
      source: {
        ...source,
        frameId: frame.id,
      },
      ...(wanted.case
        ? {
            case: wanted.case,
          }
        : {}),
      id: wanted.id,
      frame: frame.name,
      frameId: frame.id,
      width: frame.width,
      height: frame.height,
      file,
    };
    if (
      exported.capture.fileId !== listing.fileId ||
      exported.capture.pageId !== listing.pageId ||
      exported.capture.revision !== listing.revn
    ) {
      throw new Error("Baseline source changed during capture; nothing was published");
    }
    if (!exported.stable) {
      results.push({
        ...base,
        status: "unstable",
        written: false,
      });
      continue;
    }
    if (!pngSize(exported.png)) {
      throw new Error("Baseline export is not a PNG with dimensions");
    }
    const encoded = await capturePhase(
      options,
      "baselines",
      "encode",
      () => encodeBaselineImage(exported.png, format),
      frame.name,
    );
    const captured: ArtifactProvenance = {
      ...(wanted.case
        ? {
            case: wanted.case,
          }
        : {}),
      layout: exported.layout,
      ...exported.capture,
      sha256: sha(encoded),
      capturedAt: new Date().toISOString(),
      toolVersion: version,
      file: `${generation}/${wanted.id}.${format}`,
    };
    const caseProblems: string[] = [];
    if (wanted.case) {
      const viewport = wanted.case.viewport;
      const size = pngSize(exported.png)!;
      if (!matchesDesignViewport(exported.capture.designSize, viewport)) {
        caseProblems.push("Observed frame dimensions do not match the declared viewport");
      }
      if (
        size.width !== Math.round(viewport.width * exported.capture.scale) ||
        size.height !== Math.round(viewport.height * exported.capture.scale)
      ) {
        caseProblems.push("PNG dimensions do not match declared viewport and capture scale");
      }
      if (
        wanted.case.activeThemeIds &&
        (!exported.capture.activeThemeIds ||
          observationHash(
            [
              ...wanted.case.activeThemeIds,
            ].sort(),
          ) !==
            observationHash(
              [
                ...exported.capture.activeThemeIds,
              ].sort(),
            ))
      ) {
        caseProblems.push("Active native theme IDs do not match the capture assertion");
      }
    }
    if (caseProblems.length) {
      results.push({
        ...base,
        status: "case-mismatch",
        written: false,
        captured,
        approved: old?.approved,
        sha256: old?.sha256,
        problems: caseProblems,
      });
      continue;
    }
    const oldCase = old?.approved && "case" in old.approved ? old.approved.case : undefined;
    const status: BaselineStatus = !existing
      ? "new"
      : sha(existing) === captured.sha256 &&
          observationHash(oldCase ?? null) === observationHash(wanted.case ?? null) &&
          (!old?.approved ||
            "legacy" in old.approved ||
            (old.approved.fileId === captured.fileId &&
              old.approved.pageId === captured.pageId &&
              old.approved.frameId === captured.frameId &&
              (!old.source ||
                ((wanted.pageId
                  ? old.source.pageId === captured.pageId
                  : old.source.page === page) &&
                  old.source.route === wanted.route))))
        ? "same"
        : "changed";
    if (status === "new" && options.apply) {
      const record = await matchingApproval(
        projectRoot,
        exported.capture,
        captured.sha256,
        wanted.case,
      );
      if (record) {
        captured.approval = {
          kind: "owner-words",
          id: record.id,
          recordHash: record.hash,
        };
      }
    }
    const promoteWaiver =
      status === "same" &&
      old?.approved &&
      "approval" in old.approved &&
      old.approved.approval?.kind === "forced-reference" &&
      options.update === true;
    if ((status === "changed" || promoteWaiver) && options.update && options.apply) {
      const record = await matchingApproval(
        projectRoot,
        exported.capture,
        captured.sha256,
        wanted.case,
      );
      if (record) {
        if (
          old?.source &&
          old.source.route !== wanted.route &&
          old.approved &&
          "approval" in old.approved &&
          old.approved.approval?.kind === "owner-words" &&
          old.approved.approval.id === record.id
        ) {
          throw new Error(
            "Retargeting a baseline route requires fresh owner words; the earlier image approval cannot be reused",
          );
        }
        captured.approval = {
          kind: "owner-words",
          id: record.id,
          recordHash: record.hash,
        };
      } else if (options.forceReason && !migrating) {
        captured.approval = {
          kind: "forced-reference",
          reason: options.forceReason,
        };
      } else {
        throw new Error(
          "Changed baseline requires matching exact-artifact owner words (penpair approve), or an explicit --force-reason waiver; previous artifacts preserved",
        );
      }
    }
    const approve =
      status === "new" ||
      (status === "changed" && options.update === true) ||
      Boolean(promoteWaiver);
    const approved = approve
      ? captured
      : (old?.approved ?? {
          legacy: true as const,
          sha256: sha(existing!),
        });
    const image = approve ? encoded : existing!;
    const size = inspectImageEvidence(image);
    results.push({
      ...base,
      file: approve && options.apply ? captured.file : file,
      status,
      written: false,
      captured,
      approved: options.apply || !approve ? approved : undefined,
      sha256: sha(image),
      bytes: image.length,
      imageWidth: size?.width,
      imageHeight: size?.height,
    });
    captures.set(`${wanted.id}.${format}`, encoded);
  }
  const sourceIdentity = (value: Record<string, unknown>) => ({
    fileId: value.fileId,
    pageId: value.pageId,
    revision: value.revn,
    frames: value.frames,
  });
  for (const { listing, selection } of listings.values()) {
    const after = await capturePhase(options, "baselines", "verify", async () => {
      if (selection.pageId) {
        await selectPage(
          client,
          {
            id: selection.pageId,
          },
          options,
        );
      }
      return runOnPage(client, frames(selection), selection.page, options);
    });
    if (
      after.ok !== true ||
      after.truncated === true ||
      observationHash(sourceIdentity(listing)) !== observationHash(sourceIdentity(after))
    ) {
      throw new Error(
        "Baseline source changed before publication; previous artifacts were preserved",
      );
    }
  }
  const pages = [
    ...new Map(
      [
        ...listings.values(),
      ].map((value) => [
        String(value.listing.pageId),
        {
          page: String(value.listing.page ?? value.selection.page),
          pageId: String(value.listing.pageId),
        },
      ]),
    ).values(),
  ];
  const multiPage = config.frames.some(
    (frame) => frame.page !== undefined || frame.pageId !== undefined,
  );
  const listing = firstListing;
  const complete =
    results.length === config.frames.length &&
    results.every(
      (result) =>
        result.status !== "missing" &&
        result.status !== "renamed" &&
        result.status !== "unstable" &&
        result.status !== "case-mismatch",
    );
  const verifiedReferences = new Map<string, ArtifactProvenance>();
  for (const result of results) {
    const frame = config.frames.find((entry) => entry.id === result.id)!;
    const reference =
      result.status === "new" || (options.update && result.file === result.captured?.file)
        ? matchingBaselineReference(config, frame, result)
        : await validateBaselineReference(projectRoot, config, frame, result);
    if (reference) {
      verifiedReferences.set(frame.id, reference);
    }
  }
  if (options.apply && complete) {
    const evidence = JSON.stringify({
      config,
      results,
      forceReason: options.forceReason,
    });
    if (options.redact && options.redact(evidence) !== evidence) {
      throw new Error(
        "Baseline evidence requires credential redaction; previous artifacts preserved",
      );
    }
    options.signal?.throwIfAborted();
    options.onStep?.("staging complete capture");
    options.signal?.throwIfAborted();
    const captureFolder = await resolveProjectOutput(
      projectRoot,
      path.join(config.root, "captures"),
    );
    await mkdir(captureFolder, {
      recursive: true,
    });
    const staged = path.join(folder, `.stage-${runId}`);
    await mkdir(staged);
    try {
      for (const [file, bytes] of captures) {
        options.signal?.throwIfAborted();
        await capturePhase(options, "baselines", "stage", () =>
          atomicWriteFile(path.join(staged, file), bytes),
        );
        options.onStep?.(`staging ${path.parse(file).name}`);
      }
      const cases = reflectionCases(config, results);
      await writeFile(
        path.join(staged, "reflection-cases.json"),
        `${JSON.stringify(
          {
            ...cases,
            captureId: runId,
          },
          null,
          2,
        )}\n`,
        {
          flag: "wx",
        },
      );
      options.signal?.throwIfAborted();
      await rename(staged, path.join(captureFolder, runId));
      // Immutable generation first. The canonical manifest is the commit point and is published last.
      await capturePhase(options, "baselines", "publish", () =>
        atomicWriteFile(
          path.join(folder, "reflection-cases.json"),
          `${JSON.stringify(
            {
              ...cases,
              captureId: runId,
            },
            null,
            2,
          )}\n`,
          {
            replace: true,
          },
        ),
      );
      options.signal?.throwIfAborted();
      for (const result of results) {
        result.written =
          result.file === result.captured?.file &&
          (result.status === "new" || options.update === true);
      }
      const manifest = {
        schemaVersion: multiPage ? 3 : 2,
        ...(multiPage
          ? {
              pages,
            }
          : {}),
        complete: true,
        captureId: runId,
        penpotFile: listing.file,
        fileId: listing.fileId,
        ...(multiPage
          ? {}
          : {
              page: config.page,
              pageId: listing.pageId,
            }),
        coverage: baselineCoverage(config, results, verifiedReferences),
        capturedRevision: listing.revn,
        casesFile: `${generation}/reflection-cases.json`,
        note: "Capture provenance and approved provenance are separate. Changed references require exact-artifact owner words or a recorded forced-reference waiver.",
        frames: results,
      };
      await capturePhase(options, "baselines", "publish", () =>
        atomicWriteFile(
          path.join(folder, "penpair-baselines.json"),
          `${JSON.stringify(manifest, null, 2)}\n`,
          {
            replace: true,
          },
        ),
      );
      for (const result of results) {
        result.written =
          result.file === result.captured?.file &&
          (result.status === "new" || options.update === true);
        if (result.written) {
          wrote.push(path.join(config.root, result.file));
        }
      }
      wrote.push(
        path.join(config.root, "reflection-cases.json"),
        path.join(config.root, "penpair-baselines.json"),
      );
    } finally {
      await rm(staged, {
        recursive: true,
        force: true,
      });
    }
  }
  return {
    coverage: baselineCoverage(config, results, verifiedReferences),
    complete,
    fileId: String(listing.fileId),
    ...(multiPage
      ? {}
      : {
          pageId: String(listing.pageId),
          page: config.page,
        }),
    pages,
    penpotFile: String(listing.file),
    revn: Number(listing.revn),
    results,
    wrote,
  };
}

/**
 * Visual cases for Reflection, one per frame that names a route: the image's exact size is the viewport (so the capture and the
 * reference have the same dimensions), the image is the baseline, and `ref` joins the check back to the frame.
 * Review-only (`strict: false`): a difference is shown to a person, not failed.
 */
export function reflectionCases(
  config: BaselinesConfig,
  results: BaselineResult[],
): {
  note: string;
  routes: Record<
    string,
    {
      viewports: {
        name: string;
        width: number;
        height: number;
      }[];
    }
  >;
  visualSmoke: Record<string, unknown>[];
  pendingCases: Record<string, unknown>[];
} {
  const routes: Record<
    string,
    {
      viewports: {
        name: string;
        width: number;
        height: number;
      }[];
    }
  > = Object.create(null);
  const visualSmoke: Record<string, unknown>[] = [];
  const pendingCases: Record<string, unknown>[] = [];
  for (const wanted of config.frames) {
    const result = results.find((r) => r.id === wanted.id);
    if (
      !wanted.route ||
      !result ||
      result.imageWidth === undefined ||
      result.imageHeight === undefined
    ) {
      continue;
    }
    if (wanted.case) {
      const approvedCase =
        result.approved && "case" in result.approved ? result.approved.case : undefined;
      pendingCases.push({
        id: wanted.id,
        route: wanted.route,
        case: approvedCase ?? wanted.case,
        baseline: result.file,
        ref: `penpair:${wanted.id}`,
        approvedProvenance: result.approved ?? null,
        captured: result.captured ?? null,
        approvedMetadata: Boolean(
          approvedCase && observationHash(approvedCase) === observationHash(wanted.case),
        ),
        reason:
          "Explicit theme/state/fixture/font setup requires an implementation provider mapping",
        browserVerification: "not-run",
      });
      continue;
    }
    const viewport = {
      name: `design-${result.imageWidth}x${result.imageHeight}`,
      width: result.imageWidth,
      height: result.imageHeight,
    };
    const entry = (routes[wanted.route] ??= {
      viewports: [],
    });
    if (!entry.viewports.some((v) => v.name === viewport.name)) {
      entry.viewports.push(viewport);
    }
    visualSmoke.push({
      id: wanted.id,
      route: wanted.route,
      viewport: viewport.name,
      baselineRoot: config.root,
      baseline: result.file,
      threshold: {
        maxDiffPixelRatio: wanted.threshold ?? config.threshold ?? 0.05,
      },
      strict: false,
      ref: `penpair:${wanted.id}`,
    });
  }
  return {
    note: "Generated by `penpair baselines`. Add each route's viewports to that route in your Reflection config and spread `visualSmoke` into the browser contract; baselineRoot is relative to the Reflection config's folder.",
    routes,
    visualSmoke,
    pendingCases,
  };
}
