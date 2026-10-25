export interface BrowserTargetOptions {
  origin: string;
  fileId: string;
  port: number;
  timeoutMs?: number;
  allowLoopbackAlias?: boolean;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

export interface BrowserWakeResult {
  activated: true;
  targetId: string;
  keepAlive: "none";
}

export interface BrowserInspectionResult {
  targetId: string;
  keepAlive: "unknown";
}

interface BrowserTarget {
  id: string;
  type: string;
  url: string;
}

interface BrowserRequest {
  origin: string;
  fileId: string;
  allowLoopbackAlias: boolean;
  endpoint: string;
  fetch: typeof fetch;
  signal: AbortSignal;
}

const maxTargetBytes = 1024 * 1024;
const maxTargetCount = 1000;

/** Activate only the existing page for the pinned file; never reload or evaluate page code. */
export async function wakeBrowserTarget(options: BrowserTargetOptions): Promise<BrowserWakeResult> {
  return withBrowserDeadline(options, async (request) => {
    const targetId = await findBrowserTarget(request);
    const response = await browserRequest(
      request,
      `/json/activate/${encodeURIComponent(targetId)}`,
    );
    void response.body?.cancel().catch(() => undefined);
    request.signal.throwIfAborted();

    return {
      activated: true,
      targetId,
      keepAlive: "none",
    };
  });
}

/** Read debugging metadata only; a listed tab does not establish plugin readiness or keep-alive. */
export async function inspectBrowserTarget(
  options: BrowserTargetOptions,
): Promise<BrowserInspectionResult> {
  return withBrowserDeadline(options, async (request) => ({
    targetId: await findBrowserTarget(request),
    keepAlive: "unknown",
  }));
}

async function withBrowserDeadline<T>(
  options: BrowserTargetOptions,
  work: (request: BrowserRequest) => Promise<T>,
): Promise<T> {
  const origin = validateBrowserOptions(options);
  if (options.signal?.aborted) {
    throw new Error("Browser debugging cancelled");
  }
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 5000;
  let timedOut = false;
  const externalAbort = (): void => controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  options.signal?.addEventListener("abort", externalAbort, {
    once: true,
  });

  let abort: () => void = () => undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    abort = () =>
      reject(
        new Error(timedOut ? "Browser debugging deadline exceeded" : "Browser debugging cancelled"),
      );
    controller.signal.addEventListener("abort", abort, {
      once: true,
    });
  });

  try {
    if (options.signal?.aborted) {
      controller.abort();
    }
    controller.signal.throwIfAborted();

    return await Promise.race([
      interrupted,
      work({
        origin,
        fileId: options.fileId,
        allowLoopbackAlias: options.allowLoopbackAlias === true,
        endpoint: `http://127.0.0.1:${options.port}`,
        fetch: options.fetch ?? fetch,
        signal: controller.signal,
      }),
    ]);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        timedOut ? "Browser debugging deadline exceeded" : "Browser debugging cancelled",
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", externalAbort);
    controller.signal.removeEventListener("abort", abort);
  }
}

function validateBrowserOptions(options: BrowserTargetOptions): string {
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error("Browser debugging port must be an integer from 1 to 65535");
  }
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
    throw new Error("Browser debugging timeout must be an integer from 1000 to 30000 ms");
  }
  if (
    typeof options.fileId !== "string" ||
    !options.fileId.trim() ||
    options.fileId.length > 256 ||
    /[\u0000-\u0020\u007f]/.test(options.fileId)
  ) {
    throw new Error("Browser activation requires a pinned file ID");
  }

  let origin: URL;
  try {
    origin = new URL(options.origin);
  } catch {
    throw new Error("Browser activation requires a valid Penpot origin");
  }
  if (
    ![
      "http:",
      "https:",
    ].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error(
      "Browser activation requires a Penpot origin without credentials, path or query",
    );
  }
  if (options.allowLoopbackAlias && !isHttpLoopback(origin)) {
    throw new Error("Browser loopback aliases require an HTTP localhost or 127.0.0.1 origin");
  }
  return origin.origin;
}

async function browserRequest(request: BrowserRequest, path: string): Promise<Response> {
  request.signal.throwIfAborted();

  let response: Response;
  try {
    response = await request.fetch(`${request.endpoint}${path}`, {
      method: "GET",
      redirect: "error",
      signal: request.signal,
    });
  } catch {
    throw new Error(
      "Cannot reach the local browser debugging endpoint; start a dedicated browser with a loopback debugging port",
    );
  }
  request.signal.throwIfAborted();
  if (!response.ok || response.redirected) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error("The local browser debugging endpoint refused the request");
  }
  return response;
}

async function findBrowserTarget(request: BrowserRequest): Promise<string> {
  const response = await browserRequest(request, "/json/list");
  const text = await readTargetList(response);
  request.signal.throwIfAborted();

  let targets: unknown;
  try {
    targets = JSON.parse(text);
  } catch {
    throw new Error("Invalid browser debugging target list");
  }
  if (
    !Array.isArray(targets) ||
    targets.length > maxTargetCount ||
    !targets.every(isBrowserTarget)
  ) {
    throw new Error("Invalid browser debugging target list");
  }

  const matching = targets.filter(
    (target) => target.type === "page" && matchesFile(target.url, request),
  );
  if (matching.length !== 1) {
    throw new Error(
      matching.length === 0
        ? "No browser page matches the project's Penpot origin and pinned file ID"
        : "Multiple browser pages match the pinned file; close duplicate tabs before waking",
    );
  }
  const targetId = matching[0]!.id;
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(targetId)) {
    throw new Error("Invalid browser debugging target ID");
  }
  return targetId;
}

function isBrowserTarget(value: unknown): value is BrowserTarget {
  if (!value || typeof value !== "object") {
    return false;
  }
  const target = value as Record<string, unknown>;
  return (
    typeof target.id === "string" &&
    typeof target.type === "string" &&
    typeof target.url === "string"
  );
}

function isHttpLoopback(url: URL): boolean {
  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}

function matchesOrigin(target: URL, request: BrowserRequest): boolean {
  if (target.origin === request.origin) {
    return true;
  }
  if (!request.allowLoopbackAlias || !isHttpLoopback(target)) {
    return false;
  }
  const expected = new URL(request.origin);
  return isHttpLoopback(expected) && target.port === expected.port;
}

function matchesFile(targetUrl: string, request: BrowserRequest): boolean {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return false;
  }
  if (!matchesOrigin(url, request) || url.username || url.password) {
    return false;
  }

  const hashRoute = url.hash.slice(1);
  const hashQuery = hashRoute.indexOf("?");
  const parameters =
    hashQuery >= 0 && hashRoute.slice(0, hashQuery) === "/workspace"
      ? new URLSearchParams(hashRoute.slice(hashQuery + 1))
      : url.pathname === "/workspace" && !url.hash
        ? url.searchParams
        : undefined;
  const fileIds = parameters?.getAll("file-id");
  return fileIds?.length === 1 && fileIds[0] === request.fileId;
}

async function readTargetList(response: Response): Promise<string> {
  const declaredBytes = Number(response.headers.get("content-length"));
  if (declaredBytes > maxTargetBytes) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error("Browser debugging target list exceeds the size limit");
  }
  if (!response.body) {
    throw new Error("Invalid browser debugging target list");
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
      if (bytes > maxTargetBytes) {
        throw new Error("Browser debugging target list exceeds the size limit");
      }
      chunks.push(next.value);
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    if (
      error instanceof Error &&
      error.message === "Browser debugging target list exceeds the size limit"
    ) {
      throw error;
    }
    throw new Error("Cannot read browser debugging target list");
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, bytes).toString("utf8");
}
