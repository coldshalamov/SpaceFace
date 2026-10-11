// Forty seeded moment streams. Motion is closed-form; the seed picks a row, never a random draw.
// Grammar reads the logged events. Sample proximity is only there so the camera has footage.

import {
  MOMENT_STREAM_SCHEMA,
  TICK_RATE,
  CLIP_TARGET_TICKS,
  PRE_ROLL_TICKS,
} from '../../src/presentation/momentMachine/contract.js';

export const SITUATION_COUNT = 40;
export const PAYOFF_TICK = PRE_ROLL_TICKS;
const LAST = CLIP_TARGET_TICKS - 1;

function pose(body, tick) {
  const dt = (tick - body.t0) / TICK_RATE;
  return {
    x: body.x + body.vx * dt,
    z: body.z + body.vz * dt,
    heading: Math.atan2(body.vx, body.vz),
  };
}

function samplesFor(bodies, from, to) {
  const out = [];
  const emit = (tick) => {
    for (let i = 0; i < bodies.length; i += 1) {
      const body = bodies[i];
      if (tick < body.from || tick > body.to) continue;
      const at = pose(body, tick);
      out.push({
        tick,
        id: body.id,
        generation: body.generation,
        x: at.x,
        z: at.z,
        heading: at.heading,
      });
    }
  };
  for (let tick = from; tick <= to; tick += 6) emit(tick);
  if (to >= from && (to - from) % 6 !== 0) emit(to);
  return out;
}

function hull(id, generation, x, z, vx, vz, from, to, t0) {
  return {
    id,
    generation,
    x,
    z,
    vx,
    vz,
    t0: t0 == null ? from : t0,
    from,
    to,
  };
}

function fleet(to = LAST) {
  return [
    hull('pilot', 0, 0, 0, 28, 4, 0, to),
    hull('hauler', 0, 90, 16, 6, -2, 0, to),
    hull('skiff', 0, 150, -20, -4, 6, 0, to),
  ];
}

function at(bodies, id, generation, tick) {
  const body = bodies.find((item) => item.id === id && item.generation === generation);
  if (!body) return null;
  const posed = pose(body, tick);
  return { x: posed.x, z: posed.z };
}

function ev(seed, suffix, tick, kind, causalityId, actors, payload, bodies, posId, posGen) {
  const position = bodies && posId ? at(bodies, posId, posGen == null ? 0 : posGen, tick) : null;
  return {
    id: `s${seed}-${suffix}`,
    causalityId,
    tick,
    simTime: tick / TICK_RATE,
    kind,
    actors,
    position,
    payload,
    source: 'stream',
  };
}

function who(id, generation, role) {
  return { id, generation, role };
}

function pack(seed, events, bodies, extras = {}) {
  const baseTick = extras.baseTick == null ? 0 : extras.baseTick;
  const ticks = extras.ticks == null ? CLIP_TARGET_TICKS : extras.ticks;
  const sampleFrom = extras.sampleFrom == null ? baseTick : extras.sampleFrom;
  const sampleTo = extras.sampleTo == null ? baseTick + ticks - 1 : extras.sampleTo;
  return {
    schema: MOMENT_STREAM_SCHEMA,
    seed,
    tickRate: TICK_RATE,
    tone: extras.tone || 'feat',
    window: { baseTick, ticks, seconds: ticks / TICK_RATE },
    events,
    samples: bodies ? samplesFor(bodies, sampleFrom, sampleTo) : [],
  };
}

function chain(seed, tone, third) {
  const bodies = fleet();
  if (third) bodies.push(hull('barge', 0, 40, 30, 2, 8, 0, LAST));
  const cid = `c-${seed}-chain`;
  const events = [
    ev(seed, 'hit-a', 700, 'collision', cid, [
      who('hauler', 0, 'subject'), who('pilot', 0, 'actor'), who('skiff', 0, 'witness'),
    ], { impact: true }, bodies, 'hauler', 0),
    ev(seed, 'hit-b', PAYOFF_TICK, 'collision', cid, [
      who(third ? 'barge' : 'skiff', 0, 'subject'), who('hauler', 0, 'actor'), who('pilot', 0, 'witness'),
    ], { impact: true }, bodies, third ? 'barge' : 'skiff', 0),
  ];
  if (third) {
    events.splice(1, 0, ev(seed, 'hit-mid', 760, 'collision', cid, [
      who('skiff', 0, 'subject'), who('hauler', 0, 'actor'),
    ], { impact: true }, bodies, 'skiff', 0));
  }
  return pack(seed, events, bodies, { tone });
}

function tether(seed, tone, tension, rating) {
  const bodies = fleet();
  const cid = `c-${seed}-tether`;
  return pack(seed, [
    ev(seed, 'cut', PAYOFF_TICK, 'tether_cut', cid, [
      who('hauler', 0, 'subject'), who('pilot', 0, 'actor'), who('skiff', 0, 'witness'),
    ], { tension, rating, impossible: tension > rating }, bodies, 'hauler', 0),
  ], bodies, { tone });
}

function collateral(seed, tone) {
  const bodies = fleet();
  const cid = `c-${seed}-collateral`;
  return pack(seed, [
    ev(seed, 'shot', 700, 'shot', cid, [
      who('skiff', 0, 'subject'), who('pilot', 0, 'actor'),
    ], { aimed: true }, bodies, 'skiff', 0),
    ev(seed, 'splash', PAYOFF_TICK, 'collateral', cid, [
      who('hauler', 0, 'subject'), who('pilot', 0, 'actor'), who('skiff', 0, 'witness'),
    ], { intended: false, playerCaused: true }, bodies, 'hauler', 0),
  ], bodies, { tone });
}

function law(seed, tone) {
  const bodies = fleet();
  const cid = `c-${seed}-law`;
  return pack(seed, [
    ev(seed, 'heat', 420, 'wanted', cid, [
      who('skiff', 0, 'subject'), who('pilot', 0, 'witness'),
    ], { level: 4, previousLevel: 1 }, bodies, 'skiff', 0),
    ev(seed, 'writ', PAYOFF_TICK, 'lawful_intervention', cid, [
      who('skiff', 0, 'subject'), who('pilot', 0, 'actor'), who('hauler', 0, 'witness'),
    ], { authority: 'law', level: 4 }, bodies, 'skiff', 0),
  ], bodies, { tone });
}

function sling(seed, tone, speed) {
  const bodies = fleet();
  const cid = `c-${seed}-sling`;
  return pack(seed, [
    ev(seed, 'throw', 560, 'sling', cid, [
      who('hauler', 0, 'subject'), who('pilot', 0, 'actor'), who('skiff', 0, 'witness'),
    ], { speed, mass: 6 }, bodies, 'hauler', 0),
    ev(seed, 'impact', PAYOFF_TICK, 'collision', cid, [
      who('skiff', 0, 'subject'), who('hauler', 0, 'actor'),
    ], { impact: true }, bodies, 'skiff', 0),
  ], bodies, { tone });
}

function rescue(seed, tone) {
  const bodies = fleet();
  const cid = `c-${seed}-rescue`;
  return pack(seed, [
    ev(seed, 'threat', 780, 'threat', cid, [
      who('hauler', 0, 'subject'), who('skiff', 0, 'actor'), who('pilot', 0, 'witness'),
    ], { logged: true }, bodies, 'hauler', 0),
    ev(seed, 'save', PAYOFF_TICK, 'rescue', cid, [
      who('hauler', 0, 'subject'), who('pilot', 0, 'actor'), who('skiff', 0, 'witness'),
    ], { logged: true }, bodies, 'hauler', 0),
  ], bodies, { tone });
}

function near(seed, tone, clearance) {
  const bodies = fleet();
  const cid = `c-${seed}-miss`;
  return pack(seed, [
    ev(seed, 'miss', PAYOFF_TICK, 'near_miss', cid, [
      who('hauler', 0, 'subject'), who('pilot', 0, 'actor'), who('skiff', 0, 'witness'),
    ], { clearance, hit: false }, bodies, 'hauler', 0),
  ], bodies, { tone });
}

function cargo(seed, tone) {
  const bodies = fleet();
  const cid = `c-${seed}-cargo`;
  return pack(seed, [
    ev(seed, 'jar', 700, 'collision', cid, [
      who('hauler', 0, 'subject'), who('pilot', 0, 'actor'),
    ], { impact: true }, bodies, 'hauler', 0),
    ev(seed, 'burst', PAYOFF_TICK, 'cargo_catastrophe', cid, [
      who('hauler', 0, 'subject'), who('pilot', 0, 'actor'), who('skiff', 0, 'witness'),
    ], { volatile: true, qty: 4, burst: true }, bodies, 'hauler', 0),
  ], bodies, { tone });
}

function blockade(seed, tone) {
  const bodies = fleet();
  bodies.push(hull('warden', 0, 200, 40, -12, 3, 0, LAST));
  bodies.push(hull('screen', 0, 220, -10, -10, 5, 0, LAST));
  const cid = `c-${seed}-block`;
  return pack(seed, [
    ev(seed, 'line', 700, 'blockade', cid, [
      who('pilot', 0, 'subject'), who('warden', 0, 'blocker'), who('screen', 0, 'witness'),
    ], { moving: true, blockerCount: 2 }, bodies, 'warden', 0),
    ev(seed, 'cross', PAYOFF_TICK, 'transit', cid, [
      who('pilot', 0, 'subject'), who('pilot', 0, 'actor'),
    ], { attempted: true }, bodies, 'pilot', 0),
  ], bodies, { tone });
}

function reversal(seed, tone, aggressor) {
  const bodies = fleet();
  const cid = `c-${seed}-flip`;
  return pack(seed, [
    ev(seed, 'flip', 700, 'reversal', cid, [
      who('hauler', 0, 'subject'), who(aggressor, 0, 'actor'), who('pilot', 0, 'witness'),
    ], { flipped: true, fromRole: 'hunter', toRole: 'hunted' }, bodies, aggressor, 0),
    ev(seed, 'pay', PAYOFF_TICK, 'kill', cid, [
      who(aggressor, 0, 'subject'), who(aggressor === 'pilot' ? 'skiff' : 'pilot', 0, 'actor'),
    ], { cause: 'kinetic' }, bodies, aggressor, 0),
  ], bodies, { tone });
}

function ricochet(seed, tone, bounces) {
  const bodies = fleet();
  const cid = `c-${seed}-rico`;
  return pack(seed, [
    ev(seed, 'bounce', 720, 'ricochet', cid, [
      who('skiff', 0, 'subject'), who('pilot', 0, 'actor'), who('hauler', 0, 'witness'),
    ], { bounces, improbable: true, struck: false }, bodies, 'pilot', 0),
    ev(seed, 'strike', PAYOFF_TICK, 'collision', cid, [
      who('hauler', 0, 'subject'), who('pilot', 0, 'actor'),
    ], { impact: true, via: 'ricochet' }, bodies, 'hauler', 0),
  ], bodies, { tone });
}

function recovery(seed, tone, planned) {
  const bodies = fleet();
  const cid = `c-${seed}-recover`;
  return pack(seed, [
    ev(seed, 'loss', 620, 'kill', cid, [
      who('skiff', 0, 'subject'), who('hauler', 0, 'actor'),
    ], { cause: 'kinetic' }, bodies, 'skiff', 0),
    ev(seed, 'tow', PAYOFF_TICK, 'recovery', cid, [
      who('skiff', 0, 'subject'), who('pilot', 0, 'actor'), who('hauler', 0, 'witness'),
    ], { planned }, bodies, 'skiff', 0),
  ], bodies, { tone });
}

function boring(seed) {
  const bodies = [hull('pilot', 0, 0, 0, 20, 0, 0, LAST)];
  return pack(seed, [
    ev(seed, 'boost', 400, 'boost', null, [who('pilot', 0, 'actor')], { on: true }, bodies, 'pilot', 0),
    ev(seed, 'boost-2', 800, 'boost', null, [who('pilot', 0, 'actor')], { on: true }, bodies, 'pilot', 0),
  ], bodies, { tone: 'reject-case' });
}

function proximity(seed) {
  const bodies = [
    hull('pilot', 0, 0, 0, 0, 0, 0, LAST),
    hull('hauler', 0, 1.2, 0.4, 0, 0, 0, LAST),
  ];
  return pack(seed, [
    ev(seed, 'seen', PAYOFF_TICK, 'witness', null, [
      who('hauler', 0, 'subject'), who('pilot', 0, 'witness'),
    ], { note: 'passed-close' }, bodies, 'hauler', 0),
  ], bodies, { tone: 'reject-case' });
}

function singleHit(seed) {
  const bodies = fleet();
  return pack(seed, [
    ev(seed, 'only', PAYOFF_TICK, 'collision', `c-${seed}-one`, [
      who('hauler', 0, 'subject'), who('pilot', 0, 'actor'),
    ], { impact: true }, bodies, 'hauler', 0),
  ], bodies, { tone: 'reject-case' });
}

function rescueTooLate(seed) {
  const bodies = fleet();
  const cid = `c-${seed}-late`;
  return pack(seed, [
    ev(seed, 'dead', 760, 'kill', cid, [
      who('hauler', 0, 'subject'), who('skiff', 0, 'actor'),
    ], { cause: 'kinetic' }, bodies, 'hauler', 0),
    ev(seed, 'late', PAYOFF_TICK, 'rescue', cid, [
      who('hauler', 0, 'subject'), who('pilot', 0, 'actor'),
    ], { logged: true }, bodies, 'hauler', 0),
  ], bodies, { tone: 'reject-case' });
}

function lawBare(seed) {
  const bodies = fleet();
  return pack(seed, [
    ev(seed, 'writ', PAYOFF_TICK, 'lawful_intervention', `c-${seed}-bare`, [
      who('skiff', 0, 'subject'), who('pilot', 0, 'actor'),
    ], { authority: 'law', level: 1 }, bodies, 'skiff', 0),
  ], bodies, { tone: 'reject-case' });
}

function hitMiss(seed) {
  const bodies = fleet();
  const cid = `c-${seed}-hit`;
  return pack(seed, [
    ev(seed, 'miss', PAYOFF_TICK, 'near_miss', cid, [
      who('hauler', 0, 'subject'), who('pilot', 0, 'actor'),
    ], { clearance: 1.5, hit: false }, bodies, 'hauler', 0),
    ev(seed, 'hit', PAYOFF_TICK, 'collision', cid, [
      who('hauler', 0, 'subject'), who('pilot', 0, 'actor'),
    ], { impact: true }, bodies, 'hauler', 0),
  ], bodies, { tone: 'reject-case' });
}

function ordinaryCut(seed) {
  return tether(seed, 'reject-case', 8, 20);
}

function withNan(seed) {
  const value = chain(seed, 'feat', false);
  value.events.push({
    id: `s${seed}-nan`,
    causalityId: 'c-nan',
    tick: Number.NaN,
    kind: 'rescue',
    actors: [who('hauler', 0, 'subject')],
    payload: { logged: true },
    source: 'stream',
  });
  return value;
}

function recycled(seed) {
  const bodies = [
    hull('pilot', 0, 0, 0, 28, 4, 0, LAST),
    hull('hauler', 0, 90, 16, 6, -2, 0, 900),
    hull('skiff', 0, 150, -20, -4, 6, 0, LAST),
    hull('hauler', 1, 5000, 5000, 0, 0, 906, LAST, 906),
  ];
  const cid = `c-${seed}-gen`;
  return pack(seed, [
    ev(seed, 'hit-a', 700, 'collision', cid, [
      who('skiff', 0, 'subject'), who('pilot', 0, 'actor'),
    ], { impact: true }, bodies, 'skiff', 0),
    ev(seed, 'hit-b', PAYOFF_TICK, 'collision', cid, [
      who('hauler', 0, 'subject'), who('skiff', 0, 'actor'), who('pilot', 0, 'witness'),
    ], { impact: true }, bodies, 'hauler', 0),
  ], bodies, { tone: 'feat' });
}

function shortPreRoll(seed) {
  const baseTick = 4000;
  const sampleFrom = 4300;
  const sampleTo = baseTick + CLIP_TARGET_TICKS - 1;
  const bodies = [
    hull('pilot', 0, 0, 0, 28, 4, sampleFrom, sampleTo, sampleFrom),
    hull('hauler', 0, 90, 16, 6, -2, sampleFrom, sampleTo, sampleFrom),
    hull('skiff', 0, 150, -20, -4, 6, sampleFrom, sampleTo, sampleFrom),
  ];
  const cid = `c-${seed}-gap`;
  const first = baseTick + 700;
  const payoff = baseTick + PAYOFF_TICK;
  return pack(seed, [
    ev(seed, 'hit-a', first, 'collision', cid, [
      who('hauler', 0, 'subject'), who('pilot', 0, 'actor'),
    ], { impact: true }, bodies, 'hauler', 0),
    ev(seed, 'hit-b', payoff, 'collision', cid, [
      who('skiff', 0, 'subject'), who('hauler', 0, 'actor'),
    ], { impact: true }, bodies, 'skiff', 0),
  ], bodies, {
    tone: 'feat',
    baseTick,
    ticks: CLIP_TARGET_TICKS,
    sampleFrom,
    sampleTo,
  });
}

function inferredRescue(seed) {
  const bodies = [
    hull('pilot', 0, 0, 0, 0, 0, 0, LAST),
    hull('hauler', 0, 2, 1, 0, 0, 0, LAST),
  ];
  const value = pack(seed, [
    ev(seed, 'seen', PAYOFF_TICK, 'witness', null, [
      who('hauler', 0, 'subject'), who('pilot', 0, 'witness'),
    ], { note: 'close' }, bodies, 'hauler', 0),
  ], bodies, { tone: 'reject-case' });
  value.events.push({
    id: `s${seed}-fake-rescue`,
    causalityId: `c-${seed}-fake`,
    tick: PAYOFF_TICK,
    simTime: PAYOFF_TICK / TICK_RATE,
    kind: 'rescue',
    actors: [who('hauler', 0, 'subject'), who('pilot', 0, 'actor')],
    position: { x: 2, z: 1 },
    payload: { logged: true, narration: 'the player rescued this ship' },
    source: 'inferred-proximity',
  });
  return value;
}

function slingAndCargo(seed) {
  const bodies = fleet();
  const cid = `c-${seed}-mess`;
  return pack(seed, [
    ev(seed, 'throw', 500, 'sling', cid, [
      who('hauler', 0, 'subject'), who('pilot', 0, 'actor'),
    ], { speed: 360, mass: 9 }, bodies, 'hauler', 0),
    ev(seed, 'jar', 700, 'collision', cid, [
      who('skiff', 0, 'subject'), who('hauler', 0, 'actor'),
    ], { impact: true }, bodies, 'skiff', 0),
    ev(seed, 'burst', PAYOFF_TICK, 'cargo_catastrophe', cid, [
      who('hauler', 0, 'subject'), who('pilot', 0, 'actor'), who('skiff', 0, 'witness'),
    ], { volatile: true, qty: 8, burst: true }, bodies, 'hauler', 0),
  ], bodies, { tone: 'side-effect' });
}

function doubleShape(seed) {
  const bodies = fleet();
  bodies.push(hull('warden', 0, 210, 24, -8, 2, 0, LAST));
  const cid = `c-${seed}-both`;
  return pack(seed, [
    ev(seed, 'line', 600, 'blockade', cid, [
      who('pilot', 0, 'subject'), who('warden', 0, 'blocker'),
    ], { moving: true, blockerCount: 3 }, bodies, 'warden', 0),
    ev(seed, 'flip', 700, 'reversal', cid, [
      who('hauler', 0, 'subject'), who('skiff', 0, 'actor'), who('pilot', 0, 'witness'),
    ], { flipped: true, fromRole: 'hunter', toRole: 'hunted' }, bodies, 'skiff', 0),
    ev(seed, 'pay', PAYOFF_TICK, 'kill', cid, [
      who('skiff', 0, 'subject'), who('pilot', 0, 'actor'),
    ], { cause: 'kinetic' }, bodies, 'skiff', 0),
  ], bodies, { tone: 'side-effect' });
}

const BUILDERS = Object.freeze({
  1: (seed) => chain(seed, 'feat', false),
  2: (seed) => tether(seed, 'feat', 40, 12),
  3: (seed) => collateral(seed, 'feat'),
  4: (seed) => law(seed, 'feat'),
  5: (seed) => sling(seed, 'feat', 320),
  6: (seed) => rescue(seed, 'feat'),
  7: (seed) => near(seed, 'feat', 2.5),
  8: (seed) => cargo(seed, 'feat'),
  9: (seed) => blockade(seed, 'feat'),
  10: (seed) => reversal(seed, 'feat', 'skiff'),
  11: (seed) => ricochet(seed, 'feat', 3),
  12: (seed) => recovery(seed, 'feat', false),
  13: (seed) => chain(seed, 'side-effect', true),
  14: (seed) => collateral(seed, 'side-effect'),
  15: (seed) => slingAndCargo(seed),
  16: (seed) => reversal(seed, 'side-effect', 'pilot'),
  17: (seed) => rescue(seed, 'side-effect'),
  18: (seed) => ricochet(seed, 'side-effect', 4),
  19: (seed) => blockade(seed, 'side-effect'),
  20: (seed) => tether(seed, 'side-effect', 80, 10),
  21: (seed) => near(seed, 'side-effect', 0.8),
  22: (seed) => recovery(seed, 'side-effect', false),
  23: (seed) => ricochet(seed, 'feat', 5),
  24: (seed) => sling(seed, 'side-effect', 420),
  25: (seed) => boring(seed),
  26: (seed) => proximity(seed),
  27: (seed) => singleHit(seed),
  28: (seed) => recovery(seed, 'reject-case', true),
  29: (seed) => ordinaryCut(seed),
  30: (seed) => hitMiss(seed),
  31: (seed) => rescueTooLate(seed),
  32: (seed) => lawBare(seed),
  33: (seed) => withNan(seed),
  34: (seed) => recycled(seed),
  35: (seed) => shortPreRoll(seed),
  36: (seed) => inferredRescue(seed),
  37: (seed) => chain(seed, 'feat', false),
  38: (seed) => blockade(seed, 'feat'),
  39: (seed) => recovery(seed, 'side-effect', false),
  40: (seed) => doubleShape(seed),
});

export function situation(seed) {
  const build = BUILDERS[seed];
  if (!build) return null;
  return build(seed);
}

export function allSituations() {
  const out = [];
  for (let seed = 1; seed <= SITUATION_COUNT; seed += 1) out.push(situation(seed));
  return out;
}
