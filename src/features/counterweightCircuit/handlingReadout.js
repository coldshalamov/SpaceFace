// Bounded, read-only physical instrument. No extrapolation or acceptance model:
// receiver facts come from physical.observe(), dwell from the existing FSM.

const RECEIVER_LEGS = new Set(['seat', 'contain', 'parkAll']);
const LEG_KINDS = new Set(['attach', 'swing', 'release', 'transit', 'seat', 'contain', 'parkAll', 'reacquire']);
const UNMET = new Set(['inside', 'mouth', 'support', 'speed', 'spin', 'attach']);
const finite = Number.isFinite;
const life = (id, generation) => Number.isSafeInteger(id) && id >= 0
  && Number.isSafeInteger(generation) && generation > 0;
const vector = v => !!v && finite(v.x) && finite(v.z);
const nonnegative = n => finite(n) && n >= 0;
const text = v => typeof v === 'string' && v.length > 0 && v.length <= 96;

function bodyFor(role, observation, currentLives, fsm) {
  const body = observation.bodies?.[role], current = currentLives?.[role];
  if (!body || body.alive !== true || !life(body.id, body.occupantGeneration)
      || current?.id !== body.id || current.generation !== body.occupantGeneration
      || !vector(body.pos) || !vector(body.vel) || !finite(body.radius) || body.radius <= 0) return null;
  const witnessed = fsm.mem?.roleWitness?.[role];
  if (witnessed && (witnessed.id !== body.id || witnessed.generation !== body.occupantGeneration)) return null;
  return body;
}

function activePair(def, leg, observation) {
  const loadRole = role => def.bodies.some(body => body.role === role && body.kind === 'load');
  if (typeof leg.role === 'string') return loadRole(leg.role) ? [leg.role, leg.zone ?? null] : null;
  if (leg.kind !== 'parkAll' || !Array.isArray(leg.pairs) || !leg.pairs.length || leg.pairs.length > 2) return null;
  if (!leg.pairs.every(pair => Array.isArray(pair) && pair.length === 2 && loadRole(pair[0]))) return null;
  if (leg.pairs.length === 1) return leg.pairs[0];
  if (!Array.isArray(observation.lines) || observation.lines.length > 12) return null;
  const selected = leg.pairs.filter(([role]) => {
    const body = observation.bodies?.[role];
    return body && observation.lines.some(line => line && line.role === role && text(line.id)
      && ((line.aId === observation.playerId && line.bId === body.id)
        || (line.bId === observation.playerId && line.aId === body.id)));
  });
  return selected.length === 1 ? selected[0] : null;
}

/** Pure projection of one current, admitted observation. All missing facts hide. */
export function projectCounterweightHandling({ def, fsm, observation, currentLives,
  admitted, inFlight, inVenueSector, eventId, attemptId } = {}) {
  if (admitted !== true || inFlight !== true || inVenueSector !== true
      || !def || !Array.isArray(def.bodies) || def.bodies.length > 12 || !Array.isArray(def.legs)
      || !fsm || !['staged', 'running'].includes(fsm.phase) || fsm.eventId !== def.id
      || eventId !== def.id || !text(eventId) || attemptId !== fsm.attemptId
      || !Number.isSafeInteger(attemptId) || attemptId <= 0
      || !Number.isSafeInteger(fsm.legIndex) || !observation || observation.mode !== 'flight'
      || observation.playerAlive !== true || !nonnegative(observation.simTime)) return null;
  const leg = def.legs[fsm.legIndex];
  if (!leg || !LEG_KINDS.has(leg.kind)) return null;
  const pair = activePair(def, leg, observation);
  if (!pair) return null;
  const [role, receiverRole] = pair, body = bodyFor(role, observation, currentLives, fsm);
  if (!body || !text(role)) return null;
  const out = {
    schema: 1, eventId, attemptId, legIndex: fsm.legIndex, legKind: leg.kind, observedAt: observation.simTime,
    load: { id: body.id, generation: body.occupantGeneration, role, x: body.pos.x, z: body.pos.z, radius: body.radius },
    receiver: null, reference: 'course', velocity: { x: body.vel.x, z: body.vel.z },
    speed: Math.hypot(body.vel.x, body.vel.z), speedLimit: null, spinLimit: null,
    relativeSpin: null, firstUnmet: null, stable: null, dwellFraction: null,
  };
  if (!RECEIVER_LEGS.has(leg.kind)) return finite(out.speed) ? out : null;
  const receiverDef = def.bodies.find(row => row.role === receiverRole && row.zone?.receiver === true);
  const receiver = bodyFor(receiverRole, observation, currentLives, fsm);
  const witness = observation.receivers?.[`${role}:${receiverRole}`];
  if (!receiverDef || !receiver || !text(receiverRole) || !finite(receiver.rot)
      || !witness || witness.handlingSupported !== true
      || witness.bodyId !== body.id || witness.bodyGeneration !== body.occupantGeneration
      || witness.receiverId !== receiver.id || witness.receiverGeneration !== receiver.occupantGeneration
      || !vector(witness.relativeVelocity) || !nonnegative(witness.relativeSpeed)
      || witness.relativeSpeed !== Math.hypot(witness.relativeVelocity.x, witness.relativeVelocity.z)
      || !nonnegative(witness.speedLimit) || witness.speedLimit !== leg.maxSpeed
      || !nonnegative(witness.spinLimit) || !nonnegative(witness.relativeSpin)
      || typeof witness.stable !== 'boolean'
      || !(witness.firstUnmet === null || UNMET.has(witness.firstUnmet))
      || witness.firstUnmet === 'attach'
      || witness.stable !== (witness.firstUnmet === null)
      || !finite(leg.dwellS) || leg.dwellS <= 0 || !fsm.mem?.dwellS) return null;
  const dwell = fsm.mem.dwellS[leg.kind === 'parkAll' ? 'parkAll' : `${role}:${receiverRole}`] ?? 0;
  if (!nonnegative(dwell) || (!witness.stable && dwell > 0)) return null;
  const needsAttach = leg.kind === 'parkAll' && leg.requireAttach && !fsm.mem.attachSeen?.[role];
  if (needsAttach && dwell > 0) return null;
  out.receiver = { id: receiver.id, generation: receiver.occupantGeneration, role: receiverRole,
    x: receiver.pos.x, z: receiver.pos.z, rot: receiver.rot, radius: receiver.radius };
  out.reference = 'receiver';
  out.velocity = { x: witness.relativeVelocity.x, z: witness.relativeVelocity.z };
  out.speed = witness.relativeSpeed;
  out.speedLimit = witness.speedLimit;
  out.spinLimit = witness.spinLimit;
  out.relativeSpin = witness.relativeSpin;
  out.firstUnmet = needsAttach ? 'attach' : witness.firstUnmet;
  out.stable = !needsAttach && witness.stable;
  out.dwellFraction = Math.min(1, dwell / leg.dwellS);
  return out;
}

/** Bounded copy at the public read-model boundary; foreign fields never escape. */
export function copyCounterweightHandling(handling) {
  if (!handling || handling.schema !== 1 || !text(handling.eventId)
      || !Number.isSafeInteger(handling.attemptId) || handling.attemptId <= 0
      || !Number.isSafeInteger(handling.legIndex) || handling.legIndex < 0
      || !LEG_KINDS.has(handling.legKind) || !nonnegative(handling.observedAt)
      || !vector(handling.velocity) || !nonnegative(handling.speed)
      || handling.speed !== Math.hypot(handling.velocity.x, handling.velocity.z)) return null;
  const copyBody = (body, receiver = false) => body && life(body.id, body.generation) && text(body.role)
    && finite(body.x) && finite(body.z) && finite(body.radius) && body.radius > 0
    && (!receiver || finite(body.rot))
    ? { id: body.id, generation: body.generation, role: body.role, x: body.x, z: body.z,
      ...(receiver ? { rot: body.rot } : {}), radius: body.radius } : null;
  const load = copyBody(handling.load), receiver = copyBody(handling.receiver, true);
  if (!load) return null;
  if (handling.reference === 'receiver') {
    if (!RECEIVER_LEGS.has(handling.legKind) || !receiver || !nonnegative(handling.speedLimit)
        || !nonnegative(handling.spinLimit) || !nonnegative(handling.relativeSpin)
        || typeof handling.stable !== 'boolean' || !nonnegative(handling.dwellFraction) || handling.dwellFraction > 1
        || !(handling.firstUnmet === null || UNMET.has(handling.firstUnmet))
        || handling.stable !== (handling.firstUnmet === null)) return null;
  } else if (handling.reference !== 'course' || RECEIVER_LEGS.has(handling.legKind)
      || handling.receiver !== null || ['speedLimit', 'spinLimit', 'relativeSpin', 'firstUnmet', 'stable', 'dwellFraction']
        .some(key => handling[key] !== null)) return null;
  return { schema: 1, eventId: handling.eventId, attemptId: handling.attemptId, legIndex: handling.legIndex,
    legKind: handling.legKind, observedAt: handling.observedAt, load, receiver, reference: handling.reference,
    velocity: { x: handling.velocity.x, z: handling.velocity.z }, speed: handling.speed,
    speedLimit: handling.speedLimit, spinLimit: handling.spinLimit, relativeSpin: handling.relativeSpin,
    firstUnmet: handling.firstUnmet, stable: handling.stable, dwellFraction: handling.dwellFraction };
}
