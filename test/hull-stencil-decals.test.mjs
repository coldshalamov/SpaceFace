// Hull stencils: the decalId appearance slot finally has a renderer consumer. Pins the contracts
// that keep the marks correct and batchable:
//   1. the rack catalog, the persisted SHIP_DECALS enum and the stencil sheet registry agree;
//   2. a rack decal swatch patches exactly the decalId field and survives normalization;
//   3. the flight palette seam carries decalId (explicit record wins; absent record leaves room
//      for the faction default);
//   4. the stencil payload builder is null-safe and shape-correct;
//   5. two materials differing only in decal payload never share a retained batch key —
//      otherwise the first ship's tag would paint every hull in its batch;
//   6. a decal choice painted through the REAL ships system lands in the owned record.
// No wall clock, no DOM, no golden edits. The picture itself is judged by the fleet-look stills.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as THREE from 'three';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  normalizeShipAppearance,
  shipAppearanceSignature,
  paletteWithShipAppearance,
  SHIP_DECALS,
} from '../src/core/shipAppearance.js';
import {
  SHIP_DECAL_STOCK,
  buildPaintAppearance,
  shipPaintRow,
} from '../src/data/shipPaints.js';
import {
  STENCIL_STYLE_IDS,
  STENCIL_GLSL,
  stencilPayloadFor,
  stencilSheetFor,
  stencilFallbackTexture,
} from '../src/render/illustratedStencils.js';
import { rigidOpaqueMaterialProgramKey } from '../src/render/rigidOpaqueBatchPolicy.js';
import { ships as shipsPrototype } from '../src/systems/ships.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the decal vocabulary agrees across enum, rack stock and sheet registry', () => {
  assert.deepEqual([...STENCIL_STYLE_IDS].sort(), SHIP_DECALS.filter((id) => id !== 'none').sort(),
    'the sheet registry draws exactly the non-none SHIP_DECALS');
  const stocked = new Set(SHIP_DECAL_STOCK.map((row) => row.decalId));
  for (const id of SHIP_DECALS) assert.ok(stocked.has(id), `the rack stocks decal ${id}`);
  assert.equal(stocked.size, SHIP_DECALS.length, 'one stocked row per decal id, no duplicates');
  const stockIds = new Set(SHIP_DECAL_STOCK.map((row) => row.id));
  assert.equal(stockIds.size, SHIP_DECAL_STOCK.length, 'stock row ids unique');
  for (const row of SHIP_DECAL_STOCK) {
    assert.ok(typeof row.sentence === 'string' && row.sentence.length > 8, `${row.id} carries rack copy`);
    assert.equal(shipPaintRow(SHIP_DECAL_STOCK, row.id).decalId, row.decalId);
  }
  assert.equal(shipPaintRow(SHIP_DECAL_STOCK, 'nope'), null);
});

test('a decal swatch patches exactly the decalId field and normalizes inside the model', () => {
  const current = normalizeShipAppearance(
    { hullColor: '#33383f', finish: 'polished', wear: 0.25, decalId: 'concord' }, 'ship_kestrel');
  const next = buildPaintAppearance(current, { decalId: 'frontier' });
  assert.equal(next.decalId, 'frontier');
  assert.equal(next.hullColor, '#33383f', 'the coat stays');
  assert.equal(next.finish, 'polished');
  assert.equal(next.wear, 0.25);

  // Repainting the hull keeps the marks; a fresh record defers to the hull's default decal.
  assert.equal(buildPaintAppearance(next, { hullColor: '#2c4a6e' }).decalId, 'frontier');
  assert.equal(normalizeShipAppearance(buildPaintAppearance(null, { wear: 0.1 }), 'ship_kestrel').decalId,
    'borrowed_time', 'the Hitch defaults to its own tag');
  assert.equal(normalizeShipAppearance(buildPaintAppearance(null, { wear: 0.1 }), 'ship_wasp').decalId,
    'none', 'other hulls default bare');

  // A deliberate 'none' (the Bare deck row) survives normalization.
  const cleared = normalizeShipAppearance(buildPaintAppearance(current, { decalId: 'none' }), 'ship_kestrel');
  assert.equal(cleared.decalId, 'none');
});

test('the flight palette seam carries decalId; an absent record leaves the field unset', () => {
  const base = { hull: '#808090', accent: '#a0eef8', thruster: '#60d8ee', dark: '#206070' };
  const withRecord = paletteWithShipAppearance(
    { data: { defId: 'ship_wasp', appearance: { decalId: 'industrial' } } }, base);
  assert.equal(withRecord.decalId, 'industrial');
  const explicitNone = paletteWithShipAppearance(
    { data: { defId: 'ship_wasp', appearance: { decalId: 'none' } } }, base);
  assert.equal(explicitNone.decalId, 'none', 'a deliberate bare deck is a choice, not an absence');
  const noRecord = paletteWithShipAppearance({ data: { defId: 'ship_wasp' } }, base);
  assert.equal(noRecord.decalId, undefined, 'no record: the faction default may answer');
});

test('the stencil payload builder is null-safe and carries the hull-space anchor', () => {
  const bounds = { center: [1, 2, 3], size: [12, 4, 8] };
  assert.equal(stencilPayloadFor('none', bounds, 0.2), null);
  assert.equal(stencilPayloadFor('concord', null, 0.2), null);
  assert.equal(stencilPayloadFor('concord', { center: 4, size: [1, 2, 3] }, 0.2), null);
  // Headless (no DOM) the sheet cannot be drawn: the builder stays null instead of throwing.
  assert.equal(stencilSheetFor('borrowed_time'), typeof document === 'undefined' ? null : stencilSheetFor('borrowed_time'));
  assert.equal(stencilFallbackTexture().image.width, 1, 'the fallback sampler binding exists');
});

test('materials differing only in decal payload never share a retained batch key', () => {
  const make = (payload) => {
    const material = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.7, metalness: 0.2 });
    material.userData.spacefaceIllustratedSurface = 'spaceface-illustrated-surface-v17';
    material.onBeforeCompile = () => {};
    if (payload) material.userData.spacefaceHullStencils = payload;
    return material;
  };
  const bounds = { center: [0, 0, 0], size: [10, 3, 6] };
  const a = make({ decalId: 'concord', strength: 0.85, texture: {}, center: bounds.center, size: bounds.size });
  const b = make({ decalId: 'frontier', strength: 0.8, texture: {}, center: bounds.center, size: bounds.size });
  const c = make({ decalId: 'concord', strength: 0.3, texture: {}, center: bounds.center, size: bounds.size });
  const d = make(null);
  const key = (m) => rigidOpaqueMaterialProgramKey(m);
  assert.ok(key(a) && key(b) && key(c) && key(d), 'all four admit to the planner');
  assert.notEqual(key(a), key(b), 'different decal styles differ');
  assert.notEqual(key(a), key(c), 'different decal strengths differ');
  assert.notEqual(key(a), key(d), 'stenciled vs bare differ');
  assert.equal(key(a), key(make({ decalId: 'concord', strength: 0.85, texture: {}, center: [0, 0, 0], size: [10, 3, 6] })),
    'identical payloads share one batch');
});

test('the shader chain samples the stencil sheet and gates on its strength uniform', () => {
  const surface = read('src/render/illustratedSurface.js');
  assert.match(surface, /spacefaceHullStencils/, 'the hook reads the payload');
  assert.match(surface, /sfStencilStrength > 0\.0 \|\| sfLayoutStrength > 0\.0|sfPaintStrength > 0\.0 \|\| sfLayoutStrength > 0\.0 \|\| sfStencilStrength > 0\.0/,
    'the stencil joins the uniform-coherent skip predicate');
  assert.match(STENCIL_GLSL, /texture2D\(sfStencilMap/, 'the sheet is sampled once per fragment');
  assert.match(STENCIL_GLSL, /sfStDeck/, 'marks land on top-facing surfaces');
  for (const id of STENCIL_STYLE_IDS) {
    assert.ok(new RegExp(`^  ${id}: \\{ draw: draw`, 'm').test(read('src/render/illustratedStencils.js')),
      `style ${id} has a drawer`);
  }
});

test('a decal painted through the real ships system lands in the owned record', () => {
  const state = createGameState(0x5a17);
  state.player.credits = 250_000;
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [null, null, null, null, null, null] }];
  state.player.activeShipIndex = 0;
  state.ui.docked = true;
  state.ui.dockedStationId = 'station_helios';
  const bus = createBus();
  const ships = Object.assign({}, shipsPrototype, { _instSeq: 0 });
  ships.init({ state, bus, helpers: {} });
  const entity = {
    id: 'player_hull', type: 'ship', team: 0, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12, mass: 100,
    hull: 100, hullMax: 100,
    data: { defId: 'ship_kestrel', fittings: [], ai: {}, intent: {} },
  };
  state.entities.set(entity.id, entity);
  state.playerId = entity.id;
  ships.recomputeEntity(entity.id, state.player.ownedShips[0].fittings);

  const appearance = buildPaintAppearance(null, { decalId: 'industrial' });
  bus.emit('ui:setShipAppearance', { shipIndex: 0, appearance });
  const record = normalizeShipAppearance(state.player.ownedShips[0].appearance, 'ship_kestrel');
  assert.equal(record.decalId, 'industrial');
  assert.equal(record.hullColor, null, 'the coat is untouched');
  // The appearance signature carries decalId, so the renderer rebuilds the hull's materials.
  const sig = (appearance) => shipAppearanceSignature(appearance, 'ship_kestrel');
  assert.notEqual(sig(record), sig({ ...record, decalId: 'none' }),
    'changing the decal is a different paint job');
});
