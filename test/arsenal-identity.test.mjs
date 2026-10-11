import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WEAPONS } from '../src/data/weapons.js';
import { MODULES } from '../src/data/modules.js';
import { BOMB_DEFS } from '../src/data/bombs.js';
import { FIELD_DEFS } from '../src/data/fields.js';
import { ARSENAL_IDENTITIES, arsenalSentence } from '../src/data/arsenalIdentity.js';
import { arsenalGlyph, arsenalIcon, ARSENAL_TOOL_IDS } from '../src/ui/orrery/arsenalGlyphs.js';
import { equipmentSvg } from '../src/ui/orrery/equipmentGlyphs.js';
import { airSentenceForId } from '../src/ui/ship/fitReadout.js';
import { crucibleFittingDescription } from '../src/ui/crucibleCombatReadout.js';
import { offerCardLines } from '../src/ui/screens/crucibleDraft.js';
import { readBombBayModel } from '../src/ui/powerRail.js';
import { readOrdnanceModel } from '../src/ui/orrery/hudAdapter.js';

const doc = { createElementNS(ns, tag) { return { tag, attributes: {}, children: [],
  setAttribute(key, value) { this.attributes[key] = value; }, appendChild(child) { this.children.push(child); } }; } };

test('every shipped weapon and bomb has a distinct authored mark and reachable explanation', () => {
  const seen = new Map();
  for (const def of [...WEAPONS, ...Object.values(BOMB_DEFS)]) {
    const art = arsenalGlyph(def.id);
    assert.ok(art, `${def.id} has a custom glyph`);
    const signature = JSON.stringify(art);
    assert.ok(!seen.has(signature), `${def.id} duplicates ${seen.get(signature)}`);
    seen.set(signature, def.id);
    const painted = equipmentSvg({ defId: def.id }, doc);
    assert.equal(painted.attributes['data-arsenal'], def.id, 'the live Swarm presenter uses exact identity');
    assert.equal(painted.attributes.viewBox, '0 0 24 24');
    assert.deepEqual(painted.children.map(node => node.tag), art.map(node => node.tag));
    assert.ok(arsenalSentence(def).length > 35);
    assert.equal(readFileSync(new URL(`../assets/ui/arsenal/${def.id}.svg`, import.meta.url), 'utf8').trim(), arsenalIcon(def.id, 24));
    if (WEAPONS.includes(def)) {
      assert.equal(airSentenceForId(def.id), arsenalSentence(def));
      assert.equal(offerCardLines({ defId: def.id, blurb: 'Old generic copy' }, {}).blurb, arsenalSentence(def));
    }
  }
});

test('every field and obtainable active equipment family has an authored icon', () => {
  for (const def of Object.values(FIELD_DEFS)) assert.ok(arsenalGlyph(def.id), def.id);
  const active = MODULES.filter(def => def.slotType === 'mining' || def.mods?.masslineHeadId
    || def.mods?.hullBurst || def.mods?.countermeasure || def.mods?.phaseBlink || def.mods?.cloakBaseRadius
    || def.mods?.impulseChargeCapacity || def.mods?.repulsionTrap || def.mods?.droneBay);
  for (const def of active) assert.ok(arsenalGlyph(def.id), def.id);
  for (const id of [...Object.keys(ARSENAL_IDENTITIES), ...ARSENAL_TOOL_IDS]) {
    const icon = arsenalIcon(id, 24);
    assert.match(icon, /currentColor/);
    assert.doesNotMatch(icon, /<text|<filter|<animate|<image/);
    assert.equal(readFileSync(new URL(`../assets/ui/arsenal/${id}.svg`, import.meta.url), 'utf8').trim(), icon);
  }
});

test('bomb cycling changes the visible rail and live ORRERY icon, including a dry fitted socket', () => {
  const ship = { id: 1, alive: true, flags: {}, data: {} };
  const state = { mode: 'flight', simTime: 1, playerId: 1, entities: new Map([[1, ship]]), entityList: [ship],
    bombs: {}, player: { cargo: { items: {} } }, settings: {} };
  for (const id of Object.keys(BOMB_DEFS)) {
    state.bombs.selectedId = id;
    assert.equal(readBombBayModel(state, 1).glyph, id);
    assert.equal(readOrdnanceModel(state, null, {})['9'].arsenalId, id);
    state.bombs.rack = { cells: [{ id, count: 0 }] };
    assert.equal(readBombBayModel(state, 1).glyph, id, 'dry socket retains the fitted identity');
    delete state.bombs.rack;
  }
});

test('activation guidance uses the real remapped boost, cloak and detonator actions', () => {
  const state = { settings: { controls: { bindings: { boost: ['KeyP'], cloak: ['KeyL'], chargeDetonate: ['KeyO'] } } } };
  for (const def of MODULES.filter(def => def.mods?.hullBurst)) {
    const hint = crucibleFittingDescription(def.id, state);
    assert.match(hint, /Boost — P/);
    assert.doesNotMatch(hint, /unbound|burst key/i);
    assert.match(arsenalSentence(def), /[Bb]oost/);
  }
  assert.match(crucibleFittingDescription('mod_veil_step', state), /hold P.*release/);
  assert.match(crucibleFittingDescription('mod_cloak_mk1', state), /L toggle/);
  assert.match(crucibleFittingDescription('wpn_sticky_detonator', state), /O detonate/);
  for (const id of ['tool_grav_anchor', 'tool_quantum_sympathy']) {
    assert.match(crucibleFittingDescription(id, state), /two different bodies/);
  }
  assert.match(arsenalSentence(WEAPONS.find(def => def.id === 'wpn_emp_disruptor_m')), /Bypasses shields to disable/);
});

test('unknown user content retains authored text and an invalid glyph never invents equipment', () => {
  assert.equal(arsenalSentence({ id: 'wpn_custom', sentence: 'My custom weapon.' }), 'My custom weapon.');
  assert.equal(arsenalIcon('wpn_custom'), '');
  const icon = arsenalIcon('wpn_mass_driver', 24, 'A <slug> & "recoil"');
  assert.match(icon, /aria-label="A &lt;slug&gt; &amp; &quot;recoil&quot;"/);
});
