import test from 'node:test';
import assert from 'node:assert/strict';

import { ENCOUNTERS, ENCOUNTER_BARKS, encountersForZoneTypes, receiptText, tollAmountFor } from '../src/data/encounters.js';
import { ENCOUNTER_MODULES } from '../src/data/encounters/index.generated.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { WEAPONS } from '../src/data/weapons.js';

const IDS = ['vael_warden_convoy', 'vael_lane_tithe', 'vael_station_screen'];
const byId = new Map(ENEMY_TYPES.map((e) => [e.id, e]));
const warden = byId.get('warden_escort');

test('warden open-route package: three live placements guard something real', () => {
  assert.ok(warden, 'warden_escort role exists');
  for (const id of IDS) {
    const enc = ENCOUNTERS[id];
    assert.ok(enc, `${id} is in the catalog`);
    assert.equal(Object.isFrozen(enc), true, `${id} frozen`);
  }
  const convoy = ENCOUNTERS.vael_warden_convoy;
  assert.equal(convoy.script, 'convoy');
  assert.ok(convoy.civilian && convoy.escort, 'convoy fields carrier and screen');
  assert.deepEqual(convoy.escort.archetypes, ['warden_escort']);
  assert.equal(convoy.escort.team, 2, 'screen flies with the carrier');
  assert.equal(convoy.civilian.factionId, 'faction_vael');
  assert.ok(convoy.predation && convoy.predation.enabled, 'raiders hunt the manifest');
  assert.ok(!convoy.choices, 'no dormant choices: the convoy script only flies physical verbs');

  const tithe = ENCOUNTERS.vael_lane_tithe;
  assert.equal(tithe.script, 'toll');
  assert.equal(tithe.squad.anchorArchetype, 'warden_escort');
  assert.deepEqual(tithe.choices.map((c) => c.id), ['pay', 'refuse', 'run']);

  const screen = ENCOUNTERS.vael_station_screen;
  assert.equal(screen.script, 'ambush');
  assert.equal(screen.squad.anchorArchetype, 'warden_escort');
  assert.ok(screen.gates.minSecurity >= 0.6, 'the screen holds lawful space, not the black');

  const orders = ENCOUNTER_MODULES.map((m) => m.encounterOrder);
  assert.equal(new Set(orders).size, orders.length, 'encounterOrder unique with new modules');
  for (const n of [340, 341, 342]) assert.ok(orders.includes(n), `order ${n} registered`);
});

test('warden placements schedule in their zones with live barks and receipts', () => {
  assert.ok(encountersForZoneTypes(new Set(['trade_lane'])).some((e) => e.id === 'vael_warden_convoy'));
  assert.ok(encountersForZoneTypes(new Set(['refinery_approach'])).some((e) => e.id === 'vael_warden_convoy'));
  assert.ok(encountersForZoneTypes(new Set(['ambush_lane'])).some((e) => e.id === 'vael_lane_tithe'));
  assert.ok(encountersForZoneTypes(new Set(['border_checkpoint'])).some((e) => e.id === 'vael_station_screen'));
  assert.ok(encountersForZoneTypes(new Set(['civilian_core'])).some((e) => e.id === 'vael_station_screen'));
  for (const id of IDS) {
    assert.ok(ENCOUNTER_BARKS[ENCOUNTERS[id].bark], `${id} bark ${ENCOUNTERS[id].bark} is live`);
  }
  assert.match(receiptText('vael_lane_tithe', 'paid', { amount: 240 }), /Vael cools/);
  assert.match(receiptText('vael_station_screen', 'cleared', {}), /unguarded/);
  assert.match(receiptText('vael_warden_convoy', 'guarded', { pay: 200 }), /Vael owes you/);
  assert.equal(tollAmountFor(2000), 240, 'same lane economics as every tithe');
});

test('warden role reads: screen doctrine, regen shield, and real pay', () => {
  assert.equal(warden.aiArchetype, 'guardian');
  assert.equal(warden.combatDoctrineId, 'escort_screen');
  assert.equal(warden.aiDoctrine.defaultActivity, 'screen');
  assert.match(warden.telegraph.line, /guarding the pack/);
  assert.ok(warden.shieldRegen > 0, 'regen shield outlasts the first exchange');
  assert.ok(warden.bountyCr > 0 && warden.loot, 'the screen pays like the threat it is');
});

test('warden TTK floor keeps the screen honest without a wall', () => {
  const laser = WEAPONS.find((w) => w.id === 'wpn_pulse_laser_s');
  const floorS = (warden.hull + warden.shield) / laser.dps;
  // ~9 s of uninterrupted starter fire before armor and regen: the screen dies fast
  // alone, which is the point — its strength is the ward behind it, not its hull.
  assert.ok(floorS >= 6 && floorS <= 15, `unmitigated TTK floor ${floorS.toFixed(1)}s out of band`);
});
