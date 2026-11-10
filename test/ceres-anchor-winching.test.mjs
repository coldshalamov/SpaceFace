import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { initialRecoveryWire, restore } from './ceres-reacquire-harness.mjs';
import { CERES_WORKFLEET_CONTRACT as C } from '../src/data/ceresWorkfleet.js';
import { CERES_WINCH_MODE, isCeresWinchAnchor, ceresWinchPoint } from '../src/data/ceresAnchorWinching.js';
import { serializeCeresAnchorSwing, restoreCeresAnchorSwing, installCeresAnchorWinching, stepCeresAnchorWinching } from '../src/systems/ceresAnchorWinching.js';

const featureSnapshot = snapshotFeatureMaps();
test.before(() => applyFeatureConfigToMaps(PRODUCTION_FEATURES));
test.after(() => restoreFeatureMaps(featureSnapshot));

async function setup(x = -80, z = -165) {
  const wire = initialRecoveryWire();
  wire.jobs.ceresWorkfleet.phase = 'player-retained';
  wire.combat.attachments.byId = {};
  wire.sites.worldById[C.siteId].payloads.long_plate.motion = {
    pos: { x: C.sitePlacement.pos.x + x, z: C.sitePlacement.pos.z + z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
  };
  const h = await restore(wire, { playerPosition: { x: C.sitePlacement.pos.x + 80, z: C.sitePlacement.pos.z - 240 } });
  h.state.mode = 'flight';
  for (let i = 0; i < 30; i++) h.sim.step();
  const p = h.state.entities.get(h.state.playerId);
  const playerLine = h.service.create({ defId: 'tether_standard', ownerId: p.id, targetId: h.b.section.id,
    sourceWorld: p.pos, targetWorld: h.b.section.pos });
  assert.equal(playerLine.ok, true, playerLine.reason);
  for (let i = 0; i < 20; i++) h.sim.step();
  return h;
}
function choose(h, action) {
  const offer = h.state.ceresWinchingOffer;
  assert.ok(offer, 'ordinary nearby winch offer');
  const selected = offer.choices.find(c => c.id === action);
  assert.ok(selected && !selected.disabled, `${action} available: ${JSON.stringify(offer)}`);
  h.sim.bus.emit('ceresWinching:action', { action, offerId: offer.id, playerLife: offer.playerLife });
  return offer;
}

test('borrow fixed winch, physically reel original plate, hold and cast off without pose correction', async () => {
  const h = await setup();
  try {
    assert.equal(h.state.entityList.filter(e => isCeresWinchAnchor(e)).length, 3);
    choose(h, 'anchor:0');
    const r = h.state.npcJobs.ceresAnchorSwing, line = h.service.get(r.lineId);
    assert.equal(line.controlMode, CERES_WINCH_MODE);
    assert.equal(line.targetId, h.b.section.id);
    assert.equal(h.b.section.mass, 1800);
    const before = { ...h.b.section.pos }, length = line.restLength;
    choose(h, 'in');
    for (let i = 0; i < 180; i++) h.sim.step();
    assert.ok(line.restLength < length - 5, 'real drum shortened');
    assert.ok(h.b.section.pos.z < before.z - 2, 'native original moved out of cut');
    choose(h, 'hold');
    const held = line.restLength;
    for (let i = 0; i < 30; i++) h.sim.step();
    assert.equal(line.restLength, held);
    const motion = JSON.stringify([h.b.section.pos, h.b.section.vel, h.b.section.rot, h.b.section.angVel]);
    choose(h, 'release');
    assert.equal(line.state, 'broken');
    assert.equal(JSON.stringify([h.b.section.pos, h.b.section.vel, h.b.section.rot, h.b.section.angVel]), motion);
    assert.equal(r.status, 'released');
  } finally { h.close(); }
});

test('transfer uses the same constraint and preserves exact momentum; stale and duplicate buttons cannot act', async () => {
  const h = await setup(-200, -365);
  try {
    const stale = choose(h, 'anchor:0');
    const row = h.state.npcJobs.ceresAnchorSwing, line = h.service.get(row.lineId);
    choose(h, 'anchors');
    const motion = JSON.stringify([h.b.section.pos, h.b.section.vel, h.b.section.rot, h.b.section.angVel]);
    choose(h, 'anchor:1');
    assert.equal(h.service.get(row.lineId), line);
    assert.equal(row.anchorIndex, 1);
    assert.equal(JSON.stringify([h.b.section.pos, h.b.section.vel, h.b.section.rot, h.b.section.angVel]), motion);
    h.sim.bus.emit('ceresWinching:action', {action: 'anchor:0', offerId: stale.id, playerLife: stale.playerLife});
    assert.equal(row.anchorIndex, 1);
    const serialized = serializeCeresAnchorSwing(h.owner);
    assert.equal(serialized.lineId, line.id);
    assert.equal(restoreCeresAnchorSwing({...serialized, command: 'in'}).command, 'hold');
  } finally { h.close(); }
});

test('ordinary handover is not stolen, repeated ticks do not mint anchors and leaving attendance holds the winch', async () => {
  const h = await setup();
  try {
    choose(h, 'anchor:0'); choose(h, 'in');
    const row = h.state.npcJobs.ceresAnchorSwing, line = h.service.get(row.lineId);
    h.state.ui.docked = true;
    h.sim.bus.emit('dock:docked', {});
    for (let i = 0; i < 30; i++) h.sim.step();
    assert.equal(row.command, 'hold');
    assert.equal(line.state, 'active');
    assert.equal(h.state.ceresWinchingOffer, null);
    assert.equal(h.state.entityList.filter(e => isCeresWinchAnchor(e)).length, 3);
    assert.equal(h.state.npcJobs.ceresWorkfleet.phase, 'player-retained');
  } finally { h.close(); }
});

test('new player incarnation holds the powered drum and receives a fresh usable offer', async () => {
  const h = await setup();
  try {
    choose(h, 'anchor:0'); choose(h, 'in');
    const previous = h.state.ceresWinchingOffer, p = h.state.entities.get(h.state.playerId);
    p.occupantGeneration += 1000; // Adversarial same-slot lifetime change, not route setup.
    for (let i = 0; i < 40; i++) h.sim.step();
    const next = h.state.ceresWinchingOffer;
    assert.equal(h.state.npcJobs.ceresAnchorSwing.command, 'hold');
    assert.equal(next.playerLife, p.occupantGeneration);
    assert.notEqual(next.id, previous.id);
    h.sim.bus.emit('ceresWinching:action', { action: 'out', offerId: previous.id, playerLife: previous.playerLife });
    assert.equal(h.state.npcJobs.ceresAnchorSwing.command, 'hold');
    choose(h, next.choices.some(c => c.id === 'release') ? 'release' : 'close');
  } finally { h.close(); }
});

test('occupied mast site defers admission, then admits once and never remints a lost mast', () => {
  const p = { id: 1, type: 'ship', alive: true, hull: 100, occupantGeneration: 1, radius: 20,
    pos: ceresWinchPoint(0), data: {}, physicsBody: { radius: 20, mass: 100, dynamic: true } };
  const state = { tick: 1, simTime: 0, mode: 'flight', world: { currentSectorId: C.sectorId }, npcJobs: {},
    playerId: 1, entities: new Map([[1, p]]), entityList: [p] };
  let next = 2;
  const owner = { state, bus: { on: () => () => {}, emit() {} }, helpers: { spawnEntity(spec) {
    const e = { ...spec, id: next, occupantGeneration: next++ };
    state.entities.set(e.id, e); state.entityList.push(e); return e;
  } } };
  const dispose = installCeresAnchorWinching(owner);
  try {
    stepCeresAnchorWinching(owner, 1 / 60);
    assert.equal(state.npcJobs.ceresAnchorSwing.spawnedMask & 1, 0);
    assert.equal(state.entityList.length, 3);
    // Synthetic admission fixture, not a flight/route claim.
    p.pos = { x: p.pos.x + 100, z: p.pos.z }; state.tick++; state.simTime = .1;
    stepCeresAnchorWinching(owner, 1 / 60);
    assert.equal(state.npcJobs.ceresAnchorSwing.spawnedMask & 1, 0, 'retry throttles');
    state.tick++; state.simTime = .51; stepCeresAnchorWinching(owner, 1 / 60);
    assert.equal(state.npcJobs.ceresAnchorSwing.spawnedMask, 7);
    const mast = state.entityList.find(e => e.data?.ceresWinchAnchor === 0);
    mast.alive = false; state.entities.delete(mast.id);
    state.tick++; state.simTime = 1.1; stepCeresAnchorWinching(owner, 1 / 60);
    assert.equal(state.entityList.length, 4, 'lost finite identity never remints');
  } finally { dispose(); }
});

import { createPromptDeck, setPromptDeck } from '../src/ui/promptDeck.js';
import { createCeresWinchingPrompt } from '../src/ui/ceresWinchingPrompt.js';
test('mounted Prompt Deck keyboard opens valves, switches anchor, returns from compact controls and casts off', async () => {
  const h = await setup(-200, -365), previous = globalThis.document, doc = promptDeckDocument(900, 900);
  globalThis.document = doc;
  const deck = createPromptDeck({ document: doc, state: h.state, bus: h.sim.bus }); setPromptDeck(deck);
  const prompt = createCeresWinchingPrompt({ state: h.state, bus: h.sim.bus });
  const buttons = () => { const found=[]; const walk=n=>{if(n.dataset?.choiceId)found.push(n);for(const c of n.children||[])walk(c);};walk(deck.el);return found; };
  const press = id => { prompt.frame(); const index=buttons().filter(b=>!b.disabled).findIndex(b=>b.dataset.choiceId===id); assert.ok(index>=0, `rendered ${id}`); doc.dispatch('keydown', {key:String(index+1)}); prompt.frame(); };
  try {
    press('anchor:0'); assert.equal(h.state.npcJobs.ceresAnchorSwing.anchorIndex, 0);
    press('in'); assert.equal(h.state.npcJobs.ceresAnchorSwing.command, 'in');
    press('hold'); assert.equal(h.state.npcJobs.ceresAnchorSwing.command, 'hold');
    press('anchors'); press('anchor:1'); assert.equal(h.state.npcJobs.ceresAnchorSwing.anchorIndex, 1);
    press('close'); assert.deepEqual(buttons().map(b=>b.dataset.choiceId), ['controls']);
    press('controls'); assert.ok(buttons().some(b=>b.dataset.choiceId==='release'));
    press('release'); assert.equal(h.state.npcJobs.ceresAnchorSwing.status, 'released');
    h.sim.bus.emit('save:restoring', {}); assert.deepEqual(buttons(), []);
  } finally { prompt.destroy(); deck.destroy(); setPromptDeck(null); globalThis.document=previous; h.close(); }
});

// Existing deterministic Prompt Deck DOM fixture; not browser layout evidence.
function promptDeckDocument(width, height) {
  const listeners = new Map();
  const make = (tagName) => {
    const node = {
      tagName, id: '', className: '', textContent: '', hidden: false, disabled: false,
      children: [], attrs: {}, dataset: {}, listeners: {}, parentNode: null,
      style: { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } },
      get firstElementChild() { return this.children[0] || null; },
      get lastElementChild() { return this.children.at(-1) || null; },
      get nextElementSibling() {
        const siblings = this.parentNode?.children || [];
        return siblings[siblings.indexOf(this) + 1] || null;
      },
      get childElementCount() { return this.children.length; },
      appendChild(child) { detach(child); child.parentNode = this; this.children.push(child); return child; },
      append(...children) { for (const child of children) this.appendChild(child); },
      insertBefore(child, ref) {
        if (child === ref) return child;
        detach(child); child.parentNode = this;
        const index = ref ? this.children.indexOf(ref) : -1;
        if (index < 0) this.children.push(child); else this.children.splice(index, 0, child);
        return child;
      },
      replaceChildren(...children) { for (const child of [...this.children]) detach(child); this.append(...children); },
      remove() { detach(this); },
      contains(target) { return target === this || this.children.some((child) => child.contains(target)); },
      setAttribute(name, value) { this.attrs[name] = String(value); },
      getAttribute(name) { return this.attrs[name] ?? null; },
      removeAttribute(name) { delete this.attrs[name]; },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== fn); },
      click() { for (const fn of this.listeners.click || []) fn({ target: this, preventDefault() {}, stopPropagation() {} }); },
    };
    function detach(child) {
      const siblings = child.parentNode?.children;
      const index = siblings?.indexOf(child) ?? -1;
      if (index >= 0) siblings.splice(index, 1);
      child.parentNode = null;
    }
    node.classList = {
      add(...names) { node.className = [...new Set([...node.className.split(/\s+/), ...names])].filter(Boolean).join(' '); },
      remove(...names) { node.className = node.className.split(/\s+/).filter((name) => name && !names.includes(name)).join(' '); },
      contains(name) { return node.className.split(/\s+/).includes(name); },
      toggle(name, force) {
        const shouldAdd = force === undefined ? !node.classList.contains(name) : !!force;
        if (shouldAdd) node.classList.add(name); else node.classList.remove(name);
        return shouldAdd;
      },
    };
    return node;
  };
  const head = make('head');
  const body = make('body');
  body.id = 'ui-root';
  const documentElement = make('html');
  documentElement.classList.add('sf-reduce-motion');
  const viewListeners = new Map();
  const defaultView = {
    innerWidth: width,
    innerHeight: height,
    addEventListener(type, fn) { (viewListeners.get(type) || viewListeners.set(type, new Set()).get(type)).add(fn); },
    removeEventListener(type, fn) { viewListeners.get(type)?.delete(fn); },
  };
  const doc = {
    head, body, documentElement, defaultView,
    createElement: make,
    getElementById(id) {
      if (id === 'ui-root') return body;
      const find = (node) => node.id === id ? node : node.children.map(find).find(Boolean) || null;
      return find(head) || find(body);
    },
    addEventListener(type, fn) { (listeners.get(type) || listeners.set(type, new Set()).get(type)).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatch(type, event) { for (const fn of listeners.get(type) || []) fn({ ...event, preventDefault() {}, stopImmediatePropagation() {} }); },
  };
  return doc;
}
