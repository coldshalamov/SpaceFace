import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fixerCacheOffer,
  frontierRumorOffer,
  frontierRumorOwned,
} from '../src/data/frontierRumors.js';
import { SECTORS } from '../src/data/sectors.js';
import { FIXER_CONTACT, fixerMemoryFor } from '../src/data/stationContacts.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { buildReply, generateContacts } from '../src/ui/screens/bar.js';
import { frontierRumorMapReadouts } from '../src/ui/frontierRumorMapLayer.js';

const SEED = 0x52f17;
const HOME_STATION = 'station_helios';

test('Nera enters through a paid bar rumor, sells one physical cache lead, and remembers its outcome', () => {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: SEED });
  try {
    const { state, bus } = runtime;
    const voices = [];
    const outcomes = [];
    runtime.getSystem('stationContacts').helpers.voice = {
      say: (payload) => voices.push(structuredClone(payload)),
    };
    bus.on('fixer:outcomeRemembered', (payload) => outcomes.push(structuredClone(payload)));
    state.player.credits = 10_000;
    state.mode = 'station';
    state.ui.docked = true;
    state.ui.dockedStationId = HOME_STATION;

    assert.equal(fixerCacheOffer(state, HOME_STATION), null, 'no history means no Fixer offer');
    assert.equal(
      generateContacts(HOME_STATION, state).some((contact) => contact.id === FIXER_CONTACT.id),
      false,
      'Nera is not a fixed-script bar contact',
    );

    // The real World purchase owner validates and charges the ordinary bar card. Its acquired
    // receipt is the causal history that introduces Nera; the trigger is not counted as her sale.
    const introduction = frontierRumorOffer(state, HOME_STATION);
    assert.ok(introduction && introduction.source === 'bar');
    const beforeIntroduction = state.player.credits;
    bus.emit('ui:purchaseFrontierRumor', { rumorId: introduction.id, stationId: HOME_STATION });
    assert.equal(frontierRumorOwned(state, introduction.id), true);
    assert.equal(state.player.credits, beforeIntroduction - introduction.price);

    let memory = fixerMemoryFor(state);
    assert.equal(memory.unlocked, true);
    assert.equal(memory.homeStationId, HOME_STATION);
    assert.equal(memory.triggerRumorId, introduction.id);
    assert.equal(memory.purchaseCount, 0, 'the introduction does not become a forged Fixer sale');
    const contact = generateContacts(HOME_STATION, state)
      .find((candidate) => candidate.id === FIXER_CONTACT.id);
    assert.ok(contact, 'Nera is physically present in the triggering station bar rail');
    assert.equal(
      generateContacts('station_beltout', state).some((candidate) => candidate.id === FIXER_CONTACT.id),
      false,
      'the recurring contact is not omnipresent across docked bars',
    );

    const reply = buildReply('fixer', 'cache', { state, bus }, HOME_STATION, contact);
    const cache = reply.frontierRumorOffer;
    assert.ok(cache);
    assert.equal(cache.source, 'fixer');
    assert.equal(cache.kind, 'cache');
    assert.match(reply.text, /sell the ring; you find the cache/i);
    const sector = SECTORS.find((candidate) => candidate.id === cache.sectorId);
    const poi = sector && (sector.pois || []).find((candidate) => candidate.id === cache.targetId);
    assert.equal(poi && poi.type, 'cache', 'the lead targets an authored physical cache POI');
    assert.ok(poi && poi.runtimeOwner, 'the cache has a live physical runtime owner');

    const beforeCache = state.player.credits;
    bus.emit('ui:purchaseFrontierRumor', { rumorId: cache.id, stationId: HOME_STATION });
    assert.equal(frontierRumorOwned(state, cache.id), true);
    assert.equal(state.player.credits, beforeCache - cache.price);
    memory = fixerMemoryFor(state);
    assert.equal(memory.purchaseCount, 1);
    assert.deepEqual(memory.openLeadIds, [cache.id]);
    const readout = frontierRumorMapReadouts(state, cache.sectorId)
      .find((candidate) => candidate.rumorId === cache.id);
    assert.ok(readout);
    assert.equal(readout.courseTarget, null, 'Nera sells an approximate search, not autopilot');
    assert.equal(readout.fixedPos, null, 'Nera does not reveal the cache coordinates');

    // Off-board work uses the production World residency and discovery seams. Entering the target
    // sector materializes the authored cache facility; its ordinary POI discovery resolves the card.
    state.mode = 'flight';
    state.ui.docked = false;
    state.ui.dockedStationId = null;
    runtime.getSystem('world').enterSector(cache.sectorId, { placePlayer: false });
    const physicalCache = Array.from(state.entities.values()).find((entity) =>
      entity && entity.data && (
        entity.data.poiId === cache.targetId
        || entity.data.heistFacilityId === cache.targetId
        || entity.data.cacheId === cache.targetId
      ));
    assert.ok(physicalCache, 'the cache exists as a live World entity after sector entry');
    bus.emit('poi:discovered', { poiId: cache.targetId, sectorId: cache.sectorId, type: 'cache' });
    assert.equal(state.world.frontierRumors.byId[cache.id].phase, 'resolved');
    assert.equal(frontierRumorMapReadouts(state, cache.sectorId).some((row) => row.rumorId === cache.id), false);
    memory = fixerMemoryFor(state);
    assert.equal(memory.outcomeCount, 1);
    assert.equal(memory.lastOutcomeRumorId, cache.id);
    assert.equal(memory.lastOutcomeReason, 'poi_found');
    assert.deepEqual(memory.openLeadIds, []);
    assert.equal(outcomes.length, 1);

    const savedContacts = JSON.parse(JSON.stringify(state.player.stationContacts));
    const savedFixer = savedContacts[FIXER_CONTACT.id].fixer;
    assert.deepEqual(
      Object.keys(savedFixer).filter((key) => /bearing|price|wallet|credits|target|sector|poi/i.test(key)),
      [],
      'Nera stores only her own bounded sales/outcome memory, never a rumor or wallet mirror',
    );
    assert.ok(savedFixer.openLeadIds.length <= 8);
    assert.ok(voices.length >= 2);
    for (const voice of voices) {
      assert.ok(voice.text.trim().split(/\s+/).length <= 12, `voice bark stays short: ${voice.text}`);
    }

    const continued = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: SEED });
    try {
      continued.state.player.stationContacts = savedContacts;
      continued.bus.emit('save:loaded', {});
      const restored = fixerMemoryFor(continued.state);
      assert.equal(restored.unlocked, true);
      assert.equal(restored.purchaseCount, 1);
      assert.equal(restored.outcomeCount, 1);
      assert.equal(restored.lastOutcomeReason, 'poi_found');
      assert.deepEqual(restored.openLeadIds, []);
      assert.ok(generateContacts(HOME_STATION, continued.state)
        .some((candidate) => candidate.id === FIXER_CONTACT.id));
    } finally {
      continued.dispose();
    }
  } finally {
    runtime.dispose();
  }
});
