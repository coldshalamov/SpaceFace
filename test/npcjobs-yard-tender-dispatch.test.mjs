// The yard sends a truck (INF-U8, WF-04): a drive-disabled player in served space
// gets the nearest working tender on a control lease — divert, weld, bill the tab.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { NPC_JOB_KIND } from '../src/systems/npcJobs.js';

const DRIVE = 'subsystem_drive';

function scene() {
  const bus = createBus();
  const sim = createSimulation({ seed: 4242, bus, systems: [npcJobsRuntime] });
  const { state } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 8, mass: 10,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  state.world.currentSectorId = 'sector_helios_prime';
  const runtime = sim.registry.get('npcJobsRuntime');
  const toasts = [];
  const repairs = [];
  const charges = [];
  bus.on('toast', (p) => toasts.push(p));
  bus.on('combat:repairSubsystem', (p) => repairs.push(p));
  bus.on('economy:chargeCredits', (p) => charges.push(p));
  return { sim, state, bus, player, runtime, toasts, repairs, charges };
}

function tender(ctx, recordId, x, z) {
  const e = ctx.sim.spawn({
    type: 'ship', team: 2, pos: { x, z }, radius: 8, mass: 10,
    hull: 100, hullMax: 100, collides: true, data: { worldRecordId: recordId },
  });
  const jobId = ctx.runtime.assign(e, {
    kind: NPC_JOB_KIND.TENDER,
    sectorId: 'sector_helios_prime',
    route: [
      { id: 'berth', pos: { x: x + 500, z }, label: 'Berth' },
      { id: 'client', pos: { x, z }, label: 'Client' },
    ],
  });
  assert.ok(jobId, 'tender takes the job');
  return { e, jobId };
}

function driveDown(ctx) {
  ctx.bus.emit('combat:subsystemDisabled', { targetId: ctx.player.id, subsystemId: DRIVE });
}

function driveUp(ctx) {
  ctx.bus.emit('combat:subsystemEnabled', { targetId: ctx.player.id, subsystemId: DRIVE });
}

test('a breakdown dispatches the nearest tender on a lease', () => {
  const ctx = scene();
  const { e, jobId } = tender(ctx, 'u8-tender-1', 1000, 0);
  tender(ctx, 'u8-tender-2', 2000, 0);
  driveDown(ctx);
  const entry = ctx.state.npcJobs.byId[jobId];
  assert.ok(entry.control, 'the nearest tender is leased');
  assert.equal(entry.control.holder, 'yardDispatch');
  assert.ok(ctx.toasts.some((t) => /en route/.test(t.text)), 'the dispatch is announced');
  ctx.sim.step(SIM_DT);
  const intent = e.data.intent;
  assert.ok(intent && intent.moveX < 0, 'the tender drives at the player');
  assert.equal(ctx.runtime.controlClaim('job:u8-tender-2'), null, 'the far tender keeps working');
});

test('alongside, the tender welds the drive and bills the tab', () => {
  const ctx = scene();
  const { jobId } = tender(ctx, 'u8-tender-3', 100, 0);
  driveDown(ctx);
  ctx.sim.step(SIM_DT);
  assert.equal(ctx.repairs.length, 1, 'one field-repair pulse');
  assert.deepEqual(
    { entityId: ctx.repairs[0].entityId, subsystemId: ctx.repairs[0].subsystemId },
    { entityId: ctx.player.id, subsystemId: DRIVE },
  );
  assert.ok(ctx.toasts.some((t) => /welding/.test(t.text)));
  driveUp(ctx);
  assert.equal(ctx.charges.length, 1, 'the call-out is billed');
  assert.equal(ctx.charges[0].amount, 150);
  assert.ok(ctx.toasts.some((t) => /on the tab/.test(t.text)));
  assert.equal(ctx.state.npcJobs.byId[jobId].control, null, 'the lease is released');
});

test('a hull fixed before the truck arrives is released with no charge', () => {
  const ctx = scene();
  const { jobId } = tender(ctx, 'u8-tender-4', 2000, 0);
  driveDown(ctx);
  driveUp(ctx);
  assert.equal(ctx.charges.length, 0, 'no bill without work');
  assert.ok(ctx.toasts.some((t) => /no charge/.test(t.text)));
  assert.equal(ctx.state.npcJobs.byId[jobId].control, null);
});

test('a hot breakdown holds the truck clear until the sky clears', () => {
  const ctx = scene();
  const { e } = tender(ctx, 'u8-tender-5', 500, 0);
  const pirate = ctx.sim.spawn({
    type: 'ship', team: 1, pos: { x: 100, z: 0 }, radius: 8, mass: 10,
    hull: 100, hullMax: 100, collides: true, data: { ai: {} },
  });
  driveDown(ctx);
  ctx.sim.step(SIM_DT);
  assert.equal(e.data.intent.brake, true, 'the tender holds');
  assert.equal(ctx.repairs.length, 0, 'no welding under fire');
  assert.ok(ctx.toasts.some((t) => /too hot/i.test(t.text)));
  pirate.alive = false;
  e.pos.x = 100;
  e.pos.z = 0;
  ctx.sim.step(SIM_DT);
  assert.equal(ctx.repairs.length, 1, 'clear sky resumes the job');
});

test('Continue with the drive still down re-requests the truck', () => {
  const ctx = scene();
  tender(ctx, 'u8-tender-7', 500, 0);
  ctx.state.combat = { entities: { [String(ctx.player.id)]: { subsystems: { [DRIVE]: { destroyed: true } } } } };
  ctx.bus.emit('save:loaded', {});
  assert.ok(ctx.runtime._yardDispatch, 'the breakdown re-dispatches after load');
  const healthy = scene();
  tender(healthy, 'u8-tender-8', 500, 0);
  healthy.state.combat = { entities: {} };
  healthy.bus.emit('save:loaded', {});
  assert.equal(healthy.runtime._yardDispatch, null, 'a healthy drive calls no truck');
});

test('WANTED hulls and empty sectors get an honest refusal', () => {
  const ctx = scene();
  tender(ctx, 'u8-tender-6', 500, 0);
  ctx.state.player.heat = 1;
  driveDown(ctx);
  assert.ok(ctx.toasts.some((t) => /WANTED/.test(t.text)), 'WANTED is refused');
  assert.equal(ctx.runtime.activeControlClaimCount(), 0, 'no lease for outlaws');
  const lonely = scene();
  lonely.state.player.heat = 0;
  driveDown(lonely);
  assert.ok(lonely.toasts.some((t) => /on your own/.test(t.text)), 'no tender, no promise');
});
