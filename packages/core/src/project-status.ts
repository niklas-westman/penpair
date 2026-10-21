import { onboardingChecklist } from "./onboard.js";
import type { ProjectConfig } from "./instance/config.js";
import type { PenpotToolClient } from "./client.js";
import { snippet, runSnippet } from "./snippet.js";
import { installSkills } from "./skills.js";
import { readBaselineCoverage } from "./baseline-coverage.js";
import type { AdapterStatusLine } from "./adapters.js";
import { redactEndpoint } from "./endpoint.js";

export interface ProjectStatusOptions {
 connection?: () => Promise<PenpotToolClient>;
 reachable?: (origin: string) => Promise<boolean>;
 adapterStatus?: () => Promise<AdapterStatusLine[]>;
 redact?: (text: string) => string;
}
export const projectFileUrl = (config: ProjectConfig): string => {
 const url = onboardingChecklist(config).fileUrl; if (!url) throw new Error("Pin the owner-confirmed file before opening it"); return url;
};
export async function openProject(config: ProjectConfig, open: (url: string) => Promise<unknown>): Promise<string> { const url = projectFileUrl(config); await open(url); return url; }
export async function projectStatus(root: string, config: ProjectConfig, options: ProjectStatusOptions = {}) {
 const origin = onboardingChecklist(config).origin, lines: AdapterStatusLine[] = [];
 const safe = (error: unknown) => (options.redact ?? redactEndpoint)(String((error as Error).message));
 let reachable = false;
 try { reachable = await (options.reachable ?? (async origin => (await fetch(origin, { redirect: "manual", signal: AbortSignal.timeout(5000) })).status < 500))(origin); } catch {}
 lines.push({ id: "deployment", label: "Penpot", state: reachable ? "ok" : "failed", detail: reachable ? `${origin} answers` : `${origin} is unavailable` });
 lines.push({ id: "file-pin", label: "File pin", state: config.file ? "ok" : "unknown", detail: config.file ? config.file.name ?? config.file.id : "No owner-confirmed file pin" });
 let connection: Record<string, unknown> | null = null;
 if (options.connection) {
   let client: PenpotToolClient | undefined;
   try {
     client = await options.connection();
     const observation = await runSnippet(client, snippet("project-status", `return {ok:true,fileId:penpot.currentFile.id,file:penpot.currentFile.name,revision:penpot.currentFile.revn,pages:penpot.currentFile.pages.map(p=>({id:p.id,name:p.name})),apiVersion:typeof penpot.version==="string"?penpot.version:null,capabilities:{tokens:!!penpot.library?.local?.tokens,fonts:!!penpot.fonts,nativeLayout:typeof penpot.currentPage.root.waitForLayoutUpdate==="function"}};`, {}, "read"));
     if (!config.file || observation.fileId !== config.file.id || !Array.isArray(observation.pages) || !Number.isInteger(observation.revision)) throw new Error("Status did not observe the configured file identity/revision");
     const { execution: _execution, ...data } = observation; connection = data;
     lines.push({ id: "connection", label: "Editor and plugin", state: "ok", detail: `Pinned file connected; ${observation.pages.length} pages` });
   } catch (error) { lines.push({ id: "connection", label: "Editor and plugin", state: "failed", detail: safe(error) }); }
   finally { await client?.close(); }
 } else lines.push({ id: "connection", label: "Editor and plugin", state: "unknown", detail: "No resolved project connection" });
 try {
   const skills = await installSkills({ root, dryRun: true });
   lines.push({ id: "skills", label: "Skills", state: skills.wouldInstall?.length || skills.wouldLink?.length || skills.kept.length ? "warning" : "ok", detail: `${skills.wouldInstall?.length ?? 0} missing/update candidates; ${skills.kept.length} locally edited files preserved; discovery is not verified` });
 } catch (error) { lines.push({ id: "skills", label: "Skills", state: "unknown", detail: safe(error) }); }
 let coverage: unknown = null;
 if (config.baselines) {
   try { const found = await readBaselineCoverage(root, config.baselines, config.file?.id); coverage = found; lines.push({ id: "baselines", label: "Baselines", state: found.designCasesComplete ? "ok" : "warning", detail: found.configured ? "See explicit case coverage" : "No complete rich coverage matrix declared" }); }
   catch (error) { lines.push({ id: "baselines", label: "Baselines", state: "failed", detail: safe(error) }); }
 } else lines.push({ id: "baselines", label: "Baselines", state: "unknown", detail: "No baseline configuration" });
 if (options.adapterStatus) {
   try {
     const adapterLines = await options.adapterStatus();
     if (!Array.isArray(adapterLines) || adapterLines.length > 100 || adapterLines.some(l => !l || typeof l.id !== "string" || typeof l.label !== "string" || typeof l.detail !== "string" || !["ok", "warning", "failed", "unknown"].includes(l.state))) throw new Error("Invalid adapter status lines");
     lines.push(...adapterLines);
   } catch (error) { lines.push({ id: "adapters", label: "Adapters", state: "failed", detail: safe(error) }); }
 } else if (config.adapters?.length) lines.push({ id: "adapters", label: "Adapters", state: "unknown", detail: "Not loaded; --adapters explicitly executes trusted status hooks" });
 const complete = lines.every(l => l.state !== "unknown"), ok = complete && lines.every(l => l.state === "ok");
 return { schemaVersion: 1, kind: "project-status", project: config.instance, origin, fileUrl: config.file ? projectFileUrl(config) : null, connection, coverage, lines, complete, ok, visualApproval: false };
}
