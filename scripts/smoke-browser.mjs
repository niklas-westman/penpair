import { fork } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import sharp from "sharp";
import { captureCase, outwardClip } from "../examples/reflection-browser/capture.mjs";
import { createBrowserProvider } from "../examples/reflection-browser/provider.mjs";
import { hooks } from "../examples/reflection-browser/fixture-hooks.mjs";
import * as io from "../packages/core/dist/index.js";
import { runImplementationCases } from "../packages/reflection-check/dist/index.js";
const runtime = process.env.PENPAIR_PLAYWRIGHT_MODULE;
const { chromium } = await import(
  runtime ? pathToFileURL(path.resolve(runtime)).href : "playwright"
);
const server = fork(new URL("../examples/reflection-browser/serve.mjs", import.meta.url), [], {
  env: {
    ...process.env,
    PENPAIR_EXAMPLE_PORT: "0",
  },
  stdio: [
    "ignore",
    "pipe",
    "inherit",
    "ipc",
  ],
});
let browser;
try {
  const baseURL = await new Promise((resolve, reject) => {
    server.stdout.once("data", (data) => resolve(String(data).trim().split(" ").at(-1)));
    server.once("error", reject);
    server.once("exit", (code) => reject(new Error(`Fixture server exited ${code}`)));
  });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PENPAIR_BROWSER_EXECUTABLE
      ? {
          executablePath: process.env.PENPAIR_BROWSER_EXECUTABLE,
        }
      : {}),
    ...(process.env.PENPAIR_BROWSER_CHANNEL
      ? {
          channel: process.env.PENPAIR_BROWSER_CHANNEL,
        }
      : {}),
  });
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-browser-"));
  const cases = [];
  const observations = [];
  for (const viewport of [
    {
      width: 1280,
      height: 720,
    },
    {
      width: 390,
      height: 844,
    },
  ]) {
    for (const theme of [
      "light",
      "dark",
    ]) {
      for (const state of [
        "loaded",
        "empty",
      ]) {
        const id = `${viewport.width}-${theme}-${state}`;
        const route = `/?theme=${theme}&state=${state}`;
        const test = {
          id,
          route,
          setup: id,
          intent: {
            viewport,
            theme,
            state,
            fixture: state === "empty" ? "no-items" : "sample-items",
            fonts: [
              "Fixture",
            ],
          },
          baseline: {
            path: `${id}.png`,
            sha256: "",
            scale: 1,
          },
          threshold: 0.05,
        };
        // These unapproved browser references exercise capture plumbing only; they are not design approvals.
        const context = await browser.newContext({
          viewport,
          deviceScaleFactor: 1,
        });
        const page = await context.newPage();
        await page.goto(baseURL + route);
        const reference = await captureCase(page, test, hooks);
        await writeFile(path.join(root, test.baseline.path), reference.screenshot);
        await context.close();
        test.baseline.sha256 = createHash("sha256").update(reference.screenshot).digest("hex");
        cases.push(test);
        observations.push(reference.capture);
      }
    }
  }
  const providerOptions = {
    browser,
    baseURL,
    projectRoot: root,
    hooks,
    io,
    encodeLosslessWebp: (bytes) =>
      sharp(bytes)
        .webp({
          lossless: true,
          exact: true,
          effort: 6,
        })
        .toBuffer(),
  };
  const provider = createBrowserProvider(providerOptions);
  const plan = {
    schemaVersion: 1,
    kind: "implementation-case-plan",
    complete: true,
    cases,
    pending: [],
    visualApproval: false,
  };
  const report = await runImplementationCases(root, plan, provider);
  assert.equal(report.complete, true, JSON.stringify(report));
  assert.equal(report.verdict, "owner-review-required");
  assert(report.cases.every((row) => row.withinThreshold));
  for (const row of report.cases) {
    assert(row.evidence.screenshot.endsWith(".webp"));
    const bytes = await readFile(path.join(root, row.evidence.screenshot));
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  }
  for (const test of cases) {
    assert.equal(
      createHash("sha256")
        .update(await readFile(path.join(root, test.baseline.path)))
        .digest("hex"),
      test.baseline.sha256,
    );
  }
  const firstCase = cases[0];
  const webpReference = await sharp(await readFile(path.join(root, firstCase.baseline.path)))
    .webp({
      lossless: true,
      exact: true,
      effort: 6,
    })
    .toBuffer();
  const webpBaselineCase = {
    ...firstCase,
    baseline: {
      ...firstCase.baseline,
      path: "lossless-reference.webp",
      sha256: createHash("sha256").update(webpReference).digest("hex"),
    },
  };
  await writeFile(path.join(root, webpBaselineCase.baseline.path), webpReference);
  const webpReport = await runImplementationCases(
    root,
    {
      ...plan,
      cases: [
        webpBaselineCase,
      ],
    },
    provider,
  );
  assert.equal(webpReport.complete, true, JSON.stringify(webpReport));
  assert.equal(webpReport.cases[0].withinThreshold, true);

  const pngProvider = createBrowserProvider({
    ...providerOptions,
    imageFormat: "png",
    encodeLosslessWebp: undefined,
  });
  const pngEvidence = await pngProvider.runCase(firstCase);
  assert(pngEvidence.screenshot.endsWith(".png"));
  await assert.rejects(
    createBrowserProvider({
      ...providerOptions,
      encodeLosslessWebp: async (bytes) => bytes,
    }).runCase(firstCase),
    /different image format/,
  );
  await assert.rejects(
    createBrowserProvider({
      ...providerOptions,
      encodeLosslessWebp: (bytes) =>
        sharp(bytes)
          .negate({
            alpha: false,
          })
          .webp({
            lossless: true,
            exact: true,
          })
          .toBuffer(),
    }).runCase(firstCase),
    /changed captured pixels/,
  );

  assert.deepEqual(
    outwardClip({
      x: 0.25,
      y: 64,
      width: 389.5,
      height: 843.5,
    }),
    {
      x: 0,
      y: 64,
      width: 390,
      height: 844,
    },
  );
  const test = cases[0];
  const context = await browser.newContext({
    viewport: test.intent.viewport,
  });
  const page = await context.newPage();
  await page.goto(baseURL + test.route);
  await assert.rejects(
    captureCase(
      page,
      {
        ...test,
        intent: {
          ...test.intent,
          theme: "dark",
        },
      },
      hooks,
    ),
    /state\/theme/,
  );
  await assert.rejects(
    captureCase(
      page,
      test,
      {
        ...hooks,
        expectedFonts: () => [
          {
            family: "Missing",
            weight: "400",
            style: "normal",
          },
        ],
      },
      {
        timeoutMs: 300,
      },
    ),
    /Timeout/,
  );
  await assert.rejects(
    captureCase(
      page,
      test,
      {
        ...hooks,
        expectedFonts: () => [
          {
            family: "Fixture",
            weight: "700",
            style: "normal",
          },
        ],
      },
      {
        timeoutMs: 300,
      },
    ),
    /Timeout/,
  );
  await assert.rejects(
    captureCase(
      page,
      {
        ...test,
        baseline: {
          ...test.baseline,
          scale: 2,
        },
      },
      hooks,
    ),
    /scale/,
  );
  await assert.rejects(
    captureCase(page, test, {
      ...hooks,
      prepareCapture: undefined,
    }),
    /occluded/,
  );
  const delayed = await browser.newContext({
    viewport: test.intent.viewport,
  });
  await delayed.route("**/Abel-Regular.ttf", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 80));
    await route.continue();
  });
  const delayedPage = await delayed.newPage();
  await delayedPage.goto(baseURL + test.route);
  assert.equal((await captureCase(delayedPage, test, hooks)).fontsReady, true);
  await delayed.close();
  const originalMove = page.mouse.move.bind(page.mouse);
  page.mouse.move = async () => {
    await page.locator("button").hover();
  };
  await assert.rejects(captureCase(page, test, hooks), /Hover contamination/);
  page.mouse.move = originalMove;
  await context.close();
  const result = {
    schemaVersion: 1,
    date: "2026-10-22",
    browser: browser.version(),
    cases: report.cases.length,
    negativeCases: [
      "wrong theme",
      "missing face",
      "missing weight",
      "scale mismatch",
      "hover contamination",
      "sticky shell occlusion",
    ],
    report,
    observations,
    approvedDesignTrial: false,
    note: "Synthetic unapproved local browser references test plumbing; real design approval and Penpot trial remain pending.",
  };
  await writeFile(path.join(root, "report.json"), JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify(
      {
        browser: browser.version(),
        cases: cases.length,
        negativeCases: result.negativeCases,
        report: path.join(root, "report.json"),
        verdict: report.verdict,
      },
      null,
      2,
    ),
  );
} finally {
  if (browser) {
    await browser.close();
  }
  server.kill();
  await once(server, "exit").catch(() => undefined);
}
