// GitHub API evidence is checked before the publishing job can request OIDC.
module.exports = async function releaseGate({ github, context, core, root = process.cwd() }) {
  const { execFileSync } = require("node:child_process");
  const { checkReleaseCommit, isMergedReleasePr } = await import("./lib/release-pr.mjs");
  const { assertReleaseHistory, assertReleaseSnapshot, assertReleaseProtocol } = await import(
    "./lib/release-snapshot.mjs"
  );
  if (context.ref !== "refs/heads/main") {
    throw new Error("Release only from main");
  }
  if (context.eventName !== "push" && context.eventName !== "workflow_dispatch") {
    throw new Error("Unsupported release event");
  }

  const manual = context.eventName === "workflow_dispatch";
  const releaseSha = (manual && context.payload.inputs?.release_sha) || context.sha;
  assertReleaseHistory(root, releaseSha);

  const prs = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit, {
    ...context.repo,
    commit_sha: releaseSha,
    per_page: 100,
  });
  const pr = prs.find((item) =>
    isMergedReleasePr(item, `${context.repo.owner}/${context.repo.repo}`, releaseSha.toLowerCase()),
  );
  if (!pr) {
    if (manual) {
      throw new Error("Manual release SHA must match a merged same-repository release PR");
    }
    core.info("Ordinary main commit: no merged release PR; nothing to publish.");
    core.setOutput("publish", "false");
    return;
  }

  assertReleaseProtocol(root, releaseSha);
  // Load the verifier before checkout: historical release scripts may differ.
  execFileSync(
    "git",
    [
      "checkout",
      "--detach",
      releaseSha,
    ],
    {
      cwd: root,
      stdio: "pipe",
    },
  );
  assertReleaseSnapshot(root, releaseSha);
  const previous = JSON.parse(
    execFileSync(
      "git",
      [
        "show",
        `${releaseSha}^1:packages/core/package.json`,
      ],
      {
        cwd: root,
        encoding: "utf8",
      },
    ),
  ).version;
  const version = await checkReleaseCommit(root, previous);
  if (manual && context.payload.inputs?.version !== version) {
    throw new Error("Manual release input must exactly match the committed family version");
  }
  core.setOutput("version", version);
  core.setOutput("release_pr", String(pr.number));
  core.setOutput("release_sha", releaseSha.toLowerCase());
  core.setOutput("publish", "true");
};
