import test from 'node:test';
import assert from 'node:assert/strict';
import { createSlateColumn, slateColumnSpec } from '../src/systems/slateColumn.js';
import { SLATE_COLUMN } from '../src/data/slate.js';
import { slateWeldSpike, slateColumnInRange, slateColumnLine } from '../src/characters/slateRules.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER, getDeclaredSystemClock } from '../src/runtime/authoritativeSystemManifest.js';

const POS = SLATE_COLUMN.pos;
const AWAY = { x: POS.x + 2000, z: POS.z };

function fixture({ sector = SLATE_COLUMN.sectorId, kind = 'adventure' } = {}) {
  const bus = createBus(), events = [];
  const state = {
    simTime: 0, tick: 0, mode: 'flight', run: { kind },
    world: { currentSectorId: sector }, entities: new Map(), entityList: [],
    story: { flags: {} }, playerId: 7, ui: { docked: false },
  };
  let id = 10;
  const helpers = {
    spawnEntity(spec) { const e = makeEntity({ ...spec, id: ++id }); state.entities.set(e.id, e); state.entityList.push(e); return e; },
    removeEntity(rid) { const e = state.entities.get(rid); if (e) e.alive = false; },
  };
  const player = helpers.spawnEntity({ type: 'ship', pos: { ...AWAY }, vel: { x: 0, z: 0 }, radius: 4, mass: 20, hull: 50, hullMax: 50, isPlayer: true });
  state.playerId = player.id;
  for (const t of ['comms:popup', 'slate:spike', 'slate:columnRead']) bus.on(t, (p) => events.push([t, p]));
  const system = createSlateColumn();
  system.init({ state, bus, helpers });
  const beacon = () => state.entityList.filter((e) => e.alive && e.data?.slateColumn === true);
  const weld = (restoredHull = 20, type = 'repair') => bus.emit('service:completed', { type, restoredHull, stationId: 'station_vesta_outlying_yard', atT: state.simTime });
  const spikes = () => events.filter(([t]) => t === 'slate:spike');
  return { bus, state, helpers, system, events, beacon, player, weld, spikes };
}

test('registered in both orders on the calendar clock — the proximity read is a census', () => {
  assert.equal(PRODUCTION_INIT_ORDER.filter((x) => x === 'slateColumn').length, 1);
  assert.equal(PRODUCTION_UPDATE_ORDER.filter((x) => x === 'slateColumn').length, 1);
  assert.equal(getDeclaredSystemClock('slateColumn'), 'calendar');
});

test('the pillar waits at Vesta adventure and announces itself once ever', () => {
  const f = fixture();
  assert.equal(f.beacon().length, 1);
  const announces = f.events.filter(([t, p]) => t === 'comms:popup' && p.id === 'slate_column_announce');
  assert.equal(announces.length, 1);
  f.system._sync(); f.system._sync();
  assert.equal(f.beacon().length, 1, 're-entry cannot stack a second pillar');
  assert.equal(announces.length, 1, 'the pillar explains itself once ever');
});

test('no pillar in survival, lab, or another sector; leaving Vesta clears it', () => {
  for (const kind of ['survival', 'lab']) {
    const f = fixture({ kind });
    assert.equal(f.beacon().length, 0, kind);
  }
  const f = fixture();
  f.state.world.currentSectorId = 'sector_helios';
  f.bus.emit('sector:enter', {});
  assert.equal(f.beacon().length, 0, 'the column is Vesta property');
});

test('every real weld rings the column — spike counted, refuel ignored', () => {
  const f = fixture();
  f.weld(20);
  f.weld(3);             // a patch under the threshold does not ring
  f.weld(20, 'refuel');  // fuel is not a weld
  assert.equal(f.spikes().length, 1);
  assert.equal(f.state.story.flags[SLATE_COLUMN.spikeFlag], 1);
});

test('welds in other sectors still ring silently — only the prediction speaks away', () => {
  const f = fixture({ sector: 'sector_helios' });
  f.weld(20);
  assert.equal(f.state.story.flags[SLATE_COLUMN.spikeFlag], 1, 'the seam keeps the count wherever the berth stood');
  assert.equal(f.spikes().length, 0, 'no line fires off the yard’s ground');
});

test('the fourth spike files the player\'s entry — the receipt Slate promised', () => {
  const f = fixture({ sector: 'sector_helios' }); // away from the pillar: only the prediction reaches you
  for (let i = 0; i < 3; i++) f.weld(20);
  assert.equal(f.state.story.flags[SLATE_COLUMN.entryFlag], undefined);
  f.weld(20);
  const s = f.spikes();
  assert.equal(s.length, 1, 'only the fourth spike speaks off-sector');
  assert.equal(s[0][1].fourth, true);
  assert.equal(s[0][1].entry, true);
  assert.equal(f.state.story.flags[SLATE_COLUMN.entryFlag], true);
  const popups = f.events.filter(([t, p]) => t === 'comms:popup' && p.persist === true);
  assert.equal(popups.length, 1, 'the fourth-spike receipt persists in the log');
  f.weld(20); // spikes past four count but never re-file the entry
  assert.equal(f.state.story.flags[SLATE_COLUMN.spikeFlag], 5);
  assert.equal(f.spikes().length, 1);
});

test('a hull standing in the ring reads its number once per visit', () => {
  const f = fixture();
  f.weld(20); f.weld(20);
  f.player.pos.x = POS.x; f.player.pos.z = POS.z;
  f.system.update(0.5, f.state);
  const reads = f.events.filter(([t]) => t === 'slate:columnRead');
  assert.equal(reads.length, 1);
  assert.equal(reads[0][1].spikes, 2);
  assert.equal(reads[0][1].predictsFailureAt, 4);
  f.system.update(0.5, f.state);
  assert.equal(reads.length + f.events.filter(([t]) => t === 'slate:columnRead').length - 1, 1, 'parked inside does not re-read');
  f.player.pos.x = AWAY.x; f.player.pos.z = AWAY.z;
  f.system.update(0.5, f.state); // stepping out re-arms
  f.player.pos.x = POS.x; f.player.pos.z = POS.z;
  f.system.update(0.5, f.state);
  assert.equal(f.events.filter(([t]) => t === 'slate:columnRead').length, 2, 'returning reads again');
});

test('the column\'s lines are honest: predicting under four, reciting at and past', () => {
  assert.equal(slateWeldSpike({ type: 'repair', restoredHull: 20 }), true);
  assert.equal(slateWeldSpike({ type: 'repair', restoredHull: 3 }), false, 'a patch does not ring');
  assert.equal(slateWeldSpike({ type: 'refuel' }), false);
  assert.equal(slateWeldSpike(null), false);
  assert.equal(slateColumnInRange(POS), true);
  assert.equal(slateColumnInRange(AWAY), false);
  assert.ok(slateColumnLine(0).includes('0 weld-spikes'), 'zero takes the plural');
  assert.ok(slateColumnLine(1).includes('1 weld-spike on'));
  assert.ok(slateColumnLine(2).includes('2 weld-spikes'));
  // Welds alone never open the hull: the seam-went line needs the story's real failure.
  assert.ok(!slateColumnLine(4).includes('went at four'), 'four welds file the entry, not a blown seam');
  assert.ok(slateColumnLine(4).includes('entry is filed'));
  assert.ok(slateColumnLine(7).includes('7 weld-spikes'));
  assert.ok(slateColumnLine(4, { seamWent: true }).includes('went at four'), 'a real seam failure recites');
  assert.ok(slateColumnLine(0, { seamWent: true }).includes('went at four'));
});

test('destroy clears listeners, providers, and the beacon; re-init is clean', () => {
  const f = fixture();
  assert.equal(f.beacon().length, 1);
  f.system.destroy();
  assert.equal(f.beacon().length, 0);
  f.system.init({ state: f.state, bus: f.bus, helpers: f.helpers });
  f.system.init({ state: f.state, bus: f.bus, helpers: f.helpers });
  assert.equal(f.beacon().length, 1, 'repeated init still leaves exactly one pillar');
  f.weld(20);
  assert.equal(f.state.story.flags[SLATE_COLUMN.spikeFlag], 1, 're-init does not double-count the weld listener');
});

test('the count survives a save-shaped flag round-trip and reads through newGame', () => {
  const f = fixture();
  f.weld(20); f.weld(20); f.weld(20);
  assert.equal(f.state.story.flags[SLATE_COLUMN.spikeFlag], 3);
  const saved = JSON.parse(JSON.stringify(f.state.story.flags));
  const g = fixture();
  g.state.story.flags = saved; // a restored save keeps the hull's number
  g.bus.emit('save:loaded', {});
  g.weld(20);
  assert.equal(g.state.story.flags[SLATE_COLUMN.spikeFlag], 4);
  assert.equal(g.state.story.flags[SLATE_COLUMN.entryFlag], true, 'the fourth weld after restore still files the entry');
});
