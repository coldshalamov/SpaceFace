<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-019
leafId: PQ-019.facility-embodiment
acceptance: focused_green
disposition: PASS
candidateCommit: 663a20022b9bd0af13983ff4d3903adf6ad87dca
-->

# PQ-019A — facility embodiment: launch-schedule cue and presentation evidence

Branch `claude/pq019a-acceptance-20260728`, cut from `c6d83fe4`. This receipt covers the
headless-completable remainder of PQ-019A: the player-visible launch cue, its focused coverage, and
presentation stills of the authored facilities and capsule. It does **not** claim any row that needs
the performance-evidence / browser-GPU lease held by PQ-034 — those are listed unclaimed at the end.

`candidateCommit` above is the final **code** commit. The commit adding this receipt is docs-only and
necessarily follows it.

## Commits

| Commit | Subject |
|---|---|
| `a5707626` | `feat(heist): announce the PQ-019A launch schedule to the player` |
| `663a2002` | `test(pq019a): add presentation-still harness for the heist route` |

Write surface touched: `src/systems/heistFacilities.js`, `test/pq019-launch-schedule-cue.test.mjs`,
`scripts/capture-pq019a-acceptance.mjs`, and the single `check:pq019a:facility-embodiment` line in
`package.json`. No other file was modified. The program control plane
(`program-queue.json`, `NOW.md`) was not touched.

## What is claimed

### 1. The player can now see a launch coming (`a5707626`)

Before this change the `heistFacilities` owner produced deterministic schedule receipts that nothing
surfaced: a pending launch was invisible on the flight route. The schedule now speaks a bounded
countdown — **T-30 / T-15 / T-5, then an "away" line** when the capsule is physically launched.

Properties, each pinned by test rather than asserted here:

- **Bounded, not per-frame.** `crossedLaunchCueTMinus(launchAtSimT, prevSimT, simT)` is a pure
  function returning the authored moment crossed in the half-open interval `(prevSimT, simT]`. It
  fires only on the tick that crosses a moment. A 32-second window driven for ~2100 update ticks
  produces exactly 4 lines.
- **Stateless, so no new save key.** The previous clock is reconstructed from the frame's own `dt`.
  There is no cursor to persist. The test pins the schedule record's key set so a future field
  addition fails loudly. `heistFacilities` is not serialized by `save.js`; the save schema is
  untouched and `check:save-schema` passes.
- **Deterministic and non-replaying.** Entering mid-window speaks only the moments still ahead;
  leaving Tethys silences the cue and preserves the schedule; re-entering resumes the countdown
  instead of restarting it. These hold by construction, and are asserted so a refactor cannot
  silently break them.
- **One voice.** Every line is enqueued under one stable id, `pq019a:launch-schedule`, on the
  `objective` channel (priority 60). `VoiceQueue` coalesces same-id entries in place, so the whole
  countdown occupies at most one floor slot. The test drives the real `voiceArbiter` and asserts the
  queue never exceeds size 1, that every `voice:surface` carries `id = pq019a:launch-schedule` and
  `priority = CHANNEL_PRIORITY.objective`, and that every `voice:clear` is paired to the same id.
  Danger (110) is never claimed.
- **Non-color semantics.** Each line states the facility and the remaining time in words
  (`"Tethys Surface Launcher: cargo launch in 30s"`). Nothing depends on hue.
- **Sim-inert.** The publisher spawns nothing and writes no sim state; the test asserts the live
  entity count, player cargo and credits are unchanged across the countdown. It reaches the player
  only through the existing `ctx.helpers.voice.say` seam, which is DOM-free — `alerts.js` owns the
  floor pill and is already window-guarded. `check:sim:compare` is `hashEqual: true`.

**Deliberate deviation from the task brief.** The brief suggested gating the presentation behind
`typeof window`. That was not done, for two reasons. First, `src/systems/weapons.js:58-60` records
the opposite rule for this repo — *"never `typeof window` (N1: Node/browser must not diverge by
host)"*; the `typeof window` guard in `stationBroadcast.js` covers a `window.setInterval` wall-clock
timer, not its voice call. Second, such a gate would make the cue unobservable to the focused tests,
weakening exactly the evidence this receipt rests on. The established presentation seam
(`helpers.voice.say`) gives the same inertness — where `voiceArbiter` is not registered,
`helpers.voice` is undefined and the call is a strict no-op — while remaining testable. A test
asserts the owner receipt still emits correctly in that presenter-free configuration.

An owner receipt `heist:launchCue` is emitted alongside each spoken line. It has no presenter, so it
adds no second voice; it exists so consumers and harnesses can observe cue moments without a UI.

### 2. Focused coverage (`a5707626`)

`npm run check:pq019a:facility-embodiment` was extended with
`test/pq019-launch-schedule-cue.test.mjs` (six tests). The check went **12/12 → 18/18**. Only the
single `check:pq019a:*` line in `package.json` was edited; no new npm script was added.

### 3. Presentation stills (`663a2002`)

`scripts/capture-pq019a-acceptance.mjs` boots the canonical New Game route, enters
`sector_tethys_junction`, and photographs each facility at three game-camera distances, the
player-visible cue, and the capsule in flight. **13 captures, 0 page errors.**

These are presentation stills. The harness records no frame timings by design and must not be cited
as performance, draw-count, program-count or GPU-residency evidence.

Four behaviours the harness had to encode, each of which silently produced wrong evidence first and
is documented in the script so the next person does not repay it:

1. Authored places are admitted only inside the renderer's prefetch runway (`1000` WU immediate,
   `2400` on an approach vector — `isEntityAuthoredUpgradeRelevant`, `src/render/renderer.js:222`).
   The facilities are thousands of WU apart, so evidence must be gathered the way a player gathers
   it. Waiting for all three to be admitted simultaneously never terminates.
2. The renderer runs on a floating frame origin (`globalToFrame`, `src/render/camera.js:478`), so
   `entity.pos` is not in the camera's space. Framing is verified by projecting the mesh's
   scene-graph world position; a facility still whose subject projects out of frame is rejected
   rather than shipped.
3. The authored launch corridor begins inside The Anvil's atmospheric hazard band — the surface
   launcher sits ~56 WU off a 470 WU body. Approaching the capsule too soon photographs reentry
   plasma. The harness lets it get ~1200 WU downrange first.
4. The capsule is a real Rapier dynamic body whose velocity the physics owner rewrites every step, so
   `entity.vel` cannot hold it still for a still. The time-scale service — the sanctioned sole owner
   of that scalar, the same seam bullet-time uses — stops the clock instead, leaving the body's live
   position, orientation and speed untouched.

## Gates run — exact results

| Gate | Result |
|---|---|
| `npm run check:pq019a:facility-embodiment` | **PASS 18/18** (was 12/12) |
| `node --test test/pq019-launch-schedule-cue.test.mjs` | **PASS 6/6** |
| `npm run check:sim:compare` | **PASS — `ok: true`, `hashEqual: true`, `firstDivergentTick: null`** |
| `npm run check:baseline` | **10/10 links PASS**; aggregate exit 1 on wall-clock budget only — see below |
| `node --test test/authoritative-manifest.test.mjs` | **PASS 10/10** |
| `npm run check:one-voice` | **RED — inherited, see below**; 10 behavioural sections passed |
| `node --check` on both changed modules, `git diff --check` | clean |

### `check:baseline` — green links, red aggregate

All ten links passed: `ui-screen-imports`, `pq020-ceres-topology`, `save-schema`, `flight-v3`,
`m1-tether-mass`, `sim-v3-compare`, `sim-compare`, `sim-v3`, `sim`, `massline`. The aggregate still
exits 1 because it took `94158 ms` against a hard `90000 ms` budget
(`scripts/check-baseline.mjs:236`: `failed.length === 0 && !overBudget ? 0 : 1`). The overrun is
entirely the `massline` link, which alone consumed `94158 ms`. PQ-019A adds no baseline link and
touches no massline surface. Recorded as an inherited budget condition, not chased.

### `check:one-voice` — inherited red, untouched

Ten behavioural sections pass, including the pure `VoiceQueue` contract and the system wrapper. The
failure is a stale **source-string** assertion at `scripts/check-one-voice.mjs:231`:
`assert.match(src, /core, voiceArbiter, input/)` against `src/core/registry.js`. That string is
absent from `registry.js` **at the pinned base commit `c6d83fe4`**, and this branch does not touch
`registry.js` (the diff is three files). The failure therefore predates this work. It is outside this
lane's write surface and was not modified. Note that the behavioural half of this gate — the half
that would catch a one-voice violation — is green.

### Known pre-existing reds, inherited and untouched

`check:economy:anti-exploit` (`field_contract_dedupe`) and `check:mission-cargo-loading`
(station-tab assertion), as recorded in the packet's 2026-07-27 receipt. Neither was run as
acceptance evidence and neither was modified.

## Evidence files

Captures are written to the ignored artifact tree (`.devshots/` is gitignored, per
`scripts/AGENTS.md`), so they are **not durable in the branch**. Their substance is inlined below so
this receipt stands alone. Regenerate with `node scripts/capture-pq019a-acceptance.mjs`.

- Harness: `scripts/capture-pq019a-acceptance.mjs`
- Manifest: `.devshots/pq019a-acceptance/manifest.json`
  (`schema: spaceface.pq019a.presentationStills.v1`)
- Route: main menu → New Game → Launch → `world.enterSector(sector_tethys_junction)` →
  `heist:requestLaunchSchedule`
- Seed `1347498297` (`0x50513139`), schedule `pq019a-capture-route`, viewport 1440×900,
  `pageErrors: 0`

### Facilities — all admitted `authored`, no fallback retained, verified in frame

Close/default/far are `3.0 / 5.5 / 11.0 ×` the subject's own radius, so the 20 WU launcher and the
24 WU receivers read comparably rather than at incomparable absolute zooms.

| Capture | Place asset | Radius | Zoom close/default/far | Admission |
|---|---|---|---|---|
| `heist_launcher-{close,default,far}.png` | `place_claim_outpost_relay` | 20 | 60 / 110 / 220 | `ready` / `authored` |
| `lawful_catcher-{close,default,far}.png` | `place_claim_outpost_base` | 24 | 72 / 132 / 264 | `ready` / `authored` |
| `fence_receiver-{close,default,far}.png` | `place_claim_outpost_refinery` | 24 | 72 / 132 / 264 | `ready` / `authored` |

All nine passed the harness's in-frame check; worst-case subject NDC across them is `0.568` against
the `0.62` threshold. `authoredReadableFallbackRetained` is `false` throughout — these are the
authored places, not readable fallbacks.

### Launch cue

`launch-cue-tminus.png` — the one-voice floor pill reading
**"TETHYS SURFACE LAUNCHER: CARGO LAUNCH IN 30S"**, alone at top centre with no competing pill.
Cue moments observed live on the route, in order: `t_minus_30`, `t_minus_15`, `t_minus_5`, `away`.

### In-flight capsule

`cargo-capsule-inflight-{close,default,far}.png` — zoom 71 / 86 / 119, separation 40 WU,
`presentationAdmission: ready`, `authoredAssetState: authored`,
`authoredPayloadAssetId: pod_cargo_container`. Genuinely downrange: `travelledFromLauncher`
1140.8 WU, speed 52.3 WU/s at the moment the clock was stopped.

**Scoped limitation, stated rather than papered over:** these three stills are *wide* framings. The
capsule is in frame in all three (screen-space NDC `0.31`–`0.68`) and identified by the live
`Payload · TOW` affordance, but it sits off-centre with the player hull prominent; only the `far`
framing lands inside the harness's own `0.62` centring threshold. The projection check is therefore
advisory for the capsule and fatal for the facilities. A tight, centred close-up of the capsule
remains **open**. It is a harness-framing gap, not a product defect: the asset is authored, admitted
and visible.

## Open rows blocked on the PQ-034 lease — NOT claimed

PQ-034 holds the performance-evidence, validation-broker and browser-GPU leases. No broker manifest,
no Electron run, and no performance or L4 capture was executed. The following remain unproven and are
explicitly **not** claimed by this receipt:

- **GPU admission and residency** — no residency or admission measurement was taken.
- **Draw-call and shader-program counts** — not counted.
- **Representative matched performance** — no frame p95/p99, no hitch measurement, no traffic-loaded
  route. The capture harness records no timings at all, by construction.
- **Electron parity** — not run; browser-only.
- **Independent human art verdict** — the facility and capsule stills have had no independent
  human-eye review. Agent inspection of a screenshot is not an art verdict.

Also still open from the packet's own list, unchanged by this work: solver-level PAYLOAD-only
collision-group exclusivity, and the two broader Phase A checkboxes those rows gate.

Per the packet, this route excludes Ceres, so it produces no Cathedral damage/recovery claim; that
proof stays with `PQ-023.gold-corridor-required-cues`.

## Disposition

**PASS** on what is claimed: the launch-schedule cue is implemented, deterministic, one-voice
compliant, sim-inert, focused-green at 18/18, and demonstrated on the live player route with the pill
photographed on screen; `check:sim:compare` is `hashEqual`. Every row requiring the PQ-034 lease, and
the human art verdict, is listed above as unclaimed. Two inherited reds (`check:one-voice`
source-string, `check:baseline` wall-clock budget) are attributed to the base commit with evidence
and were not chased or modified.
