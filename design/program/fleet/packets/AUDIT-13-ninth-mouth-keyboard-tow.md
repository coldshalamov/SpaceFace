# AUDIT-13 — The Ninth Mouth lamp can be seated by a keyboard pilot

**Lane 2.** Read `C:\Users\93rob\AppData\Local\Temp\praudit\FIX-BRIEF.md` first (shared-checkout and
commit rules; it overrides anything looser in PROTOCOL.md).

## Why
`test/ceres-ninth-mouth-earned-route.test.mjs` fails at line ~93: guidance reads `intercept`, not
`coast`. The patrol that used to ram the lamp is now held off (commit 6c7cd5d2cf). The remaining
cause, measured: on a taut Line one tick of Pelican thrust adds ~1.57 m/s to the ship, shared with the
mass-8 lamp ≈ 1.26 m/s, but the lamp seat needs `maxSpeed: 1` (`src/data/ceresNinthMouth.js` ~:42).
Brake removes ~0.04 m/s/tick. The test's scripted pilot tries to hold 0.65 m/s ± 0.1, which whole-tick
keys cannot do. Probe scripts from that diagnosis: `C:\Users\93rob\AppData\Local\Temp\praudit\a01\`.

## Do
1. Measure the lamp's own coast: after release (and with a slack Line), how fast does it lose speed
   (native damping)? How long from 1.3 m/s to under 1 m/s?
2. Find a route a real keyboard player can fly with ordinary inputs: e.g. slack the Line, one tap
   toward the mouth, let the lamp drift, release short of the seat so it coasts in under 1 m/s, or
   counter-pull with brake. Use only public inputs (the keys a player presses).
3. If such a route exists: rewrite only the tow phase of the earned-route test to fly it (keep every
   assertion about what the job must prove: earned route, coast guidance, seat, rescue, payout). Extend
   its delivery wait if needed.
4. If NO keyboard route can seat the lamp under 1 m/s: set the seat `maxSpeed` to the smallest value
   a single-tap tow can meet (measure it, round up to one decimal) and say why in the commit.
   Do not change the guidance thresholds' meaning otherwise.
5. Run `test/ceres-ninth-mouth-earned-route.test.mjs`, `ceres-ninth-mouth-fast-earned-route`,
   `ceres-ninth-mouth-patrol-hold`, `ceres-ninth-mouth-owner`, `ceres-ninth-mouth-contact`.

Commit: `fix(AUDIT-13): <plain words>`. Receipt: what you measured (numbers), which branch (3 or 4)
and why, test counts.
