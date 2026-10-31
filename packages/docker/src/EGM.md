# @penpair/docker Source

## Overview

This is the implementation of `@penpair/docker`: the same `penpair` command as
`@penpair/web`, plus Penpot running in Docker on the user's own machine, one
instance per project. Its architectural job is to be the single place that knows
anything about Docker. `@penpair/core` declares the plug-in contract
`LocalProfile` in `packages/core/src/local-profile.ts` and knows nothing about
Docker; this directory satisfies that contract with `dockerProfile` and hands it
to `runCli`. Everything else — scaffolding an instance, generating secrets,
rendering a compose file, lifecycle, backup and restore — is support for those
nine methods.

## Interface

### Entry points

- `cli.ts` — executable module, no exports. Built to `dist/cli.js`, published as
  the `penpair` bin. Calls
  `runCli(process.argv.slice(2), { local: dockerProfile })` and assigns the
  result to `process.exitCode`.
- `index.ts` — the package barrel. `export * from "@penpair/core"` so an
  adopting project imports from one place, plus the exports below.

### The plug-in point

- `dockerProfile: LocalProfile` (`index.ts`) — the object the command is started
  with. Supplies `preflight` (inline: `docker version --format
  {{.Server.Version}}`, throwing `ConfigError` with start-Docker-Desktop guidance
  on a non-zero exit), `init: initDocker`, and `up`, `down`, `status`, `doctor`,
  `backup`, `verifyBackup`, `restore` from `lifecycle.ts`.

### Scaffolding — `init.ts`

- `initDocker(root, options?)` — writes `penpair.config.json`, the compose file
  and the `.env` secrets file; the `LocalProfile.init` implementation. Throws
  `ConfigError` for a project that uses an external Penpot.
- `isPortFree(port, host?)` — TCP probe.
- `firstFreePort(from, avoid?, free?)` — scans up to 200 ports from `from`;
  throws if none is free.

### Lifecycle — `lifecycle.ts`

- `up(c)`, `down(c)`, `status(c)`, `doctor(c, options?)` (returns early when
  Docker does not answer; otherwise checks the secrets file, containers,
  frontend and backend, and with `options.mcp` the editor and plugin), `backup(c, label?)`,
  `verifyBackup(c, directory)`, `restore(c, directory, options)`.
- `composeArgs(c, ...rest)` — builds the `docker compose` argument array
  (project name, `-f`, `--env-file`) for one instance.
- `parseComposePs(output)` — pure parser from `docker compose ps --format json`
  to `ServiceState[]`.
- `readyUrl(config)` — derives the `/readyz` health URL.
- `waitForHttp(c, url, timeoutMs, stepMs)` — polls until status < 500 or
  timeout; `fetch` and `sleep` are injected through the context.

### Secrets — `secrets.ts`

- `generateSecrets()` — `{ secretKey, databasePassword }` from 64 and 24 random
  bytes, base64url.
- `renderEnv(config, secrets)` — the `.env` text (`PENPOT_VERSION`,
  `PENPOT_SECRET_KEY`, `PENPOT_DATABASE_PASSWORD`).
- `writeSecretFile(file, content, overwrite?)` — writes at mode `0o600` and
  refuses to overwrite by default (returns `false` on `EEXIST`).
- `readEnvValues(file)` — parses `KEY=value` lines into a record.

### Template — `template.ts`

- `renderCompose(config)` — pure function returning the whole compose YAML for
  an instance; images pinned to `penpotapp/<service>:<version>`, public ports
  bound to `127.0.0.1`.

No subdirectories. The package's tests live in `../test` and are outside this
contract.

## Invariants

- **Docker knowledge stops here.** `@penpair/core` must never gain Docker code
  or a dependency on this package; `packages/core/test/boundary.test.ts` fails
  the build if it does (it rejects core files named `compose`, `lifecycle`,
  `secrets` or `template`). The dependency goes one way only, and `LocalProfile`
  is imported *from* the core, never redefined here.
- **`runCli` is reached only through the core's public entry** — no deep
  `@penpair/core/dist/...` import. Asserted by the same boundary test.
- **`preflight` guards the lifecycle, with two deliberate exceptions.** The core
  calls it in `setup` and again in `cli-main.ts` before dispatching `up`, `down`,
  `status`, `backup`, `backup verify` and `restore`, so a failing Docker check
  aborts rather than letting a later method run against a dead daemon. It does
  **not** run first in every sense: `setup` calls `init` before it, because
  scaffolding writes files and needs no daemon; and `doctor` is exempt, because
  diagnosing a stopped daemon is its job and it gates on `docker version` itself.
- **Init is idempotent in the directions that matter.** `penpair.config.json` is
  written only when absent, the compose file is regenerated on every init, and
  the `.env` is never replaced: `initDocker` has no overwrite option and calls
  `writeSecretFile` with its default of not overwriting. Only
  `writeSecretFile` itself accepts `overwrite`.
- **`.env` stays mode `0o600` and uncommitted.** `doctor` checks the mode and
  the presence of both secret keys. Secrets reach Docker only through
  `--env-file`, never as command-line arguments and never in log output.
- **`PENPOT_DATABASE_PASSWORD` must not change while the Postgres volume
  exists.** Rotating it orphans the data.
- **`restore` is explicit and guarded.** It requires `options.yes === true`
  (otherwise `LifecycleError` before anything is touched), verifies every file
  against the manifest checksums first, and takes a `pre-restore` safety backup
  unless `skipSafetyBackup` is set. A checksum mismatch returns a failure without
  mutating the instance.
- **One naming scheme for an instance.** The compose project name comes from
  `composeProjectOf(config)`, the assets volume is
  `<composeProject>_penpot_assets`, and the instance directory defaults to
  `.penpair`. Never hand-build a `docker compose` invocation or a volume name for
  the same instance — divergent project names create a second, invisible stack.
- **Container resolution is required, not assumed.** `backup` throws
  `LifecycleError` when `penpot-postgres` or `penpot-backend` cannot be
  resolved; `restore` resolves only `penpot-postgres`, and its `pre-restore`
  safety backup tolerates a "not running" `LifecycleError` and carries on.
- **`verifyBackup` never touches the live instance.** It restores into a
  throwaway `postgres:15` container named `penpair-verify-<6 random chars>` and
  removes it in a `finally` block regardless of outcome.
- **Shelling out goes through the injected runner and fetch**, which is what
  makes the lifecycle testable; do not call `child_process` or global `fetch`
  directly in new code.
- **Pin the Penpot version.** Images are pinned in `renderCompose`; bumping the
  version requires running the smoke test first.

## Side Effects

### Disk

- `{root}/penpair.config.json` — written when absent; this one is committed.
- `{root}/{config.directory}/docker-compose.yaml` — generated, gitignored,
  overwritten on re-init.
- `{root}/{config.directory}/.env` — mode `0o600`, carries both secrets, never
  overwritten by `initDocker`.
- `{root}/.gitignore` — appended to when `options.gitignore` is set (the
  instance directory, and the key file via `ensureKeyFileIgnored`).
- `{root}/{config.directory}/backups/{ISO-timestamp}[-label]/` — `db.dump`
  (`pg_dump -Fc`), `assets.tgz` (`tar czf` of `/opt/data/assets`) and
  `manifest.json`.

### Docker and child processes

- `docker version --format {{.Server.Version}}` (preflight).
- `docker compose -p <project> -f <compose> --env-file <env>` with `up -d`,
  `down`, `ps --all --format json`, `ps -q <service>`, and `stop` /
  `up -d` of individual services during restore.
- `docker exec <postgres> pg_dump -U penpot -d penpot -Fc` and
  `docker exec <backend> tar czf - -C /opt/data/assets .`, both piped to files.
- Restore: `psql -c 'drop database penpot with (force)'` then `create database
  penpot`, `pg_restore -U penpot -d penpot --no-owner` from stdin, and a
  `docker run --rm` against `<composeProject>_penpot_assets` that deletes the
  volume contents before untarring. **This is destructive by design** — it is
  why `options.yes` and the checksum gate exist.
- `verifyBackup`: `docker run -d --name penpair-verify-<rand> … postgres:15`,
  polled `pg_isready`, `pg_restore`, a counting `psql -tAc`, then
  `docker rm -f`; plus a local `tar tzf` to count asset entries.

### Network

- `up` polls `GET {frontendUrl}/readyz` every 3 s for up to 240 s.
- `status` probes `GET {frontendUrl}` and `GET {frontendUrl}/readyz` once each.

### Process

- `cli.ts` sets `process.exitCode`.

## Verification

- Run: `pnpm test` in
  `packages/docker`
  (`vitest run`, covering `../test/init.test.ts`, `../test/lifecycle.test.ts`
  and `../test/template.test.ts`).
- Types: `pnpm typecheck` in the same directory — this is what catches a
  `dockerProfile` that no longer satisfies `LocalProfile`.
- The boundary and version invariants are enforced from the core: `pnpm test` in
  `packages/core`.
- Before any Penpot version bump: the repository smoke test.
