import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error Repository automation is plain JavaScript.
import { assertReleaseSnapshot } from "../../../scripts/lib/release-snapshot.mjs";

const repository = join(import.meta.dirname, "../../..");
const gate = createRequire(import.meta.url)(join(repository, "scripts/release-gate.cjs"));
const roots: string[] = [];

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  }).trim();
}

async function setVersion(root: string, version: string): Promise<void> {
  await writeFile(
    join(root, "packages/core/package.json"),
    JSON.stringify({
      name: "@penpair/core",
      version,
      scripts: {
        prepublishOnly: "node ../../scripts/guard-publish.mjs",
      },
    }),
  );
  await writeFile(
    join(root, "packages/core/src/version.ts"),
    `export const version = "${version}";\n`,
  );
}

async function history({
  releaseVersion = "1.2.4",
  pending = false,
  protocolVersion = 1,
}: {
  releaseVersion?: string;
  pending?: boolean;
  protocolVersion?: unknown;
} = {}): Promise<{
  root: string;
  releaseSha: string;
  mainSha: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "penpair-release-snapshot-"));
  roots.push(root);
  await mkdir(join(root, "packages/core/src"), {
    recursive: true,
  });
  await mkdir(join(root, ".changeset"));
  await writeFile(
    join(root, ".changeset/config.json"),
    JSON.stringify({
      fixed: [
        [
          "@penpair/core",
        ],
      ],
      linked: [],
      ignore: [],
      baseBranch: "main",
      access: "public",
    }),
  );
  await setVersion(root, "1.2.3");
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Release fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  git(root, "add", ".");
  git(root, "commit", "-m", "Before release");
  await setVersion(root, releaseVersion);
  await mkdir(join(root, "scripts"));
  if (protocolVersion !== null) {
    await writeFile(
      join(root, "scripts/release-protocol.json"),
      JSON.stringify({
        version: protocolVersion,
      }),
    );
  }
  if (pending) {
    await writeFile(join(root, ".changeset/pending.md"), "---\n---\n\nPending note.\n");
  }
  // Allow an empty unchanged-version commit to exercise the version guard.
  git(root, "add", ".");
  git(root, "commit", "--allow-empty", "-m", "Reviewed release");
  const releaseSha = git(root, "rev-parse", "HEAD");
  // The controller is current even when a historical release uses an old protocol.
  await writeFile(
    join(root, "scripts/release-protocol.json"),
    JSON.stringify({
      version: 1,
    }),
  );
  await writeFile(
    join(root, ".changeset/new-feature.md"),
    '---\n"@penpair/core": patch\n---\n\nNew feature.\n',
  );
  await writeFile(join(root, "packages/core/src/feature.ts"), "export const feature = true;\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "Main advances with pending feature");
  const mainSha = git(root, "rev-parse", "HEAD");
  git(root, "update-ref", "refs/remotes/origin/main", mainSha);
  return {
    root,
    releaseSha,
    mainSha,
  };
}

function gateOptions(root: string, releaseSha: string, eventName = "push") {
  const outputs: Record<string, unknown> = {};
  const requests: string[] = [];
  const pullRequest = {
    number: 42,
    merged_at: "2026-10-24T00:00:00Z",
    merge_commit_sha: releaseSha,
    base: {
      ref: "main",
      repo: {
        full_name: "owner/repo",
      },
    },
    head: {
      ref: "changeset-release/main",
      repo: {
        full_name: "owner/repo",
      },
    },
  };
  const options = {
    root,
    context: {
      ref: "refs/heads/main",
      eventName,
      sha: releaseSha,
      repo: {
        owner: "owner",
        repo: "repo",
      },
      payload: {
        inputs: {
          version: "1.2.4",
          release_sha: "",
        },
      },
    },
    github: {
      paginate: async (
        _endpoint: unknown,
        request: {
          commit_sha: string;
        },
      ) => {
        requests.push(request.commit_sha);
        return [
          pullRequest,
        ];
      },
      rest: {
        repos: {
          listPullRequestsAssociatedWithCommit: {},
        },
      },
    },
    core: {
      info: () => {},
      setOutput: (key: string, value: unknown) => {
        outputs[key] = value;
      },
    },
  };
  return {
    options,
    outputs,
    requests,
    pullRequest,
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe("reviewed release snapshots", () => {
  it("accepts a detached reviewed snapshot after main advances", async () => {
    const { root, releaseSha } = await history();
    git(root, "checkout", "--detach", releaseSha);
    expect(() => assertReleaseSnapshot(root, releaseSha)).not.toThrow();
  });

  it("rejects malformed, missing, mismatched and non-main commits", async () => {
    const { root, releaseSha, mainSha } = await history();
    for (const sha of [
      "main",
      releaseSha.slice(0, 7),
      "0".repeat(40),
      undefined,
    ]) {
      expect(() => assertReleaseSnapshot(root, sha)).toThrow();
    }
    expect(() => assertReleaseSnapshot(root, releaseSha)).toThrow("HEAD must exactly match");
    git(root, "checkout", "--detach", releaseSha);
    await writeFile(join(root, "off-main.txt"), "unreviewed\n");
    git(root, "add", ".");
    git(root, "commit", "-m", "Unmerged release");
    const unmergedSha = git(root, "rev-parse", "HEAD");
    expect(() => assertReleaseSnapshot(root, unmergedSha)).toThrow("origin/main history");
    git(root, "checkout", "--detach", mainSha);
  });

  it("pins automatic releases to the reviewed commit despite newer pending notes", async () => {
    const { root, releaseSha } = await history();
    const { options, outputs, requests } = gateOptions(root, releaseSha);
    await gate(options);
    expect(requests).toEqual([
      releaseSha,
    ]);
    expect(outputs).toEqual({
      publish: "true",
      version: "1.2.4",
      release_pr: "42",
      release_sha: releaseSha,
    });
    expect(git(root, "rev-parse", "HEAD")).toBe(releaseSha);
  });

  it("recovers an explicit historical SHA from a newer manual trigger", async () => {
    const { root, releaseSha, mainSha } = await history();
    const { options, outputs, requests } = gateOptions(root, releaseSha, "workflow_dispatch");
    options.context.sha = mainSha;
    options.context.payload.inputs.release_sha = releaseSha;
    await gate(options);
    expect(requests).toEqual([
      releaseSha,
    ]);
    expect(outputs.release_sha).toBe(releaseSha);
    expect(outputs.version).toBe("1.2.4");
  });

  it("defaults manual dispatch to its triggering SHA and checks the exact version", async () => {
    const { root, releaseSha } = await history();
    const { options, outputs } = gateOptions(root, releaseSha, "workflow_dispatch");
    await gate(options);
    expect(outputs.release_sha).toBe(releaseSha);
    options.context.payload.inputs.version = "1.2.5";
    await expect(gate(options)).rejects.toThrow("exactly match");
  });

  it.each([
    "push",
    "workflow_dispatch",
  ])("requires same-repository PR authorization for %s", async (eventName) => {
    const { root, releaseSha, mainSha } = await history();
    const { options, outputs, pullRequest } = gateOptions(root, releaseSha, eventName);
    pullRequest.head.repo.full_name = "fork/repo";
    if (eventName === "push") {
      await gate(options);
      expect(outputs).toEqual({
        publish: "false",
      });
    } else {
      await expect(gate(options)).rejects.toThrow("same-repository release PR");
    }
    expect(git(root, "rev-parse", "HEAD")).toBe(mainSha);
  });

  it("rejects invalid input before API calls or checkout", async () => {
    const { root, releaseSha, mainSha } = await history();
    const { options, requests } = gateOptions(root, releaseSha, "workflow_dispatch");
    options.context.payload.inputs.release_sha = "main";
    await expect(gate(options)).rejects.toThrow("full 40-character");
    expect(requests).toEqual([]);
    expect(git(root, "rev-parse", "HEAD")).toBe(mainSha);
  });

  it("rejects pending notes in the selected release snapshot", async () => {
    const { root, releaseSha } = await history({
      pending: true,
    });
    const { options } = gateOptions(root, releaseSha, "workflow_dispatch");
    await expect(gate(options)).rejects.toThrow("pending changesets");
  });

  it.each([
    null,
    0,
    2,
    "1",
  ])("rejects a historical snapshot with protocol %s before checkout", async (protocolVersion) => {
    const { root, releaseSha, mainSha } = await history({
      protocolVersion,
    });
    const { options, outputs } = gateOptions(root, releaseSha, "workflow_dispatch");
    await expect(gate(options)).rejects.toThrow(/protocol/);
    expect(outputs).toEqual({});
    expect(git(root, "rev-parse", "HEAD")).toBe(mainSha);
  });

  it("requires the selected release version to increase from its first parent", async () => {
    const { root, releaseSha } = await history({
      releaseVersion: "1.2.3",
    });
    const { options } = gateOptions(root, releaseSha, "workflow_dispatch");
    await expect(gate(options)).rejects.toThrow("higher than");
  });
});
