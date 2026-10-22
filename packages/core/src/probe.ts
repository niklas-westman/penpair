import { redactEndpoint, type Endpoint } from "./endpoint.js";
import { executeCode, maxSnippetBytes, type PenpotToolClient } from "./client.js";
import { validateFileIntegrity } from "./native-api.js";

export interface ProbeOptions {
  integrity?: boolean;
  /** Request sizes in KB to try; the first refused one marks the limit. */
  requestSizesKb?: number[];
  responseSizesKb?: number[];
}

export interface ProbeReport {
  integrity?: Awaited<ReturnType<typeof validateFileIntegrity>>;
  schemaVersion: 1;
  endpoint: Endpoint["description"];
  /** Tool names the server offers; absent when the server cannot list them. */
  tools?: string[];
  capabilities: unknown;
  requestLimit: Record<string, string>;
  responseLimit: Record<string, string>;
}

export const capabilityCode = `
const f = penpot.currentFile, page = penpot.currentPage, lib = penpot.library.local;
const shape = page.root.children.find((c) => c.width < 400 && c.height < 400) || page.root.children[0];
let exported = null;
if (shape) { try { const b = await shape.export({ type: "png", scale: 1 }); exported = b.length; } catch (e) { exported = "error: " + String(e && e.message || e).slice(0, 80); } }
return {
  schemaVersion: 1, observedAt: new Date().toISOString(), fileId: f ? f.id : null, pageId: page ? page.id : null,
  file: f ? f.name : null, revn: f ? f.revn : null, penpotApi: typeof penpot.version === "string" ? penpot.version : null, pages: f ? f.pages.length : null, currentPage: page ? page.name : null,
  apis: { tokens: typeof lib.tokens, tokenSets: lib.tokens ? lib.tokens.sets.length : null, themes: lib.tokens ? lib.tokens.themes.length : null, components: lib.components.length,
    uploadMediaData: typeof penpot.uploadMediaData, createBoard: typeof penpot.createBoard, openPage: typeof penpot.openPage, fileExport: typeof (f && f.export),
    layoutWait: typeof penpot.waitForLayoutUpdate, fileValidate: typeof (f && f.validate), saveVersion: typeof (f && f.saveVersion), findVersions: typeof (f && f.findVersions), generateMarkup: typeof penpot.generateMarkup, generateStyle: typeof penpot.generateStyle, generateFontFaces: typeof penpot.generateFontFaces },
  shapeApis: shape ? { swapComponent: typeof shape.swapComponent, applyToken: typeof shape.applyToken, flex: typeof shape.addFlexLayout, exportSmallShape: exported } : "not checked: the page has no shape; open a file with at least one shape to check these",
};`;

/**
 * What a connected Penpot and its MCP offer, and the limits scripts rely on. Read-only: nothing is written in Penpot.
 * `connect` returns a fresh client each time, because a refused oversized request can end the connection.
 */
export async function probe(
  endpoint: Endpoint,
  connect: () => Promise<PenpotToolClient>,
  {
    requestSizesKb = [
      60,
      90,
      110,
      200,
    ],
    responseSizesKb = [
      100,
      1000,
    ],
    integrity = false,
  }: ProbeOptions = {},
): Promise<ProbeReport> {
  const redact = (text: string): string => redactEndpoint(text, endpoint);
  async function attempt(
    code: string,
    bypassGuard = false,
  ): Promise<{
    ok: boolean;
    value?: unknown;
    error?: string;
  }> {
    const client = await connect();
    try {
      if (bypassGuard) {
        const outcome = await client.callTool("execute_code", {
          code,
        });
        return {
          ok: !outcome.isError,
        };
      }
      const { result } = await executeCode(client, code, {
        redact,
        retries: 0,
        effect: "read",
      });
      return {
        ok: true,
        value: result,
      };
    } catch (error) {
      return {
        ok: false,
        error: redact(String((error as Error)?.message ?? error)).slice(0, 90),
      };
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  let tools: string[] | undefined;
  {
    const client = await connect();
    try {
      tools = await client.listTools?.();
    } catch {
      tools = undefined;
    } finally {
      await client.close().catch(() => undefined);
    }
  }
  if (tools && !tools.includes("execute_code")) {
    // Everything penpair does goes through execute_code; say so plainly instead of failing test by test.
    return {
      schemaVersion: 1,
      endpoint: endpoint.description,
      tools,
      capabilities: {
        error: "this MCP server offers no execute_code tool, so penpair cannot drive this Penpot",
      },
      requestLimit: {},
      responseLimit: {},
    };
  }
  const capabilityResult = await attempt(capabilityCode);
  let integrityResult: ProbeReport["integrity"];
  if (integrity) {
    const client = await connect();
    try {
      integrityResult = await validateFileIntegrity(client);
    } finally {
      await client.close();
    }
  }
  const requestLimit: Record<string, string> = {};
  for (const kb of requestSizesKb) {
    // Sizes above the guard are sent on purpose: the probe is how the real limit is found.
    const code = `/*${"x".repeat(kb * 1024)}*/ return "ok";`;
    const result = await attempt(code, Buffer.byteLength(code) > maxSnippetBytes);
    requestLimit[`${kb} KB`] = result.ok ? "accepted" : `refused (${result.error ?? "error"})`;
  }
  const responseLimit: Record<string, string> = {};
  for (const kb of responseSizesKb) {
    const result = await attempt(`return "y".repeat(${kb * 1024});`);
    const length = typeof result.value === "string" ? result.value.length : -1;
    responseLimit[`${kb} KB`] =
      result.ok && length >= kb * 1024 ? "returned" : `failed (${result.error ?? "short"})`;
  }
  return {
    schemaVersion: 1,
    ...(integrityResult
      ? {
          integrity: integrityResult,
        }
      : {}),
    endpoint: endpoint.description,
    ...(tools
      ? {
          tools,
        }
      : {}),
    capabilities: capabilityResult.ok
      ? capabilityResult.value
      : {
          error: capabilityResult.error,
        },
    requestLimit,
    responseLimit,
  };
}
