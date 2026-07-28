// PQ-019C Phase E — the five named routes driven through normal input, plus the three boundaries a
// single-run test cannot see.
//
// Every route below goes through the shipped intents and the shipped events: `ui:acceptMission`,
// `ui:abandonMission`, a real `physics:impact` at a facility head, a real `tether:latched`. Nothing
// reaches into the arbiter to force a phase — where a previous suite had to hand-set state to reach
// a save boundary, this one flies it.
//
// The three boundaries:
//   * a SECOND accepted run must reach a real launch (the facility owner holds one schedule);
//   * `escaped` must be reachable by breaking contact, not by assignment;
//   * accepting and never launching must still reach a bounded terminal.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { heistFacilities } from '../src/systems/heistFacilities.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { heat } from '../src/systems/heat.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { NPC_JOB_KIND } from '../src/systems/npcJobs.js';
import { missions } from '../src/systems/missions.js';
import { PQ019_HEIST_SECTOR_ID } from '../src/data/heistFacilities.js';
import {
  PQ019C_HEIST_TYPE,
  PQ019C_HEIST_STATION_ID,
  PQ019C_HEIST_TUNING,
  buildHeistOffer,
} from '../src/data/heistMission.js';

const SYSTEMS = [physics, world, heistFacilities, lawSecurity, heat, npcJobsRuntime, missions];

function roleEntities(state, role) {
  return state.entityList.filter((e) => e?.alive !== false && e.data?.heistFacilityRole === role);
}

function boot({ seed = 19019, withPatrol = true } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed, bus, systems: SYSTEMS });
  const { state } = sim;
  state.mode = 'flight';
  state.player.heat = 0;
  state.player.credits = 20000;
  if (!state.ui) state.ui = {};
  if (!state.nav) state.nav = { waypoint: null };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);

  const grants = [];
  const settlements = [];
  const cues = [];
  bus.on('economy:grantCredits', (p) => grants.push(p));
  bus.on('mission:completed', (p) => settlements.push({ kind: 'completed', ...p }));
  bus.on('mission:failed', (p) => settlements.push({ kind: 'failed', ...p }));
  bus.on('mission:expired', (p) => settlements.push({ kind: 'expired', ...p }));
  bus.on('heist:missionCue', (p) => cues.push(p));

  const step = (n = 1) => { for (let i = 0; i < n; i++) sim.step(SIM_DT); };

  const anchor = (() => {
    const head = roleEntities(state, 'heist_launcher_head')[0];
    return head ? { x: head.pos.x, z: head.pos.z } : { x: 0, z: 0 };
  })();
  sim.spawn({
    type: 'station', team: 2, factionId: 'faction_scn',
    pos: { x: anchor.x + 120, z: anchor.z }, radius: 42,
    data: { stationId: 'station_tethys_customs', dockRadius: 72, factionId: 'faction_scn' },
  });
  const jobs = sim.registry.get('npcJobsRuntime');
  const patrols = [];
  if (withPatrol) {
    const hull = sim.spawn({
      type: 'ship', team: 2, factionId: 'faction_scn',
      pos: { x: anchor.x + 200, z: anchor.z + 60 }, radius: 9, hull: 100, hullMax: 100,
      data: { worldRecordId: 'wr_tethys_patrol', ai: { lawful: true, archetype: 'patrol_lawman' } },
    });
    jobs.assign(hull, {
      kind: NPC_JOB_KIND.PATROL,
      route: [
        { id: 'b0', pos: { x: anchor.x + 200, z: anchor.z } },
        { id: 'b1', pos: { x: anchor.x, z: anchor.z + 200 } },
      ],
      sectorId: PQ019_HEIST_SECTOR_ID,
      speed: 100, commissionS: 1, departS: 1, approachS: 1,
      workS: 2, loadS: 1, unloadS: 1, dwellS: 1,
    });
    patrols.push(hull);
  }

  const t = {
    sim, state, bus, grants, settlements, cues, step, jobs, patrols, anchor,
    missionsSys: sim.registry.get('missions'),
    facilities: sim.registry.get('heistFacilities'),
    mission: () => (state.missions.active || []).find((m) => m && m.heist) || null,
    capsule: () => {
      const id = state.heistFacilities?.capsuleEntityId;
      return id == null ? null : state.entities.get(id);
    },
    /** Post the shipped row (optionally with a shorter window) and accept it through the UI intent. */
    accept: ({ launchWindowS = 1, attempt = 0, sourceMissionId = null } = {}) => {
      const board = t.missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID);
      const existing = board.slots.find((o) => o && o.type === PQ019C_HEIST_TYPE);
      const offer = existing || buildHeistOffer({ epoch: 0, attempt, sourceMissionId });
      offer.params.launchWindowS = launchWindowS;
      if (!existing) board.slots.unshift(offer);
      bus.emit('ui:acceptMission', { missionId: offer.id });
      return t.mission();
    },
    stepToLaunch: (max = 400) => {
      for (let i = 0; i < max; i++) { step(1); if (t.capsule()) return true; }
      return false;
    },
    latch: () => {
      const capsule = t.capsule();
      assert.ok(capsule, 'latch needs a live capsule');
      bus.emit('tether:latched', { targetId: capsule.id, type: 'tether_massline' });
    },
    contact: (facilityId, tickOffset = 1) => {
      const head = roleEntities(state, `${facilityId}_head`)[0];
      const capsule = t.capsule();
      assert.ok(head && capsule);
      bus.emit('physics:impact', {
        tick: (state.tick | 0) + tickOffset, aId: capsule.id, bId: head.id, dp: 50,
        pos: { x: head.pos.x, z: head.pos.z },
      });
    },
    payouts: () => grants.filter((g) => String(g?.reason || '').startsWith('mission:')),
    cueMoments: () => cues.map((c) => c.moment),
  };
  return t;
}

// ── The five named routes, through normal input ────────────────────────────────────────────────

test('route: lawful observe — the player watches, the capsule arrives, nothing is owed', () => {
  const t = boot();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  t.contact('lawful_catcher');
  t.step(4);
  assert.equal(m.heist.arbiter.receipt.outcome, 'lawful_arrival_observed');
  assert.equal(t.payouts().length, 0);
  assert.ok(t.cueMoments().includes('lawful_arrival'));
});

test('route: successful heist and fence — one payout, one consumed capsule', () => {
  const t = boot();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  t.latch();
  t.step(2);
  t.contact('fence_receiver');
  t.step(4);
  assert.equal(m.heist.arbiter.receipt.outcome, 'fenced_success');
  assert.equal(t.payouts().length, 1);
  assert.equal(t.capsule(), null);
  assert.ok(t.cueMoments().includes('fenced'));
});

test('route: confiscation — a stolen capsule recovered by the law', () => {
  const t = boot();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  t.latch();
  t.step(2);
  t.contact('lawful_catcher');
  t.step(4);
  assert.equal(m.heist.arbiter.receipt.outcome, 'lawful_confiscation');
  assert.equal(t.payouts().length, 0);
  assert.ok(t.cueMoments().includes('confiscated'));
});

test('route: destruction — the capsule stops existing while the player is watching', () => {
  const t = boot();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  t.latch();
  t.step(2);
  const capsule = t.capsule();
  capsule.hull = 0;
  capsule.alive = false;
  t.step(4);
  assert.equal(m.heist.arbiter.receipt.outcome, 'payload_destroyed');
  assert.equal(t.payouts().length, 0);
  assert.ok(t.cueMoments().includes('destroyed'));
});

// ── Boundary 1: a second run ───────────────────────────────────────────────────────────────────

test('a second accepted run reaches a real launch in the same session', () => {
  const t = boot();
  const first = t.accept();
  assert.ok(t.stepToLaunch());
  t.contact('lawful_catcher');
  t.step(6);
  assert.equal(t.mission(), null, 'the first run settled');
  assert.equal(first.heist.arbiter.receipt.outcome, 'lawful_arrival_observed');

  // The standing contract comes back on the board, and taking it must produce a real capsule —
  // not an instant `unresolved_absent` because the facility owner is still holding the first
  // schedule and denies every key that is not it.
  const board = t.missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID);
  assert.equal(board.slots.filter((o) => o && o.type === PQ019C_HEIST_TYPE).length, 1,
    'the standing contract is boardable again');
  const second = t.accept();
  assert.ok(second, 'a second run is acceptable');
  assert.notEqual(second.id, first.id);
  assert.equal(second.heist.scheduleDenied, undefined, 'the launcher must not refuse the new run');
  assert.ok(t.stepToLaunch(), 'the second run produces a real capsule');
  assert.equal(roleEntities(t.state, 'cargo_capsule').length, 1, 'exactly one capsule at a time');

  // And it can be settled through the physical world just like the first.
  t.latch();
  t.step(2);
  t.contact('fence_receiver');
  t.step(4);
  assert.equal(second.heist.arbiter.receipt.outcome, 'fenced_success');
  assert.equal(t.payouts().length, 1, 'the second run pays exactly once');
});

// ── Boundary 2: escape must be flyable ─────────────────────────────────────────────────────────

test('breaking contact reaches phase escaped without any state being hand-set', () => {
  const t = boot();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  t.latch();
  assert.equal(m.heist.responderAvailability, 'available');
  assert.ok(m.heist.leases.length >= 1, 'a pursuit is genuinely under way');
  assert.equal(m.heist.escaped, false);

  // The player outruns the patrol: move the leased hull beyond the authored leash, the way distance
  // would. Nothing about the arbiter or the record is touched.
  for (const hull of t.patrols) {
    hull.pos.x = t.anchor.x + PQ019C_HEIST_TUNING.responderLeashWu * 2;
    hull.pos.z = t.anchor.z + PQ019C_HEIST_TUNING.responderLeashWu * 2;
  }
  t.step(PQ019C_HEIST_TUNING.escapeHoldTicks + 20);

  assert.equal(m.heist.escaped, true, 'escape latches from distance, not from assignment');
  assert.equal(m.heist.arbiter.phase, 'escaped');
  assert.equal(m.heist.leases.length, 0, 'the leash released the borrowed hull');
  assert.equal(t.jobs.activeControlClaimCount(), 0, 'the patrol went back to its own work');
  assert.ok(t.cueMoments().includes('escaped'), 'the player is told contact is broken');
  // Escaping locally does NOT clear heat: the crime is merely unobserved right now.
  assert.ok(t.state.player.heat > 0, 'heat survives a local escape');
  assert.equal(Object.keys(t.state.player.heatIncidentsApplied || {}).length, 1);
});

// ── Boundary 3: accept and never launch ────────────────────────────────────────────────────────

test('accepting and never launching still reaches a bounded terminal', () => {
  const t = boot();
  // The facility owner's update returns early outside Tethys and preserves an unlaunched schedule,
  // so a player who accepts and leaves has no capsule, no deadline and nothing to arbitrate.
  const m = t.accept({ launchWindowS: 6 });
  t.step(2);
  // Leave through the ordinary world route, not by hand-setting the current sector.
  t.sim.registry.get('world').enterSector('sector_helios_prime');
  t.step(2);
  assert.equal(m.heist.launchTick, null, 'nothing was ever launched');
  assert.notEqual(t.state.world.currentSectorId, PQ019_HEIST_SECTOR_ID);

  t.step(PQ019C_HEIST_TUNING.unlaunchedWindowTicks + 30);
  assert.equal(m.heist.launchTick, null, 'still nothing launched: the schedule is preserved');
  assert.equal(t.mission(), null, 'the run must not stay active forever');
  assert.equal(t.settlements.length, 1);
  assert.equal(t.settlements[0].kind, 'failed');
  assert.equal(m.heist.arbiter.receipt.outcome, 'unresolved_absent');
  assert.equal(t.payouts().length, 0);
});

// ── Recovery ───────────────────────────────────────────────────────────────────────────────────

test('recovery posts at most one reduced-stake retry, and only when policy allows', () => {
  const t = boot();
  const m = t.accept();
  assert.ok(t.stepToLaunch());
  t.latch();
  t.step(2);
  const capsule = t.capsule();
  capsule.hull = 0;
  capsule.alive = false;
  t.step(6);
  assert.equal(m.heist.arbiter.receipt.outcome, 'payload_destroyed');

  const board = t.missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID);
  const rows = board.slots.filter((o) => o && o.type === PQ019C_HEIST_TYPE);
  assert.equal(rows.length, 1, 'exactly one heist row, never a recovery stacked on the standing one');
  // Default authored policy is OFF, so the row is the standing contract at full stake.
  assert.equal(PQ019C_HEIST_TUNING.recoveryEnabled, false);
  assert.equal(rows[0].heistAttempt, 0);
  assert.equal(rows[0].reward_cr, PQ019C_HEIST_TUNING.payoutCr);
});

test('with recovery enabled a destroyed run posts one half-stake retry that is itself playable', () => {
  const t = boot();
  // The authored flag ships OFF; the policy travels on the contract, so a test enables it the same
  // way an author would — on the offer — rather than by mutating frozen shared tuning.
  const board = t.missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID);
  board.slots = board.slots.filter((o) => o && o.type !== PQ019C_HEIST_TYPE);
  const offer = buildHeistOffer({ epoch: 0 });
  offer.params.launchWindowS = 1;
  offer.params.recoveryEnabled = true;
  board.slots.unshift(offer);
  t.bus.emit('ui:acceptMission', { missionId: offer.id });
  const m = t.mission();
  assert.equal(m.heist.recoveryAllowed, true);

  assert.ok(t.stepToLaunch());
  t.latch();
  t.step(2);
  const capsule = t.capsule();
  capsule.hull = 0;
  capsule.alive = false;
  t.step(6);
  assert.equal(m.heist.arbiter.receipt.outcome, 'payload_destroyed');

  const rows = t.missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID).slots
    .filter((o) => o && o.type === PQ019C_HEIST_TYPE);
  assert.equal(rows.length, 1, 'at most one heist row on the board');
  assert.equal(rows[0].heistAttempt, 1, 'the row is the reduced-stake retry');
  assert.equal(rows[0].reward_cr, PQ019C_HEIST_TUNING.recoveryPayoutCr);
  assert.ok(rows[0].reward_cr < PQ019C_HEIST_TUNING.payoutCr, 'reduced stake');
  assert.ok(t.cueMoments().includes('recovery'), 'the player is told where the retry is');

  // The retry is a real run, not a decorative row: it launches, and it settles.
  rows[0].params.launchWindowS = 1;
  t.bus.emit('ui:acceptMission', { missionId: rows[0].id });
  const retry = t.mission();
  assert.ok(retry, 'the recovery row is acceptable');
  assert.equal(retry.heist.attempt, 1);
  assert.equal(retry.heist.recoveryAllowed, false, 'no recovery follows a recovery');
  assert.ok(t.stepToLaunch(), 'the retry produces a real capsule');
  t.latch();
  t.step(2);
  t.contact('fence_receiver');
  t.step(4);
  assert.equal(retry.heist.arbiter.receipt.outcome, 'fenced_success');
  assert.equal(t.payouts().length, 1);
  assert.equal(t.payouts()[0].amount, PQ019C_HEIST_TUNING.recoveryPayoutCr);

  // And there is no THIRD offer: recovery follows attempt 0 only.
  const after = t.missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID).slots
    .filter((o) => o && o.type === PQ019C_HEIST_TYPE);
  assert.ok(after.every((o) => o.heistAttempt === 0), 'no recovery follows a recovery');
});

test('a fenced success never posts a recovery, even with policy enabled', () => {
  const t = boot();
  const board = t.missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID);
  board.slots = board.slots.filter((o) => o && o.type !== PQ019C_HEIST_TYPE);
  const offer = buildHeistOffer({ epoch: 0 });
  offer.params.launchWindowS = 1;
  offer.params.recoveryEnabled = true;
  board.slots.unshift(offer);
  t.bus.emit('ui:acceptMission', { missionId: offer.id });
  const m = t.mission();
  assert.ok(t.stepToLaunch());
  t.latch();
  t.step(2);
  t.contact('fence_receiver');
  t.step(4);
  assert.equal(m.heist.arbiter.receipt.outcome, 'fenced_success');
  const rows = t.missionsSys.ensureBoard(PQ019C_HEIST_STATION_ID).slots
    .filter((o) => o && o.type === PQ019C_HEIST_TYPE);
  assert.ok(rows.every((o) => o.heistAttempt === 0), 'a completed run is never "recovered"');
});
