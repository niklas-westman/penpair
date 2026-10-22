import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { backupNoteCheck } from "../src/backup-note.js";
import { validateProjectConfig } from "../src/instance/config.js";

const now = new Date("2026-10-21T12:00:00Z");
const base = { instance: "demo", profile: { type: "external" as const, origin: "https://example.test" }, file: { id: "f" } };
const config = { ...base, backup: { noteFile: "backup-note.json", remindAfterDays: 7 } };
const good = { schemaVersion: 1, fileId: "f", recordedAt: "2026-10-20T12:00:00Z", archiveSha256: "a".repeat(64), restoreVerified: true };
describe("opt-in backup reminders", () => {
  it("is disabled without configuration and validates relative note paths", async () => {
    expect(await backupNoteCheck("/not-read", base, now)).toBeUndefined();
    expect(() => validateProjectConfig({ ...base, backup: { noteFile: "../outside", remindAfterDays: 7 } })).toThrow(/backup/);
  });
  it.each([
    [good, false],
    [{ ...good, recordedAt: "2026-10-01T12:00:00Z" }, true],
    [{ ...good, recordedAt: "2026-10-22T12:00:00Z" }, true],
    [{ ...good, fileId: "another" }, true],
    [{ ...good, restoreVerified: false }, true],
    [{ schemaVersion: 1 }, true],
  ])("reports note evidence without blocking doctor %#", async (note, warning) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-backup-note-"));
    await writeFile(path.join(root, "backup-note.json"), JSON.stringify(note));
    const result = await backupNoteCheck(root, config, now);
    expect(result?.ok).toBe(true);
    expect(result?.warning === true).toBe(warning);
  });
  it("warns without claiming a restore when no note is readable", async () => {
    expect(await backupNoteCheck(await mkdtemp(path.join(os.tmpdir(), "penpair-backup-missing-")), config, now)).toMatchObject({ ok: true, warning: true });
  });
});
