<!-- LIFETIME: VOLATILE — point-in-time audit; refresh after the fix lanes land -->
# Determinism audit — gameplay sim sweep, 2026-09-18

**Law under audit:** gameplay-affecting sim code uses `state.rng` and `state.simTime`, never
`Math.random()`, `Date.now()`, `performance.now()`, or ambient closure state (ARCHITECTURE §0.5).

**Sweep:** `src/systems/`, `src/ai/`, `src/missions/`, `src/combat/` — every file, for clock reads,
ambient RNG, module-level mutable state, off-tick deferred writes, and unseeded PRNG draws.
Patterns swept: `Math.random`, `Date.now`, `performance.now`, `new Date`, `Date.UTC/parse`,
`hrtime`, `getTime()`, `crypto.random`/`randomUUID`, bare `random()`, `setTimeout`/`setInterval`/
`queueMicrotask`/`requestAnimationFrame`, module-scope `let`/`Map`/`Set`/`WeakMap` singletons, and
`mulberry32(` call sites (checking each seed is hash-derived, not ambient).

**Verdict:** the law holds in the per-tick sim. **Zero** `Math.random()` in gameplay paths; every
`mulberry32` draw is `hash32`-seeded; `state.rng` is `mulberry32(seed)` with a serialized
continuation that save/load round-trips (H9 honored). The real findings are one wall-clock
regression introduced *after* the 2026-09 cleanup, and a class the cleanup never covered:
process-global ID counters that diverge across sims sharing a process.

---

## Findings, ranked by severity

### M1 — Wall clock sets a real economy number (missions featured board)

- **Where:** `src/systems/missions.js:1895` — `_dayKey()` returns `new Date().toISOString().slice(0,10)`.
- **Path affected:** `_markFeaturedOffer` hashes (day key, station, epoch, world seed) to pick one
  featured offer and boosts its `reward_cr`. Identical seed + identical inputs produce **different
  board pricing on different UTC days**, and a session spanning midnight UTC can re-price mid-run.
  Breaks agent comparison across days and any replay/golden that crosses a UTC day boundary.
- **Severity:** medium. It is *deliberate* design (daily featured contract, commits `40936e478` /
  `95919978d`) — but unlike `achievements`/`survivalRecords`, which expose an `injectedNow` seam,
  this one has **no injection point**: labs and replays cannot pin the day.
- **2026-09 status:** **regressed** — introduced after the story/traffic/intervention cleanup by the
  featured-board commit, not a miss.
- **Fix plan (one line):** read the day key from an injectable source — `state.meta.utcDayKey` set by
  the host at boot (live hosts write wall-clock day; lab/headless writes a fixed day or derives from
  simTime), keeping `new Date()` only as the live-host default.

### M2 — Process-global lineage counter leaks across sims (hash-visible)

- **Where:** `src/combat/attackLineage.js:26` — `let nextLineageId = 1`, minted at
  `allocateLineageId()` (lines 33–34). `resetLineageIds(start)` exists (line 28) but **only tests
  call it** (`test/attack-lineage.test.mjs`, `attack-chain-payload.test.mjs`,
  `attack-live-wiring.test.mjs` — the resets exist because the leak was already hit).
- **Path affected:** `createLineage` fires in live combat (`src/systems/weapons.js:941`). The id
  becomes `orbit:${lineageId}:${i}` field ids registered into `world.kernel` + `world.nodes`
  (`src/combat/orbitNodes.js:201-220`) — i.e. **into the deterministic hashed surface** — plus
  `attackRuntime` records on spawned projectiles. Two `createSimulation` instances in one process
  with identical seeds and inputs diverge the moment a lineage-bearing weapon fires.
- **Severity:** medium-high for the class it serves: in-process agent/A-B comparison, multi-sim
  test files, any future dual-sim harness. Single-sim-per-process runs (goldens, playthrough
  batteries) are unaffected today.
- **2026-09 status:** **missed** — the cleanup swept clock/RNG calls, not ambient counter state.
- **Fix plan (one line):** re-base the counter at sim init — call `resetLineageIds` with a
  seed-derived start from a system `init` (or derive ids as `hash32(seed, tick, seq)`), so a fresh
  sim never inherits the previous process resident.

### M3 — Process-global module-instance counter leaks into serialized inventory

- **Where:** `src/systems/cargo.js:76` — `let _moduleSeq = 0n`; `nextLooseModuleInstanceId` (135-149)
  mints `mi_N`.
- **Path affected:** `mi_N` instanceIds land in `state.player.moduleInventory` — **serialized save
  state**. The function rebases by scanning existing inventory (save/reload collision-safe), but a
  *second fresh sim in the same process* continues the counter: identical actions mint different
  instanceIds → divergent saves and hash surfaces.
- **Severity:** medium — same exposure class as M2, on a save-serialized field.
- **2026-09 status:** **missed** (ambient counter, not a clock call).
- **Fix plan (one line):** re-base `_moduleSeq` at cargo `init` (the existing inventory scan is
  already the right shape — run it once against `ctx.state` at init instead of per allocation).

### M4 — Process-global claim counter, narrower surface

- **Where:** `src/systems/claims.js:204` — `let _nextClaimId = 1`; mints `claim_N` at lines 313/1600.
- **Path affected:** claim ids serialize into `state.claims.bodies`. Reset exists in `newGame`
  (2340) and `deserialize` (2291, re-derived past restored ids at 2330) but **not in `init`** — a
  second sim that reaches claims without newGame/deserialize inherits the counter.
- **Severity:** low-medium — claims are a late-game surface (player-owned outposts), so the exposure
  window is narrow, but it is the same defect class.
- **2026-09 status:** **missed.**
- **Fix plan (one line):** re-derive `_nextClaimId` from `state.claims.bodies` in `init` (the scan
  at line 2330 verbatim).

### L5 — Single-slot bound context cross-talks between sims

- **Where:** `src/systems/survivalSwarm.js:204-205` — `boundCtx`/`boundOff` module singletons; the
  `entity:spawned` listener closes over `boundCtx` (line 234 reads `boundCtx.state`).
- **Path affected:** binding a second sim overwrites `boundCtx` while the first sim's bus
  subscription stays live — sim A's spawn events then read sim B's state. Real cross-talk, but
  survival-arena-scoped (Crucible runs, single-sim-per-run in practice).
- **2026-09 status:** **missed.**
- **Fix plan (one line):** key bindings by state (the `stateBindings`/`ownerBindings` WeakMap
  pattern in `cargo.js:74-75` is the in-repo template) or make bind idempotent per state.

### L6 — `factions._state` singleton fallback can read a foreign sim

- **Where:** `src/systems/factions.js:129` — `let _state`, set at `init` (194); pure-helper fallbacks
  `this.state || _state` at ~20 sites.
- **Path affected:** a pure-helper call before the target sim's `init` — or after a second sim
  initialized — reads foreign state. Documented, deliberate pattern; the window is narrow because
  methods prefer `this.state`.
- **2026-09 status:** **missed** (accepted pattern, edge case).
- **Fix plan (one line):** thread explicit `state` into the remaining `_state` fallback sites (or
  assert `_state === this.state` in dev).

### L7 — Ghost-tape module singletons

- **Where:** `src/systems/survivalRecords.js:172-173` — `ghostRecording`/`ghostPlaybackTape`.
- **Path affected:** a second sim sees a stale tape until `resetGhostRuntime` runs. Run-scoped
  feature (Crucible ghost races); single-sim-per-run in practice.
- **2026-09 status:** **missed, low impact.**
- **Fix plan (one line):** key the tape by run state, or call `resetGhostRuntime` from the system's
  own `init`.

### I8 — Vestigial publish/peek channel (no defect, noted for completeness)

- `src/ai/director.js:3-4` — `publishedSessionRhythmPhase` / `publishedEscalationSeeds` module
  singletons written by `encounterDirector` (248/277/294/301); the `peek*` readers have **zero
  callers** anywhere in src/scripts/test. Write-only today — no leak path in practice. Delete the
  surface or wire a consumer; either is a cleanup, not a determinism fix.

---

## Verified clean — reviewed and cleared

| Site | Why it is compliant |
|---|---|
| `missions.js:189` / `economy.js:236` `STATION_INFO`, `traffic.js:289` `FLEET_BY_FACTION`, `world.js:237` `STATION_SECTOR_ID` | Module Maps built once at load from static def tables — immutable lookups, not runtime state. |
| Scratch buffers — `tacticalAI.js:613-616` cohort/squad Maps, `mining.js:1851-1889`, `lootShards.js:92-94`, `aiPorts.js:1271-1273` | Cleared at each call entry; standard zero-alloc scratch, never holds results across calls. |
| `flightV3.js:1361`, `flight.js:433` `nowMs()` | Feeds `this._diag.tickMs` profiling only — never read by gameplay. |
| `input.js:934`, `gamepad.js:259`, `touch.js:114` wall stamps | Input-latency telemetry stamps that explicitly never enter `state.input` (documented in-code, F4/P7). |
| `automation.js:3099` `Date.now` | Gated by opt-in `settings.gameplay.wallClockOfflineProgress`, OFF in deterministic hosts (3073-3114). |
| `telemetry.js:49-201` | `Math.random`+`Date.now` mint session ids for an analytics sink; nothing reads them back into sim. |
| `achievements.js:79`, `survivalRecords.js:76` `new Date()` | `injectedNow` seams exist for tests; stamps are display/daily-seed-key design (Crucible daily runs). |
| `stationBroadcast.js:213` | Earlier `Math.random` behind `typeof window` was replaced by `hash32(seedBase, stationId, bucket)` — verified in code; cleanup claim is true. |
| `story.js`, `traffic.js`, `intervention.js` | Zero ambient-clock/RNG hits today — the 2026-09 cleanup **held**, no regression in these files. |
| `sim.js:26 forkSystem` | `Object.create(definition)` prototype-fork per sim — `this._*` state cannot cross sims; the ambient-closure guard is real. |
| `saveSystem.js:486-564` | `rng.getState()` / `mulberry32FromContinuation` round-trips the PRNG continuation — H9 honored. |
| `queueMicrotask`/`setTimeout` hits (`livingPoiBehaviors:262`, `uniqueWrecks:561`, `presentationAdapters`, `achievements:615/774`, `telemetry:162`, `stationBroadcast:156`) | Presentation/storage debounces only; none write sim state off-tick. `stationBroadcast` setInterval is `window`-guarded — headless never reaches it. |
| `missions.js:7285` `mulberryLocal` | A local copy of mulberry32 with identical seeded semantics — duplication, not a violation. |
| All `mulberry32(` call sites (~43) | Every seed is `hash32(...)`-derived from save/scenario seed + stable ids — no ambient draws. |

## Verification results (asked-for checks)

- **Test goldens pin real behavior.** Only three `test/*.expected.json` exist; all three pin hard:
  `47a.presentation` carries a SHA-256 `stateHash` plus event `summaryCounts`; `47a.telemetry` and
  `47a.telemetry.v3` carry `authoritativeHash` inside `acceptanceCriteria` plus tick-bounds
  (`firstMeaningfulSteeringTickMax`, `firstTetherAttachTickMax`), behavioral minimums
  (`policyCompletionCountMin`, `enemyCounterTetherBehaviorCountMin`), and
  `cleanRunCountRequired: 5` — a five-consecutive-clean-runs gate, exactly the harness the counter
  leaks above would eventually trip.
- **PQ-160 replay verifier is still hash-strict.** `src/testing/lab/differentialReplay.js` +
  `src/core/simSnapshot.js:createSimSnapshotRingBuffer`: per-tick canonical-surface checkpoints
  hashed with sha256 (FNV-1a ring-local), `compareCheckpoints` walks exact `hashA === hashB`
  equality and reports first divergence with field-level localization — no rounding, no
  tolerance. Runtime fingerprints and manifest/profile hashes are also compared strictly
  (`fingerprint-mismatch`, `manifestHash-mismatch` exit classes).
- **`state.rng` anchor:** `createGameState` seeds `mulberry32(seed)`; continuation serializes and
  restores across save/load.

## 2026-09 cleanup scorecard

| File | Verdict |
|---|---|
| `story.js` | Clean — 0 hits. |
| `traffic.js` | Clean — 0 hits (post-cleanup fleet-variety work stayed seeded). |
| `intervention.js` | Clean — 0 hits; uses `drawSeeded`/`hash32`. |
| **Missed** | Ambient process-global counters (M2, M3, M4) and run-scoped singletons (L5–L7) — the sweep targeted clock/RNG *calls*, not counter *state*. |
| **Regressed** | `missions.js` `_dayKey()` (M1) — wall clock re-introduced by the featured-board commit after the cleanup, without an injection seam. |

## Fix lane summary (for the next wave)

1. `missions.js` — injectable day key (`state.meta.utcDayKey`), keep `new Date()` as live-host default.
2. `attackLineage.js` — seed-derived `resetLineageIds` at combat init.
3. `cargo.js` — re-base `_moduleSeq` at `init`.
4. `claims.js` — re-derive `_nextClaimId` in `init` (reuse the deserialize scan).
5. `survivalSwarm.js` — per-state bindings (WeakMap pattern).
6. `factions.js` — explicit `state` at remaining `_state` fallbacks.
7. `survivalRecords.js` — reset/key ghost tape per run state.
8. `ai/director.js` — delete or wire the dead peek channel (cleanup, optional).

**Scope of this audit:** `src/systems/`, `src/ai/`, `src/missions/`, `src/combat/` only, per the
charter. `src/render/`, `src/ui/`, `src/save/`, `scripts/`, and `test/` were not swept for
violations (render/UI wall-clock is presentation scope; scripts/tests are host scope) — findings
above that cite them (e.g. test-side `resetLineageIds`) are evidence, not violations.

**No code was changed for this audit.** All findings are report-only; none qualified for the
under-3-additive-lines unowned-fix allowance (each needs init wiring or an injectable seam plus a
focused test, i.e. a real lane).
