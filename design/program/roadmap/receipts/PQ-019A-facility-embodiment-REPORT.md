<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-019
leafId: PQ-019.facility-embodiment
acceptance: focused_green
disposition: PASS
candidateCommit: cb877130c9279e11586e8c7bba5e9ed1e3ffc3ff
-->

# PQ-019A — facility embodiment: launch-schedule cue and presentation evidence

Branch `claude/pq019a-acceptance-20260728`, cut from `c6d83fe4`. This receipt covers the
headless-completable remainder of PQ-019A: the player-visible launch cue, its focused coverage, and
presentation stills of the authored facilities and capsule. It does **not** claim any row that needs
the performance-evidence / browser-GPU lease held by PQ-034 — those are listed unclaimed at the end.

`candidateCommit` above is `cb877130`, the final **code** commit. The commit carrying this receipt is
docs-only and necessarily follows it, so it is the branch tip; an integrator should read the tip for
the receipt text and `cb877130` for the code under review.

## Commits

| Commit | Subject |
|---|---|
| `a5707626` | `feat(heist): announce the PQ-019A launch schedule to the player` |
| `663a2002` | `test(pq019a): add presentation-still harness for the heist route` |
| `cb877130` | `fix(heist): keep the launch countdown off the flight HUD while docked` |

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
- **Flight only.** Verified as a defect before it was fixed (`cb877130`): the cue gated on schedule
  status and sector but not on mode, so a docked player got all four moments pushed into the flight
  HUD's `#alerts` slot behind a fullscreen Station OS, claiming the one-voice floor on a surface they
  cannot see. Now gated at `_sayLaunchCue`, the single exit for every player-visible line. The
  **launch itself is deliberately not gated** — it is world simulation, so the capsule still departs
  on schedule while the player is docked; it is simply not narrated to a screen nobody is watching.
  The test pins both halves and that undocking mid-window resumes at the next moment ahead rather
  than replaying passed ones.
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
`test/pq019-launch-schedule-cue.test.mjs` (seven tests). The check went **12/12 → 19/19**. Only the
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
| `npm run check:pq019a:facility-embodiment` | **PASS 19/19** (was 12/12) |
| `node --test test/pq019-launch-schedule-cue.test.mjs` | **PASS 7/7** |
| `npm run check:sim:compare` | **PASS — `ok: true`, `hashEqual: true`, `firstDivergentTick: null`** |
| `npm run check:baseline` | **PASS — 10/10 green in 81413 ms**, 8587 ms under budget |
| `node --test test/authoritative-manifest.test.mjs` | **PASS 10/10** |
| `npm run check:one-voice` | **RED — inherited, see below**; 10 behavioural sections passed |
| `node --check` on both changed modules, `git diff --check` | clean |

### `check:baseline` — green on the final tree

All ten links pass — `ui-screen-imports`, `pq020-ceres-topology`, `save-schema`, `flight-v3`,
`m1-tether-mass`, `sim-v3-compare`, `sim-compare`, `sim-v3`, `sim`, `massline` — in `81413 ms`
against the hard `90000 ms` budget, leaving `8587 ms` of headroom. Exit 0.

Recorded because it would otherwise look like a discrepancy: an earlier run during this work exited 1
at `94158 ms`, over budget with zero failed links (`scripts/check-baseline.mjs:236` fails the
aggregate on budget alone). The dominant link, `massline`, took `94158 ms` in that run and `81413 ms`
in this one on the same tree, so that was machine contention rather than a product or budget defect.
The final-state result above is the one that stands. PQ-019A adds no baseline link.

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

**Scoped limitation on the three launcher stills, verified by eye rather than by metadata.** The
launcher is a *surface* installation ~56 WU off The Anvil's 470 WU body, so any framing close enough
to photograph it puts the player inside the planet's reentry band. All three launcher stills
therefore carry a live `REENTRY BAND — DESCENT · HEAT 100%` state and a reentry plasma effect around
the player hull. The facility itself is present, authored and in frame in all three — clearest in
`heist_launcher-far.png`, where the rig reads plainly against the planet limb — but in
`close`/`default` the plasma dominates the centre of frame. These three are therefore adequate to
show the launcher *exists, is authored and is reachable*, and are **not** adequate as a clean art
verdict on its appearance. The catcher, fence and cue stills carry no such caveat.

This is content behaviour, not a harness defect or a product defect: approaching the surface launcher
genuinely does put a ship in reentry, which is itself useful information for whoever reviews the
route. Metadata alone would not have revealed it — the first capture run reported
`presentationAdmission: ready`, `authoredAssetState: authored`, `visibleMeshes: 1` for a frame in
which the facility was entirely invisible behind plasma.

### Launch cue

`launch-cue-tminus.png` — the one-voice floor pill reading
**"TETHYS SURFACE LAUNCHER: CARGO LAUNCH IN 30S"**, alone at top centre with no competing pill.
Cue moments observed live on the route, in order: `t_minus_30`, `t_minus_15`, `t_minus_5`, `away`.

### In-flight capsule

`cargo-capsule-inflight-{close,default,far}.png` — zoom 71 / 86 / 119, separation 40 WU,
`presentationAdmission: ready`, `authoredAssetState: authored`,
`authoredPayloadAssetId: pod_cargo_container`. Genuinely downrange: `travelledFromLauncher`
1140.8 WU, speed 52.3 WU/s at the moment the clock was stopped.

**Earlier scoped limitation:** the receipt's original capture produced wide capsule framings at
screen-space NDC `0.31`–`0.68`; only `far` landed inside the harness's `0.62` centring threshold.

**Phase H1 one-attempt correction (2026-07-29): the current harness did not reproduce even that
limited result.** All three requested capsule frames record `projectionInFrame: false`, at NDC
approximately `(4.4, 6.7)`, and the pixels show the player/traffic/planet effects rather than a
judgeable capsule. Classified **HARNESS**, not product: the same run launched a real capsule 1257.5
WU downrange, and the sibling functional collector observed it `ready` / `authored` / visible at
default and far with 3,776 subject triangles. Per the H1 one-attempt rule it was not recaptured. A
valid capsule art still therefore remains **open**. The committed H1 evidence also corrects another
harness fact: the numeric `seed` written by the stills script is metadata only; the ordinary New Game
route never applies it, so it cannot be cited as deterministic evidence.

## Open rows after Phase H1

H1 evidence: [`../evidence/h1/row3-pq019a-presentation/EVIDENCE.md`](../evidence/h1/row3-pq019a-presentation/EVIDENCE.md).

- **GPU admission and residency: CLOSED / FUNCTIONAL PASS.** The real D3D11 route sampled all four
  subjects. Launcher/catcher/fence were `ready` + `authored` at close/default/far; the capsule was
  pending/invisible at the first close sample, then `ready` + `authored` + visible at default/far.
  Every admitted subject used a static-batch surface, not an instance proxy.
- **Draw-call and shader-program counts: CLOSED / FUNCTIONAL PASS.** Per-frame draw ranges were
  launcher 51–57, catcher 49–55, fence 50–61, capsule 37–39; program counts 101–115 across the route.
  These are counts only, not performance claims.
- **Representative matched performance: OPEN — H3.** No frame p95/p99 or hitch measurement is cited;
  H1 ran contended by design. `presentation-counts.json` contains no timing field.
- **Electron parity: OPEN.** H1 row 3 was the batch's Browser presentation route; no PQ-019A Electron
  presentation parity was requested or run.
- **Independent human art verdict: PARTIALLY READY — H2.** Launcher/catcher/fence stills are ready for
  human review. The capsule verdict is blocked because the one allowed H1 attempt missed the moving
  subject at all three requested framings (HARNESS). A future valid capsule capture is required.

Also still open from the packet's own list, unchanged by this work: solver-level PAYLOAD-only
collision-group exclusivity, and the two broader Phase A checkboxes those rows gate.

Per the packet, this route excludes Ceres, so it produces no Cathedral damage/recovery claim; that
proof stays with `PQ-023.gold-corridor-required-cues`.

## Disposition

**PASS** on what is claimed: the launch-schedule cue is implemented, deterministic, one-voice
compliant, sim-inert, flight-only, focused-green at 19/19, and demonstrated on the live player route
with the pill photographed on screen; `check:sim:compare` is `hashEqual`. Every row requiring the
PQ-034 lease, and the human art verdict, is listed above as unclaimed. Two limitations found by
looking at the pixels rather than the metadata — reentry plasma over the launcher stills, and the
off-centre capsule framings — are stated at their claims rather than smoothed over. One inherited red
(`check:one-voice`'s stale registry source-string) is attributed to the base commit with evidence and
was not chased or modified; `check:baseline` is green on the final tree.
