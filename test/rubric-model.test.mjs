import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { buildRubricVisual, disposeRubricVisual, markHeight, markScale } from '../src/render/characters/rubricModel.js';
import { rubricEntitySpec, WHEEL } from '../src/systems/rubric.js';
import { makeEntity } from '../src/core/entity.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { authoredCriticalVisualReadiness } from '../src/render/partsLibrary.js';
import { preloadRubricSkinLibrary, resetRubricSkinLibraryForTests, rubricSkinRow, RUBRIC_SKIN_ASSETS } from '../src/render/rubricSkinLibrary.js';

let id = 20;
const body = (over = {}) => makeEntity({ ...rubricEntitySpec('body'), id: ++id, ...over });
const markEntity = (mk, radius = 11) => makeEntity({ type: 'fx', id: ++id, radius, pos: { x: 0, z: 0 }, data: { rubricPart: 'mark', rubricMark: { key: 'k', style: 1, filed: false, progress: 0, cause: 'p', simTime: 0, smear: 0, ...mk } } });
const part = (root, name) => { let hit = null; root.traverse(o => { if (!hit && o.name === name) hit = o; }); return hit; };
/** Drive the model for `seconds` of sim time so every spring settles. */
function settle(root, e, seconds = 2.5) {
  const p = e.data.rubricPose; const t0 = p.simTime;
  for (let i = 1; i <= Math.ceil(seconds * 30); i++) { p.simTime = t0 + i / 30; root.userData.updateAuthoredMotion(e, 0, {}); }
  root.updateMatrixWorld(true);
}
const world = o => o.getWorldPosition(new THREE.Vector3());

test('body and mark variants construct without a DOM, with finite geometry, no sprites or points, and the authored stamp', () => {
  let triangles = 0, meshes = 0;
  for (const root of [buildRubricVisual(body()), buildRubricVisual(markEntity({ filed: true, style: 1 })), buildRubricVisual(markEntity({ style: 2 })), buildRubricVisual(markEntity({ style: 3 }))]) {
    assert.equal(root.userData.authoredAssetState, 'authored'); assert.equal(root.userData.authoredVisualRoot, 'authored-root'); assert.equal(root.userData.rubric, true);
    root.traverse(o => {
      assert.equal(!!o.isSprite, false); assert.equal(!!o.isPoints, false, 'a camera-facing point is never a designed object');
      if (!o.geometry) return;
      const p = o.geometry.attributes.position; assert.ok([...p.array].every(Number.isFinite));
      o.geometry.computeBoundingBox(); assert.ok(Number.isFinite(o.geometry.boundingBox.min.x));
      triangles += (o.geometry.index?.count ?? p.count) / 3; meshes++;
    });
    disposeRubricVisual(root);
  }
  assert.ok(triangles < 14000, `triangle count ${triangles}`); assert.ok(meshes <= 140, `mesh count ${meshes}`);
  const one = buildRubricVisual(body()); let draw = 0; one.traverse(o => { if (o.isMesh) draw++; });
  assert.ok(draw <= 60, `the marker itself is ${draw} draw calls; static parts must stay merged by material`); disposeRubricVisual(one);
});

test('the real visual factory chooses the authored marker and mark, and leaves the filing hull an ordinary wreck', () => {
  const factory = createVisualFactory();
  const b = factory.build(body()); assert.ok(b); assert.equal(b.userData.rubric, true); assert.equal(b.userData.requestAuthoredUpgrade, undefined); disposeRubricVisual(b);
  const m = factory.build(markEntity({ filed: true })); assert.equal(m.userData.rubric, true); disposeRubricVisual(m);
  const hull = factory.build(makeEntity({ ...rubricEntitySpec('hull'), id: ++id }));
  assert.ok(hull); assert.notEqual(hull.userData.rubric, true, 'F-41 is drawn as the real Mule hulk');
});

test('the authored body satisfies the production asset readiness gate (no "still staging" on New Game)', () => {
  const e = body(); const root = buildRubricVisual(e); e.mesh = root; e.pos.set(40, 0, 0);
  const player = { id: 1, type: 'ship', isPlayer: true, alive: true, maxSpeed: 174, pos: { x: 0, z: 0 }, mesh: { userData: { authoredAssetState: 'authored' } } };
  const entityList = [player, e];
  const result = authoredCriticalVisualReadiness({ mode: 'loading', playerId: 1, simTime: 0, entityList, entities: new Map(entityList.map(x => [x.id, x])),
    camera: { zoom: 144 }, render: {}, world: { currentSectorId: 'sector_tethys_junction' } });
  assert.equal(result.ready, true); disposeRubricVisual(root);
});

test('pause freezes every animated transform even while the renderer wall clock advances', () => {
  const e = body(); const root = buildRubricVisual(e); e.data.rubricPose.simTime = 4; root.userData.updateAuthoredMotion(e, 4, {});
  const snapshot = () => { const a = []; root.traverse(o => a.push(...o.position.toArray(), ...o.rotation.toArray().slice(0, 3))); return a; };
  const before = snapshot(); root.userData.updateAuthoredMotion(e, 400, {}); assert.deepEqual(snapshot(), before); disposeRubricVisual(root);
});

test('render choreography never writes authoritative simulation data', () => {
  const e = body(); const root = buildRubricVisual(e); const before = JSON.stringify(e);
  e.data.rubricPose.mode = 'work'; e.data.rubricPose.aim = { x: 20, z: 3, live: true }; const mid = JSON.stringify(e);
  root.userData.updateAuthoredMotion(e, 33, {}); assert.equal(JSON.stringify(e), mid); assert.notEqual(before, undefined);
  const m = markEntity({ progress: 0.5 }); const mr = buildRubricVisual(m); const snap = JSON.stringify(m); mr.userData.updateAuthoredMotion(m, 9, {}); assert.equal(JSON.stringify(m), snap);
  disposeRubricVisual(root); disposeRubricVisual(mr);
});

test('at work the spray nozzle meets the strike front all along the line, telescoping the boom to get there', () => {
  const e = body(); const root = buildRubricVisual(e); const p = e.data.rubricPose;
  const nozzle = part(root, 'RUBRIC_hot_static'); const spray = root.userData.rubricParts.arms.spray; // the nozzle's hot tip, baked into one mesh
  Object.assign(p, { mode: 'work', spray: 1, aimRadius: 11, aimRot: 0 }); p.aim = { x: 19.8, z: 0, live: true };
  const reached = [];
  for (const progress of [0.05, 0.3, 0.5, 0.7, 0.95]) {
    p.progress = progress; settle(root, e, 2.2);
    const sweep = (-0.6 + 1.2 * progress) * markScale(11);
    const target = new THREE.Vector3(19.8 + sweep, markHeight(11) + 0.4, 0);
    reached.push([progress, new THREE.Box3().setFromObject(nozzle).getCenter(new THREE.Vector3()).distanceTo(target), spray.stretch]);
  }
  for (const [progress, miss] of reached) assert.ok(miss < 2.5, `progress ${progress}: nozzle ${miss.toFixed(2)} WU from the strike front`);
  assert.ok(Math.max(...reached.map(r => r[2])) > 1.3, 'the boom telescoped for the far end');
  assert.ok(Math.max(...reached.map(r => r[2])) <= 2.3 + 1e-6, 'and never beyond its limit');
  assert.equal(root.userData.rubricParts.arms.clamp.jaws.every(({ jaw }) => Math.abs(jaw.rotation.y) < 0.35), true, 'the clamp is closed on the hull');
  disposeRubricVisual(root);
});

test('postures: arms stow along the tank at rest, rise in alarm, droop when offering; the spray cone only runs while spraying', () => {
  const e = body(); const root = buildRubricVisual(e); const p = e.data.rubricPose; const spray = root.userData.rubricParts.arms.spray;
  const tipY = mode => { p.mode = mode; p.aim = { x: 0, z: 0, live: false }; settle(root, e, 2.5); return world(spray.tip).y; };
  const rest = tipY('idle'), alarm = tipY('flee'), offer = tipY('offer'), dark = tipY('dark');
  assert.ok(alarm > rest + 3, `alarm raises the arms (${alarm.toFixed(1)} vs ${rest.toFixed(1)})`);
  assert.ok(offer < rest, 'offering lets them hang'); assert.ok(Math.abs(spray.stretch - 1) < 1e-3, 'at rest the boom is not extended'); assert.ok(dark <= rest + 1);
  assert.equal(spray.sprayCone.visible, false);
  Object.assign(p, { mode: 'work', spray: 1, aimRadius: 9, aimRot: 0, progress: 0.4 }); p.aim = { x: 18, z: 2, live: true }; settle(root, e, 1);
  assert.equal(spray.sprayCone.visible, true); assert.equal(spray.drops.visible, true);
  root.userData.updateAuthoredMotion(e, 0, { reducedMotion: true }); assert.equal(spray.sprayCone.visible, false, 'reduced motion drops the animated cone but keeps the nozzle on the job');
  p.spray = 0; settle(root, e, 0.2); assert.equal(spray.sprayCone.visible, false);
  disposeRubricVisual(root);
});

test('the face drum brings each cartridge under the visor window, with one stable angle per face', () => {
  const e = body(); const root = buildRubricVisual(e); const p = e.data.rubricPose; const wheel = root.userData.rubricParts.wheel;
  const TAU = Math.PI * 2, norm = a => ((a % TAU) + TAU) % TAU;
  const angles = {};
  for (const [name, k] of Object.entries(WHEEL)) { p.wheel = k; settle(root, e, 2.5); angles[name] = norm(wheel.rotation.z); }
  const ks = Object.values(angles); assert.equal(new Set(ks.map(a => a.toFixed(3))).size, 5, 'five distinct faces');
  for (let i = 1; i < 5; i++) { const d = norm(angles[Object.keys(WHEEL)[i]] - angles[Object.keys(WHEEL)[i - 1]]); assert.ok(Math.abs(d - (TAU - TAU / 5)) < 0.02 || Math.abs(d - TAU / 5) < 0.02, 'cartridges are 72 degrees apart'); }
  p.wheel = WHEEL.work; settle(root, e, 2.5); const again = norm(wheel.rotation.z); p.wheel = WHEEL.work; settle(root, e, 1); assert.ok(Math.abs(norm(wheel.rotation.z) - again) < 1e-3, 'it settles, it does not wander');
  disposeRubricVisual(root);
});

test('the face always has eyes: a lit fallback pair until the painted drum arrives', () => {
  const root = buildRubricVisual(body()); const fb = root.userData.rubricParts.fallback;
  assert.equal(fb.visible, true); assert.equal(fb.children.length, 2); disposeRubricVisual(root);
});

test('painted skins: the drum and the four-row atlas swap in when they decode; history picks the row; disposal frees the clone', async () => {
  resetRubricSkinLibraryForTests();
  const e = body(); const root = buildRubricVisual(e); const tank = part(root, 'RUBRIC_skin_static'); // the paint tank, baked with its skin material
  assert.equal(tank.material.map, null, 'built correct without the skins');
  await preloadRubricSkinLibrary(null, { loadTexture: async () => new THREE.Texture() });
  assert.ok(tank.material.map, 'the atlas swapped in'); assert.equal(root.userData.rubricParts.fallback.visible, false);
  const p = e.data.rubricPose;
  const rowOf = () => { root.userData.updateAuthoredMotion(e, 0, {}); return Math.round((1 - tank.material.map.offset.y) / 0.25) - 1; };
  Object.assign(p, { wronged: 0, witness: 0, memorial: false }); assert.equal(rowOf(), 0); assert.equal(rubricSkinRow(p), 0);
  p.witness = 3; assert.equal(rowOf(), 1); p.wronged = 1; assert.equal(rowOf(), 2, 'a scar outranks the overspray'); p.memorial = true; assert.equal(rowOf(), 3, 'whitewash outranks the scar');
  assert.equal(tank.material.map.repeat.y, 0.25);
  let freed = 0; tank.material.map.addEventListener('dispose', () => freed++);
  disposeRubricVisual(root); disposeRubricVisual(root); assert.equal(freed, 1);
  resetRubricSkinLibraryForTests();
});

test('a failed skin load is not fatal: the marker keeps its flat colours and its eyes', async () => {
  resetRubricSkinLibraryForTests();
  const root = buildRubricVisual(body());
  const warn = console.warn; console.warn = () => {};
  const res = await preloadRubricSkinLibrary(null, { loadTexture: async () => { throw new Error('offline'); } });
  console.warn = warn;
  assert.equal(res, null); assert.equal(part(root, 'RUBRIC_skin_static').material.map, null); assert.equal(root.userData.rubricParts.fallback.visible, true);
  disposeRubricVisual(root); resetRubricSkinLibraryForTests();
});

test('reduced motion stills the bob and the roll; reduced flash holds the lamps steady', () => {
  const e = body(); const root = buildRubricVisual(e); const p = e.data.rubricPose; const rig = root.userData.rubricParts.rig; const lamp = root.userData.rubricParts.lamp;
  const samples = []; const lampSamples = new Set();
  for (let i = 1; i <= 40; i++) { p.simTime = i * 0.137; root.userData.updateAuthoredMotion(e, 0, { reducedMotion: true, reducedFlash: true }); samples.push(rig.position.y); lampSamples.add(lamp.material.color.getHex()); }
  assert.equal(new Set(samples.map(v => v.toFixed(4))).size, 1, 'no bob'); assert.equal(rig.rotation.z, 0); assert.equal(lampSamples.size, 1, 'no blinking');
  let moving = new Set(); for (let i = 1; i <= 40; i++) { p.simTime = 10 + i * 0.137; root.userData.updateAuthoredMotion(e, 0, {}); moving.add(rig.position.y.toFixed(3)); }
  assert.ok(moving.size > 5, 'with motion allowed it bobs');
  disposeRubricVisual(root);
});

test('marks: cause is a shape — one line, two lines, a broken line — and the filed tag keeps its chevrons', () => {
  const bars = r => { let n = 0; r.traverse(o => { if (o.isGroup && o.children.length && o.children.every(c => c.isMesh) && o.position.y > 0.05 && o.position.y < 0.07) n += o.children.length / 2; }); return n; };
  const single = buildRubricVisual(markEntity({ style: 1, progress: 1 })), dbl = buildRubricVisual(markEntity({ style: 2, progress: 1 })), broken = buildRubricVisual(markEntity({ style: 3, progress: 1 }));
  assert.equal(bars(single) - 1, 1, 'one line (plus the hidden smear copy)'); assert.equal(bars(dbl) - 1, 2, 'two lines'); assert.equal(bars(broken) - 6, 6, 'six dashes');
  const filed = buildRubricVisual(markEntity({ style: 1, filed: true, progress: 1 }));
  let chevrons = 0, tags = 0; filed.traverse(o => { if (o.name === 'filed_chevron') chevrons++; if (o.name === 'filed_tag') tags++; });
  assert.equal(chevrons, 3); assert.equal(tags, 1);
  let none = 0; single.traverse(o => { if (o.name === 'filed_tag') none++; }); assert.equal(none, 0, 'an ordinary hull has no desk filing');
  for (const r of [single, dbl, broken, filed]) disposeRubricVisual(r);
});

test('marks draw in as the paint goes on and show a smear ghost only while the hull moves', () => {
  const e = markEntity({ style: 1, filed: true, progress: 0 }); const root = buildRubricVisual(e); const d = e.data.rubricMark;
  const visible = () => { let n = 0; root.traverse(o => { if (o.isMesh && o.visible && o.material?.isMeshBasicMaterial && o.material.color.getHex() === 0xff3b24 && o.geometry.parameters?.height === 0.03) n++; }); return n; };
  root.userData.updateAuthoredMotion(e, 0, {}); assert.equal(visible(), 0, 'nothing struck before the paint goes on');
  d.progress = 0.5; root.userData.updateAuthoredMotion(e, 0, {}); const half = visible(); assert.ok(half >= 1);
  const bar = part(root, 'filed_tag'); assert.ok(bar);
  d.progress = 1; root.userData.updateAuthoredMotion(e, 0, {});
  const lines = []; root.traverse(o => { if (o.name === 'truth_text_line') lines.push(o); }); assert.equal(lines.length, 4); assert.ok(lines.every(l => l.visible && l.scale.x > 0.99), 'all four text lines written');
  const ghostOpacity = () => { let m = 0; root.traverse(o => { if (o.isMesh && o.material?.transparent && o.material.color?.getHex() === 0xff3b24 && o.material.opacity < 1) m = Math.max(m, o.material.opacity); }); return m; };
  assert.equal(ghostOpacity(), 0); d.smear = 1; root.userData.updateAuthoredMotion(e, 0, {}); assert.ok(ghostOpacity() > 0.5, 'the smeared copy shows');
  disposeRubricVisual(root);
});

test('the painted assets exist at the sizes the manifest and the model assume', async () => {
  const dir = new URL('../assets/ships/release/surfaces/rubric/', import.meta.url);
  const dims = async name => { const b = await fs.readFile(new URL(name, dir)); assert.equal(b.toString('latin1', 1, 4), 'PNG'); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  assert.deepEqual(await dims('rubric_skin_atlas.png'), [1024, 1024]); assert.deepEqual(await dims('rubric_stencil_wheel.png'), [2048, 576]);
  const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', dir), 'utf8'));
  assert.equal(manifest.schema, 'spaceface.generatedArt.v1'); assert.deepEqual(manifest.files.atlas.rows, ['primer', 'witness', 'scarred', 'memorial']);
  assert.deepEqual(manifest.files.wheel.cells.length, 5); assert.deepEqual(manifest.files.wheel.size, [2048, 576]);
  for (const url of Object.values(RUBRIC_SKIN_ASSETS)) assert.ok(url.startsWith('/assets/ships/release/surfaces/rubric/'));
});

test('disposal releases each shared GPU resource once and detaches the root', () => {
  const root = buildRubricVisual(body()); const parent = new THREE.Group(); parent.add(root); const gs = new Set(), ms = new Set();
  root.traverse(o => { if (o.geometry) gs.add(o.geometry); if (o.material) ms.add(o.material); }); let n = 0;
  for (const g of [...gs, ...ms]) g.addEventListener('dispose', () => n++);
  disposeRubricVisual(root); disposeRubricVisual(root); assert.equal(n, gs.size + ms.size); assert.equal(root.parent, null);
});
