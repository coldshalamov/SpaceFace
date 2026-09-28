# CR-CHAIN-1 — braid 2/5: planet-well + field-well as one curve

**Built:** encounter 351, THE CHORD (`src/data/encounters/351-the-chord.js`).

## The braid

A gas skimmer's helium-3 train broke loose and is riding The Anvil's sling band — seven
physical pods strung along the arc at r≈1180, each on tangential velocity, tracing the
planet's pull. The skiff that lost them works the head of the train; a raider pair cuts
the chord — a straight line across the arc that the planet's annular well keeps bending.

The discoverable braid: the train rides the planet's curve, and any field well the player
lays on the same seam composes with it through the single PQ-012 kernel — one curve, not
two effects. Sling the whole train free, bend the raiders' chord into the danger band
(reentry heat), or just ride the arc and collect the pods.

## How it composes existing systems

- **Place lock**: `zoneTypes: ['planetary_mass']` — only The Anvil hosts the type, so the
  braid is inherently authored to the one world where the pull is a working instrument.
- **Planet pull**: the annular WELL registered by `planetRuntime` through
  `fields.registerExternal` — the same kernel the player's deployable well writes into.
- **Pods**: `d.spawnCargoPod` → `spawnJettisonedCargoPod` — persistent physical bodies,
  commodity `cmdty_gas_helium3` (the site's authored rich skim yield, `cryogenic` class),
  owner-stamped to the skiff.
- **Raiders**: committed `combat.targetId`/`ai.pursueTargetId` onto the skiff, spawned at
  the influence edge on chord intercept velocities (inward component >30 WU/s).
- **Resolutions**: `chord_cut` (raiders down → MTS rep + grant scaled by pods still
  riding), `skiff_down`, `arc_drifts` (110 s deadline). All release the cast to world
  ownership; the train persists as loose physical bodies after any outcome.

## Validation

`test/cr-chain-1-the-chord.test.mjs` — 4/4 green:

- Shape registered (`minor`/`combat`, salvage × planetary_mass × mule_trader).
- Braid materializes: seven helium-3 pods at sling-band radius with tangential velocity
  (radial·vel ≈ 0), skiff moving with the train head, raiders on an inward chord.
- `chord_cut`: rep delta + grant scaled by intact pods (all seven → 90+210).
- `skiff_down`: cast released, no despawn stamps, train remains physical.
