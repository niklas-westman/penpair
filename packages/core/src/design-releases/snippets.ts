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
const page = owned[0] || null;
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
 if (target.root.children.length) throw new Error("Unexplained shapes on interrupted release page; inspect before resuming");
 overview = penpot.createBoard(); overview.name = "Release overview"; overview.resize(1200,800); overview.x=0; overview.y=0; overview.fills=[{fillColor:"#FFFFFF",fillOpacity:1}];
 overview.setSharedPluginData("penpair","release-overview",CFG.ownerKey);
 const text=penpot.createText(CFG.summary); font.applyToText(text,variants[0]); text.fontSize=20; text.resize(1100,700); text.growType="auto-height"; text.x=40;text.y=40;text.fills=[{fillColor:"#172033",fillOpacity:1}]; overview.appendChild(text);
}
return {ok:true,pageId:target.id,overviewFrameId:overview.id};`,
    {
      ...configuration(release),
      summary: [
        release.title,
        `Product ${release.productVersion}`,
        "Journey and integration contracts",
        ...release.contracts.map((contract) => `${contract.kind}: ${contract.id}`),
        "Native screen transfer uses explicit source-to-target frame ID receipts; no source image approval is reused. Review the release record for current design status.",
        ...release.sources.map((source) => source.label.slice(0, 200)),
      ].join("\n"),
    },
    "write",
  );
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
