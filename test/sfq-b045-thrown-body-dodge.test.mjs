// SFQ-B045: NPCs perceive thrown bodies. Player outcome: when the player throws a wreck, rock, pod
// or a whipped (tumbling) ship at an NPC, an alert pilot SOMETIMES sidesteps it and a surprised one
// still gets hit; nobody dodges something they could not see behind a rock.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ContactKind, ManeuverKind, hashUnit } from '../src/ai/contracts.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';
import {
  MOVING_BODY_MIN_SPEED,
  REFLEX_KIND,
  createReflexEngine,
  emptyReflexState,
} from '../src/ai/reflexes.js';

const SEED = 4242;
const ALERT = Object.freeze({ verve: 0.8, poise: 0.5, weave: 0.7, dash: 0.9, aim: 0.3 });
const SLOW_SIGHTED = Object.freeze({ verve: 0.5, poise: 0.5, weave: 0.3, dash: 0.1, aim: 0.9 });
const INTENT = Object.freeze({ kind: ManeuverKind.INTERCEPT });
const TICK_STEP = 2;

const noticeThreshold = (t, rear) => Math.min(0.9, Math.max(0.15, 0.25 + 0.45 * t.dash + 0.25 * (1 - t.aim))) * (rear ? 0.5 : 1);
const notices = (id, bodyId, t, rear = false) => hashUnit(SEED, id, bodyId, 'body_dodge_notice') < noticeThreshold(t, rear);
const pilotWhere = (pred) => {
  for (let id = 1; id < 400; id++) if (pred(id)) return id;
  throw new Error('no pilot id satisfies the fixture predicate');
};

function selfFrame(over = {}) {
  return { id: 'pilot', team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12,
    hullFraction: 1, heatFraction: 0, operationalMassBand: 'light', ...over };
}

function body(over = {}) {
  return { id: 'wreck-1', kind: ContactKind.HAZARD, hostile: false, alive: true, radius: 14, tags: [],
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, ...over };
}

// A body thrown along -x (toward the origin) at `speed`, passing `offsetZ` off the pilot's centre,
// positioned so it reaches the closest approach at `etaStart` seconds into the sequence.
function thrownAt(tick, { speed = 400, etaStart = 0.8, offsetZ = 4, dir = 1, ...over } = {}) {
  const t = tick / 60;
  return body({
    pos: { x: dir * speed * (etaStart - t), z: offsetZ },
    vel: { x: -dir * speed, z: 0 },
    ...over,
  });
}

function run(pilotId, makeContacts, { ticks = 60, temperament = ALERT, self = selfFrame(), intent = INTENT, bodyDodgeOnly = false } = {}) {
  const engine = createReflexEngine({ seed: SEED });
  const rs = emptyReflexState();
  const out = [];
  for (let tick = 0; tick <= ticks; tick += TICK_STEP) {
    out.push({ tick, reflex: engine.evaluate({
      entityId: pilotId, tick, self, contacts: makeContacts(tick), target: null, intent,
      temperament, reflexState: rs, bodyDodgeOnly,
    }) });
  }
  return out;
}

const firstDodge = (frames) => frames.find((f) => f.reflex && f.reflex.kind === REFLEX_KIND.BODY_DODGE) || null;
const reactionTicksFor = (t, rear) => 8 + Math.round((1 - t.dash) * 18) + (rear ? 12 : 0);

test('an alert pilot sees a wreck thrown at it, reacts after a human beat, and steps off the body line', () => {
  const pilot = pilotWhere((id) => notices(id, 'wreck-1', ALERT));
  const frames = run(pilot, (tick) => [thrownAt(tick)], { ticks: 40 });
  const dodge = firstDodge(frames);
  assert.ok(dodge, 'an alert light pilot SOMETIMES sidesteps a thrown wreck');
  const reaction = reactionTicksFor(ALERT, false);
  assert.ok(dodge.tick >= reaction,
    `a pilot needs a reaction beat before sidestepping (fired at ${dodge.tick}, reaction ${reaction})`);
  assert.ok(dodge.tick < reaction + 2 * TICK_STEP, `but it fires as soon as the beat elapses (fired at ${dodge.tick})`);
  for (const f of frames) {
    if (f.tick < reaction) assert.equal(f.reflex, null, `no dodge before reaction ticks elapse (tick ${f.tick})`);
  }
  // Body flies along -x passing +4 z of the pilot's centre: perpendicular is world z, away side is -z.
  const { dodge: dir } = dodge.reflex;
  assert.ok(Math.abs(dir.x) < 1e-9 && Math.abs(Math.hypot(dir.x, dir.z) - 1) < 1e-9,
    'the sidestep is perpendicular to the thrown body\'s relative velocity');
  assert.ok(dir.z < 0, 'the sidestep points away from the side the body will pass');
  assert.equal(dodge.reflex.boost, true, 'a light hull burns to clear the lane');
  assert.equal(dodge.reflex.dropAim, true, 'the pilot gives up aim to save the hull');
  assert.ok(dodge.reflex.dodgeAmp >= 60, 'the sidestep is decisive');
});

test('the away side flips with the pass side', () => {
  const pilot = pilotWhere((id) => notices(id, 'wreck-1', ALERT));
  const dodge = firstDodge(run(pilot, (tick) => [thrownAt(tick, { offsetZ: -4 })], { ticks: 40 }));
  assert.ok(dodge && dodge.reflex.dodge.z > 0, 'a body passing on the -z side pushes the pilot toward +z');
});

test('a surprised pilot still gets hit: from the rear arc a slow-reacting pilot never sidesteps in time', () => {
  const pilot = pilotWhere((id) => notices(id, 'wreck-1', SLOW_SIGHTED, false) && !notices(id, 'wreck-1', SLOW_SIGHTED, true));
  const front = firstDodge(run(pilot, (tick) => [thrownAt(tick)], { temperament: SLOW_SIGHTED, ticks: 48 }));
  assert.ok(front, 'the same pilot would have sidestepped the same body coming from the front');
  const rear = run(pilot, (tick) => [thrownAt(tick, { dir: -1 })], { temperament: SLOW_SIGHTED, ticks: 48 });
  assert.equal(firstDodge(rear), null, 'a surprised pilot hit from behind does not dodge before impact');
});

test('rear-arc bodies need longer reaction time even for a pilot who notices', () => {
  const pilot = pilotWhere((id) => notices(id, 'wreck-1', ALERT, true));
  const rear = firstDodge(run(pilot, (tick) => [thrownAt(tick, { dir: -1, etaStart: 1.3 })], { ticks: 78 }));
  assert.ok(rear, 'an alert pilot can notice a body from behind');
  assert.ok(rear.tick >= reactionTicksFor(ALERT, true), `rear arc adds reaction time (fired at ${rear.tick})`);
});

test('nobody dodges what they could not see: a rock between pilot and body blocks the dodge', () => {
  const pilot = pilotWhere((id) => notices(id, 'wreck-1', ALERT));
  const rock = body({ id: 'rock-9', radius: 40, pos: { x: 90, z: 0 } });
  const lane = (tick) => thrownAt(tick, { etaStart: 1.3 });
  const frames = run(pilot, (tick) => [lane(tick), rock], { ticks: 60 });
  assert.equal(firstDodge(frames), null, 'an asteroid between pilot and thrown body means no dodge');
  const clear = run(pilot, (tick) => [lane(tick), { ...rock, pos: { x: 90, z: 300 } }], { ticks: 60 });
  assert.ok(firstDodge(clear), 'a rock off the line of sight does not blind the pilot');
});

test('a slow drifting rock is not a thrown body', () => {
  const pilot = pilotWhere((id) => notices(id, 'wreck-1', ALERT));
  const frames = run(pilot, (tick) => [thrownAt(tick, { speed: 30, etaStart: 6 })], { ticks: 48 });
  assert.equal(firstDodge(frames), null, `bodies under ${MOVING_BODY_MIN_SPEED} WU/s are ignored by the thrown-body reflex`);
});

test('a capital hull never dodges a thrown body', () => {
  const pilot = pilotWhere((id) => notices(id, 'wreck-1', ALERT));
  const frames = run(pilot, (tick) => [thrownAt(tick)], { self: selfFrame({ operationalMassBand: 'capital' }), ticks: 48 });
  assert.equal(firstDodge(frames), null, 'a capital cannot sidestep a thrown wreck');
});

test('heavier hulls dodge with less amplitude than light hulls', () => {
  const pilot = pilotWhere((id) => notices(id, 'wreck-1', ALERT));
  const amp = (band) => firstDodge(run(pilot, (tick) => [thrownAt(tick)], { self: selfFrame({ operationalMassBand: band }), ticks: 40 })).reflex.dodgeAmp;
  assert.ok(amp('light') > amp('medium') && amp('medium') > amp('heavy'), 'mass bands scale the sidestep: light > medium > heavy');
  const heavy = firstDodge(run(pilot, (tick) => [thrownAt(tick)], { self: selfFrame({ operationalMassBand: 'heavy' }), ticks: 40 }));
  assert.equal(heavy.reflex.boost, false, 'only light hulls boost out of the lane');
});

test('a live, non-tumbling ship on a head-on pass is left to ship collision avoidance', () => {
  const pilot = pilotWhere((id) => notices(id, 'ship-7', ALERT));
  const ship = (tick) => thrownAt(tick, { id: 'ship-7', kind: ContactKind.SHIP, hostile: true, tumbling: false, disabled: false });
  assert.equal(firstDodge(run(pilot, (tick) => [ship(tick)], { ticks: 48 })), null,
    'dogfighting ships do not trigger the thrown-body reflex, so dogfights do not jitter');
});

test('a whipped (tumbling) or disabled ship thrown at the pilot is dodged like a wreck', () => {
  const pilot = pilotWhere((id) => notices(id, 'ship-7', ALERT));
  for (const flag of ['tumbling', 'disabled']) {
    const thrownShip = (tick) => thrownAt(tick, { id: 'ship-7', kind: ContactKind.SHIP, hostile: true, [flag]: true });
    const dodge = firstDodge(run(pilot, (tick) => [thrownShip(tick)], { ticks: 40 }));
    assert.ok(dodge, `a ${flag} ship flung at an NPC is dodged by an alert pilot`);
  }
});

test('a thrown pod (objective) is dodged too', () => {
  const pilot = pilotWhere((id) => notices(id, 'pod-3', ALERT));
  const frames = run(pilot, (tick) => [thrownAt(tick, { id: 'pod-3', kind: ContactKind.OBJECTIVE })], { ticks: 40 });
  assert.ok(firstDodge(frames), 'cargo pods and rescue pods fly like any other thrown body');
});

test('a body on a miss course (well off the hull) is not dodged', () => {
  const pilot = pilotWhere((id) => notices(id, 'wreck-1', ALERT));
  const frames = run(pilot, (tick) => [thrownAt(tick, { offsetZ: 90 })], { ticks: 48 });
  assert.equal(firstDodge(frames), null, 'a body that will clear the hull by a wide margin needs no sidestep');
});

test('the same sequence evaluated twice gives identical outputs', () => {
  const pilot = pilotWhere((id) => notices(id, 'wreck-1', ALERT));
  const a = run(pilot, (tick) => [thrownAt(tick)], { ticks: 60 });
  const b = run(pilot, (tick) => [thrownAt(tick)], { ticks: 60 });
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'thrown-body dodge is deterministic');
});

test('the dodge is one burst: it ends, cools down, and a lost threat resets the reaction clock', () => {
  const pilot = pilotWhere((id) => notices(id, 'wreck-1', ALERT));
  const engine = createReflexEngine({ seed: SEED });
  const rs = emptyReflexState();
  const evalAt = (tick, contacts) => engine.evaluate({ entityId: pilot, tick, self: selfFrame(), contacts,
    target: null, intent: INTENT, temperament: ALERT, reflexState: rs });
  evalAt(0, [thrownAt(0)]);
  assert.ok(rs.bodyWatch && rs.bodyWatch.bodyId === 'wreck-1', 'the pilot is tracking the body');
  evalAt(2, []);
  assert.equal(rs.bodyWatch, null, 'a body that stops qualifying resets the reaction clock');
  const frames = run(pilot, (tick) => [thrownAt(tick, { etaStart: 1.3 })], { ticks: 100 });
  const dodges = frames.filter((f) => f.reflex && f.reflex.kind === REFLEX_KIND.BODY_DODGE);
  assert.ok(dodges.length > 0 && dodges.length <= 30 / TICK_STEP + 1, 'a single burst, not a continuous dodge');
});

test('bodyDodgeOnly runs the thrown-body reflex and nothing else', () => {
  const pilot = pilotWhere((id) => notices(id, 'wreck-1', ALERT));
  const hurt = selfFrame({ hullFraction: 0.5, heatFraction: 0.95 });
  const marker = { id: 'h1', kind: ContactKind.SHIP, hostile: true, alive: true, team: 3, targetId: 'pilot',
    pos: { x: 0, z: 500 }, vel: { x: 0, z: 0 }, tags: [] };
  const quiet = run(pilot, () => [marker], { self: hurt, bodyDodgeOnly: true, ticks: 20 });
  assert.ok(quiet.every((f) => f.reflex === null), 'hit weave, marked weave and simmer stay out of mind-owned hulls');
  const frames = run(pilot, (tick) => [thrownAt(tick), marker], { self: hurt, bodyDodgeOnly: true, ticks: 40 });
  assert.ok(firstDodge(frames), 'a mind-owned hull still dodges a thrown body');
  const kinds = new Set(frames.filter((f) => f.reflex).map((f) => f.reflex.kind));
  assert.deepEqual([...kinds], [REFLEX_KIND.BODY_DODGE], 'only the body dodge ever runs in bodyDodgeOnly mode');
});

test('the number: across twenty pilots some sidestep the thrown wreck and some still get hit', () => {
  let dodged = 0;
  let hit = 0;
  for (let id = 1; id <= 20; id++) {
    const frames = run(id, (tick) => [thrownAt(tick, { speed: 350, etaStart: 0.86 })], { ticks: 50 });
    // The wreck reaches the hull at 0.86 s (tick ~52); a dodge before then is an evade.
    if (firstDodge(frames)) dodged++; else hit++;
  }
  assert.ok(dodged > 0, `some alert pilots sidestep (dodged ${dodged}/20)`);
  assert.ok(hit > 0, `some surprised pilots still get hit (hit ${hit}/20)`);
});

// ── planner level ─────────────────────────────────────────────────────────────

const SLEW = { inputSlewPerTick: 1, emergencyInputSlewPerTick: 1, torqueSlewPerTick: 1, emergencyTorqueSlewPerTick: 1,
  shipCollisionLookahead: 0 };

function planRun(entityId, { mindOwned = false, withBody = true, ticks = 40 } = {}) {
  const planner = new ManeuverPlanner({ seed: SEED, config: SLEW });
  const target = { id: 1, kind: 'ship', pos: { x: 500, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, tags: [], confidence: 1, hostile: true };
  const maneuver = { kind: ManeuverKind.INTERCEPT, targetId: 1, flightPoint: { x: 500, z: 0 },
    formationSlot: { x: 500, z: 0 }, formationBound: 170, breakFormation: true, ...(mindOwned ? { enemyMindOwned: true } : {}) };
  const directive = { squadId: 'b045', formation: { slot: { x: 500, z: 0 }, bound: 170, breakFormation: true } };
  const log = [];
  for (let tick = 1; tick <= ticks; tick += TICK_STEP) {
    const wreck = thrownAt(tick, { id: 'wreck-1', speed: 400, etaStart: 0.8, offsetZ: 4 });
    const perception = {
      tick,
      self: { id: entityId, team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12,
        energyFraction: 1, heatFraction: 0, combatDoctrineId: 'interceptor_flyby', operationalMassBand: 'light' },
      contacts: withBody ? [target, wreck] : [target],
    };
    const request = planner.plan({ entityId, tick, perception, behavior: { maneuver }, directive });
    log.push({ tick, request, reflex: planner.byEntity.get(entityId).lastReflex });
  }
  return log;
}

test('through the real planner a dodging pilot is commanded off the body line, mind-owned hulls included', () => {
  const pilot = pilotWhere((id) => notices(id, 'wreck-1', temperamentOf(id)));
  for (const mindOwned of [false, true]) {
    const withBody = planRun(pilot, { mindOwned });
    const baseline = planRun(pilot, { mindOwned, withBody: false });
    const dodgeFrames = withBody.filter((f) => f.reflex === REFLEX_KIND.BODY_DODGE);
    const label = mindOwned ? 'a mind-owned hull' : 'an ordinary hull';
    assert.ok(dodgeFrames.length > 0, `${label} dodges a thrown body (reflex ${withBody.map((f) => f.reflex).join(',')})`);
    for (const f of dodgeFrames) {
      const base = baseline.find((b) => b.tick === f.tick).request.forceLocal;
      const dev = Math.abs(f.request.forceLocal.right - base.right);
      assert.ok(dev > 0.3, `${label} is commanded off the body's line (lateral deviation ${dev.toFixed(2)} at tick ${f.tick})`);
    }
    for (const f of withBody) {
      if (f.reflex !== REFLEX_KIND.BODY_DODGE) assert.ok(f.reflex == null || !mindOwned, `${label} runs no other reflex`);
    }
  }
});

import { temperamentFor } from '../src/ai/temperament.js';
function temperamentOf(id) {
  return temperamentFor(id, { seed: SEED, doctrineId: 'interceptor_flyby', massBand: 'light' });
}
