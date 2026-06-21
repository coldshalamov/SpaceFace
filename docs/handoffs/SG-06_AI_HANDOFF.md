# SG-06 handoff — layered tactical AI, squad logic, and encounter director

**Job:** SG-06  
**Patch base inspected:** `master` on 2026-06-21  
**Implementation status:** five-layer AI stack, canonical SG-03 adapter, explainability trace, inspection endpoint, clean-room ledger, production-shaped sensor/roster/maneuver ports, and 100-seed contract suite complete. Production registration remains hard-gated on live parity evidence in the real registry slot.

## Dependency gate

SG-03 is integrated on the inspected `master`. The canonical combat runtime lives under `src/combat/`, and `src/data/combatDefs.js` owns the authored `ActionDef` records. `createSG03ActionPort(ctx)` consumes those definitions and submits AI requests through `kernel.actions.requestAction(...)` with `source.kind = 'ai'`. There is no AI-only damage, cooldown, heat, capacitor, subsystem, attachment, or cancellation path.

SG-02 is integrated on `master` as the explicit `rapier-dynamic` backend. `src/systems/aiPorts.js` now installs production-shaped `helpers.aiSensors`, `helpers.aiRoster`, and `helpers.aiManeuver` ports. The maneuver port fails closed until `rapier-dynamic` is selected and SG-02 readiness telemetry is present, then compiles normalized SG-06 local force/yaw requests into `writePhysicsControl(...)` for the SG-02 owner to consume. SG-06 still does not register itself in the production registry, does not write legacy flight intent, and does not mutate velocity or transforms.

The SG-02 foundation gate `npm run check:sg02:tether-break` proves SG-03 semantic Massline state can receive SG-02 threshold tension/impulse telemetry, break with reason `threshold`, emit the break trace, and remove the physical rope. SG-06 still has to prove tacticalAI can trigger that path from the real registry slot.

## Delivered files

| Path | Responsibility |
|---|---|
| `src/ai/contracts.js` | Versioned sensor, action, trace, squad, and physical maneuver contracts plus deterministic math helpers. |
| `src/ai/perception.js` | Sensor-frame normalization and confidence-decaying contact memory. Unknown/hidden fields are discarded. |
| `src/ai/director.js` | Pressure, escalation, respite, reinforcement, retreat, and narrative-beat timing inside an authored threat envelope. |
| `src/ai/squad.js` | Stable roles, formations, focus target, specialist objectives, counter-tether coordination, and explicit formation breaks. |
| `src/ai/shipDecision.js` | Utility selection over canonical `ActionDef` views and interrupt-aware action execution. |
| `src/ai/maneuver.js` | Action intent to trajectory and normalized local-force/yaw requests, with obstacle avoidance, formation recovery, and deadlock recovery. |
| `src/ai/sg03ActionPort.js` | Live adapter over SG-03's catalog, action queue, capabilities, costs, cooldowns, targets, and cancel windows. |
| `src/ai/trace.js` | Deterministic bounded explainability trace for perception and all five decision layers. |
| `src/ai/stack.js` | Ordered five-layer host and roster lifecycle. |
| `src/ai/inspection.js` | Transport-neutral `ai.contract`, `ai.inspect`, and `ai.trace` endpoint. |
| `src/systems/aiPorts.js` | Production provider for SG-06 sensor frames, stable tactical rosters, and SG-02-backed maneuver requests. |
| `src/systems/tacticalAI.js` | Fail-closed, lazy-binding simulation-system adapter for the future production registry. |
| `scripts/check-sg06-production-ports.mjs` | Production-port gate for whitelist sensors, roster stability, hidden-state exclusion, and SG-02 maneuver consumption. |
| `scripts/check-sg06-registry-init.mjs` | Lazy registry-slot init gate proving ports can install after tacticalAI init. |
| `scripts/check-sg06-ai.mjs` | Canonical-SG-03, 100-seed deterministic acceptance harness. |
| `docs/Spec/SG-06_ACCEPTANCE.json` | Checked-in evidence from the 100-seed run. |
| `third_party/reference-ledger-sg06.yml` | Clean-room reference and extracted-law ledger. |

## Runtime order

The stack executes in this order on one authoritative tick:

1. **Perception boundary:** obtain the current sensor frame and update decaying memory. No entity store or player object enters SG-06.
2. **Encounter director:** aggregate only perceived telemetry and choose pressure/phase/intervention within the authored envelope.
3. **Squad commander:** preserve roles, select tactic/focus/objectives, calculate formation slots, and issue explicit break reasons.
4. **Ship utility + behavior:** score only canonical SG-03 action definitions, then request/observe/cancel through the same action service used by the player.
5. **Maneuver planner:** convert action and formation intent into a predicted trajectory plus normalized physical thruster request for SG-02.

## Required ports

### Sensors

```js
helpers.aiSensors.frameFor(entityId, tick) -> SensorFrame
```

Accepted shape:

```js
{
  tick,
  self: {
    id, team,
    pos: { x, z }, vel: { x, z }, rot, radius,
    hullFraction, energyFraction, heatFraction,
    disabled, tethered,
    capabilities: string[],
    subsystemFractions: { [subsystemId]: number }
  },
  contacts: [{
    id, kind, team, classification,
    pos: { x, z }, vel: { x, z }, radius,
    confidence, threat,
    targetId, ownerId, attachmentId,
    sourceSocketId, targetSocketId,
    exposed, tethered, disabled, ownedBySelf,
    objectiveValue, massClass,
    tags: string[]
  }],
  events: [{ type, sourceId, targetId, magnitude, tags }]
}
```

The normalizer constructs a fresh immutable frame from this whitelist. Extra fields—including hidden player state—are not retained. Sensor range, occlusion, classification, noise, tether visibility, and subsystem-caused sensor degradation remain sensor-system responsibilities.

### Squad roster

```js
helpers.aiRoster.listSquads(tick) -> [{
  id, doctrine, faction, formation,
  formationSpacing, formationBound,
  members: [{ id, preferredRole, capabilities }]
}]
```

An entity may appear in only one squad. Roster changes cause deterministic role reassignment; a stable roster preserves roles.

### Actions — canonical SG-03 path

`createSG03ActionPort(ctx)` exposes:

```js
list(entityId, context) -> tactical ActionDef views
canStart(entityId, actionId, request) -> { ok, reason } // advisory prediction
start(entityId, actionId, request) -> request handle
status(entityId, handle) -> queued | running | completed | failed | cancelled
interrupt(entityId, handle, { nextActionId, ... }) -> boolean // predicts SG-03 cancel grammar
```

The authoritative start/rejection/cancel decision remains in SG-03. `start(...)` enqueues through `kernel.actions.requestAction`; the adapter never mutates action runtime. It carries entity, attachment, socket, and point targets into SG-03's canonical target shapes.

Current semantic mappings are derived from the existing SG-03 definitions rather than a second combat catalog:

| Canonical action | AI semantic use |
|---|---|
| `action_dash` | evade, retreat, and overload/break a tether by aligning away then applying the authored dash impulse |
| `action_attach` | tug or steal objective |
| `action_reel` | tug control |
| `action_sling` | aggressive tether maneuver |
| `action_cut` | sever an exposed attachment that sensors identify as owned/cuttable by the actor |
| `action_burst` | ranged attack/focus fire |

### Maneuver — SG-02 hard dependency

```js
helpers.aiManeuver.request({
  version: 1,
  entityId,
  tick,
  kind,
  forceLocal: { forward: -1..1, right: -1..1 },
  torqueYaw: -1..1,
  boost,
  brake,
  targetHeading,
  horizonTicks,
  trajectory: [{ x, z, tick }],
  reason
})
```

This is a request for available physical authority, not a velocity/transform command. The production provider translates the normalized local request through authored flight profiles and measured thruster authority, then SG-02 applies force/torque, enforces constraints, and owns resulting motion. A drive-damaged ship may deliver less force than requested; SG-06 receives that consequence through subsequent sensor frames.

### Encounter command sink

```js
helpers.aiEncounter?.issue(command)
```

Commands are limited to pace/phase, reinforcement request, coordinated retreat, and narrative-beat timing. Spawn ownership and narrative DSL mutation stay outside SG-06.

Production `aiPorts` now installs an inert `helpers.aiEncounter` recorder. It accepts only `phase`, `request_reinforcement`, `order_retreat`, and `narrative_beat` commands, normalizes them into a bounded `state.aiEncounter.commands` ring, emits `ai:encounterCommand`, and returns `false` for invalid or spawn-shaped commands. It does not call `spawnEntity`, `spawn:request`, missions, story, or any legacy reinforcement path.

## Tactical laws and materially different tactics

The commander currently selects among:

- `hold_formation`: preserve cohesion while the contact picture is weak.
- `swarm_pincer`: scavenger-biased split vectors around the perceived focus target.
- `standoff_focus`: official/ranged concentration while maintaining role geometry.
- `screen_tug_steal`: screen ships protect tug/thief specialists contesting a payload.
- `contain_and_disable`: official wing prioritizes mobility/system disablement before capture.
- `cut_and_scatter`: an exposed, confidently identified, cuttable attachment creates a sever objective and explicit break.
- `overload_and_break`: a tethered member with drive authority aligns directly away, then invokes canonical `action_dash` to spike relative impulse/tension.
- `fighting_retreat`: an explicit director retreat or perceived attrition causes coordinated withdrawal.

Formation is not silently abandoned. Every member directive carries `breakFormation` and a reason such as `pincer_attack`, `objective_run`, `counter_tether_cut`, `counter_tether`, `director_retreat`, `member_disabled`, or `authored_break`. Otherwise, crossing the rejoin threshold forces a formation recovery maneuver.

## Counter-tether conditions

### Cut exposed line

`action_cut` becomes eligible only when all of the following are true:

1. sensors/memory report a tether/attachment contact with sufficient confidence;
2. the contact is marked exposed;
3. the contact carries an attachment identity;
4. sensors report that the actor owns or is permitted to cut that attachment;
5. SG-03 reports the action installed and its capability/cooldown/cost/target gates available.

The commander assigns the cut objective to a capable striker/support and records an explicit formation break.

### Overload and break

Canonical `action_dash` becomes the overload counter only when:

1. sensors report the actor as tethered;
2. the actor has drive capability and sufficient SG-03 capacitor/heat headroom;
3. the maneuver planner has aligned the ship within the documented angular tolerance directly away from the perceived tether anchor.

Before alignment, the behavior holds the action and outputs `escape_tether` steering. Once aligned, the same `action_dash` used by the player is requested; SG-02 must turn its authored impulse into real constraint tension and break telemetry.

## Director envelope

Director inputs are aggregate perceived facts only:

- confidence-weighted visible hostile threat;
- observed friendly disabled and low-hull fractions;
- observed recent-damage events;
- observed objective progress;
- observed tether threats.

The state machine uses `respite`, `build`, `peak`, and `retreat`, with minimum/maximum dwell periods, asymmetric pressure slew, reinforcement budget/cooldown, and narrative cooldown. Pressure is clamped every tick to the authored envelope. The director cannot inspect player inventory, hidden cooldowns, mission-private variables, or unseen attackers.

## Explainability trace

Every perception update and every decision layer emits:

```js
{
  version: 1,
  sequence,
  tick,
  layer: 'perception' | 'director' | 'squad' | 'utility' | 'behavior' | 'maneuver',
  entityId,
  squadId,
  decision,
  selected,
  candidates,
  context
}
```

Object keys are canonicalized and finite numbers are rounded to six decimals. Storage is a fixed-capacity circular buffer; trace evidence is not gameplay state.

Agent surface:

```js
system.handleAgentRequest({ method: 'ai.contract' })
system.handleAgentRequest({ method: 'ai.inspect', params: { entityId, squadId, trace } })
system.handleAgentRequest({ method: 'ai.trace', params: { sinceTick, layer, entityId, limit } })
```

The endpoint owns no transport. SG-07 may mount it behind JSON-RPC/CLI without exposing authoritative world objects.

## Ownership and mutation table

| State or operation | Sole owner | SG-06 access |
|---|---|---|
| Sensor truth, occlusion, classification, noise | sensor system | read normalized frames only |
| Per-entity contact memory | SG-06 perception | sole writer |
| Director pressure/phase/budgets | SG-06 director | sole writer |
| Squad roles/tactic/directives | SG-06 commander | sole writer |
| `ActionDef`, action queue, phases, costs, cooldown, heat | SG-03 | enumerate/request/inspect only |
| Subsystem capabilities and blocked tags | SG-03 | read through canonical kernel inspection/capabilities |
| Semantic attachment ownership/state | SG-03 | target/request only |
| Body force, torque, impulse, constraints, transforms | SG-02 | normalized maneuver request only |
| Projectile spawn and damage | SG-03 | no direct access |
| Reinforcement spawn | encounter/spawn owner | director command only |
| Narrative DSL/state | narrative owner | timing command only |
| Render/camera/VFX/audio | presentation owners | no access |
| AI trace | SG-06 | sole writer; inspection read only |

SG-06 directly mutates only its private runtime maps and trace ring.

## Schema/version impact

- Introduces `AI_CONTRACT_VERSION = 1`.
- Introduces no save-schema change; AI memory/decisions are transient and reconstructible.
- Introduces no combat grammar/schema change.
- Introduces no narrative DSL change.
- Introduces no renderer or entity-layout change.
- SG-02 must version-check maneuver request version `1` when its adapter lands.

## Verification evidence

Run:

```bash
npm run check:ai
# equivalent:
node scripts/check-sg06-ai.mjs --runs=100 --ticks=600

npm run check:sg06:production-ports

npm run check:sg06:encounter-sink

npm run check:sg06:live-shadow

npm run check:sg06:registry-init

npm run check:sg06:formation

npm run check:sg02:tether-break
```

Checked-in result: `docs/Spec/SG-06_ACCEPTANCE.json`.

The production-port gate proves sensor frames are exact SG-06 whitelists, hidden state getters are not read, roster signatures and roles are stable across unchanged ticks, duplicate membership is rejected by `TacticalAIStack`, maneuvers fail closed outside `rapier-dynamic`, and accepted maneuvers move craft only after SG-02 consumes the command.

The encounter-sink gate proves production `helpers.aiEncounter` records only whitelisted director commands, rejects invalid/spawn-shaped commands, replays deterministically, mirrors commands through `ai:encounterCommand`, and does not mutate entity count, `state.combat.pendingReinforcements`, missions, or story state.

The live-shadow gate constructs `createTacticalAISystem(...)` against production `helpers.aiSensors` and `helpers.aiRoster`, uses the default live SG-03 action adapter, captures maneuver requests at the port boundary, and proves SG-06 can submit a canonical `action_burst` AI request that SG-03 starts and applies without touching the legacy `entity.data.intent.fire` path. It intentionally does not register `tacticalAI` in the production registry yet; the intake guard remains responsible for preventing premature live replacement.

The registry-init gate initializes `tacticalAI` before physics, aiPorts, and actions, then installs the real production ports and proves the first tactical update lazy-binds them, starts a canonical SG-03 `action_burst`, and flushes SG-06 maneuver requests into SG-02 without touching legacy intent. This clears init order as a blocker; it is still not a production registration.

The formation gate runs `createTacticalAISystem(...)` with production `helpers.aiSensors`, `helpers.aiRoster`, and `helpers.aiManeuver` against the real SG-02 `rapier-dynamic` owner. It proves three dynamic AI ships receive and flush maneuver requests through `aiPorts`, follower slot error enters the authored formation bound, commanded-stationary time stays below the watchdog threshold, and the run replays deterministically. The maneuver planner now slows formation/hold approaches over a formation-sized radius so dynamic bodies converge instead of overshooting the slot.

The Massline break gate is owned by SG-02/SG-03. It shortens a semantic Massline through the SG-03 attachment service, lets SG-02 publish threshold tension/impulse telemetry, and proves SG-03 breaks the attachment with trace evidence and releases the physical rope.

The final 100-seed run on 2026-06-21 produced:

- seven materially distinct tactics across scavenger and official wings;
- both tether counters through canonical IDs `action_cut` and `action_dash`;
- maximum four material action transitions per ship and no A/B/A/B/A oscillation;
- maximum one commanded-stationary tick, below the 180-tick threshold;
- 17,088 formation-recovery requests when non-broken members exceeded the authored rejoin threshold;
- pressure range `0.22..0.698987` inside authored `0.16..0.76`;
- all six trace layers for every decision tick;
- deterministic replay equality for five sampled seeds;
- 100 seeds × 600 ticks in 28,551 ms on the implementation container.

The test imports the repository's canonical `ACTION_DEFS` and rejects synthetic action identifiers. It exercises the delivered live adapter's conversion/gating semantics through a deterministic fixture port.

## Acceptance status

| SG-06 criterion | Evidence | Status |
|---|---|---|
| Scavenger + official wings show ≥3 tactics | 100-seed harness; seven tactics | pass at decision/port level |
| ≥2 counter-tether actions | canonical `action_cut` and `action_dash` under documented conditions | pass at decision/SG-03 request level |
| No unintended stationary >180 ticks | maneuver watchdog and seeded assertion; max 1 | pass at request level; physical pass requires SG-02 |
| No action-state oscillation above threshold | commit windows, switch margins, SG-03 cancel prediction, seeded assertions | pass |
| Lazy registry-slot initialization | `check:sg06:registry-init` initializes tacticalAI before production ports, then lazy-binds them on update | pass; production registration still gated |
| Role/formation bounds until explicit break | stable roles, explicit reasons, recovery request assertion, Rapier formation convergence gate | pass at request and standalone SG-02 physical level; live registry slot still gated |
| Massline threshold break telemetry | SG-02/SG-03 `check:sg02:tether-break` gate | pass at foundation level; tacticalAI-triggered live-slot proof still gated |
| Same sensors/actions/heat/energy/subsystems/physics as player | production sensor/roster/maneuver ports + live SG-03 adapter; no fallback | port pass; live registry parity still gated |
| Director commands cannot spawn or mutate story/missions | inert production encounter sink + deterministic isolation gate | pass at recorder level; active encounter owner still gated |
| Director pressure inside authored envelope | per-tick clamp and 100-seed assertion | pass |
| Every decision explainable | six-layer trace assertions | pass |

## Production integration sequence

1. Done: land SG-02 dynamic-body authority and its thruster/constraint request adapter.
2. Done: install production `helpers.aiSensors` and `helpers.aiRoster` providers; do not hand SG-06 `state.entities`.
3. Done: install `helpers.aiManeuver` over SG-02 force/torque/thruster allocation.
4. Done at harness level: construct `createTacticalAISystem(...)` with production sensor/roster helpers and the live SG-03 action adapter; verify canonical AI ActionDef requests without legacy intent mutation.
5. Done at recorder level: install production `helpers.aiEncounter` for deterministic, whitelisted director command recording without spawn/story/mission side effects.
6. Done at standalone SG-02 level: prove Rapier dynamic formation convergence and no commanded-stationary breach through production `helpers.aiManeuver`.
7. Done at SG-02/SG-03 foundation level: prove Massline threshold break telemetry and physical rope release through `check:sg02:tether-break`.
8. Done at harness level: prove lazy registry-slot initialization can bind production ports after tacticalAI init.
9. Next: construct `createTacticalAISystem(...)` in the actual production registry in the existing AI slot, before `actions` and before the AI maneuver port flushes to SG-02.
10. Run the suite against the real registry slot, real sensor degradation, actual SG-03 action state, and actual Massline constraints.
11. Verify tacticalAI-triggered constraint break behavior, no stationary bodies in live slot, replay parity, action/resource equivalence, and active encounter-command ownership.
12. Delete the legacy path only after all production acceptance checks pass in the same milestone.

## Explicit legacy deletion list

1. Delete `src/systems/ai.js` after the port-backed system passes production parity.
2. Replace the legacy `ai` import/registration in `src/core/registry.js` with the configured tactical system in the same pre-`actions` slot.
3. Remove NPC consumption of `entity.data.intent.fire`, `fireGroup`, and AI lead angles from `src/systems/weapons.js`; AI combat must enter only through SG-03 actions.
4. Remove the legacy NPC six-field intent contract and direct NPC flight path from `src/systems/flight.js` after SG-02 consumes maneuver requests.
5. Remove `state.combat.threatTables`; threat used by SG-06 must be sensor-derived and memory-local.
6. Remove `state.combat.pendingReinforcements` plus `_checkReinforcements()` from the old FSM; the director emits commands and the encounter owner spawns.
7. Migrate/delete old per-archetype FSM steering tables. Doctrine/capability and canonical action metadata replace duplicated combat/movement definitions.
8. Delete tests/docs that assert `idle/patrol/pursue/attack/strafe/flee`, direct `intent.fire`, or direct velocity steering.

Do not execute this deletion until live tacticalAI parity passes. Until then, the old FSM remains the production AI movement/fire path and the new tactical adapter intentionally remains unregistered.
