<!-- LIFETIME: HISTORICAL -->
# PQ-137.00 / .01 / .02 — the three feel rules that landed on 2026-09-03: receipt

- **packetId:** PQ-137
- **leafIds:** PQ-137.00, PQ-137.01, PQ-137.02
- **candidateCommit:** (the commit carrying this receipt)
- **disposition:** PASS (kernel/contract level; route scenarios are `PQ-137.10`)
- **acceptance:** focused_green

## What changed, in the owner's terms

1. **Earned speed is kept in the default flight mode** (`.00`). Before: holding forward above the
   governed cruise commanded reverse thrust at ~24 % of reverse authority, and letting go braked at
   44 % — a slingshot was spent within seconds, and pressing *forward* after one slowed the ship.
   Now: above the cap the governor floors at coast, and the hands-off assist blends to zero across
   15 WU/s above the cap. The pilot brake keeps full authority; below the cap nothing changed.
2. **Given momentum survives the NPC speed cap** (`.01`). Before: the physics layer truncated every
   NPC's velocity to 1.15× its top speed every tick, impulses included — a pirate at cruise that
   took a concussion hit had the hit deleted one tick later. Now: the cap bounds only the speed the
   body's own thrust added this tick; shoves, throws, flings and contacts survive it.
   Side effect, by design: a gravimetric hull (the one drive family with a finite solver speed
   limit) also keeps externally given momentum above that limit; its own drive still cannot
   exceed it. The live concurrent thread editing traffic.js / survivorPod.js / lootShards.js /
   weapons.js is on PQ-138's seams; this receipt claims nothing there.
3. **Hard terrain and structure slams take the helm** (`.02`). Before: rock and station contact was
   defined as never staggering or tumbling a ship, regardless of how hard. Now: a slam with ΔV at or
   above the tumble threshold (18 WU/s) tumbles the ship whoever caused it; scrapes below it stay
   helm-neutral even with a fresh weapon tag on the victim.

## Files

- `src/core/flight/propulsionKernel.js` — `applySpeedGovernor` (`brakeFloor = 0`),
  `reactionAssistAcceleration` (`overCapScale`), `OVERCAP_ASSIST_BLEND_WU_S`, `smoothstep`.
- `src/core/sg02DynamicBodyOwner.js` — `_clampSpeed` (thrust-only cap).
- `src/combat/impulseKernel.js` — `collisionAllowsHelmLoss(surface, provenance, deltaV)`.

## Tests rewritten (the anti-vision pins)

- `test/flightV3.spec.mjs` §12c/§12d — asserted "overspeed under held throttle should decay toward
  the cap" and "the exemption should still spend speed"; now assert coast above the cap (hands-off,
  forward held, tag or no tag), full pilot-brake authority, and the unchanged below-cap settle.
- `test/travel-drive.test.mjs` — "the UNBOOSTED overspeed brake survives the fix" and the RC-4 flag
  gate now assert the unconditional coast floor; the frozen kernel fixture
  `test/fixtures/travel-drive-kernel-baseline.json` was re-frozen for exactly eight above-cap cases
  (`reaction/{boost,unboosted,boost-just,earned-momentum}-above-cap`, `reaction/large-hull-above-cap`,
  `reaction/small-hull-boost`, `torch/{boost,unboosted}-above-cap`); every other case byte-identical.
- `test/weapon-impulse-consequence.test.mjs` and `scripts/check-impulse-authority.mjs` — structure
  and asteroid slams at ΔV 40–60 now expect `tumble`; the "freshly shot hull grazes terrain"
  regression is kept as a ΔV 12–15 scrape expecting `none`.

## Verified

- `node --test` on the three test files: 28 pass, 0 fail.
- `npm run check:impulse:authority`: OK.
- `npm run check:baseline`: 14/14 green (`check:47a:physical-branches` timed out once under the
  4-way parallel budget and passed alone; a contention signal, not an assertion).
- 47-A legacy envelope (`check:sim`) bit-identical. The V3 envelope moved and was deliberately
  re-recorded per `docs/COMMON_BUGS.md` §8/§10d: `sim-golden-diff --flight-system v3` against
  reference 5fd202d5 (which reproduces the prior hash) returned MOTION_CHANGED with exactly four
  motion fields, all on the player, after the tape's single boost at tick 120 — the earned-speed
  rule keeping what the old governor spent. All 22 trace counts unchanged (fire 17 / hits 17 /
  damage 17). No NPC motion field moved, so the given-momentum and terrain rules are not
  exercised by this replay. Causal note appended to `test/47a.telemetry.v3.expected.json`.

- `npm run check:all:smoke`: 4 of 8 red on the first pass, all attributed and none to these rules.
  `flight-clean` failed a 2 ms/tick timing budget while eight commands ran in parallel and passes
  alone at 0.73–0.91 ms/tick (both budgets). `first-15-runtime`, `market-first-loop` and
  `47a-live-cold-open` timed out waiting for the game to boot (their 30 s / 15 s headless
  allowance; the script comment records ~12 s on a quiet machine and that any load tips it). A
  150 s headless probe on this tree booted with ZERO page errors at 39 s while another agent held
  port 8123 and ~29 node processes; the real-GPU in-app browser booted to the main menu with no
  console errors. Environment allowance under load, not a boot regression.

## What this does NOT claim

The route-level bars (B1, B4 clamp half, B6 helm half in `design/FEEL_CONTRACT.md` §B) are met at
the kernel/contract level. The Motion Lab scenarios that measure them on the default route are
`PQ-137.10`. The nimble regime (B2/B3), hitstun law (B5/B11), weapon force (B4 magnitudes), terrain
damage (B6 damage half), rope stiffness (B7) and draw-to-fly (B8) remain open leaves.
