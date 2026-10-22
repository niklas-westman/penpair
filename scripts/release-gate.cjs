// GitHub API evidence is checked before the publishing job can request OIDC.
module.exports = async function releaseGate({ github, context, core, root = process.cwd() }) {
  const { execFileSync } = require("node:child_process");
  const { checkReleaseCommit, isMergedReleasePr } = await import("./lib/release-pr.mjs");
  if (context.ref !== "refs/heads/main") throw new Error("Release only from main");
  let previous;
  let releasePr = "";
  if (context.eventName === "push") {
    const prs = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit, {
      ...context.repo, commit_sha: context.sha, per_page: 100,
    });
    const pr = prs.find(item => isMergedReleasePr(item, `${context.repo.owner}/${context.repo.repo}`, context.sha));
    if (!pr) {
      core.info("Ordinary main commit: no merged release PR; nothing to publish.");
      core.setOutput("publish", "false");
      return;
    }
    releasePr = String(pr.number);
    previous = JSON.parse(execFileSync("git", ["show", `${context.sha}^1:packages/core/package.json`], { cwd: root, encoding: "utf8" })).version;
  } else if (context.eventName !== "workflow_dispatch") {
    throw new Error("Unsupported release event");
  }
  const version = await checkReleaseCommit(root, previous);
  if (context.eventName === "workflow_dispatch" && context.payload.inputs?.version !== version) {
    throw new Error("Manual release input must exactly match the committed family version");
  }
  core.setOutput("version", version);
  core.setOutput("release_pr", releasePr);
  core.setOutput("publish", "true");
};
