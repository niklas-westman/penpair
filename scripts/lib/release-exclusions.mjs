// The owner-approved exception is deliberately a boolean for one blocked name,
// not an arbitrary package list that could silently omit a dependency.
export function releaseExclusions(value) {
  if (value === undefined || value === "" || value === "false") return [];
  if (value === "true") return ["penpair"];
  throw new Error("PENPAIR_RELEASE_EXCLUDE_PENPAIR must be true, false or unset");
}

export function releaseTargets(packages, value) {
  const excluded = releaseExclusions(value);
  const required = packages.filter(pkg => !excluded.includes(pkg.name));
  for (const pkg of required) {
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      for (const name of Object.keys(pkg.json[field] ?? {})) {
        if (excluded.includes(name)) throw new Error(`${pkg.name} depends on excluded ${name}; refusing an unusable release`);
      }
    }
  }
  return { required, excluded };
}
