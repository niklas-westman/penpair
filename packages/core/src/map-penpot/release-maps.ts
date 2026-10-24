import type { PenpotToolClient } from "../client.js";
import { observeMapSources } from "../maps/store.js";
import { buildMapDrawingPlan } from "../maps/render.js";
import type { MapContract } from "../maps/types.js";
import { resolveMapDetails } from "./details.js";
import { drawingFromPlan } from "./projection.js";
import { publishMap } from "./publish.js";
import type { MapTarget, PublishMapOptions, PublishMapResult } from "./types.js";

export interface ReleaseMapPublication {
  mapKind: MapContract["kind"];
  mapId: string;
  contractHash: string;
  publication: PublishMapResult;
}

/** Each contract has its own recoverable journal; an interrupted batch is never replayed blindly. */
export async function assembleReleaseMaps(
  client: PenpotToolClient,
  root: string,
  target: MapTarget,
  contracts: MapContract[],
  options: Omit<PublishMapOptions, "journal" | "expected"> & {
    origin?: {
      x: number;
      y: number;
    };
    journals?: Record<
      string,
      {
        runId: string;
        resume?: boolean;
      }
    >;
    projections?: Record<string, NonNullable<PublishMapOptions["expected"]>>;
  } = {},
): Promise<ReleaseMapPublication[]> {
  if (
    contracts.length > 100 ||
    new Set(contracts.map((contract) => `${contract.kind}:${contract.id}`)).size !==
      contracts.length
  ) {
    throw new Error("Release maps require at most 100 unique contract identities");
  }
  const prepared = new Map<
    string,
    {
      contract: MapContract;
      drawing: ReturnType<typeof drawingFromPlan>;
      width: number;
    }
  >();
  for (const contract of contracts) {
    const observation = await observeMapSources(root, contract);
    const plan = buildMapDrawingPlan(contract, observation.detailMaps);
    const drawing = await resolveMapDetails(root, drawingFromPlan(plan));
    prepared.set(drawing.mapId, {
      contract,
      drawing,
      width: plan.width,
    });
  }
  const ordered: string[] = [];
  const visiting = new Set<string>();
  const completed = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) {
      throw new Error("Release detail-map dependencies contain a cycle");
    }
    if (completed.has(id)) {
      return;
    }
    const current = prepared.get(id)!;
    visiting.add(id);
    for (const node of current.drawing.nodes.filter((node) => node.detail)) {
      const detail = node.detail!;
      const child = prepared.get(detail.mapId!);
      if (!child || child.drawing.contractHash !== detail.contractHash) {
        throw new Error(
          "Every detail contract must be explicitly included at its pinned revision in the release",
        );
      }
      visit(child.drawing.mapId);
    }
    visiting.delete(id);
    completed.add(id);
    ordered.push(id);
  };
  for (const id of prepared.keys()) {
    visit(id);
  }
  const results: ReleaseMapPublication[] = [];
  const published = new Map<string, PublishMapResult>();
  let nextX = options.origin?.x ?? 0;
  for (const id of ordered) {
    const entry = prepared.get(id)!;
    const contract = entry.contract;
    const drawing = {
      ...entry.drawing,
      origin: {
        x: nextX,
        y: options.origin?.y ?? 0,
      },
      nodes: entry.drawing.nodes.map((node) => {
        if (!node.detail) {
          return node;
        }
        const child = published.get(node.detail.mapId!);
        if (options.apply && !child?.projection.boardId) {
          throw new Error("Release child map has no verified native target");
        }
        return child?.projection.boardId
          ? {
              ...node,
              detail: {
                ...node.detail,
                fileId: target.fileId,
                pageId: target.pageId,
                frameId: child.projection.boardId,
              },
            }
          : node;
      }),
    };
    const recovery = options.journals?.[drawing.mapId];
    const publication = await publishMap(client, target, drawing, {
      ...options,
      expected: options.projections?.[drawing.mapId],
      journal: {
        root,
        redact: options.redact,
        ...recovery,
      },
    });
    nextX += Math.max(entry.width, publication.projection.boardBounds?.width ?? 964) + 160;
    published.set(drawing.mapId, publication);
    results.push({
      mapKind: contract.kind,
      mapId: contract.id,
      contractHash: drawing.contractHash,
      publication,
    });
  }
  return results;
}
