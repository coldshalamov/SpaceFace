// Packet 01 — every surface that explains a verb reads the SAME words, failed attempts say why in the
// existing toast channel, and the Help sheet carries the production-backed combination example plus the
// fitted weapon's compiled behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';

import { controlSections } from '../src/ui/screens/help.js';
import { RAIL_SLOTS, SUPPORT_SLOTS, slotDescription } from '../src/ui/powerRail.js';
import { POWER_PAGES } from '../src/systems/mobile/catalog.js';
import { staticVerbSentence } from '../src/data/arsenalWords.js';
import { readOrdnanceModel } from '../src/ui/orrery/hudAdapter.js';
import { currentDenial, denialLine, mountArsenalDenials } from '../src/ui/arsenalDenials.js';
import { previewOrdnanceState } from '../src/ui/orrery/flightPreview.js';
import { WEAPONS } from '../src/data/weapons.js';
import { MODULES } from '../src/data/modules.js';
import { ADVENTURE_COLLISION_DIVIDEND, ADVENTURE_TRAIT_MAP } from '../src/data/adventureTraitMap.js';
import { SWARM_CALLIN_CATALOG } from '../src/data/swarmDraft.js';
import { ARSENAL_IDENTITIES } from '../src/data/arsenalIdentity.js';

const flightRows = (state) => controlSections(state).find((section) => section[0] === 'Flight')[1];

test('the rail bank, the Help sheet and the phone deck say the same thing about a power', () => {
  const byAction = Object.fromEntries([...RAIL_SLOTS, ...SUPPORT_SLOTS].map((s) => [s.action, s]));
  for (const [verb, action] of [['pull', 'pull'], ['shove', 'shove'], ['pin', 'pin'], ['bomb', 'bomb'], ['rig', 'rig'], ['cloak', 'cloak']]) {
    assert.equal(byAction[action].description, staticVerbSentence(verb), `${verb}: the rail's bank is the arsenal's sentence`);
    assert.equal(slotDescription(byAction[action].index), staticVerbSentence(verb));
  }
  const rows = new Map(flightRows({ settings: { controls: {}, gameplay: {} } }).map((row) => [row[1], row[0]]));
  for (const [verb, action] of [['pull', 'pull'], ['shove', 'shove'], ['pin', 'pin'], ['bomb', 'bomb'], ['rig', 'rig'], ['gyre', 'gyreSnare']]) {
    assert.ok(rows.get(action).endsWith(staticVerbSentence(verb)), `${verb}: Help repeats the arsenal's sentence, not its own`);
  }
  const phone = new Map(POWER_PAGES.flatMap((page) => page.powers).map((p) => [p.id, p.description]));
  for (const verb of ['pull', 'shove', 'pin', 'bomb', 'rig']) {
    assert.equal(phone.get(verb), staticVerbSentence(verb), `${verb}: the phone deck is the same sentence`);
  }
  assert.doesNotMatch(phone.get('gyreSnare'), /snare a body in the cone/i, 'the stale Gyre sentence is gone');
  // no surface keeps jargon
  const everything = [...rows.values(), ...phone.values(), ...Object.values(byAction).map((s) => s.description)].join('\n');
  assert.doesNotMatch(everything, /root sibling|lineage|generation (zero|0)|compatibility emitter|\bproc\b/i);
});

test('Help carries the fitted weapon with its compiled changes, and a combination built from live keys', () => {
  const state = {
    settings: { controls: {}, gameplay: {} },
    player: { cargo: { items: {} }, activeShipIndex: 0, ownedShips: [{ fittings: ['wpn_pulse_laser_s', 'mod_bank_shot', 'mod_relay_arc'] }] },
  };
  const rows = flightRows(state);
  const weapon = rows.find((row) => row[0].startsWith('Pulse Laser S — '));
  assert.ok(weapon, 'the fitted weapon is named on the sheet');
  assert.equal(weapon[1], 'fire', 'and rides the Fire key');
  assert.match(weapon[0], /Bounces off up to 1 surface\./, 'the compiled bounce');
  assert.match(weapon[0], /jumps to up to \d+ more hulls? within \d+ units/, 'the compiled hop rule');
  const combo = rows.find((row) => row[0].startsWith('Combination — '));
  assert.ok(combo, 'the sheet carries the worked example');
  assert.match(combo[0], /Pull \(1\) drops a well on a pile of loose rocks/);
  assert.match(combo[0], /Hold Gyre \('\) over the pile/);
  assert.match(combo[0], /Release Gyre to throw the ball/);
  assert.match(combo[0], /Solve it any way the room allows/);
  assert.equal(combo[2], "1 → ' → release");
  // a remap moves the example; an unbound Gyre is said to be unbound, never taught as a default key
  state.settings.controls.bindings = { gyreSnare: ['KeyV'], pull: ['KeyZ'] };
  assert.equal(flightRows(state).find((row) => row[0].startsWith('Combination — '))[2], 'Z → V → release');
  state.settings.controls.bindings = { gyreSnare: [] };
  const unbound = flightRows(state).find((row) => row[0].startsWith('Combination — '));
  assert.match(unbound[0], /Hold Gyre \(unbound\)/);
  assert.equal(unbound[2], '1 → unbound → release');
});

test('a refusal the matter tools publish becomes one specific toast, once, in the owner\'s own words', () => {
  const emitted = [];
  const handlers = {};
  const bus = { on(name, fn) { handlers[name] = fn; return () => { delete handlers[name]; }; }, emit(name, payload) { emitted.push([name, payload]); } };
  const noted = [];
  const off = mountArsenalDenials(bus, { onDenial: (r) => noted.push(r) });
  const net = (over = {}) => ({ tool: 'gyre', code: 'protected', count: 1, short: 'CARGO', text: 'Cargo or quest wreck — towed, never swallowed', tick: 100, ...over });
  handlers['matter:refused'](net());
  assert.deepEqual(emitted.map(([name, p]) => [name, p.text, p.kind]), [['toast', 'Gyre — Cargo or quest wreck — towed, never swallowed', 'info']]);
  handlers['matter:refused'](net({ tick: 130 }));
  assert.equal(emitted.length, 1, 'the same refusal is not repeated while the pilot reads it');
  handlers['matter:refused'](net({ code: 'too-heavy', text: 'Too big to take whole', tick: 131 }));
  assert.equal(emitted.at(-1)[1].text, 'Gyre — Too big to take whole');
  handlers['matter:refused'](net({ tool: 'collector', code: 'anchored', text: 'Anchored — it will not move', tick: 132 }));
  assert.equal(emitted.at(-1)[1].text, 'Pull — Anchored — it will not move');
  handlers['matter:refused'](net({ tick: 400 }));
  assert.equal(emitted.length, 4, 'after the throttle window it speaks again');
  assert.equal(noted.length, 5, 'every refusal is noted for the tip, spoken or not');
  // the owner already speaks a dry charge and a commit-time refusal: no second voice
  const before = emitted.length;
  handlers['matter:refused']({ tool: 'gyre', code: 'dry-charge', count: 1, text: 'Not enough charge', tick: 900 });
  handlers['matter:refused']({ tool: 'collector', code: 'out-of-range', text: 'Out of reach', tick: 901 });
  handlers['matter:refused']({ tool: 'gyre', code: 'protected', count: 0, text: 'x', tick: 902 });
  assert.equal(emitted.length, before);
  assert.equal(denialLine(null), null);
  off();
  assert.equal(handlers['matter:refused'], undefined, 'unsubscribes');
  assert.equal(currentDenial({ tick: 100 }, 350)?.tick, 100);
  assert.equal(currentDenial({ tick: 100 }, 500), null, 'a stale refusal stops explaining the net');
});

test('the Gyre and Pull tips quote the live refusal while it still explains the net', () => {
  const state = previewOrdnanceState();
  state.tick = 6000;
  const denial = { tool: 'gyre', code: 'too-heavy', text: 'Too big to take whole', tick: 5950 };
  const withDenial = readOrdnanceModel(state, null, undefined, { denial });
  assert.match(withDenial['7'].tip, /Ready|Holding a ball/, 'the live state is still there');
  assert.ok(withDenial['7'].tip.endsWith('Too big to take whole'), withDenial['7'].tip);
  // the Pull collector's refusals ride the Pull socket
  const pullDenial = readOrdnanceModel(state, null, undefined, { denial: { tool: 'collector', code: 'anchored', text: 'Anchored — it will not move', tick: 5990 } });
  assert.ok(pullDenial['1'].tip.endsWith('Anchored — it will not move'), pullDenial['1'].tip);
  assert.doesNotMatch(pullDenial['7'].tip, /Anchored/);
  const stale = readOrdnanceModel(state, null, undefined, { denial: { ...denial, tick: 1000 } });
  assert.doesNotMatch(stale['7'].tip, /Too big to take whole/);
  assert.doesNotMatch(readOrdnanceModel(state, null, undefined)['7'].tip, /Too big to take whole/);
});

test('no player-facing arsenal text carries an engine term (root sibling, lineage proc, generation zero, compatibility emitter)', () => {
  const ENGINE_TERMS = /root sibling|\bsiblings?\b|lineage|generation[- ]?(zero|0|1)|compatibility emitter|\bprocs?\b|three-root|root volley|causal kinds/i;
  const texts = [];
  for (const def of [...WEAPONS, ...MODULES]) for (const field of ['description', 'sentence', 'blurb']) if (typeof def[field] === 'string') texts.push([def.id, def[field]]);
  for (const row of ADVENTURE_TRAIT_MAP) texts.push([row.traitId, row.blurb]);
  texts.push([ADVENTURE_COLLISION_DIVIDEND.id, ADVENTURE_COLLISION_DIVIDEND.blurb]);
  for (const row of SWARM_CALLIN_CATALOG) texts.push([row.id, row.blurb]);
  for (const [id, row] of Object.entries(ARSENAL_IDENTITIES)) texts.push([id, row.sentence]);
  assert.ok(texts.length > 200, 'the scan saw the catalogues');
  for (const [id, text] of texts) assert.doesNotMatch(text, ENGINE_TERMS, `${id}: "${text}"`);
});
