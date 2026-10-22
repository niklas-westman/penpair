# @penpair/core

## 0.2.0

### Minor Changes

- a5566ed: Add guarded design execution, recovery journals, structured inspection and handoff,
  token reconciliation, explicit case coverage, owner approvals and project MCP tools.
  Add the optional implementation comparison adapter, safer credential storage and
  advisory audits. Document live acceptance gates that remain pending.
  
  Prepare reviewed, whole-family release PRs with Changesets and trusted publishing.
  All six packages move together; no live restore, human trial or native component
  override proof is claimed by this release note.

### Patch Changes

- a5566ed: Allow an explicit, temporary PENPAIR_RELEASE_EXCLUDE_PENPAIR=true publishing
  exception for the blocked short name. Keep all package versions in lockstep,
  verify every other package and clearly report the omitted wrapper. Removing the
  exception restores full-family publishing and explicit catch-up recovery.
