import { nativeMapRoles, nativeMapTextEntries } from "./content.js";
import { nativeMapIcons, defaultMapIcon } from "./icons.js";
import { mapOriginLabels, mapOriginLegend } from "./status-labels.js";
import { snippet, type Snippet } from "../snippet.js";
import type { MapDrawing, MapTarget, NativeMapProjection } from "./types.js";

/**
 * The publish snippet checks that the map still matches what was inspected. It used to carry the whole inspected projection for an exact
 * comparison, so a page with an older drawing made the request exceed the 90 KB proxy limit. It now carries only this digest of the
 * projection's JSON text (two 32-bit lanes plus the length); the digest is a staleness guard, not a security boundary.
 */
export const projectionDigestSource = `const projectionDigest = text => {
  let a = 0xdeadbeef, b = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) { const code = text.charCodeAt(i); a = Math.imul(a ^ code, 2654435761); b = Math.imul(b ^ code, 1597334677); }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (a >>> 0).toString(16) + (b >>> 0).toString(16) + ":" + text.length;
};`;
/** The same digest on the host, for the projection the snippet is told to expect. */
export function projectionDigest(text: string): string {
  let a = 0xdeadbeef;
  let b = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 2654435761);
    b = Math.imul(b ^ code, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return `${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}:${text.length}`;
}

const inspectSource = `
if (penpot.currentFile.id !== CFG.target.fileId || penpot.currentPage.id !== CFG.target.pageId) throw new Error("Map file/page identity changed");
const readMeta = shape => {
  if (typeof shape.getSharedPluginData !== "function") throw new Error("Map metadata API unavailable");
  const raw = shape.getSharedPluginData("penpair", "map");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { throw new Error("Malformed managed map metadata"); }
};
const readInteractions = shape => {
  if (!Array.isArray(shape.interactions)) return null;
  return shape.interactions.map(interaction => {
    const destination = interaction.action?.destination;
    const destinationId = destination?.id || null;
    const destinationPageId = destinationId ? penpot.currentFile.pages.find(page => page.getShapeById(destinationId)?.id === destinationId)?.id || null : null;
    const destinationMeta = destination ? readMeta(destination) : null;
    return {trigger:interaction.trigger,type:interaction.action?.type || "unknown",destinationId,destinationPageId,destinationMapHash:destinationMeta?.contractHash || null,destinationMapId:destinationMeta?.mapId || null};
  });
};
const all = [], queue = [...penpot.currentPage.root.children], visited = new Set();
while (queue.length) {
  const shape = queue.shift();
  if (visited.has(shape.id)) throw new Error("Cyclic native hierarchy");
  visited.add(shape.id); all.push(shape);
  if (all.length > 20000) throw new Error("Page traversal exceeds map inspection limit");
  if (shape.children) queue.push(...shape.children);
}
const boards = all.filter(shape => { const meta = readMeta(shape); return meta && meta.mapId === CFG.mapId && meta.role === "board"; });
if (boards.length > 1) throw new Error("Duplicate managed map boards");
const board = boards[0] || null;
if (CFG.target.boardId && (!board || board.id !== CFG.target.boardId)) throw new Error("Managed map board identity changed");
const conflicts = [], shapes = [], keys = new Set();
if (board) {
  const meta = readMeta(board);
  if (meta.schemaVersion !== 1 || meta.owner !== "penpair") conflicts.push("Edited board ownership");
  for (const shape of board.children) {
    const child = readMeta(shape);
    if (!child || child.owner !== "penpair" || child.schemaVersion !== 1 || child.mapId !== CFG.mapId) { conflicts.push("Unknown or edited ownership: " + shape.id); continue; }
    if (!${JSON.stringify(nativeMapRoles)}.includes(child.role) || typeof child.logicalId !== "string" || !child.logicalId) { conflicts.push("Unknown managed role or identity: " + shape.id); continue; }
    const key = child.role + ":" + child.logicalId;
    if (keys.has(key)) conflicts.push("Duplicate logical ID: " + key);
    keys.add(key);
    if (shape.children && shape.children.length) conflicts.push("Unexpected nested content: " + shape.id);
    shapes.push({shapeId:shape.id,logicalId:child.logicalId,role:child.role,iconKey:child.iconKey || null,interactions:readInteractions(shape),label:shape.type === "text" ? shape.characters : null,x:shape.x,y:shape.y,width:shape.width,height:shape.height,content:shape.type === "path" ? shape.content : null,appearance:{type:shape.type,name:shape.name,fills:shape.fills || [],strokes:shape.strokes || [],fontId:shape.fontId || null,fontFamily:shape.fontFamily || null,fontVariantId:shape.fontVariantId || null,fontSize:shape.fontSize || null,growType:shape.growType || null,borderRadiusTopLeft:shape.borderRadiusTopLeft ?? shape.borderRadius ?? null,borderRadiusTopRight:shape.borderRadiusTopRight ?? shape.borderRadius ?? null,borderRadiusBottomLeft:shape.borderRadiusBottomLeft ?? shape.borderRadius ?? null,borderRadiusBottomRight:shape.borderRadiusBottomRight ?? shape.borderRadius ?? null,opacity:shape.opacity ?? null,blendMode:shape.blendMode ?? null,blur:shape.blur || null},...(child.from ? {from:child.from,to:child.to} : {})});
  }
  const childIds = new Set(board.children.map(shape => shape.id));
  for (const shape of all) { const child = readMeta(shape); if (shape.id !== board.id && child && child.mapId === CFG.mapId && !childIds.has(shape.id)) conflicts.push("Reparented managed shape: " + shape.id); }
}
const observation = {boardId:board ? board.id : null,boardBounds:board ? {x:board.x,y:board.y,width:board.width,height:board.height} : null,contractHash:board ? readMeta(board).contractHash : null,shapes,conflicts};
`;

export function inspectMapSnippet(target: MapTarget, mapId: string): Snippet {
  return snippet(
    "map-projection-inspect",
    `${inspectSource}\nreturn {ok:true,...observation};`,
    {
      target,
      mapId,
    },
    "read",
  );
}

export function publishMapSnippet(
  target: MapTarget,
  drawing: MapDrawing,
  expected: NativeMapProjection,
): Snippet {
  return snippet(
    "map-projection-publish",
    `${inspectSource}
${projectionDigestSource}
if (conflicts.length || projectionDigest(JSON.stringify(observation)) !== CFG.expectedDigest) throw new Error("Map changed after inspection; reconcile before publishing");
const fontName = CFG.drawing.fontFamily || "Inter";
const exactFonts = Array.isArray(penpot.fonts.all) ? penpot.fonts.all.filter(font => font.name === fontName) : [];
if (exactFonts.length !== 1) throw new Error("Map font unavailable or ambiguous: " + fontName);
const font = exactFonts[0];
if (typeof font.applyToText !== "function" || !Array.isArray(font.variants)) throw new Error("Map font unavailable");
const variants = font.variants.filter(variant => String(variant.fontWeight) === "400" && (variant.fontStyle || "normal") === "normal");
if (variants.length !== 1) throw new Error("Map regular font variant unavailable or ambiguous");
if (typeof penpot.currentPage.root.setSharedPluginData !== "function" || ["createBoard","createRectangle","createEllipse","createPath","createText"].some(method => typeof penpot[method] !== "function")) throw new Error("Required native map creation/metadata APIs unavailable");
const detailBoards = new Map();
for (const node of CFG.drawing.nodes.filter(node => node.detail)) {
  const detail = node.detail;
  if (detail.fileId !== CFG.target.fileId) throw new Error("Detail map target must be in the same pinned file");
  const pages = penpot.currentFile.pages.filter(page => page.id === detail.pageId);
  if (pages.length !== 1 || typeof pages[0].getShapeById !== "function") throw new Error("Detail map target page is missing or cannot be inspected");
  const target = pages[0].getShapeById(detail.frameId);
  const targetMeta = target ? readMeta(target) : null;
  if (!target || target.type !== "board" || !targetMeta || targetMeta.owner !== "penpair" || targetMeta.role !== "board" || !detail.mapId || targetMeta.mapId !== detail.mapId || !detail.contractHash || targetMeta.contractHash !== detail.contractHash) throw new Error("Detail map target is not the existing pinned owned contract board");
  if (typeof target.addInteraction !== "function" || typeof target.removeInteraction !== "function") throw new Error("Native detail interaction API is unavailable");
  detailBoards.set(node.id,target);
}
let root = board;
if (!root) { root = penpot.createBoard(); root.name = CFG.drawing.title; root.fills = [{fillColor:"#F8FAFC",fillOpacity:1}]; root.clipContent = false; root.x = CFG.drawing.origin?.x || 0; root.y = CFG.drawing.origin?.y || 0; root.resize(1600,1200); }
const metadata = (shape, role, logicalId, extra = {}) => {
  if (typeof shape.setSharedPluginData !== "function") throw new Error("Map metadata write API unavailable");
  shape.setSharedPluginData("penpair", "map", JSON.stringify({schemaVersion:1,owner:"penpair",mapId:CFG.mapId,role,logicalId,...extra}));
};
metadata(root,"board",CFG.mapId,{contractHash:CFG.drawing.contractHash});
const previous = new Map(shapes.map(shape => [shape.role + ":" + shape.logicalId,shape]));
const retained = new Set();
const get = (role,id,create) => { const prior = previous.get(role + ":" + id); const shape = prior ? penpot.currentPage.getShapeById(prior.shapeId) : create(); root.appendChild(shape); retained.add(shape.id);shape.opacity=1;shape.blendMode="normal"; metadata(shape,role,id); return shape; };
const strongVariants = font.variants.filter(variant => ["600","700"].includes(String(variant.fontWeight)) && (variant.fontStyle || "normal") === "normal").sort((left,right)=>Number(left.fontWeight)-Number(right.fontWeight));
const textShape = entry => {
  const shape = get(entry.role,entry.logicalId,() => penpot.createText(entry.text || " "));
  shape.characters = entry.text || " ";
  font.applyToText(shape,entry.strong && strongVariants.length ? strongVariants[0] : variants[0]);
  shape.fontSize = entry.fontSize; shape.resize(entry.width,entry.height); shape.growType = "auto-height";
  shape.x=root.x+entry.x; shape.y=root.y+entry.y; shape.fills=[{fillColor:entry.color,fillOpacity:1}];
  return shape;
};
const plannedNodes = CFG.drawing.nodes;
const nodes = new Map(plannedNodes.map(node => [node.id,node]));
for (const edge of CFG.drawing.edges) {
  const from = nodes.get(edge.from), to = nodes.get(edge.to);
  const shape = get("edge",edge.id,() => penpot.createPath());
  const points = edge.points.map(point => ({x:root.x+point.x,y:root.y+point.y}));
  shape.content = points.map((point,index) => (index ? "L" : "M")+point.x+" "+point.y).join(" ");
  shape.fills=[]; shape.strokes=[{strokeColor:"#98A2B3",strokeWidth:1.25,strokeCapEnd:"line-arrow"}];
  metadata(shape,"edge",edge.id,{from:edge.from,to:edge.to});
}
for (const node of plannedNodes) {
  const shape = get("node",node.id,() => penpot.createRectangle());
  shape.name=node.kind+": "+node.label;shape.resize(node.width,node.height);shape.x=root.x+node.x;shape.y=root.y+node.y;
  shape.fills=[{fillColor:"#FFFFFF",fillOpacity:1}];shape.strokes=[{strokeColor:"#D0D5DD",strokeWidth:1}];shape.borderRadius=12;
  const well = get("icon-well",node.id,() => penpot.createRectangle());well.resize(32,32);well.x=shape.x+16;well.y=shape.y+16;well.borderRadius=8;well.fills=[{fillColor:"#EEF2FF",fillOpacity:1}];well.strokes=[];
  const iconKey=node.icon || CFG.iconDefaults[node.id];
  const glyph=get("icon",node.id,()=>penpot.createPath());
  glyph.content=CFG.iconPaths[iconKey].replace(/([ML])(-?[0-9.]+) (-?[0-9.]+)/g,(_all,command,x,y)=>command+(shape.x+24+Number(x)*16/24)+" "+(shape.y+24+Number(y)*16/24));
  glyph.resize(16,16);glyph.x=shape.x+24;glyph.y=shape.y+24;
  glyph.fills=[];glyph.strokes=[{strokeColor:"#5B5BD6",strokeWidth:1.6,strokeCapStart:"round",strokeCapEnd:"round",strokeJoinStyle:"round"}];metadata(glyph,"icon",node.id,{iconKey});
  for(const [role,x] of [["port-in",shape.x],["port-out",shape.x+shape.width]]){
    const port=get(role,node.id,()=>penpot.createEllipse());port.resize(8,8);port.x=x-4;port.y=shape.y+shape.height/2-4;port.fills=[{fillColor:"#FFFFFF",fillOpacity:1}];port.strokes=[{strokeColor:"#98A2B3",strokeWidth:1.25}];
  }
}
for(const annotation of CFG.drawing.annotations || []){
  const panel=get("annotation-panel",annotation.id,()=>penpot.createRectangle());panel.resize(annotation.width,annotation.height);panel.x=root.x+annotation.x;panel.y=root.y+annotation.y;panel.borderRadius=12;panel.fills=[{fillColor:"#FFFFFF",fillOpacity:1}];panel.strokes=[{strokeColor:"#E4E7EC",strokeWidth:1}];
}
for(const entry of CFG.textEntries) textShape(entry);
for(const node of plannedNodes){
  const clickableRoles=new Set(["node","label","summary","badge","icon-well","icon","port-in","port-out"]);
  for(const id of retained){
    const shape=penpot.currentPage.getShapeById(id);const info=readMeta(shape);
    if(info.logicalId!==node.id || !clickableRoles.has(info.role))continue;
    if(Array.isArray(shape.interactions))for(const interaction of [...shape.interactions])shape.removeInteraction(interaction);
    if(node.detail)shape.addInteraction("click",{type:"navigate-to",destination:detailBoards.get(node.id)});
  }
}
if (typeof penpot.waitForLayoutUpdate === "function") await penpot.waitForLayoutUpdate();
const right = Math.max(900,...root.children.map(shape => shape.x-root.x+shape.width)) + 64;
const bottom = Math.max(160,...root.children.map(shape => shape.y-root.y+shape.height)) + 64;
root.resize(right,bottom);
for (const prior of shapes) if (!retained.has(prior.shapeId)) penpot.currentPage.getShapeById(prior.shapeId).remove();
return {ok:true,boardId:root.id};`,
    {
      target,
      mapId: drawing.mapId,
      drawing,
      textEntries: nativeMapTextEntries(drawing),
      iconPaths: nativeMapIcons,
      iconDefaults: Object.fromEntries(
        drawing.nodes.map((node) => [
          node.id,
          defaultMapIcon(node.kind),
        ]),
      ),
      originLabels: mapOriginLabels,
      originLegend: mapOriginLegend,
      expectedDigest: projectionDigest(
        JSON.stringify({
          boardId: expected.boardId,
          boardBounds: expected.boardBounds,
          contractHash: expected.contractHash,
          shapes: expected.shapes,
          conflicts: expected.conflicts,
        }),
      ),
    },
    "write",
  );
}
