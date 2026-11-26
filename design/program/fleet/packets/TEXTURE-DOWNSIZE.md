# TEXTURE-DOWNSIZE — small things stop carrying big textures

**For:** a careful engineer with the asset tools. **Kind:** asset pipeline. **Commit when verified.**

## Why

An audit (`.devshots/director/fable/assets/ASSET-COST.md`; full table
`.devshots/director/fable/assets/asset-cost.json`; script `scripts/audit-asset-cost.mjs`) found 98
small bodies (nav buoys, worklight towers, mining drones, ash pins, rescue capsules, pebbles and
others) that carry 1024-pixel texture sets while covering 20–80 pixels on screen. Each wastes about
3.3 MB of graphics memory when loaded, about 320 MB across the set, on a laptop whose graphics
memory is shared with everything else.

## Do

1. From the audit's JSON, list every drawn body flagged for oversize textures, with its on-screen
   pixel estimate and the files that hold its textures.
2. Find how release textures are produced for these bodies (the release packaging scripts under
   `scripts/` and `scripts/lib/`, for example `releasePackaging.mjs`; the KTX tools are on the PATH)
   and re-encode each flagged body's textures to the smallest power-of-two edge that is at least
   twice its largest on-screen pixel size, never below 128 and never above what it has now. Use the
   pipeline's own settings for format and mipmaps. If a texture is shared with a body that needs
   the larger size, leave it and say so.
3. Update whatever manifest, hash or metadata the runtime checks for those files (search for how the
   existing packages record texture sizes and digests) so the game loads them without warnings.
4. Do not change geometry, materials or any body that is large on screen (ships, stations, big
   rocks).

## Prove

- `node scripts/audit-asset-cost.mjs` before and after: the oversize-texture flag count and the
  total decoded texture memory for the flagged set.
- `npm run check:playable` through the lock (`node scripts/fleet/game-lock.mjs run -- npm run
  check:playable`): every asset served, no shader or asset errors.
- The asset checks that mention textures or packages
  (`grep -n "check:.*asset\|check:art\|check:bundle" package.json | head`): run them.
- In the receipt: the list of bodies changed with old and new sizes, the ones you skipped and why,
  and the memory saved.

## Files

The release texture files and manifests for the flagged bodies under `assets/`, and pipeline
metadata they require. No source code unless a manifest generator must be re-run.
