// CR-WEIR — customs is a gate you can fly, not the empty zone disc.
// Helios is a corridor. Tethys is a cone. A contraband body inside is what gets seen.
import assert from 'node:assert/strict';
import test from 'node:test';

import { readCustomsWeir } from '../src/presentation/customsWeir.js';
import { JETTISONED_CARGO_PAYLOAD_TYPE } from '../src/systems/lootShards.js';
import { customsPrompt } from '../src/ui/customsPrompt.js';
import { factions } from '../src/systems/factions.js';
import { heat } from '../src/systems/heat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import {
  HELIOS_CUSTOMS_WEIR,
  TETHYS_CUSTOMS_WEIR,
  pointInsideCustomsWeir,
} from '../src/world/customsWeir.js';

function harness(sectorId, playerPos) {
  const player = {
    id: 'pilot', type: 'ship', alive: true, team: 0, isPlayer: true,
    pos: { ...playerPos }, vel: { x: 0, z: 0 }, hull: 140, hullMax: 140,
  };
  const events = [];
  const scanCalls = [];
  const state = {
    mode: 'flight',
    tick: 0,
    simTime: 0,
    playerId: player.id,
    player: {},
    entities: new Map([[player.id, player]]),
    entityList: [player],
    world: { currentSectorId: sectorId },
  };
  const sys = Object.create(lawSecurity);
  sys.bus = { emit(name, payload) { events.push({ name, payload }); } };
  sys.state = state;
  sys.registry = {
    get(name) {
      if (name !== 'economy') return null;
      return {
        runScan(p) { scanCalls.push(p); return { found: false }; },
      };
    },
  };
  return { state, sys, player, events, scanCalls };
}

function contrabandPod(id, pos) {
  return {
    id,
    type: 'payload',
    alive: true,
    pos: { ...pos },
    data: {
      payloadType: JETTISONED_CARGO_PAYLOAD_TYPE,
      commodityId: 'cmdty_narcotics',
      amount: 4,
    },
  };
}

test('the Helios weir is a corridor inside the lane, not the patrol disc', () => {
  const center = HELIOS_CUSTOMS_WEIR.center;
  assert.equal(pointInsideCustomsWeir(HELIOS_CUSTOMS_WEIR, center), true);
  const inDiscOnly = { x: center.x + 400, z: center.z };
  assert.ok(Math.hypot(400, 0) < HELIOS_CUSTOMS_WEIR.zoneRadius);
  assert.equal(pointInsideCustomsWeir(HELIOS_CUSTOMS_WEIR, inDiscOnly), false);
  assert.equal(HELIOS_CUSTOMS_WEIR.shape, 'corridor');
  assert.equal(TETHYS_CUSTOMS_WEIR.shape, 'cone');
  assert.equal(pointInsideCustomsWeir(TETHYS_CUSTOMS_WEIR, center), false);
  const forward = {
    x: TETHYS_CUSTOMS_WEIR.origin.x + Math.cos(TETHYS_CUSTOMS_WEIR.heading) * 120,
    z: TETHYS_CUSTOMS_WEIR.origin.z + Math.sin(TETHYS_CUSTOMS_WEIR.heading) * 120,
  };
  const behind = {
    x: TETHYS_CUSTOMS_WEIR.origin.x - Math.cos(TETHYS_CUSTOMS_WEIR.heading) * 40,
    z: TETHYS_CUSTOMS_WEIR.origin.z - Math.sin(TETHYS_CUSTOMS_WEIR.heading) * 40,
  };
  assert.equal(pointInsideCustomsWeir(TETHYS_CUSTOMS_WEIR, forward), true);
  assert.equal(pointInsideCustomsWeir(TETHYS_CUSTOMS_WEIR, behind), false);
});

test('standing in the corridor is seen, and the hull is not the price', () => {
  const outside = { x: HELIOS_CUSTOMS_WEIR.center.x + 400, z: HELIOS_CUSTOMS_WEIR.center.z };
  const { state, sys, player, events } = harness('sector_helios_prime', outside);
  sys._updateCustomsWeir(0.2, state);
  assert.equal(readCustomsWeir(state).seen, false);
  assert.equal(events.filter((row) => row.name === 'customs:weirPresence').length, 0);
  player.pos.x = HELIOS_CUSTOMS_WEIR.center.x;
  player.pos.z = HELIOS_CUSTOMS_WEIR.center.z;
  sys._updateCustomsWeir(0.2, state);
  assert.equal(readCustomsWeir(state).seen, true);
  assert.equal(readCustomsWeir(state).shape, 'corridor');
  assert.equal(readCustomsWeir(state).segments.length, 2);
  assert.equal(events.filter((row) => row.name === 'contraband:scanned').length, 0);
  assert.equal(player.hull, 140);
  player.pos.x = outside.x;
  sys._updateCustomsWeir(0.2, state);
  assert.equal(readCustomsWeir(state).seen, false);
  assert.equal(events.filter((row) => row.name === 'customs:weirPresence' && row.payload.inside === false).length, 1);
});

test('a contraband body held in the weir is scanned once, and a legal body is not', () => {
  const center = HELIOS_CUSTOMS_WEIR.center;
  const { state, sys, player, events } = harness('sector_helios_prime', {
    x: center.x + 400,
    z: center.z,
  });
  const pod = contrabandPod('pod-hot', center);
  const legal = contrabandPod('pod-ore', { x: center.x, z: center.z + 20 });
  legal.data.commodityId = 'cmdty_ore_iron';
  state.entityList.push(pod, legal);
  sys._updateCustomsWeir(0.4, state);
  assert.equal(events.filter((row) => row.name === 'contraband:scanned').length, 0);
  sys._updateCustomsWeir(0.4, state);
  const scans = events.filter((row) => row.name === 'contraband:scanned');
  assert.equal(scans.length, 1);
  assert.equal(scans[0].payload.podId, 'pod-hot');
  assert.equal(scans[0].payload.source, 'customs_weir');
  assert.equal(scans[0].payload.found, true);
  sys._updateCustomsWeir(0.4, state);
  assert.equal(events.filter((row) => row.name === 'contraband:scanned').length, 1);
  assert.equal(player.hull, 140);
  assert.equal(legal.data.customsScanned, undefined);
});

test('a hull that holds under the beam gets read once per visit — and a hull that runs the weir does not', () => {
  const center = HELIOS_CUSTOMS_WEIR.center;
  const { state, sys, player, events, scanCalls } = harness('sector_helios_prime', { ...center });
  // Hold under the beam: the read needs 1.6s of slow presence.
  sys._updateCustomsWeir(0.9, state);
  assert.equal(scanCalls.length, 0);
  sys._updateCustomsWeir(0.9, state);
  assert.equal(scanCalls.length, 1);
  assert.equal(scanCalls[0].stationId, 'station_helios');
  assert.equal(scanCalls[0].factionId, 'faction_scn');
  assert.equal(scanCalls[0].source, 'customs_weir');
  const voices = events.filter((row) => row.name === 'law:voice');
  assert.equal(voices.length, 1);
  assert.match(voices[0].payload.text, /CUSTOMS CORRIDOR/);
  // The read is one per visit, not a re-read every beat you stay inside.
  sys._updateCustomsWeir(0.9, state);
  sys._updateCustomsWeir(0.9, state);
  assert.equal(scanCalls.length, 1);
  assert.equal(events.filter((row) => row.name === 'law:voice').length, 1);
  // Leave and come back: the next visit is a new read.
  player.pos.x = center.x + 400;
  sys._updateCustomsWeir(0.9, state);
  player.pos.x = center.x;
  sys._updateCustomsWeir(0.9, state);
  sys._updateCustomsWeir(0.9, state);
  assert.equal(scanCalls.length, 2);
  assert.equal(events.filter((row) => row.name === 'law:voice').length, 2);
});

test('running the corridor fast outruns the read, and a partial read resumes when you slow', () => {
  const center = HELIOS_CUSTOMS_WEIR.center;
  const { state, sys, player, events, scanCalls } = harness('sector_helios_prime', { ...center });
  player.vel.x = 200; // over the 34 WU/s read ceiling — the beam cannot finish.
  for (let i = 0; i < 5; i++) sys._updateCustomsWeir(0.5, state);
  assert.equal(scanCalls.length, 0);
  assert.equal(events.filter((row) => row.name === 'law:voice').length, 0);
  // A partial read earned while slow survives a burst of speed and finishes later.
  player.vel.x = 0;
  sys._updateCustomsWeir(0.9, state); // readT = 0.9
  player.vel.x = 200;
  sys._updateCustomsWeir(0.9, state); // paused, not reset
  player.vel.x = 0;
  sys._updateCustomsWeir(0.9, state); // readT = 1.8 >= 1.6
  assert.equal(scanCalls.length, 1);
});

test('a live lawful-inspection case owns the read — the weir does not double-scan', () => {
  const center = HELIOS_CUSTOMS_WEIR.center;
  const { state, sys, scanCalls } = harness('sector_helios_prime', { ...center });
  state.player.lawfulInspection = {
    active: {
      id: 'lawful-inspection:patrol-1:1',
      patrolWorldRecordId: 'patrol-1',
      stationId: 'station_helios',
      factionId: 'faction_scn',
      phase: 'offered',
    },
  };
  for (let i = 0; i < 5; i++) sys._updateCustomsWeir(0.9, state);
  assert.equal(scanCalls.length, 0);
  // When the case resolves, the next visit's read can complete.
  state.player.lawfulInspection.active = null;
  sys._updateCustomsWeir(0.9, state);
  sys._updateCustomsWeir(0.9, state);
  assert.equal(scanCalls.length, 1);
});

test('a body cut loose inside the weir is surrendered: the gate keeps it, no bust is filed', () => {
  const center = HELIOS_CUSTOMS_WEIR.center;
  const { state, sys, events } = harness('sector_helios_prime', { x: center.x + 400, z: center.z });
  const pod = contrabandPod('pod-dumped', center);
  state.entityList.push(pod);
  sys._updateCustomsWeir(0.4, state);
  sys._updateCustomsWeir(0.4, state);
  const scans = events.filter((row) => row.name === 'contraband:scanned');
  assert.equal(scans.length, 1);
  assert.equal(scans[0].payload.surrendered, true);
  assert.equal(pod.data.customsImpounded, true);
  assert.equal(pod.data.pickupEmbargoUntil, Number.MAX_SAFE_INTEGER);
});

test('surrendered cargo never files a bust or a strike; caught cargo still does', () => {
  const listeners = [];
  const bus = {
    on(name, fn) { listeners.push([name, fn]); },
    emit(name, payload) { for (const [n, fn] of listeners) if (n === name) fn(payload); },
  };
  const state = {
    mode: 'flight',
    simTime: 0,
    playerId: 'pilot',
    player: { heat: 0, cargo: { items: {} } },
    factions: {},
    entities: new Map(),
    world: {},
  };
  const heatSys = Object.create(heat);
  heatSys.init({ state, bus });
  const factionSys = Object.create(factions);
  factionSys.init({ state, bus, helpers: {} });

  bus.emit('contraband:scanned', {
    found: true, source: 'customs_weir', surrendered: true, evidenceOwnerId: null,
    factionId: 'faction_scn', confiscated: [{ commodityId: 'cmdty_narcotics', qty: 4 }],
  });
  assert.equal(state.player.heat, 0, 'surrendered goods cost the body, not a bust');
  // No faction record is even minted for a surrendered body — the ledger stays clean.
  assert.equal(state.factions.faction_scn == null ? 0 : (state.factions.faction_scn.knownContrabandStrikes || 0), 0);

  // A pod on an NPC's tow line: the gate seizes it, but the bust belongs to the owner.
  bus.emit('contraband:scanned', {
    found: true, source: 'customs_weir', surrendered: false, evidenceOwnerId: 'npc-hauler-9',
    factionId: 'faction_scn', confiscated: [{ commodityId: 'cmdty_narcotics', qty: 4 }],
  });
  assert.equal(state.player.heat, 0, 'an NPC-towed body is not the player\'s bust');
  assert.equal(state.factions.faction_scn == null ? 0 : (state.factions.faction_scn.knownContrabandStrikes || 0), 0);

  // The same body on the PLAYER's line: evidence in transit — the real bust.
  bus.emit('contraband:scanned', {
    found: true, source: 'customs_weir', surrendered: false, evidenceOwnerId: 'pilot',
    factionId: 'faction_scn', confiscated: [{ commodityId: 'cmdty_narcotics', qty: 4 }],
  });
  assert.ok(state.player.heat > 0, 'a towed body scanned in the weir is still a bust');
  assert.equal(state.factions.faction_scn.knownContrabandStrikes, 1);
});

test('a body still on a line is evidence in transit, not a surrender', () => {
  const center = HELIOS_CUSTOMS_WEIR.center;
  const { state, sys, player, events } = harness('sector_helios_prime', { x: center.x + 400, z: center.z });
  const pod = contrabandPod('pod-towed', center);
  state.entityList.push(pod);
  state.combat = {
    attachments: {
      byId: {
        'att-1': { id: 'att-1', ownerId: player.id, targetId: pod.id, state: 'active' },
        'att-old': { id: 'att-old', ownerId: player.id, targetId: 'pod-elsewhere', state: 'broken' },
      },
    },
  };
  sys._updateCustomsWeir(0.4, state);
  sys._updateCustomsWeir(0.4, state);
  const scans = events.filter((row) => row.name === 'contraband:scanned');
  assert.equal(scans.length, 1);
  assert.equal(scans[0].payload.surrendered, false);
  assert.equal(scans[0].payload.evidenceOwnerId, 'pilot');
  // The gate seizes what it catches — even evidence on your own line is impounded.
  assert.equal(pod.data.customsImpounded, true);
  assert.equal(pod.data.pickupEmbargoUntil, Number.MAX_SAFE_INTEGER);
  // Cut the line and come back: the abandoned body is surrendered on its next read.
  state.combat.attachments.byId['att-1'].state = 'broken';
  pod.data.customsScanned = false;
  sys._updateCustomsWeir(0.4, state);
  sys._updateCustomsWeir(0.4, state);
  const scans2 = events.filter((row) => row.name === 'contraband:scanned');
  assert.equal(scans2.length, 2);
  assert.equal(scans2[1].payload.surrendered, true);
  assert.equal(scans2[1].payload.evidenceOwnerId, null);
  assert.equal(pod.data.customsImpounded, true);
});

test('a pod on an NPC line scanned in the weir is impounded, but the bust belongs to the NPC', () => {
  const center = HELIOS_CUSTOMS_WEIR.center;
  const { state, sys, events } = harness('sector_helios_prime', { x: center.x + 400, z: center.z });
  const pod = contrabandPod('pod-npc-towed', center);
  state.entityList.push(pod);
  state.combat = {
    attachments: {
      byId: { 'att-npc': { id: 'att-npc', ownerId: 'npc-hauler-9', targetId: pod.id, state: 'active' } },
    },
  };
  sys._updateCustomsWeir(0.4, state);
  sys._updateCustomsWeir(0.4, state);
  const scans = events.filter((row) => row.name === 'contraband:scanned');
  assert.equal(scans.length, 1);
  assert.equal(scans[0].payload.surrendered, false);
  assert.equal(scans[0].payload.evidenceOwnerId, 'npc-hauler-9');
  assert.equal(pod.data.customsImpounded, true);
});

test('the weir does not read while a patrol intercept already owns the scan, and a dead hull is not read', () => {
  const center = HELIOS_CUSTOMS_WEIR.center;
  const { state, sys, player, events, scanCalls } = harness('sector_helios_prime', { ...center });
  state.encounterDirector = { live: { 'enc-1': { script: 'patrolScan' } } };
  for (let i = 0; i < 5; i++) sys._updateCustomsWeir(0.9, state);
  assert.equal(scanCalls.length, 0);
  state.encounterDirector.live['enc-1'].script = 'convoy';
  sys._updateCustomsWeir(0.9, state);
  sys._updateCustomsWeir(0.9, state);
  assert.equal(scanCalls.length, 1);
  // A dead hull parked in the weir is not worth a read.
  const { state: s2, sys: sys2, player: p2, scanCalls: sc2 } = harness('sector_helios_prime', { ...center });
  p2.alive = false;
  for (let i = 0; i < 5; i++) sys2._updateCustomsWeir(0.9, s2);
  assert.equal(sc2.length, 0);
  // The completed read leaves a law-response row — the authored beat is on the instruments.
  const rows = events.filter((row) => row.name === 'law:response' && row.payload.action === 'weir_read');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].payload.weirId, 'helios_customs_weir');
  assert.equal(rows[0].payload.stationId, 'station_helios');
});

test('a save boundary or a new game clears every per-visit weir latch', () => {
  const center = HELIOS_CUSTOMS_WEIR.center;
  const { state, sys, player } = harness('sector_helios_prime', { ...center });
  const pod = contrabandPod('pod-dwell', center);
  state.entityList.push(pod);
  sys._updateCustomsWeir(0.4, state); // player readT accumulates; pod dwell row opens
  assert.ok(state.lawSecurity.customsWeir.readT > 0);
  assert.ok(sys._weirPodDwell.size > 0);
  sys.deserialize({});
  assert.equal(state.lawSecurity.customsWeir, null);
  assert.equal(sys._weirPodDwell.size, 0);
  // Re-enter after the boundary: the visit latches fresh.
  sys._updateCustomsWeir(0.4, state);
  assert.equal(state.lawSecurity.customsWeir.readT, 0.4);
  assert.ok(sys._weirPodDwell.size > 0, 'dwell rows repopulate on the fresh visit');
  // newGame also clears the instance maps.
  sys.newGame();
  assert.equal(sys._weirPodDwell.size, 0);
  assert.equal(state.lawSecurity.customsWeir == null || state.lawSecurity.customsWeir.readT == null, true);
});

test('the prompt surface: no dead verb deck on a weir read, and a surrender toasts the impound', () => {
  const listeners = [];
  const emitted = [];
  const bus = {
    on(name, fn) { listeners.push([name, fn]); },
    emit(name, payload) { emitted.push({ name, payload }); for (const [n, fn] of listeners) if (n === name) fn(payload); },
  };
  const state = {
    mode: 'flight', simTime: 0, tick: 0, playerId: 'pilot',
    player: { heat: 0, cargo: { items: {} } },
    ui: {},
  };
  const econStub = {
    illicitCargo() {
      return [{ commodityId: 'cmdty_narcotics', qty: 4, def: { name: 'Narcotics', legality: 'contraband', basePrice: 220 } }];
    },
    scanningFaction() { return 'faction_scn'; },
  };
  const prompt = Object.create(customsPrompt);
  prompt.init({
    state,
    bus,
    helpers: { voice: { say() { return true; } } },
    registry: { get() { return econStub; } },
  });
  // A weir read resolves in the same tick — the decision deck must never open for it.
  bus.emit('player:scannedByPatrol', { hasContraband: true, source: 'customs_weir', factionId: 'faction_scn' });
  assert.equal(state.ui.customsPrompt, undefined, 'no phantom SUBMIT/BRIBE/RUN deck on a gate read');
  // A surrendered body's scan receipt is an impound, never a bust.
  bus.emit('contraband:scanned', {
    found: true, source: 'customs_weir', surrendered: true,
    factionId: 'faction_scn', confiscated: [{ commodityId: 'cmdty_narcotics', qty: 4 }],
  });
  const toasts = emitted.filter((e) => e.name === 'toast').map((e) => e.payload.text);
  assert.equal(toasts.length, 1);
  assert.match(toasts[0], /impounded/i);
  assert.doesNotMatch(toasts[0], /BUST|standing damaged/i);
  // A real bust (towed evidence) still reports the bust — and never prints a phantom "— cr" fine.
  bus.emit('contraband:scanned', {
    found: true, source: 'customs_weir', surrendered: false, evidenceOwnerId: 'pilot',
    factionId: 'faction_scn', confiscated: [{ commodityId: 'cmdty_narcotics', qty: 4 }],
  });
  const toasts2 = emitted.filter((e) => e.name === 'toast').map((e) => e.payload.text);
  assert.equal(toasts2.length, 2);
  assert.match(toasts2[1], /BUST/);
  assert.doesNotMatch(toasts2[1], /— cr|fined — cr/);
  // A body seized on an NPC's line: the gate acts, but the toast must not file a bust at you.
  bus.emit('contraband:scanned', {
    found: true, source: 'customs_weir', surrendered: false, evidenceOwnerId: 'npc-hauler-9',
    factionId: 'faction_scn', confiscated: [{ commodityId: 'cmdty_narcotics', qty: 4 }],
  });
  const toasts3 = emitted.filter((e) => e.name === 'toast').map((e) => e.payload.text);
  assert.equal(toasts3.length, 3);
  assert.doesNotMatch(toasts3[2], /BUST|standing damaged/i);
  assert.match(toasts3[2], /third-party/i);
});

test('the Tethys cone reads a nearly-stopped hull under its own numbers', () => {
  const origin = TETHYS_CUSTOMS_WEIR.origin;
  const inside = {
    x: origin.x + Math.cos(TETHYS_CUSTOMS_WEIR.heading) * 120,
    z: origin.z + Math.sin(TETHYS_CUSTOMS_WEIR.heading) * 120,
  };
  const { state, sys, player, scanCalls } = harness('sector_tethys_junction', inside);
  player.vel.x = 30; // above the cone's 22 WU/s ceiling — no read.
  for (let i = 0; i < 4; i++) sys._updateCustomsWeir(0.5, state);
  assert.equal(scanCalls.length, 0);
  player.vel.x = 0;
  sys._updateCustomsWeir(0.6, state);
  sys._updateCustomsWeir(0.6, state); // 1.2s >= 1.1s readDwellS
  assert.equal(scanCalls.length, 1);
  assert.equal(scanCalls[0].stationId, 'station_customs');
});
