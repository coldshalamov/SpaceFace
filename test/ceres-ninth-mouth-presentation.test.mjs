import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Dependency doubles test the adapters' public contract, not GPU appearance or the
// canonical pose service. Runtime screenshots remain a separate acceptance requirement.
async function loadAdapter(path, replacements) {
  let source = await readFile(new URL(path, import.meta.url), 'utf8');
  for (const [original, replacement] of replacements) source = source.replace(original, replacement);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const promptModule = await loadAdapter('../src/ui/ceresNinthMouthPrompt.js', [
  ["import { resolveActionLabel } from '../systems/input.js';", "const resolveActionLabel=()=>'';"],
  ["import { getPromptDevice, gamepadGlyphForAction } from './bindings.js';", "const getPromptDevice=()=> 'touch', gamepadGlyphForAction=()=>'';"],
[
  "import { getPromptDeck } from './promptDeck.js';",
  'const getPromptDeck = () => globalThis.__ninthMouthTestDeck;',
]]);
const renderModule = await loadAdapter('../src/render/ceresNinthMouthVisuals.js', [
  ["import * as THREE from 'three';", `const THREE = {Vector3: class {set(x,y,z){Object.assign(this,{x,y,z});return this;}}};`],
  ["import { nocturneForScene, createLogicalLight, emptyLogicalLight } from './nocturne/bridge.js';", `
    const nocturneForScene = scene => {scene.sources=scene.logical;scene.capacity=512;scene.get=name=>scene.logical.find(l=>l.name===name)?._nocturneSource;return {registry:scene};};
    const emptyLogicalLight = () => ({intensity:0,position:{set(x,y,z){Object.assign(this,{x,y,z});}}});
    function createLogicalLight(scene,id,type,options) {
      const source={registered:true};
      const light = {...emptyLogicalLight(),...options,name:id,_nocturneSource:source,distance:options.range,dispose(){this.disposed=true;source.registered=false;scene.logical.splice(scene.logical.indexOf(this),1);}};
      scene.get = name => scene.logical.find(l=>l.name===name)?._nocturneSource;
      scene.logical.push(light);return light;
    }`],
  ["import { claimShadeRegion } from './nocturne/shadeRegions.js';", `const claimShadeRegion = () => ({update(){},release(){}});`],
  ["import { CERES_NINTH_MOUTH as CUT } from '../data/ceresNinthMouth.js';", `const CUT = {id:'lw_ceres_ninth_mouth',center:{x:0,z:0},shade:{local:{x:2.5,z:0}},definitions:[{role:'shoulder_north',local:{x:0,z:-125},rot:0},{role:'shoulder_south',local:{x:0,z:125},rot:0}],worldPoint:p=>p};`],
  ["import { presentedAnchorXZ } from './presentedAnchor.js';", `function presentedAnchorXZ(e, a, out) {
    const p = e.prevPos || e.pos;
    out.x = p.x + (e.pos.x - p.x) * a;
    out.z = p.z + (e.pos.z - p.z) * a;
  }`],
  ["import { readFrameOrigin } from './frameCoordinates.js';", `function readFrameOrigin(s, out) {
    out.x = s.world?.frameOrigin?.x || 0; out.z = s.world?.frameOrigin?.z || 0;
  }`],
]);
function promptFixture() {
  const player = { id: 9, alive: true, hull: 100, occupantGeneration: 2 };
  const offer = { id: 'ninth:1', headline: 'One barge missing', detail: 'Bring a lamp to the rescue route.',
    playerLife: 2, choices: [{ id: 'carry', label: 'Carry lamp' }, { id: 'locked', disabled: true }, { id: 'close', label: 'Later' }] };
  const state = { mode: 'flight', playerId: 9, entities: new Map([[9, player]]), ceresNinthMouthOffer: offer };
  const handlers = new Map(), emitted = [];
  const bus = { on(k, f) { handlers.set(k, f); return () => handlers.delete(k); }, emit(...args) { emitted.push(args); } };
  const deck = { count: 0, spec: null, offerDecision(s) { this.spec = s; this.count++; },
    updateDecision(s, spec) { this.spec = spec; this.count++; }, resolveDecision() { this.spec = null; },
    hasDecision() { return !!this.spec; } };
  globalThis.__ninthMouthTestDeck = deck;
  const adapter = promptModule.createCeresNinthMouthPrompt({ state, bus });
  return { state, player, offer, handlers, emitted, deck, adapter };
}
test('prompt uses existing text deck, disabled guard, exactly one intent and no state writes', () => {
  const f = promptFixture(), before = JSON.stringify(f.state);
  f.adapter.frame();
  const spec = f.deck.spec;
  assert.equal(spec.sender, 'DESSA KROLL · NINTH MOUTH');
  assert.equal(spec.headline, 'One barge missing');
  assert.equal(spec.choices[2].cancel, true);
  assert.equal(spec.onChoose('locked'), false);
  assert.equal(spec.onChoose('missing'), false);
  assert.equal(spec.onChoose('carry'), true);
  assert.equal(spec.onChoose('carry'), false);
  f.adapter.frame();
  assert.equal(f.deck.count, 1);
  assert.deepEqual(f.emitted, [['ceresNinthMouth:action', { offerId: 'ninth:1', action: 'carry', playerLife: 2 }]]);
  assert.equal(JSON.stringify(f.state), before);
  f.adapter.destroy();
});
test('cancel and lifecycle closure suppress reopening; new offer remains reachable', () => {
  const f = promptFixture(); f.adapter.frame();
  assert.equal(f.deck.spec.onChoose('close'), true);
  f.adapter.frame(); assert.equal(f.deck.spec, null);
  f.state.ceresNinthMouthOffer = { ...f.offer, id: 'ninth:2' };
  f.adapter.frame(); const stale = f.deck.spec;
  f.handlers.get('save:restoring')();
  assert.equal(stale.onChoose('carry'), false);
  f.adapter.frame(); assert.equal(f.deck.spec, null);
  f.adapter.destroy(); f.adapter.destroy();
  assert.equal(f.handlers.size, 0);
  f.state.ceresNinthMouthOffer = { ...f.offer, id: 'ninth:3' };
  f.adapter.frame(); assert.equal(f.deck.spec, null);
});
test('stale callbacks reject replacement offers, player identity/life, death and dock state', () => {
  for (const change of [
    f => { f.state.ceresNinthMouthOffer = { ...f.offer }; },
    f => { f.state.entities.set(9, { ...f.player }); },
    f => { f.player.occupantGeneration++; },
    f => { f.player.hull = 0; },
    f => { f.state.ui = { docked: true }; },
    f => { f.state.mode = 'station'; },
  ]) {
    const f = promptFixture(); f.adapter.frame(); const old = f.deck.spec;
    change(f); assert.equal(old.onChoose('carry'), false); assert.equal(f.emitted.length, 0); f.adapter.destroy();
  }
});
test('missing deck retries; dead/stale player never opens an offer', () => {
  const f = promptFixture(); globalThis.__ninthMouthTestDeck = null;
  f.adapter.frame(); globalThis.__ninthMouthTestDeck = f.deck;
  f.adapter.frame(); assert.ok(f.deck.spec); f.adapter.destroy();
  const g = promptFixture(); g.player.occupantGeneration++;
  g.adapter.frame(); assert.equal(g.deck.spec, null); g.adapter.destroy();
});
function lamp(id, slot) {
  return { id, occupantGeneration: 1, alive: true, hull: 40,
    pos: {x: 1020 + slot * 10, z: 2040}, prevPos: {x: 1000 + slot * 10, z: 2020},
    data: { ninthMouthRole: `lamp:${slot}`, ninthMouthIdentity: `lw_ceres_ninth_mouth:lamp:${slot}`, ninthMouthLight: true } };
}
function visualFixture() {
  const lamps = [lamp(1, 0), lamp(2, 1), lamp(3, 2)];
  const state = { entityList: lamps, entities: new Map(lamps.map(e => [e.id, e])), world: {frameOrigin: {x: 1000, z: 2000}} };
  const scene = { children: [], logical: [], add(light) { this.children.push(light); }, remove(light) { this.children.splice(this.children.indexOf(light), 1); } };
  const adapter = renderModule.createCeresNinthMouthVisuals({state, scene});
  adapter.update(0);
  return {lamps, state, scene, adapter};
}
test('three logical warm light requests follow interpolated physical lamps and origin without state writes', () => {
  const f = visualFixture(), before = JSON.stringify(f.state), lights = [...f.scene.logical];
  f.adapter.update(0.5);
  assert.equal(lights.length, 3);
  assert.deepEqual([lights[0].position.x, lights[0].position.y, lights[0].position.z], [10, 3, 30]);
  for (const light of lights) {
    assert.equal(light.color, 0xffd2a0); assert.equal(light.castShadow, false);
    assert.equal(light.distance, 95); assert.equal(light.intensity, 1800);
  }
  assert.equal(JSON.stringify(f.state), before);
  f.lamps[0].pos.x += 20; f.state.world.frameOrigin.x += 5;
  f.adapter.update(1); assert.equal(lights[0].position.x, 35);
  assert.deepEqual(f.scene.logical, lights);
  f.adapter.destroy(); f.adapter.destroy(); assert.equal(f.scene.logical.length, 0);
  f.adapter.update(); assert.equal(f.scene.logical.length, 0); assert.ok(lights.every(l => l.disposed));
});
test('light guard rejects dead, stale, foreign, duplicate and disabled bodies; recycled life rebinds', () => {
  for (const change of [
    f => { f.lamps[0].hull = 0; }, f => { f.lamps[0].alive = false; },
    f => { f.state.entities.delete(1); }, f => { f.lamps[0].data.ninthMouthLight = false; },
    f => { f.lamps[0].data.ninthMouthIdentity = 'foreign'; },
    f => { f.lamps[0].occupantGeneration = undefined; },
    f => { f.lamps[0].pos.x = NaN; },
    f => { const duplicate = lamp(4, 0); f.lamps.push(duplicate); f.state.entities.set(4, duplicate); },
  ]) {
    const f = visualFixture(); change(f); f.adapter.update();
    assert.equal(f.scene.logical[0].intensity, 0); assert.equal(f.scene.logical[0].userData.entityId, null); f.adapter.destroy();
  }
  const f = visualFixture(); f.adapter.update();
  const fresh = lamp(1, 0); fresh.occupantGeneration = 2; fresh.pos.x += 60;
  f.state.entities.set(1, fresh); f.adapter.update(); assert.equal(f.scene.logical[0].intensity, 0);
  f.lamps[0] = fresh; f.adapter.update();
  assert.equal(f.scene.logical[0].userData.occupantGeneration, 2);
  assert.equal(f.scene.logical[0].position.x, 80); f.adapter.destroy();
});
test('bound renderer mesh pose wins without double origin; pending/recycled mesh is unlit', () => {
  const f = visualFixture();
  const mesh = { visible: true, position: {x: 7, y: 2, z: 9},
    userData: {presentationEntityId: 1, presentationOccupantGeneration: 1} };
  f.state.render = {meshes: new Map([[1, mesh]])};
  f.adapter.update(0.5);
  const light = f.scene.logical[0];
  assert.deepEqual([light.position.x, light.position.y, light.position.z], [7, 5, 9]);
  assert.equal(light.intensity, 1800);
  f.lamps[0].occupantGeneration = 2;
  f.adapter.update(); assert.equal(light.intensity, 0);
  mesh.userData.presentationOccupantGeneration = 2;
  f.adapter.update(); assert.equal(light.intensity, 1800);
  mesh.visible = false; f.adapter.update(); assert.equal(light.intensity, 0);
  f.adapter.destroy();
});
test('in-place domain mirror updates refresh the deck and revoke previous callbacks', () => {
  const f = promptFixture(); f.adapter.frame(); const old = f.deck.spec;
  f.offer.id = 'ninth:2'; f.offer.headline = 'Tow to the receiving apron';
  assert.equal(old.onChoose('carry'), false);
  f.adapter.frame(); assert.equal(f.deck.count, 2);
  assert.equal(f.deck.spec.headline, 'Tow to the receiving apron');
  assert.equal(old.onChoose('carry'), false);
  assert.equal(f.deck.spec.onChoose('carry'), true);
  assert.equal(f.emitted[0][1].offerId, 'ninth:2');
  f.adapter.destroy();
});
test('four service-location HUD marks project authored coordinates, hide offscreen and clean up', () => {
  const root = {children: [], appendChild(n) { this.children.push(n); } };
  const previous = globalThis.document;
  globalThis.document = {getElementById(id) { return id === 'hud' ? root : null; }, createElement() {
    const label = {textContent: ''};
    const node = {style: {}, dataset: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; },
      querySelector() {return label;}, remove() {root.children.splice(root.children.indexOf(this), 1);} };
    return node;
  }};
  try {
    const state = { mode: 'flight' }, projected = [];
    const helpers = {worldToScreen(world, out) {
      projected.push({...world}); Object.assign(out, {x: world.x, y: world.z, onScreen: world.x > 0}); return out;
    }};
    const marks = promptModule.createNinthMouthServiceMarks({state, helpers});
    const serviceMarks = [0, 1, 2, 3, 4].map(i => ({id: `mark:${i}`, label: i === 3 ? 'Receiving apron' : `Light ${i + 1}`, pos: {x: 30+i, z: 50+i}, radius: 12}));
    marks.update({serviceMarks}); assert.equal(root.children.length, 4); assert.equal(projected.length, 4);
    assert.deepEqual(projected[0], {x: 30, y: 0, z: 50});
    assert.equal(root.children[3].querySelector().textContent, 'SERVICE MARK · Receiving apron');
    assert.equal(root.children[0].style.transform, 'translate3d(30px,50px,0)');
    serviceMarks[0].pos.x = -1; marks.update({serviceMarks}); assert.equal(root.children[0].style.display, 'none');
    state.ui = {docked: true}; marks.update({serviceMarks}); assert.ok(root.children.every(n => n.style.display === 'none'));
    state.ui.docked = false; marks.update({serviceMarks: []}); assert.ok(root.children.every(n => n.style.display === 'none'));
    marks.destroy(); marks.destroy(); assert.equal(root.children.length, 0);
  } finally { globalThis.document = previous; }
});
