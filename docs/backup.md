# Hosted-file backup and restore

An exported archive is a candidate backup. It becomes a proven recovery path after a successful import and independent content/render comparison. Named Penpot versions and structural JSON snapshots help with recovery/review, but neither is an independent full-file backup.

## Export

1. Confirm the intended source file's name and ID (`penpair doctor --json`). Pin its ID with `penpair connect --pin-file`.
2. In Penpot, export the file as `.penpot` through the workspace File menu or dashboard. Include shared library assets according to the recovery you need: retaining external references still depends on those libraries being available. Keep the original archive outside public Git and record its hash, source file ID, export date, Penpot version and library export choice.
3. Save a new dated archive; retain prior proven backups until the new one has passed the restore check. Keep a separate copy in storage the owner controls.

An optional command tries the documented full-file API: `penpair backup file <new.penpot>`. It requests `currentFile.export("penpot", "all")`, checks target/revision stability, validates received byte length, and prints the SHA-256. It never replaces an existing archive. The default raw archive budget is 512 KiB to stay within the tested response envelope; larger files and unsupported/failing APIs point to the manual route. The library's `exportFileArchive` accepts an explicit budget up to 16 MiB, whose transport compatibility must be tested before relying on it.

Receiving bytes does not validate the archive's internal format or prove restoration. The command reports `restoreVerified: false`. The previously observed “No matching clause” error is still an unverified live compatibility issue; supplying the documented library-export argument is a candidate to test, not a claimed fix.

## Prove the restore on scratch

- [ ] Export the source using the chosen library mode and record the provenance/hash.
- [ ] Import it into a disposable project/file on the intended target Penpot version. Keep the source and its previous proven backup untouched.
- [ ] Connect from a separate scratch project configuration and pin the imported file ID. Import may change IDs; compare logical names, content, component relationships and token bindings rather than requiring identical imported IDs.
- [ ] Compare pages and frames, node counts, texts, geometry, library components/instances/overrides, images and fonts, token sets, aliases, set order, themes and effective values. Check an instance's relationship to its main component rather than just its appearance.
- [ ] Export representative frames in light/dark and intended viewport/state combinations. Wait for stable exports and look twice; compare visually with the source references.
- [ ] Record the target version, imported file ID, checks, differences and owner review. Mark the candidate proven only when every required check passes.

If export/import fails or content differs, preserve both observations and the previous backup. Use the manual route and investigate the exact version/library mode. Never restore over the live shared file as a test. A successful UI import alone does not establish full fidelity.

[Penpot's export/import documentation](https://help.penpot.app/user-guide/export-import/export-import-files/) describes the manual routes and library choices. Current API documentation may be newer than the pinned runtime; see [compatibility](compatibility.md).

## Optional advisory reminder

Reminders are disabled by default. Opt in through `penpair.config.json`:

```json
"backup": { "noteFile": "design/backup-note.json", "remindAfterDays": 7 }
```

Keep an owner-maintained note containing:

```json
{
  "schemaVersion": 1,
  "fileId": "<pinned source file id>",
  "recordedAt": "<ISO timestamp when the backup evidence was recorded>",
  "archiveSha256": "<64 hexadecimal characters>",
  "restoreVerified": false
}
```

Set `restoreVerified` to true only after the owner completes the scratch comparison. The note can include links to the owner's evidence, but keep credentials and private storage access URLs out of Git. Doctor warns non-blockingly about missing, malformed, mismatched, old or unverified notes. A recent note records an owner's assertion, not independent proof that a backup is current or restorable. The engine never upgrades it after merely receiving archive bytes.

## Current verification limits

The bounded exporter, target/revision guards, refusal to overwrite, error/budget handling and reminder behavior are tested with fake clients and local files. The first live archive export/import round trip on hosted Penpot 2.18.4 remains outstanding. Structural snapshots (D3) will provide review evidence and remain distinct from archives. G3 stays open until its required live restore evidence is recorded.
