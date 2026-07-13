import test from 'node:test';
import assert from 'node:assert/strict';

import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import { FLAVOR_SOURCE_BY_REF } from '../src/data/flavor/index.generated.js';
import {
  UNIQUE_WRECKS,
  placementForUniqueWreck,
  programSeedFor,
  promoteToAuthored,
  uniqueWreckById,
  validateUniqueWreckRegistry,
} from '../src/data/uniqueWrecks.js';
import { salvagePoolForWreck } from '../src/data/salvageLegality.js';

const CANON = Object.freeze([
  { slot: 'D1', id: 'wreck_isc_vigilant', cls: 'military', sector: 'sector_veil_nebula', source: 'loss.vigilant', channel: 'loss_investigation' },
  { slot: 'D2', id: 'wreck_dmc_ironsong', cls: 'military', sector: 'sector_nyx_march', source: 'comms.ironsing_gun', channel: 'comms_intercept' },
  { slot: 'D3', id: 'wreck_isc_lighthouse', cls: 'military', sector: 'sector_ashfall_reach', source: 'campaign.lighthouse_reveal', channel: 'campaign' },
  { slot: 'D4', id: 'wreck_lanebreaker_pale_coil', cls: 'ancient', sector: 'sector_phoebe_echo', source: 'mission.the_lost_coils', channel: 'mission' },
  { slot: 'D5', id: 'wreck_choir_bell_aegis', cls: 'ancient', sector: 'sector_triton_wake', source: 'bark.singing_bell', channel: 'bark' },
  { slot: 'D6', id: 'wreck_gravhand_tideline', cls: 'ancient', sector: 'sector_eunomia_gulf', source: 'news.hand_that_fed_the_gulf', channel: 'news' },
  { slot: 'D7', id: 'wreck_nestbreaker', cls: 'battlefield', sector: 'sector_sker_haven', source: 'bar.sker.nestbreaker', channel: 'bar' },
  { slot: 'D8', id: 'wreck_deepsurvey', cls: 'battlefield', sector: 'sector_haumea_rift', source: 'bar.rift_observatory.deepsurvey', channel: 'bar' },
  { slot: 'D9', id: 'wreck_smokesong', cls: 'battlefield', sector: 'sector_io_reach', source: 'bar.io_mercenary.smokesong', channel: 'bar' },
  { slot: 'D10', id: 'wreck_choir_tender', cls: 'fresh', sector: 'sector_helios_prime', source: 'news.tragedy_at_helios', channel: 'news' },
  { slot: 'D11', id: 'wreck_mts_silver_draft', cls: 'fresh', sector: 'sector_helios_prime', source: 'bar.helios_meridian.silver_draft', channel: 'bar' },
  { slot: 'D12', id: 'wreck_choir_cassandra', cls: 'fresh', sector: 'sector_haumea_rift', source: 'campaign.cassandra_reveal', channel: 'campaign' },
]);

const EXPECTED_PRIMARY_CHANNEL_SPREAD = Object.freeze({
  bar: 4,
  news: 2,
  comms_intercept: 1,
  bark: 1,
  mission: 1,
  campaign: 2,
  loss_investigation: 1,
});

function bySlot(slot) {
  return UNIQUE_WRECKS.find((wreck) => wreck.programSlot === slot);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function refId(value) {
  return typeof value === 'string' ? value : value?.id;
}

test('R2 registry carries all twelve canon identities and all seven primary rumor channels', () => {
  assert.equal(UNIQUE_WRECKS.length, 12, 'R2 is not a partial registry');
  assert.deepEqual(validateUniqueWreckRegistry(), { ok: true, errors: [] });
  assert.deepEqual(UNIQUE_WRECKS.map((wreck) => wreck.programSlot), CANON.map((row) => row.slot));

  const spread = {};
  for (const expected of CANON) {
    const wreck = uniqueWreckById(expected.id);
    assert.ok(wreck, `${expected.slot} is registered`);
    assert.deepEqual({
      programSlot: wreck.programSlot,
      wreckClass: wreck.wreckClass,
      sectorId: wreck.sectorId,
      bearingSourceRef: wreck.bearingSourceRef,
    }, {
      programSlot: expected.slot,
      wreckClass: expected.cls,
      sectorId: expected.sector,
      bearingSourceRef: expected.source,
    });
    const primary = array(wreck.rumorSources).find((source) => source.sourceRef === wreck.bearingSourceRef);
    assert.ok(primary, `${expected.slot} primary bearing source is an authored rumor source`);
    assert.equal(primary.channelId, expected.channel);
    assert.equal(FLAVOR_SOURCE_BY_REF[expected.source]?.wreckId, expected.id);
    assert.equal(FLAVOR_SOURCE_BY_REF[expected.source]?.channelId, expected.channel);
    spread[expected.channel] = (spread[expected.channel] || 0) + 1;
  }
  assert.deepEqual(spread, EXPECTED_PRIMARY_CHANNEL_SPREAD);
});

test('all twelve placements are deterministic, order-independent, fuzzy, and seed-sensitive', () => {
  const seed = programSeedFor(0x47a2d00d);
  for (const row of CANON) assert.ok(uniqueWreckById(row.id), `${row.slot} must exist before placement can be audited`);
  if (UNIQUE_WRECKS.length !== CANON.length) return;
  const forward = CANON.map((row) => placementForUniqueWreck(seed, row.id, row.sector));
  const reverse = [...CANON].reverse().map((row) => placementForUniqueWreck(seed, row.id, row.sector)).reverse();
  assert.deepEqual(reverse, forward, 'registry iteration order cannot perturb placement');

  let changed = 0;
  const otherSeed = programSeedFor(0x47a2d00e);
  for (let index = 0; index < CANON.length; index += 1) {
    const placement = forward[index];
    assert.equal(placement.coordSpace, 'global_v1');
    assert.equal(Number.isFinite(placement.seed), true);
    assert.equal(placement.radius > 0, true);
    assert.notDeepEqual(placement.exactGlobal, placement.bearingCenterGlobal);
    assert.equal(
      Math.hypot(
        placement.exactGlobal.x - placement.bearingCenterGlobal.x,
        placement.exactGlobal.z - placement.bearingCenterGlobal.z,
      ) < placement.radius,
      true,
      `${CANON[index].slot} fuzzy ring contains its exact point without disclosing it`,
    );
    const alternate = placementForUniqueWreck(otherSeed, CANON[index].id, CANON[index].sector);
    if (JSON.stringify(alternate.exactGlobal) !== JSON.stringify(placement.exactGlobal)) changed += 1;
  }
  assert.equal(changed >= 10, true, 'changing the immutable save seed should move substantially all wrecks');
});

test('R2 hazard and complication metadata preserves the named canon gates', () => {
  const lighthouse = bySlot('D3');
  assert.ok(array(lighthouse?.hazardContext?.hazardTypes).includes('radiation'));
  assert.match(String(lighthouse?.hazardContext?.approachGate || ''), /moving.*radiation|radiation.*window/i);

  const tideline = bySlot('D6');
  assert.equal(array(tideline?.encounterRefs).some((entry) => refId(entry) === 'unique_wreck_tideline_held_mass'), true);

  const deepsurvey = bySlot('D8');
  assert.equal(array(deepsurvey?.encounterRefs).some((entry) => refId(entry) === 'unique_wreck_deepsurvey_ping_elite'), true);

  const teacher = bySlot('D10');
  assert.equal(teacher?.scanRequirement ?? null, null);
  assert.equal(teacher?.placement?.maxRadius <= 1200, true, 'teaching wreck stays near spawn');
  assert.equal(teacher?.reactor?.timerS >= 45, true, 'reactor counterplay starts with a generous window');
  assert.equal(
    [...array(teacher?.complications), ...array(teacher?.encounterRefs)]
      .some((entry) => /combat|hostile|boss|elite/i.test(
        typeof entry === 'string' ? entry : `${entry.kind || ''} ${entry.id || ''}`,
      )),
    false,
    'D10 has no combat complication',
  );

  const silverDraft = bySlot('D11');
  const cleaner = array(silverDraft?.seededTimers).find((timer) => /cleaner/i.test(`${timer.id || ''} ${timer.kind || ''} ${timer.label || ''}`));
  assert.ok(cleaner, 'D11 declares its cleaner as a seeded timer');
  assert.equal(Number.isFinite(cleaner.minS) && Number.isFinite(cleaner.maxS) && cleaner.maxS > cleaner.minS, true);
});

test('military wrecks use the existing restricted salvage path and authored provenance', () => {
  const restrictedSlots = CANON.filter((row) => row.cls === 'military').map((row) => row.slot);
  assert.deepEqual(restrictedSlots, ['D1', 'D2', 'D3']);
  for (const slot of restrictedSlots) {
    const wreck = bySlot(slot);
    assert.ok(wreck, `${slot} is registered`);
    if (!wreck) continue;
    const authored = promoteToAuthored({
      authoredWreckId: wreck.id,
      sectorId: wreck.sectorId,
      sourceRef: wreck.bearingSourceRef,
    });
    assert.equal(authored?.parentType, 'military', `${slot} promotes into the restricted parent class`);
    assert.deepEqual(
      salvagePoolForWreck({ data: authored }, { cmdty_salvage_electronics: 2 }),
      { cmdty_classified_salvage: 2 },
      `${slot} reuses Concord's fine/confiscation commodity path`,
    );
  }
});

test('every equippable unique is a base-family salvage-only variant with no purchase or tech gate', () => {
  const catalogue = new Map([...WEAPONS, ...MODULES].map((entry) => [entry.id, entry]));
  const uniqueIds = new Set();
  let storyRewardCount = 0;

  for (const wreck of UNIQUE_WRECKS) {
    const drops = array(wreck.uniqueDrops);
    assert.equal(drops.length > 0, true, `${wreck.programSlot} has at least one named drop`);
    const equippable = drops.filter((drop) => drop.kind === 'weapon' || drop.kind === 'module');
    for (const drop of equippable) {
      assert.equal(uniqueIds.has(drop.id), false, `${drop.id} belongs to one wreck only`);
      uniqueIds.add(drop.id);
      const variant = catalogue.get(drop.id);
      assert.ok(variant, `${drop.id} exists in the runtime item catalogue`);
      assert.equal(variant.baseId, drop.baseId);
      assert.ok(catalogue.has(drop.baseId), `${drop.id} wraps a shipped base family`);
      assert.deepEqual({ price: variant.price, unique: variant.unique, salvageOnly: variant.salvageOnly }, {
        price: 0,
        unique: true,
        salvageOnly: true,
      });
      assert.equal(variant.requiresTech == null, true, `${drop.id} is gated by discovery, not tech-tree purchase`);
    }
    for (const drop of drops.filter((entry) => entry.kind === 'story_commodity' || entry.kind === 'story_data')) {
      storyRewardCount += 1;
      assert.equal(typeof drop.flagKey === 'string' && drop.flagKey.length > 0, true, `${drop.id} has a durable story flag`);
    }
    assert.equal(wreck.uniqueDropId, equippable[0]?.id || null, `${wreck.programSlot} primary grant is its first equippable variant`);
  }

  assert.equal(uniqueIds.size, 12, 'the set contains one equippable unique per wreck');
  assert.equal(storyRewardCount, 2, 'Lost Ledger and Cassandra Treaty are durable story rewards');
});
