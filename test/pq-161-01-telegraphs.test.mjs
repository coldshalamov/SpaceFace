import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ContactKind } from '../src/ai/contracts.js';
import { CombatDoctrineId, DOCTRINE_TELEGRAPH_TICKS } from '../src/ai/combatDoctrine.js';
import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../src/ai/doctrine.js';
import { physics } from '../src/core/physics.js';
import { createSimulation } from '../src/core/sim.js';
import {
  forceChannelForTelegraphKind,
  TELEGRAPH_FORCE_CHANNELS,
} from '../src/data/palettes.js';
import { mines, MINE_TELEGRAPH_CUE, MINE_BLAST_DAMAGE } from '../src/systems/mines.js';
import { combat } from '../src/systems/combat.js';
import { weapons } from '../src/systems/weapons.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { createTelemetry } from '../src/systems/telemetry.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';
import {
  createThreatHalo,
  leftoverTelegraphKind,
  pairLeftoverDeathTelegraph,
  CONTINUOUS_TELEGRAPH_KINDS,
  LEFTOVER_TELEGRAPH_KINDS,
  TELEGRAPH_CUE_TICKS,
  TELEGRAPH_PAIR_MIN_TICKS,
  TELEGRAPH_PAIR_MAX_TICKS,
} from '../src/ui/threatHalo.js';

const SEED = 16101;
const TICK_MS = 1000 / 60;

function mockDocument() {
  const elements = [];
  const fakeElement = (tag) => {
    const el = {
      tagName: String(tag || 'div').toUpperCase(),
      className: '',
      attributes: {},
      style: {},
      children: [],
      innerHTML: '',
      parentNode: null,
      setAttribute(k, v) { this.attributes[k] = String(v); },
      removeAttribute(k) { delete this.attributes[k]; },
      getAttribute(k) { return this.attributes[k]; },
      appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
      },
      removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx >= 0) this.children.splice(idx, 1);
        child.parentNode = null;
      },
    };
    elements.push(el);
    return el;
  };
  return { elements, document: { createElement: fakeElement } };
}

function offscreenWorldToScreen(world, out) {
  out.x = world.x > 0 ? 2000 : (world.x < 0 ? -200 : 640);
  out.y = world.z > 0 ? 2000 : (world.z < 0 ? -200 : 360);
  out.onScreen = false;
  return out;
}

function pairDeaths(deaths, telegraphs) {
  let preceded = 0;
  const rows = [];
  for (const death of deaths) {
    const match = pairLeftoverDeathTelegraph(death, telegraphs);
    if (match) preceded += 1;
    rows.push({ death, match });
  }
  const total = deaths.length;
  const percent = total === 0 ? 0 : Math.round((preceded / total) * 1000) / 10;
  return { preceded, total, percent, rows };
}

function bootMineCombat(seed = SEED, opts = {}) {
  const sim = createSimulation({ seed, systems: [mines, combat] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_pq161_01';
  state.world.activeSector = { id: 'sector_pq161_01', pois: [] };
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 12,
    hull: 8,
    hullMax: 80,
    shield: 0,
    shieldMax: 0,
    armorHp: 0,
    armorMax: 0,
    data: {},
  });
  state.playerId = player.id;
  const telemetry = opts.telemetry ? createTelemetry(bus, state) : null;
  const telegraphs = [];
  const deaths = [];
  bus.on('ai:telegraph', (p) => {
    telegraphs.push({
      ...p,
      tick: Number.isInteger(p.tick) ? p.tick : (state.tick | 0),
    });
  });
  bus.on('player:death', (p) => {
    deaths.push({
      tick: Number.isInteger(state.tick) ? state.tick : 0,
      killerId: p.killerId != null ? p.killerId : p.attackerId,
      mineId: p.origin && p.origin.kind === 'mine' ? p.origin.id : (p.mineId || null),
      cause: p.cause || p.context || null,
    });
  });
  return { sim, state, bus, player, telegraphs, deaths, minesSys: sim.registry.get('mines'), telemetry };
}

function leftoverMineDeath(opts = {}) {
  const t = bootMineCombat(opts.seed || SEED, opts);
  const owner = t.sim.spawn({
    type: 'ship',
    team: 1,
    pos: { x: 400, z: 0 },
    radius: 14,
    hull: 100,
    hullMax: 100,
    data: { encounter: true, lootTableId: 'mine_layer_jackal' },
  });
  const mine = t.minesSys.placeMine({
    ownerId: owner.id,
    pos: { x: 40, z: 0 },
    team: 1,
    armDelayS: opts.armDelayS,
    triggerRadius: 80,
    blastDamage: opts.blastDamage || MINE_BLAST_DAMAGE,
  });
  assert.ok(mine, 'leftover placeMine must spawn');
  const maxTicks = opts.maxTicks || 200;
  for (let i = 0; i < maxTicks && t.deaths.length === 0; i++) t.sim.runTicks(1);
  return { ...t, owner, mine };
}


// A real doctrine kill: the injected sensors/roster are a supported production port shape, but the
// damage chain is entirely live — tacticalAI publishes ai:telegraph, holds fire
// DOCTRINE_TELEGRAPH_TICKS, engagement authority arms, weapons spawns a real railgun slug that
// physics flies into the player and combat routes as a real death. Nothing about the kill is gated
// on the pairing window; the lead is whatever production produced. Geometry is authored scenario
// data on a fixed seed (interceptor 110 WU, ranged 301 WU), and the activity startedTick -30
// authors a run that began half a second before first contact, so the spawn-protection response
// window has already burned — the same history a live encounter NPC carries.
async function realDoctrineDeath(combatDoctrineId, playerX, opts = {}) {
  const seed = opts.seed || SEED;
  const ids = { player: null, npc: null };
  let simState = null;

  const tacticalAI = createTacticalAISystem({
    seed,
    sensors: {
      frameFor(_entityId, tick) {
        const state = simState;
        const npc = state.entityList.find((e) => e.id === ids.npc);
        const player = state.entityList.find((e) => e.id === ids.player);
        if (!npc || !player) return { tick, self: null, contacts: [], events: [] };
        return {
          tick,
          self: {
            id: npc.id,
            team: npc.team,
            pos: { ...npc.pos },
            vel: { ...npc.vel },
            rot: npc.rot,
            radius: npc.radius,
            hullFraction: npc.hull / npc.hullMax,
            energyFraction: npc.cap / npc.capMax,
            heatFraction: 0,
            disabled: false,
            tethered: false,
            capabilities: ['drive', 'sensor', 'weapon', 'ranged'],
            subsystemFractions: {},
            activity: npc.data.ai.activity,
            roe: npc.data.ai.roe,
            combatDoctrineId: npc.data.ai.combatDoctrineId,
          },
          contacts: [{
            id: player.id,
            kind: ContactKind.SHIP,
            team: player.team,
            classification: 'player_ship_sensor_track',
            pos: { ...player.pos },
            vel: { ...player.vel },
            radius: player.radius,
            confidence: 1,
            threat: 0.9,
            hostile: true,
            alive: true,
            valid: true,
            visible: true,
            tags: ['armed'],
          }],
          events: [],
        };
      },
    },
    roster: {
      listSquads: () => [{
        id: 'pq161_doctrine',
        doctrine: 'scavenger',
        faction: 'faction_reach',
        formation: 'wedge',
        members: [{
          id: ids.npc,
          preferredRole: 'striker',
          capabilities: ['drive', 'sensor', 'weapon', 'ranged'],
          combatDoctrineId,
        }],
      }],
    },
    maneuver: { request() { return true; } },
    actionPortFactory: () => ({
      list() {
        return [{
          id: 'action_burst',
          tags: ['attack'],
          minCommitTicks: 1,
          switchMargin: 0,
          range: 700,
          preferredRange: 220,
          targetKinds: [ContactKind.SHIP],
        }];
      },
      canStart() { return { ok: true, reason: 'fixture_ok' }; },
      start(entityId, actionId, request) {
        return { entityId, actionId, startedTick: request.tick };
      },
      status(_entityId, handle) {
        return simState.tick - (handle && handle.startedTick || simState.tick) >= 2 ? 'completed' : 'running';
      },
      interrupt() { return true; },
    }),
    config: {
      runtime: { decisionIntervalTicks: 1 },
    },
  });

  const sim = createSimulation({ seed, systems: [combat, weapons, tacticalAI, physics] });
  simState = sim.state;
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_pq161_01';
  state.world.activeSector = { id: 'sector_pq161_01', pois: [] };
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';

  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 12,
    hull: 2,
    hullMax: 8,
    shield: 0,
    shieldMax: 0,
    armorHp: 0,
    armorMax: 0,
    data: {},
  });
  ids.player = player.id;
  state.playerId = player.id;

  const npc = sim.spawn({
    type: 'ship',
    team: 1,
    pos: { x: playerX, z: 0 },
    vel: { x: 0, z: 0 },
    rot: Math.PI,
    radius: 12,
    hull: 100,
    hullMax: 100,
    cap: 100,
    capMax: 100,
    data: {
      encounter: true,
      ai: {
        squadId: `pq161_${combatDoctrineId}`,
        doctrine: 'scavenger',
        activity: normalizeActivity({
          kind: ActivityKind.ATTACK_RUN,
          reason: `pq161:${combatDoctrineId}`,
          anchor: { x: playerX, z: 0 },
          leashRadius: 1200,
          startedTick: -30,
        }),
        roe: RulesOfEngagement.WEAPONS_FREE,
        combatDoctrineId,
        hostileTeams: [0],
        motive: 'assigned_interdiction',
        engagementTrigger: 'authorized_hostile_spawn',
        zoneId: 'zone_pq161',
        approachTelegraph: combatDoctrineId === CombatDoctrineId.RANGED_DISENGAGER
          ? 'weapon_charge'
          : 'engine_flare',
        noFireResponseWindowS: 1,
      },
      weapons: [{ defId: 'wpn_railgun_m' }],
      combat: { targetId: player.id },
      intent: {},
    },
  });
  ids.npc = npc.id;

  const telegraphs = [];
  const deaths = [];
  bus.on('ai:telegraph', (p) => {
    telegraphs.push({
      ...p,
      tick: Number.isInteger(p.tick) ? p.tick : (state.tick | 0),
    });
  });
  bus.on('player:death', (p) => {
    deaths.push({
      tick: Number.isInteger(state.tick) ? state.tick : 0,
      killerId: p.killerId != null ? p.killerId : p.attackerId,
      mineId: p.origin && p.origin.kind === 'mine' ? p.origin.id : (p.mineId || null),
      cause: p.cause || p.context || null,
    });
  });

  // The live done-when instrument subscribes here, before any tick runs, so it sees every
  // ai:telegraph and records the real death at the death site (no injected routeDamage).
  const telemetry = opts.telemetry ? createTelemetry(bus, state) : null;

  const registry = sim.registry;
  const physicsSys = registry.get('physics');
  const readiness = typeof physicsSys.prepareBackend === 'function'
    ? await physicsSys.prepareBackend(state)
    : true;
  assert.equal(readiness, true, 'rapier-dynamic must initialize for the projectile flight');

  let firstFireTick = null;
  const maxTicks = opts.maxTicks || 420;
  for (let i = 0; i < maxTicks && deaths.length === 0; i++) {
    sim.runTicks(1);
    if (firstFireTick == null && npc.data.intent && npc.data.intent.fire) firstFireTick = state.tick;
  }

  if (typeof physicsSys._disableSg02DynamicAuthority === 'function') {
    physicsSys._disableSg02DynamicAuthority();
  }
  sim.dispose();

  return {
    telegraphs,
    deaths,
    firstFireTick,
    telegraphTick: telegraphs.length ? telegraphs[0].tick : null,
    combatDoctrineId,
    telemetry,
  };
}

test('PQ-161.01: leftover telegraph kinds resolve without invented cues', () => {
  assert.deepEqual([...LEFTOVER_TELEGRAPH_KINDS], [
    'engine_flare', 'weapon_charge', 'attach_spool', 'wake_mines',
  ]);
  assert.equal(leftoverTelegraphKind({ kind: 'engine_flare' }), 'engine_flare');
  assert.equal(leftoverTelegraphKind({ kind: 'weapon_charge' }), 'weapon_charge');
  assert.equal(leftoverTelegraphKind({ kind: 'attach_spool' }), 'attach_spool');
  assert.equal(leftoverTelegraphKind({ kind: MINE_TELEGRAPH_CUE }), 'wake_mines');
  assert.equal(leftoverTelegraphKind({ kind: 'transverse_snare' }), 'attach_spool');
  assert.equal(leftoverTelegraphKind({ doctrineId: 'ranged_disengager' }), 'weapon_charge');
  assert.equal(leftoverTelegraphKind({ kind: 'collision' }), null);
  assert.equal(DOCTRINE_TELEGRAPH_TICKS, TELEGRAPH_CUE_TICKS);
  assert.equal(Math.round(TELEGRAPH_CUE_TICKS * TICK_MS), 500, 'a telegraph lead is 500 ms / 30 frames');
  assert.equal(Math.round(TELEGRAPH_PAIR_MIN_TICKS * TICK_MS), 500);
  assert.equal(Math.round(TELEGRAPH_PAIR_MAX_TICKS * TICK_MS), 1000);
  assert.deepEqual(TELEGRAPH_FORCE_CHANNELS, {
    engine_flare: 'impulses',
    weapon_charge: 'impulses',
    wake_mines: 'repulsors',
    attach_spool: 'rope',
  });
  assert.equal(forceChannelForTelegraphKind('engine_flare'), 'impulses');
  assert.equal(forceChannelForTelegraphKind('weapon_charge'), 'impulses');
  assert.equal(forceChannelForTelegraphKind('wake_mines'), 'repulsors');
  assert.equal(forceChannelForTelegraphKind('attach_spool'), 'rope');
  assert.equal(forceChannelForTelegraphKind('collision'), null);
});

test('PQ-161.01: leftover lethal pairing on seed 16101', async () => {
  const mineDefault = leftoverMineDeath({ seed: SEED });
  const mineHalf = leftoverMineDeath({ seed: SEED + 1, armDelayS: 0.5, maxTicks: 90 });
  const liveInterceptor = await realDoctrineDeath(CombatDoctrineId.INTERCEPTOR_FLYBY, 110);
  const liveRanged = await realDoctrineDeath(CombatDoctrineId.RANGED_DISENGAGER, 301, { seed: SEED + 3, maxTicks: 420 });

  for (const run of [mineDefault, mineHalf]) {
    assert.ok(run.deaths.length >= 1, 'leftover mine blast must be able to kill a thin hull');
  }
  assert.ok(mineDefault.telegraphs.some((tg) => leftoverTelegraphKind(tg) === 'wake_mines'),
    'leftover placeMine emits wake_mines');
  assert.ok(liveInterceptor.deaths.length >= 1, 'interceptor doctrine must produce a real projectile kill');
  assert.ok(liveRanged.deaths.length >= 1, 'ranged doctrine must produce a real projectile kill');
  assert.ok(liveInterceptor.telegraphTick != null, 'live interceptor kill was announced');
  assert.ok(liveRanged.telegraphTick != null, 'live ranged kill was announced');
  const liveInterceptorLeadMs = Math.round((liveInterceptor.deaths[0].tick - liveInterceptor.telegraphTick) * TICK_MS);
  const liveRangedLeadMs = Math.round((liveRanged.deaths[0].tick - liveRanged.telegraphTick) * TICK_MS);
  console.log(`PQ-161.01 live interceptor lead=${liveInterceptorLeadMs} ms firstFire=${liveInterceptor.firstFireTick} telegraphTick=${liveInterceptor.telegraphTick} deathTick=${liveInterceptor.deaths[0].tick}`);
  console.log(`PQ-161.01 live ranged lead=${liveRangedLeadMs} ms firstFire=${liveRanged.firstFireTick} telegraphTick=${liveRanged.telegraphTick} deathTick=${liveRanged.deaths[0].tick}`);
  // The done-when window in player units: the killing blow lands 0.5-1 s after its announcement.
  assert.ok(liveInterceptorLeadMs >= 500 && liveInterceptorLeadMs <= 1000,
    `live interceptor lead ${liveInterceptorLeadMs} ms is outside the 0.5-1 s window`);
  assert.ok(liveRangedLeadMs >= 500 && liveRangedLeadMs <= 1000,
    `live ranged lead ${liveRangedLeadMs} ms is outside the 0.5-1 s window`);

  const deaths = [];
  const telegraphs = [];

  function ingest(label, run, enrich) {
    for (const tg of run.telegraphs) {
      telegraphs.push({
        ...tg,
        route: label,
        entityId: tg.entityId != null ? `${label}:${tg.entityId}` : tg.entityId,
        mineId: tg.mineId != null ? `${label}:${tg.mineId}` : tg.mineId,
        actorId: tg.actorId != null ? `${label}:${tg.actorId}` : tg.actorId,
        sourceId: tg.sourceId != null ? `${label}:${tg.sourceId}` : tg.sourceId,
        ownerId: tg.ownerId != null ? `${label}:${tg.ownerId}` : tg.ownerId,
        ...(enrich ? enrich(tg) : {}),
      });
    }
    for (const death of run.deaths) {
      deaths.push({
        ...death,
        route: label,
        killerId: death.killerId != null ? `${label}:${death.killerId}` : death.killerId,
        mineId: death.mineId != null ? `${label}:${death.mineId}` : death.mineId,
      });
    }
  }

  // Mine rows carry the production arm window from the placed mine entity: the wake cue is lit from
  // placement until trigger, so telemetry correlation may know how long it stayed live.
  ingest('mine_default_2s', mineDefault, (tg) => {
    if (leftoverTelegraphKind(tg) !== 'wake_mines') return {};
    const armTicks = Math.round((mineDefault.mine.data.armedAt - mineDefault.mine.data.placedAt) * 60);
    return { durationTicks: armTicks };
  });
  ingest('mine_arm_0.5s', mineHalf, (tg) => {
    if (leftoverTelegraphKind(tg) !== 'wake_mines') return {};
    const armTicks = Math.round((mineHalf.mine.data.armedAt - mineHalf.mine.data.placedAt) * 60);
    return { durationTicks: armTicks };
  });
  ingest('live_doctrine_interceptor', liveInterceptor);
  ingest('live_doctrine_ranged', liveRanged);

  const stats = pairDeaths(deaths, telegraphs);
  console.log(`PQ-161.01 deaths preceded by a telegraph: ${stats.preceded}/${stats.total} = ${stats.percent}% (seed ${SEED}, need >= 90%)`);
  for (const row of stats.rows) {
    const lead = row.match ? row.match.leadTicks : null;
    const leadMs = lead == null ? '-' : Math.round(lead * TICK_MS);
    console.log(`PQ-161.01 death route=${row.death.route} tick=${row.death.tick} killer=${row.death.killerId} preceded=${!!row.match} lead=${lead} ticks (${leadMs} ms) kind=${row.match ? row.match.kind : '-'}`);
  }
  console.log(`PQ-161.01 mine_default telegraphs=${mineDefault.telegraphs.length} deaths=${mineDefault.deaths.length} firstTelegraphTick=${mineDefault.telegraphs[0] && mineDefault.telegraphs[0].tick}`);
  console.log(`PQ-161.01 mine_0.5s telegraphs=${mineHalf.telegraphs.length} deaths=${mineHalf.deaths.length}`);

  assert.ok(stats.total >= 1, 'leftover lethal route produced at least one player:death');
  assert.ok(stats.total >= 4, 'four lethal routes produced deaths');
  assert.ok(
    stats.percent >= 90,
    `done-when: >=90% of deaths preceded by a telegraph, got ${stats.preceded}/${stats.total} = ${stats.percent}%`,
  );
  for (const row of stats.rows) {
    assert.ok(row.match, `route ${row.death.route} died with no preceding telegraph`);
    assert.ok(
      row.match.leadTicks >= TELEGRAPH_PAIR_MIN_TICKS,
      `route ${row.death.route} lead ${row.match.leadTicks} ticks < 0.5 s floor`,
    );
  }

  const sameBreath = pairLeftoverDeathTelegraph(
    { tick: 10, killerId: 2 },
    [{ tick: 10, entityId: 2, kind: 'engine_flare' }],
  );
  assert.equal(sameBreath, null, 'same-tick telegraph+death must not pair');

  const windowHit = pairLeftoverDeathTelegraph(
    { tick: 40, killerId: 2 },
    [{ tick: 10, entityId: 2, kind: 'engine_flare' }],
  );
  assert.ok(windowHit, '30-tick leftover lead must pair');
  assert.equal(windowHit.leadTicks, 30);
  assert.ok(windowHit.leadTicks >= TELEGRAPH_PAIR_MIN_TICKS);
  assert.ok(windowHit.leadTicks <= TELEGRAPH_PAIR_MAX_TICKS);

  const tooEarly = pairLeftoverDeathTelegraph(
    { tick: 130, killerId: 2 },
    [{ tick: 10, entityId: 2, kind: 'engine_flare' }],
  );
  assert.equal(tooEarly, null, '120-tick leftover pulse lead is outside the 0.5-1s window');

  const continuousLit = pairLeftoverDeathTelegraph(
    { tick: 121, mineId: 7 },
    [{ tick: 0, mineId: 7, kind: 'wake_mines', durationTicks: 120 }],
  );
  assert.ok(continuousLit, 'a mine cue still lit in the final second pairs even 2s after placement');
  assert.equal(continuousLit.leadTicks, 121);
  assert.ok(continuousLit.leadTicks >= TELEGRAPH_PAIR_MIN_TICKS, 'continuous announcement still clears the 0.5s floor');

  const continuousStale = pairLeftoverDeathTelegraph(
    { tick: 400, mineId: 7 },
    [{ tick: 0, mineId: 7, kind: 'wake_mines', durationTicks: 120 }],
  );
  assert.equal(continuousStale, null, 'a continuous cue that expired long before the death does not pair');
});

test('PQ-161.01: threatHalo paints one leftover cue then expires', () => {
  const mock = mockDocument();
  const oldDoc = globalThis.document;
  globalThis.document = mock.document;
  try {
    const root = mock.document.createElement('div');
    const listeners = new Map();
    const bus = {
      on(name, fn) {
        let set = listeners.get(name);
        if (!set) { set = new Set(); listeners.set(name, set); }
        set.add(fn);
        return () => set.delete(fn);
      },
      emit(name, payload) {
        for (const fn of listeners.get(name) || []) fn(payload);
      },
    };
    const halo = createThreatHalo(root, bus);
    const player = { id: 'player', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
    const hostile = {
      id: 'reaver',
      type: 'ship',
      team: 1,
      alive: true,
      pos: { x: 800, z: 0 },
      data: { encounter: true, role: 'customs' },
      factionId: 'faction_reach',
    };
    assert.ok(isHostileToPlayer(hostile, player.team, { playerId: player.id }));

    const pulseKinds = ['engine_flare', 'weapon_charge'];
    const continuousKinds = ['attach_spool', 'wake_mines'];

    for (const kind of pulseKinds) {
      const state = {
        tick: 10,
        simTime: 10 / 60,
        playerId: player.id,
        entityList: [player, hostile],
      };
      bus.emit('ai:telegraph', {
        entityId: hostile.id,
        mineId: null,
        kind,
        durationTicks: TELEGRAPH_CUE_TICKS,
        tick: 10,
        targetId: player.id,
      });
      halo.update(player, state, offscreenWorldToScreen);
      const slotted = mock.elements.filter((el) => (
        el.style.display === 'block' && el.attributes['data-telegraph-kind'] === kind
      ));
      assert.ok(slotted.length >= 1, `hostile slot must carry leftover ${kind}`);
      assert.ok(slotted.some((el) => String(el.className).includes('sf-threat-halo__slot--telegraph')),
        `${kind} slot keeps the telegraph class`);
      assert.equal(slotted[0].attributes['data-force-channel'], forceChannelForTelegraphKind(kind));
      assert.equal(slotted[0].attributes['data-faction'], 'faction_reach',
        'faction identity and force kind stay two channels on the same slot');

      const expired = {
        tick: 10 + TELEGRAPH_CUE_TICKS + 1,
        simTime: (10 + TELEGRAPH_CUE_TICKS + 1) / 60,
        playerId: player.id,
        entityList: [player, hostile],
      };
      halo.update(player, expired, offscreenWorldToScreen);
      const still = mock.elements.filter((el) => (
        el.style.display === 'block' && el.attributes['data-telegraph-kind'] === kind
      ));
      assert.equal(still.length, 0, `${kind} cue expires after one leftover window`);
    }

    // Retargeted: continuous hazards (wake_mines / attach_spool) stay lit from placement to
    // trigger instead of pulsing once. A 2 s mine arm (120 ticks) must still paint after the
    // leftover 30-tick pulse window, then expire when that duration ends.
    for (const kind of continuousKinds) {
      assert.equal(CONTINUOUS_TELEGRAPH_KINDS.has(kind), true, `${kind} is a continuous hazard`);
      const durationTicks = 120;
      const state = {
        tick: 10,
        simTime: 10 / 60,
        playerId: player.id,
        entityList: [player, hostile],
      };
      bus.emit('ai:telegraph', {
        entityId: hostile.id,
        mineId: kind === 'wake_mines' ? 'mine_1' : null,
        kind,
        durationTicks,
        tick: 10,
        targetId: player.id,
      });
      halo.update(player, state, offscreenWorldToScreen);
      const slotted = mock.elements.filter((el) => (
        el.style.display === 'block' && el.attributes['data-telegraph-kind'] === kind
      ));
      assert.ok(slotted.length >= 1, `hostile slot must carry leftover ${kind}`);
      assert.equal(slotted[0].attributes['data-force-channel'], forceChannelForTelegraphKind(kind));
      assert.equal(slotted[0].attributes['data-faction'], 'faction_reach');

      const stillArmed = {
        tick: 10 + TELEGRAPH_CUE_TICKS + 1,
        simTime: (10 + TELEGRAPH_CUE_TICKS + 1) / 60,
        playerId: player.id,
        entityList: [player, hostile],
      };
      halo.update(player, stillArmed, offscreenWorldToScreen);
      const still = mock.elements.filter((el) => (
        el.style.display === 'block' && el.attributes['data-telegraph-kind'] === kind
      ));
      assert.ok(still.length >= 1, `${kind} stays lit past the leftover 30-tick pulse`);

      const expired = {
        tick: 10 + durationTicks + 1,
        simTime: (10 + durationTicks + 1) / 60,
        playerId: player.id,
        entityList: [player, hostile],
      };
      halo.update(player, expired, offscreenWorldToScreen);
      const gone = mock.elements.filter((el) => (
        el.style.display === 'block' && el.attributes['data-telegraph-kind'] === kind
      ));
      assert.equal(gone.length, 0, `${kind} cue expires when the continuous duration ends`);
    }

    halo.destroy();
  } finally {
    globalThis.document = oldDoc;
  }
});

test('PQ-161.01: leftover mine harvest marks the owner slot without a same-breath death', () => {
  const mock = mockDocument();
  const oldDoc = globalThis.document;
  globalThis.document = mock.document;
  try {
    const t = leftoverMineDeath({ seed: SEED + 2, armDelayS: 0.5, maxTicks: 1 });
    const root = mock.document.createElement('div');
    const halo = createThreatHalo(root);
    const player = t.player;
    player.team = 0;
    const owner = t.owner;
    owner.pos = { x: 800, z: 0 };
    const state = {
      tick: t.state.tick | 0,
      simTime: t.state.simTime,
      playerId: player.id,
      entityList: [player, owner, t.mine],
    };
    halo.update(player, state, offscreenWorldToScreen);
    const mineSlots = mock.elements.filter((el) => el.attributes['data-telegraph-kind'] === 'wake_mines');
    assert.ok(mineSlots.length >= 1, 'leftover unarmed mine harvest paints wake_mines on the hostile slot');
    assert.equal(t.deaths.length, 0, 'harvest is not a death inject');

    const later = {
      tick: (t.state.tick | 0) + TELEGRAPH_CUE_TICKS + 1,
      simTime: t.state.simTime + (TELEGRAPH_CUE_TICKS + 1) / 60,
      playerId: player.id,
      entityList: [player, owner, t.mine],
    };
    halo.update(player, later, offscreenWorldToScreen);
    const stillMine = mock.elements.filter((el) => (
      el.style.display === 'block' && el.attributes['data-telegraph-kind'] === 'wake_mines'
    ));
    assert.ok(stillMine.length >= 1, 'harvested mine stays lit past the leftover 30-tick pulse');
    halo.destroy();
  } finally {
    globalThis.document = oldDoc;
  }
});

test('PQ-161.01: live HUD binds leftover ai:telegraph and paints the leftover class', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const hudSrc = readFileSync(join(here, '../src/ui/hud.js'), 'utf8');
  const hudStyles = readFileSync(join(here, '../src/ui/views/hudStyles.js'), 'utf8');
  const orbital = readFileSync(join(here, '../styles/orbital.css'), 'utf8');
  assert.match(hudSrc, /createThreatHalo\(root,\s*ctx\.bus\)/,
    'default HUD must pass the leftover bus so doctrine ai:telegraph paints');
  assert.match(hudStyles, /sf-threat-halo__slot--telegraph/,
    'injected HUD CSS must style the leftover telegraph class');
  assert.match(orbital, /#hud \.sf-threat-halo__slot--telegraph/,
    'Orbital overlay must keep the leftover telegraph cue visible');
});

// The done-when clause: death-cause telemetry shows >=90% of deaths preceded by a telegraph. This
// measures the LIVE instrument (src/systems/telemetry.js) over real simulation kills on two fixed
// seeds. Every route runs the production weapon/mine chain into combat; no routeDamage is injected.
test('PQ-161.01: death-cause telemetry pairs the live mix with its telegraphs', async () => {
  const baseSeeds = [SEED, 17011];
  const routes = [];
  for (const seed of baseSeeds) {
    routes.push(await realDoctrineDeath(CombatDoctrineId.INTERCEPTOR_FLYBY, 110, { seed, telemetry: true }));
    routes.push(await realDoctrineDeath(CombatDoctrineId.RANGED_DISENGAGER, 301, {
      seed: seed + 3, maxTicks: 420, telemetry: true,
    }));
    routes.push(leftoverMineDeath({ seed, telemetry: true }));
    routes.push(leftoverMineDeath({ seed: seed + 1, armDelayS: 0.5, maxTicks: 90, telemetry: true }));
  }

  let preceded = 0;
  let total = 0;
  for (const run of routes) {
    assert.ok(run.telemetry, 'every live route must carry the telemetry instrument');
    const stats = run.telemetry.getSessionStats();
    const coverage = run.telemetry.getTelegraphCoverage();
    preceded += coverage.preceded;
    total += coverage.total;
    for (const d of stats.deathLog) {
      const lead = d.telegraphLeadTicks == null ? '-' : d.telegraphLeadTicks;
      console.log(`PQ-161.01 telemetry death route=${run.combatDoctrineId || 'mine'} cause=${d.cause} telegraphed=${d.telegraphed} kind=${d.telegraphKind || '-'} lead=${lead}`);
    }
    console.log(`PQ-161.01 telemetry route=${run.combatDoctrineId || 'mine'} preceded=${coverage.preceded}/${coverage.total} = ${coverage.percent}%`);
    run.telemetry.dispose();
  }
  const percent = total === 0 ? 0 : Math.round((preceded / total) * 1000) / 10;
  console.log(`PQ-161.01 live-mix death-cause telemetry: ${preceded}/${total} = ${percent}% (seeds ${baseSeeds.join(',')}, need >= 90%)`);
  assert.ok(total >= 8, `live mix must record at least eight player deaths across two seeds, got ${total}`);
  assert.ok(
    percent >= 90,
    `done-when: >=90% of live-mix deaths preceded by a telegraph, got ${preceded}/${total} = ${percent}%`,
  );
});
