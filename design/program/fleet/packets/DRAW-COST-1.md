# DRAW-COST-1 — small and distant ships stop drawing at full detail

**For:** a careful engineer in the renderer. **Kind:** level-of-detail selection. **One commit per
part.** Do this after STREAM-BUILD-1.

## Why

An audit measured every model (`.devshots/director/fable/assets/ASSET-COST.md`, and the receipt under
`.devshots/fleet/runs/ASSET-COST-AUDIT.glm.*/RECEIPT.md`). All 120 ship hulls ship with a middle and
a low level of detail that **never draw**: `WHOLE_SHIP_LOD_RUNTIME_DEMOTION = false`
(`src/render/wholeShipLodPolicy.js`). So the tenth enemy of a wave draws the same 24,316 triangles
as a close-up, where its low tier is 3,854. The game is becoming a horde of 200–300 enemies on
screen; at full detail that is six million triangles a frame on integrated graphics.

Demotion was switched off because swapping tiers at runtime made ships blink or thrash. The fix is
to choose well and swap safely, not to leave every ship at full detail.

## Part A — choose the tier by size on screen

1. Read how tiers are chosen and swapped today: `src/render/wholeShipLodPolicy.js`,
   `src/render/lod.js`, the ship admission and LOD call sites in `src/render/partsLibrary.js` and
   `src/render/renderer.js`, and the tests that mention them. Find the commit or comment that turned
   demotion off and what it saw.
2. Choose each ship's tier from its **projected size on screen** (pixels of its bounding radius at
   the live camera), not from distance bands: full detail when large (the player's ship always),
   middle when medium, low when small. Pick thresholds so a tier change is not visible at the
   gameplay camera, and state them.
3. Add hysteresis (a ship must cross a threshold by a margin, and stay there about half a second,
   before it changes tier) so nothing thrashes at a boundary.

## Part B — swap without a blink

A tier change must never show an empty frame, a pop of position or lighting, or a wrong material.
Prepare the target tier fully (geometry uploaded, materials and shader programs compiled and warm,
transform copied) while the current tier keeps drawing, then swap both in the same frame. If the
target cannot be ready, keep the current tier. Reuse the prepare-then-commit machinery the model
upgrade path already has rather than writing a second one.

## Part C — the first tier is the right tier

A ship that spawns small or far (most Swarm arrivals) is admitted directly at the tier its size
calls for, so it never loads full detail only to demote.

## Prove

- A probe that flies a Swarm round and an Adventure approach and records, per frame: triangles
  submitted, draw calls, ships per tier, tier swaps, and any frame where a ship had no drawable.
  Before and after, same seed. Run it through the lock
  (`node scripts/fleet/game-lock.mjs run -- <probe>`).
- Frames at the moment of several tier swaps, opened or described pixel-wise by diffing consecutive
  frames around the swap: no blank frame, no visible pop at the gameplay camera.
- `npm run check:playable` passes; the tests that pin "demotion is off" are rewritten to the new
  rule.
- Report triangles per frame and frame time before and after in a crowded scene.

## Files

`src/render/wholeShipLodPolicy.js`, `src/render/lod.js`, the LOD and admission regions of
`src/render/partsLibrary.js` and `src/render/renderer.js`, their tests, a new probe under `scripts/`.
`renderer.js` and `partsLibrary.js` are shared with other agents: use
`bash scripts/fleet/own-commit.sh begin <file>` before editing and
`bash scripts/fleet/own-commit.sh commit "<message>" <files>` so only your lines land. Do not touch
the pose/snapshot code or the effects code.
