import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createSimulation } from '../src/core/sim.js';
import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  UNIQUE_WRECKS,
  placementForUniqueWreck,
  programSeedFor,
  promoteToAuthored,
  uniqueWreckById,
  validateUniqueWreckRegistry,
} from '../src/data/uniqueWrecks.js';
import { salvagePoolForWreck } from '../src/data/salvageLegality.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { salvageActions } from '../src/systems/salvageActions.js';
import { ships } from '../src/systems/ships.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { createMarketNews } from '../src/ui/marketNews.js';
import { uniqueWreckMapReadouts } from '../src/ui/uniqueWreckMapLayer.js';
import { resolveCourseTarget } from '../src/ui/galaxyMap.js';

const D10 = 'wreck_choir_tender';
const D1 = 'wreck_isc_vigilant';

function boot({ seed = 47010, sectorId = 'sector_helios_prime', cargoCap = 40 } = {}) {
  const sim = createSimulation({
    seed,
    systems: [salvageActions, uniqueWrecks, cargo, economy, ships],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  state.player.cargo.capVolume = cargoCap;
  state.player.cargo.capMass = 1e9;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;

  const events = [];
  for (const name of [
    'news:publish', 'news:headline', 'uniqueWreck:rumorRecorded', 'uniqueWreck:bearingFixed',
    'uniqueWreck:salvaged', 'module:granted', 'contraband:scanned', 'toast',
  ]) bus.on(name, (payload) => events.push({ name, payload }));

  const news = createMarketNews({
    state,
    bus,
    helpers: { voice: { say: () => true } },
  });
  return {
    sim, state, bus, player, events, news,
    system: sim.registry.get('uniqueWrecks'),
    dispose() { news.destroy(); sim.dispose(); },
  };
}

function recordOf(t, wreckId) {
  return t.state.player.uniqueWrecks.bearings[wreckId] || null;
}

function liveWreck(t, wreckId) {
  return t.state.entityList.find((entity) => entity.alive !== false && entity.data && entity.data.uniqueWreckId === wreckId) || null;
}

function countInventory(t, defId) {
  return t.state.player.moduleInventory.filter((entry) => entry.defId === defId).length;
}

function scanPos(record) {
  // Scanner pulses and live entity positions share the authoritative global_v1 frame.
  return record.exactPos;
}

test('R1 registry pins the two authored wrecks, provenance adapter, and named base-family variants', () => {
  assert.equal(UNIQUE_WRECKS.length, 12, 'the live D1-D12 reservation program stays fully authored');
  assert.deepEqual(validateUniqueWreckRegistry(), { ok: true, errors: [] });

  const teacher = uniqueWreckById(D10);
  assert.deepEqual({
    programSlot: teacher.programSlot,
    wreckClass: teacher.wreckClass,
    sectorId: teacher.sectorId,
    uniqueDropId: teacher.uniqueDropId,
    sourceRef: teacher.rumorSources[0].sourceRef,
    bonusCargo: teacher.bonusCargo,
  }, {
    programSlot: 'D10',
    wreckClass: 'fresh',
    sectorId: 'sector_helios_prime',
    uniqueDropId: 'unique_knitbots',
    sourceRef: 'news.tragedy_at_helios',
    bonusCargo: [{ commodityId: 'cmdty_medical', qty: 50 }],
  });
  assert.equal(teacher.reactor.timerS >= 45, true, 'teaching wreck reactor must allow a gentle recovery window');

  const proof = uniqueWreckById(D1);
  assert.deepEqual({
    programSlot: proof.programSlot,
    wreckClass: proof.wreckClass,
    sectorId: proof.sectorId,
    uniqueDropId: proof.uniqueDropId,
    scanRequirement: proof.scanRequirement,
    sourceRefs: proof.rumorSources.map((source) => source.sourceRef),
  }, {
    programSlot: 'D1',
    wreckClass: 'military',
    sectorId: 'sector_veil_nebula',
    uniqueDropId: 'unique_veil_cutter',
    scanRequirement: 'mod_survey_suite',
    sourceRefs: ['news.losses_in_the_veil', 'loss.vigilant'],
  });

  const beamBase = WEAPONS.find((entry) => entry.id === 'wpn_beam_laser_m');
  const veilCutter = WEAPONS.find((entry) => entry.id === 'unique_veil_cutter');
  assert.deepEqual({ range: beamBase.range, heatPerSec: beamBase.heatPerSec }, { range: 520, heatPerSec: 55 });
  assert.deepEqual({
    baseId: veilCutter.baseId,
    range: veilCutter.range,
    spreadDeg: veilCutter.spreadDeg,
    heatPerSec: veilCutter.heatPerSec,
    price: veilCutter.price,
    unique: veilCutter.unique,
    salvageOnly: veilCutter.salvageOnly,
    requiresTech: veilCutter.requiresTech,
  }, {
    baseId: 'wpn_beam_laser_m',
    range: 598,
    spreadDeg: 0.3,
    heatPerSec: 66,
    price: 0,
    unique: true,
    salvageOnly: true,
    requiresTech: undefined,
  });

  const repairBase = MODULES.find((entry) => entry.id === 'mod_repair_nanobots_m');
  const knitbots = MODULES.find((entry) => entry.id === 'unique_knitbots');
  assert.equal(repairBase.mods.hullRepairOOC, 4);
  assert.deepEqual({
    baseId: knitbots.baseId,
    repair: knitbots.mods.hullRepairOOC,
    repairDockedDrones: knitbots.mods.repairDockedDrones,
    price: knitbots.price,
    unique: knitbots.unique,
    salvageOnly: knitbots.salvageOnly,
    requiresTech: knitbots.requiresTech,
  }, {
    baseId: 'mod_repair_nanobots_m',
    repair: 4.4,
    repairDockedDrones: true,
    price: 0,
    unique: true,
    salvageOnly: true,
    requiresTech: undefined,
  });

  const authored = promoteToAuthored({
    authoredWreckId: D1,
    lossId: 'loss_vigilant',
    sectorId: 'sector_veil_nebula',
    factionId: 'faction_scn',
    sourceRef: 'loss.vigilant',
  });
  assert.equal(authored.wreckClass, 'military');
  assert.equal(authored.provenance.source, 'authored-unique');
  assert.equal(authored.provenance.authoredWreckId, D1);
  assert.equal(authored.provenance.lossId, 'loss_vigilant');
});

test('placement and fuzzy bearings are order-independent functions of (programSeed, wreckId, sectorId)', () => {
  const programSeed = programSeedFor(918273);
  const first = placementForUniqueWreck(programSeed, D10, 'sector_helios_prime');
  placementForUniqueWreck(programSeed, D1, 'sector_veil_nebula');
  const second = placementForUniqueWreck(programSeed, D10, 'sector_helios_prime');
  assert.deepEqual(first, second);
  assert.equal(first.coordSpace, 'global_v1');
  assert.equal(Math.hypot(
    first.exactGlobal.x - first.bearingCenterGlobal.x,
    first.exactGlobal.z - first.bearingCenterGlobal.z,
  ) < first.radius, true, 'fuzzy ring must contain but not disclose the exact wreck');
  assert.notDeepEqual(first.exactGlobal, first.bearingCenterGlobal);

  const otherSeed = placementForUniqueWreck(programSeedFor(918274), D10, 'sector_helios_prime');
  assert.notDeepEqual(otherSeed.exactGlobal, first.exactGlobal);

  for (const source of ['../src/data/uniqueWrecks.js', '../src/systems/uniqueWrecks.js']) {
    const text = readFileSync(new URL(source, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /Math\.random\s*\(/, `${source}: sim placement cannot use Math.random`);
    assert.doesNotMatch(text, /Date\.now\s*\(/, `${source}: durable state cannot use wall clock`);
  }
});

test('D10 ticker creates a post-read bearing, scan fixes it, and the recovery choice grants medical plus Knitbots once', () => {
  const t = boot();
  try {
    assert.equal(recordOf(t, D10), null, 'no read means no map knowledge');
    t.bus.emit('game:started', {});

    const rumor = recordOf(t, D10);
    assert.ok(rumor);
    assert.equal(rumor.phase, 'rumored');
    assert.equal(rumor.sourceRef, 'news.tragedy_at_helios');
    assert.equal(rumor.fixedPos, null);
    assert.match(t.state.ui.marketNews.log[0].text, /^TRAGEDY AT HELIOS: RELIEF FREIGHTER LOST\b/);
    assert.equal(t.events.filter((entry) => entry.name === 'uniqueWreck:rumorRecorded').length, 1);

    const wreck = liveWreck(t, D10);
    assert.ok(wreck, 'post-rumor authored wreck materializes in the current sector');
    assert.equal(wreck.data.provenance.source, 'authored-unique');
    assert.equal(wreck.data.scanLabel.includes('???'), false);
    assert.equal(wreck.data.unstableReactor, undefined, 'the search clock cannot expire before the wreck is identified');

    t.bus.emit('scan:pulse', { pos: scanPos(rumor) });
    assert.equal(recordOf(t, D10).phase, 'fixed');
    assert.deepEqual(recordOf(t, D10).fixedPos, rumor.exactPos);
    assert.equal(wreck.data.unstableReactor.dueAt - t.state.simTime >= 45, true,
      'the gentle reactor counterplay begins only after the scan fixes the wreck');

    t.bus.emit('salvage:completed', { wreckId: wreck.id, loot: {} });
    assert.equal(recordOf(t, D10).phase, 'decision');
    assert.equal(countInventory(t, 'unique_knitbots'), 0, 'named hardware waits for an explicit claim');
    t.bus.emit('uniqueWreck:choose', { wreckId: D10, choiceId: 'claim_hardware', source: 'test' });
    assert.equal(recordOf(t, D10).phase, 'salvaged');
    assert.equal(t.state.player.cargo.items.cmdty_medical, 50);
    assert.equal(countInventory(t, 'unique_knitbots'), 1);
    assert.deepEqual(t.state.player.flags.uniqueWrecksVisited, [D10]);
    assert.equal(t.events.some((entry) => entry.name === 'news:publish' && entry.payload.followup === true), true);

    t.bus.emit('salvage:completed', { wreckId: wreck.id, loot: {} });
    t.bus.emit('uniqueWreck:choose', { wreckId: D10, choiceId: 'claim_hardware', source: 'duplicate' });
    assert.equal(t.state.player.cargo.items.cmdty_medical, 50, 'repeat completion cannot duplicate cargo');
    assert.equal(countInventory(t, 'unique_knitbots'), 1, 'repeat completion cannot stack a unique');
  } finally {
    t.dispose();
  }
});

test('opening D10 rumor records and materializes without competing with staged onboarding', async () => {
  const t = boot();
  try {
    // Registry order initializes uniqueWrecks before onboarding. Establish tutorial ownership from
    // a later listener in the same synchronous game:started dispatch, exactly like production.
    t.bus.on('game:started', () => {
      t.state.onboarding = { active: true, finished: false };
    });
    t.bus.emit('game:started', {});
    await Promise.resolve();

    assert.ok(recordOf(t, D10), 'onboarding never suppresses durable wreck knowledge');
    assert.ok(liveWreck(t, D10), 'the authored wreck still materializes on the default route');
    assert.equal(
      t.events.some((entry) => entry.name === 'toast'
        && /rumor charted/i.test(String(entry.payload && entry.payload.text || ''))),
      false,
      'optional wreck discovery does not open a second objective card over the tutorial command',
    );
  } finally {
    t.dispose();
  }
});

test('D1 uses its loss-investigation channel, Survey Suite gate, and the existing restricted-cargo fine path', () => {
  const t = boot({ sectorId: 'sector_veil_nebula', cargoCap: 200 });
  try {
    t.bus.emit('lossInvestigation:authoredRead', {
      authoredWreckId: D1,
      lossId: 'loss_vigilant',
      sectorId: 'sector_veil_nebula',
      sourceRef: 'loss.vigilant',
      channelId: 'loss_investigation',
    });
    const rumor = recordOf(t, D1);
    assert.ok(rumor);
    assert.equal(rumor.sourceRef, 'loss.vigilant');
    assert.equal(rumor.channelId, 'loss_investigation');
    const wreck = liveWreck(t, D1);
    assert.ok(wreck);
    assert.equal(wreck.data.wreckClass, 'military');
    assert.deepEqual(
      salvagePoolForWreck(wreck, { cmdty_salvage_electronics: 2 }),
      { cmdty_classified_salvage: 2 },
    );

    t.bus.emit('scan:pulse', { pos: scanPos(rumor) });
    assert.equal(recordOf(t, D1).phase, 'rumored', 'military proof stays fuzzy without a Survey Suite');
    t.state.player.moduleInventory.push({ instanceId: 'survey-proof', defId: 'mod_survey_suite' });
    t.bus.emit('scan:pulse', { pos: scanPos(rumor) });
    assert.equal(recordOf(t, D1).phase, 'fixed');

    t.bus.emit('salvage:completed', { wreckId: wreck.id, loot: {} });
    assert.equal(recordOf(t, D1).phase, 'decision');
    t.bus.emit('uniqueWreck:choose', { wreckId: D1, choiceId: 'claim_hardware', source: 'test' });
    assert.equal(countInventory(t, 'unique_veil_cutter'), 1);
    assert.equal(t.state.player.cargo.items.cmdty_classified_salvage, 2);
    const economySystem = t.sim.registry.get('economy');
    economySystem._rng = () => 0;
    const result = economySystem.runScan({ security: 1, scannerCloak: 0, factionId: 'faction_scn' });
    assert.equal(result.found, true);
    assert.equal(result.fine > 0, true);
    assert.equal(t.state.player.cargo.items.cmdty_classified_salvage || 0, 0);
    assert.equal(t.events.filter((entry) => entry.name === 'contraband:scanned').length, 1);
  } finally {
    t.dispose();
  }
});

test('the unified map exposes only post-read rings and gives a course only after scan hardening', () => {
  const t = boot();
  try {
    assert.deepEqual(uniqueWreckMapReadouts(t.state, 'sector_helios_prime'), []);
    t.bus.emit('news:headline', {
      headline: 'TRAGEDY AT HELIOS: RELIEF FREIGHTER LOST',
      wreckId: D10,
      sourceRef: 'news.tragedy_at_helios',
      channelId: 'news',
    });
    const [ring] = uniqueWreckMapReadouts(t.state, 'sector_helios_prime');
    assert.equal(ring.phase, 'rumored');
    assert.equal(ring.courseTarget, null);
    assert.equal(JSON.stringify(ring).includes('???'), false);

    t.bus.emit('scan:pulse', { pos: scanPos(recordOf(t, D10)) });
    const [fixed] = uniqueWreckMapReadouts(t.state, 'sector_helios_prime');
    assert.equal(fixed.phase, 'fixed');
    assert.ok(fixed.courseTarget);
    const course = resolveCourseTarget(fixed.courseTarget);
    assert.deepEqual(course.pos, fixed.fixedPos);
    assert.equal(course.type, 'bearing');
  } finally {
    t.dispose();
  }
});
