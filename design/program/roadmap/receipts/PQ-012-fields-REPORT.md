# PQ-012 — Continuous field kernel and first consumers (implementation REPORT)

Packet: PQ-012 / SF-12 / PROPOSED-T21. Worktree: C:\Users\93rob\sf-w1-fields
Branch: w1/pq012-fields-20260721  Base: f85d54c8

## Outcome summary

ONE deterministic, finite-radius continuous-field primitive — register/unregister lifecycle,
strength, explicit falloff, target filters, capped acceleration, coupling selectivity — powers three
consumers, all reachable on the DEFAULT route via ordinary input:
- Well (Digit5) — deployed at the aim point; PULLS light bodies / projectiles / marked targets.
- Repulsor (Digit6) — dropped at the ship; SHOVES bodies outward.
- Clearing Cone (Digit7) — player-attached sustained forward wedge (toggle); the gravitic snowplow.

Heavy ships shrug: the shrug lives in the COUPLING term (a_effective scaled down with mass), NOT the
acceleration cap — because dv = impulse/mass = a*dt is mass-independent. Proven at the dv layer (a
heavy ship moves < 20-25% of a light body under the same field). Every force crosses the SG-02
membrane as an additive queuePhysicsImpulse(a*mass*dt) — the proven dockingCorridor/Tideline pattern;
NEVER writePhysicsControl, NEVER e.vel, NEVER Rapier. Registered immediately before physics.

The throw-release predictor is field-aware (opt-in): a release inside a Well shows the BENT path, and
the projector tracks the real sim within 6 wu (predictor-vs-actual receipt). Without an injected field
sampler it is byte-identical to the ballistic model (check:massline stays green).

VFX: a continuous instanced flow-field (pooled GPU point cloud, zero per-frame allocation, no
per-particle Mesh, deterministic low-discrepancy spawn): Well = inward-converging cool-to-hot swirl;
Repulsor = outward hot-to-cool burst piling toward the rim; Cone = teal directed downstream current
filling the wedge. Density mirrors the kernel falloff. Velocity-aligned streaks keep direction
readable statically; reduced-motion slows the flow, reduced-flash dims/thins it — both preserve
direction + boundary. Deploy/collapse one-shot beats via presentation:vfxCue + new field.* styles.
A standalone HUD chip (src/ui/fieldHud.js, massSeedHud pattern) surfaces field state / countdown /
denial reason — never touching hud.js/targetPanel/styles (PQ-015 lease).

Save/load: transient. Kernel + runtime mirror + emitter entities normalize away on load. Deploy
cooldowns are RUNTIME-ONLY (non-serialized, cleared on save:loaded/sector:exit/game:new) — sidesteps
the save-schema mutex (SAVE_SCHEMA.md unchanged at 261 paths). Destroying a deployed emitter
(damageable fieldEmitter entity) unregisters its field the SAME tick — no orphan force or VFX.

## Write set (exact)
New:
  src/data/fields.js                 defs, coupling, caps, palette, FIELD_FLAGS Tier-B gate
  src/core/fields/fieldKernel.js     pure kernel + sampleFieldAcceleration + projectFieldTrajectory
  src/systems/fields.js              registry system (input/lifecycle/force/publish)
  src/ui/fieldHud.js                 standalone field state/cooldown/denial chip (DOM-guarded)
  test/fields-kernel.test.mjs        16 tests
  test/fields-integration.test.mjs   12 tests
  test/fields-predictor.test.mjs     5 tests
  scripts/capture-fields.mjs         route-evidence capture (real Digit5/6/7 keypress)
Edited:
  src/core/registry.js               import + SYSTEMS + UPDATE_ORDER (fields before physics; fieldHud tail) + comment
  src/systems/input.js               deployWell/deployRepulsor/toggleClearingCone edge verbs (Digit5-7)
  src/core/coreSystem.js             dormant fieldEmitter damageable index case
  src/combat/tetherFireControl.js    field-aware release branch (opt-in fieldSampler; no-sampler byte-identical)
  src/systems/masslineThrow.js       injects the field sampler when fields are active
  src/render/vfx.js                  continuous field-flow subsystem + field.* presentation styles + diag
  src/ui/screens/help.js             help rows for the three verbs
  src/ui/screens/settings.js         rebind list + labels for the three verbs
  package.json                       check:fields script

## Command matrix (command => result / exit)
  node --test test/fields-kernel.test.mjs        => PASS 16/16   (0)
  node --test test/fields-integration.test.mjs   => PASS 12/12   (0)
  node --test test/fields-predictor.test.mjs     => PASS 5/5     (0)
  npm run check:fields                            => PASS 33/33   (0)
  npm run check:sim:compare  (before AND after)   => ok:true hashEqual:true  (0)  GOLDEN byte-identical
  npm run check:physics-authority                 => OK           (0)
  npm run check:mass-seed                          => PASS 49/49   (0)
  npm run check:massline  (regression guard)       => PASS 23/23 child checks  (0)
  npm run check:save-schema                        => OK 261 paths, unchanged  (0)
  npm run check:visual-stability                   => OK, no page errors  (0)
  npm run check:ui-a11y                            => OK           (0)
  node scripts/capture-fields.mjs                  => 5 captures, 0 page issues, all 3 verbs registered=true  (0)
  npm run check:electron:new-game                  => OK mode=flight player=1 authoredShips=17 gpu=ANGLE/D3D11  (0)
  npm run check:perf                               => FAIL (1) — pre-existing hitch, NOT fields (see known_failures)

## Route evidence (.devshots/pq012-fields/)
  01-well-default.png       Digit5 pressed => kernel registered [well];      chip "WELL - ENGAGED 9s"
  02-repulsor-default.png   Digit6 pressed => kernel registered [repulsor];  chip "REPULSOR - ENGAGED 7s"
  03-cone-default.png       Digit7 pressed => kernel registered [cone];      chip "CONE - CLEARING"
  04-well-reduced-motion.png   motionReduce on — flow reads as static directional streaks
  05-well-reduced-flash.png    flashReduce on — flow dimmed/thinned, direction + boundary preserved
  report.json               per-capture runtime (fields active, engaged, telemetry, sha256)
Reachability is PROVEN end-to-end: each capture pressed the real key via page.keyboard.press and the
field kernel registered the field (registered=true) — the input.js binding, not a console flag.

## Golden safety (three independent layers, all verified)
(a) fields absent from sf-sim.mjs curated systems list; (b) FIELD_FLAGS.enabled defaults OFF under
node (Tier-B, mutable for tests); (c) nothing auto-spawns — deploy is player input only. Proof:
sf-sim.mjs imports neither registry.js nor input.js; the only golden-path file touched (coreSystem.js)
holds a dormant fieldEmitter case; hashEqual:true confirms zero field forces in the golden.

## receipt

```yaml
packet: PQ-012
alias: SF-12
base: f85d54c8
branch: w1/pq012-fields-20260721
paths:
  new:
    - src/data/fields.js
    - src/core/fields/fieldKernel.js
    - src/systems/fields.js
    - src/ui/fieldHud.js
    - test/fields-kernel.test.mjs
    - test/fields-integration.test.mjs
    - test/fields-predictor.test.mjs
    - scripts/capture-fields.mjs
  edited:
    - src/core/registry.js
    - src/systems/input.js
    - src/core/coreSystem.js
    - src/combat/tetherFireControl.js
    - src/systems/masslineThrow.js
    - src/render/vfx.js
    - src/ui/screens/help.js
    - src/ui/screens/settings.js
    - package.json
proof:
  - check:fields PASS 33/33
  - "check:sim:compare ok:true hashEqual:true (before+after all edits)"
  - check:physics-authority OK
  - check:mass-seed 49/49
  - "check:massline 23/23 (predictor edits non-regressive)"
  - "check:save-schema OK 261 paths unchanged (cooldowns runtime-only)"
  - check:visual-stability OK / check:ui-a11y OK
  - "check:electron:new-game OK (flight boot, real GPU ANGLE/D3D11)"
  - "capture-fields.mjs 5 captures 0 page-errors, Digit5/6/7 registered=true"
  - "heavy-shrug proven at dv layer (heavy < 20-25% of light); projectile bends more; marked heavy grabs harder but still shrugs"
  - "predictor-vs-actual: projectFieldTrajectory tracks real sim within 6 wu; no-sampler byte-identical"
public_route:
  Well: "Digit5 (deploy at aim point) - rebindable; help.js + settings.js surfaced"
  Repulsor: "Digit6 (drop at ship) - rebindable"
  ClearingCone: "Digit7 (toggle ship-attached forward wedge) - rebindable"
  verified: "real page.keyboard.press -> input.js edge -> field registered (capture-fields.mjs)"
known_failures:
  - "check:perf FAIL on raf.frame.hitchesOver32.max (13, limit 0, crowded-flight). PRE-EXISTING: headless software-rendering hitches + the named spatialHash/vsync perf debts. Fields is DORMANT in the probe (no field deployed, _applyForces returns with zero queries, _updateFieldFlow never called, zero field VFX), so it cannot cause these numbers. spatialHash.queriesPerSecond=74 is baseline load; a field when active adds exactly one bounded queryRadius per field (<=6). Electron boots clean on real GPU."
  - "Continuous flow-field VFX reads SUBTLY in a full-motion 1x still (clearest in the reduced-motion/flash streak variants and in motion). Field radius (170-190) is large vs the default frame, so a still shows the inner convergent flow + core rather than the full rim. Not invisible - direction/boundary read; but the bible bolder frame-device geometry is not yet built (see follow_ons)."
  - "sim:compare phase0 trace-count deltas (caption/cue/audio +1) are pre-existing WIP-baseline noise, unrelated to fields (hashEqual:true)."
limitations:
  - "Frame-device geometry (vanes/berm/banks/rim-pips/core energy-volume as InstancedMesh, bible section 4) is STUBBED in favor of pooled advected particles. The brief letter (advected instanced particles) is met; the bible bolder static-boundary ideal is a follow-on."
  - "Reduced-motion is a slowed velocity-aligned streak drift (direction readable statically), not literal frozen dashes."
  - "A Well placed very close pulls the player own ship (coupling ~0.43 for a ~28-mass ship) - physically honest and fightable, not agency-removing. Could add an owner-exclude filter if playtest dislikes it."
follow_ons:
  - "Build the frame-device geometry (vanes/berm/banks/rim-pips/core volume) for a bolder 1x static boundary read (bible section 4 ideal)."
  - "Tune field radius vs the default camera frame (170-190 exceeds the frame); consider smaller radii or camera-aware VFX density."
  - "Live coupling tuning against real fighter masses (fighter ~28 -> coupling ~0.43); verify the swarm-into-a-knot feel."
  - "LEAD-SIDE REBASE at integration: master has moved (PQ-015 + PQ-014 landed). registry.js and package.json will conflict (shared SYSTEMS/UPDATE_ORDER + scripts). Stayed at base f85d54c8 per instruction - do not rebase in-lane."
```

PQ012_IMPL_DONE

## Visual repair round (Gemini)

Rebuilt the **frame-device geometry strand** across all three continuous field tools in `src/render/vfx.js` per `design/vfx/FIELD_TOOL_READABILITY_BIBLE.md` (§0, §1, §2, §4.1–4.4).

### Geometry built per field

1. **Intake (Well / Gravity Well):**
   - **Vanes:** 6 low-poly curved 3D wedge vanes (`createCurvedVaneGeometry()`, 24 tris each) arranged in a spiral pattern with shared handedness and concave curvature facing swirl direction. Articulated deploy ease (`deploy = u * u * (3 - 2 * u)` over ~0.35s) and counter-rotating swirl.
   - **Sink Core:** Dark faceted knot (`IcosahedronGeometry(r_core, 0)`) with `MeshStandardMaterial` (roughness 0.5, metalness 0.7) encapsulating a glowing white-cyan core volume (`createEnergyVolume`, `#a6f0ff` inner / `#eaffff` halo, radiance 4–6).
   - **Rim Pips:** Ring of 12 separate 3-sided conical rim pips with visible gaps at radius $R$ (`MeshBasicMaterial`, radiance 0.9, non-blooming). Pips tilt inward toward the sink core when `field.engaged` is true.

2. **Plow (Repulsor):**
   - **Faceted Dome:** Convex dark faceted hemisphere (`IcosahedronGeometry(r_dome, 1)`) in dark frame metal encapsulating an amber energy core volume (`#fff2d0` inner / `#ffb35c` halo).
   - **Radial Ribs:** 8 straight radial spokes ($0$ curvature) with traveling core$\to$rim pressure pulses when engaged.
   - **Lobed Berm:** 14 standing non-circular lobed berm segments forming a distinct wall at radius $R$ (`MeshBasicMaterial`, crisp non-blooming boundary).

3. **Sluice (Clearing Cone):**
   - **Bank Rails & Chevrons:** Flared corridor mouth at ship with left/right bank rails and 16 chevrons pointing downstream along the cone direction vector with exit fade over the final 20% of corridor length.

4. **Accessibility & Boundaries:**
   - `motionReduce`: Freezes swirl, radial pressure pulses, and berm churn into static legible poses.
   - `flashReduce`: Scales core radiance and opacity down safely.
   - Boundary elements (pips, berms, chevrons, bank rails) use non-blooming crisp materials with radiance $\le 1.0$.

### Capture Self-Verdicts

Generated 6 captures in `.devshots/pq012-fields/`:
- `01-well-default.png`: Concave spiral vanes + central white-cyan sink core knot + rim pips + inward flow clearly readable at 1x default camera. PASS.
- `02-repulsor-default.png`: Faceted dark dome + 8 straight radial ribs + standing lobed berm + outward flow clearly readable at 1x default camera. PASS.
- `03-cone-default.png`: Bank rails + downstream chevrons + flared corridor mouth clearly readable at 1x default camera. PASS.
- `04-well-reduced-motion.png`: Swirl frozen, static curved vanes + sink core knot + rim pips hold legible pose. PASS.
- `05-well-reduced-flash.png`: Core radiance dimmed, crisp boundary structure intact. PASS.
- `06-repulsor-berm-close.png`: Close-up camera framing confirms non-circular lobed berm wall + faceted dome geometry. PASS.

### Verification Command Results

- `npm run check:fields`: **PASS 33/33** (exit code 0).
- `npm run check:sim:compare`: **PASS ok:true, hashEqual:true** (exit code 0).
- `npm run check:visual-stability`: **PASS** (exit code 0).

PQ012_VISUAL_REPAIR_DONE

## Visual repair round 2

Strict adherence to the **scale-and-material law** across all three continuous field visual representations in `src/render/vfx.js`:

1. **Two Scales (Core Cluster vs Sparse Boundary):**
   - **Core Cluster (span 6–14 wu at center/nose):**
     - Well: Centered sink core knot (1.6 wu) + small energy volume (1.5 wu) + 6 curved vanes at radius 4.2 wu (total span 11.2 wu).
     - Repulsor: Faceted central dome (1.8 wu radius, span 3.6 wu) + small dome heart energy volume (1.5 wu) + 8 radial spokes extending to 5.2 wu (total span 10.4 wu).
     - Cone: Apex nozzle energy volume (1.5 wu) + mouth vanes attached to nose.
   - **Boundary (Thin Sparse Elements at Radius $R$):**
     - Well: 12 conical pips (2.0 wu) positioned AT radius $R$ with ~97 wu gaps between adjacent pips (>> 8x element size).
     - Repulsor: 14 lobed berm dodecahedrons (2.2 wu) positioned AT radius $R$ with ~74 wu gaps (>> 8x element size).
     - Cone: 8 chevrons (2.0 wu) per side spaced along the wedge boundary at distance $d$ (20..$R$), plus 3 discrete bank rail segments (length 2.5 wu per segment) per side.
2. **Material Discipline:**
   - Every structural element uses dark frame metal (`MeshStandardMaterial` / `MeshBasicMaterial` color `0x2b3138`, emissive at most `0x1a2b33`) with NO additive blending and NO white.
   - Accent edges use `#39d0ff` at intensity $\le 1.0$.
   - The ONLY luminous element per field is the central core / dome heart energy volume ($\le 2$ wu, `createEnergyVolume`, radiance 4.5–4.8).
3. **Strict Polygon Size Ceilings:**
   - Zero polygons $> 16$ wu on any axis anywhere in field visuals (max element dimension $\le 3.4$ wu; positions scaled to $R$, sizes strictly unscaled).

### Mechanical Gate & Capture Evidence

Extended `scripts/capture-fields.mjs` with `assertNotWhiteout(png)` running on all 6 captures:
- Hard-fails if fraction of pixels with $r > 235 \land g > 235 \land b > 235$ exceeds 2.0% ($0.02$).
- Asserts non-trivial structure ($lum \in [40, 200]$ in center 60% of frame $\ge 1.0\%$).

| Capture File | Scenario | White Pixel % | Center Mid-Lum % | Gate Result |
| :--- | :--- | :--- | :--- | :--- |
| `01-well-default.png` | Well via Digit5 | 0.0297% | 4.7544% | PASS |
| `02-repulsor-default.png` | Repulsor via Digit6 | 0.0120% | 5.0069% | PASS |
| `03-cone-default.png` | Cone via Digit7 | 0.0176% | 4.9882% | PASS |
| `04-well-reduced-motion.png` | Well (motionReduce) | 0.0408% | 5.4910% | PASS |
| `05-well-reduced-flash.png` | Well (flashReduce) | 0.0258% | 5.3751% | PASS |
| `06-repulsor-berm-close.png` | Repulsor (close-up) | 0.0120% | 5.0853% | PASS |

`CAPTURE_GATE_OK` printed.

### Verification Commands Matrix

- `node scripts/capture-fields.mjs` => **PASS `CAPTURE_GATE_OK`** (exit code 0)
- `npm run check:fields` => **PASS 33/33** (exit code 0)
- `npm run check:sim:compare` => **PASS ok:true, hashEqual:true** (exit code 0)
- `npm run check:visual-stability` => **PASS green** (exit code 0)

PQ012_VISUAL_REPAIR2_DONE

## Visual round 3

Bounded visual polish applied per lead verdict (no geometry redesign, no new luminous surfaces, no kernel/system/test changes):

1. **Capture Framing (Up-Screen Aiming):**
   - In `scripts/capture-fields.mjs`, Well/Repulsor deploys are aimed up-screen by setting `state.input.aimWorld` ~140 wu toward `-z` (`pz - 140`).
   - The deployed devices, field structures, and surrounding test debris land in the UPPER HALF of the frame, fully unoccluded by the bottom flight-control panel.
   - Re-captured `01-well-default.png`, `02-repulsor-default.png`, `04-well-reduced-motion.png`, and `05-well-reduced-flash.png`.

2. **Cone Corridor Presence & Directionality:**
   - Raised chevron accent visibility and opacity (`crispChevronMat` opacity 1.0, `#39d0ff` color matching bank rails, radiance cap $\le 1.0$).
   - Increased chevron count to 10 per side (2.6 wu scale, thickness $\le 3$ wu, gaps ~22.3 wu $\ge 8\times$ element size).
   - Increased bank rail segment count to 5 per side (2.8 wu scale, thickness $\le 3$ wu, gaps ~33.6 wu $\ge 8\times$ element size).
   - Re-captured `03-cone-default.png`. Corridor direction is crisp and clearly readable statically without filled surfaces or additive white.

### Mechanical Gate & Capture Evidence

| Capture File | Scenario | White Pixel % | Center Mid-Lum % | Gate Result |
| :--- | :--- | :--- | :--- | :--- |
| `01-well-default.png` | Well via Digit5 | 0.0117% | 4.7469% | PASS |
| `02-repulsor-default.png` | Repulsor via Digit6 | 0.0122% | 4.9312% | PASS |
| `03-cone-default.png` | Cone via Digit7 | 0.0120% | 4.8429% | PASS |
| `04-well-reduced-motion.png` | Well (motionReduce) | 0.0391% | 5.1957% | PASS |
| `05-well-reduced-flash.png` | Well (flashReduce) | 0.0381% | 5.1670% | PASS |
| `06-repulsor-berm-close.png` | Repulsor (close-up) | 0.0120% | 4.8690% | PASS |

`CAPTURE_GATE_OK` printed.

### Verification Commands Matrix

- `node scripts/capture-fields.mjs` => **PASS `CAPTURE_GATE_OK`** (exit code 0)
- `npm run check:fields` => **PASS 33/33** (exit code 0)
- `npm run check:sim:compare` => **PASS ok:true, hashEqual:true** (exit code 0)

PQ012_VISUAL_REPAIR3_DONE


