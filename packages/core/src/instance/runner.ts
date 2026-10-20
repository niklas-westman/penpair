import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { once } from "node:events";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  /** Text sent to the command's standard input. */
  input?: string;
  /** Stream standard output into this file instead of capturing it (dumps and archives can be large). */
  outFile?: string;
  /** Stream this file into standard input. */
  inFile?: string;
}

/** Runs a command without a shell, so nothing is ever interpreted. Injectable so the lifecycle can be tested without Docker. */
export interface Runner {
  run(command: string, args: string[], options?: RunOptions): Promise<RunResult>;
}

export const nodeRunner: Runner = {
  async run(command, args, options = {}) {
    const child = spawn(command, args, { stdio: [options.input !== undefined || options.inFile ? "pipe" : "ignore", "pipe", "pipe"] });
    const { stdout: out, stderr: err } = child;
    if (!out || !err) throw new Error("the command has no output streams");
    let stdout = "";
    let stderr = "";
    const writing = options.outFile ? createWriteStream(options.outFile) : undefined;
    // Registered at once: the file can finish closing before the child does, and a missed event would hang forever.
    const written = writing ? new Promise<void>((resolve) => writing.once("close", () => resolve())) : undefined;
    if (writing) out.pipe(writing);
    else out.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    err.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    if (options.inFile && child.stdin) createReadStream(options.inFile).pipe(child.stdin);
    else if (options.input !== undefined && child.stdin) child.stdin.end(options.input);
    try {
      const [code] = (await once(child, "close")) as [number | null];
      if (written) await written;
      return { code: code ?? 1, stdout, stderr };
    } catch (error) {
      // The command could not start at all (not installed, not executable).
      writing?.destroy();
      return { code: 127, stdout, stderr: String((error as Error).message) };
    }
  },
};
