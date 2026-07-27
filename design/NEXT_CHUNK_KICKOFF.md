# SpaceFace — Chunk: "Make the Massline Work"

## What you're building

SpaceFace is a top-down space game about **grabbing things with a rope and throwing them at other things.**

You fly a ship with real mass, in a world of other things with real mass, and your signature tool is the Massline — a Rapier-constrained cable that couples your mass to theirs. Everything else is an elaboration: gravity wells that make things heavy, repulsors that make them light, webs that lash eight ships into one flailing knot, a tractor beam that lets you pick something up and *throw* it. Not a weapon list — a family of instruments answering one question in different ways: **how do I change where mass is and how fast it's going?**

The camera looks down at 60°. That's a readability superpower — you see the whole fight, every rock, the entire geometry, at a glance. The player's hands are on a **keyboard and often a trackpad**, so: no sustained mouse-button holds, no wheel-only affordances, no hover-only information, no gesture needing precision. The look is **grounded grey hulls in a dark void with neon where the forces are** — the hulls are the dark surround that makes energy read. A taut Massline should be the brightest thing on screen.

**This chunk is the good kind of work: the game's signature verb doesn't work reliably, and the fix is mostly already written and disconnected.** You are going to connect it.

Five rules to hold the whole time:

1. **The player has two hands and a trackpad.** Test the input model before the mechanic.
2. **If the player can't see it, it doesn't exist.** A state with no visual is a bug.
3. **Depth comes from combination, not count.** Before adding a system, ask what it lets existing systems do that they couldn't before.
4. **Some things were tuned by hand and must not be "improved."** See the protected-values warning below — this is the fastest way to do real damage here.
5. **The quality bar is a $30 Steam game.** That means quality, not platform work — there is no Steam Deck, don't build for one. It means: don't accept a browser-game standard, don't leave a step half-finished and move on, and spend the inference. Once something is checked off, finding where the laziness crept in gets exponentially harder. Finishing properly the first time is the cheap path.

## ⚠️ Protected values — read before touching flight, the tether, or NPC movement

Most of this repo was written by agents. A smaller set was tuned by the owner, by hand, after living with a specific failure. Full list in build plan §3.5 with the risk register. The three that matter most:

- **`COAST_HELM_YAW_MULT = 1.2`** (`src/core/flight/propulsionKernel.js:32`, gated `:686-691`) — the ship turns better when coasting. Gated on throttle and boost only; **strafe deliberately does not cancel it.**
- **The Massline is deliberately near-unbreakable.** `tether_standard.breakTension = 10500000` (`src/data/combatDefs.js:234`) is a **ten-times** envelope, `automaticBreakPolicy: 'extreme_load_only'`, and the gate at `src/combat/attachments.js:80-90` is fail-closed. It used to snap constantly and that was miserable. Ordinary thrust, boost, slack catch, and botched slingshots **cannot** break a line, and a break deals no damage of its own. If you find yourself designing around lines breaking under load, stop — you are re-introducing a fixed bug.
- **`applyMasslineFlightModifiers` is called only inside `if (isPlayer)`** (`src/systems/flightV3.js:242-246`), and `NPC_INPUT_SLEW = 2.6` (`:41`). These two are what stop enemies being flung around at absurd speed. An earlier build gave NPCs the earned-momentum path "for parity" and nothing could fly. **Do not grant it to NPCs.**

Flight is currently in the best state it has ever been in. Treat it as a working equilibrium. If you must change any protected value, play the result and say so in your receipt — reasoning about it is not sufficient.

## Read these first

- `design/PHYSICAL_PLAY_GRAMMAR.md` — design authority. Read the "The game, in plain language" preamble, §7 (input models), §9.5 (economy/mining), §10 (approaches set aside, with reasons).
- `design/PHYSICAL_PLAY_BUILD_PLAN.md` — §0 (headline: what's built and disconnected), §2.5 (inherited decisions to reverse), §4 (phases).
- `design/AGENT_EXECUTION_GUIDE.md` — how to staff and pace this. §4 especially.
- `AGENTS.md` (root) and `design/program/roadmap/00_EXECUTION_PROTOCOL.md` §7 — the red-check rule changed recently; read it.

Do not read the whole `design/` tree. It's ~60 documents and most are historical.

## The five lanes

Lanes 2–8 are independent and can run concurrently. Lane 1 was blocking for *verification* and **landed on 2026-07-27** — the proof system now tells the truth, and `npm run check:baseline` (14.7s) is the before-and-after gate every other lane should be running. Record your entry baseline with it before you edit anything. **Nothing here may touch `src/systems/input.js` concurrently — serialize any input edits through one agent.** Lanes 6 and 7 both touch `src/render/vfx.js`; serialize those two or split them by function. Lane 8 and Lane 5 both touch mining events; Lane 8 only *subscribes*, so it should land after Lane 5's emitters are stable.

---

### Lane 1 — Truth (start first, solo, frontier model, ~500k context) — **LANDED 2026-07-27**

Nobody could prove anything. Four of the five bullets originally written here were themselves wrong,
which is a fair summary of the problem. Corrected record, with what was actually found and done:

- `npm run check` was a `&&` chain that reported the first failure and skipped the rest — **but it never reached link 1.** `package.json` defined a `precheck` npm **lifecycle** script (`check:m1:tether-mass && check:sim:v3 && check:sim:v3:compare`); npm runs lifecycle hooks automatically, `check:sim:v3` was red, and the chain exited 1 having executed **zero** of its 97 links, for 333 commits, while looking like an ordinary check failure. Not eighteen gates unreachable: **all of them**. ✅ **Fixed** — the hook is deleted and its three gates are the first links of `check` itself. If you ever add a `pre*`/`post*` script here, you are re-creating that bug.
- `check:save-schema` was **green**, not red — but it genuinely was not in the chain, existing only in the hardcoded smoke list at `scripts/check-ci-report.mjs:11-20`. ✅ **Added** to `check`, as its first link.
- Both 47-A golden hashes had drifted, deterministically. ✅ **Re-recorded with evidence, not reflexively.** The `850c80f3` tree was exported with `git archive` (no checkout — other lanes were live in the tree) and re-run; it reproduces both prior hashes exactly. Full 720-tick snapshots from both trees were diffed field by field: 21060 fields moved, 21033 of them the new `$.economy` market-regime model, and **zero** entity pos/vel/rot/angVel fields changed on either controller. The physics contract is bit-identical. The nine trace-count changes are one new `shield.collapse` cue caused by `f277c5e7` setting `DAMAGE_MODEL.subsystemShare 0.75 → 0.35`. The rationale is written into the `notes` of both expected files.
- **`check:sim:compare` was green the entire time and could not have been anything else.** `scripts/sf-sim.mjs:716` explicitly tolerates `expectedHash` and `expectedTraceCount` diffs whenever the two runs agree with each other. It is a determinism check, not a correctness check. Only `check:sim` / `check:sim:v3` gate the goldens. **Still open** — `sf-sim.mjs` was outside this lane's ownership.
- There was no fast gate. ✅ **`check:baseline` exists** — nine links, bounded parallel pool, runs every link even after one fails, per-link timings, exits red on any failure or on blowing its own 90s budget. **Measured 14.7s wall**, 8/9 green. Excludes `check:flight:clean` (~6 min). Routed in the `AGENTS.md` verification router.
- `design/program/NOW.md:35` did **not** claim `check:sim:compare` was green — line 35 is a PQ-021 status row. ✅ Truthful rows recorded there instead.
- `design/GDD_2_0.md` §4.1 said Helm Assist is the default and Space is brake-to-stop. Both false: `src/core/gameState.js:25` is `pilot`, `src/systems/input.js:222` is `tether: ['Space','KeyF']`, `:269` is brake on `Digit0`. §4.3's tether bindings (RMB/G, scroll-to-winch, X to cut) matched nothing. ✅ **Both rewritten** against `src/systems/input.js:220-316`, plus two more falsehoods found in the same pass: §4.2 said cruise engages on Tab (it is **V**) and §4.4 said **F** detonates impulse charges (it is **R**; F is a permanent Massline alias). This is the top of the authority stack — every wrong line propagates to every future agent.
- **New finding, unowned:** `check:massline` runs 23 children fail-fast, so it names only the first red one. It had **three** (`release-feedback`, `threat-feedback`, `whip-feedback`). If an aggregate names one failure, that is a lower bound, not a count.

---

### Lane 2 — Acquisition: the headline (medium context, balanced model)

**The bug:** the live latch is nearest-body-by-distance. That's the whole algorithm. It's why you grab pebbles.

`src/systems/tetherGameplay.js:343-384` — `_acquireCommandTarget`, called from `:232`. No mass term, no swing term, no cursor term.

**The fix is three call sites, because all of this is already written and has zero callers:**

| Piece | Location |
|---|---|
| `_refreshAcquisitionPreview` — produces the live candidate receipt with top-3 alternatives and per-axis contributions | `tetherGameplay.js:282-314` |
| `_updateAcquisitionPreview` — renders a world-anchored label + link line, offscreen clamping, ARIA live region | `src/ui/masslineHud.js:175-227` (and `masslineHud.js:167-168` currently hides it unconditionally) |
| `_consumeAcquisitionReceipt` — latches the previewed candidate | `tetherGameplay.js:316-341` |

The scorer behind them is real: `src/combat/masslineTargetScoring.js` — mass comfort band ideal 120–1200 (`:52-55`), range comfort band 30–75% of 390wu (`:47-50`), five contextual intent profiles (`:90-111`), a Schmitt-trigger stability layer (`:431-486`). Note it **forbids weapon-aim coupling by contract** (`:40-41`) — cursor proximity is opt-in `intentDir` only. Respect that.

Do all three. Calling the first two without the third produces a highlight that lies, because preview and latch would disagree. **The third call is the real gameplay change** — budget feel-testing time, not implementation time. Play it. If the scored pick feels worse than nearest-wins in some situation, that's a finding worth writing down, not a reason to revert silently.

---

### Lane 3 — Gunnery (medium context, balanced model)

Orbiting a tethered enemy — the signature Massline move — doesn't reliably let you hit them. Three independent causes, all firing at once:

1. **Two unreconciled target variables.** Guns follow `state.player.targetId` (written at `src/ui/uiRoot.js:1118`, a nearest-hostile linear scan at `:1092-1126`). The tether follows `state.player.tether.targetId`. Nothing reconciles them, so with any hostile closer than the tethered one you're aiming at a third ship.
2. **The constrained solver switches off exactly when you orbit tight.** `src/systems/weapons.js:399` requires `taut`, but a tight orbit is *inside* rest length and therefore `slack` (`src/systems/tetherGameplay.js:582-591`). So `src/combat/tetherFireControl.js` — the circular-motion solver written for precisely this case, see its header at `:8-17` — is bypassed, and a linear lead is used against a body on an arc. Systematic miss, always to the outside.
3. **One lead solution for the whole battery.** `src/combat/autoTargetMode.js:57-63` takes the *first* weapon's projectile speed and applies it to every mount. A mixed battery (pulse 320 / autocannon 420 / railgun 700) fires all mounts on the 320 solution. `weapons.js:606-610` only re-solves per mount when a gate exists.

Also: `pickMasslineAutoTarget` (`autoTargetMode.js:265-304`) is exported, massline-aware, and **never called**. Decide whether it's the answer or delete it — don't leave it.

Context: the player gets a 360° gimbal arc (`src/systems/ships.js:61, :388`) while NPCs get 22°, so auto-target never needs to turn the nose.

---

### Lane 4 — Doctrine and focus (small context, frontier model for the doctrine judgement)

**Delete the tether penalty.** `src/ai/combatDoctrine.js:406` — `if (contact.tethered) return -100`, plus egress at `:235`. No comment, and its commit (`c875aa40`, "fix(combat): make the opening fair and controllable") has an **empty body**. It's an opening-fairness tweak that became permanent global doctrine, and its effect is that **a web catching eight ships makes all eight uninteresting to the rest of the swarm, which then scatters away from the thing the player just built.** If opening fairness needs protecting, scope it to the tutorial encounter or low-threat cohorts. Consider inverting it — a tethered enemy should read as a free kill.

**Fix flyby focus.** `src/systems/flybyFocus.js` already gates on closing speed (`:174-177`) and holds a cooldown (`:14, :330`). Three changes:
- Make the cooldown **per-target** — it's one global scalar at `:343`; a `Map<targetId, until>` stops a knife-fight retriggering on the same ship.
- **Stop moving the camera.** `src/render/cameraDirector.js:437-452` switches to `FOCUS_PAIR` whenever focus is active — that's the nausea source. Removing it also orphans `focusPairFitsCamera` (`flybyFocus.js:108-126`), which gates *acquisition* on the camera framing the pair; retire both together.
- **Lock the Massline candidate for the focus window.** Today focus forces `player.targetId` (`:318`) and widens `latchScale` (`:24, :324`) into scoring paths that aren't called. Once Lane 2 lands, focus should pin the acquisition receipt.

---

### Lane 5 — Mining: repair three amputations (medium context, balanced model)

These are features that exist in the codebase and were **disconnected**, leaving orphaned cues behind. See grammar §9.5.

1. **The heat/vent rhythm was deleted.** `src/systems/mining.js:126-131` unconditionally `delete`s `heat`, `heatRate`, `coolRate`, `overheated`, `heatMax` **every tick**. Meanwhile `src/presentation/cueRecipes.js:52-53` still declares `mining.heat.overheated` and `mining.vent.ready`, and `src/audio/audioSystem.js:417` still ships `sfx_vent_chime`. Sound effects waiting for a signal destroyed sixty times a second. Restore the state: heat rises with sustained beam, releasing in the amber band grants a real extraction bonus, overheat locks. This is what turns "hold the button" into pulse-timing.

2. **Bulk tether-haul is arithmetically impossible.** `BULK_HAUL_MIN_U = 20` (`mining.js:37`), but chunks generate at `parentYield × 0.35–0.5 ÷ 2–3` and the largest authored yield in the game is 32 — **best possible chunk ≈ 8 units.** So `bulkHaulPayoutForChunk`, the refinery dock handler (`mining.js:851-870`), and the prompt are dead code that **has never executed.** The GDD calls this the loop-lock that makes mining and the tether inevitable. Prefer raising fracture yields (`mining.js:726-731, :751`) over lowering the threshold — a visibly oversized chunk is more legible than a number.

3. **The attention meter has no listener.** `_updateMiningNoise` (`mining.js:946-954`) emits `danger:miningNoise` and nothing in `src/` subscribes. Wire it to `dangerModel.js`. Loud mining should attract interdiction — that's what stops mining being a safe-space minigame.

Two corrections while you're in there: `SEAM_YIELD_OFF` (`mining.js:46`) is named a yield fraction and implemented as a *speed* fraction (see the comment at `:461-467`) — missing a seam should cost ore, not just patience. And `src/data/mining.js:56-88` `ORES[].baseValue` duplicates `src/data/commodities.js:17-32` `basePrice` at **different numbers** — iron is 12 in one and 28 in the other — and `src/ui/help.js:415` reads the stale table, so the game tells new players wrong prices. Delete the duplicate.

---

### Lane 6 — Make the Massline look like the hero (large context, balanced model, **vision model required throughout**)

The rope is the game. It should be the brightest object on the screen and it currently isn't — every effect in the game is mild.

**Read grammar §9.2 and §9.2.1 before touching anything.** The short version: *shape and motion carry identity, colour and brightness carry energy.* That ruling withdraws the restraint mandates in `design/vfx/FIELD_TOOL_READABILITY_BIBLE.md` — its palette allowlist, ≤6-draws ceiling, 2px floor, "boundary never blooms," non-additive mandate, and ten-step review ritual are **withdrawn**. Mark them withdrawn in that file, don't delete it. What survives: the readability goal and the grey-read test, redefined — identity must survive desaturation, and it will, because *silhouette* is now carrying it (Well = rings contracting, Repulsor = rings expanding, Cone = directional wedge, Mass Seed = pulsing point, Skim = sweeping band).

**On occlusion, use judgement, not a rule.** If a lot is happening, effects may briefly obscure a ship and that is fine — it's what a big moment looks like. Avoid only the ridiculous case: a persistent effect hiding gameplay you need to react to for long enough that you lose because you couldn't see. **Do not write a deterministic occlusion test.** This file has already been through one cycle of a reasonable worry becoming a hard rule that made every effect in the game bland. Don't start a second.

**Three blockers to clear first, all documented in build plan §2.5:**

1. `test/post-processing-restraint.test.mjs:26-32` fails the build if the background shader source contains the strings `Micro-stars: hash speckle`, `A few distant galaxies`, `float bandMask`, or `float breath`. **Two of the four match comments, not code.** No cited failure anywhere. Delete those lines. Keep `:12-16` in modified form — the *clamping contract* (bloom strength must not implicitly grade, vignette, or grain the whole frame) is a real resolver invariant; the zero-defaults are taste and belong in a settings default, not a test.
2. `scripts/check-vfx-frame-sleep.mjs:97` requires seven VFX subsystem counters to sum to **exactly 0** when idle. This already refused a real feature — `design/program/roadmap/receipts/PQ-023-propulsion-family-REPORT.md:64-80` records the consequence, *"no always-on idle nozzle glow,"* and the glow's cost was never measured. Rewrite it as a measured ceiling against `design/PERF_BUDGET.md:48` (VFX owns 2.5ms of 16.7ms) so a cheap persistent effect can pass on merit. Delete `:75-84` outright — it asserts that `vfx.js` *source* contains specific private method names like `_miningBeamActive()`, which protects nothing and fails CI on a rename.
3. `src/render/vfx.js:5088-5095` `_bloomRadianceScale` clamps energy radiance to `strength/0.35` in `[0,1]`, so raising bloom strength past 0.35 buys nothing and turning bloom off kills all energy radiance. Lift the ceiling.

**Then the work itself. The capability is already there — the gap is authoring, not tech:**

- HDR is end-to-end already: ACES filmic tone mapping (`src/render/renderer.js:702`), half-float targets (`src/render/bloom.js:486, :493`), and a composite that tonemaps *before* adding bloom (`bloom.js:395-401`) — which is exactly the white-hot core / saturated halo behaviour the direction asks for.
- `src/render/energy/energyMaterials.js` is a shader-driven HDR energy volume system with `toneMapped: false`, additive blending, depth-aware soft intersection, and hot-core-vs-turbulent-halo already modelled at intensities 2.4–6.5. Default on.
- Anisotropic stretch is already in the instanced sprite pool — `vfx.js:1014, :1047` take `aspect` (clamped 0.35–3.5) and `roll`, applied at `:6539`. Particles carry `aTrailAxis` / `aTrailStretch`.

So: **retune, don't rebuild.** The ~35 hand-written effect handlers wired at `vfx.js:831-877` are where the mildness lives. Priorities in order:

1. **The Massline itself.** Tension-reactive colour (cyan → amber → red toward break), a hot core that clips to white with saturated falloff, visible strain, and a violent whip with a trailing streak on snap. It is the signature verb; make it the loudest thing on screen.
2. **Impact and destruction.** Kills should spray light. The loot magnet already exists and works — `src/systems/mining.js:546-618`, range 420, accel 900 wu/s², velocity-inheriting homing built so combat flybys collect. Make the drops *look* like light flying into you and counting up. This is the highest juice-per-hour item in the project.
3. **Thrusters and weapons.** Currently the mildest things in a game about force.

Verify with a vision model at the real game camera — use `python tools/foundry/render_contact_sheet.py` (it extracts the actual camera: FOV 50, 60° elevation, zoom 72, fixed Cycles seed) or `node sx-shot.mjs <labUrl> out.png` against `graphics-lab.html` / `_plumelab.html`. **A change that reads well in a perspective screenshot and not at the game camera is not done.**

---

### Lane 7 — Un-fossilize two checks (medium context, balanced model)

Both from build plan §2.5. Independent of everything else.

1. **`src/render/thruster/systems/familyFleet.js:18` — `FLEET_MAX_SHIPS = 10`**, allocated as a fixed `new Array(maxShips)` slot table (mirrored at `vfx.js:391`). Ship eleven silently loses its thruster VFX. Its commit is `343f0d7c` "checkpoint VP-220 propulsion candidate" with no measurement — it's a prototype buffer size documented as a "hard cap" it never needed to be. Convert to a growable pool like every other pool in `vfx.js`. This is the single hardest blocker on future swarm work and it's an allocation strategy, not a design decision.
2. **`scripts/check-input-modalities.mjs` has 145 source-regex assertions**, freezing things like the gamepad button map as text — rebinding LT, R3, or LB fails CI with zero behaviour change. Its stated goal at `:5-6` is real and important: a refactor can silently drop an input modality and leave controls dead with no error. Keep the goal, change the method — drive the input adapter and assert the verb fires. `docs/POLICY_MANIFEST.md:57` already says to prefer a behavioural regression over source-string policing. Do this one now because the future Rig-slot work will otherwise fight it directly.

**Note:** this lane edits *tests of* `src/systems/input.js`, not the file itself. Coordinate anyway if any other lane is touching input.

---

### Lane 8 — Teach the missions that this game is about mass (large context, frontier model)

**This is the highest-value gameplay change in the whole plan, and it's one array plus one observer.**

The owner's description of the current missions: *"go here, click a thing" / "go here, dock, THEN click a thing" / "go here, RIGHT click a thing."* That's not a content shortage — it's a structural ceiling with an exact location. Read grammar §9.9.

**A mission can express success in exactly two ways today:** `counter >= N` incremented by one of six bus handlers (`src/systems/missions.js:1453`), or `docked at station X` (`:2587`, whose own comment says "boolean-at-dest"). `update()` at `:533` evaluates nothing per frame except the deadline — **there is no continuous predicate hook at all.** So eleven mission types, five set-piece archetypes, nine career contract chains, three ladders, and the POI offer generator all collapse onto the same eleven verbs, and two instances of a type differ only in numbers and proper nouns.

**And the reward loop can't see the game.** Missions subscribes to 26 bus events; exactly one touches the Massline. Roughly sixty physics events are emitted and evaluated by nothing — `tether:strain`, `tether:nearBreak`, `tether:releaseRated`, `tether:whipImpact`, `massline:throw`, `massSeed:locked`, `fields:deployed`, `combat:collisionConsequence`, `cargo:massSettled`, `cargo:fragileLost`, `cloak:engaged`, `heat:changed`, `asteroid:chunked`, `mining:richCoreCompleted`, `drill:break`, `law:custodyTransfer`, and more.

**The work:**

1. Add `conditions: [{event, predicate, count}]` to the mission schema, evaluated by one generic observer subscribing to events that already fire. Generalise the `attachClauses` allowlist pattern at `src/systems/contractClauses.js:42` from five clauses on three events to N conditions.
2. Add a per-tick predicate slot to `missions.js:533`.
3. **Steal the predicate vocabulary from `src/systems/encounterScripts.js`** — it already has exactly the right shapes and none of them are reachable from the mission board: brake within 520wu below 8wu/s for three held ticks (`:38-40`, `:291-297`), break 700wu for two seconds (`:42-43`), centroid radius (`:46`), leave 2400wu for twelve seconds (`:51-52`). Seventeen scripts, used only as ambience. `src/systems/onboarding.js:615-680` is a second precedent — the tutorial already evaluates tether-released-after-reel and burst-heat peaks as completion conditions.
4. Author the first ten physics-aware conditions and put them on existing mission types.

**What this buys with no new mission types:** *deliver 20u by tether without exceeding 40 wu/s* · *recover the core without letting the line go slack* · *clear the field without firing a shot* · *get there with the fragile crate intact* · *break the blockade running dark* · *tow it home before the drift takes it out of the sector.* Same eleven verbs, completely different missions. Risk tier stops being a payout multiplier and becomes a verb modifier.

**Do not add new mission types in this lane.** The whole point is that the ceiling was never the type count.

---

## How to work

- **Probe budget.** Expensive: `check:flight:clean` (~6 min), `check:47a:live-cold-open` (~26s), `check:first-15-runtime` (~33s), `check:market-first-loop` (~31s). **At most two launches per acceptance cell.** If the same failure fingerprint appears twice, stop and reduce it to a seconds-scale deterministic regression before a third. Report `BLOCKED` rather than looping.
- **Red checks get fixed, not inherited.** Per `00_EXECUTION_PROTOCOL.md` §7: record the entry baseline *before* editing; a check green at entry and red at exit is your defect; a check red at entry is repaired or escalated. Whether the test or the code is wrong is your call to make and justify.
- **Do not fossilize taste.** No new source-string scans, palette allowlists, technique counts, or "never do X" rules without a cited observed failure. This repo is already full of them — `check-input-modalities.mjs` alone has 145 source-regex assertions. Don't add more. If you must lock something, write a behavioral regression.
- **Verify doc claims before implementing from them.** The `file:line` anchors above were accurate at 2026-07-26. If one has aged, correct the design doc in the same pass rather than working around it.
- **If you hit a design decision, stop and ask.** If you can't stop, record it explicitly in your receipt under `decisionsMade` — never silently, and never as a new test.
- **Checkpoint your progress to `scratch/`** after each lane phase. If your context is compacted you will lose your sense of elapsed time, and that file is how you recover.

## Definition of done — the clean checkpoint

Play the game and confirm all of these by hand, then write one receipt:

1. **You can see what the Massline will grab before you press**, and it updates as you move.
2. **What it grabs is what you meant** — big things you're flying at, not the nearest pebble.
3. **You can hit a tethered enemy while orbiting it.**
4. **Enemies don't flee the moment you tether one.**
5. **Mining has a rhythm** — heat, vent, pulse — and produces chunks big enough to need the tether.
6. **A taut Massline is the brightest thing on the screen**, its colour tracks tension, and it whips when it snaps.
7. **Killing something sprays light that flies into you and counts up.**
8. **At least one mission in the game asks you to use the Massline and judges you on how you did it.**
9. **Flight feels exactly as it did before you started.** Boost still stacks over distance, coasting still turns better, lines still don't snap, enemies still move like they have mass. If any of that changed, you broke something protected — say so.
10. **`check:baseline` is green.** It exists and runs in 14.7s (budget 90s), and `npm run check` starts at all now that the invisible `precheck` lifecycle hook is gone — but `check:baseline` is red until `check:massline` is, so this line is a real gate on Lanes 2–8, not a formality. `NOW.md` and GDD §4.1/§4.2/§4.3/§4.4 now tell the truth; the withdrawn bible rules are marked withdrawn; `FLEET_MAX_SHIPS` is a pool.

Capture frames at the real game camera for #1–#4, #6, and #7. The whole point of this chunk is that the game's signature verb goes from unreliable to *good* and from mild to *loud*, and both of those are things you can see.
