import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { SECTORS } from '../src/data/sectors.js';
import { MISSION_TUNING } from '../src/data/missions.js';
import { scanner as scannerProto } from '../src/systems/scanner.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { stationContacts as contactsProto } from '../src/systems/stationContacts.js';
import { contactHailAvailability } from '../src/data/contactHail.js';
import { stationResidentChannel, stationResidentWork, lanternWardResidentFor,
  stationResidentLine, residentsForStation } from '../src/data/stationContactPresence.js';
import { canonicalContactsForStation, LANTERN_WARD_CONTACT_ID } from '../src/data/stationResidents.js';
import { stationContactMemoryFor, normalizeStationContactRecord } from '../src/data/stationContacts.js';
import { generateContacts, buildReply } from '../src/ui/station/barContacts.js';
import { missionDockAttention } from '../src/ui/station/missionDockAttention.js';
import { lanternWardActorSpec } from '../src/world/lanternWardActors.js';
import { lanternWardCanonicalAnchor } from '../src/data/lanternWardHardware.js';
import { addCargo } from '../src/systems/cargo.js';
import { save as saveProto } from '../src/save/saveSystem.js';

// Strict synchronous bus: native owner failures must fail the test, not be hidden by
// the production bus's presentation error isolation.
function makeBus() {
  const listeners = new Map(), events = [];
  return { events,
    on(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); },
    off(name, fn) { const rows = listeners.get(name) || []; const i = rows.indexOf(fn); if (i >= 0) rows.splice(i, 1); },
    emit(name, payload) {
      events.push({ name, payload: structuredClone(payload) });
      for (const fn of [...(listeners.get(name) || [])]) fn(payload);
    },
  };
}

function fixture(stationId = 'station_tethys') {
  const state = createGameState(969), bus = makeBus();
  const sector = SECTORS.find(row => row.stations?.some(station => station.id === stationId));
  const stationDef = sector.stations.find(row => row.id === stationId);
  state.mode = 'flight'; state.simTime = 100; state.tick = 6000;
  state.world.currentSectorId = sector.id;
  state.playerId = 1; state.player.targetId = 2;
  state.player.credits = 10000;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 120 };
  const player = { id: 1, type: 'ship', alive: true, hull: 100, team: 1,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {} };
  const station = { id: 2, type: 'station', alive: true, occupantGeneration: 1,
    pos: { x: 300, z: 0 }, radius: 80,
    data: { stationId, name: stationDef.name } };
  state.entities = new Map([[1, player], [2, station]]); state.entityList = [player, station];
  state.missions.active = []; state.missions.boards = {}; state.missions.receipts = [];
  state.missions.nextId = 1; state.missions.config = { ...MISSION_TUNING, refreshSec: 600, maxActive: 8 };
  state.factions.faction_quiet = { rep: 0 }; state.factions.faction_mts = { rep: 0 };
  const missionOwner = Object.create(missionsProto), contactOwner = Object.create(contactsProto);
  const system = Object.create(scannerProto);
  const registry = { get: id => id === 'missions' ? missionOwner : null };
  const helpers = { voice: { say: () => true }, hash32: () => 1, mulberry32: () => () => 0.5 };
  bus.on('economy:grantCredits', p => { state.player.credits += Math.max(0, Math.round(p.amount || 0)); });
  bus.on('economy:chargeCredits', p => { state.player.credits -= Math.max(0, Math.round(p.amount || 0)); });
  missionOwner.init({ state, bus, registry, helpers });
  contactOwner.init({ state, bus, registry, helpers });
  system.init({ state, bus, registry, helpers });
  return { state, bus, system, missionOwner, contactOwner, station, player, stationId,
    latest(name = 'contactHail:offer') { return bus.events.filter(event => event.name === name).at(-1)?.payload; },
    request() { bus.emit('contactHail:request', { targetId: state.player.targetId }); return this.latest(); },
    choose(offer, choice) { bus.emit('contactHail:choice', { requestId: offer.requestId, targetId: offer.targetId, choice }); return this.latest(); },
    post(offer) { state.missions.boards[stationId] = { stationId, refreshEpoch: missionOwner._epoch(), slots: [offer] }; },
    poll() { state.tick += 12; system._updateContactHail(state); },
    destroy() { system.destroy(); contactOwner.destroy(); },
  };
}

function offerFor(h, extra = {}) {
  return { id: 'posted_survey', type: 'recon_scan', title: 'Read the yard approaches',
    brief: 'Scan the working approaches, then let the recorder file the result.',
    stationId: h.stationId, destStationId: h.stationId, destSectorId: h.state.world.currentSectorId,
    reward_cr: 500, collateral_cr: 0, riskTier: 0, deadline_sec: 600,
    params: { scanTargets: 1 }, ...extra };
}

test('the actual Tethys berth opens the same Mira as the dock without taking flight controls', () => {
  const h = fixture();
  try {
    const before = structuredClone({ mode: h.state.mode, input: h.state.input, player: h.player,
      credits: h.state.player.credits, cargo: h.state.player.cargo, nav: h.state.nav });
    const offer = h.request();
    const dock = generateContacts(h.stationId, h.state).find(row => row.name === 'Mira');
    assert.equal(offer.contactId, dock.id);
    assert.equal(offer.residentName, 'Mira');
    assert.equal(offer.kind, 'resident');
    assert.ok(offer.actions.length <= 3 && offer.lines.length <= 2);
    assert.deepEqual({ mode: h.state.mode, input: h.state.input, player: h.player,
      credits: h.state.player.credits, cargo: h.state.player.cargo, nav: h.state.nav }, before);
    assert.equal(h.bus.events.some(event => ['ui:open', 'camera:focus', 'ui:pause'].includes(event.name)), false);
    assert.equal(h.state.missions.active.length, 0, 'opening a channel does not accept its work');
  } finally { h.destroy(); }
});

test('available work accepts through missions exactly once, completes through a real scan, and retires', () => {
  const h = fixture();
  try {
    const intro = h.request(); h.post(offerFor(h));
    const work = h.choose(intro, 'resident_work');
    assert.equal(work.workStatus, 'available'); assert.equal(work.workGlyph, '!');
    assert.ok(work.actions.some(action => action.id === 'resident_accept'));
    const oldPacket = { requestId: work.requestId, targetId: work.targetId, choice: 'resident_accept' };
    h.bus.on('mission:accepted', () => h.bus.emit('contactHail:choice', oldPacket));
    h.bus.emit('contactHail:choice', oldPacket); h.bus.emit('contactHail:choice', oldPacket);
    assert.equal(h.state.missions.active.length, 1);
    assert.equal(h.bus.events.filter(event => event.name === 'mission:accepted').length, 1);
    assert.equal(h.latest().workStatus, 'active'); assert.equal(h.latest().workGlyph, '◇');
    assert.equal(h.state.player.credits, 10000, 'acceptance is not completion');
    h.bus.emit('scan:completed', { targetId: null, sectorId: h.state.world.currentSectorId });
    assert.equal(h.state.missions.active.length, 0);
    assert.equal(h.state.player.credits, 10500);
    const receipt = h.state.missions.receipts[0]; assert.equal(receipt.outcome, 'completed');
    h.poll();
    assert.notEqual(h.latest().missionId, receipt.missionId, 'completed work retires even when its owner posts other jobs');
    assert.notEqual(h.latest().workStatus, 'active');
    h.choose(h.latest(), 'resident_local');
    assert.match(h.latest().lines[1], /filed|settlement/i);
    const again = h.latest(); h.choose(again, 'resident_work'); h.choose(h.latest(), 'resident_local');
    assert.equal(h.state.player.credits, 10500); assert.equal(h.state.missions.receipts.length, 1);
    const dock = generateContacts(h.stationId, h.state).find(row => row.id === intro.contactId);
    assert.equal(dock.line, h.latest().lines[1], 'dock and flight acknowledge the same committed result');
  } finally { h.destroy(); }
});

test('freight uses the physical dock handoff; a resident call cannot create sealed cargo', () => {
  const h = fixture();
  try {
    const intro = h.request(); h.post(offerFor(h, { id: 'sealed', type: 'cargo_delivery',
      preloadedCargo: true, params: { cmdtyId: 'cmdty_ore_iron', qty: 4 }, destStationId: 'station_ceres' }));
    const work = h.choose(intro, 'resident_work');
    assert.equal(work.workStatus, 'available');
    assert.ok(work.actions.some(action => action.id === 'resident_berth'));
    assert.equal(work.actions.some(action => action.id === 'resident_accept'), false);
    h.choose(work, 'resident_accept');
    assert.equal(h.state.missions.active.length, 0); assert.deepEqual(h.state.player.cargo.items, {});
    h.choose(work, 'resident_berth');
    const course = h.latest('ui:setCourse'); assert.equal(course.targetEntityId, h.station.id);
    assert.equal(course.autopilot, false); assert.equal(h.state.mode, 'flight');
  } finally { h.destroy(); }
});

test('cargo readiness agrees with docking, does not spend sibling seals, and settles only once', () => {
  const h = fixture();
  try {
    h.request(); h.state.missions.boards[h.stationId].slots = [];
    const mission = { id: 'loose', type: 'cargo_delivery', title: 'Feed the yard', stationId: 'station_helios',
      destStationId: h.stationId, destSectorId: h.state.world.currentSectorId,
      params: { cmdtyId: 'cmdty_ore_iron', qty: 4 }, objectiveProgress: 0, reward_cr: 800,
      collateral_cr: 0, targetEntityIds: [], needsTargets: false, status: 'active', acceptedAt_s: 1 };
    const sibling = { ...mission, id: 'sealed_elsewhere', destStationId: 'station_ceres', preloadedCargo: true,
      params: { cmdtyId: 'cmdty_ore_iron', qty: 4, sealAccounted: true, sealedRemaining: 4, sealedDelivered: 0 } };
    h.state.missions.active = [sibling, mission]; addCargo(h.state, 'cmdty_ore_iron', 4);
    assert.equal(stationResidentWork(h.state, h.stationId).status, 'active');
    assert.equal(missionDockAttention(h.state, h.stationId).kind, 'active');
    h.poll(); assert.equal(h.latest().workGlyph, '◇');
    h.bus.emit('dock:docked', { stationId: h.stationId });
    assert.equal(mission.status, 'active'); assert.equal(h.state.player.credits, 10000);
    addCargo(h.state, 'cmdty_ore_iron', 4);
    assert.equal(stationResidentWork(h.state, h.stationId).status, 'ready');
    assert.equal(missionDockAttention(h.state, h.stationId).kind, 'turn_in');
    const intro = h.request(), ready = h.choose(intro, 'resident_work');
    assert.equal(ready.workGlyph, '✓'); assert.match(ready.workLabel, /Ready to settle/);
    h.choose(ready, 'resident_berth'); assert.equal(mission.status, 'active');
    h.bus.emit('dock:docked', { stationId: h.stationId }); h.bus.emit('dock:docked', { stationId: h.stationId });
    assert.equal(mission.status, 'completed'); assert.equal(h.state.player.credits, 10800);
    assert.equal(h.state.player.cargo.items.cmdty_ore_iron, 4, 'sibling cargo remains reserved');
    assert.equal(h.state.missions.receipts.filter(row => row.missionId === mission.id).length, 1);
    assert.notEqual(stationResidentWork(h.state, h.stationId)?.focusMissionId, mission.id);
  } finally { h.destroy(); }
});

test('native eligibility hides expired, unaffordable, unqualified, and over-capacity work', () => {
  for (const kind of ['expired', 'funds', 'standing', 'capacity', 'active-cap']) {
    const h = fixture();
    try {
      const intro = h.request(), posted = offerFor(h);
      if (kind === 'expired') posted.expiresAtEpoch = h.missionOwner._epoch();
      if (kind === 'funds') posted.collateral_cr = 10001;
      if (kind === 'standing') { posted.factionId = 'faction_mts'; posted.minRep = 90; }
      if (kind === 'capacity') { posted.type = 'cargo_delivery'; posted.preloadedCargo = true;
        posted.params = { cmdtyId: 'cmdty_ore_iron', qty: 1000 }; }
      if (kind === 'active-cap') h.state.missions.active = Array.from({ length: 8 }, (_, i) => ({ id: `other${i}`, status: 'active', type: 'patrol_clear', stationId: 'station_ceres' }));
      h.post(posted);
      const result = h.missionOwner.contactOfferReadiness(h.stationId, posted.id);
      assert.equal(result.ok, false, kind); assert.ok(result.reason, kind);
      const work = h.choose(intro, 'resident_work');
      assert.equal(work.workStatus, null, kind);
      assert.equal(work.actions.some(action => action.id === 'resident_accept'), false, kind);
    } finally { h.destroy(); }
  }
});

test('native eligibility is re-read on accept and stale terms cannot survive the open panel', () => {
  const h = fixture();
  try {
    const intro = h.request(), posted = offerFor(h, { collateral_cr: 250 }); h.post(posted);
    const work = h.choose(intro, 'resident_work'); h.state.player.credits = 10;
    h.choose(work, 'resident_accept');
    assert.equal(h.state.missions.active.length, 0); assert.equal(h.state.player.credits, 10);
    assert.match(h.latest().lines[1], /250 cr/);
    assert.equal(h.latest().workStatus, null);
    h.state.player.credits = 10000; h.poll(); assert.equal(h.latest().workStatus, 'available');
    const prior = h.latest(); posted.expiresAtEpoch = h.missionOwner._epoch(); h.poll();
    assert.equal(h.latest().workStatus, null); assert.notEqual(h.latest().requestId, prior.requestId);
    h.choose(prior, 'resident_accept'); assert.equal(h.state.missions.active.length, 0);
  } finally { h.destroy(); }
});

test('unrelated tracked work never marks the current berth as an active return target', () => {
  const h = fixture();
  try {
    h.state.missions.active = [{ id: 'far', status: 'active', type: 'patrol_clear',
      stationId: 'station_ceres', destStationId: 'station_helios' }];
    h.state.ui.trackedMissionId = 'far';
    assert.equal(stationResidentWork(h.state, h.stationId), null);
    assert.equal(missionDockAttention(h.state, h.stationId).focusMissionId, 'far', 'existing dock routing retains its global tracked job');
  } finally { h.destroy(); }
});

test('Nyx gates explain absence, open the canonical Yune, and close a now-ineligible conversation', () => {
  const h = fixture('station_nyx_march');
  try {
    h.state.story.beatIndex = 0; h.state.factions.faction_quiet.rep = 0;
    let offer = h.request(); assert.equal(offer.contactId, null); assert.match(offer.lines[1], /campaign advances/);
    h.state.story.beatIndex = 6; offer = h.request(); assert.equal(offer.contactId, null); assert.match(offer.lines[1], /25 quiet standing/);
    h.state.factions.faction_quiet.rep = 25; offer = h.request();
    assert.equal(offer.contactId, 'contact_yune');
    assert.equal(generateContacts(h.stationId, h.state).filter(row => row.id === offer.contactId).length, 1);
    h.choose(offer, 'resident_local');
    assert.equal(stationContactMemoryFor(h.state, 'contact_yune').talkCount, 1);
    h.state.factions.faction_quiet.rep = 24; h.poll();
    assert.equal(h.system._contactHail, null); assert.equal(h.latest('contactHail:clear').reason, 'availability_lost');
    h.choose(offer, 'resident_local'); assert.equal(stationContactMemoryFor(h.state, 'contact_yune').talkCount, 1);
  } finally { h.destroy(); }
});

test('missing, dead, moved, recycled and closed channels cannot record speech or take work', () => {
  for (const kind of ['missing', 'dead', 'moved', 'recycled', 'range', 'closed', 'loaded']) {
    const h = fixture();
    try {
      const intro = h.request(); h.post(offerFor(h)); const work = h.choose(intro, 'resident_work');
      const before = stationContactMemoryFor(h.state, work.contactId).talkCount;
      if (kind === 'missing') h.state.entities.delete(h.station.id);
      if (kind === 'dead') h.station.alive = false;
      if (kind === 'moved') h.state.world.currentSectorId = 'sector_helios_prime';
      if (kind === 'recycled') h.state.entities.set(h.station.id, { ...h.station, occupantGeneration: 2 });
      if (kind === 'range') h.player.pos.x = 10000;
      if (kind === 'closed') h.bus.emit('contactHail:cancel', { requestId: work.requestId, targetId: work.targetId });
      if (kind === 'loaded') h.bus.emit('game:load', {});
      h.choose(work, 'resident_accept');
      assert.equal(h.state.missions.active.length, 0, kind);
      assert.equal(stationContactMemoryFor(h.state, work.contactId).talkCount, before, kind);
    } finally { h.destroy(); }
  }
});

test('synchronous owner events cannot resurrect a recycled channel or write speech into a successor save', () => {
  for (const change of ['mode', 'generation', 'station', 'restore']) {
    const h = fixture();
    try {
      const intro = h.request(); h.post(offerFor(h)); const work = h.choose(intro, 'resident_work');
      const before = stationContactMemoryFor(h.state, work.contactId).talkCount;
      h.bus.on('mission:accepted', () => {
        if (change === 'mode') { h.state.mode = 'menu'; h.bus.emit('mode:changed', {}); }
        if (change === 'generation') h.station.occupantGeneration += 1;
        if (change === 'station') h.station.data.stationId = 'station_ceres';
        if (change === 'restore') { h.state.player = createGameState(888).player; h.bus.emit('save:loaded', {}); }
      });
      h.choose(work, 'resident_accept');
      assert.equal(h.state.missions.active.length, 1, change); assert.equal(h.system._contactHail, null, change);
      assert.equal(h.latest('contactHail:clear').reason, 'availability_lost', change);
      const memory = stationContactMemoryFor(h.state, work.contactId);
      assert.equal(memory?.talkCount ?? 0, change === 'restore' ? 0 : before, change);
    } finally { h.destroy(); }
  }
});

test('Nessa shares a saved identity between the real launch and the dock field radio', () => {
  const h = fixture('station_helios');
  try {
    const nessa = { ...lanternWardActorSpec('tug', lanternWardCanonicalAnchor()), id: 3, alive: true, occupantGeneration: 1 };
    nessa.data.jobId = 'job:lantern-ward:tug';
    nessa.pos = { x: 200, z: 0 };
    h.state.entities.set(nessa.id, nessa); h.state.entityList.push(nessa);
    h.state.npcJobs = { byId: {}, lanternWard: { version: 1, initialized: true, phase: 'installed',
      objects: {}, history: { playerCleared: true }, observedS: 80 } };
    h.state.player.targetId = nessa.id;
    const physical = h.request(); assert.equal(physical.contactId, LANTERN_WARD_CONTACT_ID);
    h.choose(physical, 'status');
    const memory = stationContactMemoryFor(h.state, LANTERN_WARD_CONTACT_ID);
    assert.equal(memory.talkCount, 1); assert.equal(memory.name, 'Nessa Venn');
    assert.equal(memory.lastDockSimTime, 0, 'a radio call is not a dock visit');
    const serializer = Object.create(saveProto); serializer.state = h.state;
    const saved = JSON.parse(JSON.stringify(serializer._serializePlayer()));
    h.state.player.stationContacts = Object.fromEntries(Object.entries(saved.stationContacts)
      .map(([id, row]) => [id, normalizeStationContactRecord(row)]));
    const dock = generateContacts(h.stationId, h.state).find(row => row.id === physical.contactId);
    assert.ok(dock); assert.match(dock.roleLabel, /field radio/);
    assert.equal(dock.factionId, nessa.factionId); assert.equal(physical.residentFactionId, nessa.factionId);
    assert.equal(stationContactMemoryFor(h.state, dock.id).talkCount, 1);
    const reply = buildReply(dock.role, 'ward_work', { state: h.state, bus: h.bus }, h.stationId, dock);
    assert.match(reply.text, /lamp|light|remember|room/i);
    nessa.alive = false;
    assert.equal(lanternWardResidentFor(h.state), null);
    assert.equal(generateContacts(h.stationId, h.state).some(row => row.id === physical.contactId), false);
    assert.match(buildReply(dock.role, 'ward_work', { state: h.state, bus: h.bus }, h.stationId, dock).text, /unavailable/);
    assert.equal(stationContactMemoryFor(h.state, physical.contactId).talkCount, 1, 'absence never erases history');
  } finally { h.destroy(); }
});

test('duplicate or lost original launches never produce a second Nessa', () => {
  const h = fixture('station_helios');
  try {
    h.state.npcJobs = { lanternWard: { version: 1, initialized: true, phase: 'blocked', objects: {}, history: {} } };
    const spec = lanternWardActorSpec('tug', lanternWardCanonicalAnchor());
    for (const id of [3, 4]) { const actor = { ...spec, id, alive: true }; h.state.entities.set(id, actor); h.state.entityList.push(actor); }
    assert.equal(lanternWardResidentFor(h.state), null);
    h.state.player.targetId = 3;
    assert.equal(contactHailAvailability(h.state).enabled, false, 'the physical hail agrees with the duplicate-identity refusal');
    h.state.entities.delete(4); h.state.entityList.pop();
    assert.ok(lanternWardResidentFor(h.state));
    h.state.npcJobs.lanternWard.objects.tug = { lost: true };
    assert.equal(lanternWardResidentFor(h.state), null);
    assert.equal(contactHailAvailability(h.state).enabled, false, 'a saved lost original cannot answer as a stale living actor');
  } finally { h.destroy(); }
});

test('resident projection and three-state reads are pure and deterministic', () => {
  const h = fixture();
  try {
    const snapshot = () => JSON.stringify(h.state, (_, value) => value instanceof Map ? [...value] : value);
    h.post(offerFor(h)); const before = snapshot();
    const first = stationResidentChannel(h.state, h.station);
    assert.deepEqual(stationResidentChannel(h.state, h.station), first);
    assert.deepEqual(residentsForStation(h.state, h.stationId), canonicalContactsForStation(h.stationId));
    const work = stationResidentWork(h.state, h.stationId, row => h.missionOwner.contactOfferReadiness(h.stationId, row.id));
    assert.equal(work.status, 'available'); assert.ok(contactHailAvailability(h.state).enabled);
    stationResidentLine(h.state, h.stationId, first.residents[0]);
    assert.equal(snapshot(), before);
  } finally { h.destroy(); }
});
