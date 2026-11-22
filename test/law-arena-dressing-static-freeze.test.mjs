// R4 — the law arena's dressing is static machinery with a few driven parts. Every builder
// poses its nodes once at composition; only the mover/tick/drum-driven nodes keep moving.
// handleInstall (and the boss/affix binds) now freeze the static children's local matrices
// (staticChildMatrices), tagging the driven nodes `userData.animated` so the freeze skips
// them. These tests pin the split: pinned statics, live movers, and worlds that still track
// a repositioned room root — the failure mode of a wrong tag is a visibly frozen machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLawArenaDressing } from '../src/render/lawArenaDressing.js';
import { STORM_ARENA_ID } from '../src/systems/stormLatticeArena.js';

const FRAME = { x: 100, z: -50 };

function installRichRoom(reader, scene) {
  return reader.handleInstall({
    arenaId: STORM_ARENA_ID,
    installedAtSim: 0,
    fieldSpecs: [
      { kind: 'repulsor', center: { x: 40, z: 30 }, strength: 3 },
    ],
    toySpecs: [
      { kind: 'shutter', a: { x: -60, z: -20 }, b: { x: -20, z: -20 } },
      { kind: 'crusher', pos: { x: 0, z: 60 }, dir: { x: 1, z: 0 }, anvil: { x: 30, z: 60 } },
      { kind: 'current', center: { x: -40, z: 40 }, dir: { x: 0, z: 1 } },
      { kind: 'plate', pos: { x: 20, z: -60 } },
    ],
    roomSpec: {
      at: { x: 0, z: 0 },
      islandRadius: 400,
      pylons: [
        { id: 'p0', pos: { x: -60, z: -60 } },
        { id: 'p1', pos: { x: 60, z: -60 } },
      ],
      relays: [
        { id: 'relay0', pos: { x: 0, z: 0 } },
      ],
    },
  }, scene, FRAME);
}

test('install pins static dressing children and leaves every driven node live', () => {
  const reader = createLawArenaDressing();
  const scene = new THREE.Scene();
  const parts = installRichRoom(reader, scene);
  assert.ok(parts >= 8, 'the room carries the storm dressing set');

  const byName = (name) => scene.getObjectByName(name);
  const pinned = (name) => {
    const node = byName(name);
    assert.ok(node, `${name} exists`);
    return node.matrixAutoUpdate === false;
  };
  const live = (name) => {
    const node = byName(name);
    assert.ok(node, `${name} exists`);
    return node.matrixAutoUpdate === true;
  };

  // Static structure: pinned at install.
  assert.equal(pinned('law_pylon_base'), true, 'pylon base is pinned');
  assert.equal(pinned('law_shutter_beam'), true, 'shutter beam is pinned');
  assert.equal(pinned('law_crusher_anvil'), true, 'crusher anvil is pinned');
  assert.equal(pinned('law_mouth_baffle'), true, 'mouth baffle is pinned');
  assert.equal(pinned('storm_pylon_mast'), true, 'storm pylon mast is pinned');
  assert.equal(pinned('storm_wire'), true, 'conductor wire is pinned');
  assert.equal(pinned('storm_relay_body'), true, 'relay body is pinned');

  // Scale: this install takes a whole dressing room off the per-frame matrix walk.
  let pinnedCount = 0;
  scene.getObjectByName('law_arena_room').traverse((node) => {
    if (node.matrixAutoUpdate === false) pinnedCount += 1;
  });
  assert.ok(pinnedCount >= 40, `the storm room pins a dressing-scale subtree (${pinnedCount} nodes)`);

  // Driven parts: the movers keep writing them every frame.
  assert.equal(live('law_pylon_collar'), true, 'spinning pylon collar stays live');
  assert.equal(live('law_pylon_seam'), true, 'spinning pylon seam ring stays live');
  assert.equal(live('law_shutter_cutter'), true, 'sweeping shutter cutter stays live');
  assert.equal(live('law_crusher_jaw'), true, 'slamming crusher jaw stays live');
  assert.equal(live('law_mouth_roller'), true, 'driven mouth roller stays live');
  assert.equal(live('storm_pylon_coil'), true, 'spinning pylon coil stays live');
  assert.equal(live('storm_relay_feed'), true, 're-aimed relay feed beam stays live');
  const relayRoot = scene.getObjectByName('storm_relay_0');
  assert.ok(relayRoot);
  assert.equal(relayRoot.matrixAutoUpdate, true, 'the orbiting relay root itself stays live');
});

test('stepped movers still move driven parts, and pinned worlds follow the room root', () => {
  const reader = createLawArenaDressing();
  const scene = new THREE.Scene();
  installRichRoom(reader, scene);

  const cutter = scene.getObjectByName('law_shutter_cutter');
  const collar = scene.getObjectByName('law_pylon_collar');
  const base = scene.getObjectByName('law_pylon_base');
  const roomRoot = scene.getObjectByName('law_arena_room');
  const cutterX0 = cutter.position.x;
  const collarY0 = collar.rotation.y;
  const baseWorld0 = base.getWorldPosition(new THREE.Vector3());

  reader.updateRoom(2, 1 / 30, {});
  reader.updateRoom(4, 1 / 30, {});
  scene.updateMatrixWorld(true);

  assert.notEqual(cutter.position.x, cutterX0, 'the cutter sweeps the beam');
  assert.notEqual(collar.rotation.y, collarY0, 'the collar spins');

  // The room root repositions (placeInRenderFrame); a pinned child's WORLD matrix must
  // still track it — freezing locals may never freeze worlds under a moved parent.
  roomRoot.position.set(roomRoot.position.x + 25, 0, roomRoot.position.z - 15);
  roomRoot.updateMatrixWorld(true);
  const baseWorld1 = base.getWorldPosition(new THREE.Vector3());
  assert.equal(baseWorld1.x - baseWorld0.x, 25 + (FRAME.x * 0), 'x follows the root exactly');
  assert.ok(Math.abs((baseWorld1.z - baseWorld0.z) - -15) < 1e-6, 'z follows the root exactly');

  // The stock-engine blocker class (node resolves three to r186, whose updateWorldMatrix
  // gates on matrixWorldNeedsUpdate): an UNFORCED explicit read right after a rebase
  // through the real path must read fresh — placeInRenderFrame dirties the subtree.
  const rebased = base.getWorldPosition(new THREE.Vector3());
  reader.updateRoom(6, 1 / 30, {}, { x: FRAME.x + 12, z: FRAME.z - 8 });
  const unforced = base.getWorldPosition(new THREE.Vector3());
  // Root goes from (-75, 35) to (-(FRAME.x+12), -(FRAME.z-8)) = (-112, 58): a (-37, +23) shift.
  assert.ok(
    Math.abs((unforced.x - rebased.x) - -37) < 1e-6 && Math.abs((unforced.z - rebased.z) - 23) < 1e-6,
    `an unforced world read after the rebase reads fresh (${unforced.x}, ${unforced.z})`,
  );
});

test('boss and affix binds pin their statics, keep drums/ticks live, and survive rebind', () => {
  const reader = createLawArenaDressing();
  const scene = new THREE.Scene();
  const hull = new THREE.Group();
  scene.add(hull);
  const entity = {
    id: 71,
    radius: 40,
    data: { bossDressing: { kind: 'seam_crusher' }, swarmAffix: 'volatile' },
  };

  reader.updateBossDressing(entity, hull, 1, 1 / 30, {});
  const bossGroup = hull.children.find((c) => c.name === 'seam_crusher_dressing');
  assert.ok(bossGroup, 'boss dressing bound');
  assert.equal(bossGroup.matrixAutoUpdate, true, 'the boss group itself stays live (build/release scale)');
  const wheel = bossGroup.children.find((c) => c.name === 'seam_grind_wheel');
  const lump = bossGroup.getObjectByName('seam_ore_lump'); // lumps ride inside the ore train
  const trough = bossGroup.children.find((c) => c.name === 'seam_ore_trough');
  assert.equal(wheel.matrixAutoUpdate, true, 'grind wheel is drum-driven');
  assert.equal(lump.matrixAutoUpdate, true, 'ore lump is tick-driven');
  assert.equal(trough.matrixAutoUpdate, false, 'the trough is pinned');

  const affixRoot = hull.children.find((c) => c.name === 'sf-swarm-threat-affix');
  assert.ok(affixRoot, 'affix mark bound');
  assert.equal(affixRoot.matrixAutoUpdate, true, 'the affix root stays live (pop-in/fling scale)');
  const mark = affixRoot.children.find((c) => c.name === 'sf-swarm-threat-affix-volatile');
  assert.ok(mark);
  const chargeDrum = mark.children.find((c) => c.name === 'sf-swarm-threat-affix-volatile-drum');
  const chargeCollar = mark.children.find((c) => c.name === 'sf-swarm-threat-affix-volatile-collar');
  assert.equal(chargeDrum.matrixAutoUpdate, true, 'the shivering charge drum stays live');
  assert.equal(chargeCollar.matrixAutoUpdate, false, 'the charge collar is pinned');

  // Motion across steps: drums grind, the charge shivers, the affix root scales in.
  const wheelZ0 = wheel.rotation.z;
  const drumX0 = chargeDrum.position.x;
  const affixScale0 = affixRoot.scale.x;
  reader.updateBossDressing(entity, hull, 2, 1 / 30, {});
  reader.updateBossDressing(entity, hull, 3, 1 / 30, {});
  assert.notEqual(wheel.rotation.z, wheelZ0, 'the grind wheels turn');
  assert.notEqual(chargeDrum.position.x, drumX0, 'the charge shivers');
  assert.ok(affixRoot.scale.x > affixScale0, 'the affix mark scales in');

  // A re-seat under a new parent re-freezes without disturbing the live set.
  const hull2 = new THREE.Group();
  scene.add(hull2);
  reader.updateBossDressing(entity, hull2, 4, 1 / 30, {});
  assert.equal(bossGroup.parent, hull2, 'boss group re-bound');
  assert.equal(trough.matrixAutoUpdate, false, 'statics stay pinned after re-seat');
  assert.equal(wheel.matrixAutoUpdate, true, 'drums stay live after re-seat');
});

test('the storm warning cue is never frozen — its resolve pass rewrites segment poses', () => {
  const reader = createLawArenaDressing();
  const scene = new THREE.Scene();
  reader.handleStormWarning({
    wave: 5, roomGeneration: 3, serial: 7, atSim: 20, expiresAtSim: 40, warningS: 1.25,
    segments: [{ ax: 0, az: 0, bx: 80, bz: 0 }],
    nodes: [{ x: 0, z: 0, radius: 30 }],
  }, scene, () => {});
  const root = scene.getObjectByName('storm_discharge_warning');
  assert.ok(root);
  for (const child of root.children) {
    assert.equal(child.matrixAutoUpdate, true, `${child.name || 'unnamed'} stays live`);
  }
});
