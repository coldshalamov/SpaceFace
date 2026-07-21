# PQ-011 / SF-11 — Deployable Mass Seed anchor: adversarial physics/sim review

Reviewer lane: hostile physics/simulation. Worktree `C:\Users\93rob\sf-g0-phys` (branch `g0/pq011-phys-review-20260721`, base master `29ff122a`). All work UNCOMMITTED for lead staging.

**Bottom line:** the packet HOLDS. The receipt's flagged seam — kinematic entity-space travel with an authored ghost/fixed body synchronized by the physics owner — is **SANCTIONED** against the physics-authority intent, with a complete evidence chain (§5). Two P2 issues found: one reachable receipt-exactness wart (FINDING-01) and one base-suite coverage gap (FINDING-02). Neither breaches the canonical acceptance bar (no NaN, no constraint leak, no orphaned tether, no invisible expiry, determinism green). Determinism is green on the 47-A compare.

New files (untracked): `test/mass-seed-adversarial.test.mjs` (20 hardening tests, all PASS), `test/mass-seed-findings.test.mjs` (1 test, FAILS by design — documents FINDING-01), `REPORT.md`.

## 1. Verdict table

| Area | Verdict | One-line |
|---|---|---|
| A. Physics authority | **HOLDS** (seam SANCTIONED) | Seed is `dynamic:false` its whole life → `entity.pos/vel` are physics INPUTS (authoring a fixed body), never solver outputs; `projectile`=ghost=zero contacts; `physicsStaticVersion++` is the required, structurally-sanctioned invalidation. |
| B. Frame rebase / far-from-origin | **HOLDS** | Sim coords are global; SG-02 rebases via `globalToFrame`, and `setFrameOrigin` reprojects ALL bodies incl. statics. Deploy at x≈50000 is the origin lifecycle translated bit-exact; a mid-life rebase leaves global pose + tether intact. |
| C. Fixed-step determinism / decomposition | **HOLDS** | The loop only ever calls `step(1/60)`; a hitch runs MORE 1/60 sub-steps (capped 4), never a bigger dt. Lifecycle reads `simTime`, ignores `dt`, and is rng-/wallclock-free (grep-clean). Decomposition-invariant tick-tagged event stream. |
| D. Destruction in EVERY phase | **HOLDS** except **FINDING-01 (P2)** | Travel/locking/warning/target-disappearance/dying-seed kills all cut with the exact reason and leave zero residue. A kill landing DURING the expiry collapse beat re-emits the collapse and flips the demise reason `seed_expired`→`seed_destroyed`. |
| E. Save/Continue in EVERY phase | **HOLDS** | Seed entity + its tether never serialize; the runtime mirror `state.massSeed` is NOT in the save schema; `_onSaveLoaded`→`_clearSeed`+`_flushDying` normalize travel/locking/warning/collapsing(+dying); cooldown blob round-trips; fresh deploy works post-load. |
| F. Mode/UI gating (docked / modal) | **HOLDS** | Docking (`ui.docked===true`) and every pausing screen request `timeScale=0` through the shared time-effects service, so the ENTIRE sim (incl. `simTime`) suspends. The prompt's premise ("seed freezes while simTime keeps advancing") is factually false; the seed resumes coherently on undock. See the latent-fragility note in §2/§6. |
| G. Same-tick event collisions | **HOLDS** | Cooldown denial is strict-`<` (the ready instant is inclusive); replacement on/near the lock tick stays deterministic (old→`seed_replaced`, no cooldown restart); a latch attempt on the expiry tick is denied (eligibility flips false before tetherGameplay runs). |
| H. Tether-cut exactness | **HOLDS** | `_cutSeedTethers` iterates an `Object.values` snapshot and filters by `targetId`, so mid-iteration mutation is safe and MULTIPLE lines to one seed all cut with the exact reason; receipts carry it. |
| I. Mutation audit | **6/7 caught by base suite; M6 SURVIVED → FINDING-02 (P2 coverage)** | The base suite never pushes `ms.dying` past `DYING_CAP`, so the trim loop is unexercised. Closed by new test `ADV-D5`. |

## 2. Findings

### FINDING-01 — mid-collapse kill re-emits the collapse and flips the demise reason (P2)

- **Where:** `src/systems/massSeed.js` — `_tickSeed` entity-lost branch (`:267`) → `_onSeedEntityLost` (`:528`, reason hard-set to `destroyed` at `:529`). Interacts with `_beginCollapse` (`:480`).
- **Mechanism:** `_beginCollapse` sets `phase='collapsing'`, cuts the tether cleanly with `seed_expired`, flips the body to the ghost material, and emits `massSeed:collapsing{expired}`. The entity stays alive + damageable for the 0.45 s collapse beat *by design* (`data/massSeed.js` comment: "damageable in EVERY phase … no protected window"; `coreSystem.js:313-317` keeps it in `damageables`; `damage.js:43` accepts `massSeed`). If a hostile `projectile:hit` lands in that window, combat kills the seed; next tick `_tickSeed` sees `alive===false` and calls `_onSeedEntityLost`, which UNCONDITIONALLY emits `massSeed:destroyed` + a SECOND `massSeed:collapsing{destroyed}` + `massSeed:collapsed{destroyed}` + a second `sfx_explosion_small`, and restarts the cooldown from the kill time. `_finishCollapse` never runs, so the only `collapsed` event reports `seed_destroyed`.
- **Deterministic repro:** `test/mass-seed-findings.test.mjs` → `FINDING-01: mid-collapse kill must not re-emit collapse nor flip seed_expired → seed_destroyed`. Observed `massSeed:collapsing` reasons = `["seed_expired","seed_destroyed"]` (should be `["seed_expired"]`); one spurious `massSeed:destroyed`; two explosion cues.
- **Player-facing consequence:** the unambiguous defect is the **doubled collapse lifecycle** — `massSeed:collapsing` fires twice for one seed and a redundant death bang plays over the collapse animation. The reason-attribution flip (`seed_expired`→`seed_destroyed`, and a telemetry/HUD read of "enemy-destroyed") is the *softer, partly-arguable* half — "you shot it, you destroyed it" is a defensible reading — but combined with the double-emit it makes the receipts non-exact, and the cooldown ends fractionally early. **No constraint leak** — the tether was already cut with the exact `seed_expired` reason at `_beginCollapse`; no NaN, no orphan, determinism intact. Hence **P2**, below the canonical P0/P1 bar.
- **Suggested repair (owning seam: `massSeed.js`):** in the `_tickSeed` entity-lost branch (or `_onSeedEntityLost`), if `ms.phase === 'collapsing'` treat the loss as completion of the in-progress collapse — finish quietly, preserve the original `ms.collapseReason`, and do not emit a fresh destroyed/collapsing/collapsed with a flipped reason.

### FINDING-02 — base suite never exercises `DYING_CAP` past its bound (P2, coverage)

- **Where:** `src/systems/massSeed.js:421` — `while (ms.dying.length > DYING_CAP) this._finishDying(…)` (cap `DYING_CAP = 8`, `:61`). Base suite: `test/mass-seed.test.mjs` test 18.
- **Mechanism:** test 18 presses deploy every 3rd tick for 24 ticks = 8 deploys; with a 27-tick collapse beat none of the retired seeds despawn during the window, so `ms.dying` reaches ~8 but **never exceeds** the cap — the trim loop is never taken. Mutant **M6** (delete the trim loop) therefore survives the whole base suite (20/20 green).
- **Deterministic repro:** mutation audit M6 (§3). **Closed** by new hardening test `test/mass-seed-adversarial.test.mjs → ADV-D5` (deploys EVERY tick for 24 ticks, peak `dying` = 8; asserts `dying.length <= DYING_CAP`). ADV-D5 passes on the real code and is the sole failure under M6, i.e. it kills the mutant.
- **Consequence:** latent only — the shipped code IS bounded; this is a test-coverage hole, not a runtime defect. **P2.** No code change required beyond landing ADV-D5.

## 3. Mutant matrix

Applied one at a time from a pristine copy; byte-exact restore verified with `git diff --stat` after each (all clean). Base suite = `npm run check:mass-seed` (20 tests).

| # | Mutation (`src/systems/massSeed.js`) | check:mass-seed | Result |
|---|---|---|---|
| M1 | skip `_cutSeedTethers` in `_beginCollapse` (`:482`) | RED (18 pass / 2 fail) | **caught** |
| M2 | `tetherEligible:true` at spawn (`:221`) | RED (19 / 1) | **caught** |
| M3 | delete `physicsStaticVersion++` invalidation (`:385`) | RED (17 / 3) | **caught** |
| M4 | `_finishCollapse` always skips the cooldown (`:518`) | RED (13 / 7) | **caught** |
| M5 | skip `_flushDying` in `_clearSeed` (`:567`) | RED (19 / 1) | **caught** |
| M6 | remove the `DYING_CAP` trim loop (`:421`) | **GREEN (20 / 0)** | **SURVIVED** → FINDING-02 (killed by new ADV-D5) |
| M7 | `_onSeedEntityLost` uses `cleared` not `destroyed` (`:529`) | RED (18 / 2) | **caught** |

6/7 caught by the base suite; the survivor is closed by the new adversarial suite.

## 4. Commands + exit codes

| Command | Exit | Detail |
|---|---|---|
| `npm run check:mass-seed` (base) | 0 | 20/20 pass |
| `npm run check:massline` | 0 | aggregate green (whip/impulse/47-A children OK) |
| `npm run check:physics-authority` | 0 | "Physics authority membrane checks OK" (see caveat §5) |
| `npm run check:sim:compare` | 0 | `deterministic:true`, `hashEqual:true`, `firstDivergentTick:null` (reload@600) |
| `node --test test/mass-seed-adversarial.test.mjs` | 0 | 20/20 pass (hardening) |
| `node --test test/mass-seed-findings.test.mjs` | 1 | 0/1 — INTENTIONAL; documents FINDING-01 |

**Gate note:** `test/mass-seed-findings.test.mjs` is **expected-RED (exit 1) by design** and must be EXCLUDED from any aggregate green gate (`npm run check`, a `test/*.test.mjs` glob) until FINDING-01 is fixed, so it is not misread as a regression. Consider a `.skip`/allowlist entry or leaving it unstaged until the fix lands.

End state: `git diff --stat` shows ZERO modified tracked files; `git status --short` shows only the new untracked files (`test/mass-seed-adversarial.test.mjs`, `test/mass-seed-findings.test.mjs`, `REPORT.md`). All mutants reverted byte-exact. Scratch harness lived outside the worktree (session scratchpad).

## 5. Judgment of the receipt's flagged seam (physics-authority intent)

> "Travel is a deterministic entity-space kinematic deployment while the physics owner synchronizes the ghost/fixed authored body. It never touches Rapier directly … judge this seam against the packet's physics-authority intent."

**Verdict: SANCTIONED.** The seam respects the membrane. Evidence chain:

1. **The seed is `dynamic:false` its entire life** (travel ghost + locked rock are both fixed bodies; `massSeed.js:201-207`, `:374-383`; asserted across all live phases by `ADV-A1`). For a fixed body, SG-02 treats `entity.pos/rot/vel` as **inputs** it reads to place the body (`_createRecord` `sg02DynamicBodyOwner.js:558-569`), never outputs it writes back from the solver. Therefore the direct writes `entity.pos.x/z`, `entity.vel.x/z = 0`, `entity.angVel = 0` at `_beginFrameLock` (`massSeed.js:346-351`) and the per-tick travel `entity.pos` recompute (`:277-284`) are **authoring a fixed body's pose**, not fighting the solver. `physics.integrate` adds `vel*dt` (`physics.js:396`) but the seed's `vel` is always 0, so there is no double-integration. massSeed never calls a Rapier API, never queues a physics command, and never touches `physicsAuthority.js`.

2. **`projectile` material truly yields zero solver contacts.** `CONTACT_MATERIALS` (`sg02DynamicBodyOwner.js:70-77`): `projectile: { ghost: true }` — "`ghost` colliders join no contact pairs at all" (`:66-68`). So the stale spawn-pose ghost body during travel cannot collide with anything in the Rapier world; damage still reaches the seed via the `projectile:hit` bus path (`physics.js:557-562`, `damage.js`), which is position-driven off `entity.pos`, not the ghost body. `rock` (`:72`, `ghost:false`) is the solid fixed anchor.

3. **`physicsStaticVersion++` is required and structurally sanctioned.** `syncFromEntityLayers` skips the ENTIRE static-rebuild block when `staticChanged` is false (`sg02DynamicBodyOwner.js:199-204`), so a material/revision flip alone would never be re-evaluated and the anchor would stay a ghost at the spawn pose. Bumping the version (`massSeed.js:385`) forces re-evaluation; `recordMatchesSpec` then sees the changed `revision`+`material` (`:1589-1597`) and rebuilds the fixed body at the CURRENT `entity.pos`. The identical idiom is the sanctioned invalidation `coreSystem.js` performs on physics-static add (`:262`) and remove (`:364`); massSeed's mid-life bump is the same mechanism, just triggered by an authored-spec change instead of a membership change. `ADV-A2` pins the ghost→rock→ghost version bumps; `ADV-A1/A3` pin that the seed only ever classifies as a physics **static**, never dynamic, under both the index and live SG-02.

4. **Far-from-origin is inherited, not special-cased.** The seed works purely in global coordinates; SG-02 rebases global→frame-local and `setFrameOrigin` reprojects ALL bodies incl. statics (`sg02DynamicBodyOwner.js:173`). So the seed is exactly as correct far from origin as an asteroid or station (`ADV-B1/B2`).

**Caveat (scoping, not a defect):** `npm run check:physics-authority` is a **unit test of `physicsAuthority.js`'s functions** (`scripts/check-physics-authority.mjs`) — it does NOT statically scan `massSeed.js` for direct Rapier writes. The membrane is not gate-enforced on this system; the judgment above rests on code reading + the new `ADV-A*` behavioral tests, not on that check. This is consistent with how the codebase treats the membrane (the writer classifier is a report, `report:physics-writers`, not a gate).

**One divergence worth a design note (not a defect):** in the LEGACY custom backend, `maskOf(massSeed)` = `MINE_COLLISION_CATEGORY` so ships never broadphase against the seed (`physics.js:882`), whereas in the LIVE SG-02 backend the locked `rock` body is a solid fixed collider a ship CAN strike like an asteroid. This matches the "solid fixed anchor" intent and is defensible, but the two backends model ship↔anchor solidity differently. Flagged for the design/visual lane, not a physics-authority breach.

## 6. What I could NOT test at this level (delegate to the browser/Electron lane)

These are the receipt's own `unproven_claims` and remain out of scope for a code+test review:

1. **Default-camera readability / visual quality** of the Mass Seed mesh + HUD pill + lock marker at real play zoom (the frame-device-not-orb silhouette, warning legibility without color).
2. **Useful player-controlled sling** — whether latching the anchor and orbit/release yields a satisfying, controllable direction change in a real traversal.
3. **Combat-opponent counterplay + cleanup presentation** in a live hostile encounter (destruction VFX/audio read, one-voice behavior of the collapse cues).
4. **Browser/Electron parity** and the integrated-tree `check:flight:clean` result.
5. **Live frame-rebase at true galactic distance** (≥8192 wu) crossing an actual `applyFrameOrigin` boundary during play — I proved the reproject seam in-harness, but not a real in-game traversal that trips the threshold with a live tether under load.
6. **FINDING-01 in-the-wild reachability weighting** — confirm how often a stray hit realistically lands inside the 0.45 s collapse beat, to prioritize the (P2) fix.

**Latent fragility behind F's HOLDS (name it, don't fix it):** `massSeed._tickSeed` gates the whole lifecycle on `state.mode !== 'flight'` **only** — it does NOT also check `player.flags.docked` (whereas `tetherGameplay` gates on both, `:93` and `:95`). This is safe *today* solely because docking forces `timeScale=0`, which suspends the entire sim so `_tickSeed` never runs while docked. A future "docked-but-live-sim" mode (a station view that keeps the world ticking) would tick the seed while docked and re-open exactly the orphan-sweep-reason race F otherwise rules out. Worth a one-line guard (`player.flags.docked`) if such a mode is ever added.

`PHYS_REVIEW_DONE`
