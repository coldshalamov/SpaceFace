# G — Natural-route shared driver return

**Date:** 2026-07-17 · **Owner:** Grok (SPINE `SpaceFace-depth-actualization` / `grok/depth-player-route-actualization`) · **Spec:** `docs/evidence/orchestration/returns/F1_NATURAL_ROUTE_HARNESS_SPEC.md` · **Upstream:** W2 skeleton (`W2_DRIVER_SKELETON_RETURN.md`), C1 D10 (`C1_NATURAL_D10_RETURN.md`)

## 1) Scope

Land the shared Tier-A driver surface on top of the F1/W2 skeleton, refactor the C1 D10 multi-seed check onto that driver without losing green, and scaffold an R2 multi-seed skeleton.

| In | Out |
|---|---|
| `scripts/lib/naturalRoute.mjs` Tier-A: boot / seed / step / observe / multi-seed / `input.actions` | Full uninjected primary D10 acceptance |
| D10 check refactored onto driver (`supporting: true`) | Tier-B Playwright io |
| R2 natural multi-seed skeleton | `main.js` `?seed=` product delta |
| This return note | assets / thrusters / materials |

## 2) Files

| Path | Role |
|---|---|
| `scripts/lib/naturalRoute.mjs` | Shared core (extended): `createTierASession`, `runMultiSeed`, `ciSeedsFor`, live Tier-A `io.boot` / `io.scanHere` |
| `scripts/lib/naturalRouteSeeds.json` | Held-out seeds (unchanged values) |
| `scripts/check-depth-program-r2-natural-d10.mjs` | Refactored onto driver multi-seed + Tier-A session |
| `scripts/check-depth-program-r2-natural-multi.mjs` | **New** partial R2 multi-seed skeleton |
| `docs/evidence/orchestration/returns/G_NATURAL_DRIVER_RETURN.md` | This return |

## 3) Driver API (what is live)

```js
import {
  // Route data
  defineRoute, defineD10ReferenceRoute, runRoute,
  // Tier A
  createTierASession, runMultiSeed, ciSeedsFor, SIM_DT,
  // Naturalness + marks + evidence
  validateNaturalRouteSources, validateMarkSequence,
  createEvidenceShell, writeEvidence,
  // Seeds
  loadHeldOutSeeds, resolveSeedSet, D10_CI_SEEDS, D10_CARRIER, D10_ROUTE_ID,
  REQUIRED_MARKS_BY_CLASS, NATURAL_ROUTE_SCHEMA,
} from './lib/naturalRoute.mjs';
```

### `createTierASession({ seed, systems, observeEvents, eventFilter })`

- Boots `createSimulation({ seed, systems })` — full-fidelity fixed-step host.
- Installs **observe-only** `bus.on` listeners (payloads copied into `session.events`).
- `step` / `runTicks` / `runTicksUntil` — every tick executes (`SIM_DT = 1/60`); no `simTime` writes inside the driver.
- `setAction(name, value)` — only `state.input.actions.*` (F1 Tier-A public-input surface).
- `scanHere()` — sets `scanPulse` then steps once so the scanner system emits `scan:pulse` from real `player.pos` when systems include scanner.
- **No** `window.SF` writes; **no** harness `bus.emit` of game events inside the driver.
- `dispose()` clears listeners + sim bus.

### `runMultiSeed({ seeds, runSeed, label })`

- Sequential per-seed isolation.
- Pass only if **every** seed reports `pass: true` or `result: 'passed'`.
- Retains per-seed rows for evidence.

### `runRoute` / `createIo` Tier-A hooks

- `io.boot` on tier `A` creates a Tier-A session from hooks/opts.
- `io.scanHere` delegates to `session.tierA.scanHere` when live.
- Tier-B Playwright primitives remain stubs (`NaturalRouteStubError`).
- Evidence merges observed bus events and tick/sim durations from the Tier-A session.

## 4) D10 refactor (safe, green)

`scripts/check-depth-program-r2-natural-d10.mjs` now:

1. Boots via `createTierASession` (systems: `uniqueWrecks`, `cargo`, `ships`).
2. Observes uniqueWreck events through the driver (no hand-rolled bus bookkeeping).
3. Runs seeds through `runMultiSeed` (`48200`–`48204`, base from `D10_CI_SEEDS[0]`).
4. Anchors target/sector/carrier from `D10_CARRIER` / `D10_ROUTE_ID`.
5. Emits report with `schema: spaceface.naturalRoute.v1`, `supporting: true`, `driver` path.

**Still supporting (F1 §1/§3):** controlled position approach, radiation-window `simTime` probe, and bus-driven `scan:pulse` / `salvage:completed` / `uniqueWreck:choose` for state-machine regression. This is **not** primary natural acceptance; the source validator would correctly fail closed if applied to the harness entrypoint as primary.

**Primary residual:** uninjected D10 self-test using flight distance + `session.scanHere()` only, then claim via public input surface.

## 5) R2 multi-seed skeleton

`scripts/check-depth-program-r2-natural-multi.mjs`:

- Always pins D10 first in `WRECK_SLOTS`.
- Seed mode via `NATURAL_ROUTE_SEED_MODE=ci|held-out|full` (default `ci` → `D10_CI_SEEDS`).
- Structural soak only (`runTicks` N); **no** uniqueWreck/scan injects for content marks.
- Writes per-seed evidence under `.devshots/depth-program/routes/<routeId>/A-<seed>.json`.
- Aggregate: `.devshots/depth-program/r2-natural-multi-skeleton.json`.
- Not added to package.json acceptance chain (smoke-only until route configs + uninjected steps land).

## 6) Verification (this slice)

```text
node scripts/lib/naturalRoute.mjs
# → naturalRoute driver OK; held-out seeds=5; multi=2; marks=alpha→beta
# exit 0

npm run check:depth-program:r2:natural-d10
# → R2 natural D10 harness OK: 5 seeds passed (driver multi-seed)
# → Evidence: .devshots/depth-program/r2-natural-d10-headless.json
# exit 0

node scripts/check-depth-program-r2-natural-multi.mjs
# → R2 natural multi skeleton OK: 2 seeds (mode=ci)
# exit 0
```

## 7) Fence / non-goals

- No assets, thrusters, materials, `input.js`, or `main.js` edits.
- No commit (orchestration instruction).
- No design/program ownership rewrites.
- R2 sweep (`check-depth-program-r2-sweep.mjs`) remains supporting-only per F1.
- Concurrent unrelated tree work left untouched.

## 8) Residual

1. Uninjected primary D10 route config + mark spine green on CI pair (and held-out for first acceptance).
2. Wire Tier-B `io.*` from professional-travel Playwright patterns; browser default.
3. `?seed=` boot param in `main.js` (F1 declared product delta).
4. `scripts/routes/*` pure data configs for 12 wrecks / encounters / SP1 / GT1.
5. npm gates: `check:depth-program:r1` full primary; promote multi off supporting when naturalness validator passes.

## Charter return block

```
LIVE AUDIT: F1_NATURAL_ROUTE_HARNESS_SPEC, W2_DRIVER_SKELETON_RETURN, C1_NATURAL_D10_RETURN, professionalTravelPublicRoute.mjs, check-depth-program-r2-natural-d10.mjs, src/core/sim.js, scanner scanPulse intent seam.
DIFF SUMMARY: scripts/lib/naturalRoute.mjs (Tier-A session + multi-seed + io.boot/scanHere); scripts/check-depth-program-r2-natural-d10.mjs (driver refactor, supporting); scripts/check-depth-program-r2-natural-multi.mjs (new skeleton); docs/evidence/orchestration/returns/G_NATURAL_DRIVER_RETURN.md (new).
GATES: node scripts/lib/naturalRoute.mjs → exit 0; npm run check:depth-program:r2:natural-d10 → exit 0; node scripts/check-depth-program-r2-natural-multi.mjs → exit 0.
FAILURE CLASS: N/A on green supporting D10; primary uninjected acceptance still residual.
PLAN DRIFT: none vs F1 — driver extraction + supporting D10 refactor; primary natural path not claimed green.
RESIDUAL: uninjected D10 primary, Tier-B io, ?seed= boot, scripts/routes configs, r1 npm gate (see §8).
```
