import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { captureCase, comparePng } from "./capture.mjs";

/** Pass a browser from the adopting project's pinned Playwright; this example installs nothing. */
export function createBrowserProvider({
  browser,
  baseURL,
  projectRoot,
  hooks,
  deviceScaleFactor = 1,
  timeoutMs = 10000,
  io,
}) {
  if (!browser || !projectRoot || !baseURL || typeof hooks?.route !== "function") {
    throw new Error("Browser, project root, app origin and explicit route hook required");
  }
  return {
    async runCase(test) {
      const { atomicWriteFile, resolveProjectInput, resolveProjectOutput } =
        io ?? (await import("@penpair/core"));
      const target = new URL(await hooks.route(test), baseURL);
      const expected = new URL(test.route, baseURL);
      if (target.origin !== new URL(baseURL).origin || target.href !== expected.href) {
        throw new Error(
          "Route hook must open the exact intended route on the configured app origin",
        );
      }
      const before = await readFile(await resolveProjectInput(projectRoot, test.baseline.path));
      const hash = createHash("sha256").update(before).digest("hex");
      if (hash !== test.baseline.sha256) {
        throw new Error("Baseline hash changed");
      }
      const context = await browser.newContext({
        viewport: test.intent.viewport,
        deviceScaleFactor,
      });
      try {
        const page = await context.newPage();
        await page.goto(target.href, {
          waitUntil: "domcontentloaded",
          timeout: timeoutMs,
        });
        const capture = await captureCase(page, test, hooks, {
          timeoutMs,
        });
        if (page.url() !== target.href) {
          throw new Error("Application navigated away from the intended route");
        }
        const diffPixelRatio = await comparePng(page, before, capture.screenshot);
        const screenshot = path.join(
          ".penpair/reflection",
          createHash("sha256")
            .update(test.id + ":" + test.setup)
            .digest("hex") + ".png",
        );
        const output = await resolveProjectOutput(projectRoot, screenshot);
        if (output === (await resolveProjectInput(projectRoot, test.baseline.path))) {
          throw new Error("Capture cannot overwrite its baseline");
        }
        await mkdir(path.dirname(output), {
          recursive: true,
        });
        await atomicWriteFile(output, capture.screenshot, {
          replace: true,
        });
        return {
          schemaVersion: 1,
          id: test.id,
          route: test.route,
          setup: test.setup,
          baselineHash: hash,
          observed: capture.observed,
          fonts: capture.fonts,
          fontsReady: capture.fontsReady,
          screenshot,
          diffPixelRatio,
          capture: capture.capture,
          provider: {
            name: "penpair-browser-starter-rgba-exact",
            version: "1",
          },
        };
      } finally {
        await context.close();
      }
    },
  };
}
