import { checkVersions } from "./versions.mjs";
import { checkReleaseGroup, pendingChangesets } from "./changesets.mjs";

export function isMergedReleasePr(pr, repository, sha) {
  return (
    pr.merged_at &&
    pr.merge_commit_sha === sha &&
    pr.base?.ref === "main" &&
    pr.base?.repo?.full_name === repository &&
    pr.head?.ref === "changeset-release/main" &&
    pr.head?.repo?.full_name === repository
  );
}

export function assertVersionIncrease(previous, next) {
  if (!/^\d+\.\d+\.\d+$/.test(previous) || !/^\d+\.\d+\.\d+$/.test(next)) {
    throw new Error("Stable release versions required");
  }
  const oldParts = previous.split(".").map(Number);
  const difference = next
    .split(".")
    .map(Number)
    .reduce((result, part, index) => result || part - oldParts[index], 0);
  if (difference <= 0) {
    throw new Error(`Release version ${next} must be higher than ${previous}`);
  }
}

export async function checkReleaseCommit(root, previousVersion) {
  await checkReleaseGroup(root);
  const result = await checkVersions(root);
  if (!result.ok) {
    throw new Error(result.problems.join("\n"));
  }
  if ((await pendingChangesets(root)).length) {
    throw new Error("Release commit still contains pending changesets");
  }
  if (previousVersion !== undefined) {
    assertVersionIncrease(previousVersion, result.version);
  }
  return result.version;
}
