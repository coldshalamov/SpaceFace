# W103 — boot-loading lane audit

Branch audited: `devin/1791064509-perf-w60` @ `87c75829a` (checkout `C:/Users/Administrator/repos/SpaceFace`).
Audit-only; no code changed, app not run. All line numbers verified at this HEAD. One read-only static check executed (`scripts/check-src-reachability.mjs`) — PASS.

`saturated: false`

One live M residual in the W102 stepped corpse sweeps (mid-dispose suspension leaves the row in `_meshes` — two reachable races, same fix, both sites), plus two L residuals.

---

## Regression notes — W102 machinery, verified at HEAD

1. **Stepped per-corpse dispose inside the cook's sweeps** — HOLDS, but the row lingers in `_meshes` across every suspension (F1).
   Leftover sweep `renderer.js:12776-12821` (`prepareLiveSectorBeforeFlight`): per-corpse order is `unbind → releaseAsteroidInstances → scene.remove → disposeObjectSteps stepped → _meshes.delete → noteShadowMeshRemoved(measured) → clearEntityMeshReference`. Slice clock `:12796` (`>= 8` ms or flight ledger spent), stale check on resume `:12804`. Departing sweep `:15580-15603` (jump cook): identical shape, `providerSliceDue()`/stale-check driven. Abandoned-dispose bookkeeping `:12812-12817`.
2. **Early world bind via `syncPooledPresentationIdentity`** — HOLDS.
   Identity at attach `:21185-21203` (static/dynamic relevance via `isEntityRenderRelevant`), presentationWorld slot `:21204-21217`, early hidden-freeze `:21218`, deferred freeze `:21224-21227`, restore detach `:21243-21248` (deferred = `!isFlightMode || isDeferredUnbindKind(kind)`), slot retire `:21262-21268` (no early freeze while a restore detach may mint), bind body `:21274-21349` (per-entity guard + canonicalize + `world.bindMesh` + early/late freeze legs + ticket/note).
3. **Deferred freeze queue + unfreeze twin** — HOLDS.
   `_drainHiddenFreezeQueue` `:21179-21220` — `HIDDEN_FREEZE_MINT_ROOTS_PER_PASS = 6`, `HIDDEN_FREEZE_SCAN_PER_PASS`, `HIDDEN_FREEZE_FLAP_DWELL` hysteresis honored, stale entries drop on `sfHiddenFreezeQueued !== true` / `visible === true` / detached / `matrixAutoUpdate !== true`, compose-then-freeze preserved. `_drainHiddenUnfreezeQueue` `:21238-21270` same shape. Both drain only inside syncEntityViews (`:23331`, `:23729`); `enqueueHiddenFreeze` pushes only under `mode !== 'flight'` (`:21318-21326`).
4. **Unbatched unbind** — HOLDS.
   `_unbindPresentationMesh` `:21294` no longer does per-corpse `presentationWorld` union walks; single walker `:1924-1930` inside `reattachResidentGpuMeshesSteps` (the paced sweep, reminted only when the census mutates) + batched `_meshReleaseBatchBegin` (dead-id walker `:1858+`, incremental feed at the same suspend points). Rebind bookkeeping preserved.
5. **`PACKED_SLOT_GENERATION_TRAVERSAL_ENABLED` membership-exact** — HOLDS.
   Constant `snapshotFence.js:299`; `copyWorldSlot` consults the exact world-slot membership walk `:416-433`; in-place copy keeps generation semantics `:634-679`; call sites `:20199`, `:20312`.
6. **`drawablePackSorted` traversal-order** — HOLDS. The union dedupe is gone from the reattach sweep.
7. **Whole-set `_meshes` sweeps stepped + stale-checked** — HOLDS.
   Leftover `:12778-12821` (yield per corpse teardown + slice), reattach `reattachResidentGpuMeshesSteps :1896-1978` (64-stride + `_residentReattachStepped = true` `:10219` so renderer owners ride the pump, bare owners keep sync contract), departing `:15580-15603`, `_rebindPresentationMeshesSteps :21700-21729` (256-stride), `_bindPublishedPresentationMeshesSteps :21745-21764` (256-stride + same eligibility conjunction).
8. **`serviceRenderMeshResidency` drain order** — HOLDS.
   `renderer.js:2227-2249`: despawn-drain → env-rebind-drain → `_flushMeshReleasePending` → `settleRebuildBridges` → keep-gpu branch (`abandonResidencyPoll` + non-keepgpu `abandonReconcile` + feed-moved-gated reattach re-mint).
9. **First-draw toast filters + pre-submit baseline defer** — HOLDS.
   Call sites `:16539-16547` pass `skipProof` + `selfToastMode` + visibility-fold/defer/shader-lock + `mustProve` once for warm-visual first-frames; both `firstBootCohort` and `warmVisuals` arms. Pre-submit identity baseline deferred at `:24952-24966` (the O(scene) ground snapshot runs in the deferred lane, not the presented frame).
10. **`_liveSectorCookGeneration`** — HOLDS.
    Bumped at `:12159` (opening cook entry) and `:15211` (jump cook mint, stamped on `cookOwner`); `captureLiveSectorCookStale` `:12045-12056` closes on owner/state/world/serial/sector/generation; generator `return()` runs at abandon points.
11. **Fence-pack membership-exact sweep** — HOLDS (covered under item 5's verification: exact-walk consult + in-place copy).

## Ranked findings

### F1 — Stepped corpse dispose suspends with the row still in `_meshes`; two reachable races across the yield — impact M / effort S

**Evidence:** `renderer.js:12786-12810` (leftover sweep) and `:15583-15598` (departing sweep) — the per-corpse sequence leaves the corpse addressable through `_meshes` (and `entity.mesh`/`entity.view.root`) across every `yieldLiveSectorGpu()` (`:12801`) / `providerYield()` (`:15591`) gap, because `_meshes.delete(id)` and `clearEntityMeshReference(entity, mesh)` run only after the whole teardown finishes (`:12807-12810`, `:15595-15598`). The window exists exactly when the corpse is fat (multi-slice teardown) — i.e. exactly when pacing matters.

**Race A — double dispose + double receiver debit.** While suspended, a synchronous `entity:destroyed` emit for the same id (roster clear `main.js:591-598`, save-restore `_clearEntitiesChunked` `saveSystem.js:5543-5566`, survivorPod/traffic destroys — all `bus.emit`, and all co-resident with the cook under `mode === 'loading'`) runs the listener at `:16637-16645`: `_meshes.get(id)` finds the corpse → unbind + `scene.remove` (no-ops) → pushes the half-disposed corpse to `_despawnDisposeQueue` → `_meshes.delete`. The parked sweep iterator resumes (`cookStale()` passes — same cook) and keeps stepping the corpse while the despawn drain mints its own `disposeObjectSteps` on the same subtree → concurrent double teardown + the drain's measured `noteShadowMeshRemoved` AND the sweep's `noteShadowMeshRemoved(this, mesh, leftoverMeasure.receivers)` both debit → tally undercount (clamped at 0 → `shadowMapEnabled` stuck off until a dirty recount heals).

**Race B — the post-yield `_meshes.delete` can kill a replacement row.** During the same gap an id-reissue rebuild mounts `_meshes.set(id, newMesh)` (ids recycle across restore — `nextEntityId = 1` reset at `saveSystem.js:5571`; any same-id respawn or build-drain completion for the id lands here). On resume the unconditional `this._meshes.delete(id)` removes the NEW row → mounted-but-unmanaged mesh: on-scene, drawn, invisible to the census/fence-pack/reconcile — a permanent management hole the entity's own bookkeeping can't see (`entity.mesh` points at the new mesh, `_meshes` doesn't).

**Fix sketch:** hoist the row bookkeeping to before the first yield — move `this._meshes.delete(id); this._meshesVersion += 1; clearEntityMeshReference(entity, mesh);` to immediately after `this.scene.remove(mesh)` / before minting the dispose iterator (Map.delete of the current iteration entry is legal; the corpse object lives on in the iterator). Then the destroy listener's `_meshes.get` finds nothing → no corpse push → no second iterator and no second note; and no unconditional post-gap delete exists to kill a reissued row. `noteShadowMeshRemoved(this, mesh, …)` stays post-dispose — it reads only `mesh` + the measure. Defensive belt (optional): guard the delete with `this._meshes.get(id) === mesh`. Same edit at both sites.

**Risk:** low — nothing reads `_meshes[id]` between `scene.remove` and the delete today except the races themselves; sweep iteration already tolerates deleting the current entry; `clearEntityMeshReference` is identity-guarded (`:5704-5705`) so hoisting it can't detach a replacement mesh.

### F2 — Cook-internal census + sort walks still atomic — impact L / effort S

**Evidence:** `renderer.js:12329-12334` — `indexedShipLikeScan` + 3× `indexedTypeScan` collect `openingEntities` in four unclocked O(entityList) passes inside the cook; `rockHits.sort` `:12453-12459` is an unclocked O(H·log H) where H = rocks inside `firstFlightRockCookRadiusWu`.

**Mechanism:** everything around them yields (enqueue steps `:12342-12350`, drain `:12352`, promote burst `:12470-12473`); the collects are the last synchronous stretches in the cook prologue. Each iteration is O(1), so this is wall-clock only on dense sectors (entity counts in the low thousands) — it stretches the loading shell's task list, never a presented frame.

**Fix sketch:** run the four scans on the same slice clock as the neighbors (they're already indexed scans — trivially chunkable), and bucket the rock sort under the `rockPromotesSinceYield` clock or accept it (H is capped by the radius query, not the field).

**Risk:** low — collect-only code with no ordering contract beyond dedupe.

### F3 — `_pendingHiddenFreeze` accrues for the whole cook and spends first-flight passes draining — impact L / effort S

**Evidence:** every `_bindPresentationMesh` under `mode !== 'flight'` enqueues (`:21318-21326`); the queue drains only inside syncEntityViews at 6 minted + bounded scan per pass. A 20-60 s cook means the entire mounted set's freezes (minus early-frozen pooled identities) land as backlog on the first seconds of presented flight.

**Mechanism:** benefit-only by design — unfrozen roots just pay their compose — but the drain competes for the same presented-frame budget W101/W102 carved out. The freeze can not mint during the cook itself: the rehearsal render (`:12124`) and any cook-time compile need the subtrees visible. The legal window is post-rehearsal → first presented frame (shell still up, nothing renders the scene).

**Fix sketch:** opportunistically drain `_drainHiddenFreezeQueue` inside the cook tail's own yields once the last rehearsal/census reader has run (e.g. gated on a `state.render.openingCookComplete`-style latch), capped per pass exactly as today.

**Risk:** medium-low — ordering vs. the "still needs to render visible" readers must be proven per cook path (recook keep-gpu path rehearses; the main path's compile is census-driven, not visible-driven — different gates).

## Residual-hunt verdicts (a)–(d)

- **(a) mid-teardown suspension vs. `_meshes`/visibility bookkeeping** → F1: YES, the row lingers across the suspension and is raceable — destroy-listener double-dispose (+double note) and delete-kills-replacement-row, both reachable at both sweep sites. Hoisting the row bookkeeping closes both; `clearEntityMeshReference` is already identity-guarded so the entity side was never the problem.
- **(b) per-corpse iterator mint + post-row slice check = two clocks** → keep both, no legal hoist. The inner per-step check (`:12796`, `:15590`) bounds a single fat corpse's teardown; the post-row check (`:12811`, `:15599`) bounds unbind+remove+delete+note work across corpse count. Dropping the inner check reintroduces the atomic fat-corpse brick W102 removed; dropping the outer leaves thin-corpse long tails unclocked. They share one slice clock — this is already the minimal shape. (Cosmetic merges — e.g. folding the row tail into the iterator — buy nothing.)
- **(c) other baselined rows whose wiring landed upstream** → none. `node scripts/check-src-reachability.mjs` at HEAD: `1613 src files, 1528 reachable, 20 baselined orphans, no new ones — PASS`, and no stale baseline rows. Spot-verified the near-misses: `commandDeckRefitHooks.js` is reachable but only mentions `commandDeckRefit.js` in a comment; `orrery/flightInstruments.js` is imported solely by `orrery/flightPreview.js` (itself an orphan); `siteThermalModel` matches are a comment (`asteroidRenderer3d.js:2939`) + generated localization keys. All 20 rows accurate.
- **(d) bind-time mass-mount storms during cook that neither queue covers** → none found; W102 coverage is complete. Every mass-mount/mass-bind driver during cook is stepped or queued: `drainMeshBuildsBehindShell` drives one stepped `_drainMeshBuildQueueSteps(Infinity)` under cap + per-iteration clock (`:12213-12273`); reattach sweep yields every 64 (`:1906`); rebind/published-bind steps yield every 256; despawn drain parks per-corpse iterators; `_parkBoundedWarmRoots` debits + defers (`:20691-20709`); roster-prewarm release queues corpses (`:20746-20751`). Emitter-side `entity:destroyed` storms are batch-yielded at the source (`main.js:595` every 16 + paint; `saveSystem.js:5562` batch + `RESTORE_YIELD_SLICE_MS` clock; `_clearEntities()` sync lane `:5535` is dead code — no callers — optional retire). Residual atomic stretches ranked by worst-case node count: (1) F2's four census collects — O(entityList) ≈ low thousands; (2) F2's `rockHits.sort` — O(H log H), radius-capped; (3) F3's freeze backlog — presented-pass cost, amortized 6/pass.

## Not re-reported (per brief)

W4-closure adjudicated ledger; W100/W101/W102-implemented machinery (verified above, not re-listed as findings); the F4 roster-prewarm cohort adjudicated under W102 (its stated contract — a one-time 'loading'-mode emit whose costs are cook wall-clock, not presented frames — is consistent with this lane's scope; the residual mount+note traverses sit inside a deliberately synchronous emit and are covered by the cook's own pacing story); preexisting test failures; SwiftShader wall-time conclusions (all findings here are mechanism/race based — no GPU-cost claims).

## Instrument deltas needed

- For F1, evidence plumbing already exists (`live.departingSweep`/`live.leftoverSweep` step records carry counts). Suggest counting `swept-corpses-vs-_meshes-delta` (rows the sweep visited that left `_meshes` via another writer mid-sweep) as a `recordOpeningCookStep` field — it is the observable signature of Race A/B; zero today only because nothing measures it.
- No new instruments required for F2/F3.
