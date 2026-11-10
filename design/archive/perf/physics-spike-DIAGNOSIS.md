<!-- LIFETIME: EPHEMERAL -->
# Physics single-tick spike diagnosis (48.6 ms)

**Evidence:** `.devshots/perf/phase0/baseline-postfix.json` · scenario `crowded-flight`  
**Metric:** `perf.topSystems` → `physics` avg **0.89** · p95 **0.7** · max **48.6** (n=180)  
**Scene peak:** 320 entities (250 asteroids, 19 stations, 16 ships, 8 wrecks, …)  
**Constraint:** read-only diagnosis; no behavior/quality change in fixes below.

## Live path

| Item | Location |
|---|---|
| Registry name `"physics"` | `src/core/registry.js:177` |
| Default backend | `gameState.js:20` → `physicsBackend: 'rapier-dynamic'` |
| Update entry | `src/core/physics.js:89-105` (SG-02 branch) |
| Authority | `sg02DynamicBodyOwner.js` via `_updateSg02DynamicAuthority` (`physics.js:240-305`) |
| Per-tick order (live) | sync entities → reconcile attachments → `owner.step(dt)` → contact impacts → spatial hash → pickups → **projectile sweeps** → dock range |

Custom integrate/collide (`physics.js:108-116`) is **not** the default play path.

**Signature:** p95 ≪ max ⇒ one rare catastrophic tick, not steady load. Spatial budgets also red (`queries/s` 103, `candidates/s` 3056) — secondary, not the 50× spike alone.

---

## Candidates (cost shape → trigger → rank → cheapest fix)

### 1. CCD on every craft/projectile × dense static field — **RANK 1**

- **Code:** `defaultCcd` enables CCD for ship/drone/payload/projectile (`physicsAuthority.js:295-296`); applied at body create (`sg02DynamicBodyOwner.js:575`, `602`). Dynamics never sleep (`setCanSleep(false)` at `576-579`).
- **Shape:** Rapier CCD TOI work ≈ O(active_ccd × nearby_colliders × toi_iters). With ~250 fixed asteroid balls + station compounds, a multi-ship boost through a dense cell is super-linear and bursty.
- **Trigger:** crowded-flight near station/asteroid belt; combat boosts; several dynamics moving fast in one tick.
- **Why 48 ms:** avg/p95 stay ~0.7 ms; one TOI storm matches a single-frame hitch.
- **Fix (no quality loss for intended use):** CCD only when speed > threshold or `flags.boosting` / projectile (mirror legacy `rapierCollisionWorld.js:234-235`). Keep CCD for fast movers; drop idle craft. Optionally allow sleep for non-attachment dynamics far from contacts.

### 2. Projectile double pipeline (Rapier body + JS sweep) — **RANK 2**

- **Code:** Projectiles are dynamic+CCD (`physicsAuthority.js:289-296`) with **ghost** colliders (`sg02DynamicBodyOwner.js:66-71`, `1613-1614`) — zero solver contacts. Damage still uses `sweepProjectiles` every tick on the SG-02 path (`physics.js:101`, `480-527`).
- **Shape:** Per shot: `createRigidBody`+collider+CCD (`559-600`); per death: `_removeRecord` (`641-652`); per live tick: full dynamic sync + step + segment tests vs spatial candidates. Combat volley = allocate/free burst + large `queryRadius` (speed 260 wu/s → fat sweep AABB).
- **Trigger:** fleet combat near station; many short-TTL projectiles same tick.
- **Fix:** Exclude ghost projectiles from SG-02 body index (`shouldSyncPhysicsBodyEntity` / material `ghost`), keep JS sweeps only. Or pool projectile bodies and disable CCD when ghost. Behavior unchanged (contacts already ignored).

### 3. Contact-force event storm (threshold 0) — **RANK 3**

- **Code:** Live profile enables `captureContactImpacts` via `weaponImpulseConsequences` (`physics.js:247`). Colliders: `CONTACT_FORCE_EVENTS` + **threshold 0** (`sg02DynamicBodyOwner.js:1665-1672`). Drain path merges events and may call `world.contactPair` per event (`677-726`); JS then emits `physics:impact` (`physics.js:307-326`).
- **Shape:** O(contact_manifolds) per step; compound station ≤32 prims (`collisionProxyManifests.js:38`, build at `1624-1662`) × overlapping ships → event fan-out. Sort of receipts each drain (`725`).
- **Trigger:** hull scrapes / deep station proximity with multiple craft.
- **Fix:** Raise force threshold to a gameplay-noise floor; skip `contactPair` when midpoint pose is enough; cap drained events/tick with merge-only (already merges by pair key).

### 4. One-shot Rapier world populate / static-layer version bump — **RANK 4**

- **Code:** First ready tick builds all records (`_syncRecord` → `_createRecord`). Layered sync full-statics when `physicsStaticVersion` changes (`sg02DynamicBodyOwner.js:200-246`). Version++ on **every** static add/remove (`coreSystem.js:319-320`, `426-427`).
- **Shape:** O(statics + dynamics) create/destroy on first sync or version change; WASM alloc spikes.
- **Trigger:** SG-02 promise resolves; asteroid mine/despawn; station spawn. Warmup is 3 s so first-init may be pre-sample — still relevant for hitch class.
- **Fix:** Amortize body create (N per tick queue); on static version change, diff only removed/added IDs (already removes missing — avoid re-touching unchanged via early continue without pose work). Batch `physicsStaticVersion` bumps per index rebuild.

### 5. Spatial hash maintain + projectile candidate floods — **RANK 5**

- **Code:** SG-02 path always `_syncDynamicSpatialHash` (`physics.js:99`, `136-146`); active when collidables/asteroids ≥96 (`765-771`). Sample: 548 dynamic rebuilds, 931 queries, 27.5k candidates.
- **Shape:** Incremental rehash O(movers); queries O(projectiles × cell occupancy). Explains budget fails and steady ~1 ms, not 50× alone.
- **Trigger:** 250-asteroid sector + any sweeps/pickups.
- **Fix:** Early-out projectile sweep radius clamp; don’t rebuild hash when only SG-02 needs it for pickups below threshold; reuse query scratch (already) and skip near-miss when no player threat.

### 6. Frame-origin rebase reproject-all — **RANK 6**

- **Code:** `setFrameOrigin` → `_reprojectAllBodiesToFrame` (`sg02DynamicBodyOwner.js:167-177`, `760-770`); called every physics tick (`physics.js:286`).
- **Shape:** O(bodies) `setTranslation` when seq changes (`coordinates.js` rebase threshold).
- **Trigger:** player travels past rebase distance mid-fight.
- **Fix:** Unlikely sole 48 ms; keep as-is or defer non-visible static reprojection one tick (pose-correctness must hold for contacts — prefer no behavior change; low priority).

### 7. SG-02 `step` accumulator multi-fixed (defensive) — **RANK 7**

- **Code:** `step` caps added dt at **0.25 s** and while-loops fixed steps (`sg02DynamicBodyOwner.js:248-254`). Sim normally passes 1/60 once per system sample — if a caller ever passed frame dt, up to ~15 Rapier steps in one `physics.update`.
- **Trigger:** non-fixed dt into physics (bug/regression).
- **Fix:** Assert/clamp to single fixed step when invoked from the fixed sim spine (`step(this.fixedDt)` only); keep accumulator only for lab variable-dt hosts.

---

## Ranked summary (crowded-flight hitch)

| Rank | Candidate | Plausibility for 48.6 ms |
|---|---|---|
| 1 | CCD × 250 static asteroids + always-awake dynamics | **Highest** — intermittent super-linear solver |
| 2 | Projectile Rapier create/destroy + dual sweep | **High** — combat burst alloc |
| 3 | Contact-force threshold 0 + compound station | **Medium-high** near hulls |
| 4 | Mass body create / static version rebuild | **Medium** — one-shot |
| 5 | Spatial hash / sweep candidates | **Medium** for budgets; low for 50× alone |
| 6 | Frame origin reproject | Low alone |
| 7 | Multi-step accumulator | Low if contract held |

## Recommended first slice (cheapest, behavior-safe)

1. **Gate CCD** to fast movers only (`physicsAuthority.defaultCcd` + optional runtime speed gate in `_syncRecord`).  
2. **Stop SG-02 bodies for ghost projectiles**; keep `sweepProjectiles`.  
3. **Contact force threshold** > 0 (tune to consequence kernel floor).  
4. Instrument next capture: log `diag.ccdBodies`, `sg02Sync*`, `rapierContacts`, body create/destroy counts inside `physics._diag` on ticks where `tickMs > 8`.

## Non-goals

Do not “fix” by reducing asteroid count, disabling station proxies, or lowering combat fidelity. Optimize algorithms/cadence/residency only.
