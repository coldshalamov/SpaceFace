// Answering a mayday used to dismiss the card and leave the sky unchanged.
// Assist now puts the existing nav mark on the broadcasting hull and the hull
// answers. Scan reads the signal inside the old tell radius and, past it,
// names the range and puts the card back. Ignore still drops the call.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { actions } from '../src/systems/actions.js';
import { combat } from '../src/systems/combat.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { barkText } from '../src/data/encounters.js';

const SECTOR_ID = 'sector_tethys_junction';
const ANCHOR = Object.freeze({ x: 6200, z: 4800 });
const SEED = 4242;
const ASSIST_LINES = new Set([
  'Answer heard. Hold on. Come in on the bearing.',
  'Copy that hail. We are still here. The mark is live.',
  'Someone answered. Keep coming. We cannot move.',
]);

function boot(seed = SEED) {
  const sim = createSimulation({
    seed,
    systems: [combat, spawnBudget, encounterDirector, actions],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.story.beatIndex = 7;
  state.world.activeSector = { stations: [] };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: ANCHOR.x - 700, z: ANCHOR.z },
    vel: { x: 0, z: 0 }, radius: 8, hull: 600, hullMax: 600,
    data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  const voice = [];
  const offered = [];
  const waypoints = [];
  bus.on('encounter:voice', (p) => voice.push(p));
  bus.on('encounter:choiceOffered', (p) => offered.push(p));
  bus.on('nav:waypoint', (p) => waypoints.push(p));
  return {
    sim, state, bus, player, voice, offered, waypoints,
    director: sim.registry.get('encounterDirector'),
  };
}

function fire(h, suffix) {
  const encounterId = `inf-distress-assist${suffix}`;
  assert.deepEqual(h.director.requestAuthoredEncounter({
    shapeId: 'distress_call', encounterId, sectorId: SECTOR_ID,
    anchor: { ...ANCHOR }, zoneType: 'trade_lane', zoneRadius: 800, force: true,
  }), { ok: true, encounterId });
  const live = h.state.encounterDirector.live[encounterId];
  assert.ok(live, 'the distress call was admitted');
  assert.equal(live.phase, 'offer');
  return live;
}

function broadcaster(h, live) {
  const role = live.plan.variantKind === 'distress_genuine' ? 'victim' : 'bait';
  const hull = h.director.entsOf(live, role)[0];
  assert.ok(hull && hull.pos, 'a broadcasting hull is in the sky');
  return hull;
}

test('seed 4242: Assist marks the broadcasting hull and the hull answers, still waiting', () => {
  const h = boot();
  const live = fire(h, '-assist');
  const hull = broadcaster(h, live);
  h.state.nav = { waypoint: { kind: 'mission', encounterId: 'other-job', label: 'YARD', pos: { x: 1, z: 2 } } };

  h.bus.emit('encounter:choose', { encounterId: live.id, choiceId: 'assist' });

  assert.equal(live.phase, 'offer', 'answering does not start the fight');
  assert.equal(live.data.assisting, true);
  assert.equal(hull.alive !== false, true, 'the hull is still there');
  const mark = h.state.nav.waypoint;
  assert.equal(mark.kind, 'distress_assist');
  assert.equal(mark.encounterId, live.id);
  assert.equal(mark.label, 'MAYDAY');
  assert.equal(mark.pos.x, hull.pos.x);
  assert.equal(mark.pos.z, hull.pos.z);
  assert.match(mark.reason, /Fly the mark/);
  assert.equal(h.waypoints.at(-1), mark);
  const ack = h.voice.find((row) => row.encounterId === live.id && ASSIST_LINES.has(row.text));
  assert.ok(ack, 'the hull answers on the voice line');
  assert.equal(ack.channel, 'info');
  assert.equal(barkText('distress_assist_ack', null, live.id), ack.text);
  assert.deepEqual(live.data.previousWaypoint, { kind: 'mission', encounterId: 'other-job', label: 'YARD', pos: { x: 1, z: 2 } });

  h.player.pos.x = ANCHOR.x;
  h.player.pos.z = ANCHOR.z;
  h.sim.runTicks(130);
  assert.equal(live.phase, 'conflict', 'arriving still starts the fight');
  assert.equal(h.state.nav.waypoint && h.state.nav.waypoint.kind, 'mission', 'the earlier mark comes back once you are on scene');
  assert.equal(h.state.nav.waypoint.encounterId, 'other-job');
  h.sim.dispose();
});

test('seed 4242: Scan inside the tell radius reads the hull once and leaves the offer up in the sky', () => {
  const h = boot();
  const live = fire(h, '-scan');
  h.bus.emit('encounter:choose', { encounterId: live.id, choiceId: 'scan' });
  assert.equal(live.phase, 'offer');
  assert.equal(live.data.toldTell, true);
  assert.equal(live.offerConsumed, true);
  const tells = h.voice.filter((row) => row.encounterId === live.id && /Signal reads wrong|heartbeat aboard/.test(row.text));
  assert.equal(tells.length, 1);
  assert.equal(tells[0].channel, 'info');

  h.bus.emit('scan:pulse', {});
  h.sim.runTicks(2);
  const tellsAfter = h.voice.filter((row) => row.encounterId === live.id && /Signal reads wrong|heartbeat aboard/.test(row.text));
  assert.equal(tellsAfter.length, 1, 'a second pulse does not read it again');
  h.sim.dispose();
});

test('seed 4242: Scan past the tell radius names the range and puts the card back', () => {
  const h = boot();
  const live = fire(h, '-far');
  h.player.pos.x = ANCHOR.x + 2200;
  h.player.pos.z = ANCHOR.z;
  const offersBefore = h.offered.length;
  h.bus.emit('encounter:choose', { encounterId: live.id, choiceId: 'scan' });
  assert.equal(live.phase, 'offer');
  assert.notEqual(live.data.toldTell, true);
  assert.equal(live.offerConsumed, false, 'a far scan does not burn the card');
  const line = h.voice.find((row) => row.encounterId === live.id && /WU out/.test(row.text || ''));
  assert.ok(line, 'the refusal names the range');
  assert.match(line.text, /2200 WU out/);
  assert.ok(h.offered.length > offersBefore, 'the card is offered again');
  const card = h.offered.at(-1);
  assert.equal(card.encounterId, live.id);
  assert.deepEqual(card.options.map((option) => option.id), ['assist', 'scan', 'ignore']);

  h.bus.emit('encounter:choose', { encounterId: live.id, choiceId: 'assist' });
  assert.equal(live.data.assisting, true);
  assert.equal(h.state.nav.waypoint.kind, 'distress_assist');
  h.sim.dispose();
});
