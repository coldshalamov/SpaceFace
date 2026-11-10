import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { drill, drillReadView, avatarDrawPos, DRILL_CONST } from '../src/systems/drill.js';
import { createPublishedDrillBoardGate } from '../src/ui/asteroid/asteroidScreen.js';
import { readWorksDrillSession, classifyWorksBuildSeats } from '../src/ui/asteroid/asteroidRenderer3d.js';
import { createDomainDiffer, applyDomainPathUpdate, configureDomainMirroring } from '../scripts/lib/simReadModel.mjs';

function fixture() {
  const state = createGameState(47), bus = createBus();
  const asteroid = { id: 545, type: 'asteroid', alive: true, occupantGeneration: 8,
    pos: { x: 0, z: 0 }, radius: 30, data: { fieldId: 'ordinary-rock', yieldU: 100 } };
  state.entities.set(asteroid.id, asteroid);
  const producer = Object.create(drill);
  producer.init({ state, bus, helpers: {}, registry: { get: () => null } });
  const differ = createDomainDiffer(), domains = new Map();
  const main = { ...state, entities: new Map([[asteroid.id, structuredClone(asteroid)]]), drill: null };
  return { state, main, producer, asteroid,
    publish() {
      const updates = differ.diff(state, state.tick).updates;
      for (const update of updates) applyDomainPathUpdate(domains, structuredClone(update), new Set());
      main.drill = domains.get('drill');
      return updates.filter(update => update.segs[0] === 'drill');
    },
    destroy() { producer.destroy(); },
  };
}

test('published drill begins the board once after the actual producer field/avatar arrive', () => {
  const f = fixture();let starts = 0, open = true;
  const gate = createPublishedDrillBoardGate({ readDrill: () => f.main.drill,
    readEntity: id => f.main.entities.get(id), isOpen: () => open,
    begin(session) { assert.equal(readWorksDrillSession(session), session);starts++; } });
  try {
    f.publish();gate.request(f.asteroid.id);
    assert.equal(gate.poll(), false);assert.equal(starts, 0);
    assert.equal(f.producer.begin(f.asteroid.id), true);
    assert.equal(gate.poll(), false, 'an accepted intent is not its later publication');
    const updates = f.publish();
    assert.equal(updates.length, 1);assert.deepEqual(updates[0].segs, ['drill']);
    assert.equal(gate.poll(), true);assert.equal(gate.poll(), true);assert.equal(starts, 1);
    assert.equal(gate.ready(), true);
    const view = readWorksDrillSession(f.main.drill);
    assert.deepEqual(avatarDrawPos(view.avatar, DRILL_CONST.TILE), avatarDrawPos(f.state.drill.avatar, DRILL_CONST.TILE));
    const seats = classifyWorksBuildSeats({ field: view.field, avatar: view.avatar, defId: 'fixture', canInstall: () => ({ ok: true }) });
    assert.ok(seats.blocked.some(cell => cell.reason === 'rover-here' && cell.c === view.avatar.col && cell.r === view.avatar.row));
    open = false;assert.equal(gate.ready(), false);gate.invalidate();
    open = true;assert.equal(gate.poll(), false);assert.equal(starts, 1);
  } finally { f.destroy(); }
});

test('drill publication feeds renderer and tool readers with current movement, charge, energy and field facts', () => {
  const f = fixture();
  try {
    f.producer.begin(f.asteroid.id);f.publish();
    const original = f.main.drill;
    for (let i = 0; i < 90; i++) f.producer.tickInput({ down: true }, 1 / 60);
    assert.equal(f.producer.armCharge(), true);
    const expectedPreview = f.producer.chargePreview();
    f.state.tick++;f.publish();
    assert.equal(f.main.drill, original, 'normal domain application preserves the board root');
    const view = readWorksDrillSession(f.main.drill);
    assert.ok(view.avatar.row > 0 || view.avatar.isDrilling);
    assert.deepEqual(avatarDrawPos(view.avatar, DRILL_CONST.TILE), avatarDrawPos(f.state.drill.avatar, DRILL_CONST.TILE));
    assert.deepEqual(view.field, JSON.parse(JSON.stringify(f.state.drill.field)), 'wire omission of undefined flags preserves every displayed cell value');
    assert.equal(view.drillEnergy, f.state.drill.drillEnergy);
    assert.equal(view.drillTemp, f.state.drill.drillTemp);
    assert.equal(view.chargeArmed, true);
    assert.deepEqual(drillReadView(f.main).chargePreview(), expectedPreview);
    view.avatar.col = 0;assert.notEqual(f.state.drill.avatar.col, 0, 'transport never exposes the authoritative avatar');
    f.producer.end();f.state.tick++;f.publish();
    assert.equal(f.main.drill, null);assert.equal(readWorksDrillSession(f.main.drill), null);
  } finally { f.destroy(); }
});

test('pending board rejects wrong asteroid, stale lives, replacement and exit-before-publication', () => {
  const f = fixture();let current = null, starts = 0, open = true;
  const gate = createPublishedDrillBoardGate({ readDrill: () => current,
    readEntity: id => f.main.entities.get(id), isOpen: () => open, begin() { starts++; } });
  try {
    f.producer.begin(f.asteroid.id);f.publish();
    gate.request(f.asteroid.id);
    current = { ...f.main.drill, asteroidId: 999 };assert.equal(gate.poll(), false);
    current = { ...f.main.drill, asteroidGeneration: 7 };assert.equal(gate.poll(), false);
    current = { ...f.main.drill };delete current.asteroidGeneration;
    assert.equal(gate.poll(), false, 'legacy data cannot borrow a modern entity generation');
    current = f.main.drill;
    const original = f.main.entities.get(f.asteroid.id);
    f.main.entities.set(f.asteroid.id, { ...original });assert.equal(gate.poll(), false);
    f.main.entities.set(f.asteroid.id, original);original.occupantGeneration++;
    assert.equal(gate.poll(), false);original.occupantGeneration--;
    gate.invalidate();assert.equal(gate.poll(), false);assert.equal(starts, 0);
    gate.request(f.asteroid.id);open = false;assert.equal(gate.poll(), false);assert.equal(starts, 0);
    // Explicit legacy fixture: both the real entity and its owner-produced session lack a generation.
    delete original.occupantGeneration;delete current.asteroidGeneration;
    open = true;gate.request(f.asteroid.id);assert.equal(gate.poll(), true);assert.equal(starts, 1);
  } finally { f.destroy(); }
});

test('drill view is bounded and excludes private references even under expanded diagnostic mirroring', () => {
  const f = fixture();
  try {
    configureDomainMirroring({ expandPaths: [{ segs: [], depth: 8 }] });
    f.producer.begin(f.asteroid.id);
    const d = f.state.drill;
    d.privateOwner = f.state;d.avatar.privateEntity = f.asteroid;
    d.field[0][0].privateOwner = f.state;d.field[0][0].privateCallback = () => {};
    d.cableTrail = Array.from({ length: 2000 }, (_, col) => ({ col, row: 0, entity: f.asteroid }));
    d.field.push(...Array.from({ length: 100 }, () => []));
    f.publish();
    assert.equal(f.main.drill.field.length, DRILL_CONST.COLS);
    assert.equal(f.main.drill.field[0].length, DRILL_CONST.ROWS);
    assert.equal(f.main.drill.cableTrail.length, DRILL_CONST.COLS * DRILL_CONST.ROWS);
    assert.equal(f.main.drill.privateOwner, undefined);
    assert.equal(f.main.drill.avatar.privateEntity, undefined);
    assert.equal(f.main.drill.field[0][0].privateOwner, undefined);
    assert.equal(f.main.drill.cableTrail[0].entity, undefined);
    assert.doesNotThrow(() => structuredClone(f.main.drill));
  } finally { configureDomainMirroring();f.destroy(); }
});
