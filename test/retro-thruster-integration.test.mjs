import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { attachRetroMounts } from '../src/render/thruster/retroMounts.js';
import { retroProfileFor, retroWorldScale } from '../src/render/thruster/retroProfiles.js';
import { PlayerRetroJets, retroEnvelopeForDemand } from '../src/render/thruster/systems/playerRetroVolume.js';
import { vfx } from '../src/render/vfx.js';

function mountedHull(defId, rot = 0) {
  const root = new THREE.Group();
  const hull = new THREE.Group();
  root.add(hull);
  root.position.set(100, 0, 200);
  root.rotation.y = -rot;
  hull.scale.setScalar(14);
  const assembly = attachRetroMounts(hull, { data: { defId } }, { dark: '#1b2836', accent: '#748fa7' });
  root.updateWorldMatrix(true, true);
  return { root, hull, assembly };
}

test('the paired mouths are physical hull parts, separated and mounted on every profile family', () => {
  const ids = ['ship_kestrel', 'ship_pelican', 'ship_mule', 'ship_wasp', 'ship_warden', 'ship_leviathan'];
  const spans = new Set();
  for (const id of ids) {
    const { hull, assembly } = mountedHull(id);
    const port = hull.getObjectByName('SOCKET_Retro_Port');
    const starboard = hull.getObjectByName('SOCKET_Retro_Starboard');
    assert.ok(assembly?.children.length >= 3, `${id}: shrouds, lips, throats`);
    assert.ok(port && starboard, `${id}: both physical mouth sockets`);
    assert.ok(port.position.x > 0 && starboard.position.x > 0, `${id}: bow-mounted`);
    assert.ok(port.position.z < 0 && starboard.position.z > 0, `${id}: separated sides`);
    assert.ok(port.userData.forward[0] > 0.9 && port.userData.forward[2] < 0);
    assert.ok(starboard.userData.forward[2] > 0);
    assert.equal(attachRetroMounts(hull, { data: { defId: id } }), null, 'no duplicate on rebuild');
    spans.add(Math.round(starboard.position.z * 100));
  }
  assert.ok(spans.size >= 3, 'engine families use distinct hardware spacing');
});

test('mounted retro exhaust follows presented yaw and world position, including a 90 degree turn', () => {
  const { root } = mountedHull('ship_kestrel');
  const ctx = {
    _socketWorldPos: new THREE.Vector3(),
    _socketWorldQuat: new THREE.Quaternion(),
    _socketWorldScale: new THREE.Vector3(),
    _socketForward: new THREE.Vector3(),
    _entityLocalXZ: { x: 0, z: 0 },
    _spawnLocalXZ: { x: 0, z: 0 },
    _frameMembrane: null,
    _toLocalXZ(x, z, out) { out.x = x; out.z = z; return out; },
  };
  const port = root.getObjectByName('SOCKET_Retro_Port');
  const sock = {};
  for (const yaw of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
    root.rotation.y = -yaw;
    root.position.x += 7;
    root.position.z -= 3;
    root.updateWorldMatrix(true, true);
    assert.equal(vfx._writeRetroSocketPose.call(ctx, port, sock), true);
    const actual = port.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(sock.x - actual.x) < 1e-5);
    assert.ok(Math.abs(sock.z - actual.z) < 1e-5);
    assert.ok(Math.abs(sock.y - actual.y) < 1e-5);
    const exhaustYaw = yaw - 0.349;
    assert.ok(Math.abs(-sock.ax - Math.cos(exhaustYaw)) < 1e-5, `yaw ${yaw}: exhaust X`);
    assert.ok(Math.abs(-sock.az - Math.sin(exhaustYaw)) < 1e-5, `yaw ${yaw}: exhaust Z`);
  }
});

test('installed engine changes retro heat, axial flow and scale while staying two jets', () => {
  const jets = new PlayerRetroJets(THREE);
  jets.attach(new THREE.Scene());
  jets.configure('engine_ion_small', 14);
  const ion = jets._plumes[0].material.uniforms;
  const ionColor = ion.uMidColor.value.getHexString();
  const ionFlow = ion.uFlowRate.value;
  const ionWidth = retroEnvelopeForDemand(1, null, 0, jets.variant, jets.visualScale).exitRadiusWU;
  jets.configure('engine_industrial', 22);
  const industrial = jets._plumes[0].material.uniforms;
  assert.notEqual(industrial.uMidColor.value.getHexString(), ionColor);
  assert.notEqual(industrial.uFlowRate.value, ionFlow);
  assert.ok(retroEnvelopeForDemand(1, null, 0, jets.variant, jets.visualScale).exitRadiusWU > ionWidth);
  assert.equal(jets.maxNozzles, 2);
  assert.equal(jets.variant, retroProfileFor('engine_industrial'));
  assert.ok(retroWorldScale(45) < 4.5);
  jets.dispose();
});

test('the high-speed brake has one subtle camera bite per engagement and respects reduced motion', () => {
  const calls = [];
  const volume = {
    spool: 0, bite: 0,
    update(_dt, sockets) { return { live: sockets.length }; },
    reset() { this.spool = 0; this.bite = 0; },
  };
  const ctx = {
    _energy: { retroVolume: volume },
    _rcsPoseScratch: {},
    _retroSockets: [{}, {}],
    _retroSocketView: [],
    _retroHeldSockets: [{}, {}],
    _retroHeldCount: 0,
    _retroParams: {},
    _spawnLocalXZ: {},
    _productionRcsFirings: [],
    _rcsSocketObjects: () => null,
    _writeRetroSocketPose: () => false,
    _rcsScaleFor: () => ({ main: 50, reverse: 50, strafe: 40, yaw: 2 }),
    _toLocalXZ(x, z, out) { out.x = x; out.z = z; return out; },
    state: {
      input: { moveZ: -1 },
      render: { cameraCtrl: {
        pushZoom: (...args) => calls.push(['zoom', ...args]),
        impactKick: (...args) => calls.push(['kick', ...args]),
      } },
    },
  };
  const player = { pos: { x: 0, z: 0 }, vel: { x: 60, z: 0 }, rot: 0, radius: 14 };
  const brake = { reverse: 50, lateral: 0, yaw: 0, pilotBrake: true };
  const release = { ...brake, reverse: 0, pilotBrake: false };
  for (let i = 0; i < 20; i++) vfx._updateRetroVolume.call(ctx, player, brake, 1 / 60, {});
  assert.deepEqual(calls.map((entry) => entry[0]), ['zoom', 'kick']);
  assert.ok(calls[0][1] < 0 && Math.abs(calls[0][1]) < 0.02, 'brief, restrained tightening');
  assert.equal(calls[1][1], -60, 'the view tug opposes the forward velocity');
  vfx._updateRetroVolume.call(ctx, player, release, 1 / 60, {});
  vfx._updateRetroVolume.call(ctx, player, brake, 1 / 60, {});
  assert.equal(calls.length, 4, 'a new press may bite once again');
  vfx._updateRetroVolume.call(ctx, player, release, 1 / 60, {});
  vfx._updateRetroVolume.call(ctx, player, brake, 1 / 60, { reducedMotion: true });
  assert.equal(calls.length, 4, 'reduced motion keeps the force and jets without camera motion');
});
