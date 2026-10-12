# Swarm runtime maturity — ten implemented repairs

Base: `d748312d1f28a1c954b6bbc508749191bee82457` (master, including PR #287).
Scope: admission, arena lifecycle, attack pacing and causal feedback. This is a repair on top of
that overhaul, not a second renderer, UI redesign or replacement physics engine.

## Player contract and implementation

| Priority | Player-visible improvement | Implementation and boundary |
| --- | --- | --- |
| 1 | Arrivals cannot be placed inside a moving asteroid, wreck, station, player or another ship. | `swarmSafety.js` checks closest approach of both collision discs over 0.75 seconds. Canonical ship radii are known before placement. Deterministic local pack search preserves throw-shaped groups; a bounded gate search handles terrain. Initial brood arrivals use the same safety test. This predicts constant velocity, not future AI acceleration. |
| 2 | A blocked arrival stays owed instead of becoming a ghost attacker or a false clear. | Unsafe placement returns an explicit deferred receipt; finite-wave entries retry after 30 ticks. Brood admission retries after 0.5 seconds, but only after the arena releases its opening lesson. Failed ship-budget binding rolls back the entity without a kill reward. No safe location means no spawn, not immunity or distant teleportation. |
| 3 | Early rounds do not suddenly unlock every enemy gun at once. | Initial ship arming time is stamped at birth (2.5 seconds). A per-tick roster grants an independent firing lease to the existing wave-scaled nearest/retaliating attackers. Both the tactical firing boundary and legacy AI respect it. It never deletes another system's encounter hold. Authored champions retain their attack-score exception. |
| 4 | Wave receipts cannot reset a live fight or count a living recycled body as defeated. | Clone mutable schedule/swarm data, ignore duplicate same-wave plan/start receipts, and reject destruction receipts for the still-live current occupant. The last enemy dying after the pilot cannot manufacture a victory. This does not change the existing disabled-hostile retirement contract. |
| 5 | The teaching well does not start a debris blender when no quiet berth exists. | Well placement now fails closed instead of selecting the least-occupied disc. Recheck moving solids when the sleeping well wakes; if the berth is no longer quiet, leave it asleep. Authored arena laws and player-created fields remain active. |
| 6 | Replacement cover cannot materialize into ships or overflow its rock target to complete the material palette. | Before each spawn, recheck the live solid map and swept trajectories. Limit both the material-variety fallback and final spawn loop to the remaining terrain budget. Obstructed placements retry. |
| 7 | A full wipe earns the same breathing room as a three-kill hole. | Remove the empty-board exception only after an earned clear. The existing 240-tick reservoir hold and telegraph remain; initial empty rooms still fill immediately. Scheduled arrivals retain their debt during the hold. |
| 8 | Brood attack tells arrive as readable decisions, not a simultaneous wall of damage. | One attention budget counts windups, committed charger passes and airborne acid lobs together. Caps are 2/3/4 for waves 1–10/11–20/21+, with at least 0.45 seconds between new tells and 1.25 seconds of arrival grace. Committed attacks and their full authored damage are not cancelled. Pools retain their separate authored area-denial lifecycle. |
| 9 | Leecher stacks cannot reverse the player's momentum in one physics step. | All latches share a per-tick braking budget: at most three effective leechers, further bounded by current speed. Impulses use the solver's mass and go through the physics authority. Leechers still attach and walls still shed them. |
| 10 | Enemy/environment accidents do not pretend to be player achievements. | Brood receipts distinguish physical removals from credited kills. Ambient plows, enemy acid and unattributed blasts remain lethal but award no player cash, chain or score. Player impulse provenance, tether interaction and effective player fields preserve causal credit for later slams; charge events carry their existing owner's ID. The recent-interaction window is five seconds. Ship-quota completion and capital-boss death rewards are not replaced by this brood ledger. |

## Verification (Node 22.16.0, repository-vendored Three.js and Rapier)

**38 new regression tests pass**, across:

- `test/swarm-runtime-maturity.test.mjs`: 23 geometry, wave, AI, arena and pacing tests;
  includes 100 seeded crowded-arrival scenarios repeated for determinism.
- `test/swarm-runtime-brood-maturity.test.mjs`: 12 tests, including 900-tick attack-cap runs
  at waves 3, 13 and 31, an 80-leecher stress case, pending spawns and causal payout counterexamples.
- `test/swarm-runtime-rapier-maturity.test.mjs`: 3 tests using the actual dynamic-body owner
  and native collider contacts. Wasps, reavers and a dreadnought remain contact-free for 45 ticks
  while an asteroid crosses the intended gate. No penetration ejection or pilot kick occurs.

The focused suite is **325 passed / 0 failed**, over 39 files. The broader suite is
**337 passed / 6 failed**, over 343 tests in 42 files. An unmodified-base run of the same existing
39 files is **299 passed / 6 failed**. The six unchanged failures are:

| File | Existing failing tests |
| --- | --- |
| `test/survival-wave-disabled-survivors.test.mjs` | Three NXI-074 disabled-survivor assertions. |
| `test/swarm-cover-current.test.mjs` | Two sluice-current field installation assertions. |
| `test/swarm-draft-pressure.test.mjs` | Armory shelf purchase persistence assertion. |

These failures are not suppressed or rewritten. The focused suite excludes those three entire
files; broad and baseline logs retain all six failures. One new pack-spacing regression was found
and fixed by the local-disc search; its existing test was **not** weakened. Updated older fixtures
explicitly reflect the new independent gun lease, safe spawn deferral, full-wipe breathing room,
arrival grace and removal-versus-reward distinction. No expected replay hashes were re-recorded.

Run the new tests with:

```sh
node --test test/swarm-runtime-*.test.mjs
```

## Review limits and remaining risk

Rendered player-truth status: **UNKNOWN**, not PASS. Chromium navigation to the real local server
failed with `net::ERR_BLOCKED_BY_ADMINISTRATOR`. The source packet also omits large binary media.
There is no gameplay screenshot/contact sheet, mobile acceptance, full fight playthrough, FPS
claim or human fun/balance verdict attached to this change. Native Rapier admission tests do not
substitute for those. No browser policy or asset-readiness gate was bypassed.

Static review checked reachable production imports, resource rollback, seeded placement, physics
single-writer boundaries, plan ownership, reward causality and mode isolation. Ship materialization
outside Swarm retains its old placement path; shared lifecycle protections also apply to survival.
The bounded search may defer crowded gates; that is intentional and observable through admission
receipts and brood `pendingCount`, not a reason to hide remaining enemies or fabricate a win.

Before claiming presentation acceptance, run the repository's public-input player-truth route on
a host allowed to render the complete game. Inspect opening, dense mid-run and champion rounds;
verify restart, pause/armory, fast drift, obstructed arrivals and visible attack tells. This record
is an engineering result and a precise statement of the remaining evidence, not a visual sign-off.
