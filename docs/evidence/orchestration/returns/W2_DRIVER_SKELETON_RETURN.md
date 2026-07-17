# W2 — Natural-route driver skeleton return

**Date:** 2026-07-17 · **Owner:** Grok (W2 driver skeleton slice) · **Spec:** `docs/evidence/orchestration/returns/F1_NATURAL_ROUTE_HARNESS_SPEC.md` · **Upstream:** F0 §3 W2 task 5 / F1 residual for Codex C1

## 1) Scope of this slice

Implement the **F1 harness skeleton only** — shared core APIs and seed/mark utilities so later D10 / R1 / R2 / E1 / SP1 / GT1 work can call one driver. Not a full unassisted acceptance pass.

| In | Out |
|---|---|
| `scripts/lib/naturalRoute.mjs` (defineRoute / runRoute / io / observe / validators / evidence) | Full Tier-B Playwright driving |
| `scripts/lib/naturalRouteSeeds.json` (held-out ≥5 seeds) | Route configs under `scripts/routes/` |
| This return note | `?seed=` product delta in `main.js` |
| Keep `check:depth-program:r2:natural-d10` green | Replacing C1 D10 injection harness as primary acceptance |

## 2) Files landed

| Path | Role |
|---|---|
| `scripts/lib/naturalRoute.mjs` | Shared core matching F1 §7 pseudo-API |
| `scripts/lib/naturalRouteSeeds.json` | Held-out seed set (F1 §2); not embedded in route configs |
| `docs/evidence/orchestration/returns/W2_DRIVER_SKELETON_RETURN.md` | This return |

**D10 harness:** left as-is (`scripts/check-depth-program-r2-natural-d10.mjs`). It remains the C1 multi-seed state-machine check (supporting evidence under F1’s reclassification of injection sweeps). The skeleton exports D10 anchors (`D10_ROUTE_ID`, `D10_CI_SEEDS`, `D10_CARRIER`, `defineD10ReferenceRoute`) for the future natural driver self-test without changing C1 behavior.

## 3) Public API (F1 §7)

```js
import {
  defineRoute,
  runRoute,
  io,                    // unbound stubs; session-bound via createIo / runRoute
  observe,               // unbound stubs; session-bound via createObserve / runRoute
  validateNaturalRouteSources,
  validateMarkSequence,
  writeEvidence,
  createEvidenceShell,
  loadHeldOutSeeds,
  resolveSeedSet,        // 'ci' | 'held-out' | 'full'
  REQUIRED_MARKS_BY_CLASS,
  D10_CI_SEEDS,
  defineD10ReferenceRoute,
  NATURAL_ROUTE_SCHEMA,  // spaceface.naturalRoute.v1
} from '../scripts/lib/naturalRoute.mjs';
```

### Live now

- **`defineRoute({ id, contentClass, requiredMarks, ciSeeds, steps })`** — freezes route data; requires ≥2 `ciSeeds`; defaults marks from content class (F1 §6).
- **`runRoute(route, { tier, seed, page, outputDir, sources, hooks, ioFactory, … })`** — builds F1 §4 evidence, runs declarative `steps: [{ goal, drive, until, timeoutMs }]`, validates mark order when steps are present, stamps `error.routePhase` + partial marks on throw, optional `writeEvidence`.
- **`validateNaturalRouteSources(sources)`** — fail-closed forbidden table (bus.emit injection, teleport / `exactPos`, mode/sector/simTime writes, `debugFlight`, `?debug=`) on harness entrypoints; required API presence on combined sources. `?seed=` is intentionally not forbidden (Tier-B seed transport per F1).
- **`validateMarkSequence(marks, requiredMarks)`** — ordered coverage; extras allowed.
- **Seed helpers** — `loadHeldOutSeeds()`, `resolveSeedSet(route, mode)`.
- **Evidence** — `createEvidenceShell`, `writeEvidence` → `.devshots/depth-program/routes/<routeId>/<tier>-<seed>.json`.

### Stub (later D10 / driver slices)

- **`io.*`** Tier-B Playwright primitives and Tier-A `state.input.actions` mirrors (`boot`, `newGame`, `launch`, `openMap`, `scanHere`, `salvage`, `chooseClaim`, …). Unbound and session-bound forms throw `NaturalRouteStubError` until wired.
- **Full content-class pass semantics** (carrier native receipts, scan-range flight ledger, encounterDirector receipt, GT1 continuous run) — skeleton only records marks/events when steps/hooks provide them.
- **Browser/Electron entrypoints** (`check-…-browser.mjs` / `NATURAL_ROUTE_TARGET`) — not added in this slice.

## 4) Seed policy alignment

| Set | Location | Values (this spine) |
|---|---|---|
| CI pair (per route) | `defineRoute.ciSeeds` | D10 reference: `48200`, `48201` (`D10_CI_SEEDS`) |
| Held-out (≥5) | `scripts/lib/naturalRouteSeeds.json` | `91011`, `91027`, `91043`, `91059`, `91071` |
| C1 D10 multi-seed | unchanged in C1 script | `48200`–`48204` (supporting harness; not primary F1 acceptance) |

Held-out seeds stay out of route configs so route logic cannot overfit them (F1 §2).

## 5) Content-class mark spines (defaults)

Exported as `REQUIRED_MARKS_BY_CLASS`:

| Class | Marks (order) |
|---|---|
| wreck | carrier-surfaced → bearing-recorded → region-reached → scan-hardened → wreck-materialized → decision-opened → claim-resolved → reward-durable |
| encounter | sector-entered → encounter-spawned → encounter-reached → outcome-observed |
| setpiece | route-armed → outcome → post-state-durable *(intermediate phases authored per route)* |
| goldenthread | new-game → candle-fleet → ticker → bearing → unique-wreck → band |

## 6) Verification

```text
# Skeleton self-check (optional direct run)
node scripts/lib/naturalRoute.mjs

# Existing C1 D10 gate — must stay green
npm run check:depth-program:r2:natural-d10
```

No new npm script was added in this slice (F1 residual still expects later `check:depth-program:r1` full gate once the driver is wired).

## 7) Fence / non-goals

- No assets, no `input.js`, no `main.js` `?seed=` wiring yet.
- No edits to design/program ownership docs.
- C1 D10 remains injection-based supporting evidence; it is **not** run through `validateNaturalRouteSources` as a primary green (it would correctly fail closed).
- R2 sweep stays supporting-only per F1 §1.

## 8) Residual for full W2 task 5

1. Wire Tier-A drive via `state.input.actions` only (scanPulse etc.); never harness `bus.emit` of game events.
2. Wire Tier-B `io.*` from the professional-travel public-route Playwright patterns.
3. D10 natural self-test route config + `npm run check:depth-program:r1` (CI 2-seed always includes D10).
4. Sanctioned `?seed=` boot param in `main.js` (F1 declared product delta).
5. Route configs under `scripts/routes/` as pure data for the 12-wreck / 8-encounter / SP1 / GT1 matrix.

## Charter return block

```
LIVE AUDIT: F1_NATURAL_ROUTE_HARNESS_SPEC, C1_NATURAL_D10_RETURN, professionalTravelPublicRoute.mjs, check-depth-program-r2-natural-d10.mjs, F0 W2 task 5.
DIFF SUMMARY: scripts/lib/naturalRoute.mjs (new), scripts/lib/naturalRouteSeeds.json (new), docs/evidence/orchestration/returns/W2_DRIVER_SKELETON_RETURN.md (new). D10 harness intentionally unchanged.
GATES: node scripts/lib/naturalRoute.mjs (skeleton self-test); npm run check:depth-program:r2:natural-d10 (must remain green).
FAILURE CLASS: N/A (skeleton; no content-route red).
PLAN DRIFT: none vs F1 — this is the skeleton residual, not full driver acceptance.
RESIDUAL: full io wiring + D10 natural self-test + r1 npm gate + main.js ?seed= (see §8).
```
