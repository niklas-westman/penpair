// Copy into the adopting project; Playwright and its browser are optional project dependencies.
import { chromium } from "playwright";
const properties = [
  "width",
  "height",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "rowGap",
  "columnGap",
  "borderRadius",
  "borderWidth",
  "borderColor",
  "backgroundColor",
  "color",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "boxShadow",
];
export async function measure(cases) {
  const browser = await chromium.launch();
  try {
    const measurements = [];
    for (const c of cases) {
      const context = await browser.newContext({
        viewport: c.viewport,
        reducedMotion: "reduce",
      });
      try {
        const page = await context.newPage();
        // The project fixture must render the real pinned components with its actual theme.
        // It must expose the observed context and ready marker AFTER activating the requested state.
        const url = new URL("http://127.0.0.1:4173/component-pilot");
        url.searchParams.set("theme", c.theme);
        url.searchParams.set("state", c.state);
        await page.goto(url.href, {
          waitUntil: "networkidle",
          timeout: 15000,
        });
        await page.locator('[data-pilot-ready="true"]').waitFor({
          timeout: 10000,
        });
        const observed = await page.evaluate(
          async ({ c, properties }) => {
            await document.fonts.ready;
            const root = document.querySelector(c.selector);
            if (!root || document.querySelectorAll(c.selector).length !== 1) {
              throw new Error("Fixture selector missing or ambiguous");
            }
            if (
              root.getAttribute("data-pilot-theme") !== c.theme ||
              root.getAttribute("data-pilot-state") !== c.state
            ) {
              throw new Error("Fixture context was not activated");
            }
            const nodes = [
              root,
              ...root.querySelectorAll("[data-pilot-part]"),
            ];
            const parts = Object.create(null);
            for (const node of nodes) {
              const name = node === root ? "root" : node.getAttribute("data-pilot-part");
              if (!name || parts[name]) {
                throw new Error("Duplicate anatomy part");
              }
              const style = getComputedStyle(node);
              parts[name] = Object.fromEntries(
                properties.map((key) => [
                  key,
                  style[key] || null,
                ]),
              );
            }
            return {
              id: c.id,
              parts,
              environment: {
                browser: navigator.userAgent,
                fontsReady: document.fonts.status === "loaded",
              },
            };
          },
          {
            c,
            properties,
          },
        );
        measurements.push(observed);
      } finally {
        await context.close();
      }
    }
    return measurements;
  } finally {
    await browser.close();
  }
}
