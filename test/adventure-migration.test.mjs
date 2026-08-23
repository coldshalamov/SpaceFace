// PQ-133.11 — Adventure migration. Same grammar, no run economy, long-lived fit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ATTACK_TRAITS } from '../src/data/attackTraits.js';
import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { COMBAT_LAB_STARTER_PACKAGES } from '../src/data/combatLabSetups.js';
import {
  ADVENTURE_TRAIT_MAP,
  ADVENTURE_TRAIT_MAP_BY_ID,
  ADVENTURE_MUTATOR_MAP,
  ADVENTURE_COLLISION_DIVIDEND,
  assertTraitMapComplete,
} from '../src/data/adventureTraitMap.js';
import {
  ADVENTURE_ARENA_SITES,
  ADVENTURE_LIVE_ARENA_IDS,
} from '../src/data/adventureArenaSites.js';
import { assertRoleDoctrinesComplete, ADVENTURE_ROLE_DOCTRINES } from '../src/data/adventureDoctrines.js';
import { ADVENTURE_COMBAT_LAB_SHORTCUTS } from '../src/data/adventureCombatLab.js';
import { HUNTER_LADDER_STEP_IDS } from '../src/careers/ladders/hunterLadderDefs.js';
import {
  compileAttackSpec,
  describeAttackMetrics,
} from '../src/combat/attackSpec.js';
import { createRunState } from '../src/core/runState.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { weapons } from '../src/systems/weapons.js';
import {
  SHARED_ATTACK_COMPILER,
  attackModifiersFromFit,
  collectAttackModifiers,
  compileFittedAttackSpec,
  snapshotShipIdentity,
  shipIdentityUnchanged,
  causalKindsFromSpec,
  causalDistributionForSpec,
  physicalRewardForKill,
  lawForSite,
  doctrineForWaveRole,
  developerShortcut,
  mappingTable,
} from '../src/systems/adventureMigration.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MODULE_BY_ID = new Map(MODULES.map((row) => [row.id, row]));
const WEAPON_BY_ID = new Map(WEAPONS.map((row) => [row.id, row]));
const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((row) => [row.id, row]));

function hitchFittings(utilityId, weaponId = 'wpn_pulse_laser_s') {
  return [weaponId, 'mod_shield_booster_s', 'mod_engine_ion_m', null, 'mod_mining_laser_s', utilityId];
}

function entityWithFit(fittings) {
  return {
    id: 1,
    data: { defId: 'ship_kestrel', fittings: fittings.slice() },
  };
}

function specFromFit(fittings, weaponId, state) {
  const entity = entityWithFit(fittings);
  const result = compileFittedAttackSpec(state || { run: createRunState({ kind: 'adventure' }) }, entity, weaponId);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  return result.spec;
}

function liveSpec(fittings, weaponId, state) {
  const def = WEAPON_BY_ID.get(weaponId);
  const w = { defId: weaponId, slotIndex: 0 };
  const host = { _attackSpecCache: new Map(), _attackMetrics: { cacheHits: 0, specsCompiled: 0 } };
  return weapons._attackSpecFor.call(host, w, def, state || { run: createRunState({ kind: 'adventure' }) }, entityWithFit(fittings));
}

test('every landed Crucible trait maps to a fitted Adventure thing', () => {
  const complete = assertTraitMapComplete();
  assert.equal(complete.ok, true, `unmapped traits: ${complete.missing.join(',')}`);
  assert.equal(ADVENTURE_TRAIT_MAP.length, ATTACK_TRAITS.length);
  for (const row of ADVENTURE_TRAIT_MAP) {
    const fitted = MODULE_BY_ID.get(row.fittedId) || WEAPON_BY_ID.get(row.fittedId);
    assert.ok(fitted, `${row.traitId} fittedId ${row.fittedId} is missing`);
    assert.equal(fitted.slotType, row.slotType);
    assert.equal(fitted.size, row.size);
    assert.equal(fitted.mass, row.mass);
    assert.ok(Array.isArray(row.acquisition) && row.acquisition.length > 0);
    assert.ok(row.legality === 'legal' || row.legality === 'restricted' || row.legality === 'contraband');
  }
  const table = mappingTable();
  assert.equal(table.length, ATTACK_TRAITS.length);
});

test('challenge mutators do not become fittings, and Collision Dividend is not a run score', () => {
  for (const row of ADVENTURE_MUTATOR_MAP) {
    assert.equal(row.fittedId, null, row.mutatorId);
    assert.equal(row.form, 'already_adventure');
  }
  assert.equal(ADVENTURE_COLLISION_DIVIDEND.runScore, undefined);
  assert.equal(ADVENTURE_COLLISION_DIVIDEND.form, 'doctrine');
  const reward = physicalRewardForKill({ bountyCr: 340, causalTags: ['BANK'] });
  assert.equal(reward.credits, 340);
  assert.equal(reward.runScore, 0);
  assert.equal(reward.wave, null);
});

test('one game path: Adventure uses the shared AttackSpec compiler', () => {
  assert.equal(SHARED_ATTACK_COMPILER, compileAttackSpec);
  const source = readFileSync(join(ROOT, 'src/systems/adventureMigration.js'), 'utf8');
  assert.equal(source.includes('function compileAttackSpec'), false);
  assert.equal(/from '\.\.\/combat\/attackSpec\.js'/.test(source), true);
  const twin = specFromFit(hitchFittings('mod_twin_mount'), 'wpn_pulse_laser_s');
  const direct = compileAttackSpec({
    weaponId: 'wpn_pulse_laser_s',
    modifiers: [['mod_twin_mount', 1]],
  });
  assert.equal(direct.ok, true);
  assert.equal(twin.digest, direct.spec.digest);
  const viaWeapons = liveSpec(hitchFittings('mod_twin_mount'), 'wpn_pulse_laser_s');
  assert.equal(viaWeapons.digest, direct.spec.digest);
});

test('default Hitch fit does not inherit Crucible grammar', () => {
  for (const id of NEW_GAME.fittedModules) {
    assert.equal(ADVENTURE_TRAIT_MAP_BY_ID[id], undefined, `starter fit leaked ${id}`);
  }
  const bare = specFromFit(hitchFittings(null), 'wpn_pulse_laser_s');
  const untraited = compileAttackSpec({ weaponId: 'wpn_pulse_laser_s', modifiers: [] });
  assert.equal(bare.digest, untraited.spec.digest);
  assert.deepEqual(causalKindsFromSpec(bare), ['DIRECT']);
});

test('Adventure ignores stuffed draft, score, and wave; Survival still reads run traits', () => {
  const adventure = createRunState({ kind: 'adventure' });
  adventure.modifiers = [['mod_twin_mount', 1], { id: 'mod_bank_shot', rank: 1 }];
  adventure.score = 9999;
  adventure.wave = 18;
  adventure.draftHistory = [{ pick: 'throw' }];
  const emptyFit = hitchFittings(null);
  const leaked = collectAttackModifiers({ run: adventure }, entityWithFit(emptyFit), { id: 'wpn_pulse_laser_s' });
  assert.deepEqual(leaked, []);
  const leakedSpec = specFromFit(emptyFit, 'wpn_pulse_laser_s', { run: adventure });
  assert.equal(leakedSpec.emitter.rootCount, 1);
  assert.equal(leakedSpec.trajectory.bounces, 0);

  const survival = createRunState({ kind: 'survival' });
  survival.phase = 'active';
  survival.modifiers = [['mod_twin_mount', 1]];
  const fromRun = collectAttackModifiers({ run: survival }, entityWithFit(emptyFit), { id: 'wpn_pulse_laser_s' });
  assert.deepEqual(fromRun, [['mod_twin_mount', 1]]);
});

test('recordModifier refuses Adventure and does not rewrite the ship', () => {
  const state = createGameState(21);
  const fittings = hitchFittings('mod_twin_mount');
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: fittings.slice() }];
  state.player.activeShipIndex = 0;
  const bus = createBus();
  runSession.init({ state, bus });
  const before = fittings.slice();
  const recorded = runSession.recordModifier({ record: { id: 'mod_bank_shot', rank: 1 } });
  assert.equal(recorded, false);
  assert.deepEqual(state.player.ownedShips[0].fittings, before);
  assert.equal(state.run.kind, 'adventure');
  assert.equal(state.run.modifiers.length, 0);
});

test('ship identity survives the engagement', () => {
  const entity = entityWithFit(hitchFittings('mod_twin_mount'));
  const before = snapshotShipIdentity(entity);
  const state = { run: createRunState({ kind: 'adventure' }) };
  state.run.score = 40;
  state.run.wave = 6;
  specFromFit(entity.data.fittings, 'wpn_pulse_laser_s', state);
  liveSpec(entity.data.fittings, 'wpn_pulse_laser_s', state);
  const after = snapshotShipIdentity(entity);
  assert.equal(shipIdentityUnchanged(before, after), true);
  assert.equal(after.fingerprint.includes('mod_twin_mount'), true);
});

test('exit gate: three fitted KINDs without a draft, plus a combined Hitch engagement', () => {
  const state = { run: createRunState({ kind: 'adventure' }) };
  const volley = specFromFit(hitchFittings('mod_twin_mount'), 'wpn_pulse_laser_s', state);
  const bank = specFromFit(hitchFittings('mod_bank_shot'), 'wpn_pulse_laser_s', state);
  const chain = specFromFit(hitchFittings('mod_relay_arc'), 'wpn_pulse_laser_s', state);
  const combined = specFromFit(
    hitchFittings('mod_twin_mount', 'unique_mirrorjaw_pulse'),
    'unique_mirrorjaw_pulse',
    state,
  );

  const volleyKinds = causalKindsFromSpec(volley);
  const bankKinds = causalKindsFromSpec(bank);
  const chainKinds = causalKindsFromSpec(chain);
  const combinedKinds = causalKindsFromSpec(combined);
  assert.deepEqual(volleyKinds, ['VOLLEY']);
  assert.deepEqual(bankKinds, ['BANK']);
  assert.deepEqual(chainKinds, ['CHAIN']);
  assert.ok(combinedKinds.includes('VOLLEY'));
  assert.ok(combinedKinds.includes('BANK'));
  assert.ok(combinedKinds.includes('CHAIN'));

  const volleyDist = causalDistributionForSpec(volley, [{ generation: 0, hasBounced: false }]);
  const bankDist = causalDistributionForSpec(bank, [{ generation: 0, hasBounced: true }]);
  const chainDist = causalDistributionForSpec(chain, [{ generation: 1, hasBounced: false }]);
  const combinedDist = causalDistributionForSpec(combined, [
    { generation: 0, hasBounced: false },
    { generation: 0, hasBounced: true },
    { generation: 1, hasBounced: false },
  ]);

  assert.ok(volleyDist.DIRECT > 0);
  assert.equal(volleyDist.BANK, 0);
  assert.equal(volleyDist.CHAIN, 0);
  assert.ok(bankDist.BANK > 0);
  assert.equal(bankDist.DIRECT, 0);
  assert.ok(chainDist.CHAIN > 0);
  assert.ok(combinedDist.DIRECT > 0 && combinedDist.BANK > 0 && combinedDist.CHAIN > 0);

  const acquired = {
    VOLLEY: ADVENTURE_TRAIT_MAP_BY_ID.mod_twin_mount.acquisition,
    BANK: ADVENTURE_TRAIT_MAP_BY_ID.mod_bank_shot.acquisition,
    CHAIN: ADVENTURE_TRAIT_MAP_BY_ID.mod_relay_arc.acquisition,
  };

  console.log('PQ-133.11 mapping table');
  for (const row of mappingTable()) {
    console.log(`  ${row.crucible} -> ${row.form} ${row.adventure} via ${row.acquired.join('+')}`);
  }
  console.log('PQ-133.11 causal distributions (fitted, no draft)');
  console.log('  volley', describeAttackMetrics(volley), volleyDist, 'acquired', acquired.VOLLEY);
  console.log('  bank', describeAttackMetrics(bank), bankDist, 'acquired', acquired.BANK);
  console.log('  chain', describeAttackMetrics(chain), chainDist, 'acquired', acquired.CHAIN);
  console.log('  combined Hitch', describeAttackMetrics(combined), combinedDist, combinedKinds);
});

test('Mirrorjaw Pulse bakes Bank Shot and Bank Relay from the weapon, not a draft', () => {
  const mods = attackModifiersFromFit(
    entityWithFit(hitchFittings(null, 'unique_mirrorjaw_pulse')),
    WEAPON_BY_ID.get('unique_mirrorjaw_pulse'),
  );
  assert.deepEqual(mods, [['mod_bank_relay', 1], ['mod_bank_shot', 1]]);
});

test('arena laws are existing sites; idle rooms keep their KINDs', () => {
  assert.deepEqual(ADVENTURE_ARENA_SITES.map((row) => row.arenaId).sort(), [...ADVENTURE_LIVE_ARENA_IDS].sort());
  const lagrange = lawForSite('lagrange_crucible');
  assert.ok(lagrange.fields.some((field) => field.kind === 'well'));
  const cinder = lawForSite('cinder_sluice');
  assert.ok(cinder.fields.some((field) => field.kind === 'cone'));
  const cryo = lawForSite('cryo_drift');
  assert.ok(cryo.fields.length >= 2);
  const storm = lawForSite('storm_lattice');
  assert.ok(Array.isArray(storm.fields));
  const forge = lawForSite('helios_core');
  assert.equal(forge.cover, true);
  const sluice = ADVENTURE_ARENA_SITES.find((row) => row.arenaId === 'cinder_sluice');
  assert.equal(sluice.siteId, 'world_site_ceres_cinder_sluice');
});

test('wave roles become living doctrines over existing enemies', () => {
  const complete = assertRoleDoctrinesComplete();
  assert.equal(complete.ok, true, `unmapped roles: ${complete.missing.join(',')}`);
  for (const row of ADVENTURE_ROLE_DOCTRINES) {
    const enemy = ENEMY_BY_ID.get(row.enemyId);
    assert.ok(enemy, row.enemyId);
    assert.equal(enemy.combatDoctrineId, row.combatDoctrineId);
    assert.equal(doctrineForWaveRole(row.role).enemyId, row.enemyId);
  }
});

test('Twin Mount can be taught on the hunter ladder, and lab shortcuts stay off the player path', () => {
  const twin = ADVENTURE_TRAIT_MAP_BY_ID.mod_twin_mount;
  assert.ok(twin.acquisition.includes('training'));
  assert.equal(twin.training.careerId, 'hunter');
  assert.ok(HUNTER_LADDER_STEP_IDS.includes(twin.training.stepId));

  const starterIds = new Set(COMBAT_LAB_STARTER_PACKAGES.map((row) => row.id));
  for (const row of ADVENTURE_COMBAT_LAB_SHORTCUTS) {
    assert.equal(row.developerOnly, true);
    assert.equal(starterIds.has(row.id), false);
    assert.ok(developerShortcut(row.id));
  }
  const labSource = readFileSync(join(ROOT, 'src/data/combatLab.js'), 'utf8');
  assert.equal(labSource.includes('adventureCombatLab'), false);
  const uiSource = readFileSync(join(ROOT, 'src/ui/screens/crucible.js'), 'utf8');
  assert.equal(uiSource.includes('adventureCombatLab'), false);
  const migration = readFileSync(join(ROOT, 'src/systems/adventureMigration.js'), 'utf8');
  assert.equal(migration.includes("from './survivalDraft.js'"), false);
  assert.equal(migration.includes("from './survivalRewards.js'"), false);
});
