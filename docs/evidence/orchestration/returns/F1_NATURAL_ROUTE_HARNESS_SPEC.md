# F1 — Natural-route harness architecture spec

**Date:** 2026-07-17 · **Author:** Claude Fable (F1 packet) · **Consumers:** Codex W2 task 5 (builds it), tasks 6/11/14 (reuse it) · **Read set:** F1 packet, F0 §3 W2 + §5.1, NATURAL_WRECK_PATH, CONTEXT_BRIEF, `scripts/lib/professionalTravelPublicRoute.mjs`, `scripts/check-depth-program-r2-sweep.mjs`, `src/main.js` seed seams, `src/systems/scanner.js` intent seam.

**Decision in one line:** generalize the already-proven `professionalTravelPublicRoute.mjs` pattern (public inputs + observer-only instrumentation + fail-closed static source validator + required-marks evidence + browser/Electron split) into ONE shared core, `scripts/lib/naturalRoute.mjs`, where R1/R2/E1/SP1/GT1 become **route configs (data)**, not harnesses. Build once; five acceptance rows ride it.

---

## 1. Public-input vocabulary

Two tiers, two dialects of the same rule — *the harness may only do what a player's hands do; everything downstream must originate from registered systems*:

- **Tier B (browser/Electron, Playwright)** — real DOM input only: role-based button clicks (`New Game`, `Launch`, `Continue`, `Set Waypoint`, `Set Course & Jump`, claim-choice buttons), keyboard (`Space`, `Escape`, `Enter`, `Tab`, `KeyN`/`KeyM` map, `/` + typed text for map search, `KeyV` cruise, `F5` quicksave, the scan key), mouse move/click on `#gl-canvas`. Instrumentation is observe-only: `window.SF` reads and `bus.on` listeners (the travel route's `installTravelObservers` pattern).
- **Tier A (headless `createSimulation`)** — the sanctioned input surface is **exactly the intent fields `src/systems/input.js` writes** (e.g. `state.input.actions.scanPulse = true`; `scanner.js` consumes it and pulses from real `player.pos`). The driver never emits game events. `input.js` itself is untouched (F0 non-goal 2).

**Forbidden in both tiers** (fail-closed regex table, extending `validateTravelRouteSources`): harness `bus.emit` of any game event (rumor channels, `scan:pulse`, `salvage:completed`, `uniqueWreck:choose`, jump/sector/mission events); `player.pos` writes / teleport; `state.mode` / `world.currentSectorId` assignment; `simTime`/`tick` writes; `exactPos` appearing in harness code; `debugFlight`; `?debug=` flags. The existing R2 sweep violates most of these **by design** → it is hereby reclassified *supporting evidence*, never primary acceptance; it stays in the tree as the state-machine regression it is.

## 2. Seed policy

- **Transport.** Tier A: `createSimulation({ seed })` (exists). Tier B: **one sanctioned product delta** — `main.js` reads `?seed=NNN` at boot and folds it into the `game:new` opts (`resetRunState` already honors `opts.seed`, `src/main.js:465`). The param must be inert otherwise: world selection only, no unlocks, no debug branch. This is *choosing which deterministic galaxy to play*, not assistance, and the forbidden-pattern table carves out `?seed=` explicitly while keeping `?debug=` forbidden.
- **CI pair (2 seeds).** Two fixed, published seeds named in each route config. Sufficient **only** for per-merge regression of routes that have already passed full acceptance and whose route logic/config did not change.
- **Held-out set (≥5 seeds).** Kept **out** of route configs in one shared file (`scripts/lib/naturalRouteSeeds.json`, read at run time) so route logic cannot overfit a seed. Required for: first-time acceptance of any route, any golden re-pin touching a route, any edit to the driver or that route's config.
- A seed-set passes only if **every** seed passes; per-seed evidence is retained. GT1 carries a narrowed seed rule (§6).

## 3. Compression rules

- **Sim-tick integrity is the invariant (both tiers).** Every route declares its expected sim duration; evidence must show `ticks ≈ 60 × simSeconds`. No `simTime` writes, no authored-timer shortening, no phase-skip via events, no config edits at run time.
- **Wall-clock speed is a tier property, not compression.** Tier A may run faster than real time because it steps the fixed 60 Hz loop at full fidelity — every tick executes. Tier B runs at wall clock by nature.
- **Forbidden and unlabellable:** teleporting past travel legs, exact-position scans, injected phase transitions, timer edits.
- **Allowed only with `"supporting": true`** (never primary acceptance): Tier A runs standing in for a class whose acceptance requires Tier B; the legacy R2 sweep; any run with a waived step.
- **SP1 ruling:** "human-duration, no time compression" (F0 task 11) = full tick ledger at authored durations on the seed set (Tier A), **plus** at least one Tier B wall-clock run of a representative route including the investigation route. Duration logs are part of the evidence, not a side file.

## 4. Evidence JSON shape

Schema `spaceface.naturalRoute.v1`. One JSON per (route, tier, seed) at `.devshots/depth-program/routes/<routeId>/<tier>-<seed>.json`, plus PNGs for Tier B. `.devshots` is machine output; promotion into `docs/evidence/**` manifests stays **Grok-only** (F0 §9 single-writer map).

```json
{
  "schema": "spaceface.naturalRoute.v1",
  "routeId": "r1-d10-choir-tender",
  "contentClass": "wreck",            // wreck | encounter | setpiece | goldenthread
  "tier": "B",                        // A | B | B-electron
  "seed": 48201,
  "supporting": false,
  "rev": { "commit": "<sha>", "dirty": false },
  "pass": true,
  "failures": [],
  "failureClass": null,               // on red: REAL | STALE | HARNESS (F0 §2) before retry
  "marks": [ { "name": "scan-hardened", "tick": 41230, "simTime": 687.2, "at": "ISO", "detail": {} } ],
  "events": [ { "event": "scan:pulse", "tick": 41229, "payload": {} } ],
  "snapshots": { "start": {}, "end": {} },
  "durations": { "simSeconds": 0, "ticks": 0, "wallMs": 0 },
  "naturalness": { "validatorPass": true, "failures": [] },
  "carrier": { "slot": "D10", "channel": "game:started news" },
  "screenshots": [ "01-rumor-surfaced.png" ]
}
```

`marks` is the required-checkpoint spine (the `TRAVEL_REQUIRED_MARKS` idea); each content class defines its required mark list (§6). `naturalness` embeds the static-validator verdict so a green run *proves* it was uninjected, fail-closed.

## 5. Browser vs Electron switch

Same convention as professional-travel: one shared core + thin entrypoints (`check-…-browser.mjs` / `check-…-electron.mjs`, or one entrypoint honoring `NATURAL_ROUTE_TARGET=electron`). **Browser is the default and the primary acceptance environment** for every content class; Electron runs are additive coverage except where a gate is explicitly Electron-scoped (M2 seamless-world). The known Playwright-websocket reset mid-Electron run (the M2 red) is pre-classified HARNESS: document with evidence, timebox (F0 task 13), never let it block a browser-green primary acceptance.

## 6. Pass/fail semantics per content class

| Class | Required marks (in order) | Primary tier | Notes |
|---|---|---|---|
| **wreck** (R1/R2) | carrier-surfaced → bearing-recorded → region-reached → scan-hardened → wreck-materialized → decision-opened → claim-resolved → reward-durable | Tier A for the 12-wreck sweep; Tier B for the D10 UI e2e | Carrier must be the native production carrier per NATURAL_WRECK_PATH's slot table (D10 = `game:started` news, D11 = Helios bar, …). Bearing starts fuzzy (`radius > 0`, `coordSpace global_v1`). Scan-hardened requires the pulse to originate from the scanner system at real `player.pos` with the player inside scan range (≤1200 wu) — flight distance ledger in evidence. Any injected event = fail. |
| **encounter** (E1) | sector-entered → encounter-spawned → encounter-reached → outcome-observed | Tier A seed set; ≥1 Tier B | `encounter-spawned` must carry an encounterDirector receipt (native trigger), never a harness spawn. Uncompressed spawn timing; if natural density can't produce the encounter in a bounded soak, that is a **REAL density gap** fed to F0 task 8, not a harness waiver. The 2 banked follow-ons carry `"stub": true` and never count toward pass. |
| **setpiece** (SP1) | route-armed → phases per authored set-piece → outcome (success / failure / retry each its own route) → post-state-durable | Tier A seed set + ≥1 Tier B wall-clock incl. investigation | Full tick ledger at authored durations (§3). The investigation route must complete to its destStation — the standing regression proof for the fixed `destStationId` REAL bug. |
| **goldenthread** (GT1) | New Game → Candle Fleet → ticker → bearing → unique wreck → Band, one continuous run | Tier B only | No reboot between beats; screenshot at every beat. Canonical seed + ≥1 held-out alternate (proves the first hour isn't seed-overfit). Runs **dead last** on the integrated tree — captures are valid only at the revision they ship at (F0 §9). |

**Failure handling (all classes):** the driver stamps `error.routePhase` + partial marks on any throw (travel-route pattern); every red receives an F0 §2 classification in `failureClass` **before** any retry or fix; unclassified reds do not merge.

## 7. Reuse API shape (pseudo)

```js
// scripts/lib/naturalRoute.mjs — generalizes professionalTravelPublicRoute.mjs
export function defineRoute({ id, contentClass, requiredMarks, ciSeeds, steps })
//   steps: [{ goal, drive(io), until(observe), timeoutMs }]   // declarative; driver is the only executor

export async function runRoute(route, { tier, seed, page, outputDir })  // → evidence object (§4)

export const io = {        // Tier-B primitives via Playwright; Tier-A mirrors via state.input.actions
  boot, dismissSplash, newGame(seed), launch,
  openMap, searchSelect(query), setWaypoint, setCourseJump,
  approach(targetKind), scanHere, dockPrompt, salvage, chooseClaim(choiceId),
  quickSave, titleContinue,
}
export const observe = { snapshot(), events(names), mark(name, detail), nearest(kind) }

export function validateNaturalRouteSources(sources)   // fail-closed forbidden/required regex tables (§1)
export function writeEvidence(result, devshotsPath)
```

Route configs are data — one small file per wreck/encounter/set-piece under `scripts/routes/` — so adding wreck #13 or encounter #9 is a config, not code. Codex C1 builds the driver + validator + D10 self-test; C2 adds route configs on top.

## 8. D10 anchors the first hour

D10 (Choir-Tender) is the teaching path proven in NATURAL_WRECK_PATH: New Game Helios → `game:started` auto-rumor → map amber SEARCH AREA → 700–920 wu flight (no jump required) → player-origin scan within 1200 → mining salvage → claim UI. Rulings:

1. The D10 Tier B route is the **driver's self-test** and the reference config every other route copies.
2. The CI 2-seed gate **always includes D10** — if the first hour's discovery loop breaks, CI goes red before anything else.
3. GT1's golden thread **opens with the D10 sequence verbatim**, so the teaching path and the acceptance harness pin the same experience — one truth, two gates.
4. Any change that breaks D10's natural path is classified **REAL by default** (it breaks the first hour a player actually lives), not HARNESS.

---

## Charter return block

```
LIVE AUDIT: read-only — F1 packet, F0 §3/§5.1, NATURAL_WRECK_PATH, CONTEXT_BRIEF, professionalTravelPublicRoute.mjs, r2-sweep, main.js seed seams (boot Date.now seed; resetRunState opts.seed), scanner.js input.actions.scanPulse intent seam.
DIFF SUMMARY: one new file — docs/evidence/orchestration/returns/F1_NATURAL_ROUTE_HARNESS_SPEC.md. No code, no design/program edits.
GATES: none run (architecture packet; F1 forbids implementation).
FAILURE CLASS: N/A.
PLAN DRIFT: none vs F0 §5.1; two declared deltas for Codex C1 — (a) the ?seed= boot param in main.js as the single sanctioned Tier-B seed transport, (b) R2 sweep reclassified supporting-only.
RESIDUAL: Codex C1 implements scripts/lib/naturalRoute.mjs + validator + D10 self-test per this contract; Grok confirms npm script names (check:depth-program:r1 etc.) at dispatch; held-out seed file is authored by Grok on the spine so builders never see the acceptance seeds pre-run.
```
