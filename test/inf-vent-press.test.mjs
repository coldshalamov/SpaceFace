// inf-vent-press — the crew across from you reads your guns going cold.
// The pilot's forced heat vent is the one receipt: the nearest engaged crews tighten their band
// for the window, the nearest calls it over the band (once per cooldown), exempt hulls keep their
// authored contract, and every stamp hands the authored activity back exactly once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  VENT_PRESS_REASON, VENT_PRESS_TAIL_S, VENT_PRESS_CALL_COOLDOWN_S, VENT_PRESS_MAX_PRESSERS,
  ventPressRange, ventPressLive, noteVentPress, stepVentPressRestores,
} from '../src/ai/ventPress.js';
import { VENT_PRESS_BARKS, ventPressBarkFor, BARK_FACTIONS } from '../src/data/barks.js';
import { movementForActivity, ActivityKind, RulesOfEngagement } from '../src/ai/doctrine.js';
import { CombatDoctrineRuntime, CombatDoctrineId } from '../src/ai/combatDoctrine.js';
import { ContactKind, ObjectiveKind } from '../src/ai/contracts.js';
import { stepShovePanicRestores } from '../src/systems/tacticalAI.js';

const PLAYER = 1;

function hull(id, x, { factionId = 'faction_reach', target = PLAYER, ai = {}, data = {} } = {}) {
  return {
    id, type: 'ship', alive: true, factionId, pos: { x, z: 0 },
    data: { combat: { targetId: target }, ai: { ...ai }, ...data },
  };
}

function world() {
  const player = { id: PLAYER, type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: {} };
  const ships = [
    hull('a', 400),
    hull('b', 700, { ai: { activity: { kind: 'attack_run', targetId: PLAYER, preferredRange: 600, reason: 'encounter' } } }),
    hull('c', 900),
    hull('d', 1200),
    hull('far', 2000),
    hull('boss', 300, { data: { isBoss: true } }),
    hull('runner', 350, { ai: { fsm: 'flee' } }),
    hull('busy', 380, { target: 99 }),
    hull('law', 390, { ai: { activity: { kind: 'attack_run', targetId: PLAYER, reason: 'security_response:x' } } }),
  ];
  const entities = new Map([[PLAYER, player], ...ships.map((s) => [s.id, s])]);
  const state = { playerId: PLAYER, mode: 'flight', simTime: 10, tick: 600, meta: { seed: 4242 }, entities };
  return { state, ships, byId: (id) => entities.get(id) };
}

function harness() {
  const emitted = [];
  const said = [];
  const bus = { emit: (ev, p) => emitted.push({ ev, p }) };
  const helpers = { voice: { say: (p) => said.push(p) } };
  return { emitted, said, bus, helpers, runtime: { lastCallAt: -Infinity } };
}

const start = (until) => ({ ownerId: PLAYER, phase: 'start', startedAt: 10, until });

test('the band tightens, never widens, never under the floor', () => {
  assert.equal(ventPressRange(600), 330);
  assert.equal(ventPressRange(240), 140);
  assert.equal(ventPressRange(120), 120);
  assert.equal(ventPressRange(Number.NaN), 140);
  assert.equal(ventPressRange(0), 140);
});

test('every voiced faction calls the vent in its own register', () => {
  for (const id of BARK_FACTIONS) {
    assert.ok(Array.isArray(VENT_PRESS_BARKS[id]) && VENT_PRESS_BARKS[id].length >= 3, id);
    for (const line of VENT_PRESS_BARKS[id]) assert.ok(typeof line === 'string' && line.length > 6 && !/undefined|NaN|\{/.test(line), line);
  }
  assert.ok(VENT_PRESS_BARKS.faction_free.includes(ventPressBarkFor('faction_nobody', 1)), 'unknown houses speak plainly');
});

test('the pilot vent stamps the three nearest engaged crews and the nearest calls it', () => {
  const { state, byId } = world();
  const h = harness();
  const ships = [...state.entities.values()];
  const pressers = noteVentPress(state, start(12), { candidates: ships, ...h });
  assert.deepEqual(pressers.map((e) => e.id), ['a', 'b', 'c'], 'nearest three engaged, eligible hulls');
  assert.equal(pressers.length, VENT_PRESS_MAX_PRESSERS);
  for (const id of ['d', 'far', 'boss', 'runner', 'busy', 'law']) {
    assert.equal(byId(id).data.ai.ventPress, undefined, `${id} keeps its contract`);
  }
  const a = byId('a').data.ai;
  assert.equal(a.ventPress.until, 12 + VENT_PRESS_TAIL_S);
  assert.deepEqual(a.activity, { kind: 'attack_run', reason: VENT_PRESS_REASON, targetId: PLAYER, preferredRange: 198 });
  assert.equal(a.ventPressBase, null, 'no authored activity existed');
  const b = byId('b').data.ai;
  assert.equal(b.activity.preferredRange, 330, "b's own 600 band tightens");
  assert.equal(b.ventPressBase.reason, 'encounter', 'the authored record is stashed');
  const call = h.emitted.find((row) => row.ev === 'ai:ventPress');
  assert.ok(call, 'one press receipt');
  assert.equal(call.p.speakerId, 'a');
  assert.ok(VENT_PRESS_BARKS.faction_reach.includes(call.p.text), 'the line comes from the speaker register');
  assert.equal(h.said.length, 1);
  assert.equal(h.said[0].text, call.p.text);
  assert.equal(h.said[0].channel, 'bark');
});

test('only the pilot start receipt in flight presses', () => {
  for (const [payload, mode] of [
    [{ ownerId: 7, phase: 'start', until: 12 }, 'flight'],
    [{ ownerId: PLAYER, phase: 'end' }, 'flight'],
    [start(12), 'docked'],
  ]) {
    const { state } = world();
    state.mode = mode;
    const h = harness();
    assert.deepEqual(noteVentPress(state, payload, { candidates: [...state.entities.values()], ...h }), []);
    assert.equal(h.emitted.length + h.said.length, 0);
  }
});

test('a re-vent extends the press but the band hears one call per cooldown', () => {
  const { state, byId } = world();
  const h = harness();
  const ships = () => [...state.entities.values()];
  noteVentPress(state, start(12), { candidates: ships(), ...h });
  state.simTime = 12.2; state.tick = 732;
  noteVentPress(state, start(14.2), { candidates: ships(), ...h });
  assert.equal(byId('a').data.ai.ventPress.until, 14.2 + VENT_PRESS_TAIL_S, 'window extended');
  assert.equal(byId('b').data.ai.ventPressBase.reason, 'encounter', 'stash still holds the authored record');
  assert.equal(h.said.length, 1, 'no second call inside the cooldown');
  assert.equal(h.emitted.filter((r) => r.ev === 'ai:ventPress').at(-1).p.text, null);
  state.simTime = 10 + VENT_PRESS_CALL_COOLDOWN_S + 1; state.tick += 1200;
  noteVentPress(state, { ...start(state.simTime + 2) }, { candidates: ships(), ...h });
  assert.equal(h.said.length, 2, 'the cooldown re-arms');
});

test('the press moves the hull: activity range and the doctrine band both tighten', () => {
  const { state, byId } = world();
  noteVentPress(state, start(12), { candidates: [...state.entities.values()], ...harness() });
  const moved = movementForActivity({ kind: 'intercept', preferredRange: 600 }, byId('b').data.ai.activity, null, (x) => x);
  assert.equal(moved.preferredRange, 330);

  const band = (reason) => {
    const runtime = new CombatDoctrineRuntime({ seed: 9 });
    const out = runtime.update({
      tick: 0, entityId: 2, doctrineId: CombatDoctrineId.RANGED_STALKER,
      perception: {
        self: {
          id: 2, team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
          combatDoctrineId: CombatDoctrineId.RANGED_STALKER,
          activity: { kind: ActivityKind.ATTACK_RUN, reason, anchor: { x: 0, z: 0 }, leashRadius: 2600, preferredRange: 180, startedTick: 0 },
          roe: RulesOfEngagement.WEAPONS_FREE,
        },
        contacts: [{ id: 1, kind: ContactKind.SHIP, alive: true, valid: true, visible: true, ageTicks: 0, hostile: true,
          confidence: 1, threat: 0.7, pos: { x: 700, z: 0 }, vel: { x: 0, z: 0 }, tethered: false,
          operationalMassBand: 'medium', mobilityBand: 'medium', cargoBand: 'empty', tetherabilityBand: 'good', tags: [] }],
        events: [],
      },
      directive: { tick: 0, squadId: 's', memberId: 2, role: 'striker', tactic: 'standoff_focus', focusTargetId: 1,
        objective: { kind: ObjectiveKind.FOCUS, targetId: 1, reason: 'fixture' },
        formation: { kind: 'wedge', slot: { x: 0, z: 0 }, velocity: { x: 0, z: 0 }, bound: 170, breakFormation: false, breakReason: null } },
    });
    return out && out.preferredRange;
  };
  const authored = band('encounter');
  const pressed = band(VENT_PRESS_REASON);
  assert.ok(Number.isFinite(authored) && authored > 140, `authored band ${authored}`);
  assert.equal(pressed, ventPressRange(authored), 'the doctrine holds the pressed band');
  assert.ok(pressed < authored);
});

test('the press hands the authored activity back exactly once, through a shove too', () => {
  const { state, byId } = world();
  noteVentPress(state, start(12), { candidates: [...state.entities.values()], ...harness() });
  const list = [...state.entities.values()];
  state.simTime = 12.5;
  stepVentPressRestores(state, list);
  assert.equal(byId('a').data.ai.activity.reason, VENT_PRESS_REASON, 'tail still live');
  // c is shoved mid-press: the panic stashes the press record as its own base.
  const c = byId('c').data.ai;
  c.shovePanicBase = c.activity;
  c.activity = { kind: 'reposition', reason: 'shove_panic', preferredRange: 620 };
  c.shovePanic = { until: 20, startedAt: 12.5 };
  state.simTime = 13;
  stepVentPressRestores(state, list);
  assert.equal(byId('a').data.ai.activity, undefined, 'no prior activity: the press leaves nothing behind');
  assert.equal(byId('b').data.ai.activity.reason, 'encounter', 'authored record restored');
  assert.equal(byId('b').data.ai.ventPressBase, undefined);
  assert.equal(ventPressLive(byId('b').data.ai, 13), false);
  assert.equal(c.activity.reason, 'shove_panic', 'the panic keeps its break');
  assert.equal(c.shovePanicBase, null, 'the stale press never comes back through the panic stash');
  state.simTime = 21;
  stepShovePanicRestores(state, list);
  assert.equal(c.activity, undefined, 'after the panic the hull is back to its authored nothing');
});

test('the live tactical owner hears the pilot vent', () => {
  const src = readFileSync(new URL('../src/systems/tacticalAI.js', import.meta.url), 'utf8');
  assert.match(src, /listenLifecycle\(ctx\.bus, 'weapons:vent', handleVentPress\)/);
  assert.match(src, /stepVentPressRestores\(state, shipLikeList\)/);
  const weapons = readFileSync(new URL('../src/systems/weapons.js', import.meta.url), 'utf8');
  assert.match(weapons, /'weapons:vent', \{[\s\S]{0,120}phase: 'start'/, 'the vent start receipt the press reads');
});
