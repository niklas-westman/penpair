import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nodeRunner } from "../src/instance/runner.js";

const node = process.execPath;

describe("the command runner", () => {
  it("captures output and the exit code without a shell", async () => {
    const result = await nodeRunner.run(node, ["-e", 'console.log("a;b $HOME"); console.error("e"); process.exit(3)']);
    expect(result).toEqual({ code: 3, stdout: "a;b $HOME\n", stderr: "e\n" });
  });

  it("streams a large output into a file and finishes even when the file closes first", async () => {
    const file = path.join(await mkdtemp(path.join(os.tmpdir(), "penpair-runner-")), "out.bin");
    for (let i = 0; i < 5; i++) {
      const result = await nodeRunner.run(node, ["-e", 'process.stdout.write("x".repeat(3_000_000))'], { outFile: file });
      expect(result.code).toBe(0);
      expect((await stat(file)).size).toBe(3_000_000);
    }
  });

  it("feeds a file or text to the command's input", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "penpair-runner-"));
    const input = path.join(dir, "in.txt");
    await writeFile(input, "from a file");
    const echo = ["-e", "process.stdin.pipe(process.stdout)"];
    expect((await nodeRunner.run(node, echo, { inFile: input })).stdout).toBe("from a file");
    expect((await nodeRunner.run(node, echo, { input: "from text" })).stdout).toBe("from text");
    expect(await readFile(input, "utf8")).toBe("from a file");
  });

  it("reports a command that does not exist as a failure", async () => {
    expect((await nodeRunner.run("penpair-no-such-command", [])).code).not.toBe(0);
  });
});
