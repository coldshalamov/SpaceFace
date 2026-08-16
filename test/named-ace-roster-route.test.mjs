import assert from 'node:assert/strict';
import test from 'node:test';

import { isPdScreenActor } from '../src/ai/pdScreen.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { MODULES } from '../src/data/modules.js';
import { launchAces } from '../src/data/namedAces.js';
import { WEAPONS } from '../src/data/weapons.js';
import { createSimulation } from '../src/core/sim.js';
import { aceMemory } from '../src/systems/aceMemory.js';
import { combat } from '../src/systems/combat.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { mines } from '../src/systems/mines.js';
import { missions } from '../src/systems/missions.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';

const ITEM_IDS = new Set([...MODULES, ...WEAPONS].map((def) => def.id));
const ENEMY_IDS = new Set(ENEMY_TYPES.map((def) => def.id));

test('the launch roster is twelve authored ships with distinct paint, mechanics, physical uniques, and named tech', () => {
  const aces = launchAces();
  assert.equal(aces.length, 12);
  assert.equal(new Set(aces.map((ace) => ace.id)).size, 12);
  assert.equal(new Set(aces.map((ace) => `${ace.appearance.hullColor}/${ace.appearance.accentColor}`)).size, 12,
    'every named ship has a distinct data-driven paint read');
  assert.equal(new Set(aces.map((ace) => ace.gimmick.id)).size, 12,
    'the roster must not rename one generic gimmick twelve times');
  assert.equal(new Set(aces.map((ace) => ace.reward.uniqueItemId)).size, 12,
    'each Ace owns one exclusive physical fitting recipe');
  assert.equal(new Set(aces.flatMap((ace) => Object.values(ace.botRoutes).map((route) => route.id))).size, 36,
    'gimmick, escape, and recurrence each have an exact per-Ace bot route');

  for (const ace of aces) {
    assert.ok(ace.name && ace.crew && ace.spawnStory && ace.barStory);
    assert.ok(ace.barks.opening && ace.barks.return && ace.barks.flee && ace.barks.playerLoss);
    assert.ok(ace.gimmick.label && ace.gimmick.mechanic && ace.gimmick.counter);
    assert.ok(ENEMY_IDS.has(ace.gimmick.runtime), `${ace.id} gimmick must resolve to a production enemy route`);
    assert.ok(ITEM_IDS.has(ace.reward.uniqueItemId), `${ace.id} physical reward must already exist in the fitting catalogs`);
    assert.match(ace.reward.uniqueItemId, /^unique_/);
    assert.ok(ace.reward.bountyCr > 0 && ace.reward.researchPoints > 0);
    assert.match(ace.reward.techId, /^ace_tech_/);
    assert.equal(ace.botRoutes.gimmick.aceId, ace.id);
    assert.equal(ace.botRoutes.escape.assertion, 'physical_boundary_crossed_before_receipt');
    assert.equal(ace.botRoutes.recurrence.assertion, 'return_reenters_named_hunter_with_same_ace_id');
  }
});

function bootAce(aceId, suffix) {
  const sim = createSimulation({
    seed: 0xace160,
    systems: [spawnBudget, combat, missions, aceMemory, mines, encounterDirector],
    updateOrder: [encounterDirector, mines, combat, missions, aceMemory],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_sker_haven';
  const player = sim.spawn({
    type: 'ship', team: 0, factionId: 'faction_free',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    hull: 300, hullMax: 300, shield: 0, shieldMax: 0,
    armorHp: 0, armorMax: 0, cap: 100, capMax: 100,
    radius: 10, mass: 100, data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  const encounterId = `test:named-ace-roster:${suffix}`;
  const requested = sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: 'named_hunter', encounterId,
    sectorId: state.world.currentSectorId, zoneId: 'zone_sker_gatecamp',
    anchor: { x: 0, z: 0 }, zoneRadius: 620,
    data: { aceId }, force: true,
  });
  assert.deepEqual(requested, { ok: true, encounterId });
  const live = state.encounterDirector.live[encounterId];
  const boss = live.ids.filter((id) => live.roles[id] === 'boss')
    .map((id) => state.entities.get(id))[0];
  assert.ok(boss);
  return { sim, state, bus, player, live, boss };
}

function engage(route) {
  route.state.simTime = route.live.data.engageAt;
  route.state.encounterDirector._accum = 1;
  route.sim.step();
  assert.equal(route.live.phase, 'conflict');
}

test('every Ace gimmick bot route reaches its production consumer on the named encounter', () => {
  for (const ace of launchAces()) {
    const route = bootAce(ace.id, `consumer:${ace.id}`);
    assert.equal(route.boss.data.namedAceId, ace.id);
    assert.equal(route.boss.data.enemyTypeId, ace.gimmick.runtime);
    assert.deepEqual(route.boss.data.appearance, ace.appearance);
    assert.equal(route.boss.data.namedAceReward.uniqueItemId, ace.reward.uniqueItemId);
    const escorts = route.live.ids.filter((id) => route.live.roles[id] === 'escort')
      .map((id) => route.state.entities.get(id));
    assert.ok(escorts.length > 0);
    assert.ok(escorts.every((escort) => escort.data.namedAceId == null && escort.data.appearance == null),
      `${ace.id} identity, paint, and payout must stay on the named hull`);

    switch (ace.gimmick.runtime) {
      case 'tether_control_raider':
        assert.equal(route.boss.data.ai.combatDoctrineId, 'tether_control_raider');
        break;
      case 'lancer_sniper':
        assert.ok(route.boss.data.weapons.some((weapon) => weapon.id === 'wpn_railgun_m' && weapon.range >= 1100));
        break;
      case 'reaver_pirate':
        assert.equal(route.boss.data.reinforcements.type, 'wasp_swarmer');
        break;
      case 'harrier_kiter':
        assert.ok(route.boss.maxSpeed >= 146);
        assert.ok(route.boss.data.weapons.some((weapon) => weapon.range >= 880));
        break;
      case 'field_anchor_controller':
        assert.equal(route.boss.data.fieldAnchor.defKey, 'anchorSnare');
        assert.ok(route.boss.data.fieldAnchor.radius > 200);
        break;
      case 'jammer_specialist':
        assert.equal(route.boss.data.enemyTypeId, 'jammer_specialist',
          'the specialist presentation owner keys the bounded contact smear from enemyTypeId');
        break;
      case 'mine_layer_jackal':
        engage(route);
        assert.equal(route.live.data.minesSeeded.length, 3);
        assert.ok(route.live.data.minesSeeded.every((id) => route.state.entities.get(id)?.type === 'mine'));
        break;
      case 'pd_screen_escort':
        assert.equal(isPdScreenActor(route.boss), true);
        assert.equal(route.boss.data.weapons.filter((weapon) => weapon.id === 'wpn_flak_turret_s').length, 2);
        break;
      case 'quiet_ghost':
        assert.ok(route.boss.data.weapons.some((weapon) => weapon.id === 'wpn_emp_disruptor_m'));
        assert.ok(route.boss.data.weapons.some((weapon) => weapon.id === 'wpn_railgun_m'));
        break;
      case 'choir_zealot':
        assert.ok(escorts.every((escort) => escort.data.lootTableId === 'choir_zealot'));
        break;
      case 'bruiser_brawler':
        assert.ok(route.boss.mass >= 70 && route.boss.data.ai.combatDoctrineId === 'brawler_commit');
        break;
      case 'hostile_repair_tender':
        engage(route);
        assert.equal(route.live.data.repairTender.initialized, true);
        assert.equal(route.live.data.repairTender.droneIds.length, 1);
        assert.equal(route.state.entities.get(route.live.data.repairTender.droneIds[0]).data.kind,
          'repair_tender_drone');
        break;
      default:
        assert.fail(`unproved named-Ace runtime: ${ace.gimmick.runtime}`);
    }
    route.sim.dispose();
  }
});

test('Jex seeds a physical mine wake and a player kill pays all three reward channels once', () => {
  const route = bootAce('ace_jex_wake_salt', 'jex');
  const credits = [];
  const research = [];
  const drops = [];
  route.bus.on('economy:grantCredits', (payload) => credits.push(structuredClone(payload)));
  route.bus.on('research:grant', (payload) => research.push(structuredClone(payload)));
  route.bus.on('loot:drop', (payload) => drops.push(structuredClone(payload)));

  assert.equal(route.boss.data.namedAceGimmick.runtime, 'mine_layer_jackal');
  assert.equal(route.boss.data.appearance.hullColor, '#182b31');
  engage(route);
  assert.equal(route.live.data.minesSeeded.length, 3);
  for (const id of route.live.data.minesSeeded) {
    const mine = route.state.entities.get(id);
    assert.equal(mine.type, 'mine');
    assert.equal(mine.data.mineLayerWake, true);
  }

  route.sim.registry.get('combat').kill(route.boss, route.player.id);
  assert.ok(credits.some((row) => row.reason === 'bounty' && row.amount === 900));
  assert.equal(research.length, 1);
  assert.equal(research[0].source, 'ace_tech_salt_wake');
  assert.equal(research[0].amount, 19);
  assert.ok(drops.some((row) => row.items.some((item) => item.id === 'unique_smokesong_chaff')));
  const pickup = [...route.state.entities.values()].find((entity) => (
    entity.type === 'pickup' && entity.data.commodityId === 'unique_smokesong_chaff'
  ));
  assert.ok(pickup, 'the unique fitting must materialize as a real collectible entity');

  route.bus.emit('entity:killed', { id: route.boss.id, killerId: route.player.id });
  assert.equal(research.length, 1, 'the named-tech receipt is durable and one-shot');
  route.sim.dispose();
});

test('Noll enters the named route as the production point-defense actor', () => {
  const route = bootAce('ace_noll_curtain', 'noll');
  assert.equal(route.boss.data.namedAceGimmick.runtime, 'pd_screen_escort');
  assert.equal(route.boss.data.lootTableId, null,
    'the Ace-authored payout does not publish the unchanged archetype loot table');
  assert.equal(route.boss.data.enemyTypeId, 'pd_screen_escort');
  assert.equal(isPdScreenActor(route.boss), true);
  assert.equal(route.boss.data.weapons.filter((weapon) => weapon.id === 'wpn_flak_turret_s').length, 2);
  engage(route);
  assert.equal(route.boss.data.ai.passive, false);
  route.sim.dispose();
});
