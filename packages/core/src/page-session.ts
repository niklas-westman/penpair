import { AsyncLocalStorage } from "node:async_hooks";
import { commandSignal, commandSleep } from "./command-result.js";
import type { ExecuteOptions, PenpotToolClient } from "./client.js";
import { runSnippet, snippet, type Snippet } from "./snippet.js";

interface PageIdentity { fileId: string; pageId: string }
interface Session { client: PenpotToolClient; expected?: PageIdentity }
const owners = new WeakMap<PenpotToolClient, PenpotToolClient>();
const owner = (client: PenpotToolClient): PenpotToolClient => owners.get(client) ?? client;
export function inheritPageSession<T extends PenpotToolClient>(derived: T, base: PenpotToolClient): T { owners.set(derived, owner(base)); return derived; }
const active = new AsyncLocalStorage<Session>();
const queues = new WeakMap<PenpotToolClient, Promise<void>>();

/** Nested collection steps share one session; independent callers on the same client queue. */
export async function withPageSession<T>(client: PenpotToolClient, work: () => Promise<T>): Promise<T> {
 client = owner(client);
 if (active.getStore()?.client === client) return work();
 const previous = queues.get(client) ?? Promise.resolve();
 let release!: () => void;
 const gate = new Promise<void>(resolve => { release = resolve; });
 const tail = previous.catch(() => undefined).then(() => gate);
 queues.set(client, tail);
 const signal = commandSignal();
 let onAbort: (() => void) | undefined;
 try {
  await new Promise<void>((resolve, reject) => {
   onAbort = () => reject(signal?.reason);
   signal?.addEventListener("abort", onAbort, { once: true });
   if (signal?.aborted) onAbort();
   previous.then(resolve, reject);
  });
  signal?.throwIfAborted(); return await active.run({ client }, work);
 }
 finally {
  if (onAbort) signal?.removeEventListener("abort", onAbort);
  release();
  // A cancelled waiter still follows its predecessor; removing it early would open a parallel queue.
  void tail.then(() => { if (queues.get(client) === tail) queues.delete(client); });
 }
}
export function rememberPage(client: PenpotToolClient, identity: PageIdentity): void {
 const session = active.getStore();
 if (session?.client === owner(client)) session.expected = identity;
}
export function pinPageSnippet(client: PenpotToolClient, source: Snippet): Snippet {
 const session = active.getStore();
 if (session?.client !== owner(client) || !session.expected) return source;
 const expected = JSON.stringify(session.expected);
 return { ...source, code: `{ const expected = ${expected}; if (penpot.currentFile.id !== expected.fileId || penpot.currentPage.id !== expected.pageId) return {ok:false,message:"Unexpected external navigation during page session"}; }\n${source.code}` };
}
export async function observePage(client: PenpotToolClient, options: ExecuteOptions = {}): Promise<PageIdentity> {
 const result = await runSnippet(client, pinPageSnippet(client, snippet("page-state", "return {ok:true,fileId:penpot.currentFile.id,pageId:penpot.currentPage.id};", {}, "read")), { ...options, effect: "read", retries: 0 });
 if (typeof result.fileId !== "string" || !result.fileId || typeof result.pageId !== "string" || !result.pageId) throw new Error("Page identity was not observed");
 return { fileId: result.fileId, pageId: result.pageId };
}
export interface PageSwitchOptions extends ExecuteOptions { sleep?: (ms: number) => Promise<void>; pageSwitchTimeoutMs?: number; onStep?: (message: string) => void }
export async function selectPage(client: PenpotToolClient, target: { name: string } | { id: string }, options: PageSwitchOptions = {}): Promise<PageIdentity> {
 const timeout = Math.min(options.pageSwitchTimeoutMs ?? 5000, options.timeoutMs ?? 5000);
 if (!Number.isFinite(timeout) || timeout < 1 || timeout > 30000) throw new Error("Invalid page switch budget");
 const deadline = Date.now() + timeout;
 const execute = () => ({ ...options, retries: 0, effect: "read" as const, timeoutMs: Math.max(1, deadline - Date.now()) });
 const resolved = await runSnippet(client, pinPageSnippet(client, snippet("select-page", `
const matches = penpot.currentFile.pages.filter(p => CFG.id ? p.id === CFG.id : p.name === CFG.name);
if (matches.length !== 1) return {ok:false,message:"Page selection is missing or ambiguous"};
const target = matches[0], fileId = penpot.currentFile.id, previousPageId = penpot.currentPage.id;
if (target.id !== previousPageId) penpot.openPage(target);
return {ok:true,fileId,pageId:target.id,previousPageId};`, target, "read")), execute());
 if (typeof resolved.fileId !== "string" || typeof resolved.pageId !== "string" || typeof resolved.previousPageId !== "string") throw new Error("Page selection returned no identity evidence");
 const expected = { fileId: resolved.fileId, pageId: resolved.pageId };
 let observed = resolved.previousPageId;
 for (let count = 0; count <= Math.ceil(timeout / 100); count++) {
  commandSignal()?.throwIfAborted();
  // During a requested transition either the old or selected page is legitimate.
  const current = await runSnippet(client, snippet("page-switch-observation", "return {ok:true,fileId:penpot.currentFile.id,pageId:penpot.currentPage.id};", {}, "read"), execute());
  if (current.fileId !== expected.fileId) throw new Error("File changed during page switch");
  observed = String(current.pageId);
  if (Date.now() >= deadline) break;
  if (observed === expected.pageId) { rememberPage(client, expected); return expected; }
  if (observed !== resolved.previousPageId) throw new Error(`Unexpected external navigation during page switch: expected ${expected.pageId}, observed ${observed}`);
  if (Date.now() >= deadline) break;
  await (options.sleep ?? commandSleep)(Math.min(100, Math.max(0, deadline - Date.now())));
 }
 throw new Error(`Page switch timed out: expected ${expected.pageId}, observed ${observed}, stage=observe-page`);
}
