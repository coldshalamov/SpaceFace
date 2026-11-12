// Faction identity on the production runtime (seed 4242): the Helios starter corridor is untouched,
// conduct facts survive save → load → sector reentry, and a grudge can be climbed out of through
// ordinary play (Pitborn: redeeming salvage rights at the yard, through the economy's own writer).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { SECTORS } from '../src/data/sectors.js';
import { FACTION_BERTHS, factionBerthById, factionBerthHulkHome } from '../src/data/factionBerths.js';
import { conductStances } from '../src/systems/factionPresence.js';
import { factionPresenceServiceRows, runFactionPresenceDockAction } from '../src/ui/station/serviceQuotes.js';
import { resolveEntity } from '../src/ui/entityResolver.js';
import { GRUDGE_STRIKES } from '../src/data/factionConduct.js';

const SEED = 4242;
const HELIOS = 'sector_helios_prime';

function external(runtime, fn) {
  const old = snapshotFeatureMaps();
  applyFeatureConfigToMaps(runtime.config.features);
  try { return fn(); } finally { restoreFeatureMaps(old); }
}
function boot(seed = SEED) {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed });
  runtime.state.mode = 'flight';
  return runtime;
}
function fly(runtime, pos) {
  const s = runtime.state;
  const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: s.player, pos, fittings: [] }));
  s.playerId = player.id;
  return player;
}
const enter = (runtime, sectorId) => external(runtime, () => runtime.getSystem('world')
  .enterSector(sectorId, { continuous: false, noTeleport: true, placePlayer: false }));
const presence = (runtime) => runtime.getSystem('factionPresence');
const entities = (runtime) => [...runtime.state.entities.values()].filter((e) => e && e.alive !== false);
const folioOf = (runtime, berthId) => entities(runtime)
  .find((e) => e.data && e.data.berthConsign && e.data.berthConsign.berthId === berthId) || null;
const fact = (dossier, k) => (dossier && dossier.facts.find((f) => f.k === k)) || null;
const remembered = (dossier) => (dossier && dossier.lines.find((l) => l.label === 'They remember')) || null;
const prepared = new WeakSet();
// Conduct runs inside the production tick, never a direct call: the registry cadence is on trial too.
async function settle(runtime, seconds = 1) {
  if (!prepared.has(runtime)) {
    assert.equal(await runtime.getSystem('physics').prepareBackend(runtime.state, { reset: true }), true);
    prepared.add(runtime);
  }
  runtime.runTicks(Math.round(60 * seconds), 1 / 60);
}
function listen(runtime, names) {
  const seen = [];
  for (const name of names) runtime.bus.on(name, (payload) => seen.push({ name, payload }));
  return seen;
}

test('faction-identity route: the Helios starter corridor opens with no berth, keeper, conduct or closed desk', async () => {
  const runtime = boot();
  try {
    const seen = listen(runtime, ['factionPresence:spawned', 'factionPresence:conduct',
      'factionPresence:berthGreeting', 'factionPresence:berthRobbed']);
    const helios = SECTORS.find((s) => s.id === HELIOS);
    assert.ok(helios, 'Helios Prime is the starter sector');
    assert.equal(FACTION_BERTHS.some((b) => b.sectorId === HELIOS), false, 'no faction berth is authored in Helios');
    fly(runtime, { x: 0, z: 0 });
    enter(runtime, HELIOS);
    assert.equal(await runtime.getSystem('physics').prepareBackend(runtime.state, { reset: true }), true);
    runtime.runTicks(60 * 20, 1 / 60);

    assert.equal(seen.filter((r) => r.name === 'factionPresence:spawned' && r.payload.source === 'berthKeeper').length, 0,
      'no berth keeper wakes in the opening');
    assert.equal(seen.some((r) => r.name !== 'factionPresence:spawned'), false,
      'no conduct, greeting or robbery fires in the opening');
    assert.equal(entities(runtime).some((e) => e.data && (e.data.berthConsign
      || (e.data.factionPresence && e.data.factionPresence.berthKeeper))), false, 'no berth hulk or keeper in Helios');
    const own = runtime.state.factionPresence || {};
    assert.deepEqual(own.conduct || {}, {}, 'an untouched player has no conduct memory');
    for (const stance of Object.values(conductStances(runtime.state))) assert.notEqual(stance, 'grudge');
    for (const station of helios.stations || []) {
      runtime.bus.emit('dock:docked', { stationId: station.id });
      for (const row of factionPresenceServiceRows(runtime.state, station.id)) {
        assert.equal(row.disabledReason && !/Requires/.test(row.disabledReason) ? row.disabledReason : '', '', `${station.id} desk is not closed before the player has conduct`);
      }
    }
  } finally { runtime.dispose(); }
});

test('faction-identity route: an Archive grudge, its closed desk and the racked folio survive save → load → reentry', async () => {
  const source = boot();
  let target = null;
  try {
    const s = source.state;
    s.factions.faction_archive = { ...(s.factions.faction_archive || {}), rep: 30 };
    const berth = factionBerthById('berth_archive_pallas_stacks');
    source.bus.emit('dock:docked', { stationId: 'station_drift' });
    assert.equal(runFactionPresenceDockAction(source.bus, s, 'station_drift', 'archive_reading_room').ok, true);
    const home = factionBerthHulkHome(berth);
    fly(source, { x: home.x + 600, z: home.z });
    const woke = listen(source, ['factionPresence:spawned']);
    enter(source, 'sector_pallas_drift');
    await settle(source);
    assert.ok(woke.some((r) => r.payload.source === 'berthKeeper' && r.payload.factionId === 'faction_archive'),
      'the censor keeper comes out as the player nears the Stacks, through the production tick');
    const folio = folioOf(source, berth.id);
    assert.ok(folio, 'the reading racks a sealed folio at the Stacks');
    folio.pos.x += 400;
    await settle(source);
    assert.equal(conductStances(s).faction_archive, 'grudge', 'hauling the folio off opens a writ');
    assert.ok(factionPresenceServiceRows(s, 'station_drift').every((r) => r.available === false && r.disabledReason),
      'the reading room is closed to you');

    const envelope = source.getSystem('save').serialize('faction-identity-route');
    source.dispose();
    target = boot(SEED + 1);
    assert.equal(await target.getSystem('save').loadEnvelope(envelope, 'faction-identity-route'), true);
    const t = target.state;
    assert.equal(conductStances(t).faction_archive, 'grudge', 'Continue keeps the writ');
    target.bus.emit('dock:docked', { stationId: 'station_drift' });
    const rows = factionPresenceServiceRows(t, 'station_drift');
    assert.ok(rows.length > 0 && rows.every((r) => r.available === false && /redaction writ/i.test(r.disabledReason)),
      'the dock desk still reads closed, with the Archive’s reason');
    const dossier = resolveEntity(t, 'faction:faction_archive');
    assert.equal(fact(dossier, 'Toward you').v, 'Grudge');
    assert.equal(remembered(dossier).tone, 'foe');

    if (!t.playerId || !t.entities.get(t.playerId)) fly(target, { x: home.x + 600, z: home.z });
    enter(target, 'sector_vesta_forge');
    const greet = listen(target, ['factionPresence:berthGreeting']);
    enter(target, 'sector_pallas_drift');
    const stolen = folioOf(target, berth.id);
    assert.ok(stolen, 'the berth hulk persists through Continue and reentry');
    assert.ok(Math.hypot(stolen.pos.x - home.x, stolen.pos.z - home.z) > 300, 'still where the thief left it');
    await settle(target);
    assert.equal(conductStances(t).faction_archive, 'grudge', 'reentry does not wash the writ');
    assert.equal(t.factionPresence.berthWatch[berth.id].displaced, true, 'the theft stays on the books');
    const g = greet.find((r) => r.payload.berthId === berth.id);
    assert.ok(g && g.payload.stance === 'grudge' && g.payload.displaced === true, 'coming back is met as the thief');

    const said = listen(target, ['comms:popup']);
    stolen.pos.x = home.x;
    stolen.pos.z = home.z;
    await settle(target);
    assert.notEqual(conductStances(t).faction_archive, 'grudge', 'hauling the folio home closes the writ');
    assert.equal(t.factionPresence.berthWatch[berth.id].displaced, false);
    assert.ok(said.some((r) => /correction/.test(r.payload.text)), 'the Archive says so');
    const receipt = t.factionPresence.receipts.find((r) => r.kind === 'conduct' && r.act === 'berth_returned');
    assert.ok(receipt && receipt.forgave === true, 'the return is a persistent receipt');
    const after = resolveEntity(t, 'faction:faction_archive');
    assert.notEqual(fact(after, 'Toward you').v, 'Grudge');
    assert.match(remembered(after).text, /correction/);
    target.bus.emit('dock:docked', { stationId: 'station_drift' });
    assert.ok(factionPresenceServiceRows(t, 'station_drift').every((r) => r.available === true), 'the reading room reopens');
  } finally { (target || source).dispose(); }
});

test('faction-identity route: a Pitborn grudge is settled by business — redeeming salvage rights at the yard', async () => {
  const runtime = boot();
  try {
    const s = runtime.state;
    const seen = listen(runtime, ['comms:popup', 'service:completed']);
    enter(runtime, 'sector_vesta_forge');
    const tender = entities(runtime).find((e) => e.data && e.data.factionPresence
      && e.data.factionPresence.factionId === 'faction_pitborn');
    assert.ok(tender, 'a Pitborn hull flies the Vesta yards');
    fly(runtime, { x: tender.pos.x + 200, z: tender.pos.z });
    for (let i = 0; i < GRUDGE_STRIKES; i++) {
      runtime.bus.emit('combat:damage', { attackerId: s.playerId, targetId: tender.id, applied: 6 });
    }
    assert.equal(conductStances(s).faction_pitborn, 'grudge', 'three deliberate strikes open the debt');
    s.simTime = (Number(s.simTime) || 0) + 3600;
    await settle(runtime);
    assert.equal(conductStances(s).faction_pitborn, 'grudge', 'the Pitborn never forget on the clock');

    s.player.salvageRights = 2;
    const credits = Number(s.player.credits) || 0;
    s.ui = s.ui || {};
    s.ui.dockedStationId = 'station_forge';
    runtime.bus.emit('dock:docked', { stationId: 'station_forge' });
    runtime.bus.emit('ui:service', { type: 'redeem_rights' });
    assert.ok(seen.some((r) => r.name === 'service:completed' && r.payload.type === 'redeem_rights'),
      'the economy redeems the rights through its own writer');
    assert.ok((Number(s.player.credits) || 0) > credits, 'the yard pays for the rights');
    assert.notEqual(conductStances(s).faction_pitborn, 'grudge', 'business settles it');
    assert.ok(seen.some((r) => r.name === 'comms:popup' && /Business settles it/.test(r.payload.text)));
    const receipts = s.factionPresence.receipts.filter((r) => r.kind === 'conduct' && r.factionId === 'faction_pitborn');
    assert.ok(receipts.some((r) => r.act === 'berth_consign' && r.forgave === true), 'the settlement is a receipt');
    const dossier = resolveEntity(s, 'faction:faction_pitborn');
    assert.notEqual(fact(dossier, 'Toward you').v, 'Grudge');
    assert.match(remembered(dossier).text, /Business settles it/);
  } finally { runtime.dispose(); }
});
