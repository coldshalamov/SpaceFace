# H1 row 6 — PQ-023 cues in motion

**Overall result: PASS — retained combat-motion evidence plus accepted Cathedral Browser/Electron continuation.**

## Accepted Cathedral continuation

Exact unit `PQ-023.cues-h1-capture` consumed fresh Browser claims only after materially changed
candidates. Candidate `f373e8a7`, Browser claim `40008-bf8ebe348500b65aa41197e6`, and candidate
digest `3b31ee47da771989ef583301b78169a577ab714b8d2deb1168ce3c1a95e6a82b` completed the registered
fixed-seed route on real Intel ANGLE/D3D11:

- `87/87` Browser frames, `15/15` motion segments, and three contact sheets;
- normal and reduced recovery/damage in the live Wreck Cathedral route;
- cue order `recovery → damage → recovery → damage`;
- noncolor captions `ring → bracket → ring → bracket` with correct assertive and reduced flags;
- distinct autocannon `directional-fragments` and flak `proximity-burst` projections;
- all named route, framing, pool, capacity, and cleanup predicates true;
- zero Browser page issues.

The first Electron parity attempt exposed a harness-only duplicate navigation: the first window had
already loaded the canonical root, and a second `goto` cancelled its in-flight scenario fetch. Commit
`e2bb0165` removed that redundant navigation and pinned the one-load contract. The causal re-review
then passed on the same production source digest: the four representative Electron states match the
Browser semantic projection exactly, WebGL uses real Intel ANGLE/D3D11, page issues are empty, and
the owned runtime/profile closed cleanly.

Review artifacts and machine receipts are in
[`cathedral-continuation/`](cathedral-continuation/). The latest motion reel is hash-bound as
`1b43ab0845b53b1b7f244a0dbeddb2db4b404d462b256b50b7389d060b37eb24`; the Browser report is
`12c6bea31b0e0ae93bfbf0e0b6af6016ea61668f85770c7195ce5159bb1ac77e`; the Electron receipt is
`c2ca06ad5424ac45163f28fea1e5d4db4b6635634679c9bda02444ddb473f959`.

The original one-attempt failure and its surviving combat evidence remain below unchanged as the
causal history. The continuation adds only the missing Cathedral/Browser-completion/Electron cells.

The original Browser acceptance attempt was consumed through the registered broker manifest:

```text
node scripts/validation-broker-cli.mjs --manifest pq023-corridor-cues
```

The broker issued one claim at fixed seed `47`, launched one owned headed Browser process, and recorded
one Browser launch and zero Electron launches. The Browser exited with a harness assertion failure; it
was not retried. The Electron parity harness correctly remained unlaunched because the Browser cell did
not produce a passing `report.json`.

## Retained original failure and why it is HARNESS

The Browser completed the impact, destruction, reduced-profile, dense-scene, and video sections. It then
entered Ceres and failed at the first Wreck Cathedral predicate:

```text
page.waitForFunction: Timeout 120000ms exceeded.
    at waitForPq023CathedralState
      (scripts/capture-combat-vfx-acceptance.mjs:1257:35)
    at capturePq023WorldSiteSequences
      (scripts/capture-combat-vfx-acceptance.mjs:1095:25)
```

The harness ordered the Cathedral steps as:

```js
const initial = await waitForPq023CathedralState(targetPage, 'failed');
const framing = await framePq023Cathedral(targetPage, initial.rootId);
```

The wait required all three facts simultaneously:

1. Cathedral hull status `failed`;
2. root `presentationAdmission === 'ready'`;
3. root `authoredAssetState` beginning with `authored`.

But `framePq023Cathedral` is the function that moves the stationary player into the Cathedral's authored
admission runway. At the source-specific Ceres entry point recorded by the preceding fixed-seed H1 route,
the player was at `(-9367.360, 6708.074)` while the Cathedral root is at
`(-11988, 10892)`: `4936.901 WU` away. Production authored admission uses a `1000 WU` immediate radius
and a `2400 WU` approach radius; the player was stationary, had not targeted the Cathedral, and was
outside both. The same entry state was already preserved with the root at `presentationAdmission:
"pending"` and `authoredAssetState: null` in row 5.

Therefore the wait depended on the later player move that it prevented from running. Waiting longer could
not make the predicate satisfiable through this route. This is a **HARNESS ordering defect**, not a
PRODUCT cue defect or an ENVIRONMENT failure.

This classification does not upgrade the unexecuted Cathedral section. It only explains why the single
attempt stopped before those claims were exercised.

## Reviewable evidence that survived

The original headed Browser motion recording is committed as:

- [combat VFX motion reel](01-combat-vfx-motion-reel.webm) — VP8 WebM, `1440×900`.

Curated frame sequences from that same one attempt:

- [autocannon impact sequence](02-impact-autocannon.png);
- [flak impact sequence](03-impact-flak.png);
- [small destruction lifecycle](04-destruction-small.png);
- [ordinary destruction lifecycle](05-destruction-ordinary.png);
- [capital destruction lifecycle](06-destruction-capital.png);
- [kinetic / plasma / beam motion sequences](07-core-motion.png);
- [reduced-motion / reduced-flash ordinary sequence](08-reduced-motion.png);
- [dense destruction and beam scene](09-dense-scene.png).

These artifacts make the following questions reviewable, but H1 does not substitute an acceptance verdict
for the human:

- whether flak and autocannon impacts read as distinct at the normal camera;
- whether small, ordinary, and capital destruction lifecycles land;
- whether the reduced profile remains legible;
- whether the dense combat presentation remains readable.

The committed deterministic suppression trace covers cues that intentionally do not render. Across six
dense ticks it records `18/18` critical cues emitted, zero critical drops, and `42/60` flavor cues
suppressed with the explicit reason `lane_budget:audio`.

## Claims left unproven by the stopped attempt, now closed by the continuation

- Wreck Cathedral normal recovery motion and stills;
- Wreck Cathedral normal damage motion and stills;
- Wreck Cathedral reduced-motion/reduced-flash recovery and damage states;
- the expected `ring` / `bracket` noncolor caption sequence on the live route;
- Browser semantic projection for the four World Site transitions;
- final Browser page-issue and VFX-pool cleanup assertions, because `report.json` is constructed only
  after the Cathedral sequence returns;
- Electron semantic parity, because Electron is gated on a passing Browser report;
- full PQ-023 `milestone_accepted` closure.

The accepted continuation closes every functional item in that list. H2 must now review the retained
combat subset together with the new Cathedral motion/stills; machine H1 does not substitute for that
independent motion/accessibility judgment.

## Deterministic preflight and broker boundary for the original attempt

All declared fast gates passed before the one-use claim was issued:

- `npm run check:pq023:corridor-cues` — 20/20;
- `npm run check:presentation` — PASS, including 65/65 focused tests;
- `npm run check:sim:compare` — deterministic, `hashEqual: true`, no divergent tick;
- `node --test test/pq023-corridor-cues-h1-manifest.test.mjs` — 9/9.

The candidate digest is
`317f02f82b1ac15d482018ff6569fe4e754a2d101622c45d454923b25c32d595`; `launch-counts.json`
binds it to exactly one acceptance launch. No retry was attempted.

## NOT performance evidence

This row makes no speed, frame-time, percentile, hitch, throughput, or representative-performance claim.
The WebM and frame ordering are perceptual review artifacts only. The broker process duration and the
harness timeout value are diagnostic metadata; committed copies carrying those fields are stamped
`"informational_contended": true`. Matched performance remains Phase H3.

## Machine-readable files

- `classification.json` — row result, causal ordering, admission geometry, and bounded surviving claims;
- `fast-gate.json` — broker fast-gate digest receipt;
- `launch-counts.json` — one-use candidate launch record;
- `latest-acceptance-failure.json` — broker failure fingerprint, with timeout metadata marked contended;
- `latest-run-result.json` — owned process record, with process-duration metadata marked contended;
- `dense-scene-suppression-trace.json` — deterministic cue arbitration trace;
- `broker-run.log` — exact terminal summary from the one attempt.
- `cathedral-continuation/continuation.json` — accepted Browser/Electron identity and bounded claims;
- `cathedral-continuation/browser-report.json` — complete named Browser acceptance predicates;
- `cathedral-continuation/electron-route-receipt.json` — exact cross-runtime semantic parity and cleanup;
- `cathedral-continuation/browser-claim*.json`, fast-gate, launch counts, and terminal run record;
- `cathedral-continuation/browser-motion-reel.webm` plus 12 Browser and four Electron Cathedral frames.
