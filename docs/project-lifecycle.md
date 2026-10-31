# From a first idea to a released design

For someone new to Penpair, or new to design. You do not need to know the process: your assistant reads the project, says where you are and proposes the next step. This page is the map behind that.

## Start here

Open your project in your assistant and ask:

```text
Use penpair-guide. Look at my project, tell me in plain words where it stands,
and propose the single next step. Ask before changing anything.
```

The guide only reads. Any change to the design file is made by the skill that owns that step, after you agree. **Approval is always yours**: the assistant never approves a design or finishes a release for you, and it asks for your own words about the exact image you looked at.

## The common path

This is a common path, not a rule. If your project is further along, the assistant starts from what it finds.

| # | Step | What happens | Done when | Skill |
| --- | --- | --- | --- | --- |
| 0 | Connected | Penpair can see your Penpot file | `penpair doctor` is healthy and a file is pinned | `penpair-setup` |
| 1 | Direction | Collect a few references and agree the feel in a few words | A page named `Mood` exists and the direction is written in the project facts | `design-judgment` |
| 2 | Structure | List the site's pages and how people move between them | One Penpot page per site page; the main flows are reviewed | `penpair-journey-map` |
| 3 | First frame | Design the most typical page at desktop width | A `Desktop` frame you have approved | `penpair-construct` |
| 4 | Other sizes | Derive tablet and mobile from that desktop frame | `Tablet` and `Mobile` frames, each approved | `penpair-construct` |
| 5 | Every page | Repeat 3 and 4 for each page, one at a time | Every site page has approved Desktop, Tablet and Mobile | `penpair-construct` |
| 6 | Connect to the app | Say which routes, components and data each page uses | The integration map is reviewed | `penpair-integration-map` |
| 7 | Release | Freeze the reviewed design as a numbered version | See [when it is time](#when-it-is-time-for-a-release) | `penpair-release` |
| 8 | Build and check | Build the app from the design, then compare the two | Comparison evidence exists and differences are resolved | `penpair-handoff` |

## Conventions

- The moodboard is a Penpot page called `Mood`, kept in the same file as the design.
- Each page of your website gets its own Penpot page, named the way you name it.
- Each site page has three frames: `Desktop` (1440 wide), `Tablet` (768) and `Mobile` (390). Desktop comes first; the other two are derived from it. Different widths can be written in the project facts.
- A page named `release/…` belongs to a release. Do not use that name for a site page.

## When it is time for a release

The assistant proposes a release when every site page has an approved Desktop, Tablet and Mobile frame and the journey and integration maps are reviewed. It suggests a version (1.0.0 for the first) and waits. You decide; nothing is released automatically, and a release is finished only when you say so about the exact release.

A release is a Penpot page named `release/VERSION`. It holds the frames that are new or changed in this version, an overview that links every frame in the release (frames that did not change stay on their earlier page), the journey and integration maps, and a cover. You can copy the relevant boards onto the release page yourself in Penpot, or ask the assistant to preview a copy with `penpair design-release copy`, which is experimental and previews before it writes. The [design release guide](design-releases.md) has the details and the commands.

## Where the details are

- [Installation](installation.md) gets you connected.
- [Journey maps](journey-maps.md) and [integration maps](integration-maps.md) explain the two maps.
- [Design releases](design-releases.md) explains the release page and its checks.
- [Approvals](approvals.md) explains how your approval is recorded.
- [Which skills exist](skills.md) is the generated list.
