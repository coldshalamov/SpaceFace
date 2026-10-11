// THE WORLD REMEMBERS (U-A) — hunters that learn you.
//
// Hosted by lawSecurity (not a registered system): the warrant hunters already spawn there, the
// law's receipts and the witness gate live there, and its serialize()/deserialize() already own a
// lazy, whitelisted save slice. lawSecurity.js stays the owner and hands this module its bus,
// helpers and state; everything below is the wave rhythm, the cast's memory and the voice.
//
// What it does
//   * jump:arrive / dock:docked while WANTED at NETS or IMPOUND roll (state.rng) a pressure wave on
//     the rhythm in data/warrantHunters.js; the cast pick is hash32(seed, tier, arrivalCount).
//   * A jump wave lands WARRANT_WAVE_ARRIVAL_DELAY_S after arrival; a dock wave lands after undock.
//   * The wave is the hunter (+ crew at IMPOUND) built from makePlayerWarrantHunterSpec, the
//     roster's bias, and the player's kill-style counter-kit from aceMemory (same reads as aces).
//   * Memory is state.lawSecurity.warrantHunters — lazy, absent until the first wave.
//   * Kills, escapes and payments update that memory and emit receipts. Nothing here writes heat,
//     credits or reputation: a licensed hunter's death reaches heat through lawSecurity's signed
//     receipt (lawful_kill) and a payment is the economy's own `economy:payBounty`.
import { hash32 } from '../core/rng.js';
import { BOUNTY_HUNTER_PLAYER_CONTEXT, makePlayerWarrantHunterSpec } from '../data/bountyHunters.js';
import { ActivityKind, normalizeActivity } from '../ai/doctrine.js';
import { reserveArrivalPoint } from '../law/authorityResponse.js';
import {
  aceKillStyleFromHints,
  escalatedStyleFromMemory,
  returnCrewForAce,
  returnLevelBandsForAce,
  styleLoadoutForAce,
} from '../data/namedAces.js';
import { LOCAL_PORTRAIT_ROOT } from '../data/localPortraits.js';
import {
  WARRANT_CREW_MAX,
  WARRANT_HAIL_RANGE_WU,
  WARRANT_HUNTER_SCHEMA,
  WARRANT_MAX_BOLDNESS,
  WARRANT_OFFER_WINDOW_S,
  WARRANT_GRIEVANCES,
  WARRANT_WAVE_ARRIVAL_DELAY_S,
  WARRANT_WAVE_HOLD_MAX_S,
  WARRANT_WAVE_RETRY_S,
  WARRANT_WAVE_RHYTHM,
  WARRANT_WAVE_UNDOCK_DELAY_S,
  grievanceForKillStyle,
  pickWarrantHunter,
  warrantBoldness,
  warrantHunterAce,
  warrantHunterById,
  warrantHunterLine,
  warrantRecoverSeconds,
} from '../data/warrantHunters.js';
import { WANTED_TIER, wantedTierFor } from './heat.js';
import { makeEnemySpawnSpec } from './combat.js';
import { applyStyleLoadoutToSpec } from './aceMemory.js';
import { isRunSealed } from '../core/runSeal.js';

const TIER_RANK = Object.freeze({
  [WANTED_TIER.NONE]: 0,
  [WANTED_TIER.SCAN]: 1,
  [WANTED_TIER.BOUNTY]: 2,
  [WANTED_TIER.NETS]: 3,
  [WANTED_TIER.IMPOUND]: 4,
});
const WAVE_TIERS = Object.freeze([WANTED_TIER.NETS, WANTED_TIER.IMPOUND]);
const SURVIVOR_PAYLOAD_TYPE = 'survivor_pod';
const DEFAULT_ESCORT_TRICK = 'shield-turtle';
const BOLDER_CAP = WARRANT_MAX_BOLDNESS - 1;

export function createWarrantHunterWaves(host) {
  const subs = [];
  const ctl = {
    arrivals: 0, // session counter until the first wave makes the durable memory
    pending: null, // one held wave: { hunterId, trigger, tier, sectorId, ... }
    live: new Map(), // entityId -> { entity, hunterId, role, waveId, tierRank, ... }
    offer: null, // the hailer's open offer: { hunterId, entityId, amountCr, untilT }
    lastDockTick: -1,
    mercyHeld: false,
  };

  const state = () => host.state;
  const bus = () => host.bus;
  const emit = (event, payload) => {
    const b = bus();
    if (b && typeof b.emit === 'function') b.emit(event, payload);
  };
  const nowOf = (s) => (Number.isFinite(s && s.simTime) ? s.simTime : 0);
  const seedOf = (s) => (s && s.meta && Number.isFinite(s.meta.seed) ? s.meta.seed >>> 0 : 0);
  const sectorOf = (s) => (s && s.world && s.world.currentSectorId) || null;
  const playerOf = (s) => (s && s.entities && s.playerId != null ? s.entities.get(s.playerId) : null);

  // ── memory (state.lawSecurity.warrantHunters) ──────────────────────────────────────────────
  function memory(s, create = false) {
    const law = s && s.lawSecurity;
    if (!law || typeof law !== 'object') return null;
    let m = law.warrantHunters;
    if ((!m || typeof m !== 'object') && create) {
      m = law.warrantHunters = {
        schemaVersion: WARRANT_HUNTER_SCHEMA,
        arrivalCount: ctl.arrivals,
        lastWaveArrival: 0,
        lastWaveT: null,
        bolder: 0,
        hunters: {},
      };
    }
    return m && typeof m === 'object' ? m : null;
  }

  function recordFor(m, hunterId) {
    if (!m.hunters || typeof m.hunters !== 'object') m.hunters = {};
    let rec = m.hunters[hunterId];
    if (!rec) {
      rec = m.hunters[hunterId] = {
        encounters: 0,
        timesEscapedYou: 0,
        timesYouEscaped: 0,
        timesDisabled: 0,
        lastSectorId: null,
        lastOutcome: null,
        recoverUntilT: 0,
        grievance: null,
      };
    }
    return rec;
  }

  function isRecovering(s, hunterId) {
    const m = memory(s);
    const rec = m && m.hunters && m.hunters[hunterId];
    return !!(rec && Number(rec.recoverUntilT) > nowOf(s));
  }

  // ── gates ──────────────────────────────────────────────────────────────────────────────────
  function sealed(s) {
    if (!s || !s.player) return true;
    if (s.run && s.run.kind === 'survival' && s.run.phase !== 'inactive') return true;
    if (s.scenario && s.scenario.active) return true; // curated scenarios / goldens stay inert
    return isRunSealed(s);
  }

  function isDocked(s) {
    const player = playerOf(s);
    return !!((s.ui && s.ui.docked === true) || (player && player.flags && player.flags.docked));
  }

  function directorBusy(s) {
    const live = s && s.encounterDirector && s.encounterDirector.live;
    if (!live || typeof live !== 'object') return false;
    let meaningful = 0;
    for (const key of Object.keys(live)) {
      const rec = live[key];
      if (rec && rec.deck === 'combat' && rec.tier !== 'ambient') meaningful += 1;
    }
    return meaningful >= 2;
  }

  // ── arrivals: roll a wave ──────────────────────────────────────────────────────────────────
  function onArrival(trigger, payload) {
    const s = state();
    if (sealed(s)) return;
    const tier = wantedTierFor(s.player.heat);
    if (!WAVE_TIERS.includes(tier)) return;
    const tick = s.tick | 0;
    if (trigger === 'dock') {
      // One physical dock fans out as an intent and a receipt — count it once.
      if (ctl.lastDockTick === tick) return;
      ctl.lastDockTick = tick;
    }
    const m0 = memory(s);
    const idx = (m0 ? m0.arrivalCount | 0 : ctl.arrivals) + 1;
    if (m0) m0.arrivalCount = idx;
    ctl.arrivals = idx;
    if (ctl.pending) return; // one held wave at a time — pressure, not a pile-up

    const rhythm = WARRANT_WAVE_RHYTHM[tier];
    const gap = idx - (m0 ? m0.lastWaveArrival | 0 : 0);
    if (gap < rhythm.minGap) return;
    const now = nowOf(s);
    if (m0 && m0.lastWaveT != null && now - m0.lastWaveT < rhythm.cooldownS) return;
    if (gap < rhythm.guaranteeGap && !(s.rng() < rhythm.chance)) return;
    const hunter = pickWarrantHunter({
      seed: seedOf(s), tier, arrivalCount: idx, trigger, isRecovering: (id) => isRecovering(s, id),
    });
    if (!hunter) return;

    const m = memory(s, true);
    m.arrivalCount = idx;
    m.lastWaveArrival = idx;
    m.lastWaveT = now;
    ctl.pending = {
      hunterId: hunter.id,
      trigger,
      tier,
      arrivalIdx: idx,
      sectorId: sectorOf(s),
      stationId: payload && payload.stationId || null,
      armedT: now,
      dueT: trigger === 'jump' ? now + WARRANT_WAVE_ARRIVAL_DELAY_S : null, // dock: set on undock
      tries: 0,
    };
  }

  function onUndock() {
    const s = state();
    const p = ctl.pending;
    if (!p || p.trigger !== 'dock' || p.dueT != null) return;
    p.sectorId = sectorOf(s);
    p.dueT = nowOf(s) + WARRANT_WAVE_UNDOCK_DELAY_S;
  }

  // THE WORLD REMEMBERS (U-B x U-A): a fence who does not trust a hot pilot sells them. The tip
  // skips the rhythm — gap, cooldown and chance — and holds a dock-triggered wave that lands on
  // the next undock. A wave already held is simply marked as tipped (one wave at a time stays).
  function onFenceTip(p) {
    const s = state();
    if (sealed(s) || !p || !p.fenceId) return;
    const tier = wantedTierFor(s.player.heat);
    if (!WAVE_TIERS.includes(tier)) return;
    if (ctl.pending) { ctl.pending.tippedBy = p.fenceId; return; }
    const m0 = memory(s);
    const idx = (m0 ? m0.arrivalCount | 0 : ctl.arrivals) + 1;
    const hunter = pickWarrantHunter({
      seed: seedOf(s), tier, arrivalCount: idx, trigger: 'dock', isRecovering: (id) => isRecovering(s, id),
    });
    if (!hunter) return;
    const now = nowOf(s);
    const m = memory(s, true);
    m.arrivalCount = idx;
    m.lastWaveArrival = idx;
    m.lastWaveT = now;
    ctl.arrivals = idx;
    ctl.pending = {
      hunterId: hunter.id,
      trigger: 'dock',
      tier,
      arrivalIdx: idx,
      sectorId: p.sectorId || sectorOf(s),
      stationId: p.stationId || null,
      armedT: now,
      dueT: null, // set on undock, like any dock-triggered wave
      tries: 0,
      tippedBy: p.fenceId,
    };
  }

  // ── landing the wave ───────────────────────────────────────────────────────────────────────
  function update(dt, s) {
    if (!ctl.pending && ctl.live.size === 0 && !ctl.offer) return;
    if (sealed(s)) return;
    const now = nowOf(s);
    const p = ctl.pending;
    if (p) {
      if (p.sectorId && sectorOf(s) !== p.sectorId) ctl.pending = null; // the lane moved on
      else if (p.dueT != null && now - p.dueT > WARRANT_WAVE_HOLD_MAX_S) ctl.pending = null; // never landed
      else if (p.dueT != null && now >= p.dueT) landWave(s, p, now);
    }
    if (ctl.live.size > 0 || ctl.offer) upkeep(s, now);
  }

  function landWave(s, p, now) {
    const hunter = warrantHunterById(p.hunterId);
    const player = playerOf(s);
    if (!hunter || !player || player.alive === false || !player.pos) { ctl.pending = null; return; }
    if (isDocked(s) || directorBusy(s)) { p.dueT = now + WARRANT_WAVE_RETRY_S; return; }
    const helpers = host.helpers || {};
    if (typeof helpers.spawnEntity !== 'function') { p.dueT = now + WARRANT_WAVE_RETRY_S; return; }

    const m = memory(s, true);
    const rec = recordFor(m, hunter.id);
    const returning = (rec.encounters | 0) > 0;
    const boldness = warrantBoldness({ bolder: m.bolder, returning });
    const ace = warrantHunterAce(hunter);
    const style = escalatedStyleFromMemory(s.aceMemory, ace);
    const ships = composeWave(hunter, p.tier, boldness, style);
    const waveId = `warrant-wave:${seedOf(s)}:${hunter.id}:${p.arrivalIdx}`;

    const budget = helpers.spawnBudget;
    let grant = ships.length;
    if (budget && typeof budget.request === 'function') {
      grant = budget.request(ships.length, `law:${waveId}`);
      if (grant < 1) { // the sky is full — hold, never drop the hunter into a crowd
        p.tries += 1;
        p.dueT = now + WARRANT_WAVE_RETRY_S;
        return;
      }
    }

    const spawned = [];
    const wave = { waveId, tier: p.tier, boldness, returning, style, bossPos: null };
    for (let i = 0; i < ships.length && spawned.length < grant; i++) {
      const spec = buildSpec(s, hunter, ships[i], i, wave);
      let entity = null;
      try { entity = helpers.spawnEntity(spec); } catch (err) { entity = null; }
      if (!entity || entity.id == null) continue;
      if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(entity.id, `law:${waveId}`);
      spawned.push({ entity, role: ships[i].role });
    }
    if (budget && typeof budget.releaseSome === 'function' && spawned.length < grant) {
      budget.releaseSome(`law:${waveId}`, grant - spawned.length);
    }
    ctl.pending = null;
    if (!spawned.length) return;

    rec.encounters = (rec.encounters | 0) + 1;
    rec.lastSectorId = sectorOf(s);
    const offerAmount = hunter.quirk.id === 'hails_first' ? Math.max(0, Math.round(Number(s.player.bounty) || 0)) : 0;
    for (const row of spawned) {
      ctl.live.set(row.entity.id, {
        entity: row.entity,
        hunterId: hunter.id,
        role: row.role,
        waveId,
        tierRank: TIER_RANK[p.tier] || 0,
        returning,
        grievance: rec.grievance || null,
        hailed: false,
        fled: false,
        offerAmount: row.role === 'boss' ? offerAmount : 0,
        tippedBy: p.tippedBy || null,
      });
    }
    emit('warrant:waveSpawned', {
      schemaVersion: WARRANT_HUNTER_SCHEMA,
      hunterId: hunter.id,
      name: hunter.name,
      tier: p.tier,
      sectorId: sectorOf(s),
      trigger: p.trigger,
      tippedBy: p.tippedBy || null, // the fence who sold the pilot, when one did
      crewCount: Math.max(0, spawned.length - 1),
      tick: s.tick | 0,
      waveId,
      boldness,
      returning,
      style: style || null,
      entityIds: spawned.map((row) => row.entity.id),
    });
  }

  /** The wave's ship list: boss first, then quirk extras, then the return crew (IMPOUND only). */
  function composeWave(hunter, tier, boldness, style) {
    const ace = warrantHunterAce(hunter);
    const plan = returnCrewForAce(ace, boldness, style);
    const bands = returnLevelBandsForAce(ace, boldness);
    const out = [{ role: 'boss', archetype: plan[0].archetype, level: plan[0].level, style: plan[0].style }];
    const rhythm = WARRANT_WAVE_RHYTHM[tier];
    const extras = [];
    if (hunter.quirk.tender) {
      extras.push({ role: 'tender', archetype: hunter.escortArchetype, level: bands.current[0], style: null });
    }
    if (hunter.quirk.partner) {
      extras.push({ role: 'partner', archetype: hunter.quirk.partner.archetype, level: bands.current[0], style: null, name: hunter.quirk.partner.name });
    }
    // Quirk extras always come; at IMPOUND they count against the crew cap and the return
    // composition fills what is left.
    const escorts = plan.slice(1);
    const room = rhythm.crew ? Math.max(0, WARRANT_CREW_MAX - extras.length) : 0;
    out.push(...extras);
    for (let i = 0; i < room && i < escorts.length; i++) {
      out.push({ role: 'escort', archetype: escorts[i].archetype, level: escorts[i].level, style: escorts[i].style });
    }
    return out;
  }

  function buildSpec(s, hunter, ship, index, wave) {
    const player = playerOf(s);
    const seed = seedOf(s);
    const contractId = `${wave.waveId}:${index}`;
    const pos = arrivalPoint(s, hunter, ship, index, contractId, player, wave);
    const huntSpec = makePlayerWarrantHunterSpec({
      contractId, playerId: s.playerId, pos, factionId: hunter.factionId,
    });
    const isBoss = ship.role === 'boss';
    const trickId = isBoss ? hunter.trick : (hunter.escortTrick || DEFAULT_ESCORT_TRICK);
    huntSpec.data.hunterTrick = trickId;
    huntSpec.data.bountyHunt.trickId = trickId;
    huntSpec.data.wantedTier = wave.tier;

    const hull = makeEnemySpawnSpec(ship.archetype, ship.level, pos, {
      factionId: hunter.factionId,
      motive: 'wanted_warrant',
      engagementTrigger: 'wanted_bounty',
      zoneId: 'warrant_hunter',
      approachTelegraph: 'hunter_inbound',
      startedTick: s.tick,
    });
    hull.team = huntSpec.team;
    hull.pos = { x: pos.x, z: pos.z };
    hull.vel = { x: 0, z: 0 };
    hull.rot = Math.atan2(player.pos.z - pos.z, player.pos.x - pos.x);
    const baseAi = hull.data && hull.data.ai ? { ...hull.data.ai } : {};
    hull.data = { ...(hull.data || {}), ...(huntSpec.data || {}) };
    hull.data.ai = { ...baseAi, ...(huntSpec.data && huntSpec.data.ai || {}) };
    // Deliberately NOT missionTag/missionPinned (lawSecurity's own warrant hulls carry them): a
    // mission-owned hull is outside kill adjudication, and a licensed contractor's death must
    // be priced by the law's signed receipt. Identity rides data.warrantHunterId instead.
    delete hull.data.missionTag;
    delete hull.data.missionPinned;

    if (isBoss && wave.style) {
      // The counter-kit the aces wear: same read of the same player-style ledger.
      applyStyleLoadoutToSpec(hull, styleLoadoutForAce(warrantHunterAce(hunter), wave.style));
    }

    const ai = hull.data.ai;
    ai.motive = 'wanted_warrant';
    ai.engagementTrigger = 'wanted_bounty';
    ai.zoneId = 'warrant_hunter';
    ai.approachTelegraph = 'hunter_inbound';
    if (!ai.combatDoctrineId) ai.combatDoctrineId = 'interceptor_flyby';
    ai.noFireResponseWindowS = 1.5;
    ai.spawnContext = BOUNTY_HUNTER_PLAYER_CONTEXT;
    ai.forcePlayerTarget = true;
    ai.hostileTeams = [0];
    ai.squadId = wave.waveId;
    ai.encounterKind = 'warrant_hunter';
    ai.encounterRole = ship.role;
    // Licensed contractors fly through the law's own gate (securityTargetId) so killing one is a
    // lawful_kill on the law's record; freelancers are plain hostile bounty muscle.
    ai.lawful = hunter.licensed === true;
    ai.securityTargetId = hunter.licensed === true ? s.playerId : null;
    ai.roe = 'weapons_free';
    ai.passive = false;
    ai.sensorRange = 8000;
    hull.sensorRange = 8000;
    ai.activity = normalizeActivity({
      kind: ActivityKind.ATTACK_RUN,
      reason: `warrant_hunter:${contractId}`,
      anchor: { x: player.pos.x, z: player.pos.z },
      leashRadius: 9000,
      startedTick: s.tick | 0,
      targetId: s.playerId,
      encounterId: wave.waveId,
    });
    const combat = hull.data.combat || (hull.data.combat = {});
    combat.targetId = s.playerId;
    const intent = hull.data.intent || (hull.data.intent = {});
    intent.targetId = s.playerId;
    intent.mode = 'bounty_player';

    // Identity: the target panel reads d.name || ai.name || d.callsign (named aces ride the same).
    const displayName = isBoss ? hunter.name : (ship.name || `${hunter.callsign} ${ship.role}`);
    ai.name = displayName;
    hull.data.name = displayName;
    hull.data.callsign = isBoss ? hunter.callsign : displayName;
    hull.data.warrantHunterId = hunter.id;
    hull.data.hostileContext = BOUNTY_HUNTER_PLAYER_CONTEXT;
    hull.data.warrantHunter = {
      schemaVersion: WARRANT_HUNTER_SCHEMA,
      id: hunter.id,
      name: hunter.name,
      callsign: hunter.callsign,
      crew: hunter.crew,
      role: ship.role,
      licensed: hunter.licensed === true,
      quirk: hunter.quirk.id,
      tier: wave.tier,
      boldness: wave.boldness,
      returning: wave.returning === true,
      waveId: wave.waveId,
      portrait: portraitPath(hunter),
    };
    // Hold fire until the hail for the hunter that offers the bounty (only when there is one).
    if (isBoss && hunter.quirk.id === 'hails_first' && (Number(s.player.bounty) || 0) > 0) {
      ai.roe = 'hold_fire';
    }
    hull.data.contractTargetId = s.playerId;
    return hull;
  }

  function arrivalPoint(s, hunter, ship, index, contractId, player, wave) {
    const seed = seedOf(s);
    if (index > 0) {
      const base = wave.bossPos || player.pos;
      const angle = (hash32(seed, contractId, 'wing') / 0xffffffff) * Math.PI * 2;
      return { x: base.x + Math.cos(angle) * (110 + index * 30), z: base.z + Math.sin(angle) * (110 + index * 30) };
    }
    let pos;
    const quirk = hunter.quirk.id;
    if (quirk === 'dock_lurker') {
      const angle = (hash32(seed, contractId, 'apron') / 0xffffffff) * Math.PI * 2;
      pos = { x: player.pos.x + Math.cos(angle) * 700, z: player.pos.z + Math.sin(angle) * 700 };
    } else if (quirk === 'wake_miner' && Math.hypot(player.vel && player.vel.x || 0, player.vel && player.vel.z || 0) > 20) {
      // Ahead of the player's own vector — the line they are about to fly.
      const angle = Math.atan2(player.vel.z, player.vel.x);
      pos = { x: player.pos.x + Math.cos(angle) * 1400, z: player.pos.z + Math.sin(angle) * 1400 };
    } else {
      const zone = s.player && s.player.heatZone;
      pos = reserveArrivalPoint({
        anchor: player.pos,
        aggressorPos: player.pos,
        jurisdictionRadius: zone && Number.isFinite(zone.radius) ? zone.radius : 1700,
        seed,
        incidentId: contractId,
      });
    }
    wave.bossPos = { x: pos.x, z: pos.z };
    return { x: pos.x, z: pos.z };
  }

  function portraitPath(hunter) {
    const portrait = hunter.portrait;
    if (!portrait) return null;
    return `${LOCAL_PORTRAIT_ROOT}${portrait.role}_${String(portrait.index).padStart(2, '0')}.jpg`;
  }

  // ── live upkeep: hail, offer, mercy, flight ────────────────────────────────────────────────
  function upkeep(s, now) {
    const player = playerOf(s);
    for (const [id, entry] of ctl.live) {
      const entity = entry.entity;
      if (!entity || entity.alive === false || s.entities.get(id) !== entity) { ctl.live.delete(id); continue; }
      if (entry.role !== 'boss' || !player || !player.pos || !entity.pos) continue;
      const hunter = warrantHunterById(entry.hunterId);
      if (!hunter) continue;
      const ai = entity.data && entity.data.ai;
      if (!entry.hailed) {
        const dx = entity.pos.x - player.pos.x;
        const dz = entity.pos.z - player.pos.z;
        if (dx * dx + dz * dz <= WARRANT_HAIL_RANGE_WU * WARRANT_HAIL_RANGE_WU) firstContact(s, entry, hunter, entity, now);
      }
      if (!entry.fled && ai && (ai.forceFlee === true || ai.moraleFleeReason)) {
        entry.fled = true;
        const m = memory(s, true);
        const rec = recordFor(m, hunter.id);
        rec.timesEscapedYou = (rec.timesEscapedYou | 0) + 1;
        rec.lastOutcome = 'fled';
        say(s, hunter, 'giveUp', 'limp');
      }
      if (hunter.quirk.id === 'holds_for_survivors' && ai) {
        const towing = towingSurvivors(s);
        if (towing !== ctl.mercyHeld) {
          ctl.mercyHeld = towing;
          ai.roe = towing ? 'hold_fire' : 'weapons_free';
        }
      }
    }
    const offer = ctl.offer;
    if (offer && now >= offer.untilT) closeOffer(s, 'expired');
  }

  function firstContact(s, entry, hunter, entity, now) {
    entry.hailed = true;
    const m = memory(s, true);
    const rec = recordFor(m, hunter.id);
    // A tipped wave says where it heard: the fence who sold the pilot is named to their face.
    const kind = entry.tippedBy ? 'tipped' : entry.returning && rec.grievance ? 'grievance' : 'first';
    const line = say(s, hunter, kind, 'contact', { grievance: rec.grievance, fenceId: entry.tippedBy });
    if (hunter.quirk.id === 'hails_first') {
      const ai = entity.data && entity.data.ai;
      const amount = Math.max(0, Math.round(Number(s.player.bounty) || 0));
      if (amount > 0) {
        ctl.offer = { hunterId: hunter.id, entityId: entity.id, amountCr: amount, untilT: now + WARRANT_OFFER_WINDOW_S, waveId: entry.waveId };
        emit('warrant:hunterOffer', {
          schemaVersion: WARRANT_HUNTER_SCHEMA,
          hunterId: hunter.id,
          name: hunter.name,
          amountCr: amount,
          untilT: ctl.offer.untilT,
          line, // the hail the offer rode in on, for the prompt that carries the answer
          tick: s.tick | 0,
        });
      } else if (ai) {
        ai.roe = 'weapons_free';
      }
    }
  }

  function closeOffer(s, reason) {
    const offer = ctl.offer;
    ctl.offer = null;
    if (!offer) return;
    const entry = ctl.live.get(offer.entityId);
    const ai = entry && entry.entity && entry.entity.data && entry.entity.data.ai;
    if (ai && reason !== 'paid') ai.roe = 'weapons_free';
    emit('warrant:hunterOfferClosed', {
      schemaVersion: WARRANT_HUNTER_SCHEMA, hunterId: offer.hunterId, reason, tick: s.tick | 0,
    });
  }

  function towingSurvivors(s) {
    const byId = s.combat && s.combat.attachments && s.combat.attachments.byId;
    if (!byId || typeof byId !== 'object') return false;
    for (const key in byId) {
      const att = byId[key];
      if (!att || att.state !== 'active' || att.ownerId !== s.playerId) continue;
      const target = s.entities.get(att.targetId);
      if (target && target.alive !== false && target.data
        && (target.data.payloadType === SURVIVOR_PAYLOAD_TYPE || target.data.tetherRole === 'survivor_pod')) return true;
    }
    return false;
  }

  // ── voice: the hail channel, the way bountyMark hails speak ───────────────────────────────
  function say(s, hunter, kind, salt, opts = {}) {
    const text = warrantHunterLine(hunter, kind, {
      seed: seedOf(s), salt: hash32(String(salt), s.tick | 0), grievance: opts.grievance || null,
      fenceId: opts.fenceId || null,
    });
    if (!text) return '';
    const voice = host.helpers && host.helpers.voice;
    const said = !!(voice && typeof voice.say === 'function'
      && voice.say({ channel: 'comms', text, kind: 'warrantHunter', ttl: 5, id: `warrantHunter:${hunter.id}:${kind}` }));
    emit('comms:popup', { sender: hunter.name, text, category: 'personal', ttl: 6, _viaVoice: said });
    emit('warrant:hail', {
      schemaVersion: WARRANT_HUNTER_SCHEMA,
      hunterId: hunter.id,
      name: hunter.name,
      kind,
      grievance: kind === 'grievance' ? (opts.grievance || 'disabled') : null,
      text,
      tick: s.tick | 0,
    });
    return text;
  }

  // ── kills, escapes, payment ────────────────────────────────────────────────────────────────
  function trackedHunterFor(s, id) {
    const entry = ctl.live.get(id);
    if (entry && entry.role === 'boss') return entry;
    // Session map lost (load / id churn): the hull's own tag still names the hunter.
    const entity = s.entities.get(id);
    const tag = entity && entity.data && entity.data.warrantHunter;
    if (tag && tag.role === 'boss' && warrantHunterById(tag.id)) {
      return { entity, hunterId: tag.id, role: 'boss', waveId: tag.waveId, tierRank: TIER_RANK[tag.tier] || 0, orphan: true };
    }
    return null;
  }

  function killStyleOf(s, payload) {
    const presentation = payload && payload.presentation && typeof payload.presentation === 'object'
      ? payload.presentation : null;
    const hinted = aceKillStyleFromHints({
      style: payload.killStyle || payload.style,
      killStyle: payload.killStyle,
      explicit: payload.explicitStyle,
      cause: presentation && presentation.cause || payload.cause,
      surface: presentation && presentation.surface,
    });
    if (hinted !== 'gun') return hinted;
    const ps = s.aceMemory && s.aceMemory.playerStyle;
    return ps && ps.lastAt === s.simTime && ps.lastStyle ? ps.lastStyle : 'gun';
  }

  function onKilled(payload) {
    const s = state();
    if (!payload || payload.id == null || sealed(s)) return;
    const entry = trackedHunterFor(s, payload.id);
    ctl.live.delete(payload.id);
    if (!entry) return;
    const hunter = warrantHunterById(entry.hunterId);
    if (!hunter) return;
    const byPlayer = payload.killerId === s.playerId;
    const m = memory(s, true);
    const rec = recordFor(m, hunter.id);
    const now = nowOf(s);
    rec.timesDisabled = (rec.timesDisabled | 0) + 1;
    rec.recoverUntilT = now + warrantRecoverSeconds(rec.timesDisabled);
    rec.lastSectorId = sectorOf(s);
    rec.lastOutcome = byPlayer ? 'disabled' : 'lost';
    let grievance = rec.grievance;
    if (byPlayer) {
      grievance = grievanceForKillStyle(killStyleOf(s, payload));
      rec.grievance = grievance;
      m.bolder = Math.min(BOLDER_CAP, (m.bolder | 0) + 1); // the next wave is one tier bolder
    }
    if (ctl.offer && ctl.offer.hunterId === hunter.id) closeOffer(s, 'disabled');
    say(s, hunter, 'giveUp', 'disabled');
    emit('warrant:hunterDisabled', {
      schemaVersion: WARRANT_HUNTER_SCHEMA,
      hunterId: hunter.id,
      name: hunter.name,
      tier: wantedTierFor(s.player.heat),
      sectorId: sectorOf(s),
      grievance: byPlayer ? grievance : null,
      byPlayer,
      licensed: hunter.licensed === true,
      // Heat is priced by lawSecurity's signed receipt (lawful_kill) for a licensed hull — this
      // receipt only names the door; it never writes heat.
      heatIntent: byPlayer && hunter.licensed === true ? 'law:reportIncidentReceipt' : null,
      recoverUntilT: rec.recoverUntilT,
      timesDisabled: rec.timesDisabled,
      bolder: m.bolder | 0,
      tick: s.tick | 0,
    });
  }

  // A licensed contractor's transponder reports its own loss: when the witness gate saw nothing,
  // lawSecurity signs the same lawful_kill receipt a wreck scan would later. Heat still prices it.
  function onAdjudicated(payload) {
    if (!payload || payload.outcome !== 'unwitnessed') return;
    const entry = ctl.live.get(payload.victimEntityId);
    const hunter = entry && entry.role === 'boss' ? warrantHunterById(entry.hunterId) : null;
    if (!hunter || hunter.licensed !== true) return;
    if (typeof host._signContractorTransponderLoss === 'function') {
      host._signContractorTransponderLoss(payload.victimStableId);
    }
  }

  function onGone(payload) {
    const id = payload && payload.id;
    if (id != null) ctl.live.delete(id);
  }

  function onSectorExit(payload) {
    const s = state();
    if (payload && payload.continuous === true) return; // free-flight handoff: the chase flies on
    const sectorId = payload && payload.sectorId;
    if (ctl.pending && (!sectorId || ctl.pending.sectorId === sectorId)) ctl.pending = null;
    if (sealed(s)) return;
    const wave = new Set();
    for (const [id, entry] of ctl.live) {
      if (entry.role !== 'boss') continue;
      const hunter = warrantHunterById(entry.hunterId);
      const entity = entry.entity;
      if (!hunter || !entity || entity.alive === false) continue;
      wave.add(entry.waveId);
      const m = memory(s, true);
      const rec = recordFor(m, hunter.id);
      rec.timesYouEscaped = (rec.timesYouEscaped | 0) + 1;
      rec.lastOutcome = 'outran';
      rec.grievance = 'outran';
      rec.lastSectorId = sectorId || rec.lastSectorId;
      if (ctl.offer && ctl.offer.hunterId === hunter.id) closeOffer(s, 'left');
      emit('warrant:hunterEscaped', {
        schemaVersion: WARRANT_HUNTER_SCHEMA,
        hunterId: hunter.id,
        name: hunter.name,
        tier: wantedTierFor(s.player.heat),
        sectorId: sectorId || null,
        tick: s.tick | 0,
      });
    }
    for (const [id, entry] of ctl.live) if (wave.has(entry.waveId)) ctl.live.delete(id);
  }

  function onBountyCleared(payload) {
    const s = state();
    const offer = ctl.offer;
    if (!offer || !payload || !(Number(payload.amount) > 0)) return;
    const entry = ctl.live.get(offer.entityId);
    const hunter = warrantHunterById(offer.hunterId);
    if (!entry || !hunter) { closeOffer(s, 'gone'); return; }
    standDownWave(s, entry.waveId);
    const m = memory(s, true);
    const rec = recordFor(m, hunter.id);
    rec.lastOutcome = 'paid';
    rec.grievance = 'paid';
    rec.lastSectorId = sectorOf(s);
    closeOffer(s, 'paid');
    emit('warrant:hunterPaid', {
      schemaVersion: WARRANT_HUNTER_SCHEMA,
      hunterId: hunter.id,
      name: hunter.name,
      amountCr: Math.round(Number(payload.amount) || 0),
      tier: wantedTierFor(s.player.heat),
      sectorId: sectorOf(s),
      source: payload.source || null,
      tick: s.tick | 0,
    });
  }

  function standDownWave(s, waveId) {
    for (const [id, entry] of ctl.live) {
      if (entry.waveId !== waveId) continue;
      const data = entry.entity && entry.entity.data;
      if (data) {
        if (data.bountyHunt) { data.bountyHunt.pursuing = false; data.bountyHunt.targetId = null; }
        data.wantedWarrant = false;
        data.missionPinned = false;
        data.contractTargetId = null;
        if (data.missionTag === 'warrant_hunter') data.missionTag = null;
        const ai = data.ai;
        if (ai) {
          ai.forcePlayerTarget = false;
          ai.securityTargetId = null;
          ai.passive = true;
          ai.roe = 'hold_fire';
        }
      }
      ctl.live.delete(id);
    }
  }

  /** UI/intent door: take the hailer's offer. The economy owns the charge; we only ask. */
  function onAcceptPayment(payload) {
    const s = state();
    if (!ctl.offer) return;
    const request = { source: `warrantHunter:${ctl.offer.hunterId}` };
    emit('economy:payBounty', request);
    const result = request.result;
    if (payload && typeof payload === 'object') payload.result = result || { ok: false, reason: 'no_economy' };
    if (!result || result.ok !== true) {
      const hunter = warrantHunterById(ctl.offer.hunterId);
      if (hunter) say(s, hunter, 'refused', 'refused');
      emit('warrant:hunterOfferRefused', {
        schemaVersion: WARRANT_HUNTER_SCHEMA,
        hunterId: ctl.offer.hunterId,
        reason: result && result.reason || 'no_economy',
        shortfallCr: result && result.shortfall || 0,
        tick: s.tick | 0,
      });
    }
    // On success economy emitted bounty:cleared, which onBountyCleared already settled.
  }

  function onHeatChanged(packet) {
    const s = state();
    if (!packet || ctl.live.size === 0 || sealed(s)) return;
    const rank = TIER_RANK[packet.tier] || 0;
    for (const entry of ctl.live.values()) {
      if (entry.role !== 'boss' || rank <= entry.tierRank) continue;
      entry.tierRank = rank;
      const hunter = warrantHunterById(entry.hunterId);
      if (hunter) say(s, hunter, 'tierUp', `tier:${rank}`);
    }
  }

  function resetSession() {
    ctl.pending = null;
    ctl.live.clear();
    ctl.offer = null;
    ctl.mercyHeld = false;
    ctl.lastDockTick = -1;
  }

  // ── persistence (the host's serialize/deserialize carry this slice) ─────────────────────────
  function serialize() {
    const m = memory(state());
    return m ? JSON.parse(JSON.stringify(m)) : null;
  }

  function deserialize(raw) {
    const s = state();
    const law = s && s.lawSecurity;
    if (!law) return;
    const normalized = normalizeMemory(raw);
    if (normalized) law.warrantHunters = normalized;
    else delete law.warrantHunters;
    ctl.arrivals = normalized ? normalized.arrivalCount : 0;
    resetSession();
  }

  function listen(event, fn) {
    const b = bus();
    if (!b || typeof b.on !== 'function') return;
    const off = b.on(event, fn);
    subs.push(typeof off === 'function' ? off : () => { if (typeof b.off === 'function') b.off(event, fn); });
  }

  listen('jump:arrive', () => onArrival('jump', null));
  listen('dock:docked', (p) => onArrival('dock', p));
  listen('dock:undocked', onUndock);
  listen('law:fenceTip', onFenceTip);
  listen('law:killedAdjudicated', onAdjudicated);
  listen('entity:killed', onKilled);
  listen('entity:destroyed', onGone);
  listen('sector:exit', onSectorExit);
  listen('bounty:cleared', onBountyCleared);
  listen('warrant:acceptPayment', onAcceptPayment);
  listen('heat:changed', onHeatChanged);
  listen('save:restoring', resetSession);
  listen('save:loaded', resetSession);

  return {
    update,
    serialize,
    deserialize,
    resetSession,
    destroy() {
      for (const off of subs) { try { off(); } catch (err) { /* cleanup must not throw */ } }
      subs.length = 0;
      resetSession();
    },
    // Read-only views for tests and probes.
    _view: () => ({ pending: ctl.pending, live: ctl.live, offer: ctl.offer, arrivals: ctl.arrivals }),
  };
}

export function normalizeMemory(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {
    schemaVersion: WARRANT_HUNTER_SCHEMA,
    arrivalCount: Math.max(0, Number(raw.arrivalCount) | 0),
    lastWaveArrival: Math.max(0, Number(raw.lastWaveArrival) | 0),
    lastWaveT: Number.isFinite(raw.lastWaveT) ? Number(raw.lastWaveT) : null,
    bolder: Math.max(0, Math.min(BOLDER_CAP, Number(raw.bolder) | 0)),
    hunters: {},
  };
  const src = raw.hunters && typeof raw.hunters === 'object' && !Array.isArray(raw.hunters) ? raw.hunters : {};
  for (const id of Object.keys(src)) {
    if (!warrantHunterById(id)) continue; // a stale cast id never rebinds
    const r = src[id];
    if (!r || typeof r !== 'object') continue;
    out.hunters[id] = {
      encounters: Math.max(0, Number(r.encounters) | 0),
      timesEscapedYou: Math.max(0, Number(r.timesEscapedYou) | 0),
      timesYouEscaped: Math.max(0, Number(r.timesYouEscaped) | 0),
      timesDisabled: Math.max(0, Number(r.timesDisabled) | 0),
      lastSectorId: typeof r.lastSectorId === 'string' ? r.lastSectorId : null,
      lastOutcome: typeof r.lastOutcome === 'string' ? r.lastOutcome.slice(0, 24) : null,
      recoverUntilT: Number.isFinite(r.recoverUntilT) ? Number(r.recoverUntilT) : 0,
      grievance: WARRANT_GRIEVANCES.includes(r.grievance) ? r.grievance : null,
    };
  }
  return out;
}
