# instance

## Overview

Everything about *which* Penpot a project talks to and how it gets there: the
persisted project configuration and its schema, the credential and connection
flow, the guided setup wizard, health checks, and the small process and terminal
helpers those need.

Two shapes of project exist and the code narrows between them throughout: a
local Penpot the project runs itself (`InstanceConfig`) and an external or
hosted Penpot it merely connects to (`ExternalConfig`).

The hard rule here is about the key. The MCP URL carries a personal credential.
It lives in `.env.local` at mode `0600`, never in the configuration file, never
in a log line, never in an error message.

## Interface

**Persisted schema** (`config-schema.ts`)

- `projectConfigSchema` — the JSON Schema (draft 2020-12) for
  `penpair.config.json`, documenting `instance`, `connection.credential` (a file
  or keychain variant), `audit`, `backup`, `file`, `baselines`, `snippets`,
  `adapters`, and `schemaVersion: { const: 1 }`. Properties owned by the
  project's configured adapters are left open.

**Config** (`config.ts`)

- `configFileName` — `"penpair.config.json"`, the only config path this module
  names; `testedPenpotVersion` — the pinned Penpot version.
- `InstanceConfig`, `ExternalConfig`, `ProjectConfig`; `isExternal(config)` and
  `requireLocal(config)` to narrow.
- `validateConfig`, `validateProjectConfig` — runtime validators that throw
  `ConfigError`.
- `readProjectConfig(root)`, `loadConfig(root)`, `loadOptionalConfig(root)`.
- `instancePaths(root, config)` — derives the instance directory,
  `docker-compose.yaml`, `.env` and `backups/`, all under the configured
  directory.
- `composeProjectOf(config)` — the configured compose project, else
  `"penpair-" + instance`.
- `ConfigError` with codes `"missing"`, `"unreadable"`, `"invalid-json"`,
  `"invalid-config"`.

**Connection** (`connection.ts`)

- `frontendUrl(config)`, `endpointIsInstance(origin, config)`,
  `assertEndpointIsInstance(endpoint, config)`.
- `LifecycleError`, and the `Check`, `DoctorCheck` and `DoctorOptions` types.
- `fileIdentityCheck(config, actual)` — a `DoctorCheck` comparing the pinned
  file id against the live one.
- `doctorEditor(config, options)`, `doctorExternal(config, options)` — layered
  `origin` / `transport` / `execution` / `file-pin` health checks inside a
  bounded deadline.

**Connect** (`connect.ts`)

- `keyVariable` — `"PENPAIR_MCP_URL"`.
- `parseMcpAddress(pasted)` — parses a pasted MCP URL, tolerating a leading
  `VARNAME=` and quotes, and never echoing the URL in an error.
- `writeKeyFile(root, url)`, `readKeyFile(root)`, `keyFileCheck(root, runner)`,
  `penpotAddress(config)`, and `ConnectError`.
- `belongsToProject(origin, config)`, `waitForEditor(url, io, options)`.
- `connectProject(root, config, io, options)` — the full flow: resolve the
  credential, validate the origin, write the key file, wait for the editor,
  optionally pin the file id.
- `ConnectIo` — the injected I/O surface (`say`, `askHidden`, `sleep`,
  `openFile`, optional `confirmFile`).

**Setup and init** (`setup.ts`, `init.ts`)

- `setup(root, io, options)` — the guided wizard: choose where Penpot lives,
  init, optionally start a local Penpot, connect, optionally install skills. `SetupIo`, `SetupOptions` (including the
  `installSkills` hook), `SetupResult` and `SetupWhere` are exported alongside.
- `init(root, options, deps)` — writes a configuration for an external profile,
  or delegates to a `LocalProfile` for the Docker case.
- `defaultInstanceName(root)`, `hostedOrigin`, `InitOptions`, `InitResult`.

**Process and terminal** (`runner.ts`, `tty.ts`)

- `Runner`, `nodeRunner` — `spawn` without a shell, supporting `input`,
  `inFile`, `outFile`.
- `askHidden(question)`, `askLine(question, fallback)`, `openInBrowser(url)`.

**Gitignore** (`gitignore.ts`)

- `ensureGitignoreEntry(root, entry, options)`, `ensureKeyFileIgnored(root)`.

## Invariants

- **No secret ever reaches `penpair.config.json`.** The key belongs in
  `.env.local` (mode `0600`), a keychain reference, or an external file
  reference. `PENPAIR_MCP_URL_COMMAND` is refused outright — arbitrary command
  execution is not a credential source.
- **`.env.local` is git-ignored before the write returns.** `writeKeyFile` calls
  `ensureKeyFileIgnored` immediately, so there is no window in which the key sits
  un-ignored. `keyFileCheck` independently re-checks permissions and git's own
  view, and looks for prior exposure in history.
- **`schemaVersion` must be absent or `1`.** Anything else is a `ConfigError`;
  this package carries no migration path, so a schema change is a breaking
  change.
- **The endpoint must belong to the project.** `assertEndpointIsInstance` and
  `belongsToProject` check the MCP origin against the configured Penpot before
  any credential is used. A mismatch is a hard error, and `--any-instance` is the
  only escape.
- **A pinned file is a pin.** With `config.file` set, `connectProject` refuses a
  different file id unless `anyFile` is passed explicitly.
- **Init precedes connect, and the pin is re-checked.** `connectProject`
  re-reads `penpair.config.json` before writing a file pin and throws if the
  configuration changed in between, so a concurrent edit is never silently
  overwritten.
- **Field constraints.** `instance` matches `^[a-z][a-z0-9-]{0,30}$` and must be
  stable, since it names the compose project; `composeProject`, when given,
  matches `^[a-z0-9][a-z0-9_-]*$`; `directory` must be relative; `snippets` and
  `backup.noteFile` may not escape the project root (no absolute paths, no `..`);
  ports fall in `[1024, 65535]` with the frontend and mail ports distinct; an
  external `profile.origin` must be an exact http or https origin with no path.

## Side Effects

- **Reads**: `<root>/penpair.config.json` (and again inside `connectProject`
  before pinning), `<root>/.env.local`, `<root>/.gitignore`.
- **Writes**: `<root>/.env.local` at mode `0600`, where `writeKeyFile`
  replaces only the `PENPAIR_MCP_URL=` line (or appends one) and keeps every
  other line, with the mode re-applied after the write;
  `<root>/.gitignore`, appended; `<root>/penpair.config.json`, on init and when
  adding a file pin, never overwriting an existing pin. The compose file, `.env`
  and `backups/` paths are computed here but written by the `LocalProfile`.
- **Network**: `doctorExternal` fetches the configured origin to check
  reachability; `doctorEditor` and `connectProject` drive caller-supplied
  `io.openFile` and MCP connect callbacks. No code here prints the transport URL.
- **Environment**: reads `PENPAIR_MCP_URL`, `PENPAIR_MCP_URL_FILE` and
  `PENPAIR_MCP_URL_COMMAND` (the last only to reject it).
- **Processes**: `nodeRunner` spawns without a shell; `keyFileCheck` spawns
  `git check-ignore` and `git log` against the project; `openInBrowser` spawns
  the platform opener.
- **Terminal**: `askHidden` puts stdin in raw mode with no echo;
  `askLine` uses readline. Both prompt on **stderr**.
- **Stdout stays clean.** Every user-facing message flows through the injected
  `io.say(line)`; nothing here writes to stdout directly, which is what makes
  `pbpaste | penpair connect` safe.

## Verification

- Run: `pnpm test` from `packages/core`.
