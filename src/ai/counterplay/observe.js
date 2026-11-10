// Knowledge limits for counterplay. Contacts are range-limited, occluded by rocks, and
// released only after the doctrine's reaction delay. The doctrine's own objective points
// are orders, not sensor contacts, and are not passed through here.

function num(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function copyPos(pos) {
  return { x: num(pos && pos.x), z: num(pos && pos.z) };
}

function copyContact(contact) {
  if (!contact || contact.id == null || !Number.isFinite(contact.pos?.x)
    || !Number.isFinite(contact.pos?.z)) return null;
  return {
    id: contact.id,
    generation: Number.isSafeInteger(contact.generation) && contact.generation >= 0 ? contact.generation : 1,
    kind: String(contact.kind || 'ship'),
    role: String(contact.role || ''),
    team: contact.team == null ? null : contact.team,
    pos: copyPos(contact.pos),
    vel: copyPos(contact.vel),
    rot: num(contact.rot),
    radius: Math.max(0, num(contact.radius, 8)),
    alive: contact.alive !== false,
    hull: num(contact.hull),
    shield: num(contact.shield),
  };
}

export function pointSegmentDistance(point, a, b) {
  if (!point || !a || !b) return Infinity;
  const abx = num(b.x) - num(a.x);
  const abz = num(b.z) - num(a.z);
  const len2 = abx * abx + abz * abz;
  if (len2 < 1e-8) return Math.hypot(num(point.x) - num(a.x), num(point.z) - num(a.z));
  const t = Math.max(0, Math.min(1, ((num(point.x) - num(a.x)) * abx + (num(point.z) - num(a.z)) * abz) / len2));
  return Math.hypot(num(point.x) - (num(a.x) + abx * t), num(point.z) - (num(a.z) + abz * t));
}

export function segmentBlocked(from, to, obstacles, pad = 0, ignoreId = null) {
  if (!from || !to || !obstacles) return false;
  for (const obstacle of obstacles) {
    if (!obstacle || !obstacle.pos || obstacle.alive === false
      || (ignoreId != null && obstacle.id === ignoreId)) continue;
    const radius = num(obstacle.radius, 8) + pad;
    if (pointSegmentDistance(obstacle.pos, from, to) <= radius) return true;
  }
  return false;
}

export function emptySensed() {
  return {
    tick: 0,
    contacts: [],
    obstacles: [],
    tethers: [],
  };
}

/**
 * Filter a raw world down to what this doctrine is allowed to know at `tick`.
 * Mutates `memory.delay` only. The caller keeps its live self pose; external poses are snapshots.
 */
export function limitKnowledge(world, doctrine, memory, tick) {
  const range = Math.max(0, num(doctrine && doctrine.sensorRange, 0));
  const delayTicks = Math.max(0, Math.ceil(num(doctrine && doctrine.reactionDelayTicks, 0)));
  const self = world && world.self;
  if (!Number.isSafeInteger(tick) || tick < 0 || !Number.isFinite(self?.pos?.x)
    || !Number.isFinite(self?.pos?.z)) return emptySensed();
  const origin = self.pos;
  const obstacles = [];
  for (const obstacle of (world && world.obstacles) || []) {
    const copy = copyContact(obstacle);
    if (!copy || copy.alive === false) continue;
    if (Math.hypot(copy.pos.x - origin.x, copy.pos.z - origin.z) > range + copy.radius) continue;
    obstacles.push(copy);
  }
  const contacts = [];
  for (const contact of (world && world.contacts) || []) {
    const copy = copyContact(contact);
    if (!copy || copy.alive === false) continue;
    const dist = Math.hypot(copy.pos.x - origin.x, copy.pos.z - origin.z);
    if (dist > range) continue;
    if (segmentBlocked(origin, copy.pos, obstacles, 0, copy.id)) continue;
    contacts.push(copy);
  }
  const observedIds = new Set([self.id]);
  for (const row of contacts) observedIds.add(row.id);
  for (const row of obstacles) observedIds.add(row.id);
  const tethers = [];
  for (const tether of (world && world.tethers) || []) {
    if (!tether || tether.ownerId == null || tether.targetId == null
      || !Number.isFinite(tether.length) || tether.length < 0) continue;
    // A short rope can be on the other side of the sector. Length is not sensor range.
    // Own attachments are proprioception; third-party endpoints must both be observed.
    const attachedToSelf = tether.ownerId === self.id || tether.targetId === self.id;
    if (!attachedToSelf && (!observedIds.has(tether.ownerId) || !observedIds.has(tether.targetId))) continue;
    const length = tether.length;
    tethers.push({
      id: String(tether.id || ''),
      ownerId: tether.ownerId,
      targetId: tether.targetId,
      length,
      restLength: num(tether.restLength, length),
    });
  }
  const visible = { tick, contacts, obstacles, tethers };
  if (!memory) return delayTicks === 0 ? visible : emptySensed();
  if (!Array.isArray(memory.delay)) memory.delay = [];
  const history = memory.delay;
  const last = history.at(-1);
  // A new timeline must not inherit observations from the discarded future.
  if (last && (!Number.isSafeInteger(last.tick) || last.tick > tick)) history.length = 0;
  else if (last && last.tick === tick) history.pop();
  // copyContact already detached the payload. A JSON round trip here only added churn.
  history.push(visible);
  const due = tick - delayTicks;
  let sample = null;
  let dueIndex = -1;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i] && Number.isSafeInteger(history[i].tick) && history[i].tick <= due) {
      sample = history[i];
      dueIndex = i;
      break;
    }
  }
  // Keep the newest due frame and all still-delayed frames, not a count of calls.
  if (dueIndex > 0) history.splice(0, dueIndex);
  const keep = Math.max(2, delayTicks + 2);
  if (history.length > keep) history.splice(0, history.length - keep);

  if (!sample) return emptySensed();
  return {
    tick: sample.tick,
    contacts: sample.contacts || [],
    obstacles: sample.obstacles || [],
    tethers: sample.tethers || [],
  };
}

export function contactByRole(sensed, role) {
  const list = sensed && sensed.contacts;
  if (!list) return null;
  for (const contact of list) {
    if (contact && contact.role === role && contact.alive !== false) return contact;
  }
  return null;
}

export function contactById(sensed, id) {
  const list = sensed && sensed.contacts;
  if (!list || id == null) return null;
  for (const contact of list) {
    if (contact && contact.id === id) return contact;
  }
  return null;
}

/**
 * A recycled entity id is a different body. Drop a commit whose target generation changed.
 * Returns true when a commit was cleared.
 */
export function forgetStaleIdentity(memory, sensed) {
  if (!memory || !memory.commit || memory.commit.targetId == null) return false;
  const contact = contactById(sensed, memory.commit.targetId);
  if (!contact) return false;
  if (contact.generation === memory.commit.targetGeneration) return false;
  memory.commit = null;
  memory.latchIssued = false;
  memory.phase = 'fallback';
  memory.phaseSince = sensed && Number.isInteger(sensed.tick) ? sensed.tick : memory.phaseSince;
  if (!memory.identity || typeof memory.identity !== 'object') memory.identity = {};
  memory.identity[String(contact.id)] = { id: contact.id, generation: contact.generation };
  return true;
}

export function predictReleasePoint(anchor, body, ticksAhead) {
  if (!anchor || !anchor.pos || !body || !body.pos) return null;
  const rx = body.pos.x - anchor.pos.x;
  const rz = body.pos.z - anchor.pos.z;
  const radius = Math.hypot(rx, rz);
  if (radius < 1) return { x: anchor.pos.x, z: anchor.pos.z };
  const tx = -rz / radius;
  const tz = rx / radius;
  const tangential = num(body.vel && body.vel.x) * tx + num(body.vel && body.vel.z) * tz;
  // The live massline and hull drag bleed orbital speed. A constant-omega coast
  // over-runs the body the hunter is trying to meet.
  const omega = (tangential / radius) * 0.62;
  const angle = Math.atan2(rz, rx) + omega * (num(ticksAhead) / 60);
  return {
    x: anchor.pos.x + Math.cos(angle) * radius,
    z: anchor.pos.z + Math.sin(angle) * radius,
  };
}
