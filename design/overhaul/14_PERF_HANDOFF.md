# 14 (companion) — Performance handoff: executable now, no blocked files

**Written 2026-11-22 (late) for the next builder session.** Everything here touches files that
were **clean in the shared checkout at writing time** — nothing below waits on another lane.
The map shifts hourly: before starting an item, re-check with

    git status --porcelain -- <the files that item names>

and take another item if one went dirty. Evidence and campaign context live in
[`14_PERF_PLAN.md`](14_PERF_PLAN.md) §7 (execution log); this page is the "do next" list.
Ranked by expected player impact.

One repair you may hit first: `node scripts/build-render-package-pilots.mjs --check` fails at
HEAD on `parts-rack: input descriptor is stale` — broken by a lane that landed after the merge
commits (they verified fresh at `d9164ced33`). If the owning lane has fixed its input, rebuild
the pilots; if not, that gate failure is not yours.

---

## 1. Mission bookkeeping only needs to be recent (R6-partial) — `src/systems/missions.js`

The densest sim file: 155 emit sites reachable from the step — 63 `toast`, 36
`mission:updated`, 5 `comms:popup` (audits/B). Most fire on transitions, but the aggregate
fans out through worker→main listeners every tick; the sim bar is < 8 ms p95 against today's
8.6/13.6 (Adventure). The file is already amortized (gated tick predicates, 0.75 s nav
cadence) — the remaining lever is the emit surface.

Do: a per-tick dirty set — missions mark themselves updated during `update()`; one
`mission:updated` flush per mission at step end (payload batched or per-mission-once).
Toasts from mission transitions queue and flush once. Check listeners first
(`grep -rn "bus.on('mission:updated'" src`) — if any listener is sim-side, coalescing changes
behaviour: re-record the `check:sim` golden **in the same change** and say so; a moved hash
otherwise is a bug in the change. Verify: `npm run check:sim`, a worker-step probe
(`scripts/probe-worker-physics-load.mjs` logs any `workMs > 30ms`), and `check:playable`
through `node scripts/fleet/game-lock.mjs run --`.

## 2. Freeze the static scene (R4) — `asteroidInteriorPreview.js`, `lawArenaDressing.js`, `visualFactory.js`

257 "likely static, matrix NOT frozen" creations (audits/C): `asteroidInteriorPreview.js`
(72), `lawArenaDressing.js` (47), `visualFactory.js` (59), the rest in set pieces and dressing.
`updateMatrixWorld` + `projectObject` ≈ 18 ms/s in the round-6 profile; the census counts
~3,661 live nodes with auto-update on. The tool exists (`freezeStaticChildMatrices` in
`staticChildMatrices.js`) — the calls are missing at compose sites. Do: wrap each static
creation's subtree after build (or mark with `freezeStaticTransformRootMarked`); sweep the
list in `.devshots/director/fable/audits/scene-static-nodes.txt`. Verify: `probe-frame-cost`
census (matrixAutoUpdate count drops), a flight frame looked at (dressing still sits right),
`check:playable` under the lock. Same file pass can share the 513 per-object materials
(audits/C4) where a shared material cache is a drop-in.

## 3. HUD remainder (R1) — `src/ui/hud.js`, `src/ui/radar.js`

The minimap label work and avoid-rects caching are already landed by the HUD lane. Left:
- `hud.js` receipt lane (`placeReceiptLane`/`flushReceiptLane`, 15.6 ms/s inclusive):
  `getElementById`/`querySelector(All)` every frame → cache refs per screen open.
- `hud.js` `refreshFlightTextObstacleSnapshot` (6 reads/frame) gates the whole HUD layout
  walk — cache with invalidation.
- `radar.js` draw (55.9 ms/s inclusive) and the minimap paint still hold per-frame DOM reads
  that belong at resize/init (audits/A7).
Verify: `npm run check:ui:perf`, then a trace showing zero per-frame `querySelector*` /
`getBoundingClientRect` in steady flight.

## 4. World textures to KTX2 (B7) — `rockFamilyLibrary.js`, `paintedPlanets.js`, `deepSkyPlates.js` (+ `assetLoader.js` if the loader instance should be shared)

Rock family JPG/PNGs, painted planet atlases and the 8 MB RGBA deep-sky plates upload
uncompressed with runtime mipgen. Convert offline with the release lanes' own encoder
profiles (`ktx2-encoder`, see `scripts/build-place-release-assets.mjs` for usage), point the
loaders at KTX2 via the configured `KTX2Loader` (`configureCspSafeKtx2Loader` in
`assetLoader.js` — now free). Expect ~4–6× less VRAM on those sets and cheaper uploads;
rock families are instanced so the win is per-family, planet/sky per-scene. Verify: frames of
rocks/planets/sky judged before/after (same seeds), `perfRuntime` texture residency, and
`check:playable` under the lock.

## 5. Transcode cache (B3-partial) — `src/render/assetLoader.js`

KTX2 transcode is "the widest stage of a texture-dense package decode — a 15-texture ship
package serializes into ~4 waves" on the worker pool (`assetLoader.js:375–430`). Cache the
transcoded GPU-ready payload keyed by texture content hash, the `programBinaryCache` /
`canvasTextureStore` pattern (see `src/render/canvasTextureStore.js`, landed today, for the
IndexedDB skeleton). Verify: second-boot decode trace shows transcode hits, hitch-budget
green through sector entries.

## 6. Scenario prop batch cache (B6) — `src/render/scenarioPropBatching.js`

`batchPackagedPropOpaqueMeshes` merges per prop group at load with no cache. Measure first
(load-cost probe on a route that dresses sectors), then cache the merged geometry by group
hash. Read `visualOverrides.js` (dirty — read-only) for the dispose lifecycle before sharing
geometry across instances. Honest size unknown until measured — that's why it's sixth.

## 7. Per-axis texture budgets (G2) — `scripts/build-place-release-assets.mjs` (design-first)

The 84.9 MB oversize tranche cannot halve under square power-of-two budgets without breaking
the repo's own 2×-closest-framing rule (516–830 px bars round up to the 1024 shipped). The
legal route is non-square POT: a 1024×1024 atlas on a body projecting 400×150 px at closest
framing ships 1024×512 with 2×/3.4× margin per axis. Needs per-body px area (the audit's
`pxArea`) and per-texture aspect; extend `downsampleRgbaRgba` to per-axis. Visual gate
mandatory per body. The audit (now role-aware) is the checklist and the judge.

## 8. Turn the landed work into one number (PERF-AB / G4) — no source edits

Old build vs new, flown alternately on the same machine through the lock, plus a Foundry
round-20 scene-GPU re-measure now that 241 packages' merges are in
(`probe-frame-toggle.mjs` `deck-*` / `res*` toggles; `check:hitch-budget`). The machine was
noisy all day — numbers taken now carry that caveat in the row. This is the cheapest item and
it converts every commit above into an attributed fps figure for the board.

## Not on this list, deliberately

- Anything in `renderer.js`, `partsLibrary.js`, `toasts.js` (R3, R5, R6-full, B1) — still
  other lanes' active files; the plan's execution log sequences them.
- Re-trying scene-root per-LOD merge — negative result recorded today (38/1,502 → 39/1,525,
  reverted). The merge campaign is done at its honest limit.
- The 1.88 GB unreferenced-GLB sweep — destructive; needs the owner's explicit go per the
  audit's dead-weight list.
