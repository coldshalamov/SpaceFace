# PQ-180 — The UI grammar matrix, measured against the live game

<!-- LIFETIME: ACTIVE_RECEIPT -->

Harness landed as `b59cd04a`; package entry points as `223608aa`. This receipt covers the step that
was missing: **the matrix had never actually run.** Every runtime cell was `measured:false`, so the
harness asserted a grammar it had never checked.

## The run

```
node scripts/check-ui-grammar-matrix.mjs --headed --json=.devshots/ui-grammar/matrix.json
```

`renderer: "headed Chromium (host GPU)"` — a real GPU, so this counts as evidence. Headless Chromium
is SwiftShader software rendering and would not.

| | Before (static) | After (headed) |
|---|---|---|
| Surfaces measured | **0** of 40 | **30** of 40 |
| Green cells | **0** | **113** |
| Red cells | — | 114 |
| Unproven cells | 1281 | 607 |
| Surfaces opened on a public route | — | 18 |

Every red carries the owner the manifest assigns it, which is the point of the instrument — the
matrix is the frontend queue, so a red is an assignment, not a defect to paper over:

| Owner | Red cells |
|---|---|
| PQ-162 station-screens | 40 |
| PQ-180 `.02` | 21 |
| PQ-180 `.03` | 13 |
| PQ-182 crucible-screens | 13 |
| PQ-181 meta-shell | 8 |
| PQ-130 works-screens | 8 |
| PQ-180 `.00` | 7 |
| PQ-168 chart | 4 |

Most-failing rules: `reference-frames` (35), `tabular-numerals` (23), `reachable` (22),
`pseudo-loc` (17), `safe-frame` (14), `type-floor` (3). The findings are specific enough to act on —
e.g. flight reports `9.00px < 12px` at `div#sf-onboarding > … > span "Status"`, and
`4/15 figures not on a tabular face`.

## Ten surfaces still unmeasured, and why

- **`comms-radial`, `wingman-radial`** — visible timeout after 20 s. A real gap; these are player
  surfaces that the probe cannot open.
- **`credits`, `statistics`, `photo-mode`, `crucible-lab`, `localmap-legacy`, `starmap-legacy`** —
  no opener implemented because **no such surface exists on any route**. The manifest already says
  so; they report `unproven`, which is honest, rather than failing as if they were broken.
- **`asteroid-works`, `base`** — no automated opener yet.

## Two harness defects found by running it

**1. The probe cannot return to idle flight after many screens — NOT fixed.** `Escape` does not
close `crucible-draft`, `crucible-refit`, `crucible-results`, or any `station-*` surface, so
`ensureFlightIdle`/`closeOpenScreens` exhaust their retries and the probe warns *"later rows in this
pass may be measured through it"* — 24 times, and it fires **mid-pass**, not just after the last
surface.

Checked rather than assumed: the eight station rows have identical cell *counts*, which looked like
one screen measured eight times, but their measurements differ (12/27, 5/12, 1/8 figures off a
tabular face), so the tabs were navigating within the station shell as intended. That is reassuring,
not proof.

**Therefore `--update-baseline` was deliberately NOT run.** `test/ui-grammar-baseline.json` is "an
observation record, not an allowance", and recording rows the instrument itself disclaims would make
it an allowance. The baseline stays as the static record until the probe can leave a station screen.
The first owner of the station and crucible reds is the harness.

**2. `fixture "undefined"` in seven station rows — fixed.** Station tabs use a `nested` entry, which
declares `public-route` evidence and is then correctly downgraded to `fixture` by
`resolveInheritedEvidence` ("a chain is only as honest as its weakest link"). The verdict was right;
the *message* then printed `surface.entry.fixture`, which a nested entry never has. Inherited
evidence now records `inheritedFrom` and reads: *"reachable only through station-dock, which itself
opens by a named fixture rather than a player route."* A duplicated `ownerLeaf` key in the same
station block was removed.

## Not done

`npm run capture:ui-matrix -- --update --headed` (~6 boots per viewport × 3 viewports, 384 PNGs) and
`npm run check:visual-regression` were not run in this session. When they are: read the repeatability
report **before** touching a floor, calibrate only surfaces that have no committed floor, from that
run's own two-pass numbers. The five committed floors are measured rest variance and stay exactly as
they are; widening a floor to pass is the one thing that would void the instrument.

`check:ui:grammar-matrix` is deliberately **not** in any gate. The static variant exits non-zero
(0 surfaces measured against a floor of 30), and a gate that is red on arrival teaches agents to
ignore it. It joins `check:all:smoke` when the runtime cells are trustworthy — that is, after
defect 1 above is fixed.

42/42 focused tests green.
