# INV-06 — What piles up during a Swarm round? (READ-ONLY, measured)

**You change no tracked file.** Create files only under `.devshots/fleet/inv06/`. Output: RECEIPT.md.

## The observation (from your INV-05 run, `.devshots/fleet/runs/INV-05-adventure-frame-rate.grok.*/RECEIPT.md`)
In Swarm round 1, over 30 s, median draw calls went 203 → 444, triangles 395k → 793k, fps 24 → 14. The
alive-entity count did not double. Something accumulates in what is drawn.

## Do this
1. Probe (reuse your INV-05 probe and flags): boot `/?swarmRound=1`, wait for the fight, then take a draw
   census at t = 5 s, 30 s, 60 s, 90 s after the first hostile (keep the player alive: heal through `SF.state`
   if needed, and fly a slow circle so it stays a fight). Run ONLY through the lock.
2. The census: traverse `scene` (visible objects only) and group drawn meshes, instanced meshes, points and
   sprites by `(object name or type, material name/type, geometry name/type, parent chain top 2)`. For each
   group record count, instance count, triangles. Also `renderer.info.render.calls/triangles`,
   `renderer.info.memory.geometries/textures`, and entity counts by type and by `data.kind`.
3. Diff the census between t=5 s and t=90 s: list the 15 groups that grew the most in draw calls and triangles,
   and for each, find the code that creates those objects (`file:line`) and whether/where they are ever
   removed, pooled or capped (wrecks, debris, decals, scorch marks, shell casings, trails, kill words, VFX, light
   sources, LOD stuck high?).
4. Same check for growth in `renderer.info.memory.geometries/textures` (a leak if it only climbs).

## Receipt
Under **What the player now sees or feels**: the growth table (group, count/calls/tris at each time, owner
file:line, removal/cap found or "none"), the memory curve, and the 3 likeliest causes ranked with evidence.
