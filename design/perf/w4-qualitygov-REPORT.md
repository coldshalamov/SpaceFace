# Wave-4 Lane Report — Invisible Quality Governor (update-rate scaling only)

Lane question: *can per-frame GPU/CPU work be scaled down when nothing visible changes —
shadow-map update frequency keyed to motion/frustum change, light distance culling,
offscreen-animation throttling, non-visible particle/system tick rates?*
Resolution scaling was explicitly out of scope for this lane.

Branch: `devin/1790665884-w4-qualitygov` off `origin/master`.

## Verdict

**KEEP** — one real, measured update-rate win. The asteroid instance pool's shadow
latch was union-scoped: *any* instanced bucket whose matrix buffer re-uploaded set
`_shadowMapDirty` and repainted the 1024² depth map — including records that are
view-only (inside the camera glass but outside the ±300 shadow ortho). The latch now
fires only when the dirtied records actually intersect the live shadow frustum, so
view-only rock churn no longer schedules a shadow repaint. Every other lane candidate
audited is already covered by an equivalent governor and is DOCUMENTED below.

## Patch

- `src/render/asteroidInstancePool.js` — adds `stats.shadowMatrixUploads`: per bucket,
  count an instance-buffer upload as shadow-relevant only when at least one of the
  records that dirtied it intersected the live shadow ortho frustum
  (`recordInShadow = !shadowFrustumReady || inShadow` — conservative `true` when no
  shadow camera is live, e.g. `prepareActiveShadowCamera`'s `receiverCount<=0` null
  gate at `src/render/renderer.js:4647`). The frustum test reuses the same world
  sphere the union submission already evaluates, so it is free.
- `src/render/renderer.js:14454` — `if (result?.matrixUploads > 0)` →
  `if ((result?.shadowMatrixUploads || 0) > 0) this._shadowMapDirty = true;`
  (fall-back `|| 0` keeps old pool shapes safe).
- `test/asteroid-pool-shadow-scope.test.mjs` — real THREE frustums: in-ortho uploads
  count, view-only uploads do not, no-shadow-camera counts conservatively, plus a
  source-regex assert that the renderer reads `shadowMatrixUploads`.
- `scripts/w4-qualitygov-shadow-ab.mjs` — the A/B probe below.

## Evidence (same-scene A/B)

Probe: `node scripts/w4-qualitygov-shadow-ab.mjs --headless` (Playwright →
`?debug=flight` → `game:new`, shadows forced on, ship parked at the sector,
`cameraCtrl.pushZoom(0.5, 90)` to hold liveZoom ≈ 383-392 so the glass
(±443×288 WU) strictly exceeds the ±300 shadow ortho). 24 asteroids are spawned at
in-page-verified positions — sphere inside the view frustum AND outside the real
light-space shadow box (`sweep.inOrtho = 0`, `viewOnly = 24-26`) — then two 6-8 s
RAF windows are sampled against the render service's live counters.

| Phase | Build | Union upload frames | Pool→dirty frames | Shadow repaint frames |
|---|---|---|---|---|
| A: view-only rocks tumbling | baseline | 65/65 | every upload dirtied (union scope) | 34/65 (52%) |
| A: view-only rocks tumbling | patched | 52/52 | **0/52** (`shadowMatrixUploads=0`) | 26/52 (50%, cadence floor) |
| B: one in-ortho rock | baseline | 45/45 | all 45 | 22/45 |
| B: one in-ortho rock | patched | 40/40 | **40/40** — quality preserved | 20/40 |

Read: the upload churn the lane targets exists in every frame of phase A
(`matrixUploadFrames` 100% in both builds). Baseline flagged the map dirty from it;
patched never does — while phase B proves in-ortho uploads still repaint.

Two honest caveats, both verified in code:
- `needsUpdateSets`/`refreshFrames` sit at ~0.5×fps in headless because presents are
  always "late" (>22 ms at 5-15 fps); `shouldRefreshRealtimeShadowMap`
  (`src/render/shadowPresentCadence.js`) then fires on every `skippedLast` frame
  regardless of dirty — an environment floor, not the patch. On a ≥45 fps machine
  presents are under 22 ms, `skippedLast` stays false, and dirty frames repaint 1:1 —
  that is where baseline burned a 1024² depth-map rasterization per frame on
  view-only churn and patched spends none.
- Other `_shadowMapDirty` writers (caster-pose texel latch `renderer.js:14059`,
  follow/extent refires `14339/14519/14884/15718`, receiver tally) remain live and
  correct — the delta isolated here is exactly the pool contribution.

## Zero visible quality change

- Any record whose sphere touches the shadow ortho still marks the map dirty on
  upload — including out-of-view-but-in-ortho (shadows of offscreen casters) and the
  conservative no-shadow-camera path.
- A rock leaving the ortho dirties once (final repaint removes its shadow), then
  stays clean — correct hysteresis behavior.
- A rock entering or moving inside the ortho tests `inShadow` per record per frame
  → dirty → shadow appears/tracks, unchanged from before.
- The world sphere is the union test's own conservative bound
  (`boundingSphere × maxScale`); if it misses the ortho box, no geometry texel can
  be inside either — nothing readable changes in the map.
- Sim is untouched (render-path only): golden 47a hash re-verified bit-identical
  `cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885`,
  `"deterministic": true`, `--repeat 20 --reload-at 600`.
- Test batch green: asteroid-pool-shadow-scope, asteroid-instance-structure,
  asteroid-pool-admission/rekey/retired-owner, renderer-shadow-frame,
  shadow-caster-policy, shadow-present-cadence, shadow-receiver-tally (13/13).

## DOCUMENTED candidates (audited, already governed)

- **Light distance culling** — covered: lights live in a fixed 8-slot pool
  (`WeaponLightPool`, 2+6) parked at intensity 0 when idle, program-key-pinned so
  no shader recompiles, with per-light distance cutoffs already enforced.
- **Offscreen-animation throttling** — covered in part, unsafe as a blanket rule:
  pose sync already iterates live-only lists and short lifetimes, but
  `shipMicroMotion` closures emit `camera:shake`/`audio:cue`/`ship:rcsPulse`
  side-effects — gating them by visibility would quantize audible/shake output.
  Documented residue; would need a per-channel audit, not a tick gate.
- **Non-visible particle/system tick rates** — covered: particle/sprite/trail
  systems compact active lists and iterate live-only with short lifetimes;
  `updateRoom` early-outs on `!room.root`; the authored instance path has its own
  `castRadiusSq` gating.
- **Shadow-map update frequency** — the landed patch above; the rest of the
  pipeline was already governed: `autoUpdate=false` + `needsUpdate` latch,
  texel-quantized caster poses (`noteRealtimeShadowCasterPose` returns true only
  on a ≥1-texel delta), ±10 WU cast-band hysteresis, `SHADOW_CASTER_POSE_QUIET_SKIP`
  early-out, receiver tally gate, late-present skip (`SHADOW_PRESENT_LATE_MS`).
