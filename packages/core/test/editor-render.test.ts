import { describe, expect, it } from "vitest";
import type { PenpotToolClient } from "../src/client.js";
import { renderFramesInEditor } from "../src/editor-render.js";
import type { ClipboardSocket } from "../src/native-editor-clipboard.js";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const fileId = "11111111-1111-4111-8111-111111111111";
const target = {
  id: "TARGET",
  type: "page",
  url: `https://design.example.test/#/workspace?file-id=${fileId}&page-id=p`,
  webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/TARGET",
};
const browserFetch = (async () =>
  new Response(
    JSON.stringify([
      target,
    ]),
    {
      status: 200,
    },
  )) as unknown as typeof fetch;

/** A canvas 876 wide and 868 high, offset by the editor's left sidebar, in a window as large as the override says. */
class FakeBrowser extends EventTarget implements ClipboardSocket {
  readyState = 1;
  commands: Array<{
    method: string;
    params: Record<string, unknown>;
  }> = [];
  window = {
    width: 1195,
    height: 868,
  };
  captures = 0;
  /** Returns different bytes for every capture until this many have happened. */
  unstableUntil = 0;
  send(data: string): void {
    const command = JSON.parse(data);
    this.commands.push(command);
    let result: Record<string, unknown> = {};
    if (command.method === "Emulation.setDeviceMetricsOverride") {
      this.window = {
        width: command.params.width,
        height: command.params.height,
      };
    } else if (command.method === "Runtime.evaluate") {
      result = {
        result: {
          value: {
            x: 318,
            y: 0,
            width: this.window.width - 318,
            height: this.window.height,
            windowWidth: this.window.width,
            windowHeight: this.window.height,
          },
        },
      };
    } else if (command.method === "Page.captureScreenshot") {
      this.captures++;
      const bytes = this.captures <= this.unstableUntil ? `shot-${this.captures}` : "stable-shot";
      result = {
        data: Buffer.from(bytes).toString("base64"),
      };
    }
    queueMicrotask(() =>
      this.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({
            id: command.id,
            result,
          }),
        }),
      ),
    );
  }
  close(): void {}
}

function editor(browser: FakeBrowser) {
  const shapes = [
    {
      id: "small",
      x: 100.5,
      y: 50,
      width: 200,
      height: 80,
    },
    {
      id: "wide",
      x: 0,
      y: 0,
      width: 1500,
      height: 300,
    },
  ];
  const viewport = {
    zoom: 0.25,
    center: {
      x: 5000,
      y: 6000,
    },
    get bounds() {
      const width = (browser.window.width - 318) / this.zoom;
      const height = browser.window.height / this.zoom;
      return {
        x: this.center.x - width / 2,
        y: this.center.y - height / 2,
        width,
        height,
      };
    },
  };
  const page = {
    id: "page",
    name: "P",
    getShapeById: (id: string) => shapes.find((shape) => shape.id === id),
    root: {
      children: shapes,
    },
  };
  const penpot = {
    version: "fixture",
    selection: [
      "something",
    ],
    viewport,
    currentFile: {
      id: fileId,
      revn: 1,
      pages: [
        page,
      ],
    },
    currentPage: page,
    library: {
      local: {
        tokens: {
          themes: [],
          sets: [],
        },
      },
    },
  };
  const client: PenpotToolClient = {
    async callTool(_name, args) {
      return {
        text: JSON.stringify({
          result: await new AsyncFunction("penpot", String(args.code))(penpot),
          log: "",
        }),
        isError: false,
      };
    },
    async close() {},
  };
  return {
    client,
    penpot,
  };
}

const run = (browser: FakeBrowser, client: PenpotToolClient, frames: string[], extra = {}) =>
  renderFramesInEditor(client, frames, {
    page: "P",
    sleep: async () => undefined,
    browser: {
      origin: "https://design.example.test",
      fileId,
      port: 9222,
      fetch: browserFetch,
      createSocket: () => browser,
    },
    ...extra,
  });

describe("rendering frames from the open editor", () => {
  it("returns an image only when two captures in a row match, and labels it as an editor screenshot", async () => {
    const browser = new FakeBrowser();
    browser.unstableUntil = 1;
    const { client } = editor(browser);
    const outcomes = await run(browser, client, [
      "small",
    ]);
    const outcome = outcomes.get("small");
    expect(outcome).toMatchObject({
      ok: true,
      result: {
        renderer: "editor-screenshot",
        stable: true,
        exports: 3,
      },
    });
    expect(browser.captures).toBe(3);
  });

  it("clips exactly the frame, starting on a whole pixel, at 1:1", async () => {
    const browser = new FakeBrowser();
    const { client } = editor(browser);
    await run(browser, client, [
      "small",
    ]);
    const clip = browser.commands.find((command) => command.method === "Page.captureScreenshot")
      ?.params.clip as Record<string, number>;
    expect(clip.width).toBe(200);
    expect(clip.height).toBe(80);
    expect(Number.isInteger(clip.x * 2)).toBe(true);
    // The frame starts at x 100.5, so the view is nudged until its offset in the canvas is whole.
    expect(clip.x % 1).toBeCloseTo(0, 5);
    expect(clip.y % 1).toBeCloseTo(0, 5);
  });

  it("grows the window for a frame wider than the canvas and puts everything back afterwards", async () => {
    const browser = new FakeBrowser();
    const { client, penpot } = editor(browser);
    const outcomes = await run(browser, client, [
      "wide",
    ]);
    expect(outcomes.get("wide")?.ok).toBe(true);
    const overrides = browser.commands.filter(
      (command) => command.method === "Emulation.setDeviceMetricsOverride",
    );
    expect(overrides.length).toBeGreaterThanOrEqual(2);
    expect(overrides.at(-1)?.params.width).toBeGreaterThan(1500);
    expect(browser.commands.at(-1)?.method).toBe("Emulation.clearDeviceMetricsOverride");
    expect(penpot.viewport.zoom).toBe(0.25);
    expect(penpot.viewport.center).toEqual({
      x: 5000,
      y: 6000,
    });
  });

  it("reports a frame whose canvas never settles and goes on with the others", async () => {
    const browser = new FakeBrowser();
    browser.unstableUntil = 99;
    const { client } = editor(browser);
    const outcomes = await run(
      browser,
      client,
      [
        "small",
        "missing",
      ],
      {
        maxCaptures: 3,
      },
    );
    expect(outcomes.get("small")).toMatchObject({
      ok: false,
      message: expect.stringMatching(/two captures in a row never matched/),
    });
    expect(outcomes.get("missing")).toMatchObject({
      ok: false,
      message: expect.stringMatching(/no shape missing/),
    });
  });

  it("refuses a frame larger than a browser can capture, naming the exporter instead", async () => {
    const browser = new FakeBrowser();
    const { client, penpot } = editor(browser);
    penpot.currentPage.getShapeById("wide")!.width = 9000;
    const outcomes = await run(browser, client, [
      "wide",
    ]);
    expect(outcomes.get("wide")).toMatchObject({
      ok: false,
      message: expect.stringMatching(/use the exporter/),
    });
  });
});
