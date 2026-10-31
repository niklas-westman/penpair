---
"@penpair/core": minor
"@penpair/docker": minor
"@penpair/web": minor
"penpair": minor
"@penpair/marwes-ui": minor
"@penpair/reflection-check": minor
---

Nine correctness and packaging fixes found by reviewing the architecture contracts against the code

Replaying an already-satisfied Marwes token push no longer fails. Pushing the
same plan twice — after a resume, or from a stale plan — used to abort with
`theme exists` as an *uncertain* outcome, and token names already present were
counted as failures. `marwes-create-theme` is now idempotent, attaching only the
wanted sets it finds missing and never removing one, and `marwes-add-tokens`
reports already-present names as `skipped` rather than `failed`.

`penpair run` now refuses a project snippet whose body cannot parse, instead of
sending it to Penpot and failing inside the editor. A project snippet is code
from outside the core; it was validated only when someone ran
`penpair snippets check`. Built-in snippets are unaffected.

The local lifecycle commands now check what the instance runs on before they do
anything. `penpair up`, `down` and `status` run the local profile's preflight
first, so a stopped Docker reports "Docker is not running. Start Docker Desktop"
rather than a raw daemon error from whichever subcommand happened to run.
`penpair doctor` is deliberately exempt — diagnosing a stopped daemon is what it
is for. Scaffolding a configuration still works with Docker stopped, because
`init` writes files and needs no daemon.

`penpair reflection plan` no longer drops a mapped baseline that has no
implementation route. A frame without a route is exported but never checked,
which is deliberate — but naming one in the mapping is a request to check it, and
that request was disappearing from both the case list and the pending list while
the plan still reported itself complete. It is now reported as pending with its
own reason.

`@penpair/docker` now ships `docs/` and `examples/`, as `@penpair/web` already
did, so someone who installs the Docker command gets the same documentation.
Relatedly, the packaging step no longer replaces a package's own README with the
project one — only a package that maintains no README of its own receives it, and
the repository's own design records are excluded from the published tarball
because they are contributor history rather than product documentation.

Every package now ships the `LICENSE` file it declares in `files`. Five of the
six promised one and did not include it, so those tarballs carried no licence
text. A test now fails the build if a package promises a file it does not ship,
or ships a `LICENSE` that differs from the repository's.

Internal: the convention examples now execute the adapter-command template
rather than only type-checking it; `skills/` is gated by the code-path naming
check like every other code root; and the doctor row for a skipped browser-tab
census is a named function with a unit test, rather than an object literal inside
a command path that cannot be tested without git.
