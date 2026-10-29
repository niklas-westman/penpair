import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectNativeClipboard,
  type ClipboardSocket,
  type NativeClipboard,
  type NativeClipboardOptions,
} from "../src/native-editor-clipboard.js";

const options = {
  origin: "https://design.example.test",
  fileId: "11111111-1111-4111-8111-111111111111",
  port: 9222,
  timeoutMs: 1000,
};
const frameId = "22222222-2222-4222-8222-222222222222";
const href = `${options.origin}/#/workspace?file-id=${options.fileId}&page-id=source`;
const target = {
  id: "TARGET-123",
  type: "page",
  url: href,
  webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/TARGET-123",
};
const sessions: NativeClipboard[] = [];
afterEach(async () => {
  for (const session of sessions.splice(0)) {
    await session.close();
  }
  vi.useRealTimers();
});

class FakeSocket extends EventTarget implements ClipboardSocket {
  readyState = 0;
  commands: Array<{
    id: number;
    method: string;
    params: Record<string, unknown>;
  }> = [];
  state: Record<string, unknown> = {
    href,
    focused: true,
    canvas: true,
    safe: true,
    platform: "MacIntel",
  };
  denyWrite = false;
  denyRead = false;
  validClipboard = true;
  digest = "a".repeat(64);
  failMethod = "";
  ignoredMethod = "";
  closed = false;
  constructor() {
    super();
    queueMicrotask(() => {
      this.readyState = 1;
      this.dispatchEvent(new Event("open"));
    });
  }
  send(data: string): void {
    const command = JSON.parse(data);
    this.commands.push(command);
    if (command.method === this.ignoredMethod) {
      return;
    }
    const result =
      command.method === "Runtime.evaluate"
        ? {
            result: {
              value: String(command.params.expression).includes("clearNativeClipboard")
                ? {
                    cleared: !this.denyWrite,
                  }
                : String(command.params.expression).includes("inspectNativeClipboard")
                  ? {
                      validated: this.validClipboard && !this.denyRead,
                      unavailable: this.denyRead,
                      digest: this.digest,
                    }
                  : this.state,
            },
          }
        : {};
    queueMicrotask(() =>
      this.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({
            id: command.id,
            ...(command.method === this.failMethod
              ? {
                  error: {
                    message: "PRIVATE",
                  },
                }
              : {
                  result,
                }),
          }),
        }),
      ),
    );
  }
  close(): void {
    this.closed = true;
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }
}

function fixture(changes: Partial<NativeClipboardOptions> = {}) {
  const socket = new FakeSocket();
  const fetch = vi.fn(async () =>
    Response.json([
      target,
    ]),
  ) as unknown as typeof globalThis.fetch;
  const createSocket = vi.fn(() => socket);
  return {
    socket,
    fetch,
    createSocket,
    options: {
      ...options,
      fetch,
      createSocket,
      ...changes,
    },
  };
}
async function connected(fixture: ReturnType<typeof fixture>): Promise<NativeClipboard> {
  const session = await connectNativeClipboard(fixture.options);
  sessions.push(session);
  return session;
}

describe("native editor clipboard transport", () => {
  it("uses native shortcuts once after independently checking exact editor focus for each action", async () => {
    const setup = fixture();
    const session = await connected(setup);
    await session.copy("source", [
      frameId,
    ]);
    await session.paste("source");
    expect(setup.socket.commands.map((command) => command.method)).toEqual([
      "Page.bringToFront",
      "Runtime.evaluate",
      "Runtime.evaluate",
      "Input.dispatchKeyEvent",
      "Input.dispatchKeyEvent",
      "Runtime.evaluate",
      "Page.bringToFront",
      "Runtime.evaluate",
      "Runtime.evaluate",
      "Input.dispatchKeyEvent",
      "Input.dispatchKeyEvent",
    ]);
    expect(
      setup.socket.commands
        .filter((command) => command.method === "Input.dispatchKeyEvent")
        .map((command) => command.params),
    ).toMatchObject([
      {
        type: "rawKeyDown",
        key: "c",
        modifiers: 4,
        commands: [
          "copy",
        ],
      },
      {
        type: "keyUp",
        key: "c",
        modifiers: 4,
      },
      {
        type: "rawKeyDown",
        key: "v",
        modifiers: 4,
        commands: [
          "paste",
        ],
      },
      {
        type: "keyUp",
        key: "v",
        modifiers: 4,
      },
    ]);
    expect(
      setup.socket.commands
        .filter((command) => command.method === "Runtime.evaluate")
        .filter((command) => String(command.params.expression).includes("document.activeElement"))
        .length,
    ).toBe(2);
    expect(
      setup.socket.commands.every(
        (command) =>
          ![
            "Page.navigate",
            "Page.reload",
            "Browser.close",
          ].includes(command.method),
      ),
    ).toBe(true);
    await expect(session.paste("source")).rejects.toThrow(/cannot be replayed/);
  });
  it("uses query-screen workspace routing for both target metadata and focused page checks", async () => {
    const setup = fixture();
    const workspace = `${options.origin}/?screen=workspace&file-id=${options.fileId}&page-id=source`;
    setup.options.fetch = vi.fn(async () =>
      Response.json([
        {
          ...target,
          url: workspace,
        },
      ]),
    ) as unknown as typeof fetch;
    setup.socket.state.href = workspace;
    const session = await connected(setup);
    await session.copy("source", [
      frameId,
    ]);
    await session.paste("source");
    expect(
      setup.socket.commands.filter((command) => command.method === "Input.dispatchKeyEvent"),
    ).toHaveLength(4);
  });

  it.each([
    `/?screen=workspace&file-id=${options.fileId}`,
    `/?screen=workspace&file-id=${options.fileId}&page-id=other`,
    `/?screen=workspace&file-id=${options.fileId}&page-id=source&page-id=source`,
    `/?screen=workspace&file-id=${options.fileId}&file-id=${options.fileId}&page-id=source`,
    `/?screen=workspace&screen=workspace&file-id=${options.fileId}&page-id=source`,
    `/?screen=workspace&file-id=${options.fileId}#/workspace?file-id=${options.fileId}&page-id=source`,
  ])(
    "rejects missing, wrong or ambiguous query-screen clipboard page %# before keys",
    async (route) => {
      const setup = fixture();
      setup.socket.state.href = `${options.origin}${route}`;
      const session = await connected(setup);
      await expect(
        session.copy("source", [
          frameId,
        ]),
      ).rejects.toThrow(/pinned editor canvas/);
      expect(
        setup.socket.commands.some((command) => command.method === "Input.dispatchKeyEvent"),
      ).toBe(false);
    },
  );

  it("uses Control shortcuts on other platforms", async () => {
    const setup = fixture();
    setup.socket.state.platform = "Linux x86_64";
    const session = await connected(setup);
    await session.copy("source", [
      frameId,
    ]);
    expect(
      setup.socket.commands.find((command) => command.method === "Input.dispatchKeyEvent")?.params
        .modifiers,
    ).toBe(2);
  });
  it.each([
    {
      href: "https://other.test/#/workspace?file-id=file-123",
    },
    {
      href: `${options.origin}/#/workspace?file-id=other`,
    },
    {
      href: `${options.origin}/#/workspace?file-id=file-123&file-id=file-123`,
    },
    {
      focused: false,
    },
    {
      canvas: false,
    },
    {
      safe: false,
    },
    {
      platform: null,
    },
  ])("refuses unsafe or changed editor state %j before sending a key", async (state) => {
    const setup = fixture();
    Object.assign(setup.socket.state, state);
    const session = await connected(setup);
    await expect(
      session.copy("source", [
        frameId,
      ]),
    ).rejects.toThrow(/pinned editor canvas/);
    expect(
      setup.socket.commands.some((command) => command.method === "Input.dispatchKeyEvent"),
    ).toBe(false);
  });
  it("checks the destination again after copying instead of trusting earlier identity", async () => {
    const setup = fixture();
    const session = await connected(setup);
    await session.copy("source", [
      frameId,
    ]);
    setup.socket.state.safe = false;
    await expect(session.paste("source")).rejects.toThrow(/pinned editor canvas/);
    expect(
      setup.socket.commands.filter((command) => command.method === "Input.dispatchKeyEvent"),
    ).toHaveLength(2);
  });
  it("requires sentinel overwrite permission before native copy", async () => {
    const setup = fixture();
    setup.socket.denyWrite = true;
    const session = await connected(setup);
    await expect(
      session.copy("source", [
        frameId,
      ]),
    ).rejects.toThrow(/write permission/);
    expect(
      setup.socket.commands.some((command) => command.method === "Input.dispatchKeyEvent"),
    ).toBe(false);
  });
  it("refuses native paste when browser-local clipboard inspection is denied", async () => {
    const setup = fixture();
    setup.socket.denyRead = true;
    const session = await connected(setup);
    await expect(
      session.copy("source", [
        frameId,
      ]),
    ).rejects.toThrow(/read permission/);
    await expect(session.paste("source")).rejects.toThrow(/requires one completed copy/);
    expect(setup.socket.commands.filter((command) => command.params.key === "v")).toHaveLength(0);
  });
  it("leaves paste disabled when asynchronous copy never replaces the sentinel with valid shapes", async () => {
    vi.useFakeTimers();
    const setup = fixture();
    setup.socket.validClipboard = false;
    const session = await connected(setup);
    const result = expect(
      session.copy("source", [
        frameId,
      ]),
    ).rejects.toThrow(/deadline|unavailable|abort/i);
    await vi.advanceTimersByTimeAsync(1100);
    await result;
    await expect(session.paste("source")).rejects.toThrow(/requires one completed copy/);
    expect(setup.socket.commands.filter((command) => command.params.key === "v")).toHaveLength(0);
  });
  it.each([
    "changed",
    "unavailable",
  ])("checks clipboard digest and identity again before paste: %s", async (mode) => {
    const setup = fixture();
    const session = await connected(setup);
    await session.copy("source", [
      frameId,
    ]);
    if (mode === "changed") {
      setup.socket.digest = "b".repeat(64);
    } else {
      setup.socket.denyRead = true;
    }
    await expect(session.paste("source")).rejects.toThrow(/changed or cannot be verified/);
    expect(setup.socket.commands.filter((command) => command.params.key === "v")).toHaveLength(0);
  });
  it("only requests status and digest from the browser, without granting clipboard permission", async () => {
    const setup = fixture();
    const session = await connected(setup);
    expect(
      await session.copy("source", [
        frameId,
      ]),
    ).toBeUndefined();
    expect(await session.paste("source")).toBeUndefined();
    const expressions = setup.socket.commands.filter(
      (command) => command.method === "Runtime.evaluate",
    );
    expect(
      expressions.every(
        (command) => command.params.awaitPromise === true && command.params.userGesture === true,
      ),
    ).toBe(true);
    expect(expressions.map((command) => command.params.expression).join("\n")).not.toContain(
      "return text",
    );
    expect(
      setup.socket.commands.some((command) => /grant|permission|clipboard/i.test(command.method)),
    ).toBe(false);
  });
  it("pins the actual page immediately before input when requested", async () => {
    const setup = fixture();
    const session = await connected(setup);
    await session.copy("source", [
      frameId,
    ]);
    await expect(session.paste("destination")).rejects.toThrow(/pinned editor canvas/);
    setup.socket.state.href = `${options.origin}/#/workspace?file-id=${options.fileId}&page-id=destination`;
    await session.paste("destination");
    expect(
      setup.socket.commands.filter((command) => command.method === "Input.dispatchKeyEvent"),
    ).toHaveLength(4);
  });
  it("rejects paste before copy and concurrent operations", async () => {
    const setup = fixture();
    const session = await connected(setup);
    await expect(session.paste("source")).rejects.toThrow(/requires one completed copy/);
    const first = session.copy("source", [
      frameId,
    ]);
    await expect(
      session.copy("source", [
        frameId,
      ]),
    ).rejects.toThrow(/cannot be replayed/);
    await first;
  });
  it("does not replay an uncertain paste after a protocol failure", async () => {
    const setup = fixture();
    const session = await connected(setup);
    await session.copy("source", [
      frameId,
    ]);
    setup.socket.failMethod = "Input.dispatchKeyEvent";
    await expect(session.paste("source")).rejects.toThrow(
      "The browser refused a native clipboard operation",
    );
    const calls = setup.socket.commands.length;
    await expect(session.paste("source")).rejects.toThrow(/cannot be replayed/);
    expect(setup.socket.commands).toHaveLength(calls);
  });
  it("sanitizes browser errors and releases the clipboard lock on close", async () => {
    const setup = fixture();
    const session = await connected(setup);
    setup.socket.failMethod = "Page.bringToFront";
    await expect(
      session.copy("source", [
        frameId,
      ]),
    ).rejects.toThrow("The browser refused a native clipboard operation");
    await session.close();
    await session.close();
    expect(setup.socket.closed).toBe(true);
    const second = await connected(fixture());
    await second.copy("source", [
      frameId,
    ]);
  });
  it("serializes clipboard ownership between otherwise independent clients", async () => {
    const first = await connected(fixture());
    await expect(connectNativeClipboard(fixture().options)).rejects.toThrow(/clipboard lock/);
    await first.close();
    await connected(fixture());
  });
  it.each([
    "ws://remote.test:9222/devtools/page/TARGET-123",
    "ws://127.0.0.1:9223/devtools/page/TARGET-123",
    "ws://127.0.0.1:9222/devtools/page/OTHER",
    "ws://127.0.0.1:9222/devtools/browser/TARGET-123",
    "ws://127.0.0.1:9222/devtools/page/TARGET-123?token=PRIVATE",
    "ws://user:PRIVATE@127.0.0.1:9222/devtools/page/TARGET-123",
    "wss://127.0.0.1:9222/devtools/page/TARGET-123",
  ])("refuses redirected or privileged socket address %s", async (webSocketDebuggerUrl) => {
    const setup = fixture();
    setup.options.fetch = vi.fn(async () =>
      Response.json([
        {
          ...target,
          webSocketDebuggerUrl,
        },
      ]),
    ) as unknown as typeof fetch;
    await expect(connectNativeClipboard(setup.options)).rejects.toThrow(/selected loopback target/);
    expect(setup.createSocket).not.toHaveBeenCalled();
  });
  it("rechecks target metadata between discovery and connection", async () => {
    const setup = fixture();
    let calls = 0;
    setup.options.fetch = vi.fn(async () =>
      Response.json([
        ++calls === 1
          ? target
          : {
              ...target,
              url: `${options.origin}/#/workspace?file-id=changed`,
            },
      ]),
    ) as unknown as typeof fetch;
    await expect(connectNativeClipboard(setup.options)).rejects.toThrow(
      /changed or became ambiguous/,
    );
    expect(setup.createSocket).not.toHaveBeenCalled();
  });
  it("rejects oversized socket messages without exposing their contents", async () => {
    const setup = fixture();
    const session = await connected(setup);
    setup.socket.ignoredMethod = "Page.bringToFront";
    const operation = session.copy("source", [
      frameId,
    ]);
    setup.socket.dispatchEvent(
      new MessageEvent("message", {
        data: "PRIVATE".repeat(200000),
      }),
    );
    await expect(operation).rejects.toThrow(/connection ended/);
    expect(setup.socket.closed).toBe(true);
  });
  it("bounds an unresponsive operation and rejects further dispatch", async () => {
    vi.useFakeTimers();
    const setup = fixture();
    const session = await connected(setup);
    setup.socket.ignoredMethod = "Page.bringToFront";
    const operation = session.copy("source", [
      frameId,
    ]);
    const rejection = expect(operation).rejects.toThrow(/connection ended/);
    await vi.advanceTimersByTimeAsync(1000);
    await rejection;
    await expect(
      session.copy("source", [
        frameId,
      ]),
    ).rejects.toThrow(/unavailable/);
  });
  it("propagates cancellation and closes only the protocol connection", async () => {
    const controller = new AbortController();
    const setup = fixture({
      signal: controller.signal,
    });
    const session = await connected(setup);
    controller.abort();
    await expect(
      session.copy("source", [
        frameId,
      ]),
    ).rejects.toThrow(/unavailable/);
    expect(setup.socket.closed).toBe(true);
    expect(setup.socket.commands).toHaveLength(0);
  });
});
