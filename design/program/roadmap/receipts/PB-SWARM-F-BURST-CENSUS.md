# PB-SWARM-F — SF-063 + SF-069: pressure-reservoir burst verify + stranded/displaced survivor census

Board row 102 (`build_map.md` §1C, CHECK pair; packet files verified clean pre-row). Packets:
`design/planbank/SpaceFace_Planbank_300/plans/05-swarm/SF-063-earned-breathing-room-that-survives-burst-kills.md`,
`.../SF-069-cleanup-that-never-lies-about-surviving-enemies.md` + `domains/05-swarm.md` + `EXECUTION_CONTRACT.md`.

**Verdicts:**
- **SF-063 — already satisfied.** CHECK boundary NOT reproducible: the pressure reservoir survives
  same-step bursts through every mechanism the packet asks for. Closed with executed evidence, not
  rebuilt (packet's equivalent-feature gate).
- **SF-069 — boundary reproduced at the census seam; minimum mechanism implemented.** The displaced/
  disabled/offscreen acceptance cases already hold, but a kill receipt for a **demonstrably live**
  cohort holder resolved its slot and cleared the wave with `survivors: 0` — a manufactured kill.
  One guard line, aligned with the destroyed path's existing law, closes it.

## SF-063 — CHECK evidence (no fix invented)

The reservoir exists (PQ-174.08, `src/data/swarmMode.js:133-256`): `SWARM_CLEAR_KILLS=3` arms a
hold (`SWARM_BREATH_TICKS=240`), pressure stores and one telegraphed group spends
`min(deficit, clamp(stored, BATCH..SURGE_MAX=7))`; the empty-room emergency is explicit
(`swarmReinforceDecision` `swarmMode.js:189`); the reinforce gate is a cooldown since the last
successful refill, so hold accounting runs per tick and the spend lands 4 s after the arm.
Arrivals are hole-clamped everywhere — scheduled dispatch clamps to `concurrent − cohort`
(`survivalWave.js:369`), reinforcements to `min(remaining, decision)` (`survivalWave.js:462`) with
the finite quota `planned − admitted − pending` (`survivalWave.js:458`) — so a same-step burst of K
kills always leaves deficit ≥ K minus any pre-burst hole, and the deficit path arms at K ≥ 3
regardless of kill-ledger rounding.

Probe (`test/pb-swarm-f-burst-census.test.mjs`, real chain runSession+survivalRun+survivalWave+
swarmArena+swarmMode, seeds 4242/8008/13502): **4/4 pass** — 3-kill one-step burst buys the full
breath with the room thinner throughout and one telegraph; same-step replacement + 3-kill burst
never floods and conserves quota; a 5-kill burst spends ≤ the surge ceiling; a 1-kill hole patches
on the ordinary gap with no telegraph.

## SF-069 — reproduced boundary + minimum mechanism

The census itself is honest for the packet's placed cases: cohort membership is identity-bound and
position-independent (`liveCohortCount` `swarmArena.js:236`; cohort entries store the entity object
`survivalWave.js:394`), kills resolve at the kill not the corpse (`_onEntityKilled`
`survivalWave.js:289`), kill-target rounds clear only at `admitted ≥ planned && !pending &&
!cohort.size` (`_checkCleared` `survivalWave.js:543`), displaced survivors hold the wave open and
the published readout still owes them (`run:threatRequested` → `runSession.setThreat`), and legacy
duration rounds carry survivors forward under the explicit inheritance rule (`survivalWave.js:174`).

**The reproduced lie:** `entity:killed` receipts are trusted without an alive check. A receipt
whose holder is demonstrably still alive resolved the slot: cohort `{id:42, entity matches,
alive:true}` emptied synchronously on the receipt and the wave cleared one tick later with
`survivors: 0, killed: 15` while the body still flew (instrumented on seed 13502). The destroyed
path refuses exactly this (`survivalWave.js:273-278` live-occupant guard); the killed path had the
stale-identity guards but no alive check. Reachability on today's route is latent — all four real
emitters mark the body dead before emitting (`combat.js` kill() sets `t.alive=false` before its
`entity:killed` emit; `kernel.js:122` onKill; `damage.js:461` fallbackKill; `careerCohorts.js:476`
is a synthetic balance harness) — but the manufactured-kill hazard is the packet's named failure
("never hang or manufacture a kill"), so the missing half of the existing guard pair is the minimum
complete mechanism, through the existing owner:

```js
// survivalWave.js _onEntityKilled, after the existing two guards:
if (holder && holder === entry.entity && holder.alive !== false) return;
```

Counterexample kept in the focused suite: a forged/late receipt for a live occupant must not clear
the wave, and the real death still does.

## Files

- `src/systems/survivalWave.js` — one guard line + comment in `_onEntityKilled` (edited this row). The file also carries foreign in-flight hunks from rows 98/100 (SF-064 debut, SF-072 roster pressure) in `_dispatchDue`/`_reinforceSwarm` — untouched, disjoint.
- `test/pb-swarm-f-burst-census.test.mjs` — new focused CHECK suite, 7 counterexamples (untracked; for the committer).

## Checks actually run (commands and real exit codes)

| Command | Exit | Result |
|---|---|---|
| `node --test test/pb-swarm-f-burst-census.test.mjs` (pre-fix) | 1 | 6/7 — the stale/live-receipt census case failed (the reproduced boundary); first run also failed 3 for a fixture that ignored the finite kill quota, fixed by serving the quota before the census cases |
| `node --test test/pb-swarm-f-burst-census.test.mjs` (post-fix) | 0 | 7/7 |
| `node --test test/crucible-swarm.test.mjs test/pq-174-01-harvest-waves.test.mjs test/round-zero-teaching-bodies.test.mjs test/swarm-pressure-reservoir.test.mjs` (packet-named trio + reservoir seam suite) | 1 | 55 tests, 50 pass; the 5 failures are all in `test/pq-174-01-harvest-waves.test.mjs` (duration-completion contract family). Crucible-swarm, round-zero-teaching-bodies and the PQ-174.08 reservoir suite are fully green with this row's guard |
| `[clean-HEAD e824b0a57 worktree] node --test test/pq-174-01-harvest-waves.test.mjs` | 1 | Same 5/7 failures at clean HEAD → **pre-existing planner drift** (legacy timed-round duration law vs the current finite-cohort planner, `swarmMode.js:44` "Legacy timed-plan compatibility"), not this row's guard and not the working tree's foreign hunks. Handed to the swarm-planner seam (rows 97–101 territory) |
| `node --test test/pb-swarm-f-burst-census.test.mjs test/crucible-draft.test.mjs` (final tree state) | 0 | 28/28 |

Not committed (lane contract: the committer lands files). Triage worktree and junction removed.
Determinism: the focused suite is fixed-seed, sim-tick driven; no ambient randomness, no wall clock.
