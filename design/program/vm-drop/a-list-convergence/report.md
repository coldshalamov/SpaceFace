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

## Repair 1 — station swallow (commit dce047820)

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

## Current worst problem (post-repair-1 census)

Giant blue arcs fill the crucible-start frame — next candidate under the loop.

## Reverted experiments

None yet.
