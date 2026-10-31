---
name: penpair-guide
description: Guide someone new to Penpair from first idea to a released design, one phase at a time. Use when the person does not know where to start, what comes next, or where the project stands, and has little design or process background.
---

# Project guide

## What this owns

Telling the person where their project stands and which single phase comes next, in plain words.

Not here: Connecting Penpot or repairing the connection — `penpair-setup`.
Not here: Any change to a Penpot file; the phase's own skill owns the work and its write protocol — `penpair-design`.
Not here: Composition and critique — `design-judgment`; building frames — `penpair-construct`.
Not here: Journeys and maps — `penpair-journey-map`, `penpair-integration-map`; releases — `penpair-release`.
Not here: Implementing and checking the frontend — `penpair-handoff`, `penpair-verify`.

## Before you start

Assume the person knows nothing about design or process. Use plain words, explain why before asking for anything, and offer one phase at a time. Everything this skill does is reading; any change is made by the skill that owns that phase, after the person agrees.

Speak to the person in plain words: leave out phase numbers, skill names and terms they have not met, and use the wording in [phases.md](references/phases.md) under "Say it like this". The checkpoint below is your working note, not a script.

Never run `penpair approve`, record an approval, finalize a release or invent the owner's words. Approval is the owner saying, in their own words, that this exact image is good; tell the person that up front. Reading a skill never authorizes a live write.

## Look at the project

Read what exists before saying anything. All of these are read-only:

```sh
penpair doctor --json
penpair pages
penpair tree --page PAGE
penpair baselines coverage --json
penpair design-release status --from design/releases/VERSION/release.json
```

Also read `design/approvals.json` if it exists (no approvals listed means nothing is approved yet) and the project facts (`penpair-design/references/project-facts.md` in the installed skills folder). An approval whose page or frame IDs no longer match a frame in the file counts as not approved; say so. A missing file, an unreadable command or an unconnected editor is a finding: say what you could not read, and treat it as not done.

## The common path

This is a common path, not the whole set and not a rule. When the project's state disagrees with the table, trust the state.

| # | Phase | In plain words | Done when | Skill |
| --- | --- | --- | --- | --- |
| 0 | Connected | Penpair can see the design file | `doctor` is healthy and a file is pinned | `penpair-setup` |
| 1 | Direction | Collect references and settle the look in a few words | A page named `Mood` exists and the project facts record the direction | `design-judgment` |
| 2 | Structure | List the site's pages and how people move between them | One Penpot page per site page, and the flows are reviewed | `penpair-journey-map` |
| 3 | First frame | Design the most typical page at desktop width | One `Desktop` frame, looked at twice and approved by the owner | `penpair-construct` |
| 4 | Other sizes | Derive tablet and mobile from that approved desktop frame | `Tablet` and `Mobile` frames, each approved | `penpair-construct` |
| 5 | Every page | Repeat 3 and 4 for each remaining page, one at a time | Each site page has approved Desktop, Tablet and Mobile | `penpair-construct` |
| 6 | Connect to the app | Say which routes, components and data each page uses | The integration map is reviewed | `penpair-integration-map` |
| 7 | Release | Freeze the reviewed design as a numbered version | See the release rule below | `penpair-release` |
| 8 | Build and check | Build the app from the design, then compare it with the design | Comparison evidence exists and drift is resolved | `penpair-handoff` |

For what to ask and explain in each phase, read [phases.md](references/phases.md).

Conventions, unless the project facts say otherwise: the moodboard page is called `Mood`; frames on a site page are named `Desktop` (1440 wide), `Tablet` (768) and `Mobile` (390). A page whose name starts with `release/` belongs to a release, never to a site page. Record the page list, the direction and any different widths in the project facts.

## Release rule

A release is due when every site page has an approved Desktop, Tablet and Mobile frame (match each approval record's page and frame IDs to the frames in the file) and the journey and integration maps are reviewed. Then you may raise it: tell the person in plain words what a release holds, propose a version (1.0.0 for the first), and let them choose the version and agree what goes in. Wait for their answer; never start a release unprompted.

Explain a release in plain words: a page named `release/VERSION` that holds the new or changed frames, an overview linking every frame in the release (earlier unchanged frames stay where they are), the journey and integration maps, and a cover. The boards can be copied in by hand in Penpot, or with `penpair design-release copy`, which is experimental and previews first. The release is finished only when the owner says so about the exact release.

## Steps

1. **Look.** Read the project as above. Done when each phase is marked done, missing or unknown, with the evidence.
2. **Say where they are.** Write the checkpoint for yourself, then tell the person the same thing in plain words. If a phase is done for some pages and not others, name the phase and the pages left:

   ```text
   Project: <name and pinned file>
   Phase: <number and plain name>
   Done: <what proves it>
   Missing: <what is not there yet>
   Next: <one phase, one skill, and why>
   ```

3. **Propose one phase.** Pick the earliest phase that is not done. Ask before creating pages or touching the file. Done when the person has said yes or chosen something else.
4. **Hand off.** Read the phase's skill and follow it, staying with the person. This skill does not do the phase's work.
5. **Look again.** Re-read the state after the phase and report what changed. Done when the checkpoint is true again.

## Where each phase leads

Next: `penpair-setup` when the connection is missing or failing.

Next: `penpair-design` for any write to the file, including the `Mood` page and one page per site page.

Next: `design-judgment` to settle the direction and critique the first frame.

Next: `penpair-journey-map` to agree the pages and how people move between them.

Next: `penpair-construct` to build the Desktop frame and derive Tablet and Mobile.

Next: `penpair-integration-map` to connect the pages to routes, components and data.

Next: `penpair-diagrams` to draw a reviewed map as an editable native diagram.

Next: `penpair-release` once the owner agrees it is time.

Next: `penpair-handoff` to build the app from the released design.

Next: `penpair-verify` to compare the built app with the design.
