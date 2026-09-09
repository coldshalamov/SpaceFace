# Universe Atlas & Physical Travel — Release Gate

**Written 2026-07-19 by the independent integration/verification engineer.**
**Authority:** this file defines *done*. It ranks below `01_DECISIONS.md` (which defines *what* is
being built) and alongside `03_LEDGER.md` (which records *where each feature stands*).

This document exists because the program repeatedly proved a component correct in isolation and then
discovered the player could not reach it. Every gate below is therefore written as **an outcome a
player could observe**, not as a call sequence, a flag, a reducer transition, or a green unit test.

---

## 0. How to read a gate

A gate is met only when **all** of its criteria hold **simultaneously**, on a **clean checkout**,
**through the default player route**, across the stated **platforms, inputs, save states and
performance bounds**. Partial credit is not a thing. A gate that passes on one lucky seed has not
passed — see §7 on trials.

Three rules that this program learned the hard way, and which bind every gate here:

1. **Ask the engine its own question.** A gate that needs "is the scene presentable" calls
   `window.SF.authoredVisualReadiness()`. It never re-derives readiness from entity internals. The
   original finish-line blocker was a `ships.every(authoredAssetState === 'authored')` predicate that
   was true in 0 of ~35,000 frames because the engine deliberately never satisfies it. **Never
   reintroduce that shape.**
2. **Do not conflate distinct questions in one predicate.** A pipeline-integrity gate must not also
   gate on asset readiness, and vice versa. Each of the gates below states exactly one question.
3. **Grade the outcome, and state every assumed condition.** If a grader assumes the tutorial is
   finished, the window is focused, or the seed is pinned, that assumption is part of the gate and
   must be written down. An unstated assumption is how a harness ends up measuring a paused game for
   300 seconds and reporting it as a navigation defect (this happened — see `03_LEDGER.md`, D-2).

---

## 1. PHASE 1 — "the map stops lying, and the spine exists"

**Player-observable definition.** A new player starts a game, opens the chart, and everything it
shows about *where things are* is true — in every sector, not just the one at the origin. The
velocity language never blinds them. Turning the ship fires the correct thruster.

| # | Criterion (outcome a player could observe) | How it is graded | Status |
|---|---|---|---|
| P1.1 | In **any** sector, the player's own marker appears on the system chart at their real location, and every mark's course payload flies the ship to the place the mark depicts | `check:map-frames` + `check:atlas-spatial-truth` across all 6 authored origin sign classes, signed offsets, zero tolerance | **met** |
| P1.2 | At extreme speed the screen never whites out, and the centre of the screen stays readable | `check:speed-lines` — hard ceilings on intensity/count/alpha across ratios up to Infinity/NaN, centre exclusion fail-dark | **met** |
| P1.3 | Yawing left fires the starboard-side jets and vice versa, on the ship the player actually flies, for every purchasable hull | `check:rcs-sign-truth` — anchored on integrated torque and geometric bow displacement, never on the input label; mutation-proven | **met** |
| P1.4 | The Atlas index is consumed by something the player's ship actually uses | route follower imports `atlasIndex`; `check:atlas-integrity` | **met** |

**Phase 1 is MET.** It is the only gate in this document that is.

> **Assumed conditions, stated:** all four are module- or headless-graded. They do not assume a
> focused window, a pinned seed, or a completed tutorial. P1.1 and P1.3 were mutation-proven in both
> directions, which is why they are trusted without a browser run.

---

## 2. ATLAS — "one chart truth, and adding a place is obvious"

**Player-observable definition.** Every place in the game appears on the chart exactly once, in the
right position, with a stable identity that survives a reload. A content author who adds a new
station sees it appear correctly, or gets told precisely what they did wrong.

| # | Criterion | How it is graded | Status |
|---|---|---|---|
| A.1 | Every authored place resolves to exactly one chart node at its true global position | `check:atlas-integrity` + `check:atlas-spatial-truth` (24 sectors × 5 probes, worst round-trip error 0) | **met** |
| A.2 | Node identities are stable and non-positional across a rebuild, so a save made before a content change still points at the same places | deterministic rebuild assertion in `check:atlas-spatial-truth` | **met** |
| A.3 | Adding a new place has a validated path: a malformed addition fails loudly rather than silently vanishing from the chart | `check:atlas-integrity` + `check:atlas-place-path` | **met** |
| A.4 | Chart queries stay affordable at content scale, so the map does not become the frame budget | `check:atlas:perf` — 273 nodes/71 edges; build 0.9 ms, nearest ×2000 8.9 ms | **met (record-only)** |
| A.5 | **Mission destinations carry a truthful position confidence, and the chart never fabricates a fix** | *no grader exists* — destinations are 2-state (resolvable / absent); the 4 confidence bands are a **sector** property, not a destination property | **NOT MET — needs a ruling** |

**Atlas is NOT met, on A.5 alone.** A.1–A.4 are genuinely met. A.5 is not a missing test; it is a
**mismatch between the acceptance language and the implemented model**, and it needs a dated ruling
(§8), not a silently-lowered bar.

> **Assumed conditions:** A.4's numbers are wall-clock on one Windows machine and are **record-only**,
> not thresholds. They guard against an accidental O(n²), not against a regression of 20%. Do not
> promote them to a blocking budget without re-measuring on the CI target.

---

## 3. CONTINUOUS MAP — "concentric scales of one world"

**Player-observable definition.** Zooming from the player's cockpit out to the whole galaxy feels
like *zooming*, not like switching between three different screens. The player is never lost, at any
scale, anywhere — including deep space with nothing nearby. The chart answers *where am I, where am I
going, and why*.

| # | Criterion | How it is graded | Status |
|---|---|---|---|
| C.1 | Crossing a zoom threshold preserves what the player was looking at, so scale changes read as zooming | `check:map-camera` — cursor-anchored zoom across 4+ decades, `focusGlobal` preserved | **met** |
| C.2 | The player marker never disappears at any scale, including outside every zone radius | `check:map-never-lost` | **met** |
| C.3 | In deep space the chart gives a real address ("HELIOS ↔ TETHYS TRANSIT — 62%, 340 WU off-axis") rather than blank space | `check:deep-space-address` | **met** |
| C.4 | The chart answers **position, mission, destination and next leg** for the player's live journey | `check:journey:textile` step 3 — **FAILING**: the chart publishes POSITION and TRACKING rows but does not answer *destination* or *next leg* | **NOT MET** |
| C.5 | Selecting a destination opens an inspector that says **why** the player is going there, not merely where it is | `check:journey:textile` step 4 — currently indeterminate: the journey's inspector selector matches no rendered element (harness defect D-3), so this is **ungraded**, not proven absent | **NOT MET (ungraded)** |
| C.6 | The player can **compare** candidate routes before committing to one | no affordance exists: `world.computeRoute` returns a single path and the chart renders no alternatives | **NOT MET** |
| C.7 | A selected mark stays selected across a zoom-threshold crossing | *no grader exists* — declared coverage gap | **NOT MET (ungraded)** |

**Continuous Map is NOT met.** The *camera* half (C.1–C.3) is met and well-proven. The *information*
half (C.4–C.7) is not: two failing criteria, two ungraded ones. C.6 additionally needs a product
ruling on whether "compare" means a real alternatives affordance or whether the requirement should
narrow to plotting (§8).

---

## 4. ROUTE EXECUTION — "plot, engage, fly, interrupt, recover"

**Player-observable definition.** The player plots a multi-leg course on the chart. Plotting alone
does not move the ship. A separate, deliberate action engages it. The ship then flies the route
through real space — through gates, into the destination sector — while the instruments tell the
truth. An interruption does not orphan the itinerary; the player can resume it.

| # | Criterion | How it is graded | Status |
|---|---|---|---|
| R.1 | Plotting a course does **not** move the ship | `check:journey:textile` step 6 first half — **passes** (drift 30.7 WU, no executor) | **met** |
| R.2 | A **separate** control engages the plotted route, reachable on the default player route | Directly probed: for a **multi-hop** destination, plot and engage are genuinely separate and both work (Engage enabled, "2 legs plotted — ready to fly"). Two real gaps: plotting **dismisses the chart**, and the **default route's destination is one hop**, where only "Set Course & Jump" is offered — a commit with no separate plot step (ledger D-1) | **NOT MET (partial — works multi-hop, absent on the default one-hop route)** |
| R.3 | Under route control the ship physically transits: gate legs produce real jump receipts, and "arrived" means the ship is actually in the destination sector | step 10 grader keys arrival on `world.currentSectorId` and counts jump receipts separately; **not yet reached at runtime** | **NOT MET (unreached)** |
| R.4 | Displayed speed, stopping distance and ETA agree with independently recomputed values while under route control | step 7 grader recomputes all three over 5 samples; **blocked, never exercised** | **NOT MET (unreached)** |
| R.5 | Interrupting a route keeps the itinerary; resuming continues the **same** leg rather than restarting | step 9 grader distinguishes orphaned / restarted / recovered; **blocked** | **NOT MET (unreached)** |
| R.6 | A route survives save → cold reload → Continue in every executor state | `check:route-follower` (module) + journey step 11 (in-flight and docked states only) | **partially met** |
| R.7 | Arriving with a cargo contract completes it and pays out | `check:journey:textile` step 10 fails — but the step docks at the **nearest** station rather than the contract's station, so product-vs-harness is **not resolved** (ledger D-5) | **NOT MET (unattributed)** |

**Route Execution is NOT met, and most of it is genuinely unknown rather than broken.** R.3–R.5 have
never once been exercised against a live route. The single thing standing in their way is a harness
defect (ledger D-17: step 6 hunts for the Engage control in a chart that plotting just closed, and
never reopens it) — the control itself is present, enabled and correct. **Fixing that one harness bug
is the highest-leverage action available to this program**, because it unblocks the first real
end-to-end route execution and with it the truthful-instruments, interrupt and recover criteria.

Do **not** read "mostly unknown" as "mostly fine". A spine that has never executed once is exactly
the thing D1's entry gate existed to prevent shipping on top of.

> **This gate is the Wave 2 entry gate, restated.** `01_DECISIONS.md` D1 required the route follower
> to drive Helios → Tethys end-to-end through the harness *before* Wave 2 began. That never happened.
> Waves 2 and 3 shipped anyway. See §8 ruling R-1.

---

## 5. TRAVEL BURN — "burn ramps the cap toward the ceiling"

**Player-observable definition.** The player presses one key. The drive spools, engages, and the ship
accelerates smoothly toward a ceiling that belongs to its drive family. An instrument shows the
ceiling and the earned cap. Reaching for the brake breaks the burn; steering does not. Disengaging
spends the earned momentum rather than confiscating it.

| # | Criterion | How it is graded | Status |
|---|---|---|---|
| T.1 | A default keybind engages the drive, and it is rebindable including on controller | `NumLock`/`KeyH` in `VERB_BINDINGS`, `l3` on gamepad, and a real rebind row (`settings.js:80`) | **met** |
| T.2 | The drive runs a real Off → Spooling → Engaged → Cooldown cycle in play | `check:travel-latch` + `check:travel-drive`; latch publishes `input.travelDrive` at `input.js:219` | **met** |
| T.3 | Holding boost above the cap never brakes the ship | `check:travel-drive` (RC-4 reproduced numerically before and after) | **met** |
| T.4 | Braking breaks the latch; steering, carving and spinning do not | `travelBrakeBreaks` reads brake + reverse throttle only, never `turnIntent`/`moveX`; pinned in `check:travel-latch` | **met** |
| T.5 | The ceiling and earned cap are **visible on an instrument**, which reveals contextually and fades out again | velocity tape ships (`.sf-vtape__vmax`, `V-MAX <n>`, forced-colors block); **no automated player-visible evidence that it reveals and fades during a real burn** | **NOT MET (ungraded)** |
| T.6 | Drive-tier upgrades raise the travel ceiling | `check:propulsion:authority` drives real Ion/Fusion/Warp fittings through ship derivation and spawn: 472.5 → 543.375 → 614.25 WU/s on one hull, with ordinary propulsion unchanged and no per-tick profile allocation | **met** |
| T.7 | Engaging the burn during a real journey is reachable and useful to a player travelling somewhere | never demonstrated in a live journey run | **NOT MET (unreached)** |

**Travel Burn is NOT met.** The mechanism and upgrade progression (T.1–T.4, T.6) are built, wired
and reachable — the earlier reports that the input and upgrade paths did nothing are now stale and
corrected in the ledger. What remains is player-route evidence that the instrument reveals/fades and
that the burn is useful during a real journey (T.5, T.7).

> **Assumed condition:** every travel-burn behaviour is gated on `travelFlag('travelBurn')`, which is
> `IS_BROWSER` — **true in the browser, false under Node**. That gate is deliberate and protects the
> sim goldens. It also means no headless module test can ever be evidence for T.5 or T.7; those
> require a browser run.

---

## 6. PHYSICAL LANES — "infrastructure you fly along, not a tunnel you teleport through"

**Player-observable definition.** A lane is a visible chain of beacons in real space. Flying it with
the drive engaged makes the player faster because *their own drive* is boosted. A disrupted segment
drops them out at the break, where the people who broke it are waiting. Recovery means physically
reaching the next intact beacon.

| # | Criterion | How it is graded | Status |
|---|---|---|---|
| L.1 | A lane exists as real entities on the Helios ↔ Tethys chord, spaced on the lattice quantum | `check:travel-lanes` + `LANE_HELIOS_TETHYS` | **met** |
| L.2 | Inside a lane with the drive engaged the ship's own ceiling/ramp is multiplied — it is never teleported | `check:travel-lanes`; lane writes only `input.travelDrive.{ceiling,rampMult}` | **met** |
| L.3 | Lane geometry maths is allocation-sane on the per-tick path | The real `travelLanes.update@steady` scenario measured 2,537 → 696 B/op before the final identity-keyed travel-ceiling cache; retained projection/status/traffic storage is on the shipping tick. A predeclared 256 B/op strict ceiling remains for PQ-033 clean-platform evidence. | **production fix met; strict evidence pending PQ-033** |
| L.4 | A disrupted segment collapses the ceiling and drops the player out at the break, decelerating by momentum decay rather than confiscation | disruption seam is wired (`player.travelDrive.disrupted`) and **nothing triggers it** | **NOT MET** |
| L.5 | An ambush is present at the dead beacon | not built | **NOT MET** |
| L.6 | The chart shows segment state in hazard grammar, and the itinerary re-plans over the same edge | not demonstrated | **NOT MET** |
| L.7 | A player flying the default route encounters the lane and benefits from it | never demonstrated in a live journey | **NOT MET (unreached)** |

**Physical Lanes is NOT met.** The *substrate* (L.1–L.3) is real and tested. The *gameplay* (L.4–L.7)
— disruption, ambush, recovery, which is the entire point of D8 — is not built. A lane that cannot be
disrupted is a speed buff, not infrastructure.

---

## 7. Cross-cutting bars that every gate above must clear

These are not optional extras. A feature gate that passes while one of these fails has not passed.

### 7.1 Trials and determinism
- Any browser-journey criterion must pass **3 consecutive clean runs**. The world is seeded from
  `Date.now()` (`src/main.js:86`), so the contract board, obstacle field and encounter placement
  differ every boot. One passing run proves a thing *can* happen, never that it *does*.
  Measured variance: identical 75 s approach windows produced closing distances of **1263 WU and
  90 WU** on two boots.
- Sim goldens must be graded **on the hash string, never the exit code**. `check:sim:compare` exits 0
  while printing a mismatch (ledger G-1). Current accepted actuals: `809df0f6…` and `7e3e114e…`.

### 7.2 Platforms
- Browser **and** Electron. `check:professional-travel:public-route:electron` and the whole
  `check:m6:platform` / packaging family currently sit in the orphan set — **no automated
  platform-parity evidence reaches CI at all**. No gate above may be called met on browser evidence
  alone once its browser half passes.

### 7.3 Inputs
- Keyboard, and controller where a binding exists. Travel Burn declares a controller binding (`l3`)
  that **has never been exercised by any check**.
- No atlas surface has keyboard-only, screen-reader or forced-colors evidence: the forced-colors
  receipt validator is structurally limited to the main menu and Settings, and `semanticShape` /
  `semanticColor` are referenced nowhere in the map. **Map state appears to be carried by colour
  alone.** No gate above may be called met for accessibility.

### 7.4 Save states
- Every gate must survive quick-save → cold reload → Continue at **representative** states.
  Currently proven: in-flight (pre-mission) and docked-with-contract. **Not proven: mid-route,
  post-interrupt, and post-arrival** — precisely the states most likely to break.

### 7.5 Performance
- No per-frame allocation on sim/render/UI hot paths (`design/PERF_BUDGET.md`). The former lane path
  built projection/status/signature/traffic containers every tick. Its real steady scenario measured
  2,537 → 696 B/op before the final immutable-profile ceiling cache; the shipping path now retains
  all of those values and PQ-033 owns one clean-platform run against the predeclared 256 B/op ceiling.
- There is **no budget line anywhere** for map render, marker layout, route calculation or lane
  streaming. Marker declutter is measured at 2.1 ms per frame at 400 candidates (~13% of a 16.7 ms
  frame). A budget must be set from the recorded baselines before Continuous Map can be called met.

### 7.6 Gate integrity
- `check:gate-reachability` must stay green: 27 pinned must-gate checks reachable, no new orphan.
- A check that runs in no aggregate is not evidence. 238 `check:*` scripts remain orphaned
  repo-wide; that number may shrink, never grow.
- **A gate measured through a pipe is not measured.** `… | tail` reports `tail`'s status. Every exit
  code in this program is taken unpiped.
- **A headed browser gate must hold the foreground.** These gates pause when the game's pause screen
  takes over, and a paused game produces a *perfectly plausible* frozen reading — this cost the
  program one entirely misattributed P1. Any journey grader must record `mode` and a paused-frame
  count alongside its result, and must never grade a paused frame.

---

## 8. Rulings required — the program cannot close without these

These are decisions, not work items. Each one is a place where the acceptance language and the
implemented reality disagree. Per this program's own rule, a requirement that turns out to be wrong
gets a **dated ruling**, not a deletion.

| # | Ruling needed | Why it cannot be deferred |
|---|---|---|
| **R-1** | **D11's finish line is unreachable as written.** There is no authored textile mission anywhere in the tree; the only route to a textile cargo contract is the procedural board, seeded from `Date.now()`. A check required to be "green on a clean checkout" cannot depend on that. **Either** author a deterministic textile contract **or** re-anchor D11 on an authored mission (e.g. campaign47a B1, "deliver sealed alloys to Tycho"). | This *is* the finish line. Until it is ruled on, the program has no reachable definition of done. The journey harness currently substitutes an equivalent cargo haul and says so out loud — that is honest instrumentation, not a satisfied requirement. |
| **R-2** | **Does "compare and plot" require a real route-alternatives affordance** (C.6), or does the requirement narrow to plotting? | One plotted Dijkstra path with nothing to weigh it against cannot satisfy "compare" under any reading. Either build alternatives or narrow the wording. |
| **R-3** | **Mission-destination position confidence** (A.5): adopt the 2-state model the code implements, or build per-destination confidence as an atlas feature with its own packet. | The four-state model in the acceptance language describes something that does not exist and never did. |
| **R-4** | **The Wave 2 entry gate was jumped.** D1 required a live Helios → Tethys route execution before Wave 2. It never happened; Waves 2 and 3 shipped regardless. Ratify retroactively with justification, or treat W2/W3 rows as provisional until Route Execution is met. | Several rows currently read as delivered on top of a spine that was never proven to execute. |
| **R-5** | **RESOLVED 2026-08-06 — keep D5's upgrade path.** Engine tiers now author bounded 1.00× / 1.15× / 1.30× Travel Burn ceilings through the ships-derived propulsion profile; the unique Pale-Coil tier authors 1.40×. | The real fitting/spawn check proves progression while ordinary propulsion stays unchanged, and the complete profile is reused rather than rebuilt per flight tick. |
| **R-6** | **Four stale `check:ci` literal-containment assertions are red at HEAD** and cannot ever pass, because they assert that `check:ci` literally contains `npm run check:art` when `check:ci` is a single delegating segment. Fix the assertions to walk the expansion, or restructure. | These are red for a *wrong reason* while the thing they guard is actually fine. That is worse than a plain red: it trains readers to ignore them. **Do not "fix" by adding a literal `check:art` to `check:ci` — that would run the whole art suite twice.** |
| **R-7** | **Is `check:journey:textile` allowed into `check` / CI while failing?** It is currently registered standalone and deliberately excluded. | Wiring a multi-minute failing headed gate into the aggregate turns the whole suite red; leaving it out means the finish line gates nothing. This is a sequencing call for the lead. |

---

## 9. Bottom line

**The ordinary end-to-end journey does not yet succeed.** At HEAD, `check:journey:textile` — the
program's own finish line — records **3 pass / 4 fail / 3 blocked / 1 ungraded**, reproduced across
runs.

What is genuinely, verifiably true: **Phase 1 is met.** The map no longer lies in any sector. The
spatial foundation, the velocity clamp, the actuator signs, the atlas index, the map camera, the
deep-space address, the travel-burn latch and the lane substrate all work and are properly gated.
That is real and it is a lot.

What is equally true, and must not be rounded up: **a player still cannot complete the journey this
program exists to deliver.** They can now dock, take a cargo contract, load it, undock, cross a
sector boundary and arrive. Along the way the chart will not tell them their destination or next
leg, offers no route to compare, and — on the canonical one-hop destination — gives them no separate
plot step at all. The contract then does not complete, for reasons not yet attributed.

Five of the six gates in this document are **not met**. Three of them (Continuous Map, Route
Execution, Travel Burn) are not met on criteria that were **never once exercised against a live
route**, which means their true state is *unknown*, not *nearly done*. Two whole quality axes —
**platform parity** and **accessibility** — have no automated evidence reaching CI for any lane at
all.

**A caution earned three times over during this very pass.** Of the defects inherited into this
review, one headline P0 was false, one P1 was attributed to the wrong system entirely, and one P0
this verifier was himself about to file turned out to be a closed screen rather than a broken
control. In each case the symptom was real and the stated cause was wrong. The recurring shape:
**a plausible mechanism asserted before the isolating run.** Anyone acting on the list above should
reproduce the defect before fixing the system it names — three of them say "unattributed" or
"harness" precisely so that nobody burns a week repairing something that already works.

The correct next move is not another feature wave. It is, in order:

1. **Fix ledger D-17** (one harness bug) so a route can execute end-to-end for the first time. This
   single fix unblocks R.3, R.4, R.5 and journey steps 7–10.
2. **Resolve R-1**, so the finish line is reachable on a clean checkout at all.
3. **Attribute D-5** with a one-line change (dock at the contract's station), before anyone touches
   the economy.

Until a route executes end to end, every row that depends on it is a guess — and this program has
spent enough of its credibility on confident guesses.
