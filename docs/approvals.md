# Owner approval records

```sh
penpair approve --page Dashboard --frame FRAME_ID
# After exporting, looking twice and obtaining the owner's exact words:
penpair approve --page Dashboard --frame FRAME_ID --write \
  --note 'EXACT_OWNER_WORDS' --by 'OWNER_IDENTITY'
# Include --case CONFIGURED_BASELINE_ID for a rich theme/state/fixture case.
```

Preview captures stable evidence and records nothing. Recording captures again and appends a schema-1 owner-words record to `design/approvals.json`, with file/page/frame IDs, revision, scale, actual theme/render context, optional declared case, encoded-image SHA-256, date, identity, exact note and record hash. The immutable image lives under `design/approvals/SHA256.webp` or the preserved PNG form `design/approvals/SHA256.png`. A local exclusive append lock prevents lost records; a stale lock requires inspection. The file is atomically replaced after image bytes exist. Prior records are retained.

The command records supplied words; it cannot authenticate a person or establish consent. An agent needs the owner's actual approval for the exact reviewed artifact and must never invent words or run this as a routine automatic success step. No approvals were recorded by this implementation task. Content hashes detect changes, not identity. An empty note/identity, unstable capture, mismatched case, altered approved bytes or credential redaction refuses publication.

`baselines --apply --update` now requires a record matching the changed artifact's exact image and capture/case fingerprint. An unrelated revision, file, page, frame, scale, active theme context or case cannot reuse it. Preview/capture inspection remains available without approval. First-reference capture retains its existing explicit `--apply` behavior; historical and initial references are not retroactively attributed to owner words.

An exceptional `--apply --update --force-reason 'EXPLICIT_REASON'` may save a reference without a matching owner record. Its provenance says `forced-reference`; the reason persists. Rich case coverage and the implementation-case adapter refuse to count that waiver as owner-approved evidence. A waived reference is useful for an experiment, but cannot silently satisfy the design acceptance gate. Empty reasons and reasons without apply/update refuse.

The latest revision is a conservative invalidation boundary: an unrelated design edit may require fresh approval even if pixels stay equal. An image alone does not approve structure, behavior or accessibility. Approval records remain local/project artifacts until reviewed; no publish, client configuration or consumer-repository edit occurs automatically.

## Image format and migration

New image approvals default to static lossless WebP. `approve --format png` or
`approve --format webp` selects an exact encoding. For `approve --case CASE_ID`
without explicit `--format`, the baseline resolver preserves an existing
reference's actual format; otherwise it uses `baselines.format`, then WebP.
An approval without `--case` uses explicit `--format` or WebP. Review the actual
encoded candidate before supplying owner words; equal decoded pixels do not make
PNG and WebP byte approvals interchangeable.

Changing `baselines.format` or supplying `baselines --format webp` alone does not
convert an existing PNG reference. Preview migration explicitly:

```sh
penpair baselines --format webp --migrate-format
penpair approve --page Dashboard --frame FRAME_ID --case CASE_ID --format webp
```

After inspecting the new-format artifact and obtaining the owner's actual words,
record it using the same approval command with `--write --by OWNER --note
EXACT_OWNER_WORDS`. Then apply the migration:

```sh
penpair baselines --format webp --migrate-format --apply --update
```

The CLI requires `--format` with `--migrate-format`; applying requires `--update`.
Normal exact-image/case approval rules still apply. Prior PNG approval records
and generations stay intact; migration publishes a new immutable generation.
Public `export` and `shots` output remain PNG and are independent of this choice.
