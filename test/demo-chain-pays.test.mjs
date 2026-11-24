// DEMO-CHAIN-PAYS-1 — the chain meter multiplies a Swarm kill's Scrap and XP.
// The tier is the one the HUD is already showing. Room pay stacks with it up to ×6.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import {
  killXpFor,
  survivalRewards,
} from '../src/systems/survivalRewards.js';
import {
  SWARM_CHAIN_PAY_CAP,
  swarmChain,
  swarmChainPayMultiplier,
  swarmKillPayMultiplier,
} from '../src/systems/swarmChain.js';
import { swarmStyleReadout } from '../src/ui/survivalHud.js';

const ARENA = 'helios_core';
const SEED = 4242;

function boot(seed = SEED) {
  const state = createGameState(seed);
  state.simTime = 0;
  state.player.credits = 1000;
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [] }];
  state.player.activeShipIndex = 0;
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.nextEntityId = 2;
  const ctx = { state, bus, helpers: {} };
  runSession.init(ctx);
  survivalRewards.init(ctx);
  return { state, bus, emitted, ctx };
}

function beginSurvival(harness, setup = {}) {
  harness.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA, ...setup,
  });
  let from = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active']) {
    harness.bus.emit('run:transitionRequested', {
      expectedPhase: from, nextPhase: next, reason: 'test', tick: 0,
    });
    from = next;
  }
  harness.state.simTime = 0;
  return harness.state.run;
}

function spawnFodder(harness, extra = {}) {
  const id = harness.state.nextEntityId++;
  const entity = {
    id, alive: true, type: 'ship', team: 1, pos: { x: 50, z: 0 },
    data: { level: 1, runWave: 1, runCohort: 'survival', ...extra },
  };
  harness.state.entities.set(id, entity);
  harness.state.entityList.push(entity);
  return entity;
}

function killIt(harness, entity, { killerId = 1, provenance = null } = {}) {
  entity.alive = false;
  harness.bus.emit('entity:killed', {
    id: entity.id,
    killerId,
    type: entity.type,
    pos: { x: entity.pos.x, z: entity.pos.z },
    ...(provenance ? { provenance } : {}),
  });
}

function chipOf(harness, since) {
  const drop = harness.emitted.slice(since).find((entry) => entry.event === 'loot:drop');
  assert.ok(drop, 'the kill dropped a Scrap chip');
  return drop.payload.items[0];
}

function holdChain(chain, simTime) {
  swarmChain._chain = chain;
  swarmChain._lastCause = 'direct';
  swarmChain._lastKillAt = simTime;
  swarmChain._warned = false;
}

function freshSwarm() {
  const harness = boot();
  swarmChain.init(harness.ctx);
  beginSurvival(harness);
  return harness;
}

test('the pay tiers are the multipliers the HUD already shows, and they stop at ×6', () => {
  assert.equal(SWARM_CHAIN_PAY_CAP, 6);
  const cuts = [0, 1, 4, 5, 9, 10, 24, 25, 49, 50, 99, 100, 199, 200, 500];
  for (const n of cuts) {
    const mult = swarmChainPayMultiplier(n);
    assert.ok(mult <= SWARM_CHAIN_PAY_CAP, `chain ${n} invented a tier above ×6`);
    const read = swarmStyleReadout(n);
    if (n <= 0) {
      assert.equal(read, null);
      assert.equal(mult, 1);
    } else {
      const label = Number.isInteger(mult) ? `×${mult}` : `×${mult}`;
      assert.equal(read.mult, label, `HUD and purse disagree at chain ${n}`);
    }
  }
  assert.equal(swarmChainPayMultiplier(25), 3);
  assert.equal(swarmChainPayMultiplier(4), 1);
  assert.equal(swarmKillPayMultiplier(3, 2.5), 6, 'room ×2.5 and chain ×3 cap at ×6');
  assert.equal(swarmKillPayMultiplier(2, 2.5), 5, 'room and ×2 stay under the cap');
  assert.equal(swarmKillPayMultiplier(6, 2.5), 6);
  assert.equal(swarmKillPayMultiplier(1, 2.5), 2.5);
});

test('a kill at the ×3 tier pays 3× base Scrap and XP; ×1 and a lapsed chain do not', () => {
  const at = (chain, { room = false, champion = false, lapse = false } = {}) => {
    const harness = freshSwarm();
    if (lapse) holdChain(chain, harness.state.simTime - 10);
    else if (chain > 0) holdChain(chain, harness.state.simTime);
    const mark = harness.emitted.length;
    const xpBefore = harness.state.run.xp;
    killIt(harness, spawnFodder(harness, champion ? { swarmChampion: true } : {}), {
      provenance: room ? { tag: 'massline_throw' } : null,
    });
    const chip = chipOf(harness, mark);
    return { chip: chip.credits, xp: harness.state.run.xp - xpBefore, chain: swarmChain.chainState().chain };
  };

  const base = at(0);
  assert.equal(base.chip, 10);
  assert.equal(base.xp, killXpFor(1));

  const tier1 = at(4);
  assert.equal(tier1.chip, base.chip, 'chain 4 is still ×1 on the meter');
  assert.equal(tier1.xp, base.xp);

  const tier3 = at(25);
  assert.equal(tier3.chip, base.chip * 3);
  assert.equal(tier3.xp, base.xp * 3);

  const crossing = at(24);
  assert.equal(crossing.chip, base.chip * 2, 'the kill pays the tier already showing, not the one it climbs into');
  assert.ok(crossing.chain >= 25);

  const half = at(5);
  assert.equal(half.chip, 15);
  assert.equal(half.xp, 5);

  const lapsed = at(25, { lapse: true });
  assert.equal(lapsed.chip, base.chip, 'a chain whose window has closed pays ×1');
  assert.equal(lapsed.xp, base.xp);

  const roomLow = at(10, { room: true });
  assert.equal(roomLow.chip, 50, 'room ×2.5 and chain ×2 is ×5, under the cap');
  assert.equal(roomLow.xp, 15);

  const roomHigh = at(25, { room: true });
  assert.equal(roomHigh.chip, 60, 'room ×2.5 and chain ×3 cap at ×6, not ×7.5');
  assert.equal(roomHigh.xp, 18);

  const roomTop = at(200, { room: true });
  assert.equal(roomTop.chip, 60);
  assert.equal(roomTop.xp, 18);

  const boss = at(25, { champion: true });
  assert.equal(boss.chip, 150, 'the boss 5× sits outside the ×6 room-and-chain cap');
  assert.equal(boss.xp, killXpFor(1) * 3 + 100);
});

test('a non-Swarm kill ignores a live chain', () => {
  const harness = boot();
  swarmChain.init(harness.ctx);
  beginSurvival(harness, { ruleset: 'scored' });
  holdChain(25, harness.state.simTime);
  const mark = harness.emitted.length;
  killIt(harness, spawnFodder(harness));
  const chip = chipOf(harness, mark);
  assert.equal(chip.credits, 10);
  assert.equal(harness.state.run.xp, killXpFor(1));

  const adventure = boot(9);
  swarmChain.init(adventure.ctx);
  holdChain(80, 0);
  killIt(adventure, spawnFodder(adventure));
  assert.equal(adventure.state.run.kind, 'adventure');
  assert.equal(adventure.state.run.xp, 0);
  assert.equal(adventure.emitted.some((entry) => entry.event === 'loot:drop'), false);
});

function easyPlans() {
  const setup = { ruleset: 'swarm', seed: SEED, swarmStake: 'exhibition', zeroScrapOpening: true };
  const plans = [];
  for (let wave = 1; wave <= 10; wave++) {
    plans.push(planWave({ ...setup, arenaId: ARENA, wave }));
  }
  return { setup, plans };
}

function playEasy(mode, { setup, plans }) {
  const harness = boot(SEED);
  if (mode !== 'base') swarmChain.init(harness.ctx);
  beginSurvival(harness, setup);
  const marks = {};
  for (let wave = 1; wave <= 10; wave++) {
    harness.state.run.wave = wave;
    const plan = plans[wave - 1];
    harness.bus.emit('run:wavePlanned', { wave, plan });
    const count = plan.swarm.killTarget;
    for (let i = 0; i < count; i++) {
      if (mode === 'lapsed') holdChain(25, harness.state.simTime - 10);
      else if (mode === 'hold2') holdChain(10, harness.state.simTime);
      else if (mode === 'hold3') holdChain(25, harness.state.simTime);
      const id = harness.state.nextEntityId++;
      const entity = {
        id, alive: true, type: 'ship', team: 1, pos: { x: 50, z: 0 },
        data: { level: 1, runWave: wave, runCohort: 'survival' },
      };
      harness.state.entities.set(id, entity);
      killIt(harness, entity);
    }
    harness.bus.emit('run:waveCleared', {
      wave, runWave: wave, completionKind: 'cohort',
      requested: count, admitted: count, killed: count, starved: false,
    });
    if (wave === 3 || wave === 10) {
      marks[wave] = {
        scrap: harness.state.run.credits,
        xp: harness.state.run.xp,
        level: harness.state.run.level,
      };
    }
  }
  return marks;
}

test('Easy Swarm: no chain matches the pinned purse; a ×2–×3 chain stays inside 1.5–2.5× by round 10', { timeout: 60000 }, () => {
  const book = easyPlans();
  const base = playEasy('base', book);
  const lapsed = playEasy('lapsed', book);
  const hold2 = playEasy('hold2', book);
  const hold3 = playEasy('hold3', book);
  const climb = playEasy('climb', book);
  assert.equal(base[3].scrap, 490, 'a shoot-only Easy run with no live chain is the pinned round-3 purse');
  assert.equal(lapsed[3].scrap, base[3].scrap, 'a lapsed ×3 meter pays nothing extra');
  assert.equal(lapsed[10].scrap, base[10].scrap);
  const ratio = (row) => row[10].scrap / base[10].scrap;
  const r2 = ratio(hold2);
  const r3 = ratio(hold3);
  const rc = ratio(climb);
  const line = [
    `base r3 ${base[3].scrap} L${base[3].level} r10 ${base[10].scrap} L${base[10].level}`,
    `×2 r3 ${hold2[3].scrap} L${hold2[3].level} r10 ${hold2[10].scrap} L${hold2[10].level} (${r2.toFixed(2)}×)`,
    `×3 r3 ${hold3[3].scrap} L${hold3[3].level} r10 ${hold3[10].scrap} L${hold3[10].level} (${r3.toFixed(2)}×)`,
    `climb r3 ${climb[3].scrap} L${climb[3].level} r10 ${climb[10].scrap} L${climb[10].level} (${rc.toFixed(2)}×)`,
  ].join(' | ');
  assert.ok(r3 >= 1.5 && r3 <= 2.5, line);
  assert.ok(r2 > 1 && r2 < r3, line);
  assert.ok(rc > r2 && rc <= 2.5, line);
});
