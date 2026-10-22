import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { PenpotToolClient } from "./client.js";
import { kit } from "./kit.js";
import { runOperation, type Operation, type OperationOptions } from "./operation.js";
import { snippet } from "./snippet.js";
import { observationHash } from "./journal.js";
import { atomicWriteFile } from "./atomic-output.js";
import { resolveProjectOutput } from "./project-input.js";

const snapshotBody = `
const state=()=>{
 const f=penpot.currentFile,p=penpot.currentPage,c=penpot.library.local.tokens,structure=[],stack=[p.root],seen=new Set();
 while(stack.length){if(structure.length>=10000)throw new Error("Kit probe exceeds 10000 shapes");const shape=stack.pop();if(!shape.id||seen.has(shape.id)||![shape.x,shape.y,shape.width,shape.height].every(Number.isFinite))throw new Error("Incomplete kit-probe geometry");seen.add(shape.id);structure.push([shape.id,shape.type,shape.name||"",shape.x,shape.y,shape.width,shape.height,shape.tokens||{},shape.type==="text"?shape.characters:null]);for(const child of shape.children||[])stack.push(child);}
 let count=0;const tokens=c.sets.map(set=>({id:set.id,name:set.name,active:!!set.active,tokens:set.active?set.tokens.map(token=>{if(++count>10000)throw new Error("Kit-probe token budget exceeded");return {name:token.name,type:token.type,value:token.value};}):[]}));
 const themes=c.themes.map(theme=>({id:theme.id,group:theme.group,name:theme.name,active:!!theme.active}));
 const result={fileId:f.id,pageId:p.id,structure,tokens,themes};if(JSON.stringify(result).length>30000)throw new Error("Kit probe needs a smaller scratch page/token context");return result;
};`;
interface KitProbeParams { tag: string }
export const kitSmokeOperation: Operation<KitProbeParams> = {
  name: "kit-smoke", page: () => undefined,
  inspect: params => snippet("kit-smoke-inspect", `${snapshotBody}
const current=state(),effective=new Map();for(const set of penpot.library.local.tokens.sets)if(set.active)for(const token of set.tokens)effective.set(token.name,token);
const pick=type=>{const names=[...effective.values()].filter(token=>token.type===type).map(token=>token.name).sort();if(!names.length)throw new Error("Kit probe needs an active "+type+" token on its scratch file");return names[0];};
if(penpot.currentPage.root.children.some(shape=>shape.name===CFG.tag))throw new Error("A prior kit-probe root needs inspection before another run");
return {ok:true,readOnly:true,state:current,selected:{color:pick("color"),typo:pick("typography"),space:pick("spacing"),radius:pick("borderRadius")}};`, params, "read"),
  apply: (params, inspected) => snippet("kit-smoke-apply", `${kit()}
${snapshotBody}
if(!CFG.expected||JSON.stringify(state())!==JSON.stringify(CFG.expected))throw new Error("Kit-probe source changed before mutation");
let root=null,result={ok:true,built:false};
try{
 root=penpot.createBoard();root.name=CFG.tag;root.fills=[];root.x=200000;root.resize(300,180);
 const card=pp.recipe("hello-card",root,{box:{name:"Hello card",w:240,gap:CFG.selected.space,pad:[CFG.selected.space,CFG.selected.space,CFG.selected.space,CFG.selected.space],stroke:CFG.selected.color,radius:CFG.selected.radius},text:{typo:CFG.selected.typo,color:CFG.selected.color},label:"Hello, card"});
 const settled=await pp.flush({root});if(!settled.layout.stable)throw new Error("Kit did not settle");
 const label=card.children.find(shape=>shape.type==="text");if(!label)throw new Error("Kit text was not observed");
 const actual={text:label.characters,typography:(label.tokens||{}).typography,color:(label.tokens||{}).fill,space:(card.tokens||{}).rowGap,radius:(card.tokens||{}).borderRadiusTopLeft};
 const first=await root.export({type:"png",scale:1});const layout=await pp.settle(root);if(!layout.stable)throw new Error("Kit export layout did not settle");const second=await root.export({type:"png",scale:1});
 if(!first||!second||!second.length||second.length>2097152||first.length!==second.length||Array.from(first).some((value,index)=>value!==second[index]))throw new Error("Kit preview did not produce bounded matching renders");
 let binary="";for(let index=0;index<second.length;index+=8192)binary+=String.fromCharCode.apply(null,second.subarray(index,index+8192));
 result={ok:true,built:true,actual,geometry:{width:card.width,height:card.height},previewBase64:btoa(binary),previewLength:second.length,capture:{fileId:penpot.currentFile.id,pageId:penpot.currentPage.id,frameId:root.id,revision:penpot.currentFile.revn,penpotApiVersion:typeof penpot.version==="string"?penpot.version:null},layout:settled.layout};
}catch(error){result.error=String(error&&error.message||error);}
finally{if(root)try{root.remove();}catch(error){result.cleanupError=String(error&&error.message||error);}}
return result;`, { ...params, expected: inspected?.state ?? null, selected: inspected?.selected ?? null }, "write"),
  readback: () => snippet("kit-smoke-readback", `${snapshotBody}\nreturn {ok:true,readOnly:true,state:state()};`, {}, "read"),
  verify({ inspect, apply, readback }) {
    const selected = inspect.selected as { color: string; typo: string; space: string; radius: string } | undefined;
    const problems: string[] = [];
    if (!selected || apply.built !== true || apply.error || apply.cleanupError) problems.push(`Kit example failed: ${apply.error ?? apply.cleanupError ?? "no observed build"}`);
    if (!selected || observationHash(apply.actual) !== observationHash({ text: "Hello, card", typography: selected.typo, color: selected.color, space: selected.space, radius: selected.radius })) problems.push("Kit example lacks matching independent text/binding observations");
    const geometry = apply.geometry as { width?: unknown; height?: unknown } | undefined;
    if (!geometry || typeof geometry.width !== "number" || !Number.isFinite(geometry.width) || geometry.width <= 0 || typeof geometry.height !== "number" || !Number.isFinite(geometry.height) || geometry.height <= 0) problems.push("Kit example has no finite positive geometry");
    if (!inspect.state || !readback.state || observationHash(inspect.state) !== observationHash(readback.state)) problems.push("Kit cleanup did not independently preserve the original page and token selection");
    if (typeof apply.previewBase64 !== "string" || !Number.isInteger(apply.previewLength) || Number(apply.previewLength) < 1) problems.push("Kit example has no stable preview evidence");
    return problems;
  },
};
/** Opt-in scratch operation; uses existing active typed tokens and removes only its directly owned temporary root. */
export async function runKitSmoke(client: PenpotToolClient, root: string, options: OperationOptions = {}) {
  const runId = options.journal?.runId ?? randomUUID();
  const report = await runOperation(client, kitSmokeOperation, { tag: `_penpair-kit-${runId}` }, { ...options, journal: options.apply ? { ...options.journal, root, runId } : undefined });
  const encoded = report.apply?.previewBase64;
  if (report.apply) delete report.apply.previewBase64;
  if (!report.verified || !report.apply) return report;
  if (typeof encoded !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error("Kit preview encoding is invalid");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length !== report.apply.previewLength || bytes.length > 2097152) throw new Error("Kit preview byte evidence is invalid");
  const destination = await resolveProjectOutput(root, `.penpair/probes/kit-${runId}.png`);
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const existing = await readFile(destination).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; return undefined; });
  if (existing && !existing.equals(bytes)) throw new Error("Existing kit preview differs; previous evidence was preserved");
  if (!existing) await atomicWriteFile(destination, bytes, { mode: 0o600 });
  return { ...report, preview: { path: destination, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), visualApproval: false } };
}
