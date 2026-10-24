import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
// @ts-expect-error Repository release helper is plain JavaScript.
import { releaseExclusions, releaseTargets } from "../../../scripts/lib/release-exclusions.mjs";

const run = promisify(execFile);
const repository = join(import.meta.dirname, "../../..");

describe("owner-approved short-name exception", () => {
  it("defaults to the complete family and accepts only explicit booleans", () => {
    for (const value of [
      undefined,
      "",
      "false",
    ]) {
      expect(releaseExclusions(value)).toEqual([]);
    }
    expect(releaseExclusions("true")).toEqual([
      "penpair",
    ]);
    for (const value of [
      "TRUE",
      "1",
      "penpair",
      "@penpair/core",
      "true,false",
    ]) {
      expect(() => releaseExclusions(value)).toThrow();
    }
  });

  it("refuses exclusions that would break a required package dependency", () => {
    for (const field of [
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
    ]) {
      expect(() =>
        releaseTargets(
          [
            {
              name: "@penpair/web",
              json: {
                [field]: {
                  penpair: "workspace:*",
                },
              },
            },
          ],
          "true",
        ),
      ).toThrow("depends on excluded");
    }
  });

  it("publishes exactly five with explicit reporting, retains interruption guards, then catches up the wrapper when restored", async () => {
    const root = await mkdtemp(join(tmpdir(), "penpair-release-exception-"));
    await cp(join(repository, "scripts"), join(root, "scripts"), {
      recursive: true,
    });
    for (const folder of [
      "core",
      "web",
      "docker",
      "marwes-ui",
      "reflection-check",
      "penpair",
    ]) {
      await mkdir(join(root, "packages", folder, "src"), {
        recursive: true,
      });
      await cp(
        join(repository, "packages", folder, "package.json"),
        join(root, "packages", folder, "package.json"),
      );
    }
    await cp(
      join(repository, "packages/core/src/version.ts"),
      join(root, "packages/core/src/version.ts"),
    );
    const version = JSON.parse(
      await readFile(join(root, "packages/core/package.json"), "utf8"),
    ).version;
    const bin = join(root, "bin");
    await mkdir(bin);
    const registry = join(root, "registry.json");
    const queries = join(root, "queries.jsonl");
    await writeFile(registry, "");
    const registryState = async () =>
      (await readFile(registry, "utf8"))
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    const common = `const fs=require('node:fs'),path=require('node:path'); const args=process.argv.slice(2); const registry=process.env.FAKE_REGISTRY; const names=()=>fs.readFileSync(registry,'utf8').split(String.fromCharCode(10)).filter(Boolean).map(line=>JSON.parse(line));`;
    const tools: Record<string, string> = {
      git: `if(args[0]==='show')console.log(JSON.stringify({version:1}));else if(args[0]==='rev-parse')console.log(args.includes('--abbrev-ref')?'main':'a'.repeat(40));`,
      pnpm: `if(args[0]==='pack'){const folder=args[args.indexOf('--pack-destination')+1];const pkg=JSON.parse(fs.readFileSync('package.json'));fs.writeFileSync(path.join(folder,'fixture.tgz'),JSON.stringify(pkg));}else if(args[0]==='release'){const child=require('node:child_process').spawnSync(process.execPath,[path.join(process.cwd(),'scripts/release.mjs'),...args.slice(1)],{stdio:'inherit',env:process.env});process.exitCode=child.status??1;}`,
      npm: `if(args[0]==='--version')console.log('11.5.1');else if(args[0]==='view'){fs.appendFileSync(process.env.FAKE_QUERIES,JSON.stringify(args[1])+String.fromCharCode(10));const published=names();const latest=args[2]==='dist-tags.latest';if(published.some(name=>args[1]===(latest?name:name+'@'+process.env.FAKE_VERSION)))console.log(JSON.stringify(latest?(process.env.FAKE_LATEST_VERSION||process.env.FAKE_VERSION):process.env.FAKE_VERSION));else{console.error('E404');process.exitCode=1;}}else if(args[0]==='publish'){const pkg=JSON.parse(fs.readFileSync(args[1]));if(pkg.name===process.env.FAKE_FAIL_PACKAGE){console.error('offline publish rejection');process.exitCode=1;}else fs.appendFileSync(registry,JSON.stringify(pkg.name)+String.fromCharCode(10));}`,
    };
    for (const [name, script] of Object.entries(tools)) {
      await writeFile(join(bin, name), `#!${process.execPath}\n${common}\n${script}\n`, {
        mode: 0o755,
      });
    }
    const summary = join(root, "summary.md");
    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_REGISTRY: registry,
      FAKE_QUERIES: queries,
      FAKE_VERSION: version,
      FAKE_LATEST_VERSION: "",
      FAKE_FAIL_PACKAGE: "",
      GITHUB_ACTIONS: "true",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_REF: "refs/heads/main",
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://fake.invalid",
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "fake-only",
      PENPAIR_RELEASE_ENVIRONMENT: "npm-release",
      PENPAIR_RELEASE_EXCLUDE_PENPAIR: "true",
      PENPAIR_EXPECTED_VERSION: version,
      PENPAIR_RELEASE_SHA: "a".repeat(40),
      PENPAIR_CONTINUE_RELEASE: "false",
      GITHUB_STEP_SUMMARY: summary,
      NODE_AUTH_TOKEN: "",
      NPM_TOKEN: "",
    };
    // Use the actual entrypoint; only git/pnpm/npm are local fake executables.
    const publish = (extra: string[] = [], exception = "true") =>
      run(
        process.execPath,
        [
          join(root, "scripts/release.mjs"),
          "--publish",
          "--trusted-publishing",
          "--release-sha",
          "a".repeat(40),
          "--confirm-version",
          version,
          ...extra,
        ],
        {
          cwd: root,
          env: {
            ...env,
            PENPAIR_RELEASE_EXCLUDE_PENPAIR: exception,
          },
        },
      );
    const first = await run(
      process.execPath,
      [
        join(root, "scripts/ci-release.mjs"),
      ],
      {
        cwd: root,
        env,
      },
    );
    expect(await readFile(summary, "utf8")).toContain("All required packages verified");
    const published = await registryState();
    expect(published).toHaveLength(5);
    expect(published).not.toContain("penpair");
    expect(first.stdout).toContain("full family is not complete");
    expect(first.stdout).toContain("Published all 5 required packages");
    expect(
      (await readFile(queries, "utf8"))
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    ).not.toContain(`penpair@${version}`);
    await writeFile(registry, JSON.stringify(published[0]) + "\n");
    await expect(publish()).rejects.toMatchObject({
      stderr: expect.stringContaining("interrupted release"),
    });
    await publish([
      "--continue",
    ]);
    // The protected CI wrapper also records the exception when publication fails.
    await expect(
      run(
        process.execPath,
        [
          join(root, "scripts/ci-release.mjs"),
        ],
        {
          cwd: root,
          env,
        },
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("already published"),
    });
    expect(await readFile(summary, "utf8")).toContain("penpair is intentionally excluded");
    expect(await readFile(summary, "utf8")).toContain(
      "Release failed; do not assume required packages are complete",
    );
    await expect(publish([], "false")).rejects.toMatchObject({
      stderr: expect.stringContaining("interrupted release"),
    });
    const restored = await publish(
      [
        "--continue",
      ],
      "false",
    );
    expect(await registryState()).toHaveLength(6);
    expect(restored.stdout).toContain("All 6 packages are published");
    env.FAKE_LATEST_VERSION = "999.0.0";
    await expect(
      publish(
        [
          "--continue",
        ],
        "false",
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("refusing to move latest backward"),
    });
    expect(await registryState()).toHaveLength(6);
    env.FAKE_LATEST_VERSION = "";
    env.FAKE_FAIL_PACKAGE = "@penpair/core";
    await writeFile(registry, "");
    await expect(publish()).rejects.toMatchObject({
      stderr: expect.stringContaining("All in-flight uploads have finished"),
    });
    const partial = await registryState();
    expect(partial).not.toContain("@penpair/core");
    expect(partial.length).toBeGreaterThanOrEqual(2);
    expect(partial.length).toBeLessThanOrEqual(4);
    env.FAKE_FAIL_PACKAGE = "";
    await expect(publish()).rejects.toMatchObject({
      stderr: expect.stringContaining("interrupted release"),
    });
    await publish([
      "--continue",
    ]);
    const recovered = await registryState();
    expect(recovered).toHaveLength(5);
    expect(new Set(recovered).size).toBe(5);
  }, 30000);
});
