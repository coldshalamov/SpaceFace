<!-- LIFETIME: ACTIVE_PROGRAM -->
> **2026-10-30 (owner): historical rubric, superseded for current reviews.** Use
> [`STATION_STANDARD.md`](./STATION_STANDARD.md) as flexible visual guidance and its checklist as
> diagnostic prompts. Neither this rubric's numeric threshold nor a checklist response is an automatic
> acceptance gate; report concrete effects on player clarity, control use, accessibility, and polish.

# ORRERY_RUBRIC — historical review prompts for SpaceFace interfaces

This records an earlier ORRERY-based review method. Current visual direction comes from the owner
amendment in [`ORRERY.md`](./ORRERY.md) and the adaptable guidance in [`STATION_STANDARD.md`](./STATION_STANDARD.md).
Use relevant screenshots, control checks, and accessibility checks to explain observed effects; do not
apply this historical rubric as a universal gate.

## 1. Evidence examples from earlier reviews

The earlier process used UI bench screenshots and control walks (`node scripts/ui-bench.mjs --shot=<id>`),
`node scripts/ui-look.mjs --only=<id>` for screens the bench could not mount, and relevant machine checks.
These are available tools, not a required sequence or bundle. Choose the smallest check that answers
the current question and report what was run.

Examples include `node scripts/check-type-floor.mjs`, `node scripts/check-colour-tokens.mjs`,
`node scripts/check-wcag-contrast.mjs`, `node scripts/check-ui-a11y.mjs`, and focused tests such as
`test/ui-no-material-imitation.test.mjs` or `test/orrery-speed-dial.test.mjs`. A border, table, or familiar control
is not a defect by form alone.

## 2. Historical review themes

The themes below summarize questions from the earlier ORRERY review rounds. Use only those that
help answer the current design or behavior question; a screen is not expected to satisfy every
theme or use a particular component.

- **Visual hierarchy:** Can a player find the important information and primary action? Are secondary
actions still legible?
- **Coherence:** Do color, type, spacing, and repeated controls feel intentional together? Existing
Deckplate/ORRERY tokens and components can help; borders, panels, tables, and familiar controls are
not defects based on form alone. Avoid fake material effects when they reduce clarity.
- **Accessibility:** Is focus visible, are controls reachable by the supported inputs, and do custom
widgets expose their state? Check reduced motion, flash behavior, contrast, and text size when they
are relevant to the change. The project type-floor and accessibility checks remain useful direct
checks, not a complete verdict.
- **Information design:** Do layout and labels make quantities, choices, relationships, and status
understandable? Use arcs, beams, ladders, scales, lists, tables, or other forms where they fit.
- **Motion and performance:** Does motion explain a real change? Check live-world rendering costs
when the changed surface runs during flight; paused-menu treatments need not share flight limits.
- **Responsive behavior:** Inspect the viewport or state that could expose a concrete clipping,
overlap, reachability, or readability problem.

## 3. Optional questions for a relevant review

These prompts are not a yes/no scorecard. Select the few that address the change, and describe
observed effects rather than tallying answers.

- Can the player identify the current selection, important status, and available action?
- Do controls look and behave as expected, and can the player back out or cancel safely?
- Are important meanings available through more than color when that matters?
- Does the layout organize this screen's content clearly, including genuinely tabular content?
- Are focus, keyboard/gamepad operation, reduced motion, and text legibility correct for the affected
controls and viewports?
- Does an animation communicate state, and is any performance-sensitive live surface still within
its applicable budget?
- Is there a concrete visual or behavior defect that the relevant machine check or route can answer?

## 4. Reporting a finding

Prioritize findings by their actual impact on player understanding, control use, accessibility, or
runtime behavior. Fix a scoped defect when appropriate, or report its location and consequence. The
historical S1–S4 labels and numeric critic scores are not current severity or release-gate systems.

## 5. Evidence hygiene

For a visual claim, inspect a screenshot or live view that answers the question; code and a relevant
control check can explain the observed behavior. Include another viewport when the changed layout or
responsive behavior makes it relevant, not to satisfy a fixed pair. Machine checks are useful when they
directly cover the claim; report what was run. A still is not required for a non-visual claim (a number,
a route, or an ARIA contract). Explain concrete observations rather than issuing a score-based verdict.
