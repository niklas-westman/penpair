import type { MapContract } from "../maps/types.js";
import { validateMapDetail } from "../maps/validation.js";
import type { ReleaseContract } from "./types.js";

export interface ReleaseContractEntry {
  reference: ReleaseContract;
  map: MapContract;
}

export interface ReleaseContractGraph {
  ordered: ReleaseContractEntry[];
  details: Map<string, Record<string, MapContract>>;
}

export function nativeContractId(map: MapContract): string {
  return `${map.kind}:${map.id}`;
}

/** Detail traversal stays inside the explicit release family; no implicit recursive file loading. */
export function releaseContractGraph(
  entries: ReleaseContractEntry[],
  fileId?: string,
): ReleaseContractGraph {
  if (entries.length > 100) {
    throw new Error("Release contract graph exceeds 100 explicit members");
  }
  const byId = new Map(
    entries.map((entry) => [
      nativeContractId(entry.map),
      entry,
    ]),
  );
  if (byId.size !== entries.length) {
    throw new Error("Release contract identities must be unique");
  }
  const children = new Map<string, Set<string>>();
  const details = new Map<string, Record<string, MapContract>>();
  for (const entry of entries) {
    const key = nativeContractId(entry.map);
    const links = entry.map.nodes.filter((node) => node.kind === "detail-link");
    if (links.length > 64) {
      throw new Error("Release map exceeds 64 direct detail links");
    }
    const resolved: Record<string, MapContract> = {};
    const linked = new Set<string>();
    for (const node of links) {
      const source = entry.map.sources.find((item) => item.id === node.sourceIds?.[0]);
      if (
        !source ||
        source.kind !== "contract" ||
        !source.path ||
        !source.fileId ||
        !source.pageId ||
        !source.frameId
      ) {
        throw new Error("Release detail link is missing its explicit pinned contract target");
      }
      if (fileId && source.fileId !== fileId) {
        throw new Error("Release detail link belongs to another pinned file");
      }
      const child = entries.find(
        (candidate) =>
          candidate.reference.path === source.path && candidate.reference.sha256 === source.sha256,
      );
      if (!child) {
        throw new Error(
          "Every referenced detail contract must be an explicit exact-hash release member",
        );
      }
      resolved[source.id] = validateMapDetail(entry.map, node, child.map);
      linked.add(nativeContractId(child.map));
    }
    details.set(key, resolved);
    children.set(key, linked);
  }
  const visited = new Set<string>();
  const active = new Set<string>();
  const ordered: ReleaseContractEntry[] = [];
  const visit = (id: string): void => {
    if (active.has(id)) {
      throw new Error("Cyclic detail contracts cannot be assembled or finalized");
    }
    if (visited.has(id)) {
      return;
    }
    active.add(id);
    for (const child of children.get(id) ?? []) {
      visit(child);
    }
    active.delete(id);
    visited.add(id);
    ordered.push(byId.get(id)!);
  };
  for (const entry of entries) {
    visit(nativeContractId(entry.map));
  }
  return {
    ordered,
    details,
  };
}
