import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createRegistry } from '../src/core/registry.js';
import { installSimCommandSink, uninstallSimCommandSink } from '../src/core/simLaneCommands.js';
import { drill } from '../src/systems/drill.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { input } from '../src/systems/input.js';
import { createPublishedDrillBoardGate } from '../src/ui/asteroid/asteroidScreen.js';
import { projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';

function fixture(generation = 8) {
  const state = createGameState(47), bus = createBus();
  const rock = { id: 545, type: 'asteroid', alive: true, pos: { x: 0, z: 0 },
    data: { fieldId: 'ordinary-rock', yieldU: 100 } };
  if (generation !== null) rock.occupantGeneration = generation;
  state.entities.set(rock.id, rock);
  const owner = Object.create(drill);
  owner.init({ state, bus, helpers: {}, registry: { get: () => null } });
  const commands = [];
  const main = { ...state, entities: new Map([[rock.id, structuredClone(rock)]]) };
  const facade = createRegistry({ simLane: 'worker', state: main, bus, helpers: {} }).get('drill');
  const dispatcher = Object.create(input);
  dispatcher._inputContext = { bus, registry: { get: name => name === 'drill' ? owner : null } };
  installSimCommandSink(command => commands.push(command));
  return { state, bus, rock, owner, facade, commands,
    drain() {
      const command = commands.shift();
      assert.equal(command?.kind, 'domEvent');
      dispatcher.ingestLaneDomEvent(command.d);
    },
    destroy() { uninstallSimCommandSink(); owner.destroy(); },
  };
}

test('ordered worker commands close an old session after reuse without writing progress or a charge to the replacement', () => {
  const f = fixture();
  try {
    assert.equal(f.facade.begin(545, { requestId: 'old', asteroidGeneration: 8 }), undefined);
    f.drain();
    const session = f.state.drill;
    session.avatar.row = 4;
    session.field[14][2] = { type: 'rock', hp: 1 };
    session.charge = { col: 14, row: 2, payload: 'blast', pattern: [{ col: 14, row: 2 }] };
    const replacement = { ...f.rock, occupantGeneration: 9, data: { marker: 'new rock' } };
    f.state.entities.set(545, replacement);
    f.facade.end({ requestId: 'old' });
    f.drain();
    assert.equal(f.state.drill, null);
    assert.equal(session.active, false);
    assert.equal(session.charge, null, 'the paid charge still settles');
    assert.equal(session.field[14][2].type, 'empty');
    assert.deepEqual(replacement.data, { marker: 'new rock' });
  } finally { f.destroy(); }
});

test('late end for an earlier request cannot end a newer session on the same rock', () => {
  const f = fixture();
  try {
    f.facade.begin(545, { requestId: 'old', asteroidGeneration: 8 }); f.drain();
    const older = f.state.drill;
    older.field[14][2] = { type: 'empty' };
    older.avatar.row = 2;
    f.facade.begin(545, { requestId: 'new', asteroidGeneration: 8 }); f.drain();
    const newer = f.state.drill;
    assert.equal(older.active, false, 'the prior session settles before replacement');
    assert.equal(newer.field[14][2].type, 'empty', 'the new visit reads the saved tunnel');
    f.facade.end({ requestId: 'old' }); f.drain();
    assert.equal(f.state.drill, newer);
    assert.equal(newer.active, true);
    f.facade.end({ requestId: 'new' }); f.drain();
    assert.equal(f.state.drill, null);
  } finally { f.destroy(); }
});

test('a pending screen can enqueue exit before the producer publishes its session', () => {
  const f = fixture();
  try {
    f.facade.begin(545, { requestId: 'pending', asteroidGeneration: 8 });
    f.facade.end({ requestId: 'pending' });
    f.drain();
    assert.ok(f.state.drill?.active);
    f.drain();
    assert.equal(f.state.drill, null);
  } finally { f.destroy(); }
});

test('the producer start event opens only its matching screen gate through the bridge projection', () => {
  const f = fixture();
  try {
    const gate = createPublishedDrillBoardGate({ readDrill: () => f.state.drill,
      readEntity: () => f.rock, isOpen: () => true, begin() {} });
    gate.request(545, 'visit');
    f.bus.on('drill:start', event => {
      const projection = projectBridgeEvent('drill:start', event);
      assert.equal(projection.dropped, false);
      gate.accept(projection.flat.requestId);
    });
    f.facade.begin(545, { requestId: 'visit', asteroidGeneration: 8 });
    assert.equal(gate.poll(), false);
    f.drain();
    assert.equal(gate.poll(), true);
  } finally { f.destroy(); }
});

test('normal and dead original targets retain progress, including generation-less legacy targets', () => {
  for (const [generation, dead] of [[8, false], [8, true], [null, true]]) {
    const f = fixture(generation);
    try {
      f.facade.begin(545, { requestId: 'visit', asteroidGeneration: generation }); f.drain();
      const d = f.state.drill;
      d.avatar.col = 14; d.avatar.row = 2;
      d.field[14][2] = { type: 'empty' };
      if (dead) f.rock.alive = false;
      f.facade.end({ requestId: 'visit' }); f.drain();
      assert.equal(f.state.drill, null);
      assert.equal(f.rock.data.drillAvatarRow, 2);
      assert.ok(f.rock.data.drillCleared.includes(2 * 28 + 14));
    } finally { f.destroy(); }
  }
});

test('in-place occupant recycle cannot receive the old session progress', () => {
  const f = fixture();
  try {
    f.facade.begin(545, { requestId: 'old', asteroidGeneration: 8 }); f.drain();
    f.state.drill.avatar.row = 3;
    f.rock.occupantGeneration = 9;
    f.rock.data = { marker: 'recycled slot' };
    f.facade.end({ requestId: 'old' }); f.drain();
    assert.equal(f.state.drill, null);
    assert.deepEqual(f.rock.data, { marker: 'recycled slot' });
  } finally { f.destroy(); }
});

test('an old charge cannot carve a replacement asteroid site', () => {
  const f = fixture();
  try {
    const sites = Object.create(asteroidSites);
    sites.init({ state: f.state, bus: f.bus, helpers: {}, registry: { get: () => null } });
    f.facade.begin(545, { requestId: 'old', asteroidGeneration: 8 }); f.drain();
    const session = f.state.drill;
    session.field[14][2] = { type: 'rock', hp: 1 };
    session.charge = { col: 14, row: 2, payload: 'blast', pattern: [{ col: 14, row: 2 }] };
    const site = { id: 'replacement-site', asteroidId: 545, cleared: [5], machines: [] };
    f.state.sites.byId[site.id] = site;
    f.state.entities.set(545, { ...f.rock, occupantGeneration: 9,
      data: { siteId: site.id, marker: 'replacement', drillCleared: [111] } });
    f.facade.end({ requestId: 'old' }); f.drain();
    assert.equal(f.state.drill, null);
    assert.deepEqual(site.cleared, [5], 'neither blast nor end may rewrite the replacement site');
  } finally { f.destroy(); }
});

test('a valid claimed rock retains charge yield, depletion, cargo and durable excavation', () => {
  for (const generation of [8, null]) {
    const f = fixture(generation);
    try {
      f.state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100 };
      const sites = Object.create(asteroidSites);
      sites.init({ state: f.state, bus: f.bus, helpers: {}, registry: { get: () => null } });
      f.facade.begin(545, { requestId: 'visit', asteroidGeneration: generation }); f.drain();
      const site = { id: 'active-site', asteroidId: 545, cleared: [], machines: [] };
      f.state.sites.byId[site.id] = site;
      // A site may be staked after drilling starts; its actual entity binding remains canonical.
      f.rock.data.siteId = site.id;
      const d = f.state.drill;
      d.rockBudget = 5; d.rockBudgetMax = 50;
      d.field[14][2] = { type: 'vein', ore: 'cmdty_ore_iron', yieldU: 10, tierReq: 1 };
      d.charge = { col: 14, row: 2, payload: 'blast', pattern: [{ col: 14, row: 2 }] };
      let receipt;
      f.bus.on('drill:end', result => { receipt = result; });
      f.facade.end({ requestId: 'visit' }); f.drain();
      assert.equal(f.state.drill, null);
      assert.equal(receipt.yieldUnits, 3);
      assert.equal(receipt.rockBudgetRemaining, 0);
      assert.equal(f.state.player.cargo.items.cmdty_ore_iron, 3);
      assert.equal(f.rock.data.drillDepletion, 0.1);
      assert.equal(site.drillDepletion, 0.1);
      assert.ok(f.rock.data.drillScars.includes(70));
      assert.ok(site.cleared.includes(70));
    } finally { f.destroy(); }
  }
});

test('a replacement without a generation cannot borrow a legacy session target', () => {
  const f = fixture(null);
  try {
    f.facade.begin(545, { requestId: 'legacy', asteroidGeneration: null }); f.drain();
    f.state.drill.avatar.row = 3;
    const replacement = { ...f.rock, data: { marker: 'legacy replacement' } };
    f.state.entities.set(545, replacement);
    f.facade.end({ requestId: 'legacy' }); f.drain();
    assert.equal(f.state.drill, null);
    assert.deepEqual(replacement.data, { marker: 'legacy replacement' });
  } finally { f.destroy(); }
});

test('explicit producer rejection crosses the event seam and is correlated to its screen request', () => {
  const f = fixture();
  try {
    let notice = null;
    f.bus.on('drill:beginRejected', event => { notice = event; });
    f.facade.begin(545, { requestId: 'old', asteroidGeneration: 8 });
    f.rock.occupantGeneration = 9;
    f.drain();
    assert.deepEqual(notice, { requestId: 'old', asteroidId: 545 });
    const projection = projectBridgeEvent('drill:beginRejected', notice);
    assert.equal(projection.dropped, false);
    assert.deepEqual(projection.flat, notice);
    assert.equal(f.state.drill, null);
    const gate = createPublishedDrillBoardGate({ readDrill: () => null,
      readEntity: () => f.rock, isOpen: () => true, begin() {} });
    gate.request(545, 'new');
    gate.accept('old');
    assert.equal(gate.poll(), false, 'a prior start cannot open the new request');
    gate.reject(notice.requestId);
    assert.equal(gate.status(), 'pending', 'late rejection cannot cancel a newer request');
    gate.reject('new');
    assert.equal(gate.status(), 'rejected');
    assert.equal(gate.poll(), false);
  } finally { f.destroy(); }
});
