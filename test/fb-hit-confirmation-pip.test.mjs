/**
 * FB-019 — hit-confirmation pips: a three-state layer mark at the impact, owned by the
 * feedback channel the trigger already has, not by the damage-number toggle.
 *
 * The pip reuses floatingText's pool and the hit-voice layer classifier, so eye and ear
 * agree about which layer a shot actually chewed. These pins run `createFloatingText` on a
 * stub DOM and the real `combat:damage` payloads:
 *
 *   1. Player-caused shield damage spawns the ring mark at the target (drawn SVG, empty label).
 *   2. Armor-dominant and hull-only hits paint the drawn diamond and square marks.
 *   3. The pip answers `gameplay.hitPips` and STAYS lit when damage numbers are off —
 *      it is a control receipt, not a number.
 *   4. NPC-on-NPC damage paints nothing — the pip confirms MY trigger only.
 *   5. Rapid same-layer hits dedupe on the shared 40 ms layer gap.
 *   6. `flashReduce` holds the mark longer at the calmer treatment.
 *
 * RUN: `node --test test/fb-hit-confirmation-pip.test.mjs`
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createFloatingText } from '../src/ui/floatingText.js';

// ── minimal DOM stub ─────────────────────────────────────────────────────────
function stubEl(tag) {
  return {
    tag, id: '', className: '', children: [],
    style: {},
    // Drawn-mark pass: the pip's shape is an SVG mark child and its label is empty, so the
    // stub derives textContent the way a real element does instead of storing a flat string.
    get textContent() { return this._text !== undefined ? this._text : this.children.map((c) => c.textContent).join(''); },
    set textContent(v) { this.children.length = 0; this._text = v; },
    appendChild(child) { this.children.push(child); child.parent = this; return child; },
    setAttribute(name, value) { (this._attrs || (this._attrs = {}))[name] = String(value); },
    getAttribute(name) { return this._attrs ? this._attrs[name] ?? null : null; },
    removeAttribute(name) { if (this._attrs) delete this._attrs[name]; },
  };
}
const elementsById = new Map();
const headEl = stubEl('head');
const bodyEl = stubEl('body');
globalThis.document = {
  createElement: (tag) => stubEl(tag),
  getElementById: (id) => elementsById.get(id) || null,
  head: headEl,
  body: bodyEl,
};

function makeWorld({ hitPips = true, damageNumbers = true, flashReduce = false, helpers = {} } = {}) {
  const hud = stubEl('div'); hud.id = 'hud'; elementsById.set('hud', hud);
  const bus = createBus();
  const target = { id: 'npc_1', type: 'ship', alive: true, pos: { x: 100, z: -40 } };
  const state = {
    playerId: 'player', simTime: 0, tick: 0,
    entities: new Map([[target.id, target]]),
    settings: {
      showDamageNumbers: damageNumbers,
      gameplay: { damageNumbers, hitPips },
      accessibility: { flashReduce },
    },
  };
  const ft = createFloatingText({ state, bus, helpers });
  const layer = hud.children.find((c) => c.id === 'sf-floattext');
  return { bus, state, ft, layer, target };
}

test('the visor pickup receipt stays at the accepted cargo transfer when the camera moves', () => {
  let cameraShift = 0;
  const { bus, ft, layer, state } = makeWorld({ damageNumbers: false, helpers: {
    worldToScreen: pos => ({ x: pos.x + 400 + cameraShift, y: pos.z + 260, onScreen: true }),
  } });
  const previousDataset = bodyEl.dataset;
  bodyEl.dataset = { hudSkin: 'orrery' };
  state.mode = 'flight';
  try {
    const pickup = { collectorId: state.playerId, kind: 'cargo', commodityId: 'cmdty_fuel_cells',
      amount: 8, pos: { x: 40, z: 20 } };
    bus.emit('pickup:collected', { ...pickup, acceptedAmount: 0 });
    assert.equal(ft._activeCount(), 0);
    bus.emit('pickup:collected', { ...pickup, acceptedAmount: 4 });
    const card = layer.children.find(el => el.className.includes('sf-ft--world-receipt'));
    assert.equal(card?.textContent, '+4 Fuel Cells');
    card.offsetWidth = 110;
    card.offsetHeight = 32;
    const stem = card.children[0];
    stem.style.setProperty = (name, value) => { stem.style[name] = value; };
    ft.update(0.2);
    assert.equal(stem.style['--stem-visibility'], 'visible');
    const assertOnPoint = () => {
      const [x, y] = card.style.transform.match(/translate3d\(([-.\d]+)px,([-.\d]+)px/).slice(1).map(Number);
      const length = parseFloat(stem.style['--stem-length']);
      const angle = parseFloat(stem.style['--stem-angle']);
      const endX = x - 55 + parseFloat(stem.style['--stem-x']) + Math.cos(angle) * length;
      const endY = y - 16 + parseFloat(stem.style['--stem-y']) + Math.sin(angle) * length;
      assert.ok(Math.hypot(endX - (440 + cameraShift), endY - 280) < 1);
    };
    assertOnPoint();
    cameraShift = 56;
    ft.update(0.15);
    assertOnPoint();
    ft.update(3);
    assert.equal(card.style.display, 'none');
  } finally {
    bodyEl.dataset = previousDataset;
  }
});

test('world labels read layout only when a tag needs to be drawn', () => {
  const world = makeWorld({ helpers: { worldToScreen: (pos) => pos.x < 0
    ? { x: 0, y: 0, onScreen: false }
    : { x: 200, y: 100, onScreen: true } } });
  const padLayer = world.layer.children.find((el) => el.id === 'sf-floorpads');
  let widthReads = 0;
  Object.defineProperty(padLayer, 'clientWidth', { get() { widthReads++; return 800; } });
  world.ft.update(0.016);
  assert.equal(widthReads, 0, 'empty flight never asks the browser for layout');

  world.target.data = { swarmFloorPad: { label: 'REPAIR' } };
  world.target.pos.x = -100;
  world.ft.update(0.016);
  assert.equal(widthReads, 0, 'a tag that cannot be projected needs no layout');
  assert.equal(padLayer.children[0].style.display, 'none');

  world.target.pos.x = 100;
  world.ft.update(0.016);
  assert.equal(widthReads, 1);
  assert.equal(padLayer.children[0].textContent, 'REPAIR');
  assert.equal(padLayer.children[0].style.display, 'block');
});

test('an arena run never builds an ambient world label; a priced till and Adventure still do', () => {
  // SWARM-LEAK-01 — COFFEE HATCH / ANSEL'S SILL / CUSTOMS QUEUE / FIELD COIL CRADLE are Adventure
  // world texture; a live Swarm round reads the fight (20_THE_FIRST_HOUR rule 3). The label was
  // built and then hidden with a class, so its words still sat in the HUD tree.
  const world = makeWorld({ helpers: { worldToScreen: () => ({ x: 200, y: 100, onScreen: true }) } });
  const padLayer = world.layer.children.find((el) => el.id === 'sf-floorpads');
  const ambient = { ...world.target, id: 'ambient', pos: { x: 10, z: 10 },
    data: { swarmFloorPad: { label: 'COFFEE HATCH' } } };
  world.state.entities.set(ambient.id, ambient);

  world.state.run = { kind: 'survival', phase: 'active', ruleset: 'swarm' };
  world.ft.update(0.016);
  assert.equal(padLayer.children.length, 0, 'the arena builds no label node for an ambient pad');

  world.target.data = { swarmFloorPad: { label: 'THE CRATE · 950', kind: 'crate', price: 950 } };
  world.ft.update(0.016);
  assert.deepEqual(padLayer.children.map((el) => el.textContent), ['THE CRATE · 950'],
    'a priced till is still a fight decision and keeps its tag');

  world.state.run = { kind: 'adventure', phase: 'inactive' };
  world.ft.update(0.016);
  assert.deepEqual(padLayer.children.map((el) => el.textContent).sort(),
    ['COFFEE HATCH', 'THE CRATE · 950'], 'Adventure keeps both');
});

test('two floor tags projected onto one point take separate seats', () => {
  const world = makeWorld({ helpers: { worldToScreen: () => ({ x: 200, y: 170, onScreen: true }) } });
  const second = { ...world.target, id: 'other' };
  world.target.data = { swarmFloorPad: { label: 'THE CRATE' } };
  second.data = { swarmFloorPad: { label: 'REPAIR' } };
  world.state.entities.set(second.id, second);
  world.ft.update(0.016);
  const padLayer = world.layer.children.find((el) => el.id === 'sf-floorpads');
  padLayer.clientWidth = 800;
  padLayer.clientHeight = 600;
  const layoutAccesses = [];
  for (const el of padLayer.children) {
    Object.defineProperty(el, 'offsetWidth', { get() { layoutAccesses.push('read'); return 100; } });
    el.offsetHeight = 20;
    let transform = el.style.transform;
    Object.defineProperty(el.style, 'transform', {
      get: () => transform,
      set: value => { layoutAccesses.push('write'); transform = value; },
    });
  }
  world.ft.update(0.016);
  assert.deepEqual(layoutAccesses.slice(0, 2), ['read', 'read'], 'measure both chips before positioning either');
  const centers = padLayer.children.map(el => el.style.transform.match(/translate3d\(([-.\d]+)px,([-.\d]+)px/).slice(1).map(Number));
  assert.equal(centers.length, 2);
  assert.ok(Math.abs(centers[0][0] - centers[1][0]) >= 100
    || Math.abs(centers[0][1] - centers[1][1]) >= 20, 'both names remain readable');
});

test('a paid floor tag shows its terms early and reports the selected and armed offer', () => {
  const { state, target, ft, layer } = makeWorld({
    helpers: { worldToScreen: () => ({ x: 230, y: 170, onScreen: true }) },
  });
  state.run = { kind: 'survival', phase: 'active', ruleset: 'swarm', arenaId: 'helios_core' };
  const pilot = { id: state.playerId, pos: { x: -75, z: -40 }, alive: true };
  state.entities.set(pilot.id, pilot);
  target.data = { kind: 'swarm_floor_pad', swarmFloorPad: {
    padId: 'foundry-gun-south', kind: 'wall_gun', price: 500, label: 'PULSE LASER S · 500',
    fitPreview: 'Replaces Autocannon S',
  } };
  ft.update(0.016);
  const tag = layer.children.find(el => el.id === 'sf-floorpads').children[0];
  assert.equal(tag.textContent, 'PULSE LASER S · 500\nReplaces Autocannon S');
  assert.doesNotMatch(tag.className, /sf-fp--far/);
  assert.equal(tag.getAttribute('data-floor-quote'), null);

  pilot.pos.x += 90;
  ft.update(0.016);
  assert.match(tag.textContent, /\[ E \] Select/);
  assert.equal(tag.getAttribute('data-floor-quote'), target.id);
  target.data.swarmFloorPad.armedUntil = 4;
  ft.update(0.016);
  assert.match(tag.textContent, /Cross pad to buy/);
  assert.match(tag.textContent, /Replaces Autocannon S/);
});

function liveNodes(world) {
  return world.layer.children.filter((el) => el.style.display === 'block');
}

function hit(targetId, fields = {}) {
  return {
    targetId, attackerId: 'player', applied: 12,
    shieldDamage: 0, armorDamage: 0,
    pos: { x: 100, z: -40 },
    ...fields,
  };
}

test('FB-019: shield-layer damage paints the ring pip at the target', () => {
  const world = makeWorld();
  world.bus.emit('combat:damage', hit('npc_1', { shieldDamage: 12 }));
  const nodes = liveNodes(world);
  const pip = nodes.find((el) => el.className.includes('sf-ft--pip'));
  assert.ok(pip, 'a player-caused shield hit must paint a pip');
  assert.equal(pip.textContent, '');
  assert.ok(pip.className.includes('sf-ft--pip-shield'));
});

test('FB-019: armor and hull hits paint their own marks', () => {
  const world = makeWorld();
  world.bus.emit('combat:damage', hit('npc_1', { armorDamage: 9 }));
  world.state.simTime += 0.05; // past the 40 ms layer gap
  world.bus.emit('combat:damage', hit('npc_1', { applied: 20 }));
  const pips = liveNodes(world).filter((el) => el.className.includes('sf-ft--pip'));
  assert.equal(pips.length, 2, 'different layers paint separate marks');
  assert.equal(pips[0].textContent, '', 'armor bite is the drawn diamond mark');
  assert.ok(pips[0].className.includes('sf-ft--pip-armor'));
  assert.equal(pips[1].textContent, '', 'hull hit is the drawn square mark');
  assert.ok(pips[1].className.includes('sf-ft--pip-hull'));
});

test('FB-019: pips stay lit with damage numbers off, and honor their own gameplay key', () => {
  const off = makeWorld({ damageNumbers: false });
  off.bus.emit('combat:damage', hit('npc_1', { shieldDamage: 8 }));
  const pip = liveNodes(off).find((el) => el.className.includes('sf-ft--pip'));
  assert.ok(pip, 'the pip is a control receipt — damage numbers being off must not mute it');
  assert.ok(!liveNodes(off).some((el) => !el.className.includes('sf-ft--pip')),
    'no damage number joins it');

  const muted = makeWorld({ hitPips: false });
  muted.bus.emit('combat:damage', hit('npc_1', { shieldDamage: 8 }));
  assert.equal(liveNodes(muted).filter((el) => el.className.includes('sf-ft--pip')).length, 0,
    'gameplay.hitPips=false mutes the pip channel');
  // …but the damage number still paints (the pip key does not gate numbers).
  assert.ok(liveNodes(muted).some((el) => el.textContent === '12' && el.className.includes('sf-ft--hull')),
    'damage numbers still paint when only hitPips is off');
});

test('FB-019: NPC-on-NPC damage paints no pip', () => {
  const world = makeWorld();
  world.bus.emit('combat:damage', hit('npc_1', { attackerId: 'npc_9', shieldDamage: 5 }));
  world.bus.emit('combat:damage', hit('player', { attackerId: 'npc_9', applied: 7 }));
  assert.equal(liveNodes(world).filter((el) => el.className.includes('sf-ft--pip')).length, 0);
});

test('FB-019: same-layer hits inside the 40 ms gap dedupe', () => {
  const world = makeWorld();
  world.bus.emit('combat:damage', hit('npc_1', { shieldDamage: 6 }));
  world.state.simTime += 0.02; // 20 ms — inside the shared layer gap
  world.bus.emit('combat:damage', hit('npc_1', { shieldDamage: 6 }));
  world.state.simTime += 0.03; // 50 ms — outside the gap
  world.bus.emit('combat:damage', hit('npc_1', { shieldDamage: 6 }));
  assert.equal(liveNodes(world).filter((el) => el.className.includes('sf-ft--pip-shield')).length, 2,
    'the middle hit shares the first pip; the third earns its own');
});

test('FB-019: flashReduce holds the mark longer at the calm treatment', () => {
  const calm = makeWorld({ flashReduce: true });
  calm.bus.emit('combat:damage', hit('npc_1', { shieldDamage: 6 }));
  const pip = liveNodes(calm).find((el) => el.className.includes('sf-ft--pip'));
  assert.ok(pip.className.includes('sf-ft--pip-calm'), 'reduced flash takes the calm class');
});
