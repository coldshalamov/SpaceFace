import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import {
  complicationEncounterId,
  deterministicTimer,
  movingRadiationGate,
  rewardDescriptors,
} from '../src/core/uniqueWreckComplications.js';
import {
  UNIQUE_WRECKS,
  programSeedFor,
  uniqueWreckById,
} from '../src/data/uniqueWrecks.js';
import { FLAVOR_SOURCE_BY_REF } from '../src/data/flavor/index.generated.js';
import {
  RUMOR_EVENT_BY_CHANNEL,
  uniqueWrecks,
} from '../src/systems/uniqueWrecks.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { cargo } from '../src/systems/cargo.js';
import { ships } from '../src/systems/ships.js';

const EXPECTED_NATIVE_EVENTS = Object.freeze({
  news: 'news:headline',
  comms_intercept: 'comms:popup',
  bark: 'barkDirector:voice',
  mission: 'mission:accepted',
  campaign: 'story:beatAdvanced',
  loss_investigation: 'lossInvestigation:authoredRead',
  bar: 'uniqueWreck:rumorHeard',
});

function boot(def, seed = 47022, { rewards = false, director = false } = {}) {
  const systems = [
    ...(director ? [encounterDirector] : []),
    uniqueWrecks,
    ...(rewards ? [cargo, ships] : []),
  ];
  const sim = createSimulation({ seed, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = def?.sectorId || 'sector_helios_prime';
  state.player.cargo.capVolume = 1000;
  state.player.cargo.capMass = 1e9;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  const events = [];
  for (const name of [
    'uniqueWreck:rumorRecorded',
    'uniqueWreck:scanBlocked',
    'uniqueWreck:bearingFixed',
    'uniqueWreck:complicationScheduled',
    'uniqueWreck:complicationTriggered',
    'uniqueWreck:encounterRequested',
    'uniqueWreck:storyRewardGranted',
    'pickup:collected',
  ]) bus.on(name, (payload) => events.push({ name, payload }));
  return {
    sim,
    state,
    bus,
    events,
    system: sim.registry.get('uniqueWrecks'),
    dispose: () => sim.dispose(),
  };
}

function primarySource(def) {
  return def.rumorSources.find((source) => source.sourceRef === def.bearingSourceRef);
}

function exactSourceText(sourceRef) {
  return FLAVOR_SOURCE_BY_REF[sourceRef].lines.map((line) => line.text).join(' ');
}

function emitRumor(t, def) {
  const source = primarySource(def);
  assert.ok(source, `${def.programSlot} has a primary source`);
  const event = RUMOR_EVENT_BY_CHANNEL[source.channelId];
  assert.equal(typeof event, 'string');
  t.bus.emit(event, {
    wreckId: def.id,
    sourceRef: source.sourceRef,
    channelId: source.channelId,
    authoredWreckId: def.id,
  });
  return t.state.player.uniqueWrecks.bearings[def.id] || null;
}

function eventRows(t, name, wreckId = null) {
  return t.events.filter((entry) => entry.name === name
    && (wreckId == null || entry.payload?.wreckId === wreckId));
}

function liveWreck(t, wreckId) {
  return t.state.entityList.find((entry) => entry.alive !== false
    && entry.data?.uniqueWreckId === wreckId) || null;
}

function scanPos(record) {
  return record.exactPos;
}

function gateTime(t, def, record, allowed) {
  for (let simTime = 0; simTime <= 900; simTime += 1) {
    t.state.simTime = simTime;
    if (movingRadiationGate(t.state, record, def).allowed === allowed) return simTime;
  }
  return null;
}

function prepareScanRequirement(t, def) {
  if (!def.scanRequirement) return;
  if (!t.state.player.moduleInventory.some((entry) => entry.defId === def.scanRequirement)) {
    t.state.player.moduleInventory.push({
      instanceId: `r2-test:${def.scanRequirement}`,
      defId: def.scanRequirement,
    });
  }
}

function fixBearing(t, def, record) {
  prepareScanRequirement(t, def);
  if (String(def.hazardContext?.approachGate || '').includes('moving')) {
    const openAt = gateTime(t, def, record, true);
    assert.notEqual(openAt, null, `${def.programSlot} has an open scan window`);
    t.state.simTime = openAt;
  }
  t.bus.emit('scan:pulse', { pos: scanPos(record) });
  return t.state.player.uniqueWrecks.bearings[def.id];
}

test('non-origin wrecks keep map, physical spawn, scan, and encounter anchors in global_v1 truth', () => {
  const def = uniqueWreckById('wreck_smokesong');
  const t = boot(def);
  try {
    const record = emitRumor(t, def);
    const expectedGlobal = scanPos(record);
    assert.equal(record.coordSpace, 'global_v1');
    const wreck = liveWreck(t, def.id);
    assert.deepEqual(
      { x: wreck?.pos.x, z: wreck?.pos.z },
      expectedGlobal,
      'the physical wreck spawns in the same galactic-global space as ships and stations',
    );

    t.bus.emit('scan:pulse', { pos: expectedGlobal });
    assert.equal(record.phase, 'fixed', 'a pulse at the physical global position fixes the global bearing');
    assert.deepEqual(record.fixedPos, record.exactPos, 'map/save coordinates remain global after the scan');
  } finally {
    t.dispose();
  }
});

test('the seven canonical channels subscribe to their shipped native carrier events', () => {
  assert.deepEqual(RUMOR_EVENT_BY_CHANNEL, EXPECTED_NATIVE_EVENTS);
  const t = boot(uniqueWreckById('wreck_choir_tender'));
  try {
    for (const event of Object.values(EXPECTED_NATIVE_EVENTS)) {
      assert.equal(t.bus._listeners.has(event), true, `uniqueWrecks listens to ${event}`);
    }
  } finally {
    t.dispose();
  }
});

test('every native rumor carrier records only its canonical primary source', () => {
  assert.equal(UNIQUE_WRECKS.length, 12);
  for (const def of UNIQUE_WRECKS) {
    const source = primarySource(def);
    const t = boot(def);
    try {
      assert.equal(t.state.player.uniqueWrecks.bearings[def.id], undefined, `${def.programSlot} is invisible before reading`);
      const wrongChannel = source.channelId === 'news' ? 'bar' : 'news';
      t.bus.emit(RUMOR_EVENT_BY_CHANNEL[wrongChannel], {
        wreckId: def.id,
        sourceRef: source.sourceRef,
        channelId: wrongChannel,
        authoredWreckId: def.id,
      });
      assert.equal(t.state.player.uniqueWrecks.bearings[def.id], undefined, `${def.programSlot} rejects a spoofed carrier`);

      const record = emitRumor(t, def);
      assert.ok(record, `${def.programSlot} records from ${source.channelId}`);
      assert.deepEqual({
        wreckId: record.wreckId,
        sourceRef: record.sourceRef,
        channelId: record.channelId,
        phase: record.phase,
      }, {
        wreckId: def.id,
        sourceRef: source.sourceRef,
        channelId: source.channelId,
        phase: 'rumored',
      });
    } finally {
      t.dispose();
    }
  }
});

test('the D1 news preview cannot reveal coordinates before the loss case is read', () => {
  const def = uniqueWreckById('wreck_isc_vigilant');
  const t = boot(def);
  try {
    t.bus.emit(RUMOR_EVENT_BY_CHANNEL.news, {
      wreckId: def.id,
      authoredWreckId: def.id,
      sourceRef: 'news.losses_in_the_veil',
      channelId: 'news',
    });
    assert.equal(t.state.player.uniqueWrecks.bearings[def.id], undefined);
    assert.ok(emitRumor(t, def), 'the authored loss-investigation read grants the bearing');
  } finally {
    t.dispose();
  }
});

test('the non-UI rumor bridges publish their authentic native copy once before recording a bearing', () => {
  const cases = [
    {
      wreckId: 'wreck_isc_vigilant',
      triggerEvent: 'lossInvestigation:promoted',
      triggerPayload: { lossId: 'loss_vigilant', title: 'Losses in the Veil' },
      carrierEvent: 'lossInvestigation:authoredRead',
      sourceRef: 'loss.vigilant',
      channelId: 'loss_investigation',
    },
    {
      wreckId: 'wreck_dmc_ironsong',
      triggerEvent: 'sector:enter',
      triggerPayload: { sectorId: 'sector_nyx_march' },
      carrierEvent: 'comms:popup',
      sourceRef: 'comms.ironsing_gun',
      channelId: 'comms_intercept',
    },
    {
      wreckId: 'wreck_isc_lighthouse',
      triggerEvent: 'story:beatAdvanced',
      triggerPayload: { toIndex: 7 },
      carrierEvent: 'comms:popup',
      sourceRef: 'campaign.lighthouse_reveal',
      channelId: 'campaign',
    },
    {
      wreckId: 'wreck_choir_bell_aegis',
      triggerEvent: 'barkDirector:voice',
      triggerPayload: {
        sectorId: 'sector_triton_wake',
        factionId: 'faction_vael',
        situation: 'patrol_contact',
      },
      carrierEvent: 'barkDirector:voice',
      sourceRef: 'bark.singing_bell',
      channelId: 'bark',
    },
    {
      wreckId: 'wreck_gravhand_tideline',
      triggerEvent: 'sector:enter',
      triggerPayload: { sectorId: 'sector_eunomia_gulf' },
      carrierEvent: 'news:publish',
      sourceRef: 'news.hand_that_fed_the_gulf',
      channelId: 'news',
    },
    {
      wreckId: 'wreck_choir_cassandra',
      triggerEvent: 'story:beatAdvanced',
      triggerPayload: { toIndex: 6 },
      carrierEvent: 'comms:popup',
      sourceRef: 'campaign.cassandra_reveal',
      channelId: 'campaign',
    },
  ];

  for (const row of cases) {
    const def = uniqueWreckById(row.wreckId);
    const t = boot(def);
    const carriers = [];
    const off = t.bus.on(row.carrierEvent, (payload) => {
      if (payload?.sourceRef === row.sourceRef) carriers.push(payload);
    });
    try {
      assert.equal(t.state.player.uniqueWrecks.bearings[row.wreckId], undefined);
      t.bus.emit(row.triggerEvent, { ...row.triggerPayload });
      t.bus.emit(row.triggerEvent, { ...row.triggerPayload });

      assert.equal(carriers.length, 1, `${row.sourceRef} publishes once`);
      assert.deepEqual({
        wreckId: carriers[0].wreckId,
        sourceRef: carriers[0].sourceRef,
        channelId: carriers[0].channelId,
        text: carriers[0].text,
      }, {
        wreckId: row.wreckId,
        sourceRef: row.sourceRef,
        channelId: row.channelId,
        text: exactSourceText(row.sourceRef),
      });
      assert.deepEqual({
        wreckId: t.state.player.uniqueWrecks.bearings[row.wreckId]?.wreckId,
        sourceRef: t.state.player.uniqueWrecks.bearings[row.wreckId]?.sourceRef,
        channelId: t.state.player.uniqueWrecks.bearings[row.wreckId]?.channelId,
      }, {
        wreckId: row.wreckId,
        sourceRef: row.sourceRef,
        channelId: row.channelId,
      });
    } finally {
      off?.();
      t.dispose();
    }
  }
});

test('seeded timers are stable, bounded, order-independent, and label-separated', () => {
  const seed = programSeedFor(915731);
  const timers = UNIQUE_WRECKS.flatMap((def) => (def.seededTimers || []).map((timer) => ({ def, timer })));
  assert.equal(timers.length > 0, true, 'R2 declares at least the Silver-Draft cleaner timer');
  const forward = timers.map(({ def, timer }) => deterministicTimer(seed, def.id, timer.id, timer));
  const reverse = [...timers].reverse()
    .map(({ def, timer }) => deterministicTimer(seed, def.id, timer.id, timer))
    .reverse();
  assert.deepEqual(reverse, forward);
  for (let index = 0; index < timers.length; index += 1) {
    const { def, timer } = timers[index];
    const delay = forward[index];
    assert.equal(Number.isFinite(delay), true);
    assert.equal(delay >= timer.minS && delay <= timer.maxS, true, `${def.programSlot}/${timer.id} stays within its authored window`);
  }
  const cleaner = uniqueWreckById('wreck_mts_silver_draft').seededTimers.find((timer) => /cleaner/i.test(timer.id));
  const cleanerDelay = deterministicTimer(seed, 'wreck_mts_silver_draft', cleaner.id, cleaner);
  const otherLabelDelay = deterministicTimer(seed, 'wreck_mts_silver_draft', `${cleaner.id}:other`, cleaner);
  assert.notEqual(otherLabelDelay, cleanerDelay, 'timer purpose participates in the seed key');
});

test('D3 moving-radiation timing has both a blocked read and a deterministic open window', () => {
  const def = uniqueWreckById('wreck_isc_lighthouse');
  const record = { wreckId: def.id, heardAtS: 0, phase: 'rumored' };
  let blocked = null;
  let open = null;
  for (let simTime = 0; simTime <= 900 && (!blocked || !open); simTime += 1) {
    const state = { simTime, meta: { seed: 77821 } };
    const gate = movingRadiationGate(state, record, def);
    assert.deepEqual(movingRadiationGate(state, record, def), gate, 'same state produces the same gate result');
    if (gate.allowed) open ||= { simTime, gate };
    else blocked ||= { simTime, gate };
  }
  assert.ok(blocked, 'the moving field must sometimes cover the approach');
  assert.ok(open, 'the moving field must expose a readable timing window');
  assert.deepEqual({ allowed: blocked.gate.allowed, reason: blocked.gate.reason }, {
    allowed: false,
    reason: 'moving_radiation_window',
  });
  assert.equal(Number.isFinite(blocked.gate.phase), true);
  assert.equal(blocked.gate.nextOpenAt > blocked.simTime, true);
  assert.deepEqual({ allowed: open.gate.allowed, reason: open.gate.reason, nextOpenAt: open.gate.nextOpenAt }, {
    allowed: true,
    reason: null,
    nextOpenAt: null,
  });
  assert.equal(movingRadiationGate({ simTime: 0 }, record, uniqueWreckById('wreck_choir_tender')).allowed, true);
});

test('R2 complication helpers resolve D6/D8 encounter hooks without ambient discovery', () => {
  const d6 = uniqueWreckById('wreck_gravhand_tideline');
  const d8 = uniqueWreckById('wreck_deepsurvey');
  assert.equal(complicationEncounterId(d6, 'held_mass'), 'unique_wreck_tideline_held_mass');
  assert.equal(complicationEncounterId(d8, 'ping_elite'), 'unique_wreck_deepsurvey_ping_elite');
  assert.equal(complicationEncounterId(uniqueWreckById('wreck_choir_tender'), 'combat'), null);
});

test('reward descriptors cover every named drop and preserve D10 medical quantity', () => {
  for (const def of UNIQUE_WRECKS) {
    const rewards = rewardDescriptors(def);
    assert.equal(Array.isArray(rewards), true);
    const byId = new Map(rewards.map((reward) => [reward.id, reward]));
    for (const drop of def.uniqueDrops || []) {
      assert.equal(byId.has(drop.id), true, `${def.programSlot} exposes reward ${drop.id}`);
      assert.equal(byId.get(drop.id).kind, drop.kind);
    }
    for (const cargo of def.bonusCargo || []) {
      assert.equal(byId.get(cargo.commodityId)?.qty, cargo.qty);
    }
  }
  assert.equal(rewardDescriptors(uniqueWreckById('wreck_choir_tender')).find((reward) => reward.id === 'cmdty_medical')?.qty, 50);
});

test('D3 emits a blocked timing receipt before the same scan fixes during an open window', () => {
  const def = uniqueWreckById('wreck_isc_lighthouse');
  assert.ok(def);
  const t = boot(def);
  try {
    const record = emitRumor(t, def);
    assert.ok(record);
    const blockedAt = gateTime(t, def, record, false);
    const openAt = gateTime(t, def, record, true);
    assert.notEqual(blockedAt, null);
    assert.notEqual(openAt, null);

    t.state.simTime = blockedAt;
    t.bus.emit('scan:pulse', { pos: scanPos(record) });
    assert.equal(record.phase, 'rumored');
    assert.equal(eventRows(t, 'uniqueWreck:scanBlocked', def.id).length, 1);
    assert.equal(eventRows(t, 'uniqueWreck:scanBlocked', def.id)[0].payload.reason, 'moving_radiation_window');

    t.state.simTime = openAt;
    t.bus.emit('scan:pulse', { pos: scanPos(record) });
    assert.equal(record.phase, 'fixed');
    assert.equal(eventRows(t, 'uniqueWreck:bearingFixed', def.id).length, 1);
  } finally {
    t.dispose();
  }
});

test('D11 cleaner deadline is seeded once, survives serialize/deserialize, and triggers once on economy tick', () => {
  const def = uniqueWreckById('wreck_mts_silver_draft');
  assert.ok(def);
  const timer = def.seededTimers.find((entry) => /cleaner/i.test(entry.id));
  assert.ok(timer);
  const t = boot(def, 47033);
  try {
    t.state.simTime = 123;
    emitRumor(t, def);
    const [scheduled] = eventRows(t, 'uniqueWreck:complicationScheduled', def.id)
      .filter((entry) => /cleaner/i.test(entry.payload.kind || entry.payload.timerId || ''));
    assert.ok(scheduled, 'hearing the clerk starts the cleaner race');
    const expectedDelay = deterministicTimer(
      t.state.player.uniqueWrecks.programSeed,
      def.id,
      timer.id,
      timer,
    );
    assert.equal(scheduled.payload.dueAt, 123 + expectedDelay);

    const checkpoint = t.system.serialize();
    assert.equal(JSON.stringify(checkpoint).includes(String(scheduled.payload.dueAt)), true);
    const restored = boot(def, 47033);
    try {
      restored.system.deserialize(checkpoint);
      assert.deepEqual(restored.system.serialize(), checkpoint);
      restored.state.simTime = scheduled.payload.dueAt - 0.001;
      restored.bus.emit('economy:tick', {});
      assert.equal(eventRows(restored, 'uniqueWreck:complicationTriggered', def.id).length, 0);
      restored.state.simTime = scheduled.payload.dueAt;
      restored.bus.emit('economy:tick', {});
      restored.bus.emit('economy:tick', {});
      assert.equal(eventRows(restored, 'uniqueWreck:complicationTriggered', def.id).length, 1);
    } finally {
      restored.dispose();
    }
  } finally {
    t.dispose();
  }
});

test('D6 scan-fix requests its held-mass encounter exactly once', () => {
  const d6 = uniqueWreckById('wreck_gravhand_tideline');
  assert.ok(d6);

  const held = boot(d6);
  try {
    const record = emitRumor(held, d6);
    fixBearing(held, d6, record);
    held.bus.emit('scan:pulse', { pos: scanPos(record) });
    const requests = eventRows(held, 'uniqueWreck:encounterRequested', d6.id);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].payload.encounterId, 'unique_wreck_tideline_held_mass');
  } finally {
    held.dispose();
  }
});

test('D6 direct requests activate the self-registered held-mass script in the live director', () => {
  const cases = [
    {
      wreckId: 'wreck_gravhand_tideline',
      encounterId: 'unique_wreck_tideline_held_mass',
      pulses: 1,
    },
  ];

  for (const row of cases) {
    const def = uniqueWreckById(row.wreckId);
    const t = boot(def, 47090, { director: true });
    try {
      const record = emitRumor(t, def);
      for (let index = 0; index < row.pulses; index += 1) {
        t.bus.emit('scan:pulse', { pos: scanPos(record) });
      }
      const instanceId = `unique-wreck:${row.wreckId}:${row.encounterId}`;
      const live = t.state.encounterDirector.live[instanceId];
      assert.ok(live, `${row.encounterId} reaches the live director`);
      assert.equal(live.shapeId, row.encounterId);
      assert.equal(live.plan?.data?.uniqueWreckId, row.wreckId);
      assert.equal(live.plan?.data?.uniqueWreckEncounterId, row.encounterId);
      assert.equal(
        t.state.player.uniqueWrecks.complications[`${row.wreckId}:encounter:${row.encounterId}`]?.status,
        'active',
      );
    } finally {
      t.dispose();
    }
  }
});

test('D10 remains a gentle no-combat teaching wreck through scan and long timer ticks', () => {
  const def = uniqueWreckById('wreck_choir_tender');
  const t = boot(def);
  try {
    const record = emitRumor(t, def);
    fixBearing(t, def, record);
    t.state.simTime += 600;
    t.bus.emit('economy:tick', {});
    assert.equal(eventRows(t, 'uniqueWreck:scanBlocked', def.id).length, 0);
    assert.equal(eventRows(t, 'uniqueWreck:encounterRequested', def.id).length, 0);
    assert.equal(eventRows(t, 'uniqueWreck:complicationScheduled', def.id)
      .some((entry) => /combat|boss|elite|hostile/i.test(`${entry.payload.kind || ''} ${entry.payload.encounterId || ''}`)), false);
    assert.equal(record.phase, 'fixed');
    assert.equal(record.reactorDueAt - record.fixedAtS >= 45, true);
  } finally {
    t.dispose();
  }
});

test('every wreck settles its named drops once and the durable receipt prevents post-load respawn', () => {
  assert.equal(UNIQUE_WRECKS.length, 12);
  for (const def of UNIQUE_WRECKS) {
    const t = boot(def, 48100 + Number(def.programSlot.slice(1)), { rewards: true });
    try {
      const record = emitRumor(t, def);
      const fixed = fixBearing(t, def, record);
      assert.equal(fixed.phase, 'fixed', `${def.programSlot} can be identified`);
      const wreck = liveWreck(t, def.id);
      assert.ok(wreck, `${def.programSlot} materializes after its rumor`);
      t.bus.emit('salvage:completed', { wreckId: wreck.id, loot: {} });
      assert.equal(record.phase, 'decision');
      const claim = def.decision.choices.find((choice) => choice.uniqueDrop);
      assert.ok(claim, `${def.programSlot} has a discovery-power claim choice`);
      t.bus.emit('uniqueWreck:choose', { wreckId: def.id, choiceId: claim.id });
      assert.equal(record.phase, 'salvaged');
      for (const pickup of eventRows(t, 'pickup:collected', def.id)) {
        assert.equal(Number.isFinite(pickup.payload.pos && pickup.payload.pos.x), true,
          `${def.programSlot} cargo pickup exposes a world x for player-facing feedback`);
        assert.equal(Number.isFinite(pickup.payload.pos && pickup.payload.pos.z), true,
          `${def.programSlot} cargo pickup exposes a world z for player-facing feedback`);
      }

      for (const drop of rewardDescriptors(def)) {
        if (drop.kind === 'weapon' || drop.kind === 'module') {
          assert.equal(t.state.player.moduleInventory.filter((item) => item.defId === drop.id).length, 1, `${drop.id} granted once`);
          assert.equal(t.state.player.uniqueWrecks.grants[drop.id]?.wreckId, def.id);
        } else if (drop.kind === 'story_commodity' || drop.kind === 'story_data') {
          assert.equal(t.state.player.flags[drop.flagKey], true, `${drop.id} sets its durable story flag`);
          assert.equal(t.state.player.uniqueWrecks.storyRewards[drop.id]?.wreckId, def.id);
        }
      }

      const eventCount = eventRows(t, 'uniqueWreck:storyRewardGranted', def.id).length;
      t.bus.emit('uniqueWreck:choose', { wreckId: def.id, choiceId: claim.id });
      assert.equal(eventRows(t, 'uniqueWreck:storyRewardGranted', def.id).length, eventCount, 'repeated choice cannot duplicate story reward');
      for (const drop of rewardDescriptors(def).filter((entry) => entry.kind === 'weapon' || entry.kind === 'module')) {
        assert.equal(t.state.player.moduleInventory.filter((item) => item.defId === drop.id).length, 1, `${drop.id} remains singular`);
      }

      const checkpoint = t.system.serialize();
      const restored = boot(def, 48100 + Number(def.programSlot.slice(1)), { rewards: true });
      try {
        restored.system.deserialize(checkpoint);
        restored.bus.emit('sector:enter', { sectorId: def.sectorId });
        assert.equal(liveWreck(restored, def.id), null, `${def.programSlot} cannot respawn after Continue`);
        assert.equal(restored.state.player.uniqueWrecks.bearings[def.id].phase, 'salvaged');
      } finally {
        restored.dispose();
      }
    } finally {
      t.dispose();
    }
  }
});
