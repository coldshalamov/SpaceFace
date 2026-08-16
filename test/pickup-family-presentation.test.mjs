import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  PICKUP_PRESENTATION,
  PICKUP_PRESENTATION_IDS,
  pickupPresentationFor,
  pickupRadarColorFor,
  validatePickupPresentationMap,
} from '../src/data/pickupPresentation.js';
import { createVisualFactory, invalidateVisualFactoryCaches } from '../src/render/visualFactory.js';
import { drawPickupRadarShape } from '../src/ui/radar.js';
import { vfx } from '../src/render/vfx.js';

function canvasStub() {
  const context = {
    createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
    putImageData() {}, fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {}, fillText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {}, fill() {}, stroke() {}, clip() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, measureText() { return { width: 10 }; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  return { width: 256, height: 256, getContext: () => context };
}

globalThis.document ||= { createElement: () => canvasStub() };

const CASES = Object.freeze([
  Object.freeze({ id: 'credits', data: { kind: 'credit_chip', credits: 80 } }),
  Object.freeze({ id: 'ore', data: { kind: 'ore', commodityId: 'cmdty_scrap_metal' } }),
  Object.freeze({ id: 'refined', data: { kind: 'cargo', commodityId: 'cmdty_alloys' } }),
  Object.freeze({ id: 'component', data: { kind: 'cargo', commodityId: 'cmdty_comp_circuitry' } }),
  Object.freeze({ id: 'munitions', data: { kind: 'cargo', commodityId: 'cmdty_munitions' } }),
  Object.freeze({ id: 'module', data: { kind: 'module', commodityId: 'mod_shield_booster_s' } }),
  Object.freeze({ id: 'rare', data: { kind: 'cargo', commodityId: 'cmdty_ore_goldium', rarePickup: true } }),
  Object.freeze({ id: 'cargo', data: { kind: 'cargo', commodityId: 'cmdty_food' } }),
]);

function materialObjects(root) {
  const result = [];
  root.traverse((object) => { if (object.material) result.push(object); });
  return result;
}

test('one immutable pickup map gives every family a unique world and radar identity', () => {
  assert.deepEqual(validatePickupPresentationMap(), []);
  assert.deepEqual(PICKUP_PRESENTATION_IDS, CASES.map((entry) => entry.id));
  const profiles = CASES.map((entry) => pickupPresentationFor(entry.data));
  assert.ok(profiles.every(Object.isFrozen));
  assert.equal(new Set(profiles).size, CASES.length);
  assert.equal(new Set(profiles.map((profile) => profile.worldShape)).size, CASES.length);
  assert.equal(new Set(profiles.map((profile) => profile.worldColor)).size, CASES.length);
  assert.equal(pickupPresentationFor(CASES[2].data), pickupPresentationFor(CASES[2].data),
    'hot-path classification returns the same frozen record instead of allocating');

  for (const mode of ['none', 'protanopia', 'deuteranopia', 'tritanopia']) {
    assert.equal(new Set(CASES.map((entry) => pickupRadarColorFor(entry.data, mode))).size, CASES.length,
      `radar colors remain one-to-one in ${mode}`);
  }
});

test('production visual factory builds opaque hard geometry for every pickup family', () => {
  const factory = createVisualFactory();
  const roots = CASES.map((entry, index) => factory.build({
    id: `pickup-family-${index}`,
    type: 'pickup',
    radius: 2.2,
    data: entry.data,
  }));
  for (let index = 0; index < roots.length; index++) {
    const root = roots[index];
    const profile = PICKUP_PRESENTATION[CASES[index].id];
    assert.equal(root.userData.pickupPresentationId, profile.id);
    assert.equal(root.userData.visualLanguage, profile.worldShape);
    assert.equal(root.userData.pickupColor, profile.worldColor);
    assert.ok(materialObjects(root).length > 0);
    assert.equal(root.getObjectsByProperty('isSprite', true).length, 0);
    assert.equal(root.getObjectsByProperty('isPoints', true).length, 0);
    assert.ok(materialObjects(root).every((object) => object.material.transparent !== true));
  }
  assert.equal(new Set(roots.map((root) => root.userData.visualLanguage)).size, roots.length);
  invalidateVisualFactoryCaches();
});

test('live radar draw owner consumes each distinct family shape', () => {
  const signatures = [];
  for (const entry of CASES) {
    const commands = [];
    const g = {
      save() { commands.push('save'); }, restore() { commands.push('restore'); },
      translate(x, y) { commands.push(`translate:${x}:${y}`); },
      rotate(angle) { commands.push(`rotate:${angle}`); }, beginPath() { commands.push('begin'); },
      moveTo(x, y) { commands.push(`move:${x}:${y}`); }, lineTo(x, y) { commands.push(`line:${x}:${y}`); },
      rect(x, y, w, h) { commands.push(`rect:${x}:${y}:${w}:${h}`); },
      closePath() { commands.push('close'); }, fill() { commands.push('fill'); },
    };
    drawPickupRadarShape(g, 20, 30, pickupPresentationFor(entry.data).radarShape, 0, 1);
    signatures.push(commands.join('|'));
  }
  assert.equal(new Set(signatures).size, CASES.length,
    'each pickup family reaches a genuinely different radar silhouette path');
});

function makeBus() {
  const handlers = new Map();
  return {
    on(name, fn) {
      const list = handlers.get(name) || [];
      list.push(fn); handlers.set(name, list);
      return () => { const index = list.indexOf(fn); if (index >= 0) list.splice(index, 1); };
    },
    emit(name, payload) { for (const fn of handlers.get(name) || []) fn(payload); },
  };
}

test('vacuum stream uses the same family color as the physical component pickup', () => {
  const scene = new THREE.Scene();
  const player = { id: 1, alive: true, type: 'ship', radius: 12, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {} };
  const pickup = {
    id: 2, alive: true, type: 'pickup', radius: 2.2,
    pos: { x: 90, z: 12 }, vel: { x: -120, z: -8 },
    data: { kind: 'cargo', commodityId: 'cmdty_comp_circuitry' },
  };
  const state = {
    playerId: player.id, simTime: 2, tick: 120,
    entities: new Map([[player.id, player], [pickup.id, pickup]]), entityList: [player, pickup],
    settings: { video: { particleQuality: 'low', motionReduce: false }, accessibility: { flashReduce: false } },
    render: { scene }, camera: { zoom: 144 },
    miningRuntime: { captureWave: { entries: new Map([[pickup.id, { activateAt: 0 }]]) } },
  };
  const system = Object.create(vfx);
  system.init({ state, bus: makeBus(), helpers: { player: () => player } });
  system._tableVfxDrawWu = 1000;
  assert.equal(system._updateLootMagnet(1 / 30), 1);
  assert.equal(system._pickupStreams.get(pickup.id)?.colorHex,
    pickupPresentationFor(pickup.data).worldColor);
  system.destroy();
});
