import { requirePage, snippet, type Snippet } from "../snippet.js";

const readSnippet = (name: string, body: string, params: unknown = {}): Snippet =>
  snippet(name, body, params, "read");

export function pages(): Snippet {
  return readSnippet(
    "pages",
    `return { ok: true, readOnly: true, file: penpot.currentFile.name, revn: penpot.currentFile.revn, current: penpot.currentPage.name,
  pages: penpot.currentFile.pages.map((p) => ({ id: p.id, name: p.name, count: p.root.children.length })) };`,
  );
}

/** The editor can only change page between snippets: it switches, and the next snippet sees the new page. */
export function switchPage(name: string): Snippet {
  return snippet(
    "switch-page",
    `const target = penpot.currentFile.pages.find((p) => p.name === CFG.name);
if (!target) return { ok: false, message: "no page named " + CFG.name };
if (penpot.currentPage.id === target.id) return { ok: true, alreadyThere: true };
penpot.openPage(target);
return { ok: true, switched: true };`,
    {
      name,
    },
  );
}

export interface FramesParams {
  page: string;
}

/** The top-level frames of a page: id, name and size, so they can be found by name and exported. */
export function frames(params: FramesParams): Snippet {
  return readSnippet(
    "frames",
    `${requirePage}
return { ok: true, readOnly: true, file: penpot.currentFile.name, fileId: penpot.currentFile.id, revn: penpot.currentFile.revn, page: penpot.currentPage.name, pageId: penpot.currentPage.id,
  frames: penpot.currentPage.root.children.filter((c) => c.type === "board").map((c) => ({ id: c.id, name: c.name, width: Math.round(c.width), height: Math.round(c.height) })) };`,
    params,
  );
}

export interface TreeParams {
  page: string;
  depth?: number;
  /** Only top-level shapes whose name starts with this. */
  namePrefix?: string;
  /** Stop after this many lines, so the answer stays small. */
  limit?: number;
}

/** One line per shape: type, name, size, position on the page, layout and sizing, the text it carries. */
export function tree(params: TreeParams): Snippet {
  if (
    (params.limit !== undefined &&
      (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > 1000)) ||
    (params.depth !== undefined &&
      (!Number.isInteger(params.depth) || params.depth < 0 || params.depth > 100))
  ) {
    throw new Error(
      "Readable tree budgets require limit 1..1000 and depth 0..100; use inspect for larger structured scopes",
    );
  }
  return readSnippet(
    "tree",
    `${requirePage}
const depth=CFG.depth===undefined?3:CFG.depth,limit=CFG.limit||400,lines=[];
let depthLimited=false,textLimited=false,labelLimited=false;
const stack=[],roots=penpot.currentPage.root.children.filter(c=>!CFG.namePrefix||c.name.startsWith(CFG.namePrefix));
for(let i=Math.min(roots.length,20000)-1;i>=0;i--)stack.push({shape:roots[i],depth:0});
const fx=s=>s.flex?" flex:"+s.flex.dir+"/"+s.flex.horizontalSizing+"-"+s.flex.verticalSizing:"";
const lc=s=>s.layoutChild?" lc:"+(s.layoutChild.horizontalSizing||"")+"-"+(s.layoutChild.verticalSizing||"")+(s.layoutChild.absolute?" ABS":""):"";
while(stack.length&&lines.length<limit){
  const item=stack.pop(),s=item.shape,name=String(s.name||""),text=String(s.characters||"");
  if(name.length>200)labelLimited=true;if(s.type==="text"&&text.length>24)textLimited=true;
  lines.push("  ".repeat(item.depth)+(s.type||"?")[0]+" "+s.id+" "+JSON.stringify(name.slice(0,200))+" "+Math.round(s.width)+"x"+Math.round(s.height)+"@"+Math.round(s.x)+","+Math.round(s.y)+fx(s)+lc(s)+(s.type==="text"?" «"+JSON.stringify(text.slice(0,24))+"»":"")+(s.hidden?" HIDDEN":""));
  const children=s.children||[];
  if(item.depth>=depth){if(children.length)depthLimited=true;continue;}
  const take=Math.min(children.length,20000-stack.length);
  if(take<children.length)depthLimited=true;
  for(let i=take-1;i>=0;i--)stack.push({shape:children[i],depth:item.depth+1});
}
const truncated=stack.length>0||roots.length>20000||depthLimited||textLimited||labelLimited;
return {ok:true,readOnly:true,page:penpot.currentPage.name,fileId:penpot.currentFile?.id??null,pageId:penpot.currentPage.id??null,revision:penpot.currentFile?.revn??null,lines,returnedLines:lines.length,depthLimit:depth,lineLimit:limit,truncated,complete:!truncated,limits:{depthLimited,textLimited,labelLimited,pendingBranches:stack.length}};`,
    params,
  );
}

export interface AuditParams {
  page: string;
  /** Top-level frames to audit: names starting with this. */
  framePrefix: string;
  /** The allowed gap and padding values. Omit to skip the spacing check. */
  spacingSteps?: number[];
  /** Shapes whose names start with one of these are not reported as unbound (library parts that carry their own fills). */
  ignoreUnbound?: string[];
}

/** Blank text, colours and strokes not bound to a token, children sticking out of their parent, gaps off the allowed steps. */
export function audit(params: AuditParams): Snippet {
  return readSnippet(
    "audit",
    `${requirePage}
const candidates=penpot.currentPage.root.children.filter(c=>c.name.startsWith(CFG.framePrefix)),frames=candidates.slice(0,20),out=Object.create(null);
const skip=n=>(CFG.ignoreUnbound||[]).some(prefix=>n.startsWith(prefix));
let visited=0,exampleBytes=0,partial=candidates.length>20;const deadline=Date.now()+5000;
const size=text=>{let n=0;for(const c of text){const p=c.codePointAt(0);n+=p<128?1:p<2048?2:p<65536?3:4;}return n;};
for(const fr of frames){
  const f={id:fr.id,name:fr.name.slice(0,200),nodes:0,texts:0,blankText:0,unboundFills:[],unboundStrokes:[],badSpacing:[],overflow:[],totals:{unboundFills:0,unboundStrokes:0,badSpacing:0,overflow:0},truncated:fr.name.length>200,scanComplete:true};
  const issue=(category,s,label)=>{f.totals[category]++;const example={id:s.id,label:String(label).slice(0,80)},bytes=size(JSON.stringify(example));if(f[category].length<8&&exampleBytes+bytes<=65536){f[category].push(example);exampleBytes+=bytes;}else f.truncated=true;if(String(label).length>80)f.truncated=true;};
  const stack=[{shape:fr,parent:null}];
  while(stack.length){
    if(visited>=20000||Date.now()>deadline){f.scanComplete=false;f.truncated=true;partial=true;break;}
    const {shape:s,parent}=stack.pop();visited++;f.nodes++;
    const tk=Object.keys(s.tokens||{});
    if(s.type==="text"){if(!(s.characters||"").trim())f.blankText++;else f.texts++;}
    else if(!skip(s.name)&&s.fills&&s.fills.some(fill=>fill.fillColor)&&!tk.some(key=>key.startsWith("fill")))issue("unboundFills",s,s.name+":"+s.fills[0].fillColor);
    if(s.type!=="text"&&!skip(s.name)&&s.strokes&&s.strokes.length&&!tk.some(key=>key.startsWith("stroke")))issue("unboundStrokes",s,s.name);
    if(s.flex&&CFG.spacingSteps)for(const value of [s.flex.rowGap,s.flex.columnGap,s.flex.topPadding,s.flex.rightPadding,s.flex.bottomPadding,s.flex.leftPadding])if(value!==undefined&&value!==null&&!CFG.spacingSteps.includes(Math.round(value)))issue("badSpacing",s,s.name+":"+value);
    if(parent&&parent.type==="board"&&!(s.layoutChild&&s.layoutChild.absolute)&&(s.x+s.width>parent.x+parent.width+1||s.x<parent.x-1))issue("overflow",s,s.name+" in "+parent.name);
    const children=(s.children||[]).filter(child=>!child.hidden),take=Math.min(children.length,Math.max(0,20000-visited-stack.length));
    if(take<children.length){f.scanComplete=false;f.truncated=true;partial=true;}
    for(let i=take-1;i>=0;i--)stack.push({shape:children[i],parent:s});
  }
  f.totalNodes=f.scanComplete?f.nodes:null;out[fr.id]=f;
}
const truncated=partial||Object.values(out).some(frame=>frame.truncated);
return {ok:true,readOnly:true,schemaVersion:1,kind:"audit-preview",scope:{framePrefix:CFG.framePrefix,includeHiddenDescendants:false},frames:out,frameCount:candidates.length,returnedFrames:frames.length,visitedNodes:visited,countsComplete:!partial,truncated,complete:!truncated,budgets:{frames:20,nodes:20000,timeMs:5000,examplesPerCategory:8,exampleBytes:65536}};`,
    params,
  );
}

/** Bounded typed preview. Use captureInspection(kind: tokens) for chunked complete evidence. */
export function tokensDump(): Snippet {
  return readSnippet(
    "tokens-dump",
    `const tokens=penpot.library.local.tokens;
const sets=[],themes=[];let records=0,bytes=1024,returnedTokens=0,complete=true;
const size=(value)=>{let n=0;for(const c of JSON.stringify(value)){const p=c.codePointAt(0);n+=p<128?1:p<2048?2:p<65536?3:4;}return n;};
outer:for(const [order,set] of tokens.sets.entries()){
  const value={order,name:set.name,active:!!set.active,tokens:[]};
  const count=size(value);
  if(records>=5000||bytes+count>262144){complete=false;break;}
  sets.push(value);records++;bytes+=count+1;
  for(const t of set.tokens){
    const token={name:t.name,value:t.value===undefined?null:t.value,type:t.type??null,description:t.description||"",unknowns:[...(t.type===undefined?["type"]:[]),...(t.value===undefined?["value"]:[])]},count=size(token);
    if(records>=5000||bytes+count>262144){complete=false;break outer;}
    value.tokens.push(token);records++;returnedTokens++;bytes+=count+1;
  }
}
for(const theme of tokens.themes){
  const value={group:theme.group,name:theme.name,active:!!theme.active,sets:(theme.activeSets||[]).map(s=>typeof s==="string"?s:s.name)},count=size(value);
  if(records>=5000||bytes+count>262144){complete=false;break;}
  themes.push(value);records++;bytes+=count+1;
}
return {ok:true,readOnly:true,schemaVersion:1,kind:"token-preview",fileId:penpot.currentFile.id,revision:penpot.currentFile.revn,complete,truncated:!complete,sets,themes,counts:{returnedTokens,totalTokens:complete?returnedTokens:null,setsTotal:tokens.sets.length,themesTotal:tokens.themes.length},previewBudget:{entities:5000,bytes:262144}};`,
  );
}
