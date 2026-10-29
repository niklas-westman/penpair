import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { snippet, type Snippet } from "../snippet.js";
import type { DesignRelease } from "./types.js";

const inspectBody = `
if (penpot.currentFile.id !== CFG.fileId) throw new Error("Pinned release file changed");
const read = page => {
  if (!page.root || typeof page.root.getSharedPluginData !== "function") throw new Error("Release ownership metadata API unavailable");
  const raw = page.root.getSharedPluginData("penpair","design-release");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { throw new Error("Malformed release ownership metadata"); }
};
const owned = penpot.currentFile.pages.filter(page => { const meta = read(page); return meta && meta.ownerKey === CFG.ownerKey; });
if (owned.length > 1) throw new Error("Duplicate release page ownership");
const named = penpot.currentFile.pages.filter(page => page.name === CFG.name);
const page = owned[0] || (CFG.adoptExisting && named.length === 1 ? named[0] : null);
if (named.some(candidate => !page || candidate.id !== page.id)) throw new Error("Release page name belongs to an unrelated page");
if (CFG.pageId && (!page || page.id !== CFG.pageId)) throw new Error("Pinned release page identity changed");
const marker = page ? read(page) : null;
if (marker && (marker.schemaVersion !== 1 || marker.owner !== "penpair" || marker.releaseId !== CFG.releaseId || marker.productVersion !== CFG.productVersion)) throw new Error("Release ownership marker changed");
let overview = null;
if (page) {
 const children = Array.isArray(page.root.children) ? page.root.children : [];
 if (children.length > 20000) throw new Error("Release page traversal limit exceeded");
 const boards = children.filter(shape => typeof shape.getSharedPluginData === "function" && shape.getSharedPluginData("penpair","release-overview") === CFG.ownerKey);
 if (boards.length > 1) throw new Error("Duplicate release overview ownership");
 overview = boards[0] || null;
}
const observation = {pageId:page ? page.id : null,overviewFrameId:overview ? overview.id : null,marker};
`;

function configuration(release: DesignRelease): Record<string, unknown> {
  return {
    fileId: release.fileId,
    releaseId: release.id,
    productVersion: release.productVersion,
    ownerKey: release.target.ownerKey,
    name: release.target.name,
    pageId: release.target.pageId,
    adoptExisting:
      release.schemaVersion === 2 &&
      Boolean(release.members?.length) &&
      release.members!.every((member) => member.disposition === "adopted"),
  };
}

export function inspectReleaseSnippet(release: DesignRelease): Snippet {
  return snippet(
    "design-release-inspect",
    `${inspectBody}\nreturn {ok:true,...observation};`,
    configuration(release),
    "read",
  );
}

export function assembleReleaseSnippet(release: DesignRelease): Snippet {
  return snippet(
    "design-release-assemble",
    `${inspectBody}
if (marker && marker.status !== "draft") throw new Error("Finalized release page is immutable to assembly");
if (typeof penpot.createPage !== "function" || typeof penpot.openPage !== "function" || typeof penpot.createBoard !== "function" || typeof penpot.createText !== "function") throw new Error("Native release assembly API unavailable");
const matchingFonts=Array.isArray(penpot.fonts.all)?penpot.fonts.all.filter(font=>font.name==="Inter"):[];
if(matchingFonts.length!==1)throw new Error("Inter font unavailable or ambiguous");
const font=matchingFonts[0];
const variants = font && Array.isArray(font.variants) ? font.variants.filter(variant => String(variant.fontWeight) === "400" && (variant.fontStyle || "normal") === "normal") : [];
if (!font || typeof font.applyToText !== "function" || variants.length !== 1) throw new Error("Inter regular font unavailable or ambiguous");
let target = page;
if (!target) { target = penpot.createPage(); target.name = CFG.name; }
await penpot.openPage(target);
if (penpot.currentPage.id !== target.id || penpot.currentFile.id !== CFG.fileId) throw new Error("New release page did not become active");
if (typeof target.root.setSharedPluginData !== "function") throw new Error("Release ownership write API unavailable");
target.root.setSharedPluginData("penpair","design-release",JSON.stringify({schemaVersion:1,owner:"penpair",releaseId:CFG.releaseId,productVersion:CFG.productVersion,ownerKey:CFG.ownerKey,status:"draft"}));
if (!overview) {
 if (target.root.children.length && !CFG.adoptExisting) throw new Error("Unexplained shapes on interrupted release page; inspect before resuming");
 const overviewX=CFG.adoptExisting?Math.max(0,...target.root.children.map(shape=>Number(shape.x)+Number(shape.width)))+200:0;
 overview = penpot.createBoard(); overview.name = "Release overview"; overview.resize(1200,CFG.overviewHeight); overview.x=overviewX; overview.y=0; overview.fills=[{fillColor:"#FFFFFF",fillOpacity:1}];
 overview.setSharedPluginData("penpair","release-overview",CFG.ownerKey);
 const boldVariants=font.variants.filter(variant=>String(variant.fontWeight)==="700"&&(variant.fontStyle||"normal")==="normal");
 const bold=boldVariants.length===1?boldVariants[0]:variants[0];
 const italics=font.variants.filter(variant=>String(variant.fontWeight)==="400"&&variant.fontStyle==="italic");
 const flexBoard=(parent,name,dir,gap)=>{const board=penpot.createBoard();parent.appendChild(board);board.name=name;board.fills=[];board.clipContent=false;board.addFlexLayout();board.flex.dir=dir;board.flex.wrap="nowrap";board.flex.alignItems="start";board.flex.justifyContent="start";board.flex.rowGap=gap;board.flex.columnGap=gap;board.flex.horizontalSizing="auto";board.flex.verticalSizing="auto";return board;};
 const flowText=(parent,str,variant,size,color,name)=>{const t=penpot.createText(str);parent.appendChild(t);t.name=name;font.applyToText(t,variant);t.fontSize=size;t.fills=[{fillColor:color,fillOpacity:1}];t.growType="auto-height";if(!t.layoutChild)throw new Error("Text layout child unavailable");t.layoutChild.horizontalSizing="fill";return t;};
 const column=flexBoard(overview,"Release cover content","column",24);
 column.resize(CFG.coverTextWidth,column.height);column.flex.horizontalSizing="fix";column.flex.verticalSizing="auto";column.x=overview.x+64;column.y=overview.y+170;
 flowText(column,"RELEASE",bold,18,"#4a5461","Release eyebrow");
 flowText(column,CFG.coverVersion,bold,CFG.coverVersionSize,"#20262e","Release version");
 flowText(column,CFG.coverTitle,variants[0],24,"#4a5461","Release title");
 const row=flexBoard(column,"Release tags","row",12);row.flex.wrap="wrap";row.resize(CFG.coverTextWidth,row.height);row.flex.horizontalSizing="fix";row.flex.verticalSizing="auto";
 for(const tag of CFG.coverTags){
  const chip=flexBoard(row,"Tag "+tag.label,"row",0);chip.flex.alignItems="center";chip.flex.paddingType="multiple";chip.flex.topPadding=10;chip.flex.rightPadding=16;chip.flex.bottomPadding=10;chip.flex.leftPadding=16;chip.borderRadius=20;
  chip.fills=[{fillColor:tag.accent?"#d9f7ee":"#e4e7eb",fillOpacity:1}];chip.strokes=[{strokeColor:tag.accent?"#2fd3a0":"#b9c0c9",strokeWidth:1,strokeAlignment:"inner"}];
  const label=penpot.createText(tag.label);chip.appendChild(label);label.name="Tag label "+tag.label;font.applyToText(label,variants[0]);label.fontSize=16;label.growType="auto-width";label.fills=[{fillColor:"#20262e",fillOpacity:1}];
 }
 const spacer=flexBoard(column,"Spacer","column",0);spacer.resize(1,24);spacer.flex.horizontalSizing="fix";spacer.flex.verticalSizing="fix";
 flowText(column,CFG.summary,italics.length===1?italics[0]:variants[0],20,"#172033","Release summary");
 const bytes=Uint8Array.from(atob(CFG.coverImage),c=>c.charCodeAt(0));
 const media=await penpot.uploadMediaData("penpair-release-cover",bytes,"image/webp");
 const art=penpot.createRectangle();art.name="Release cover illustration";art.resize(CFG.coverImageWidth,CFG.coverImageHeight);art.x=overview.x+589;art.y=overview.y+380;art.fills=[{fillOpacity:1,fillImage:media}];overview.appendChild(art);
 if(typeof penpot.waitForLayoutUpdate==="function")await penpot.waitForLayoutUpdate();
 overview.resize(1200,Math.max(800,Math.ceil(column.y-overview.y+column.height+64)));
}
return {ok:true,pageId:target.id,overviewFrameId:overview.id};`,
    {
      ...configuration(release),
      overviewHeight: releaseOverviewHeight(release),
      summaryHeight: releaseOverviewSummary(release).split("\n").length * 30 + 40,
      summary: releaseOverviewSummary(release),
      ...releaseCover(release),
    },
    "write",
  );
}

export function releaseOverviewHeight(release: DesignRelease): number {
  if (release.schemaVersion !== 2) {
    return 800;
  }
  return Math.max(
    800,
    coverHeight +
      releaseOverviewSummary(release).split("\n").length * 30 +
      (release.members ?? []).length * 36 +
      160,
  );
}

/** Where the member links start: below the cover and the summary text. */
export function releaseOverviewLinkOffset(release: DesignRelease): number {
  return coverHeight + releaseOverviewSummary(release).split("\n").length * 30 + 150;
}

const coverHeight = 507;
const coverTextWidth = 520;
const coverImageWidth = 915;
const coverImageHeight = Math.round((coverImageWidth * 558) / 786);
let coverImage: string | undefined;

export interface ReleaseCoverTag {
  label: string;
  width: number;
  accent?: boolean;
}

/** One chip per layer in the release, derived from its contents; none is typed in by hand. */
export function releaseCoverTags(release: DesignRelease): ReleaseCoverTag[] {
  const labels: {
    label: string;
    accent?: boolean;
  }[] = [];
  const kinds = new Set(release.contracts.map((contract) => contract.kind));
  if (kinds.has("journey-map")) {
    labels.push({
      label: "Journey map",
    });
  }
  if (kinds.has("integration-map")) {
    labels.push({
      label: "Integration map",
    });
  }
  const count = (disposition: string): number =>
    (release.members ?? []).filter((member) => member.disposition === disposition).length;
  const changed = release.schemaVersion === 2 ? count("changed") : release.sources.length;
  if (changed) {
    labels.push({
      label: `${changed} changed screen${changed === 1 ? "" : "s"}`,
      accent: true,
    });
  }
  const retained = count("retained") + count("adopted");
  if (retained) {
    labels.push({
      label: `${retained} retained screen${retained === 1 ? "" : "s"}`,
    });
  }
  return labels.map(({ label, accent }) => ({
    label,
    width: Math.ceil(label.length * 9.4 + 32),
    ...(accent
      ? {
          accent,
        }
      : {}),
  }));
}

function releaseCover(release: DesignRelease): Record<string, unknown> {
  coverImage ??= readFileSync(
    fileURLToPath(new URL("../../assets/release-cover.webp", import.meta.url)),
  ).toString("base64");
  const version = /^\d/.test(release.productVersion)
    ? `v${release.productVersion}`
    : release.productVersion;
  const size = Math.max(40, Math.min(128, Math.floor(coverTextWidth / (version.length * 0.6))));
  return {
    coverTextWidth,
    coverVersion: version,
    coverVersionSize: size,
    coverTitle: release.title,
    coverImage,
    coverImageWidth,
    coverImageHeight,
    coverTags: releaseCoverTags(release),
  };
}

function releaseOverviewSummary(release: DesignRelease): string {
  return [
    "Journey and integration contracts",
    ...release.contracts.map((contract) => `${contract.kind}: ${contract.id}`),
    release.schemaVersion === 2
      ? "Changed frames require target approvals; retained frames keep independently verified original approvals. Overview links identify the complete active release inventory."
      : "Native screen transfer uses explicit source-to-target frame ID receipts; no source image approval is reused. Review the release record for current design status.",
    ...release.sources.map((source) => source.label.slice(0, 200)),
  ].join("\n");
}

export function finalizeReleaseSnippet(
  release: DesignRelease,
  bundleHash: string,
  reviewHash: string,
): Snippet {
  return snippet(
    "design-release-finalize",
    `${inspectBody}
if (!page || !overview) throw new Error("Owned release page or overview is missing");
if (marker.status === "released") {
 if (marker.bundleHash !== CFG.bundleHash || marker.reviewHash !== CFG.reviewHash) throw new Error("Release version already finalized with different evidence");
 return {ok:true,marker};
}
if (marker.status !== "draft") throw new Error("Release marker is unsupported");
await penpot.openPage(page);
page.root.setSharedPluginData("penpair","design-release",JSON.stringify({...marker,status:"released",bundleHash:CFG.bundleHash,reviewHash:CFG.reviewHash}));
return {ok:true};`,
    {
      ...configuration(release),
      bundleHash,
      reviewHash,
    },
    "write",
  );
}
