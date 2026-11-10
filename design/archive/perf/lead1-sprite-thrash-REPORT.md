# Lead 1 — sprite shader program thrash: FIX REPORT

Date: 2026-07-29. Branch: `claude/perf00-20260727` (worktree `sf-perf-admission-20260726`).
Brief: `design/program/roadmap/MAKE_THE_GAME_FAST.md` §"Lead 1 — sprite shader program thrash".
Status: **sprite thrash eliminated** (idle-flight post-boot compiles 1 → 0; zero sprite programs
post-boot under stimulus). One residual **non-sprite** canopy-admission late compile surfaced;
see §5 — it is a different defect class in files outside this task's named scope.

---

## 1. Root cause (confirmed)

THREE releases a cached GL program when its `usedTimes` hits 0, i.e. when the last material
holding it is disposed. The next material with the same cacheKey then re-links it inside
`WebGLRenderer.render → renderBufferDirect → setProgram` — a 50-300 ms main-thread stall mid-frame.

The sprite program (`SpriteMaterial` + `map`, `fog:false`) had exactly one holder after boot:

- The boot planet impostor's `SpriteMaterial`, created fresh in
  `SpaceBackground._spawnPlanet()` (old `spaceBackground.js:1862`) and compiled on the first
  rendered frame.
- The comet sprite starts `visible=false`, so its material never acquires the program at boot
  (invisible objects never reach `renderBufferDirect`).
- `visualFactory` halo sprites carry a **different** program (they don't set `fog:false`, and the
  scene runs `FogExp2`) and are noDispose-cached — not involved.
- `precompile.js` warms a staging group (ships/projectiles/canopy/wormhole), not the background
  sprites.

`SpaceBackground._refreshHeroes()` runs on every hero grid crossing in flight (and on every
sector entry / palette change / resize) and did `p.sprite.material.dispose()` (old
`spaceBackground.js:1793`). With the sole holder disposed, `usedTimes` hit 0, THREE released the
program, and the very next `_spawnPlanet()` re-linked it at draw time. At 2-5x boost the camera
crosses hero cells repeatedly — the "3-5 under stimulus" count. `_createComet()` compounded it on
rebuild paths by disposing the comet material (`this.comet.mat.dispose()`) in the same window the
planets were cleared.

## 2. Changes made (all in the named suspects; no pixel-affecting change)

### `src/render/spaceBackground.js`

- **1094-1103** (constructor): added `this._spriteMatCache` (Map: texture → shared SpriteMaterial),
  `this._cometMat`, `this._cometTex`.
- **1801-1802** (`_refreshHeroes` clear loop): removed `p.sprite.material.dispose()`. Materials are
  cache-owned; sprites themselves hold no GPU resources.
- **1871-1888** (new `_getPlanetSpriteMaterial(tex)`): one shared `SpriteMaterial` per baked
  texture, created with the **byte-identical config** as before
  (`{ map, transparent:true, depthWrite:false, depthTest:true, fog:false }`), noDispose-wrapped
  (`mat.dispose = () => {}`, the established `materialLibrary.js`/`visualFactory.js` pattern).
  Lazy-inits the cache because focused tests build this module via
  `Object.create(SpaceBackground.prototype)` without a constructor.
- **1891** (`_spawnPlanet`): material now comes from the cache instead of `new`.
- **2105-2108** (`_getPlanetTexture` LRU eviction): drops the evicted texture's material slot
  *without* disposing (the wrapper makes dispose a no-op anyway; the remaining live entries keep
  the shared program pinned). Cache stays bounded by `maxPlanetCache` (16).
- **2189-2192, 2195-2218** (`_createComet`): comet texture + material content is constant across
  rebuilds, so both are now created exactly once and reused; the material is noDispose-wrapped.
  Rebuilds only re-create the sprite object.
- **2535, 2547** (`rebake` / `setPalette`): clear `_spriteMatCache` alongside the texture cache.
- **2601-2606** (`dispose()` teardown): really disposes the cache-owned materials
  (`THREE.Material.prototype.dispose.call(mat)`) and the comet texture/material, since their
  flight-time `dispose()` is a deliberate no-op.

### `src/ui/asteroid/asteroidRenderer3d.js`

Same defect class on the mining screen's own renderer (GL links block the main thread regardless
of which context issues them): a fresh `SpriteMaterial` per tier badge, disposed per cell by
`disposeGroup` via `_own`.

- **188-191**: added `badgeMats` cache (one shared material per tier).
- **212-220** (new `badgeSpriteMaterial(tier)`): cached, byte-identical config
  (`{ map: badgeTexture(tier), transparent:true, depthTest:false }`), noDispose-wrapped.
- **589**: `syncOreAt` uses the cache; `_own` removed (cache-owned, `disposeGroup` leaves it alone).
- **1331-1332** (teardown): really disposes the cached materials before `renderer.dispose()`.

### Deliberately not changed

- `src/render/renderer.js` `disposeObject()` (suspect 2): with the above, every `SpriteMaterial`
  reachable on the main renderer is either noDispose-cached (visualFactory halos,
  materialLibrary) or cache-owned (background, badges). Entity/hazard disposal paths carry no
  unprotected shared sprite materials, so no change was needed there. Also untouched:
  `PRODUCTION_UPDATE_ORDER`, manifest hashes, `visualFactory.getMaterial()` (already noDispose —
  ruled out per the brief).

## 3. Why the render is pixel-identical

Material configs are unchanged property-for-property; only instance lifecycle changed
(create-per-spawn + dispose → share-per-texture + retain). The per-frame `p.mat.opacity = 1.0`
write and the comet `mat.rotation`/`mat.opacity` animation hit the same values on the shared
instances (single comet, ≤1 concurrent planet impostor by the existing spawn cap). No shader,
texture content, blending, render order, or draw state changed. Determinism untouched (no
`state.rng`/`simTime` paths involved).

## 4. Verification

### Focused tests + gates (all green, post-fix)

```
node --test test/space-background-depth-occlusion.test.mjs \
            test/space-background-shared-geometry.test.mjs \
            test/space-background-boot-tier-single-build.test.mjs
  → 5 pass / 0 fail

npm run check:perf-counters  → 29 pass / 0 fail
npm run check:perf-packets   → 39 pass / 0 fail
npm run check:baseline       → 10/10 green
```

### `npm run probe:shader-timeline` (post-fix run, ~30 min, SwiftShader — expected on this host)

```
[shader-timeline] gpu: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) tier=software software=true
[shader-timeline] boot ramp: 72 programs, quiescent at flight frame 125

[shader-timeline] POST-BOOT SHADER COMPILES, idle-flight (601 frames): 0
[shader-timeline] POST-BOOT SHADER COMPILES, stimulus  (612 frames): 2

  [stimulus] flightFrame=761 name=SF_Shared_canopy_none_native cacheKey=physical,STANDARD,,highp,srgb-linear,306,1024,uv,false,false,uv,false,uv,false,false,uv,uv,false,false,false,false,false
  [stimulus] flightFrame=761 name=SF_Shared_canopy_none_native cacheKey=physical,STANDARD,,highp,srgb-linear,306,1024,uv,false,false,uv,false,uv,false,false,uv,uv,false,false,false,false,false

[shader-timeline] gl.linkProgram calls: 89 total, 3 post-boot
  [link] flightFrame=760  class=precompile     (prepareMaterial <- traverse; authored-admission compile)
  [link] flightFrame=760  class=precompile     (same)
  [link] flightFrame=1058 class=DRAW-TIME-MISS (setProgram <- renderBufferDirect)   <-- residual, see §5

[shader-timeline] production seam: totals.shaderLinks=89 postBoot=3 offFrame=69 frames=1527
```

Evidence: `.devshots/perf/shader-compile-timeline.json`.

**Sprite result: the idle-flight line went 1 → 0, and no sprite program appears anywhere
post-boot.** The remaining two stimulus entries are not sprites and not the Lead 1 mechanism —
see next section.

## 5. Residual finding (OUT OF SCOPE for this task; recorded for the program)

The two remaining post-boot compiles are `MeshPhysicalMaterial` canopy-family programs
(`SF_Shared_canopy_none_native`) from the authored-asset admission pipeline:

- flightFrame 760: two links inside an **admission compile pass** (`prepareMaterial <- traverse`,
  classified `precompile`) — the designed async pipeline-admission path, not a draw-time hitch.
- flightFrame 1058: one **draw-time link** (`setProgram <- renderBufferDirect`).

Why this is NOT the Lead 1 thrash:

1. Lead 1's mechanism requires a cacheKey **byte-identical** to a boot-compiled program being
   released (dispose → usedTimes 0 → relink). The stimulus canopy cacheKeys differ structurally
   from **every** boot-ramp canopy key: they carry `defines = { STANDARD: '' }` while every
   boot-warmed canopy (including the three retained `SF_Precompile_Canopy_*` variants) carries
   `{ STANDARD: '', PHYSICAL: '' }` (r184: `MeshPhysicalMaterial` sets both; `MeshStandardMaterial`
   sets STANDARD only), and the map-layout uv channels / tail flags differ too
   (full keys in the evidence JSON). So these are **first-time compiles of unwarmed variants** —
   a precompile/admission **coverage gap**, not a release-relink cycle.
2. Shared authored canopy materials are already noDispose-protected
   (`partsLibrary.js:4434` `material.dispose = () => {}`), so the dispose-release mechanism is
   already closed for this family.
3. The owning machinery is `partsLibrary.js` / `precompile.js` / `canopyMaterialPolicy.js` /
   the renderer's pipeline-admission tracker — none of which are this task's named suspects, and
   `precompile.js` has concurrent foreign edits in this worktree at the time of writing.

Recommended follow-up (new lead): extend `addAuthoredCanopyPipelineWarmup`'s three retained
texture-slot layouts to also cover the STANDARD-define (non-PHYSICAL) canopy variant seen at
flightFrame 1058, or make the admission compile run **after** `applyRealtimeCanopyPolicy`
normalization so the admitted variant matches what the live render will request.

## 6. Files touched

- `src/render/spaceBackground.js` (named suspect 1)
- `src/ui/asteroid/asteroidRenderer3d.js` (named suspect 3)
- `design/perf/lead1-sprite-thrash-REPORT.md` (this report)

No commits made, per task rules. Foreign concurrent edits elsewhere in the worktree
(e.g. `src/render/precompile.js`, `src/ui/hud.js`) were preserved untouched.
