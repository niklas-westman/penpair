import { inheritPageSession } from "./page-session.js";
import { createHash, randomUUID } from "node:crypto";
import { hostname, userInfo } from "node:os";
import { lstat, mkdir, open, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { ensureGitignoreEntry } from "./instance/gitignore.js";
import { runSnippet, snippet } from "./snippet.js";
import type { PenpotToolClient } from "./client.js";
import type { JournalTarget } from "./journal.js";
import { maxSnippetBytes } from "./client.js";
import { PenpairError } from "./errors.js";

export interface WriteLease {
  check(): Promise<void>;
  release(): Promise<void>;
}
export interface CoordinationOptions {
  root: string;
  operation: string;
  forceLock?: boolean;
  warn?(message: string): void;
}

export interface LockEntry {
  token: string;
  runId: string;
  pid: number;
  host: string;
  createdAt: string;
  operation?: string;
  command?: string;
}
/** The command line a lock names, without anything that looks like a credential. */
export function describeCommand(argv: string[]): string {
  return argv
    .join(" ")
    .replace(/\b(userToken|token|key|secret|password)=[^\s&]+/gi, "$1=…")
    .slice(0, 300);
}
/** Who holds a lock, in one phrase; entries written by older versions lack the operation and command. */
export function describeLock(entry: LockEntry): string {
  return [
    entry.operation ? `operation ${entry.operation}` : undefined,
    `pid ${entry.pid} on ${entry.host}`,
    `since ${entry.createdAt}`,
    entry.command ? `command: penpair ${entry.command}` : undefined,
  ]
    .filter(Boolean)
    .join(", ");
}

const processRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (failure) {
    return (failure as NodeJS.ErrnoException).code !== "ESRCH";
  }
};
export interface LockReport {
  file: string;
  entry: LockEntry;
  /** `dead`: this host, process gone. `running`: this host, process alive. `foreign`: written on another host, cannot be judged. */
  status: "dead" | "running" | "foreign";
}
/** The local writer locks of this checkout, offline. */
export async function listLocks(root: string): Promise<LockReport[]> {
  const directory = path.join(root, ".penpair", "locks");
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const reports: LockReport[] = [];
  for (const name of names.filter((entry) => entry.endsWith(".json")).sort()) {
    const file = path.join(directory, name);
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) {
      continue;
    }
    let entry: LockEntry;
    try {
      entry = JSON.parse(await readFile(file, "utf8")) as LockEntry;
    } catch {
      continue;
    }
    reports.push({
      file: name,
      entry,
      status:
        entry.host !== hostname() || !Number.isInteger(entry.pid) || entry.pid < 1
          ? "foreign"
          : processRunning(entry.pid)
            ? "running"
            : "dead",
    });
  }
  return reports;
}
/** Removes only locks whose process is gone on this host. A lock from another host or a live process is never touched. */
export async function clearDeadLocks(root: string): Promise<{
  cleared: LockReport[];
  kept: LockReport[];
}> {
  const reports = await listLocks(root);
  const cleared: LockReport[] = [];
  for (const report of reports.filter((candidate) => candidate.status === "dead")) {
    // Re-read: only remove the lock that was judged, not one a new run created in between.
    const file = path.join(root, ".penpair", "locks", report.file);
    const current = JSON.parse(await readFile(file, "utf8")) as LockEntry;
    if (current.token === report.entry.token) {
      await unlink(file);
      cleared.push(report);
    }
  }
  return {
    cleared,
    kept: reports.filter((report) => !cleared.includes(report)),
  };
}

/** Exclusive only within this checkout. Shared file markers below are advisory, not compare-and-swap. */
async function localLease(
  root: string,
  fileId: string,
  runId: string,
  force: boolean,
  operation?: string,
): Promise<() => Promise<void>> {
  await ensureGitignoreEntry(root, ".penpair", {
    directory: true,
    comment: "penpair: private local operation evidence",
  });
  const parent = path.join(root, ".penpair");
  await mkdir(parent, {
    mode: 0o700,
  }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") {
      throw error;
    }
  });
  const parentInfo = await lstat(parent);
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) {
    throw new Error("Write locks require a real local directory");
  }
  const directory = path.join(parent, "locks");
  await mkdir(directory, {
    mode: 0o700,
  }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") {
      throw error;
    }
  });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error("Write locks require a real local directory");
  }
  const destination = path.join(
    directory,
    `${createHash("sha256").update(fileId).digest("hex")}.json`,
  );
  const token = randomUUID();
  const entry = {
    token,
    runId,
    pid: process.pid,
    host: hostname(),
    createdAt: new Date().toISOString(),
    operation,
    command: describeCommand(process.argv.slice(2)),
  };
  const create = async () => {
    const handle = await open(destination, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(entry));
    } finally {
      await handle.close();
    }
  };
  try {
    await create();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
    const previous = JSON.parse(await readFile(destination, "utf8")) as typeof entry;
    let running = false;
    if (previous.host === hostname() && Number.isInteger(previous.pid) && previous.pid > 0) {
      try {
        process.kill(previous.pid, 0);
        running = true;
      } catch (failure) {
        if ((failure as NodeJS.ErrnoException).code !== "ESRCH") {
          running = true;
        }
      }
    }
    if (!force || running) {
      throw new Error(
        `Local writer ${previous.runId} (${describeLock(previous)}) holds this file. ${running ? "Its process is still running; wait for it to finish, or find a duplicate background run." : "Inspect its journal, then use --force-lock to remove the abandoned local lock, or run penpair locks clear when its process is gone."}`,
      );
    }
    // Explicit owner override only. Simultaneous force operations are not an exclusion guarantee.
    await unlink(destination);
    await create();
  }
  return async () => {
    const current = JSON.parse(await readFile(destination, "utf8")) as typeof entry;
    if (current.token === token) {
      await unlink(destination);
    }
  };
}

const readMarker = `const f = penpot.currentFile;
if (typeof f.getSharedPluginData !== "function" || typeof f.setSharedPluginData !== "function") return { ok: true, supported: false };
const raw = f.getSharedPluginData("penpair", "writer");
let marker = null;
if (raw) { try { marker = JSON.parse(raw); } catch { return { ok: false, message: "Malformed shared writer marker; inspect before overriding" }; } }
`;

export function writeCoordinator(
  client: PenpotToolClient,
  options: CoordinationOptions,
): (runId: string, target: JournalTarget) => Promise<WriteLease> {
  return async (runId, target) => {
    const releaseLocal = await localLease(
      options.root,
      target.fileId,
      runId,
      options.forceLock === true,
      options.operation,
    );
    const marker = {
      schemaVersion: 1,
      token: randomUUID(),
      runId,
      operation: options.operation,
      owner: userInfo().username,
      createdAt: Date.now(),
      expiresAt: Date.now() + 15 * 60_000,
    };
    const params = {
      marker,
      fileId: target.fileId,
      force: options.forceLock === true,
    };
    const targetGuard =
      'if (penpot.currentFile.id !== CFG.fileId) return { ok:false, message:"Writer marker target changed" };';
    try {
      const before = await runSnippet(
        client,
        snippet(
          "writer-inspect",
          targetGuard + readMarker + "return { ok:true, supported:true, marker };",
          params,
          "read",
        ),
      );
      if (before.supported === false) {
        options.warn?.(
          "Shared writer markers unavailable; local checkout lock only. Coordinate with colleagues before writing.",
        );
        return {
          check: async () => undefined,
          release: releaseLocal,
        };
      }
      const acquired = await runSnippet(
        client,
        snippet(
          "writer-acquire",
          targetGuard +
            readMarker +
            `
if (marker && marker.token !== CFG.marker.token && (!Number.isFinite(marker.expiresAt) || marker.expiresAt > Date.now()) && !CFG.force)
  return { ok:false, message:"Another writer is running " + String(marker.operation) + " (run " + String(marker.runId) + ", owner " + String(marker.owner) + ", since " + (Number.isFinite(marker.createdAt) ? new Date(marker.createdAt).toISOString() : "an unknown time") + "). Coordinate before --force-lock." };
f.setSharedPluginData("penpair", "writer", JSON.stringify(CFG.marker));
return { ok:true, supported:true };`,
          params,
          "write",
        ),
      );
      if (acquired.supported !== true) {
        throw new Error("Writer marker capability changed during acquisition");
      }
      const check = async () => {
        const observed = await runSnippet(
          client,
          snippet(
            "writer-check",
            targetGuard +
              readMarker +
              "return { ok:true, supported:true, owned: !!marker && marker.token === CFG.marker.token && marker.expiresAt > Date.now() };",
            params,
            "read",
          ),
        );
        if (observed.supported !== true || observed.owned !== true) {
          throw new Error(
            "Shared writer marker was lost or expired; stop and coordinate before resuming",
          );
        }
      };
      await check();
      return {
        check,
        release: async () => {
          try {
            await runSnippet(
              client,
              snippet(
                "writer-release",
                targetGuard +
                  readMarker +
                  'if (marker && marker.token === CFG.marker.token) f.setSharedPluginData("penpair", "writer", ""); return { ok:true };',
                params,
                "write",
              ),
            );
          } finally {
            await releaseLocal();
          }
        },
      };
    } catch (error) {
      await releaseLocal();
      throw error;
    }
  };
}

/** Revision precondition is checked inside the delivered mutation, after all guard calls. It is not a server CAS. */
export function guardRevision(client: PenpotToolClient, target: JournalTarget): PenpotToolClient {
  return inheritPageSession(
    {
      ...client,
      close: () => client.close(),
      async callTool(name, args, options) {
        if (name !== "execute_code" || typeof args.code !== "string") {
          throw new Error("Revision guards require execute_code");
        }
        const code =
          `{ if (penpot.currentFile.id !== ${JSON.stringify(target.fileId)} || penpot.currentFile.revn !== ${JSON.stringify(target.revision)}) return {ok:false, message:"File revision changed before mutation; inspect again"}; }\n` +
          args.code;
        if (Buffer.byteLength(code) > maxSnippetBytes) {
          throw new PenpairError(
            "snippet-too-large",
            "Snippet including revision guard exceeds 90 KB",
          );
        }
        return client.callTool(
          name,
          {
            ...args,
            code,
          },
          options,
        );
      },
    },
    client,
  );
}
