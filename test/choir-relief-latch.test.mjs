import assert from 'node:assert/strict';
import test from 'node:test';

import { stepLatchRepair } from '../src/combat/latchRepair.js';
import { createChoirReliefBerth } from '../src/systems/choirReliefBerth.js';

// CR-CHOIR-1: the congregation must see the player's rope, not only the claim menu.
// A taut line on Mercy restores the same subsystem_drive the returned knitbots do, and the
// berth must credit that work through the shared combat:subsystemEnabled event.

function mkBus() {
  const events = [];
  return { events, emit: (type, payload) => { events.push({ type, ...(payload || {}) }); } };
}

function latchFixture({ taut = true } = {}) {
  const player = {
    id: 'p1', type: 'ship', team: 0, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 10,
  };
  const mercy = {
    id: 'mercy1', type: 'ship', team: 2, alive: true,
    pos: { x: 20, z: 0 }, vel: { x: 0, z: 0 }, radius: 12,
    hull: 50, hullMax: 100,
    data: { ai: { passive: true }, latchRepair: true },
  };
  const state = {
    playerId: 'p1',
    player: { tether: null },
    entities: new Map([['p1', player], ['mercy1', mercy]]),
    entityList: [player, mercy],
    combat: {
      attachments: {
        byId: {
          a1: {
            id: 'a1', ownerId: 'p1', targetId: 'mercy1',
            state: 'active', phase: taut ? 'loaded' : 'free', restLength: 15,
          },
        },
      },
      entities: {
        mercy1: {
          capabilities: { drive: false },
          multipliers: { movement: 0 },
          subsystems: {
            subsystem_drive: { effectiveDisabled: true, destroyed: true, health: 0, maxHealth: 20 },
          },
        },
      },
    },
  };
  return { state, player, mercy };
}

test('a taut player line heals a drive-disabled hull and emits subsystemEnabled once', () => {
  const { state, mercy } = latchFixture();
  const bus = mkBus();
  stepLatchRepair(state, 5, bus);
  assert.equal(mercy.hull, 100, 'the hull knits to full under a held taut line');
  const enabled = bus.events.filter((e) => e.type === 'combat:subsystemEnabled');
  assert.equal(enabled.length, 1, 'the restored drive speaks the shared event exactly once');
  const ev = enabled[0];
  assert.equal(ev.targetId, 'mercy1');
  assert.equal(ev.subsystemId, 'subsystem_drive');
  assert.equal(ev.source, 'latch_repair');
  assert.equal(ev.repairedBy, 'p1');
  assert.equal(ev.cueId, 'combat.subsystem.restored');
  const runtime = state.combat.entities.mercy1;
  assert.equal(runtime.capabilities.drive, true);
  assert.equal(runtime.subsystems.subsystem_drive.effectiveDisabled, false);
  // A held line on a whole hull must not re-announce the same restore.
  stepLatchRepair(state, 1, bus);
  assert.equal(bus.events.filter((e) => e.type === 'combat:subsystemEnabled').length, 1);
});

test('a slack line does no repair work', () => {
  const { state, mercy } = latchFixture({ taut: false });
  const bus = mkBus();
  // Phase 'free' plus a span under 92% of rest length: the rope is on but slack.
  state.combat.attachments.byId.a1.restLength = 400;
  stepLatchRepair(state, 5, bus);
  assert.equal(mercy.hull, 50);
  assert.equal(bus.events.length, 0);
});

test('a driveless tether-anchor profile frees without a phantom subsystem restore', () => {
  const { state, mercy } = latchFixture();
  const bus = mkBus();
  // Wreck/pickup combat profiles carry capabilities.drive:false permanently with no
  // subsystem_drive at all — freeing them must not announce a component that does not exist.
  state.combat.entities.mercy1 = { capabilities: { drive: false }, multipliers: { movement: 0 }, subsystems: {} };
  stepLatchRepair(state, 5, bus);
  assert.equal(mercy.hull, 100);
  assert.equal(state.combat.entities.mercy1.capabilities.drive, true);
  assert.equal(bus.events.filter((e) => e.type === 'combat:subsystemEnabled').length, 0);
});

test('a dead power plant blocks the restore announce — dependency still down', () => {
  const { state, mercy } = latchFixture();
  const bus = mkBus();
  state.combat.entities.mercy1.subsystems.subsystem_power = { destroyed: true, health: 0, maxHealth: 30 };
  stepLatchRepair(state, 5, bus);
  assert.equal(bus.events.filter((e) => e.type === 'combat:subsystemEnabled').length, 0);
  // The component itself is still repaired — the announce waits for the power to live.
  assert.equal(state.combat.entities.mercy1.subsystems.subsystem_drive.destroyed, false);
});

test('a destroy pending armed the same tick is disarmed by the repair', () => {
  const { state, mercy } = latchFixture();
  const bus = mkBus();
  const runtime = state.combat.entities.mercy1;
  runtime.subsystems.subsystem_drive.pendingTransition = { atTick: 1, destroyed: true };
  runtime.pendingSubsystemTransitionCount = 1;
  stepLatchRepair(state, 5, bus);
  assert.equal(runtime.subsystems.subsystem_drive.pendingTransition, null);
  assert.equal(runtime.pendingSubsystemTransitionCount, 0);
  assert.equal(bus.events.filter((e) => e.type === 'combat:subsystemEnabled').length, 1);
});

// ── the berth's side of the seam ─────────────────────────────────────────────────────────

function berthFixture() {
  const bus = mkBus();
  const patient = {
    id: 'e_patient', type: 'ship', team: 2, alive: true, pos: { x: 115, z: 40 },
    radius: 12, hull: 60, hullMax: 100, vel: { x: 0, z: 0 },
    data: { worldRecordId: 'choir-relief:7:patient', choirReliefRole: 'patient', trafficRole: 'shuttle' },
  };
  const attendant = {
    id: 'e_attendant', type: 'ship', team: 2, alive: true, pos: { x: 200, z: 40 },
    radius: 10, hull: 100, hullMax: 100, vel: { x: 0, z: 0 },
    data: { worldRecordId: 'choir-relief:7:attendant', choirReliefRole: 'attendant', trafficRole: 'tender' },
  };
  const home = {
    id: 'e_station', type: 'station', alive: true, pos: { x: 900, z: 0 }, radius: 80,
    data: { stationId: 'station_helios' },
  };
  const state = {
    meta: { seed: 7 },
    playerId: 'p1',
    world: { currentSectorId: 'sector_helios_prime', records: { byId: {} } },
    entities: new Map([[patient.id, patient], [attendant.id, attendant], [home.id, home]]),
    entityList: [patient, attendant, home],
  };
  const wrecks = {
    bearings: { wreck_choir_tender: { fixedPos: { x: 0, z: 0 } } },
    choirRelief: undefined,
  };
  const jobs = [];
  const kernel = {
    inspect: () => ({ entity: { combat: { subsystems: {} } } }),
    routeDamage: () => ({ ok: true }),
    repair: () => ({ ok: true }),
  };
  const owner = {
    state,
    bus,
    _ensureState: () => wrecks,
    registry: { get: () => ({ ensureKernel: () => kernel, kernel }) },
    helpers: {
      spawnEntity: () => null,
      npcJobs: {
        assign: (entity, job) => {
          jobs.push(job);
          entity.data.jobId = `job:${jobs.length}`;
          return entity.data.jobId;
        },
        get: () => null,
        release: () => {},
      },
    },
  };
  return { bus, patient, attendant, home, state, wrecks, jobs, owner };
}

test('a player latch-repair on Mercy restores the drive and sends the pair home', () => {
  const { bus, patient, attendant, wrecks, jobs, owner } = berthFixture();
  const berth = createChoirReliefBerth(owner);
  berth.enabled({ subsystemId: 'subsystem_drive', targetId: patient.id, repairedBy: 'p1' });
  const relief = wrecks.choirRelief;
  assert.equal(relief.driveRestored, true, 'the berth records the rope-repaired drive');
  const rep = bus.events.filter((e) => e.type === 'faction:repDelta');
  assert.equal(rep.length, 1);
  assert.equal(rep[0].factionId, 'faction_choir');
  assert.equal(rep[0].delta, 6);
  assert.equal(rep[0].reason, 'choir_relief:mercy_hand_repair');
  assert.ok(bus.events.some((e) => e.type === 'toast' && /Mercy thrusts/.test(e.text)));
  assert.equal(jobs.length, 2, 'both hulls are recommissioned home');
  assert.ok(jobs.every((job) => job.route[1].id === 'dest:station_helios'));
  assert.equal(patient.data.choirReliefReturning, true);
  assert.equal(attendant.data.choirReliefReturning, true);
});

test('the berth ignores drive-restores that are not the patient or not the player', () => {
  const { bus, patient, wrecks, owner } = berthFixture();
  const berth = createChoirReliefBerth(owner);
  berth.enabled({ subsystemId: 'subsystem_drive', targetId: 'somebody_else' });
  assert.equal(wrecks.choirRelief.driveRestored !== true, true);
  berth.enabled({ subsystemId: 'subsystem_power', targetId: patient.id, repairedBy: 'p1' });
  assert.equal(wrecks.choirRelief.driveRestored !== true, true);
  // The attendant's own hand-tools path restores the drive without paying the player.
  berth.enabled({ subsystemId: 'subsystem_drive', targetId: patient.id, repairedBy: 'npc_tender' });
  assert.equal(wrecks.choirRelief.driveRestored, true);
  assert.equal(bus.events.filter((e) => e.type === 'faction:repDelta').length, 0);
});

test('killing the hurt or their tenders costs Choir standing, not only a barkeep line', () => {
  const { bus, patient, attendant, wrecks, owner } = berthFixture();
  const berth = createChoirReliefBerth(owner);
  berth.killed({ id: patient.id, killerId: 'p1' });
  assert.equal(wrecks.choirRelief.patientLost, true);
  const rep = bus.events.filter((e) => e.type === 'faction:repDelta');
  assert.equal(rep.length, 1);
  assert.equal(rep[0].delta, -8);
  assert.equal(rep[0].reason, 'choir_relief:patient_killed');
  // Someone else's violence is not charged to the player's ledger.
  berth.killed({ id: attendant.id, killerId: 'npc_raider' });
  assert.equal(wrecks.choirRelief.attendantLost, true);
  assert.equal(bus.events.filter((e) => e.type === 'faction:repDelta').length, 1);
  // Numeric ids recycle: a second kill under the same id must not re-charge the ledger.
  berth.killed({ id: patient.id, killerId: 'p1' });
  assert.equal(bus.events.filter((e) => e.type === 'faction:repDelta').length, 1);
});

test('a re-disabled Mercy reverts to tending instead of flying home dead-stick', () => {
  const { bus, patient, wrecks, jobs, owner } = berthFixture();
  const berth = createChoirReliefBerth(owner);
  berth.enabled({ subsystemId: 'subsystem_drive', targetId: patient.id, repairedBy: 'p1' });
  assert.equal(wrecks.choirRelief.driveRestored, true);
  assert.equal(jobs.length, 2);
  assert.equal(patient.data.choirReliefReturning, true);
  berth.disabled({ subsystemId: 'subsystem_drive', targetId: patient.id });
  assert.equal(wrecks.choirRelief.driveRestored, false);
  assert.equal(patient.data.jobId, undefined, 'the dead hull releases its return job');
  assert.equal(patient.data.choirReliefReturning, undefined);
  // A second repair re-commissions the flight — the flag is state, not a one-way latch.
  berth.enabled({ subsystemId: 'subsystem_drive', targetId: patient.id, repairedBy: 'p1' });
  assert.equal(wrecks.choirRelief.driveRestored, true);
  // Only the patient is recommissioned: the attendant's surviving return job still stands.
  assert.equal(jobs.length, 3);
  // …but gratitude is paid once per site — re-knitting the same mercy is not a rep pump.
  assert.equal(bus.events.filter((e) => e.type === 'faction:repDelta').length, 1);
});
