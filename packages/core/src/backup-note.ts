import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ProjectConfig } from "./instance/config.js";
import type { DoctorCheck } from "./instance/connection.js";

/** An optional advisory record, not proof that an archive can be restored. Disabled unless configured. */
export async function backupNoteCheck(
  root: string,
  config: ProjectConfig,
  now = new Date(),
): Promise<DoctorCheck | undefined> {
  if (!config.backup) {
    return undefined;
  }
  const warn = (detail: string): DoctorCheck => ({
    check: "backup note",
    ok: true,
    warning: true,
    detail,
    remedy:
      "Export a current archive, restore it into scratch, then update the backup note; see docs/backup.md.",
  });
  let note: {
    schemaVersion?: number;
    fileId?: string;
    recordedAt?: string;
    archiveSha256?: string;
    restoreVerified?: boolean;
  };
  try {
    note = JSON.parse(await readFile(path.join(root, config.backup.noteFile), "utf8"));
  } catch {
    return warn("No readable backup note; archive/restore status is unknown");
  }
  if (
    !note ||
    note.schemaVersion !== 1 ||
    typeof note.fileId !== "string" ||
    typeof note.recordedAt !== "string" ||
    typeof note.archiveSha256 !== "string" ||
    !/^[a-f0-9]{64}$/i.test(note.archiveSha256)
  ) {
    return warn("Backup note is incomplete or invalid; archive/restore status is unknown");
  }
  if (!config.file || note.fileId !== config.file.id) {
    return warn("Backup note does not match a pinned project file");
  }
  const timestamp = Date.parse(note.recordedAt);
  const age = now.getTime() - timestamp;
  if (!Number.isFinite(timestamp) || age < 0) {
    return warn("Backup note has an invalid or future date");
  }
  if (age >= config.backup.remindAfterDays * 86_400_000) {
    return warn(
      `Backup note is ${Math.floor(age / 86_400_000)} days old; refresh the archive and restore evidence`,
    );
  }
  if (note.restoreVerified !== true) {
    return warn("Archive recorded recently, but its restore is not recorded as verified");
  }
  return {
    check: "backup note",
    ok: true,
    detail:
      "Recent owner-maintained backup/restore note matches the pinned file (a note is not independent restore proof)",
  };
}
