# PERF METHODS — how this pass worked, and how to keep perf green

Date: 2026-09-26. Companion to `PERF_MASTER_PLAN_2026-09-26.md` (the option space) and
`design/program/PERF_WHAT_MATTERS.md` (the ranked poles). This file is the *recipe*: the
measurement loop, the reusable leaf grammar, the forbidden levers, and the adjudication
procedure for anything that moves the sim hash.

---

## 1. The loop that actually finds wins

Every item this pass landed followed the same five steps. Skipping step 1 or 5 is how
"optimizations" regress the frame.

1. **Measure on a real run.** `node scripts/probe-frame-solid.mjs --headless --cpu-profile`
   flies a seeded sortie (depart, approach, dock-run at a station) under a headless
   Chromium and emits `.devshots/frame-solid/<ts>.json` + a V8 `.cpuprofile`.
   The JSON's `cpuProfile.topSelf` (own-code ms, sorted) is the work list;
   `topTotalInGameSource` gives the call-tree context. Do not optimize anything that
   is not on one of those two lists.
2. **Rank by pole.** `PERF_WHAT_MATTERS` ordering: (A) entityList/table authority,
   (B) unique GPU programs, (C) on-glass hull batching, (D) snapshot fence → sim
   Worker. A leaf that fights a top pole beats three leaves in the tail.
3. **Smallest behavioral diff.** Prefer the rewrite that cannot change a value:
   memoization keyed on the thing that actually varies, a scratch where every
   consumer reads synchronously, an edge-triggered request instead of a per-tick
   idempotent one. If the diff can change a sim-visible value, it is hash-moving → §5.
4. **Verify cheaply.** `node --check` the touched files, run the focused `node --test`
   module that covers them, commit with a `perf(...)` message that names the measured
   cost being removed. Pathspec-commit (`git commit -- <paths>`); never `git add .`.
5. **A/B on the probe.** Re-run the same seed path; compare `missingFrames`,
   `stuckMissing`, `appearOnTimeRate`, `flightShaderLinks`, and `gcMs`/`cpuProfile`.
   Keep if those improve or hold; revert if the picture or behavior regresses.

Concurrent `node --test` runs starve each other on this box — run ONE node process at
a time. `| tail` buffers until exit; write to a log file and poll instead.

## 2. What the probe's numbers mean

| Metric | Meaning | Gate |
| --- | --- | --- |
| `missingFrames` | Sampler saw a frame slot with no presented frame | → 0 target |
| `stuckMissing` | Consecutive missing frames (a real hitch) | → 0 target |
| `appearOnTimeRate` | Mesh-visible within its admission deadline | 1.0 target |
| `flightShaderLinks` | `linkProgram` calls *after* first playable frame — sync GPU link inside a presented frame | → 0 target |
| `cpuProfile.topSelf` | Own-code ms per function over the window | work list |
| `cpuProfile.gcMs` | GC self-time — a proxy for per-frame allocation | ↓ with alloc leaves |
| `contextLosses` | GPU reset mid-run; nonzero = invalid measurement | must be 0 |
| `submission.drawCensus` | Draws / instanced draws per presented frame | pole-B evidence |

New this pass (probe-side only, zero production cost):

- **`--js-flags=--expose-gc` + a `window.gc()` boundary collection** before the frame
  sampler starts. Boot's decode/admission garbage was landing inside the measured window
  as unexplained GC pauses; now `gcMs` is attributable to flight work.
- **`spaceface:perf-metrics` IPC** (Electron only): `app.getAppMetrics()` →
  `{pid, type, cpuPercent, workingSetKiB}` per Chromium process. This is the blind spot
  in-page counters can't see — a GPU-process link stall vs a renderer busy frame.
  Feature-detect `window.spacefaceShell.perfMetrics`.
- **COOP/COEP on the dev/probe server** (`gameServer.cjs` `staticHeaders`):
  `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy:
  credentialless` → `crossOriginIsolated=true`, ~20× better `performance.now()`
  resolution for self-cost attribution, and it unlocks the SharedArrayBuffer transport
  door. It does **not** activate the phase-14 sim Worker — that still needs
  `isSimulationWorkerEnabled()` + `phase14OptedIn(state)` (`simWorkerHost.js`).

Deliberately NOT added: duration on `linkProgram` events. The GL call is an enqueue;
the stall lives at first-use LINK_STATUS/companion-check, not at the call site. Time
the *draw that pays the link* (frame around `countShaderLink`'s `drawObject`) if you
need that number.

## 3. The leaf grammar (reusable patterns)

Ordered by how often they won this pass. All are zero-behavior-change.

1. **Signature / sentinel gates.** Compute a cheap scalar key; skip the expensive body
   when it matches the last write. Used for: HUD string churn (`num()` caches on a
   bounded Map keyed by truncated int; `hud.js` arc/objective sig gates;
   `masslineHud` idle fast-path; `comms` silent fast-path; `bandHud` `lastSig`).
   Rule: the gate key must enumerate every input the body reads, or you're shipping a
   stale frame.
2. **Retained `out` scratch on per-frame helpers.** `worldToScreen(v, out)` and
   `raycastToPlane(ndc, out)` write into a caller-owned object; retained module scratch
   replaces a `{x,y,onScreen}` / `{x,z}` alloc per call (bulletTime moment checks,
   floating text, damage indicators, input aim, draw-flight probes, boss overlay).
   Contract: result is consumed synchronously — never stored. `flight.js`/`flightV3`
   `ship:thrust` emits reuse one payload + a 4-slot nozzle pool; subscribers (vfx,
   telemetry, eventTrace via deep-copying `sanitizePayload`) all read synchronously.
3. **Edge-triggered service requests.** `_updateMomentPulse` was calling
   `timeEffects.clear()` — Map delete + min-scan — every sim tick for a request that
   almost never exists. Now `set`/`clear` only on live-condition transitions; the
   trick-arm path syncs the latch so an out-of-flight arm still clears next tick.
4. **Membership-versioned memoization.** `_seamMarkersRelevant` scanned the whole
   asteroids bucket every frame; the verdict can only flip when `entityIndexVersion`
   bumps, the draw radius changes, or the distance gap closes — so the scan caches
   `{v, drawWu, px, pz, margin, ttl}` and re-runs only when a bound is crossed
   (TTL covers a rock bumped onto a closing drift while the player is parked).
5. **Per-X verdict memo within a pass.** `hideUnreadySceneDrawables` memos
   material readiness for the duration of one traverse (verdict can't change
   mid-pass); `dockingCorridor` memos `resolveCollisionProxyManifest` per entity
   (deterministic on `data.collisionProxy`, which never changes post-spawn).
6. **Union/batch spatial queries.** `_admitProjectileSweepBodies` ran a field+far
   grid query per projectile per step; now one union-disc query per step covers all
   swept segments, with per-projectile `segmentCircleHitInto` filtering and a
   not-covered fallback for mid-sweep spawns. Killed `queryFarActors` self-cost
   (440.5 ms → off the top list).
7. **Retry cooldown latches.** `liveGeometryAdmission` — a settled failure is not
   re-enqueued inside `RETRY_COOLDOWN_MS` (4000) — and the enqueue path re-opens a
   stale latch.
8. **DOM touch avoidance.** `getBoundingClientRect`/`offsetWidth` are forced-reflow
   reads; `firstElementChild` caching for repeatedly-touched nodes; attr/text writes
   through WeakMap key-sig caches (`_attrCache` in `hullIntegrity`).
9. **Worker pools for real decode work.** Meshopt decode moved onto the vendored
   blob-URL WASM pool (`startMeshoptWorkerPool` in `renderPackageLoader` +
   `assetLoader`); CSP already granted `worker-src blob:` + `wasm-unsafe-eval`.
10. **Cache-first verified reads.** `fetchVerifiedRenderBytes` reads
    `'force-cache'` first — verified package bytes don't re-cross the transport on
    cache hits.

## 4. The pop-in fix (D38) — the actual bug the user reported

`wrapPlacePropWithAuthoredPart` was hiding `fallbackRoot` the moment an authored
wrapper existed, before the authored mesh finished admission — geology-skinned rocks
flipped invisible for the gap. The fallback now stays visible through wrap→commit;
the authored mesh swaps in when ready. Probe evidence: `appearOnTimeRate` 0.595 →
1.0, `missingFrames` 819 → 0, `stuckMissing` 596 → 0.

## 5. Hash-moving work — the adjudication recipe

Anything that reorders entity iteration, spawn order, calendar phase, or promotion
timing moves the sim hash. Doctrine: **mint under leaf** — never edit
`expected.json`; run the diff tool and let it adjudicate.

```
node scripts/sim-golden-diff.mjs <treeA> <treeB>
```

It runs the same sim slice in both checkouts and diffs field-by-field. Motion-field
deltas = real behavior change (STOP, redesign). Non-motion deltas = bookkeeping
re-record → the change is mintable. Queue, don't ship, when the diff is clean but the
leaf is large — get a second run on a different seed path.

Pending adjudication (do not start without a fresh probe baseline):

- **Pole B — Lane A demote** (42 optic-lattice cells + dormant field asteroids off
  entityList onto a table): biggest named sim win, ~96→54 live entities.
  Preconditions: D50 overlap-safe promote (field rock spawns at drifted `rec.pos`;
  ram path guarantees overlap → needs push-apart), `worldLedgerHoldsId` must cover
  the new table, demote must not draw rng.
- **Pole C — calendar straddle**: 46 systems on `tick%30==0` → phase `{0,10,20}`;
  same cadence, spike ÷3. Spawn-order change → hash moves → adjudicate.
- **Pole E — caster-list shadow pass** (M): maintain the shadow caster list from
  `syncShadowCasterPolicy` instead of the per-refresh full-scene walk; must replicate
  `getDepthMaterial` variants exactly or shadows diverge.
- **LOD package rebuild** (M): 24 stale whole-ship-LOD release artifacts ship raw
  PNG + unquantized geometry (~84 MB). Re-run through the sg04 ktx2+meshopt
  transform, rebuild packages, regenerate manifests atomically; PNG→ETC1S needs a
  frame-diff before commit.
- **Decoded-CPU-payload detach** (L): release decoded arrays after the
  `spacefaceGpuResident` stamp; rebuild on context restore via re-fetch+re-parse.
  Frees tens-to-hundreds of MB of JS heap; needs a detach-aware `updateBuffer`
  contract and turns context-restore into a serial runway.

## 6. Rust/WASM verdict (PQ-083/PQ-091 bar)

Measured answer this pass: **no JS island clears the bar.**

- Rapier already owns the physics island — `wasm-function` frames are ~312 ms of
  the run's self-cost and that IS WASM. The lever there is fewer/narrower steps
  (`_updateSg02DynamicAuthority` reach tuning, sleep policies were already
  adjudicated out), not a rewrite.
- The hottest JS-side self-costs after this pass: `_updateMomentPulse` (~206 ms —
  edge-triggered away), `queryAsteroidField` (~148 ms — already spatial-hashed,
  callers conditional), `dockingCorridor.update` (~123 ms — manifest memoized),
  `classifyWorld` (~68 ms — already incremental). Each is <0.2% of run wall; a WASM
  port pays marshal + copy overhead per call and would have to beat V8 on a
  sub-millisecond kernel — the numbers don't clear the copy-cost bench the pole
  doctrine requires.
- Revisit only after pole B (table authority) and the snapshot-fence Worker land:
  at that point the sim step is the only remaining island and the question is
  Worker-vs-WASM *transport*, not language.

## 7. Keeping it green

- Probe before merging perf-adjacent work; the numbers to watch are
  `missingFrames`, `flightShaderLinks`, `appearOnTimeRate`, `gcMs`.
- Per-frame code must not allocate: no object literals, no spread, no fresh arrays
  in tick/frame paths. When a helper already has an `out` param, use it.
- Per-tick idempotent calls (set/clear/apply) are not free — edge-trigger them.
- Index scans are free; `indexedTypeScan` returns the live bucket — do NOT re-filter
  it per frame when a version+margin latch can answer instead.
- Tests that pin call shapes (e.g. `entity-mesh-visibility.test.mjs` on
  `shouldSubmitEntityMesh`) are contracts — keep the call shape or update the test
  deliberately in the same commit.
- Forbidden without a fresh PQ adjudication: bloom-off, shader prewarm dummies,
  per-frame BatchedMesh repack, mixed mega-batch, Rapier-sleep, sim Worker before
  the snapshot fence, WebGPU near-term, interior-triangle culling, disk-paging the
  lean ledger, upgrade scheduler off rAF, serial-slot release mid-job.
