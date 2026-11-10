import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  difficultyDamageScale,
  pacingScale,
  PACING_INCOMING_FLOOR,
  PACING_OUTGOING_CAP,
} from '../src/data/difficulty.js';
import { difficultyDirector } from '../src/systems/difficultyDirector.js';
import { effectiveActivityForAI } from '../src/ai/doctrine.js';

function makeHarness({
  hull = 140,
  hullMax = 140,
  shield = 0,
  shieldMax = 0,
  credits = 10000,
  heat = 0,
  streak = 0,
  difficulty = 'veteran',       // unsoftened profile keeps the pacing scale easy to read
  simTime = 0,
  run = null,
  attackerAi = null,
  attackerHull = 100,
  encounterLive = null,
} = {}) {
  const player = {
    id: 'player', type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull, hullMax, shield, shieldMax,
    flags: {},
  };
  const attacker = {
    id: 'raider', type: 'ship', alive: true,
    pos: { x: 80, z: 0 }, vel: { x: 0, z: 0 },
    hull: attackerHull, hullMax: attackerHull, shield: 0,
    data: { ai: attackerAi || {} },
  };
  const state = {
    playerId: 'player',
    player: {
      credits, flags: {}, heat,
      defeatStreak: { count: streak, lastDefeatSimTime: streak > 0 ? simTime : null },
    },
    entities: new Map([['player', player], ['raider', attacker]]),
    entityList: [player, attacker],
    settings: { gameplay: { difficulty } },
    encounterDirector: encounterLive ? { live: encounterLive } : undefined,
    run,
    simTime,
    tick: 0,
  };
  const bus = createBus();
  const dir = Object.create(difficultyDirector);
  dir.init({ state, bus, registry: { get: () => null }, helpers: {} });
  const events = [];
  bus.on('difficulty:pinReleased', (p) => events.push(p));
  return { state, bus, dir, player, attacker, events };
}

/** Player takes `dmg` from 'raider' each second for `seconds`; the director ticks at 1 Hz. */
function takeHits(h, seconds, dmg = 1) {
  for (let t = 0; t < seconds; t++) {
    h.state.simTime += 1;
    h.bus.emit('combat:damage', {
      targetId: 'player', attackerId: 'raider', applied: dmg, isPlayer: true,
    });
    h.dir.update(1, h.state);
  }
}

/** Player deals `dmg` to 'raider' each second while also taking harassment. */
function fightBack(h, seconds, incoming = 1, outgoing = 2) {
  for (let t = 0; t < seconds; t++) {
    h.state.simTime += 1;
    h.bus.emit('combat:damage', {
      targetId: 'player', attackerId: 'raider', applied: incoming, isPlayer: true,
    });
    h.bus.emit('combat:damage', {
      targetId: 'raider', attackerId: 'player', applied: outgoing, isPlayer: false,
    });
    h.dir.update(1, h.state);
  }
}

function idle(h, seconds, each = null) {
  for (let t = 0; t < seconds; t++) {
    h.state.simTime += 1;
    if (each) each(h.state.simTime);
    h.dir.update(1, h.state);
  }
}

const pacing = (h) => h.state.difficulty.pacing;
const incomingScale = (h) => difficultyDamageScale(h.state, 'raider', 'player');
const outgoingScale = (h) => difficultyDamageScale(h.state, 'player', 'raider');

test('a spiraling player: incoming pressure decays measurably inside 3 sim-minutes', () => {
  const h = makeHarness({ hull: 30, hullMax: 140, streak: 3 });
  const base = incomingScale(h);
  assert.equal(base, 1, 'veteran profile + no pacing = unscaled incoming');
  takeHits(h, 180, 3);                                    // ~30%/window of the pool, sustained
  const p = pacing(h);
  assert.equal(p.stance, 'recovery', 'spiral reads as recovery');
  assert.ok(incomingScale(h) <= base * 0.65,
    `incoming eased ${((1 - incomingScale(h) / base) * 100).toFixed(0)}% within 3 min`);
  assert.ok(p.pressureMult > PACING_INCOMING_FLOOR - 1e-9 && p.pressureMult < 1,
    'pressure eases but never reaches zero');
  h.dir.destroy();
});

test('a cruising player: the world offers more (outgoing scale opens)', () => {
  const h = makeHarness({ hull: 140, hullMax: 140, credits: 10000 });
  const base = outgoingScale(h);
  assert.equal(base, 1);
  // ~20% credit growth over the window plus zero incoming pressure.
  idle(h, 200, (t) => { h.state.player.credits = 10000 + t * 12; });
  const p = pacing(h);
  assert.equal(p.stance, 'surge');
  assert.ok(outgoingScale(h) > base * 1.05,
    `cruising lift lands (${outgoingScale(h).toFixed(3)} vs ${base})`);
  assert.ok(incomingScale(h) <= 1, 'surge never raises incoming pressure');
  h.dir.destroy();
});

test('the harasser pin resolves via director-driven disengagement inside 10 minutes', () => {
  const h = makeHarness({ hull: 140, hullMax: 140 });
  let fledAt = null;
  for (let t = 0; t < 600 && fledAt == null; t++) {
    h.state.simTime += 1;
    h.bus.emit('combat:damage', {
      targetId: 'player', attackerId: 'raider', applied: 1, isPlayer: true,
    });
    h.dir.update(1, h.state);
    if (h.attacker.data.ai.forceFlee === true) fledAt = h.state.simTime;
  }
  assert.ok(fledAt != null, 'a one-sided pin must end in disengagement');
  assert.ok(fledAt <= 600, `pin released at ${fledAt}s (limit 600)`);
  const activity = effectiveActivityForAI(h.attacker.data.ai);
  assert.equal(activity.kind, 'flee', 'the doctrine stack obeys the stamped flee order');
  assert.equal(h.attacker.data.ai.moraleFleeReason, 'pacing_pin_release');
  assert.equal(h.events.length, 1, 'one pinReleased receipt');
  h.dir.destroy();
});

test('a player who is actually resolving the fight keeps it — no mercy steal', () => {
  const h = makeHarness({ hull: 140, hullMax: 140, attackerHull: 60 });
  fightBack(h, 300, 1, 3);        // TTK ~20-60s — clearly resolving
  assert.notEqual(h.attacker.data.ai.forceFlee, true,
    'director never breaks off a fight the player is winning');
  h.dir.destroy();
});

test('pin release exemptions: bosses, lawful pressure on wanted, encounter squads', () => {
  // Authored duel — the boss owns its resolution.
  let h = makeHarness({ attackerAi: {} });
  h.attacker.data.isBoss = true;
  takeHits(h, 320, 2);
  assert.notEqual(h.attacker.data.ai.forceFlee, true, 'boss fights are never interrupted');
  h.dir.destroy();

  // Lawful pressure on a wanted player is the law lane's jurisdiction.
  h = makeHarness({ attackerAi: { lawful: true }, heat: 0.5 });
  takeHits(h, 320, 2);
  assert.notEqual(h.attacker.data.ai.forceFlee, true, 'lawful pursuit is not harassment');
  h.dir.destroy();

  // Encounter-owned squad members resolve through script machinery.
  h = makeHarness({ encounterLive: { enc1: { phase: 'conflict', ids: ['raider'] } } });
  takeHits(h, 320, 2);
  assert.notEqual(h.attacker.data.ai.forceFlee, true, 'encounter-owned squads are exempt');
  h.dir.destroy();
});

test('bounds: pressure never reaches zero, opportunity never caps the player', () => {
  const h = makeHarness({ hull: 5, hullMax: 140, streak: 9, credits: 10 });
  takeHits(h, 400, 5);            // catastrophic sustained pressure
  const p = pacing(h);
  assert.equal(p.stance, 'recovery');
  assert.ok(p.pressureMult >= PACING_INCOMING_FLOOR - 1e-9,
    `incoming floor holds (${p.pressureMult})`);
  assert.ok(p.opportunityMult >= 1, 'recovery never reduces player damage');
  const s = pacingScale(h.state);
  assert.ok(s.incoming >= PACING_INCOMING_FLOOR && s.outgoing <= PACING_OUTGOING_CAP);
  h.dir.destroy();

  const g = makeHarness({ hull: 9999, hullMax: 9999, credits: 100 });
  idle(g, 240, (t) => { g.state.player.credits = 100 + t * 500; });
  const gp = pacing(g);
  assert.equal(gp.stance, 'surge');
  assert.ok(gp.opportunityMult <= PACING_OUTGOING_CAP + 1e-9,
    `outgoing cap holds (${gp.opportunityMult})`);
  assert.ok(gp.pressureMult <= 1, 'surge never inflates incoming pressure');
  g.dir.destroy();
});

test('the stance is one inspectable state field', () => {
  const h = makeHarness({ hull: 20, hullMax: 140, streak: 3 });
  takeHits(h, 120, 3);
  const p = h.state.difficulty.pacing;
  assert.ok(p && typeof p === 'object', 'state.difficulty.pacing exists');
  assert.ok(['recovery', 'steady', 'surge'].includes(p.stance));
  assert.equal(p.stance, 'recovery');
  assert.ok(Number.isFinite(p.stress) && Number.isFinite(p.ease), 'scores readable for tuning');
  h.dir.destroy();
});

test('determinism: same scripted inputs → identical stance timeline', () => {
  const run = () => {
    const h = makeHarness({ hull: 50, hullMax: 140, streak: 2 });
    const timeline = [];
    for (let t = 0; t < 240; t++) {
      h.state.simTime += 1;
      if (t % 2 === 0) {
        h.bus.emit('combat:damage', {
          targetId: 'player', attackerId: 'raider', applied: 2, isPlayer: true,
        });
      }
      h.dir.update(1, h.state);
      const p = h.state.difficulty.pacing;
      timeline.push(`${p.stance}:${p.pressureMult.toFixed(4)}:${p.opportunityMult.toFixed(4)}`);
    }
    h.dir.destroy();
    return timeline;
  };
  assert.deepEqual(run(), run(), 'two identical sessions produce identical pacing timelines');
});

test('a scored survival run pins the director to steady — the arena keeps its own tuning', () => {
  const h = makeHarness({
    hull: 20, hullMax: 140, streak: 4,
    run: { kind: 'survival', phase: 'live' },
  });
  takeHits(h, 200, 4);
  const p = pacing(h);
  assert.equal(p.stance, 'steady');
  assert.equal(p.pressureMult, 1);
  assert.equal(p.opportunityMult, 1);
  h.dir.destroy();
});

test('flee hold expires: the NPC may re-engage after the stand-down window', () => {
  const h = makeHarness({ hull: 140, hullMax: 140 });
  takeHits(h, 260, 1);
  assert.equal(h.attacker.data.ai.forceFlee, true, 'pin released');
  const holdUntil = h.attacker.data.ai._pacingFleeUntil;
  idle(h, Math.ceil(holdUntil - h.state.simTime) + 2);
  assert.notEqual(h.attacker.data.ai.forceFlee, true, 'hold expires and clears the order');
  assert.equal(h.attacker.data.ai._pacingFleeUntil, undefined);
  h.dir.destroy();
});
