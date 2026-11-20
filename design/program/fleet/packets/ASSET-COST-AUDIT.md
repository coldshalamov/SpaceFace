# ASSET-COST-AUDIT — what every model costs to draw, and which ones cost too much

**For:** a careful engineer. **Kind:** write one audit script, run it, report. No game code changes.
**Commit the script when it works.**

## Why

The owner suspects some models "do three times the work they need to". The game is top-down; most
ships are 25–120 pixels on screen, on a laptop with integrated graphics. Nobody has a table of what
each model costs. Build it.

## Build `scripts/audit-asset-cost.mjs`

A Node script, no new dependencies (parse the GLB container yourself: 12-byte header, a JSON chunk,
a BIN chunk; read accessor counts from the JSON).

1. **Find every model the game can load.** Start from the manifests the runtime reads, not from a
   folder listing: `assets/ships/parts/parts_manifest.json`, anything under `assets/ships/release/`,
   `src/data/modelTruthCensus.json`, and the loaders in `src/render/` (search for `.glb` and for the
   manifest file names to find the rest: stations, places, rocks, props, arena sets, fauna). Also
   list GLB files on disk that no manifest or source file names (dead weight).
2. **For each GLB record:** file size; mesh count; primitive count (each primitive is at least one
   draw call); triangle count (from index accessor counts, or position count / 3); vertex count;
   material count and how many are duplicates of each other; texture count with each image's pixel
   size and format (PNG, JPEG, WebP, KTX2); whether it has skins, animations or morph targets; node
   count; its bounding size in model units; and which LOD siblings exist for the same hull
   (`_lod1`, `_lod2`, authored-down variants).
3. **Work out the on-screen size.** Find how the game scales each kind of body to world units and
   the default camera (`src/render/camera.js`; ship scale in `src/data/ships.js` and the hull
   records). Estimate each model's typical pixel footprint at the default zoom on a 1920×1080
   screen. An honest estimate with its formula stated is fine.
4. **Flag waste**, each with a reason and a number:
   - triangles per on-screen pixel far above 1 at the typical size (say which LOD is in use there);
   - more than about 8 primitives on a body that is small on screen, or many primitives that share
     one material and could be one draw;
   - textures larger than the body can show (for example 2048 px on a hull that covers 80 px), and
     uncompressed PNG/JPEG where a KTX2 sibling does not exist;
   - bodies with no lower LOD that appear in crowds (Swarm enemies, traffic, rocks, debris);
   - the heaviest twenty models by triangles, by primitives and by texture memory;
   - anything that looks wrong: zero triangles, hundreds of thousands of triangles on a prop,
     duplicate geometry, hidden interior geometry a top-down camera never sees.
5. **Output:** `--json <file>` writes the full table; the default prints a readable summary: totals,
   the flagged lists, and a top-twenty "cheapest big wins" ranked by estimated saving.

## Report

Run it and put the summary in your receipt. Also save the JSON to
`.devshots/director/fable/assets/asset-cost.json` and the readable summary to
`.devshots/director/fable/assets/ASSET-COST.md`. In the receipt, in plain words: the ten changes
that would save the most, what each would save, and how sure you are.

## Files

Create `scripts/audit-asset-cost.mjs`. Edit nothing else. Do not start the game.
