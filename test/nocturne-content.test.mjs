import assert from 'node:assert/strict';
import test from 'node:test';
import { Color, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, ShaderLib, SphereGeometry, Vector3, Texture } from 'three';
import { NocturneHeadlightSources } from '../src/render/nocturne/headlightSources.js';
import { NocturneRegistry } from '../src/render/nocturne/registry.js';
import { NocturneContent, resolveNocturneArchetype, validateNocturneLightMetadata, validateNocturneMediumMetadata } from '../src/render/nocturne/content.js';
import { NocturneProbes, installNocturneProbeShader, sampleNocturneDiffuseProbe } from '../src/render/nocturne/probes.js';
import { NOCTURNE_COMPOSITIONS } from '../src/data/nocturneLighting.js';

const membrane = { toLocal(position, out) { out.x = position.x - 1000; out.z = position.z - 2000; return out; } };
function rig() {
  const scene = new Scene();
  const camera = new PerspectiveCamera(55, 1.5, 1, 2000);
  camera.position.set(0, 180, 180); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 1000, z: 2000 }, data: {}, hull: 100, hullMax: 100 };
  const state = { playerId: 1, entities: new Map([[1, player]]), entityList: [player], simTime: 1 };
  const meshes = new Map();
  const registry = new NocturneRegistry();
  const content = new NocturneContent(registry);
  function add(entity, names = ['SOCKET_Light_Gantry', 'SOCKET_Light_Furnace', 'SOCKET_Light_Work']) {
    const root = new Group();
    root.position.set(entity.pos.x - 1000, 0, entity.pos.z - 2000);
    for (let i = 0; i < names.length; i++) { const node = new Group(); node.name = names[i]; node.position.set(i * 15 - 15, 20, i * 8); root.add(node); }
    scene.add(root); meshes.set(entity.id, root); state.entities.set(entity.id, entity); state.entityList.push(entity);
    return root;
  }
  function update(dt = 0.25) { content.update(state, dt, membrane, { meshes, camera }); registry.tick(dt); }
  return { scene, camera, player, state, meshes, registry, content, add, update };
}
const station = (id = 2, x = 1040) => ({ id, type: 'station', alive: true, pos: { x, z: 2000 }, radius: 70, hull: 100, hullMax: 100, data: { archetypeGlb: 'place_station_foundry' } });

test('actual model sockets bind real sources and track animated, scaled parents without sim writes', () => {
  const r = rig(); const entity = station();
  Object.freeze(entity.data); Object.freeze(entity.pos); Object.freeze(entity);
  const root = r.add(entity);
  root.scale.setScalar(2); root.rotation.y = Math.PI / 2;
  r.update();
  const source = r.registry.get('nocturne:entity:2:gantry');
  assert.ok(source?.enabled);
  const socket = root.getObjectByName('SOCKET_Light_Gantry');
  const expected = socket.getWorldPosition(new Vector3());
  assert.ok(source.position.distanceTo(expected) < 1e-9);
  socket.position.x += 9;
  r.update(0.016);
  assert.ok(source.position.distanceTo(socket.getWorldPosition(expected)) < 1e-9);
  assert.equal(entity.data.archetypeGlb, 'place_station_foundry');
  assert.equal(r.content.media.length, 1);
  assert.equal(r.content.compositionId, 'industrial');
  r.content.dispose();
});

test('power loss immediately extinguishes fixtures and probe contribution; repair restores it', () => {
  const r = rig(); const entity = station(); r.add(entity); r.update();
  const before = r.registry.size;
  assert.ok(r.content.probes.count > 0);
  entity.data.powered = false; r.update(0.016);
  assert.ok(r.registry.sources.every((s) => !s.enabled && s.gain === 0));
  assert.equal(r.content.probes.uniforms.sfNocturneProbeCount.value, 0);
  assert.equal(r.content.media.length, 0);
  entity.data.powered = true; entity.hull = 50; r.update(0.016);
  assert.equal(r.registry.size, before);
  assert.ok(r.registry.sources.some((s) => s.gain > 0 && s.gain < 1));
  entity.hull = 100; r.update(0.016);
  assert.ok(r.registry.sources.every((s) => s.gain === 1));
  r.content.dispose();
});

test('a dark mesh or missing named authored socket never invents a light at its origin', () => {
  const r = rig(); const entity = station(); const root = r.add(entity, []);
  root.add(new Mesh(new SphereGeometry(5, 8, 6), new MeshStandardMaterial({ color: 0x555555 })));
  r.update();
  assert.equal(r.registry.size, 0);
  root.userData.nocturne = { lights: [{ id: 'bad', profile: 'sodium', socket: 'DOES_NOT_EXIST' }] };
  r.content.invalidateRoot(root); r.update();
  assert.equal(r.registry.size, 0);
  assert.ok(r.content.diagnostics.missingEmitters > 0);
  r.content.dispose();
});

test('automatic lamp fallback uses visible emissive geometry, not radius-based imaginary bulbs', () => {
  const r = rig(); const entity = station(); const root = r.add(entity, []);
  const colors = [0xffb45e, 0xff702b, 0x75c8ff];
  for (let i = 0; i < 3; i++) {
    const mesh = new Mesh(new SphereGeometry(2, 8, 6), new MeshStandardMaterial({ emissive: colors[i], emissiveIntensity: 2 }));
    mesh.position.set(i * 13, 8, -9); root.add(mesh);
  }
  r.update();
  assert.equal(r.registry.size, 3);
  const x = r.registry.sources.map((s) => s.position.x).sort((a, b) => a - b);
  assert.deepEqual(x, [40, 53, 66]);
  r.content.dispose();
});

test('removed and same-id rematerialized entities release old handles, never leak source residency', () => {
  const r = rig(); const entity = station(); r.add(entity); r.update();
  const old = r.registry.get('nocturne:entity:2:gantry');
  const replacement = station(); replacement.pos.x += 10;
  r.state.entityList = [r.player]; r.state.entities.delete(entity.id);
  r.add(replacement); r.update();
  assert.equal(old.registered, false);
  assert.equal(r.registry.size, 3);
  assert.notEqual(r.registry.get(old.id), old);
  replacement.alive = false; r.update(0.016);
  assert.equal(r.registry.size, 0);
  r.content.dispose();
});

test('source and media capacities stay bounded when the yard is dense', () => {
  const r = rig();
  for (let i = 2; i < 100; i++) r.add(station(i, 1000 + i * 3));
  r.update();
  assert.ok(r.content.records.size <= 32);
  assert.ok(r.registry.size <= 128);
  assert.equal(r.content.media.length, 4);
  assert.equal(r.content.probes.count, 4);
  const before = r.registry.size;
  for (let i = 0; i < 200; i++) r.update(1 / 60);
  assert.equal(r.registry.size, before);
  r.content.dispose(); assert.equal(r.registry.size, 0);
});

test('stationary light shadows invalidate when an ordinary nearby non-emitting caster moves', () => {
  const r = rig(); r.add(station());
  const rock = { id: 20, type: 'asteroid', pos: { x: 1010, z: 2000 }, radius: 10, alive: true, data: {} };
  r.state.entityList.push(rock); r.state.entities.set(20, rock);
  r.update(); const before = r.content.casterEpoch;
  r.update(); assert.equal(r.content.casterEpoch, before);
  rock.pos.x += 2; r.update(); assert.ok(r.content.casterEpoch > before);
  const afterMove = r.content.casterEpoch;
  rock.alive = false; r.update(); assert.ok(r.content.casterEpoch > afterMove);
  r.content.dispose();
});

test('vacuum and combat have no participating medium; derelict smoke requires an active source', () => {
  const r = rig(); r.update(); assert.equal(r.content.media.length, 0);
  r.state.run = { phase: 'active' }; r.update();
  assert.equal(r.content.compositionId, 'combat'); assert.equal(r.content.media.length, 0);
  const wreck = { id: 3, type: 'wreck', alive: true, pos: { x: 1030, z: 2000 }, radius: 40, data: { emergencyLight: true } };
  r.add(wreck, ['SOCKET_Light_Emergency', 'SOCKET_Reactor']); r.update();
  assert.equal(r.content.compositionId, 'derelict'); assert.equal(r.content.media.length, 0);
  wreck.data.reactorActive = true; r.update(); assert.equal(r.content.media.length, 1);
  r.content.dispose();
});

test('classification is explicit for luminous rocks/biology and all explicit opt-outs win', () => {
  assert.equal(resolveNocturneArchetype({ type: 'asteroid', data: {} }), null);
  assert.equal(resolveNocturneArchetype({ type: 'asteroid', data: { oreGlow: true } }), 'ore');
  assert.equal(resolveNocturneArchetype({ type: 'anomaly', data: { luminous: true } }), 'alien');
  assert.equal(resolveNocturneArchetype({ type: 'station', data: { lightFixture: false } }), null);
  assert.equal(resolveNocturneArchetype({ type: 'station', data: { nocturne: { profile: 'missing' } } }), null);
  assert.ok(validateNocturneLightMetadata({ profile: 'reactor', range: Infinity }).length);
  assert.ok(validateNocturneLightMetadata({ profile: 'sodium', offset: [NaN, 0, 0] }).length);
  assert.equal(validateNocturneLightMetadata({ profile: 'sodium', socket: 'SOCKET_Light_Key' }).length, 0);
});

test('probe irradiance has compact spatial support and true normal-dependent colour response', () => {
  const profile = NOCTURNE_COMPOSITIONS.industrial.probe;
  const center = new Vector3(); const radii = new Vector3(10, 10, 10);
  const front = new Vector3().fromArray(profile.direction).normalize();
  const a = sampleNocturneDiffuseProbe(center, front, center, radii, profile, new Color());
  const b = sampleNocturneDiffuseProbe(center, front.clone().negate(), center, radii, profile, new Color());
  assert.ok(a.r > b.r * 2);
  const outside = sampleNocturneDiffuseProbe(new Vector3(11, 0, 0), front, center, radii, profile, new Color());
  assert.equal(outside.r + outside.g + outside.b, 0);
  const shader = { uniforms: {}, fragmentShader: ShaderLib.standard.fragmentShader, vertexShader: ShaderLib.standard.vertexShader };
  assert.equal(installNocturneProbeShader(shader), true);
  const once = shader.fragmentShader;
  assert.equal(installNocturneProbeShader(shader), false);
  assert.equal(shader.fragmentShader, once);
});

test('static reflection binding isolates shared materials and restores/disposes only owned clones', () => {
  const probes = new NocturneProbes(); const root = new Group();
  const material = new MeshStandardMaterial(); const texture = new Texture();
  const mesh = new Mesh(new SphereGeometry(1, 8, 6), material); root.add(mesh);
  let disposed = 0; let textureDisposed = 0; texture.addEventListener('dispose', () => textureDisposed++);
  assert.equal(probes.bindReflection(root, texture, 0.4), true);
  assert.notEqual(mesh.material, material); assert.equal(mesh.material.envMap, texture);
  mesh.material.addEventListener('dispose', () => disposed++);
  assert.equal(material.envMap, null);
  probes.unbindReflection(root);
  assert.equal(mesh.material, material); assert.equal(disposed, 1); assert.equal(textureDisposed, 0);
  probes.dispose();
});


test('invalid medium metadata fails closed and explicit false leaves vacuum optically clear', () => {
  const r = rig(); const root = r.add(station());
  root.userData.nocturne = { medium: { radii: [1, NaN, 1], density: 0.01 } };
  r.update();
  assert.equal(r.content.media.length, 0);
  assert.ok(r.content.diagnostics.invalidDescriptors > 0);
  root.userData.nocturne.medium = false;
  r.content.invalidateRoot(root); r.update();
  assert.equal(r.content.media.length, 0);
  assert.ok(validateNocturneMediumMetadata({ radii: [-1, 1, 1], density: 0.001 }).length);
  r.content.dispose();
});

test('visible LOD replacement retargets sources without keeping hidden emitters alive', () => {
  const r = rig(); const root = r.add(station(), []);
  const lod0 = new Group(), lod1 = new Group();
  const a = new Group(), b = new Group(); a.name = b.name = 'SOCKET_Light_Gantry';
  a.position.set(10, 15, 0); b.position.set(20, 15, 0);
  lod0.add(a); lod1.add(b); root.add(lod0, lod1); lod1.visible = false;
  r.update();
  const old = r.registry.get('nocturne:entity:2:gantry');
  assert.equal(old.position.x, 50);
  lod0.visible = false; lod1.visible = true; r.update(0.016);
  assert.equal(old.enabled, false);
  r.update(0.25);
  const replacement = r.registry.get(old.id);
  assert.equal(old.registered, false); assert.equal(replacement.position.x, 60);
  assert.equal(r.registry.size, 1);
  r.content.dispose();
});


test('native vented reactor state extinguishes its removed core and fauna emits without invented gas', () => {
  const r = rig();
  const wreck = { id: 3, type: 'wreck', alive: true, pos: { x: 1030, z: 2000 }, radius: 40,
    data: { unstableReactor: { vented: false, burst: false, towedClear: false } } };
  r.add(wreck, ['SOCKET_Reactor']); r.update();
  const core = r.registry.get('nocturne:entity:3:core'); assert.ok(core.enabled);
  wreck.data.unstableReactor.vented = true; r.update(0.016);
  assert.equal(core.enabled, false); assert.equal(r.content.media.length, 0);
  const fauna = { id: 4, type: 'fauna', alive: true, pos: { x: 1010, z: 2010 }, radius: 14,
    data: { ecology: { speciesId: 'lantern_cyst', driveState: 'drift', disguised: false } } };
  r.add(fauna, ['SOCKET_Bioluminescence']); r.update();
  assert.ok(r.registry.get('nocturne:entity:4:root').enabled);
  assert.equal(r.content.media.length, 0, 'a glowing animal is not itself a gas cloud');
  fauna.data.ecology.disguised = true; r.update(0.016);
  assert.equal(r.registry.get('nocturne:entity:4:root').enabled, false);
  r.content.dispose();
});

test('one-slot headlight census stays bounded and explicit power-off states extinguish it', () => {
  const r = rig();
  const headlights = new NocturneHeadlightSources(r.registry, { capacity: 1 });
  const npc = { id: 4, type: 'ship', alive: true, pos: { x: 1010, z: 2000 }, data: {} };
  r.state.entities.set(4, npc); r.state.entityList.push(npc);
  headlights.update(r.state, 0.25, membrane, { meshes: r.meshes });
  assert.equal(headlights._chosen.length, 1);
  assert.equal(headlights.rows[0].entity, r.player);
  for (const powerState of ['off', 'offline', 'failed', 'destroyed', 'unpowered']) {
    r.player.data.powerState = powerState;
    headlights.update(r.state, 0.016, membrane, { meshes: r.meshes });
    assert.equal(headlights.rows[0].source.enabled, false);
  }
  headlights.dispose(); r.content.dispose();
});

test('headlights rebind a hidden LOD socket to its visible replacement instead of following stale geometry', () => {
  const r = rig(); const root = new Group(); const a = new Group(), b = new Group();
  const sa = new Group(), sb = new Group(); sa.name = sb.name = 'SOCKET_HEADLIGHT';
  sa.position.x = 5; sb.position.x = 12; a.add(sa); b.add(sb); b.visible = false;
  root.add(a, b); r.scene.add(root); r.meshes.set(r.player.id, root);
  const headlights = new NocturneHeadlightSources(r.registry, { capacity: 1 });
  headlights.update(r.state, 0.25, membrane, { meshes: r.meshes });
  assert.equal(headlights.rows[0].source.position.x, 5);
  a.visible = false; b.visible = true;
  headlights.update(r.state, 0.016, membrane, { meshes: r.meshes });
  assert.equal(headlights.rows[0].socket, sb);
  assert.equal(headlights.rows[0].source.position.x, 12);
  b.remove(sb); headlights.update(r.state, 0.016, membrane, { meshes: r.meshes });
  assert.equal(headlights.rows[0].socket, null);
  headlights.dispose(); r.content.dispose();
});

test('a named emissive socket is reserved once and its material power controls indirect composition', () => {
  const r = rig();
  const entity = { id: 9, type: 'wreck', alive: true, pos: { x: 1020, z: 2000 }, radius: 40,
    data: { emergencyLight: true, smoke: true } };
  const root = r.add(entity, []);
  const a = new Mesh(new SphereGeometry(1), new MeshStandardMaterial({ emissive: 0xff3349, emissiveIntensity: 1 }));
  const b = new Mesh(new SphereGeometry(1), a.material.clone());
  a.name = 'SOCKET_Light_Emergency'; a.position.x = -10; b.position.x = 15; root.add(a, b);
  r.update();
  const fore = r.registry.get('nocturne:entity:9:warning_fore');
  const aft = r.registry.get('nocturne:entity:9:warning_aft');
  assert.equal(fore.position.x, 10); assert.equal(aft.position.x, 35);
  assert.ok(r.content.probes.count > 0);
  a.material.emissiveIntensity = 0; b.material.emissiveIntensity = 0; r.update(0.016);
  assert.equal(fore.intensity, 0); assert.equal(aft.intensity, 0);
  assert.equal(r.content.probes.count, 0); assert.equal(r.content.media.length, 0);
  const epoch = r.content.casterEpoch; r.content.invalidateRoot(root);
  assert.ok(r.content.casterEpoch > epoch);
  r.content.dispose(); a.geometry.dispose(); b.geometry.dispose(); a.material.dispose(); b.material.dispose();
});

test('authoring descriptors reject malformed identifiers, fractional priorities and unsafe numeric output', () => {
  const valid = { profile: 'sodium', id: 'key', socket: 'SOCKET_Light_Key', intensity: 1000000,
    range: 4000, priority: 4, enabled: false, shadow: true, requiresOcclusion: true };
  assert.deepEqual(validateNocturneLightMetadata(valid), []);
  for (const patch of [{ id: '' }, { id: 1 }, { socket: ' ' }, { intensity: Infinity },
    { intensity: -1 }, { intensity: 1000001 }, { range: 0 }, { range: 4001 },
    { range: NaN }, { priority: 1.5 }, { priority: 5 }, { shadow: 1 }, { enabled: 'false' },
    { requiresOcclusion: 'yes' }, { critical: {} }]) {
    assert.ok(validateNocturneLightMetadata({ ...valid, ...patch }).length > 0, JSON.stringify(patch));
  }
  assert.deepEqual(validateNocturneMediumMetadata(false), []);
  const r = rig(); const root = r.add(station());
  root.userData.nocturne = { lights: [{ profile: 'sodium', id: 'key', socket: 'SOCKET_Light_Gantry', enabled: false }] };
  r.update(); assert.equal(r.registry.get('nocturne:entity:2:key').enabled, false);
  r.content.dispose();
});

test('native fabrication and Sker anchors retain industrial identity even with generic station packages', () => {
  assert.equal(resolveNocturneArchetype({ type: 'station', data: { archetypeGlb: 'place_station_fab' } }), 'industrial');
  assert.equal(resolveNocturneArchetype({ type: 'station', data: { archetypeGlb: 'place_station_blackmarket', stationId: 'station_sker' } }), 'industrial');
  assert.equal(resolveNocturneArchetype({ type: 'station', data: { archetypeGlb: 'place_station_blackmarket', stationId: 'station_smuggler' } }), 'dock');
  assert.equal(resolveNocturneArchetype({ type: 'structure', data: { lightFixture: 'industrial' } }), 'industrial');
});

test('lost-context content disposal restores reflection materials without dispatching GPU disposal', () => {
  for (const disposeGpu of [false, true]) {
    const r = rig(); const root = r.add(station());
    const material = new MeshStandardMaterial(); const geometry = new SphereGeometry(1);
    const mesh = new Mesh(geometry, material); root.add(mesh); r.update();
    const texture = new Texture(); let textureDisposals = 0, cloneDisposals = 0;
    texture.addEventListener('dispose', () => textureDisposals++);
    r.content.probes.bindReflection(root, texture);
    mesh.material.addEventListener('dispose', () => cloneDisposals++);
    r.content.dispose({ disposeGpu });
    assert.equal(mesh.material, material); assert.equal(cloneDisposals, disposeGpu ? 1 : 0);
    assert.equal(textureDisposals, 0); assert.equal(r.content.probes._reflectionBindings.size, 0);
    assert.equal(r.registry.size, 0); assert.equal(r.content.probes.count, 0);
    geometry.dispose(); material.dispose(); texture.dispose();
  }
});
