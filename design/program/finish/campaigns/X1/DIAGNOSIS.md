<!-- LIFETIME: CAMPAIGN -->
# X1 — One art direction: diagnosis

**Campaign:** X1 (Lane 6, LOOK & SOUND). Written before any edit, 2026-11-06.
**Evidence:** the 2026-11-05 Swarm baseline captures in `design/program/finish/swarm/baseline/`,
the live material path (`docs/visual-assets/LOOK.md`), and the asset census in
[`CENSUS.md`](./CENSUS.md) (measured from the working tree).

## 1. What the player sees

In one frame — the Ricochet Foundry baseline, `baseline/01-round1-open-space.jpg` — the player sees:

- a **photographic painted Saturn** in the sky, soft, high-detail, warm, with a painted terminator;
- **grey flat-shaded boxes and cylinders** in the play space, reading as voxel placeholders;
- a **lacquered, 40 k-triangle Forge ship** with hard sun glint, painted panels and lit lamps.

Three media, three detail densities, three value systems. The eye reads them as three games
composited. The same frame also has no shared scale: a Foundry plate can read the same size as a
freighter beside it.

## 2. The measured cause chain

| Band | What draws | Detail / value | Measured |
|---|---|---|---|
| Sky | 10 painted atlas looks on `THREE.Sprite` (`paintedPlanets.js`), GLSL terminator injected in `spaceBackground.js:69–124` | Photographic art, posterised; parallax 0.055, hero depth 12, one hero resident | 8 atlas cells + 2 ringed; 4 PNGs (≈5.5 MB) |
| Play space, ships | Forge hulls | 3 values, lacquer, hard glint, lit lamps | 10–40 k tris LOD0, ≈10 draws, 1.72 × entity radius |
| Play space, planets | exactly one shaded body (`planet_tethys_anvil`) | baked 1024×512 albedo, terminator, rim, additive limb | 20,480 tris, radius 700 WU |
| Play space, arena furniture | `lawArenaDressing.js` | **three shared primitives only** — `BoxGeometry(1,1,1)`, `CylinderGeometry(1,1,1,20)`, `TorusGeometry(1,.09,8,28)` — flat vertex colour; `buildFoundryToy` uses `BoxGeometry` + `foundryBankSurface.js` vertex-colour slabs | **0 arena/kit GLBs** in 423 release rows; 6 of 7 Swarm rooms dressed this way |
| Play space, cargo | mixed: 6 authored GLB containers in the manifest, plus procedural `buildPayload` cylinders and a retired crate stack | two more detail levels | `place_cargo_pod_*` rows exist, `buildPayload` is procedural |

The cause is not one bad asset. **There is no rule that says which medium belongs at which depth,
what detail density a play-space prop must carry, or what module size props share.** Ships obey a
written bar (FORGE.md); planets obey a written bar (`paintedPlanets.js` + LOOK.md); arena props obey
no bar, so they are whatever was quickest. The census finds the same gap in scale: ships are
normalised to 1.72 × radius, props inherit per-arena numbers, and nothing declares a shared prop
module.

## 3. Is the design the bottleneck?

**Yes.** This is not a bug in a sound design; it is the absence of one. Replacing nothing means
every future asset is judged by individual taste — which is exactly how three styles arrived. The
cheap fix is one page of rules plus a census; the expensive non-fix is another year of per-asset
arguments.

Two decisions were live and are settled in the style bible:

1. **Planet treatment.** The repo already proves both. Keeping painted backdrops is right for the
   sky: they cost 4 images, no per-frame shading, and they read as vast distance. The defect is
   that the sky is *photographic* while the play space is *illustrated*. The rule is therefore
   **one medium per depth band**: sky = illustrated painted plate (posterised, hard terminator, key
   and edge hue fight, ≤ 0.06 parallax, never in the play plane); play space = authored 3D at one
   detail density. A planet the player can fly to is play space, so it is 3D — the Tethys Anvil is
   the template, not an exception.
2. **Prop style.** Arena and cargo props adopt the Forge finish language: chamfer, three values,
   manufactured panels, hazard bands, lit lamps, nothing floating. They do not need 40 k tris; they
   need the same **value structure and silhouette discipline** as a ship at the gameplay camera.

Cost of the full alternative (rebuild every background planet as a 3D body): a new shader, a new
LOD ladder and per-planet draw cost for a thing that is meant to recede; it buys nothing the player
can touch. Cost of the chosen road: one prop kit and one finish module, reused by six arenas and
every later X2 asset.

## 4. The chosen road

1. **`STYLE_BIBLE.md`** — one page: depth bands, the planet rule, the prop rule, scale modules,
   material/light rules, the never list, and the on-screen budgets.
2. **`CENSUS.md`** — every asset class that breaks the bible, with path, measured detail, and a
   disposition (`replace`, `re-finish`, `keep — compliant`, `retire`).
3. **A lineup** — one frame at the gameplay camera containing sky, play-space planet, ship, rock and
   prop, before/after the prop finish, plus a turntable of the finished prop kit. Judged against the
   bible by an independent image review.
4. **The first production slice** — the arena furniture finish module (`src/render/arenaFinish.js`)
   and its application in `lawArenaDressing.js` + `foundryBankSurface.js`, so six of seven Swarm
   rooms stop reading as greybox. This is the proof the rules are buildable; X2 continues from it.

**Verify:** owner approves the lineup; census committed. Until then X2 does not mass-produce.
