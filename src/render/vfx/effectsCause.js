// Decisions for cause-readable effects. Presentation only: no sim writes.
// Geometry that must be seen is drawn by causeMarks.js from these records.

const num = (v) => (Number.isFinite(v) ? v : 0);

/** Plume the plasma stream should draw. Leaves the published drive record alone. */
export function plumeAchievedPicture(driveInfo, actuators) {
  const src = driveInfo || {};
  const out = {
    drive: num(src.drive),
    throttle: num(src.throttle),
    speed: num(src.speed),
    speedDrive: num(src.speedDrive),
    boost: num(src.boost),
    cruise: num(src.cruise),
    reverse: num(src.reverse),
    retroOnly: !!src.retroOnly,
    brake: num(src.brake),
    dashFired: !!src.dashFired,
    picture: 'jet',
  };
  if (!actuators) return out;
  const main = Math.max(0, num(actuators.main));
  if (out.retroOnly || (out.reverse > 0.05 && main <= 0.02)) {
    out.drive = 0;
    out.throttle = 0;
    out.speedDrive = 0;
    out.picture = 'retro-dark';
    return out;
  }
  if (out.boost > 0.5) {
    out.picture = 'boost';
    return out;
  }
  if (main <= 0.02) {
    if (out.throttle > 0.2 || out.drive > 0.2) {
      // Key is held, the actuator is not doing work: a bell, not a contrail.
      out.throttle = 0.02;
      out.drive = 0.02;
      out.speedDrive = 0;
      out.picture = 'idle-bell';
    } else {
      out.throttle = 0;
      out.drive = 0;
      out.speedDrive = 0;
      out.picture = 'coast-dark';
    }
    return out;
  }
  const work = Math.max(0, Math.min(1.15, main));
  out.throttle = work;
  out.drive = work;
  out.picture = 'work';
  return out;
}

/** Unsigned hull contacts. The grammar treats an unknown class as a pinprick, so the middle band must say slam itself. */
export function collisionEventClass(severity) {
  const s = Number(severity);
  if (!(s >= 0)) return undefined;
  if (s < 0.22) return 'graze';
  if (s >= 0.8) return 'breakup';
  return 'slam';
}

export function createScarBook(capacity = 24) {
  return { capacity, slots: [], serial: 1 };
}

export function noteHullScar(book, hit) {
  if (!book || hit == null || hit.hullId == null) return null;
  const lx = num(hit.lx);
  const lz = num(hit.lz);
  const len = Math.hypot(num(hit.tx), num(hit.tz)) || 1;
  const ux = num(hit.tx) / len;
  const uz = num(hit.tz) / len;
  for (let i = 0; i < book.slots.length; i++) {
    const slot = book.slots[i];
    if (slot.hullId !== hit.hullId) continue;
    if (Math.hypot(slot.lx - lx, slot.lz - lz) <= 1.2) {
      slot.severity = Math.max(slot.severity, num(hit.severity));
      return slot;
    }
  }
  let slot;
  if (book.slots.length >= book.capacity) {
    slot = book.slots[0];
    for (let i = 1; i < book.slots.length; i++) {
      if (book.slots[i].born < slot.born) slot = book.slots[i];
    }
    slot.payload = null;
  } else {
    slot = {};
    book.slots.push(slot);
  }
  slot.hullId = hit.hullId;
  slot.lx = lx;
  slot.lz = lz;
  slot.ux = ux;
  slot.uz = uz;
  slot.severity = num(hit.severity) || 0.2;
  slot.born = num(hit.now);
  slot.serial = book.serial++;
  return slot;
}

export function scarHalfLength(slot, now) {
  const age = Math.max(0, num(now) - num(slot && slot.born));
  const grow = Math.min(1, age / 0.4);
  const base = 0.35 + Math.min(1, num(slot && slot.severity)) * 1.4;
  return base * (0.2 + 0.8 * grow);
}

export function hullLocalHit(hull, x, z, tx, tz) {
  const rot = num(hull && hull.rot);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const dx = num(x) - num(hull && hull.pos && hull.pos.x);
  const dz = num(z) - num(hull && hull.pos && hull.pos.z);
  return {
    lx: c * dx + s * dz,
    lz: -s * dx + c * dz,
    tx: c * num(tx) + s * num(tz),
    tz: -s * num(tx) + c * num(tz),
  };
}

export function scarWorldEnds(slot, hull, now) {
  if (!slot || !hull || hull.alive === false || !hull.pos) return null;
  const rot = num(hull.rot);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const half = scarHalfLength(slot, now);
  const ends = [
    { lx: slot.lx + slot.ux * half, lz: slot.lz + slot.uz * half },
    { lx: slot.lx - slot.ux * half, lz: slot.lz - slot.uz * half },
  ];
  return {
    ax: hull.pos.x + c * ends[0].lx - s * ends[0].lz,
    az: hull.pos.z + s * ends[0].lx + c * ends[0].lz,
    bx: hull.pos.x + c * ends[1].lx - s * ends[1].lz,
    bz: hull.pos.z + s * ends[1].lx + c * ends[1].lz,
  };
}

export function releaseHullScars(book, hullId) {
  if (!book) return;
  book.slots = book.slots.filter((slot) => slot.hullId !== hullId);
}

export function createHandoffBook() {
  return { pending: [], active: null };
}

export function noteKillHandoff(book, kill, now) {
  if (!book || !kill) return null;
  const pres = kill.presentation || {};
  const pos = pres.position || kill.pos || null;
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
  const vel = pres.targetVelocity || kill.targetVelocity || kill.vel || {};
  const normal = pres.normal || pres.direction || {};
  const rec = {
    victimId: kill.id,
    x: pos.x,
    z: pos.z,
    vx: num(vel.x),
    vz: num(vel.z),
    nx: num(normal.x),
    nz: num(normal.z) || 1,
    at: num(now),
    wreckId: null,
    bound: false,
  };
  book.pending.push(rec);
  if (book.pending.length > 4) book.pending.shift();
  return rec;
}

export function offerWreckHandoff(book, entity, now) {
  if (!book || !entity || entity.type !== 'wreck' || !entity.pos) return null;
  if (book.active && book.active.wreckId === entity.id && num(now) < book.active.until) return null;
  let best = null;
  let bestD = 48;
  const t = num(now);
  for (let i = 0; i < book.pending.length; i++) {
    const pending = book.pending[i];
    if (pending.bound) continue;
    if (t - pending.at > 1.4) continue;
    const d = Math.hypot(entity.pos.x - pending.x, entity.pos.z - pending.z);
    if (d < bestD) {
      best = pending;
      bestD = d;
    }
  }
  if (!best) return null;
  best.bound = true;
  best.wreckId = entity.id;
  book.active = {
    wreckId: entity.id,
    vx: best.vx,
    vz: best.vz,
    nx: best.nx,
    nz: best.nz,
    until: t + 0.7,
    flashed: false,
  };
  return book.active;
}

/** Bind a pending kill only to a wreck id that is already in the entity book. */
export function bindKillStreak(book, entities, now) {
  if (!book || !book.pending || !book.pending.length || !entities || typeof entities.get !== 'function') {
    return null;
  }
  const t = num(now);
  let waiting = false;
  for (let i = 0; i < book.pending.length; i++) {
    const pending = book.pending[i];
    if (!pending.bound && t - pending.at <= 1.4) waiting = true;
  }
  if (!waiting || typeof entities.values !== 'function') return null;
  let bound = null;
  for (let i = 0; i < book.pending.length; i++) {
    const pending = book.pending[i];
    if (pending.bound || t - pending.at > 1.4) continue;
    let best = null;
    let bestD = 48;
    for (const entity of entities.values()) {
      if (!entity || entity.type !== 'wreck' || entity.id == null || !entity.pos) continue;
      if (entities.get(entity.id) !== entity) continue;
      const d = Math.hypot(entity.pos.x - pending.x, entity.pos.z - pending.z);
      if (d < bestD) {
        best = entity;
        bestD = d;
      }
    }
    if (!best) continue;
    const hand = offerWreckHandoff(book, best, t);
    if (hand) bound = hand;
  }
  return bound;
}

/** Play-plane streak on that wreck, or nothing when the book has no such id. */
export function wreckStreakOn(book, entities, now, out) {
  const active = book && book.active;
  if (!active || active.wreckId == null || !entities || typeof entities.get !== 'function') return null;
  if (num(now) > num(active.until)) return null;
  const wreck = entities.get(active.wreckId);
  if (!wreck || wreck.id !== active.wreckId || wreck.type !== 'wreck' || wreck.alive === false || !wreck.pos) {
    return null;
  }
  const speed = Math.hypot(active.vx, active.vz);
  const dx = speed > 1 ? active.vx / speed : active.nx;
  const dz = speed > 1 ? active.vz / speed : active.nz;
  const len = 2.4 + Math.min(6, speed * 0.02);
  const dest = out || {};
  dest.wreckId = wreck.id;
  dest.ax = wreck.pos.x;
  dest.az = wreck.pos.z;
  dest.bx = wreck.pos.x + (Number.isFinite(dx) ? dx : 1) * len;
  dest.bz = wreck.pos.z + (Number.isFinite(dz) ? dz : 0) * len;
  return dest;
}

export function createSpectacleBook() {
  return { events: [] };
}

export function spectacleFor(book, kind, now, x, z, reduced) {
  const px = num(x);
  const pz = num(z);
  const t = num(now);
  let dup = false;
  if (!book.events) book.events = [];
  for (let i = book.events.length - 1; i >= 0; i--) {
    const ev = book.events[i];
    if (t - ev.t > 0.45) {
      book.events.splice(i, 1);
      continue;
    }
    if (ev.kind === kind && t - ev.t < 0.12 && Math.hypot(ev.x - px, ev.z - pz) < 8) dup = true;
  }
  book.events.push({ kind, t, x: px, z: pz });
  const kinds = new Set();
  for (let i = 0; i < book.events.length; i++) {
    if (t - book.events[i].t <= 0.45) kinds.add(book.events[i].kind);
  }
  const crowded = kinds.has('release') && kinds.has('field') && kinds.has('impact');
  if (dup) {
    return {
      drawSprites: false,
      priorityScale: 0.2,
      peakScale: reduced ? 0.12 : 0,
      shape: true,
      crowded,
      vanish: false,
    };
  }
  let peakScale = reduced ? 0.12 : 1;
  let priorityScale = 1;
  if (crowded && kind === 'impact') {
    peakScale = reduced ? 0.12 : 0.62;
    priorityScale = 0.72;
  }
  return { drawSprites: true, priorityScale, peakScale, shape: true, crowded, vanish: false };
}

/** A second bomb in the same place drops the extra flash. The detonation shape stays. */
export function duplicateBombDropsFlash(gate) {
  return !!(gate && gate.drawSprites === false && gate.shape === true);
}

export function createProjectileBodies() {
  return new Map();
}

export function stepProjectileBody(book, entity, dt) {
  if (!book || !entity || entity.id == null || !entity.pos) {
    return { stopped: true, reset: false, span: 0 };
  }
  const x = num(entity.pos.x);
  const z = num(entity.pos.z);
  let rec = book.get(entity.id);
  if (!rec) {
    rec = { x, z, stopped: false, reset: false, span: 0 };
    book.set(entity.id, rec);
    forgetDeadShots(book);
    return rec;
  }
  if (rec.stopped || entity.alive === false) {
    rec.stopped = true;
    rec.span = 0;
    forgetDeadShots(book);
    return rec;
  }
  const jump = Math.hypot(x - rec.x, z - rec.z);
  const frame = Math.max(0.016, num(dt) || 0.016);
  const speed = Math.hypot(num(entity.vel && entity.vel.x), num(entity.vel && entity.vel.z));
  const expected = speed * frame * 4 + 8;
  if (jump > Math.max(48, expected)) {
    rec.reset = true;
    rec.span = 0;
  } else {
    rec.reset = false;
    rec.span = jump;
  }
  rec.x = x;
  rec.z = z;
  forgetDeadShots(book);
  return rec;
}

/** Over the cap, drop stopped shots only. A live trail is not a free slot. */
function forgetDeadShots(book) {
  if (!book || book.size <= 256) return;
  for (const [id, row] of book) {
    if (row && row.stopped) book.delete(id);
  }
}

export function stopProjectileBody(book, id) {
  if (!book || id == null) return;
  const rec = book.get(id) || { x: 0, z: 0, span: 0, reset: false, stopped: false };
  rec.stopped = true;
  rec.span = 0;
  book.set(id, rec);
  forgetDeadShots(book);
}

export function fieldDodgeEdge(field) {
  const radius = Number(field && field.radius);
  if (!(radius > 0)) return { alive: false, drawDisc: false, radius: 0, shape: 'none' };
  const expire = Number(field && field.expireAt);
  const now = Number(field && field.now);
  if (Number.isFinite(expire) && Number.isFinite(now) && now >= expire) {
    return { alive: false, drawDisc: false, radius, shape: 'expired' };
  }
  const dx = num(field && field.dirX) || 1;
  const dz = num(field && field.dirZ);
  const len = Math.hypot(dx, dz) || 1;
  return {
    alive: true,
    drawDisc: false,
    radius,
    dirX: dx / len,
    dirZ: dz / len,
    shape: 'edge',
  };
}

export function bombPhasePicture(data, now, reduced) {
  const phase = data && data.phase;
  const armed = !!(data && data.armed);
  let name = 'unarmed';
  let silhouette = 'growing-collar';
  let motion = 'arm-sweep';
  if (phase === 'field' || phase === 'spent') {
    name = 'detonated';
    silhouette = 'payload-consequence';
    motion = 'consequence';
  } else if (phase === 'warning') {
    name = 'near-fuse';
    silhouette = 'tight-collar';
    motion = reduced ? 'held-shiver' : 'shiver';
  } else if (armed) {
    name = 'armed';
    silhouette = 'closed-collar';
    motion = reduced ? 'still-collar' : 'slow-turn';
  }
  return {
    phase: name,
    silhouette,
    motion,
    vanish: false,
    colorOnly: false,
    reduced: !!reduced,
    now: num(now),
  };
}

export function attachedHazardPose(sample, prev, teleport = 80) {
  if (!sample || !Number.isFinite(sample.x) || !Number.isFinite(sample.z)) {
    return { reset: true, x: 0, z: 0, trail: false };
  }
  if (!prev || !Number.isFinite(prev.x) || !Number.isFinite(prev.z)) {
    return { reset: false, x: sample.x, z: sample.z, trail: false };
  }
  const jump = Math.hypot(sample.x - prev.x, sample.z - prev.z);
  if (jump > teleport) return { reset: true, x: sample.x, z: sample.z, trail: false };
  return { reset: false, x: sample.x, z: sample.z, trail: true, fromX: prev.x, fromZ: prev.z };
}

export function releaseCuePicture(ux, uz, vx, vz, reduced) {
  const chord = Math.hypot(num(ux), num(uz)) || 1;
  return {
    tangent: { x: num(ux) / chord, z: num(uz) / chord },
    ballistic: { x: num(vx), z: num(vz) },
    ghostRope: false,
    aimDiamond: false,
    vanish: false,
    decay: reduced ? 'static-tangent' : 'cable-then-ballistic',
    peakScale: reduced ? 0.12 : 1,
  };
}

/** The cut the cable actually was: one segment on the tangent, never a camera-facing flash. */
export function releaseCutMark(cue, endpoints) {
  if (!cue || cue.vanish || cue.sprite || !endpoints) return null;
  const ax = Number(endpoints.ax);
  const az = Number(endpoints.az);
  const bx = Number(endpoints.bx);
  const bz = Number(endpoints.bz);
  if (![ax, az, bx, bz].every(Number.isFinite)) return null;
  const tx = cue.tangent && Number.isFinite(cue.tangent.x) ? cue.tangent.x : 0;
  const tz = cue.tangent && Number.isFinite(cue.tangent.z) ? cue.tangent.z : 0;
  const gain = Math.max(0.1, Number(cue.peakScale) > 0 ? Number(cue.peakScale) : 0.1);
  return {
    ax, az, bx, bz, tx, tz,
    gain,
    vanish: false,
    sprite: false,
    reduced: cue.decay === 'static-tangent',
  };
}

export function machineryPicture(native, paused, reduced) {
  const mode = native && (native.power || native.status || native.mode);
  if (mode === 'power-off' || mode === 'offline' || native?.powered === false) {
    return { advance: false, silhouette: 'dark-arm', phaseHold: true, vanish: false };
  }
  if (mode === 'jammed' || native?.jammed === true) {
    return { advance: false, silhouette: 'bound-arm', phaseHold: true, vanish: false };
  }
  if (paused) return { advance: false, silhouette: 'operating', phaseHold: true, vanish: false };
  if (reduced) return { advance: false, silhouette: 'operating-still', phaseHold: true, vanish: false };
  return { advance: true, silhouette: 'operating', phaseHold: false, vanish: false };
}

export function ricochetSecondPath(into, terminated) {
  if (terminated) return null;
  if (!(into > 0) || into > 0.38) return null;
  return { showOutgoing: true, into };
}

export function createEffectOwner(capacity = 8) {
  return { capacity, live: [], free: [] };
}

export function effectCreate(owner, kind) {
  const slot = owner.free.pop() || { id: owner.live.length + owner.free.length + 1 };
  slot.kind = kind;
  slot.phase = 'create';
  slot.age = 0;
  slot.payload = null;
  owner.live.push(slot);
  return slot;
}

export function effectSustain(slot, dt) {
  slot.phase = 'sustain';
  slot.age += Math.max(0, num(dt));
}

export function effectInterrupt(slot) {
  slot.phase = 'interrupt';
}

export function effectDecay(slot, dt) {
  slot.phase = 'decay';
  slot.age += Math.max(0, num(dt));
}

export function effectDispose(owner, slot) {
  slot.phase = 'dispose';
  slot.payload = null;
  slot.kind = null;
  slot.age = 0;
  const index = owner.live.indexOf(slot);
  if (index >= 0) owner.live.splice(index, 1);
  owner.free.push(slot);
}

export function effectReuse(owner, slot, kind) {
  effectDispose(owner, slot);
  const next = effectCreate(owner, kind);
  if (next.payload != null || next.kind !== kind || next.age !== 0) {
    throw new Error('effect reuse leaked the previous life');
  }
  return next;
}

export const CAUSE_SILHOUETTES = Object.freeze({
  undock: Object.freeze({ silhouette: 'reversed-cradle', motion: 'depart-along-outward', primitive: 'compression' }),
  jettison: Object.freeze({ silhouette: 'fling', motion: 'along-impulse', primitive: 'pressure' }),
  stationArm: Object.freeze({ silhouette: 'reach', motion: 'operating', primitive: 'connection' }),
  stationArmJammed: Object.freeze({ silhouette: 'bound-reach', motion: 'held', primitive: 'capture' }),
  stationArmDark: Object.freeze({ silhouette: 'dark-reach', motion: 'still', primitive: 'connection' }),
  planetHarvest: Object.freeze({ silhouette: 'collector-arc', motion: 'intake', primitive: 'deposition' }),
  planetPlunge: Object.freeze({ silhouette: 'plunge-sheath', motion: 'along-fall', primitive: 'compression' }),
  planetRecovery: Object.freeze({ silhouette: 'burn-wake', motion: 'aft', primitive: 'compression' }),
  planetDeny: Object.freeze({ silhouette: 'refused-deposit', motion: 'still', primitive: 'deposition', hud: false }),
  pod: Object.freeze({ silhouette: 'capsule', family: 'cargo' }),
  wreck: Object.freeze({ silhouette: 'opened-hull', family: 'metal' }),
});

const CAUSE_SILHOUETTE_EVENT = Object.freeze({
  'dock:undocked': 'undock',
  'cargo:jettisoned': 'jettison',
  'planet:plungeStage': 'planetPlunge',
  'planet:recoveryBurn': 'planetRecovery',
  'planet:collector': 'planetHarvest',
  'planet:harvestDenied': 'planetDeny',
});

function silhouetteSeg(ox, oz, ux, uz, px, pz, a0, a1, b0, b1) {
  return {
    ax: ox + ux * a0 + px * a1,
    az: oz + uz * a0 + pz * a1,
    bx: ox + ux * b0 + px * b1,
    bz: oz + uz * b0 + pz * b1,
  };
}

/** Play-plane shape from the silhouette table. A generic verb stroke is not this picture. */
export function causeSilhouetteSegments(eventName, x, z, dx, dz) {
  const spec = CAUSE_SILHOUETTES[CAUSE_SILHOUETTE_EVENT[eventName]];
  if (!spec) return null;
  const ox = Number(x);
  const oz = Number(z);
  if (!Number.isFinite(ox) || !Number.isFinite(oz)) return null;
  let ux = Number(dx);
  let uz = Number(dz);
  const span = Math.hypot(ux, uz);
  if (!(span > 1e-6)) {
    ux = 1;
    uz = 0;
  } else {
    ux /= span;
    uz /= span;
  }
  const px = -uz;
  const pz = ux;
  const line = (a0, a1, b0, b1) => silhouetteSeg(ox, oz, ux, uz, px, pz, a0, a1, b0, b1);
  let segments = null;
  if (spec.silhouette === 'reversed-cradle') {
    segments = [line(0.2, 0.9, -1.2, 0.4), line(0.2, -0.9, -1.2, -0.4), line(-1.2, 0.4, -1.2, -0.4)];
  } else if (spec.silhouette === 'fling') {
    segments = [line(-0.3, 0.75, 1.4, 0), line(-0.3, -0.75, 1.4, 0)];
  } else if (spec.silhouette === 'plunge-sheath') {
    segments = [line(1.7, 0.18, -1.5, 0.55), line(1.7, -0.18, -1.5, -0.55), line(1.7, 0.18, 1.7, -0.18)];
  } else if (spec.silhouette === 'burn-wake') {
    segments = [line(0.15, 0, 1.9, 0), line(0.35, 0, 1.7, 0.6), line(0.35, 0, 1.7, -0.6)];
  } else if (spec.silhouette === 'collector-arc') {
    segments = [line(0.15, 1.15, 1.05, 0.4), line(1.05, 0.4, 1.05, -0.4), line(1.05, -0.4, 0.15, -1.15)];
  } else if (spec.silhouette === 'refused-deposit') {
    segments = [line(-0.2, 0.85, -0.2, -0.85), line(0.4, 0.85, 0.4, -0.85)];
  }
  if (!segments) return null;
  return {
    silhouette: spec.silhouette,
    motion: spec.motion,
    sprite: false,
    vanish: false,
    hud: spec.hud === false ? false : true,
    segments,
  };
}
