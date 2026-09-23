// A kill in the Crucible leaves a body.
//
// "read the pack → pick a physical answer → land it → the wreckage becomes the next answer …
//  ricochet off a wreck you made last round" (design/program/DEMO_READINESS_2026-09-20.md §1)
//
// The live census found a Crucible wasp kill spawned no body: the arena runs with
// world.currentSectorId === null, so the aftermathWrecks marker was rejected before a wreck
// could materialize. These fixtures drive the real survival run headless — runSession,
// survivalWave, survivalRun, aftermathWrecks and mining on one bus — and pin the law:
// a killed hull leaves exactly one durable wreck carrying its pose, radius and momentum;
// slam-fractured hulls yield their seam pieces instead of a second whole wreck; the arena
// keeps eight bodies and retires the FARTHEST one on the ninth kill; and the wreck survives
// the wave → shop → wave transition latchable by the Massline.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeEntity } from '../src/core/entity.js';
import { runSession } from '../src/systems/runSession.js';
import {
  SURVIVAL_ARENA_INTRO_TICKS,
  SURVIVAL_WAVE_INTRO_TICKS,
  WAVE_CLEARED_SEAM,
  survivalRun,
} from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { mining } from '../src/systems/mining.js';
import {
  fractureThresholdWU,
  notePendingSlam,
  resetPendingSlams,
} from '../src/systems/hullFracture.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';

const DT = 1 / 60;
const ARENA = 'helios_core';
const ARENA_FIELD_ID = `arena:${ARENA}`;
const LEGACY_WRECK_RADIUS = 9;

function boot(seed = 4242, ruleset = 'swarm') {
  resetPendingSlams();
  const state = createGameState(seed);
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
  const budget = makeBudgetApi(state);
  const spawned = [];
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      entity.alive = true;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = {
    id: state.nextEntityId++, alive: true, type: 'ship', team: 1, radius: 16, mass: 58,
    pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, data: {},
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));

  const registry = { get: (name) => (name === 'aftermathWrecks' ? aftermathWrecks : null) };
  const ctx = { state, bus, helpers, registry };
  runSession.init(ctx);
  survivalWave.init(ctx);
  aftermathWrecks.init(ctx);
  mining.init(ctx);
  survivalRun.init(ctx);

  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      state.tick += 1;
      state.simTime += DT;
      survivalWave.update(DT);
      survivalRun.update(DT);
      aftermathWrecks.update(DT, state);
    }
  };
  bus.emit('run:beginRequested', { kind: 'survival', ruleset, seed, arenaId: ARENA });
  bus.emit('run:loadoutReady', {});
  tick(1 + SURVIVAL_ARENA_INTRO_TICKS + SURVIVAL_WAVE_INTRO_TICKS + 90);
  return { state, bus, emitted, helpers, budget, spawned, player, tick };
}

function liveWrecks(h) {
  return h.state.entityList.filter((e) => e && e.alive !== false && e.type === 'wreck');
}

function liveHostiles(h) {
  return h.state.entityList.filter((e) => e && e.alive !== false && e !== h.player
    && (e.type === 'ship' || e.type === 'drone'));
}

// The same payload shape the combat kernel and combat.js publish on a gunfire kill.
function killByGunfire(h, entity) {
  const vel = entity.vel ? { x: entity.vel.x, z: entity.vel.z } : { x: 0, z: 0 };
  const pos = { x: entity.pos.x, z: entity.pos.z };
  entity.alive = false;
  h.bus.emit('entity:killed', {
    id: entity.id, killerId: h.player.id, type: entity.type,
    pos, factionId: entity.factionId || null,
    victimClass: (entity.data && entity.data.shipClass) || entity.type,
  });
  return { vel, pos };
}

function arenaMarkers(h) {
  return (h.state.aftermathWrecks && h.state.aftermathWrecks.bySector[ARENA_FIELD_ID]) || [];
}

function boundWrecks(h) {
  return arenaMarkers(h)
    .map((marker) => ({ marker, entity: aftermathWrecks._resolveBoundWreck(marker.markerId) }))
    .filter((row) => row.entity && row.entity.alive !== false);
}

for (const seed of [4242, 8008]) {
  test(`seed ${seed}: a gunfire kill leaves exactly one wreck at the victim's pose, size and momentum`, () => {
    const h = boot(seed);
    assert.equal(h.state.world.currentSectorId, null, 'the arena has no sector — the old rejection');
    assert.equal(h.state.run.phase, 'active');
    const victim = liveHostiles(h)[0];
    assert.ok(victim, 'wave one fielded a hostile');
    victim.vel = { x: 132, z: -47 };
    victim.rot = 0.9;
    const victimRadius = victim.radius;
    const before = new Set(h.state.entityList);

    const { vel } = killByGunfire(h, victim);

    const spawnedNow = h.state.entityList.filter((e) => e && !before.has(e) && e.type === 'wreck');
    assert.equal(spawnedNow.length, 1, 'exactly one live wreck body within the kill tick');
    const wreck = spawnedNow[0];
    assert.equal(wreck.type, 'wreck');
    assert.ok(Math.hypot(wreck.pos.x - victim.pos.x, wreck.pos.z - victim.pos.z) < 1e-6,
      'wreck spawns where the victim died');
    assert.equal(wreck.radius, victimRadius, 'wreck radius is the victim radius, not the legacy 9');
    assert.ok(Math.hypot(wreck.vel.x - vel.x, wreck.vel.z - vel.z) < 1,
      `wreck keeps the dead hull's momentum (got ${JSON.stringify(wreck.vel)} vs ${JSON.stringify(vel)})`);
    assert.equal(wreck.rot, 0.9, 'wreck keeps the victim pose');
    assert.ok(wreck.data && wreck.data.markerId, 'the body is bound to a durable marker');
    assert.equal(wreck.data.provenance && wreck.data.provenance.sectorId, ARENA_FIELD_ID);
    assert.ok(wreck.mass > 0, 'dead man mass carried');

    // A duplicate kill receipt must not mint a second body on the same marker.
    killByGunfire(h, victim);
    assert.equal(h.state.entityList.filter((e) => e && e.type === 'wreck').length, 1);

    // A full settle must not mint a second body (mining defers to the bound aftermath wreck).
    h.tick(120);
    assert.equal(spawnedNow.length, 1);
    assert.equal(liveWrecks(h).filter((e) => e.data && e.data.markerId === wreck.data.markerId).length, 1);
  });
}

test('the ninth arena kill retires the wreck farthest from the player, never the one you are watching', () => {
  const h = boot(4242);
  // Clear the wave's own hostiles so the census is only these nine victims.
  for (const hostile of liveHostiles(h)) { hostile.alive = false; h.state.entities.delete(hostile.id); }
  const victims = [];
  for (let i = 0; i < 9; i++) {
    const dist = 140 + i * 160; // nearest first — the LAST placed is the farthest from the player.
    const victim = h.helpers.spawnEntity({
      type: 'ship',
      pos: { x: h.player.pos.x + dist, z: h.player.pos.z },
      vel: { x: 0, z: 0 },
      radius: 12, mass: 16, hull: 40, hullMax: 40,
      data: { defId: 'ship_wasp', shipClass: 'wasp' },
    });
    victims.push(victim);
  }
  for (const victim of victims) {
    killByGunfire(h, victim);
  }
  const bound = boundWrecks(h);
  assert.equal(bound.length, 8, 'the arena keeps eight battlefield wrecks');
  // The ninth kill's own body is the farthest hulk on the field — it arrived with the cap
  // full, so the farthest of the PRE-EXISTING eight retired to make room for it.
  const secondFarthest = victims[victims.length - 2];
  assert.equal(bound.some((row) => row.marker.victimId === secondFarthest.id), false,
    'the farthest pre-existing wreck is the one retired');
  const retiredEvent = h.emitted.find((e) => e.event === 'aftermathWreck:retired'
    && e.payload && e.payload.reason === 'arena_cap');
  assert.ok(retiredEvent, 'the retirement is a published event, not a silent sweep');
  const newest = victims[victims.length - 1];
  assert.ok(bound.some((row) => row.marker.victimId === newest.id && row.entity.alive !== false),
    'the kill that hit the cap still leaves its own body');
  const nearestVictim = victims[0];
  assert.ok(bound.some((row) => row.marker.victimId === nearestVictim.id
    && row.entity.alive !== false), 'the wreck beside the player survives the cap');
});

test('a wreck from the last round is still a grabbable body after the shop transition', () => {
  const h = boot(4242);
  const victim = liveHostiles(h)[0];
  const wreckBefore = liveWrecks(h).length;
  killByGunfire(h, victim);
  const wreck = liveWrecks(h).find((e) => e.data && e.data.markerId);
  assert.ok(wreck, 'kill left a bound wreck');
  assert.equal(liveWrecks(h).length, wreckBefore + 1);
  const wreckId = wreck.id;
  const markerId = wreck.data.markerId;

  // wave 1 → cleanup → draft (the swarm's shop opens every round) → wave_intro → wave 2.
  h.bus.emit(WAVE_CLEARED_SEAM, { wave: 1 });
  let guard = 0;
  let sawShop = false;
  while (!(h.state.run.phase === 'active' && h.state.run.wave === 2) && guard++ < 60 * 30) {
    h.tick(1);
    const phase = h.state.run.phase;
    if (phase === 'draft' || phase === 'refit') {
      sawShop = true;
      // The shop is open and the body still stands — latch stays legal through the transition.
      const during = h.state.entities.get(wreckId);
      assert.ok(during && during.alive !== false, 'the wreck body stands while the shop is open');
      assert.ok(isAttachable(during, h.player.id, h.state), 'Massline latch survives the shop');
      h.bus.emit(phase === 'draft' ? 'run:draftResolved' : 'run:refitClosed', {});
    }
  }
  assert.ok(sawShop, 'the round transition really passed through the shop');
  assert.equal(h.state.run.phase, 'active');
  assert.equal(h.state.run.wave, 2, 'the run reached the next round');

  const still = h.state.entities.get(wreckId);
  assert.ok(still && still.alive !== false, 'the wreck body survived the round transition');
  assert.equal(still.data.markerId, markerId, 'the same durable marker still owns it');
  assert.ok(arenaMarkers(h).some((m) => m.markerId === markerId), 'the marker persisted');
  assert.ok(isAttachable(still, h.player.id, h.state),
    "the next round's Massline can latch the wreck you made last round");
});

test('a slam-fractured kill leaves its two seam pieces — never a third whole wreck', () => {
  const h = boot(4242);
  const victim = liveHostiles(h)[0];
  victim.vel = { x: 88, z: 12 };
  const slammed = notePendingSlam(victim, {
    closingSpeed: fractureThresholdWU + 10, tick: h.state.tick,
  });
  assert.equal(slammed, true, 'closing speed over the fracture threshold notes the slam');
  const before = new Set(h.state.entityList);
  killByGunfire(h, victim);
  const fresh = h.state.entityList.filter((e) => e && !before.has(e) && e.type === 'wreck');
  assert.equal(fresh.length, 2, 'the seam and the remainder are the body — no double-spawn');
  assert.ok(fresh.every((e) => e.data && e.data.fracturePiece), 'both pieces are fracture pieces');
});

test('legacy markers without a victim radius still spawn at the fallback radius', () => {
  const h = boot(4242);
  aftermathWrecks.deserialize({
    bySector: {
      sector_legacy: [{
        markerId: 'aft_legacy1', sectorId: 'sector_legacy', zoneId: null,
        pos: { x: 10, z: 20 }, victimId: 99, victimClass: 'ship',
        victimVel: { x: 0, z: 0 }, victimAngVel: 0, victimMass: 30,
        victimRot: 0, victimPitch: 0, victimBank: 0,
        victimLabel: 'old hulk', tick: 1, t: 1, wreckClass: 'battlefield',
      }],
    },
  });
  const marker = h.state.aftermathWrecks.bySector.sector_legacy[0];
  assert.equal(marker.victimRadius, null, 'legacy marker normalizes with no radius');
  const spec = aftermathWrecks._specForMarker(marker);
  assert.equal(spec.radius, LEGACY_WRECK_RADIUS, 'fallback radius preserves old saves');
  const atKill = aftermathWrecks._specForMarker(marker, { atKill: true });
  assert.equal(atKill.radius, LEGACY_WRECK_RADIUS);
});

test('recorded momentum keeps the full kill velocity; sector re-entry still uses the bounded drift', () => {
  const h = boot(4242);
  aftermathWrecks.deserialize({
    bySector: {
      sector_legacy: [{
        markerId: 'aft_fast', sectorId: 'sector_legacy', zoneId: null,
        pos: { x: 0, z: 0 }, victimId: 7, victimClass: 'ship',
        victimVel: { x: 520, z: 0 }, victimAngVel: 5.5, victimMass: 30,
        victimRot: 0, victimPitch: 0, victimBank: 0, victimRadius: 14,
        victimLabel: 'fast hulk', tick: 1, t: 1, wreckClass: 'battlefield',
      }],
    },
  });
  const marker = h.state.aftermathWrecks.bySector.sector_legacy[0];
  const reentry = aftermathWrecks._specForMarker(marker);
  assert.ok(Math.hypot(reentry.vel.x, reentry.vel.z) <= 400 + 1e-9,
    're-entry keeps the bounded drift law');
  const atKill = aftermathWrecks._specForMarker(marker, { atKill: true });
  assert.ok(Math.hypot(atKill.vel.x - 520, atKill.vel.z) < 1e-9,
    'the at-kill spawn uses the real recorded velocity');
  assert.equal(atKill.radius, 14);
});
