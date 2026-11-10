import { performance } from 'node:perf_hooks';
import * as THREE from 'three';
import { createBus } from '../src/core/eventBus.js';
import { vfx } from '../src/render/vfx.js';

const mode = process.argv[2] || 'before';
const ITERS = Number(process.argv[3] || 200000);

const scene = new THREE.Scene();
const player = {
  id: 1, type: 'ship', alive: true,
  pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6, mass: 10,
};
const state = {
  playerId: 1, mode: 'flight',
  entities: new Map([[1, player]]),
  entityList: [player],
  entityIndex: { __spacefaceEntityIndexV1: true, ready: true, version: 1, projectiles: [], ships: [player] },
  simTime: 0, tick: 0,
  camera: { focus: { x: 0, z: 0 } },
  world: { frameOrigin: { x: 0, z: 0 } },
  settings: { video: { particleQuality: 'low', motionReduce: false }, accessibility: {} },
  render: { scene, camera: new THREE.PerspectiveCamera(), viewport: { height: 720 }, interpolationAlpha: 1 },
  player: {
    heatZone: { active: false, center: { x: 0, z: 0 }, radius: 0, level: 0, untilS: 0, clearAfterS: 0 },
    nav: { autopilot: { active: false, target: null }, waypoint: null },
    tether: { phase: 'idle', targetId: null, active: false },
    masslineTelemetry: { payloadReleaseGhost: null },
  },
  lawSecurity: { customsWeir: null },
  fields: { active: [] },
  combat: { entities: {}, statusNextPendingSeq: 0 },
};
const bus = createBus();
const system = Object.create(vfx);
system.init({ state, bus, helpers: { player: () => player } });

// Prime meshes so hide path is real for before().
system._updateWantedSearchRing();
system._updateCustomsWeirLines();
system._updateRouteRibbon();
system._updatePayloadReleaseGhost();

function runBefore() {
  // Force unlatched path (pre-#123 residual).
  system._overlayQuartetQuietEmpty = false;
  system._updatePayloadReleaseGhost();
  system._updateWantedSearchRing();
  system._updateCustomsWeirLines();
  system._updateRouteRibbon();
}

function runAfter() {
  if (system._overlayQuartetQuietEmpty && !system._overlayQuartetQuietMaybeAwake()) return;
  system._overlayQuartetQuietEmpty = false;
  system._updatePayloadReleaseGhost();
  system._updateWantedSearchRing();
  system._updateCustomsWeirLines();
  system._updateRouteRibbon();
  if (system._overlayQuartetIsQuiet()) system._overlayQuartetQuietLatch();
}

const fn = mode === 'after' ? runAfter : runBefore;
for (let i = 0; i < 30000; i++) fn();
const t0 = performance.now();
for (let i = 0; i < ITERS; i++) fn();
process.stdout.write(String(performance.now() - t0));
