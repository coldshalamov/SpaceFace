# SPEC3 INDEX — the ambitious expansion layer (status tracker)

**What SPEC3 is:** the plan set that takes SpaceFace from "solid 2.0" to a genre-leading bar.
Constitution + full manifest: [`_context/06_PLANNING_CONSTITUTION.md`](_context/06_PLANNING_CONSTITUTION.md).
Codebase recon for sim/economy/world: [`_context/02_SIM_ECONOMY_WORLD.md`](_context/02_SIM_ECONOMY_WORLD.md).
Design authority remains `design/GDD_2_0.md`; SPEC3 extends it, never contradicts its pillars.

Specs are grouped by thread into one file per thread (SPEC3-Fx-*.md), each containing its block of
numbered specs. Written directly by the lead session (Fable 5).

| Thread | File | Specs | Status |
|---|---|---|---|
| F3 Flight, Physics & Feel | `SPEC3-F3-flight-physics-feel.md` | 16 flight-model · 17 tether-momentum-verbs · 18 camera-juice | **WRITTEN** |
| F5 Ships, Modules & Progression | `SPEC3-F5-ships-outfitting-progression.md` | 23 outfitting-core · 24 modules-flux-crafting · 25 fleet-wingmen-crew | **WRITTEN** |
| F4 Combat, Weapons & AI | `SPEC3-F4-combat-weapons-ai.md` | 19 combat-feel · 20 weapons-tactics · 21 encounter-director-ai · 22 bosses-named-setpieces | **WRITTEN** |
| F1 Economy & Trading | `SPEC3-F1-economy-trading.md` | 10 living-economy-depth · 11 trading-ux-market-intel · 12 contracts-blackmarket-econ-warfare | **WRITTEN** |
| F2 Mining & Resources | `SPEC3-F2-mining-resources.md` | 13 mining-mastery · 14 refining-production · 15 prospecting-exploration | **WRITTEN** |
| F6 Bases, Claims & Tower Defense | `SPEC3-F6-bases-defense-territory.md` | 26 player-bases · 27 sector-tower-defense-siege · 28 territory-faction-war | **WRITTEN** |
| F7 World & Living Universe | `SPEC3-F7-living-universe.md` | 29 encounter-director-world · 30 sector-content-map · 31 exploration-anomalies · 32 narrative-spine | **WRITTEN** |
| F8 Graphics & Visual Direction | `SPEC3-F8-graphics-visuals.md` | 33 render-postfx · 34 vfx-systems · 35 sector-art-identity · 36 hud-ui-visual | **WRITTEN** |
| F9 Asset Pipeline | `SPEC3-F9-asset-pipeline.md` | 37 blender-ships · 38 imagegen-textures · 39 procedural-audio | **WRITTEN** |
| F10 UX, Meta & Capstone | `SPEC3-F10-ux-meta-tastemaster.md` | 40 ux-onboarding · 41 save-meta-telemetry · 42 TASTE-MASTER capstone | **WRITTEN** |

**Reading order for implementers:** constitution → your thread file → GDD_2_0 sections it cites.
**Dispatch rule:** one thread file = one implementation lane; specs within a file are ordered by dependency.
**Regression floor for everything:** the spec's named checks + `npm run check:sim:compare` (hashEqual:true)
+ `node scripts/check-tether-gameplay.mjs`. Never edit `test/*.expected.json` to pass.

## Research provenance (condensed into the specs; no separate research files)
- Flight/momentum: Freelancer (cruise 300 u, 3 s charge, weapons-off; thruster +120 burst; engine-kill Z;
  reference constants mass 150 / drag-as-vmax / reverse 0.5× / bank 80°), Rebel Galaxy Outlaw
  (inertial-dampener slide; 2.5D plane rationale; automatic pursuit explicitly excluded), Highfleet (velocity-lead enemy aim,
  burner ×3 breaks AI prediction, projectiles inherit ship momentum; G-cap = unfun, avoid), Elite (FA-off
  180° reverski in 2–3 s; assisted-by-default doctrine).
- Outfitting: Endless Sky (nested outfit-space ⊃ weapon/engine capacity; accel=thrust/mass, turn=turn/mass,
  vmax=thrust/drag; energy+heat as flow budgets), Starsector (OP budget; flux capacitor 1 OP→+200 cap,
  vent 1 OP→+10 dissipation, caps 10/20/30/50 by hull; mount size+type gating; hardpoint 2× HP of turret),
  EVE (semantic slot roles; permanent rigs/calibration), Everspace 2 (rarity→modifier count; legendaries;
  set bonuses; dismantle-3→blueprint), X4 (engine vs thruster split), FTL (live power routing),
  Star Valor (crew/perk multiplier layer).
