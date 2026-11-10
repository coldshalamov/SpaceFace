import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { getNodeSystemFactoryTable } from '../src/runtime/nodeSystemFactoryTable.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { createBus } from '../src/core/eventBus.js';
import { createStrangerPilot, createServices } from '../scripts/lib/bench/playthroughPilots.mjs';
import { checkFirstHourBudget, overall } from '../scripts/player-truth/checks.mjs';

test('a scripted pilot cannot pass an expired latch deadline without attaching', () => {
  const trace = { meta: { mode: 'adventure', tutorialPilot: true },
    events: [{ ev: 'input', kind: 'keydown', sim: 0 }], samples: [{ sim: 250 }] };
  const verdict = checkFirstHourBudget(trace);
  assert.equal(verdict.status, 'FAIL');
  assert.equal(overall([verdict]), 'FAIL');
  assert.deepEqual(verdict.value, { latchS: null, raidS: null });
});

test('missing latch is pending through its deadline and expires on observed simulation time', () => {
  const trace = { meta: { mode: 'adventure', tutorialPilot: true },
    events: [{ ev: 'input', kind: 'keydown', sim: 10 }], samples: [{ sim: 70 }] };
  assert.equal(checkFirstHourBudget(trace).status, 'N/A');
  trace.samples.push({ sim: 70 + 1 / 60 });
  assert.equal(checkFirstHourBudget(trace).status, 'FAIL');
  trace.meta.tutorialPilot = false;
  assert.equal(checkFirstHourBudget(trace).status, 'N/A', 'ordinary Adventure need not follow the tutorial');
  trace.meta.tutorialPilot = true;
  trace.samples = [];
  trace.events.push({ ev: 'milestone', milestone: 'momentumKill', sim: 200 });
  assert.equal(checkFirstHourBudget(trace).status, 'FAIL', 'events also establish elapsed sim time');
  trace.events.shift();
  assert.equal(checkFirstHourBudget(trace).status, 'N/A', 'no clock before actual flight input');
});

test('stranger uses the live player line after an unrelated release or a refused cut', () => {
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0 };
  const raider = { id: 2, alive: true, pos: { x: 50, z: 0 }, vel: { x: 0, z: 0 } };
  const rock = { id: 3, alive: true, type: 'asteroid', radius: 80, pos: { x: 400, z: 0 } };
  const state = { meta: { seed: 4242 }, tick: 120, simTime: 2, playerId: 1,
    entities: new Map([[1, player], [2, raider], [3, rock]]), entityList: [player, raider, rock],
    player: { tether: { active: true, targetId: 2 } }, input: { actions: {}, aimWorld: {} },
    onboarding: { raid: { active: true, ids: { raider: 2 } }, beatDoneAt: {} } };
  const bus = createBus();
  const pilot = createStrangerPilot({ state, bus, ledger: { recordDecision() {} }, services: {} });
  bus.emit('tether:released', { targetId: 99 });
  pilot.step(1 / 60, state.tick);
  assert.equal(state.input.actions.massline.lineControl, true, 'keep towing the actual player line');
  assert.equal(state.input.actions.massline.latch, false, 'do not attempt to relatch an active line');
  state.player.tether.active = false;
  bus.emit('tether:attached', { actorId: 99, targetId: 2 });
  pilot.step(1 / 60, state.tick);
  assert.equal(state.input.actions.massline.lineControl, false, 'an NPC attachment is not the player line');
  assert.equal(state.input.actions.massline.latch, true);
});

// Same production boot and normalized input seam as onboarding-stranger-replay-stability.
// After launch, only the public pilot writes inputs; the observer never writes bodies or receipts.
test('seed 4242 production stranger earns latch and raid milestones within budget through inputs', async (t) => {
  const lookup = getNodeSystemFactoryTable();
  lookup.set('input', { name: 'input', init() {}, update() {}, destroy() {} });
  const runtime = await createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true,
    seed: 4242, systemLookup: lookup, exclusions: ['input:no-op-headless'] });
  t.after(() => runtime.dispose());
  const { state, bus } = runtime;
  const events = [];
  const raidLatchAttempts = [];
  bus.on('firsthour:milestone', (p) => events.push({ ev: 'milestone',
    milestone: p.milestone, sim: p.atS, cause: p.cause }));
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  state.settings.gameplay.tutorialHints = true;
  state.input.actions ||= {};
  state.player.credits = NEW_GAME.credits;
  const ships = runtime.getSystem('ships');
  ships.newGame();
  state.playerId = runtime.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
    team: 0, factionId: 'faction_free', isPlayer: true, player: state.player,
    fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules || []),
    pos: { x: 0, z: 0 }, rot: 0,
  })).id;
  ships.recomputeActiveShip();
  const world = runtime.getSystem('world');
  world.newGame();
  const econ = runtime.getSystem('economy');
  econ.newGame();
  world.enterSector('sector_helios_prime', {});
  bus.emit('game:started', {});
  await runtime.getSystem('physics').prepareBackend(state, { reset: true });
  const ledger = { recordTrade() {}, recordCreditsNoSale() {}, recordDecision() {}, recordNote() {}, sampleVerbs() {} };
  const services = createServices({ state, bus, ledger, econ,
    clock: { tick: () => state.tick, undockCooldownUntil: () => 0 } });
  const pilot = createStrangerPilot({ state, bus, ledger, services });
  const trace = { meta: pilot.traceMeta, events, samples: [] };
  assert.equal(trace.meta.tutorialPilot, true, 'the real driver declares its enforcing budget metadata');
  assert.equal(trace.meta.seed, 4242);
  const dt = 1 / 60;
  for (let frame = 0; frame <= 181 * 60; frame++) {
    pilot.step(dt, state.tick);
    const input = state.input;
    const raid = state.onboarding && state.onboarding.raid;
    const massline = input.actions.massline;
    if (raid && raid.active && massline && massline.latch) {
      const selected = state.masslineAcquisition && state.masslineAcquisition.selected;
      raidLatchAttempts.push({
        intendedId: raid.ids && raid.ids.raider,
        selectedId: selected && selected.targetId,
        selectedStatus: selected && selected.status,
        tetherMode: input.tetherMode || null,
      });
    }
    // input.js mirrors the completed command packet into the tether press edge.
    input.actions.tetherFire = !!input.actions.massline?.latch;
    if (!events.some((e) => e.ev === 'input') && (input.moveX || input.moveZ || input.turnIntent
      || input.brake || input.fire || input.boost || input.actions.massline?.latch)) {
      events.push({ ev: 'input', kind: 'keydown', sim: state.simTime });
    }
    runtime.runTicks(1, dt);
    if (events.some((e) => e.milestone === 'momentumKill')) break;
    if (checkFirstHourBudget({ ...trace, samples: [{ sim: state.simTime }] }).status === 'FAIL') break;
  }
  trace.samples.push({ sim: state.simTime });
  const verdict = checkFirstHourBudget(trace);
  assert.ok(raidLatchAttempts.length > 0, 'the pilot should issue a raider latch attempt');
  assert.ok(raidLatchAttempts.every((attempt) => attempt.selectedStatus === 'ready'
    && attempt.selectedId === attempt.intendedId && attempt.tetherMode == null),
  `raider latch attempts must use the matching ready scored receipt: ${JSON.stringify(raidLatchAttempts.slice(0, 8))}`);
  const failureSnapshot = verdict.status === 'PASS' ? null : (() => {
    const onboarding = state.onboarding || {};
    const rescue = onboarding.rescue || null;
    const raid = onboarding.raid || null;
    const player = state.playerId != null && state.entities ? state.entities.get(state.playerId) : null;
    const raidRaider = raid && raid.ids && raid.ids.raider != null && state.entities
      ? state.entities.get(raid.ids.raider) : null;
    const raidRaiderAi = raidRaider && raidRaider.data && raidRaider.data.ai;
    const pose = (id) => {
      const entity = id != null && state.entities ? state.entities.get(id) : null;
      if (!entity) return null;
      const vector = (value) => value && Number.isFinite(value.x) && Number.isFinite(value.z)
        ? { x: value.x, z: value.z } : null;
      return {
        id: entity.id,
        type: entity.type || null,
        alive: entity.alive !== false,
        pos: vector(entity.pos),
        vel: vector(entity.vel),
        radius: Number.isFinite(entity.radius) ? entity.radius : null,
      };
    };
    const input = state.input || {};
    const actions = input.actions || {};
    const waypoint = state.nav && state.nav.waypoint;
    const vector = (value) => value && Number.isFinite(value.x) && Number.isFinite(value.z)
      ? { x: value.x, z: value.z } : null;
    return {
      simTime: state.simTime,
      tick: state.tick,
      onboarding: {
        active: onboarding.active === true,
        finished: onboarding.finished === true,
        currentBeat: Number.isInteger(onboarding.currentBeat) ? onboarding.currentBeat : null,
        beatAction: typeof onboarding.beatAction === 'string' ? onboarding.beatAction.slice(0, 120) : null,
        beatDoneAt: {
          tether: Number.isFinite(onboarding.beatDoneAt && onboarding.beatDoneAt.tether)
            ? onboarding.beatDoneAt.tether : null,
          raid: Number.isFinite(onboarding.beatDoneAt && onboarding.beatDoneAt.raid)
            ? onboarding.beatDoneAt.raid : null,
        },
        tetherReeled: onboarding.tetherReeled === true,
        rescue: rescue ? {
          active: rescue.active === true,
          current: rescue.current || null,
          completed: rescue.completed === true,
          swing: rescue.beats && rescue.beats.swing ? {
            state: rescue.beats.swing.state || null,
            fails: Number(rescue.beats.swing.fails) || 0,
            doneAt: Number.isFinite(rescue.beats.swing.doneAt) ? rescue.beats.swing.doneAt : null,
          } : null,
          rockLatched: rescue.rockLatched === true,
          rockReeled: rescue.rockReeled === true,
          rockReleasedAfterReel: rescue.rockReleasedAfterReel === true,
          ids: { rock: rescue.ids && rescue.ids.rock, derelict: rescue.ids && rescue.ids.derelict },
        } : null,
        raid: raid ? {
          active: raid.active === true,
          enteredAt: Number.isFinite(raid.enteredAt) ? raid.enteredAt : null,
          ids: { raider: raid.ids && raid.ids.raider, throwRock: raid.ids && raid.ids.throwRock },
        } : null,
      },
      player: player ? {
        id: player.id,
        alive: player.alive !== false,
        pos: vector(player.pos),
        vel: vector(player.vel),
        tether: state.player && state.player.tether ? {
          active: state.player.tether.active === true,
          targetId: state.player.tether.targetId ?? null,
        } : null,
      } : null,
      actors: {
        rescueRock: pose(rescue && rescue.ids && rescue.ids.rock),
        rescueDerelict: pose(rescue && rescue.ids && rescue.ids.derelict),
        raidRaider: pose(raid && raid.ids && raid.ids.raider),
        raidRaiderAi: raidRaiderAi ? {
          fsm: typeof raidRaiderAi.fsm === 'string' ? raidRaiderAi.fsm.slice(0, 40) : null,
          activityKind: raidRaiderAi.activity && typeof raidRaiderAi.activity.kind === 'string'
            ? raidRaiderAi.activity.kind.slice(0, 40) : null,
        } : null,
        raidThrowRock: pose(raid && raid.ids && raid.ids.throwRock),
      },
      waypoint: waypoint ? {
        kind: waypoint.kind || null,
        label: typeof waypoint.label === 'string' ? waypoint.label.slice(0, 100) : null,
        reason: typeof waypoint.reason === 'string' ? waypoint.reason.slice(0, 120) : null,
        pos: vector(waypoint.pos),
      } : null,
      lastPilotInput: {
        moveX: Number.isFinite(input.moveX) ? input.moveX : null,
        moveZ: Number.isFinite(input.moveZ) ? input.moveZ : null,
        turnIntent: Number.isFinite(input.turnIntent) ? input.turnIntent : null,
        brake: input.brake === true,
        boost: input.boost === true,
        fire: input.fire === true,
        fireGroup: Number.isFinite(input.fireGroup) ? input.fireGroup : null,
        aimAngle: Number.isFinite(input.aimAngle) ? input.aimAngle : null,
        aimWorld: vector(input.aimWorld),
        tetherMode: input.tetherMode || null,
        massline: actions.massline ? {
          latch: actions.massline.latch === true,
          cut: actions.massline.cut === true,
          lineControl: actions.massline.lineControl === true,
          lineLength: Number.isFinite(actions.massline.lineLength) ? actions.massline.lineLength : null,
        } : null,
      },
    };
  })();
  t.diagnostic(JSON.stringify({ verdict, events, failureSnapshot }));
  assert.equal(verdict.status, 'PASS');
  assert.ok(events.some((e) => e.milestone === 'attach'));
  assert.ok(events.some((e) => e.milestone === 'momentumKill'));
});
