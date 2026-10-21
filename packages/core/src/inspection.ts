import { createHash } from "node:crypto";
import { runOnPage } from "./operation.js";
import { runSnippet, snippet, requirePage } from "./snippet.js";
import { PenpairError } from "./errors.js";
import { maxSnippetBytes, type ExecutionMetrics, type PenpotToolClient } from "./client.js";
import { observationHash } from "./journal.js";
import { version } from "./version.js";

export const inspectionFields = ["geometry", "text", "layout", "component", "tokens", "style", "metadata"] as const;
export type InspectionField = typeof inspectionFields[number];
export interface InspectionQuery {
  kind?: "shape" | "tokens";
  shapeId?: string;
  page?: string;
  fields?: InspectionField[];
  depth?: number;
  maxNodes?: number;
  responseBytes?: number;
  timeBudgetMs?: number;
  documentBytes?: number;
  cursor?: string;
}
interface Cursor { schemaVersion: 1; fileId: string; pageId: string | null; revision: number; queryHash: string; digest: string; offset: number }
export interface InspectionChunk {
  schemaVersion: 1; kind: "inspection-chunk"; fileId: string; pageId: string | null; revision: number;
  queryHash: string; digest: string; digestAlgorithm: "cyrb53-change-detector"; sourceComplete: boolean;
  offset: number; nextOffset: number | null; totalCodeUnits: number; chunk: string; nextCursor: string | null; complete: boolean;
  counts: Record<string, number | null>; observationMs: number; metrics: ExecutionMetrics;
}
export interface InspectionDocument {
  schemaVersion: 1; kind: "shape-inspection" | "token-inspection"; fileId: string; pageId: string | null; revision: number; complete: boolean;
  counts: Record<string, number | null>; reasons: string[]; producer: { name: string; version: string };
  nodes?: Record<string, unknown>[]; sets?: Record<string, unknown>[]; themes?: Record<string, unknown>[];
  [key: string]: unknown;
}
export interface InspectionMetrics { calls: number; requestSnippetBytes: number; responsePayloadBytes: number; maxRequestSnippetBytes: number; maxResponsePayloadBytes: number; assembledBytes: number; durationMs: number }
export type InspectionCapture = InspectionDocument & { capturedAt: string; sha256: string; metrics: InspectionMetrics };
export interface PartialInspection { schemaVersion: 1; kind: "inspection-partial"; fileId: string | null; pageId: string | null; complete: false; reason: string; chunks: InspectionChunk[]; nextCursor: string | null; metrics: InspectionMetrics }
export interface CaptureBudget { maxCalls?: number; maxTotalBytes?: number; timeoutMs?: number }

// A deterministic change detector, not an authentication hash. Final reassembled evidence receives SHA-256 on the host.
function fingerprint(text: string): string {
  let a = 0xdeadbeef, b = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) { const code = text.charCodeAt(i); a = Math.imul(a ^ code, 2654435761); b = Math.imul(b ^ code, 1597334677); }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (4294967296 * (2097151 & b) + (a >>> 0)).toString(16);
}
function utf8Bytes(text: string): number {
  let count = 0;
  for (let i=0;i<text.length;i++) { const code=text.charCodeAt(i); if(code<128)count++;else if(code<2048)count+=2;else if(code>=0xd800&&code<=0xdbff&&i+1<text.length&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<=0xdfff){count+=4;i++;}else count+=3; }
  return count;
}
const body = `
const started = Date.now(), f = penpot.currentFile;
const stale = () => ({ok:true,stale:true,message:"Inspection cursor is stale; start a fresh capture"});
if (CFG.expected && f.id !== CFG.expected.fileId) return stale();
${requirePage}
const fileId = f.id, pageId = CFG.kind === "shape" ? penpot.currentPage.id : null, revision = f.revn;
if (CFG.expected && (CFG.expected.pageId !== pageId || CFG.expected.revision !== revision || CFG.expected.queryHash !== CFG.queryHash)) return stale();
const fingerprint = (${fingerprint.toString()}), utf8Bytes = (${utf8Bytes.toString()});
const reasons = new Set(), counts = {visited:0,returned:0,total:null,pendingAtLeast:0,depthOmitted:0,unknownFields:0};
const document = {schemaVersion:1,kind:CFG.kind === "shape" ? "shape-inspection" : "token-inspection",fileId,pageId,revision,complete:true,producer:{name:"penpair",version:CFG.producerVersion},counts,reasons:[],penpotApiVersion:typeof penpot.version === "string"?penpot.version:null};
const overTime = () => Date.now()-started > CFG.timeBudgetMs;
const clone = (value, unknowns, key) => {
  try {
    if (value === undefined) { unknowns.push(key); return null; }
    if (typeof value === "string" && value.length > CFG.documentBytes) { reasons.add("document-byte-budget"); unknowns.push(key); return null; }
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") { if (Number.isFinite(value)) return value; unknowns.push(key);return null; }
    const encoded = JSON.stringify(value, (_key, entry) => {
      if (["function","symbol","bigint"].includes(typeof entry) || typeof entry === "number" && !Number.isFinite(entry)) throw new Error("non-JSON data");
      return entry === undefined ? null : entry;
    });
    if (encoded === undefined) { unknowns.push(key); return null; }
    if (encoded.length > CFG.documentBytes) { reasons.add("document-byte-budget"); unknowns.push(key); return null; }
    return JSON.parse(encoded);
  } catch { unknowns.push(key); return null; }
};
const read = (object,key,unknowns,label=key) => { try { return clone(object[key],unknowns,label); } catch { unknowns.push(label); return null; } };
const pick = (object,keys,unknowns,prefix) => Object.fromEntries(keys.map(key=>[key,read(object,key,unknowns,prefix+"."+key)]));
let estimatedBytes = 1024;
if (CFG.kind === "shape") {
  const root = penpot.currentPage.getShapeById(CFG.shapeId);
  if (!root) return {ok:false,message:"No shape with the requested ID on the selected page"};
  document.scope = {shapeId:CFG.shapeId,fields:CFG.fields,depth:CFG.depth,maxNodes:CFG.maxNodes};
  const nodes = document.nodes = [], stack = [{shape:root,parentId:null,index:0,depth:0}], seen = new Set();
  let skipped = 0;
  while (stack.length) {
    if (counts.visited >= CFG.maxNodes) { reasons.add("node-budget"); break; }
    if (overTime()) { reasons.add("time-budget"); break; }
    const item = stack.pop(), s = item.shape;
    if (!s || typeof s.id !== "string" || !s.id || seen.has(s.id)) { reasons.add("invalid-or-repeated-identity"); break; }
    seen.add(s.id); counts.visited++;
    const children = Array.isArray(s.children) ? s.children : [];
    if (item.depth <= CFG.depth) {
      const unknowns = [], row = {id:s.id,parentId:item.parentId,index:item.index,depth:item.depth,type:read(s,"type",unknowns),name:read(s,"name",unknowns),childIds:children.slice(0,CFG.maxNodes).map(c=>c.id),childrenTotal:children.length,unknowns};
      if (children.length > CFG.maxNodes) reasons.add("node-budget");
      if (CFG.fields.includes("geometry")) row.geometry = pick(s,["x","y","width","height","rotation","hidden","blocked"],unknowns,"geometry");
      if (CFG.fields.includes("text")) row.text = s.type === "text" ? {characters:read(s,"characters",unknowns),typography:pick(s,["fontId","fontFamily","fontVariantId","fontSize","fontWeight","fontStyle","lineHeight","letterSpacing","growType","direction","align","verticalAlign"],unknowns,"typography")} : null;
      if (row.text && Object.values(row.text.typography).includes("mixed")) unknowns.push("text.mixedRangeStyles");
      if (CFG.fields.includes("layout")) {
        row.layout = {};
        for (const [key,keys] of [["flex",["dir","wrap","alignItems","alignContent","justifyContent","rowGap","columnGap","topPadding","rightPadding","bottomPadding","leftPadding","horizontalSizing","verticalSizing"]],["layoutChild",["absolute","zIndex","horizontalSizing","verticalSizing","alignSelf","topMargin","rightMargin","bottomMargin","leftMargin","minWidth","maxWidth","minHeight","maxHeight"]]]) {
          try { row.layout[key] = s[key] ? pick(s[key],keys,unknowns,"layout."+key) : null; } catch { row.layout[key]=null; unknowns.push("layout."+key); }
        }
        try {
          const grid=s.grid;
          row.layout.grid=grid?pick(grid,["dir","alignItems","alignContent","justifyItems","justifyContent","rowGap","columnGap","topPadding","rightPadding","bottomPadding","leftPadding","horizontalSizing","verticalSizing"],unknowns,"layout.grid"):null;
          if(grid)for(const key of ["rows","columns"])row.layout.grid[key]=(grid[key]||[]).map((track,index)=>pick(track,["type","value"],unknowns,"layout.grid."+key+"."+index));
        } catch {row.layout.grid=null;unknowns.push("layout.grid");}
        try {row.layout.cell=s.layoutCell?pick(s.layoutCell,["row","rowSpan","column","columnSpan","areaName","position"],unknowns,"layout.cell"):null;} catch {row.layout.cell=null;unknowns.push("layout.cell");}
        row.layout.clipContent = read(s,"clipContent",unknowns,"layout.clipContent");
      }
      if (CFG.fields.includes("tokens")) row.tokens = read(s,"tokens",unknowns);
      if (CFG.fields.includes("style")) row.style = pick(s,["fills","strokes","shadows","opacity","blendMode","borderRadiusTopLeft","borderRadiusTopRight","borderRadiusBottomRight","borderRadiusBottomLeft"],unknowns,"style");
      if (CFG.fields.includes("component")) {
        row.component = {};
        for (const key of ["isComponentInstance","isComponentMainInstance","isComponentCopyInstance","isComponentRoot"]) {
          try { if (typeof s[key] !== "function") throw new Error(); row.component[key]=clone(s[key](),unknowns,"component."+key); } catch { row.component[key]=null; unknowns.push("component."+key); }
        }
        try { if (typeof s.component !== "function") throw new Error(); const c=s.component(); row.component.source=c?pick(c,["id","libraryId","name","path"],unknowns,"component.source"):null; } catch { row.component.source=null; unknowns.push("component.source"); }
        for (const key of ["componentRefShape","componentRoot","componentHead"]) {
          try { if (typeof s[key] !== "function") throw new Error(); const ref=s[key](); row.component[key]=ref?ref.id:null; } catch { row.component[key]=null; unknowns.push("component."+key); }
        }
      }
      if (CFG.fields.includes("metadata")) {
        row.metadata = {interactions:read(s,"interactions",unknowns)};
        try { if (typeof s.getSharedPluginData !== "function") throw new Error(); row.metadata.penpairSpec=s.getSharedPluginData("penpair","spec") || null; } catch { row.metadata.penpairSpec=null; unknowns.push("metadata.penpairSpec"); }
      }
      const size = utf8Bytes(JSON.stringify(row));
      if (estimatedBytes + size > CFG.documentBytes) { reasons.add("document-byte-budget"); break; }
      estimatedBytes += size+1; nodes.push(row); counts.returned++; counts.unknownFields += unknowns.length;
    } else { counts.depthOmitted++; reasons.add("depth"); }
    const room = Math.max(0,CFG.maxNodes-counts.visited-stack.length), take=Math.min(children.length,room);
    skipped += children.length-take;
    if (take < children.length) reasons.add("node-budget");
    for (let i=take-1;i>=0;i--) stack.push({shape:children[i],parentId:s.id,index:i,depth:item.depth+1});
  }
  counts.pendingAtLeast=stack.length+skipped;
  if (!stack.length && skipped===0 && !reasons.has("document-byte-budget") && !reasons.has("invalid-or-repeated-identity")) counts.total=counts.visited;
} else {
  document.sets=[]; document.themes=[];
  const tokens=penpot.library.local.tokens;
  outer: for (const [index,set] of tokens.sets.entries()) {
    if (counts.visited >= CFG.maxNodes || overTime()) { reasons.add(overTime()?"time-budget":"node-budget"); break; }
    counts.visited++;
    const setUnknowns=[],target={order:index,name:read(set,"name",setUnknowns),active:!!set.active,tokens:[],tokensTotal:set.tokens.length,unknowns:setUnknowns};
    const setSize=utf8Bytes(JSON.stringify(target));
    if (estimatedBytes+setSize>CFG.documentBytes) {reasons.add("document-byte-budget");break;}
    estimatedBytes+=setSize+1;counts.unknownFields+=setUnknowns.length;document.sets.push(target);
    for (const token of set.tokens) {
      if (counts.visited >= CFG.maxNodes || overTime()) { reasons.add(overTime()?"time-budget":"node-budget"); break outer; }
      const unknowns=[], value={name:read(token,"name",unknowns),type:read(token,"type",unknowns),value:read(token,"value",unknowns),description:read(token,"description",unknowns),resolvedValue:read(token,"resolvedValue",unknowns),unknowns};
      const size=utf8Bytes(JSON.stringify(value));
      if (estimatedBytes+size>CFG.documentBytes) { reasons.add("document-byte-budget"); break outer; }
      target.tokens.push(value); estimatedBytes+=size+1; counts.visited++; counts.returned++; counts.unknownFields+=unknowns.length;
    }
  }
  for (const theme of tokens.themes) {
    if (counts.visited >= CFG.maxNodes || overTime()) { reasons.add(overTime()?"time-budget":"node-budget"); break; }
    const themeUnknowns=[],value={group:read(theme,"group",themeUnknowns),name:read(theme,"name",themeUnknowns),active:!!theme.active,sets:clone((theme.activeSets||[]).map(s=>typeof s==="string"?s:s.name),themeUnknowns,"sets"),unknowns:themeUnknowns};
    const size=utf8Bytes(JSON.stringify(value));
    if (estimatedBytes+size>CFG.documentBytes) { reasons.add("document-byte-budget"); break; }
    document.themes.push(value); estimatedBytes+=size+1; counts.unknownFields+=themeUnknowns.length; counts.visited++;
  }
  if (!reasons.size) counts.total=counts.visited;
}
if (f.id!==fileId || f.revn!==revision || CFG.kind === "shape" && penpot.currentPage.id!==pageId) return stale();
if (overTime()) reasons.add("time-budget");
document.complete=reasons.size===0; document.reasons=[...reasons];
const serialized=JSON.stringify(document), digest=fingerprint(serialized);
if (CFG.expected && CFG.expected.digest!==digest) return stale();
const offset=CFG.expected?CFG.expected.offset:0;
if (offset<0 || offset>=serialized.length || offset>0 && /[\\uDC00-\\uDFFF]/.test(serialized[offset]) && /[\\uD800-\\uDBFF]/.test(serialized[offset-1])) return {ok:false,message:"Invalid chunk offset"};
const header={ok:true,schemaVersion:1,kind:"inspection-chunk",fileId,pageId,revision,queryHash:CFG.queryHash,digest,digestAlgorithm:"cyrb53-change-detector",sourceComplete:document.complete,counts,offset,totalCodeUnits:serialized.length,observationMs:0};
const response=(end)=>({...header,chunk:serialized.slice(offset,end),nextOffset:end<serialized.length?end:null,complete:document.complete&&offset===0&&end===serialized.length});
let low=offset+1,high=Math.min(serialized.length,offset+CFG.responseBytes),best=null;
while (low<=high) {
  const middle=Math.floor((low+high)/2); let end=middle;
  if (end<serialized.length && /[\\uDC00-\\uDFFF]/.test(serialized[end]) && /[\\uD800-\\uDBFF]/.test(serialized[end-1])) end--;
  if (end<=offset) {low=middle+1;continue;}
  const candidate=response(end), envelope={result:candidate,log:""};
  const size=Math.max(utf8Bytes(JSON.stringify(envelope)),utf8Bytes(JSON.stringify({result:JSON.stringify(candidate),log:""})))+utf8Bytes(JSON.stringify(envelope));
  if (size<=CFG.responseBytes-128) {best=candidate;low=middle+1;} else high=middle-1;
}
if (!best) return {ok:false,message:"Response budget is too small for inspection metadata"};
best.observationMs=Date.now()-started;
return best;`;

export function validateInspectionQuery(query: InspectionQuery) {
  const kind = query.kind ?? "shape";
  if (!["shape", "tokens"].includes(kind) || kind === "shape" && (typeof query.shapeId!=="string" || !query.shapeId || query.shapeId.length>200 || typeof query.page!=="string" || !query.page || query.page.length>500)) throw new Error("Shape inspection requires an ID and explicit page");
  if(kind==="tokens"&&(query.shapeId!==undefined||query.page!==undefined||query.fields!==undefined||query.depth!==undefined))throw new Error("Token inspection is file-scoped and does not accept shape field/depth selectors");
  const requested=query.fields??inspectionFields;
  if(!Array.isArray(requested)||requested.some(field=>!inspectionFields.includes(field)))throw new Error("Unknown inspection field group; supported: "+inspectionFields.join(", "));
  const fields = [...new Set(requested)].sort();
  const config = { kind, shapeId: query.shapeId, page: query.page, fields, depth: query.depth ?? 64, maxNodes: query.maxNodes ?? 20000, responseBytes: query.responseBytes ?? 65536, timeBudgetMs: query.timeBudgetMs ?? 5000, documentBytes: query.documentBytes ?? 16 * 1024 * 1024 };
  for (const [key,min,max] of [["depth",0,10000],["maxNodes",1,50000],["responseBytes",4096,262144],["timeBudgetMs",1,30000],["documentBytes",4096,128*1024*1024]] as const) if (!Number.isInteger(config[key]) || config[key]<min || config[key]>max) throw new Error(`${key} must be an integer from ${min} to ${max}`);
  const queryHash = observationHash({ kind, shapeId: config.shapeId, page: config.page, fields, depth: config.depth, maxNodes: config.maxNodes, documentBytes:config.documentBytes, timeBudgetMs:config.timeBudgetMs });
  return { ...config, queryHash, producerVersion: version };
}
function decodeCursor(cursor: string): Cursor {
  try {
    if (cursor.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
    const value = JSON.parse(Buffer.from(cursor,"base64url").toString("utf8")) as Cursor;
    if (value.schemaVersion!==1 || typeof value.fileId!=="string" || !value.fileId || value.pageId!==null && typeof value.pageId!=="string" || !Number.isInteger(value.revision) || !/^[a-f0-9]{64}$/.test(value.queryHash) || !/^[a-f0-9]+$/.test(value.digest) || !Number.isInteger(value.offset) || value.offset<0) throw new Error();
    return value;
  } catch { throw new Error("Invalid inspection cursor; start a fresh capture"); }
}
function cursorAt(chunk: InspectionChunk, offset: number): string {
  return Buffer.from(JSON.stringify({schemaVersion:1,fileId:chunk.fileId,pageId:chunk.pageId,revision:chunk.revision,queryHash:chunk.queryHash,digest:chunk.digest,offset} satisfies Cursor)).toString("base64url");
}
export async function inspectChunk(client: PenpotToolClient, query: InspectionQuery, requestTimeoutMs?: number): Promise<InspectionChunk> {
  const config=validateInspectionQuery(query), expected=query.cursor?decodeCursor(query.cursor):undefined;
  if (expected && expected.queryHash!==config.queryHash) throw new Error("Inspection query changed; discard the cursor and start fresh");
  const source=snippet("inspect-chunk",body,{...config,expected},"read");
  const options={effect:"read" as const,retries:0,timeoutMs:Math.max(1,Math.min(requestTimeoutMs??120000,config.timeBudgetMs+2000))};
  const record=config.kind==="shape"?await runOnPage(client,source,config.page,options):await runSnippet(client,source,options);
  if (record.stale===true) throw new PenpairError("stale-inspection","Inspection cursor is stale; start a fresh capture");
  const value=record as unknown as InspectionChunk;
  if (record.ok!==true || value.schemaVersion!==1 || value.kind!=="inspection-chunk" || typeof value.fileId!=="string" || value.pageId!==null&&typeof value.pageId!=="string" || !Number.isInteger(value.revision) || value.queryHash!==config.queryHash || typeof value.digest!=="string" || !/^[a-f0-9]{1,16}$/.test(value.digest) || typeof value.sourceComplete!=="boolean" || typeof value.complete!=="boolean" || !Number.isInteger(value.offset) || !Number.isInteger(value.totalCodeUnits) || value.totalCodeUnits<1 || value.digestAlgorithm!=="cyrb53-change-detector" || !value.counts || typeof value.counts!=="object" || Object.values(value.counts).some(count=>count!==null&&(!Number.isInteger(count)||count<0)) || !Number.isFinite(value.observationMs) || value.observationMs<0 || typeof value.chunk!=="string" || !value.chunk.length || value.offset!==(expected?.offset??0) || value.offset+value.chunk.length>value.totalCodeUnits || value.nextOffset!==(value.offset+value.chunk.length<value.totalCodeUnits?value.offset+value.chunk.length:null)) throw new Error("Malformed inspection chunk evidence");
  if (value.complete!==(value.sourceComplete&&value.offset===0&&value.nextOffset===null) || value.offset>0&&/^[\uDC00-\uDFFF]/.test(value.chunk) || value.nextOffset!==null&&/[\uD800-\uDBFF]$/.test(value.chunk)) throw new Error("Malformed inspection completeness or Unicode boundary");
  const metrics=(record.execution as {metrics?:ExecutionMetrics}|undefined)?.metrics ?? {requestSnippetBytes:Buffer.byteLength(source.code),responsePayloadBytes:Buffer.byteLength(JSON.stringify(record))};
  if (!Number.isInteger(metrics.requestSnippetBytes)||metrics.requestSnippetBytes<=0||metrics.requestSnippetBytes>maxSnippetBytes||!Number.isInteger(metrics.responsePayloadBytes)||metrics.responsePayloadBytes<=0) throw new Error("Inspection metrics are missing or invalid");
  if (metrics.responsePayloadBytes>config.responseBytes) throw new PenpairError("incomplete-output","Inspection response exceeded the configured payload budget");
  const { execution: _execution, ok: _ok, ...data }=record;
  const result={...data,metrics,nextCursor:null} as unknown as InspectionChunk;
  result.nextCursor=result.nextOffset===null?null:cursorAt(result,result.nextOffset);
  if(result.offset===0&&result.nextOffset===null)reassembleInspection([result]);
  return result;
}
/** Validate structural evidence independently of the transport envelope. Unknown API fields remain explicit nulls. */
export function validateInspectionDocument(input:unknown):InspectionDocument {
  if(!input||typeof input!=="object")throw new Error("Malformed inspection document");
  const value=input as InspectionDocument;
  const counts=value.counts;
  if(value.schemaVersion!==1||!["shape-inspection","token-inspection"].includes(value.kind)||typeof value.fileId!=="string"||!value.fileId||!Number.isInteger(value.revision)||value.revision<0||typeof value.complete!=="boolean"||!Array.isArray(value.reasons)||value.reasons.some(reason=>typeof reason!=="string")||value.complete&&value.reasons.length>0||!value.complete&&!value.reasons.length||!counts||typeof counts!=="object"||Object.values(counts).some(count=>count!==null&&(!Number.isInteger(count)||count<0))||!Number.isInteger(counts.visited)||!Number.isInteger(counts.returned)||value.producer?.name!=="penpair"||typeof value.producer?.version!=="string")throw new Error("Malformed inspection provenance/counts");
  if(value.kind==="shape-inspection"){
    const scope=value.scope as {shapeId?:unknown;fields?:unknown;depth?:unknown}|undefined;
    if(typeof value.pageId!=="string"||!value.pageId||!scope||typeof scope.shapeId!=="string"||!Array.isArray(scope.fields)||scope.fields.some(field=>!inspectionFields.includes(field))||!Number.isInteger(scope.depth)||!Array.isArray(value.nodes)||counts.returned!==value.nodes.length)throw new Error("Malformed shape inspection scope");
    const nodes=new Map<string,Record<string,unknown>>();
    for(const row of value.nodes){
      if(!row||typeof row.id!=="string"||!row.id||nodes.has(row.id)||row.parentId!==null&&typeof row.parentId!=="string"||!Number.isInteger(row.index)||Number(row.index)<0||!Number.isInteger(row.depth)||Number(row.depth)<0||row.type!==null&&typeof row.type!=="string"||row.name!==null&&typeof row.name!=="string"||!Array.isArray(row.childIds)||row.childIds.some(id=>typeof id!=="string")||!Number.isInteger(row.childrenTotal)||Number(row.childrenTotal)<row.childIds.length||!Array.isArray(row.unknowns)||row.unknowns.some(key=>typeof key!=="string"))throw new Error("Malformed shape node evidence");
      for(const field of scope.fields)if(!(field in row))throw new Error("Inspection omitted a requested field group");
      if(row.geometry&&typeof row.geometry==="object")for(const key of ["x","y","width","height","rotation"]){const entry=(row.geometry as Record<string,unknown>)[key];if(entry!==null&&(typeof entry!=="number"||!Number.isFinite(entry)))throw new Error("Malformed shape geometry");}
      nodes.set(row.id,row);
    }
    if(value.nodes.length&&value.nodes[0]!.id!==scope.shapeId)throw new Error("Inspection root identity does not match its scope");
    for(const row of value.nodes){
      if(row===value.nodes[0]&&(row.parentId!==null||row.depth!==0||row.index!==0)||row!==value.nodes[0]&&row.parentId===null)throw new Error("Inspection has an invalid subtree root");
      if(row.parentId!==null){const parent=nodes.get(String(row.parentId));if(!parent||(parent.childIds as string[])[Number(row.index)]!==row.id||Number(row.depth)!==Number(parent.depth)+1)throw new Error("Inspection parent/child evidence is inconsistent");}
      if(value.complete&&((row.childIds as string[]).length!==row.childrenTotal||(row.childIds as string[]).some((id,index)=>!nodes.has(id)||nodes.get(id)!.parentId!==row.id||nodes.get(id)!.index!==index)))throw new Error("Complete inspection is missing a child");
    }
    if(value.complete&&(!value.nodes.length||counts.total!==value.nodes.length||counts.visited!==value.nodes.length))throw new Error("Complete inspection node counts disagree");
  }else{
    if(value.pageId!==null||!Array.isArray(value.sets)||!Array.isArray(value.themes))throw new Error("Malformed token inspection scope");
    let tokens=0;
    for(const set of value.sets){if(!set||!Number.isInteger(set.order)||!Array.isArray(set.tokens))throw new Error("Malformed token set evidence");tokens+=set.tokens.length;}
    if(counts.returned!==tokens||value.complete&&counts.visited!==tokens+value.sets.length+value.themes.length)throw new Error("Token inspection counts disagree");
  }
  return value;
}
export function reassembleInspection(chunks: InspectionChunk[]): InspectionDocument {
  if (!chunks.length || chunks[0]!.offset!==0 || chunks.at(-1)!.nextOffset!==null) throw new Error("Inspection is missing its beginning or final chunk");
  const first=chunks[0]!; let offset=0;
  for (const chunk of chunks) {
    if (chunk.offset!==offset || chunk.fileId!==first.fileId || chunk.pageId!==first.pageId || chunk.revision!==first.revision || chunk.queryHash!==first.queryHash || chunk.digest!==first.digest || chunk.totalCodeUnits!==first.totalCodeUnits || chunk.sourceComplete!==first.sourceComplete) throw new Error("Inspection chunks are mixed, missing or stale");
    offset+=chunk.chunk.length;
  }
  const serialized=chunks.map(chunk=>chunk.chunk).join("");
  if (serialized.length!==first.totalCodeUnits || fingerprint(serialized)!==first.digest) throw new Error("Inspection chunk content does not match its fingerprint");
  const value=validateInspectionDocument(JSON.parse(serialized));
  if (value.schemaVersion!==1 || !["shape-inspection","token-inspection"].includes(value.kind) || value.fileId!==first.fileId || value.pageId!==first.pageId || value.revision!==first.revision || value.complete!==first.sourceComplete) throw new Error("Inspection document lacks matching provenance");
  return value;
}
export function validateCaptureBudget(budget: CaptureBudget = {}) {
  const maxCalls=budget.maxCalls??256,maxTotalBytes=budget.maxTotalBytes??16*1024*1024,timeoutMs=budget.timeoutMs??60000;
  if (!Number.isInteger(maxCalls)||maxCalls<1||maxCalls>2048||!Number.isInteger(maxTotalBytes)||maxTotalBytes<4096||maxTotalBytes>128*1024*1024||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000) throw new Error("Invalid inspection capture budgets");
  return {maxCalls,maxTotalBytes,timeoutMs};
}
export async function captureInspection(client: PenpotToolClient, query: InspectionQuery, budget: CaptureBudget = {}): Promise<InspectionCapture|PartialInspection> {
  if (query.cursor) throw new Error("Full capture starts at offset zero; use inspectChunk for manual cursor continuation");
  const {maxCalls,maxTotalBytes,timeoutMs}=validateCaptureBudget(budget);
  validateInspectionQuery(query);
  const started=Date.now(), chunks:InspectionChunk[]=[];
  const metrics:InspectionMetrics={calls:0,requestSnippetBytes:0,responsePayloadBytes:0,maxRequestSnippetBytes:0,maxResponsePayloadBytes:0,assembledBytes:0,durationMs:0};
  let cursor:string|undefined;
  const partial=(reason:string,nextCursor=cursor??null):PartialInspection=>({schemaVersion:1,kind:"inspection-partial",fileId:chunks[0]?.fileId??null,pageId:chunks[0]?.pageId??null,complete:false,reason,chunks,nextCursor,metrics:{...metrics,durationMs:Date.now()-started}});
  while (true) {
    if (metrics.calls>=maxCalls || Date.now()-started>=timeoutMs) return partial("Capture call/time budget exhausted");
    const chunk=await inspectChunk(client,{...query,cursor},Math.max(1,timeoutMs-(Date.now()-started)));
    metrics.calls++;metrics.requestSnippetBytes+=chunk.metrics.requestSnippetBytes;metrics.responsePayloadBytes+=chunk.metrics.responsePayloadBytes;
    metrics.maxRequestSnippetBytes=Math.max(metrics.maxRequestSnippetBytes,chunk.metrics.requestSnippetBytes);metrics.maxResponsePayloadBytes=Math.max(metrics.maxResponsePayloadBytes,chunk.metrics.responsePayloadBytes);
    const size=Buffer.byteLength(chunk.chunk,"utf8");
    if (metrics.assembledBytes+size>maxTotalBytes) return partial("Capture total-byte budget exhausted",cursorAt(chunk,chunk.offset));
    metrics.assembledBytes+=size;chunks.push(chunk);
    if (!chunk.nextCursor) {
      const document=reassembleInspection(chunks);metrics.durationMs=Date.now()-started;
      return {...document,capturedAt:new Date().toISOString(),sha256:createHash("sha256").update(chunks.map(entry=>entry.chunk).join(""),"utf8").digest("hex"),metrics};
    }
    cursor=chunk.nextCursor;
  }
}
