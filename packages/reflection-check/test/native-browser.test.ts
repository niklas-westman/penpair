import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runNativeReflectionCases } from "../src/index.js";
import type { CasePlan } from "../src/index.js";

const engineRoot = process.env.PENPAIR_NATIVE_ENGINE_PATH;

describe.skipIf(!engineRoot)("native engine real Chromium integration", () => {
  it("executes a public CLI batch with independently observed state and immutable references", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-native-browser-"));
    await mkdir(path.join(root, "node_modules"));
    await mkdir(path.join(root, "design"));
    await symlink(engineRoot!, path.join(root, "node_modules/reflection-check"), "dir");
    await writeFile(path.join(root, "package.json"), '{"type":"module"}');
    const requireEngine = createRequire(path.join(engineRoot!, "package.json"));
    const { chromium } = requireEngine("playwright");
    const font = (
      await readFile(
        path.join(engineRoot!, "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2"),
      )
    ).toString("base64");
    const html = `<style>@font-face{font-family:Inter;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:400;font-style:normal}html,body{margin:0}#root{width:200px;height:100px;background:white;font-family:Inter}</style><main id="root" data-theme="light" data-state="empty" data-fixture="local">Hello</main>`;
    const browser = await chromium.launch({
      headless: true,
    });
    let baseline: Buffer;
    try {
      const page = await browser.newPage({
        viewport: {
          width: 200,
          height: 100,
        },
        deviceScaleFactor: 1,
        locale: "en-US",
        timezoneId: "Europe/Stockholm",
        colorScheme: "light",
      });
      await page.setContent(html);
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(-10, -10);
      baseline = await page.screenshot({
        type: "png",
        animations: "disabled",
        caret: "hide",
      });
    } finally {
      await browser.close();
    }
    await writeFile(path.join(root, "design/empty.png"), baseline!);
    await writeFile(
      path.join(root, "app.json"),
      JSON.stringify({
        html,
      }),
    );
    const builder = `import {readFile} from 'node:fs/promises'; import path from 'node:path';
export async function createReflectionConfig(request){ const app=JSON.parse(await readFile(new URL('./app.json',import.meta.url),'utf8'));return {project:'native-real',inputs:[{role:'implementation',path:'app.json'}],contracts:{browser:{baseUrl:'http://fixture.test',setup:{locale:'en-US',timezone:'Europe/Stockholm',colorScheme:'light'},evidenceHooks:{beforeNavigate:async page=>{await page.route('http://fixture.test/**',route=>route.fulfill({contentType:'text/html',body:app.html}))},observe:async page=>{if(page.url()!=='http://fixture.test/login')throw new Error('Wrong route');return page.locator('#root').evaluate(element=>({theme:element.getAttribute('data-theme'),state:element.getAttribute('data-state'),fixture:element.getAttribute('data-fixture')}))},expectedFonts:async()=>[{family:'Inter',weight:'400',style:'normal'}]},routes:request.cases.map(test=>({id:test.id,path:'/login',viewports:[{name:'frame',...test.intent.viewport}],expects:[]})),visualSmoke:request.cases.map(test=>({id:test.id,ref:test.reference,route:test.id,viewport:'frame',capture:{selector:'#root',measured:true},externallyManaged:true,baselineRoot:request.baselineRoot,baseline:path.basename(test.baseline.path),threshold:{maxDiffPixelRatio:test.threshold},blocking:true}))}}}}`;
    await writeFile(path.join(root, "engine-config.mjs"), builder);
    const plan: CasePlan = {
      schemaVersion: 1,
      kind: "implementation-case-plan",
      complete: true,
      pending: [],
      visualApproval: false,
      cases: [
        {
          id: "empty",
          route: "login",
          setup: "empty",
          intent: {
            viewport: {
              width: 200,
              height: 100,
            },
            theme: "light",
            state: "empty",
            fixture: "local",
            fonts: [
              "Inter",
            ],
          },
          baseline: {
            path: "design/empty.png",
            sha256: createHash("sha256").update(baseline!).digest("hex"),
            scale: 1,
          },
          threshold: 0.05,
        },
      ],
    };
    const progress: string[] = [];
    const report = await runNativeReflectionCases(root, plan, {
      configFile: "engine-config.mjs",
      engineVersion: "0.7.0",
      onProgress: (message) => {
        progress.push(message);
      },
    });
    expect(report, progress.join("")).toMatchObject({
      complete: true,
      cases: [
        {
          complete: true,
          threshold: 0.05,
          withinThreshold: true,
          evidence: {
            observed: {
              theme: "light",
              state: "empty",
              fixture: "local",
            },
            artifactManifest: {
              path: expect.any(String),
              sha256: expect.any(String),
            },
            capture: {
              occlusion: {
                blocked: 0,
              },
              layoutSamples: 3,
            },
          },
        },
      ],
    });
    await writeFile(
      path.join(root, "app.json"),
      JSON.stringify({
        html: html.replace('data-state="empty"', 'data-state="wrong"'),
      }),
    );
    const wrong = await runNativeReflectionCases(root, plan, {
      configFile: "engine-config.mjs",
      engineVersion: "0.7.0",
    });
    expect(wrong.complete).toBe(false);
    expect(wrong.cases[0]?.reason).toMatch(/independently observe/);
  }, 30000);
});
