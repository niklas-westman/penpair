/** Browser plumbing only. Project hooks supply real setup and independent DOM readback. */
export function outwardClip(box) {
 if (!box || ![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0) throw new Error("Capture root needs a finite, positive document box");
 const x = Math.floor(box.x), y = Math.floor(box.y);
 return { x, y, width: Math.ceil(box.x + box.width) - x, height: Math.ceil(box.y + box.height) - y };
}
export async function captureCase(page, test, hooks, { timeoutMs = 10000 } = {}) {
 for (const name of ["setup", "observe", "captureRoot", "expectedFonts"]) if (typeof hooks[name] !== "function") throw new Error(`Required project hook: ${name}`);
 page.setDefaultTimeout(timeoutMs);
 await hooks.setup(page, test);
 const selector = await hooks.captureRoot(test), root = page.locator(selector);
 if (await root.count() !== 1) throw new Error("Capture root must resolve uniquely");
 const expectedFonts = await hooks.expectedFonts(test);
 if (!Array.isArray(expectedFonts) || !expectedFonts.length || expectedFonts.some(font => !font.family || !font.weight || !font.style)) throw new Error("Explicit font family/weight/style evidence is required");
 await page.waitForFunction(fonts => {
  const clean = value => value.replace(/["']/g, "");
  return document.fonts.status === "loaded" && fonts.every(wanted => [...document.fonts].some(face => clean(face.family) === wanted.family && face.weight === wanted.weight && face.style === wanted.style && face.status === "loaded"));
 }, expectedFonts, { timeout: timeoutMs });
 await root.scrollIntoViewIfNeeded();
 if (hooks.prepareCapture) await hooks.prepareCapture(page, test, root);
 // Observe three complete stable boxes across animation frames, after scroll/sticky layout.
 const rootBox = await root.evaluate(async (element, timeout) => {
  let previous, equal = 0; const deadline = performance.now() + timeout;
  for (let count = 0; count < 120; count++) {
   await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Capture layout deadline exceeded")), Math.max(1, deadline-performance.now()));
    requestAnimationFrame(() => { clearTimeout(timer); resolve(); });
   });
   const rect = element.getBoundingClientRect(), box = { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height };
   const current = JSON.stringify(box); equal = current === previous ? equal + 1 : 1;
   if (equal === 3) return box; previous = current;
  }
  throw new Error("Capture root did not settle");
 }, timeoutMs);
 const clip = outwardClip(rootBox);
 const occlusion = await root.evaluate(element => {
  const r = element.getBoundingClientRect(), left = Math.max(0, r.left), top = Math.max(0, r.top), right = Math.min(innerWidth, r.right), bottom = Math.min(innerHeight, r.bottom);
  if (right-left < 2 || bottom-top < 2) throw new Error("Capture root has no observable viewport area");
  const points = [[left+1,top+1],[right-1,top+1],[(left+right)/2,(top+bottom)/2],[left+1,bottom-1],[right-1,bottom-1]];
  return { samples: points.length, blocked: points.filter(([x,y]) => { const hit = document.elementFromPoint(x,y); return !hit || !element.contains(hit); }).length };
 });
 if (occlusion.blocked) throw new Error("Capture root is occluded by sticky shell or external content; use prepareCapture to establish the intended scroll state");
 // Move outside the viewport; a corner inside a full-screen root is not a safe parking place.
 await page.mouse.move(-10, -10);
 const pointer = await root.evaluate(element => ({ x: -10, y: -10, outsideRoot: !element.matches(":hover"), hoveredControls: element.querySelectorAll("button:hover,a:hover,input:hover,select:hover,textarea:hover,[role=button]:hover").length }));
 if (!pointer.outsideRoot || pointer.hoveredControls !== 0) throw new Error("Hover contamination in capture root");
 const observed = await hooks.observe(page, test);
 const measured = await page.evaluate(() => ({ viewport: { width: innerWidth, height: innerHeight }, deviceScaleFactor: devicePixelRatio, scroll: { x: scrollX, y: scrollY }, fonts: [...document.fonts].filter(face => face.status === "loaded").map(face => ({ family: face.family.replace(/["']/g, ""), weight: face.weight, style: face.style, status: face.status })) }));
 const actual = { viewport: measured.viewport, theme: observed.theme, state: observed.state, fixture: observed.fixture };
 const desired = { viewport: test.intent.viewport, theme: test.intent.theme, state: test.intent.state, fixture: test.intent.fixture };
 if (JSON.stringify(actual) !== JSON.stringify(desired)) throw new Error("Observed browser state/theme/fixture/viewport differs from requested case");
 if (clip.width !== desired.viewport.width || clip.height !== desired.viewport.height || measured.deviceScaleFactor !== test.baseline.scale) throw new Error("Rounded root dimensions or device scale differ from design case; do not resize the image");
 const screenshot = await page.screenshot({ type: "png", fullPage: true, clip, scale: "device", animations: "disabled", caret: "hide" });
 const after = await hooks.observe(page, test), afterBox = await root.boundingBox();
 if (JSON.stringify(after) !== JSON.stringify(observed) || !afterBox || JSON.stringify(outwardClip({ ...afterBox, x: afterBox.x + measured.scroll.x, y: afterBox.y + measured.scroll.y })) !== JSON.stringify(clip)) throw new Error("Browser source changed during capture");
 return { screenshot, observed: actual, fonts: [...new Set(measured.fonts.map(font => font.family))], fontsReady: true, capture: { schemaVersion: 1, root: selector, rootBox, clip, rounding: "outward-css-pixels", deviceScaleFactor: measured.deviceScaleFactor, browser: { name: page.context().browser().browserType().name(), version: page.context().browser().version() }, fonts: measured.fonts, pointer, occlusion, scroll: measured.scroll, layoutSamples: 3 } };
}

/** Exact decoded RGBA pixel difference, without resizing or threshold-based approval. */
export async function comparePng(page, baseline, screenshot) {
 return page.evaluate(async images => {
  const decode = async base64 => { const image = new Image(); image.src = "data:image/png;base64," + base64; await image.decode(); return image; };
  const [before, after] = await Promise.all(images.map(decode));
  if (before.width !== after.width || before.height !== after.height) throw new Error("Comparison dimensions differ");
  const canvas = document.createElement("canvas"); canvas.width = before.width; canvas.height = before.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(before, 0, 0); const a = context.getImageData(0, 0, canvas.width, canvas.height).data;
  context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(after, 0, 0); const b = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let changed = 0;
  for (let index = 0; index < a.length; index += 4) if ([0,1,2,3].some(channel => a[index + channel] !== b[index + channel])) changed++;
  return changed / (canvas.width * canvas.height);
 }, [baseline.toString("base64"), screenshot.toString("base64")]);
}
