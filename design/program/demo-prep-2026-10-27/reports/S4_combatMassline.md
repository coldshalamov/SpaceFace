# S4 review: combat / massline / swarm-arena dirty cluster (read-only scout)

Repo HEAD c6d21662f7b. Nothing edited, staged, or committed. Dirty files read via `git diff HEAD`. Tests run serially, one `node --test` per file.

## Verdicts by group

| Group | Files | Verdict | Evidence / gap |
|---|---|---|---|
| Row 491 AI doctrine, reflexes, maneuver | src/ai/combatDoctrine.js, maneuver.js, reflexes.js | LAND-candidate | Null-intent guard at reflexes.js:110-112 covers the later `intent.` reads. Caller maneuver.js:468-478 passes `intent`. fight-read-491 6/6. GAP: live enemy cruise raised (maneuver.js MANEUVER_SPEED_CAPS 72→100, 62→84, 68→92; screen 58→76; clearDeadlock 82→104). Balance change, needs the player-truth gate. Not run. |
| Massline render | masslinePresentation.js, masslineLatchRim.js, masslineReleaseArc.js | LAND-candidate | Wired: vfx.js:10707 (cable radiance), vfx.js:9785-9789 (`input.held = heldActive`). massline-cable-surface 16/16. GAP: cable core width term 0.08→0.80 and sheath 0.55→1.10 (about 10x). Needs chase-camera evidence. Not checked visually. |
| Massline impact damage | src/systems/masslineImpactDamage.js | LAND (balance change) | Recoil 2.5x (MOMENTUM_DAMAGE_SCALE 1/250→1/100), tumble floor 400→300 dp, tumble scale 1/60→1/40. Needed: tracked test zc-a34-guns-nudge imports these names, and at HEAD they are plain `const` (HEAD line 21). The dirty diff exports them. zc-a34-guns-nudge 13/13. |
| Rival rope pool | src/render/racingCourseView.js | LAND (runtime not checked) | Fixed pool of 3, disposed on teardown. Data names verified: state.combat.attachments.byId (src/combat/attachments.js:132), defId tether_standard, raceOpponent.missionId, sourceAnchorLocal. No test covers frameRopes. |
| Swarm arena ladder | src/data/swarmArenaLadder.js | FIX (one defect) | See the census finding below. Live consumer is clean HEAD code: src/systems/swarmArena.js:41, 912, 919, 1190, 1194. Pure data, no RNG or wall clock. crucible-swarm-arena 17/17, zc-a34-arena-ladder 8/8, swarm-mutator-consumers 10/10. |
| sg02 reset skip (D191) | src/core/sg02DynamicBodyOwner.js | LAND-candidate | Only the `_stepFixed` reset path changed (line 1700), plus resetBodyForces wake=false (4262-4263). Every user-force write goes through _applyCommand: addForce 3628, addTorque 3641, `_forcesDirty = true` at 3643 unconditionally. Dirty is also set at creation (1106) and on snapshot restore (707). Subset passes: fixed-yaw 6/6, contact-sanity 9/9, embedded 1/1, craft-heading 3/3. Full sg02-* suite and the perf claim not checked. |
| Look retune | src/data/lookMoods.js, src/render/illustratedSurface.js, src/render/vfxColorLightDirector.js | INCOMPLETE | Big look shifts: base rockFill 0.24→0.85, headlight 420→220, rimGain removed, ambient/fill raised. docs/visual-assets/LOOK.md says to judge with scripts/look-bench.mjs. Not run. No dangling reads: rimGain and sfLampLight have zero remaining refs. |
| Field-force reach | src/render/forceLanguage/fieldForcePresentation.js | LAND (not visually checked) | Reach offset removed. No dangling `reach` in that region. |
| Scarred plate no-sell | src/data/survivalDraft.js | LAND | Both callers handle null (systems/survivalDraft.js:2119-2121; ui/screens/crucibleDraft.js:2316). al-long-3 pins null. |
| Line record log | src/data/physicsLog.js | LAND | Emitter exists: src/systems/lineProgression.js:120. |

Defect read (added lines in src/ai, systems, data, core, render): no Math.random, Date.now, performance.now, console.log, TODO, FIXME, or debugger. Arrays are bounded (fixed pools; constant-keyed Maps).

### FIX: swarm ladder outer radius exceeds the fight census
- src/data/swarmArenaLadder.js: tier 3 (rock_graveyard) `outer: 459`, tier 4 (derelict_yard) `outer: 544`, tier 2 `outer: 391`.
- src/systems/swarmArena.js:208 SWARM_DEBRIS_OUTER = 340; :290 SWARM_DEBRIS_FIGHT_RADIUS = 340+60 = 400. :1159 counts one of our rocks in `mine` only if inFight. :1196-1197 tops up `want = min(target - mine, MAX - mine, 2*MAX - surviving)`. :213 KEEP_RADIUS = 900, so rocks beyond 400 are kept, not released.
- Result: rocks outside 400 wu never count toward `mine`, so the top-up keeps spawning until the 40-rock cap. By area, about a quarter of tier 3 and half of tier 4 land outside the census. HEAD's own comment (old ladder header) says to cap at 390 for this reason.
- Minimal fix (NOT applied): set tier 2 `outer` to 390, tier 3 to 390, tier 4 to 390 in src/data/swarmArenaLadder.js. No code change needed elsewhere.

## Test results

| Test | Result |
|---|---|
| hit-answer-channels | 2 pass / 2 FAIL (diagnosis below) |
| crucible-kit-order | 3 pass, 1 SKIP (optional kit comparison, skipped in-test) |
| crucible-swarm-arena | 17/17 (assertions rewritten to TIER1; upper bound loosened from `<= SWARM_DEBRIS_TARGET` to `<= TIER1.target + 5`) |
| feel-kinetic-crunch | 9/9 |
| fight-read-491 | 6/6 |
| fight-read-492 | 5/5 |
| massline-cable-surface | 16/16 (relation asserts rewritten, stricter) |
| pq-032-00-set-pieces | 4/4 (beat set cut 3→1; beat-1 rewritten from wrecking ball to alloy run) |
| pq-163-04-cliff | 4/4 (beat-1 "knock / wrecking ball" asserts replaced with "weigh / alloy run") |
| pq-178-03-ledger | 7/7 (told-count assert replaced) |
| weapon-force-table | 5/5 |
| weapon-impulse-consequence | 21/21 |
| gfx12-admission-standin | 14/14 (admissionStandInPending asserts replaced) |
| encounter-barks | 1/1 |

No test cases were deleted. The changed tests were rewritten to match new content. pq-032-00 and pq-163-04 change mission beat content (beat-1 becomes "weigh" / alloy run). Where that src lives was not traced, so the owner should confirm the content change is intended.

Extra runs: zc-a34-arena-ladder 8/8; zc-a34-guns-nudge 13/13; swarm-mutator-consumers 10/10; adversarial-combat-feel 21/21; feel-chain-beat 3/3; sg02 subset (4 files) all pass. feel-damage-player-involvement 9/11 (2 FAIL, lines 70 and 89, same cause as hit-answer). floating-origin-rapier 3/4 (FAIL line 84, angvel after rebase). That path is not touched by the dirty sg02 change, since the change is only in `_stepFixed`, which this test never calls. HEAD was not run, so the cause is unverified.

## hit-answer-channels diagnosis

Not the pooled payload (a3b359bf0f). Root cause: commit 8cad9e30298 (2026-10-26, in HEAD) changed the feel.js combat:damage handler. Player-caused hits (`attackerId === playerId`, target not player, not isPlayer) now take a `playerCaused` branch (src/render/feel.js ~1377-1388). That branch runs `_applyWeaponKick` and then `return`s before `resolveKineticCrunch`. The FOV punch and beat window come only from `_trigger` (feel.js:1948; `_beatTimer` ~1958, `_fovPunch` 1960). Those are reached only through the crunch, shield, armor, and hull branches, which the early return now skips.

Ruled out: the pool. The handler reads `p` synchronously inside bus.emit. The receipt is found (line 203 passes), and the armor/hull test passes off the same payload. `attackerId` is set at src/combat/damage.js:442.

Two different things fail, and they need different fixes:

1. **wpn_concussion_cannon_m (line 224): stale assertion.** Its player-fired kick and hold do exist (momentum 920 × delivered ≥0.25 clears the 160 floor). Only the FOV expectation is stale, because 8cad made player-caused hits silent on FOV by design. Fix: assert `ctrl.impactKick` and `ctrl.hold` instead (stub `state.render.cameraCtrl` in wireLiveChannels, ~line 116), and assert `feel._fovPunch === 0`.

2. **wpn_autocannon_m (line 227): real gap in the PQ-210.04 four-channel contract.** `IMPACT_KICK_MOMENTUM_FLOOR = 160` (src/render/feel.js:223). The autocannon's impulsePerHit is 48, so its maximum momentum is 48 × 1.25 = 60. `impactKickFromMomentum` returns 0, so `kickWu` is 0 and `resolveWeaponImpactKick` returns null (feel.js ~306-318). A player-fired repeater hit therefore gets no kick, no hold, and no FOV tick. Before 8cad, the crunch tick path supplied the FOV punch, which is why the test passed then. 8cad removed the autocannon's only camera answer.
   - Decision needed: a repeater's player-fired hit needs some camera answer, or the four-channel contract needs an explicit exception. This is a feel judgment. Minimal option (NOT applied): in the playerCaused branch, when the kick is null, fall through to a bounded FOV tick from `resolveKineticCrunch`.

Also: feel-damage-player-involvement lines 70 and 89 use synthetic receipts with no weaponId. There `weaponImpulsePerHit` is null, so the kick is null and the FOV expectation fails. Same cause as (1) and (2).

## Not checked
- look-bench, player-truth gates (swarm, massline, AI modes), check:baseline, expected.json goldens against the Row 491 speed retune.
- The full sg02-* suite and the D191 perf claim. Racing rope runtime. HEAD run of floating-origin-rapier. The content source for the pq-032/pq-163 beat rewrite.
- Whether SWARM_DEBRIS_KEEP_RADIUS (900) causes churn once tiers are clamped (not needed after the fix).

## Summary
1. Most of the cluster is LAND-quality. Sim code has no Math.random or wall-clock use, and every changed test passes except hit-answer.
2. FIX: swarm ladder tiers 2-4 have outer radii above the 400 wu fight census. Clamp them to 390 in src/data/swarmArenaLadder.js.
3. hit-answer-channels: the concussion failure is a stale FOV assertion. The autocannon failure is a real loss of its only camera answer (kick floor 160 vs max 60 momentum). That needs a feel decision, not just a test edit.
4. Balance and look changes (Row 491 enemy speed, massline widths, lookMoods, swarm ladder, massline recoil) need the player-truth or look-bench evidence before landing. None was run.
5. floating-origin-rapier fails one assertion. The dirty diff does not touch that path, but HEAD was not run.
