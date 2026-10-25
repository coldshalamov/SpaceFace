// Packet 01 — glyph integrity. A mark must say WHAT the item is: every fitted item resolves to its own
// authored drawing or to a generic family mark that SAYS it is generic; two different jobs never share
// a drawing (the Rig's plow and the plasma fan were both `cone`, and the later literal silently won).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ARSENAL_IDENTITIES } from '../src/data/arsenalIdentity.js';
import {
  ARSENAL_GLYPHS, ARSENAL_TOOL_IDS, arsenalGlyph, arsenalGlyphFamily, arsenalGlyphKey, arsenalGlyphSource, arsenalIcon,
} from '../src/ui/orrery/arsenalGlyphs.js';
import { equipmentGlyphSource, equipmentSvg } from '../src/ui/orrery/equipmentGlyphs.js';
import { WEAPONS } from '../src/data/weapons.js';
import { MODULES } from '../src/data/modules.js';
import { BOMB_DEFS } from '../src/data/bombs.js';
import { FIELD_DEFS } from '../src/data/fields.js';
import { SWARM_CALLIN_CATALOG } from '../src/data/swarmDraft.js';
import { RAIL_SLOTS, SUPPORT_SLOTS } from '../src/ui/powerRail.js';
import { ARSENAL_VERB_ORDER, resolveArsenalPresentation } from '../src/data/arsenalPresentation.js';

const ALL_IDS = [...Object.keys(ARSENAL_IDENTITIES), ...ARSENAL_TOOL_IDS];

// Pairs that share ONE drawing because they are ONE job (a tool and the hardware that carries it, or
// two tiers of the same drive). Anything not listed here that draws the same picture is a defect.
const SAME_JOB = Object.freeze([
  [['wpn_flak_turret_s', 'mod_pds_servo_s'], 'a turret that shoots incoming fire down, as a weapon and as a point-defense servo'],
  [['wpn_inertial_shunt_s', 'mod_ram_plate'], 'the ram plate IS the shunt: closing speed becomes the hit'],
  [['wpn_vector_mine_m', 'mod_charge_vector_rack'], 'the vector charge and the rack that kicks it out behind you'],
  [['power_charge', 'mod_charge_rack'], 'the sticky charge and the rack that carries it'],
  [['power_massline', 'mod_winch_hd'], 'the Line and its winch'],
  [['power_scan', 'mod_survey_suite'], 'the scanner pulse and its survey suite'],
  [['mod_afterburner_m', 'mod_splitburner_m'], 'two afterburners: the same drive job at a different burn length'],
]);

const sig = (id) => JSON.stringify(arsenalGlyph(id));

test('every identity row resolves to an authored drawing and carries player-facing text', () => {
  for (const [id, row] of Object.entries(ARSENAL_IDENTITIES)) {
    assert.ok(row.glyph, `${id} names a glyph key`);
    assert.ok(ARSENAL_GLYPHS[row.glyph], `${id}: glyph key "${row.glyph}" resolves to a drawing`);
    assert.ok(arsenalGlyph(id) && arsenalGlyph(id).length > 0, `${id} has paths`);
    assert.equal(arsenalGlyphSource(id), 'authored', id);
    assert.ok(typeof row.sentence === 'string' && row.sentence.trim().length >= 30, `${id} carries a real sentence`);
    assert.doesNotMatch(row.sentence, /root sibling|lineage|generation[- ]?(zero|0)|compatibility emitter|\bproc\b/i,
      `${id}: no internal terms in player-facing text`);
    const icon = arsenalIcon(id, 24);
    assert.match(icon, /currentColor/);
    assert.doesNotMatch(icon, /<text|<filter|<animate|<image/, `${id}: no fonts, filters or animation in a mark`);
  }
  for (const id of ARSENAL_TOOL_IDS) assert.ok(arsenalGlyph(id), `${id} (equipment map) resolves to a drawing`);
});

test('one glyph key never speaks for two different jobs', () => {
  const byKey = new Map();
  for (const [id, row] of Object.entries(ARSENAL_IDENTITIES)) {
    if (!byKey.has(row.glyph)) byKey.set(row.glyph, []);
    byKey.get(row.glyph).push(id);
  }
  for (const [key, ids] of byKey) {
    assert.equal(ids.length, 1, `glyph key "${key}" is shared by ${ids.join(', ')}: give each job its own drawing`);
  }
  // The regression that started this: the Rig's plow and the plasma fan.
  assert.notEqual(arsenalGlyphKey('field_cone_standard'), arsenalGlyphKey('wpn_plasma_cone_s'));
  assert.notEqual(sig('field_cone_standard'), sig('wpn_plasma_cone_s'));
});

test('identical artwork exists only for declared same-job pairs, each with its reason', () => {
  const groups = new Map();
  for (const id of ALL_IDS) {
    const s = sig(id);
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s).push(id);
  }
  const shared = [...groups.values()].filter((ids) => ids.length > 1).map((ids) => ids.slice().sort());
  const declared = SAME_JOB.map(([ids]) => ids.slice().sort());
  const key = (ids) => ids.join('|');
  for (const ids of shared) assert.ok(declared.some((d) => key(d) === key(ids)), `${ids.join(' and ')} draw the same picture but are different jobs`);
  for (const [ids, reason] of SAME_JOB) {
    assert.ok(reason.length > 20, `${ids.join('/')} states why it shares a drawing`);
    assert.ok(shared.some((s) => key(s) === key(ids.slice().sort())), `${ids.join('/')} is declared shared but no longer is: drop it from SAME_JOB`);
  }
  // A modifier that rides a weapon's shots is the upgrade, never the gun: it carries the corner mark.
  for (const [modifier, weapon] of [['mod_ion_payload', 'wpn_emp_disruptor_m'], ['mod_incendiary_payload', 'wpn_plasma_cannon_m'],
    ['mod_bank_shot', 'wpn_bank_stream_m'], ['mod_gravity_tag', 'wpn_gravity_marker_s'], ['mod_conductive_path', 'wpn_conductive_primer']]) {
    assert.equal(arsenalGlyphFamily(modifier), arsenalGlyphFamily(weapon), `${modifier} keeps its weapon's family shape`);
    assert.notEqual(sig(modifier), sig(weapon), `${modifier} is marked as the modifier, not the ${weapon} itself`);
  }
});

test('every weapon, bomb, field, power and call-in has an authored mark; every module is authored or an honestly-marked family fallback', () => {
  for (const def of [...WEAPONS, ...Object.values(BOMB_DEFS), ...Object.values(FIELD_DEFS)]) {
    if (def.id === 'field_anchor_snare_standard' || def.id === 'wpn_gyre_snare') continue; // enemy-only / the Gyre has its power row
    assert.ok(arsenalGlyph(def.id), `${def.id} has an authored mark`);
  }
  for (const row of SWARM_CALLIN_CATALOG.filter((r) => r.id === 'smart_bomb' || r.id === 'orbital_lance')) {
    assert.equal(arsenalGlyphSource(`callin_${row.id}`), 'authored', `${row.name} (a Bomb-key payload) has a mark`);
  }
  assert.equal(arsenalGlyphSource('power_travel_burn'), 'authored');
  assert.equal(arsenalGlyphSource('power_gyre'), 'authored');

  const made = [];
  const doc = { createElementNS(ns, tag) { const node = { tag, attributes: {}, children: [], setAttribute(k, v) { this.attributes[k] = v; }, appendChild(c) { this.children.push(c); } }; made.push(node); return node; } };
  let family = 0;
  for (const mod of MODULES) {
    const source = equipmentGlyphSource({ defId: mod.id, category: mod.category });
    assert.ok(source === 'authored' || source === 'family', mod.id);
    const svg = equipmentSvg({ defId: mod.id, category: mod.category }, doc);
    assert.equal(svg.attributes['data-glyph-source'], source, `${mod.id}: the drawing says where it came from`);
    if (source === 'authored') {
      assert.equal(svg.attributes['data-arsenal'], mod.id, `${mod.id}: an authored mark names its item`);
      assert.equal(svg.attributes['stroke-dasharray'], undefined);
    } else {
      family += 1;
      assert.equal(svg.attributes['data-arsenal'], undefined, `${mod.id}: a family mark never claims to be the item`);
      assert.ok(svg.attributes['stroke-dasharray'], `${mod.id}: a family mark is drawn dashed, never as an authored face`);
      assert.ok(svg.attributes['data-glyph'], `${mod.id}: and names the kind of equipment it stands for`);
    }
  }
  assert.ok(family > 0, 'the audit saw real generic fittings');
});

test('the rail speaks only in authored marks, and the primary-weapon entry shows the fitted weapon itself', () => {
  const state = {
    mode: 'flight', playerId: 1, simTime: 5, entities: new Map([[1, { id: 1, alive: true, data: {} }]]), entityList: [], settings: {},
    runtime: { features: { massline2: { enabled: true, cloak: true } } },
    player: { cargo: { items: { cmdty_impulse_charge: 1 } }, activeShipIndex: 0, ownedShips: [{ fittings: ['wpn_railgun_m', 'mod_cloak_mk1'] }] },
    fields: {}, massline2: { cloak: { energy: 1 } },
  };
  const out = resolveArsenalPresentation(state);
  for (const id of ARSENAL_VERB_ORDER) {
    const e = out.entries[id];
    assert.equal(e.glyphSource, 'authored', `${id} draws an authored mark (${e.glyph})`);
    assert.ok(arsenalGlyph(e.glyph), `${id}: ${e.glyph} resolves`);
  }
  // every distinct job on the rail draws a distinct picture
  const pictures = ARSENAL_VERB_ORDER.map((id) => sig(out.entries[id].glyph));
  assert.equal(new Set(pictures).size, pictures.length, 'no two rail verbs share a drawing');
  assert.equal(out.weapons.length, 1);
  assert.equal(out.weapons[0].glyph, 'wpn_railgun_m', 'the primary weapon is the fitted gun, not a generic weapon button');
  assert.equal(out.weapons[0].glyphSource, 'authored');
  for (const slot of [...RAIL_SLOTS, ...SUPPORT_SLOTS]) assert.ok(slot.name && slot.band, `slot ${slot.index} is named`);
});

// Pixel truth at the size a socket is drawn, with colour thrown away: two jobs from different families
// must not read as one silhouette. Optional because it needs `sharp`; skipped (not passed) without it.
test('different families stay distinguishable as grayscale silhouettes at 24 px', async (t) => {
  let sharp;
  try { sharp = createRequire(import.meta.url)('sharp'); } catch { t.skip('sharp is not installed'); return; }
  const masks = new Map();
  for (const id of ALL_IDS) {
    const svg = arsenalIcon(id, 24).replace(/currentColor/g, 'white');
    const { data } = await sharp(Buffer.from(svg), { density: 72 }).flatten({ background: '#000' }).greyscale().resize(24, 24).raw().toBuffer({ resolveWithObject: true });
    const mask = Array.from(data, (v) => (v > 60 ? 1 : 0));
    const ink = mask.reduce((a, b) => a + b, 0);
    assert.ok(ink >= 20, `${id} draws something visible at 24 px (${ink} px)`);
    masks.set(id, mask);
  }
  const sameJob = new Set(SAME_JOB.map(([ids]) => ids.slice().sort().join('|')));
  let worst = { iou: 0, pair: '' };
  for (let i = 0; i < ALL_IDS.length; i++) {
    for (let j = i + 1; j < ALL_IDS.length; j++) {
      const a = ALL_IDS[i], b = ALL_IDS[j];
      if (arsenalGlyphFamily(a) === arsenalGlyphFamily(b)) continue;
      if (sameJob.has([a, b].sort().join('|'))) continue;
      const ma = masks.get(a), mb = masks.get(b);
      let inter = 0, union = 0;
      for (let k = 0; k < ma.length; k++) { if (ma[k] && mb[k]) inter++; if (ma[k] || mb[k]) union++; }
      const iou = inter / (union || 1);
      if (iou > worst.iou) worst = { iou, pair: `${a} / ${b}` };
    }
  }
  assert.ok(worst.iou < 0.7, `closest unrelated pair ${worst.pair} overlaps ${worst.iou.toFixed(2)} as a silhouette`);
});
