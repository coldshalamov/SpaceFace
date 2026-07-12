/**
 * Mechanical contract: law / security escalation packet.
 *
 * Covers ambient pirate neutrality vs toll parley, player-attack self-defense and
 * protected withdrawal, station-jurisdiction incident response (including same-team
 * patrol vs pirate), incident stand-down receipts, authored zone_hostile preservation,
 * and seed-stable event-tape determinism.
 *
 * Read-only against production. Root implementer owns lawSecurity / engagementAuthority /
 * scanner / pirateParley / registry. This file is the only intentional write.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  authorizeAIEngagement,
  isHostileForAI,
  protectedStationAt,
} from '../src/ai/engagementAuthority.js';
import { RulesOfEngagement, ActivityKind } from '../src/ai/doctrine.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';
import { lawSecurity, AMBIENT_TOLL_VALUE_FLOOR, LAW_SECURITY_VERSION } from '../src/systems/lawSecurity.js';
import { cargo } from '../src/systems/cargo.js';
import { pirateParley } from '../src/systems/pirateParley.js';
import { voiceArbiter } from '../src/ui/voiceArbiter.js';

const SEED = 4242;
const HELIOS_SECTOR = 'sector_helios_prime';
const LOW_SEC_SECTOR = 'sector_tethys_junction';
const RESPONSE_GRACE_S = 6;
const RESPONSE_CLEARANCE = 320;

// ── determinism guards ──────────────────────────────────────────────────────────

function withForbiddenNondeterminism(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => {
    throw new Error('Math.random forbidden in law-security-escalation path');
  };
  Date.now = () => {
    throw new Error('Date.now forbidden in law-security-escalation path');
  };
  try {
    return fn();
  } finally {
    Math.random = random;
    Date.now = now;
  }
}

// ── fixtures ────────────────────────────────────────────────────────────────────

function systemsForEscalation() {
  // Prefer the live packet systems; order matches registry intent but stays resilient
  // if a dependency's init is a no-op for these fixtures.
  return [lawSecurity, cargo, pirateParley, voiceArbiter].filter(Boolean);
}

/**
 * @param {{
 *   seed?: number,
 *   sectorId?: string,
 *   security?: number,
 *   cargoItems?: Record<string, number>,
 *   playerPos?: {x:number,z:number},
 *   station?: boolean | { stationId?: string, factionId?: string, pos?: {x:number,z:number}, dockRadius?: number },
 * }} [opts]
 */
function boot(opts = {}) {
  const seed = opts.seed ?? SEED;
  const sectorId = opts.sectorId ?? HELIOS_SECTOR;
  const security = Number.isFinite(opts.security) ? opts.security : 0.9;
  const sim = createSimulation({ seed, systems: systemsForEscalation() });
  const { state, bus } = sim;

  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  if (!state.world.sectors) state.world.sectors = {};
  state.world.sectors[sectorId] = {
    id: sectorId,
    factionId: sectorId === HELIOS_SECTOR ? 'faction_scn' : 'faction_reach',
    security,
    tier: security <= 0.5 ? 2 : 0,
  };
  if (state.player) {
    state.player.heat = 0;
    if (!state.player.cargo) state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 200, capMass: 200 };
  }

  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { ...(opts.playerPos || { x: 80, z: 0 }) },
    hull: 200,
    hullMax: 200,
    radius: 8,
  });
  state.playerId = player.id;

  const items = opts.cargoItems ? { ...opts.cargoItems } : {};
  state.player.cargo.items = items;
  const cargoSys = sim.registry.get('cargo');
  if (cargoSys && typeof cargoSys.recompute === 'function') cargoSys.recompute();

  let station = null;
  if (opts.station !== false) {
    const st = typeof opts.station === 'object' && opts.station ? opts.station : {};
    station = sim.spawn({
      type: 'station',
      team: 2,
      factionId: st.factionId || 'faction_scn',
      pos: { ...(st.pos || { x: 0, z: 0 }) },
      radius: 42,
      data: {
        stationId: st.stationId || 'station_helios',
        dockRadius: st.dockRadius ?? 72,
        factionId: st.factionId || 'faction_scn',
      },
    });
  }

  const log = {
    receipts: [],
    encounterReceipts: [],
    incidentsOpened: [],
    incidentsResolved: [],
    distressRaised: [],
    dispatchStarted: [],
    parleyStarted: [],
    parleyDemand: [],
    parleyResolved: [],
    parleyVoice: [],
    toasts: [],
  };
  bus.on('law:incidentReceipt', (p) => log.receipts.push(clone(p)));
  bus.on('encounter:receipt', (p) => log.encounterReceipts.push(clone(p)));
  bus.on('law:incidentOpened', (p) => log.incidentsOpened.push(clone(p)));
  bus.on('law:incidentResolved', (p) => log.incidentsResolved.push(clone(p)));
  bus.on('law:distressRaised', (p) => log.distressRaised.push(clone(p)));
  bus.on('law:dispatchStarted', (p) => log.dispatchStarted.push(clone(p)));
  bus.on('pirateParley:started', (p) => log.parleyStarted.push(clone(p)));
  bus.on('pirateParley:demand', (p) => log.parleyDemand.push(clone(p)));
  bus.on('pirateParley:resolved', (p) => log.parleyResolved.push(clone(p)));
  bus.on('pirateParley:voice', (p) => log.parleyVoice.push(clone(p)));
  bus.on('toast', (p) => log.toasts.push(clone(p)));

  return { sim, state, bus, player, station, log, seed, sectorId };
}

function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

function spawnPirate(sim, {
  pos = { x: 200, z: 40 },
  team = 1,
  factionId = 'faction_reach',
  spawnContext = 'ambient',
  doctrine = null,
  squadId = null,
  archetype = 'pirate_raider',
  lawful = false,
  passive = false,
  extras = {},
} = {}) {
  const ai = {
    archetype,
    spawnContext,
    lawful: !!lawful,
    passive: !!passive,
    sectorSecurity: sim.state.world?.sectors?.[sim.state.world.currentSectorId]?.security,
    ...extras,
  };
  if (doctrine != null) ai.doctrine = doctrine;
  if (squadId != null) ai.squadId = squadId;
  return sim.spawn({
    type: 'ship',
    team,
    factionId,
    pos: { ...pos },
    hull: 90,
    hullMax: 90,
    radius: 6,
    data: {
      ai,
      intent: { moveX: 0, moveZ: 0, fire: false },
      combat: {},
    },
  });
}

function spawnLawfulPatrol(sim, {
  pos = { x: 180, z: -30 },
  team = 1,
  factionId = 'faction_scn',
} = {}) {
  return sim.spawn({
    type: 'ship',
    team,
    factionId,
    pos: { ...pos },
    hull: 140,
    hullMax: 140,
    radius: 7,
    data: {
      trafficRole: 'patrol',
      ai: {
        lawful: true,
        archetype: 'patrol_lawman',
        spawnContext: 'patrol',
        motive: 'law_enforcement',
        engagementTrigger: 'wanted_status',
        zoneId: 'zone_helios_core',
        approachTelegraph: 'patrol_challenge',
        noFireResponseWindowS: 1,
        combatDoctrineId: 'interceptor_flyby',
        roe: RulesOfEngagement.LAWFUL_WANTED_ONLY,
        passive: false,
      },
      intent: { fire: false },
      combat: {},
    },
  });
}

function stepSeconds(sim, seconds) {
  sim.runTicks(Math.max(1, Math.ceil(seconds / SIM_DT)));
}

function emitDamage(bus, { attackerId, targetId, applied = 12 }) {
  bus.emit('combat:damage', {
    attackerId,
    targetId,
    applied,
    amount: applied,
    kind: 'kinetic',
  });
}

function entity(state, e) {
  return state.entities.get(e.id);
}

function lawOwn(state) {
  return state.lawSecurity || { incidents: {}, receipts: [] };
}

function incidentSnapshot(state) {
  const own = lawOwn(state);
  const keys = Object.keys(own.incidents || {}).sort();
  return keys.map((k) => {
    const inc = own.incidents[k];
    return {
      key: k,
      id: inc.id,
      stationId: inc.stationId,
      attackerId: inc.attackerId,
      victimId: inc.victimId,
      cause: inc.cause,
      status: inc.status,
      responderIds: [...(inc.responderIds || [])].sort((a, b) => a - b),
    };
  });
}

function receiptTape(state, log) {
  const own = lawOwn(state);
  return {
    stateReceipts: (own.receipts || []).map((r) => ({
      cause: r.cause,
      outcome: r.outcome,
      attackerId: r.attackerId,
      targetId: r.targetId,
      stationId: r.stationId ?? null,
      text: r.text,
      tick: r.tick,
    })),
    busReceipts: log.receipts.map((r) => ({
      cause: r.cause,
      outcome: r.outcome,
      attackerId: r.attackerId,
      targetId: r.targetId,
      stationId: r.stationId ?? null,
      text: r.text,
      tick: r.tick,
    })),
    encounterReceipts: log.encounterReceipts.map((r) => ({
      encounterId: r.encounterId,
      shape: r.shape,
      outcome: r.outcome,
      text: r.text,
    })),
    incidents: incidentSnapshot(state),
  };
}

// ── 1. Ambient empty-hold pirate → passive / hold-fire / not scanner-hostile ───

test('1. ambient non-lawful pirate near lawful station with empty hold is passive hold-fire and not scanner-hostile', () => {
  withForbiddenNondeterminism(() => {
    const t = boot({
      sectorId: HELIOS_SECTOR,
      security: 0.95,
      cargoItems: {},
      playerPos: { x: 90, z: 0 },
      station: { stationId: 'station_helios', factionId: 'faction_scn' },
    });
    const pirate = spawnPirate(t.sim, {
      pos: { x: 220, z: 20 },
      spawnContext: 'ambient',
      archetype: 'pirate_raider',
    });
    // entity:spawned stamps immediately; one tick still exercises the ambient scan path.
    stepSeconds(t.sim, SIM_DT);

    const e = entity(t.state, pirate);
    const ai = e.data.ai;
    assert.equal(ai.escalationPolicyVersion, LAW_SECURITY_VERSION, 'ambient policy stamped');
    assert.equal(ai.passive, true, 'empty hold → passive');
    assert.equal(ai.roe, RulesOfEngagement.HOLD_FIRE, 'empty hold → hold_fire');
    assert.equal(ai.motive, 'no_valuable_cargo', 'motive names empty hold');
    assert.equal(ai.engagementTrigger, 'player_attack', 'only player aggression re-arms');
    assert.equal(ai.doctrine, undefined, 'no toll doctrine when hold is empty');
    assert.equal(isHostileToPlayer(e, 0, t.state), false, 'scanner must not mark empty-hold ambient as hostile');
    assert.equal(isHostileForAI(t.state, e, t.player), false, 'AI hostility false while passive ambient');
    t.sim.dispose();
  });
});

// ── 2. Valuable cargo in low-sec → one toll parley; scan/demand before hostility ─

test('2. ambient pirate in low-security space with valuable cargo enters one toll parley before hostility', () => {
  withForbiddenNondeterminism(() => {
    const valuable = { cmdty_refined_metals: 12, cmdty_food: 4 }; // 12*85 = 1020 ≥ floor
    assert.ok(12 * 85 >= AMBIENT_TOLL_VALUE_FLOOR, 'fixture cargo clears ambient toll floor');

    const t = boot({
      sectorId: LOW_SEC_SECTOR,
      security: 0.35,
      cargoItems: valuable,
      playerPos: { x: 0, z: 0 },
      station: false,
    });

    const a = spawnPirate(t.sim, {
      pos: { x: 140, z: 10 },
      spawnContext: 'ambient',
      archetype: 'pirate_raider',
    });
    const b = spawnPirate(t.sim, {
      pos: { x: 160, z: 24 },
      spawnContext: 'ambient',
      archetype: 'pirate_raider',
    });

    // Stamped on spawn: both share one ambient toll squad for the sector/zone.
    const ea = entity(t.state, a);
    const eb = entity(t.state, b);
    assert.equal(ea.data.ai.doctrine, 'toll', 'valuable cargo routes doctrine to toll');
    assert.equal(eb.data.ai.doctrine, 'toll', 'second ambient pirate also stamped toll');
    assert.equal(ea.data.ai.motive, 'cargo_extortion');
    assert.equal(ea.data.ai.engagementTrigger, 'demand_pending');
    assert.equal(
      ea.data.ai.squadId,
      eb.data.ai.squadId,
      'ambient group shares one squad id (single parley voice)',
    );
    assert.match(String(ea.data.ai.squadId), /^ambient_toll:/, 'squad id is ambient_toll namespaced');

    stepSeconds(t.sim, 0.15);
    assert.ok(t.log.parleyStarted.length >= 1, 'parley started after stamp');
    assert.equal(t.log.parleyVoice[0]?.situation, 'scan', 'first voice is scan');
    for (const e of [entity(t.state, a), entity(t.state, b)]) {
      assert.equal(e.data.ai.passive, true, 'scan phase holds fire (passive)');
      assert.equal(isHostileToPlayer(e, 0, t.state), false, 'scan phase is not scanner-hostile');
    }

    stepSeconds(t.sim, 2.2);
    assert.ok(t.log.parleyDemand.length >= 1, 'demand phase reached');
    assert.deepEqual(
      t.log.parleyVoice.map((v) => v.situation).slice(0, 2),
      ['scan', 'demand-cargo'],
      'scan then demand before any hostility flip',
    );
    const demandVoice = t.log.parleyVoice.find((v) => v.situation === 'demand-cargo');
    assert.ok(demandVoice, 'demand-cargo voice emitted');
    assert.match(
      demandVoice.text,
      /Brake to yield|Clear 1200 to run/i,
      'demand tells player how to comply (brake) and escape (clear 1200)',
    );
    const demandToast = t.log.toasts.find((toast) => /Brake to yield|Clear 1200/i.test(String(toast.text || '')));
    assert.ok(demandToast || demandVoice.text, 'compliance/escape instruction is player-facing');

    for (const e of [entity(t.state, a), entity(t.state, b)]) {
      assert.equal(isHostileToPlayer(e, 0, t.state), false, 'demand phase still non-hostile');
      assert.equal(e.data.ai.passive, true, 'demand phase still passive');
    }
    assert.equal(t.log.parleyResolved.length, 0, 'no violence resolution before choice/timeout');
    t.sim.dispose();
  });
});

// ── 3. Player damages non-lawful neutral outside protection → self-defense ──────

test('3. player damage against non-lawful neutral authorizes self-defense outside station protection', () => {
  withForbiddenNondeterminism(() => {
    const t = boot({
      sectorId: LOW_SEC_SECTOR,
      security: 0.4,
      cargoItems: {},
      // Far from any station; no station in scene.
      playerPos: { x: 5000, z: 0 },
      station: false,
    });
    const pirate = spawnPirate(t.sim, {
      pos: { x: 5120, z: 0 },
      spawnContext: 'ambient',
      archetype: 'pirate_raider',
    });
    stepSeconds(t.sim, SIM_DT);
    const before = entity(t.state, pirate);
    assert.equal(before.data.ai.passive, true, 'precondition: ambient empty-hold passive');
    assert.equal(protectedStationAt(t.state, t.player), null, 'precondition: player outside protection');

    emitDamage(t.bus, { attackerId: t.player.id, targetId: pirate.id, applied: 18 });

    const e = entity(t.state, pirate);
    const ai = e.data.ai;
    assert.equal(ai.motive, 'self_defense', 'cause motive is self_defense');
    assert.equal(ai.engagementTrigger, 'player_attack', 'cause trigger is player_attack');
    assert.equal(ai.retaliationTargetId, t.player.id, 'retaliation target is the player');
    assert.equal(ai.passive, false, 'self-defense clears passive');
    assert.equal(ai.roe, RulesOfEngagement.WEAPONS_FREE, 'weapons free after player fires first');
    assert.ok(Number(ai.noFireResponseWindowS) >= 0.5, 'response window is armed');
    assert.equal(e.data.combat.targetId, t.player.id, 'combat target locks the attacker');
    assert.equal(isHostileForAI(t.state, e, t.player), true, 'isHostileForAI true via retaliation');
    assert.equal(isHostileToPlayer(e, 0, t.state), true, 'scanner reads retaliation as hostile');

    const receipt = t.log.receipts.find((r) => r.outcome === 'retaliation_authorized')
      || lawOwn(t.state).receipts.find((r) => r.outcome === 'retaliation_authorized');
    assert.ok(receipt, 'retaliation receipt recorded');
    assert.equal(receipt.cause, 'player_attack');
    assert.match(String(receipt.text), /self-defense|fired first/i);
    t.sim.dispose();
  });
});

// ── 4. Same player attack inside station protection → withdraw, not return fire ─

test('4. player attack inside station protection forces protected withdrawal instead of return fire', () => {
  withForbiddenNondeterminism(() => {
    const t = boot({
      sectorId: HELIOS_SECTOR,
      security: 0.95,
      cargoItems: {},
      playerPos: { x: 100, z: 0 },
      station: { stationId: 'station_helios', factionId: 'faction_scn' },
    });
    const pirate = spawnPirate(t.sim, {
      pos: { x: 240, z: 10 },
      spawnContext: 'ambient',
      archetype: 'pirate_raider',
    });
    stepSeconds(t.sim, SIM_DT);
    assert.ok(protectedStationAt(t.state, t.player), 'precondition: player inside Helios protection');

    emitDamage(t.bus, { attackerId: t.player.id, targetId: pirate.id, applied: 14 });

    const e = entity(t.state, pirate);
    const ai = e.data.ai;
    assert.equal(ai.motive, 'self_defense');
    assert.equal(ai.engagementTrigger, 'player_attack');
    assert.equal(ai.retaliationTargetId, t.player.id, 'retaliation id still names the player for cause audit');
    assert.equal(ai.passive, true, 'withdraws under station guns (passive)');
    assert.equal(ai.roe, RulesOfEngagement.HOLD_FIRE, 'does not return fire under protection');
    assert.equal(ai.activity?.kind, ActivityKind.DISENGAGE, 'activity is disengage/withdraw');
    assert.match(String(ai.activity?.reason || ''), /station_jurisdiction:withdraw/, 'reason cites jurisdiction withdraw');
    assert.notEqual(e.data.combat.targetId, t.player.id, 'combat target cleared / not locked on player');
    assert.equal(isHostileToPlayer(e, 0, t.state), false, 'withdrawn pirate is not scanner-hostile');

    const receipt = t.log.receipts.find((r) => r.outcome === 'protected_withdrawal')
      || lawOwn(t.state).receipts.find((r) => r.outcome === 'protected_withdrawal');
    assert.ok(receipt, 'protected_withdrawal receipt');
    assert.equal(receipt.cause, 'player_attack');
    assert.equal(receipt.stationId, 'station_helios');
    t.sim.dispose();
  });
});

// ── 5. Hostile fire on player in protection → one incident; patrol assigned ─────

test('5. protected hostile fire raises distress, then assigns the nearest patrol after a readable dispatch delay', () => {
  withForbiddenNondeterminism(() => {
    const t = boot({
      sectorId: HELIOS_SECTOR,
      security: 0.95,
      cargoItems: {},
      playerPos: { x: 120, z: 0 },
      station: { stationId: 'station_helios', factionId: 'faction_scn' },
    });
    // Both NPCs intentionally share team 1 — the classic "patrol blind to raider" trap.
    const pirate = spawnPirate(t.sim, {
      pos: { x: 260, z: 30 },
      team: 1,
      spawnContext: 'ambient',
      archetype: 'pirate_raider',
    });
    const patrol = spawnLawfulPatrol(t.sim, {
      pos: { x: 200, z: -40 },
      team: 1,
      factionId: 'faction_scn',
    });
    stepSeconds(t.sim, SIM_DT);

    assert.equal(entity(t.state, pirate).team, entity(t.state, patrol).team, 'precondition: same team id');
    assert.equal(isHostileForAI(t.state, entity(t.state, patrol), entity(t.state, pirate)), false,
      'precondition: not hostile before incident');

    emitDamage(t.bus, { attackerId: pirate.id, targetId: t.player.id, applied: 20 });

    assert.equal(t.log.incidentsOpened.length, 1, 'exactly one incident opened');
    const opened = t.log.incidentsOpened[0];
    assert.equal(opened.cause, 'hostile_fire');
    assert.equal(opened.attackerId, pirate.id);
    assert.equal(opened.stationId, 'station_helios');
    assert.equal(opened.status, 'distress');
    assert.equal(t.log.distressRaised.length, 1, 'distress phase is visible before dispatch');

    const incidents = lawOwn(t.state).incidents;
    const keys = Object.keys(incidents);
    assert.equal(keys.length, 1, 'one live incident record');
    const inc = incidents[keys[0]];
    assert.deepEqual(inc.responderIds, [], 'no responder is armed during the distress phase');
    assert.equal(inc.dispatchAt - inc.startedAt, 1.25, 'maximum-security Helios still preserves a readable ETA');

    let p = entity(t.state, patrol);
    const pirateE = entity(t.state, pirate);
    assert.equal(p.data.ai.securityTargetId, undefined, 'patrol remains neutral before dispatch');
    assert.equal(isHostileForAI(t.state, p, pirateE), false);
    stepSeconds(t.sim, 0.9);
    assert.equal(t.log.dispatchStarted.length, 0, 'dispatch cannot arm early');
    stepSeconds(t.sim, 0.5);

    assert.equal(t.log.dispatchStarted.length, 1, 'dispatch phase begins once ETA elapses');
    p = entity(t.state, patrol);
    const liveIncident = Object.values(lawOwn(t.state).incidents)[0];
    assert.ok(liveIncident.responderIds.includes(patrol.id), 'existing lawful patrol is assigned responder');
    assert.equal(p.data.ai.securityTargetId, pirate.id, 'patrol securityTargetId is the pirate');
    assert.equal(p.data.ai.engagementTrigger, 'security_response');
    assert.equal(p.data.ai.motive, 'jurisdiction_enforcement');
    assert.equal(p.data.combat.targetId, pirate.id, 'patrol combat targets the attacker');

    // Same-team hostility path must open for the named incident target.
    assert.equal(isHostileForAI(t.state, p, pirateE), true, 'isHostileForAI(patrol, pirate) true via securityTargetId');
    assert.equal(isHostileForAI(t.state, pirateE, p), true, 'symmetric hostility via other.securityTargetId');
    // Patrol is not globally hostile to the clean player.
    assert.equal(isHostileToPlayer(p, 0, t.state), false, 'patrol is not scanner-hostile to clean player');

    // Engagement authority: security_response may fire inside protection against dispatched target.
    // Advance past the 1s no-fire window stamped by _authorizeResponder.
    stepSeconds(t.sim, 1.1);
    const auth = authorizeAIEngagement({
      state: t.state,
      self: entity(t.state, patrol),
      target: entity(t.state, pirate),
      tick: t.state.tick,
      objectiveReason: 'combat_doctrine:interceptor_flyby:strike',
    });
    assert.equal(auth.ok, true, `patrol engagement authorized inside jurisdiction: ${auth.reason}`);
    assert.equal(auth.reason, 'authorized');

    // Second damage from the same attacker must not open a second incident.
    emitDamage(t.bus, { attackerId: pirate.id, targetId: t.player.id, applied: 8 });
    assert.equal(Object.keys(lawOwn(t.state).incidents).length, 1, 'damage refresh keeps one incident');
    assert.equal(t.log.incidentsOpened.length, 1, 'no second open event');
    t.sim.dispose();
  });
});

// ── 6. Leave jurisdiction without more damage → resolve + stand-down receipt ───

test('6. leaving station jurisdiction without more damage resolves incident and emits encounter:receipt stand-down', () => {
  withForbiddenNondeterminism(() => {
    const t = boot({
      sectorId: HELIOS_SECTOR,
      security: 0.95,
      cargoItems: {},
      playerPos: { x: 100, z: 0 },
      station: { stationId: 'station_helios', factionId: 'faction_scn' },
    });
    const pirate = spawnPirate(t.sim, {
      pos: { x: 250, z: 0 },
      team: 1,
      spawnContext: 'ambient',
      archetype: 'pirate_raider',
    });
    const patrol = spawnLawfulPatrol(t.sim, {
      pos: { x: 180, z: 40 },
      team: 1,
    });
    stepSeconds(t.sim, SIM_DT);
    emitDamage(t.bus, { attackerId: pirate.id, targetId: t.player.id, applied: 16 });
    assert.equal(Object.keys(lawOwn(t.state).incidents).length, 1, 'incident open');

    const protection = protectedStationAt(t.state, t.player);
    assert.ok(protection, 'protection volume known');
    const clearR = protection.radius + RESPONSE_CLEARANCE + 40;
    // Move attacker well outside jurisdiction ring.
    const pirateE = entity(t.state, pirate);
    pirateE.pos.x = clearR;
    pirateE.pos.z = 0;

    // RESPONSE_GRACE_S (6s) after last damage + incident poll every 15 ticks.
    stepSeconds(t.sim, RESPONSE_GRACE_S + 0.5);

    assert.equal(Object.keys(lawOwn(t.state).incidents).length, 0, 'incident resolved after leave + grace');
    assert.ok(t.log.incidentsResolved.length >= 1, 'law:incidentResolved emitted');
    assert.equal(t.log.incidentsResolved[0].outcome, 'disengaged');

    const standDown = t.log.encounterReceipts.find((r) => r.shape === 'security_response' && r.outcome === 'disengaged');
    assert.ok(standDown, 'encounter:receipt emitted for security stand-down');
    assert.match(
      String(standDown.text),
      /patrol stood down|station ring cleared|CONTACT BROKEN/i,
      'receipt explains patrol stand-down',
    );

    const cleared = entity(t.state, patrol);
    assert.equal(cleared.data.ai.securityTargetId, null, 'responder securityTargetId cleared');
    assert.equal(cleared.data.ai.engagementTrigger, 'wanted_status', 'patrol returns to wanted_status posture');
    t.sim.dispose();
  });
});

// ── 7. Authored off-sanctuary zone_hostile / encounter danger stays aggressive ─

test('7. authored off-sanctuary danger remains aggressive; not converted to ambient neutrality', () => {
  withForbiddenNondeterminism(() => {
    const t = boot({
      sectorId: LOW_SEC_SECTOR,
      security: 0.35,
      cargoItems: {}, // would force ambient empty-hold neutrality if stamp ran
      playerPos: { x: 1400, z: 0 },
      station: false,
    });

    const zoneHostile = spawnPirate(t.sim, {
      pos: { x: 1650, z: 0 },
      spawnContext: 'zone_hostile',
      archetype: 'pirate_raider',
      extras: {
        // Pre-author aggressive combat posture that must survive ambient stamping.
        passive: false,
        motive: 'zone_ambush',
        engagementTrigger: 'zone_entry',
        zoneId: 'zone_ceres_ambush',
        approachTelegraph: 'engine_flare',
        noFireResponseWindowS: 0.75,
        roe: RulesOfEngagement.WEAPONS_FREE,
        forcePlayerTarget: true,
      },
    });
    // Force a combat target so scanner hostility is unambiguous for zone campers.
    entity(t.state, zoneHostile).data.combat.targetId = t.player.id;

    const encounterPirate = spawnPirate(t.sim, {
      pos: { x: 1700, z: 30 },
      spawnContext: 'encounter',
      archetype: 'pirate_raider',
      extras: {
        encounterId: 'enc_named_raid_01',
        passive: false,
        motive: 'scripted_ambush',
        engagementTrigger: 'encounter_phase',
        zoneId: 'enc_named_raid_01',
        approachTelegraph: 'attack_bark',
        noFireResponseWindowS: 0.75,
        forcePlayerTarget: true,
      },
    });
    entity(t.state, encounterPirate).data.combat.targetId = t.player.id;
    entity(t.state, encounterPirate).data.encounter = { id: 'enc_named_raid_01', shapeId: 'pirate_ambush' };

    // Ambient scan interval + a few ticks: stamp must refuse both.
    stepSeconds(t.sim, 1.0);

    const zh = entity(t.state, zoneHostile);
    const en = entity(t.state, encounterPirate);

    assert.notEqual(zh.data.ai.escalationPolicyVersion, LAW_SECURITY_VERSION,
      'zone_hostile is not ambient-stamped into neutrality policy');
    assert.equal(zh.data.ai.passive, false, 'zone_hostile stays non-passive');
    assert.notEqual(zh.data.ai.roe, RulesOfEngagement.HOLD_FIRE, 'zone_hostile not forced hold_fire');
    assert.equal(isHostileToPlayer(zh, 0, t.state), true, 'zone_hostile remains scanner-hostile');

    assert.notEqual(en.data.ai.escalationPolicyVersion, LAW_SECURITY_VERSION,
      'encounter pirate is not ambient-stamped');
    assert.equal(en.data.ai.passive, false, 'encounter pirate stays aggressive');
    assert.equal(isHostileToPlayer(en, 0, t.state), true, 'encounter pirate remains scanner-hostile');
    t.sim.dispose();
  });
});

// ── 8. Same seed + event tape → identical receipts / responder selection ───────

test('8. same seed and event tape produce identical receipts and responder selection', () => {
  withForbiddenNondeterminism(() => {
    function runTape(seed) {
      const t = boot({
        seed,
        sectorId: HELIOS_SECTOR,
        security: 0.95,
        cargoItems: {},
        playerPos: { x: 110, z: 0 },
        station: { stationId: 'station_helios', factionId: 'faction_scn' },
      });
      const pirate = spawnPirate(t.sim, {
        pos: { x: 255, z: 12 },
        team: 1,
        spawnContext: 'ambient',
        archetype: 'pirate_raider',
      });
      const patrolA = spawnLawfulPatrol(t.sim, { pos: { x: 190, z: -50 }, team: 1 });
      const patrolB = spawnLawfulPatrol(t.sim, { pos: { x: 210, z: 55 }, team: 1 });
      stepSeconds(t.sim, SIM_DT);

      // Event tape: one hostile shot on the player inside protection.
      emitDamage(t.bus, { attackerId: pirate.id, targetId: t.player.id, applied: 11 });
      stepSeconds(t.sim, 0.25);

      const tape = {
        seed,
        pirateId: pirate.id,
        patrolIds: [patrolA.id, patrolB.id],
        ...receiptTape(t.state, t.log),
        responderSelection: incidentSnapshot(t.state).map((inc) => ({
          id: inc.id,
          responderIds: inc.responderIds,
          attackerId: inc.attackerId,
          cause: inc.cause,
        })),
        patrolSecurityTargets: [patrolA.id, patrolB.id].map((id) => ({
          id,
          securityTargetId: entity(t.state, { id }).data.ai.securityTargetId ?? null,
        })),
      };
      t.sim.dispose();
      return tape;
    }

    const a = runTape(SEED);
    const b = runTape(SEED);
    assert.deepEqual(a, b, 'identical seed + damage tape → identical receipts and responders');

    // Different seed must be allowed to diverge (control: not a vacuous always-equal).
    const c = runTape(SEED + 17);
    // Incident id is seed-hashed; at least the incident id string should differ when seed differs.
    const idA = a.responderSelection[0]?.id;
    const idC = c.responderSelection[0]?.id;
    assert.ok(idA && idC, 'both seeds open an incident');
    assert.notEqual(idA, idC, 'control: different seed yields different incident id');
  });
});

test('9. high-security reserve response arrives at range and scales to jurisdiction strength', () => {
  withForbiddenNondeterminism(() => {
    const t = boot({
      sectorId: HELIOS_SECTOR,
      security: 0.95,
      playerPos: { x: 100, z: 0 },
      station: { stationId: 'station_helios', factionId: 'faction_scn' },
    });
    const pirate = spawnPirate(t.sim, {
      pos: { x: 260, z: 20 },
      team: 1,
      spawnContext: 'encounter',
      extras: { motive: 'scripted_ambush', engagementTrigger: 'encounter_phase' },
    });
    emitDamage(t.bus, { attackerId: pirate.id, targetId: t.player.id, applied: 20 });
    const incident = Object.values(lawOwn(t.state).incidents)[0];
    assert.equal(incident.responderCap, 3);
    stepSeconds(t.sim, incident.dispatchDelayS + 0.5);
    assert.equal(t.log.dispatchStarted.length, 1);
    const dispatched = t.log.dispatchStarted[0];
    assert.equal(dispatched.responderIds.length, 3, 'maximum-security reserve fields a three-ship response');
    for (const id of dispatched.responderIds) {
      const responder = t.state.entities.get(id);
      assert.ok(responder);
      assert.ok(Math.hypot(responder.pos.x - pirate.pos.x, responder.pos.z - pirate.pos.z) >= 900,
        'reserve responder starts with a visible intercept leg, not adjacent teleportation');
      assert.equal(responder.data.ai.securityTargetId, pirate.id);
      assert.equal(isHostileToPlayer(responder, 0, t.state), false,
        'security response never becomes globally hostile to the neutral player');
    }
    t.sim.dispose();
  });
});

test('10. violence against protected civilians identifies the real NPC or player aggressor', () => {
  withForbiddenNondeterminism(() => {
    const npcCase = boot({ sectorId: HELIOS_SECTOR, security: 0.95, playerPos: { x: 80, z: 0 } });
    const civilian = spawnPirate(npcCase.sim, {
      pos: { x: 180, z: 0 }, team: 2, factionId: 'faction_free', spawnContext: 'convoy_civilian',
      archetype: 'fleeing_trader', passive: true,
    });
    const raider = spawnPirate(npcCase.sim, {
      pos: { x: 260, z: 0 }, team: 1, spawnContext: 'encounter',
      extras: { motive: 'lane_predation', engagementTrigger: 'ambush_sprung' },
    });
    emitDamage(npcCase.bus, { attackerId: raider.id, targetId: civilian.id, applied: 14 });
    assert.equal(npcCase.log.distressRaised.length, 1);
    assert.equal(npcCase.log.distressRaised[0].attackerId, raider.id);
    assert.equal(npcCase.log.distressRaised[0].victimId, civilian.id);
    assert.equal(npcCase.log.distressRaised[0].cause, 'npc_piracy');
    npcCase.sim.dispose();

    const playerCase = boot({ sectorId: HELIOS_SECTOR, security: 0.95, playerPos: { x: 80, z: 0 } });
    const trader = spawnPirate(playerCase.sim, {
      pos: { x: 180, z: 0 }, team: 2, factionId: 'faction_free', spawnContext: 'convoy_civilian',
      archetype: 'fleeing_trader', passive: true,
    });
    emitDamage(playerCase.bus, { attackerId: playerCase.player.id, targetId: trader.id, applied: 14 });
    assert.equal(playerCase.log.distressRaised.length, 1);
    assert.equal(playerCase.log.distressRaised[0].attackerId, playerCase.player.id);
    assert.equal(playerCase.log.distressRaised[0].cause, 'player_piracy');
    playerCase.sim.dispose();
  });
});

test('11. deep lawless violence receives no implausible instant police response', () => {
  withForbiddenNondeterminism(() => {
    const t = boot({
      sectorId: LOW_SEC_SECTOR,
      security: 0.2,
      playerPos: { x: 5000, z: 0 },
      station: false,
    });
    const pirate = spawnPirate(t.sim, {
      pos: { x: 5120, z: 0 }, team: 1, spawnContext: 'encounter',
      extras: { motive: 'lane_predation', engagementTrigger: 'ambush_sprung' },
    });
    emitDamage(t.bus, { attackerId: pirate.id, targetId: t.player.id, applied: 18 });
    stepSeconds(t.sim, 8);
    assert.equal(t.log.distressRaised.length, 0);
    assert.equal(t.log.dispatchStarted.length, 0);
    assert.equal(Object.keys(lawOwn(t.state).incidents).length, 0);
    t.sim.dispose();
  });
});

test('12. an armed raider crossing into Helios sanctuary disarms and withdraws instead of chasing', () => {
  withForbiddenNondeterminism(() => {
    const t = boot({
      sectorId: HELIOS_SECTOR,
      security: 0.98,
      playerPos: { x: 160, z: 0 },
    });
    const raider = spawnPirate(t.sim, {
      pos: { x: 420, z: 0 },
      spawnContext: 'zone_hostile',
      doctrine: 'scavenger',
      squadId: 'sanctuary_intruder',
      extras: {
        motive: 'lane_predation',
        engagementTrigger: 'ambush_sprung',
        zoneId: 'zone_ceres_ambush',
        approachTelegraph: 'engine_flare',
        noFireResponseWindowS: 1,
        combatDoctrineId: 'interceptor_flyby',
        roe: RulesOfEngagement.WEAPONS_FREE,
        forcePlayerTarget: true,
        huntPlayer: true,
        activity: {
          kind: ActivityKind.ATTACK_RUN,
          reason: 'combat_doctrine:interceptor_flyby:strike',
          anchor: { x: 1800, z: 0 },
          leashRadius: 2200,
          startedTick: 0,
          targetId: t.player.id,
        },
      },
    });
    raider.data.combat.targetId = t.player.id;
    raider.data.combat.lockTarget = t.player.id;
    raider.data.intent.fire = true;
    raider.data.intent.fireGroup = 'primary';
    const withdrawals = [];
    const voices = [];
    t.bus.on('law:sanctuaryWithdrawal', (payload) => withdrawals.push(clone(payload)));
    t.bus.on('law:voice', (payload) => voices.push(clone(payload)));
    t.state.lawSecurity.nextAmbientScanTick = (t.state.tick | 0) + 60;

    t.sim.step(SIM_DT);

    assert.equal(raider.data.ai.passive, true, 'station jurisdiction removes the raider from attack rostering');
    assert.equal(raider.data.ai.roe, RulesOfEngagement.HOLD_FIRE, 'withdrawal is weapons-safe');
    assert.equal(raider.data.ai.activity.kind, ActivityKind.DISENGAGE, 'movement becomes an intentional withdrawal');
    assert.equal(raider.data.ai.sanctuaryWithdrawn, true, 'withdrawal is sticky and inspectable');
    assert.equal(raider.data.combat.targetId, null, 'player target is cleared');
    assert.equal(raider.data.combat.lockTarget, null, 'player lock is cleared');
    assert.equal(raider.data.intent.fire, false, 'stale fire bit is cleared before weapons update');
    assert.equal(raider.data.intent.fireGroup, null, 'stale weapon group is cleared');
    assert.ok(raider.data.intent.moveX > 0.9, 'withdrawal vector points away from the station/player core');
    assert.ok(Math.abs(raider.data.intent.moveZ) < 0.1, 'withdrawal does not random-spin');
    assert.equal(isHostileForAI(t.state, raider, t.player), false, 'withdrawn raider is no longer a hostile contact');
    assert.equal(withdrawals.length, 1, 'jurisdiction transition emits one inspectable withdrawal receipt');
    assert.equal(withdrawals[0].stationId, 'station_helios');
    assert.equal(voices.length, 1, 'withdrawal has one readable warning, not repeated text spam');
    assert.match(voices[0].text, /Station guns own this lane/);
  });
});
