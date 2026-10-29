import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createJiti } from "jiti";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import type { NativeEngineApi } from "./native-types.js";

export async function resolveNativeEngine(
  root: string,
  expectedVersion: string,
): Promise<{
  api: NativeEngineApi;
  cli: string;
}> {
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(expectedVersion)) {
    throw new Error("Pin an exact Reflection engine version");
  }

  const entry = fileURLToPath(
    createJiti(path.join(root, "package.json")).esmResolve("reflection-check"),
  );
  let directory = path.dirname(entry);

  while (true) {
    const manifest = await readFile(path.join(directory, "package.json"), "utf8")
      .then((bytes) => JSON.parse(bytes) as Record<string, unknown>)
      .catch(() => undefined);

    if (manifest?.name === "reflection-check") {
      if (manifest.version !== expectedVersion) {
        throw new Error(
          `Reflection engine version must be ${expectedVersion}; found ${String(manifest.version)}`,
        );
      }

      const binaries = manifest.bin as Record<string, string> | undefined;
      const binary = binaries?.reflection;
      if (!binary || path.isAbsolute(binary) || binary.split(/[\\/]/).includes("..")) {
        throw new Error("Reflection package has no supported public CLI");
      }

      const api = (await import(pathToFileURL(entry).href)) as NativeEngineApi;
      if (
        api.reflectionCapabilities?.browserCaptureObservation !== 1 ||
        api.reflectionCapabilities?.externallyManagedBaselines !== 1 ||
        typeof api.hashReportInputs !== "function" ||
        typeof api.computeResultHash !== "function"
      ) {
        throw new Error(
          "Reflection engine lacks public measured-capture and managed-baseline capabilities; upgrade to a release providing them",
        );
      }

      return {
        api,
        cli: path.join(directory, binary),
      };
    }

    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error("Cannot locate the pinned Reflection package");
    }
    directory = parent;
  }
}

export async function executeNativeEngine(
  root: string,
  cli: string,
  config: string,
  reportRoot: string,
  caseIds: string[],
  onProgress?: (message: string) => void,
  signal?: AbortSignal,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        cli,
        "run",
        "--config",
        config,
        "--mode",
        "smoke",
        "--ci",
        "--report-dir",
        reportRoot,
        ...caseIds.flatMap((id) => [
          "--case",
          id,
        ]),
      ],
      {
        cwd: root,
        stdio: [
          "ignore",
          "pipe",
          "pipe",
        ],
        signal,
      },
    );

    const pending = new Map<string, string>();
    const forward = (stream: string, chunk: Buffer): void => {
      const lines = `${pending.get(stream) ?? ""}${chunk.toString()}`.split("\n");
      pending.set(stream, lines.pop() ?? "");
      for (const line of lines) {
        onProgress?.(`${line}\n`);
      }
    };
    child.stdout.on("data", (chunk: Buffer) => forward("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => forward("stderr", chunk));
    child.once("error", reject);
    child.once("close", (code, terminationSignal) => {
      for (const line of pending.values()) {
        if (line) {
          onProgress?.(`${line}\n`);
        }
      }
      if (terminationSignal || code === null) {
        reject(new Error(`Reflection execution interrupted (${terminationSignal ?? "unknown"})`));
      } else {
        resolve(code);
      }
    });
  });
}
