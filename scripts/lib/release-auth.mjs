/** Operational preconditions only; npm authenticates the actual OIDC identity against owner-managed publisher settings. */
export function trustedPublishingContext(environment, versions) {
  const atLeast = (actual, minimum) => {
    if (!/^v?\d+\.\d+\.\d+$/.test(actual)) return false;
    const parts = actual.replace(/^v/, "").split(".").map(Number);
    for (let i=0;i<3;i++) { if(parts[i]>minimum[i]) return true; if(parts[i]<minimum[i]) return false; }
    return true;
  };
  const authorizedEvent = environment.GITHUB_EVENT_NAME === "workflow_dispatch" ||
    (environment.GITHUB_EVENT_NAME === "push" && /^[1-9]\d*$/.test(environment.PENPAIR_RELEASE_PR ?? ""));
  if (environment.GITHUB_ACTIONS !== "true" || !authorizedEvent || environment.GITHUB_REF !== "refs/heads/main" || !environment.ACTIONS_ID_TOKEN_REQUEST_URL || !environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN || environment.PENPAIR_RELEASE_ENVIRONMENT !== "npm-release") throw new Error("Trusted publishing requires the owner-enabled main-branch workflow, an API-verified merged release PR or manual dispatch, and protected npm-release environment with OIDC available");
  if (!atLeast(versions.node,[22,14,0]) || !atLeast(versions.npm,[11,5,1])) throw new Error("Trusted publishing requires Node >=22.14.0 and npm >=11.5.1; update the reviewed CI runtime");
  if (environment.NODE_AUTH_TOKEN || environment.NPM_TOKEN) throw new Error("Trusted publishing must not fall back to a long-lived npm token");
  return { mode:"oidc", provenance:true, environment:"npm-release" };
}
export function confirmReleaseVersion(expected, supplied) {
  if (!/^\d+\.\d+\.\d+$/.test(expected) || supplied !== expected) throw new Error("Release confirmation must exactly match the checked package version; nothing was published");
  return true;
}
