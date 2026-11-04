import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { inspectBrowserTarget, type BrowserTargetOptions } from "./browser-wake.js";
import type { PenpotToolClient } from "./client.js";
import type { CaptureIdentity, ExportResult } from "./export.js";
import { debuggingSocketUrl, type ClipboardSocket } from "./native-editor-clipboard.js";
import { runOnPage, type OperationOptions } from "./operation.js";
import { withPageSession } from "./page-session.js";
import { requirePage, snippet } from "./snippet.js";

/** Renders frames by capturing the open Penpot editor instead of asking Penpot's exporter, which costs seconds per request. */
export interface EditorRenderOptions extends OperationOptions {
  page?: string;
  scale?: number;
  browser: BrowserTargetOptions & {
    /** Tests substitute the protocol transport; ordinary commands use Node's WebSocket. */
    createSocket?: (url: string) => ClipboardSocket;
  };
  /** Pause between captures that must match; the canvas needs a moment to draw after the viewport moves. */
  captureSettleMs?: number;
  /** Captures tried before a frame is reported as not settled. */
  maxCaptures?: number;
}

export type EditorRenderOutcome =
  | {
      ok: true;
      result: ExportResult;
    }
  | {
      ok: false;
      message: string;
    };

/** Frames wider or taller than this would exceed what a browser can draw in one capture. */
export const largestEditorFrameSide = 8000;
/**
 * Space kept free on every side of the frame inside the canvas, so the editor's floating toolbar and rulers, which sit over the canvas
 * edges, never cover the frame.
 */
const framePadding = 120;
const protocolDeadlineMs = 30_000;
const largestMessageBytes = 64 * 1024 * 1024;
const canvasRectExpression = `(() => {
 const canvas = document.querySelector("svg.viewport-controls, #render, canvas[data-testid='workspace-canvas']");
 if (!canvas) return null;
 const box = canvas.getBoundingClientRect();
 return {x: box.left, y: box.top, width: box.width, height: box.height, windowWidth: innerWidth, windowHeight: innerHeight};
})()`;

interface FramingResult {
  ok: boolean;
  message?: string;
  capture: CaptureIdentity;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  zoom: number;
  restore: {
    zoom: number;
    center: {
      x: number;
      y: number;
    };
  };
}

/**
 * Selects nothing, shows the frame at 1:1 and moves the view so the frame starts on a whole pixel, which keeps its edges sharp.
 * It writes no design data; only the editor's own view changes.
 */
const framingSnippet = (frameId: string, scale: number, page?: string) =>
  snippet(
    "editor-render-framing",
    `${requirePage}
const s = penpot.currentPage.getShapeById(CFG.id);
if (!s) return { ok: false, message: "no shape " + CFG.id + " on " + penpot.currentPage.name };
const active = (penpot.library?.local?.tokens?.themes || []).filter(t=>t.active);
const capture = {designSize:{width:s.width,height:s.height},activeThemeIds:active.every(t=>typeof t.id==="string"&&t.id)?active.map(t=>t.id).sort():null,fileId:penpot.currentFile.id, pageId:penpot.currentPage.id, frameId:s.id, revision:penpot.currentFile.revn, scale:CFG.scale,
  penpotApiVersion:typeof penpot.version === "string" ? penpot.version : null,
  renderEnvironment:typeof navigator !== "undefined" ? navigator.userAgent : null,
  activeThemes:(penpot.library?.local?.tokens?.themes || []).filter(t=>t.active).map(t=>t.group+"/"+t.name).sort()};
const restore = { zoom: penpot.viewport.zoom, center: { x: penpot.viewport.center.x, y: penpot.viewport.center.y } };
penpot.selection = [];
penpot.viewport.zoom = 1;
penpot.viewport.center = { x: s.x + s.width / 2, y: s.y + s.height / 2 };
const offset = { x: s.x - penpot.viewport.bounds.x, y: s.y - penpot.viewport.bounds.y };
penpot.viewport.center = { x: penpot.viewport.center.x + (offset.x - Math.round(offset.x)), y: penpot.viewport.center.y + (offset.y - Math.round(offset.y)) };
return { ok: true, capture, rect: { x: s.x, y: s.y, width: s.width, height: s.height }, bounds: penpot.viewport.bounds, zoom: penpot.viewport.zoom, restore };`,
    {
      id: frameId,
      scale,
      page,
    },
    "read",
  );

/** The restore step of the framing snippet: puts the user's view back. */
const restoreSnippet = (restore: FramingResult["restore"]) =>
  snippet(
    "editor-render-restore",
    `penpot.viewport.zoom = CFG.zoom;
penpot.viewport.center = CFG.center;
return { ok: true };`,
    restore,
    "read",
  );

class ProtocolSession {
  private nextId = 0;
  private readonly pending = new Map<
    number,
    {
      resolve(value: Record<string, unknown>): void;
      reject(error: Error): void;
    }
  >();

  constructor(private readonly socket: ClipboardSocket) {
    socket.addEventListener("message", (event) => this.onMessage(event));
    const ended = (): void => this.failAll(new Error("The browser debugging connection ended"));
    socket.addEventListener("close", ended);
    socket.addEventListener("error", ended);
  }

  private onMessage(event: Event): void {
    const data: unknown = (event as MessageEvent).data;
    if (typeof data !== "string" || Buffer.byteLength(data) > largestMessageBytes) {
      this.failAll(new Error("The browser sent a message that is not usable"));
      return;
    }
    let value: {
      id?: number;
      result?: Record<string, unknown>;
      error?: unknown;
    };
    try {
      value = JSON.parse(data);
    } catch {
      this.failAll(new Error("The browser sent a message that is not JSON"));
      return;
    }
    const request = typeof value.id === "number" ? this.pending.get(value.id) : undefined;
    if (!request || typeof value.id !== "number") {
      return;
    }
    this.pending.delete(value.id);
    if (value.error || !value.result) {
      request.reject(new Error("The browser refused a capture command"));
    } else {
      request.resolve(value.result);
    }
  }

  private failAll(error: Error): void {
    for (const request of this.pending.values()) {
      request.reject(error);
    }
    this.pending.clear();
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(`The browser did not answer ${method} within ${protocolDeadlineMs / 1000} s`),
        );
      }, protocolDeadlineMs);
      timer.unref();
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.socket.send(
        JSON.stringify({
          id,
          method,
          params,
        }),
      );
    });
  }

  async evaluate<T>(expression: string): Promise<T> {
    const response = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
    return (
      response.result as
        | {
            value?: T;
          }
        | undefined
    )?.value as T;
  }

  close(): void {
    this.failAll(new Error("The browser debugging session was closed"));
    this.socket.close();
  }
}

async function openSession(options: EditorRenderOptions["browser"]): Promise<ProtocolSession> {
  const signal = options.signal ?? AbortSignal.timeout(protocolDeadlineMs);
  const target = await inspectBrowserTarget({
    ...options,
    signal,
  });
  const url = await debuggingSocketUrl(options, target.targetId, signal);
  const socket = (options.createSocket ?? ((address) => new WebSocket(address)))(url);
  await new Promise<void>((resolve, reject) => {
    if (socket.readyState === 1) {
      resolve();
      return;
    }
    socket.addEventListener("open", () => resolve(), {
      once: true,
    });
    socket.addEventListener(
      "error",
      () => reject(new Error("The browser debugging connection failed")),
      {
        once: true,
      },
    );
  });
  return new ProtocolSession(socket);
}

const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");
const identityOf = ({ designSize: _size, revision: _revision, ...rest }: CaptureIdentity): string =>
  JSON.stringify(rest);

/**
 * Captures each frame from the open editor and returns it only when two captures in a row are byte-identical, as the exporter route
 * does. The result is marked `editor-screenshot`: a different pipeline from the exporter, so it is never a stand-in for an approval.
 * Frames are captured one at a time because the editor has one viewport. A frame that fails is reported and the others go on.
 */
export async function renderFramesInEditor(
  client: PenpotToolClient,
  frameIds: string[],
  options: EditorRenderOptions,
): Promise<Map<string, EditorRenderOutcome>> {
  const { scale = 1, captureSettleMs = 300, maxCaptures = 4, sleep } = options;
  const wait =
    sleep ??
    ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const outcomes = new Map<string, EditorRenderOutcome>();
  const session = await openSession(options.browser);
  let restore: FramingResult["restore"] | undefined;
  try {
    await session.send("Page.bringToFront");
    const canvas0 = await session.evaluate<{
      windowWidth: number;
      windowHeight: number;
    } | null>(canvasRectExpression);
    if (!canvas0) {
      throw new Error("The editor canvas was not found in the browser tab");
    }
    let window = {
      width: canvas0.windowWidth,
      height: canvas0.windowHeight,
    };
    const setWindow = (): Promise<unknown> =>
      session.send("Emulation.setDeviceMetricsOverride", {
        ...window,
        deviceScaleFactor: scale,
        mobile: false,
      });
    await setWindow();
    await withPageSession(client, async () => {
      for (const frameId of frameIds) {
        try {
          const framed = (await runOnPage(
            client,
            framingSnippet(frameId, scale, options.page),
            options.page,
            options,
          )) as unknown as FramingResult;
          if (!framed.ok) {
            throw new Error(framed.message ?? "The frame could not be framed");
          }
          restore ??= framed.restore;
          const { width, height } = framed.rect;
          if (width > largestEditorFrameSide || height > largestEditorFrameSide) {
            throw new Error(
              `The frame is ${Math.round(width)}×${Math.round(height)}, larger than the ${largestEditorFrameSide} px an editor capture can hold; use the exporter`,
            );
          }
          let canvas = await session.evaluate<{
            x: number;
            y: number;
            width: number;
            height: number;
            windowWidth: number;
            windowHeight: number;
          }>(canvasRectExpression);
          const needed = {
            width: width + 2 * framePadding,
            height: height + 2 * framePadding,
          };
          if (canvas.width < needed.width || canvas.height < needed.height) {
            window = {
              width: Math.ceil(window.width + Math.max(0, needed.width - canvas.width)),
              height: Math.ceil(window.height + Math.max(0, needed.height - canvas.height)),
            };
            await setWindow();
            await wait(captureSettleMs);
            const again = (await runOnPage(
              client,
              framingSnippet(frameId, scale, options.page),
              options.page,
              options,
            )) as unknown as FramingResult;
            Object.assign(framed, again);
            canvas = await session.evaluate(canvasRectExpression);
          }
          const clip = {
            x: canvas.x + (framed.rect.x - framed.bounds.x) * framed.zoom,
            y: canvas.y + (framed.rect.y - framed.bounds.y) * framed.zoom,
            // Penpot's exporter rounds a fractional frame size to the nearest pixel, so the capture does too and the images match in size.
            width: Math.round(framed.rect.width * framed.zoom),
            height: Math.round(framed.rect.height * framed.zoom),
            scale: 1,
          };
          let previous: Buffer | undefined;
          let png: Buffer | undefined;
          let captures = 0;
          for (; captures < maxCaptures; ) {
            await wait(captureSettleMs);
            const shot = await session.send("Page.captureScreenshot", {
              format: "png",
              clip,
              captureBeyondViewport: false,
            });
            captures++;
            const current = Buffer.from(String(shot.data), "base64");
            if (previous && sha256(previous) === sha256(current)) {
              png = current;
              break;
            }
            previous = current;
          }
          if (!png) {
            throw new Error("The canvas kept changing; two captures in a row never matched");
          }
          const after = (await runOnPage(
            client,
            framingSnippet(frameId, scale, options.page),
            options.page,
            options,
          )) as unknown as FramingResult;
          if (!after.ok || identityOf(after.capture) !== identityOf(framed.capture)) {
            throw new Error("The design changed while it was being captured");
          }
          outcomes.set(frameId, {
            ok: true,
            result: {
              renderer: "editor-screenshot",
              capture: framed.capture,
              png,
              stable: true,
              exports: captures,
            },
          });
        } catch (error) {
          outcomes.set(frameId, {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });
  } finally {
    // Put the user's editor back as it was, even after a failure.
    await session.send("Emulation.clearDeviceMetricsOverride").catch(() => undefined);
    if (restore) {
      await runOnPage(client, restoreSnippet(restore), options.page, options).catch(
        () => undefined,
      );
    }
    session.close();
  }
  return outcomes;
}
