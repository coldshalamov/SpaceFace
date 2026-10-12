// Isolated match session. Bodies live here, not in the persistent world.
// Fixed step, injected seed, no Math.random, no player-hull knockback.

import { mulberry32, hash32 } from '../../core/rng.js';
import { FIELD_KINDS } from '../../data/fields.js';
import { legalShot } from '../../characters/bracketRules.js';
import { ARENAS } from './arenas.js';
import { EVENTS, WIN_KINDS, eventById } from './circuit.js';
import {
  DT,
  clamp,
  speedOf,
  sweptDiskCross,
  sweptEnterDisk,
  wholeDiskInside,
  headingOf,
} from './geometry.js';
import {
  makeBody,
  makeCircle,
  makeSegment,
  buildFields,
  integrateMatch,
  bodyByRole,
  snapshotBody,
  assertFiniteSession,
} from './stepper.js';
import { rivalForceFor } from './rivals.js';
import {
  freshLeagueMemory,
  normalizeLeagueMemory,
  tierUnlocked,
  noteAttempt,
  noteResult,
} from './memory.js';

const IDLE = Object.freeze({ thrustX: 0, thrustZ: 0, tether: false, cut: false });

function shipBody(spec, id) {
  return makeBody({
    id,
    role: 'ship',
    x: spec.x,
    z: spec.z,
    radius: spec.radius,
    mass: spec.mass,
    restitution: 0.15,
    drag: 0.6,
    knockback: false,
    maxSpeed: spec.maxSpeed,
    maxAccel: spec.maxAccel,
  });
}

function northGapRails(rails, gap) {
  const z = rails.north;
  const half = gap;
  return [
    makeSegment({ id: 'rail-n-w', tag: 'rail', railId: 'north', x1: rails.left, z1: z, x2: -half, z2: z, restitution: 0.92 }),
    makeSegment({ id: 'rail-n-e', tag: 'rail', railId: 'north', x1: half, z1: z, x2: rails.right, z2: z, restitution: 0.92 }),
  ];
}

function boxRails(bounds, restitution, openNorth) {
  const { minX, maxX, minZ, maxZ } = bounds;
  const rails = [
    makeSegment({ id: 'bound-w', tag: 'rail', railId: 'west', x1: minX, z1: minZ, x2: minX, z2: maxZ, restitution }),
    makeSegment({ id: 'bound-e', tag: 'rail', railId: 'east', x1: maxX, z1: minZ, x2: maxX, z2: maxZ, restitution }),
    makeSegment({ id: 'bound-s', tag: 'rail', railId: 'south', x1: minX, z1: maxZ, x2: maxX, z2: maxZ, restitution }),
  ];
  if (!openNorth) {
    rails.push(makeSegment({
      id: 'bound-n', tag: 'rail', railId: 'north', x1: minX, z1: minZ, x2: maxX, z2: minZ, restitution,
    }));
  }
  return rails;
}

function buildVenue(event, rng) {
  const arena = ARENAS[event.arena];
  const bodies = [];
  const solids = [];
  const fields = [];
  bodies.push(shipBody(arena.ship, 'ship'));
  if (event.sport === 'keeper') {
    const b = arena.ball;
    bodies.push(makeBody({
      id: 'ball', role: 'ball', x: b.x, z: b.z, radius: b.radius, mass: b.mass,
      restitution: b.restitution, drag: b.drag, maxSpeed: b.maxSpeed,
    }));
    const k = arena.keeper;
    bodies.push(makeBody({
      id: 'keeper', role: 'keeper', x: k.x, z: k.z, radius: k.radius, mass: k.mass,
      restitution: k.restitution, drag: 1.2, maxSpeed: 48,
    }));
    for (const post of arena.posts) {
      solids.push(makeCircle({ id: `post-${post.x < 0 ? 'l' : 'r'}`, tag: 'post', x: post.x, z: post.z, radius: post.radius, restitution: 0.5 }));
    }
    for (const bumper of arena.bumpers) {
      solids.push(makeCircle({ id: `bumper-${bumper.x < 0 ? 'l' : 'r'}`, tag: 'bumper', x: bumper.x, z: bumper.z, radius: bumper.radius, restitution: 0.9 }));
    }
    solids.push(...boxRails(arena.bounds, 0.4, true));
  } else if (event.sport === 'bank') {
    const b = arena.ball;
    bodies.push(makeBody({
      id: 'ball', role: 'ball', x: b.x, z: b.z, radius: b.radius, mass: b.mass,
      restitution: b.restitution, drag: b.drag, maxSpeed: b.maxSpeed,
    }));
    const rails = arena.rails;
    const gap = event.narrow ? 9 : rails.gap;
    solids.push(
      makeSegment({ id: 'rail-w', tag: 'rail', railId: 'west', x1: rails.left, z1: rails.north, x2: rails.left, z2: rails.south, restitution: 0.93 }),
      makeSegment({ id: 'rail-e', tag: 'rail', railId: 'east', x1: rails.right, z1: rails.north, x2: rails.right, z2: rails.south, restitution: 0.93 }),
      makeSegment({ id: 'rail-s', tag: 'rail', railId: 'south', x1: rails.left, z1: rails.south, x2: rails.right, z2: rails.south, restitution: 0.93 }),
      ...northGapRails(rails, gap),
    );
    solids.push(makeCircle({ id: 'post-l', tag: 'post', x: -gap, z: rails.north, radius: 2.4, restitution: 0.4 }));
    solids.push(makeCircle({ id: 'post-r', tag: 'post', x: gap, z: rails.north, radius: 2.4, restitution: 0.4 }));
  } else if (event.sport === 'curl') {
    const s = arena.stone;
    bodies.push(makeBody({
      id: 'stone', role: 'stone', x: s.x, z: s.z, radius: s.radius, mass: s.mass,
      restitution: s.restitution, drag: s.drag, maxSpeed: s.maxSpeed,
    }));
    if (event.guard) {
      const g = arena.guard;
      solids.push(makeCircle({ id: 'guard', tag: 'guard', x: g.x, z: g.z, radius: g.radius, restitution: 0.55 }));
    }
    solids.push(...boxRails(arena.bounds, 0.15, false));
  } else if (event.sport === 'relay') {
    const p = arena.payload;
    bodies.push(makeBody({
      id: 'payload', role: 'payload', x: p.x, z: p.z, radius: p.radius, mass: p.mass,
      restitution: p.restitution, drag: p.drag, maxSpeed: p.maxSpeed,
    }));
    if (event.rival === 'charge') {
      const c = arena.charge;
      bodies.push(makeBody({
        id: 'charge', role: 'charge', x: c.x, z: c.z, radius: c.radius, mass: c.mass,
        restitution: 0.2, drag: 1.4, maxSpeed: 42,
      }));
    }
    solids.push(...boxRails(arena.bounds, 0.35, true));
  } else if (event.sport === 'magnet') {
    const b = arena.magnetBall;
    bodies.push(makeBody({
      id: 'ball', role: 'ball', x: b.x, z: b.z, radius: b.radius, mass: b.mass,
      restitution: b.restitution, drag: b.drag, maxSpeed: b.maxSpeed,
      fieldType: 'pickup', fieldResponseMult: 1,
    }));
    const pillar = arena.pillar;
    solids.push(makeCircle({ id: 'pillar', tag: 'post', x: pillar.x, z: pillar.z, radius: pillar.radius, restitution: 0.35 }));
    solids.push(...boxRails(arena.bounds, 0.3, false));
    const well = arena.well;
    fields.push({
      id: 'league-well',
      kind: FIELD_KINDS.WELL,
      center: { x: well.x, z: well.z },
      radius: well.radius,
      strength: well.strength,
      falloff: well.falloff,
      damping: well.damping,
      durationS: Infinity,
      createdAt: 0,
    });
    if (event.polarity === 'both') {
      const rep = arena.repulsor;
      fields.push({
        id: 'league-repulsor',
        kind: FIELD_KINDS.REPULSOR,
        center: { x: rep.x, z: rep.z },
        radius: rep.radius,
        strength: rep.strength,
        falloff: rep.falloff,
        damping: rep.damping,
        durationS: Infinity,
        createdAt: 0,
      });
    }
  } else if (event.sport === 'contain') {
    const pen = arena.pen;
    const count = event.puckCount || 3;
    for (let i = 0; i < count; i++) {
      const ang = rng() * Math.PI * 2;
      const spd = event.puckSpeed * (0.75 + rng() * 0.35);
      const ring = 8 + i * 1.4;
      bodies.push(makeBody({
        id: `puck-${i}`,
        role: 'puck',
        x: pen.x + Math.cos(ang) * ring,
        z: pen.z + Math.sin(ang) * ring,
        vx: Math.cos(ang) * spd,
        vz: Math.sin(ang) * spd,
        radius: 3,
        mass: 9,
        restitution: 0.12,
        drag: 0.55,
        maxSpeed: 28,
      }));
    }
    solids.push(...boxRails(arena.bounds, 0.4, false));
  } else {
    throw new Error(`unhandled sport ${event.sport}`);
  }
  return { bodies, solids, fields: buildFields(fields) };
}

function freshRuntime(event, opts) {
  const seed = Number.isFinite(opts.seed) ? (opts.seed >>> 0) || 1 : (event.exhibitSeed >>> 0);
  const rng = mulberry32(hash32(seed, event.id, 'league'));
  const venue = buildVenue(event, rng);
  const ball = venue.bodies.find((b) => b.role === 'ball' || b.role === 'stone' || b.role === 'payload');
  return {
    ok: true,
    event,
    arena: ARENAS[event.arena],
    winKind: WIN_KINDS[event.sport],
    seed,
    rngState: rng.getState(),
    practice: opts.practice === true,
    memory: opts.memory || freshLeagueMemory(),
    inventory: opts.inventory || null,
    shipId: opts.shipId || 'player-ship',
    solution: opts.solution || event.solution,
    bodies: venue.bodies,
    solids: venue.solids,
    fields: venue.fields,
    rivalForce: event.rival ? rivalForceFor(event.rival) : null,
    rival: null,
    tether: null,
    tetherReach: event.sport === 'contain' ? 28 : 20,
    phase: 'play',
    reason: null,
    simTime: 0,
    shotTime: 0,
    tick: 0,
    score: 0,
    shots: 0,
    shotLive: true,
    goals: 0,
    banksRequired: event.banksRequired || 0,
    legalTransfers: 0,
    transfersRequired: event.transfers || 0,
    bend: 0,
    launchHeading: null,
    streak: 0,
    settle: 0,
    recorded: false,
    playerTouched: false,
    touchAt: -100,
    lastTouch: null,
    servePos: ball ? { x: ball.x, z: ball.z } : { x: 0, z: 0 },
    railsHit: [],
    railAt: {},
    bankContacts: 0,
    postHits: 0,
    bumperHits: 0,
    guardHits: 0,
    keeperTouches: 0,
    stolen: false,
    tunnel: false,
    respawns: 0,
    left: false,
    fieldSuppressed: opts.suppressField === true,
    log: [],
    samples: [],
    contacts: [],
  };
}

export function createSession(eventId, opts = {}) {
  const event = eventById(eventId);
  if (!event) return { ok: false, reason: 'unknown-event', phase: 'rejected' };
  const memory = opts.memory && opts.memory.version === 1 && opts.memory.records
    ? opts.memory
    : normalizeLeagueMemory(opts.memory);
  if (!opts.practice && opts.enforceTier !== false) {
    if (!tierUnlocked(memory, event.tier, EVENTS)) {
      return { ok: false, reason: 'tier-locked', phase: 'rejected', eventId };
    }
  }
  const session = freshRuntime(event, { ...opts, memory });
  if (!opts.practice) noteAttempt(memory, event.id);
  session.memory = memory;
  placeShip(session);
  return session;
}

function placeShip(session) {
  const ship = session.bodies.find((b) => b.role === 'ship');
  if (!ship) return;
  const at = (session.solution && session.solution.shipAt) || session.arena.ship;
  ship.x = at.x;
  ship.z = at.z;
  ship.vx = 0;
  ship.vz = 0;
}

function say(session, kind, extra) {
  session.log.push({ t: session.simTime, kind, ...extra });
}

function scoringBody(session) {
  return session.bodies.find((b) => b.alive && (b.role === 'ball' || b.role === 'stone' || b.role === 'payload')) || null;
}

function goalSpec(session) {
  const event = session.event;
  const arena = session.arena;
  if (event.sport === 'bank') {
    const rails = arena.rails;
    const gap = event.narrow ? 9 : rails.gap;
    const aperture = event.narrow ? 8.2 : arena.goal.aperture;
    return { ...arena.goal, plane: rails.north, aperture, center: 0, gap };
  }
  return arena.goal;
}

function regionCenter(session) {
  const pen = session.arena.pen;
  const t = session.simTime;
  return {
    x: pen.x + Math.sin(t * pen.wx) * pen.ax,
    z: pen.z + Math.cos(t * pen.wz) * pen.az,
    radius: pen.radius,
  };
}

function inZone(body, zone) {
  return Math.hypot(body.x - zone.x, body.z - zone.z) <= zone.radius;
}

function markTransfers(session, contacts) {
  if (session.event.sport !== 'relay') return;
  const payload = bodyByRole(session, 'payload');
  if (!payload) return;
  for (const hit of contacts) {
    if (hit.kind !== 'tether-cut') continue;
    const need = session.legalTransfers;
    const zone = session.arena.zones[need];
    if (!zone) continue;
    const held = session.simTime - (session.lastAttachAt ?? session.simTime);
    if (inZone(payload, zone) && held >= 0.3) {
      session.legalTransfers += 1;
      say(session, 'transfer', { n: session.legalTransfers, zone: zone.id, held });
    } else {
      say(session, 'cut-illegal', { zone: zone ? zone.id : null, held });
    }
  }
}

function rejectTunnel(session, prev, body, dt) {
  if (!prev || !body) return false;
  const dist = Math.hypot(body.x - prev.x, body.z - prev.z);
  const cap = body.maxSpeed * dt * 1.25 + 1e-6;
  if (dist > cap) {
    session.tunnel = true;
    say(session, 'tunnel', { dist });
    return true;
  }
  return false;
}

function shotMiss(session, reason) {
  session.shotLive = false;
  session.shots += 1;
  say(session, 'miss', { reason, score: session.goals });
  const ball = scoringBody(session);
  if (ball && session.event.shots > 1) ball.alive = false;
  if (session.shots >= session.event.shots) finish(session, session.goals >= session.event.need, reason);
  else session.phase = 'result';
}

function shotGoal(session, extra) {
  session.goals += 1;
  session.score = session.goals;
  session.shotLive = false;
  session.shots += 1;
  say(session, 'goal', { score: session.goals, ...extra });
  const ball = scoringBody(session);
  if (ball && session.event.shots > 1) ball.alive = false;
  if (session.event.shots <= 1 || session.shots >= session.event.shots) {
    finish(session, session.goals >= session.event.need, 'scored');
  } else session.phase = 'result';
}

function finish(session, won, reason) {
  session.phase = won ? 'finished' : 'failed';
  session.reason = won ? 'won' : reason;
  session.won = won;
  if (!session.practice && !session.recorded) {
    session.recorded = true;
    noteResult(session.memory, session.event.id, resultView(session));
  }
  say(session, won ? 'match-won' : 'match-lost', { reason: session.reason });
}

export function resultView(session) {
  const won = session.won === true || (session.phase === 'finished' && session.reason === 'won');
  const clean = won
    && session.postHits === 0
    && session.respawns === 0
    && !session.tunnel
    && session.goals >= session.event.shots;
  const trick = won && (
    (session.event.sport === 'keeper' && session.bumperHits > 0)
    || (session.event.sport === 'bank' && session.railsHit.length >= 2 && session.event.banksRequired < 2)
    || (session.event.sport === 'curl' && session.guardHits > 0)
    || (session.event.sport === 'magnet' && session.bend >= 0.7)
    || session.reverseRelease === true
  );
  const assisted = won && (session.bumperHits > 0 || session.guardHits > 0 || session.keeperTouches > 0 || session.legalTransfers > 0);
  let best = session.goals;
  if (session.event.sport === 'bank') best = session.railsHit.length;
  if (session.event.sport === 'curl') best = session.settle;
  if (session.event.sport === 'relay') best = session.legalTransfers;
  if (session.event.sport === 'magnet') best = session.bend;
  if (session.event.sport === 'contain') best = session.streak;
  return {
    won, clean, trick, assisted, best,
    score: session.goals,
    banks: session.railsHit ? session.railsHit.length : 0,
    transfers: session.legalTransfers,
    bend: session.bend,
    hold: session.streak,
  };
}

function serveNext(session) {
  const spec = session.event.sport === 'keeper' ? session.arena.ball : null;
  if (!spec) return;
  const previous = session.bodies.find((b) => b.role === 'ball');
  if (previous) previous.alive = false;
  const id = `ball-${session.shots}`;
  session.bodies.push(makeBody({
    id, role: 'ball', x: spec.x, z: spec.z, radius: spec.radius, mass: spec.mass,
    restitution: spec.restitution, drag: spec.drag, maxSpeed: spec.maxSpeed,
  }));
  session.servePos = { x: spec.x, z: spec.z };
  session.shotTime = 0;
  session.shotLive = true;
  session.playerTouched = false;
  session.touchAt = -100;
  session.lastTouch = null;
  session.phase = 'play';
  session.railsHit = [];
  session.railAt = {};
  session.rival = null;
  placeShip(session);
  const keeper = session.bodies.find((b) => b.role === 'keeper' && b.alive);
  if (keeper && session.arena.keeper) {
    keeper.x = session.arena.keeper.x;
    keeper.z = session.arena.keeper.z;
    keeper.vx = 0;
    keeper.vz = 0;
  }
  say(session, 'serve', { shot: session.shots + 1 });
}

function evaluate(session, prevMap, dt, contacts) {
  if (!session.shotLive || session.phase !== 'play') return;
  markTransfers(session, contacts);
  const event = session.event;
  if (event.sport === 'keeper') evaluateKeeper(session, prevMap, dt);
  else if (event.sport === 'bank') evaluateBank(session, prevMap, dt);
  else if (event.sport === 'curl') evaluateCurl(session, dt);
  else if (event.sport === 'relay') evaluateRelay(session, prevMap, dt);
  else if (event.sport === 'magnet') evaluateMagnet(session, prevMap, dt);
  else if (event.sport === 'contain') evaluateContain(session, dt);
  else throw new Error(`unhandled sport ${event.sport}`);
}

function evaluateKeeper(session, prevMap, dt) {
  const ball = scoringBody(session);
  const keeper = bodyByRole(session, 'keeper');
  if (!keeper) {
    say(session, 'no-keeper', {});
    session.goals = 0;
    finish(session, false, 'no-keeper');
    return;
  }
  if (!ball) {
    shotMiss(session, 'no-ball');
    return;
  }
  const prev = prevMap.get(ball.id);
  if (rejectTunnel(session, prev, ball, dt)) {
    shotMiss(session, 'tunnel');
    return;
  }
  if (outOfBounds(session, ball)) {
    shotMiss(session, 'bounds');
    return;
  }
  const spec = goalSpec(session);
  const cross = prev ? sweptDiskCross(prev, ball, ball.radius, { ...spec, maxSpeed: ball.maxSpeed, dt }) : null;
  const displacement = Math.hypot(ball.x - session.servePos.x, ball.z - session.servePos.z);
  const legal = legalShot(session.touchAt, session.simTime, displacement, speedOf(ball));
  if (cross && legal && session.postHits === 0) {
    shotGoal(session, { x: cross.x, z: cross.z });
    return;
  }
  if (cross && !legal) say(session, 'illegal-cross', {});
  if (session.shotTime >= session.event.shotSeconds) shotMiss(session, 'timeout');
}

function evaluateBank(session, prevMap, dt) {
  const ball = scoringBody(session);
  if (!ball) {
    shotMiss(session, 'no-ball');
    return;
  }
  const prev = prevMap.get(ball.id);
  if (rejectTunnel(session, prev, ball, dt)) {
    shotMiss(session, 'tunnel');
    return;
  }
  if (outOfBounds(session, ball)) {
    shotMiss(session, 'bounds');
    return;
  }
  const spec = goalSpec(session);
  const cross = prev ? sweptDiskCross(prev, ball, ball.radius, { ...spec, maxSpeed: ball.maxSpeed, dt }) : null;
  if (cross) {
    if (session.railsHit.length >= session.event.banksRequired && session.playerTouched) {
      shotGoal(session, { banks: session.railsHit.slice() });
    } else {
      say(session, 'unstamped-cross', { banks: session.railsHit.slice() });
      shotMiss(session, 'no-bank');
    }
    return;
  }
  if (session.shotTime >= session.event.shotSeconds) shotMiss(session, 'timeout');
}

function evaluateCurl(session, dt) {
  const stone = bodyByRole(session, 'stone');
  if (!stone) {
    shotMiss(session, 'no-stone');
    return;
  }
  if (outOfBounds(session, stone)) {
    shotMiss(session, 'bounds');
    return;
  }
  const pad = session.arena.pads.find((p) => p.id === session.event.pad) || session.arena.pads[0];
  const inside = Math.hypot(stone.x - pad.x, stone.z - pad.z) + stone.radius <= pad.radius;
  const slow = speedOf(stone) <= session.event.speedMax;
  if (inside && slow && session.playerTouched) session.settle += dt;
  else session.settle = 0;
  if (session.settle >= 0.45) {
    shotGoal(session, { pad: pad.id, speed: speedOf(stone) });
    return;
  }
  if (speedOf(stone) < 0.2 && session.shotTime > 1.2 && !inside && session.playerTouched) {
    shotMiss(session, 'short');
    return;
  }
  if (session.shotTime >= session.event.shotSeconds) shotMiss(session, 'timeout');
}

function evaluateRelay(session, prevMap, dt) {
  const payload = bodyByRole(session, 'payload');
  if (!payload) {
    shotMiss(session, 'no-payload');
    return;
  }
  const prev = prevMap.get(payload.id);
  if (rejectTunnel(session, prev, payload, dt)) {
    shotMiss(session, 'tunnel');
    return;
  }
  if (session.stolen) {
    say(session, 'stolen', {});
    shotMiss(session, 'stolen');
    return;
  }
  const spec = session.arena.goal;
  const cross = prev ? sweptDiskCross(prev, payload, payload.radius, { ...spec, maxSpeed: payload.maxSpeed, dt }) : null;
  if (cross) {
    if (session.legalTransfers >= session.transfersRequired) {
      shotGoal(session, { transfers: session.legalTransfers });
    } else {
      say(session, 'shove', { transfers: session.legalTransfers });
      shotMiss(session, 'no-transfer');
    }
    return;
  }
  if (session.shotTime >= session.event.shotSeconds) shotMiss(session, 'timeout');
}

function evaluateMagnet(session, prevMap, dt) {
  const ball = scoringBody(session);
  if (!ball) {
    shotMiss(session, 'no-ball');
    return;
  }
  const prev = prevMap.get(ball.id);
  if (rejectTunnel(session, prev, ball, dt)) {
    shotMiss(session, 'tunnel');
    return;
  }
  if (session.launchHeading == null && speedOf(ball) > 12) {
    session.launchHeading = headingOf(ball.vx, ball.vz);
  }
  const pocket = session.arena.pocket;
  const entered = prev && !session.fieldSuppressed
    ? sweptEnterDisk(prev, ball, ball.radius, pocket, ball.maxSpeed, dt)
    : null;
  const enteredRaw = prev ? sweptEnterDisk(prev, ball, ball.radius, pocket, ball.maxSpeed, dt) : null;
  if (session.launchHeading != null && speedOf(ball) > 2) {
    const now = headingOf(ball.vx, ball.vz);
    const d = Math.atan2(Math.sin(now - session.launchHeading), Math.cos(now - session.launchHeading));
    session.bend = Math.max(session.bend, Math.abs(d));
  }
  if (enteredRaw && session.fieldSuppressed) {
    say(session, 'unbent', { bend: session.bend });
    shotMiss(session, 'no-field');
    return;
  }
  if (entered) {
    if (session.bend >= session.event.minBend && session.playerTouched) {
      shotGoal(session, { bend: session.bend });
    } else {
      say(session, 'straight', { bend: session.bend });
      shotMiss(session, 'no-bend');
    }
    return;
  }
  if (session.shotTime >= session.event.shotSeconds) shotMiss(session, 'timeout');
}

function evaluateContain(session, dt) {
  const pucks = session.bodies.filter((b) => b.role === 'puck' && b.alive);
  if (pucks.length < (session.event.puckCount || 3)) {
    shotMiss(session, 'missing-puck');
    return;
  }
  const center = regionCenter(session);
  const inside = pucks.every((puck) => wholeDiskInside(puck, center, center.radius));
  if (inside && (!session.authoritative || session.playerTouched)) {
    session.streak += dt;
    if (session.streak > (session.maxStreak || 0)) session.maxStreak = session.streak;
  }
  else {
    if (session.streak > 0) say(session, 'streak-break', { hold: session.streak });
    session.streak = 0;
  }
  if (session.streak >= session.event.holdSeconds) {
    shotGoal(session, { hold: session.streak });
    return;
  }
  if (session.shotTime >= session.event.shotSeconds) shotMiss(session, 'timeout');
}

function outOfBounds(session, body) {
  const b = session.arena.bounds;
  return body.x < b.minX - 8 || body.x > b.maxX + 8 || body.z < b.minZ - 8 || body.z > b.maxZ + 8;
}

function guardShip(session) {
  const ship = bodyByRole(session, 'ship');
  if (!ship || session.phase !== 'play') return;
  const origin = Math.hypot(ship.x, ship.z);
  if (origin > session.arena.leaveRadius) {
    session.left = true;
    session.phase = 'cancelled';
    session.reason = 'left';
    say(session, 'left', {});
    unload(session);
    return;
  }
  const b = session.arena.bounds;
  if (ship.x < b.minX || ship.x > b.maxX || ship.z < b.minZ || ship.z > b.maxZ) {
    const home = session.arena.respawn;
    ship.x = home.x;
    ship.z = home.z;
    ship.vx = 0;
    ship.vz = 0;
    session.respawns += 1;
    say(session, 'respawn', { n: session.respawns });
  }
}

export function stepSession(session, command, dt = DT) {
  if (!session || session.ok === false) return session;
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.25) return session;
  if (session.phase === 'result') {
    session.simTime += dt;
    session.tick += 1;
    session.resultLeft = (session.resultLeft || 0.2) - dt;
    if (session.resultLeft <= 0) serveNext(session);
    return session;
  }
  if (session.phase !== 'play') return session;
  const prevMap = new Map();
  for (const body of session.bodies) {
    if (!body.alive) continue;
    prevMap.set(body.id, { x: body.x, z: body.z });
  }
  const contacts = [];
  const fields = session.fieldSuppressed ? [] : session.fields;
  const saved = session.fields;
  session.fields = fields;
  integrateMatch(session, command || IDLE, dt, contacts);
  session.fields = saved;
  session.contacts = contacts;
  if (!assertFiniteSession(session)) {
    session.phase = 'failed';
    session.reason = 'non-finite';
    return session;
  }
  guardShip(session);
  if (session.phase !== 'play') return session;
  session.simTime += dt;
  session.shotTime += dt;
  session.tick += 1;
  if (session.tick % 20 === 0) {
    const ball = scoringBody(session) || session.bodies.find((b) => b.role === 'puck');
    if (ball && session.samples.length < 64) {
      session.samples.push({ t: round3(session.simTime), x: round3(ball.x), z: round3(ball.z) });
    }
  }
  evaluate(session, prevMap, dt, contacts);
  return session;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

// Live observations from the one production solve feed sport rules; no fixture integration.
export function judgeAuthoritativeSession(session, poses, dt = DT, contacts = []) {
  if (!session?.ok || !Number.isFinite(dt) || dt <= 0 || dt > 0.25) return session;
  session.authoritative = true;
  const previous = new Map(session.bodies.filter(body => body.alive)
    .map(body => [body.id, { x: body.x, z: body.z }]));
  for (const pose of poses || []) {
    const body = session.bodies.find(row => row.id === pose.id);
    if (!body) continue;
    if (pose.alive === false) { body.alive = false; continue; }
    if (![pose.x, pose.z, pose.vx, pose.vz].every(Number.isFinite)) {
      finish(session, false, 'non-finite'); return session;
    }
    Object.assign(body, pose);
    // Rapier CCD owns tunnelling. Never reject genuine collision-earned speed using a prototype cap.
    body.maxSpeed = Math.max(body.maxSpeed, Math.hypot(body.vx, body.vz) * 1.2 + 10);
  }
  if (session.phase === 'result') {
    session.simTime += dt; session.tick += 1;
    session.resultLeft = (session.resultLeft ?? 0.6) - dt;
    if (session.resultLeft <= 0) serveNext(session);
    return session;
  }
  if (session.phase !== 'play') return session;
  const ship = bodyByRole(session, 'ship');
  if (!ship || Math.hypot(ship.x, ship.z) > session.arena.leaveRadius) {
    session.phase = 'cancelled'; session.reason = 'left'; return session;
  }
  session.simTime += dt; session.shotTime += dt; session.tick += 1;
  evaluate(session, previous, dt, contacts);
  if (session.phase === 'play' && session.tick >= session.event.maxTicks) finish(session, false, 'clock');
  return session;
}

export function commandFromSolution(solution, session) {
  if (!solution) return IDLE;
  if (solution.kind === 'shepherd' || solution.kind === 'shepherd-wide') {
    return shepherd(session, solution.kind === 'shepherd-wide' ? 7 : 1.4);
  }
  const phases = solution.phases || [];
  let acc = 0;
  for (const phase of phases) {
    acc += phase.for;
    if (session.shotTime < acc) {
      return {
        thrustX: phase.thrustX || 0,
        thrustZ: phase.thrustZ || 0,
        tether: phase.tether === true,
        cut: phase.cut === true,
      };
    }
  }
  const ship = session.bodies.find((b) => b.role === 'ship' && b.alive);
  if (!ship) return IDLE;
  // Kill leftover thrust so a finished delivery does not fly out of the venue.
  return {
    thrustX: clamp(-ship.vx / (ship.maxAccel * DT), -1, 1),
    thrustZ: clamp(-ship.vz / (ship.maxAccel * DT), -1, 1),
    tether: false,
    cut: false,
  };
}

function shepherd(session, margin) {
  const center = regionCenter(session);
  const pucks = session.bodies.filter((b) => b.role === 'puck' && b.alive);
  let worst = null;
  let worstOver = -Infinity;
  for (const puck of pucks) {
    const over = Math.hypot(puck.x - center.x, puck.z - center.z) + puck.radius - center.radius;
    if (over > worstOver) {
      worst = puck;
      worstOver = over;
    }
  }
  const ship = bodyByRole(session, 'ship');
  if (!worst || !ship) return IDLE;
  // Hold the ship on the pen so the line hauls a drifting puck back in.
  // Ramming them is a worse sport: the tether is the legal tool.
  const cmd = seek(ship, center.x, center.z, 0.85);
  const reach = Math.hypot(ship.x - worst.x, ship.z - worst.z);
  const threaten = worstOver > -margin;
  session.tetherFocus = worst.id;
  cmd.tether = threaten && reach <= (session.tetherReach ?? 18);
  cmd.cut = !threaten || (session.tether && session.tether.targetId !== worst.id);
  return cmd;
}

function seek(ship, x, z, scale) {
  const dx = x - ship.x;
  const dz = z - ship.z;
  const dist = Math.hypot(dx, dz) || 1;
  const speed = Math.hypot(ship.vx, ship.vz);
  if (dist < 7 || speed > Math.max(12, dist * 2.2)) {
    return {
      thrustX: clamp(-ship.vx / (ship.maxAccel * DT), -1, 1),
      thrustZ: clamp(-ship.vz / (ship.maxAccel * DT), -1, 1),
      tether: false,
      cut: false,
    };
  }
  const tx = clamp((dx / dist) * scale, -1, 1);
  const tz = clamp((dz / dist) * scale, -1, 1);
  return { thrustX: tx, thrustZ: tz, tether: false, cut: false };
}

export function runMatch(eventId, opts = {}) {
  const session = createSession(eventId, opts);
  if (!session.ok) return session;
  const policy = opts.policy || ((s) => commandFromSolution(s.solution, s));
  const maxTicks = opts.maxTicks || session.event.maxTicks;
  const dt = opts.dt || DT;
  while (
    session.phase !== 'finished'
    && session.phase !== 'failed'
    && session.phase !== 'cancelled'
    && session.phase !== 'closed'
    && session.phase !== 'destroyed'
    && session.tick < maxTicks
  ) {
    stepSession(session, policy(session), dt);
  }
  if (session.phase === 'play' || session.phase === 'result') {
    finish(session, false, 'clock');
  }
  return session;
}

export function retrySession(session) {
  if (!session || !session.event) return { ok: false, reason: 'no-session' };
  const next = createSession(session.event.id, {
    seed: session.seed,
    memory: session.memory,
    inventory: session.inventory,
    shipId: session.shipId,
    practice: session.practice,
    enforceTier: false,
    solution: session.solution,
  });
  next.retried = true;
  return next;
}

export function unload(session) {
  if (!session) return;
  session.bodies = [];
  session.solids = [];
  session.fields = [];
  session.tether = null;
}

export function leaveVenue(session) {
  if (!session || session.ok === false) return session;
  if (session.phase === 'play' || session.phase === 'result') {
    session.phase = 'cancelled';
    session.reason = 'left';
    say(session, 'left', {});
  }
  unload(session);
  return session;
}

export function worldFootprint(session) {
  if (!session || session.phase === 'destroyed' || session.phase === 'cancelled' || session.phase === 'rejected') return 0;
  if (session.phase !== 'play' && session.phase !== 'result') return 0;
  return session.bodies.length;
}

export function destroySession(session) {
  unload(session);
  if (session) {
    session.phase = 'destroyed';
    session.reason = 'destroyed';
  }
  return session;
}

export function applyMatchDamage(session, hit) {
  if (!session || session.phase !== 'play' || !hit) return { applied: false };
  if (!(hit.amount > 0)) return { applied: false, reason: 'zero' };
  if (hit.sourceId !== session.shipId) return { applied: false, ignored: true, reason: 'non-player' };
  if (hit.targetRole === 'keeper') {
    session.phase = 'closed';
    session.reason = 'player-damage';
    say(session, 'closed', {});
    return { applied: true, closed: true };
  }
  return { applied: false, reason: 'not-keeper' };
}

export function serializeSession(session) {
  if (!session || session.ok === false) return null;
  return {
    version: 1,
    eventId: session.event.id,
    seed: session.seed,
    practice: session.practice,
    simTime: session.simTime,
    shotTime: session.shotTime,
    tick: session.tick,
    phase: session.phase,
    reason: session.reason,
    won: session.won === true,
    recorded: session.recorded === true,
    score: session.goals,
    shots: session.shots,
    shotLive: session.shotLive,
    legalTransfers: session.legalTransfers,
    bend: session.bend,
    launchHeading: session.launchHeading,
    streak: session.streak,
    settle: session.settle,
    playerTouched: session.playerTouched,
    touchAt: session.touchAt,
    lastTouch: session.lastTouch,
    railsHit: session.railsHit.slice(),
    bankContacts: session.bankContacts,
    postHits: session.postHits,
    bumperHits: session.bumperHits,
    guardHits: session.guardHits,
    keeperTouches: session.keeperTouches,
    stolen: session.stolen,
    tunnel: session.tunnel,
    respawns: session.respawns,
    rival: session.rival ? { ...session.rival } : null,
    tether: session.tether ? { ...session.tether } : null,
    resultLeft: session.resultLeft,
    lastAttachAt: session.lastAttachAt,
    bodies: session.bodies.map(snapshotBody),
    memory: normalizeLeagueMemory(session.memory),
    shipId: session.shipId,
  };
}

export function deserializeSession(raw, opts = {}) {
  if (!raw || raw.version !== 1) return { ok: false, reason: 'bad-save' };
  const session = createSession(raw.eventId, {
    seed: raw.seed,
    practice: true,
    enforceTier: false,
    memory: raw.memory,
    shipId: raw.shipId,
    inventory: opts.inventory || null,
  });
  if (!session.ok) return session;
  session.practice = raw.practice === true;
  session.simTime = raw.simTime;
  session.shotTime = raw.shotTime;
  session.tick = raw.tick;
  session.phase = raw.phase;
  session.reason = raw.reason;
  session.won = raw.won === true;
  session.recorded = raw.recorded === true;
  session.goals = raw.score;
  session.score = raw.score;
  session.shots = raw.shots;
  session.shotLive = raw.shotLive !== false;
  session.legalTransfers = raw.legalTransfers;
  session.bend = raw.bend;
  session.launchHeading = raw.launchHeading;
  session.streak = raw.streak;
  session.settle = raw.settle;
  session.playerTouched = raw.playerTouched === true;
  session.touchAt = raw.touchAt;
  session.lastTouch = raw.lastTouch;
  session.railsHit = Array.isArray(raw.railsHit) ? raw.railsHit.slice() : [];
  session.bankContacts = raw.bankContacts || 0;
  session.postHits = raw.postHits || 0;
  session.bumperHits = raw.bumperHits || 0;
  session.guardHits = raw.guardHits || 0;
  session.keeperTouches = raw.keeperTouches || 0;
  session.stolen = raw.stolen === true;
  session.tunnel = raw.tunnel === true;
  session.respawns = raw.respawns || 0;
  session.rival = raw.rival ? { ...raw.rival } : null;
  session.tether = raw.tether ? { ...raw.tether } : null;
  session.resultLeft = Number.isFinite(raw.resultLeft) ? Math.max(0, raw.resultLeft) : undefined;
  session.lastAttachAt = Number.isFinite(raw.lastAttachAt) ? raw.lastAttachAt : undefined;
  for (const snap of raw.bodies || []) {
    let body = session.bodies.find((b) => b.id === snap.id);
    if (!body && snap.role === 'ball' && /^ball-\d+$/.test(snap.id) && session.event.sport === 'keeper') {
      body = makeBody({ ...session.arena.ball, id: snap.id, role: 'ball' });
      session.bodies.push(body);
    }
    if (!body) continue;
    body.x = snap.x;
    body.z = snap.z;
    body.vx = snap.vx;
    body.vz = snap.vz;
    body.alive = snap.alive !== false;
  }
  return session;
}

export function summaryOf(session) {
  if (!session || session.ok === false) {
    return { ok: false, reason: session && session.reason, eventId: session && session.eventId };
  }
  const view = resultView(session);
  return {
    ok: true,
    eventId: session.event.id,
    sport: session.event.sport,
    arena: session.event.arena,
    winKind: session.winKind,
    seed: session.seed,
    phase: session.phase,
    reason: session.reason,
    tick: session.tick,
    simTime: round3(session.simTime),
    ...view,
    samples: session.samples,
    log: session.log.map((row) => row.kind),
    footprint: worldFootprint(session),
    finite: assertFiniteSession(session),
  };
}

export function exhibitTrace(eventId, seed) {
  const session = runMatch(eventId, { seed, practice: true, enforceTier: false });
  return summaryOf(session);
}

export function commandIdle() {
  return IDLE;
}

export { clamp, regionCenter };
