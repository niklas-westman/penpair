import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
const root = fileURLToPath(new URL("../../../", import.meta.url));
// @ts-expect-error Repository script is deliberately plain JavaScript.
import { troubleshootingMarkdown } from "../../../scripts/generate-troubleshooting.mjs";
function anchors(markdown: string): Set<string> {
  const found = new Set<string>();
  const counts = new Map<string, number>();
  for (const line of markdown.split("\n")) {
    const heading = /^#{1,6}\s+(.+)$/.exec(line)?.[1];
    if (heading) {
      const slug = heading
        .toLowerCase()
        .replace(/<[^>]+>/g, "")
        .replace(/[^\p{L}\p{N}_ -]/gu, "")
        .replaceAll(" ", "-");
      const n = counts.get(slug) ?? 0;
      found.add(n ? `${slug}-${n}` : slug);
      counts.set(slug, n + 1);
    }
  }
  for (const match of markdown.matchAll(/<(?:a|span)\s+id="([^"]+)"/g)) {
    found.add(match[1]!);
  }
  return found;
}
describe("documentation navigation and repair inventory", () => {
  it("keeps every core error remedy in the generated troubleshooting page", async () => {
    expect(await readFile(path.join(root, "docs/troubleshooting.md"), "utf8")).toBe(
      troubleshootingMarkdown(),
    );
  });
  it("resolves local README/docs links and Markdown anchors", async () => {
    const files = [
      "README.md",
      ...(await readdir(path.join(root, "docs")))
        .filter((f) => f.endsWith(".md"))
        .map((f) => `docs/${f}`),
    ];
    const problems: string[] = [];
    for (const file of files) {
      const source = await readFile(path.join(root, file), "utf8");
      // Ignore code examples; they may intentionally show caller-supplied placeholders.
      const prose = source.replace(/^(`{3,}|~{3,}).*\n[\s\S]*?^\1\s*$/gm, "");
      const targets = [
        ...prose.matchAll(/\[[^\]]*\]\(([^)]+)\)/g),
      ]
        .map((m) => m[1]!)
        .concat(
          [
            ...prose.matchAll(/<(?:a|img)\b[^>]*(?:href|src)="([^"]+)"/g),
          ].map((m) => m[1]!),
        );
      for (const raw of targets) {
        const href = raw.replace(/^<|>$/g, "").split(/\s+"/)[0]!;
        if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
          continue;
        }
        const [target, fragment] = href.split("#");
        const absolute = target
          ? path.resolve(path.dirname(path.join(root, file)), decodeURIComponent(target))
          : path.join(root, file);
        try {
          await access(absolute);
          if (
            fragment &&
            absolute.endsWith(".md") &&
            !anchors(await readFile(absolute, "utf8")).has(decodeURIComponent(fragment))
          ) {
            problems.push(`${file}: missing anchor ${href}`);
          }
        } catch {
          problems.push(`${file}: missing local file ${href}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
