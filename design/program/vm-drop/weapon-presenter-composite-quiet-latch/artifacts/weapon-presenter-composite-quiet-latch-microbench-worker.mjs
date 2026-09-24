/**
 * Isolated worker: mode=before|after, argv iters.
 * Soft-GPU fps not claimed.
 */
import { performance } from 'node:perf_hooks';
import * as THREE from 'three';
import { clearShieldContacts, WeaponVfxPresenter } from '../src/render/weapons/index.js';

const mode = process.argv[2] || 'before';
const ITERS = Number(process.argv[3]) || 80000;

clearShieldContacts();
const state = {
  playerId: 1,
  simTime: 100,
  settings: { video: { motionReduce: false, flashReduce: false }, accessibility: {} },
  fields: { active: [] },
  entities: new Map([[1, { id: 1, alive: true, pos: { x: 0, z: 0 } }]]),
  entityList: [],
  entityIndex: {
    ready: true,
    version: 7,
    projectiles: [],
    __spacefaceEntityIndexV1: true,
  },
};
const cam = { position: { x: 0, y: 40, z: 80 } };
const ctx = {
  state,
  camera: cam,
  interpolationAlpha: 1,
  viewportHeight: 1000,
  depthTexture: null,
};
const presenter = new WeaponVfxPresenter({ scene: new THREE.Scene(), state });

// Warm: arm per-pool quiet + composite latch.
for (let i = 0; i < 8; i++) presenter.update(1 / 60, ctx);
if (!presenter._presenterQuietEmpty) {
  console.error('failed to arm composite latch');
  process.exit(2);
}

const WARM = 4000;
if (mode === 'before') {
  for (let i = 0; i < WARM; i++) {
    presenter._presenterQuietEmpty = false;
    presenter.update(1 / 60, ctx);
  }
  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) {
    presenter._presenterQuietEmpty = false;
    presenter.update(1 / 60, ctx);
  }
  const ms = performance.now() - t0;
  presenter.dispose();
  clearShieldContacts();
  process.stdout.write(`before ${ms}\n`);
} else {
  for (let i = 0; i < WARM; i++) presenter.update(1 / 60, ctx);
  if (!presenter._presenterQuietEmpty) {
    console.error('latch dropped during after warm');
    process.exit(3);
  }
  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) presenter.update(1 / 60, ctx);
  const ms = performance.now() - t0;
  if (!presenter._presenterQuietEmpty) {
    console.error('latch dropped during after measure');
    process.exit(4);
  }
  presenter.dispose();
  clearShieldContacts();
  process.stdout.write(`after ${ms}\n`);
}
