/**
 * #123 overlay-quartet-quiet-empty-latch — quiet inactive overlay quartet
 * skips four truth readers + hide writes; dirty-wake on identity/ref snapshot.
 * Soft-GPU fps not claimed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { vfx } from '../src/render/vfx.js';

const PLAYER_ID = 1;
const DT = 1 / 60;

function makeHarness() {
  const scene = new THREE.Scene();
  const player = {
    id: PLAYER_ID,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 6,
    mass: 10,
  };
  const state = {
    playerId: PLAYER_ID,
    mode: 'flight',
    entities: new Map([[PLAYER_ID, player]]),
    entityList: [player],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      version: 1,
      projectiles: [],
      ships: [player],
    },
    simTime: 0,
    tick: 0,
    camera: { focus: { x: 0, z: 0 } },
    world: { frameOrigin: { x: 0, z: 0 } },
    settings: {
      video: { particleQuality: 'low', motionReduce: false, engineTrails: false },
      accessibility: { flashReduce: false },
    },
    render: {
      scene,
      camera: new THREE.PerspectiveCamera(),
      viewport: { height: 720 },
      interpolationAlpha: 1,
    },
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
  system.init({
    state,
    bus,
    helpers: { player: () => player },
  });
  return { system, state, bus, player };
}

function runOverlay(system) {
  if (system._overlayQuartetQuietEmpty && !system._overlayQuartetQuietMaybeAwake()) {
    return 'latched';
  }
  system._overlayQuartetQuietEmpty = false;
  system._updatePayloadReleaseGhost();
  system._updateWantedSearchRing();
  system._updateCustomsWeirLines();
  system._updateRouteRibbon();
  if (system._overlayQuartetIsQuiet()) system._overlayQuartetQuietLatch();
  return 'ran';
}

test('overlay-quartet quiet-latches when all four overlays inactive', () => {
  const { system } = makeHarness();
  assert.equal(runOverlay(system), 'ran');
  assert.equal(system._overlayQuartetQuietEmpty, true, 'must latch after empty observe');

  let wantedCalls = 0;
  const origWanted = system._updateWantedSearchRing.bind(system);
  system._updateWantedSearchRing = (...args) => {
    wantedCalls += 1;
    return origWanted(...args);
  };
  let routeCalls = 0;
  const origRoute = system._updateRouteRibbon.bind(system);
  system._updateRouteRibbon = (...args) => {
    routeCalls += 1;
    return origRoute(...args);
  };

  for (let i = 0; i < 40; i++) {
    assert.equal(runOverlay(system), 'latched');
  }
  assert.equal(wantedCalls, 0, 'latched ticks must skip wanted ring');
  assert.equal(routeCalls, 0, 'latched ticks must skip route ribbon');
  assert.equal(system._overlayQuartetQuietEmpty, true);
});

test('heatZone dirty-wake resumes then re-latches when cleared', () => {
  const { system, state } = makeHarness();
  assert.equal(runOverlay(system), 'ran');
  assert.equal(system._overlayQuartetQuietEmpty, true);

  state.player.heatZone.active = true;
  state.player.heatZone.radius = 400;
  state.player.heatZone.level = 2;
  state.player.heatZone.center = { x: 10, z: -5 };

  assert.equal(runOverlay(system), 'ran', 'must wake on heatZone identity');
  assert.equal(system._overlayQuartetQuietEmpty, false);
  assert.ok(system._wantedRing, 'wanted ring mesh allocated');
  assert.equal(system._wantedRing.visible, true);

  state.player.heatZone.active = false;
  state.player.heatZone.radius = 0;
  state.player.heatZone.level = 0;
  assert.equal(runOverlay(system), 'ran');
  assert.equal(system._overlayQuartetQuietEmpty, true);
  assert.equal(system._wantedRing.visible, false);
});

test('customsWeir ref dirty-wake resumes', () => {
  const { system, state } = makeHarness();
  assert.equal(runOverlay(system), 'ran');
  assert.equal(system._overlayQuartetQuietEmpty, true);

  state.lawSecurity.customsWeir = {
    active: true,
    id: 'weir-test',
    seen: false,
    segments: [
      { x0: 0, z0: 0, x1: 10, z1: 0 },
      { x0: 0, z0: 0, x1: 0, z1: 10 },
    ],
  };
  assert.equal(runOverlay(system), 'ran', 'must wake on customsWeir ref');
  assert.equal(system._overlayQuartetQuietEmpty, false);

  state.lawSecurity.customsWeir = null;
  assert.equal(runOverlay(system), 'ran');
  assert.equal(system._overlayQuartetQuietEmpty, true);
});

test('nav destination dirty-wake resumes', () => {
  const { system, state } = makeHarness();
  assert.equal(runOverlay(system), 'ran');
  assert.equal(system._overlayQuartetQuietEmpty, true);

  state.player.nav.waypoint = { x: 100, z: 50 };
  assert.equal(runOverlay(system), 'ran', 'must wake on waypoint ref');
  assert.equal(system._overlayQuartetQuietEmpty, false);

  state.player.nav.waypoint = null;
  assert.equal(runOverlay(system), 'ran');
  assert.equal(system._overlayQuartetQuietEmpty, true);
});

test('payloadReleaseGhost dirty-wake resumes', () => {
  const { system, state } = makeHarness();
  assert.equal(runOverlay(system), 'ran');
  assert.equal(system._overlayQuartetQuietEmpty, true);

  state.player.masslineTelemetry.payloadReleaseGhost = {
    active: true,
    x0: 0, z0: 0, x1: 20, z1: 0,
  };
  assert.equal(runOverlay(system), 'ran', 'must wake on ghost ref');
  assert.equal(system._overlayQuartetQuietEmpty, false);

  state.player.masslineTelemetry.payloadReleaseGhost = null;
  assert.equal(runOverlay(system), 'ran');
  assert.equal(system._overlayQuartetQuietEmpty, true);
});

test('frame update keeps overlay quartet latched while quiet', () => {
  const { system } = makeHarness();
  // Prime latch via direct path, then drive full update.
  assert.equal(runOverlay(system), 'ran');
  assert.equal(system._overlayQuartetQuietEmpty, true);
  for (let i = 0; i < 8; i++) {
    system.update(DT);
    assert.equal(system._overlayQuartetQuietEmpty, true, `frame ${i} must stay latched`);
  }
});
