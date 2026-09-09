<!-- LIFETIME: ACTIVE_RECEIPT -->
# PQ-137.07 — The rope is a rope (bar B7)

```text
DONE  PQ-137.07 — the Massline holds a full-speed swing like a rope, not a bungee: the line now stretches 5 % where it stretched 16 %.
WHAT I FOUND     The line was a spring with one fixed stiffness, so the harder you swung the further it stretched; at one and a half times fighting speed on a hundred-unit line it gave sixteen percent, which reads as rubber.
WHAT I CHANGED   The line's stiffness now rises with the load it is carrying (the pull a swing puts on it), so a hard swing stays inside five percent of the line's length, gentle play and the soft catch are exactly as before, and a line breaks only when its rated load is exceeded, never because of how far it happens to be stretched.
WHAT YOU WILL FEEL   Latch a heavy rock, swing hard, and the line goes taut and stays taut; let go at the tangent and you keep all of the speed you built. What has not changed: the catch is still soft, and a line under a straight pull (a capital hauling away) stretches as it did.
THE NUMBERS      B7 peak stretch at 1.5x cruise on a 100 WU line | 16.3 % | 5.0 % | < 10 %   ·   line held until release | yes | yes | yes   ·   tangential speed kept 5 s after release | 100 % | 100 % | >= 95 %
THE FRAMES       before/after contact sheets of the rope_swing tape at the shipping camera (manifests/crucible/rope-before-31829d1a and 57a31390-dirty-57d83eea); the before line yanks the ship to a near stop twice mid-swing, the after line holds a steady arc; the owner page is receipts/fun-loop/cycles/2026-09-05-rope/OWNER-REPORT.md
NEXT             PQ-137.10 the bars are measured on the route
```

## The mechanism

`src/core/sg02DynamicBodyOwner.js` `_applyAttachmentSpring`: the coupled load is the centripetal
force the line must carry, `mu * v_t^2 / r`, from the tangential part of the relative velocity at
the anchors. `loadStiffness = load / (LOAD_STRETCH_RATIO * restLength)` with
`LOAD_STRETCH_RATIO = 0.05`; the taut stiffness is `max(K_authored, loadStiffness)`, damping
follows the effective stiffness at the authored damping ratio, and the capture phase (the soft
catch) ramps the same effective stiffness with the same smoothstep as before. Below the load where
the scaling matters the authored `K` is the floor, so the massline-feel fixture and every gentle
latch are bit-identical.

The break request is by load rating: `force / break.maxTension >= 1`, never the geometric stretch
edge. The geometric edge stays as telemetry (`overloadRatio`) and as the `overload` phase the HUD
shows. `lastTension` is the physical force (it was amplified by the stretch ratio past the edge),
which is what `check:massline:load` already asserted strain must be.

Telemetry gains `stiffness` (what the line carried this tick), `loadStiffness`, and `overloadRatio`.

**Correction, 2026-09-05 (found by the nine-cell Crucible sweep, not by the rope scenario):** the
load-scaled stiffness has a stability cap. On a short line, or a light pair swung hard, the
load-scaled value can ask for a natural frequency the 60 Hz explicit step cannot carry, and in
Cinder Sluice with the rope kit that blew a body's position out of the spatial hash (the unmodified
head ran the same cell clean). `tautK = min(max(K, loadStiffness), max(K, mu * (0.5 / dt)^2))`
keeps `omega * dt` at 0.5; the authored K is never lowered by it, and the B7 swing sits an order of
magnitude under the cap (5.0 % stretch unchanged). Every Crucible cell runs again.

A consequence to know about: in the two rope-kit cells the player's contact rate rose (Lagrange
4 → 37/min, Cinder 17 → 73/min on seed 4242) — a stiff line reels the pilot into whatever the
bench's pilot latched, where the soft spring used to give. Both cells were already far over B13's
two-per-minute budget on the unmodified head; the starter and physics-kit cells are unchanged. That
is the rope doing what a rope does, and it is the next thing for the bench's rope pilot (and the
knock budget) to answer.

## The numbers, on the real path

`node scripts/measure-fun-loop.mjs --verbs --scenarios=feel.rope_swing_release --seeds=4242`,
seed 4242, Hitch, authored 100 WU line, 240,000-mass static anchor, 1.5x live cruise:

| clause | before (unmodified head `31829d1a`) | after | target |
|---|---|---|---|
| peak stretch on a 100 WU line at 1.5x cruise | 0.163 (peak line 116.3 WU) | 0.050 (peak line 105.0 WU) | < 0.10 |
| line held until commanded release | yes | yes | yes |
| tangential speed kept 5 s after release | 1.000 (122.9 WU/s) | 1.000 (136.3 WU/s) | >= 0.95 |
| **B7 met** | **no** | **yes** | |

The before run was taken on a sparse clone of the unmodified head, the after run on this tree,
same seed, same scenario module, same harness.

## Checks

- `test/rope-swing-release.test.mjs`: the assertion that pinned "do not coach B7 green" is
  replaced by the bar itself, quoting the vision sentence ("Swing around a huge asteroid and let go
  flying."), plus the stretch clause under 10 %.
- `npm run check:massline`: **26/26 child checks green in 143.8 s wall** (parallel x7), including
  `check:massline:snapcatch`, `check:massline:load` (strain stays lastTension/breakTension) and
  `check:massline:feel` (the soft-catch fixture still never requests a break).
- `node scripts/check-baseline.mjs --only=sim,sim-v3,m1-tether-mass`: 3/3 green — both 47-A goldens
  hold, because the scenario's low-speed attach never reaches the load where the scaling engages
  (the authored K is the floor there, bit-identical).
- `test/rope-swing-release.test.mjs`: 4/4.

## What this does not do

- A straight radial pull (a capital thrusting directly away) still stretches the line at the
  authored stiffness; the coupled-load rule scales with the swing, not with a tug of war. A stiff
  enough explicit spring for that regime is not integrable at 60 Hz (its natural frequency times the
  step exceeds 2), so that regime is the distance-constraint road (`legacy_rope` mode exists) and
  is left open here, honestly.
