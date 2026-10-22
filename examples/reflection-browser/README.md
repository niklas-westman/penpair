# Real browser comparison starter

Copy `capture.mjs` and `provider.mjs` into the adopting project, or use the shipped copies under `node_modules/@penpair/web/examples/reflection-browser/`. This is a starting provider for the existing `ImplementationProvider.runCase` contract. It does not install a browser, change your application or approve a design.

Use your project's pinned Playwright and matching browser installation. A copied provider resolves `@penpair/core` from its project; declare it at the same version as the other Penpair packages, or pass its three IO helpers explicitly as `io`. Keep all Penpair versions aligned. Do not use the fixture hooks as application evidence.

In your trusted project provider:

```js
import { chromium } from 'playwright'; // the adopter's pinned version
import { createBrowserProvider } from './provider.mjs';
import { hooks } from './project-hooks.mjs';
export async function runCase(test) {
  const browser = await chromium.launch();
  try {
    return await createBrowserProvider({ browser, baseURL: 'http://127.0.0.1:5173', projectRoot: process.cwd(), hooks }).runCase(test);
  } finally { await browser.close(); }
}
```

Required hooks:

| Hook | Contract |
| --- | --- |
| `route(test)` | Return the exact intended route; must match `test.route` on the configured app origin. |
| `setup(page, test)` | Explicitly establish application fixture, theme and state using your app's controls or test APIs. |
| `observe(page, test)` | Independently read **actual** `{theme,state,fixture}` from rendered DOM/application evidence. Never return the requested fields directly. |
| `captureRoot(test)` | Return one unique CSS selector for the design region. |
| `expectedFonts(test)` | Return explicit webfont `{family,weight,style}` faces; each must be observed loaded in `document.fonts`. System-font fallback cannot stand in for webfont evidence. |
| `prepareCapture(page, test, root)` | Optional explicit scroll/sticky setup after automatic scroll. Use it when a shell would cover the root. Occlusion checks refuse covered captures; the starter does not hide your shell. |

The provider measures the viewport and device scale (default 1), waits for font faces/weights and three equal root boxes, parks the pointer outside the viewport, checks hover and sampled occlusion, and rounds the document box **outward to whole CSS pixels**. It captures that clip against the full document so viewport trimming cannot silently remove a pixel. Root dimensions must match the design case. It never resizes a screenshot to improve the comparison. Metadata retains root/clip, browser version, actual fonts, scroll, pointer and layout evidence. Occlusion checks sample points; inspect images for unsampled overlays and animation differences.

The comparison uses exact decoded RGBA pixel differences in a browser canvas. The numeric ratio is evidence; inspect image differences and retain `owner-review-required`. Baseline hashes, paths and PNG dimensions are still independently checked by the adapter. Old schema-1 providers remain readable; this starter requires its complete capture metadata.

```sh
penpair reflection plan --map design/implementation-cases.json
penpair reflection check --map design/implementation-cases.json --provider design/browser/run.mjs
```

These commands require registered `@penpair/reflection-check` and current exact approved design cases. See [adapter setup](../../docs/adapters.md). `runCase` must close its browser/context as above. Do not store credentials in hooks or evidence.

## Local plumbing trial

From this repository, run `pnpm smoke:browser` using a locally installed pinned Playwright and browser. Optional `PENPAIR_PLAYWRIGHT_MODULE` selects an absolute module path; `PENPAIR_BROWSER_EXECUTABLE` or `PENPAIR_BROWSER_CHANNEL` selects an existing test browser. No absolute machine paths are committed to the example.

The script starts/stops a loopback fixture, captures desktop/mobile × light/dark × loaded/empty, tests wrong theme, missing face/weight, delayed font loading, scale mismatch, hover and sticky occlusion, and verifies unchanged baseline bytes. Its browser references are deliberately **unapproved synthetic fixtures**. They exercise plumbing; they are not Penpot acceptance or owner-approved design baselines.

The fixture's Abel Regular font is redistributed under [SIL OFL](fixture/OFL.txt), retrieved from [Google Fonts](https://github.com/google/fonts/tree/main/ofl/abel), SHA-256 `8809dcad25318225052f88333e208c5aad4adcb7b2c934c135735ec19aa410b4`. Browser APIs follow [Playwright screenshot documentation](https://playwright.dev/docs/api/class-page#page-screenshot) and [font-loading evidence](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet).
