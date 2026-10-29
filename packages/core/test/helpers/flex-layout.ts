/** A small flex layout for the test sandboxes: enough to size auto boards, fill widths and place children. */
export interface FlexNode {
  x: number;
  y: number;
  width: number;
  height: number;
  children: FlexNode[];
  flex?: Record<string, unknown> | null;
  layoutChild?: Record<string, unknown> | null;
}

const number = (value: unknown): number => (typeof value === "number" ? value : 0);

function translate(node: FlexNode, dx: number, dy: number): void {
  node.x += dx;
  node.y += dy;
  for (const child of node.children) {
    translate(child, dx, dy);
  }
}

export function layoutFlex(node: FlexNode): void {
  const flex = node.flex;
  if (!flex) {
    for (const child of node.children) {
      layoutFlex(child);
    }
    return;
  }
  const column = flex.dir !== "row";
  const gap = number(column ? flex.rowGap : flex.columnGap);
  const top = number(flex.topPadding);
  const right = number(flex.rightPadding);
  const bottom = number(flex.bottomPadding);
  const left = number(flex.leftPadding);
  if (column && flex.horizontalSizing !== "auto") {
    for (const child of node.children) {
      if (child.layoutChild?.horizontalSizing === "fill") {
        child.width = node.width - left - right;
      }
    }
  }
  for (const child of node.children) {
    layoutFlex(child);
  }
  const sizes = node.children.map((child) => (column ? child.height : child.width));
  const main = sizes.reduce((total, size) => total + size, 0) + gap * Math.max(0, sizes.length - 1);
  const cross = Math.max(0, ...node.children.map((child) => (column ? child.width : child.height)));
  const width = column ? cross : main;
  const height = column ? main : cross;
  if (flex.horizontalSizing === "auto") {
    node.width = width + left + right;
  }
  if (flex.verticalSizing === "auto") {
    node.height = height + top + bottom;
  }
  const innerWidth = node.width - left - right;
  const innerHeight = node.height - top - bottom;
  let cursor = (column ? node.y + top : node.x + left) - 0;
  for (const child of node.children) {
    const centered = flex.alignItems === "center";
    const x = column ? node.x + left + (centered ? (innerWidth - child.width) / 2 : 0) : cursor;
    const y = column ? cursor : node.y + top + (centered ? (innerHeight - child.height) / 2 : 0);
    translate(child, x - child.x, y - child.y);
    cursor += (column ? child.height : child.width) + gap;
  }
}
