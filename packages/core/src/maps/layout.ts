import { mapCardHeight } from "./card-metrics.js";
import type { MapContract } from "./types.js";

export interface MapRoutingNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapRoutingEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface MapEdgeRoute {
  points: Array<{
    x: number;
    y: number;
  }>;
  labelBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface DrawingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function boxesOverlap(left: DrawingBox, right: DrawingBox): boolean {
  return (
    left.x < right.x + right.width &&
    right.x < left.x + left.width &&
    left.y < right.y + right.height &&
    right.y < left.y + left.height
  );
}

function segmentCrossesBox(
  from: {
    x: number;
    y: number;
  },
  to: {
    x: number;
    y: number;
  },
  box: DrawingBox,
): boolean {
  if (from.x === to.x) {
    return (
      from.x > box.x &&
      from.x < box.x + box.width &&
      Math.max(from.y, to.y) > box.y &&
      Math.min(from.y, to.y) < box.y + box.height
    );
  }
  if (from.y === to.y) {
    return (
      from.y > box.y &&
      from.y < box.y + box.height &&
      Math.max(from.x, to.x) > box.x &&
      Math.min(from.x, to.x) < box.x + box.width
    );
  }
  return true;
}

export function mapDrawingGeometryProblems(
  nodes: MapRoutingNode[],
  edges: Array<
    MapEdgeRoute & {
      id: string;
    }
  >,
): string[] {
  const problems: string[] = [];
  const verticalTracks = new Map<
    number,
    Array<{
      id: string;
      low: number;
      high: number;
    }>
  >();
  for (const node of nodes) {
    if (node.x < 0 || node.y < 160) {
      problems.push(`Card ${node.id} intrudes into the title/legend or outside the board`);
    }
    if (nodes.some((other) => other.id !== node.id && boxesOverlap(node, other))) {
      problems.push(`Card ${node.id} overlaps another card`);
    }
  }
  for (const edge of edges) {
    if (
      edge.labelBox.x < 0 ||
      edge.labelBox.y < 160 ||
      nodes.some((node) => boxesOverlap(edge.labelBox, node))
    ) {
      problems.push(`Edge label ${edge.id} overlaps a card/header or leaves the board`);
    }
    if (
      edges.some((other) => other.id !== edge.id && boxesOverlap(edge.labelBox, other.labelBox))
    ) {
      problems.push(`Edge label ${edge.id} overlaps another edge label`);
    }
    for (let index = 1; index < edge.points.length; index++) {
      const from = edge.points[index - 1]!;
      const to = edge.points[index]!;
      if (from.x === to.x && from.y !== to.y) {
        const low = Math.min(from.y, to.y);
        const high = Math.max(from.y, to.y);
        const track = verticalTracks.get(from.x) ?? [];
        if (track.some((other) => other.id !== edge.id && other.low < high && low < other.high)) {
          problems.push(`Connectors share an ambiguous vertical track: ${edge.id}`);
        }
        track.push({
          id: edge.id,
          low,
          high,
        });
        verticalTracks.set(from.x, track);
      }
      if (
        nodes.some((node) => segmentCrossesBox(from, to, node)) ||
        edges.some((other) => segmentCrossesBox(from, to, other.labelBox))
      ) {
        problems.push(`Connector ${edge.id} crosses a card or label`);
        break;
      }
    }
    if (problems.length >= 20) {
      break;
    }
  }
  return [
    ...new Set(problems),
  ].slice(0, 20);
}

export function mapLabelHeight(text: string, width: number): number {
  const charactersPerLine = Math.max(1, Math.floor(width / 16));
  const lines = text
    .split(/\r?\n/)
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0);
  return lines * 24 + 16;
}

/** Edge labels are 12px and sized to fit their width on one line where they can. */
export function mapEdgeLabelHeight(text: string, width: number): number {
  const charactersPerLine = Math.max(1, Math.floor((width - 16) / 7));
  const lines = text
    .split(/\r?\n/)
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0);
  return lines * 18 + 6;
}

export function mapEdgeLabelWidth(label: string): number {
  return Math.max(
    80,
    Math.min(240, Math.max(...label.split(/\r?\n/).map((line) => line.length)) * 7 + 16),
  );
}

/** Labels occupy dedicated gaps; routes stay outside those boxes and all card interiors. */
export function routeMapEdges<T extends MapRoutingEdge>(
  nodes: MapRoutingNode[],
  edges: T[],
): Array<T & MapEdgeRoute> {
  const byId = new Map(
    nodes.map((node) => [
      node.id,
      node,
    ]),
  );
  const columns = [
    ...new Set(nodes.map((node) => node.x)),
  ].sort((left, right) => left - right);
  const corridorEnds = new Map<number, number>();
  const portTracks = new Map<string, number>();
  const takeTrack = (key: string) => {
    const track = portTracks.get(key) ?? 0;
    portTracks.set(key, track + 1);
    return track;
  };
  const pending: Array<{
    edge: T;
    from: MapRoutingNode;
    to: MapRoutingNode;
  }> = [];
  const routed: Array<T & MapEdgeRoute> = [];
  for (const edge of [
    ...edges,
  ].sort((left, right) => {
    const aligned = (entry: T) => {
      const from = byId.get(entry.from)!;
      const to = byId.get(entry.to)!;
      return (
        to.x > from.x &&
        columns.indexOf(to.x) === columns.indexOf(from.x) + 1 &&
        from.y + from.height / 2 === to.y + to.height / 2
      );
    };
    return (
      Number(!aligned(left)) - Number(!aligned(right)) ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    );
  })) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) {
      throw new Error("Cannot route an edge with a missing node");
    }
    const sourceColumn = columns.indexOf(from.x);
    const targetColumn = columns.indexOf(to.x);
    if (targetColumn > sourceColumn + 1 || targetColumn < sourceColumn) {
      pending.push({
        edge,
        from,
        to,
      });
      continue;
    }
    const cyclic = targetColumn === sourceColumn;
    const labelWidth = mapEdgeLabelWidth(edge.label);
    const labelX = cyclic
      ? from.x - labelWidth - 96
      : (from.x + from.width + to.x - labelWidth) / 2;
    const corridorKey = cyclic ? -from.x : from.x;
    const sourceTrack = takeTrack(
      `${cyclic ? "left" : "right"}:${cyclic ? from.x : from.x + from.width}`,
    );
    const targetTrack = takeTrack(`left:${to.x}`);
    const labelHeight = mapEdgeLabelHeight(edge.label, labelWidth);
    const naturalY = to.y + to.height / 2 - labelHeight - 12;
    const direct =
      !cyclic &&
      from.y + from.height / 2 === to.y + to.height / 2 &&
      naturalY >= 160 &&
      !routed.some((entry) =>
        boxesOverlap(entry.labelBox, {
          x: labelX,
          y: naturalY,
          width: labelWidth,
          height: labelHeight,
        }),
      );
    const labelBox = {
      x: labelX,
      y: direct
        ? naturalY
        : Math.max(
            naturalY,
            corridorEnds.get(corridorKey) ??
              Math.max(180, Math.min(...nodes.map((node) => node.y))),
          ),
      width: labelWidth,
      height: labelHeight,
    };
    let routeY = labelBox.y + labelBox.height + 16;
    // A run that misses the target's middle by a few pixels would end in a visible jog; run level with it.
    const snapped = !direct && !cyclic && Math.abs(routeY - (to.y + to.height / 2)) <= 24;
    if (snapped) {
      routeY = to.y + to.height / 2;
      labelBox.y = routeY - 16 - labelBox.height;
    }
    corridorEnds.set(corridorKey, labelBox.y + labelBox.height + 80);
    const start = {
      x: cyclic ? from.x : from.x + from.width,
      y: from.y + from.height / 2,
    };
    const finish = {
      x: to.x,
      y: to.y + to.height / 2,
    };
    const points = direct
      ? [
          start,
          finish,
        ]
      : cyclic
        ? [
            start,
            {
              x: from.x - 24 - sourceTrack * 8,
              y: start.y,
            },
            {
              x: from.x - 24 - sourceTrack * 8,
              y: routeY,
            },
            {
              x: labelBox.x - 16,
              y: routeY,
            },
            {
              x: labelBox.x - 16,
              y: routeY + 20,
            },
            {
              x: to.x - 24 - targetTrack * 8,
              y: routeY + 20,
            },
            {
              x: to.x - 24 - targetTrack * 8,
              y: finish.y,
            },
            finish,
          ]
        : snapped
          ? [
              start,
              {
                x: start.x + 24 + sourceTrack * 8,
                y: start.y,
              },
              {
                x: start.x + 24 + sourceTrack * 8,
                y: routeY,
              },
              finish,
            ]
          : [
              start,
              {
                x: start.x + 24 + sourceTrack * 8,
                y: start.y,
              },
              {
                x: start.x + 24 + sourceTrack * 8,
                y: routeY,
              },
              {
                x: finish.x - 24 - targetTrack * 8,
                y: routeY,
              },
              {
                x: finish.x - 24 - targetTrack * 8,
                y: finish.y,
              },
              finish,
            ];
    routed.push({
      ...edge,
      points,
      labelBox,
    });
  }
  let bottom =
    Math.max(
      180,
      ...nodes.map((node) => node.y + Math.max(node.height, mapCardHeight)),
      ...corridorEnds.values(),
    ) + 100;
  for (const { edge, from, to } of pending) {
    const sourceTrack = takeTrack(`right:${from.x + from.width}`);
    const targetTrack = takeTrack(`left:${to.x}`);
    const labelWidth = mapEdgeLabelWidth(edge.label);
    const labelBox = {
      x: Math.min(from.x, to.x) + Math.max(from.width, to.width) + 32,
      y: bottom,
      width: labelWidth,
      height: mapEdgeLabelHeight(edge.label, labelWidth),
    };
    const routeY = labelBox.y + labelBox.height + 16;
    const start = {
      x: from.x + from.width,
      y: from.y + from.height / 2,
    };
    const finish = {
      x: to.x,
      y: to.y + to.height / 2,
    };
    routed.push({
      ...edge,
      labelBox,
      points: [
        start,
        {
          x: start.x + 24 + sourceTrack * 8,
          y: start.y,
        },
        {
          x: start.x + 24 + sourceTrack * 8,
          y: routeY,
        },
        {
          x: finish.x - 24 - targetTrack * 8,
          y: routeY,
        },
        {
          x: finish.x - 24 - targetTrack * 8,
          y: finish.y,
        },
        finish,
      ],
    });
    bottom = routeY + 80;
  }
  return routed.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

/** Ignore DFS return edges for placement only; every connector remains in the drawing. */
export function mapNodeLayers(contract: MapContract): Map<string, number> {
  const outgoing = new Map(
    contract.nodes.map((node) => [
      node.id,
      [] as string[],
    ]),
  );
  const incomingCount = new Map(
    contract.nodes.map((node) => [
      node.id,
      0,
    ]),
  );
  for (const edge of contract.edges) {
    outgoing.get(edge.from)!.push(edge.to);
    incomingCount.set(edge.to, incomingCount.get(edge.to)! + 1);
  }
  const byId = new Map(
    contract.nodes.map((node) => [
      node.id,
      node,
    ]),
  );
  for (const neighbors of outgoing.values()) {
    neighbors.sort(
      (left, right) =>
        Number(byId.get(left)!.kind !== "screen") - Number(byId.get(right)!.kind !== "screen") ||
        (left < right ? -1 : left > right ? 1 : 0),
    );
  }
  const state = new Map<string, "visiting" | "done">();
  const successors = new Map(
    contract.nodes.map((node) => [
      node.id,
      new Set<string>(),
    ]),
  );
  const roots = [
    ...contract.nodes,
  ].sort(
    (left, right) =>
      Number(incomingCount.get(left.id)! > 0) - Number(incomingCount.get(right.id)! > 0) ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  );
  for (const root of roots) {
    if (state.has(root.id)) {
      continue;
    }
    state.set(root.id, "visiting");
    const stack = [
      {
        id: root.id,
        index: 0,
      },
    ];
    while (stack.length) {
      const current = stack[stack.length - 1]!;
      const next = outgoing.get(current.id)![current.index++];
      if (next === undefined) {
        state.set(current.id, "done");
        stack.pop();
      } else if (state.get(next) !== "visiting") {
        successors.get(current.id)!.add(next);
        if (!state.has(next)) {
          state.set(next, "visiting");
          stack.push({
            id: next,
            index: 0,
          });
        }
      }
    }
  }
  const indegrees = new Map(
    contract.nodes.map((node) => [
      node.id,
      0,
    ]),
  );
  const depths = new Map(
    contract.nodes.map((node) => [
      node.id,
      0,
    ]),
  );
  for (const targets of successors.values()) {
    for (const target of targets) {
      indegrees.set(target, indegrees.get(target)! + 1);
    }
  }
  const queue = contract.nodes
    .filter((node) => indegrees.get(node.id) === 0)
    .map((node) => node.id);
  while (queue.length) {
    queue.sort();
    const current = queue.shift()!;
    for (const next of successors.get(current)!) {
      depths.set(next, Math.max(depths.get(next)!, depths.get(current)! + 1));
      indegrees.set(next, indegrees.get(next)! - 1);
      if (indegrees.get(next) === 0) {
        queue.push(next);
      }
    }
  }
  return depths;
}
