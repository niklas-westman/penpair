import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile } from "../atomic-output.js";
import { readProjectBytes } from "../bounded-file.js";
import { CommandArgumentError, parseCommandArgs } from "../cli-arguments.js";
import type { PenpotToolClient } from "../client.js";
import { observationHash } from "../journal.js";
import { exportShapePng, type ExportResult } from "../export.js";
import { inspectImageEvidence, maximumImageBytes } from "../image-evidence.js";
import {
  acceptMapProposal,
  buildMapContext,
  buildMapDrawingPlan,
  createArtifactReview,
  findArtifactReview,
  hashMapContract,
  maxMapBytes,
  observeMapSources,
  readArtifactReviews,
  readMapContract,
  readMapProposal,
  renderMapMarkdown,
  renderMapMermaid,
  verifyArtifactReviewEvidence,
  writeArtifactReview,
  writeMapContract,
  writeMapProposal,
} from "../maps/index.js";
import type { MapContract, MapKind, MapProposal } from "../maps/types.js";
import {
  acceptMapPresentationProposal,
  createMapPresentationProposal,
  drawingFromPlan,
  importMapProposal,
  preserveMapPresentation,
  validateMapPresentationProposal,
  validateNativeMapProjection,
  nativeProposalToMapProposal,
  publishMap,
  readProjection,
  resolveMapDetails,
} from "../map-penpot/index.js";
import type { MapTarget, NativeMapProjection } from "../map-penpot/types.js";
import { resolveProjectOutput } from "../project-input.js";
import { runSnippet, snippet } from "../snippet.js";
import type { DesignCommandContext } from "./context.js";

const actions = {
  check: [
    "live",
    "projection",
    "reviews",
  ],
  render: [
    "out",
  ],
  publish: [
    "page-id",
    "board-id",
    "projection",
    "apply",
    "resume",
  ],
  import: [
    "page-id",
    "board-id",
    "projection",
    "out",
  ],
  accept: [
    "projection",
    "proposal",
    "write",
  ],
  approve: [
    "projection",
    "reviews",
    "write",
    "by",
    "note",
  ],
  context: [
    "reviews",
    "out",
    "draft",
  ],
} as const;

type Action = keyof typeof actions;

const booleanOptions = new Set([
  "live",
  "apply",
  "write",
  "draft",
  "json",
  "help",
]);

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function savedProjection(
  root: string,
  file: string,
  map: MapContract,
): Promise<NativeMapProjection | undefined> {
  let bytes: Buffer;
  try {
    bytes = await readProjectBytes(root, file, maxMapBytes);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  return mapProjection(JSON.parse(bytes.toString("utf8")), map);
}

function mapProjection(raw: unknown, map: MapContract): NativeMapProjection {
  const value = validateNativeMapProjection(raw);
  if (value.mapId !== `${map.kind}:${map.id}` || !value.boardId || value.shapes.length > 10000) {
    throw new Error("Saved projection belongs to another map or exceeds the node budget");
  }
  return value;
}

interface NativeProposalObservation {
  schemaVersion: 1;
  kind: "native-map-proposal-observation";
  proposalHash: string;
  baselineFingerprint: string;
  projection: NativeMapProjection;
}

async function nativeProposalObservation(
  context: DesignCommandContext,
  file: string,
  proposal: MapProposal,
  map: MapContract,
): Promise<NativeProposalObservation | undefined> {
  let bytes: Buffer;
  try {
    bytes = await readProjectBytes(context.root, `${file}.native.json`, maxMapBytes);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  const raw = JSON.parse(bytes.toString("utf8")) as NativeProposalObservation;
  if (
    !raw ||
    raw.schemaVersion !== 1 ||
    raw.kind !== "native-map-proposal-observation" ||
    raw.proposalHash !== proposal.hash ||
    !/^[a-f0-9]{64}$/.test(raw.baselineFingerprint)
  ) {
    throw new Error("Native proposal observation does not match the exact canonical proposal");
  }
  const projection = mapProjection(raw.projection, map);
  if (projection.contractHash !== proposal.baseHash) {
    throw new Error("Native proposal observation differs from the canonical base contract");
  }
  return {
    ...raw,
    projection,
  };
}

async function outputTarget(
  context: DesignCommandContext,
  file: string,
  source: string,
): Promise<string> {
  const target = await resolveProjectOutput(context.root, file);
  const map = await readMapContract(context.root, source);
  const inputs = [
    source,
    ...map.sources.flatMap((entry) =>
      entry.path
        ? [
            entry.path,
          ]
        : [],
    ),
    ...(map.journey
      ? [
          map.journey.path,
        ]
      : []),
  ];
  for (const input of inputs) {
    if (target === (await resolveProjectOutput(context.root, input))) {
      throw new Error(
        "Generated map output cannot replace the canonical contract or its source evidence",
      );
    }
  }
  return target;
}

async function writeOutput(
  context: DesignCommandContext,
  file: string,
  value: unknown,
  source: string,
  replace = false,
): Promise<void> {
  const target = await outputTarget(context, file, source);
  const bytes = Buffer.isBuffer(value)
    ? value
    : typeof value === "string"
      ? value
      : `${JSON.stringify(value, null, 2)}\n`;
  if (!Buffer.isBuffer(bytes) && context.redact(bytes) !== bytes) {
    throw new Error("Map output requires credential redaction; no output was written");
  }
  await mkdir(path.dirname(target), {
    recursive: true,
  });
  try {
    await atomicWriteFile(target, bytes, {
      replace,
    });
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code !== "EEXIST" ||
      !(await readProjectBytes(context.root, file, Math.max(1, Buffer.byteLength(bytes)))).equals(
        Buffer.from(bytes),
      )
    ) {
      throw error;
    }
  }
}

async function persistNativeEvidence(
  context: DesignCommandContext,
  source: string,
  projectionFile: string,
  map: MapContract,
  projection: NativeMapProjection,
  image: ExportResult,
): Promise<{
  path: string;
  sha256: string;
}> {
  if (
    !image.stable ||
    inspectImageEvidence(image.png).format !== "png" ||
    image.capture.fileId !== projection.fileId ||
    image.capture.pageId !== projection.pageId ||
    image.capture.frameId !== projection.boardId
  ) {
    throw new Error(
      "Native map evidence requires a stable original PNG bound to the observed target",
    );
  }
  const imageHash = sha256(image.png);
  const evidence = {
    path: path.posix.join(path.posix.dirname(source), `map-evidence/${imageHash}.png`),
    sha256: imageHash,
  };
  await writeOutput(context, evidence.path, image.png, source);
  await writeOutput(
    context,
    `${projectionFile}.evidence.json`,
    {
      projectionHash: projection.fingerprint,
      contractHash: hashMapContract(map),
      image: evidence,
      capture: image.capture,
      visualReviewRequired: true,
    },
    source,
    true,
  );
  await writeOutput(context, projectionFile, projection, source, true);
  return evidence;
}

async function liveTarget(
  client: PenpotToolClient,
  pageId: string,
  boardId?: string,
): Promise<MapTarget> {
  const current = await runSnippet(
    client,
    snippet("map-target", "return {ok:true,fileId:penpot.currentFile.id};", {}, "read"),
  );
  if (typeof current.fileId !== "string" || !current.fileId) {
    throw new Error("Map target requires an independently observed file ID");
  }
  return {
    fileId: current.fileId,
    pageId,
    ...(boardId
      ? {
          boardId,
        }
      : {}),
  };
}

async function mapEvidence(
  context: DesignCommandContext,
  map: MapContract,
  reviewsFile: string,
  projectionFile: string,
) {
  const reviews = await readArtifactReviews(context.root, reviewsFile);
  const review = findArtifactReview(reviews, map.kind, map.id, hashMapContract(map));
  const native = await savedProjection(context.root, projectionFile, map);
  const nativeBound =
    !native || review?.artifacts?.some((artifact) => artifact.path === projectionFile);
  const reviewEvidenceValid =
    !!nativeBound && !!review && (await verifyArtifactReviewEvidence(context.root, review));
  const observation = await observeMapSources(context.root, map);
  return {
    reviews,
    ...observation,
    reviewEvidenceValid,
  };
}

async function mapStatus(
  context: DesignCommandContext,
  map: MapContract,
  reviewsFile: string,
  projectionFile: string,
) {
  const evidence = await mapEvidence(context, map, reviewsFile, projectionFile);
  const detailReadiness: Record<string, boolean> = Object.create(null);
  let nestedDetails = false;
  for (const [sourceId, child] of Object.entries(evidence.detailMaps)) {
    if (child.nodes.some((node) => node.kind === "detail-link")) {
      detailReadiness[sourceId] = false;
      nestedDetails = true;
      continue;
    }
    const source = map.sources.find((entry) => entry.id === sourceId)!;
    const directory = path.posix.dirname(source.path!);
    const childEvidence = await mapEvidence(
      context,
      child,
      path.posix.join(directory, "reviews.json"),
      path.posix.join(directory, "projection.json"),
    );
    const childContext = buildMapContext(child, {
      ...childEvidence,
      maxBytes: 128 * 1024,
      maxItems: 1000,
    });
    detailReadiness[sourceId] = childContext.ready;
  }
  const result = buildMapContext(map, {
    ...evidence,
    detailReadiness,
    maxBytes: 128 * 1024 - (nestedDetails ? 256 : 0),
    maxItems: 1000,
  });
  if (nestedDetails) {
    result.reasons.push(
      "Nested detail review readiness is not assessed by this command; use finalized design-release context.",
    );
  }
  return result;
}

/** Explicit local artifact actions remain offline; native publication is preview-only until --apply. */
export async function runMapCommand(
  kind: MapKind,
  args: string[],
  context: DesignCommandContext,
): Promise<number> {
  const help = `penpair ${kind} ACTION --from FILE
  check [--live --projection FILE] [--reviews FILE]
  render [--out DIR]
  publish --page-id ID [--board-id ID] [--projection FILE] [--apply [--resume RUN_ID]]
  import --board-id ID --out PROPOSAL [--page-id ID] [--projection FILE]
  accept --proposal FILE --write [--projection FILE]
  approve [--projection FILE] [--reviews FILE] [--write --by OWNER --note EXACTWORDS]
  context [--reviews FILE] [--out FILE] [--draft]
Native publication previews by default. Captured source paths establish offline freshness;
--live checks the managed map projection only. Approval records supplied owner words.`;
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    context.output.log(help);
    return 0;
  }
  const action = args[0] as Action;
  if (!Object.hasOwn(actions, action)) {
    throw new CommandArgumentError(
      `${kind} requires check, render, publish, import, accept, approve or context`,
    );
  }
  const allowed = [
    "from",
    "json",
    "help",
    ...actions[action],
  ];
  const options = Object.fromEntries(
    allowed.map((name) => [
      name,
      {
        type: booleanOptions.has(name) ? ("boolean" as const) : ("string" as const),
      },
    ]),
  );
  const parsed = parseCommandArgs({
    args: args.slice(1),
    options,
    strict: true,
    allowPositionals: false,
  });
  const values = parsed.values as Record<string, string | boolean | undefined>;
  if (values.help) {
    context.output.log(help);
    return 0;
  }
  if (Object.values(values).some((value) => typeof value === "string" && !value.trim())) {
    throw new CommandArgumentError("Map flags require nonempty values");
  }
  if (action === "check" && values.projection && !values.live) {
    throw new CommandArgumentError("Map check --projection requires --live");
  }
  const stringValue = (name: string): string | undefined =>
    typeof values[name] === "string" ? (values[name] as string) : undefined;
  const from = stringValue("from");
  if (!from) {
    throw new CommandArgumentError(`${kind} ${action} requires --from FILE`);
  }
  if (
    action === "approve" &&
    ((values.write && (!stringValue("by")?.trim() || !stringValue("note")?.trim())) ||
      (!values.write && (values.by || values.note)))
  ) {
    throw new CommandArgumentError(
      "Map approval --write requires --by OWNER and --note EXACTWORDS; preview takes neither",
    );
  }
  if (action === "accept" && (!values.write || !stringValue("proposal"))) {
    throw new CommandArgumentError("Map acceptance requires --proposal FILE --write");
  }
  if (action === "publish" && values.resume && !values.apply) {
    throw new CommandArgumentError(
      "Map publication --resume requires --apply and the original target flags",
    );
  }
  if (action === "publish" && !stringValue("page-id")) {
    throw new CommandArgumentError("Map publication requires --page-id ID");
  }
  if (action === "import" && (!stringValue("board-id") || !stringValue("out"))) {
    throw new CommandArgumentError("Native map import requires --board-id ID --out PROPOSAL");
  }
  const map = await readMapContract(context.root, from);
  if (map.kind !== kind) {
    throw new CommandArgumentError(`${kind} cannot process a ${map.kind} contract`);
  }
  const sibling = (name: string) => path.posix.join(path.posix.dirname(from), name);
  const projectionFile = stringValue("projection") ?? sibling("projection.json");
  const reviewsFile = stringValue("reviews") ?? sibling("reviews.json");
  const emit = (value: unknown) => {
    context.output.result(value);
    context.output.log(JSON.stringify(value, null, 2));
  };
  const sourceObservation = await observeMapSources(context.root, map);
  const plan = buildMapDrawingPlan(map, sourceObservation.detailMaps);

  if (action === "render") {
    const result = {
      markdown: renderMapMarkdown(map),
      mermaid: renderMapMermaid(map),
      plan,
    };
    const out = stringValue("out");
    if (out) {
      for (const [name, value] of [
        [
          "map.md",
          result.markdown,
        ],
        [
          "map.mmd",
          result.mermaid,
        ],
        [
          "drawing-plan.json",
          plan,
        ],
      ] as const) {
        await writeOutput(context, path.posix.join(out, name), value, from, true);
      }
    }
    emit(result);
    return plan.complete ? 0 : 3;
  }
  if (action === "accept") {
    const rawProposal = JSON.parse(
      (await readProjectBytes(context.root, stringValue("proposal")!, maxMapBytes)).toString(
        "utf8",
      ),
    ) as {
      kind?: unknown;
    };
    if (rawProposal?.kind === "map-presentation-proposal") {
      const proposal = validateMapPresentationProposal(rawProposal);
      const baseline = await savedProjection(context.root, projectionFile, map);
      if (!baseline) {
        throw new Error("Presentation acceptance requires the saved native baseline projection");
      }
      const resolvedDrawing = await resolveMapDetails(context.root, drawingFromPlan(plan));
      const adopted = acceptMapPresentationProposal(map, baseline, proposal, resolvedDrawing);
      await outputTarget(context, projectionFile, from);
      await outputTarget(context, `${projectionFile}.evidence.json`, from);
      return context.withPenpot(async (client) => {
        const target = {
          fileId: adopted.fileId,
          pageId: adopted.pageId,
          boardId: adopted.boardId!,
        };
        const current = await readProjection(client, target, adopted.mapId);
        if (current.fingerprint !== proposal.observedProjectionHash) {
          throw new Error(
            "Native presentation changed after import; inspect and import a fresh proposal",
          );
        }
        const image = await exportShapePng(client, adopted.boardId!, {
          stable: true,
        });
        const after = await readProjection(client, target, adopted.mapId);
        if (
          after.fingerprint !== current.fingerprint ||
          hashMapContract(await readMapContract(context.root, from)) !== proposal.baseContractHash
        ) {
          throw new Error(
            "Map changed during presentation acceptance; saved baseline was preserved",
          );
        }
        const evidence = await persistNativeEvidence(
          context,
          from,
          projectionFile,
          map,
          adopted,
          image,
        );
        emit({
          kind: "map-presentation-acceptance",
          mapHash: hashMapContract(map),
          canonicalChanged: false,
          reviewed: false,
          projection: adopted,
          image: evidence,
          visualReviewRequired: true,
        });
        return 0;
      });
    }
    const proposalFile = stringValue("proposal")!;
    const proposal = await readMapProposal(context.root, proposalFile);
    const native = await nativeProposalObservation(context, proposalFile, proposal, map);
    if (native) {
      const baseline = await savedProjection(context.root, projectionFile, map);
      const currentHash = hashMapContract(map);
      const recovering = currentHash === proposal.proposedHash;
      if (
        !baseline ||
        ![
          native.baselineFingerprint,
          ...(recovering
            ? [
                native.projection.fingerprint,
              ]
            : []),
        ].includes(baseline.fingerprint) ||
        baseline.fileId !== native.projection.fileId ||
        baseline.pageId !== native.projection.pageId ||
        baseline.boardId !== native.projection.boardId
      ) {
        throw new Error("Native proposal baseline changed; inspect and import a fresh proposal");
      }
      const accepted = recovering ? proposal.proposedMap : acceptMapProposal(map, proposal);
      await outputTarget(context, projectionFile, from);
      return context.withPenpot(async (client) => {
        const observed = native.projection;
        const live = await readProjection(
          client,
          {
            fileId: observed.fileId,
            pageId: observed.pageId,
            boardId: observed.boardId!,
          },
          observed.mapId,
        );
        if (live.fingerprint !== observed.fingerprint || live.conflicts.length) {
          throw new Error(
            "Native map changed after import; canonical contract and saved baseline were preserved",
          );
        }
        if (!recovering) {
          await writeMapContract(context.root, from, accepted, {
            replace: true,
            expectedHash: proposal.baseHash,
            redact: context.redact,
          });
        }
        try {
          await writeOutput(context, projectionFile, observed, from, true);
        } catch (error) {
          throw new Error(
            "Canonical proposal accepted but native baseline was not saved; rerun accept with the same proposal to reconcile safely",
            {
              cause: error,
            },
          );
        }
        emit({
          kind: "map-acceptance",
          mapHash: hashMapContract(accepted),
          previousHash: proposal.baseHash,
          reviewed: false,
          nativeBaselineAdopted: true,
          recovered: recovering,
          nativePublicationRequired: true,
        });
        return 0;
      });
    }
    const accepted = acceptMapProposal(map, proposal);
    await writeMapContract(context.root, from, accepted, {
      replace: true,
      expectedHash: hashMapContract(map),
      redact: context.redact,
    });
    emit({
      kind: "map-acceptance",
      mapHash: hashMapContract(accepted),
      previousHash: hashMapContract(map),
      reviewed: false,
    });
    return 0;
  }
  if (action === "check" || action === "context") {
    const status = await mapStatus(context, map, reviewsFile, projectionFile);
    if (action === "check" && values.live) {
      const expected = await savedProjection(context.root, projectionFile, map);
      if (!expected) {
        throw new Error("Live map checking requires a saved native projection");
      }
      const current = await context.withPenpot((client) =>
        readProjection(
          client,
          {
            fileId: expected.fileId,
            pageId: expected.pageId,
            boardId: expected.boardId!,
          },
          expected.mapId,
        ),
      );
      const matches =
        current.fingerprint === expected.fingerprint &&
        current.contractHash === hashMapContract(map) &&
        !current.conflicts.length;
      emit({
        ...status,
        live: {
          scope: "managed-map-projection",
          sources: "not-live-assessed",
          matches,
          projection: current,
        },
        ready: status.ready && matches,
      });
      return status.ready && matches && !status.truncated ? 0 : 3;
    }
    if (action === "context" && !status.ready && !values.draft) {
      throw new Error(
        `Approved current map context is unavailable: ${status.reasons.join("; ")}. Use --draft to inspect explicitly unapproved context.`,
      );
    }
    if (stringValue("out")) {
      await writeOutput(context, stringValue("out")!, status, from, true);
    }
    emit(status);
    return status.ready && !status.truncated ? 0 : 3;
  }
  const expected = await savedProjection(context.root, projectionFile, map);
  if (action === "publish" || action === "import") {
    if (!plan.complete) {
      throw new Error(`Native drawing plan is incomplete: ${plan.reasons.join("; ")}`);
    }
    const resolvedDrawing = await resolveMapDetails(context.root, drawingFromPlan(plan));
    const drawing = expected ? preserveMapPresentation(resolvedDrawing, expected) : resolvedDrawing;
    if (action === "import" && !expected) {
      throw new Error("Native import requires the last saved native projection");
    }
    const pageId = stringValue("page-id") ?? expected?.pageId;
    if (!pageId) {
      throw new CommandArgumentError("Native map target requires --page-id ID");
    }
    const boardId = stringValue("board-id") ?? expected?.boardId ?? undefined;
    if (expected && (expected.pageId !== pageId || (boardId && expected.boardId !== boardId))) {
      throw new Error("Saved projection belongs to another native target");
    }
    await outputTarget(context, projectionFile, from);
    if (values.apply) {
      await outputTarget(context, `${projectionFile}.evidence.json`, from);
    }
    if (stringValue("out")) {
      await outputTarget(context, stringValue("out")!, from);
      await outputTarget(context, `${stringValue("out")!}.native.json`, from);
    }
    return context.withPenpot(async (client) => {
      const target = await liveTarget(client, pageId, boardId);
      if (expected && target.fileId !== expected.fileId) {
        throw new Error("Saved projection belongs to another Penpot file");
      }
      if (action === "import") {
        const current = await readProjection(client, target, drawing.mapId);
        const imported = importMapProposal(drawing, current, expected);
        const presentationOnly =
          !imported.changes.length &&
          !imported.edgeChanges.length &&
          !imported.title &&
          !imported.metadataChanges &&
          !imported.findings.length;
        const proposal = presentationOnly
          ? createMapPresentationProposal(map, drawing, current, expected!)
          : nativeProposalToMapProposal(map, drawing, current, expected);
        if (proposal.kind === "map-presentation-proposal") {
          await writeOutput(context, stringValue("out")!, proposal, from);
        } else {
          await writeOutput(
            context,
            `${stringValue("out")!}.native.json`,
            {
              schemaVersion: 1,
              kind: "native-map-proposal-observation",
              proposalHash: proposal.hash,
              baselineFingerprint: expected!.fingerprint,
              projection: current,
            },
            from,
          );
          await writeMapProposal(context.root, stringValue("out")!, proposal, {
            redact: context.redact,
          });
        }
        emit(proposal);
        return 0;
      }
      const result = await publishMap(client, target, drawing, {
        apply: values.apply === true,
        expected,
        journal: {
          root: context.root,
          redact: context.redact,
          ...(stringValue("resume")
            ? {
                runId: stringValue("resume")!,
                resume: true,
              }
            : {}),
        },
      });
      let evidence:
        | {
            path: string;
            sha256: string;
          }
        | undefined;
      if (values.apply && result.report.verified) {
        if (!result.image) {
          throw new Error("Applied native map has no export evidence; projection was not saved");
        }
        evidence = await persistNativeEvidence(
          context,
          from,
          projectionFile,
          map,
          result.projection,
          result.image,
        );
      }
      const { image: _image, ...report } = result;
      emit({
        ...report,
        ...(evidence
          ? {
              image: evidence,
            }
          : {}),
      });
      return values.apply ? (result.report.verified ? 0 : 3) : 0;
    });
  }
  const status = await mapStatus(context, map, reviewsFile, projectionFile);
  const bundle = {
    mapHash: hashMapContract(map),
    markdown: renderMapMarkdown(map),
    mermaid: renderMapMermaid(map),
    plan,
  };
  const nativeArtifactPaths: string[] = [];
  let nativeEvidence: unknown;
  if (expected) {
    if (expected.contractHash !== hashMapContract(map) || expected.conflicts.length) {
      throw new Error(
        "Published projection does not match the current map; publish and review it again",
      );
    }
    const evidenceFile = `${projectionFile}.evidence.json`;
    const evidence = JSON.parse(
      (await readProjectBytes(context.root, evidenceFile, maxMapBytes)).toString("utf8"),
    ) as {
      projectionHash: string;
      contractHash: string;
      image: {
        path: string;
        sha256: string;
      };
    };
    if (
      evidence.projectionHash !== expected.fingerprint ||
      evidence.contractHash !== hashMapContract(map) ||
      !evidence.image ||
      sha256(await readProjectBytes(context.root, evidence.image.path, maximumImageBytes)) !==
        evidence.image.sha256
    ) {
      throw new Error("Published map render evidence is stale or changed");
    }
    nativeArtifactPaths.push(projectionFile, evidenceFile, evidence.image.path);
    nativeEvidence = {
      projection: expected,
      image: evidence.image,
      evidenceFile,
    };
  }
  if (!values.write) {
    emit({
      kind: "map-review-candidate",
      ...bundle,
      ...(nativeEvidence
        ? {
            native: nativeEvidence,
          }
        : {}),
      context: status,
      recorded: false,
    });
    return 0;
  }
  if (
    status.freshness !== "matches-supplied-inputs" ||
    map.findings.some((finding) => finding.severity === "blocking" && finding.status === "open")
  ) {
    throw new Error("Map approval requires fresh declared sources and resolved blocking findings");
  }
  const renderFile = sibling(`map-evidence/${observationHash(bundle)}.json`);
  await writeOutput(context, renderFile, bundle, from);
  const artifactPaths = new Set([
    from,
    renderFile,
    ...nativeArtifactPaths,
    ...map.sources.flatMap((source) =>
      source.path
        ? [
            source.path,
          ]
        : [],
    ),
    ...(map.journey
      ? [
          map.journey.path,
        ]
      : []),
  ]);
  const artifacts = await Promise.all(
    [
      ...artifactPaths,
    ].map(async (file) => ({
      path: file,
      sha256: sha256(await readProjectBytes(context.root, file, maximumImageBytes)),
    })),
  );
  const review = createArtifactReview({
    artifactKind: kind,
    artifactId: map.id,
    artifactHash: hashMapContract(map),
    by: stringValue("by")!,
    note: stringValue("note")!,
    artifacts,
  });
  await writeArtifactReview(context.root, reviewsFile, review, {
    redact: context.redact,
  });
  emit(review);
  return 0;
}
