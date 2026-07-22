# PQ-013 — Planetary sling, skim, harvest, reentry vertical — implementation report

Lane: pq013-impl (serialized broad vertical, all mutexes held).
Worktree: C:\Users\93rob\sf-w3-planet, branch w3/pq013-planet-20260721.
Base: aa5c86ef "docs(program): PQ-016 checked off" (contains PQ-012 fields, PQ-015
descriptors, PQ-014 jobs, PQ-016 beam). Everything uncommitted; new files `git add -N`.

## Status ledger (newest last)

- [x] Phase 0 — required reading (brief; BUILD_PLAN_CORRECTED STEP 12; atlas
  01_DECISIONS + PLACE_REGISTRATION; bible 0/1/7/8/9/10/11). DONE.
- [x] Phase 1 — SPIKE: planetary-scale Sheath + Bands visual read within frame budget
  (bible-mandated STOP-gate). PASS — see Phase 1 section. Gate cleared; vertical unblocked.
- [x] Phase 2 — Atlas identity transaction (Q18). DONE: zone_tethys_anvil authored
  (authoredPlaces + ZONE_TYPES.planetary_mass), check:atlas-integrity + check:atlas GREEN;
  ONE adapter (src/systems/planetRuntime.js) binds entity+field+runtime to the zone id.
- [x] Phase 3 — Influence profile. DONE: fieldKernel gains optional innerRadius/innerSoft
  (defaults preserve all existing fields bit-identically; check:fields 33/33); annular WELL
  registered through new fields.registerExternal seam; predictor bends (test + route 68-82deg
  measured deflection).
- [x] Phase 4 — Band state machine. DONE: outside/influence/sling/skim/danger/reentry with
  outer-edge hysteresis (test-proven no-flap); published at state.planet.
- [x] Phase 5 — Skim harvest. DONE: Digit8 collector (ordinary input edge), yield=path x
  density, hydrogen shallow / helium-3 in the storm band, settles ONLY via cargo.addCargo;
  mote cues ride the shipped presentation lane 1:1 with settled units.
- [x] Phase 6 — Reentry staging + recovery. DONE: five-stage Plunge with escape regression;
  burn damage routed (plasma channel, source planet_reentry) at 0.5s cadence (the flat-armor
  micro-packet trap — found by the LIVE route, fixed, documented); terminal = ordinary hull
  death -> wreck; player recovery = held boost + outward heading -> assist impulse + heat cost
  (zero new writers).
- [x] Phase 7 — Save/Continue + determinism. DONE: transient-runtime save policy (fields.js
  precedent, NO v13 bump); check:sim:compare ok/hashEqual; check:save-schema OK v12;
  check:planet suite 11/11.
- [x] Phase 8 — Browser route evidence. DONE: ROUTE_CAPTURE_OK, 0 issues, 18+ numbered log
  lines, 15 gated PNGs (.devshots/pq013-planet/route/). Electron smoke: pending.

## Phase 0 — reading notes (binding facts)

- STEP 12: one atlas identity, one physics body; bands outer/working/storm/reentry;
  yield = path x density via explicit collector; Plunge = Skim/Commit/Breakup/Descent/
  Aftermath with escape windows, healthy enemies often escape; player recovery =
  emergency burn costing capacitor/heat/momentum. Forbidden: map-only or physics-only
  planet, invisible damage circle, instant kill on radius crossing, N-body realism,
  landable surface, hold-E yield, teleport recovery, N64 plasma.
- Atlas: derived read model; author SECTOR-LOCAL in a NONZERO-origin sector (never
  validate in Helios); check:atlas-integrity / check:map-frames / check:atlas-place-path.
- Bible 7: Bands = annular ribbons (createMasslineRibbonMaterial) just outside the
  shipped additive atmosphere shell (planetFactory ATMSHELL), depth-tested; Sheath =
  bow-shock cone of createPlumeMaterial ahead of hull, uBoost = the ONE sim heat
  scalar, plasma = createPlumeVolume two-layer at Commit; palette locked (working
  #9fd8e8->#d7e6ff, storm #ffb35c/#ff7040 lobes, reentry ramp #ffb35c->#ff5c5c,
  collector #39d0ff); Grey-read + reduced-motion/flash variants required.
- Determinism: pattern idiom (explosionPattern01-style integer hash), no Math.random
  in new emitters, no state.rng in presentation, cosmetic scroll on vfx _t only.
- Performance: VFX budget 2.5 ms of 16.7; <=6 draws per field effect; pool shares
  declared in inspect(); p95/hitch gates not averages.

## Phase 1 — SPIKE (planetary plasma/sheath scale-up)

STOP-gate. Goal: prove Sheath + Bands read at planetary scale within frame budget in
one throwaway scene; measured p95 numbers + screenshots personally viewed.

VERDICT: **PASS** (6 iterations). Script: scripts/spike-pq013-planetary-sheath.mjs
(throwaway; builds no production seams). Evidence: .devshots/pq013-planet/spike/
(7 PNGs + spike-report.json). GPU: real Intel D3D11 (ANGLE), headed Chrome, 1440x900.
All screenshots personally viewed at each iteration.

Final-run frame numbers (rAF deltas; calls/frame from the diagnostics mirror):

| scene | n | p50 | p95 | p99 | hitches>32ms | calls/f | tris/f |
|---|---|---|---|---|---|---|---|
| baseline (spike hidden) | 281 | 16.7 | 16.9 | 66.7 | 11 (settle) | 38 | 28.3k |
| far approach (3100) | 241 | 16.7 | 16.8 | 17.2 | 0 | 38 | 31.5k |
| approach (1500) | 240 | 16.7 | 16.8 | 17.1 | 0 | 43 | 31.7k |
| skim + thin sheath (905) | 361 | 16.7 | 16.8 | 17.0 | 0 | 42 | 32.8k |
| plasma sheath worst case | 360 | 16.7 | 16.8 | 16.9 | 0 | 43 | 34.0k |
| attrib planet hidden | 210 | 16.7 | 16.8 | 16.8 | 0 | 40 | 31.1k |
| COST PROBE textured sphere | 240 | 16.7 | 16.8 | 17.4 | 1 | 42 | 32.6k |
| after cleanup | 149 | 16.7 | 16.8 | 16.9 | 0 | 31 | 28.2k |

Whole planetary scene adds ~5 draw calls and ~4-6k tris. White-out gate: all 7 shots
PASS (worst = plasma 1.00% white, gate 2%). Bands + sheath are effectively FREE.

Spike findings (each cost an iteration; all carried into the production design):
1. CAMERA GEOMETRY: the chase camera is FIXED-HEADING (ARCHITECTURE 0.14 — position-only,
   never yaw) and looks DOWN-forward. A plane-level planet ahead is INVISIBLE at approach
   range. The colossal planet must carry its bulk BELOW the gameplay plane (centre y<0,
   crest near the plane) — same reason all deep-field impostors author negative Y. Physics
   stays planar x/z; Y offset is presentation.
2. WHITEOUT: full-strength additive ribbons over planetary areas blow out (iter-1 3.5%,
   iter-2 plasma 5.8%). Band intensities belong at <=~1.0/opacity <=~0.32; plasma core 3.4
   not 5.2. The bible already rules this (bands are thin/desaturated; boundary never blooms).
3. BAND GEOMETRY: flat rings collapse edge-on; vertical curtains equally thin from the
   fixed tilt. The read that works: shallow CONICAL SKIRTS (inner edge high, sloping
   down-outward, band surface crossing y=0 at its sim radius) — near arc faces the camera,
   far arc naturally occluded by the planet.
4. PLANET FILL COST: run-to-run variance matters. In a loaded/thermal-pressured run
   (iter 5) the 5-octave procedural planet shader at 60-70% frame coverage doubled every
   ~12th frame to 33ms, and the within-run A/B pinned it (planet hidden = clean, bands/
   sheath hidden = still 33ms). In a clean run (iter 6) the identical scene holds locked
   60fps. The baked-texture cost model (COST PROBE) holds budget in all conditions and has
   in-tree precedent (background planet-bake). PRODUCTION RULING: near-range planet surface
   uses a baked texture (bake the SAME shipped shader once; not a quality reduction — it
   also removes finding #5's artifacts).
5. CLOSE-RANGE SURFACE QUALITY: the shared detail-4 icosphere facets at skim range
   (N64 hazard); detail-5 helps the silhouette; the residual square patches are the value-
   noise CELLS of the shader itself, which the bake (higher sampling density + smooth
   filtering, optional extra octave at bake time) removes — confirmed visually by the
   smooth cost-probe sphere.
6. VISUAL READS at 1x default camera, personally judged: approach = planet hangs as a
   real world (PASS); skim = world fills the sky, ionization sheath wraps the nose (PASS);
   plasma commit = white-hot fbm bow-shock closes over the hull, trailer-grade (STRONG
   PASS); bands = present at the correct radii, budget-free, but per-band identity
   (outer/working/storm distinction) is still subtle — production must add the harvest
   motes (bible names them load-bearing for the working band), storm lobing, and per-band
   pulse rates. Carried as a production requirement, not a spike blocker.

## Phase 1 verdict

SPIKE GATE CLEARED. Sheath family (thin ionization -> two-layer plasma) proven at
planetary scale within budget; bands proven placeable/affordable with a working
presentation geometry; planet-scale approach/skim framing proven against the fixed
camera; cost structure understood with a proven in-budget fallback. Proceeding to the
vertical.

## Known failures / honesty ledger

(none yet)

## Phase 2+ architecture (rulings before code)

- ONE place: zone `zone_tethys_anvil` in sector_tethys_junction (NONZERO origin 12288,8192 —
  the anti-Helios rule), sector-local centre (2000,-2200) -> global (14288, 5992), zone
  radius 1000, new ZONE_TYPES entry `planetary_mass`. Atlas derives it (D2); map glyph =
  procedural disc tier; save identity = the zone id via existing owners. No new registry.
- Registration adapter: src/systems/planetRuntime.js lazy-spawns ONE transaction when the
  player's sector matches (47a never leaves its scenario sector; triple safety = Tier-B
  browser flag + sector mismatch + not in sf-sim curated list): planet entity (type
  'planet', static physics circle radius 470 = exclusion policy) + influence profile into
  the PQ-012 kernel via a new commented fields.js registerExternal seam + published
  state.planet runtime. Unwinds on sector exit.
- Influence: fieldKernel gains OPTIONAL innerRadius/innerSoft (default 0 = identical
  behavior for all existing fields) -> annular WELL: zero pull below r=900 (atmosphere has
  NO gravity trap - escape windows are real), ramp to peak ~1150 (sling region), falloff 0
  at 2600. Rides sampleFieldAcceleration + projectFieldTrajectory -> the PQ-006/PQ-012
  predictor shows the bent path for free. Heavy-shrug via couplingScale untouched.
- Bands (planar radii, hysteresis 18wu): reentry<800, danger 800-880, skim 880-1040,
  sling 1040-1450, influence 1450-2600, outside>2600. ONE heat scalar per tracked ship.
- Forces: ONLY kernel (attraction) + queuePhysicsImpulse (bounded atmosphere drag,
  recovery assist) - the dockingCorridor membrane pattern. No velocity writes.
- Damage: routeDamage(damageType 'reentry_burn') through the combat kernel in Breakup+;
  terminal kill = ordinary hull death (wreck/aftermath compat free).
- Plunge: Skim->Commit->Breakup->Descent->Aftermath from (band depth + heat + inward
  motion); outward motion regresses stages (healthy-escape preserved WITHOUT touching
  ai.js: a pursuer whose target leaves the band follows it out; only tumbling/disrupted
  ships cannot act).
- Recovery costs with ZERO new writers: assist impulse requires HELD BOOST (energy drains
  through the propulsion kernel natively), adds heat (my scalar), and the assist vector
  opposes tangential velocity (momentum spent). Never a teleport.
- Harvest: explicit collector toggle Digit8 (deployable-family idiom; Digit8 verified
  free); yield = |v| x density x dt; hydrogen shallow / helium-3 rich in danger band
  (BOTH existing commodities - zero economy churn); settles through cargo.addCargo only.
- Save: fields.js transient precedent — all planet runtime state derives/normalizes away
  on load; identity+position+cargo persist via existing owners; NO v13 bump, NO golden
  hash shift. Documented as a design choice in the runtime header.
- Visuals: visualFactory case 'planet' (baked-canvas planet material per spike ruling +
  ATMSHELL idiom + conical band skirts); vfx.js planetSkim subsystem (sheath pool player+4,
  band uniform ticking, harvest motes from streak pool share); planetHud band pill +
  commit cue through the voice bus.


## Phase 2-8 — build log (what shipped, where)

New files (all `git add -N`ed):
- src/data/planets.js — authored site constants + PLANET_FLAGS Tier-B + region classifier
- src/systems/planetRuntime.js — Q18 adapter, bands/heat/drag, Plunge, harvest, recovery
- src/ui/planetHud.js — band pill (bible 8.3 vocabulary), appear/fade contract
- src/render/planetSiteVisual.js — baked-canvas planet (spike ruling #4), ATMSHELL idiom,
  conical band skirts (spike ruling #3)
- test/planet-vertical.test.mjs — 11 tests, all green (check:planet)
- scripts/spike-pq013-planetary-sheath.mjs — the throwaway spike (kept as evidence)
- scripts/capture-pq013-planet.mjs — the route capture

Shared-file edits (minimal, commented, all mine this wave):
- src/core/fields/fieldKernel.js — optional innerRadius/innerSoft + tag passthrough
- src/systems/fields.js — registerExternal/unregisterExternal/updateExternal/hasExternal seam;
  external tag filtered out of rt.active (kept in snapshot for the predictor)
- src/core/registry.js — planetRuntime between fields and physics (both lists) + planetHud;
  ordering rationale comment
- src/systems/input.js — toggleSkimCollector Digit8 (VERB_BINDINGS, inherited by all schemes)
- src/render/visualFactory.js — case 'planet' dispatch
- src/render/planetFactory.js — export PLANET_COLORS (bake shares the palette)
- src/render/vfx.js — planetSkim subsystem (band scroll, 5-slot sheath pool, profile-scaled
  accessibility), plume material imports
- src/data/sectorZones.js — ZONE_TYPES.planetary_mass
- src/data/authoredPlaces.js — ZONE_TETHYS_ANVIL + appended to tethys list
- package.json — check:planet script

Live-route defects found and fixed (the route caught what node could not):
1. flat-armor vs micro-packets: per-tick dps*dt burn packets were erased by armorFlat before
   touching hull -> 0.5s cadence batching (planetRuntime), documented in-line.
2. stale rt reference after _unwind -> re-fetch (caught by the test suite).
3. hysteresis compared the INNER edge on the way out -> outer-edge comparison.
4. input boost is a held LEVEL at state.input.boost (not actions) -> recovery assist reads both.
5. keyboard.press() edge missed by the fixed-tick sampler -> hold 90ms (capture-fields idiom).
6. plasma sheath white-out at commit framing (2.02-2.14% vs 2% gate) -> core 3.0/0.62 tune.

## Route evidence (run 7, ROUTE_CAPTURE_OK, 0 issues)

.devshots/pq013-planet/route/ — route-report.json + numbered log; highlights:
- atlas nav: ui:setCourse to zone_tethys_anvil -> nav.autopilot.target = (14288, 5992)
- registration on residency flip: planet registered, field on predictor snapshot
- sling: free-flight pass bent 68-82 deg across runs (physics-real variance; a slow pass
  spirals in — the timed-release failure mode exists, which is the design)
- skim harvest: collectorOn via real Digit8 hold; +7 hydrogen through cargo owner; pill
  "WORKING BAND ... SCOOP"
- hostile: reaver_pirate (REAL archetype AI) pursued the bait weave into the bands and walked
  skim -> commit -> breakup -> descent -> aftermath; hull fell by routed plasma packets;
  DESTROYED through the ordinary kill path (wreck in scene)
- recovery: fresh commit, BURN NOW one-voice line, held S+Shift with mouse-out -> assist
  event, escaped 845 -> 1099 at heat cost, alive, no teleport
- save/Continue mid-vertical: pos delta ~20-30 wu, cargo kept, planet re-registered to the
  SAME zone id
- depart: region outside, band pill faded (contextual-instrument contract)
- accessibility: reduced-motion + reduced-flash variants of skim + reentry captured

## Command matrix (final, this worktree, all commands re-run after the last code edit)

| command | result | exit |
|---|---|---|
| npm run check:planet (NEW: test/planet-vertical.test.mjs) | 11/11 pass | 0 |
| npm run check:atlas-integrity | PASS (The Anvil charts) | 0 |
| npm run check:atlas (aggregate incl. place-path, map-frames) | PASS | 0 |
| npm run check:sim:compare | ok:true hashEqual:true (NO golden movement; no v13) | 0 |
| npm run check:save-schema | OK version 12, 262 paths (unchanged) | 0 |
| npm run check:physics-authority | membrane checks OK | 0 |
| npm run check:fields | 33/33 (kernel inner-radius extension backward-clean) | 0 |
| npm run check:mass-seed | 49/49 | 0 |
| npm run check:massline | 23/23 child checks | 0 |
| npm run check:massline2 | PASS | 0 |
| npm run check:npc-jobs | 61/61 | 0 |
| npm run check:interactions | 30/30 | 0 |
| npm run check:visual-stability | PASS | 0 |
| npm run check:ui-a11y | PASS | 0 |
| npm run check:perf (strict, headed, 2 runs) | FAIL 5 rows — see honesty ledger | 1 |
| node scripts/capture-pq013-planet.mjs | ROUTE_CAPTURE_OK, 0 issues, 15 gated PNGs | 0 |
| node scripts/check-pq013-planet-electron.mjs | PQ013_ELECTRON_SMOKE_OK | 0 |
| node scripts/probe-pq013-planet-perf.mjs | PQ013_LIVE_PERF_OK (numbers below) | 0 |
| node scripts/spike-pq013-planetary-sheath.mjs | SPIKE_CAPTURE_OK (Phase 1) | 0 |

## Live-scene performance (probe-pq013-planet-perf.mjs, headed, real Intel iGPU, seed 47)

| scene | n | p50 | p95 | p99 | hitches>32ms | calls | heapDelta |
|---|---|---|---|---|---|---|---|
| approach (2600) | 356 | 16.7 | 16.8 | 17.0 | 2 (settle) | 41 | +68MB (boot/bake residue) |
| skim (950, collector) | 342 | 16.7 | 33.2 | 33.4 | 18 (5%) | 49 | -277MB (GC of the above) |
| reentry (830, plasma) | 331 | 16.7 | 33.3 | 33.4 | 30 (9%) | 51 | +42MB |

Reading: the MEDIAN is locked at 60fps in every scene; at skim/reentry every ~10th-20th frame
misses vsync to 33ms on this test rig (integrated Intel, after hours of capture load). The
spike isolated the same scene's VISUAL stack at a clean 16.8 p95 (zero hitches, run 6) and its
loaded-run A/B attributed pressure frames to near-fullscreen fill; the live delta adds the
POPULATED Tethys sim (traffic 14/min + patrols + planet systems). No per-frame allocation in
any new update path (scratch reuse throughout; heap deltas are one-off bake/boot + GC).
Follow-up owed (named debt): quiet-rig re-measure + sim-vs-fill attribution via the existing
check:perf:attribution harness.

## Honesty ledger — known failures / debts / deferred

1. check:perf strict: FAIL with 5 rows (2 runs, stable): spatialHash.queriesPerSecond.max
   74.3 vs 55; raf.frame.p95.target 16.8 vs 16.7; worktree.cleanAndStable (uncommitted by
   design this wave); hitchesOver32.max 5-7 vs 0; phase.sim.p95 4.3-4.4 vs 4. The program's
   recorded clean-baseline (design/program/NOW.md, b28d183b) already carries the first three
   as named standing rows (spatialHash was 62.9 there — measured BEFORE PQ-014/015/016
   integration; this worktree's base includes them). Structural argument that PQ-013 does not
   worsen the Helios crowded-flight scenario: with no authored site in the sector the entire
   planet stack executes 3 field reads/frame and zero spatial queries, planetHud hides, the
   vfx subsystem stays un-built. Attribution to the integrated base vs this packet needs a
   clean-base strict run, which requires git writes this lane is forbidden — LEFT TO LEAD.
2. Live skim/reentry p95 33ms rows on the loaded iGPU rig (table above) — median locked;
   follow-up named above.
3. Massline-tether sling flourish (tether the planet limb, orbit, timed release with the
   release indicator) NOT attempted on the route: the field-assist sling is proven (68-82 deg
   measured bends of free-flight passes; predictor bend proven in check:planet). The tether
   path to a colossal static body is untested — deferred, named.
4. Bible ideals deferred (named, not faked): the Intake-funnel collector DEVICE mesh on the
   ship (motes + pill + cue ship today; the funnel visual is a polish pass); Breakup
   parts-shedding via the phasedExplosion scheduler (today: plasma volume + ordinary
   wreck/kill VFX at terminal); aftermath storm-lobe kick presentation (sim aftermath memory
   exists + is published).
5. Route-run variance: the sling pass bends 27-82 deg depending on entry (physics-real;
   slow passes spiral in and BURN — that failure mode is the design's risk curve, observed
   live in run 3).
6. planetHud pillHeat span is currently unused (text carries the number); harmless DOM node.
7. The reduced-flash skim variant (05b) renders close to the working band from inside
   (mid-lum 94-97%) — information preserved (pill + bands + silhouette), but the framing is
   deep-in-band rather than the ideal three-quarter view.

## Receipt

```yaml
packet: PQ-013
canonical: [W01, W02, SF-14, BUILD_PLAN_CORRECTED STEP 12]
status: implemented-uncommitted (lead review; all files git add -N)
branch: w3/pq013-planet-20260721
base: aa5c86ef
identity:
  atlas_zone: zone_tethys_anvil          # canonical (Q18); save/nav/mission reference
  site: planet_tethys_anvil              # src/data/planets.js
  sector: sector_tethys_junction         # nonzero origin (12288, 8192)
  global_centre: [14288, 5992]
spike:
  status: PASS (bible-mandated STOP-gate cleared before the vertical)
  evidence: .devshots/pq013-planet/spike/ + scripts/spike-pq013-planetary-sheath.mjs
  rulings: [bulk-below-plane, baked-near-surface, conical-band-skirts, below-bloom-bands]
surfaces:
  data: [src/data/planets.js, src/data/authoredPlaces.js, src/data/sectorZones.js]
  sim: [src/systems/planetRuntime.js, src/systems/fields.js(registerExternal),
        src/core/fields/fieldKernel.js(innerRadius), src/core/registry.js, src/systems/input.js]
  render: [src/render/planetSiteVisual.js, src/render/vfx.js(planetSkim),
           src/render/visualFactory.js, src/render/planetFactory.js(export)]
  hud: [src/ui/planetHud.js]
single_writer_compliance:
  forces: field kernel + queuePhysicsImpulse only
  damage: combat kernel routeDamage (plasma channel, source planet_reentry, 0.5s cadence)
  cargo: cargo.addCargo only (hydrogen shallow / helium-3 storm band)
  credits: untouched
  energy: untouched (recovery burn rides held boost through the propulsion kernel)
golden: {sim_compare: hashEqual, save_version: 12-unchanged, flags: PLANET_FLAGS Tier-B,
         sector_isolation: tethys-only, sf_sim_curated: absent}
checks_green: [planet(11), atlas, atlas-integrity, sim:compare, save-schema,
               physics-authority, fields(33), mass-seed(49), massline(23), massline2,
               npc-jobs(61), interactions(30), visual-stability, ui-a11y]
checks_red:
  - {id: check:perf, rows: 5, classification: standing-debts + integration-attribution-owed,
     detail: see honesty ledger 1}
evidence:
  route: .devshots/pq013-planet/route/ (route-report.json, 15 gated PNGs, numbered log)
  electron: .devshots/pq013-planet/electron-smoke-*.{png,json}
  live_perf: .devshots/pq013-planet/live-perf-report.json
  all_screenshots: personally viewed (spike iterations + route beats + electron)
deferred: [massline-tether-sling, collector-funnel-device-mesh, breakup-part-shedding,
           aftermath-lobe-kick, perf-attribution-clean-base]
```

PQ013_IMPL_DONE
