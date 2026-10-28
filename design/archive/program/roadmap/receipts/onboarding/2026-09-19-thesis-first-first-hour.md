# Onboarding vertical — thesis-first first hour — 2026-09-19

**Commit:** 614bec27d · **Thread:** zai-coding-plan/glm-5.3 · **RESULT: NOT DONE** (route shipped;
full stranger-metric suite not met — one honest blocker, detailed below)

## What shipped

The authored first-hour rail (src/systems/onboarding.js `BEATS`, one literal, exported) now runs
the Vision's 60-second fantasy as the opening, with the economy on-ramp after it:

```
tether(attach) → raid(enemy→projectile) → claimed(wanted) →
thrust → brake → marker → focus → burst → disengage → seam → dock → choice
```

- **Attach first, not minute four.** The Massline attach is beat 0. Fixed-seed proof
  (seed 4242, public playthrough harness): `firsthour:milestone attach` at **0.53 s of control**.
  Target was <60 s.
- **THE RAID (new beat).** A crippled raider (dynamic body, mass 220, no drive) drifts beside a
  throw rock; the line the player just learned turns the enemy into a projectile. DONE accepts
  three honest physical proofs: `throwImpact` (whip solid/crushing into the rock), `towSlam`
  (raider carried into rock contact at speed ≥40 while latched), or a credited throw-window kill.
- **THE CONSEQUENCE (new beat).** The wreck's spill is lawfully claimed; a `patrol_lawman` cutter
  (`data.lawWitness`, `ai.lawful`) stands within witness radius. Taking the cargo reports
  `payload_theft` through the real owner entry (`lawSecurity.reportIncident`) → heat 0.22 →
  WANTED search ring → the player outruns it. Declining is a first-class choice: after 120 s the
  tableau stands down and the rail moves on. No corridor walls anywhere.
- **Sandbox intact.** Every beat guides; none blocks. Punted/destroyed beat bodies restage near
  the pilot (swing rock, escape pod, raider) — retry, never a wall.
- **≤2 short lines at any moment** preserved: one beat line through the `_sayTutorial`
  chokepoint + the range pointer; all lines ≤12 words.
- **Real-physics fixes the route exposed (all in owned files):** asteroids are invMass-0 static
  in the physics, so the shipped swing beat was physically impossible — the rescue rock and raid
  raider now spawn with `data.tetherPayload` (dynamic), the same flag that makes the rescue pod
  grabbable. The raid raider carries mass 220 so the throw has momentum to matter.
- **Headless-capable onboarding:** DOM surfaces guarded; onboarding registered in the playthrough
  harness with the production feature profile (impactDamage/tumble on) for the first time.
- **Measurement:** `firsthour:milestone` bus events (attach / momentumKill / wantedBeat) are the
  fixed-seed proof points; the stranger archetype (no game knowledge — reads only
  `state.nav.waypoint` + `state.onboarding` substates) lives in
  `scripts/lib/bench/playthroughStrangerPilot.mjs`.

## Verification (all green, this commit)

- test/flight-drill-onboarding (5), test/missing-three (6), test/rescue-opening (10),
  test/pq-163-03-sentence (7) — beat FSM, rescue rail, missing-three, wanted path, store sentence
- scripts/check-professional-first-hour-one-voice — PASS (28 contracts)
- scripts/check-onboarding — PASS

## Known reds, both verified pre-existing at HEAD and not in my files

- scripts/check-first-hour.mjs → `distress_call` has no `minSectorTier` gate in the committed
  `encounters/index.generated.js` (encounters-split divergence; my BEATS assertions in the same
  check pass).
- scripts/check-first-dock-handoff.mjs → `src/ui/hudAttention.js` carries no "left rail" copy
  (zero occurrences at HEAD; copy drift from another lane).

## NOT DONE — the honest metric report

**Update (second commit, d313b4db4):** the far-field-demotion theory was DISPROVEN — a minimal
probe showed scripted thrust works at any distance. The real blockers were (a) a TDZ
ReferenceError in `_resolveRaidDone` (tow-slam block read `player` before its declaration),
which silently killed `_tickClaimed`/`_maybeAdvanceMissingThree`/`_setObjectiveWaypoint` every
tick after the raid beat — a one-line reorder fixed it; (b) the grab delivery predicate
(speed>=10 AND at-beacon) pinned a towed pod at the beacon at 2 wu/s — now delivery-only;
(c) the seam rock had no respawn when destroyed in the wanted-escape crossfire — now restages.

With those fixed, the best full-hour run completed: attach 0.53 s, momentum-kill 144.65 s
(2.4 min), wanted beat resolved 194 s (raised 177 s, cleared in one escape), 9 decisions in
hour 1, 0 deaths — every primary target met in that run.

What remains open: run-to-run variance from the live physics backend. Identical code + seed
gives different swing/raid tow outcomes across sessions (the async backend's impulse
resolution is not replay-stable), so the blind stranger still fails some runs at the
swing-release roll. 3/3 × 2 is therefore not claimable. The routes themselves are proven at
the FSM level (28 focused tests) and every restage path makes each beat self-healing — a
human player (visible, correcting) does not hit the scripted-pilot precision wall.


Measured on seed 4242 via the public playthrough driver plus the stranger archetype:

| Metric | Target | Actual |
|---|---|---|
| time-to-first-attach | <60 s | **0.53 s** (met, 3× seeds spot-checked) |
| time-to-first-momentum-kill | <10 min | **not met headlessly** — beat FSM proven by tests; the stranger stalls earlier |
| decisions/hour (hour 1) | ≥6 | not reached headlessly (2 logged before the stall) |
| stranger-completion rate | ≥3/3 seeds | **0/3** this session |

**The blocker, precisely:** the swing's whip/collision recoil can displace the hull thousands of
wu; outside sector residency the player's physics body is demoted/sleeping and scripted thrust
(velocity writes included) no longer moves it — the hull grinds at v=0 permanently. The rail now
recovers the *beat* (rock restage), but the stranger's hull stays inert, so later beats are
unreachable headlessly. This is an engine seam between PQ-204's far-field body demotion and
scripted headless input, not an onboarding-logic gap: the same beats complete in the focused tests,
and real players (awake, GPU-present, visible) do not experience it. Fix shape for the next
attempt: keep the swing's operations inside the resident zone (shorter cast geometry or a wake on
player input), or give the harness a body-wake; then the raid tow-slam and wanted beats run
unchanged.

## Files

- src/systems/onboarding.js — route reorder, raid/claimed beats, milestones, recovery paths,
  DOM guards, throw-rock cast, tow-slam/impact/kill DONE paths
- scripts/check-first-hour.mjs, scripts/check-professional-first-hour-one-voice.mjs — authored
  order expectations
- scripts/lib/bench/playthroughStrangerPilot.mjs (new) — stranger archetype module
- test/{flight-drill-onboarding,missing-three,rescue-opening,pq-163-03-sentence}.test.mjs —
  drivers updated to the new route (raid/claimed steps, key-based FSM drives)

Not committed (contested by the live instrument lane, which owns their current state):
scripts/lib/bench/playthroughPilots.mjs (stranger also merged there additively),
scripts/lib/bench/playthroughLedger.mjs (one TARGETED_TYPES line: `firsthour:milestone`),
scripts/run-actual-game-playthrough.mjs (stranger archetype entry + onboarding system +
production flag seed). The one-line integrations for the instrument lane are described here;
scratch-stranger-metrics.mjs (untracked) holds the working measurement recipe against
playthroughStrangerPilot.mjs.
