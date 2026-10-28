<!-- LIFETIME: EPHEMERAL -->
# Physics single-tick spike — Rank 1 + Rank 2 fix report

**Diagnosis implemented:** `design/perf/physics-spike-DIAGNOSIS.md` (48.6 ms single-tick spike, avg 0.89 / p95 0.7)
**Scope:** Ranks 1–2 only. Ranks 3–7 untouched (no PRODUCTION_UPDATE_ORDER, manifest-hash, or contact-force-threshold changes).
**Constraint held:** zero behavior change — all sim golden/telemetry hashes unchanged (see Verification).

## Rank 1 — CCD gated by actual need

`src/core/sg02DynamicBodyOwner.js`

- `CCD_GATE_ENABLE_SPEED = 150` / `CCD_GATE_DISABLE_SPEED = 120` (wu/s) — constants at `:99-100`.
- `_applyCcdGate(rec, entity)` at `:740` re-evaluates CCD on **every** `_syncRecord` (all three return paths at `:720-738`), i.e. every physics tick, from live `entity.vel` / `entity.flags.boosting`:
  - `projectile` → CCD always on (fast movers; mirrors legacy `rapierCollisionWorld.js:234-235`).
  - `ship`/`drone`/`payload` → on when `flags.boosting`, or speed > 150; once on, stays on until speed < 120 (hysteresis band 120–150 prevents flapping).
  - Everything else (`wreck`, `pickup`, chunks, debris) → untouched, keeps its creation state.
- Body-level only: `spec.ccd` authoring and `physicsAuthority.defaultCcd` (`physicsAuthority.js:295-296`) are **unchanged**, so `recordMatchesSpec` never rebuilds a record because of the gate, and authored `ccd:false` is never overridden. Gate toggles via `RigidBody.enableCcd()` and tracks `rec.ccdEnabled` (which feeds `diagnostics().ccdBodies` and telemetry).
- `setCanSleep(false)` at `:592-596` untouched — sleeping semantics exactly as before.

**Threshold rationale:** authored cruise maxima top out at ~147 wu/s (`src/data/enemies.js` flight models; boost ×1.55 goes through `flags.boosting` anyway). At the 150 wu/s gate a gated-off body moves < 2.5 wu/tick against ≥10 wu craft/asteroid collider radii, so discrete collision resolves the same contacts CCD would have caught. The gate additionally catches the genuinely fast cases the legacy heuristic missed: dash-impulse bursts and tether-slung payloads (tether absolute speed limit 260–420 wu/s, `:47-48`). Idle craft (the crowded-flight common case: 16 ships drifting/cruising near 250 asteroid balls) no longer pay CCD TOI work at all.

## Rank 2 — ghost projectile body pooling

**Direction of authority found:** the **Rapier body pose is authoritative for projectile motion** on the SG-02 path. `_stepFixed` → `_syncEntityFromKinematics` (`sg02DynamicBodyOwner.js:482`, `:895`) mirrors body pose/velocity back onto the projectile entity every tick; no JS system integrates projectile positions on this path (`flightV3.js:917` and `flight.js:535` skip projectiles; `physics.js:396` integration is the legacy custom backend). The JS `sweepProjectiles` (`physics.js:480-527`) is authoritative for **damage/expiry only** (writes `pos`/`alive` on hit or TTL). Therefore projectiles keep their Rapier bodies and keep CCD (Rank 1 holds them always-on), and the per-shot create/free burst is eliminated by pooling instead of exclusion.

`src/core/sg02DynamicBodyOwner.js`:

- `_ghostProjectilePool = new Map()` (`:136`), keyed by `ghostProjectilePoolKey(spec)` (`:1691`) = radius|mass|inertiaY|ccd|centerOfMass — a pooled body is interchangeable with a fresh one only at identical shape/mass.
- `_createRecord` (`:614-639`): dynamic `projectile`-material (ghost) records pop a pooled body/collider set and restore exact creation-desc state (`setTranslation`/`setRotation`/`setLinvel`/`setAngvel`/`setEnabled(true)`); non-pooled entities take the original creation path verbatim.
- `_removeRecord` (`:686-700`): ghost projectile records are retired via `body.setEnabled(false)` (disabled bodies/colliders leave broad phase and solver) and pushed to the pool instead of `world.removeCollider`/`removeRigidBody`. `_colliderOwners` bookkeeping unchanged on both paths.
- `dispose()` frees pooled bodies/colliders (`:296-304`).

**Why this is behavior-identical:** ghost colliders join zero contact pairs (collision groups 0, `:1732-1734`), gravity is zero, projectile angular damping is 0, and no impulses target projectiles — so their motion is purely ballistic `pos += vel·dt`. A reused body reset to the same pose/velocity integrates bit-identically to a fresh one. Body handles are not part of snapshots, contact receipts (entity-id keyed), or any `test/*.expected.json` golden (verified by grep). Determinism proven by double-run hash equality in the updated lab check.

## Check-script update (intended-behavior coverage)

`scripts/check-sg02-dynamic-body-owner.mjs` — the old contract "ship preserves CCD authoring at rest" is the exact behavior Rank 1 removes; per `scripts/AGENTS.md` the obsolete assertions were replaced with behavioral coverage of the intended result:

- `:49` idle ship now asserts `ccdBodies === 0`; `assertTelemetry` asserts the gated `ccd` is boolean.
- New `runCcdGateScenario()` (run twice, hash-compared): gate off at rest → on at 200 wu/s → hysteresis holds at 130 → off at 100 → on while boosting → off when boost ends; projectiles always CCD; volley retire → pooled reuse on second volley; snapshot determinism.

## Verification (tails)

`npm run check:sg02` (includes dynamic-lab, authority, production-combat-port, tether, tether-resilience, dash-collision, save-reload, `check:sim:dynamic`):

```
SG-02 intake checks OK
Physics authority membrane checks OK
SG-02 dynamic body owner checks OK
SG-02 production authority checks OK
SG-02 production combat-port checks OK
SG-02 tether acceptance checks OK
SG-02 production Massline resilience checks OK
SG-02 dash collision checks OK
SG-02 save/reload checks OK
  "comparison": { "ok": true, "hashEqual": true, "firstDivergentTick": null, "diffs": [] }
EXIT:0
```

`npm run check:combat`:

```
ok   all authored combat definitions validate
ok   dash→attach→reel→sling→cut→burst has the exact golden tick trace
ok   swept projectile contact enters the hull without accepting distant off-hull coordinates
...
SG-03 combat grammar: 8 checks passed.
SG-03 save/reload combat persistence checks OK
EXIT:0
```

`test/collision-proxies*.test.mjs` does not exist; nearest physics/collision suites:

```
node --test test/collision-proxy-manifest.test.mjs        → 14 pass / 0 fail
node --test test/dynamic-physics-render-interpolation.test.mjs \
            test/physics-authority-cache.test.mjs \
            test/physics-writer-audit.test.mjs \
            test/sf10-physics-weapons.test.mjs             → 13 pass / 0 fail
```

`npm run check:baseline` (golden sim hashes — the zero-behavior-change gate):

```
10/10 green in 33214ms wall — sim-v3-compare, sim-compare, sim-v3, sim, massline all PASS
EXIT:0
```

All sim goldens replay bit-identically: trajectories, impacts, and receipts unchanged.

## Out of scope (not done)

Ranks 3–7 (contact-force threshold, populate amortization, spatial-hash cadence, frame-origin reprojection, step accumulator) untouched. Effect on the 48.6 ms spike should be re-measured with the `crowded-flight` perf capture before considering further ranks.
