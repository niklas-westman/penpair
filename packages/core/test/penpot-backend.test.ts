import { describe, expect, it } from "vitest";
import { createPenpotBackendClient } from "../src/penpot-backend.js";

const token = "secret-token-value";
const page = {
  id: "page",
  name: "My work",
  objects: {
    a: {
      id: "a",
      type: "frame",
      name: "A",
    },
  },
};
const noPause = async () => undefined;

function answering(...responses: (Response | Error)[]) {
  const calls: {
    url: string;
    init: RequestInit;
  }[] = [];
  const fetchImplementation = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      init,
    });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)]!;
    if (next instanceof Error) {
      throw next;
    }
    return next.clone();
  }) as unknown as typeof fetch;
  return {
    calls,
    fetchImplementation,
  };
}

function client(fetchImplementation: typeof fetch, attempts = 3) {
  return createPenpotBackendClient({
    origin: "https://penpot.example.test",
    token,
    fetchImplementation,
    attempts,
    pause: noPause,
  });
}

describe("reading a page from the backend", () => {
  it("asks for one page with the token and returns its objects", async () => {
    const { calls, fetchImplementation } = answering(new Response(JSON.stringify(page)));
    const result = await client(fetchImplementation).getPage("file", "page");
    expect(result.objects.a?.name).toBe("A");
    expect(calls[0]!.url).toBe("https://penpot.example.test/api/rpc/command/get-page");
    expect(calls[0]!.init.method).toBe("POST");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe(`Token ${token}`);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      fileId: "file",
      pageId: "page",
    });
  });

  it("maps a refused token to its own error and does not retry", async () => {
    const { calls, fetchImplementation } = answering(
      new Response("no", {
        status: 401,
      }),
    );
    await expect(client(fetchImplementation).getPage("file", "page")).rejects.toMatchObject({
      code: "access-token-rejected",
    });
    expect(calls).toHaveLength(1);
  });

  it("retries a server error and then succeeds", async () => {
    const { calls, fetchImplementation } = answering(
      new Response("busy", {
        status: 503,
      }),
      new Response(JSON.stringify(page)),
    );
    await client(fetchImplementation).getPage("file", "page");
    expect(calls).toHaveLength(2);
  });

  it("gives up after the attempts and never prints the token", async () => {
    const { calls, fetchImplementation } = answering(
      new Error(`connect failed for Token ${token}`),
    );
    const failure = await client(fetchImplementation, 2)
      .getPage("file", "page")
      .catch((error: Error) => error);
    expect(calls).toHaveLength(2);
    expect(failure).toMatchObject({
      code: "backend-unavailable",
    });
    expect((failure as Error).message).not.toContain(token);
  });

  it("does not retry a client error other than a rate limit", async () => {
    const { calls, fetchImplementation } = answering(
      new Response("bad request", {
        status: 400,
      }),
    );
    await expect(client(fetchImplementation).getPage("file", "page")).rejects.toMatchObject({
      code: "backend-unavailable",
    });
    expect(calls).toHaveLength(1);
  });

  it("refuses a page in an unexpected shape", async () => {
    const { fetchImplementation } = answering(
      new Response(
        JSON.stringify({
          ...page,
          id: "other",
        }),
      ),
    );
    await expect(client(fetchImplementation).getPage("file", "page")).rejects.toMatchObject({
      code: "backend-unavailable",
    });
  });
});
