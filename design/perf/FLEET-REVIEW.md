<!-- LIFETIME: EPHEMERAL -->
# FLEET-REVIEW — adversarial review of the five uncommitted perf-fix diffs

**Reviewer scope:** working-tree diff on `claude/perf00-20260727` (2026-07-29). Nothing modified
except this report. Declared out-of-scope WIP (scenario-manifest.json, deterministicFramePump.mjs,
probe-perf-scenario.mjs, perf-scenario-determinism.mjs, probe-heap-verify.mjs, package.json) ignored.

**Verification run on this tree:**

```
npm run check:perf-counters                    → 29 pass / 0 fail
npm run check:baseline                         → 10/10 green (sim goldens bit-identical)
node --test test/space-background-depth-occlusion.test.mjs \
             test/space-background-shared-geometry.test.mjs \
             test/space-background-boot-tier-single-build.test.mjs   → 5/5 pass
node --test test/authored-precompile-residency.test.mjs \
             test/render-target-pipeline-warmup.test.mjs              → 14/14 pass
node --test test/collision-proxy-manifest.test.mjs \
             test/physics-authority-cache.test.mjs \
             test/dynamic-physics-render-interpolation.test.mjs       → 18/18 pass
node scripts/check-sg02-dynamic-body-owner.mjs                        → OK
node --test test/bounded-autosave.test.mjs                            → 17 pass / 6 fail
  (the 6 failures are exactly the 6 pre-existing productionCapture entropy-gap tests named in
   autosave-defer-REPORT.md §4 — all force:true paths the new gate structurally cannot reach)
```

---

## 1. Sprite material caches — `src/render/spaceBackground.js`, `src/ui/asteroid/asteroidRenderer3d.js`

**Q1a — can a live sprite hold a material whose texture rebake()/setPalette() just disposed? No.**
`rebake()` (spaceBackground.js:2532-2536) and `setPalette()` (:2544-2548) dispose the planet RTs and
clear `_spriteMatCache`, then synchronously call `_refreshHeroes(true)`, whose clear loop removes
every live planet sprite from the group (:1799-1804) before any new spawn. All of this is one
synchronous JS turn — no render can interleave between texture disposal and sprite removal. Respawns
bake fresh RTs (planetCache was cleared) and build fresh materials (`_getPlanetSpriteMaterial`,
:1871-1887, cache was cleared). Old sprites reference old materials mapped to disposed RTs, but they
are detached and unreachable by the renderer, so GC takes them; their no-op `dispose` is irrelevant.
The comet is unaffected by rebake (constant-content `_cometTex`/`_cometMat`, :2196-2218).

**Q1b — can LRU eviction strand a live sprite with an evicted texture? No.**
Eviction (`_getPlanetTexture`, :2100-2108) only runs inside `_spawnPlanet`, which is only called
from `_refreshHeroes` — which has already removed every live sprite earlier in the same synchronous
call (:1799-1804 before :1855-1866). The spawn cap is ≤1 concurrent planet impostor (:1854-1862), so
at most one sprite ever holds a cached material, and it is always removed before the next bake. The
added `_spriteMatCache.delete(oldRt.texture)` (:2108) only drops a cache reference; since the
wrapper makes `dispose` a no-op, deleting the entry changes nothing render-visible.

**Q1c — is dispose() teardown complete? Yes.**
`dispose()` really disposes every cache-owned material via `THREE.Material.prototype.dispose.call`
(:2603-2606, bypassing the deliberate no-op wrappers) plus the comet texture, before the pre-existing
group walk; a second `dispose()` call is a no-op on the cleared maps. The asteroid renderer's
teardown (asteroidRenderer3d.js:1331-1332) does the same for `badgeMats` and is terminal
(`renderer.dispose()` at :1343), so the un-cleared `badgeTextures` map matches the pre-existing
`oreMats` pattern — not a reuse hazard. Focused tests build the background via
`Object.create(prototype)` and only touch `_spawnPlanet`/`_createComet`, both of which lazy-init or
tolerate missing constructor fields (`:1873`, `:2196`) — 5/5 green here.

**Verdict: APPROVE.** I tried hard to construct a live-sprite/disposed-texture interleaving and the
synchronous clear-then-respawn ordering closes every path. The only "leak" is the intentionally
pinned shared sprite program, released correctly at module teardown.

**Ship: SHIP.**

---

## 2. HUD write-on-change guards — `src/ui/*.js` (10 files)

**FINDING 2.1 (REAL DEFECT): stale `_sfStyle.display` cache on `targetPanel.el` — panel stays
visible when the route should own attention.**
`hud.js:3890` hides the target panel via the JS-cached `setDisplay(targetPanel.el, false)`
(cache written at hud.js:719-723). But `targetPanel.update()` writes the **same element's**
`style.display` directly with a DOM-read guard at `targetPanel.js:343` (`= 'none'`) and
`targetPanel.js:348` (`= 'block'`, reached from hud.js:3892 whenever the route does not own
attention). Interleaving: (A) route owns → cache='none', DOM='none'; (B) waypoint drops →
`targetPanel.update()` direct-writes DOM='block', cache stays 'none'; (C) route owns again →
`setDisplay(..., false)` sees `cache.display === 'none'` and **skips the write** — DOM stays 'block'
for the entire route-owns-attention window, which is exactly the state that branch exists to
suppress. Confirmed with a minimal repro of the two writers (cache 'none' + direct 'block' →
`setDisplay(el,false)` returns "skipped", DOM stays 'block'). Existing tests do not cover this
interplay. Minimal fix: keep the DOM-read guard for this element in hud.js, or sync
`el._sfStyle.display` in targetPanel.js:343/348, or route targetPanel's own display writes through
the same cache.

**Q2 remainder — other bypass/staleness paths checked and cleared:**
- Doctrine-tell slots mix direct `slot.el.hidden` writes (hud.js:1569, :1612) with cached
  `setHidden` (:1662), but retired slots are skipped (:1644) and the direct un-hide at :1612 always
  executes before the cached path on every re-acquire, so the cache can never suppress a needed
  write. Fragile but not observable.
- `toasts.js:155` direct `r.el.style.opacity = ''` on coalesce desyncs `r._sfOpacity`, but
  `r.born` is refreshed (:153) so the fade restarts outside the guarded window and self-heals on
  the next fade tick; worst case is a one-tick opacity of equal-or-nearer value.
- All remaining direct `.style.display` writers on guarded elements are init-time only
  (hud.js:1013, :1246, :1275, :1282, :1294, :1334), before any cache exists.
- No non-string vs stringified-cache comparisons found: `setAttr`/`setOpacity`/`setTitle`/
  `setDataEdge` all stringify both sides (hud.js:660-701); `setHidden`/`_sfHidden`,
  `commandBar._sfScaleX`, `circularGauge.lastDone`, `uiRoot.lastFlightPathDrawing` compare
  same-typed values.
- Reticle writes split cleanly: uiRoot owns outer display/transform (uiRoot.js:394-408, :461-463),
  hud.js owns the inner SVG scale via the same `_sfStyle` key on a different element
  (hud.js:3792-3795); element identity is stable (single `#aim-reticle`).

**Verdict: FIX-REQUIRED** — finding 2.1 is a player-visible regression in a deliberate attention
rule, one-line class of fix.

**Ship: NO-SHIP until 2.1 is fixed.**

---

## 3. Boot GPU-buffer warm — `src/render/precompile.js`

**Q3a — render-target save/restore complete? Yes, for everything the fallback mutates.**
`warmResidentSceneGpuBuffers` (precompile.js:198-229) mutates only the render target: it saves
`getRenderTarget()` (:217-219) and restores it in `finally` (:224-227). Viewport and scissor are
respected, not modified, by `renderer.render` with a null target, and XR cannot be presenting during
boot/context-restore. `renderer.info` blips from the warm draw are boot-time telemetry noise only.

**Q3b — arming order without warmPostProcess? Acceptable.**
Both production call sites (renderer.js:896 context-restore, :1459 boot) do **not** pass
`warmPostProcess`, so the straight `renderer.render(scene, camera)` fallback is the production path
— a deliberate behavior change, executed after staging detach (:149-151) and under the loading
shell. Sector precompiles correctly skip it (:159 gates on `includeGlobalPipelines`, false for
sector runs at :43), so no mid-flight full-scene render can sneak in. The one theoretical hazard —
the warm draw compiling resident programs at an unpadded point-light count — is closed in practice:
the vfx event-light pool attaches to the scene at system init (vfx.js:666-677, :6333), long before
the boot `sector:enter` that kicks precompile (renderer.js:1459). `compileAsync` on the resident
scene is itself gated to the no-preparePipelines case (:203). Report's own caveat stands: real
proof of the upload-spike drop needs the 30-min probe (its §4) — that's measurement follow-up, not
a code defect.

**Q3c — double-remove / lost retained programs? No.**
`stagingAttached` (:73, :149-150, :180) plus THREE's idempotent `remove` make double-detach
impossible; `canopyPipelineWarmup.removeFromParent()` (:151) happens before `disposeObject(staging)`
(:186) and again harmlessly in `finally` (:182), so retained canopy/vfx/shield-bubble probes survive
staging disposal exactly as before; `keepWarmupPrograms` (:154) is computed from the same
`stillCurrent` inputs as pre-change. Gating the warm on `stillCurrent` (skipping it on a
mid-precompile context loss) is strictly safer than the old unconditional call.

**Verdict: APPROVE.** 14/14 focused precompile/residency tests green here.

**Ship: SHIP.**

---

## 4. Autosave calm-window deferral — `src/save/saveSystem.js`

**FINDING 4.1 (REAL RISK): forced autosave checkpoints are silently dropped while a deferred job
sits pending — a window this diff stretches from ~milliseconds to up to 60 sim-seconds.**
`requestAutosave` rejects every request when a job is pending: `saveSystem.js:869`
(`if (this._autosavePending || this._autosaveInFlight) return false;`) — with no force preemption.
The forced triggers are `dock:undocked` (:137), `jump:arrive` (:139), and `player:respawn` (:149).
Pre-change, a pending non-forced job only lingered across one 0 ms hop or a busy gate, so collisions
were rare. Post-change, an `interval`/`trade`/`hud_layout` job defers on a 120 ms hop for as long as
the player deals/takes damage within every rolling 3 s calm window, up to the 60 s hard cap
(:928-936) — i.e. exactly during sustained combat, which is exactly when a fleeing player
jump-arrives or dies and respawns. Those forced checkpoints are dropped outright; if the session
ends before the pending job flushes, the autosave slot never records the jump/respawn. The report's
claim that "forced … saves keep today's timing" is false inside this window. Minimal fix: on a
forced request with a pending non-forced job, promote/replace the pending job (`force = true`, new
reason, keep the older `requestedAt`) instead of returning false — that preserves coalescing while
honoring the forced contract.

**Q4 remainder — checked and cleared:**
- The `combat:damage` listener (:120-126) is registered once in `init`, same pattern as the
  pre-existing listeners; there is no dispose/re-init path that could double-register it (no
  `bus.off` exists for any save listener), and a duplicate would be idempotent anyway. Payload keys
  match the emitter (`src/combat/damage.js:191-193`: `targetId`, `attackerId`).
- `job.requestedSimTime` is captured for every job at :876 — `requestAutosave` is the only job
  source — and is `Number.isFinite`-guarded with a `|| 0` fallback at :932, so `sinceRequest` can
  never be NaN and the 60 s cap always fires. No starvation.
- The 120 ms backoff re-enters `_flushAutosave(job)` correctly: `_autosavePending` still holds the
  job through the deferral (it is only cleared at :939 after the gate), so the identity check at
  :912 passes; run-epoch rollover kills a stale chain cleanly (:1129). Deferred jobs cannot be
  dropped or pile up (one outstanding hop at a time).
- The 6 `bounded-autosave` failures reproduced here are exactly the pre-existing productionCapture
  entropy-gap set named in the report — net new failures: 0.

**Verdict: FIX-REQUIRED** — the gate itself is correct; the forced-save interaction is an
undocumented durability regression with a small, well-defined fix.

**Ship: NO-SHIP until 4.1 is fixed (or explicitly accepted as a bounded trade-off).**

---

## 5. CCD speed-gating + ghost-projectile pooling — `src/core/sg02DynamicBodyOwner.js`, `scripts/check-sg02-dynamic-body-owner.mjs`

**Q5a — pooled-body state reset complete? Yes.**
Reuse resets translation/rotation/linear+angular velocity and `setEnabled(true)`
(sg02DynamicBodyOwner.js:624-628). Everything else is either spec-keyed and identical for the pool
key (`ghostProjectilePoolKey` = radius|mass|inertiaY|ccd|centerOfMass, :1691-1694 — which covers
every `spec`-derived input to `buildBallColliderDesc` and `setAdditionalMassProperties`), or
per-record (fresh `appliedForce`/`controlForce` zero3 objects at :651-654; Rapier resets accumulated
forces each step), or creation-constant for all dynamic bodies (translation/rotation locks :590-591,
`setCanSleep(false)` :593-597, projectile angularDamping 0). Ghost colliders carry
`collisionGroups(0)` (:1701-1703) → zero contact pairs → no stale contact state; no `body.userData`
is used anywhere in the file; `_colliderOwners` is re-registered for pooled colliders in the common
tail (:676). `dispose()` frees pooled bodies before `world.free()` (:303-309), and records retired
during `dispose()` route through the pool first — consistent ordering.

**Q5b — unbounded pool growth? No cap, but structurally bounded.**
The pool only grows when projectiles retire faster than they spawn and drains on every reuse, so
its size tracks the **peak concurrent live volley per shape key**, not session length. A long
session of small volleys cannot accumulate bodies. Bounded by gameplay; not a leak.

**Q5c — CCD gate correctness? Confirmed.**
`payload` is in the gated set (:746), so tether-slung payloads at the authored 260-420 wu/s absolute
limit (:47-48) exceed `CCD_GATE_ENABLE_SPEED = 150` (:99) and gate ON; cruise-max ~147 wu/s craft
stay off until genuinely fast (dash impulses, contact shoves); hysteresis floor 120 (:100) prevents
flapping; authored `ccd:false` is never overridden (:741 early-return) and `recordMatchesSpec`
compares authored `spec.ccd` (:1679), so the gate never triggers a record rebuild. Sim goldens are
bit-identical here (check:baseline 10/10), consistent with the sub-2.5-wu/tick discrete-equivalence
argument.

**Q5d — check-script rewrite justified? Yes.**
The old `ccdBodies === 1` idle-ship assertion pinned the exact behavior Rank 1 removes; per
`scripts/AGENTS.md:14` the obsolete rule was replaced with behavioral coverage of the intended
result: gate transitions (off at rest → on at 200 → hold at 130 → off at 100 → on under boost → off
after), projectiles always-on, volley retire/re-register, and double-run snapshot/hash determinism.
It still fails loudly if the gate regresses (`ccdBodies === 0` at check-sg02-dynamic-body-owner.mjs:53
fires on any gate removal). One residual gap (not a regression — the old script had zero pooling
coverage): pooled-vs-fresh ballistic identity is only proven by first-vs-second run equality, so a
*deterministic* pose-reset bug in pooling would pass; an absolute expected-position assertion on the
second volley would close it.

**Verdict: APPROVE.**

**Ship: SHIP.**

---

## 6. Cross-cutting

- **PRODUCTION_UPDATE_ORDER / registry:** zero hits in the diff; no system-order or manifest-hash
  changes. `check:baseline` (incl. `save-schema`, `sim*`, `massline`) green on this tree.
- **Stray edits:** `git status` shows exactly the five listed change sets plus the declared WIP
  files — nothing else.
- **Line endings:** every edited src file is internally consistent (no bare-LF/CRLF mixing detected).
- **Golden determinism:** sim-v3/sim/massline hashes unchanged, corroborating diff 5's
  zero-behavior-change claim within the golden envelope.

## Overall

| Diff | Verdict | Ship? |
|---|---|---|
| 1. Sprite material caches | APPROVE | SHIP |
| 2. HUD write-on-change guards | FIX-REQUIRED (2.1: `targetPanel.el` stale display cache — hud.js:3890 × targetPanel.js:343/348) | NO-SHIP |
| 3. Boot GPU-buffer warm | APPROVE | SHIP |
| 4. Autosave calm-window deferral | FIX-REQUIRED (4.1: forced saves dropped during deferral window — saveSystem.js:869 × :925-936) | NO-SHIP |
| 5. CCD gate + ghost pooling | APPROVE | SHIP |
