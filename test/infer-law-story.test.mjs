// LAW-09, STORY-05, NXI-054, PRO-09, and the D119 bark slot.
// Seed 4242. Public seams only: the raid marker's ignore verb, the Verge gate line,
// one inspection beside another offense, a refused bark, and the floor-voice key.
import test from 'node:test';
import assert from 'node:assert/strict';

import { claims, raidTripChance } from '../src/systems/claims.js';
import {
  buildSystemModel,
  emitClaimDefenseIgnore,
  resolveClaimDefenseIgnoreVerb,
  resolveGalaxyMapPrimaryAction,
  emitGalaxyMapPrimaryAction,
  VALE_GATES_CLOSED_LINE,
} from '../src/ui/galaxyMap.js';
import { story } from '../src/systems/story.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { voiceArbiter, isCriticalSquelchLine } from '../src/ui/voiceArbiter.js';
import { BINDINGS, emitVoiceDismissFromBinding } from '../src/ui/bindings.js';

function makeBus() {
  const handlers = new Map();
  const log = [];
  return {
    emitLog: log,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off(evt, fn) {
      const list = handlers.get(evt) || [];
      handlers.set(evt, list.filter((h) => h !== fn));
    },
    emit(evt, payload) {
      log.push({ evt, payload });
      for (const fn of handlers.get(evt) || []) fn(payload);
      return true;
    },
  };
}

function claimBody(id, name) {
  return {
    id,
    owned: true,
    sectorId: 'sector_helios_prime',
    poiId: `poi_${id}`,
    name,
    x: 400,
    z: -180,
    spec: {
      id: 'spec_refinery',
      status: 'active',
      defense: null,
      receipts: [],
      store: { input: {}, output: { cmdty_alloys: 10 } },
      totals: { refinedTotalU: 0, soldTotalCr: 0, lostU: 0, upkeepPaidCr: 0, raidsRepelled: 0, raidsSuffered: 0 },
    },
  };
}

test('LAW-09 seed 4242: the raid marker ignore verb settles that defense as ignored', () => {
  assert.equal(raidTripChance(1), 0.4);
  assert.equal(raidTripChance(1, { deterred: true }), 0.2);

  const state = {
    meta: { seed: 4242 },
    simTime: 80,
    claims: { bodies: [claimBody('claim_raid', 'Seam Yard'), claimBody('claim_hold', 'Held Yard')] },
    nav: { waypoint: null },
  };
  const bus = makeBus();
  const sys = Object.create(claims);
  sys.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  assert.equal(sys.beginRaidDefense('claim_raid', { attackerCount: 4 }), true);
  assert.equal(sys.beginRaidDefense('claim_hold', { attackerCount: 4 }), true);

  const raid = buildSystemModel(state, 'sector_helios_prime').ownership
    .find((marker) => marker.kind === 'claim-raid' && marker.claimId === 'claim_raid');
  assert.ok(raid, 'the chart offers a raid marker');
  const verb = resolveClaimDefenseIgnoreVerb(raid);
  assert.equal(verb.event, 'claim:defenseIgnore');
  assert.equal(verb.label, 'Ignore');
  assert.equal(verb.payload.defenseId, raid.defenseId);
  assert.equal(emitClaimDefenseIgnore(bus, raid), true);

  const ignored = state.claims.bodies.find((body) => body.id === 'claim_raid');
  assert.equal(ignored.spec.defense, null);
  assert.equal(ignored.spec.status, 'raided');
  assert.equal(ignored.spec.store.output.cmdty_alloys, 3);
  const resolved = bus.emitLog.filter((row) => row.evt === 'claim:defenseResolved');
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].payload.outcome, 'ignored');
  assert.equal(bus.emitLog.filter((row) => row.evt === 'claim:defenseIgnore').length, 1);

  assert.equal(emitClaimDefenseIgnore(bus, raid), true, 'the marker can still offer the verb');
  assert.equal(bus.emitLog.filter((row) => row.evt === 'claim:defenseResolved').length, 1, 'a settled warning is not restarted');
  assert.equal(ignored.spec.store.output.cmdty_alloys, 3);

  const held = state.claims.bodies.find((body) => body.id === 'claim_hold');
  assert.equal(held.spec.defense.phase, 'warning');
  assert.equal(sys._settleDefense(held, 'defended'), true);
  assert.equal(held.spec.status, 'active');
  assert.equal(held.spec.store.output.cmdty_alloys, 10);
  assert.equal(bus.emitLog.filter((row) => row.evt === 'claim:defenseResolved' && row.payload.outcome === 'defended').length, 1);
});

test('STORY-05 seed 4242: revoking the Vale gates closes the markers and posts one why-line', () => {
  const state = {
    meta: { seed: 4242 },
    simTime: 120,
    mode: 'flight',
    player: { cargo: { items: {} } },
    world: { currentSectorId: 'sector_helios_prime' },
    story: {},
  };
  const bus = makeBus();
  const sys = Object.create(story);
  sys.init({ state, bus, helpers: {}, registry: null });
  state.story.verge.revealed = true;
  state.story.verge.evidence.kellPaperTrail = true;
  state.story.verge.evidence.kurtzLedger = true;

  const before = buildSystemModel(state, 'sector_helios_prime').points.filter((point) => point.kind === 'gate');
  assert.ok(before.length > 0, 'Helios has gate markers to close');
  assert.ok(before.every((point) => point.closed !== true));

  bus.emit('factionPresence:archiveEvidenceRead', {
    evidenceId: 'vale_gate_revocation_file',
    stationId: 'station_reading',
  });

  const revoked = bus.emitLog.filter((row) => row.evt === 'story:vergeValeGatesRevoked');
  assert.equal(revoked.length, 1);
  const comms = bus.emitLog.filter((row) => row.evt === 'comms:popup' && row.payload && row.payload.id === 'verge_vale_gates_revoked');
  assert.equal(comms.length, 1);
  assert.equal(comms[0].payload.text, VALE_GATES_CLOSED_LINE);

  const after = buildSystemModel(state, 'sector_helios_prime').points.filter((point) => point.kind === 'gate');
  assert.equal(after.length, before.length);
  assert.ok(after.every((point) => point.closed === true && point.status === 'CLOSED'));
  assert.ok(after.every((point) => point.statusLine === VALE_GATES_CLOSED_LINE));
  const action = resolveGalaxyMapPrimaryAction(state, after[0]);
  assert.equal(action.kind, 'closed');
  assert.equal(action.label, 'Gate closed');
  assert.equal(emitGalaxyMapPrimaryAction(bus, action), false);

  bus.emit('factionPresence:archiveEvidenceRead', {
    evidenceId: 'vale_gate_revocation_file',
    stationId: 'station_reading',
  });
  assert.equal(bus.emitLog.filter((row) => row.evt === 'comms:popup' && row.payload && row.payload.id === 'verge_vale_gates_revoked').length, 1);
  assert.equal(state.story.verge.revocations.length, 1);
});

test('NXI-054: settling one inspection leaves the other offense and does not zero heat', () => {
  const state = {
    meta: { seed: 4242 },
    simTime: 40,
    tick: 10,
    mode: 'flight',
    playerId: 'player',
    player: { heat: 6.5, credits: 4000 },
    ui: {},
    world: { currentSectorId: 'sector_helios_prime' },
  };
  const bus = makeBus();
  const law = Object.create(lawSecurity);
  law.init({ state, bus, helpers: {}, registry: { get() { return null; } } });

  state.lawSecurity.incidents['theft-keep'] = {
    id: 'theft-keep',
    status: 'monitoring',
    attackerId: 'player',
    victimId: 'hauler-2',
    stationId: 'station_other',
    factionId: 'faction_scn',
    cause: 'theft',
    responderIds: [],
    radius: 800,
    lastDamageAt: 40,
    dispatchAt: 9999,
  };
  const firstPatrol = 'world:patrol-one';
  const olderPatrol = 'world:patrol-older';
  const firstCase = {
    id: 'lawful-inspection:world:patrol-one:1',
    patrolWorldRecordId: firstPatrol,
    stationId: 'station_helios',
    sectorId: 'sector_helios_prime',
    factionId: 'faction_scn',
    suspicion: 'illicit_cargo',
    phase: 'offered',
    offeredAt: 30,
    deadlineAt: 40,
  };
  state.player.lawfulInspection = {
    sequence: 1,
    active: firstCase,
    last: null,
    settledPatrolIds: [olderPatrol],
  };

  assert.equal(law._resolveLawfulInspection(firstCase, 'cleared'), true);
  assert.equal(state.player.heat, 6.5);
  assert.equal(state.lawSecurity.incidents['theft-keep'].id, 'theft-keep');
  assert.equal(state.lawSecurity.incidents['theft-keep'].status, 'monitoring');
  assert.equal(state.player.lawfulInspection.active, null);
  assert.equal(state.player.lawfulInspection.last.id, firstCase.id);
  assert.equal(state.player.lawfulInspection.last.outcome, 'cleared');
  assert.ok(state.player.lawfulInspection.settledPatrolIds.includes(firstPatrol));
  assert.ok(state.player.lawfulInspection.settledPatrolIds.includes(olderPatrol));
  assert.equal(bus.emitLog.filter((row) => row.evt === 'heat:clear').length, 0);

  assert.equal(law._resolveLawfulInspection(firstCase, 'cleared'), false);
  assert.equal(state.player.lawfulInspection.last.outcome, 'cleared');
  assert.equal(state.player.lawfulInspection.active, null);

  const secondCase = {
    id: 'lawful-inspection:world:patrol-two:2',
    patrolWorldRecordId: 'world:patrol-two',
    stationId: 'station_helios',
    sectorId: 'sector_helios_prime',
    factionId: 'faction_scn',
    suspicion: 'customs_hot',
    phase: 'scanning',
    offeredAt: 41,
    deadlineAt: 51,
  };
  state.player.lawfulInspection.active = secondCase;
  assert.equal(law._resolveLawfulInspection(secondCase, 'contraband_discovered'), true);
  assert.equal(state.player.lawfulInspection.last.outcome, 'contraband_discovered');
  assert.equal(state.player.lawfulInspection.last.id, secondCase.id);
  assert.ok(state.player.lawfulInspection.settledPatrolIds.includes(firstPatrol));
  assert.ok(state.player.lawfulInspection.settledPatrolIds.includes('world:patrol-two'));
  assert.equal(state.player.heat, 6.5);
  assert.equal(state.lawSecurity.incidents['theft-keep'].status, 'monitoring');
  assert.equal(bus.emitLog.filter((row) => row.evt === 'heat:clear').length, 0);
});

test('D119: a refused bark can be spoken later and an accepted bark happens once', () => {
  const calls = [];
  const state = { meta: { seed: 4242 }, simTime: 12 };
  const director = Object.create(barkDirector);
  director.state = state;
  director.bus = null;
  director.helpers = {
    voice: {
      say(msg) {
        calls.push(msg.text);
        return calls.length > 1;
      },
    },
  };
  const entity = { id: 'npc-9', factionId: 'faction_reach', alive: true };
  const lineFor = () => 'Hold the lane.';
  assert.equal(director._speakEventLine(entity, 'law-pursuit', 'law:wantedWarrantPosted', lineFor), false);
  assert.equal(state.barkDirector.entities['npc-9'].said['law-pursuit'], undefined);
  assert.equal(director._speakEventLine(entity, 'law-pursuit', 'law:wantedWarrantPosted', lineFor), true);
  assert.equal(state.barkDirector.entities['npc-9'].said['law-pursuit'], true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0], calls[1]);
  assert.equal(director._speakEventLine(entity, 'law-pursuit', 'law:wantedWarrantPosted', lineFor), false);
  assert.equal(calls.length, 2);
});

test('PRO-09: the voice-dismiss binding clears the floor pill once and leaves critical squelch', () => {
  assert.equal(BINDINGS.voiceDismiss.code, 'F6');
  assert.equal(BINDINGS.voiceDismiss.shift, undefined);
  assert.equal(BINDINGS.voiceDismiss.ctrl, undefined);

  const bus = makeBus();
  const state = { simTime: 3, onboarding: { active: false, finished: true } };
  const helpers = {};
  voiceArbiter.init({ bus, state, helpers });
  voiceArbiter.newGame();
  helpers.voice.say({ channel: 'comms', text: 'Hail the deck.', ttl: 8, id: 'floor-1' });
  voiceArbiter.update(0, state);
  assert.equal(voiceArbiter.queue.active.text, 'Hail the deck.');

  assert.equal(emitVoiceDismissFromBinding(bus, { key: 'v', code: 'KeyV' }), false);
  assert.equal(emitVoiceDismissFromBinding(bus, { key: 'F6', code: 'F6', shiftKey: true }), false);
  assert.equal(voiceArbiter.queue.active.text, 'Hail the deck.');

  assert.equal(emitVoiceDismissFromBinding(bus, { key: 'F6', code: 'F6' }), true);
  assert.equal(voiceArbiter.queue.active, null);
  assert.equal(bus.emitLog.filter((row) => row.evt === 'voice:clear').length, 1);
  assert.equal(emitVoiceDismissFromBinding(bus, { key: 'F6', code: 'F6' }), true);
  assert.equal(bus.emitLog.filter((row) => row.evt === 'voice:clear').length, 1);

  voiceArbiter.newGame();
  helpers.voice.say({
    channel: 'alert',
    text: 'Hull breach.',
    kind: 'danger',
    priority: 110,
    ttl: 8,
    id: 'crit-1',
  });
  voiceArbiter.update(0, state);
  assert.equal(isCriticalSquelchLine(voiceArbiter.queue.active), true);
  const clearsBefore = bus.emitLog.filter((row) => row.evt === 'voice:clear').length;
  assert.equal(emitVoiceDismissFromBinding(bus, { key: 'F6', code: 'F6' }), true);
  assert.equal(voiceArbiter.queue.active.text, 'Hull breach.');
  assert.equal(bus.emitLog.filter((row) => row.evt === 'voice:clear').length, clearsBefore);
});
