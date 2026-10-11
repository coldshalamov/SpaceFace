import { counterplayDoctrineById } from './catalog.js';
import { createCounterplayMemory } from './memory.js';
import { forgetStaleIdentity, limitKnowledge } from './observe.js';
import { COUNTERPLAY_POLICIES } from './policies.js';
import { holdManeuver, steerAway } from './steer.js';

const STALL_TICKS = 260;
const DISENGAGE_TICKS = 50;

function blank(doctrineId, tick, phase, explain, fallback) {
  return {
    doctrineId: doctrineId || '',
    tick,
    phase,
    telegraph: null,
    maneuver: holdManeuver(null),
    attack: null,
    verb: null,
    companions: [],
    goal: { kind: 'none', progress: 0, complete: false },
    explain,
    cue: null,
    fallback,
  };
}

function nearestThreat(self, sensed) {
  let best = null;
  let bestDist = Infinity;
  for (const contact of (sensed && sensed.contacts) || []) {
    if (!contact || contact.alive === false || contact.team == null || !self) continue;
    if (contact.team === self.team) continue;
    const d = Math.hypot(contact.pos.x - self.pos.x, contact.pos.z - self.pos.z);
    if (d < bestDist) {
      best = contact;
      bestDist = d;
    }
  }
  return best;
}

/**
 * One decision for one hull. Pure aside from the memory object the caller owns.
 * No entity writes, no weapon intents applied, no second simulation loop.
 */
export function decideCounterplay(input = {}) {
  const tick = Number.isInteger(input.tick) ? input.tick : 0;
  const doctrine = counterplayDoctrineById(input.doctrineId);
  const memory = input.memory || createCounterplayMemory(input.doctrineId);
  if (!doctrine) {
    return blank(input.doctrineId, tick, 'fallback', 'Unknown counterplay doctrine.', 'unknown_doctrine');
  }
  const self = input.self;
  if (!self || !self.pos || !Number.isFinite(self.pos.x) || !Number.isFinite(self.pos.z)) {
    return blank(doctrine.id, tick, 'fallback', 'No self pose.', 'no_self');
  }
  if (self.alive === false) {
    return {
      ...blank(doctrine.id, tick, 'done', 'Hull is gone.', 'destroyed'),
      maneuver: holdManeuver(self),
    };
  }
  if (memory.done === true) {
    return {
      ...blank(doctrine.id, tick, 'done', 'Doctrine already finished.', null),
      maneuver: holdManeuver(self),
      goal: { kind: doctrine.physical, progress: memory.best || 0, complete: (memory.best || 0) >= 0.97 },
    };
  }

  const sensed = limitKnowledge({
    self,
    contacts: input.contacts || [],
    obstacles: input.obstacles || [],
    tethers: input.tethers || [],
  }, doctrine, memory, tick);
  forgetStaleIdentity(memory, sensed);

  if (memory.disengage === true) {
    const lived = tick - (memory.phaseSince || tick);
    if (memory.phase !== 'disengage') {
      memory.phase = 'disengage';
      memory.phaseSince = tick;
    }
    if (lived > DISENGAGE_TICKS) {
      memory.done = true;
      memory.phase = 'done';
      return {
        ...blank(doctrine.id, tick, 'done', 'Disengage finished.', 'stall_done'),
        maneuver: holdManeuver(self),
        goal: { kind: doctrine.physical, progress: memory.best || 0, complete: false },
      };
    }
    const threat = nearestThreat(self, sensed);
    return {
      ...blank(doctrine.id, tick, 'disengage', 'No progress. Leaving the problem.', 'stall'),
      maneuver: steerAway(self, threat && threat.pos),
      goal: { kind: doctrine.physical, progress: memory.best || 0, complete: false },
    };
  }

  const policy = COUNTERPLAY_POLICIES[doctrine.id];
  const decision = policy({
    doctrine,
    tick,
    self,
    sensed,
    objective: input.objective || {},
    memory,
  });
  if (decision.attack && decision.attack.targetRole === 'civilian') {
    decision.attack = null;
    decision.fallback = 'refused_civilian_target';
  }
  if (decision.attack && doctrine.fires !== true) {
    decision.attack = null;
    decision.fallback = 'doctrine_does_not_fire';
  }
  const progress = decision.goal && Number.isFinite(decision.goal.progress) ? decision.goal.progress : 0;
  if (decision.self) delete decision.self;
  if (progress > (memory.best || 0) + 0.03) {
    memory.best = progress;
    memory.stallSince = tick;
  }
  if (!Number.isInteger(memory.stallSince)) memory.stallSince = tick;
  const waiting = decision.phase === 'drift' || decision.phase === 'show_match' || decision.phase === 'mark';
  if (!waiting && tick - memory.stallSince > STALL_TICKS && decision.phase !== 'done') {
    memory.disengage = true;
    memory.phase = 'disengage';
    memory.phaseSince = tick;
  }
  return decision;
}
