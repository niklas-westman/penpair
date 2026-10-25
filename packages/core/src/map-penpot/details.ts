import { createHash } from "node:crypto";
import { readProjectBytes } from "../bounded-file.js";
import {
  hashMapContract,
  maxMapBytes,
  validateMapContract,
  validateMapDetail,
} from "../maps/validation.js";
import type { MapContract, MapSource } from "../maps/types.js";
import type { MapDrawing } from "./types.js";

/** Resolve only explicitly pinned direct contracts; never recurse into another map's sources. */
export async function resolveMapDetails(root: string, drawing: MapDrawing): Promise<MapDrawing> {
  const references = drawing.nodes.filter((node) => node.detail);
  if (references.length > 64) {
    throw new Error("Native map supports at most 64 direct detail references");
  }
  const identity = drawing.mapId.match(/^(journey-map|integration-map):(.+)$/);
  if (references.length && !identity) {
    throw new Error("Native detail maps require a namespaced canonical parent identity");
  }
  const parent = {
    kind: identity?.[1] as MapContract["kind"],
    id: identity?.[2] ?? "",
    sources: references.map((node) => ({
      ...node.detail!,
      id: node.detail!.sourceId,
      kind: "contract" as const,
    })) as MapSource[],
  };
  let totalBytes = 0;
  const cache = new Map<string, MapContract>();
  const resolved = new Map<
    string,
    {
      mapId: string;
      contractHash: string;
    }
  >();
  for (const node of references) {
    const detail = node.detail!;
    const key = `${detail.path}:${detail.sha256}`;
    let contract = cache.get(key);
    if (!contract) {
      const bytes = await readProjectBytes(root, detail.path, maxMapBytes);
      totalBytes += bytes.length;
      if (totalBytes > 128 * 1024 * 1024) {
        throw new Error("Direct detail contracts exceed the 128 MiB aggregate budget");
      }
      if (createHash("sha256").update(bytes).digest("hex") !== detail.sha256) {
        throw new Error(`Pinned detail contract changed: ${detail.sourceId}`);
      }
      let raw: unknown;
      try {
        raw = JSON.parse(bytes.toString("utf8"));
      } catch {
        throw new Error(`Invalid detail contract JSON: ${detail.sourceId}`);
      }
      contract = validateMapContract(raw);
      cache.set(key, contract);
    }
    validateMapDetail(
      parent,
      {
        id: node.id,
        sourceIds: [
          detail.sourceId,
        ],
        requirementIds: node.requirementIds,
      },
      contract,
    );
    const identity = {
      mapId: `${contract.kind}:${contract.id}`,
      contractHash: hashMapContract(contract),
    };
    if (
      (detail.mapId !== undefined && detail.mapId !== identity.mapId) ||
      (detail.contractHash !== undefined && detail.contractHash !== identity.contractHash)
    ) {
      throw new Error(`Resolved detail contract identity differs: ${detail.sourceId}`);
    }
    resolved.set(key, identity);
  }
  return {
    ...drawing,
    nodes: drawing.nodes.map((node) =>
      node.detail
        ? {
            ...node,
            detail: {
              ...node.detail,
              ...resolved.get(`${node.detail.path}:${node.detail.sha256}`)!,
            },
          }
        : node,
    ),
  };
}

export function requireResolvedMapDetails(drawing: MapDrawing): void {
  if (
    drawing.nodes.some(
      (node) =>
        node.detail &&
        (!node.detail.mapId || !/^[a-f0-9]{64}$/.test(node.detail.contractHash ?? "")),
    )
  ) {
    throw new Error("Resolve pinned detail contract identities before using native map evidence");
  }
}
