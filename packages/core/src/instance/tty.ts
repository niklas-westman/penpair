import { createInterface } from "node:readline";
import { nodeRunner } from "./runner.js";

/** Reads everything piped into standard input (for `pbpaste | penpair connect`, where a key never appears in a command line). */
async function readPiped(): Promise<string> {
  let text = "";
  for await (const chunk of process.stdin) text += String(chunk);
  return text.trim();
}

/** Asks for a secret without echoing it. With no terminal (a pipe), the whole input is the answer. */
export async function askHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) return readPiped();
  process.stderr.write(question);
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (chunk: string): void => {
      for (const char of chunk) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("cancelled"));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          process.stderr.write("\n");
          resolve(value.trim());
          return;
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    const cleanup = (): void => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on("data", onData);
  });
}

/** One visible line of input; the fallback is taken on an empty answer or when there is no terminal. */
export async function askLine(question: string, fallback: string): Promise<string> {
  if (!process.stdin.isTTY) return fallback;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return await new Promise<string>((resolve) => rl.question(question, (answer) => resolve(answer.trim() || fallback)));
  } finally {
    rl.close();
  }
}

export async function openInBrowser(url: string): Promise<void> {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const result = await nodeRunner.run(command, args);
  if (result.code !== 0) throw new Error("Browser launch failed; open the configured public Penpot address manually.");
}
