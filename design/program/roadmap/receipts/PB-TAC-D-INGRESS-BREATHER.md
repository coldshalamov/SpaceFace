# PB-TAC-D — reinforcement ingress lanes + safety-derived breather

Row: `build_map.md` #90 (SF-053 + SF-054).

## What landed

`src/systems/aiEncounter.js`, `src/ai/perception.js`, `src/ai/director.js`,
`src/systems/tacticalAI.js`, `src/systems/encounterDirector.js`, `src/ai/combatDoctrine.js`:

- **SF-053 ingress lanes** — `_scheduleReinforcement` stamps each squad with a deterministic
  `unitHash(seed, seq)` ingress bearing, a sector id, an arrival deadline (600 ticks), and a
  schedule-time `spawnBudget` reservation (partial grants queue the remainder unreserved).
  `resolveIngressPosition` fans members through a wedge around that bearing — lateral
  `laneSpacingWu` spread plus deterministic angle/radius retries — hard-gated on playable bounds
  (margin 90), player clearance (420 WU), and collision against `max(entity.radius,
  entity.data.dockRadius) + 40` via `queryRadius`. The moving pilot's escape cone is a soft
  preference: pass 0 skips in-cone candidates, pass 1 accepts them rather than spawn inside the
  pocket. Placement re-resolves at materialization against the live world; a saturated cap queues
  unreserved members for spawn-time admission; arrival deadline cancels with
  `ai:reinforcementCancelled` (`placement_unreachable` / `budget_unavailable`). Real sector
  departure cancels pre-due or post-due (`sector_departure`); corridor hops that share the bound
  keep the call. Arrivals spawn nose-in flying `approachSpeedWu` toward the anchor — a flight-in,
  not a pop-in.
- **Caller honesty** — authored callers only announce and latch when the package id resolves and
  the run isn't a survival-gated budget context; callerless (director) calls emit the inbound
  alert without inventing a speaker.
- **Failure accounting** — per-entry work extracted to `_materializePending` under a catch-all:
  any throw (spec build, spawn, latch) or a refused entity produces exactly one recorded
  cancellation and releases whatever the member actually holds — schedule-reserved or
  materialization-claimed (`reservedBudget` is now set on the fallback claim, closing the leak
  where an unflagged slot survived `cancelReinforcement`'s release gate). The `finally` commits
  `keep`, so a catastrophic tick can't re-spawn processed members.
- **SF-054 actionable opposition** — `aggregatePerceivedTelemetry` now publishes
  `actionableThreat`/`actionableContacts`: proximity ramp 650→1700 WU on hostile contacts, with a
  prosecution floor (self `activity.targetId` + attack_run/reposition kinds) that keeps a chased
  target actionable at any range. Missing position data fails safe as distance 0 — an
  unlocalized hostile can never read as "far away".
- **Breather machine** — `EncounterDirector` arms only after `breatherArmTicks` (120) of
  sustained `actionableThreat ≤ 0.1`, exits on `≥ 0.3` (hysteresis band, no flicker), on a
  committed inbound squad (`authored.pendingReinforcements` plumbed from
  `tacticalAI` → `committedInbound`, plus a 210-tick post-issue grace), or at max hold (720).
  Refractory cooldown (360) gates re-arm; while active, pressure clamps to
  `breatherTargetCeiling` 0.22 and a genuine breather dissolves `BUILD → RESPITE`. Directors with
  no actionability feed degrade to the legacy `visibleThreat`/`hostileContacts` fields.
- **Adjacent defects fixed inline** — `encounterDirector` accumulator gate starved the first
  rhythm publish when `_lastUpdateNow` was stamped at init (`sessionRhythm != null` guard);
  `newGame()` now clears `publishedSessionRhythmPhase` so a new run can't inherit the previous
  session's phase; interceptor `breakaway` gained a bounded `beginReform` advance so a repaired
  disable-target releases the hull back into its cycle instead of parking on a stale egress.

## Tests

- `test/pb-tac-d-ingress-breather.test.mjs` — 21 tests: shared lane inbound + pocket clearance,
  schedule-time inbound alert, bound-edge containment, arrival re-resolution after the world
  moved, sector-departure cancel + slot return, corridor-hop survival, deadline cancel,
  saturated-cap queue-and-wait + blocked-caller honesty, spawn-throw tail drain,
  materialization-claim release, never-freeing-cap deadline, station `dockRadius` footprint,
  fixed-seed determinism, actionable distance/prosecution/unlocalized fail-safe, breather arm /
  clamp / threat-exit / hysteresis / cooldown re-arm / max-hold / inbound-blocking /
  build→respite / legacy fallback.
- `test/combat-doctrines.test.mjs` — interceptor disabled-hold stays `breakaway` across 600
  ticks, then releases to `ingress` on repair (real `faction_pitborn` disable-and-run profile).
- `test/ai-perception.review.test.mjs` — telemetry shape re-pinned with the actionable fields.

Adjacent battery 176/176: perception review, session rhythm (PQ-149.00), quiet-latch,
reinforcement lanes, doctrines, fire-lead, fire phases, doctrine distinct, shipDecision, maneuver,
engagement authority, behavior stability, difficulty director, bark director, ambush director,
doctrine staging, E1 dispatch, E6 shape budget, admission/authored budgets, K1
tactical/runtime/fulfillment.

## Deferred boundaries (logged, not blockers)

- The positionless-contact fail-safe (missing pos → distance 0) is defense-in-depth: production
  producers coerce positions before aggregation, so it guards the exported contract rather than a
  reachable live path.
- `reinforcementAbandoned` uses a hard-radius anchor test — deliberately tolerant so continuous
  corridor handoffs keep their inbound lane; a sector edge-case that relocates the anchor inside
  the new bound would keep the call.
- Malformed saves that duplicate pending entries could double-cancel; bounded by the history cap
  and unreachable through the normal save path (the queue is transient, rebuilt empty on load).
