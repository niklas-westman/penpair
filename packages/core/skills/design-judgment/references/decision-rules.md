# Decision rules

Each rule reads condition, decision, reason, exception, check. Labels: **established** has a primary source in `sources.md`; **craft norm** is a widely used practice without measurement. Apply the rule that fits the case; cite its label when you rely on it.

## Structure and hierarchy

**1. Structure follows the decision the screen supports** (established, GOV.UK needs framing).
Condition: the brief names a page type (dashboard, workspace) and no task. Decision: write the user's question, the evidence needed and the next action, then choose the composition. Triage suggests a prioritised queue, investigation suggests comparison with drill-down, monitoring suggests exceptions and trend, browsing people suggests list and detail. Exception: a narrow defect does not reopen the product definition. Check: each major region connects to a question or an action; delete regions that exist because "pages like this have one".

**2. Hierarchy before decoration** (established, NN/g visual design).
Condition: regions carry equal emphasis. Decision: assign attention with placement, grouping, weight and contrast; keep to about three type sizes and let weight and colour separate levels. Exception: a multi-metric workspace may hold several equals. Check: squint test, then ask someone unfamiliar what it is for and where to begin.

**3. Density is chosen once and kept** (craft norm).
Condition: repeated comparison needs scrolling, or a first-time flow shows too much. Decision: compact aligned rows for repeated expert comparison, more grouping and explanation for unfamiliar decisions; related items sit closer than unrelated ones, using the spacing tokens. Check: compare twenty rows without losing your place; targets stay usable.

**4. Progressive disclosure, two levels at most** (established, NN/g).
Condition: secondary detail crowds the primary task. Decision: defer it one level behind a labelled control, split by how often it is used. Exception: steps that depend on each other and need frequent back and forth stay on one view. Check: the three most common tasks need no more than one extra step.

## Data and meaning

**5. Charts follow the relationship** (established, NN/g, ONS).
Condition: a chart is proposed because it fills space. Decision: name the relationship (ranking, change over time, parts of a whole, distribution, deviation); quantity is read by position and length; avoid pie, donut, gauge and 3D; keep a common baseline when comparing; use a table when exact values and per-item actions matter. Check: the question the chart answers, its unit, period and comparison basis are stated; missing values never become zero.

**6. A number carries its meaning** (craft norm).
Condition: a figure or delta appears bare. Decision: show scope, definition, time and comparison; separate percent change from percentage points; take "good direction" from the domain. Check: a reader can say what changed, against what, and whether to act.

**7. Table actions have three scopes** (established, Carbon data table).
Decision: collection actions in the toolbar, selection actions in a bar that appears on selection (single-row actions pause), one-record actions in a row menu or link. Exception: a short list needs no batch. Check: select three rows and confirm which actions apply to what.

## States, content and flow

**8. The state matrix is part of the design** (established, DECISIONS.md UI standards).
Decision: specify first load, refresh, stale, no records, no filter matches, partial, error, forbidden. Keep useful old data during refresh and show its age. Check: a fixture per state; each shows a recovery action. Skip states the data model cannot reach.

**9. Representative content is a constraint** (craft norm).
Decision: design with long names, missing optional fields, varied counts and thin records. A block with no data does not render; a person with thin data still looks finished. Check: run a difficult-content fixture at 390 and 1512 px.

**10. Forms and destructive actions** (established, Vercel guidelines).
Decision: visible labels, errors beside the field with the fix stated, correct input types, an unsaved-changes warning. Name irreversible actions specifically ("Delete project") and confirm them with a confirmation dialog; reversible low-stakes actions need no dialog. Check: submit empty and invalid with the keyboard only.

**11. State lives in the URL** (established, the project's own conventions where it has them).
Decision: filters, sort, selection and tab are deep-linkable and links are real anchors. Exception: transient UI such as hover or an open menu. Check: reload and back/forward restore the view.

## Interaction, motion and access

**12. Frequency governs motion** (craft norm, Kowalski).
Decision: no animation for actions repeated many times a day; keyboard-initiated actions stay immediate; enter and exit transitions that explain a change stay brief; reduced motion is honoured. Exception: a rare, first-time or expressive moment. Check: repeat the action twenty times and feel the delay.

**13. Targets and contrast** (established, WCAG 2.2).
Decision: 24 by 24 CSS px minimum (SC 2.5.8, AA); 44 is the AAA and touch-first preference; text contrast 4.5:1. Check: measure the rendered size and spacing, and run a greyscale screenshot for status colour.

**14. Recompose for constraint** (craft norm).
Condition: a dense screen is illegible when narrow. Decision: keep priority, scope and actions; change arrangement (detail becomes a full screen or a side drawer, a table scrolls on purpose, filters collapse). A row does not become a card when cross-row comparison is the task. Check: finish the same task at 390 px with long content and enlarged text.

## Honesty

**15. Separate what the repo knows about looks from what it knows about the work** (NN/g UX-Context).
Decision: record missing task knowledge as an unknown or an assumption and never fill it with plausible fiction. Invented testimonials, metrics and logos never ship.
