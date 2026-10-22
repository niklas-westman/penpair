export const hooks = {
 route: test => test.route,
 async setup(page) { await page.locator("#capture").scrollIntoViewIfNeeded(); },
 async prepareCapture(page) { await page.evaluate(() => window.scrollTo(0, 0)); },
 async observe(page) { return page.evaluate(() => ({ theme: document.documentElement.dataset.theme, state: document.querySelector("main").dataset.state, fixture: document.querySelector("main").dataset.fixture })); },
 captureRoot: () => "#capture",
 expectedFonts: () => [{ family: "Fixture", weight: "400", style: "normal" }],
};
