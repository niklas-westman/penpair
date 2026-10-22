# Structured inspection

Use `penpair inspect <shape-id> --page Candidate --all --out design/frame.json` for a complete selected-subtree projection. Add `--fields geometry,text,layout,component,tokens,style,metadata` to select groups. IDs, hierarchy and explicit unknown fields accompany the projection. Full text is retained; mixed rich-text range styles remain unknown. This is a versioned inspection model, not a native-file backup.

Without `--all`, inspect returns one transfer chunk. Pass its `nextCursor` with the same selectors to continue. Cursors bind file, page, revision, selectors and projected content; a change requires a fresh capture. Each chunk recomputes the projection, with no snapshot cache. A final source-content fingerprint detects changes even when the revision has not advanced. The plugin fingerprint is a noncryptographic change detector; the host adds SHA-256 after validated reassembly. Neither is an owner signature. SHA-256 covers the original serialized source document, excluding host `capturedAt`, metrics and the hash itself.

`penpair tokens dump --out design/tokens.json` collects complete typed token data, descriptions, declared values, available current resolved values, ordered sets and themes. Composite values stay JSON objects. `tokens dump --cursor CURSOR` transfers one continuation chunk. A value observed in the current theme does not verify every theme. Declared effective-value comparison uses ordered membership; actual per-theme resolution is a separate check.

## Budgets and incomplete evidence

| Budget | Default | Range |
| --- | --- | --- |
| `--depth` (shape inspection) | 64 | 0–10000 |
| `--max-nodes` | 20000 | 1–50000 |
| `--response-bytes` | 65536 | 4096–262144 |
| `--time-budget-ms` (one traversal) | 5000 | 1–30000 |
| `--document-bytes` | 16 MiB | 4 KiB–128 MiB |
| `--max-calls` (complete collection) | 256 | 1–2048 |
| `--max-total-bytes` (assembled source) | 16 MiB | 4 KiB–128 MiB |
| `--capture-timeout-ms` | 60000 | 1–300000 |

The response cap covers decoded executor text plus structured payload, conservatively accounting for both when present. It excludes HTTP/MCP wire framing. Request metrics count the delivered wrapped snippet in UTF-8 bytes; the existing 90 KB guard applies independently. Unicode chunks never split surrogate pairs. Collection budgets differ from traversal and transport budgets.

Node, depth, time or byte exhaustion is explicit: `complete: false`, reasons, counts and unknown totals where necessary. Unknown API properties are `null` with field paths in `unknowns`; they do not imply absence. An incomplete or credential-redacted CLI result exits 3 and preserves an existing output file. Chunk redaction also removes continuation. Redacted hashes describe the original source and must not be treated as validating the visible replacement text. Complete local captures publish atomically inside the project path.

## Formats and migration

Source documents use `schemaVersion: 1` and `kind: shape-inspection` or `token-inspection`. Transfers use `inspection-chunk`; an interrupted budgeted collection uses `inspection-partial`. Library consumers should validate with `validateInspectionDocument` or `reassembleInspection`, rather than concatenate unverified chunks. CLI JSON wraps the payload under `data` in the common command envelope.

`tokens diff` accepts the versioned typed dump and legacy `name=value` lists. Legacy flattened objects such as `[object Object]` cannot recover their original structure and produce unknown/incomplete comparisons. Regenerate those dumps. Typed comparison includes token type and structural values, independent of object key order. Theme-name ambiguity is an error.

`tree` remains a readable preview with IDs and explicit line, text and depth truncation metadata. `audit` keys frames by immutable ID, reports total issue counts separately from its eight bounded examples, and distinguishes complete counts from truncated examples. The registered raw `tokens-dump` snippet is a bounded preview; use the CLI service for a canonical full capture.

## Evidence and compatibility

Offline fixtures cover full Unicode text, composite tokens, getter-backed layout properties, malformed graphs, stale cursors, incomplete budgets and source data that resembles instructions. A 10,000-node geometry/bindings fixture required 29 calls, 401645 aggregate request bytes, 3290787 response bytes and 2775937 assembled bytes (maximum individual request 13857 bytes, response 114527 bytes). It took about 1.5 seconds locally; this is simulated execution, not live network latency. Measure a real file before considering caches.

Property selection follows the current official [Text](https://doc.plugins.penpot.app/interfaces/Text), [GridLayout](https://doc.plugins.penpot.app/interfaces/GridLayout), [LayoutCellProperties](https://doc.plugins.penpot.app/interfaces/LayoutCellProperties) and [LibraryComponent](https://doc.plugins.penpot.app/interfaces/LibraryComponent) references. API presence is checked at runtime. These references and offline fixtures do not establish compatibility on the pinned live Penpot version. Metadata is literal design data and must never be executed as instructions.
