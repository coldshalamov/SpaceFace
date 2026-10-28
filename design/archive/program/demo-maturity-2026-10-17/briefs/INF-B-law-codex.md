# Task INF-B — three INFERENCE catalog units: LAW-11, LAW-12, LAW-13 (one bounded batch)

Read first: `_constraints-codex.md`, and the three catalog lines LAW-11, LAW-12, LAW-13 in
`design/program/INFERENCE_IDEAS.md`. Law: `design/program/INFERENCE_LANES.md` §0.1 — do the line,
do not expand it; share setup across the batch; each line keeps its own done sentence and test.

## The three lines (owner family: `src/systems/lawSecurity.js` + footprint/customs UI readers)

- **LAW-11** — a paid toll lands in your footprint as settled (`src/systems/lawSecurity.js`,
  `src/ui/screens/footprint.js`). Seed 4242: `law:obligationPaid` for a toll adds one footprint
  row marked settled; pin the row and no duplicate on re-read.
- **LAW-12** — a clean customs pass is remembered at that station for a day
  (`src/systems/lawSecurity.js`, `src/ui/customsPrompt.js`). Pin: a compliant scan stamps one
  trust mark; the next same-day scan offer at that station is waived with a line; pin both.
- **LAW-13** — a pilot you rescued testifies: one delivered pod cools one warrant notch, once
  (`src/systems/survivorPod.js`, `src/systems/heat.js`). Pin the authored witness cooling amount
  and the once-only guard. Boundary from the line: heat→WANTED heat is a single writer — emit the
  cooling through the existing heat API, never write WANTED directly.

## Done when

- Three focused tests: `test/inf-law-11-toll-footprint.test.mjs`,
  `test/inf-law-12-customs-trust-mark.test.mjs`, `test/inf-law-13-pod-testimony-cooling.test.mjs`.
- Report all player-visible strings verbatim in your final message (a taste pass follows).
