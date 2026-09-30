import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COMBAT_LAB_STARTER_PACKAGES } from '../src/data/combatLabSetups.js';
import { SHIPS } from '../src/data/ships.js';
import { buildSlotList } from '../src/systems/ships.js';
import { preparationLoadout, createCruciblePreparation } from '../src/ui/orrery/cruciblePreparation.js';
import { createVisualArmory } from '../src/ui/orrery/crucibleArmory.js';
import { EQUIPMENT_GLYPHS, equipmentKind, equipmentSvg } from '../src/ui/orrery/equipmentGlyphs.js';
import { crucibleDraftScreen } from '../src/ui/screens/crucibleDraft.js';

test('every starter preview uses canonical hull slots and actual installed definitions', () => {
  const before = structuredClone(COMBAT_LAB_STARTER_PACKAGES);
  for (const starter of COMBAT_LAB_STARTER_PACKAGES) {
    const preview = preparationLoadout(starter.id);
    assert.equal(preview.hull.id, starter.hullId);
    assert.deepEqual(preview.slots.map(({ index, type, size }) => ({ index, type, size })),
      buildSlotList(preview.hull).map(({ index, type, size }) => ({ index, type, size })));
    for (const slot of preview.slots) {
      assert.equal(slot.defId, starter.loadout.find(entry => entry.slotIndex === slot.index)?.defId || null);
    }
  }
  assert.deepEqual(COMBAT_LAB_STARTER_PACKAGES, before, 'presentation must never change a preset');
});

test('every bare hull previews empty legal slots; missing hulls are not invented', () => {
  for (const hull of SHIPS) {
    const preview = preparationLoadout(`hull:${hull.id}`);
    assert.equal(preview.hull.id, hull.id);
    assert.ok(preview.slots.every(slot => slot.defId === null));
  }
  assert.equal(preparationLoadout('hull:missing'), null);
  assert.equal(preparationLoadout(undefined), null);
});

test('Weapons Cold preview matches the real launch mutation without mutating the starter', () => {
  const before = preparationLoadout('ricochet_runner');
  const cold = preparationLoadout('ricochet_runner', 'weapons_cold');
  assert.ok(before.slots.some(slot => slot.defId?.startsWith('wpn_')));
  for (const slot of before.slots) {
    assert.equal(cold.slots[slot.index].defId, slot.defId?.startsWith('wpn_') ? null : slot.defId);
  }
  assert.deepEqual(preparationLoadout('ricochet_runner'), before);
});

test('equipment metaphors prioritize the actual function, not ambiguous name fragments', () => {
  const cases = { wpn_autocannon_s:'cannon', wpn_railgun_m:'rail', mod_ion_thruster_m:'engine',
    mod_thermal_sink_s:'cooler', mod_cargo_scanner_s:'sensor', mod_shield_booster_s:'shield',
    mod_bank_shot:'ricochet', wpn_missile_rack_m:'missile', wpn_snarl_webcaster:'web',
    svc_weld:'repair', svc_ordnance:'ammo', ship_hornet:'hull', weapon:'cannon' };
  for (const [id, expected] of Object.entries(cases)) assert.equal(equipmentKind(id), expected, id);
  assert.equal(equipmentKind({ ruleset:'swarm' }), 'swarm');
  assert.equal(equipmentKind({ category:'Weapons', defId:'future_new_weapon' }), 'cannon');
  assert.equal(equipmentKind({ defId:'unknown_component' }), 'module');
});

test('SVG source and standalone reusable asset contain the same geometry, with no external media', () => {
  const text = readFileSync(new URL('../assets/ui/orrery/crucible-equipment.svg', import.meta.url), 'utf8');
  for (const [kind, shapes] of Object.entries(EQUIPMENT_GLYPHS)) {
    assert.ok(text.includes(`id="crucible-${kind}"`), kind);
    for (const { tag, ...attrs } of shapes) {
      assert.ok(['path','circle'].includes(tag));
      assert.ok(text.includes('<'+tag+' '+Object.entries(attrs).map(([k,v])=>`${k}="${v}"`).join(' ')+'/>'));
    }
  }
  assert.doesNotMatch(text, /<script|<image|<foreignObject|filter=/);
});

test('decorative SVG never steals a focus stop or replaces the surrounding accessible label', () => {
  const doc = { createElementNS: (_ns, tag) => ({ tag, attrs:{}, children:[],
    setAttribute(k,v) { this.attrs[k] = v; }, appendChild(n) { this.children.push(n); } }) };
  const svg = equipmentSvg({ category:'Weapons' }, doc);
  assert.equal(svg.attrs.viewBox, '0 0 128 128');
  assert.equal(svg.attrs['aria-hidden'], 'true');
  assert.equal(svg.attrs.focusable, 'false');
  assert.ok(svg.children.length > 0);
  assert.equal(equipmentSvg({}, {}), null);
  assert.equal(createCruciblePreparation({ root:{} }), null);
  assert.equal(createVisualArmory({ root:{} }), null);
});

function purchaseFixture(offers, phase = 'draft') {
  const events = []; let refreshes = 0;
  const owner = { currentOffers: () => offers, lastNotice: () => null };
  const ctx = { state:{run:{phase, credits:64}}, registry:{get:()=>owner},
    bus:{emit:(name,payload)=>events.push([name,payload])} };
  const screen = Object.create(crucibleDraftScreen);
  screen._reading = {offerId:'chosen'};
  screen.refresh = () => refreshes++;
  return { ctx, screen, events, refreshes:()=>refreshes };
}
for (const [reason, offers, phase] of [
  ['removed', [], 'draft'], ['unaffordable', [{id:'chosen',available:false}], 'draft'],
  ['already purchased', [{id:'chosen',available:true,purchased:true}], 'draft'],
  ['phase changed', [{id:'chosen',available:true}], 'active'],
]) test(`explicit purchase rejects a ${reason} offer using the current owner snapshot`, () => {
  const f = purchaseFixture(offers, phase); f.screen._purchaseSelected(f.ctx);
  assert.equal(f.events.length, 0); assert.equal(f.refreshes(), 1);
  assert.equal(f.ctx.state.run.credits, 64);
});

test('explicit purchase only emits the existing intent; wallet/fittings remain owner-controlled', () => {
  const f = purchaseFixture([{id:'chosen',available:true,kind:'service',name:'Ordnance top-up'}]);
  f.screen._purchaseSelected(f.ctx);
  assert.deepEqual(f.events, [['run:draftPickRequested',{offerId:'chosen'}]]);
  assert.equal(f.ctx.state.run.credits, 64);
  assert.equal(f.screen._flash.text, 'Purchased Ordnance top-up.');
  assert.equal(f.refreshes(), 1);
});
