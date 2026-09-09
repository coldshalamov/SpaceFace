import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ContactKind } from '../src/ai/contracts.js';
import { CombatDoctrineId, DOCTRINE_TELEGRAPH_TICKS } from '../src/ai/combatDoctrine.js';
import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../src/ai/doctrine.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { mines, MINE_TELEGRAPH_CUE, MINE_BLAST_DAMAGE } from '../src/systems/mines.js';
import { combat } from '../src/systems/combat.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';
import {
  createThreatHalo,
  leftoverTelegraphKind,
  pairLeftoverDeathTelegraph,
  LEFTOVER_TELEGRAPH_KINDS,
  TELEGRAPH_CUE_TICKS,
  TELEGRAPH_PAIR_MIN_TICKS,
  TELEGRAPH_PAIR_MAX_TICKS,
} from '../src/ui/threatHalo.js';

const SEED = 16101;

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

function bootMineCombat(seed = SEED) {
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
  return { sim, state, bus, player, telegraphs, deaths, minesSys: sim.registry.get('mines') };
}

function leftoverMineDeath(opts = {}) {
  const t = bootMineCombat(opts.seed || SEED);
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

function doctrineState(combatDoctrineId, targetX) {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: targetX, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 14,
    hull: 6,
    hullMax: 80,
    shield: 0,
    shieldMax: 0,
    armorHp: 0,
    armorMax: 0,
    flags: {},
    data: { defId: 'ship_kestrel' },
  };
  const npc = {
    id: 2,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 12,
    hull: 100,
    hullMax: 100,
    cap: 100,
    capMax: 100,
    flags: {},
    data: {
      encounter: true,
      ai: {
        squadId: `pq161_${combatDoctrineId}`,
        doctrine: 'scavenger',
        activity: normalizeActivity({
          kind: ActivityKind.ATTACK_RUN,
          reason: `pq161:${combatDoctrineId}`,
          anchor: { x: 0, z: 0 },
          leashRadius: 1200,
          startedTick: 0,
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
      weapons: [{ defId: 'fixture_laser', projSpeed: 420, dmg: 40, dps: 40, rof: 2 }],
      combat: { targetId: player.id },
      intent: {},
    },
  };
  return {
    tick: 0,
    simTime: 0,
    mode: 'flight',
    playerId: 1,
    meta: { seed: SEED },
    settings: { gameplay: { difficulty: 'standard' } },
    player: { heat: 0, insurance: { rate: 0.6, deductibleCr: 500, insuredModules: false, lastStationId: 'station_helios' } },
    entities: new Map([[1, player], [2, npc]]),
    entityList: [player, npc],
    combat: { trace: { events: [] } },
  };
}

function leftoverDoctrineDeath(combatDoctrineId, targetX, ticks = 120) {
  const state = doctrineState(combatDoctrineId, targetX);
  const telegraphs = [];
  const deaths = [];
  const starts = [];
  const bus = {
    on(name, fn) {
      this._l = this._l || new Map();
      let set = this._l.get(name);
      if (!set) { set = new Set(); this._l.set(name, set); }
      set.add(fn);
      return () => set.delete(fn);
    },
    emit(name, payload) {
      if (name === 'ai:telegraph') {
        telegraphs.push({
          ...payload,
          tick: Number.isInteger(payload.tick) ? payload.tick : state.tick,
        });
      }
      if (name === 'player:death') {
        deaths.push({
          tick: state.tick | 0,
          killerId: payload.killerId != null ? payload.killerId : payload.attackerId,
          mineId: null,
        });
      }
      const set = this._l && this._l.get(name);
      if (!set) return;
      for (const fn of [...set]) fn(payload);
    },
  };
  combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  const tacticalAI = createTacticalAISystem({
    seed: SEED,
    sensors: {
      frameFor(_entityId, tick) {
        const npc = state.entities.get(2);
        const player = state.entities.get(1);
        return {
          tick,
          self: {
            id: npc.id,
            team: npc.team,
            pos: { ...npc.pos },
            vel: { ...npc.vel },
            rot: npc.rot,
            radius: npc.radius,
            hullFraction: 1,
            energyFraction: 1,
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
          id: 2,
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
        starts.push({ entityId, actionId, tick: request.tick });
        return { entityId, actionId, startedTick: request.tick };
      },
      status(_entityId, handle) {
        return state.tick - (handle && handle.startedTick || state.tick) >= 2 ? 'completed' : 'running';
      },
      interrupt() { return true; },
    }),
    config: {
      runtime: { decisionIntervalTicks: 1 },
      trace: { enabled: false },
      squad: { minTacticTicks: 1 },
      behavior: { minCommitTicks: 1, switchMargin: 0 },
      utility: { minCommitTicks: 1, switchMargin: 0 },
    },
  });
  tacticalAI.init({ state, bus, helpers: {} });

  let firstFireTick = null;
  let routedAfterTelegraph = false;
  for (let tick = 0; tick < ticks && deaths.length === 0; tick++) {
    state.tick = tick;
    state.simTime = tick / 60;
    tacticalAI.update(SIM_DT, state);
    const npc = state.entities.get(2);
    const firing = !!(npc.data.intent && npc.data.intent.fire);
    if (firing && firstFireTick == null) firstFireTick = tick;
    const telegraphTick = telegraphs.length ? telegraphs[0].tick : null;
    if (firing && telegraphTick != null && tick - telegraphTick >= TELEGRAPH_PAIR_MIN_TICKS && !routedAfterTelegraph) {
      routedAfterTelegraph = true;
      combat.ensureKernel().routeDamage({
        attackerId: npc.id,
        targetId: state.playerId,
        packet: scalarHitToDamagePacket({
          damage: 80,
          damageType: 'thermal',
          pos: state.entities.get(1).pos,
          source: { kind: 'weapon', id: 'fixture_laser', weaponId: 'fixture_laser' },
        }),
        origin: { kind: 'weapon', id: 'fixture_laser' },
      });
    }
  }

  return { state, telegraphs, deaths, firstFireTick, starts, combatDoctrineId };
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
});

test('PQ-161.01: leftover lethal pairing on seed 16101', () => {
  const mineDefault = leftoverMineDeath({ seed: SEED });
  const mineHalf = leftoverMineDeath({ seed: SEED + 1, armDelayS: 0.5, maxTicks: 90 });
  const interceptor = leftoverDoctrineDeath(CombatDoctrineId.INTERCEPTOR_FLYBY, 190, 120);
  const ranged = leftoverDoctrineDeath(CombatDoctrineId.RANGED_DISENGAGER, 620, 140);

  const deaths = [];
  const telegraphs = [];

  function ingest(label, run) {
    for (const tg of run.telegraphs) telegraphs.push({ ...tg, route: label });
    for (const death of run.deaths) deaths.push({ ...death, route: label });
  }
  ingest('mine_default_2s', mineDefault);
  ingest('mine_arm_0.5s', mineHalf);
  ingest('doctrine_interceptor', interceptor);
  ingest('doctrine_ranged', ranged);

  const stats = pairDeaths(deaths, telegraphs);
  console.log(`PQ-161.01 leftover preceded/total/percent: ${stats.preceded}/${stats.total}/${stats.percent}`);
  for (const row of stats.rows) {
    const lead = row.match ? row.match.leadTicks : null;
    console.log(`PQ-161.01 death route=${row.death.route} tick=${row.death.tick} killer=${row.death.killerId} preceded=${!!row.match} lead=${lead}`);
  }
  console.log(`PQ-161.01 mine_default telegraphs=${mineDefault.telegraphs.length} deaths=${mineDefault.deaths.length} firstTelegraphTick=${mineDefault.telegraphs[0] && mineDefault.telegraphs[0].tick}`);
  console.log(`PQ-161.01 mine_0.5s telegraphs=${mineHalf.telegraphs.length} deaths=${mineHalf.deaths.length}`);
  console.log(`PQ-161.01 interceptor telegraphs=${interceptor.telegraphs.length} deaths=${interceptor.deaths.length} firstFire=${interceptor.firstFireTick}`);
  console.log(`PQ-161.01 ranged telegraphs=${ranged.telegraphs.length} deaths=${ranged.deaths.length} firstFire=${ranged.firstFireTick}`);

  assert.ok(mineDefault.telegraphs.some((tg) => leftoverTelegraphKind(tg) === 'wake_mines'),
    'leftover placeMine emits wake_mines');
  assert.ok(mineDefault.deaths.length >= 1, 'leftover default mine blast must be able to kill a thin hull');
  assert.ok(stats.total >= 1, 'leftover lethal route produced at least one player:death');

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
  assert.equal(tooEarly, null, '120-tick leftover mine-style lead is outside the 0.5–1s window');
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

    const kinds = ['engine_flare', 'weapon_charge', 'attach_spool', 'wake_mines'];
    for (const kind of kinds) {
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
