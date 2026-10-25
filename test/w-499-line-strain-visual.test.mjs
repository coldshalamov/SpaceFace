import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { normalizeLineProgression } from '../src/data/lineProgression.js';
import { lineProgression } from '../src/systems/lineProgression.js';
import { createBus } from '../src/core/eventBus.js';
import { readLineVisualProfile } from '../src/render/lineVisualProfile.js';
import { createLineHardware } from '../src/render/lineHardware.js';
import { createLineStrainReadout, lineStrainWords } from '../src/ui/lineStrainReadout.js';
import { vfx } from '../src/render/vfx.js';

function docFixture() {
  const doc = { documentElement: { clientWidth: 960, clientHeight: 540 }, getElementById() { return null; } };
  doc.createElement = () => ({ ownerDocument: doc, style: {}, dataset: {}, children: [], attrs: {},
    appendChild(node) { this.children.push(node); node.parentNode = this; },
    setAttribute(k, v) { this.attrs[k] = v; }, remove() { this.parentNode?.children.splice(this.parentNode.children.indexOf(this), 1); },
  });
  doc.head = doc.createElement();
  return { doc, host: doc.createElement() };
}

function fixture() {
  const target = { id: 2, mass: 500, alive: true, pos: { x: 100, z: 0 } };
  const player = { id: 1, mass: 20, alive: true, radius: 8, pos: { x: 0, z: 0 }, view: { root: new THREE.Group() } };
  const state = { mode: 'flight', simTime: 0, ui: {}, playerId: 1, player: { tether: { active: true, targetId: 2 } },
    entities: new Map([[1, player], [2, target]]), render: {}, lineProgression: normalizeLineProgression(null) };
  const bus = createBus(), cuts = [];
  const attachments = { listForEntity: () => [{ id: 'held', state: 'active', targetId: 2 }],
    cut(...args) { cuts.push(args); bus.emit('tether:broken', { targetId: 2, ownerId: 1, reason: args[2] }); } };
  const system = Object.create(lineProgression);
  system.init({ state, bus, registry: { get: key => key === 'combat' ? { ensureKernel: () => ({ attachments }) } : null } });
  bus.emit('tether:latched', { targetId: 2 });
  return { state, player, target, bus, system, cuts };
}

test('over-class heat from the real owner drives the ship instrument and a visible winch material', async t => {
  const f = fixture(), { host } = docFixture(), view = createLineStrainReadout(host);
  const part = { primitives: [{ name: 'LOD0_drum', geometry: new THREE.BoxGeometry(1, 1, 1),
    material: new THREE.MeshStandardMaterial(), matrix: new THREE.Matrix4() }] };
  t.after(() => { part.primitives[0].geometry.dispose(); part.primitives[0].material.dispose(); });
  const rig = createLineHardware(f.state, { loadPart: async () => part }); await rig.ready;
  t.after(() => { rig.dispose(); view.destroy(); });
  f.system.update(0, f.state); rig.update(f.player);
  const material = rig.root.children[0].children[0].children[0].material;
  const cool = material.emissive.clone(), initialIntensity = material.emissiveIntensity;
  f.state.simTime = 4; f.system.update(4, f.state);
  const heat = f.state.lineProgression.winchHeat;
  assert.ok(heat > .6 && heat < 1);
  assert.ok(f.state.lineProgression.overClassReelFactor < 1 && f.state.lineProgression.overClassTurnFactor < 1);
  const before = JSON.stringify(f.state.lineProgression);
  rig.update(f.player);
  assert.ok(Math.hypot(material.emissive.r - cool.r, material.emissive.g - cool.g, material.emissive.b - cool.b) > .1);
  assert.ok(material.emissiveIntensity > initialIntensity);
  view.update(f.state, f.player, p => ({ x: 480 + p.x * 4, y: 270, onScreen: true }));
  assert.equal(view.root.hidden, false);
  assert.equal(view.root.dataset.over, 'true');
  assert.equal(view.root.children[0].textContent, 'LINE I · 500 T / 20 T');
  assert.match(view.root.children[1].textContent, /OVER CLASS · WINCH 64%/);
  assert.match(view.root.attrs['aria-label'], /500 T/);
  assert.equal(view.root.attrs['aria-valuenow'], '64');
  assert.match(view.root.style.transform, /530px,290px/);
  assert.equal(JSON.stringify(f.state.lineProgression), before, 'all visual readers leave the sim owner untouched');
});

test('real sustained heat reaches the ordinary break receipt; ship readout cools and retires on dock', () => {
  const f = fixture(), broken = [];
  f.bus.on('tether:broken', payload => broken.push(payload));
  for (let tick = 0; tick < 600 && !f.cuts.length; tick++) {
    f.state.simTime += 1 / 60; f.system.update(1 / 60, f.state);
  }
  assert.equal(f.cuts.length, 1);
  assert.equal(broken[0].reason, 'line_overclass_snap');
  f.state.player.tether.active = false;
  f.state.lineProgression.winchHeat = .4;
  const { host } = docFixture(), view = createLineStrainReadout(host);
  view.update(f.state, f.player, () => ({ x: 940, y: 520 }));
  assert.equal(view.root.hidden, false);
  assert.match(view.root.children[1].textContent, /COOLING/);
  assert.match(view.root.style.transform, /724px,470px/);
  f.state.ui.docked = true; view.update(f.state, f.player, () => ({ x: 480, y: 270 }));
  assert.equal(view.root.hidden, true);
  view.destroy(); assert.equal(host.children.length, 0);
});

test('cold within-class tow and arcade routes never borrow permanent over-class warnings', () => {
  const f = fixture(); f.target.mass = 10;
  f.bus.emit('tether:released', { targetId: 2 }); f.bus.emit('tether:latched', { targetId: 2 });
  f.system.update(5, f.state);
  const line = readLineVisualProfile(f.state);
  assert.equal(line.overClass, false); assert.equal(line.heat, 0);
  assert.match(lineStrainWords(f.state, line, f.target).detail, /WITHIN CLASS/);
  f.state.lineProgression.classIndex = 8; f.state.lineProgression.winchHeat = 1; f.state.lineProgression.overClass = true;
  f.state.run = { kind: 'survival', phase: 'running' };
  const arcade = readLineVisualProfile(f.state);
  assert.equal(arcade.classIndex, 1); assert.equal(arcade.heat, 0); assert.equal(arcade.overClass, false);
});

test('actual cable owner transports saved heat into its coloured sheath material and coverage', () => {
  const f = fixture();
  Object.assign(f.player, { rot: 0, vel: { x: 0, z: 0 } });
  Object.assign(f.target, { type: 'asteroid', radius: 10, rot: 0, vel: { x: 0, z: 0 } });
  Object.assign(f.state.player.tether, { attachmentId: 'held', phase: 'loaded', load: .55, restLength: 100, strain: .0001 });
  const owner = Object.create(vfx);
  Object.assign(owner, { state: f.state, _scene: new THREE.Scene(), helpers: { player: () => f.player },
    _ctmp: new THREE.Color(), _spawnLocalXZ: {}, _entityLocalXZ: {},
    _toLocalXZ: (x, z, out = {}) => Object.assign(out, { x, z }), _ent: id => f.state.entities.get(id),
    _renderInterpolationAlpha: () => 1, _bloomRadianceScale: () => 1,
  });
  owner._initTetherCable();
  const cable = owner._tetherCable;
  Object.assign(cable, { wasActive: true, lastSourceId: 1, lastTargetId: 2, lastAttachmentId: 'held', lastRemote: false,
    fade: 1, latchAge: 999, snapAge: 999, loadSmooth: .55 });
  owner._updateTetherCable(1 / 60);
  const cold = cable.glow.material.uniforms.uColor.value.clone(), width = cable.profile.sheathHalfWidth;
  f.state.lineProgression.winchHeat = .82;
  owner._updateTetherCable(1 / 60);
  const hot = cable.glow.material.uniforms.uColor.value;
  assert.ok(hot.r > hot.g * 3 && hot.r > hot.b * 3, 'actual shader receives saturated hot red');
  assert.ok(hot.g < .04 && hot.b < .01, 'HDR sheath retains red rather than clipping pink into white');
  assert.ok(hot.g < cold.g, 'heat cannot remain at the cold load colour');
  assert.ok(cable.profile.sheathHalfWidth > width * 2, 'the coloured heat remains wider than a subpixel filament');
});

test('fresh-system Continue resumes heat and the snap only from the live player-owned attachment', () => {
  for (const kind of ['owned', 'foreign', 'broken', 'stale']) {
    const player = { id: 1, alive: true }, target = { id: 2, alive: true, mass: 500 };
    const state = { simTime: 50, playerId: 1, entities: new Map([[1, player], [2, target]]),
      player: { tether: { active: true, attachmentId: 'saved-link', targetId: 2 } } };
    const bus = createBus(), cuts = [];
    const attachment = { id: kind === 'stale' ? 'another-link' : 'saved-link',
      ownerId: kind === 'foreign' ? 8 : 1, targetId: 2, state: kind === 'broken' ? 'broken' : 'active' };
    const attachments = { listForEntity: () => [attachment], cut: (...args) => cuts.push(args) };
    const system = Object.create(lineProgression);
    system.init({ state, bus, registry: { get: key => key === 'combat' ? { ensureKernel: () => ({ attachments }) } : null } });
    system.deserialize({ data: { tonnageLoggedT: 0, highestHeldMassT: 500, winchHeat: .8 } });
    bus.emit('save:loaded');
    system.update(1, state);
    assert.equal(state.lineProgression.overClass, kind === 'owned');
    if (kind === 'owned') {
      assert.ok(state.lineProgression.winchHeat > .8, 'a cold system continues the saved hot tow');
      for (let i = 0; i < 240 && !cuts.length; i++) { state.simTime += 1 / 60; system.update(1 / 60, state); }
      assert.equal(cuts.length, 1); assert.equal(cuts[0][0], 'saved-link');
    } else { assert.ok(state.lineProgression.winchHeat < .8); assert.equal(cuts.length, 0); }
  }
});
