// Faction identity — what the player does to a faction changes how its people treat them, in the
// world: through the existing presence hulls (activity / ROE / team), the berth desks, and the
// berth hulks themselves. Fixed house seed 4242; real factionPresence + world systems.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { factionPresence, conductStances } from '../src/systems/factionPresence.js';
import { world } from '../src/systems/world.js';
import {
  FACTION_BERTHS,
  factionBerthById,
  factionBerthHulkHome,
  factionBerthKeeperPos,
} from '../src/data/factionBerths.js';
import { planBerthKeepers } from '../src/data/factionPresence.js';
import { FACTION_KITS } from '../src/data/factions/index.js';
import {
  GRUDGE_STRIKES,
  conductFor,
  deriveConductStance,
  emptyConductMemory,
  grudgeLapsed,
  recordConductAct,
} from '../src/data/factionConduct.js';
import { factionPresenceServiceRows, runFactionPresenceDockAction } from '../src/ui/station/serviceQuotes.js';

const SEED = 4242;

function boot(reps = {}) {
  const sim = createSimulation({ seed: SEED, systems: [factionPresence, world] });
  sim.state.factions = sim.state.factions || {};
  for (const [id, rep] of Object.entries(reps)) {
    sim.state.factions[id] = { ...(sim.state.factions[id] || {}), rep };
  }
  return sim;
}
const enter = (sim, sectorId) => sim.registry.get('world').enterSector(sectorId, { placePlayer: false });
const presence = (sim) => sim.registry.get('factionPresence');
const live = (sim, factionId) => [...sim.state.entities.values()].filter((e) => (
  e && e.alive !== false && e.data && e.data.factionPresence && e.data.factionPresence.factionId === factionId
));
const hulkOf = (sim, berthId) => [...sim.state.entities.values()].find((e) => (
  e && e.alive !== false && e.data && e.data.berthConsign && e.data.berthConsign.berthId === berthId
)) || null;
const near = (a, b, tol = 1) => Math.hypot(a.x - b.x, a.z - b.z) <= tol;
function strike(sim, target, times = GRUDGE_STRIKES) {
  for (let i = 0; i < times; i++) {
    sim.bus.emit('combat:damage', { attackerId: sim.state.playerId, targetId: target.id, applied: 6 });
  }
}
function record(sim) {
  const seen = [];
  for (const name of ['comms:popup', 'factionPresence:conduct', 'factionPresence:berthRobbed',
    'factionPresence:berthReturned', 'factionPresence:berthGreeting']) {
    sim.bus.on(name, (payload) => seen.push({ name, payload }));
  }
  return seen;
}

test('faction-identity: four berths, each pinned to a real station; keepers come from faction shipRoles', () => {
  const ids = FACTION_BERTHS.map((b) => b.id);
  assert.deepEqual(ids, [
    'berth_pitborn_consign_line',
    'berth_understory_afterwake_slip',
    'berth_archive_pallas_stacks',
    'berth_helix_variance_pier',
  ]);
  const receiptKeys = new Set(FACTION_BERTHS.map((b) => b.receiptKey));
  assert.equal(receiptKeys.size, FACTION_BERTHS.length, 'every berth keeps its own memory');
  for (const berth of FACTION_BERTHS) {
    assert.ok(Object.isFrozen(berth));
    assert.ok(berth.crib.length >= 4, `${berth.id} is a place, not a marker`);
    assert.ok(berth.hulk && berth.hulk.mass > 0, `${berth.id} holds a physical, tetherable body`);
    assert.ok(factionBerthHulkHome(berth), `${berth.id} resolves a real station apron`);
  }
  const keepers = planBerthKeepers({ sectorId: 'sector_pallas_drift', seed: SEED });
  assert.equal(keepers.length, 1);
  const archive = FACTION_KITS.find((k) => k.id === 'faction_archive');
  assert.ok(JSON.stringify(archive.shipRoles || {}).includes(keepers[0].shipDefId),
    'the Stacks keeper is an Archive hull from its own shipRoles');
  assert.equal(planBerthKeepers({ sectorId: 'sector_sedna_dark', seed: SEED }).length, 0,
    'Helix flies nothing: the Variance Pier has no keeper hull');
});

test('faction-identity: each doctrine forgives its own way', () => {
  const hit = (fid) => {
    const mem = emptyConductMemory();
    let out = null;
    for (let i = 0; i < GRUDGE_STRIKES; i++) out = recordConductAct(mem, fid, 'struck', 10 + i);
    return { mem, out };
  };
  const one = emptyConductMemory();
  assert.equal(recordConductAct(one, 'faction_pitborn', 'struck', 1).opened, false,
    'one stray round is not a grudge');
  for (const fid of ['faction_understory', 'faction_archive', 'faction_pitborn', 'faction_helix', 'faction_choir', 'faction_free']) {
    assert.ok(conductFor(fid), fid);
    const { mem, out } = hit(fid);
    assert.equal(out.opened, true, `${fid}: a deliberate run of hits opens a grudge`);
    assert.equal(deriveConductStance(fid, 0, mem, 20), 'grudge');
  }
  // Understory forget fast; the Choir faster; Pitborn never forget on the clock — only business.
  assert.equal(grudgeLapsed('faction_choir', hit('faction_choir').mem, 60), true);
  assert.equal(grudgeLapsed('faction_understory', hit('faction_understory').mem, 60), false);
  assert.equal(grudgeLapsed('faction_understory', hit('faction_understory').mem, 120), true);
  assert.equal(grudgeLapsed('faction_pitborn', hit('faction_pitborn').mem, 1e6), false);
  const pit = hit('faction_pitborn').mem;
  assert.equal(recordConductAct(pit, 'faction_pitborn', 'berth_consign', 30).forgave, true);
  assert.equal(deriveConductStance('faction_pitborn', 40, pit, 31), 'wary',
    'forgiven is not forgotten: a settled faction keeps its distance for a while');
  assert.equal(deriveConductStance('faction_pitborn', 40, pit, 31 + 301), 'known');
  const arch = hit('faction_archive').mem;
  assert.equal(recordConductAct(arch, 'faction_archive', 'berth_folio', 30).forgave, false,
    'the Archive will not be bought back with another reading');
});

test('faction-identity: standing is posture — kin Archive hulls come to catalogue you, strangers keep their authored work', () => {
  const stranger = boot({ faction_archive: 0 });
  enter(stranger, 'sector_pallas_drift');
  const courier = live(stranger, 'faction_archive').find((e) => !e.data.factionPresence.berthKeeper);
  assert.ok(courier, 'an Archive courier flies Pallas Drift');
  assert.equal(courier.data.ai.activity.reason, 'k1_nonhostile_presence', 'a stranger sees authored behavior');
  const keeper = live(stranger, 'faction_archive').find((e) => e.data.factionPresence.berthKeeper);
  assert.ok(keeper, 'a censor keeps the Stacks');
  assert.equal(keeper.data.ai.activity.kind, 'loiter');
  assert.ok(near(keeper.data.ai.activity.anchor, factionBerthKeeperPos(factionBerthById('berth_archive_pallas_stacks'))),
    'the keeper works its berth apron');

  const kin = boot({ faction_archive: 50 });
  enter(kin, 'sector_pallas_drift');
  const kinCourier = live(kin, 'faction_archive').find((e) => !e.data.factionPresence.berthKeeper);
  assert.equal(kinCourier.data.ai.activity.kind, 'scan_approach');
  assert.equal(kinCourier.data.ai.activity.reason, 'archive_catalogue_courtesy');
  assert.equal(kinCourier.data.ai.activity.targetId, kin.state.playerId);
  assert.equal(kinCourier.data.ai.passive, true, 'courtesy is not a weapon');
  assert.equal(kinCourier.data.factionPresence.stance, 'kin', 'the stance rides the hull marker the UI reads');
  stranger.dispose?.();
  kin.dispose?.();
});

test('faction-identity: shoot the Pitborn and they collect the debt; the yard shuts; consigning settles it', () => {
  const sim = boot({ faction_pitborn: 40 });
  const seen = record(sim);
  enter(sim, 'sector_vesta_forge');
  const pitborn = live(sim, 'faction_pitborn').filter((e) => e.data.ai.passive !== false);
  assert.ok(pitborn.length >= 2, 'a Pitborn tender and the line boss work Vesta');
  strike(sim, pitborn[0], 1);
  assert.notEqual(pitborn[0].team, 1, 'one stray round is answered by nothing');
  strike(sim, pitborn[0], GRUDGE_STRIKES - 1);
  for (const ship of pitborn) {
    assert.equal(ship.team, 1);
    assert.equal(ship.data.ai.roe, 'weapons_free');
    assert.equal(ship.data.ai.motive, 'pitborn_grudge');
    assert.equal(ship.data.ai.activity.kind, 'attack_run', 'existing attack-run doctrine, no second AI');
    assert.equal(ship.data.ai.activity.targetId, sim.state.playerId);
  }
  assert.ok(seen.some((r) => r.name === 'factionPresence:conduct' && r.payload.opened && r.payload.factionId === 'faction_pitborn'));

  sim.bus.emit('dock:docked', { stationId: 'station_forge' });
  const rows = factionPresenceServiceRows(sim.state, 'station_forge');
  assert.ok(rows.length >= 1 && rows.every((r) => r.available === false), 'the yard and fence are shut to you');
  assert.match(rows[0].disabledReason, /owe the Line/);
  const blocked = runFactionPresenceDockAction(sim.bus, sim.state, 'station_forge', rows[0].id);
  assert.equal(blocked.ok, false, 'the public dock control refuses');

  sim.bus.emit('service:completed', { type: 'redeem_rights', stationId: 'station_forge', rights: 1 });
  for (const ship of pitborn) {
    assert.equal(ship.data.ai.passive, true, 'business settles it: guns down');
    assert.notEqual(ship.team, 1);
    assert.equal(ship.data.ai.conductStance, 'wary', 'the Line still prices you as you come in');
  }
  assert.ok(seen.some((r) => r.name === 'comms:popup' && /Business settles it/.test(r.payload.text)));
  sim.bus.emit('dock:docked', { stationId: 'station_forge' });
  assert.ok(factionPresenceServiceRows(sim.state, 'station_forge').every((r) => r.available === true));
  sim.dispose?.();
});

test('faction-identity: Understory withdraw from your guns and forget on their own clock; the memory survives Continue', () => {
  const sim = boot({ faction_understory: 0 });
  enter(sim, 'sector_charon_expanse');
  const own = presence(sim);
  for (let i = 0; i < GRUDGE_STRIKES; i++) own._recordAct('faction_understory', 'struck');
  assert.equal(conductStances(sim.state).faction_understory, 'grudge');
  const saved = JSON.parse(JSON.stringify(own.serialize()));

  const resumed = boot({ faction_understory: 0 });
  presence(resumed).deserialize(saved);
  assert.equal(conductStances(resumed.state).faction_understory, 'grudge', 'Continue keeps the grudge');
  resumed.state.simTime = (Number(sim.state.simTime) || 0) + 100;
  presence(resumed)._conductTick();
  assert.equal(conductStances(resumed.state).faction_understory, 'wary', 'the Understory stop listening for your guns');
  sim.dispose?.();
  resumed.dispose?.();
});

test('faction-identity: CR-BERTH-3 the Pallas Stacks rack your readings; hauling a folio off opens a writ, bringing it back closes it', () => {
  const sim = boot({ faction_archive: 30 });
  const seen = record(sim);
  const berth = factionBerthById('berth_archive_pallas_stacks');
  sim.bus.emit('dock:docked', { stationId: 'station_drift' });
  assert.equal(runFactionPresenceDockAction(sim.bus, sim.state, 'station_drift', 'archive_reading_room').ok, true);
  runFactionPresenceDockAction(sim.bus, sim.state, 'station_drift', 'archive_reading_room');
  const receipts = sim.state.factionPresence.serviceReceipts;
  assert.equal(receipts[berth.receiptKey].count, 1, 'one folio per visit, not per button press');
  sim.state.simTime = 50;
  sim.bus.emit('dock:docked', { stationId: 'station_drift' });
  runFactionPresenceDockAction(sim.bus, sim.state, 'station_drift', 'archive_reading_room');
  assert.equal(receipts[berth.receiptKey].count, 2, 'coming back and reading again racks a second folio');

  enter(sim, 'sector_pallas_drift');
  const folio = hulkOf(sim, berth.id);
  assert.ok(folio, 'the sealed folio stands on the rack');
  assert.equal(folio.collides, true);
  assert.ok(near(folio.pos, factionBerthHulkHome(berth)), 'the folio sits where the berth law says');
  assert.ok(seen.some((r) => r.name === 'comms:popup' && /2 readings under your name/.test(r.payload.text)),
    'arrival cites what the Stacks hold');

  folio.pos.x += 400;
  presence(sim)._conductTick();
  assert.ok(seen.some((r) => r.name === 'factionPresence:berthRobbed'));
  assert.equal(conductStances(sim.state).faction_archive, 'grudge');
  const censors = live(sim, 'faction_archive');
  assert.ok(censors.length >= 1 && censors.every((e) => e.team === 1 && e.data.ai.motive === 'archive_grudge'),
    'a redaction writ: the censors come for you');
  sim.bus.emit('dock:docked', { stationId: 'station_drift' });
  assert.equal(factionPresenceServiceRows(sim.state, 'station_drift')[0].available, false, 'the reading room is shut');

  const home = factionBerthHulkHome(berth);
  folio.pos.x = home.x; folio.pos.z = home.z;
  presence(sim)._conductTick();
  assert.ok(seen.some((r) => r.name === 'factionPresence:berthReturned'));
  assert.equal(conductStances(sim.state).faction_archive, 'wary', 'the writ closes; the note stays');
  assert.ok(censors.every((e) => e.data.ai.passive === true && e.team !== 1));
  const watch = sim.state.factionPresence.berthWatch[berth.id];
  assert.equal(watch.displaced, false);
  assert.ok(watch.visits >= 1);
  sim.dispose?.();
});

test('faction-identity: CR-BERTH-4 the Variance Pier moors your filing; a missing copy suspends the desk', () => {
  const sim = boot({ faction_helix: 20 });
  const berth = factionBerthById('berth_helix_variance_pier');
  sim.bus.emit('dock:docked', { stationId: 'station_sedna' });
  assert.equal(runFactionPresenceDockAction(sim.bus, sim.state, 'station_sedna', 'directorate_audit').ok, true);
  assert.equal(sim.state.factionPresence.serviceReceipts[berth.receiptKey].count, 1);
  enter(sim, 'sector_sedna_dark');
  const copy = hulkOf(sim, berth.id);
  assert.ok(copy, 'the filed copy is moored off the pier');
  assert.ok(near(copy.pos, factionBerthHulkHome(berth)));
  copy.pos.z += 400;
  presence(sim)._conductTick();
  sim.bus.emit('dock:docked', { stationId: 'station_sedna' });
  const row = factionPresenceServiceRows(sim.state, 'station_sedna')[0];
  assert.equal(row.available, false);
  assert.match(row.disabledReason, /VARIANCE OPEN/);
  copy.pos.z -= 400;
  presence(sim)._conductTick();
  sim.bus.emit('dock:docked', { stationId: 'station_sedna' });
  assert.equal(factionPresenceServiceRows(sim.state, 'station_sedna')[0].available, true, 'variance closed');
  sim.dispose?.();
});
