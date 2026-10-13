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
  if (!contact || contact.id == null) return null;
  return {
    id: contact.id,
    generation: Number.isInteger(contact.generation) ? contact.generation : 1,
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

export function segmentBlocked(from, to, obstacles, pad = 0) {
  if (!from || !to || !obstacles) return false;
  for (const obstacle of obstacles) {
    if (!obstacle || !obstacle.pos) continue;
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
 * Mutates `memory.delay` only. `self` is returned live: a hull knows its own pose.
 */
export function limitKnowledge(world, doctrine, memory, tick) {
  const range = Math.max(0, num(doctrine && doctrine.sensorRange, 0));
  const delayTicks = Math.max(0, num(doctrine && doctrine.reactionDelayTicks, 0));
  const self = world && world.self;
  const origin = self && self.pos ? self.pos : { x: 0, z: 0 };
  const obstacles = [];
  for (const obstacle of (world && world.obstacles) || []) {
    const copy = copyContact(obstacle);
    if (!copy) continue;
    if (Math.hypot(copy.pos.x - origin.x, copy.pos.z - origin.z) > range + copy.radius) continue;
    obstacles.push(copy);
  }
  const contacts = [];
  for (const contact of (world && world.contacts) || []) {
    const copy = copyContact(contact);
    if (!copy || copy.alive === false) continue;
    const dist = Math.hypot(copy.pos.x - origin.x, copy.pos.z - origin.z);
    if (dist > range) continue;
    if (segmentBlocked(origin, copy.pos, obstacles.filter((obstacle) => obstacle.id !== copy.id), 0)) continue;
    contacts.push(copy);
  }
  const tethers = [];
  for (const tether of (world && world.tethers) || []) {
    if (!tether) continue;
    const length = num(tether.length);
    if (length > range && tether.ownerId !== (self && self.id) && tether.targetId !== (self && self.id)) continue;
    tethers.push({
      id: String(tether.id || ''),
      ownerId: tether.ownerId,
      targetId: tether.targetId,
      length,
      restLength: num(tether.restLength, length),
    });
  }
  const visible = { tick, contacts, obstacles, tethers };
  if (memory) {
    if (!Array.isArray(memory.delay)) memory.delay = [];
    memory.delay.push(JSON.parse(JSON.stringify(visible)));
    const keep = Math.max(4, delayTicks + 2);
    while (memory.delay.length > keep) memory.delay.shift();
  }
  const due = tick - delayTicks;
  let sample = null;
  if (memory && memory.delay) {
    for (const row of memory.delay) {
      if (row && row.tick <= due) sample = row;
    }
  }
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
