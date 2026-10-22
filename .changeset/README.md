# Release notes

Run `pnpm changeset` for a package change, select the affected package and bump
level, and describe the user-visible result. Commit the generated Markdown file
with the change. The highest requested bump applies to the entire fixed group,
including unchanged packages. Do not change package versions in feature PRs.

After merging, automation maintains one **Release Penpair** PR. Review its versions
and changelogs, then merge it to authorize publication. GitHub/npm activation is
separate; see [releasing](../docs/releasing.md). All automation starts disabled.

`pnpm version-packages` is for the automation's disposable release branch. It
consumes notes and changes versions; do not run it on a feature branch.
