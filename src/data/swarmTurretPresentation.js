// Explicit draw-only worker view for the Machine's turret mounts and sweeping edges.
// The wider Brood transport is separate: do not ship its health, motion, attack owners
// or reserve/channel state merely to make this threat visible.
import { SWARM_BROOD_FAMILIES, SWARM_BROOD_MAX, BROOD_CASCADE_NONE, BROOD_CASCADE_PANIC, BROOD_CASCADE_GRIEF, BROOD_CASCADE_AGGRESSION } from './swarmBrood.js';
import { SWARM_BROOD_LATE_FAMILIES } from './swarmBroodLate.js';
import { SWARM_MACHINE_FAMILIES } from './swarmMachine.js';

const TURRET_FAMILY = SWARM_BROOD_FAMILIES.length + SWARM_BROOD_LATE_FAMILIES.length
  + SWARM_MACHINE_FAMILIES.findIndex(family => family.id === 'beam_turret');
const BODY_FIELDS = Object.freeze(['px', 'pz', 'heading', 'family', 'phase', 'seedPhase',
  'teleX', 'teleZ', 'timer', 'affix']);
const BEAM_FIELDS = Object.freeze(['x', 'z', 'a0', 'a1', 't', 'total', 'range', 'width', 'state']);
// Each engine body can be winding; only eight pool slots can be sweeping at once.
const MAX_BEAM_RECORDS = SWARM_BROOD_MAX + 8;
const SCHEMA = 'spaceface.swarmTurretPresentation.v1';
const CASCADES = Object.freeze([BROOD_CASCADE_NONE, BROOD_CASCADE_PANIC, BROOD_CASCADE_GRIEF, BROOD_CASCADE_AGGRESSION]);

function currentRun(state) {
  const run = state?.run;
  return run?.kind === 'survival' && run.ruleset === 'swarm' && run.phase === 'active'
    && (state.mode === 'flight' || state.mode === 'pause') ? run : null;
}

export function projectSwarmTurretPresentation(state) {
  const run = currentRun(state), view = state?.swarmBrood;
  if (!run || !view || view.wave !== run.wave || !(view.aliveCount > 0)
    || !Number.isInteger(view.cap) || view.cap < 0 || view.cap > SWARM_BROOD_MAX
    || !Array.isArray(view.beams) || view.beams.length > MAX_BEAM_RECORDS) return null;
  const out = { schema: SCHEMA, wave: run.wave, cascade: CASCADES.includes(view.cascade) ? view.cascade : BROOD_CASCADE_NONE, cap: 0, aliveCount: 0, alive: [], beams: [] };
  for (const key of BODY_FIELDS) out[key] = [];
  for (let i = 0; i < view.cap; i++) {
    if (!view.alive?.[i] || view.family?.[i] !== TURRET_FAMILY) continue;
    if (!Number.isFinite(view.px?.[i]) || !Number.isFinite(view.pz?.[i])) return null;
    for (const key of BODY_FIELDS) out[key].push(Number.isFinite(view[key]?.[i]) ? view[key][i] : 0);
    out.alive.push(1);
  }
  out.cap = out.aliveCount = out.alive.length;
  if (!out.aliveCount) return null;
  for (const source of view.beams) {
    if (!source || !BEAM_FIELDS.every(key => Number.isFinite(source[key]))
      || !(source.state === 0 || source.state === 1) || source.range < 0
      || source.width < 0 || !(source.total > 0)) return null;
    const beam = {};
    for (const key of BEAM_FIELDS) beam[key] = source[key];
    out.beams.push(beam);
  }
  return out;
}

// An explicit transported null wins over any obsolete local simulation view.
// Local/main-thread execution continues using its original complete Brood view.
export function readSwarmBroodPresentation(state) {
  if (!state || !Object.hasOwn(state, 'swarmTurretPublic')) return state?.swarmBrood || null;
  const run = currentRun(state), view = state.swarmTurretPublic;
  return run && view?.schema === SCHEMA && view.wave === run.wave ? view : null;
}
