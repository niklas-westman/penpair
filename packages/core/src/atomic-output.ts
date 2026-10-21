import { randomUUID } from "node:crypto";
import { link, open, rename, unlink } from "node:fs/promises";
import path from "node:path";

/** Stage complete bytes beside the destination; publish once. Exclusive mode never replaces an existing file. */
export async function atomicWriteFile(destination: string, data: string | Uint8Array, options: { replace?: boolean } = {}): Promise<void> {
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}-${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } catch (error) {
    await handle.close(); await unlink(temporary).catch(() => undefined); throw error;
  }
  await handle.close();
  try {
    if (options.replace) await rename(temporary, destination);
    else await link(temporary, destination);
  } finally { await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; }); }
}
