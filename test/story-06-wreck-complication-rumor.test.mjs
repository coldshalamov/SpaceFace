import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { uniqueWreckById } from '../src/data/uniqueWrecks.js';
import { salvageActions } from '../src/systems/salvageActions.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { createMarketNews } from '../src/ui/marketNews.js';

const META_SEED = 4242;
const WRECK_ID = 'wreck_mts_silver_draft';

function boot() {
  const sim = createSimulation({
    seed: META_SEED,
    systems: [salvageActions, uniqueWrecks],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;

  const events = [];
  for (const name of [
    'news:headline', 'toast',
    'uniqueWreck:rumorRecorded',
    'uniqueWreck:complicationScheduled',
    'uniqueWreck:complicationTriggered',
  ]) bus.on(name, (payload) => events.push({ name, payload, t: state.simTime || 0 }));

  const news = createMarketNews({ state, bus, helpers: { voice: { say: () => true } } });
  return {
    sim, state, bus, events, news,
    log: () => state.ui.marketNews.log,
    delivered: (name) => events.filter((entry) => entry.name === name),
    // The native bar carrier mints the bearing, which is what schedules the complication.
    recordBearing() {
      const def = uniqueWreckById(WRECK_ID);
      bus.emit('uniqueWreck:rumorHeard', {
        wreckId: def.id,
        sourceRef: def.bearingSourceRef,
        recordedChannelId: 'bar',
      });
    },
    pump() { bus.emit('economy:tick', {}); },
    dispose() { news.destroy(); sim.dispose(); },
  };
}

test(`seed ${META_SEED}: a scheduled wreck complication lands one cited rumour before it fires`, () => {
  const t = boot();
  try {
    t.recordBearing();

    const bearing = t.state.player.uniqueWrecks.bearings[WRECK_ID];
    assert.ok(bearing, 'the bar rumour records the Silver-Draft bearing');
    const scheduled = t.delivered('uniqueWreck:complicationScheduled');
    assert.equal(scheduled.length, 1, 'scheduling emits once');
    assert.equal(scheduled[0].payload.wreckId, WRECK_ID);
    assert.equal(scheduled[0].payload.timerId, 'silver_draft_cleaner');
    assert.equal(scheduled[0].payload.sectorId, 'sector_helios_prime');

    const lines = t.log().filter((rec) => rec.kind === 'wreck_complication');
    assert.equal(lines.length, 1, 'exactly one foreshadow line is committed');
    const line = lines[0];
    assert.match(line.text, /Silver-Draft/, 'the line names the wreck');
    assert.equal(line.eventId, `uniqueWreck:complication:${WRECK_ID}:silver_draft_cleaner`);
    assert.equal(line.sourceRef, line.eventId, 'the line is cited to the scheduled timer');
    assert.equal(line.sectorId, 'sector_helios_prime');
    // The dread beat must not reveal what is coming.
    assert.doesNotMatch(line.text.toLowerCase(), /cleaner|pursuit/);

    // Ordering: the rumour is committed strictly before the complication fires.
    const rumorIndex = t.events.findIndex((entry) => entry.name === 'news:headline'
      && entry.payload && entry.payload.eventId === line.eventId);
    assert.ok(rumorIndex >= 0, 'the foreshadow re-emits as a cited news:headline');

    const record = t.state.player.uniqueWrecks.complications[`${WRECK_ID}:timer:silver_draft_cleaner`];
    assert.ok(record && record.status === 'scheduled');
    t.state.simTime = record.dueAt + 1;
    t.pump();

    const triggered = t.delivered('uniqueWreck:complicationTriggered');
    assert.equal(triggered.length, 1, 'the complication fires once due');
    assert.equal(triggered[0].payload.wreckName, 'Courier MTS Silver-Draft');
    const firedIndex = t.events.indexOf(triggered[0]);
    assert.ok(firedIndex > rumorIndex, 'the rumour precedes the fire');
    assert.equal(t.log().filter((rec) => rec.eventId === line.eventId).length, 1,
      'the fire does not stack a second line');
  } finally {
    t.dispose();
  }
});

test(`seed ${META_SEED}: a replayed scheduled emit cannot stack a second rumour`, () => {
  const t = boot();
  try {
    t.recordBearing();
    const eventId = `uniqueWreck:complication:${WRECK_ID}:silver_draft_cleaner`;
    assert.equal(t.log().filter((rec) => rec.eventId === eventId).length, 1);

    // A rewind/replay re-emits the same (wreck, timer) pair — the citation key dedupes.
    t.bus.emit('uniqueWreck:complicationScheduled', {
      wreckId: WRECK_ID,
      wreckName: 'Courier MTS Silver-Draft',
      sectorId: 'sector_helios_prime',
      timerId: 'silver_draft_cleaner',
      kind: 'cleaner_pursuit',
      dueAt: 999,
      encounterId: 'unique_wreck_silver_draft_cleaner',
    });
    assert.equal(t.log().filter((rec) => rec.eventId === eventId).length, 1, 'dedupe by eventId');
    assert.equal(t.delivered('news:headline')
      .filter((entry) => entry.payload && entry.payload.eventId === eventId).length, 1);
  } finally {
    t.dispose();
  }
});

test(`seed ${META_SEED}: the foreshadow headline cannot re-mint a bearing or timer`, () => {
  const t = boot();
  try {
    t.recordBearing();
    // commitHeadline re-emits news:headline synchronously; uniqueWrecks listens on that channel.
    // The citation sourceRef is not a bearing source, so the re-entry must no-op: one bearing,
    // one scheduled timer, one rumour — never a feedback loop.
    assert.equal(t.delivered('uniqueWreck:rumorRecorded').length, 1);
    assert.equal(t.delivered('uniqueWreck:complicationScheduled').length, 1);
    const complications = Object.keys(t.state.player.uniqueWrecks.complications);
    assert.deepEqual(complications, [`${WRECK_ID}:timer:silver_draft_cleaner`]);
  } finally {
    t.dispose();
  }
});

test(`seed ${META_SEED}: wrecks without a seeded timer publish no foreshadow`, () => {
  const t = boot();
  try {
    const def = uniqueWreckById('wreck_choir_tender');
    t.bus.emit('news:headline', {
      headline: 'TRAGEDY AT HELIOS',
      sourceRef: def.bearingSourceRef,
      wreckId: def.id,
      channelId: 'news',
      kind: 'wreck_rumor',
    });
    assert.ok(t.state.player.uniqueWrecks.bearings[def.id], 'the tender bearing records');
    assert.equal(t.delivered('uniqueWreck:complicationScheduled').length, 0);
    assert.equal(t.log().filter((rec) => rec.kind === 'wreck_complication').length, 0);
  } finally {
    t.dispose();
  }
});
