---
"@penpair/core": minor
"@penpair/docker": minor
"@penpair/web": minor
"penpair": minor
"@penpair/marwes-ui": minor
"@penpair/reflection-check": minor
---

`penpair-guide`, a skill for someone who does not know where to start

The guide reads the project (pinned file, pages, approvals, release status), says
in plain words which phase it is in and proposes exactly one next step, handing the
work to the skill that owns it. It never approves a design, writes to the file or
finishes a release; approval stays the owner's actual words.

The common path it follows is now written down in `docs/project-lifecycle.md`: a
`Mood` page for references, one Penpot page per site page, `Desktop` (1440),
`Tablet` (768) and `Mobile` (390) frames derived from the approved desktop frame, and a
release the guide proposes when every page is approved and leaves for the owner to
decide. `penpair-construct` now says explicitly that a device-size frame is derived
from the approved desktop frame of the same page.

A test keeps the guide a pure entry point: it routes to every phase's skill and no
skill routes back to it, so the order it describes never becomes a dependency.
