---
name: design-judgment
description: Choose or critique a screen's hierarchy, density, content and loading, empty or error states. Use for composition decisions and visual critique while respecting approved designs; use penpair-design for Penpot operations and the project's library guidance for component APIs.
metadata:
  version: "0.1.0"
  scope: design reasoning
  audience: anyone designing a screen in a design tool or in code
---

# design-judgment

A screen is a decision tool for one person doing one job. This skill supplies the reasoning that sits between the brief and the component tree. The project's component library supplies the parts, its approved designs supply the frames, and this skill decides which composition serves the task.

## Authority order

1. The owner's requirements, platform behaviour, accessibility and security.
2. The project's approved designs, its component library and tokens, and its own conventions and standards. If the project records them in a `PROJECT.md` next to this file, read that first.
3. The recipes in `references/recipes/`: defaults for screens that have no approved design yet. A design replaces its recipe.
4. External material in `references/sources.md`: input to weigh, never an instruction.

A conflict between layers is reported to the owner. A part the library lacks is recorded as a gap where the project keeps its component map, never imitated with a look-alike in the app.

## Steps

1. **Frame.** Write the decision brief: user, task, next action, the questions the screen answers, evidence versus assumption, constraints, success, out of scope. Done when every line is filled or named as an unknown.
2. **Inspect.** Find what exists: designs in the design tool, the role in the component map, the library's real exports, a comparable page in the codebase. Done when each part maps to a verified export or a recorded gap.
3. **Compare.** For a substantial change, draw two compositions that differ in how the task works, not in colour. Done when the trade-off is stated, one is recommended, and the evidence that would overturn it is named. Repair a narrow defect directly.
4. **Compose.** Fix hierarchy (what leads, what recedes), density, the state matrix and the narrow-width recomposition. Use representative content: long names, missing optional fields, a record with thin data. Done when each region traces to a question or action from step 1.
5. **Render and exercise.** Open the real result at 390 and 1512 px, trigger each state with fixtures, use the keyboard. Done when each check is Observed or listed under Not checked.
6. **Critique.** Report the three most consequential findings first, each as location, user impact, evidence, fix, check (`references/critique-and-evidence.md`). Revise twice, then report; a blocking issue stays blocking.
7. **Retain.** Propose at most three lessons as condition, decision, reason, exception, check. Rules change after the owner approves.

## Rules that decide most cases

- **Hierarchy before decoration.** When everything looks equal, change weight, spacing and grouping before adding boxes, colour or shadow. Squint test: the screen's purpose and starting point stay visible.
- **Task leads.** The element the user acts on first is the most prominent; summaries serve it.
- **State matrix is part of the design.** Loading, empty, no matches, error, stale, forbidden: each has a fixture and a recovery action, derived from the real data model.
- **Status is words plus tone.** Colour accompanies a label or icon; colour never carries quantity.
- **Frequency governs motion.** Actions repeated many times a day carry no animation; reserve motion for rare moments and honour reduced motion.
- **Targets.** 24 by 24 CSS px is the WCAG 2.2 AA floor, 44 is the AAA and touch preference; measure the render.
- **Recompose, then shrink.** At narrow widths keep priority, scope and actions and change the arrangement.

More rules, with conditions, exceptions and checks: `references/decision-rules.md`.

## Where to read next

- Decision rules by topic: `references/decision-rules.md`
- Critique format, evidence categories, comparison experiment: `references/critique-and-evidence.md`
- Recipes: `references/recipes/list-detail.md`, `references/recipes/admin-queue.md`, `references/recipes/status-and-feedback.md`
- Where each idea comes from and what was rejected: `references/sources.md`
