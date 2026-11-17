# HANDOFF — remaining graphics-coverage work (2026-11-17)

Written at session close. Read this together with:
[`HANDOFF-REMAINING-20261117.md` companion state in the ledger itself]
(`node scripts/fleet/asset-review.mjs summary` is the authoritative starting point),
the [session's dispatch records](../../../../.devshots/fleet/dispatch-20261116/), and
[`docs/visual-assets/README.md`](../../../../docs/visual-assets/README.md).

## 1. State at handoff

- **364 models `passed`** with byte-hashed evidence and per-model journals (from 0 at
  session start on 2026-11-16).
- **123 `needs follow-up`**, every one with a precise, actionable defect note — most with
  exact mesh names, draw counts, and root causes. This is NOT finished work; it is
  diagnosed work awaiting construction fixes (§2) and capture-gap closures (§3).
- **~3,100 records** remain `unused/unresolved` or outside the playable set — identity
  analysis exists ([`scripts/fleet/identity-resolve.mjs`] output in
  `.devshots/fleet/dispatch-20261116/identity-resolution.md`); 1,264 groups are resolved
  with evidence, 1,784 remain honestly ambiguous.
- **8 local merge commits** (not pushed): `22a64e280f` ledger+tools, `e60c23c202` machines,
  `c087fb564f` asteroids, `3b2144d4eb` viewer+renderer wedge fix, `50f15e9d18`, `93f64e2802`,
  `1a93fbe9cf`, `00153ae8e2`, `2712905c0a`, `c2fdcda089`, `9a979228a3` (hornet),
  `52029fa1a6` (mesh-drop race fix), `3baa61b667`, `ca79341167`, `ef8a07e2e4`.
- **918+ recorded iterations** across 200+ models in
  `design/program/fleet/graphics-asset-review/iterations/`.

### Uncommitted tree state (decide before doing anything else)

| Item | Files | Status |
| --- | --- | --- |
| Station-kit forge attempt | `tools/blender/forge/ships/var_station_kit_*.py` (14) + rebaked `assets/ships/release/parts/places/var_station_kit_*.glb` (14) | openencoder6's session stalled mid-task; the forge bake did NOT visibly densify interiors (post-bake captures in `.devshots/.../station-kit-fix-20261116/` look the same as baseline). Keep-for-reference or revert — decide when dispatching §2.3. |
| `--dist` camera override | `scripts/fleet-look.mjs`, `src/render/fleetLook.js` | devin3k's override flag — REQUIRED for the wide-radius recaptures already accepted into the ledger (landmarks, last_argument, ceres_breaker). Commit this before any push. |
| Presented-frame race fix | `src/render/renderer.js` | COMMITTED in `52029fa1a6`. |
| Crusher module GLB | `assets/ships/release/parts/places/place_crusher_module.glb` | Prior session's work (steel collar fix), pre-existing dirty — not this session's. |
| Everything else dirty (~240 files) | greeble/apron/crusher packages, character+fauna sources, belt-empire/asteroid-puzzle systems, field-build UI, ninth-mouth tests | Other agents' concurrent work. Preserve. |

## 2. Construction fix waves (models flagged `needs follow-up`)

Each wave below has per-model defect notes IN THE LEDGER (run
`node scripts/fleet/asset-review.mjs show <modelId>` — the `issues` field carries the fix
spec; the recorded events in `events-*` dirs carry mesh names). Dispatch as focused
worker briefs the same way this session did (template:
`.devshots/fleet/dispatch-20261116/brief-*.md`).

### Wave A1 — procedural ship builder rework (22 models, systematic cause)

**Cause (one fix, 22 symptoms):** the procedural ship builder grafts Kestrel-derived parts
onto every body — `recessedCanopy` bubble wider than the fuselage, `ship:dish` on sticks,
`hullSlabGeo` grime slab 1.5× hull width, floating `addNavBlinkers` orbs, `nose:panel`
decals projecting past tapers, detached `engineProp` nozzles — plus glow-dominated
primitives (`emissiveIntensity` 1.2–2.8 solid-white spheres/bars) and un-beveled box
stacking. Full per-body defect list: recorded events `events-agy1/agy1-procship-*.json`
and `results/agy1-procships.md`.

Fix: rework the part-grafting to measure against each body's own hull cross-section,
bevel stacked boxes, cap emissive intensity, attach nozzles to hull surfaces. Faction
lore bodies (vael-sniper, concord-interdictor, drift-barge, meridian-trader,
quiet-raider, reaver-pirate) have strong silhouettes — preserve them; fix only the
floating/clipping/glow parts. Fleet-look routes + `--init` staging commands are in
`batch-plan.json` (`proc-ships-enemy/family/faction`); devin3j's session corrected the
poisoned fetch-block init — use its corrected pattern
(`results/devin3-procships.md`).

### Wave A2 — open-water fauna volume rebuilds (18 species, mesh-level specs)

All 18 `needs follow-up` species have exact defect + mesh names in
`events-agy1/agy1-fauna-*.json` and `results/agy1-fauna-open.md`. Group by cause:

- **Flat-card**: archive_crab (4 slab `ac_plate`s).
- **Occluded cores**: blind_shepherd (`bs_skirt` hidden under `bs_shell`), furnace_maw
  (`fm_bowl` seals `fm_throat`), stone_lung (`sl_throat` entombs `sl_core`).
- **Featureless primitives**: bristle_ram, hull_leech, glassback (untextured dome),
  suture_mite, wake_eel (9 sphere beads).
- **Glow dominance**: needle_swarm (`ns_core` 0.8 dominates), spindle_mother (18 glowing
  spheres + crown 1.4), void_carrier (132 WU, 19 glare spheres, crops frame).
- **Edge-on/thin**: black_sail (0.06-thin ellipsoid captured edge-on), mourning_kite
  (hairline stem).
- **Primitive geometry**: pilgrim_spine (6-sided cone + straight cord).

The in-code recipe to follow: the Bolus folded-volume rebuilds (blister/mote/nerve/
papilla/pearl/pleat/polyp/rib/ring/scale/spur — all passed) — bounded folded brown
volume, crease texture, preserved silhouettes. `veil_ray` needs a nose-root seam fix +
non-nursery site variants; it otherwise passes.

### Wave A3 — station-kit interior content (14 kits, one shared cause)

Forge attempt (openencoder6) edited `tools/blender/forge/ships/var_station_kit_*.py` and
rebaked, but post-bake captures show interiors still sparse — either the edits were
insufficient or the bake didn't pick them up. Its session stalled before explaining.
Decision needed: (a) diagnose its forge edits and re-bake properly, or (b) switch to the
JS-side content route. Target: interior module density comparable to the passing
`place_station_blackmarket`/`fab`, faction accents per variant — archive=archive racks,
choir=spires, concord=blue modules, drift=drift buoy, frontier=frontier towers,
fulfillment=container stacks, helix=helix core, meridian=meridian spire,
pitborn=scrap blocks, quiet=dim quiet-hab, reach=reach arm, understory=growth domes,
vael=vael fins, verge=survey masts (match each faction's existing color accents).
All 14 ledger entries are `runtime:SF_PLACE_STATION_KIT_<FACTION>:var_station_kit_<faction>_v01`.

### Wave A4 — small fixes

- `place_aftermath_frag_grating_sheet` + `..._authored_down` (2): standing flat/dark-at-
  approach finding from the 20261115 batch — material/geometry fix, then recapture.
- `runtime:SF_PLACE_LATCH_NINE` etc: none — fine.
- `procedural:bomb:concussion` — DONE (passed 2026-11-16).
- `runtime:SF_PLACE_CUSTOMS_PYLON` — plain body; the active redesign workstream owns it.
  Recapture after that lands.

## 3. Capture-gap closures (no construction needed — recapture/verify)

- **`--dist` recaptures DONE and passed**: last_argument, ceres_breaker, 4 landmarks.
  The `--dist` override in `scripts/fleet-look.mjs` is uncommitted — commit it (§1).
- **`place_aftermath_aft_dock_collar`** — recapture (piece too small for auto-framing).
- **`place_aftermath_aft_radiator_panel`** — recapture at an angle (was edge-on).
- **`procedural:environment:bolus_canal_rib`** — capture a frame with canal ribs clearly
  in view (sector shot had ribs inconclusive).
- **ruckus characters (2)** — BLOCKED: character GLBs use `spaceface.character.ruckus.v1`
  schema, not the part contract; needs a character path in `fleetLook.js` (owner: next
  viewer worker; the schema facts are in `results/devin3-sites-props.md` era logs and
  devin3g's notes).
- **veil_ray completeness** — nursery aggregate flock + 4 non-nursery sites use an
  uncaptured primitive builder (`buildVeilRay`); nose-root seam slot open.
- **Motion states** — all fauna/machine captures are static t=0; `defense`/`retreat`/
  `alarm`/`charge` states, strain variations under motion, and armed-bomb-in-flight
  views remain uncaptured (agy1's report §Remaining; machines idle/working ARE done).

## 4. Verification passes (the noted residual gap on every passed model)

All 364 passed models carry: "ordinary-play encounter/approach/composition view
remains the noted residual gap." The completion pass is:

1. Ordinary-play flythroughs past each family (asteroid field, Works site, stations,
   claim outposts, aftermath field, cargo yard, Bolus canal) with screenshots — one
   session per family cluster, family-batch commands exist in `batch-plan.json`.
2. In-scene composition checks for the structural kit pieces (crossbeam/keel/long_plate),
   vault's near-black body, cockpit_slab's dark canopy, refinery module midtones.
3. Record `ordinary-play` scope iterations via the recorder for models where the play
   view confirms the isolated pass.

## 5. Owner actions (only you can do these)

1. **Asset server refresh/restart** — the boot-swarm gate refuses until served assets
   match HEAD (~19 stale package files listed in `.devshots/fleet/gate-boot-swarm.log`).
   Harness verdict: "not a gameplay FAIL", but the gate stays refused until synced.
2. **Push decision** — 8+ local commits on master are unpushed.
3. **devin acct4** — unauthenticated (`devin-acct.cmd acct4 auth login`); optional 4th slot.
4. **openencoder6's stall** — if you run it again, the deepseek-v4.1-flash-free model via
   `opencode run` can hang silently 2h+ on large briefs; the forced-early-output kickoff
   helped but did not fully prevent it. Prefer devin slots for long briefs.

## 6. Process manual (how to resume)

- **Start**: `node scripts/fleet/asset-review.mjs summary` → the ledger IS the queue.
- **Worker slots**: `devin-acct.cmd acct1|2|3 -p --model swe-2-max --permission-mode
  dangerous --prompt-file <brief>` (acct4 unauthenticated); `agy-acct.cmd agy1|agy2
  --model gemini-4-hydrogen-xhigh --dangerously-skip-permissions --print "<pointer>"`;
  `opencode run --model opencode/deepseek-v4.1-flash-free --auto "<pointer>"`. agy
  print-mode buffers output until the turn ends; opencode can hang silently on very
  large briefs (force early visible output; prefer devin for long ones).
- **Renderer runs**: always `node scripts/fleet/game-lock.mjs run -- ...` with
  `SF_GL=d3d11` + `PLAYWRIGHT_BROWSERS_PATH=C:\Users\93rob\AppData\Local\ms-playwright`.
- **Ledger discipline**: single writer (the orchestrator) applies `record`/`status`;
  workers write event JSONs only. The recorder rejects duplicate action+observation
  pairs and unknown LOD targets (targets are `<asset>#lod0` / `wholeship_<asset>#lod0` /
  `procedural:<...>:lod0` / `primary-or-contained-lods` — check `show <id>` first).
- **Usage walls**: agy accounts have 5h windows (429 RESOURCE_EXHAUSTED is retryable —
  wait or switch account); deepseek-free via opencode can hang on huge briefs.
- **Session-transcript recovery** works: agy transcripts at
  `~\agy-profiles\<profile>\.gemini\antigravity-cli\conversations\*.db` (sqlite `steps`
  table); devin sessions per directory (`devin list` / `-r <id>` / `--export`); opencode
  sessions in `~\.local\share\opencode\opencode.db` (`opencode export <id>`).
- **Known pitfalls**: FIFO lock fairness (foreign demo/gate runs interleave — wait,
  don't kill foreign work); oversized hulls/megastructures need `--dist` wide captures;
  duplicate record attempts throw (expected — means already recorded); zombie worker
  processes outliving their wrappers (`taskkill /PID <pid> /T /F` after tracing ancestry
  via `Get-CimInstance Win32_Process`).

## 7. Completion definition (when is it "finished")

Every in-scope model `passed` with: current-isolated evidence at game scale (chase+
close+inspect, LOD0+LOD2, both states where applicable) AND an ordinary-play scope
iteration confirming the in-scene read. Zero `needs follow-up` whose issues field
describes an unbuilt fix. The `unused/unresolved` set stays honestly ambiguous until
you decide unreferenced-kit = excluded-from-scope (devin2's analysis gives you the
evidence to decide: 60 runtime-reachable, 1,130 authoring-only, 74 duplicates,
1,784 ambiguous).
