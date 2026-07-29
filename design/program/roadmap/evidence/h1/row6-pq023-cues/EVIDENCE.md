# H1 row 6 — PQ-023 cues in motion

**Overall result: FAIL — HARNESS (partial combat-motion evidence survives).**

The one permitted Browser acceptance attempt was consumed through the registered broker manifest:

```text
node scripts/validation-broker-cli.mjs --manifest pq023-corridor-cues
```

The broker issued one claim at fixed seed `47`, launched one owned headed Browser process, and recorded
one Browser launch and zero Electron launches. The Browser exited with a harness assertion failure; it
was not retried. The Electron parity harness correctly remained unlaunched because the Browser cell did
not produce a passing `report.json`.

## Exact failure and why it is HARNESS

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

## Claims left unproven by the stopped attempt

- Wreck Cathedral normal recovery motion and stills;
- Wreck Cathedral normal damage motion and stills;
- Wreck Cathedral reduced-motion/reduced-flash recovery and damage states;
- the expected `ring` / `bracket` noncolor caption sequence on the live route;
- Browser semantic projection for the four World Site transitions;
- final Browser page-issue and VFX-pool cleanup assertions, because `report.json` is constructed only
  after the Cathedral sequence returns;
- Electron semantic parity, because Electron is gated on a passing Browser report;
- full PQ-023 `milestone_accepted` closure.

H2 may review and annotate the surviving combat subset, but the overall PQ-023 motion decision must
**defer** until a valid future capture reaches the Cathedral sequence and Electron parity.

## Deterministic preflight and broker boundary

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
