<!-- LIFETIME: ACTIVE_RECEIPT -->
# PQ-139.04 — Tumbling ships corkscrew their trail

```text
DONE  PQ-139.04 — every plume in the game now corkscrews with the hull's spin: the player's recorded contrail (b025ed3a) and now the enemies' live card plumes, so a shoved and tumbling hostile reads as spun from across the screen.
WHAT I FOUND     The first half of this leaf gave the player's contrail a spin helix, but the ships that get spun most in play are enemies — and their card plumes had no history and no spin read at all, so the shove that saved you never showed on the ship it saved you from.
WHAT I CHANGED   Every enemy plume card now carries its hull's spin as a per-instance pair (amplitude and phase): nothing at rest, growing with the spin rate, saturating at a hard tumble at about a hull's width, softened but never silenced under reduce-motion, with the phase advancing by the hull's own spin each frame so the screw on screen turns at the rate the hull tumbles; the plume root stays on the bell and the idle VFX budget still sleeps.
WHAT YOU WILL FEEL   When a shove or a slam spins a hostile, its exhaust now draws a corkscrew behind it at the rate it tumbles — you can read which ship is out of control without any HUD help, and when it recovers the plume straightens. Nothing changes while nobody is spinning: at rest the packed amplitude is exactly zero and the card draws bit-identically to before.
THE NUMBERS      enemy plume sideways swing at a hard tumble (≥ 2 rad/s) | 0 | 4.5 WU, saturated | visible at the chase camera · swing at rest | 0 | 0 (exact zero packed) | bit-identical card · reduce-motion amplitude | n/a | 35 % of normal, direction kept | information survives · phase advance | 0 | hull angVel × dt per frame | screw turns with the hull · idle VFX budget gate | PASS | PASS | PASS · capture | headed, 90 frames, 86 moments, HUD text clean, 0.615 real-time fraction (above the 0.60 floor)
THE FRAMES       shove-spin at the shipping camera: strips/crucible/cfb505ef-dirty-e1152b66/swarm_piloted-physics_toolkit-s4242 (seed 4242, manifest + contact sheet committed beside this receipt) — the player's own spun trail draws a full corkscrew around the hull (frames 021, 069: the blue contrail sweeps a complete spiral under the ship after an impact); every drawn hostile in the strip runs the new wobble live (six hostiles drawing in frame 018), and the deterministic instrumented test pins the packed amplitude and phase the camera shows; the big shove-consequence moments landed just before the harness's chosen frame window, so no frame isolates a close-up spun hostile — the packed pair the frames would draw is pinned by test at (stride 20, offsets 18/19 and 38/39)
NEXT             whatever --next returns (U4 of this batch: PQ-143.02 the six texture one-offs)
```

## The mechanism (both halves)

Player half (b025ed3a, unchanged here): the recorded contrail offsets its history samples across
the flown line by `spinHelixOffset` — see `src/render/thruster/ribbon/contrailTrail.js` and
`test/contrail-corkscrew.test.mjs`.

Enemy half (this unit): enemy hulls draw card plumes with no recorded history, so their spin read
lived or died at write time.

- `src/render/thruster/systems/continuousPlume.js` — the instance publication grows by one vec2
  (`instanceSpin`: x = wobble amplitude in WU, y = wobble phase in rad; stride 18 → 20). The slot
  pool computes the amplitude per entity from the ship record's raw `spin` with the pure
  `spinWobbleAmp` (zero at rest, saturated at `SPIN_WOBBLE_REF_RAD_S` = 2 rad/s, scaled
  0.35 under reduced motion) and passes the phase through. The compact per-tier `spin` array is
  the CPU readback contract, same as offset/params.
- `src/render/thruster/systems/familyFleet.js` — `setShipSpin` snapshots the hull's raw angVel on
  the persistent ship record; `endFrame` advances `spinPhase += spin · dt` only for ships that
  actually draw. The phase resets on ownership change (a recycled record never inherits the
  previous hull's screw), and survives frame-to-frame for the same hull.
- `src/render/thruster/materials/flowFlipbookMaterial.js` — the vertex shader bows each card
  sideways along its length by `amp · sin(phase − along · SPIN_WOBBLE_WAVENUMBER)` (0.35 rad/WU,
  ~18 WU per turn), interpolated from the exported constant so shader and code cannot drift. With
  amp exactly 0 the displacement term is an exact zero — the at-rest card is bit-identical.
- `src/render/vfx.js` — both fleet write sites (retained survivors and admitted newcomers) pass
  `e.angVel` to `setShipSpin`. The player is untouched: the hero plasma stream owns the player's
  jet, and its contrail corkscrew shipped in b025ed3a.

## Evidence

- `test/plume-spin-wobble.test.mjs` (6/6): amplitude zero at rest / grows / saturates / NaN-safe;
  reduced motion softens but never silences; the pool packs the pair and the interleaved GPU
  publication carries it at (stride 20, offsets 18/19) AND instance 1 at (38/39) — the stride
  itself is pinned; reduced-motion a11y reaches the packed amplitude; the fleet's phase advances
  by spin·dt, accumulates across frames on the same record, and resets on ownership change; the
  shader consumes the pair through the named `SPIN_WOBBLE_WAVENUMBER` constant.
- `test/dynamic-buffer-ranges.test.mjs` (24/24) — this suite PINS the packed plume publication,
  so the stride change was a contract update, not a silent repin: `attributesFor` gains
  `instanceSpin (2, 18)`, the packed-scalar parity asserts the exact 20 scalars including
  `slot.spinAmp/spinPhase`, and the stride/byte counts move 18 → 20.
- `test/contrail-corkscrew.test.mjs` (2/2, pre-existing player half) still green.
- Thruster family (`vp220-*`, `kestrel-production-thruster-bind`): 60 tests, 58 pass — the two
  failing `kestrel-production-thruster-bind` cases (`HDR-energy toggle`, `pose tracks the
  nozzle`) fail IDENTICALLY with this unit's whole diff reverted (verified by reverse-patching
  the diff out, re-running, and restoring): a pre-existing red in the shared tree's plasma-stream
  path, which this unit's card-plume diff does not touch.
- `npm run check:vfx-techniques` PASS (11 entries, 10 files); `npm run check:vfx-sleep` PASS —
  the idle budget, steady state and wake/sleep contracts hold: a spinning ship with no throttle
  writes no cards, so the wobble adds no idle wakeups.
- `npm run check:baseline` at exit: 14/15 children green — the one red is the known pre-existing
  `check:sim` 47-A hash drift owned by the live PQ-137.11 row's dirty `sg02DynamicBodyOwner.js`
  (same pre-existing red recorded in the PQ-186.00 receipt; this unit ships no sim path).
- Capture: `node scripts/capture-pq139-04-shove-spin.mjs --every-nth=9` (new script) — headed,
  seed 4242, `swarm_piloted` + `physics_toolkit`, 90 frames / 86 moments / HUD clean /
  **0.615 real-time fraction, above the 0.60 normal-speed floor** (`normalSpeed: true` in the
  manifest). Two earlier attempts at the harness default every-3rd-frame ran 0.46/0.50 — the
  screencast itself halves this box's run speed — so the script takes an `--every-nth` override
  that the harness records in the manifest. It reuses the shared capture harness unchanged
  (frameStripCapture.mjs is inside the live PQ-137.11 row's write set, so the `shove_spin` tape
  its remaining-work note suggested was implemented as a script around the existing
  `swarm_piloted` tape instead — same loadout, same moments, zero collision).

## Review findings and dispositions

Subagent integrator review round 1 (REJECT) — both blockers fixed before commit:

1. BLOCKER — `test/dynamic-buffer-ranges.test.mjs` pinned the 18-float plume publication this
   unit deliberately redefines, and the receipt omitted it. Fixed: the suite now pins the
   20-float contract (stride, packed parity including the spin pair, byte counts) and this
   receipt discloses it as the contract update it is. 24/24 green.
2. BLOCKER — the receipt cited 0.96 real time, which was the manifest's pre-screencast stage,
   while the strip's real fraction was 0.46 (slow motion). Fixed honestly: recaptured three
   times with the screencast-cadence lever until the strip met the floor (0.615, `normalSpeed:
   true`); the receipt now cites the manifest's own headline fields.
3. should — the shader declared the interpolated wavenumber but consumed a retyped `0.35`.
   Fixed: the displacement uses the named constant; the test pins the name, not the literal.
4. should — `toFixed(2)` silent-drift hazard: moot with 3 (the constant is the single source);
   the declaration regex still pins the exported value into the shader source.
5. should — the stride was only pinned at instance 0. Fixed: the packing test writes two
   entities and asserts instance 1 at 38/39 in both the interleaved buffer and the compact array.
6. should — the capture script printed manifest fields that do not exist. Fixed: prints
   `realtimeFraction` and `normalSpeed`.
7. nit — the at-rest fleet branch could skip silently. Fixed: `assert.ok(still, ...)`.
8. nit — the dead-defensive `if (batch.spin)` guard removed (a batch without the array now fails
   loudly instead of silently publishing stale zeros).
9. nit — phase stalled while a spinning ship drew no sockets. Fixed: accumulation moved before
   the socket skip.
10. nit — receipt arithmetic corrected (60 tests / 58 pass).
11. nit — formatting: the constants block no longer glues the comment close to the export.

## Tradeoff deliberately spent

One vec2 per plume card instance (8 bytes per card per frame, capped by the existing per-family
instance ceilings) and one sin() per plume vertex — bought with the only read of enemy spin in the
game. Reduced motion keeps the directional information at 35 % amplitude per the accessibility law
(motion may shrink; the read must survive).

## How this can be got wrong later

- Changing the instance stride or spin offset without touching `PLUME_SPIN_OFFSET`/the compact
  arrays: both packing tests fail — `plume-spin-wobble` reads the interleaved buffer at
  (20, 18) and (20, 38), and `dynamic-buffer-ranges` pins the stride, the 20-scalar parity and
  the byte counts.
- Retyping the wavenumber into the shader instead of the named constant: the shader test fails.
- Resetting the ship record's phase every frame: the fleet test's accumulation assertion fails —
  the screw must turn with the hull across frames, not restart.
