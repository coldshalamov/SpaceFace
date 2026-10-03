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

function makeWorld({ hitPips = true, damageNumbers = true, flashReduce = false } = {}) {
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
  const ft = createFloatingText({ state, bus, helpers: {} });
  const layer = hud.children.find((c) => c.id === 'sf-floattext');
  return { bus, state, ft, layer, target };
}

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
