# INV-09 — Why don't live Wasps reuse the programs the launch warm compiled? (READ-ONLY, measured)

**You change no tracked file.** Files only under `.devshots/fleet/inv09/`. Output: RECEIPT.md.

## Known (LOAD-01, `.devshots/fleet/load01/pending.mjs`, `out/pending-r1-hold.json`)
Swarm round 1: `renderer.js` already warms the round-1 roster at launch (`_earlyCrucibleWarm`,
`_swarmWarmCoveredEnemyIds`; later rounds `_warmSwarmDeferredRoster`). Yet the first live Wasp still sits in
`compiling-pipelines` for ~8–9 s mid-fight, and all 12 hostiles are `loading` at first contact (white stand-ins).
Hypothesis: the live Wasp's WebGL programs differ from the warmed exemplar's, so they link again.

## Do this
1. Probe (through the lock; never kill a holder you did not start): boot title → SWARM → PLAY (reuse
   `.devshots/fleet/load01/load-split.mjs` or INV-08's profile.mjs). Hook `renderer.info.programs` (each has
   `cacheKey`, `name`) and record: (a) the set of program cache keys right before the veil lifts (after the
   launch warm); (b) each NEW program key that appears after the veil lifts until the first Wasp is `ready`.
2. For the warmed Wasp exemplar's meshes and the first live Wasp's meshes, record per mesh: material type, name,
   `material.customProgramCacheKey?.()`, `defines`, `onBeforeCompile` presence, `vertexColors`, `skinning`,
   `morphTargets`, instanced or not, `castShadow`/`receiveShadow`, the fog/lights/shadow state of the scene at
   compile, and the three.js program cache key (`renderer.properties.get(material).currentProgram.cacheKey`).
3. Diff: which key fields differ between exemplar and live? Point to the code that sets each differing field
   (`file:line`) — e.g. per-instance paint/appearance, a shadow flag flipped at admission, instancing vs not,
   a different light rig at warm time (INV-01 found 13 programs compiled against a `2,2,0` rig vs the flight
   `4,3,4`), an `onBeforeCompile` whose key depends on per-ship data.
## Receipt
The differing fields with evidence and owners, how many post-veil programs each explains, and the smallest
change that would make the warm hit.
