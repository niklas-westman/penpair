# Capture and approval provenance

Baseline manifests use schema 2. `capturedRevision` identifies the coherent capture run, while each frame has separate `captured` and `approved` records. Those records identify the file, page and frame by immutable ID, revision, encoded-image hash, scale, active theme names, capture time, penpair version, reported Penpot API version and browser user agent when available. A missing environment value is recorded as unknown; the record does not establish that fonts loaded correctly or identify every rendering dependency.

An unchanged reference retains its original approval record. A changed image recaptured without `--update` retains its approved bytes, path, revision and hash, while `captured` describes the new candidate. Legacy images without trustworthy provenance are marked `legacy`; a current revision is never invented for them. Changing a baseline still requires the owner's `--apply --update`. Exact owner words are retained separately in [approval records](approvals.md); manifest provenance alone cannot manufacture consent.

All configured frames must be present and stable. File/page/revision evidence is checked inside exports and across consecutive exports; the complete frame listing is checked again after capture. Intervening changes, failures or cancellation do not publish a new complete manifest. There is no partial-publication mode.

Baseline captures live in immutable `captures/<capture-id>/<baseline-id>.webp` or `.png` generations. New references default to static lossless WebP; existing PNG references keep PNG during ordinary captures and updates. Historical `<baseline-id>.png` files are not renamed or converted implicitly. Read approved image paths from manifest frame `file` fields. Generated Reflection cases already use those paths. `penpair-baselines.json` is the authoritative commit point and is published last with a same-directory atomic rename. Its `casesFile` points to the exact immutable case file for that generation. The root `reflection-cases.json` remains a convenience for existing config imports; when reading it together with a manifest, require matching `captureId`, or follow `casesFile` from the manifest. Independent root files cannot be replaced as one filesystem transaction.

A process interrupted during output may leave an unreferenced capture generation. Previous manifest references remain usable; inspect before cleaning generations. Staging directories are removed on handled errors. This is filesystem publication safety, not a power-loss-proof multi-file transaction or a remote backup.

Standalone PNG export and full-file archive candidates also stage complete bytes before publication. Archives use exclusive creation and never replace an existing file. PNG exports atomically replace the requested output only after a stable result. The export report includes target provenance. Archive restore verification remains a separate scratch import/readback task.

## Baseline encoding and explicit migration

Always follow the manifest's exact `file` path and encoded-byte hash; do not
construct a `.png` or `.webp` path from the baseline ID. PNG and WebP with identical
pixels have different approval identities. An existing reference keeps its
actual encoding even when `baselines.format` or `--format` selects another
format. New references choose explicit `--format`, then config, then WebP.

An explicit `--format webp --migrate-format` previews migration. Publishing it
also requires `--apply --update` and the normal matching exact new-format approval
(or explicit waiver rules). Earlier immutable generations and owner records
remain unchanged. See [approval migration](approvals.md#image-format-and-migration).

WebP conversion is lossless and independently verifies decoded RGBA bytes,
dimensions and ICC preservation. Animation, unsupported bit depth, excessive
size or pixel/metadata mismatch refuses conversion and preserves the previous
manifest. Public PNG exports, shot generations and pinned release-source PNG
renders retain their existing format; baseline defaults do not redefine those
artifacts.
