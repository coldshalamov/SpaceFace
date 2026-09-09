import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  DOSS_ARCHIVE_CONTACT_ID,
  DOSS_ARCHIVE_COUNTER_ID,
  DOSS_ARCHIVE_MAP_TARGET,
  DOSS_ARCHIVE_SOURCES,
  dossArchiveEvidence,
  dossArchiveMapOffer,
} from '../src/data/dossArchive.js';
import { stationContacts } from '../src/systems/stationContacts.js';
import { MAP_FOCUS, MAP_SCREEN_ID } from '../src/ui/mapAuthority.js';
import { applyMapOpenIntentToView } from '../src/ui/galaxyMap.js';
import { buildReply, openDossArchiveMap } from '../src/ui/station/barContacts.js';

const VESTA_DETAIL = Object.freeze({
  preserve: 'Seal left intact. The fixed cache remains in the ship chart for a later return.',
  report: 'DMC dispatch acknowledged the sealed cache report.',
  take: 'Seal opened. Six units of legal nickel ore remain a physical recovery, limited by hold space.',
});
const VESTA_PHASE = Object.freeze({ preserve: 'preserved', report: 'reported', take: 'taken' });
const LUNG_BODY = Object.freeze({
  rescue: 'The hab-pod survivors were recovered alive. The snapped tether is logged as a completed rescue.',
  blackbox: 'The hab-pod black box was secured. The snapped tether incident is closed without a second claim.',
  strip: 'The snapped hab-pod was stripped for components. The survivor signal is closed in the case record.',
  abandoned: 'The incident was abandoned on departure from Charon Expanse. No recovery settlement was issued.',
  failed: 'The Lung of Charon recovery closed without a settlement.',
});

function makeState() {
  return {
    simTime: 91,
    player: {
      credits: 730,
      cargo: { items: { cmdty_ore_bronzium: 2 } },
      stationContacts: {},
      stationContactCounters: {},
    },
    stationLife: { traffic: [] },
    world: { discovery: {} },
    ui: {},
    nav: { waypoint: { id: 'keep-me', kind: 'nav' } },
    missions: { active: [{ id: 'keep-mission' }] },
    economy: { markets: { station_helios: {} } },
    factions: { faction_dmc: { rep: 7 } },
  };
}

function boot(state = makeState()) {
  const bus = createBus();
  stationContacts.init({ state, bus });
  return { state, bus };
}

function close() {
  stationContacts.destroy();
}

function addVesta(state, choiceId = 'report') {
  const phase = VESTA_PHASE[choiceId];
  state.world.vestaOreCache = {
    recordId: 'vesta-ore-cache:shift-end:v1',
    phase,
    choiceId,
    resolvedAt: 70,
    receipt: {
      id: 'vesta-ore-cache:resolution:v1',
      recordId: 'vesta-ore-cache:shift-end:v1',
      sectorId: 'sector_vesta_forge',
      cachePoiId: 'poi_vesta_ore_cache',
      choiceId,
      outcome: phase,
      title: `SHIFT-END CACHE ${choiceId.toUpperCase()}`,
      detail: VESTA_DETAIL[choiceId],
      resolvedAt: 70,
      ...(choiceId === 'report' ? { factionId: 'faction_dmc', repDelta: 6 } : {}),
      ...(choiceId === 'take' ? {
        lotId: 'vesta-ore-cache-lot:v1', commodityId: 'cmdty_ore_bronzium', totalQty: 6,
      } : {}),
    },
  };
}

function addObelisk(state) {
  state.world.discovery.sector_veil_nebula = {
    pois: {
      poi_anomaly: {
        discovered: true,
        identified: true,
        investigated: true,
        investigatedAt: 71,
        type: 'anomaly',
        name: 'The Resonance Obelisk',
      },
    },
  };
}

function addLung(state, outcome = 'abandoned') {
  state.world.discovery.sector_charon_expanse = {
    pois: {
      poi_charon_tether_wreck: {
        discovered: true,
        identified: true,
        investigated: true,
        landmarkArtifact: {
          id: 'case:lung-of-charon:recovery:poi_charon_tether_wreck',
          title: 'The Lung of Charon',
          body: LUNG_BODY[outcome],
          sourceRef: 'landmark_c7_lung_of_charon',
          returnedAt: 72,
        },
      },
    },
  };
}

function publish(sourceId, state, bus) {
  if (sourceId === 'vesta') {
    addVesta(state);
    bus.emit('vestaOreCache:resolved', {
      recordId: 'vesta-ore-cache:shift-end:v1',
      choiceId: 'report',
    });
    return;
  }
  if (sourceId === 'obelisk') {
    addObelisk(state);
    bus.emit('discovery:plateUnlocked', { sectorId: 'sector_veil_nebula', poiId: 'poi_anomaly' });
    return;
  }
  addLung(state);
  bus.emit('discovery:plateUnlocked', {
    sectorId: 'sector_charon_expanse', poiId: 'poi_charon_tether_wreck', artifactId: 'case:lung-of-charon:recovery:poi_charon_tether_wreck',
  });
}

function dossFlags(state) {
  return Object.keys(state.player.stationContacts[DOSS_ARCHIVE_CONTACT_ID]?.flags || {}).sort();
}

test('Doss derives the same three source flags through all six physical discovery orders', () => {
  const orders = [
    ['vesta', 'obelisk', 'lung'], ['vesta', 'lung', 'obelisk'],
    ['obelisk', 'vesta', 'lung'], ['obelisk', 'lung', 'vesta'],
    ['lung', 'vesta', 'obelisk'], ['lung', 'obelisk', 'vesta'],
  ];
  const expectedFlags = DOSS_ARCHIVE_SOURCES.map((source) => source.flag).sort();
  for (const order of orders) {
    const { state, bus } = boot();
    try {
      for (let index = 0; index < order.length; index++) {
        publish(order[index], state, bus);
        assert.equal(state.player.stationContactCounters[DOSS_ARCHIVE_COUNTER_ID], index + 1, order.join(' -> '));
      }
      assert.deepEqual(dossFlags(state), expectedFlags, order.join(' -> '));
      assert.deepEqual(dossArchiveEvidence(state).map((entry) => entry.id), [
        'vesta_shift_end_cache', 'veil_resonance_obelisk', 'lung_of_charon_case',
      ]);
    } finally {
      close();
    }
  }
});

test('Doss filters unrelated plates and duplicate/replayed receipts remain a derived count', () => {
  const { state, bus } = boot();
  try {
    addObelisk(state);
    bus.emit('discovery:plateUnlocked', { sectorId: 'sector_veil_nebula', poiId: 'not_the_obelisk' });
    assert.equal(state.player.stationContactCounters[DOSS_ARCHIVE_COUNTER_ID], 0, 'unrelated plate does not scan raw state broadly');

    publish('obelisk', state, bus);
    publish('vesta', state, bus);
    publish('lung', state, bus);
    const before = structuredClone({
      flags: state.player.stationContacts[DOSS_ARCHIVE_CONTACT_ID].flags,
      count: state.player.stationContactCounters[DOSS_ARCHIVE_COUNTER_ID],
    });
    bus.emit('vestaOreCache:resolved', { recordId: 'vesta-ore-cache:shift-end:v1', choiceId: 'report' });
    bus.emit('discovery:plateUnlocked', { sectorId: 'sector_veil_nebula', poiId: 'poi_anomaly' });
    bus.emit('discovery:plateUnlocked', { sectorId: 'sector_charon_expanse', poiId: 'poi_charon_tether_wreck' });
    assert.deepEqual({
      flags: state.player.stationContacts[DOSS_ARCHIVE_CONTACT_ID].flags,
      count: state.player.stationContactCounters[DOSS_ARCHIVE_COUNTER_ID],
    }, before, 'each receipt projects one stable source rather than incrementing');
  } finally {
    close();
  }
});

test('Doss save reconciliation deletes corrupt source flags and rebuilds only raw durable evidence', () => {
  const { state, bus } = boot();
  try {
    addLung(state, 'abandoned');
    state.player.stationContacts[DOSS_ARCHIVE_CONTACT_ID] = {
      met: true,
      talkCount: 4,
      flags: {
        choice_reward: true,
        doss_vesta_shift_end_cache: true,
        doss_veil_resonance_obelisk: true,
        doss_lung_of_charon_case: true,
      },
    };
    state.player.stationContactCounters[DOSS_ARCHIVE_COUNTER_ID] = 20;
    bus.emit('save:loaded', { slot: 'corrupt-doss' });
    assert.deepEqual(dossFlags(state), ['choice_reward', 'doss_lung_of_charon_case']);
    assert.equal(state.player.stationContactCounters[DOSS_ARCHIVE_COUNTER_ID], 1);

    delete state.world.discovery.sector_charon_expanse;
    bus.emit('save:loaded', { slot: 'source-gone' });
    assert.deepEqual(dossFlags(state), ['choice_reward']);
    assert.equal(state.player.stationContactCounters[DOSS_ARCHIVE_COUNTER_ID], 0);
  } finally {
    close();
  }
});

test('Doss replies cite only validated source text, including the abandoned Lung outcome, and promise no fake reward', () => {
  const state = makeState();
  addVesta(state, 'preserve');
  addLung(state, 'abandoned');
  const contact = { id: DOSS_ARCHIVE_CONTACT_ID, depthProgram: 'G14', line: 'fallback' };
  const ctx = { state, bus: createBus() };
  const document = buildReply('merchant', 'document', ctx, 'station_helios', contact);
  const changes = buildReply('merchant', 'changes', ctx, 'station_helios', contact);
  const reward = buildReply('merchant', 'reward', ctx, 'station_helios', contact);
  for (const reply of [document, changes, reward]) {
    assert.match(reply.text, /Seal left intact\. The fixed cache remains in the ship chart for a later return\./);
    assert.match(reply.text, /abandoned on departure from Charon Expanse/i);
    assert.doesNotMatch(reply.text, /Resonance Obelisk/i, 'unvalidated source must not enter Doss copy');
  }
  assert.match(reward.text, /no credit allotment or mission attached/i);
  assert.equal(reward.dossArchiveMapOffer, undefined);
});

test('Doss accepts only exact Vesta terminal receipts and reserves DMC acknowledgement for REPORT', () => {
  const contact = { id: DOSS_ARCHIVE_CONTACT_ID, depthProgram: 'G14' };
  for (const choiceId of ['preserve', 'report', 'take']) {
    const state = makeState();
    addVesta(state, choiceId);
    const reply = buildReply('merchant', 'document', { state, bus: createBus() }, 'station_helios', contact);
    assert.match(reply.text, new RegExp(VESTA_DETAIL[choiceId].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(/DMC dispatch acknowledged/i.test(reply.text), choiceId === 'report');
    state.world.vestaOreCache.receipt.detail = 'forged summary';
    assert.equal(dossArchiveEvidence(state).length, 0, `${choiceId} receipt fails closed when its source copy changes`);
  }
});

test('Doss rejects malformed raw timestamps and terminal artifacts during save reconciliation', () => {
  const invalidCases = [
    {
      label: 'Vesta terminal state null resolvedAt',
      flag: 'doss_vesta_shift_end_cache',
      mutate: (state) => { state.world.vestaOreCache.resolvedAt = null; },
    },
    {
      label: 'Vesta resolution receipt string resolvedAt',
      flag: 'doss_vesta_shift_end_cache',
      mutate: (state) => { state.world.vestaOreCache.receipt.resolvedAt = '70'; },
    },
    {
      label: 'Vesta state and receipt must carry the same numeric resolution time',
      flag: 'doss_vesta_shift_end_cache',
      mutate: (state) => { state.world.vestaOreCache.receipt.resolvedAt = 71; },
    },
    {
      label: 'Obelisk string investigatedAt',
      flag: 'doss_veil_resonance_obelisk',
      mutate: (state) => { state.world.discovery.sector_veil_nebula.pois.poi_anomaly.investigatedAt = '71'; },
    },
    {
      label: 'Lung artifact infinite returnedAt',
      flag: 'doss_lung_of_charon_case',
      mutate: (state) => { state.world.discovery.sector_charon_expanse.pois.poi_charon_tether_wreck.landmarkArtifact.returnedAt = Infinity; },
    },
    {
      label: 'Lung artifact unknown terminal outcome',
      flag: 'doss_lung_of_charon_case',
      mutate: (state) => { state.world.discovery.sector_charon_expanse.pois.poi_charon_tether_wreck.landmarkArtifact.body = 'Unfiled outcome.'; },
    },
  ];

  for (const invalid of invalidCases) {
    const { state, bus } = boot();
    try {
      publish('vesta', state, bus);
      publish('obelisk', state, bus);
      publish('lung', state, bus);
      assert.equal(state.player.stationContactCounters[DOSS_ARCHIVE_COUNTER_ID], 3, invalid.label);
      invalid.mutate(state);
      bus.emit('save:loaded', { slot: invalid.label });
      assert.equal(state.player.stationContactCounters[DOSS_ARCHIVE_COUNTER_ID], 2, invalid.label);
      assert.equal(dossFlags(state).includes(invalid.flag), false, invalid.label);
      assert.equal(dossArchiveMapOffer(state), null, `${invalid.label} cannot unlock the Candle Fleet CTA`);
    } finally {
      close();
    }
  }

  const legacy = makeState();
  addVesta(legacy, 'report');
  addObelisk(legacy);
  addLung(legacy, 'abandoned');
  legacy.world.vestaOreCache.resolvedAt = 0;
  legacy.world.vestaOreCache.receipt.resolvedAt = 0;
  legacy.world.discovery.sector_veil_nebula.pois.poi_anomaly.investigatedAt = 0;
  legacy.world.discovery.sector_charon_expanse.pois.poi_charon_tether_wreck.landmarkArtifact.returnedAt = 0;
  const restored = boot(legacy);
  try {
    assert.equal(restored.state.player.stationContactCounters[DOSS_ARCHIVE_COUNTER_ID], 3, 'numeric zero remains a valid legacy timestamp');
    assert.ok(dossArchiveMapOffer(restored.state));
  } finally {
    close();
  }
});

test('the completed Doss archive offers only the Candle Fleet system-map handoff and stale evidence fails closed', () => {
  const state = makeState();
  addVesta(state, 'take');
  addObelisk(state);
  addLung(state, 'abandoned');
  const contact = { id: DOSS_ARCHIVE_CONTACT_ID, depthProgram: 'G14' };
  const reply = buildReply('merchant', 'reward', { state, bus: createBus() }, 'station_helios', contact);
  assert.deepEqual(reply.dossArchiveMapOffer, {
    ...DOSS_ARCHIVE_MAP_TARGET,
    pos: { ...DOSS_ARCHIVE_MAP_TARGET.pos },
  });
  assert.match(reply.text, /Seal opened\. Six units of legal nickel ore remain a physical recovery/i);
  assert.match(reply.text, /physically investigated after triangulation/i);
  assert.match(reply.text, /abandoned on departure from Charon Expanse/i);

  const before = structuredClone({
    player: state.player,
    nav: state.nav,
    missions: state.missions,
    economy: state.economy,
    factions: state.factions,
  });
  const pushed = [];
  assert.equal(openDossArchiveMap({
    state,
    screenManager: { pushScreen: (id) => pushed.push(id), top: () => null },
  }), true);
  assert.deepEqual(pushed, [MAP_SCREEN_ID]);
  assert.deepEqual(state.ui.mapOpenIntent, {
    focus: MAP_FOCUS.SYSTEM,
    sectorId: 'sector_helios_prime',
    missionId: null,
    stationId: null,
    pos: { x: 1680, z: -820 },
    label: 'The Candle Fleet',
    source: 'station-bar:doss-archive',
  });
  const view = applyMapOpenIntentToView(
    { zoom: 1, targetZoom: 1, cams: { galaxy: { cx: 0, cy: 0 }, system: { cx: 0, cy: 0 }, local: { cx: 0, cy: 0 } } },
    state.ui.mapOpenIntent,
    state,
  );
  assert.deepEqual(view.cams.system, { cx: 1680, cy: -820 }, 'the map opens focused on Candle Fleet’s authored anchor');
  assert.deepEqual({
    player: state.player,
    nav: state.nav,
    missions: state.missions,
    economy: state.economy,
    factions: state.factions,
  }, before, 'map handoff does not write cargo, economy, mission, faction, or navigation state');

  delete state.world.vestaOreCache;
  const intentBefore = structuredClone(state.ui.mapOpenIntent);
  assert.equal(dossArchiveMapOffer(state), null);
  assert.equal(openDossArchiveMap({ state }), false, 'stale completed reply cannot open a map handoff');
  assert.deepEqual(state.ui.mapOpenIntent, intentBefore, 'failed stale handoff leaves UI intent untouched');
});
