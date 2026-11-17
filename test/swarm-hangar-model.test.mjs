import test from 'node:test';
import assert from 'node:assert/strict';
import { SHIPS } from '../src/data/ships.js';
import { COMBAT_LAB_STARTER_PACKAGES } from '../src/data/combatLabSetups.js';
import { WHOLE_SHIP_FILE_BY_DEF_ID } from '../src/data/wholeShipVisualIdentity.js';
import { hullPosterUrl } from '../src/ui/hullPosters.js';
import { crucibleStarterIdForSetup } from '../src/ui/crucibleLaunch.js';
import { swarmHangarRoster, preferredSwarmStarterForHull, swarmHullIdForStarter,
  swarmPreviewLoadout, swarmPreviewFitFromRows, availableSwarmStarterId,
  swarmPreparationReadiness } from '../src/ui/ship/swarmHangarModel.js';

test('the hangar presents one real model per hull, with repeated equipment kits beneath it', () => {
  const roster = swarmHangarRoster();
  assert.equal(roster.length, SHIPS.length);
  assert.equal(new Set(roster.map(row => row.hullId)).size, SHIPS.length);
  const files = roster.map(row => WHOLE_SHIP_FILE_BY_DEF_ID[row.hullId]);
  assert.ok(files.every(Boolean), 'every offered hull has an authored identity');
  assert.equal(new Set(files).size, files.length, 'different hull choices must not share the Hitch asset');
  assert.ok(roster.every(row => hullPosterUrl(row.hullId)), 'authored posters cover loading and GPU failure');
  const hitch = roster.find(row => row.hullId === 'ship_kestrel');
  assert.ok(hitch.kits.filter(kit => !kit.bare).length > 1);
  assert.ok(hitch.kits.every(kit => kit.hullId === hitch.hullId));
});

test('changing hull selects only a compatible unlocked kit, and does not manufacture free equipment', () => {
  const kits = COMBAT_LAB_STARTER_PACKAGES.map(kit => ({ id: kit.id, available: false }));
  kits.find(kit => kit.id === 'ricochet_runner').available = true;
  assert.equal(preferredSwarmStarterForHull('ship_hornet', { kitChoices: kits }), 'ricochet_runner');
  assert.equal(preferredSwarmStarterForHull('ship_kestrel', {
    kitChoices: kits, currentStarterId: 'ricochet_runner',
  }), 'hull:ship_kestrel');
  assert.equal(preferredSwarmStarterForHull('ship_wasp'), 'hull:ship_wasp');
  assert.equal(preferredSwarmStarterForHull('ship_hornet', {
    currentStarterId: 'hull:ship_hornet', kitChoices: kits,
  }), 'hull:ship_hornet', 'an intentional empty fit stays empty');
  assert.ok(swarmPreviewLoadout('hull:ship_wasp').fittings.every(id => id === null));
});

test('earned hulls and absent starter grants remain locked until the owner snapshot allows them', () => {
  const earned = SHIPS.find(ship => ship.swarmEarned);
  assert.ok(earned);
  assert.equal(preferredSwarmStarterForHull(earned.id), null);
  const choices = [{ hullId: earned.id, earned: true }];
  const roster = swarmHangarRoster({ hullChoices: choices, kitChoices: [] });
  assert.equal(roster.length, 1);
  assert.equal(roster[0].available, true);
  assert.equal(preferredSwarmStarterForHull(earned.id, { hullChoices: choices }), `hull:${earned.id}`);
  assert.equal(swarmHangarRoster({ kitChoices: [] }).flatMap(row => row.kits)
    .filter(kit => !kit.bare && kit.available).length, 0);
});

test('preview fittings and weapons match actual preset slot identities without changing the catalog', () => {
  const before = structuredClone(COMBAT_LAB_STARTER_PACKAGES);
  for (const kit of COMBAT_LAB_STARTER_PACKAGES) {
    const view = swarmPreviewLoadout(kit.id);
    assert.equal(view.hull.id, kit.hullId);
    for (const { slotIndex, defId } of kit.loadout) assert.equal(view.fittings[slotIndex], defId);
    assert.ok(view.weapons.every(weapon => view.fittings[weapon.slotIndex] === weapon.defId));
  }
  const beforeCold = swarmPreviewLoadout('ricochet_runner');
  const cold = swarmPreviewLoadout('ricochet_runner', 'weapons_cold');
  assert.ok(beforeCold.weapons.length > 0);
  assert.equal(cold.weapons.length, 0);
  for (const slot of beforeCold.slots.filter(slot => slot.type !== 'weapon')) {
    assert.equal(cold.fittings[slot.index], slot.defId);
  }
  assert.deepEqual(COMBAT_LAB_STARTER_PACKAGES, before);
});

test('armory preview reads installed rows by slot index and cannot equip a highlighted offer', () => {
  const rows = [
    { slotIndex: 2, defId: 'mod_engine_ion_m' },
    { slotIndex: 0, defId: 'wpn_autocannon_s' },
    { slotIndex: 1, defId: null },
  ];
  const before = structuredClone(rows);
  const fit = swarmPreviewFitFromRows('ship_kestrel', rows);
  assert.equal(fit.fittings[0], 'wpn_autocannon_s');
  assert.equal(fit.fittings[1], null);
  assert.equal(fit.fittings[2], 'mod_engine_ion_m');
  assert.deepEqual(fit.weapons.map(row => row.defId), ['wpn_autocannon_s']);
  assert.deepEqual(rows, before);
  assert.equal(swarmPreviewFitFromRows('ship_missing', rows), null);
  assert.equal(swarmPreviewLoadout('unknown_kit'), null);
  assert.equal(swarmHullIdForStarter('hull:missing'), null);
});

test('a remembered bare hull survives validation while unearned and unknown selections cannot', () => {
  const id = crucibleStarterIdForSetup({ hullId: 'ship_wasp', loadout: [], seed: 42 });
  assert.equal(availableSwarmStarterId(id), 'hull:ship_wasp');
  assert.equal(availableSwarmStarterId('hull:ship_missing'), null);
  assert.equal(availableSwarmStarterId('hull:ship_saucer'), null);
  assert.equal(availableSwarmStarterId('hull:ship_saucer', {
    hullChoices: [{ hullId: 'ship_saucer', earned: true }],
  }), 'hull:ship_saucer');
  assert.equal(availableSwarmStarterId('ricochet_runner', { kitChoices: [] }), null);
});

test('empty ships reach Swarm equipment but cannot silently enter an immediate-launch challenge', () => {
  const bare = { starterId: 'hull:ship_wasp' };
  const swarm = swarmPreparationReadiness({ ...bare, ruleset: 'swarm', stake: 'contender' });
  assert.equal(swarm.allowed, true); assert.equal(swarm.equipmentNext, true);
  for (const ruleset of ['scored', 'block', 'boss_circuit', 'trial_powered_conveyor']) {
    const readiness = swarmPreparationReadiness({ ...bare, ruleset });
    assert.equal(readiness.allowed, false, ruleset);
    assert.equal(readiness.equipmentNext, false, ruleset);
    assert.match(readiness.message, /Choose a loadout with a weapon/);
    assert.equal(swarmPreparationReadiness({ starterId: 'ricochet_runner', ruleset }).allowed, true);
  }
});

test('zero-budget opening requires a fitted or built-in weapon, while actual earned funds remain usable', () => {
  const bare = { starterId: 'hull:ship_wasp', ruleset: 'swarm', stake: 'ironbound' };
  const empty = swarmPreparationReadiness(bare);
  assert.equal(empty.allowed, false); assert.equal(empty.startingCredits, 0);
  assert.match(empty.message, /no starting credits/);
  assert.equal(swarmPreparationReadiness({ ...bare, starterId: 'ricochet_runner' }).allowed, true);
  assert.equal(swarmPreparationReadiness({ ...bare, starterId: 'hull:ship_saucer' }).allowed, true);
  assert.equal(swarmPreparationReadiness({ ...bare, startWave: 11 }).allowed, true);
  const funded = swarmPreparationReadiness({ ...bare, hangar: { ranks: { war_chest: 1 } } });
  assert.equal(funded.allowed, true); assert.equal(funded.startingCredits, 100);
  assert.equal(swarmPreparationReadiness({ ...bare, daily: true }).allowed, true,
    'a Daily uses the standard shared purse, not the remembered Extreme stake');
});

test('equipment-skipping rules use their real launch contract and preserve deliberate Weapons Cold', () => {
  for (const rules of [{ challengeMutators: ['one_weapon'] }, { threatIds: ['draftless'] }]) {
    const empty = swarmPreparationReadiness({ starterId: 'hull:ship_wasp', ...rules });
    assert.equal(empty.allowed, false); assert.equal(empty.equipmentNext, false);
    const equipped = swarmPreparationReadiness({ starterId: 'ricochet_runner', ...rules });
    assert.equal(equipped.allowed, true); assert.equal(equipped.equipmentNext, false);
  }
  for (const ruleset of ['swarm', 'scored']) {
    const cold = swarmPreparationReadiness({ starterId: 'ricochet_runner', ruleset,
      weeklyMutatorId: 'weapons_cold', stake: 'ironbound' });
    assert.equal(cold.allowed, true); assert.equal(cold.equipmentNext, false);
    assert.match(cold.message, /starts without fitted guns/);
  }
});

test('built-in Saucer emitters appear as capabilities without manufacturing installed inventory', () => {
  const view = swarmPreviewLoadout('hull:ship_saucer');
  assert.ok(view.fittings.every(id => id === null));
  assert.equal(view.weapons.length, 3);
  assert.ok(view.weapons.every(weapon => weapon.intrinsic));
  assert.equal(view.slots.filter(slot => slot.intrinsicDefId).length, 3);
  const replaced = swarmPreviewFitFromRows('ship_saucer', [{ slotIndex: 0, defId: 'wpn_autocannon_s' }]);
  assert.equal(replaced.weapons.length, 3, 'a mounted weapon replaces its emitter');
  assert.equal(replaced.weapons[0].defId, 'wpn_autocannon_s');
  assert.equal(replaced.weapons[0].intrinsic, undefined);
});
