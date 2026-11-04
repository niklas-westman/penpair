import { describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli-main.js";

async function refused(args: string[]): Promise<string> {
  const errors: string[] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((line: unknown) => {
    errors.push(String(line));
  });
  const exitCode = await runCli(args);
  spy.mockRestore();
  expect(exitCode).not.toBe(0);
  return errors.join("\n");
}

describe("export --concurrency", () => {
  it("accepts 1 to 8 whole frames at a time and refuses anything else", async () => {
    for (const bad of [
      "0",
      "9",
      "2.5",
      "many",
    ]) {
      expect(
        await refused([
          "export",
          "--frames",
          "a",
          "--page",
          "P",
          "--concurrency",
          bad,
        ]),
      ).toMatch(/--concurrency must be an integer from 1 to 8/);
    }
  });

  it("belongs to a batch export", async () => {
    expect(
      await refused([
        "export",
        "id",
        "out.png",
        "--concurrency",
        "4",
      ]),
    ).toMatch(/--concurrency .*batch export/);
  });
});
