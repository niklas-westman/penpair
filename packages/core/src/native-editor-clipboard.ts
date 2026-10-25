import { randomUUID } from "node:crypto";
import { open, readFile, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inspectBrowserTarget, type BrowserTargetOptions } from "./browser-wake.js";
import { nativeClipboardPayloadMatches } from "./clipboard-payload.js";

export interface NativeClipboard {
  copy(expectedPageId: string, expectedFrameIds: string[]): Promise<void>;
  paste(expectedPageId: string): Promise<void>;
  close(): Promise<void>;
}

export interface ClipboardSocket extends EventTarget {
  readyState: number;
  send(data: string): void;
  close(): void;
}

export interface NativeClipboardOptions extends BrowserTargetOptions {
  /** Tests may substitute the protocol transport; ordinary commands use Node's WebSocket. */
  createSocket?: (url: string) => ClipboardSocket;
}

const maximumBytes = 1024 * 1024;
const focusExpression = `(() => {
 const element = document.activeElement;
 const canvas = document.querySelector("#render, svg.viewport-controls, canvas[data-testid='workspace-canvas']");
 const blocked = !element || element.matches("input,textarea,select,iframe,[contenteditable='true']") || element.isContentEditable || element.closest("[role='dialog'],dialog");
 const workspaceFocus = element === document.body || element === document.documentElement || !!element.closest("#render,svg.viewport-controls,[data-testid='workspace-canvas']");
 return {href:location.href,platform:navigator.platform,focused:document.hasFocus(),canvas:!!canvas,safe:!blocked && workspaceFocus};
})()`;

async function interrupted<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () =>
      reject(new Error("Native clipboard metadata deadline exceeded or cancelled"));
    signal.addEventListener("abort", abort, {
      once: true,
    });
    void work()
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

function targetMatches(
  href: unknown,
  options: BrowserTargetOptions,
  expectedPageId?: string,
): boolean {
  if (typeof href !== "string") {
    return false;
  }
  try {
    const url = new URL(href);
    const expected = new URL(options.origin);
    const local = (value: URL) =>
      value.protocol === "http:" &&
      [
        "localhost",
        "127.0.0.1",
      ].includes(value.hostname);
    const sameOrigin =
      url.origin === expected.origin ||
      (options.allowLoopbackAlias === true &&
        local(url) &&
        local(expected) &&
        url.port === expected.port);
    const route = url.hash.slice(1);
    const query = route.indexOf("?");
    const parameters =
      query >= 0 && route.slice(0, query) === "/workspace"
        ? new URLSearchParams(route.slice(query + 1))
        : url.pathname === "/workspace" && !url.hash
          ? url.searchParams
          : undefined;
    return (
      sameOrigin &&
      !url.username &&
      !url.password &&
      parameters?.getAll("file-id").length === 1 &&
      parameters.get("file-id") === options.fileId &&
      (expectedPageId === undefined ||
        (parameters.getAll("page-id").length === 1 && parameters.get("page-id") === expectedPageId))
    );
  } catch {
    return false;
  }
}

async function debuggingSocketUrl(
  options: BrowserTargetOptions,
  targetId: string,
  signal: AbortSignal,
): Promise<string> {
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(`http://127.0.0.1:${options.port}/json/list`, {
      redirect: "error",
      signal,
    });
  } catch {
    throw new Error("Cannot inspect the local clipboard debugging target");
  }
  if (!response.ok || response.redirected || !response.body) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error("The local clipboard debugging endpoint refused inspection");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        break;
      }
      bytes += next.value.byteLength;
      if (bytes > maximumBytes) {
        throw new Error("Clipboard target metadata exceeds its byte limit");
      }
      chunks.push(next.value);
    }
  } catch {
    throw new Error("Cannot read bounded clipboard target metadata");
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  let values: unknown;
  try {
    values = JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
  } catch {
    throw new Error("Invalid clipboard target metadata");
  }
  if (!Array.isArray(values) || values.length > 1000) {
    throw new Error("Invalid clipboard target metadata");
  }
  const matches = values.filter(
    (value) => value && typeof value === "object" && value.id === targetId,
  );
  const target = matches.length === 1 ? matches[0] : undefined;
  if (
    !target ||
    target.type !== "page" ||
    !targetMatches(target.url, options) ||
    typeof target.webSocketDebuggerUrl !== "string"
  ) {
    throw new Error("Clipboard debugging target changed or became ambiguous");
  }
  let url: URL;
  try {
    url = new URL(target.webSocketDebuggerUrl);
  } catch {
    throw new Error("Invalid clipboard debugging socket");
  }
  if (
    url.protocol !== "ws:" ||
    ![
      "127.0.0.1",
      "localhost",
    ].includes(url.hostname) ||
    Number(url.port || 80) !== options.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== `/devtools/page/${targetId}`
  ) {
    throw new Error("Clipboard debugging socket must stay on the selected loopback target");
  }
  return url.href;
}

async function clipboardLease(): Promise<() => Promise<void>> {
  const destination = path.join(os.tmpdir(), `penpair-native-clipboard-${os.userInfo().uid}.lock`);
  const token = randomUUID();
  let handle;
  try {
    handle = await open(destination, "wx", 0o600);
  } catch {
    throw new Error(
      "Another native clipboard session holds the local clipboard lock; inspect it before retrying",
    );
  }
  try {
    await handle.writeFile(
      JSON.stringify({
        token,
        pid: process.pid,
      }),
    );
  } catch {
    await unlink(destination).catch(() => undefined);
    throw new Error("Cannot persist native clipboard lock ownership");
  } finally {
    await handle.close();
  }
  return async () => {
    try {
      const current = JSON.parse(await readFile(destination, "utf8"));
      if (current.token !== token) {
        throw new Error("Native clipboard lock ownership changed");
      }
      await unlink(destination);
    } catch {
      throw new Error("Cannot safely release native clipboard lock; inspect its ownership");
    }
  };
}

/** Holds a short exclusive clipboard session; closing releases control, never the browser. */
export async function connectNativeClipboard(
  options: NativeClipboardOptions,
): Promise<NativeClipboard> {
  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([
        options.signal,
        controller.signal,
      ])
    : controller.signal;
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  timer.unref();
  let release: (() => Promise<void>) | undefined;
  let socket: ClipboardSocket | undefined;
  let closed = false;
  let active = false;
  let copied = false;
  let copiedDigest: string | undefined;
  let copiedFrames: string[] = [];
  let pasteAttempted = false;
  let nextId = 0;
  const pending = new Map<
    number,
    {
      resolve(value: Record<string, unknown>): void;
      reject(error: Error): void;
    }
  >();
  const fail = () => {
    for (const request of pending.values()) {
      request.reject(new Error("Native clipboard connection ended or exceeded its deadline"));
    }
    pending.clear();
  };
  const message = (event: Event) => {
    const data: unknown = (event as MessageEvent).data;
    if (typeof data !== "string" || Buffer.byteLength(data) > maximumBytes) {
      fail();
      socket?.close();
      return;
    }
    let value: Record<string, unknown>;
    try {
      value = JSON.parse(data);
    } catch {
      fail();
      socket?.close();
      return;
    }
    if (!value || typeof value !== "object") {
      fail();
      return;
    }
    if (typeof value.id !== "number") {
      return;
    }
    const request = pending.get(value.id);
    if (!request) {
      return;
    }
    pending.delete(value.id);
    if (value.error || !value.result || typeof value.result !== "object") {
      request.reject(new Error("The browser refused a native clipboard operation"));
    } else {
      request.resolve(value.result as Record<string, unknown>);
    }
  };
  const aborted = () => {
    fail();
    socket?.close();
  };
  signal.addEventListener("abort", aborted, {
    once: true,
  });
  const close = async () => {
    if (closed) {
      return;
    }
    closed = true;
    clearTimeout(timer);
    signal.removeEventListener("abort", aborted);
    fail();
    socket?.removeEventListener("message", message);
    socket?.removeEventListener("close", fail);
    socket?.removeEventListener("error", fail);
    socket?.close();
    await release?.();
  };
  const send = (
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> => {
    if (closed || signal.aborted || !socket || socket.readyState !== 1 || pending.size >= 1) {
      return Promise.reject(new Error("Native clipboard connection is unavailable or busy"));
    }
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, {
        resolve,
        reject,
      });
      try {
        socket!.send(
          JSON.stringify({
            id,
            method,
            params,
          }),
        );
      } catch {
        pending.delete(id);
        reject(new Error("Native clipboard command could not be dispatched"));
      }
    });
  };
  try {
    const target = await inspectBrowserTarget({
      ...options,
      signal,
    });
    const url = await interrupted(signal, () =>
      debuggingSocketUrl(options, target.targetId, signal),
    );
    signal.throwIfAborted();
    release = await clipboardLease();
    socket = (options.createSocket ?? ((address) => new WebSocket(address)))(url);
    socket.addEventListener("message", message);
    socket.addEventListener("close", fail);
    socket.addEventListener("error", fail);
    await new Promise<void>((resolve, reject) => {
      const opened = () => {
        cleanup();
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(new Error("Native clipboard debugging connection failed"));
      };
      const cleanup = () => {
        socket!.removeEventListener("open", opened);
        socket!.removeEventListener("close", failed);
        socket!.removeEventListener("error", failed);
        signal.removeEventListener("abort", failed);
      };
      socket!.addEventListener("open", opened, {
        once: true,
      });
      socket!.addEventListener("close", failed, {
        once: true,
      });
      socket!.addEventListener("error", failed, {
        once: true,
      });
      signal.addEventListener("abort", failed, {
        once: true,
      });
      if (signal.aborted) {
        failed();
      } else if (socket!.readyState === 1) {
        opened();
      }
    });
    const evaluate = async (expression: string): Promise<Record<string, unknown> | undefined> => {
      const response = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
        userGesture: true,
      });
      const result = response.result as
        | {
            value?: Record<string, unknown>;
          }
        | undefined;
      return result?.value;
    };
    const inspectClipboard = async (): Promise<Record<string, unknown> | undefined> =>
      evaluate(`(async function inspectNativeClipboard() {
      try {
        const text = await navigator.clipboard.readText();
        const valid = (${nativeClipboardPayloadMatches.toString()})(text, ${JSON.stringify(options.fileId)}, ${JSON.stringify(copiedFrames)});
        if (!valid) return {validated:false};
        const bytes = new TextEncoder().encode(text);
        const hash = await crypto.subtle.digest("SHA-256", bytes);
        const digest = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2,"0")).join("");
        return {validated:true,digest};
      } catch { return {validated:false,unavailable:true}; }
    })()`);
    const shortcut = async (
      kind: "copy" | "paste",
      expectedPageId: string,
      expectedFrameIds?: string[],
    ): Promise<void> => {
      if (active || (kind === "paste" && (!copied || pasteAttempted))) {
        throw new Error("Native paste requires one completed copy and cannot be replayed");
      }
      if (typeof expectedPageId !== "string" || !expectedPageId.trim()) {
        throw new Error("Native clipboard requires an explicit page ID");
      }
      const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
      if (
        kind === "copy" &&
        (!Array.isArray(expectedFrameIds) ||
          !expectedFrameIds.length ||
          expectedFrameIds.length > 100 ||
          !uuid.test(options.fileId) ||
          expectedFrameIds.some((id) => typeof id !== "string" || !uuid.test(id)) ||
          new Set(expectedFrameIds.map((id) => id.toLowerCase())).size !== expectedFrameIds.length)
      ) {
        throw new Error(
          "Native copy requires distinct explicit frame UUIDs and a pinned file UUID",
        );
      }
      active = true;
      try {
        await send("Page.bringToFront");
        const state = await evaluate(focusExpression);
        if (
          !state ||
          !targetMatches(state.href, options, expectedPageId) ||
          state.focused !== true ||
          state.canvas !== true ||
          state.safe !== true ||
          typeof state.platform !== "string"
        ) {
          throw new Error(
            "Native clipboard requires the pinned editor canvas focused, without an editable field, plugin or dialog",
          );
        }
        const mac = /mac/i.test(state.platform);
        const key = kind === "copy" ? "c" : "v";
        if (kind === "copy") {
          copied = false;
          copiedDigest = undefined;
          copiedFrames = [
            ...expectedFrameIds!,
          ];
          const sentinel = `penpair-native-copy-pending-${randomUUID()}`;
          const cleared = await evaluate(
            `(async function clearNativeClipboard(){try{await navigator.clipboard.writeText(${JSON.stringify(sentinel)});return {cleared:true};}catch{return {cleared:false};}})()`,
          );
          if (cleared?.cleared !== true) {
            throw new Error(
              "Browser clipboard write permission is required; no native copy was dispatched",
            );
          }
        } else {
          const current = await inspectClipboard();
          if (current?.validated !== true || current.digest !== copiedDigest) {
            throw new Error(
              "Native clipboard changed or cannot be verified; no paste was dispatched",
            );
          }
        }
        if (kind === "paste") {
          pasteAttempted = true;
        }
        let dispatched = false;
        try {
          await send("Input.dispatchKeyEvent", {
            type: "rawKeyDown",
            commands: mac
              ? [
                  kind,
                ]
              : [],
            modifiers: mac ? 4 : 2,
            key,
            code: `Key${key.toUpperCase()}`,
            windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
          });
          dispatched = true;
        } finally {
          // Release the physical shortcut even if its acknowledgment was lost.
          const released = send("Input.dispatchKeyEvent", {
            type: "keyUp",
            modifiers: mac ? 4 : 2,
            key,
            code: `Key${key.toUpperCase()}`,
            windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
          });
          if (dispatched) {
            await released;
          } else {
            await released.catch(() => undefined);
          }
        }
        if (kind === "copy") {
          while (!copied) {
            signal.throwIfAborted();
            const observed = await inspectClipboard();
            if (observed?.unavailable === true) {
              throw new Error(
                "Browser clipboard read permission is required; native paste remains disabled",
              );
            }
            if (
              observed?.validated === true &&
              typeof observed.digest === "string" &&
              /^[a-f0-9]{64}$/.test(observed.digest)
            ) {
              copiedDigest = observed.digest;
              copied = true;
            } else {
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
          }
        }
      } finally {
        active = false;
      }
    };
    return {
      copy: (expectedPageId, expectedFrameIds) =>
        shortcut("copy", expectedPageId, expectedFrameIds),
      paste: (expectedPageId) => shortcut("paste", expectedPageId),
      close,
    };
  } catch (error) {
    await close();
    if (signal.aborted) {
      throw new Error("Native clipboard connection cancelled or exceeded its deadline");
    }
    throw error;
  }
}
