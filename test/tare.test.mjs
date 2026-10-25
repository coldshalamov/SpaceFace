// TARE / WG-2 (row 506 member 6) — the weighing robot on the Dione Lane scale deck.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TARE } from '../src/data/tare.js';
import { VERGE_LINE_TRIAL } from '../src/data/factions/vergelayers.js';
import {
  tareWeighable, tareTargetAt, tareMatches, tareReadLine, tareTargetLine, tareFragmentSpot,
} from '../src/characters/tareRules.js';
import { createTare, tareSpec, tareFragmentSpec } from '../src/systems/tare.js';
import { createBus } from '../src/core/eventBus.js';

function fixture({ sector = 'sector_dione_lane', runKind = 'adventure' } = {}) {
  const bus = createBus();
  const popups = [];
  bus.on('comms:popup', (p) => popups.push(p));
  const player = { id: 7, alive: true, isPlayer: true, pos: { x: 900, z: 200 }, vel: { x: 0, z: 0 } };
  const state = {
    run: { kind: runKind },
    world: { currentSectorId: sector },
    story: { flags: {} },
    simTime: 100,
    playerId: player.id,
    player,
    entityList: [player],
    entities: new Map([[player.id, player]]),
  };
  const helpers = {
    spawnEntity(spec) { const e = { id: 900 + state.entityList.length, alive: true, ...spec }; state.entityList.push(e); state.entities.set(e.id, e); return e; },
    removeEntity(id) { const e = state.entities.get(id); if (e) e.alive = false; },
    sectorCookProviders: [],
  };
  const sys = createTare();
  sys.init({ state, bus, helpers });
  return { state, bus, helpers, popups, sys };
}

const onDeck = (id, mass, extra = {}) => ({
  id, alive: true, pos: { x: TARE.post.x + 10, z: TARE.post.z - 5 }, vel: { x: 0, z: 0 }, mass, data: {}, ...extra,
});
const says = (popups, prefix) => popups.filter((p) => String(p.id).startsWith(prefix));

test('spec + spawn: marked robot in sector only, tare-set announce once per visit', () => {
  const s = tareSpec();
  assert.equal(s.data.tare, true);
  assert.equal(s.data.authoredCharacter, 'tare');
  const { state, popups } = fixture();
  assert.equal(state.entityList.filter((e) => e.data?.tare).length, 1);
  const set = says(popups, 'tare_set');
  assert.equal(set.length, 1);
  assert.match(set[0].text, /TARE SET\./);
  assert.match(set[0].text, /MASS: 15\./); // first request on the board
  assert.equal(fixture({ runKind: 'survival' }).state.entityList.filter((e) => e.data?.tare).length, 0);
  assert.equal(fixture({ sector: 'sector_io_reach' }).state.entityList.filter((e) => e.data?.tare).length, 0);
});

test('the plate weighs settled bodies and speaks the true mass once', () => {
  const { state, popups, sys } = fixture();
  const rock = onDeck(50, 12.34);
  state.entityList.push(rock);
  sys.update(0.5, state);
  const reads = says(popups, 'tare_read_50');
  assert.equal(reads.length, 1);
  assert.equal(reads[0].text, 'MASS RECORDED: 12.34 — TRUE.');
  assert.equal(rock.data.weighedMass, 12.34);
  assert.equal(rock.data.weighedBy, state.entityList.find((e) => e.data?.tare).id);
  sys.update(0.5, state); // same body, same visit — the scale does not repeat itself
  assert.equal(says(popups, 'tare_read_50').length, 1);
});

test('a flyby is not a delivery: bodies above settle speed do not weigh', () => {
  const { state, popups, sys } = fixture();
  state.entityList.push(onDeck(51, 15, { vel: { x: 60, z: 0 } }));
  sys.update(0.5, state);
  assert.equal(says(popups, 'tare_read_51').length, 0);
  assert.equal(state.entityList.find((e) => e.id === 51).data.weighedMass, undefined);
});

test('a match pays a weighed fragment and steps the ladder', () => {
  const { state, popups, sys } = fixture();
  state.entityList.push(onDeck(52, 15)); // first target is 15
  sys.update(0.5, state);
  assert.equal(state.story.flags.tare_step, 1);
  assert.equal(state.story.flags.tare_paid, 1);
  const frag = state.entityList.find((e) => e.data?.tareFragment);
  assert.ok(frag, 'the payment materialized');
  // The trial contract: this is exactly what faction_verge._tickLineTrial consumes.
  assert.equal(frag.data.typeId, VERGE_LINE_TRIAL.fragmentTypeId);
  assert.equal(frag.data.weighedMass, TARE.fragmentMass);
  assert.ok(says(popups, 'tare_verdict_52')[0].text.includes('CORRECT'));
  assert.match(says(popups, 'tare_next_0')[0].text, /MASS: 45\./);
});

test('an off-target body reads INCORRECT and pays nothing', () => {
  const { state, popups, sys } = fixture();
  state.entityList.push(onDeck(53, 80)); // target 15 — far outside tolerance
  sys.update(0.5, state);
  assert.ok(says(popups, 'tare_verdict_53')[0].text.includes('INCORRECT'));
  assert.equal(state.story.flags.tare_step, undefined);
  assert.equal(state.entityList.filter((e) => e.data?.tareFragment).length, 0);
});

test('the ladder pays four fragments then keeps reading but stops paying', () => {
  const { state, popups, sys } = fixture();
  let id = 60;
  for (const target of TARE.targets) {
    state.entityList.push(onDeck(id++, target));
    sys.update(0.5, state);
  }
  assert.equal(state.story.flags.tare_step, TARE.targets.length);
  assert.equal(state.story.flags.tare_paid, TARE.targets.length);
  assert.equal(state.entityList.filter((e) => e.data?.tareFragment).length, 4);
  assert.ok(says(popups, 'tare_mastery').length === 1);
  // A fifth body still gets weighed and read — the scale is honest forever.
  state.entityList.push(onDeck(70, 33));
  sys.update(0.5, state);
  assert.equal(says(popups, 'tare_read_70').length, 1);
  assert.equal(state.entityList.filter((e) => e.data?.tareFragment).length, 4);
});

test('the robot and its fragments never go on the scale', () => {
  const { state, popups, sys } = fixture();
  const robot = state.entityList.find((e) => e.data?.tare);
  robot.vel = { x: 0, z: 0 };
  const frag = tareFragmentSpec(TARE.fragmentMass, TARE.post, robot.id, 100);
  frag.id = 80; frag.alive = true;
  state.entityList.push(frag);
  sys.update(0.5, state);
  assert.equal(says(popups, 'tare_read').filter((p) => p.id.includes(String(robot.id))).length, 0);
  assert.equal(says(popups, 'tare_read_80').length, 0);
});

test('a body that leaves the plate gets re-read on return', () => {
  const { state, popups, sys } = fixture();
  const rock = onDeck(90, 12);
  state.entityList.push(rock);
  sys.update(0.5, state);
  assert.equal(says(popups, 'tare_read_90').length, 1);
  rock.pos = { x: TARE.post.x + 5000, z: TARE.post.z }; // off the plate
  sys.update(0.5, state);
  rock.pos = { x: TARE.post.x + 10, z: TARE.post.z - 5 }; // set it back down
  sys.update(0.5, state);
  assert.equal(says(popups, 'tare_read_90').length, 2);
});

test('pure rules: weighable gate, ladder, match, lines, fragment spot', () => {
  assert.equal(tareWeighable(onDeck(1, 10)), true);
  assert.equal(tareWeighable(onDeck(1, 10, { pos: { x: 0, z: 0 } })), false); // off the plate
  assert.equal(tareWeighable(onDeck(1, 10, { vel: { x: 99, z: 0 } })), false); // flyby
  assert.equal(tareWeighable(onDeck(1, -4)), false); // no mass, no read
  assert.equal(tareTargetAt(0), 15);
  assert.equal(tareTargetAt(4), null);
  assert.equal(tareMatches(14.2, 15), true);  // inside 10%
  assert.equal(tareMatches(10, 15), false);   // outside 10%
  assert.equal(tareReadLine(41.2), 'MASS RECORDED: 41.20 — TRUE.');
  assert.equal(tareTargetLine(90), 'TARE SET. BRING ME MASS: 90.');
  assert.notDeepEqual(tareFragmentSpot(1), tareFragmentSpot(2));
  const d = Math.hypot(tareFragmentSpot(0).x - TARE.post.x, tareFragmentSpot(0).z - TARE.post.z);
  assert.ok(Math.abs(d - (TARE.deckRadius + TARE.fragmentSpawnOffset)) < 1e-6);
});

test('destroy + re-init: provider and owned hulls clean', () => {
  const { state, helpers, sys } = fixture();
  sys.update(0.5, state);
  const before = helpers.sectorCookProviders.length;
  sys.destroy();
  assert.equal(helpers.sectorCookProviders.length, before - 1);
  assert.equal(state.entityList.filter((e) => e.alive && (e.data?.tare || e.data?.tareFragment)).length, 0);
  sys.init({ state, bus: createBus(), helpers });
  assert.equal(state.entityList.filter((e) => e.alive && e.data?.tare).length, 1);
});
