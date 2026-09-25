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
    const portPivot = hull.getObjectByName('Retro_Thruster_Port');
    const stbdPivot = hull.getObjectByName('Retro_Thruster_Starboard');
    const port = hull.getObjectByName('SOCKET_Retro_Port');
    const starboard = hull.getObjectByName('SOCKET_Retro_Starboard');
    // Each side is one articulating pack: pivot owns its meshes and its emitter socket.
    assert.equal(assembly?.children.length, 2, `${id}: two pack pivots`);
    assert.ok(portPivot && stbdPivot, `${id}: both pack pivots`);
    assert.equal(port.parent, portPivot, `${id}: port socket rides its pivot`);
    assert.equal(starboard.parent, stbdPivot, `${id}: starboard socket rides its pivot`);
    assert.ok(portPivot.children.filter((c) => c.isMesh).length >= 4, `${id}: port pack is built`);
    assert.ok(port && starboard, `${id}: both physical mouth sockets`);
    assert.ok(portPivot.position.x > 0 && stbdPivot.position.x > 0, `${id}: bow-mounted`);
    assert.ok(portPivot.position.z < 0 && stbdPivot.position.z > 0, `${id}: separated sides`);
    assert.ok(port.userData.forward[0] > 0.9 && port.userData.forward[2] < 0);
    assert.ok(starboard.userData.forward[2] > 0);
    assert.equal(attachRetroMounts(hull, { data: { defId: id } }), null, 'no duplicate on rebuild');
    spans.add(Math.round(stbdPivot.position.z * 100));
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

test('the emitter rides its articulating mount — gimbaling the pack moves the jet with it', () => {
  const { root, hull } = mountedHull('ship_kestrel');
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
  const pivot = hull.getObjectByName('Retro_Thruster_Port');
  const socket = hull.getObjectByName('SOCKET_Retro_Port');
  const sock = {};
  vfx._writeRetroSocketPose.call(ctx, socket, sock);
  const rest = { x: sock.x, z: sock.z, ax: sock.ax, az: sock.az };
  // The pack gimbals on its pivot (micro-motion writes rotation.y/z); the socket and every
  // hardware mesh are its children, so the plume origin and axis must swing with the part.
  pivot.rotation.y += 0.07;
  pivot.rotation.z -= 0.04;
  root.updateWorldMatrix(true, true);
  vfx._writeRetroSocketPose.call(ctx, socket, sock);
  assert.ok(Math.hypot(sock.x - rest.x, sock.z - rest.z) > 1e-6, 'socket world pose followed the pivot');
  assert.ok(Math.hypot(sock.ax - rest.ax, sock.az - rest.az) > 1e-3, 'jet axis followed the gimbal');
  const fwd = new THREE.Vector3(...socket.userData.forward).applyQuaternion(socket.getWorldQuaternion(new THREE.Quaternion()));
  // ax is opposite exhaust: exhaust = -a = world forward of the socket.
  assert.ok(Math.abs(-sock.ax - fwd.x) < 1e-5 && Math.abs(-sock.az - fwd.z) < 1e-5, 'exhaust is the socket forward');
});

test('spool heats the pack hardware and reset cools it — the part carries its own heat sink', () => {
  const jets = new PlayerRetroJets(THREE);
  jets.attach(new THREE.Scene());
  jets.configure('engine_ion_small', 14);
  const iris = { emissiveIntensity: 0.12 };
  const heat = { emissiveIntensity: 0.04 };
  const sock = {
    x: 0, y: 0, z: 0, ax: -1, ay: 0, az: 0,
    retroIris: { material: iris, idle: 0.12, lit: 3.4, heatMaterial: heat, heatIdle: 0.04, heatLit: 0.6 },
  };
  const env = { drive: 1, boost: 0, lengthWU: 3, exitRadiusWU: 1.2, spread: 0.5, radiance: 1.1, opacity: 0.1 };
  jets.update(1 / 60, [sock], env);
  assert.ok(iris.emissiveIntensity > 1, 'iris lit at full brake');
  assert.ok(heat.emissiveIntensity > 0.2, 'throat heat rises with spool');
  jets.reset();
  assert.equal(iris.emissiveIntensity, 0.12, 'reset cools the iris');
  assert.equal(heat.emissiveIntensity, 0.04, 'reset cools the throat');
  jets.dispose();
});

test('a released jet withers instead of snapping — coherence dies and the tail frays', () => {
  const jets = new PlayerRetroJets(THREE);
  jets.attach(new THREE.Scene());
  jets.configure('engine_ion_small', 14);
  const sock = { x: 0, y: 0, z: 0, ax: -1, ay: 0, az: 0 };
  const env = (drive) => ({ drive, boost: 0, lengthWU: 3, exitRadiusWU: 1.2, spread: 0.5, radiance: 1.1, opacity: 0.1 });
  jets.update(1 / 60, [sock], env(1));
  const held = jets._plumes[0].material.uniforms;
  const heldCoherence = held.uCoherence.value;
  const heldWobble = held.uWobble.value;
  const heldLength = jets._shape.jetLength;
  jets.update(1 / 60, [sock], env(0.05));
  const fading = jets._plumes[0].material.uniforms;
  assert.ok(fading.uCoherence.value < heldCoherence * 0.4, 'the column breaks up as it dies');
  assert.ok(jets._shape.jetLength > heldLength, 'the tail keeps its drift while it dies');
  assert.ok(fading.uWobble.value > heldWobble, 'fraying grows while it fades');
  jets.dispose();
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

test('the pack bake is shared per hull record + engine profile, so wave spawns draw resident buffers', () => {
  // A (hull record, engine profile, side) pack is one deterministic bake: the seats raycast the
  // record's shared skin soup and the profile dims are fixed. Sharing the merged geometry is what
  // lets a launch-warm exemplar stamp the buffers once so an in-round spawn pays no
  // mergeGeometries and no first-draw bufferData — the +64 full uploads measured at the
  // round-zero -> wave-1 pack boundary (seed 4242) were these per-compose Retro_* bakes.
  const skin = new THREE.BoxGeometry(1.6, 0.4, 0.7);
  const record = {
    bounds: { size: [2, 1, 1] },
    primitives: [{ geometry: skin, matrix: new THREE.Matrix4(), tags: { lod: 'lod0' } }],
  };
  const packMeshes = (hull) => {
    const out = [];
    hull.traverse((o) => { if (o.isMesh && /^Retro_/.test(o.name)) out.push(o); });
    return out.sort((a, b) => a.name.localeCompare(b.name));
  };
  const mount = (defId, rec = record) => {
    const hull = new THREE.Group();
    attachRetroMounts(hull, { data: { defId } }, {}, null, rec);
    return hull;
  };
  const a = packMeshes(mount('ship_wasp'));
  const b = packMeshes(mount('ship_wasp'));
  assert.ok(a.length >= 10, 'five pack parts per side');
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].geometry, b[i].geometry,
      `${a[i].name}: every spawn draws the same baked buffers`);
    assert.equal(a[i].geometry.userData.spacefaceSharedAsset, true,
      `${a[i].name}: flagged shared so a retiring hull cannot dispose the cache entry`);
    assert.notEqual(a[i].material, b[i].material,
      `${a[i].name}: materials stay per-ship — iris/throat are driven per socket`);
  }
  // The pivot-local bake must be identical too: same seats, same socket pose.
  const hullA = mount('ship_wasp');
  const hullB = mount('ship_wasp');
  for (const side of ['Port', 'Starboard']) {
    const pivotA = hullA.getObjectByName(`Retro_Thruster_${side}`).position.toArray();
    const pivotB = hullB.getObjectByName(`Retro_Thruster_${side}`).position.toArray();
    assert.deepEqual(pivotA, pivotB, `${side} pivot pose is deterministic`);
    const sockA = hullA.getObjectByName(`SOCKET_Retro_${side}`).position.toArray();
    const sockB = hullB.getObjectByName(`SOCKET_Retro_${side}`).position.toArray();
    assert.deepEqual(sockA, sockB, `${side} socket pose is deterministic`);
  }
  // A different engine profile bakes its own pack instead of reusing the wasp's.
  const other = packMeshes(mount('ship_leviathan'));
  assert.notEqual(other[0].geometry, a[0].geometry, 'engine profiles keep distinct bakes');
  // A different record is a different hull — never shares the bake.
  const record2 = { ...record, primitives: [...record.primitives] };
  const c = packMeshes(mount('ship_wasp', record2));
  assert.notEqual(c[0].geometry, a[0].geometry, 'the cache is per hull record');
  // And hulls without a record keep the per-attach bake: the live-tree skin is per-hull.
  const bare = (hull) => packMeshes(hull);
  const hullX = new THREE.Group();
  hullX.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.7), new THREE.MeshBasicMaterial()));
  const hullY = new THREE.Group();
  hullY.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 0.5), new THREE.MeshBasicMaterial()));
  attachRetroMounts(hullX, { data: { defId: 'ship_wasp' } });
  attachRetroMounts(hullY, { data: { defId: 'ship_wasp' } });
  const mx = bare(hullX).filter((m) => m.geometry.userData.spacefaceSharedAsset);
  assert.equal(mx.length, 0, 'unmeasured hulls never enter the shared cache');
  assert.ok(bare(hullY).length >= 10, 'unmeasured hulls still get a full pack');
});
