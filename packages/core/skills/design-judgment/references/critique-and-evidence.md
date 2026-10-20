# Critique and evidence

## A finding is reproducible

Format: **location**, **user impact**, **evidence**, **fix**, **check**.

Weak: "The card feels generic."
Strong: "Item card, 390 px: the role line wraps under the status badge, so two items from the same company look identical until the third line. Show the badge beside the name or move the company to its own line. Recheck with two items from one company at 390 px."

A taste preference is labelled as taste and never presented as a defect. Blockers come first: broken primary task, invented data shown as real, a known serious accessibility failure, an invented component library, a changed token, baseline or threshold.

## Three evidence categories

Every report ends with these headings:

- **Observed**: inspected or exercised, with an artifact (screenshot path, test output, command).
- **Inferred**: a reasoned judgement not confirmed in a browser or with a person.
- **Not checked**: a relevant check that did not run, with the reason.

A passing build, a high Reflection match and a clean accessibility scan are each one piece of evidence. A scan cannot establish accessibility, and a match to an approved frame says nothing about whether the frame helps the task.

## Two compositions, not two skins

Two options differ when the task works differently in each: queue or board, detail beside the list or on its own screen, facts first or story first. State what each makes easy, what each makes hard, and what would favour the other. Recommend one. Both still use the same library parts and tokens.

## Comparing guidance (the validation experiment)

To learn whether this skill improves results, freeze the starting commit, fixtures, task, model, tools and budget, then compare:

| Condition | Guidance |
|---|---|
| A | Current project instructions |
| B | A plus this skill |

Run each condition in a fresh working copy, three times. Score each dimension 0 broken, 1 major correction needed, 2 usable with minor issues, 3 meets the criteria: task clarity and hierarchy; component choice (the project's library first); states including thin data; responsive at 390 and 1512 px; accessibility (measured target size, keyboard, visible focus); complexity and diff size. Blockers cancel a score regardless of the others. Add one task test with a person ("find the latest status and update the information"), reporting preference and outcome separately. Keep B only when it wins on at least two dimensions without new blockers or a higher correction cost. The result is exploratory, never statistical.

## Run record

Task and fixture version; starting commit; model and harness; guidance condition; tools used; changes; build and test results; screenshots and interactions; blockers; person's observations; effort and manual corrections; conclusion and limits.
