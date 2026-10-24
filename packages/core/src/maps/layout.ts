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
  const corridorTracks = new Map<number, number>();
  const pending: Array<{
    edge: T;
    from: MapRoutingNode;
    to: MapRoutingNode;
  }> = [];
  const routed: Array<T & MapEdgeRoute> = [];
  for (const edge of [
    ...edges,
  ].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))) {
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
    const labelX = cyclic ? from.x - 368 : from.x + from.width + 112;
    const track = corridorTracks.get(labelX) ?? 0;
    corridorTracks.set(labelX, track + 1);
    const labelBox = {
      x: labelX,
      y: corridorEnds.get(labelX) ?? 180,
      width: 240,
      height: mapLabelHeight(edge.label, 240),
    };
    corridorEnds.set(labelX, labelBox.y + labelBox.height + 80);
    const routeY = labelBox.y + labelBox.height + 16;
    const start = {
      x: cyclic ? from.x : from.x + from.width,
      y: from.y + from.height / 2,
    };
    const finish = {
      x: to.x,
      y: to.y + to.height / 2,
    };
    const points = cyclic
      ? [
          start,
          {
            x: from.x - 112 + track * 8,
            y: start.y,
          },
          {
            x: from.x - 112 + track * 8,
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
            x: to.x - 24 - track * 8,
            y: routeY + 20,
          },
          {
            x: to.x - 24 - track * 8,
            y: finish.y,
          },
          finish,
        ]
      : [
          start,
          {
            x: start.x + 24 + track * 8,
            y: start.y,
          },
          {
            x: start.x + 24 + track * 8,
            y: routeY,
          },
          {
            x: finish.x - 24 - track * 8,
            y: routeY,
          },
          {
            x: finish.x - 24 - track * 8,
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
    Math.max(180, ...nodes.map((node) => node.y + node.height), ...corridorEnds.values()) + 100;
  for (const { edge, from, to } of pending) {
    const sourceKey = from.x + from.width + 112;
    const targetKey = to.x - 368;
    const sourceTrack = corridorTracks.get(sourceKey) ?? 0;
    corridorTracks.set(sourceKey, sourceTrack + 1);
    const targetTrack = corridorTracks.get(targetKey) ?? 0;
    corridorTracks.set(targetKey, targetTrack + 1);
    const labelBox = {
      x: Math.min(from.x, to.x) + 392,
      y: bottom,
      width: 240,
      height: mapLabelHeight(edge.label, 240),
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

/** Collapse cycles before layering so loops remain visible without preventing deterministic layout. */
export function mapNodeLayers(contract: MapContract): Map<string, number> {
  const outgoing = new Map(
    contract.nodes.map((node) => [
      node.id,
      [] as string[],
    ]),
  );
  const incoming = new Map(
    contract.nodes.map((node) => [
      node.id,
      [] as string[],
    ]),
  );
  for (const edge of contract.edges) {
    outgoing.get(edge.from)!.push(edge.to);
    incoming.get(edge.to)!.push(edge.from);
  }
  for (const neighbours of [
    ...outgoing.values(),
    ...incoming.values(),
  ]) {
    neighbours.sort();
  }
  const visited = new Set<string>();
  const finished: string[] = [];
  for (const node of contract.nodes) {
    const stack: Array<{
      id: string;
      leaving: boolean;
    }> = [
      {
        id: node.id,
        leaving: false,
      },
    ];
    while (stack.length) {
      const current = stack.pop()!;
      if (current.leaving) {
        finished.push(current.id);
        continue;
      }
      if (visited.has(current.id)) {
        continue;
      }
      visited.add(current.id);
      stack.push({
        id: current.id,
        leaving: true,
      });
      for (const next of [
        ...outgoing.get(current.id)!,
      ].reverse()) {
        if (!visited.has(next)) {
          stack.push({
            id: next,
            leaving: false,
          });
        }
      }
    }
  }
  const membership = new Map<string, number>();
  const components: string[][] = [];
  for (const id of finished.reverse()) {
    if (membership.has(id)) {
      continue;
    }
    const component: string[] = [];
    const stack = [
      id,
    ];
    while (stack.length) {
      const current = stack.pop()!;
      if (membership.has(current)) {
        continue;
      }
      membership.set(current, components.length);
      component.push(current);
      stack.push(...incoming.get(current)!);
    }
    components.push(component.sort());
  }
  const successors = components.map(() => new Set<number>());
  const indegrees = components.map(() => 0);
  for (const edge of contract.edges) {
    const from = membership.get(edge.from)!;
    const to = membership.get(edge.to)!;
    if (from !== to && !successors[from]!.has(to)) {
      successors[from]!.add(to);
      indegrees[to]!++;
    }
  }
  const depths = components.map(() => 0);
  const queue = indegrees.flatMap((indegree, index) =>
    indegree === 0
      ? [
          index,
        ]
      : [],
  );
  while (queue.length) {
    queue.sort((left, right) => (components[left]![0]! < components[right]![0]! ? -1 : 1));
    const current = queue.shift()!;
    for (const next of successors[current]!) {
      depths[next] = Math.max(depths[next]!, depths[current]! + 1);
      indegrees[next]!--;
      if (indegrees[next] === 0) {
        queue.push(next);
      }
    }
  }
  return new Map(
    contract.nodes.map((node) => [
      node.id,
      depths[membership.get(node.id)!]!,
    ]),
  );
}
