// L-FIGHTWORLD row 69 (NPC jobs): any repair yard answers a dead drive, and aftermath scavengers
// work wrecks in every sector. Player outcome: a shot-out drive outside Ceres no longer gets
// "No yard tender in range" when a repair station is within reach — a truck leaves the berth, welds
// the drive, bills the call-out once, flies home and is retired. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { NPC_JOB_KIND } from '../src/systems/npcJobs.js';
import { SECTORS } from '../src/data/sectors.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';

const DRIVE = 'subsystem_drive';
const SECTOR = 'sector_helios_prime';
const STATION = 'station_helios';

function scene({ stationAt = { x: 900, z: 0 }, sectorId = SECTOR, stationId = STATION } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed: 4242, bus, systems: [npcJobsRuntime] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  state.world.activeSector = {
    stations: stationAt ? [{ id: 900, stationId, pos: { ...stationAt } }] : [],
  };
  state.factions = {};
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 8, mass: 10, hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  const runtime = sim.registry.get('npcJobsRuntime');
  const toasts = [];
  const repairs = [];
  const charges = [];
  const retired = [];
  bus.on('toast', (p) => toasts.push(p));
  bus.on('combat:repairSubsystem', (p) => repairs.push(p));
  bus.on('economy:chargeCredits', (p) => charges.push(p));
  bus.on('npcjobs:oncallTenderRetired', (p) => retired.push(p));
  return { sim, state, bus, player, runtime, toasts, repairs, charges, retired };
}

const driveDown = (ctx) => ctx.bus.emit('combat:subsystemDisabled', { targetId: ctx.player.id, subsystemId: DRIVE });
const driveUp = (ctx) => ctx.bus.emit('combat:subsystemEnabled', { targetId: ctx.player.id, subsystemId: DRIVE });
const oncallHulls = (ctx) => ctx.state.entityList.filter((e) => e && e.alive !== false && e.data && e.data.onCallTender === true);
const setDriveDestroyed = (ctx) => {
  ctx.state.combat = { entities: { [String(ctx.player.id)]: { subsystems: { [DRIVE]: { destroyed: true } } } } };
};

test('a dead drive in a sector with a repair yard dispatches exactly one on-call tender that reaches the player and repairs', () => {
  const ctx = scene();
  driveDown(ctx);
  const hulls = oncallHulls(ctx);
  assert.equal(hulls.length, 1, 'one truck leaves the berth');
  const hull = hulls[0];
  const jobId = hull.data.jobId;
  const entry = ctx.state.npcJobs.byId[jobId];
  assert.equal(entry.kind, NPC_JOB_KIND.TENDER, 'it is an ordinary TENDER job');
  assert.equal(entry.transient, true);
  assert.equal(entry.control.holder, 'yardDispatch', 'the existing dispatch lease runs on it');
  assert.ok(ctx.toasts.some((t) => /en route/.test(t.text)), 'the dispatch is announced');
  const berth = Math.hypot(hull.pos.x - 900, hull.pos.z - 0);
  assert.ok(Math.abs(berth - 90) < 1, `it leaves from the station's departure point (${berth.toFixed(1)})`);
  assert.equal(hull.data.scanLabel, 'YARD TENDER \u2014 ON CALL');
  assert.equal(hull.flags && hull.flags.persistent, undefined, 'the hull is not marked durable');

  ctx.sim.step(SIM_DT);
  assert.ok(hull.data.intent && hull.data.intent.moveX < 0, 'the truck drives at the player');
  hull.pos.x = 100;
  hull.pos.z = 0;
  ctx.sim.step(SIM_DT);
  assert.equal(ctx.repairs.length, 1, 'one field-repair pulse on the drive');
  assert.equal(ctx.repairs[0].subsystemId, DRIVE);
  assert.equal(ctx.repairs[0].entityId, ctx.player.id);

  driveDown(ctx);
  assert.equal(oncallHulls(ctx).length, 1, 'a second drive-down never doubles the truck');
});

test('drive-up bills once, the tender flies home and is retired at the station', () => {
  const ctx = scene();
  driveDown(ctx);
  const hull = oncallHulls(ctx)[0];
  const jobId = hull.data.jobId;
  hull.pos.x = 100;
  hull.pos.z = 0;
  ctx.sim.step(SIM_DT);
  driveUp(ctx);
  assert.equal(ctx.charges.length, 1, 'the call-out is billed once');
  assert.equal(ctx.charges[0].amount, 150);
  assert.equal(ctx.runtime.controlClaim(jobId).holder, 'yardOncallReturn', 'the truck is under its homeward lease');
  ctx.sim.step(SIM_DT);
  assert.ok(hull.data.intent.moveX > 0, 'it turns for the berth');
  assert.equal(oncallHulls(ctx).length, 1, 'still flying home');
  hull.pos.x = 900 - 90 - 10;
  hull.pos.z = 0;
  ctx.sim.step(SIM_DT);
  assert.equal(oncallHulls(ctx).length, 0, 'retired at the station \u2014 no hull left loitering');
  assert.equal(ctx.state.npcJobs.byId[jobId], undefined, 'and the job entry is gone');
  assert.equal(ctx.runtime.activeControlClaimCount(), 0);
  assert.equal(ctx.retired.length, 1);
  assert.equal(ctx.retired[0].reason, 'home');
  assert.equal(ctx.charges.length, 1, 'retiring never bills again');
});

test('a drive that comes back by itself sends the truck home with no charge', () => {
  const ctx = scene();
  driveDown(ctx);
  const hull = oncallHulls(ctx)[0];
  driveUp(ctx);
  assert.equal(ctx.charges.length, 0);
  assert.ok(ctx.toasts.some((t) => /no charge/.test(t.text)));
  hull.pos.x = 900 - 90;
  hull.pos.z = 0;
  ctx.sim.step(SIM_DT);
  assert.equal(oncallHulls(ctx).length, 0, 'it still flies home and is retired');
});

test('a drive-down while the truck is flying home takes the same truck back', () => {
  const ctx = scene();
  driveDown(ctx);
  const first = oncallHulls(ctx)[0];
  driveUp(ctx);
  first.pos.x = 300;
  first.pos.z = 0;
  ctx.sim.step(SIM_DT);
  ctx.state.simTime += 200;
  driveDown(ctx);
  const hulls = oncallHulls(ctx);
  assert.equal(hulls.length, 1, 'one on-call truck at a time');
  assert.equal(hulls[0], first, 'the returning truck answers again');
  assert.equal(ctx.runtime.controlClaim(first.data.jobId).holder, 'yardDispatch');
});

test('WANTED hulls are refused and no truck is built', () => {
  const ctx = scene();
  ctx.state.player.heat = 1;
  driveDown(ctx);
  assert.ok(ctx.toasts.some((t) => /WANTED/.test(t.text)));
  assert.equal(oncallHulls(ctx).length, 0);
  assert.equal(ctx.runtime.activeControlClaimCount(), 0);
});

test('a sector with no repair station refuses honestly', () => {
  const none = scene({ stationAt: null });
  driveDown(none);
  assert.ok(none.toasts.some((t) => /on your own/.test(t.text)));
  assert.equal(oncallHulls(none).length, 0);

  const noRepair = scene({ stationId: 'station_beltout', sectorId: 'sector_ceres_belt' });
  driveDown(noRepair);
  assert.ok(noRepair.toasts.some((t) => /on your own/.test(t.text)), 'a yard without a repair service sends nobody');
  assert.equal(oncallHulls(noRepair).length, 0);

  const far = scene({ stationAt: { x: 6000, z: 0 } });
  driveDown(far);
  assert.ok(far.toasts.some((t) => /on your own/.test(t.text)), 'out of on-call range');
  assert.equal(oncallHulls(far).length, 0);
});

test('a repair bay in outage refuses with its own remaining time', () => {
  const ctx = scene();
  ctx.state.economy = { stationOutages: { [STATION]: { repairUntil: ctx.state.simTime + 600, cause: 'dock_slam', atT: 0 } } };
  driveDown(ctx);
  const toast = ctx.toasts.find((t) => /repair bay is down/.test(t.text));
  assert.ok(toast, 'the refusal names the bay');
  assert.match(toast.text, /~10 min/);
  assert.equal(oncallHulls(ctx).length, 0);
  assert.equal(ctx.runtime.activeControlClaimCount(), 0);
});

test('a yard that refuses the pilot standing sends no truck', () => {
  const sectorId = SECTORS.find((sector) => (sector.stations || []).some((st) => st.id === 'station_sker')).id;
  const gated = scene({ sectorId, stationId: 'station_sker' });
  gated.state.factions = { faction_reach: { rep: 0 } };
  driveDown(gated);
  assert.ok(gated.toasts.some((t) => /won't send a truck/.test(t.text)), 'a rep-gated berth turns the call away');
  assert.equal(oncallHulls(gated).length, 0);
  const welcome = scene({ sectorId, stationId: 'station_sker' });
  welcome.state.factions = { faction_reach: { rep: 40 } };
  driveDown(welcome);
  assert.equal(oncallHulls(welcome).length, 1, 'earned standing gets the truck');
});

test('save/load mid-dispatch never carries or duplicates the on-call tender', () => {
  const ctx = scene();
  driveDown(ctx);
  assert.equal(oncallHulls(ctx).length, 1);
  const saved = ctx.runtime.serialize();
  assert.deepEqual(Object.keys(saved.byId), [], 'the transient job is never saved');
  setDriveDestroyed(ctx);
  ctx.runtime.deserialize(saved);
  assert.equal(oncallHulls(ctx).length, 0, 'the restore drops the old truck');
  ctx.state.simTime += 200;
  ctx.bus.emit('save:loaded', {});
  assert.equal(oncallHulls(ctx).length, 1, 'the drive is still down, so exactly one truck is re-requested');
  assert.ok(ctx.runtime._yardDispatch, 'and the dispatch is live again');
});

test('leaving the sector cleans the truck up', () => {
  const ctx = scene();
  driveDown(ctx);
  const jobId = oncallHulls(ctx)[0].data.jobId;
  ctx.bus.emit('sector:exit', { sectorId: SECTOR });
  assert.equal(oncallHulls(ctx).length, 0);
  assert.equal(ctx.state.npcJobs.byId[jobId], undefined);
  assert.equal(ctx.runtime.activeControlClaimCount(), 0);
  assert.equal(ctx.runtime._yardDispatch, null);
  assert.equal(ctx.retired[0].reason, 'sector_exit');
});

test('a killed truck is released cleanly', () => {
  const ctx = scene();
  driveDown(ctx);
  const hull = oncallHulls(ctx)[0];
  const jobId = hull.data.jobId;
  hull.alive = false;
  ctx.sim.step(SIM_DT);
  assert.equal(ctx.state.npcJobs.byId[jobId], undefined);
  assert.equal(ctx.runtime._yardDispatch, null);
  assert.ok(ctx.toasts.some((t) => /lost the truck/.test(t.text)));
});

test('Ceres still uses its authored tender and builds no on-call truck', () => {
  const ctx = scene({ sectorId: 'sector_ceres_belt', stationId: 'station_ceres' });
  const e = ctx.sim.spawn({
    type: 'ship', team: 2, pos: { x: 1000, z: 0 }, radius: 8, mass: 10, hull: 100, hullMax: 100, collides: true,
    data: { worldRecordId: 'oncall-test-ceres-tender' },
  });
  const jobId = ctx.runtime.assign(e, {
    kind: NPC_JOB_KIND.TENDER,
    sectorId: 'sector_ceres_belt',
    route: [{ id: 'berth', pos: { x: 1500, z: 0 } }, { id: 'client', pos: { x: 1000, z: 0 } }],
  });
  assert.ok(jobId);
  driveDown(ctx);
  assert.equal(ctx.runtime.controlClaim(jobId).holder, 'yardDispatch', 'the working tender answers');
  assert.equal(oncallHulls(ctx).length, 0, 'no second truck is built');
});

// \u2500\u2500 scavengers outside Ceres \u2500\u2500

const SCAV_SECTOR = 'sector_scavenger_everywhere';

function scavengerSim() {
  const sim = createSimulation({
    seed: 4242,
    systems: [physics, combat, npcJobsRuntime],
    updateOrder: [npcJobsRuntime, physics, combat],
    runtimeConfig: { profileId: 'production', features: PRODUCTION_FEATURES },
  });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SCAV_SECTOR;
  sim.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  return sim;
}

test('a scavenger near a wreck outside Ceres is adopted as a salvor and works the wreck', async () => {
  const sim = scavengerSim();
  const physicsSystem = sim.registry.get('physics');
  try {
    assert.equal(await physicsSystem.prepareBackend(sim.state), true);
    const scavenger = sim.spawn({
      type: 'ship', team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, mass: 20,
      collides: true, hull: 100, hullMax: 100,
      data: { sectorId: SCAV_SECTOR, trafficRole: 'scavenger', ai: { passive: true, roe: 'hold_fire' }, intent: null },
    });
    const wreck = sim.spawn({
      type: 'wreck', pos: { x: -60, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6, mass: 90,
      collides: true, hull: 10, hullMax: 10,
      data: { sectorId: SCAV_SECTOR, salvagePool: { cmdty_scrap_metal: 4 } },
    });
    let jobId = null;
    for (let i = 0; i < 400 && !jobId; i++) {
      sim.step(SIM_DT);
      jobId = scavenger.data.jobId || null;
    }
    assert.ok(jobId, 'the scavenger is adopted outside Ceres');
    const entry = sim.state.npcJobs.byId[jobId];
    assert.equal(entry.kind, NPC_JOB_KIND.SALVOR);
    assert.equal(entry.sectorId, SCAV_SECTOR);
    assert.equal(entry.job.payload.role, 'scavenger');
    assert.equal(entry.job.payload.targetId, wreck.id);
    assert.ok(scavenger.data.worldRecordId, 'it carries a stable world record id');

    let attachmentId = null;
    for (let i = 0; i < 400 && !attachmentId; i++) {
      sim.step(SIM_DT);
      attachmentId = entry.towAttachmentId;
    }
    assert.ok(attachmentId, 'the salvor tractors the wreck');
    const attachment = sim.state.combat.attachments.byId[attachmentId];
    assert.equal(attachment.targetId, wreck.id);
    assert.equal(attachment.tetherPolicy.headId, 'tractor');
  } finally {
    if (physicsSystem && typeof physicsSystem._disableSg02DynamicAuthority === 'function') {
      physicsSystem._disableSg02DynamicAuthority();
    }
    sim.dispose();
  }
});

test('scavenger adoption keeps its per-sector limit and keys record ids by the real sector', () => {
  const adopt = (sectorId) => {
    const sim = createSimulation({ seed: 4242, systems: [npcJobsRuntime] });
    sim.state.mode = 'flight';
    sim.state.world.currentSectorId = sectorId;
    const mk = (x) => sim.spawn({
      type: 'ship', team: 2, pos: { x, z: 0 }, radius: 8, mass: 20, hull: 100, hullMax: 100, collides: true,
      data: { sectorId, trafficRole: 'scavenger', ai: { passive: true } },
    });
    const a = mk(0);
    const b = mk(40);
    sim.spawn({
      type: 'wreck', pos: { x: -60, z: 0 }, radius: 6, mass: 90, hull: 10, hullMax: 10, collides: true,
      data: { sectorId, salvagePool: { cmdty_scrap_metal: 4 } },
    });
    const runtime = sim.registry.get('npcJobsRuntime');
    const adopted = runtime._adoptScavengerTractors();
    sim.dispose();
    return { adopted, ids: [a.data.worldRecordId, b.data.worldRecordId] };
  };
  const one = adopt('sector_scav_a');
  const two = adopt('sector_scav_b');
  assert.equal(one.adopted, 1, 'the same one-per-sector limit as Ceres');
  assert.equal(two.adopted, 1);
  assert.ok(one.ids[0] && two.ids[0], 'adopted scavengers get stable record ids');
  assert.notEqual(one.ids[0], two.ids[0], 'the id is keyed by the actual sector');
  const again = adopt('sector_scav_a');
  assert.deepEqual(again.ids, one.ids, 'deterministic for the same sector and seed');
});

// ── audit follow-up ──

test('a second breakdown inside the cooldown still gets the returning truck', () => {
  const ctx = scene();
  driveDown(ctx);
  const first = oncallHulls(ctx)[0];
  driveUp(ctx);
  first.pos.x = 300;
  first.pos.z = 0;
  ctx.sim.step(SIM_DT);
  driveDown(ctx);
  assert.equal(oncallHulls(ctx).length, 1, 'no second hull');
  assert.equal(ctx.runtime.controlClaim(first.data.jobId).holder, 'yardDispatch', 'the same truck turns around');
});

test('a breakdown that lands inside the cooldown is queued, not swallowed, and a truck leaves when it lifts', () => {
  const ctx = scene();
  ctx.state.simTime = 10;
  driveDown(ctx);
  driveUp(ctx);
  ctx.sim.step(SIM_DT);
  assert.equal(oncallHulls(ctx).length, 0, 'the first truck is home and retired');
  setDriveDestroyed(ctx);
  ctx.toasts.length = 0;
  driveDown(ctx);
  assert.equal(oncallHulls(ctx).length, 0, 'the cooldown holds the fresh spawn');
  assert.ok(ctx.toasts.some((t) => /queued/.test(t.text)), 'and the pilot is told the call is queued');
  ctx.state.simTime += 130;
  ctx.sim.step(SIM_DT);
  ctx.state.simTime += 3;
  ctx.sim.step(SIM_DT);
  assert.equal(oncallHulls(ctx).length, 1, 'the pending call is retried and a truck leaves');
});

test('clearing WANTED with the drive still down dispatches the truck without a new breakdown event', () => {
  const ctx = scene();
  ctx.state.player.heat = 1;
  setDriveDestroyed(ctx);
  driveDown(ctx);
  assert.equal(oncallHulls(ctx).length, 0);
  ctx.state.player.heat = 0;
  ctx.state.simTime += 3;
  ctx.sim.step(SIM_DT);
  assert.equal(oncallHulls(ctx).length, 1, 'the standing request is answered once the pilot is clean');
});

test('a drive that comes back cancels the standing request', () => {
  const ctx = scene();
  ctx.state.player.heat = 1;
  setDriveDestroyed(ctx);
  driveDown(ctx);
  driveUp(ctx);
  ctx.state.player.heat = 0;
  ctx.state.simTime += 3;
  ctx.sim.step(SIM_DT);
  assert.equal(oncallHulls(ctx).length, 0);
});

test('a restore resets the dispatch and refusal cooldown clocks', () => {
  const ctx = scene();
  ctx.runtime._yardLastDispatchT = 500;
  ctx.runtime._yardLastRefuseT = 500;
  ctx.runtime.deserialize(ctx.runtime.serialize());
  assert.equal(ctx.runtime._yardLastDispatchT, -Infinity);
  assert.equal(ctx.runtime._yardLastRefuseT, -Infinity);
});

test('the refusal names the nearest refused yard, not the first in the list', () => {
  const ctx = scene();
  ctx.state.world.activeSector.stations = [
    { id: 901, stationId: 'station_coalition', pos: { x: 2400, z: 0 } },
    { id: 900, stationId: STATION, pos: { x: 900, z: 0 } },
  ];
  const until = ctx.state.simTime + 600;
  ctx.state.economy = { stationOutages: {
    [STATION]: { repairUntil: until }, station_coalition: { repairUntil: until + 300 },
  } };
  driveDown(ctx);
  const toast = ctx.toasts.find((t) => /repair bay is down/.test(t.text));
  assert.match(toast.text, /Helios Station/);
  assert.match(toast.text, /~10 min/);
});

test('crew response cannot poach the on-call truck', () => {
  const ctx = scene();
  driveDown(ctx);
  const hull = oncallHulls(ctx)[0];
  const jobId = hull.data.jobId;
  ctx.runtime.releaseControl(jobId, ctx.runtime.controlClaim(jobId).claimId);
  const casualty = ctx.sim.spawn({ type: 'ship', team: 2, pos: { x: hull.pos.x + 50, z: 0 }, radius: 8, mass: 10, hull: 100, hullMax: 100 });
  assert.equal(ctx.runtime._nearestCrewTender(casualty), null, 'a transient truck is never a crew-response tender');
});

test('retiring the truck cuts any line still attached to it first', () => {
  const ctx = scene();
  driveDown(ctx);
  const cut = [];
  ctx.runtime._combatAttachments = () => ({
    listForEntity: () => [{ id: 7, state: 'active' }],
    breakAttachment: (attachment, reason) => cut.push([attachment.id, reason]),
  });
  ctx.bus.emit('sector:exit', { sectorId: SECTOR });
  assert.deepEqual(cut, [[7, 'oncall_tender_retired']]);
});

function adoptionRig(sectorId, extraWreckData = {}) {
  const sim = createSimulation({ seed: 4242, systems: [npcJobsRuntime] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = sectorId;
  const scav = sim.spawn({
    type: 'ship', team: 2, pos: { x: 0, z: 0 }, radius: 8, mass: 20, hull: 100, hullMax: 100, collides: true,
    data: { sectorId, trafficRole: 'scavenger', ai: { passive: true } },
  });
  const wreck = sim.spawn({
    type: 'wreck', pos: { x: -60, z: 0 }, radius: 6, mass: 90, hull: 10, hullMax: 10, collides: true,
    data: { sectorId, salvagePool: { cmdty_scrap_metal: 4 }, ...extraWreckData },
  });
  return { sim, scav, wreck, runtime: sim.registry.get('npcJobsRuntime'), sectorId };
}

test('an adopt-time latch is cleared when the salvor job ends before its first line', () => {
  const rig = adoptionRig('sector_latch_a');
  assert.equal(rig.runtime._adoptScavengerTractors(), 1);
  assert.equal(rig.wreck.data.npcMasslineLatch, true, 'the wreck is latched at adoption');
  rig.runtime.release(rig.scav.data.jobId);
  assert.equal(rig.wreck.data.npcMasslineLatch, undefined);
  assert.equal(rig.wreck.flags && rig.wreck.flags.tethered, undefined, 'and no tethered persistence anchor is left');
  rig.sim.dispose();
});

test('an adopt-time latch is cleared when the sector is left before the first line', () => {
  const rig = adoptionRig('sector_latch_b');
  assert.equal(rig.runtime._adoptScavengerTractors(), 1);
  rig.sim.bus.emit('sector:exit', { sectorId: rig.sectorId });
  assert.equal(rig.wreck.data.npcMasslineLatch, undefined);
  assert.equal(rig.wreck.flags && rig.wreck.flags.tethered, undefined);
  rig.sim.dispose();
});

test('an adopted salvor never takes a mission, contract or custody body', () => {
  const owned = [
    { missionId: 'm_1' }, { contractId: 'c_1' }, { contractClaimSiteOf: 'm_2' }, { missionTargetSlot: 'slot' },
    { lotId: 'lot_1' }, { custody: { by: 'player' } }, { freightCustody: true }, { reservedBy: 'p' },
  ];
  for (const extra of owned) {
    const rig = adoptionRig('sector_owned_cargo', extra);
    assert.equal(rig.runtime._adoptScavengerTractors(), 0, `refuses ${Object.keys(extra)[0]}`);
    assert.equal(rig.scav.data.jobId, undefined);
    rig.sim.dispose();
  }
  const free = adoptionRig('sector_owned_cargo');
  assert.equal(free.runtime._adoptScavengerTractors(), 1, 'an ordinary wreck is still worked');
  free.sim.dispose();
});
