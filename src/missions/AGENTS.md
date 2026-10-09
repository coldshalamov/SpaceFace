# src/missions/

Helpers for registered `src/systems/missions.js`. Not a tick. Heist runtime is called only from missions, after law, physics, tether, and facilities, so tick T's candidates exist before `stepArbiter`.

- `heistArbiter.js` is pure: no bus, economy, heat, or save key. Submit every report for tick T, then step once. Stamp `causalTick` from the causing event. The earliest terminal fact wins; a possession report never outranks a terminal.
- Do not pay, confiscate, or write heat here. Missions emits `economy:grantCredits` and `faction:repDelta`. Do not also rep-delta the offering faction.
- `poiCausalOffers.js` returns board rows only. `capitalBossSpawn.js` fills a new spec and a mission-owned ledger. It does not move a live actor.

## src/law

`authorityResponse.js` is timing, ranking, and arrival geometry for `lawSecurity`. It does not spawn, write heat, or open incidents. No separate note.

## src/physicalCargo

`breakaway/` is the capture fork plus the fail-closed receiver gate. `heistFacilities` calls `stepCapture` after physics. `deliveryQuote` grants nothing. A bare `already_committed` string is not a commit; require a matching handoff and, on replay, a matching durable record.
