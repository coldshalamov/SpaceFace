// P2 — parts that explain themselves.
//
// The catalogue contract:
//   - every purchasable module and weapon has a role, a sentence that is not just its name, a
//     tier word, an intent, and an honest preview state;
//   - no role bucket swallows the catalogue ("Utility" is a last resort, not 40% of it);
//   - the duplicate detector uses authored signatures, never role+intent+tier;
//   - the fitter's ordering is intent-first within ONE selected slot list, not a global claim.
//
// Run: node --test test/part-facts.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import { BOMB_DEFS, BOMB_IDS } from '../src/data/bombs.js';
import { ATTACK_TRAITS } from '../src/data/attackTraits.js';
import {
  PART_DISPLAY_NAMES,
  PART_INTENTS,
  PART_PREVIEW_MANIFEST,
  SLOT_DEFAULT_INTENT,
  duplicateGroups,
  intentDiffersFromSlot,
  partFacts,
  partSignature,
  sortIdsByIntent,
  tierWordFor,
} from '../src/ui/ship/partFacts.js';

const PURCHASABLE = [...MODULES, ...WEAPONS]
  .filter((def) => def.purchasable !== false && !def.retiredInto);
const CATALOG = [...MODULES, ...WEAPONS];
const PURCHASABLE_MODULES = PURCHASABLE.filter((def) => def.slotType !== 'weapon');
const PURCHASABLE_WEAPONS = PURCHASABLE.filter((def) => def.slotType === 'weapon');

test('the catalogue counts are stated honestly: 206 modules+weapons, 158 purchasable, 166 with bombs', () => {
  assert.equal(CATALOG.length, 206);
  assert.equal(PURCHASABLE.length, 158);
  assert.equal(PURCHASABLE_MODULES.length, 130);
  assert.equal(PURCHASABLE_WEAPONS.length, 28);
  // Bombs are a separate catalogue: eight more purchasable ids that the module/weapon count above
  // does not contain. 158 + 8 = 166 purchasable ids overall.
  assert.equal(BOMB_IDS.length, 8);
  assert.equal(PURCHASABLE.length + BOMB_IDS.length, 166);
});

test('every purchasable part has role, sentence, tier, intent and an honest preview state', () => {
  assert.equal(PURCHASABLE.length, 158);
  for (const def of PURCHASABLE) {
    const facts = partFacts(def.id);
    assert.ok(facts, `${def.id} has facts`);
    assert.ok(facts.role && facts.role.length >= 2, `${def.id} has a role (${facts.role})`);
    assert.ok(facts.sentence && facts.sentence.length >= 12, `${def.id} has a full sentence`);
    assert.ok(facts.tier && /^Mk (I|II|III)$/.test(facts.tier), `${def.id} has an Mk word (${facts.tier})`);
    assert.ok(PART_INTENTS.some((intent) => intent.id === facts.intent), `${def.id} has a known intent`);
    assert.ok(Object.hasOwn(facts, 'previewId'), `${def.id} exposes the preview field`);
    if (facts.previewId != null) {
      assert.ok(Object.hasOwn(PART_PREVIEW_MANIFEST, def.id), `${def.id} preview resolves in the manifest`);
    } else {
      assert.equal(facts.previewState, 'not-built', `${def.id} does not claim a clip that does not exist`);
    }
    const nameWords = new Set(String(facts.name).toLowerCase().split(/\s+/));
    assert.ok(facts.sentence.toLowerCase() !== String(facts.name).toLowerCase(), `${def.id} sentence is not the name`);
    assert.ok(facts.sentence.toLowerCase().split(/\s+/).some((word) => !nameWords.has(word)), `${def.id} sentence adds a word the name does not`);
  }
});

test('the duplicate detector uses exact authored signatures, not role+intent+tier', () => {
  const ids = PURCHASABLE.map((def) => def.id);
  const groups = duplicateGroups(ids);
  assert.ok(groups.length > 100, `not a coarse bucket (${groups.length} groups)`);
  const largest = groups[0] ? groups[0].ids.length : 0;
  assert.ok(largest / ids.length < 0.6, `largest group is ${largest}/${ids.length}`);
  assert.equal(partSignature('mod_claw_anchor_s') === partSignature('mod_cargo_scanner_s'), false,
    'a claw anchor is not a cargo scanner');
  assert.equal(partSignature('mod_twin_mount') === partSignature('mod_triad_mount'), false,
    'two different mounts with empty mods are not merged');

  // A true duplicate exists in the catalogue: the pristine and scarred ram plates have the same
  // slot, size, mass, draw, tier and authored modifier, so the probe must find them.
  assert.equal(partSignature('mod_ram_plate'), partSignature('mod_ram_plate_scarred'));
  const allGroups = duplicateGroups(MODULES.map((def) => def.id));
  assert.ok(allGroups.some((group) => group.ids.includes('mod_ram_plate')
    && group.ids.includes('mod_ram_plate_scarred')), 'the known true duplicate is found');

  // A false positive the old signature produced: the same `swingDrive` modifier at two different
  // sizes and masses is not an exact duplicate.
  assert.notEqual(partSignature('mod_swing_drive_m'), partSignature('mod_swing_drive_s'),
    'Swing Drive M and S are different fittings, not one duplicate');
});

test('no role bucket swallows the catalogue and Utility stays a last resort', () => {
  const roles = new Map();
  for (const def of PURCHASABLE) {
    const facts = partFacts(def.id);
    roles.set(facts.role, (roles.get(facts.role) || 0) + 1);
  }
  const largest = Math.max(...roles.values());
  assert.ok(largest / PURCHASABLE.length < 0.3, `largest role bucket is ${largest}/${PURCHASABLE.length}`);
  assert.ok((roles.get('Utility') || 0) / PURCHASABLE.length < 0.05,
    `Utility share is ${((roles.get('Utility') || 0) / PURCHASABLE.length * 100).toFixed(1)}%`);
  assert.ok(roles.get('Cloak') >= 1, 'cloak modules read as Cloak');
  assert.ok(roles.get('Armour') >= 1, 'hull plating reads as Armour');
  assert.ok(roles.get('Point defence') >= 1, 'point-defence gear reads as Point defence');
  assert.ok(roles.get('Sensor') >= 1, 'survey gear reads as Sensor');
});

test('attack traits read as Fight kit, engines read as Drive, support parts read their job', () => {
  for (const trait of ATTACK_TRAITS) {
    const facts = partFacts(trait.id);
    assert.ok(facts, `${trait.id} has facts`);
    assert.equal(facts.intent, 'fight', `${trait.id} is bought to put damage on something`);
    assert.notEqual(facts.role, 'Utility', `${trait.id} has a specific attack role (${facts.role})`);
  }
  for (const def of PURCHASABLE.filter((row) => row.slotType === 'engine')) {
    assert.equal(partFacts(def.id).role, 'Drive', `${def.id} is a Drive, not a Manoeuvre kit`);
  }
  for (const def of PURCHASABLE.filter((row) => row.slotType === 'thruster')) {
    const mods = def.mods || {};
    const neutral = ['turnMult', 'strafeMult', 'brakeMult'].every((key) => mods[key] == null || Number(mods[key]) === 1);
    if (neutral) assert.notEqual(partFacts(def.id).role, 'Manoeuvre kit', `${def.id} changes nothing and must not claim a manoeuvre`);
  }
  assert.equal(partFacts('mod_thermal_sink_s').intent, 'fight', 'a heat sink keeps guns firing');
  assert.equal(partFacts('mod_jump_drive_m').intent, 'move', 'a jump drive is travel');
  assert.equal(partFacts('mod_twin_mount').intent, 'fight', 'a twin mount is attack kit');
  assert.equal(partFacts('mod_ion_payload').intent, 'fight', 'a warhead core is attack kit');
});

test('tiers are authored: ordnance reads unlockTier and no display name carries a second ladder', () => {
  assert.equal(tierWordFor(1), 'Mk I');
  assert.equal(tierWordFor(2), 'Mk I');
  assert.equal(tierWordFor(3), 'Mk II');
  assert.equal(tierWordFor(4), 'Mk III');
  assert.equal(tierWordFor(5), 'Mk III');
  for (const id of BOMB_IDS) {
    const def = BOMB_DEFS[id];
    assert.equal(partFacts(id).tier, tierWordFor(def.unlockTier), `${id} reads its unlockTier`);
  }
  assert.equal(partFacts('bomb_anchor').tier, 'Mk I');
  assert.equal(partFacts('bomb_singularity').tier, 'Mk II');
  for (const def of PURCHASABLE) {
    const facts = partFacts(def.id);
    assert.ok(!/\b(T2|Mk\s?[123])\b/i.test(facts.name), `${def.id} display name does not repeat the ladder: ${facts.name}`);
  }
  for (const [id, name] of Object.entries(PART_DISPLAY_NAMES)) {
    assert.equal(partFacts(id).name, name);
  }
});

test('intent is authored for the job, not the slot letter', () => {
  assert.equal(partFacts('mod_tractor_beam_m').intent, 'work');
  assert.equal(partFacts('mod_cloak_mk1').intent, 'sneak');
  assert.equal(partFacts('mod_afterburner_m').intent, 'move');
  assert.equal(partFacts('mod_cargo_scanner_s').intent, 'work');
  assert.equal(partFacts('bomb_goo').intent, 'fight', 'a tar bomb is area control, not stealth');
  assert.equal(partFacts('bomb_anchor').intent, 'fight', 'a ballast bomb is a fight tool, not stealth');
  assert.equal(partFacts('bomb_emp').intent, 'sneak');
  assert.equal(partFacts('wpn_thermal_cooker').intent, 'fight');
  assert.equal(partFacts('tool_grav_anchor').intent, 'work');
  for (const def of PURCHASABLE) {
    const facts = partFacts(def.id);
    const defaultIntent = SLOT_DEFAULT_INTENT[def.slotType] || 'work';
    assert.equal(intentDiffersFromSlot(def.id), facts.intent !== defaultIntent);
  }
});

test('the fitter order is intent-first within the selected slot list', () => {
  // The chooser passes one slot type's compatible list; sortIdsByIntent is not claimed to order
  // the whole fittable set. Pick the shield list and prove the intent groups stay contiguous.
  const shields = PURCHASABLE.filter((def) => def.slotType === 'shield').map((def) => def.id);
  const sorted = sortIdsByIntent(shields);
  const intents = sorted.map((id) => partFacts(id).intent);
  for (let i = 1; i < intents.length; i += 1) {
    if (intents[i] !== intents[i - 1]) {
      assert.ok(!intents.slice(i).includes(intents[i - 1]), `${intents[i - 1]} groups stay contiguous`);
    }
  }
  const mixedBySlot = sortIdsByIntent(PURCHASABLE.map((def) => def.id));
  assert.equal(mixedBySlot.length, PURCHASABLE.length, 'the sort does not drop a part');
});

test('all bombs have facts, a role and a sentence', () => {
  for (const id of BOMB_IDS) {
    const facts = partFacts(id);
    assert.ok(facts, `${id} has facts`);
    assert.ok(facts.role && facts.role !== 'Utility', `${id} has a specific role (${facts.role})`);
    assert.ok(facts.sentence && facts.sentence.length > 20, `${id} has its authored sentence`);
    assert.equal(facts.previewId, null);
  }
});

test('unknown ids fail closed', () => {
  assert.equal(partFacts(null), null);
  assert.equal(partFacts(''), null);
  assert.equal(partFacts('not_a_part'), null);
  assert.equal(partSignature('not_a_part'), null);
  assert.deepEqual(duplicateGroups(['not_a_part']), []);
});
