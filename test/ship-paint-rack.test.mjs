// INFERENCE unit — the Shipworks paint rack. The ship appearance backend (ships.setShipAppearance,
// the save receipts, the renderer palette seam) shipped without any live surface; this rack is the
// surface. Proves, on the real owners:
//   1. the authored paint catalog is coherent swatch stock (valid hex or bare-null, unique ids,
//      finishes/wear inside the appearance model's own enums);
//   2. one swatch patches exactly one field of the current appearance;
//   3. emitting the rack's intent (ui:setShipAppearance) through a REAL registered ships system
//      paints the owned record, updates the live active entity, and fires the receipt events;
//   4. a painted non-active hull keeps its coat through Make active;
//   5. the entity record the preview mount builds (data.appearance) repaints through the same
//      paletteWithShipAppearance seam the flight renderer reads;
//   6. the Paint verb's gate is the same hull-service availability every other berth verb uses.
// No wall clock, no DOM, no golden edits.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  normalizeShipAppearance,
  shipAppearanceSignature,
  paletteWithShipAppearance,
  SHIP_FINISHES,
  SHIP_DECALS,
} from '../src/core/shipAppearance.js';
import {
  SHIP_HULL_PAINTS,
  SHIP_ACCENT_PAINTS,
  SHIP_FINISH_STOCK,
  SHIP_WEAR_STOCK,
  buildPaintAppearance,
  shipPaintRow,
} from '../src/data/shipPaints.js';
import { ships as shipsPrototype } from '../src/systems/ships.js';
import { shipworksActionAvailability } from '../src/ui/station/screens/shipworks.js';

const HEX_RE = /^#[0-9a-f]{6}$/;

function buildHarness({ docked = true, stationId = 'station_helios', shipIndex = 0 } = {}) {
  const state = createGameState(0x5a17);
  state.player.credits = 250_000;
  state.player.ownedShips = [
    { defId: 'ship_kestrel', fittings: [null, null, null, null, null, null] },
    { defId: 'ship_pelican', fittings: [] },
  ];
  state.player.activeShipIndex = 0;
  state.ui.docked = docked;
  state.ui.dockedStationId = stationId;

  const bus = createBus();
  const ships = Object.assign({}, shipsPrototype, { _instSeq: 0 });
  ships.init({ state, bus, helpers: {} });
  // A live player entity, the way flight has one (the active hull only).
  const entity = {
    id: 'player_hull', type: 'ship', team: 0, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12, mass: 100,
    hull: 100, hullMax: 100,
    data: { defId: 'ship_kestrel', fittings: [], ai: {}, intent: {} },
  };
  state.entities.set(entity.id, entity);
  state.playerId = entity.id;
  ships.recomputeEntity(entity.id, state.player.ownedShips[shipIndex].fittings);

  // Receipts record only from here: the harness's own initial build does not count.
  const saved = [];
  const changed = [];
  bus.on('ship:appearanceSaved', (p) => saved.push(p));
  bus.on('ship:appearanceChanged', (p) => changed.push(p));
  return { state, bus, ships, saved, changed, entity };
}

function paint(state, bus, appearance, shipIndex = 0) {
  return bus.emit('ui:setShipAppearance', { shipIndex, appearance });
}

test('the paint catalog is coherent swatch stock', () => {
  for (const [name, list] of [['hull', SHIP_HULL_PAINTS], ['accent', SHIP_ACCENT_PAINTS]]) {
    const ids = new Set();
    for (const row of list) {
      assert.ok(row.id && row.name && typeof row.sentence === 'string' && row.sentence.length > 8, `${name} row carries id/name/sentence`);
      assert.ok(!ids.has(row.id), `${name} id ${row.id} is unique`);
      ids.add(row.id);
      assert.ok(row.hex === null || HEX_RE.test(row.hex), `${name} ${row.id} hex is null or #rrggbb`);
    }
    assert.ok(ids.has(list === SHIP_HULL_PAINTS ? 'bare' : 'factory'), `${name} rack stocks the factory coat`);
    assert.ok(list.length >= 8, `${name} rack is a real rack (${list.length} swatches)`);
  }
  for (const f of SHIP_FINISH_STOCK) {
    assert.ok(SHIP_FINISHES.includes(f.id), `finish ${f.id} is in the appearance model enum`);
    assert.ok(typeof f.sentence === 'string' && f.sentence.length > 8);
  }
  const wears = new Set();
  for (const w of SHIP_WEAR_STOCK) {
    assert.ok(Number.isFinite(w.wear) && w.wear >= 0 && w.wear <= 1, `wear ${w.id} in 0..1`);
    assert.ok(!wears.has(w.wear), `wear value ${w.wear} distinct`);
    wears.add(w.wear);
  }
});

test('one swatch patches exactly one field and leaves the rest of the coat alone', () => {
  const current = normalizeShipAppearance({ hullColor: '#33383f', accentColor: '#d83028', finish: 'satin', wear: 0.25 }, 'ship_kestrel');
  const next = buildPaintAppearance(current, { finish: 'polished' });
  assert.equal(next.finish, 'polished');
  assert.equal(next.hullColor, '#33383f');
  assert.equal(next.accentColor, '#d83028');
  assert.equal(next.wear, 0.25);

  const fromNull = buildPaintAppearance(null, { hullColor: null }); // bare onto a fresh record
  assert.equal(fromNull.hullColor, null);

  // normalization keeps the record inside the model (version + default decal for the hull)
  const normalized = normalizeShipAppearance(next, 'ship_kestrel');
  assert.ok(SHIP_DECALS.includes(normalized.decalId));
  assert.equal(normalized.version, 1);
});

test('the rack intent paints the active hull: owned record + live entity + both receipts', () => {
  const h = buildHarness();
  const appearance = buildPaintAppearance(null, { hullColor: '#2c4a6e', finish: 'polished', wear: 0.05 });
  paint(h.state, h.bus, appearance);

  const owned = h.state.player.ownedShips[0];
  const record = normalizeShipAppearance(owned.appearance, owned.defId);
  assert.equal(record.hullColor, '#2c4a6e', 'the owned record carries the paint');
  assert.equal(record.finish, 'polished');
  assert.equal(record.wear, 0.05);

  const entity = h.state.entities.get(h.state.playerId);
  assert.ok(entity, 'the active hull has a live entity');
  assert.equal(normalizeShipAppearance(entity.data.appearance, 'ship_kestrel').hullColor, '#2c4a6e', 'the flying hull is repainted');

  assert.equal(h.saved.length, 1, 'ship:appearanceSaved fires exactly once');
  assert.equal(h.saved[0].shipIndex, 0);
  assert.equal(h.changed.length, 1, 'ship:appearanceChanged fires for the active hull');
  assert.equal(h.changed[0].id, entity.id);
});

test('painting a stowed hull touches only the owned record; Make active carries the coat', () => {
  const h = buildHarness();
  paint(h.state, h.bus, buildPaintAppearance(null, { hullColor: '#e06428' }), 1);

  const stowed = normalizeShipAppearance(h.state.player.ownedShips[1].appearance, 'ship_pelican');
  assert.equal(stowed.hullColor, '#e06428');
  const entity = h.state.entities.get(h.state.playerId);
  assert.notEqual(
    normalizeShipAppearance(entity.data.appearance, 'ship_kestrel').hullColor,
    '#e06428',
    'the active hull in flight keeps its own coat',
  );
  assert.equal(h.changed.length, 0, 'no active-hull rebuild for a stowed hull');

  h.bus.emit('ui:setActiveShip', { index: 1 });
  assert.equal(h.state.player.activeShipIndex, 1);
  const repainted = h.state.entities.get(h.state.playerId);
  assert.equal(normalizeShipAppearance(repainted.data.appearance, 'ship_pelican').hullColor, '#e06428', 'the paint flies when the hull does');
});

test('the preview entity record the stage builds repaints through the flight palette seam', () => {
  // shipPreviewMount.makeEntity now writes data.appearance; the renderer paints from exactly this
  // seam (paletteWithShipAppearance), so the contract to pin is the seam itself on that shape.
  const appearance = normalizeShipAppearance(
    buildPaintAppearance(null, { hullColor: '#33383f', accentColor: '#f0a028', finish: 'polished', wear: 0.1 }),
    'ship_kestrel',
  );
  const base = { hull: '#808090', accent: '#a0eef8', thruster: '#60d8ee', dark: '#206070' };
  const entity = { data: { defId: 'ship_kestrel', appearance } }; // the mount's entity shape
  const palette = paletteWithShipAppearance(entity, base);
  assert.equal(palette.hull, '#33383f');
  assert.equal(palette.accent, '#f0a028');
  assert.equal(palette.finish, 'polished');
  assert.equal(palette.wear, 0.1);
  assert.equal(palette.appearanceHullOverride, true);
  assert.equal(palette.appearanceAccentOverride, true);
  // a repainted hull is a different cache key: same hull+fitting, different signature
  const other = shipAppearanceSignature(buildPaintAppearance(appearance, { finish: 'worn' }), 'ship_kestrel');
  assert.notEqual(other, shipAppearanceSignature(appearance, 'ship_kestrel'));
});

test('the Paint verb gates on the same hull-service availability as Make active', () => {
  const docked = shipworksActionAvailability((() => {
    const h = buildHarness({ docked: true, stationId: 'station_helios' });
    return h.state;
  })());
  assert.equal(docked.hullEnabled, true, 'a shipyard berth can paint');

  const undocked = shipworksActionAvailability((() => {
    const h = buildHarness({ docked: false, stationId: null });
    return h.state;
  })());
  assert.equal(undocked.hullEnabled, false, 'in flight the verb is a reason, not a lie');
});

test('catalog lookups reject unstocked ids — the rack never emits a dead knob', () => {
  assert.equal(shipPaintRow(SHIP_HULL_PAINTS, 'nope'), null);
  assert.equal(shipPaintRow(SHIP_ACCENT_PAINTS, undefined), null);
  assert.equal(shipPaintRow(SHIP_FINISH_STOCK, 'satin').id, 'satin');
  assert.equal(shipPaintRow(SHIP_WEAR_STOCK, 'veteran').wear, 0.75);
});
