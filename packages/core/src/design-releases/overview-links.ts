import type { PenpotToolClient } from "../client.js";
import { observationHash, readJournal, readJournalTarget, runJournaledSteps } from "../journal.js";
import { rememberPage } from "../page-session.js";
import { runSnippet, snippet, type Snippet } from "../snippet.js";
import { releaseOverviewLinkOffset } from "./snippets.js";
import { hashDesignRelease } from "./validation.js";
import type { DesignRelease, ReceiptInput, ReleaseOptions } from "./types.js";

export interface ReleaseOverviewTarget {
  id: string;
  label: string;
  disposition: string;
  pageId: string;
  frameId: string;
}

export function releaseOverviewTargets(
  release: DesignRelease,
  receipts: ReceiptInput[] = release.receipts,
): ReleaseOverviewTarget[] {
  if (release.schemaVersion !== 2) {
    return [];
  }
  if (
    new Set(receipts.map((receipt) => receipt.sourceId)).size !== receipts.length ||
    new Set(receipts.map((receipt) => receipt.targetFrameId)).size !== receipts.length ||
    receipts.some((receipt) => !release.sources.some((source) => source.id === receipt.sourceId))
  ) {
    throw new Error("Overview receipts contain duplicate or unknown changed members");
  }
  return (release.members ?? []).flatMap((member) => {
    const receipt = receipts.find((receipt) => receipt.sourceId === member.id);
    if (member.disposition === "changed" && !receipt) {
      return [];
    }
    const pageId = member.disposition === "changed" ? release.target.pageId : member.source.pageId;
    const frameId =
      member.disposition === "changed" ? receipt!.targetFrameId : member.source.frameId;
    if (
      !pageId ||
      release.sources.some(
        (source) => source.frameId === frameId && member.disposition === "changed",
      )
    ) {
      throw new Error("Overview changed targets require independent copied frame identities");
    }
    return [
      {
        id: member.id,
        label: member.source.label,
        disposition: member.disposition,
        pageId,
        frameId,
      },
    ];
  });
}

const readLinks = `
if (penpot.currentFile.id !== CFG.fileId) throw new Error("Release overview file changed");
const pages=penpot.currentFile.pages.filter(page=>page.id===CFG.pageId);
if(pages.length!==1)throw new Error("Release overview page unavailable");
const page=pages[0];
const overview=page.getShapeById(CFG.overviewFrameId);
if(!overview || overview.getSharedPluginData("penpair","release-overview")!==CFG.ownerKey)throw new Error("Release overview ownership changed");
const links=[];
for(const shape of overview.children || []){
 const raw=shape.getSharedPluginData("penpair","release-member");
 if(!raw)continue;
 let metadata;try{metadata=JSON.parse(raw);}catch{throw new Error("Malformed release member metadata");}
 if(links.some(link=>link.id===metadata.id))throw new Error("Duplicate release overview member");
 const interactions=Array.isArray(shape.interactions)?shape.interactions:[];
 const interaction=interactions.length===1?interactions[0]:null;
 const destination=interaction?.action?.destination;
 const destinationPages=destination?penpot.currentFile.pages.filter(candidate=>candidate.getShapeById(destination.id)?.id===destination.id):[];
 links.push({id:metadata.id,pageId:destinationPages.length===1?destinationPages[0].id:null,frameId:destination?.id || null,valid:interaction?.trigger==="click" && interaction?.action?.type==="navigate-to" && metadata.pageId===destinationPages[0]?.id && metadata.frameId===destination?.id,shapeId:shape.id});
}
`;

function overviewConfiguration(
  release: DesignRelease,
  targets: ReleaseOverviewTarget[],
): Record<string, unknown> {
  return {
    fileId: release.fileId,
    pageId: release.target.pageId,
    overviewFrameId: release.target.overviewFrameId,
    ownerKey: release.target.ownerKey,
    targets,
    offset: releaseOverviewLinkOffset(release),
  };
}

export function overviewLinksSnippet(
  release: DesignRelease,
  targets: ReleaseOverviewTarget[],
  apply = false,
): Snippet {
  const write = `
const rawMarker=page.root.getSharedPluginData("penpair","design-release");
let marker;try{marker=JSON.parse(rawMarker);}catch{throw new Error("Release marker unavailable");}
if(marker.status!=="draft" || marker.ownerKey!==CFG.ownerKey)throw new Error("Only owned draft overviews can change");
const destinations=new Map();
for(const target of CFG.targets){
 const sourcePages=penpot.currentFile.pages.filter(candidate=>candidate.id===target.pageId);
 const destination=sourcePages.length===1?sourcePages[0].getShapeById(target.frameId):null;
 if(!destination || destination.type!=="board" || destination.id!==target.frameId)throw new Error("Release overview target unavailable: "+target.id);
 destinations.set(target.id,destination);
}
const fonts=penpot.fonts.all.filter(font=>font.name==="Inter");
const variants=fonts.length===1?fonts[0].variants.filter(variant=>String(variant.fontWeight)==="400" && (variant.fontStyle || "normal")==="normal"):[];
if(fonts.length!==1 || variants.length!==1)throw new Error("Release overview font unavailable");
await penpot.openPage(page);
if(typeof penpot.waitForLayoutUpdate==="function")await penpot.waitForLayoutUpdate();
const column=overview.children.find(shape=>shape.name==="Release cover content");
const linkBase=column?Math.ceil(column.y-overview.y+column.height+40):CFG.offset;
for(const [index,target] of CFG.targets.entries()){
 const existing=links.find(link=>link.id===target.id);
 const shape=existing?page.getShapeById(existing.shapeId):penpot.createText(" ");
 if(typeof shape.addInteraction!=="function" || typeof shape.removeInteraction!=="function")throw new Error("Release overview navigation API unavailable");
 shape.characters=target.disposition+": "+target.label;fonts[0].applyToText(shape,variants[0]);shape.fontSize=18;shape.resize(1100,32);shape.growType="auto-height";shape.x=overview.x+40;shape.y=overview.y+linkBase+index*36;shape.fills=[{fillColor:"#3448A5",fillOpacity:1}];
 for(const interaction of [...(shape.interactions || [])])shape.removeInteraction(interaction);
 shape.addInteraction("click",{type:"navigate-to",destination:destinations.get(target.id)});
 shape.setSharedPluginData("penpair","release-member",JSON.stringify({id:target.id,pageId:target.pageId,frameId:target.frameId,disposition:target.disposition}));overview.appendChild(shape);
}
for(const old of links)if(!CFG.targets.some(target=>target.id===old.id))page.getShapeById(old.shapeId).remove();
overview.resize(1200,Math.max(overview.height,linkBase+CFG.targets.length*36+64));
return {ok:true};`;
  return snippet(
    apply ? "design-release-overview-write" : "design-release-overview-read",
    `${readLinks}\n${apply ? write : "return {ok:true,links};"}`,
    overviewConfiguration(release, targets),
    apply ? "write" : "read",
  );
}

function linksMatch(result: Record<string, unknown>, targets: ReleaseOverviewTarget[]): boolean {
  const links = result.links as
    | Array<{
        id: string;
        pageId: string;
        frameId: string;
        valid: boolean;
      }>
    | undefined;
  return (
    Array.isArray(links) &&
    links.length === targets.length &&
    targets.every((target) =>
      links.some(
        (link) =>
          link.valid &&
          link.id === target.id &&
          link.pageId === target.pageId &&
          link.frameId === target.frameId,
      ),
    )
  );
}

export async function assertReleaseOverviewLinks(
  client: PenpotToolClient,
  release: DesignRelease,
): Promise<void> {
  if (release.schemaVersion !== 2) {
    return;
  }
  const targets = releaseOverviewTargets(release);
  if (
    targets.length !== release.members?.length ||
    !linksMatch(await runSnippet(client, overviewLinksSnippet(release, targets)), targets)
  ) {
    throw new Error(
      "Release overview does not link every resolved member; assemble with complete copy receipts before verification",
    );
  }
}

export async function publishReleaseOverviewLinks(
  client: PenpotToolClient,
  root: string,
  release: DesignRelease,
  runId: string,
  options: ReleaseOptions,
): Promise<void> {
  if (release.schemaVersion !== 2) {
    return;
  }
  const targets = releaseOverviewTargets(release, options.receipts ?? release.receipts);
  const inspect = (): Promise<Record<string, unknown>> =>
    runSnippet(client, overviewLinksSnippet(release, targets));
  const initial = await inspect();
  const complete = (result: Record<string, unknown>): boolean => linksMatch(result, targets);
  if (complete(initial)) {
    return;
  }
  const journalId = `links-${observationHash({
    runId,
    targets,
  }).slice(0, 48)}`;
  let resume = false;
  if (options.resume) {
    try {
      await readJournal(root, journalId);
      resume = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
  await runJournaledSteps(
    [
      {
        key: "overview-members",
        label: "Link resolved release members",
        signature: overviewLinksSnippet(release, targets, true).code,
        initial,
        inspect,
        apply: async () => {
          const result = await runSnippet(client, overviewLinksSnippet(release, targets, true), {
            retries: 0,
            effect: "write",
          });
          rememberPage(client, {
            fileId: release.fileId,
            pageId: release.target.pageId!,
          });
          return result;
        },
        verify: complete,
        reconcile: (_before, current) => (complete(current) ? "complete" : "pending"),
      },
    ],
    {
      root,
      runId: journalId,
      resume,
      operation: "design-release-overview-links",
      input: {
        releaseId: release.id,
        targets,
      },
      payload: {
        kind: "design-release-operation",
        releaseId: release.id,
        productVersion: release.productVersion,
        designHash: hashDesignRelease(release),
      },
      target: () => readJournalTarget(client),
      onStep: options.onStep,
      redact: options.redact,
    },
  );
}
