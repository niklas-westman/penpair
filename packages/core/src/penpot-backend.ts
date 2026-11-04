import { PenpairError } from "./errors.js";
import { redactAccessToken } from "./penpot-access-token.js";

/** One shape as the backend stores it. Only the fields the verification reads are typed; the rest is carried untouched. */
export interface BackendShape {
  id: string;
  type: string;
  name: string;
  parentId?: string;
  shapes?: string[];
  [attribute: string]: unknown;
}

export interface BackendPage {
  id: string;
  name: string;
  objects: Record<string, BackendShape>;
}

export interface PenpotBackendClient {
  getPage(fileId: string, pageId: string, signal?: AbortSignal): Promise<BackendPage>;
}

export interface PenpotBackendOptions {
  /** The Penpot web origin, for example `https://design.penpot.app`. */
  origin: string;
  token: string;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
  attempts?: number;
  /** Pause between attempts; tests pass a no-op. */
  pause?: (milliseconds: number) => Promise<void>;
}

const defaultTimeoutMs = 60_000;
const defaultAttempts = 3;
const retryPauseMs = 1_000;

/** An HTML body where JSON was expected: a bot-protection challenge, not an answer from Penpot's API. */
export function isChallengePage(body: string): boolean {
  return /^\s*<(!doctype|html)/i.test(body);
}

function isShape(value: unknown): value is BackendShape {
  const shape = value as BackendShape;
  return (
    !!value &&
    typeof value === "object" &&
    typeof shape.id === "string" &&
    typeof shape.type === "string"
  );
}

/** Why a page body is not usable, in words that name the field and never quote design content. */
function pageProblem(page: Partial<BackendPage> | null, pageId: string): string | undefined {
  if (!page || typeof page !== "object") {
    return "the body is not an object";
  }
  if (page.id !== pageId) {
    return "the page id differs from the one asked for";
  }
  if (typeof page.name !== "string") {
    return "the page has no name";
  }
  if (!page.objects || typeof page.objects !== "object") {
    return "the page has no objects";
  }
  const unusable = Object.entries(page.objects).find(([, value]) => !isShape(value));
  return unusable
    ? `shape ${unusable[0]} has no id or type (fields: ${Object.keys((unusable[1] as object) ?? {})
        .slice(0, 8)
        .join(", ")})`
    : undefined;
}

function parsePage(text: string, pageId: string): BackendPage {
  const page = JSON.parse(text) as Partial<BackendPage> | null;
  const problem = pageProblem(page, pageId);
  if (problem) {
    throw new PenpairError(
      "backend-unavailable",
      `The Penpot backend returned a page in an unexpected shape: ${problem}`,
    );
  }
  return page as BackendPage;
}

/** Read-only access to Penpot's backend with a personal access token. Nothing here writes. */
export function createPenpotBackendClient(options: PenpotBackendOptions): PenpotBackendClient {
  const send = options.fetchImplementation ?? fetch;
  const attempts = options.attempts ?? defaultAttempts;
  const pause =
    options.pause ??
    ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const redact = (text: string): string => redactAccessToken(text, options.token);
  const endpoint = new URL("/api/rpc/command/get-page", options.origin).toString();

  return {
    async getPage(fileId, pageId, signal) {
      let lastProblem = "no attempt was made";
      for (let attempt = 1; attempt <= attempts; attempt++) {
        signal?.throwIfAborted();
        try {
          const response = await send(endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "application/json",
              authorization: `Token ${options.token}`,
            },
            body: JSON.stringify({
              fileId,
              pageId,
            }),
            signal: AbortSignal.any([
              AbortSignal.timeout(options.timeoutMs ?? defaultTimeoutMs),
              ...(signal
                ? [
                    signal,
                  ]
                : []),
            ]),
          });
          const text = await response.text();
          if (response.status === 401 || response.status === 403) {
            // Penpot's edge answers a blocked request with an HTML challenge page; that says nothing about the token.
            if (isChallengePage(text)) {
              throw new PenpairError(
                "backend-unavailable",
                `Penpot's edge blocked the request with a challenge page (status ${response.status})`,
              );
            }
            throw new PenpairError(
              "access-token-rejected",
              `Penpot answered ${response.status} to the access token`,
            );
          }
          if (response.ok) {
            return parsePage(text, pageId);
          }
          lastProblem = `status ${response.status}: ${redact(text).slice(0, 200)}`;
          if (response.status < 500 && response.status !== 429) {
            break;
          }
        } catch (error) {
          if (error instanceof PenpairError && error.code !== "backend-unavailable") {
            throw error;
          }
          if (signal?.aborted) {
            throw error;
          }
          lastProblem = redact(error instanceof Error ? error.message : String(error));
        }
        if (attempt < attempts) {
          await pause(retryPauseMs * attempt);
        }
      }
      throw new PenpairError(
        "backend-unavailable",
        `Reading page ${pageId} from the Penpot backend failed (${lastProblem})`,
      );
    },
  };
}
