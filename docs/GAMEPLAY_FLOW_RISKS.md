# Gameplay flow risks — manifest, investigation playbook, calibration levers

<!-- LIFETIME: LIVING REFERENCE. Update as suspects are confirmed, fixed, or cleared. -->

2026-09-16. Commissioned after the tow-tether camera flapping fix (`19cc3dd82`) and the camera
flap governor (`536d4f0c0`): the owner asked for the game-wide list of dynamics that could "screw
up gameplay flow" the same way, and how to investigate and calibrate toward sleek, responsive,
intuitive, fun.

**This doc does not own flight/combat guts or frame budgets.** Those have doors:
flight/combat feel bars live in [`../design/FEEL_CONTRACT.md`](../design/FEEL_CONTRACT.md)
(PQ-137 — "answer with a bar and the number that moved"); hitches live in PQ-204
(PERF_ADVANCED_CAMPAIGN); "it's not fun" routes through FUN_CONVERGENCE_LOOP. This doc owns the
**cross-cutting flow hazards** those doors don't inventory: oscillating switches, involuntary
tempo/agency theft, feedback over/under-delivery, and the input-detachment chain. Camera
auto-behaviors have their own manifest: [`CAMERA_AUTO_MODES.md`](./CAMERA_AUTO_MODES.md).

Evidence basis: four read-only code sweeps (2026-09-16) + `docs/COMMON_BUGS.md` history +
hand-verification of the top claims. Items marked **verified** were confirmed in live code by a
human-equivalent read; the rest carry file:line and await the probe numbers in §5 before any
change is made (owner rule: skeptical of agent-labeled bugs — verify first).

---

## 1. The five flow-killer families

Every known "wonky" incident in this repo reduces to one of these:

| Family | Shape | Founding incidents |
|---|---|---|
| **F1 Oscillation** | A continuous signal gates a discrete switch with no band/dwell/incumbent rule → chattering, strobing, or latch-looping. | Tow-tether camera flap (fixed); friendlies-hostile-on-spawn churn (COMMON_BUGS §2); the AI findings in §2. |
| **F2 Tempo/agency theft** | The game slows time or denies control involuntarily, repeatedly, or without telegraph — the sim stops answering the stick. | Flyby slow-time + hitstop stacking (§3); the cruise chip-damage denial loop (§3). |
| **F3 Feedback misdelivery** | Firehose (many voices at once, trauma pinned at max, floaters stolen mid-read) or silence (big outcomes with no cue). | §4: career-rank silence; furball FOV/hitstop churn. |
| **F4 Detachment** | Input→visible-response chain acquires lag or a hidden writer (slow-time stretch, assist absorption, post-threat camera easing). | §5: slow-time stretches input sampling ~2.9×; autopilot absorbs sub-0.08 input. |
| **F5 Pacing dead-zones** | Progress stalls silently (rank-ups with no cue, payoffs with no sound, denied travel with no counterplay read). | §4 silence findings. |

## 2. F1 — Oscillation suspects (worst first)

Two HIGHs share one root cause: **combat doctrine consumes raw continuous signals with single
thresholds and resets its phase machine on target loss.**

| # | Suspect | Where | Signal / threshold | Missing safeguard | Player-facing scenario | Sev |
|---|---|---|---|---|---|---|
| 2.1 | Tether-raider tow abort on spring slack | `src/ai/combatDoctrine.js:356`, tag minted `src/systems/aiPorts.js:1021` | slack ≥ 6 WU, per tick, no dwell/band | Any slack breath permanently aborts the tow → lunge/grab/flee loop every ~4 s; raiders can never hold a tow in a circling duel | HIGH **(verified shape; numbers await probe)** |
| 2.2 | Doctrine confidence gate resets attack state machine | `src/ai/combatDoctrine.js:97` (`confidence < 0.55`), phase reset `:169-171`, signal `src/systems/aiPorts.js:1415` | Same 0.55 enter/exit, no band, no incumbent hold | Circling at mid-sensor range sawtooths confidence → telegraphs cancel and restart; the enemy "looks broken" for the whole duel; also feeds `squad.js:202` | HIGH |
| 2.3 | `vectorReversed` instant tow-break | `combatDoctrine.js:357`, `:951-954` | closing speed > 90, no dwell | Player pumps reverse/forward to shed any raider's line on demand; NPC-vs-NPC lines shear randomly on passes | MED-HIGH |
| 2.4 | Squad focus target has no stickiness | `src/ai/squad.js:341-355, 474-478` | argmax of continuous score, tie-break only | Two crossing hostiles flip the whole squad's focus per update → synchronized re-target thrash (compounds 2.2) | MED |
| 2.5 | Dock/gate prompt strobing | `src/core/physics.js:814, 806, 792` | distance (and berth speed gate) single thresholds, same enter/exit | Final docking approach holds speed/distance at the gate → prompt strobes at tick rate during the fiddliest moment; overlapping stations flip the prompt target | MED |
| 2.6 | Escort breach-dart pendulum | `combatDoctrine.js:398-429` | hostile ≤ 260 WU of ward, dwell-only exit | Breacher hovering at ~259 WU makes the escort lunge-hold-lunge forever | MED-LOW |
| 2.7 | Heat re-commit without cooldown band | `combatDoctrine.js:463-482` | heat ≥ 0.8, 45-tick dwell, no recommit band | Heat-soaked duelists press/break cyclically | LOW |
| 2.8 | Think-cadence radius flip / weapon-heat bang-bang | `activityScheduler.js:66-84`, `shipDecision.js:378` | same-value thresholds | Ambient jitter / NPC gun duty-cycle; thermal inertia bounds it | LOW |

**Clean bill (verified banded — do not "fix" these):** dynamic resolution (1.5s dwell + 4s
cooldown + 20s probe), AI action executor (incumbent bonus + minCommitTicks + switchMargin),
squad tactic dwell (150 ticks + 0.12 margin), ranged disengager (300/520 dual band), capital
broadside (1100/900), field anchor (220/520), autopilot arrival (terminal one-shot), heat→WANTED
(level decay + zone dwell), scanner ghost stages, cloak band (≥0.12 / ≤0), auto-target incumbent
rule, encounter director pacing gates, faction aggro (discrete events), massline snap policy
(COMMON_BUGS §9: ordinary lines never auto-break).

**Calibration lever (one shape clears 2.1–2.4):** enter/exit bands on the signal (e.g., abort tow
only above 6 WU slack *sustained ~0.5 s*, or above 10 WU; re-commit only below 3) + an incumbent
margin in target selection ("keep the current target unless the challenger is ≥25% better"), the
same pattern squad tactics already use.

## 3. F2 — Tempo and agency theft

**Verified invariants first (these are GOOD, keep them):** no mechanism takes the stick from the
player (tumble/hitstun/RCS-disrupt are hard-gated NPC-only — `tumbleStates.js:211, 91-94, 302`;
`collisionConsequences.js:177`); timeEffects composes by **min(), never multiply** (a stack can
never go below the deepest single request; clearing one source never reveals another's pause);
the scripted ambush snare (`encounterScripts.js:431-450`) is the model citizen — ≥1 s telegraph,
one snare max, vector-break counterplay.

| # | Suspect | Where | Numbers | Scenario | Sev |
|---|---|---|---|---|---|
| 3.1 | **Cruise drop on ANY damage** — no amount threshold, no cooldown | `src/systems/cruise.js:23-26, 11, 93-102` **(verified)** | Any damage packet drops cruise, wipes up to 3.0 s of charge, arms a 0.5 s 60%-yaw stumble; every hit re-arms | A long-range scout plinking once per ~0.6 s permanently denies cruise travel and keeps yaw sticky, zero counterplay but killing the scout. Drop-on-hit is *authored design* (header comment); the missing piece is a threshold + re-arm cooldown | HIGH **(verified)** |
| 3.2 | **Flyby Focus involuntary slow-time** — player cannot refuse or exit early | `src/systems/flybyFocus.js:18-30` | 3 s at 0.5×, 4 s global / 14 s per-target cooldown, no early exit, not motionReduce-gated | A rotating cast of 3+ attackers legally opens a fresh window every 4 s → **up to 75 % of wall time at half speed** without the player asking | HIGH |
| 3.3 | Anchor snare field — unbounded drag | `src/data/fields.js:224-234` | radius 235, damping 3.2/s, `durationS: Infinity`, player explicitly NOT excluded | The whole encounter plays in slow motion until the anchor dies or the player escapes 235 WU | MED-HIGH |
| 3.4 | Ungated combat juice on distant fights | `src/render/feel.js:882-918` **(verified, corrected)** | Armor/hull hits: FOV punch only, no freeze. Shield breaks 0.04 s and big hits/kills (≥25 dmg) 0.033–0.0715 s hitstop fire for **any** combatant anywhere — no player-involvement gate, no rate limit (only the collision path has one, 0.18 s) | In a kill-heavy furball, kill hitstops (~4/s × 0.06 s ≈ 24 % duty) plus shield-break dips pin the sim near 0.12× at moments the player did not cause; the FOV envelope twitches on every background hit | MED-HIGH |
| 3.5 | Jump interdiction — RNG fight start | `src/systems/world.js:3146-3160` | up to 60 % chance per jump, no per-jump warning | Post-jump ambush with no read on the dice | MED |
| 3.6 | Trauma saturation under sustained fire | `src/systems/combat.js:510-511` + additive clamp at 1.0 | several emitters add 0.2–0.9 with no per-second budget | Camera reads as continuous max rattle rather than discrete impacts | MED (verify emitter scoping first) |
| 3.7 | Hitstun re-trigger extends without diminishing returns (NPC-side) | `src/combat/impulseKernel.js:65-83` | `max(existing, now+T)`, 0–3.5 s | NPCs can be permanently stunlocked by sustained fire — matters for feel of NPC combat, not player agency | LOW |

**Worst legal tempo case (agent calculation):** flyby 75 % duty at 0.5× + held bullet-time (0.35×)
+ kill hitstop ≈ **mean 0.55× sim speed for an entire fight, 75 % of wall time involuntarily
slowed**, with instants at 0.12×. The single biggest tempo thief is 3.2's duty ceiling.

**Calibration levers:** damage threshold + re-arm cooldown on cruise stumble (3.1); a global
slow-time duty cap (e.g., ≤ 40 % per minute) plus a motionReduce/held-key refusal for flyby
(3.2); player exposure cap or exclusion on anchor snares (3.3); player-involvement or distance
gate on hitstop + a per-second juice budget (3.4); pre-jump interdiction read (3.5); trauma
per-second budget (3.6). Several of these are owner feel calls, not bug fixes.

## 4. F3 — Feedback firehose and silence

The orchestrator pipeline (per-tick lane budgets, relevance floors, dedupe windows), the toast
receipt lane (2 cards + 2.5 s grouping), the one-voice alert arbiter, and the 12-voice audio pool
are well-defended. The damage concentrates *outside* that fence:

| # | Suspect | Where | Scenario | Sev |
|---|---|---|---|---|
| 4.1 | **Career progression is completely silent** | `src/careers/ladders/ladderShared.js:38-45` (events have no presentation consumer); `economy:grantCredits` (`src/systems/economy.js:742`) has no feedback of its own | Player ranks up mid-flight: nothing on screen, no sound. The biggest progression payoffs are mute | HIGH |
| 4.2 | FloatingText pool starvation | `src/ui/floatingText.js:90-115` | 56-node pool, ~20-30 spawns/sec in a furball → damage numbers stolen mid-read exactly when needed | MED-HIGH |
| 4.3 | Module install success is silent | `src/systems/ships.js:1935-1969` (failures toast; success doesn't) | The third-biggest credit sink has no chime (research/purchase already got theirs — `audioSystem.js:1249-1252`) | MED |
| 4.4 | Faction tier crossings land numeric-only | `src/ui/floatingText.js:204-208`, `src/ui/factionStanding.js` | Dropping into Hostile weighs the same as +1 rep | MED |
| 4.5 | Deaf players get no world-lane captions | `src/systems/presentationAdapters.js:395-398` | NPC-vs-NPC combat (relevance ≤ 0.72) has audio but no caption fallback | MED (a11y) |
| 4.6 | Survival level-up systematically dropped | `src/systems/survivalAnnounce.js:457-464` | Leveling during the loud wave (when it happens) is unspoken | LOW-MED |

**Calibration levers:** give the ladder/module/tier crossings a receipt (they already emit events
— this is listeners, not new systems, the Feel Contract A12 pattern); raise or aggregate the
floater pool under load; captions for the world lane under an accessibility flag.

## 5. F4 — Input detachment and hitches

The frame is structurally clean in combat (production matrix: p99 33.3 ms, zero frames over
50 ms; external scheduling gaps — the browser not delivering a beat — own 379/385 measured
hitches). The live risks are in the *chain*, not the frame:

| # | Suspect | Where | Scenario | Sev |
|---|---|---|---|---|
| 5.1 | **Slow-time stretches input sampling ~2.9×** | `src/core/simulationRunner.js:46-52` | At 0.35× bullet time the sim ticks at ~21 Hz wall; a press can wait ~47 ms to be sampled and all responses unfold stretched. Nothing measures this | MED (unmeasured, feels like "sticky" exactly during drama) |
| 5.2 | Cryo Lock — deepest stick-detach | `src/combat/cryoLock.js:8-10`, `flightV3.js:318-325` | All authority ×0.35 for 1.5 s (×0.20 stacked), triggered by enemies mid-fight | Deliberate mechanic, but the largest "detached stick" source; worth a feel verdict, not a silent tune |
| 5.3 | Autopilot absorbs light input | `flightV3.js:817, 826-837` | While autopilot flies, manual input under 0.08 silently does nothing (no partial hand-back) | Taxiing off-route feels like the stick is greased |
| 5.4 | Camera keeps composing after the threat dies | `src/render/camera.js:61-63, 1445-1447` | ~0.6-0.8 s of bias/zoom ease continues after the fight — the frame "flies itself" as input resumes | LOW |
| 5.5 | Mid-combat hitch suspects (measured machinery already mitigates) | admission slices non-preemptible `admissionSliceBudget.js:7-37`; new-hull first compile (mitigated: `nextContactWarm`); autosave ~10 s `saveSystem.js:82`; per-tick kernel allocations `propulsionKernel.js:104-131` | Owned by PQ-204; listed here so flow probes can correlate | Route to PQ-204 |

**Calibration levers:** measure first (§6), then decide. 5.1's honest fix is measurement + a
floor (e.g., never sample input slower than ~45 Hz wall during slow-time); 5.3 is a small
hand-back curve.

## 6. Investigation playbook (numbers, not captures — owner rule 2026-09-16)

All of these are printed-number probes on fixed seeds; headed captures are never the gate.
`scripts/probe-runtime-witness.mjs` is the designated instrument — extend it, don't build a
second harness.

1. **Flap counters (F1):** transitions/min per audited switch (doctrine phase, doctrine target,
   squad focus, dock prompt state, tow state). A stable duel should show ~0; > 6/min flags the
   switch. Seed 4242 circling-duel scenario; print per-switch tables.
2. **Tempo ledger (F2):** per combat minute, wall-time fraction with effective timeScale < 1 and
   < 0.5, attributed per timeEffects source; stumble-uptime %; cruise-denied time under a
   scripted 0.6 s-interval chip-fire harasser (expect ~100 % — print it, then re-print after any
   3.1 calibration).
3. **Feedback census (F3):** cues/sec per lane during a 90 s Crucible furball + trauma
   time-above-0.8 fraction; and the silence half — an assertion-style checklist that each of
   {ladder step, module install, faction tier crossing} produced ≥ 1 receipt event.
4. **Latency histogram (F4):** aggregate the existing `inputToPhoton` stamp into p50/p95/p99
   *under combat load* (it has 1 sample today) and once under 0.35× slow-time — the delta is
   the stretch, printed.
5. **Governor synergy:** reuse the camera director's `governorLockS` readout in the witness so
   takeover flapping and these switches report in the same document.

Bar for every calibration change: one number moved in the player's favor, nothing else drifted
(Feel Contract rule D1; fixed seed or it did not happen).

## 7. Proposed first batch (safe set — awaiting owner go)

Ordered by severity-per-risk: each is small, reversible, and measurable, and none changes a
designed feel without an owner verdict.

1. **Cruise chip-damage threshold + stumble re-arm cooldown** (3.1) — e.g., only damage ≥ N%
   of hull drops cruise; stumble cannot re-arm within 1.5 s. Deterministic harasser probe prints
   the before/after denial time.
2. **Juice involvement gate + juice budget** (3.4) — shield-break/big-hit hitstop and the FOV
   punch require the player involved or within ~300 WU; kill hitstop keeps a per-second budget.
3. **Dock/gate prompt hysteresis band** (2.5) — 1.15× exit distance / speed band; removes
   strobing with zero behavior change elsewhere.
4. **AI doctrine incumbent margin + confidence band** (2.1-2.4) — keep-current-target margin and
   sustained-signal dwell; validate with the flap counter from §6.1 (this is the one batch item
   that changes combat behavior, so it ships with before/after duel numbers).
5. **Progression receipts** (4.1/4.3/4.4) — listeners only, the A12 pattern.

Owner feel calls to schedule, not implement blind: flyby slow-time duty cap + refusal option
(3.2), anchor-snare player cap (3.3), interdiction pre-read (3.5), Cryo Lock depth (5.2).
