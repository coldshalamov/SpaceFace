# Model polish lanes

This is a workflow, not a new graphics queue. Heavy picture work still belongs to the
packets that already own it: `PQ-193` (the picture never looks broken), `PQ-050`
(one flyable ship at a time), `PQ-136` (unused packs), and `PQ-049.05` (the liner).
Hitch / Kestrel stays frozen. Do not open `PQ-194`.

Run it with `/workflow model-polish-lanes`.

- A normal run only looks. It writes a report and does not edit models.
- `args.act: true` adds a tuning pass after the look. That pass may edit source
  models only in the ways listed below.
- `args.lanes` is an optional list of lane ids. Omit it to cover every lane.

The September 9 stocktake and the September 19 Helios inventory do not tell the same
story. One says the opening picture is still tubes and kitbashes. The other says 68
families were accepted. The survey re-reads the live files and says which claim
still holds. Neither document is allowed to win from memory.

## The look (already settled)

Direction is Lacquer & Starlight in `docs/visual-assets/ILLUSTRATED_GRAPHICS_STANDARD.md`.
Craft gates stay in `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`.
The bar stays in `design/program/MODEL_STOCKTAKE.md`.

This workflow does not invent a second art direction. Painted working craft, shared
light, occupational color, and materials that stay different substances (paint, metal,
ceramic, glass, rubber, signal). Hitch is the floor of that language. A valid file
is not accepted art.

## What a file count showed on 2026-09-24

298 model files, about 1.1 GB, all readable. This is structure, not a beauty verdict.

- Almost no file stores an explicit material role. That is not 298 broken models. The game already reads the material's name and only guesses "hull" when the name says nothing. The useful consistency fix is the unnamed material, not a mass retag.
- No file still has raw Cube or Cylinder node names. The old "this is a tube" note cannot be settled from names. Someone still has to look at the picture.
- The cheap performance win is too many separate pieces for the triangles they hold. The ore-freighter wreck bows are about 200 pieces and about 5,000 triangles. The cold locker is about 100 pieces and under 2,000 triangles. The whistle is the same pattern. Two Span faction ships are about 100 pieces each. Joining pieces that already share a material cuts draw calls without changing the shape.
- The trade hub is the heavy place: about 78 MB, 39 images, and about 1.7 million triangles. Joining draws does not fix that. Do not thin it out in a tuning pass.
- The refinery and the military station are the next heaviest places (about 170,000 and 110,000 triangles).
- Hitch is the heaviest ship file, about 51 MB, and it stays frozen. Most of that weight is the paint textures, including on the distant versions. Do not shrink it.
- Duplicate material names were not the problem. There were none.
- A `revamp-evidence` folder holds copies of kit parts. It is not a lane. Do not polish it.

## What “all the work” actually is

Three piles. Only the first pile is safe to do in parallel on a demo branch.

### 1. Light tuning (this workflow, and only with `act`)

Safe on one source model at a time, without changing the silhouette:

- Join pieces that already share one identical material, when the piece is static
  (no skeleton, no animation, no attachment socket). That cuts draw calls. This is
  the common cheap win.
- Drop a texture slot that nothing uses.
- Name a role on a material whose name is generic, so the game does not paint it
  as hull. Do not retag materials that are already named. A missing role tag on a
  well-named material is not a defect.

Not in this pile: new shapes, booleans, decimation, new greebles, repaints, LOD
rebuilds, shared texture files, release packages, shaders, or the loader.

### 2. The picture (existing packets, not this tuning pass)

These are real, and they are bigger than a metadata edit:

- Opening traffic that is still a kitbash or a tube, reverse thrust that is still a
  needle, buoys, pods, the rescue can, the gate, the mining drone, wrecks, and
  stations that fall back to a cylinder. `PQ-193`.
- Buyable ships other than Hitch, one hull at a time, at the chase camera. `PQ-050`.
- Shelf bodies we already own (Corsair, Arclight, tanker, cutter, faction kits)
  only after the opening picture is honest. Still `PQ-193`, later waves.
- The liner’s remaining acceptance. `PQ-049.05`.

### 3. Performance that must not change the picture

Worth doing, and easy to do wrong:

- Do this: fewer materials, joined static draws, meshopt/KTX2 packages that already
  exist, and not keeping a whole unused fleet in memory.
- Do not do this: a cheaper Hitch, smaller textures that change the paint, turning
  down shadows or bloom, impostors, or swapping in a low-detail ship up close.
- Distant LOD files are a later unlock. Several ships already have them. Do not
  treat a missing LOD as “looks broken,” and do not edit LOD files in the tuning pass.
- Hitch’s packaged size grew because the paint encoding got more accurate. Do not
  “shrink Hitch” by putting the old encoding back.
- The trade hub was already compacted. Do not run that experiment again on instinct.
- Factory copies named `*_production_v1` next to a live unsuffixed hull must not be
  wired in. That swap has already made traffic invisible once.

## Lanes

Each lane has its own files. Parallel agents must not share a file. No git worktrees
and no directory junctions. Hitch files are in no lane.

| Lane | What it covers | Tuning allowed |
|---|---|---|
| `live-maps` | What the game actually loads, versus the two old inventories | No |
| `helios-civilians` | Lark, Cradle, Span, Arclight, Survey Pin, Ashline Rig, the liner | Yes, source only |
| `work-boats` | Shuttle, barge, skiff, tender, lifter, cutter, sweeper, tug, tanker, inspection cutter | Yes |
| `faction-kits` | Span faction kits and the faction Wasp kits | Yes |
| `hostiles` | Dart, Lode, Rig, Corsair blade | Yes |
| `flyable-roster` | The buyable hulls except Hitch, including Wasp, Mule, Atlas, Warden | Yes, no form remaster |
| `shelf-twins` | Factory duplicates and the blocked Pelican/Wasp shells | No |
| `places-route` | Gate, mining drone, rescue capsule, buoy, lane beacon, lane pin, cargo pod | Yes |
| `places-stations` | Station bodies and trade-hub overlays | Yes |
| `places-navigation` | Tally, claim mark, cold locker, ash pin, whistle, memorial, and the smaller beacons | Yes |
| `places-industry` | Docks, claim outposts, conveyors, masts, yards hardware that is not a station | Yes |
| `places-rocks` | Asteroid models | Yes |
| `places-wrecks` | Dead hulk, debris, Ceres wrecks, wreck cathedral | Yes |
| `pods` | Cargo, spindle, utility, repair patch | Yes |
| `weapons` | The six authored weapon models | Yes |
| `kit-parts` | Hulls, cockpits, engines, fins, gear, greebles. Not the Hitch starter hull | Yes |
| `works` | Asteroid Works place models | Yes |
| `wreck-pack` | Aftermath wreck sources | Yes |
| `procedural` | Code-built rocks and the shared paint/light shaders | No |

Code-built rocks, thrust, and projectiles inherit the shared light. They are not
a license to restyle every effect in this pass.

## Stop rules

- Do not edit Hitch, Kestrel, `hull_starter`, or the Kestrel blend.
- Do not commit from a lane agent. Only the closing step commits, and only the
  files a checker accepted.
- Do not copy model trees. The model library is large and the disk is tight.
- If a file is already dirty, skip it.
- If the honest fix is a new shape, leave the file alone and name the existing packet.
