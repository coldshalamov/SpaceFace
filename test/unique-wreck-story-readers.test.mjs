// Story rewards have readers: a claimed Lost Ledger / Quadrille Seal-Log has a buyer at the bar of a
// matching berth, the sale settles through the unique-wreck owner by intent and is save-carried, and
// the Cassandra Treaty's unlock flag changes how the reputation owner moves Choir and Vael standing.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { uniqueWreckById } from '../src/data/uniqueWrecks.js';
import { RUMOR_EVENT_BY_CHANNEL, uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { factions, relationWeightFor } from '../src/systems/factions.js';
import { cargo } from '../src/systems/cargo.js';
import { ships } from '../src/systems/ships.js';
import { save } from '../src/save/saveSystem.js';
import { buildReply, emitBarContactChoice, generateContacts } from '../src/ui/station/barContacts.js';
import {
  STORY_BUYER_CHOICE_PREFIX, STORY_BUYER_CONTACT_PREFIX, storyBuyerOffersAt,
} from '../src/data/storyRewardBuyers.js';

const LEDGER = 'unique_lost_ledger';
const SEAL_LOG = 'unique_quadrille_seal_log';

function boot(def, seed = 51001) {
  const sim = createSimulation({ seed, systems: [uniqueWrecks, factions, cargo, ships] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = def ? def.sectorId : 'sector_helios_prime';
  state.player.cargo.capVolume = 1000;
  state.player.cargo.capMass = 1e9;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  const seen = [];
  for (const name of ['economy:grantCredits', 'faction:repDelta', 'news:publish', 'comms:log',
    'uniqueWreck:storyRewardGranted', 'uniqueWreck:storyRewardDisposed']) {
    bus.on(name, (payload) => seen.push({ name, payload }));
  }
  return { sim, state, bus, seen, system: sim.registry.get('uniqueWrecks'), dispose: () => sim.dispose() };
}

/** The ordinary route: hear the rumor, fix the bearing with a scan, salvage, claim. */
function claimWreck(t, wreckId) {
  const def = uniqueWreckById(wreckId);
  t.state.world.currentSectorId = def.sectorId;
  const source = def.rumorSources.find((s) => s.sourceRef === def.bearingSourceRef);
  t.bus.emit(RUMOR_EVENT_BY_CHANNEL[source.channelId], {
    wreckId: def.id, sourceRef: source.sourceRef, channelId: source.channelId, authoredWreckId: def.id,
  });
  const record = t.state.player.uniqueWrecks.bearings[def.id];
  assert.ok(record, `${def.id} rumor recorded`);
  t.bus.emit('scan:pulse', { pos: { ...record.exactPos } });
  assert.equal(record.phase, 'fixed', `${def.id} bearing fixed`);
  const hull = t.state.entityList.find((e) => e.alive !== false && e.data && e.data.uniqueWreckId === def.id);
  assert.ok(hull, `${def.id} hull materialized`);
  t.bus.emit('salvage:completed', { wreckId: hull.id, loot: {} });
  const claim = def.decision.choices.find((c) => c.uniqueDrop);
  t.bus.emit('uniqueWreck:choose', { wreckId: def.id, choiceId: claim.id });
  assert.equal(record.phase, 'salvaged');
  return def;
}

function dock(t, stationId) {
  t.state.ui.docked = true;
  t.state.ui.dockedStationId = stationId;
  t.bus.emit('dock:docked', { stationId });
}

function rows(t, name) { return t.seen.filter((e) => e.name === name).map((e) => e.payload); }

test('Lost Ledger: buyer only at a matching berth; sale pays by intent, records durably, retires the offer', () => {
  const t = boot(uniqueWreckById('wreck_mts_silver_draft'));
  try {
    claimWreck(t, 'wreck_mts_silver_draft');
    assert.ok(t.state.player.uniqueWrecks.storyRewards[LEDGER], 'ledger granted');

    // A black-market berth has no Lost Ledger buyer.
    assert.equal(storyBuyerOffersAt(t.state, 'station_smuggler').length, 0);
    // Each authored buyer sits at its own berth kind (real station faction/service data).
    assert.deepEqual(storyBuyerOffersAt(t.state, 'station_tethys')[0].choiceIds, ['sell_meridian']);
    assert.deepEqual(storyBuyerOffersAt(t.state, 'station_helios')[0].choiceIds, ['file_concord']);
    assert.deepEqual(storyBuyerOffersAt(t.state, 'station_reach')[0].choiceIds, ['publish_independent']);

    dock(t, 'station_helios');
    assert.ok(rows(t, 'comms:log').some((p) => /Lost Ledger/.test(p.text)), 'docking says a buyer is at the bar');

    const contacts = generateContacts('station_helios', t.state);
    const buyer = contacts.find((c) => c.id === STORY_BUYER_CONTACT_PREFIX + LEDGER);
    assert.ok(buyer, 'the Concord docket officer is on the bar rail');
    const choice = buyer.choices.find((c) => c.id === STORY_BUYER_CHOICE_PREFIX + 'file_concord');
    assert.ok(choice, 'file_concord offered');
    assert.match(choice.label, /3,500 cr/);
    assert.match(choice.label, /Concord \+14/);
    assert.match(choice.label, /Meridian \u22128/);

    const scnBefore = t.state.factions.faction_scn ? t.state.factions.faction_scn.rep : 0;
    emitBarContactChoice(t.bus, { contactId: buyer.id, choiceId: choice.id, stationId: 'station_helios' });
    const reply = buildReply(buyer.role, choice.id, { state: t.state, bus: t.bus }, 'station_helios', buyer);
    assert.match(reply.text, /Docketed/);

    const credits = rows(t, 'economy:grantCredits').filter((p) => /^story-buyer:/.test(p.reason));
    assert.deepEqual(credits, [{ amount: 3500, reason: `story-buyer:${LEDGER}:file_concord` }]);
    const reps = rows(t, 'faction:repDelta').filter((p) => /^story-buyer:/.test(p.reason));
    assert.deepEqual(reps.map((p) => [p.factionId, p.delta]), [['faction_scn', 14], ['faction_mts', -8]]);
    assert.ok(t.state.factions.faction_scn.rep > scnBefore, 'the reputation owner applied the intent');
    assert.ok(rows(t, 'news:publish').some((p) => p.kind === 'story_disposition' && /CONCORD DOCKETS/.test(p.text)));

    const disposition = t.state.player.uniqueWrecks.storyRewards[LEDGER].disposition;
    assert.equal(disposition.choiceId, 'file_concord');
    assert.equal(disposition.stationId, 'station_helios');
    assert.equal(generateContacts('station_helios', t.state).some((c) => c.id === buyer.id), false, 'offer gone');
    assert.equal(storyBuyerOffersAt(t.state, 'station_tethys').length, 0, 'other buyers retire too');

    // A repeat click settles nothing twice.
    emitBarContactChoice(t.bus, { contactId: buyer.id, choiceId: choice.id, stationId: 'station_helios' });
    assert.equal(rows(t, 'economy:grantCredits').filter((p) => /^story-buyer:/.test(p.reason)).length, 1);
  } finally { t.dispose(); }
});

test('a buyer refuses the sale away from their berth', () => {
  const t = boot(uniqueWreckById('wreck_mts_silver_draft'));
  try {
    claimWreck(t, 'wreck_mts_silver_draft');
    dock(t, 'station_helios');
    t.bus.emit('ui:talkContact', {
      contactId: STORY_BUYER_CONTACT_PREFIX + LEDGER,
      choiceId: STORY_BUYER_CHOICE_PREFIX + 'sell_meridian',
      stationId: 'station_helios',
    });
    assert.equal(t.state.player.uniqueWrecks.storyRewards[LEDGER].disposition, undefined);
    assert.equal(rows(t, 'economy:grantCredits').filter((p) => /^story-buyer:/.test(p.reason)).length, 0);
  } finally { t.dispose(); }
});

test('save/reload mid-way keeps the offer; after the sale the disposition survives reload', () => {
  const a = boot(uniqueWreckById('wreck_mts_quadrille'), 51002);
  try {
    claimWreck(a, 'wreck_mts_quadrille');
    const blob = JSON.parse(JSON.stringify(save._serializePlayer.call({ state: a.state })));
    const b = boot(null, 51002);
    try {
      save._restorePlayer.call({ state: b.state }, blob);
      assert.ok(b.state.player.uniqueWrecks.storyRewards[SEAL_LOG], 'held seal-log survives reload');
      assert.deepEqual(storyBuyerOffersAt(b.state, 'station_io_merc')[0].choiceIds, ['sell_quiet']);
      dock(b, 'station_io_merc');
      const buyer = generateContacts('station_io_merc', b.state).find((c) => c.id === STORY_BUYER_CONTACT_PREFIX + SEAL_LOG);
      assert.ok(buyer, 'quiet buyer at the black-market bar after reload');
      emitBarContactChoice(b.bus, { contactId: buyer.id, choiceId: STORY_BUYER_CHOICE_PREFIX + 'sell_quiet', stationId: 'station_io_merc' });
      const reps = rows(b, 'faction:repDelta').filter((p) => /^story-buyer:/.test(p.reason));
      // The quiet buyer's house is the berth's own faction (station_io_merc → faction_quiet).
      assert.deepEqual(reps.map((p) => [p.factionId, p.delta]), [['faction_quiet', 6], ['faction_free', -4]]);
      assert.equal(rows(b, 'economy:grantCredits').find((p) => /^story-buyer:/.test(p.reason)).amount, 7200);

      const after = JSON.parse(JSON.stringify(save._serializePlayer.call({ state: b.state })));
      const c = boot(null, 51002);
      try {
        save._restorePlayer.call({ state: c.state }, after);
        const d = c.state.player.uniqueWrecks.storyRewards[SEAL_LOG].disposition;
        assert.equal(d.choiceId, 'sell_quiet');
        assert.equal(d.stationId, 'station_io_merc');
        assert.equal(d.credits, 7200);
        assert.equal(storyBuyerOffersAt(c.state, 'station_reach').length, 0, 'no second buyer after reload');
        // The same record round-trips through the system's own serialize/deserialize.
        c.system.deserialize(c.system.serialize());
        assert.equal(c.state.player.uniqueWrecks.storyRewards[SEAL_LOG].disposition.choiceId, 'sell_quiet');
      } finally { c.dispose(); }
    } finally { b.dispose(); }
  } finally { a.dispose(); }
});

test('Cassandra Treaty: claimed treaty turns Choir↔Vael spillover from a cost into a share, with news', () => {
  const control = boot(null, 51003);
  const t = boot(uniqueWreckById('wreck_choir_cassandra'), 51003);
  try {
    assert.ok(relationWeightFor(control.state, 'faction_choir', 'faction_vael') < 0, 'authored rivalry');
    control.bus.emit('faction:repDelta', { factionId: 'faction_vael', delta: 1, reason: 'seed-record' });
    const vael0 = control.state.factions.faction_vael.rep;
    control.bus.emit('faction:repDelta', { factionId: 'faction_choir', delta: 20, reason: 'test' });
    const controlVael = control.state.factions.faction_vael.rep - vael0;
    assert.ok(controlVael < 0, `without the treaty helping the Choir costs Vael standing (${controlVael})`);

    claimWreck(t, 'wreck_choir_cassandra');
    assert.equal(t.state.player.flags['crossRep.choirVaelTreaty'], true);
    assert.ok(rows(t, 'news:publish').some((p) => p.kind === 'faction_treaty'), 'treaty news published');
    assert.equal(relationWeightFor(t.state, 'faction_vael', 'faction_choir'), 0.25);
    t.bus.emit('faction:repDelta', { factionId: 'faction_vael', delta: 1, reason: 'seed-record' });
    const vael1 = t.state.factions.faction_vael.rep;
    t.bus.emit('faction:repDelta', { factionId: 'faction_choir', delta: 20, reason: 'test' });
    const treatyVael = t.state.factions.faction_vael.rep - vael1;
    assert.ok(treatyVael > 0, `with the treaty a share carries to the Vael (${treatyVael})`);
  } finally { control.dispose(); t.dispose(); }
});
