# Counterplay adapter — not applied

Status: **not landed**. `src/systems/tacticalAI.js` does not import this campaign.
No global AI file was edited. The arena calls the same functions a later patch would call.

## Conflicting path

`src/systems/tacticalAI.js` is the producer that would branch on
`entity.data.ai.counterplayDoctrineId`. It stays untouched so a concurrent AI lane
cannot be overwritten. `src/ai/engagementAuthority.js` is also untouched: shots use the
existing `ranged_disengager` / `fire_window` label only as the legal window the authority
already understands. The counterplay id is not a combat-doctrine id.

## Exact call, when a later landing is allowed

Inside the per-ship decision consumer, after the sensor frame exists and before any
maneuver or `intent.fire` write:

```js
import { decideCounterplay } from '../ai/counterplay/decide.js';
import { applyCounterplayIntent, applyCounterplayRepair } from '../ai/counterplay/adapterPatch.js';
import { restoreCounterplayMemory, serializeCounterplayMemory } from '../ai/counterplay/memory.js';

// Only for hulls stamped with ai.counterplayDoctrineId. Every other hull keeps
// the current planner. Do not register a second AI system.
if (ai.counterplayDoctrineId) {
  const memory = restoreCounterplayMemory(ai.counterplayMemory, ai.counterplayDoctrineId);
  const decision = decideCounterplay({
    doctrineId: ai.counterplayDoctrineId,
    tick: state.tick,
    self: /* pose, vel, rot, hull, shield, team, alive, id, generation */,
    contacts: /* sensor contacts already range-limited by aiSensors */,
    obstacles: /* rocks from that same frame */,
    tethers: /* attachment contacts from that same frame */,
    objective: ai.counterplayObjective || {},
    memory,
  });
  const target = /* entity for decision.attack.targetId, else null */;
  applyCounterplayIntent({ state, helpers, entity, decision, tick: state.tick, target });
  if (decision.verb && decision.verb.kind === 'repair') {
    applyCounterplayRepair({ state, patient: /* verb target */, amount: 0.25 });
  }
  ai.counterplayMemory = serializeCounterplayMemory(memory);
  // Skip the normal maneuver planner for this hull only.
}
```

Latch and cut stay on `helpers.combatPhysics.createAttachment` / `cutAttachment`.
They are physics-owner calls, not a private integrator.

## What must not change in that landing

- Engagement authority remains the only fire authorization.
- Non-firing doctrines stay `roe: hold_fire` and never set `intent.fire`.
- Civilian and patient ids are never attack targets.
- `state.rng` / `state.simTime` stay the clocks. This policy code does not draw random numbers.
- Do not add a system to `authoritativeSystemManifest.js`. One call per hull per tick
  from the existing producer is the whole integration.
