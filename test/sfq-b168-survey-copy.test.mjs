import test from 'node:test';
import assert from 'node:assert/strict';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { HEAT_TRIAL_NOTE, noteHeatTrial } from '../src/data/heatProximityTrial.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import {
  COPY_PAY,
  COPY_POS,
  COPY_REACH,
  COPY_SECTOR_ID,
  COPY_SOLD,
  COPY_STALE,
  COPY_STATION_ID,
  copySurveySale,
  surveyCopyOffer,
} from '../src/data/surveyCopy.js';
import {
  deserializeAlienEcologyState,
  handleAlienEcologyEvent,
  serializeAlienEcologyState,
  tickAlienEcology,
} from '../src/systems/alienEcology.js';
import { commsToastSpec } from '../src/ui/floatingText.js';

const dock = ALIEN_SITES.breathing_dock;
const deep = ALIEN_SITES.harvest_deep;

function worldAt(x, z, sectorId) {
  const state = {
    meta: { seed: 7 },
    simTime: 10,
    tick: 1,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: {
      credits: 100,
      cargo: { items: { cmdty_filament_sample: 1 }, usedVolume: 1, usedMass: 1 },
    },
    story: { flags: { ending_choice: 'stay' } },
    factions: { faction_free: { rep: 0 } },
    missions: { boards: {}, active: [] },
    world: {
      currentSectorId: sectorId,
      sectors: {
        [sectorId]: { id: sectorId, factionId: 'faction_free', stations: [] },
      },
      rng: () => 0.2,
    },
    rng: () => 0.2,
  };
  const events = [];
  const player = {
    id: 1, type: 'player', alive: true, pos: { x, z }, vel: { x: 0, z: 0 },
    data: { fittings: [] },
  };
  state.entities.set(1, player);
  state.entityList.push(player);
  const world = {
    state,
    _toGlobal: (local) => ({ x: local.x, z: local.z }),
    _toLocal: (pos) => ({ x: pos.x, z: pos.z }),
    active: { dressing: [], pois: [] },
    bus: { emit: (type, payload) => { events.push({ type, payload }); } },
    helpers: { spawnEntity() { return null; }, removeEntity() {} },
  };
  return { state, world, events, player };
}

function move(pack, x, z) {
  pack.player.pos.x = x;
  pack.player.pos.z = z;
}

function fileNote(state) {
  let book = noteHeatTrial(null, { heat: false, drive: 'shadow', geometryKey: 0 });
  book = noteHeatTrial(book, { heat: true, drive: 'charge', geometryKey: 0 });
  ensureAlienEcologyState(state).heatTrial = book;
  assert.equal(book.note, HEAT_TRIAL_NOTE);
}

function scan(pack, sectorId) {
  handleAlienEcologyEvent(pack.world, 'scan:completed', {
    sectorId: sectorId || pack.state.world.currentSectorId,
  });
}

function grants(events) {
  return events.filter((e) => e.type === 'economy:grantCredits');
}

function copyLogs(events) {
  return events.filter((e) => e.type === 'comms:log' && e.payload && (
    e.payload.text === COPY_SOLD || e.payload.text === COPY_STALE
  ));
}

function saleOf(state) {
  return ensureAlienEcologyState(state).surveyCopy || null;
}

function reloadAt(pack, x, z) {
  const saved = serializeAlienEcologyState(pack.state);
  const next = worldAt(x, z, pack.state.world.currentSectorId);
  next.state.player.cargo = JSON.parse(JSON.stringify(pack.state.player.cargo));
  next.state.player.credits = pack.state.player.credits;
  next.state.story = JSON.parse(JSON.stringify(pack.state.story));
  deserializeAlienEcologyState(next.state, saved);
  return next;
}

test('one heat note sells once and the page stays', () => {
  const anchor = SECTOR_ANCHORS[COPY_SECTOR_ID].stations.find((row) => row.id === COPY_STATION_ID);
  assert.deepEqual(anchor.pos, COPY_POS);
  assert.equal(COPY_REACH < 500, true);
  assert.deepEqual(surveyCopyOffer(null, null), { pay: 0, text: null, key: null });
  assert.deepEqual(surveyCopyOffer('nope', null), { pay: 0, text: null, key: null });
  assert.deepEqual(surveyCopyOffer(HEAT_TRIAL_NOTE, null), { pay: COPY_PAY, text: COPY_SOLD, key: HEAT_TRIAL_NOTE });
  assert.deepEqual(
    surveyCopyOffer(HEAT_TRIAL_NOTE, HEAT_TRIAL_NOTE),
    { pay: 0, text: COPY_STALE, key: HEAT_TRIAL_NOTE },
  );
  assert.equal(copySurveySale(null), null);
  assert.equal(copySurveySale({ note: 'nope', edge: true }), null);
  assert.deepEqual(copySurveySale({ note: HEAT_TRIAL_NOTE, edge: true, extra: 1 }), {
    note: HEAT_TRIAL_NOTE, edge: true,
  });
  for (const line of [COPY_SOLD, COPY_STALE]) {
    const notice = commsToastSpec({ from: 'Ash Cache', kind: 'ecology', text: line }).text;
    assert.equal(notice.includes('...'), false, notice);
  }
  const sold = commsToastSpec({ from: 'Ash Cache', kind: 'ecology', text: COPY_SOLD }).text;
  const stale = commsToastSpec({ from: 'Ash Cache', kind: 'ecology', text: COPY_STALE }).text;
  assert.equal(sold.includes('You still have it'), true);
  assert.equal(stale.includes('pays nothing'), true);
});

test('selling the copy leaves the note and refuses a stale page', () => {
  const inside = { x: COPY_POS.x, z: COPY_POS.z };
  const outside = { x: COPY_POS.x + COPY_REACH * 2, z: COPY_POS.z };
  const onRadius = { x: COPY_POS.x + COPY_REACH, z: COPY_POS.z };

  const bare = worldAt(inside.x, inside.z, COPY_SECTOR_ID);
  tickAlienEcology(bare.world, 40);
  scan(bare);
  assert.equal(grants(bare.events).length, 0);
  assert.equal(copyLogs(bare.events).length, 0);
  assert.equal(bare.state.player.credits, 100);
  assert.equal(saleOf(bare.state), null);

  const far = worldAt(outside.x, outside.z, COPY_SECTOR_ID);
  fileNote(far.state);
  tickAlienEcology(far.world, 30);
  scan(far);
  move(far, onRadius.x, onRadius.z);
  scan(far);
  assert.equal(grants(far.events).length, 0);
  assert.equal(copyLogs(far.events).length, 0);
  assert.equal(ensureAlienEcologyState(far.state).heatTrial.note, HEAT_TRIAL_NOTE);

  const desk = worldAt(inside.x, inside.z, COPY_SECTOR_ID);
  fileNote(desk.state);
  tickAlienEcology(desk.world, 40);
  assert.equal(grants(desk.events).length, 0);
  scan(desk);
  assert.deepEqual(grants(desk.events).map((e) => e.payload), [
    { amount: COPY_PAY, reason: 'survey-copy:heat-note' },
  ]);
  assert.deepEqual(copyLogs(desk.events).map((e) => e.payload.text), [COPY_SOLD]);
  assert.equal(ensureAlienEcologyState(desk.state).heatTrial.note, HEAT_TRIAL_NOTE);
  assert.equal(saleOf(desk.state).note, HEAT_TRIAL_NOTE);
  assert.equal(saleOf(desk.state).edge, true);
  assert.equal(desk.state.player.credits, 100);
  assert.equal(desk.state.player.cargo.items.cmdty_filament_sample, 1);
  assert.equal(desk.state.story.flags.ending_choice, 'stay');
  scan(desk);
  tickAlienEcology(desk.world, 40);
  assert.equal(grants(desk.events).length, 1);
  assert.equal(copyLogs(desk.events).length, 1);

  const held = reloadAt(desk, inside.x, inside.z);
  tickAlienEcology(held.world, 0.5);
  scan(held);
  assert.equal(grants(held.events).length, 0);
  assert.equal(copyLogs(held.events).length, 0);
  assert.equal(ensureAlienEcologyState(held.state).heatTrial.note, HEAT_TRIAL_NOTE);
  assert.equal(saleOf(held.state).note, HEAT_TRIAL_NOTE);
  assert.equal(held.state.story.flags.ending_choice, 'stay');

  move(desk, onRadius.x, onRadius.z);
  tickAlienEcology(desk.world, 0.5);
  assert.equal(saleOf(desk.state).edge, false);
  scan(desk);
  assert.equal(grants(desk.events).length, 1);
  move(desk, inside.x, inside.z);
  scan(desk);
  assert.equal(grants(desk.events).length, 1);
  assert.deepEqual(
    copyLogs(desk.events).filter((e) => e.payload.text === COPY_STALE).map((e) => e.payload.text),
    [COPY_STALE],
  );
  scan(desk);
  assert.equal(copyLogs(desk.events).filter((e) => e.payload.text === COPY_STALE).length, 1);
  assert.equal(ensureAlienEcologyState(desk.state).heatTrial.note, HEAT_TRIAL_NOTE);

  const stripped = serializeAlienEcologyState(desk.state);
  delete stripped.surveyCopy;
  deserializeAlienEcologyState(desk.state, stripped);
  assert.equal(saleOf(desk.state), null);
  assert.equal(ensureAlienEcologyState(desk.state).heatTrial.note, HEAT_TRIAL_NOTE);
  assert.equal(desk.state.story.flags.ending_choice, 'stay');

  const elsewhere = worldAt(dock.center.x, dock.center.z, dock.sectorId);
  fileNote(elsewhere.state);
  scan(elsewhere, dock.sectorId);
  assert.equal(grants(elsewhere.events).length, 0);
  assert.equal(saleOf(elsewhere.state), null);

  const harvest = worldAt(deep.center.x, deep.center.z, deep.sectorId);
  fileNote(harvest.state);
  scan(harvest, deep.sectorId);
  assert.equal(grants(harvest.events).length, 0);
  assert.equal(saleOf(harvest.state), null);
});
