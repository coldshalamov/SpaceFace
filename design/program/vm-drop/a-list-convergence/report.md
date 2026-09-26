# A-LIST VERTICAL SLICE CONVERGENCE — running note

Job: make the existing 15-min vertical slice play as one coherent game.
Lane: `vm-work/a-list-convergence` (work branch), patches land here.
VM: software GL (SwiftShader/llvmpipe) — fps/hitch numbers are tier-relative, not absolute.

## Baseline (SHA 33820124d, master)

- `check:baseline`: 16/16 green.
- `probe:demo-path`: CLEAN PASS. 14.3 min wall. TITLE→CRUCIBLE→death/rounds→RESULTS→BELT→ADVENTURE→DOCK→pay→upgrade→END. frames>100ms ~15-20% of frames (SwiftShader caveat — informational only).
- Launch-to-control: title 2.8s, crucible-launch 0.5s; firstPlayableFrame gates normal.
- Runtime witness / launch measurements: collected under `.devshots/` (seed-fixed boot).

### Phase-0 census (worst breaks, ranked)

1. **Station swallow** — authored Helios trade hub (~780-1100 WU vs 180 WU collision footprint)
   roofs the whole docking corridor + berth; whole-city clearance AABB pins the chase camera
   at ~377 WU → hull invisible on every dock and during combat near Helios. Approach probe:
   11/25 frames occluded, berth ceiling 125 WU.
2. Giant blue arcs dominating the crucible-start frame (combat readability).
3. Wordy target card (right panel reads as a text block, not an instrument).
4. ~20% frames >100 ms — hitching (SwiftShader caveat; verify on real GPU before chasing).
5. Beige-clay asteroid material reads flat/unlit at distance.

## Repair 1 — station swallow (commit 12610579d; rebased onto master d4359bd2c — pre-rebase SHA dce047820)

Two coupled causes, both fixed:

- **Art/corridor registration**: `place_station_trade_hub` GLB's real open flight channel is
  authored at bearing ~250deg; each station stamps its own corridor bearing (Helios 135deg
  after snap). Fix: `AUTHORED_APPROACH_CHANNEL_DEG` per placeFile in partsLibrary — rotate the
  authored root about its visual center so the channel lands on the effective corridor
  bearing. Proxy, berth, autopilot routing untouched. Applies per-station (Tethys/Drift/Reach
  share the archetype; each registers on its own stamped bearing).
- **Clearance ratchet**: `cameraClearanceFloorAt` used one whole-boundary AABB per structural
  root → any XZ inside the 1350-WU footprint floor = maxY+16 = 377; camera desired height is
  always below that so it ratchets up and can never release while over the station. For roots
  wider than 240 WU the floor now reads a per-column occupancy grid (24 WU cells, built once
  per authored commit from real triangle coverage, cached with the same assetState/composition
  stamp). Compact structures keep the AABB path.

Proof (same seeds, authored state live):
- corridor lane open: berth ceiling 125→50 WU; corridor-band coverage drops; open arc
  centered on the corridor bearing (map probe).
- approach leg: 11/25 occluded → **1/50**; camY rides 110-215 over local roofs instead of
  pinned at 377; `[E] DOCK AT STATION` live with hull on open deck.
- `check:baseline` green; `test/pic-07-wreck-camera-clearance` 5/5 green.
- demo-path re-run post-fix: CLEAN PASS, no new console errors.

Instrument: `scripts/probe-station-occlusion.mjs` — `--headless` flies the real approach;
`SF_OCCL_MAP=1` raycasts a polar roof map + lane ceiling profile + bearing screenshots.

## Repair 2 — arena-scale field ribbons bury the crucible frame (commit 6a771596a; pre-rebase SHA 8729b472b)

Cause: the giant cyan arcs at crucible start were `SF_FieldForceLanguage` — the
field-force presentation drawing live sim fields. Arena phases install
environmental fields at r=300-620 WU (`survivalArena.js`: loose_plate well r=470,
furnace repulsor r=430, absorbent_screen r=620, boss wells r=560), but run the
same recipes authored for hand-deployed tools (r<=~150): 19 ribbon surfaces per
well at proportional width (r*0.05-0.07 -> 24-33 WU-wide bands) and flat ~0.88
alpha. At arena radius that is a wall of neon scythes over the whole combat
frame for the first 30-60s of every round — the top readability break.

Fix (`fieldForcePresentation.js`): per-field `presence` scales non-boundary
surface alpha linearly past `FIELD_LANGUAGE_FULL_RADIUS=170`, floored at 0.30.
The physics-boundary role keeps full alpha (the zone edge must stay truthful);
small deploys unchanged (presence=1). Same surface counts/shapes — lifecycle
and recipe contracts untouched.

Proof (same seeds, `scripts/probe-crucible-arcs.mjs` timed series):
- cyan arc pixels at crucible start: 45-53k -> 10-21k; zone edge + inward
  direction remain legible; ship/targets/rocks read over the field, not under.
- `check:vfx-force-language` 92 pass; `check:baseline` 16/16; demo-path CLEAN
  PASS re-run post-fix (~14.5 min), module fitted + paid + demoEnd reached.

Instrument: `scripts/probe-crucible-arcs.mjs` (timed frame series +
`state.fields.active` snapshots + scene census + pixel raycasts).

## Post-repair-2 census (remaining ranked)

1. ~15-26% frames >100 ms in transit/dock segments (SwiftShader caveat — "GPU
   brick" logs are one-time bloom program compiles on first-seen materials;
   needs a real-GPU pass before chasing).
2. Target card density (designed jargon language; would be a taste edit, not a
   defect fix — deferred unless owner wants it).
3. Beige-clay rocks — authored object-space geology PBR IS live (vertex colors,
   sfGeologyPbr AO/roughness/normalStrength, 42-deg crease); reads smooth at
   flight scale on SwiftShader. Not a code defect on this tier.
4. `SF_StationArchetypeFallback` cyan scaffolds at 3-20k WU = designed
   progressive-load placeholders; authored GLBs resolve on approach (verified
   dock frames show authored hull). Not a defect.

## Reverted experiments

None.

## CLOSE-OUT 2026-09-26 — shipped

- Branch `vm-work/a-list-convergence` rebased clean onto `origin/master` d4359bd2c
  ("Release completed living adventure lanes") — no conflicts; pushed. PR #162.
- Post-rebase `check:baseline` on this tree: 12/16. Clean master at the same SHA:
  11/16 — every red on the branch is red on master too (sim/sim-v3/sim-v3-compare
  47-A hash drift + pq020 topology digest + master's own ui-control-labels break,
  which this branch fixes). Upstream reds logged as demo-ledger row D51
  (commit bc89361e9).
- vfx-force-language 18/18 re-verified post-rebase.
- Patch series regenerated against the rebased base (5 patches, 0001–0005).

### Final owner report (short form)

TRANSFORMATION: the two loudest seams of the 15-min path now read as designed —
dock approaches keep hull + berth on glass (11/25 occluded → 1/50), and the
crucible opens on the arena, not a wall of neon scythes (~45–53k → ~10–21k cyan
px at t=2–15s; zone boundary still full-strength).

BIGGEST FIXES: (1) station corridor registration + per-column camera clearance
grid; (2) field-language presence scaled by field radius (recipes/counts
untouched); (3) gamepad dock-label check pinned to the shipped binding;
(4) committed census instruments (probe-station-occlusion, probe-crucible-arcs);
(5) D51 ledger row for the upstream baseline reds.

REMAINING A-LIST BREAKS: >100 ms hitches are SwiftShader-amplified one-time
shader compiles — needs a hardware-GPU witness pass (extend precompile.js warm
lists from the brick log). Target-card jargon density: designed language, taste
edit, deliberately untouched.

DO NOT TOUCH: PaintedStellarLight nebula plates, SF_StationArchetypeFallback
progressive-load scaffolds, objectSpaceGeology rock PBR, camera shake, top-down
view, hull knockback (owner rulings stand).
