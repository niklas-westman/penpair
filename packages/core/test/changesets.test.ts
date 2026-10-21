import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
// @ts-expect-error Repository automation is plain JavaScript.
import { checkReleaseGroup, syncSourceVersion } from "../../../scripts/lib/changesets.mjs";
// @ts-expect-error Repository automation is plain JavaScript.
import { checkReleaseCommit, isMergedReleasePr, assertVersionIncrease } from "../../../scripts/lib/release-pr.mjs";

const run = promisify(execFile);
const repository = join(import.meta.dirname, "../../..");
const names = ["@penpair/core", "@penpair/web", "penpair"];

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "penpair-changesets-"));
  await mkdir(join(root, ".changeset"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", private: true, packageManager: "pnpm@10.12.1" }));
  await writeFile(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
  const config = JSON.parse(await readFile(join(repository, ".changeset/config.json"), "utf8"));
  config.fixed = [names];
  await writeFile(join(root, ".changeset/config.json"), JSON.stringify(config));
  for (const name of names) {
    const folder = name.split("/").at(-1)!;
    await mkdir(join(root, "packages", folder, "src"), { recursive: true });
    await writeFile(join(root, "packages", folder, "package.json"), JSON.stringify({
      name, version: "1.2.3", scripts: { prepublishOnly: "node ../../scripts/guard-publish.mjs" },
      ...(name === "@penpair/web" ? { dependencies: { "@penpair/core": "workspace:*" } } : {}),
    }));
  }
  await writeFile(join(root, "packages/core/src/version.ts"), 'export const version = "1.2.3";\n');
  return root;
}

async function versionWithCli(root: string): Promise<void> {
  await run(process.execPath, [join(repository, "node_modules/@changesets/cli/bin.js"), "version"], { cwd: root });
}

describe("Changesets whole-family releases", () => {
  it("includes every current package exactly once", async () => {
    expect(await checkReleaseGroup(repository)).toHaveLength(6);
  });

  it("rejects a new package omitted from the group", async () => {
    const root = await fixture();
    await mkdir(join(root, "packages/new"));
    await writeFile(join(root, "packages/new/package.json"), JSON.stringify({ name: "@penpair/new", version: "1.2.3" }));
    await expect(checkReleaseGroup(root)).rejects.toThrow("every package");
  });

  it.each(["linked", "ignore", "fixed"])("rejects unsafe %s configuration", async key => {
    const root = await fixture();
    const file = join(root, ".changeset/config.json");
    const config = JSON.parse(await readFile(file, "utf8"));
    config[key] = key === "ignore" ? [names[0]] : [names, names];
    await writeFile(file, JSON.stringify(config));
    await expect(checkReleaseGroup(root)).rejects.toThrow();
  });

  it("uses the real CLI to bump unchanged members to the highest requested level, consumes notes and synchronizes the constant", async () => {
    const root = await fixture();
    await writeFile(join(root, ".changeset/fix.md"), '---\n"@penpair/core": patch\n---\n\nFix core.\n');
    await writeFile(join(root, ".changeset/feature.md"), '---\n"@penpair/web": minor\n---\n\nAdd feature.\n');
    await versionWithCli(root);
    expect(await syncSourceVersion(root)).toBe("1.3.0");
    expect(await checkReleaseCommit(root, "1.2.3")).toBe("1.3.0");
    for (const folder of ["core", "web", "penpair"]) {
      const json = JSON.parse(await readFile(join(root, "packages", folder, "package.json"), "utf8"));
      expect(json.version).toBe("1.3.0");
      expect(await readFile(join(root, "packages", folder, "CHANGELOG.md"), "utf8")).toContain("1.3.0");
    }
    const web = JSON.parse(await readFile(join(root, "packages/web/package.json"), "utf8"));
    expect(web.dependencies["@penpair/core"]).toBe("workspace:*");
    expect(await readFile(join(root, "packages/core/src/version.ts"), "utf8")).toContain('"1.3.0"');
  });

  it("refuses to repair a partial version change", async () => {
    const root = await fixture();
    const file = join(root, "packages/web/package.json");
    const json = JSON.parse(await readFile(file, "utf8"));
    await writeFile(file, JSON.stringify({ ...json, version: "1.3.0" }));
    await expect(syncSourceVersion(root)).rejects.toThrow("different package versions");
    expect(await readFile(join(root, "packages/core/src/version.ts"), "utf8")).toContain('"1.2.3"');
  });

  it("refuses an unconsumed note on a release commit", async () => {
    const root = await fixture();
    await writeFile(join(root, ".changeset/pending.md"), '---\n"penpair": patch\n---\n\nFix.\n');
    await expect(checkReleaseCommit(root)).rejects.toThrow("pending changesets");
  });

  it("requires increasing stable versions", () => {
    expect(() => assertVersionIncrease("0.1.9", "0.2.0")).not.toThrow();
    for (const version of ["0.1.9", "0.1.8", "0.2.0-beta.1"]) expect(() => assertVersionIncrease("0.1.9", version)).toThrow();
  });

  it("requires a new note for feature changes and reserves version bumps for the release PR", async () => {
    const root = await fixture();
    await cp(join(repository, "scripts"), join(root, "scripts"), { recursive: true });
    const git = (args: string[]) => run("git", args, { cwd: root });
    await git(["init"]);
    await git(["config", "user.name", "Release fixture"]);
    await git(["config", "user.email", "fixture@example.invalid"]);
    await git(["add", "."]);
    await git(["commit", "-m", "Initial"]);
    const base = (await git(["rev-parse", "HEAD"])).stdout.trim();
    const check = (head = "feature") => run(process.execPath, [join(root, "scripts/check-pr-changeset.mjs")], {
      cwd: root, env: { ...process.env, PENPAIR_PR_BASE_SHA: base, PENPAIR_PR_HEAD: head },
    });
    await writeFile(join(root, "packages/core/src/feature.ts"), "export const feature = true;\n");
    await git(["add", "."]);
    await git(["commit", "-m", "Feature"]);
    await expect(check()).rejects.toMatchObject({ stderr: expect.stringContaining("new release note") });
    await writeFile(join(root, ".changeset/fix.md"), '---\n"@penpair/core": patch\n---\n\nFix.\n');
    await git(["add", "."]);
    await git(["commit", "-m", "Note"]);
    await expect(check()).resolves.toBeDefined();
    await versionWithCli(root);
    await syncSourceVersion(root);
    await git(["add", "."]);
    await git(["commit", "-m", "Version"]);
    await expect(check()).rejects.toMatchObject({ stderr: expect.stringContaining("Only the reviewed Changesets version PR") });
    await expect(check("changeset-release/main")).resolves.toBeDefined();
  });
});

describe("merged version PR authorization", () => {
  const pr = {
    merged_at: "2026-10-21T00:00:00Z", merge_commit_sha: "reviewed-sha",
    base: { ref: "main", repo: { full_name: "owner/repo" } },
    head: { ref: "changeset-release/main", repo: { full_name: "owner/repo" } },
  };
  it("accepts only the same-repository merged release PR at the exact commit", () => {
    expect(isMergedReleasePr(pr, "owner/repo", "reviewed-sha")).toBe(true);
    for (const other of [
      { ...pr, merged_at: null }, { ...pr, merge_commit_sha: "other" },
      { ...pr, head: { ...pr.head, ref: "feature" } },
      { ...pr, head: { ...pr.head, repo: { full_name: "fork/repo" } } },
      { ...pr, base: { ...pr.base, ref: "develop" } },
    ]) expect(isMergedReleasePr(other, "owner/repo", "reviewed-sha")).toBeFalsy();
  });

  it("skips ordinary pushes without reading a release version or requesting publication", async () => {
    const { createRequire } = await import("node:module");
    const gate = createRequire(import.meta.url)(join(repository, "scripts/release-gate.cjs"));
    const outputs: Record<string, unknown> = {};
    await gate({
      context: { ref: "refs/heads/main", eventName: "push", sha: "other", repo: { owner: "owner", repo: "repo" } },
      github: { paginate: async () => [pr], rest: { repos: { listPullRequestsAssociatedWithCommit: {} } } },
      core: { info: () => {}, setOutput: (key: string, value: unknown) => { outputs[key] = value; } },
    });
    expect(outputs).toEqual({ publish: "false" });
  });

  it("accepts an exact manual version and rejects mismatched versions and pending notes", async () => {
    const { createRequire } = await import("node:module");
    const gate = createRequire(import.meta.url)(join(repository, "scripts/release-gate.cjs"));
    const root = await fixture();
    const outputs: Record<string, unknown> = {};
    const options = {
      root, github: {},
      context: { ref: "refs/heads/main", eventName: "workflow_dispatch", payload: { inputs: { version: "1.2.3" } } },
      core: { setOutput: (key: string, value: unknown) => { outputs[key] = value; } },
    };
    await gate(options);
    expect(outputs).toEqual({ publish: "true", version: "1.2.3", release_pr: "" });
    options.context.payload.inputs.version = "1.2.4";
    await expect(gate(options)).rejects.toThrow("exactly match");
    options.context.payload.inputs.version = "1.2.3";
    await writeFile(join(root, ".changeset/pending.md"), "---\n---\n\nNo impact.\n");
    await expect(gate(options)).rejects.toThrow("pending changesets");
  });

  it("authorizes an exact merged release commit after independently checking its version", async () => {
    const { createRequire } = await import("node:module");
    const gate = createRequire(import.meta.url)(join(repository, "scripts/release-gate.cjs"));
    const root = await fixture();
    const git = (args: string[]) => run("git", args, { cwd: root });
    await git(["init"]);
    await git(["config", "user.name", "Release fixture"]);
    await git(["config", "user.email", "fixture@example.invalid"]);
    await git(["add", "."]);
    await git(["commit", "-m", "Initial"]);
    await writeFile(join(root, ".changeset/fix.md"), '---\n"@penpair/core": patch\n---\n\nFix.\n');
    await versionWithCli(root);
    await syncSourceVersion(root);
    await git(["add", "."]);
    await git(["commit", "-m", "Version"]);
    const sha = (await git(["rev-parse", "HEAD"])).stdout.trim();
    const outputs: Record<string, unknown> = {};
    await gate({
      root,
      context: { ref: "refs/heads/main", eventName: "push", sha, repo: { owner: "owner", repo: "repo" } },
      github: { paginate: async () => [{ ...pr, number: 42, merge_commit_sha: sha }], rest: { repos: { listPullRequestsAssociatedWithCommit: {} } } },
      core: { setOutput: (key: string, value: unknown) => { outputs[key] = value; } },
    });
    expect(outputs).toEqual({ publish: "true", version: "1.2.4", release_pr: "42" });
  });
});

describe("workflow permission and activation boundaries", () => {
  it("separates version PR writes from OIDC publishing and retains manual recovery", async () => {
    const version = parse(await readFile(join(repository, ".github/workflows/version-pr.yml"), "utf8"));
    const release = parse(await readFile(join(repository, ".github/workflows/release.yml"), "utf8"));
    const ci = parse(await readFile(join(repository, ".github/workflows/ci.yml"), "utf8"));
    expect(version.jobs.version.if).toContain("PENPAIR_RELEASE_AUTOMATION_ENABLED");
    expect(version.jobs.version.permissions["id-token"]).toBeUndefined();
    const action = version.jobs.version.steps.find((step: { uses?: string }) => step.uses?.startsWith("changesets/action@"));
    expect(action.with["github-token"]).toContain("CHANGESETS_PR_TOKEN");
    expect(action.with.version).toBe("pnpm version-packages");
    expect(action.with.publish).toBeUndefined();
    expect(release.on.push.branches).toEqual(["main"]);
    expect(release.on.workflow_dispatch.inputs.continue_release.default).toBe(false);
    expect(release.jobs.gate.if).toContain("PENPAIR_TRUSTED_RELEASE_ENABLED");
    expect(release.jobs.publish.needs).toBe("gate");
    expect(release.jobs.publish.if).toBe("needs.gate.outputs.publish == 'true'");
    expect(release.jobs.publish.environment).toBe("npm-release");
    expect(release.jobs.publish.permissions).toEqual({ contents: "read", "id-token": "write" });
    const publish = release.jobs.publish.steps.at(-1);
    expect(publish.env.PENPAIR_EXPECTED_VERSION).toContain("needs.gate.outputs.version");
    expect(publish.env.NPM_TOKEN).toBeUndefined();
    expect(release.concurrency["cancel-in-progress"]).toBe(false);
    expect(ci.jobs.check.steps.some((step: { run?: string }) => step.run === "node scripts/check-pr-changeset.mjs")).toBe(true);
  });
});
