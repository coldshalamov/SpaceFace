// BP-11 packet A3 acceptance check: Non-dockable station surfaced ("Sealed Berth").
//
// Contract (src/ui/dockDenyBanner.js — see design/revamp/detail/A_sector_station.md packet A3):
//   - A dock attempt on a non-dockable station (military/abandoned/repGated/…) surfaces the
//     SHIPPED dockDenyReason's FACTION-FLAVORED text (never the generic line for a factioned
//     station) as a scan-result record (state.ui.dockDeny + `dock:denied`) and speaks it through
//     voice.say({channel:'comms'}) EXACTLY ONCE per attempt (debounced across the
//     dock:attempt/dock:docked double-signal; a later separate attempt speaks again).
//   - A dockable station (no deny reason) surfaces NOTHING: no voice, no record, no event.
//
// Headless: no DOM — the banner mount is `typeof document`-guarded and must no-op here.
import assert from 'node:assert/strict';

import { resolveDockDeny, dockDenyBanner } from '../src/ui/dockDenyBanner.js';
import { dockDenyReason } from '../src/data/dockDeny.js';

assertMilitaryStationFlavoredDenial();
assertAbandonedStationDenial();
assertRepGatedStationDenial();
assertDockableStationSurfacesNothing();
assertDebouncedOncePerAttempt();

console.log('Dock deny banner checks OK');

// ── fixtures ───────────────────────────────────────────────────────────────────────────────────

function makeBus() {
  const handlers = new Map();
  return {
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
    off(evt, fn) {
      const list = handlers.get(evt) || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit(evt, payload) { for (const fn of (handlers.get(evt) || []).slice()) fn(payload); },
  };
}

function stationEntity(data) {
  return { id: 42, type: 'station', alive: true, pos: { x: 0, z: 0 }, data };
}

function makeCtx(stationData, extraState = {}) {
  const bus = makeBus();
  const sayCalls = [];
  const denied = [];
  bus.on('dock:denied', (p) => denied.push(p));
  const state = {
    simTime: 100,
    ui: {},
    entityList: [stationEntity(stationData)],
    ...extraState,
  };
  const ctx = { bus, state, helpers: { voice: { say(msg) { sayCalls.push(msg); return true; } } } };
  return { ctx, bus, state, sayCalls, denied };
}

// ── denial cases ───────────────────────────────────────────────────────────────────────────────

function assertMilitaryStationFlavoredDenial() {
  const data = { stationId: 'station_customs', name: 'Customs Gate', factionId: 'faction_scn', militaryOnly: true };
  const { ctx, bus, state, sayCalls, denied } = makeCtx(data);

  // The flavored line must WIN over the generic one (packet failureMode: generic text for a
  // factioned station). Pin it against the shipped resolver called with faction meta.
  const expected = dockDenyReason({ ...data }, 'faction_scn');
  assert.ok(expected && expected.reason === 'military_only', 'fixture must be non-dockable (military_only)');
  const generic = dockDenyReason({ militaryOnly: true }, null);
  assert.notEqual(expected.text, generic.text, 'faction_scn must have flavored military_only text');

  dockDenyBanner.init(ctx);
  bus.emit('dock:attempt', { stationId: 'station_customs' });

  assert.equal(sayCalls.length, 1, `exactly one comm-denial voice line; got ${sayCalls.length}`);
  assert.equal(sayCalls[0].channel, 'comms', `denial must route on 'comms'; got ${sayCalls[0].channel}`);
  assert.equal(sayCalls[0].text, expected.text, 'the voiced line must be the FLAVORED denial text');
  assert.equal(sayCalls[0].factionId, 'faction_scn', 'voice carries faction attribution');

  const rec = state.ui.dockDeny;
  assert.ok(rec, 'scan-result record must land on state.ui.dockDeny');
  assert.equal(rec.label, 'Customs Gate', 'scan line names the station');
  assert.equal(rec.reason, 'military_only', 'scan line names the reason code');
  assert.equal(rec.text, expected.text, 'scan line carries the flavored text');
  assert.equal(denied.length, 1, 'dock:denied emitted once for future consumers');
  dockDenyBanner.destroy();
}

function assertAbandonedStationDenial() {
  const data = { stationId: 'station_hulk', name: 'Silent Hulk', factionId: 'faction_reach', abandoned: true };
  const { ctx, bus, state, sayCalls } = makeCtx(data);
  const expected = dockDenyReason({ ...data }, 'faction_reach');
  assert.equal(expected.reason, 'abandoned');

  dockDenyBanner.init(ctx);
  bus.emit('dock:attempt', { stationId: 'station_hulk' });
  assert.equal(sayCalls.length, 1, 'abandoned station speaks one denial');
  assert.equal(sayCalls[0].text, expected.text, 'Reach-flavored abandoned line wins');
  assert.equal(state.ui.dockDeny.reason, 'abandoned');
  dockDenyBanner.destroy();
}

function assertRepGatedStationDenial() {
  // minRep 50 vs live rep 0 → hostile_rep through the factionMeta.rep path (the banner must pass
  // live rep inside factionMeta, or dockDenyReason can never see it).
  const data = { stationId: 'station_club', name: 'Members Club', factionId: 'faction_mts', minRep: 50 };
  const { ctx, bus, state, sayCalls } = makeCtx(data, { factions: { faction_mts: { rep: 0 } } });

  dockDenyBanner.init(ctx);
  bus.emit('dock:attempt', { stationId: 'station_club' });
  assert.equal(sayCalls.length, 1, 'rep-gated station speaks one denial');
  assert.equal(state.ui.dockDeny.reason, 'hostile_rep', `rep below minRep must deny hostile_rep; got ${state.ui.dockDeny && state.ui.dockDeny.reason}`);
  const expected = dockDenyReason({ ...data }, { id: 'faction_mts', rep: 0 });
  assert.equal(sayCalls[0].text, expected.text, 'Meridian-flavored hostile_rep line wins');
  dockDenyBanner.destroy();
}

// ── dockable + debounce ────────────────────────────────────────────────────────────────────────

function assertDockableStationSurfacesNothing() {
  const data = { stationId: 'station_helios', name: 'Helios Station', factionId: 'faction_scn' };
  const { ctx, bus, state, sayCalls, denied } = makeCtx(data);

  dockDenyBanner.init(ctx);
  bus.emit('dock:attempt', { stationId: 'station_helios' });
  bus.emit('dock:docked', { stationId: 'station_helios' });

  assert.equal(sayCalls.length, 0, 'dockable station → zero voice calls');
  assert.equal(state.ui.dockDeny, undefined, 'dockable station → no scan record');
  assert.equal(denied.length, 0, 'dockable station → no dock:denied');
  dockDenyBanner.destroy();
}

function assertDebouncedOncePerAttempt() {
  const data = { stationId: 'station_customs', name: 'Customs Gate', factionId: 'faction_scn', militaryOnly: true };
  const { ctx, bus, state, sayCalls } = makeCtx(data);

  dockDenyBanner.init(ctx);
  // One attempt often produces both signals back-to-back (attempt then docked) — ONE line.
  bus.emit('dock:attempt', { stationId: 'station_customs' });
  bus.emit('dock:docked', { stationId: 'station_customs' });
  assert.equal(sayCalls.length, 1, `attempt+docked double-signal must debounce to one line; got ${sayCalls.length}`);

  // A genuinely new attempt later speaks again.
  state.simTime += 10;
  bus.emit('dock:attempt', { stationId: 'station_customs' });
  assert.equal(sayCalls.length, 2, `a later separate attempt speaks again; got ${sayCalls.length}`);
  dockDenyBanner.destroy();
}
