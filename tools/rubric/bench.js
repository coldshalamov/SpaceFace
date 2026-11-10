// RUBRIC character workshop. Production system + production combat kernel + real Rapier; only the
// ship input adapter and the review aids (force a pose, force a skin) are local to this page.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildRubricVisual, disposeRubricVisual } from '../../src/render/characters/rubricModel.js';
import { createRubricFixture } from './labRuntime.js';
import { RUBRIC as C, RUBRIC_AUDIO_RECIPES } from '../../src/data/rubric.js';
import { RUBRIC_GLOBAL_ANCHOR as O } from '../../src/systems/rubric.js';
import { playRecipe, disposeVoice } from '../../src/audio/synth.js';

const $ = id => document.getElementById(id);
const canvas = $('view'), keys = new Set(), views = new Map(), errors = [];
window.addEventListener('error', e => errors.push(e.message));
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false }); }
catch (e) { $('error').hidden = false; $('error').textContent = `This preview requires WebGL 2.\n\n${e.message}`; throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0a0d14);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 4000);
scene.add(new THREE.HemisphereLight(0xe4eefa, 0x4a4650, 3.4));
const key = new THREE.DirectionalLight(0xfff0dc, 4.6); key.position.set(-60, 160, 100); scene.add(key);
const rim = new THREE.DirectionalLight(0xff9a7a, 2.4); rim.position.set(70, 30, -100); scene.add(rim);
// Local studio radiance: no texture download, nothing to go stale.
const studio = new THREE.Scene(); studio.background = new THREE.Color(0x1a2029);
for (const [p, color, scale] of [[[0, 30, 0], 0xd8dccf, [30, 1, 16]], [[-25, 8, 14], 0xc79468, [1, 12, 16]], [[20, 12, -18], 0x4a6a80, [1, 20, 12]]]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...scale), new THREE.MeshBasicMaterial({ color })); m.position.set(...p); studio.add(m);
}
const pmrem = new THREE.PMREMGenerator(renderer), env = pmrem.fromScene(studio, 0.04); scene.environment = env.texture;
studio.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); pmrem.dispose();
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(960, 600), 0.4, 0.5, 0.85)); composer.addPass(new OutputPass());
const starPos = new Float32Array(300 * 3);
for (let i = 0; i < 300; i++) { const a = i * 2.3999632297, r = 480 + (i * 97 % 760); starPos[i * 3] = Math.cos(a) * r; starPos[i * 3 + 1] = -130 - (i % 31) * 7; starPos[i * 3 + 2] = Math.sin(a) * r; }
const starG = new THREE.BufferGeometry(); starG.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starG, new THREE.PointsMaterial({ color: 0x8a8ca0, size: 1.1, sizeAttenuation: true, transparent: true, opacity: 0.5 })));
const pilot = new THREE.Group(); pilot.name = 'bench_input_marker_not_a_production_ship';
pilot.add(new THREE.Mesh(new THREE.ConeGeometry(3.5, 10, 4).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe9ddbc, emissive: 0x664831, emissiveIntensity: 0.45, metalness: 0.4, roughness: 0.4 }))); scene.add(pilot);
const linkG = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const link = new THREE.Line(linkG, new THREE.LineBasicMaterial({ color: 0xebc38d, transparent: true, opacity: 0.8 })); link.frustumCulled = false; scene.add(link);

let factory = null;
try { const mod = await import('../../src/render/visualFactory.js'); factory = mod.createVisualFactory(); }
catch (e) { console.warn('visualFactory unavailable; wrecks use a placeholder hulk.', e); }

let f, study = false, last = performance.now(), acc = 0, frame = 0, busy = false, audio = null, voices = [], audioCache = {};
$('motion').checked = matchMedia('(prefers-reduced-motion: reduce)').matches;
const a11y = () => ({ reducedMotion: $('motion').checked, reducedFlash: $('flash').checked });
const holder = new Map();
function placeholderHulk(e) {
  const g = new THREE.Group(); const r = e.radius || 9;
  const m = new THREE.MeshStandardMaterial({ color: 0x4b4f58, metalness: 0.6, roughness: 0.5 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(r * 2.4, r * 0.5, r * 1.1), m));
  const fin = new THREE.Mesh(new THREE.BoxGeometry(r * 0.8, r * 0.3, r * 1.8), m); fin.position.set(-r * 0.5, 0, 0); g.add(fin); return g;
}
function buildView(e) {
  if (e.data?.rubricPart === 'body' || e.data?.rubricPart === 'mark') return buildRubricVisual(e);
  if (e.type !== 'wreck') return null;
  let v = null;
  try { v = factory?.build(e) || null; } catch (err) { console.warn('wreck build failed', err); }
  const wrapper = new THREE.Group(); wrapper.add(v || placeholderHulk(e)); return wrapper;
}
function disposeView(root) {
  if (root.userData?.rubric) { disposeRubricVisual(root); return; }
  root.removeFromParent();
}
function disposeViews() { for (const r of views.values()) disposeView(r); views.clear(); }
async function reset() {
  if (busy) return; busy = true;
  f?.destroy(); disposeViews();
  f = createRubricFixture(); await f.enablePhysics();
  f.bus.on('rubric:voice', p => { $('line').textContent = p.text; });
  f.bus.on('audio:cue', p => {
    if (!audio || !$('sound').checked) return;
    const recipe = RUBRIC_AUDIO_RECIPES.find(r => r.id === p.id);
    if (recipe) voices.push(playRecipe(audio, recipe, audio.destination, { peakGain: 0.45 }, audioCache));
  });
  $('line').textContent = 'Scan to read its work. Nothing here attacks.';
  acc = 0; busy = false; syncViews();
}
function nearestWreck(maxD = 140) {
  let best = null, bd = maxD;
  for (const e of f.state.entityList) {
    if (!e.alive || e.type !== 'wreck') continue;
    const d = Math.hypot(e.pos.x - f.player.pos.x, e.pos.z - f.player.pos.z);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
const activeLine = () => Object.values(f.state.combat.attachments.byId).find(a => a.state === 'active' && a.ownerId === f.player.id);
function grip() {
  if (!f || busy) return;
  if (activeLine()) { f.cut(); return; }
  const target = nearestWreck();
  if (!target) { $('line').textContent = 'Fly within 140 units of a hull, then press M to put a line on it.'; return; }
  const r = f.grip(target);
  if (!r.ok) $('line').textContent = `Massline could not latch: ${r.reason}.`;
}
function wreckYouMade() {
  if (!f) return;
  const n = f.state.entityList.filter(e => e.data?.markerId?.startsWith('aft_bench')).length;
  f.addWreck({ x: O.x + 90 - n * 22, z: O.z - 60 - n * 18, vx: -9, vz: 5, spin: 0.9, mass: 55, radius: 8, markerId: `aft_bench_${n}`,
    killerId: f.player.id, label: ['Reaver Pirate', 'MTS Hauler', 'Wasp Swarmer'][n % 3], t: f.state.simTime - 140 });
  $('line').textContent = 'A hull you made is drifting past the line. Rubric will not mark it while it moves.';
}
function hurtMarker() { const b = f?.system._body(); if (b) f.damage(b, 22); }
function force(mode) {
  const s = f.system, m = f.state.rubric;
  if (mode === 'dark') { m.last = 'done'; s._mode = 'dark'; } else { if (m.last === 'done') m.last = ''; s._mode = mode; }
  if (mode === 'offer') m.last = 'offered';
  if (mode === 'flee') s._fleeUntil = f.state.simTime + 30;
  if (mode !== 'flee') s._fleeUntil = 0;
  if (mode === 'work' && !s._targetEntity()) { s._target = { id: s._hull().id, key: 'f41' }; s._mode = 'work'; }
  s._publish();
}
function setSkin(name) {
  const m = f.state.rubric;
  m.wronged = name === 'scarred' ? 1 : 0; m.witness = name === 'primer' ? 0 : 4; if (name === 'memorial') { m.last = 'done'; f.system._mode = 'dark'; }
  else if (m.last === 'done') { m.last = ''; f.system._mode = 'idle'; }
  f.system._publish();
}
function syncViews() {
  if (!f) return;
  for (const [id, root] of views) if (!f.state.entities.get(id)?.alive) { disposeView(root); views.delete(id); }
  for (const e of f.state.entityList) {
    if (!e.alive || (e.type !== 'wreck' && !e.data?.rubricPart)) continue;
    let root = views.get(e.id);
    if (!root) { root = buildView(e); if (!root) continue; root.userData.entityId = e.id; views.set(e.id, root); scene.add(root); }
    root.position.set(e.pos.x - O.x, 0, e.pos.z - O.z); root.rotation.y = -(e.rot || 0);
    root.userData.updateAuthoredMotion?.(e, f.state.simTime, a11y());
  }
  pilot.visible = !!f.player.alive && !study; pilot.position.set(f.player.pos.x - O.x, 1, f.player.pos.z - O.z);
  if (Math.hypot(f.player.vel.x, f.player.vel.z) > 1) pilot.rotation.y = Math.atan2(f.player.vel.x, f.player.vel.z);
  const line = activeLine(); link.visible = !!line && !study;
  if (line) { const e = f.state.entities.get(line.targetId), p = linkG.attributes.position;
    if (e) { p.setXYZ(0, f.player.pos.x - O.x, 1, f.player.pos.z - O.z); p.setXYZ(1, e.pos.x - O.x, 1, e.pos.z - O.z); p.needsUpdate = true; } }
  const m = f.state.rubric, s = f.system, t = s._targetEntity();
  $('phase').textContent = f.state.timeScale === 0 ? 'PAUSED' : m.destroyed ? 'LOST' : s._mode.toUpperCase();
  $('marks').textContent = `${m.witness} MARKS`; $('paint').textContent = `RED LEAD ${Math.round(m.paint * 100)}`;
  $('speed').textContent = t ? `HULL ${Math.hypot(t.vel.x, t.vel.z).toFixed(1)} u/s · TURN ${Math.abs(t.angVel || 0).toFixed(2)}` : 'HULL —';
  $('target').textContent = `TARGET / ${t ? (s._target.key === 'f41' ? 'F-41' : s._targetLabel()) : 'NONE'} · ${Math.round((s._paintT / C.paintSeconds) * 100)}% MARKED`;
}
function positionCamera() {
  const b = f?.system._body(); let cx = b ? b.pos.x - O.x : 0, cz = b ? b.pos.z - O.z : 0, span = 0;
  const t = f?.system._targetEntity?.();
  if (study && b && t && f.system._mode === 'work') { const tx = t.pos.x - O.x, tz = t.pos.z - O.z; span = Math.hypot(tx - cx, tz - cz); cx = (cx + tx) / 2; cz = (cz + tz) / 2; }
  const fit = innerWidth < 700 ? Math.max(1, (study ? 1.4 : 0.9) / (innerWidth / innerHeight)) : 1;
  if (study) { const k = 1 + span / 26; camera.position.set(cx + 24 * fit * k, 30 * fit * k, cz + 34 * fit * k); camera.lookAt(cx, 4.5, cz); }
  else { camera.position.set(cx + 10 * fit, 210 * fit, cz + 150 * fit); camera.lookAt(cx + 10, 0, cz + 10); }
}
function setStudy(value) { study = value; document.body.classList.toggle('study', value); $('study').setAttribute('aria-pressed', String(value)); positionCamera(); }
function pause() { if (!f) return; f.state.timeScale = f.state.timeScale ? 0 : 1; $('pause').textContent = f.state.timeScale ? 'Pause' : 'Resume'; $('pause').setAttribute('aria-pressed', String(!f.state.timeScale)); }
$('hail').onclick = () => f?.scan(); $('grip').onclick = grip; $('kill').onclick = wreckYouMade; $('hurt').onclick = hurtMarker;
$('reset').onclick = reset; $('pause').onclick = pause; $('study').onclick = () => setStudy(!study);
for (const b of document.querySelectorAll('[data-force]')) b.onclick = () => f && force(b.dataset.force);
for (const b of document.querySelectorAll('[data-skin]')) b.onclick = () => f && setSkin(b.dataset.skin);
$('sound').onchange = async () => { if ($('sound').checked) { audio ||= new AudioContext(); await audio.resume(); } else for (const v of voices) disposeVoice(v); };
window.addEventListener('keydown', e => {
  if (e.target.matches('input')) return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyC', 'KeyM', 'KeyP'].includes(e.code)) e.preventDefault();
  keys.add(e.code); if (e.repeat) return;
  if (e.code === 'KeyC') f?.scan(); if (e.code === 'KeyM') grip(); if (e.code === 'KeyP') pause();
});
window.addEventListener('keyup', e => keys.delete(e.code)); window.addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => { keys.clear(); if (document.hidden && f?.state.timeScale) pause(); last = performance.now(); acc = 0; });
function resize() { renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); positionCamera(); }
window.addEventListener('resize', resize); resize();
function tick(t) {
  requestAnimationFrame(tick); const elapsed = Math.min(0.1, (t - last) / 1000); last = t;
  if (f && !busy) {
    if (f.state.timeScale && f.player.alive) {
      acc += elapsed; let steps = 0;
      while (acc >= 1 / 60 && steps++ < 8) {
        if (!study) f.thrust((keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
          (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0));
        f.step(); acc -= 1 / 60;
      }
    } else acc = 0;
    syncViews(); if (study) positionCamera();
  }
  composer.render();
  if (audio) voices = voices.filter(v => { if (v.stopAt < audio.currentTime) { disposeVoice(v); return false; } return true; });
  if (++frame % 30 === 0) $('diagnostic').textContent = `PRODUCTION RUBRIC + Rapier · ${views.size} bodies drawn · isolated encounter bench, not the full world`;
}
window.__rubricLab = {
  get fixture() { return f; }, get errors() { return errors; }, get views() { return views; }, setStudy, force, setSkin, wreckYouMade, hurtMarker, grip,
  render() { syncViews(); if (study) positionCamera(); composer.render(); }, pause, camera, scene, reset,
  stats() { let triangles = 0, meshes = 0; for (const root of views.values()) root.traverse(o => { if (o.isMesh) { meshes++; triangles += (o.geometry.index?.count ?? o.geometry.attributes.position?.count ?? 0) / 3; } });
    return { meshes, triangles, mode: f?.system._mode, errors: [...errors], webgl: renderer.capabilities.isWebGL2, factory: !!factory }; },
};
window.addEventListener('pagehide', () => { f?.destroy(); disposeViews(); for (const v of voices) disposeVoice(v); audio?.close(); env.dispose(); composer.dispose(); renderer.dispose(); });
try { await reset(); window.__rubricReady = true; requestAnimationFrame(tick); }
catch (e) { $('error').hidden = false; $('error').textContent = String(e.stack || e); throw e; }
