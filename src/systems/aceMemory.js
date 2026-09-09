// BP-13/B10 Named Crews & Aces.
//
// Durable lifecycle owner: records named-ace outcomes, schedules director-owned first contacts,
// spawns only its established promoted-return crews, and emits the station-news seam. It never
// owns first-contact entities or changes hostility.
import {
  ACE_STYLE_ESCALATE_AT,
  PIRATE_PROMOTION_MAX_TIER,
  REACH_CULTURE_ACES,
  aceById,
  aceByName,
  aceFromText,
  aceKillStyleFromHints,
  escalatedStyleFromMemory,
  knownAces,
  newsForAceTransition,
  returnCrewForAce,
  returnLevelBandsForAce,
  returnPlanForAce,
  styleEscalationBark,
  styleLoadoutForAce,
} from '../data/namedAces.js';
import { barkFor } from '../data/barks.js';
import { reachCultureDoctrineById } from '../data/pirateDoctrines.js';
import { planetStatesForSector } from '../data/planetStates.js';
import { WEAPONS } from '../data/weapons.js';
import { hash32 } from '../core/rng.js';
import { normalizeFactionBehaviorProfile } from '../ai/factionBehavior.js';
import { makeEnemySpawnSpec } from './combat.js';

export const ACE_MEMORY_VERSION = 2;

const META_KEYS = new Set([
  'schemaVersion', 'news', 'activeReturns', 'cultureIntros', 'planetChallenges', 'playerStyle',
]);
const FLING_STYLE_WINDOW_S = 8;
const MAX_RECENT_FLINGS = 32;
const RETURN_CHECK_S = 0.5;
const CULTURE_INTRO_RETRY_S = 10;
const PLANET_CHALLENGE_RETRY_S = 10;
const CULTURE_INTRO_ROUTES = Object.freeze([
  Object.freeze({
    aceId: 'ace_maw_rake_veyra', sectorId: 'sector_sker_haven', zoneId: 'zone_sker_gatecamp',
  }),
  Object.freeze({
    aceId: 'ace_rust_lord_orro', sectorId: 'sector_ceres_belt', zoneId: 'zone_ceres_ambush',
  }),
  Object.freeze({
    aceId: 'ace_drift_king_iona', sectorId: 'sector_io_reach', zoneId: 'zone_io_merc',
  }),
]);
const CULTURE_INTRO_ROUTE_BY_SECTOR = new Map(
  CULTURE_INTRO_ROUTES.map((route) => [route.sectorId, route]),
);

export const aceMemory = {
  name: 'aceMemory',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this.registry = ctx.registry || null;
    this._subs = [];
    this._returnAccum = 0;
    ensureMemory(this.state);
    this._listen('namedAce:appeared', (p) => this._appeared(p));
    this._listen('namedAce:fled', (p) => this._transition('fled', p));
    this._listen('namedAce:defeated', (p) => this._transition('defeated', p));
    this._listen('encounter:receipt', (p) => this._receipt(p));
    this._listen('encounter:resolved', (p) => {
      this._introResolved(p);
      this._planetChallengeResolved(p);
    });
    this._listen('sector:enter', (p) => {
      this._scheduleCultureIntro(p);
      this._schedulePlanetChallenges(p);
    });
    this._listen('save:loaded', () => {
      this._rearmCultureIntroAfterLoad();
      this._rearmPlanetChallengesAfterLoad();
    });
    this._listen('entity:destroyed', (p) => this._entityDestroyed(p));
    this._listen('entity:killed', (p) => this._playerKill(p));
    this._listen('combat:kill', (p) => this._playerKill(p));
    this._listen('massline:tumbled', (p) => this._flung(p));
    this._recentFlung = new Map();
  },

  newGame() {
    if (this.state) this.state.aceMemory = freshMemory();
  },

  /** Rebuild only unresolved grudge pressure for an explicit New Run+ launch. */
  applyNewGamePlusGrudges(grudges) {
    if (!this.state || !Array.isArray(grudges)) return 0;
    const memory = ensureMemory(this.state);
    let applied = 0;
    for (const carried of grudges) {
      const ace = aceById(carried && carried.aceId);
      if (!ace) continue;
      const rec = recordFor(memory, ace);
      rec.encountered = true;
      rec.fled = true;
      rec.defeated = false;
      rec.returnScheduled = true;
      rec.returnsBigger = true;
      rec.returned = false;
      rec.returnTier = Math.min(
        PIRATE_PROMOTION_MAX_TIER,
        Math.max(1, Math.floor(Number(carried.returnTier) || 1)),
      );
      rec.fleeCount = Math.max(1, Math.floor(Number(carried.fleeCount) || 1));
      rec.encounterCount = Math.max(rec.fleeCount, Math.floor(Number(carried.encounterCount) || 1));
      rec.carriedFromPriorRun = true;
      Object.assign(rec, returnPlanForAce(ace, seedOf(this.state), 0));
      applied += 1;
    }
    emit(this.bus, 'aceMemory:newGamePlusApplied', { count: applied });
    return applied;
  },

  serialize() {
    return clonePlain(ensureMemory(this.state));
  },

  deserialize(data) {
    if (this.state) this.state.aceMemory = normalizeMemory(data);
  },

  update(dt, state) {
    if (state.mode && state.mode !== 'flight') return;
    this.state = state;
    this._returnAccum = (this._returnAccum || 0) + dt;
    if (this._returnAccum < RETURN_CHECK_S) return;
    this._returnAccum = 0;
    this._processCultureIntros(state);
    this._processPlanetChallenges(state);
    this._processReturns(state);
  },

  destroy() {
    if (Array.isArray(this._subs)) {
      for (const off of this._subs) {
        try { off(); } catch (err) { /* listener cleanup must not throw */ }
      }
      this._subs.length = 0;
    }
  },

  _listen(evt, fn) {
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const off = this.bus.on(evt, fn);
    if (typeof off === 'function') this._subs.push(off);
  },

  _appeared(payload) {
    const ace = resolveAce(payload);
    if (!ace) return;
    const rec = recordFor(ensureMemory(this.state), ace);
    const first = rec.encountered !== true;
    rec.encountered = true;
    rec.encounterCount = (rec.encounterCount | 0) + 1;
    rec.lastSeenAt = nowOf(this.state, payload);
    rec.lastSectorId = sectorOf(this.state, payload);
    this._completePlanetChallenge(ace.id, 'appeared', payload);
    if (first) this._emitTransition('encountered', ace, rec);
    if (payload && payload.signatureSpoken === true) rec.signatureSpoken = true;
    const style = escalatedStyleFromMemory(ensureMemory(this.state), ace);
    if (style && rec.styleTauntSpoken !== true) {
      rec.escalatedStyle = rec.escalatedStyle || style;
      rec.styleTauntSpoken = true;
      this._speakStyleTaunt(ace, style);
    } else if (!rec.signatureSpoken) {
      rec.signatureSpoken = true;
      this._speakSignature(ace);
    }
  },

  _transition(transition, payload) {
    const ace = resolveAce(payload);
    if (!ace) return;
    const memory = ensureMemory(this.state);
    const rec = recordFor(memory, ace);
    const now = nowOf(this.state, payload);
    const sectorId = sectorOf(this.state, payload);
    rec.encountered = true;
    rec.lastSeenAt = now;
    rec.lastSectorId = sectorId;

    if (transition === 'fled') {
      if (rec.defeated === true) return;
      this._suppressCultureIntro(ace.id);
      const first = rec.fled !== true;
      rec.fled = true;
      rec.fledAt = now;
      rec.fleeCount = (rec.fleeCount | 0) + 1;
      rec.returnsBigger = true;
      rec.returnScheduled = true;
      rec.returnTier = Math.min(PIRATE_PROMOTION_MAX_TIER, Math.max(1, (rec.returnTier | 0) + 1));
      Object.assign(rec, returnPlanForAce(ace, seedOf(this.state), now));
      if (first) this._completeTransition('fled', ace, rec);
      return;
    }

    if (transition === 'defeated') {
      this._suppressCultureIntro(ace.id);
      const first = rec.defeated !== true;
      rec.defeated = true;
      rec.defeatedAt = now;
      rec.returnScheduled = false;
      rec.returnsBigger = false;
      rec.returnAt = null;
      if (first) this._completeTransition('defeated', ace, rec);
    }
  },

  _receipt(payload) {
    if (!payload || payload.shape !== 'named_hunter') return;
    const outcome = payload.outcome === 'killed'
      ? 'defeated'
      : (payload.outcome === 'escaped' ? 'fled' : null);
    if (!outcome) return;
    const ace = resolveAce(payload) || aceFromText(payload.text);
    if (!ace) return;
    this._transition(outcome, { ...payload, aceId: ace.id });
  },

  _scheduleCultureIntro(payload, options = {}) {
    const sectorId = payload && typeof payload === 'object'
      ? payload.sectorId
      : (payload || sectorOf(this.state));
    const route = CULTURE_INTRO_ROUTE_BY_SECTOR.get(sectorId);
    if (!route) return;
    const memory = ensureMemory(this.state);
    if (!cultureIntroEligible(memory, route.aceId)) {
      delete memory.cultureIntros[route.aceId];
      return;
    }
    const now = nowOf(this.state);
    const existing = memory.cultureIntros[route.aceId];
    if (existing && existing.sectorId === route.sectorId && Number.isFinite(existing.dueAt)) {
      if (existing.status === 'pending') return;
      if (existing.status === 'live' && options.rearmLive !== true) return;
    }
    memory.cultureIntros[route.aceId] = {
      aceId: route.aceId,
      sectorId: route.sectorId,
      zoneId: route.zoneId,
      encounterId: `reachCultureIntro:${route.aceId}`,
      dueAt: now + cultureIntroDelay(seedOf(this.state), route),
      status: 'pending',
      attempts: existing && Number.isFinite(existing.attempts) ? existing.attempts : 0,
    };
  },

  _rearmCultureIntroAfterLoad() {
    const sectorId = sectorOf(this.state);
    const route = CULTURE_INTRO_ROUTE_BY_SECTOR.get(sectorId);
    if (!route) return;
    this._scheduleCultureIntro({ sectorId }, { rearmLive: true });
  },

  _processCultureIntros(state) {
    const memory = ensureMemory(state);
    const now = state.simTime || 0;
    const sectorId = sectorOf(state);
    const director = this.registry && this.registry.get('encounterDirector');
    if (!director || typeof director.requestAuthoredEncounter !== 'function') return;
    for (const [aceId, intro] of Object.entries(memory.cultureIntros)) {
      if (!cultureIntroEligible(memory, aceId)) {
        delete memory.cultureIntros[aceId];
        continue;
      }
      if (!intro || intro.status !== 'pending' || intro.sectorId !== sectorId) continue;
      if (!Number.isFinite(intro.dueAt) || intro.dueAt > now) continue;
      const result = director.requestAuthoredEncounter({
        shapeId: 'named_hunter',
        encounterId: intro.encounterId,
        sectorId: intro.sectorId,
        zoneId: intro.zoneId,
        force: true,
        respectPacing: true,
        data: { aceId },
      });
      const current = ensureMemory(state).cultureIntros[aceId];
      if (!current) continue;
      if (result && result.ok) {
        current.status = 'live';
        current.firedAt = now;
      } else {
        current.status = 'pending';
        current.attempts = (current.attempts | 0) + 1;
        current.lastRejectReason = result && result.reason || 'unavailable';
        current.dueAt = Math.ceil(now) + CULTURE_INTRO_RETRY_S;
      }
    }
  },

  _introResolved(payload) {
    if (!payload || !String(payload.encounterId || '').startsWith('reachCultureIntro:')) return;
    const aceId = String(payload.encounterId).slice('reachCultureIntro:'.length);
    const memory = ensureMemory(this.state);
    if (!cultureIntroEligible(memory, aceId)) {
      delete memory.cultureIntros[aceId];
      return;
    }
    const route = CULTURE_INTRO_ROUTES.find((candidate) => candidate.aceId === aceId);
    if (!route || route.sectorId !== sectorOf(this.state)) return;
    this._scheduleCultureIntro({ sectorId: route.sectorId });
  },

  _suppressCultureIntro(aceId) {
    const memory = this.state && this.state.aceMemory;
    if (memory && memory.cultureIntros) delete memory.cultureIntros[aceId];
  },

  // ── W1 Reach Scrawl named challenges ─────────────────────────────────────────────────────

  _schedulePlanetChallenges(payload, options = {}) {
    const sectorId = payload && typeof payload === 'object'
      ? payload.sectorId
      : (payload || sectorOf(this.state));
    if (!sectorId) return;
    const assignments = planetStatesForSector(sectorId);
    if (!assignments.length) return;
    const memory = ensureMemory(this.state);
    const now = nowOf(this.state);
    for (const assignment of assignments) {
      const challenge = assignment && assignment.challenge;
      if (!challenge || challenge.trigger !== 'sector:enter') continue;
      const ace = aceById(challenge.aceId);
      if (!ace || !planetChallengeEligible(memory, ace.id)) continue;
      const existing = memory.planetChallenges[ace.id];
      if (existing && existing.sectorId === sectorId && Number.isFinite(existing.dueAt)) {
        if (existing.status === 'pending') continue;
        if (existing.status === 'live' && options.rearmLive !== true) continue;
        if (existing.status === 'complete') continue;
      }
      const record = {
        aceId: ace.id,
        bodyId: assignment.bodyId,
        stateId: assignment.stateId,
        sectorId,
        encounterId: `planetChallenge:${assignment.bodyId}:${ace.id}`,
        dueAt: now + planetChallengeDelay(seedOf(this.state), assignment, ace.id),
        status: 'pending',
        attempts: existing && Number.isFinite(existing.attempts) ? existing.attempts : 0,
      };
      memory.planetChallenges[ace.id] = record;
      emit(this.bus, 'planetChallenge:scheduled', { ...record });
    }
  },

  _rearmPlanetChallengesAfterLoad() {
    this._schedulePlanetChallenges({ sectorId: sectorOf(this.state) }, { rearmLive: true });
  },

  _processPlanetChallenges(state) {
    const memory = ensureMemory(state);
    const now = state.simTime || 0;
    const sectorId = sectorOf(state);
    const director = this.registry && this.registry.get('encounterDirector');
    if (!director || typeof director.requestAuthoredEncounter !== 'function') return;
    for (const [aceId, challenge] of Object.entries(memory.planetChallenges)) {
      if (!challenge || challenge.status !== 'pending' || challenge.sectorId !== sectorId) continue;
      if (!planetChallengeEligible(memory, aceId)) {
        challenge.status = 'complete';
        challenge.completedAt = now;
        challenge.outcome = 'already_encountered';
        continue;
      }
      if (!Number.isFinite(challenge.dueAt) || challenge.dueAt > now) continue;
      const result = director.requestAuthoredEncounter({
        shapeId: 'named_hunter',
        encounterId: challenge.encounterId,
        sectorId: challenge.sectorId,
        force: true,
        respectPacing: true,
        data: {
          aceId,
          planetBodyId: challenge.bodyId,
          planetStateId: challenge.stateId,
          challengeSource: 'reach_scrawl',
        },
      });
      const current = ensureMemory(state).planetChallenges[aceId];
      if (!current) continue;
      if (result && result.ok) {
        // The encounter director emits namedAce:appeared synchronously. That
        // transition may already have completed the challenge.
        if (current.status !== 'complete') {
          current.status = 'live';
          current.firedAt = now;
          emit(this.bus, 'planetChallenge:fired', { ...current });
        }
      } else {
        current.status = 'pending';
        current.attempts = (current.attempts | 0) + 1;
        current.lastRejectReason = result && result.reason || 'unavailable';
        current.dueAt = Math.ceil(now) + PLANET_CHALLENGE_RETRY_S;
      }
    }
  },

  _planetChallengeResolved(payload) {
    if (!payload || !String(payload.encounterId || '').startsWith('planetChallenge:')) return;
    const memory = ensureMemory(this.state);
    const challenge = Object.values(memory.planetChallenges)
      .find((candidate) => candidate && candidate.encounterId === payload.encounterId);
    if (!challenge) return;
    this._completePlanetChallenge(challenge.aceId, payload.outcome || 'resolved', payload);
  },

  _completePlanetChallenge(aceId, outcome, payload = {}) {
    const memory = this.state && ensureMemory(this.state);
    const challenge = memory && memory.planetChallenges && memory.planetChallenges[aceId];
    if (!challenge || challenge.status === 'complete') return;
    challenge.status = 'complete';
    challenge.completedAt = nowOf(this.state, payload);
    challenge.outcome = String(outcome || 'resolved');
    emit(this.bus, 'planetChallenge:completed', { ...challenge });
  },

  _flung(payload) {
    const victimId = payload && payload.victimId;
    const now = nowOf(this.state, payload);
    rememberRecentFlung(this._recentFlung, victimId, now);
    const entity = victimId != null && this.state && this.state.entities
      ? this.state.entities.get(victimId)
      : null;
    const ace = resolveAceFromEntity(entity);
    if (!ace) return;
    const rec = recordFor(ensureMemory(this.state), ace);
    rec.encountered = true;
    rec.flungCount = (rec.flungCount | 0) + 1;
    rec.lastFlungAt = now;
    rec.lastFlungCause = String(payload.cause || 'massline');
    rec.lastFlungSpin = Number.isFinite(payload.spin) ? payload.spin : 0;
    rec.lastSeenAt = rec.lastFlungAt;
    rec.lastSectorId = sectorOf(this.state, payload);
    this._emitTransition('flung', ace, rec);
  },

  _playerKill(payload) {
    if (!payload || !this.state) return;
    const playerId = this.state.playerId;
    if (playerId == null) return;
    const presentation = payload.presentation && typeof payload.presentation === 'object'
      ? payload.presentation
      : null;
    const playerCaused = presentation && typeof presentation.playerCaused === 'boolean'
      ? presentation.playerCaused
      : payload.killerId === playerId;
    if (!playerCaused) return;
    const victimId = payload.id != null ? payload.id : payload.victimId;
    if (victimId === playerId) return;
    if (payload.type && payload.type !== 'ship') return;
    const now = nowOf(this.state, payload);
    const flung = wasRecentlyFlung(this._recentFlung, victimId, now);
    const trick = matchingRecentTrick(this.state.stunts, victimId);
    const style = aceKillStyleFromHints({
      style: payload.killStyle || payload.style,
      killStyle: payload.killStyle,
      explicit: payload.explicitStyle,
      trickId: trick && trick.trickId,
      cause: presentation && presentation.cause || payload.cause,
      surface: presentation && presentation.surface,
      flung,
    });
    const entity = victimId != null && this.state.entities
      ? this.state.entities.get(victimId)
      : null;
    const factionId = payload.factionId
      || (entity && entity.factionId)
      || (entity && entity.data && entity.data.factionId)
      || null;
    const ace = resolveAce(payload) || resolveAceFromEntity(entity);
    const memory = ensureMemory(this.state);
    recordPlayerStyleKill(memory, {
      style,
      factionId,
      aceId: ace && ace.id,
      now,
    });
    forgetRecentFlung(this._recentFlung, victimId);
  },

  _processReturns(state) {
    const memory = ensureMemory(state);
    const now = state.simTime || 0;
    for (const [id, rec] of Object.entries(memory)) {
      if (META_KEYS.has(id) || !rec || typeof rec !== 'object') continue;
      if (rec.defeated === true || rec.returnScheduled !== true) continue;
      if (Number.isFinite(rec.nextReturnAttemptAt) && rec.nextReturnAttemptAt > now) continue;
      if (!Number.isFinite(rec.returnAt) || rec.returnAt > now) continue;
      const ace = aceById(id);
      if (!ace) continue;
      this._spawnReturn(ace, rec, now);
    }
  },

  _spawnReturn(ace, rec, now) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    const budget = this.helpers && this.helpers.spawnBudget;
    const requestId = `aceReturn:${ace.id}:${rec.returnSeed || 0}:${rec.returnTier || 1}`;
    const style = escalatedStyleFromMemory(ensureMemory(this.state), ace);
    if (style) rec.escalatedStyle = rec.escalatedStyle || style;
    const crew = returnCrewForAce(ace, rec.returnTier || 1, style);
    const bands = returnLevelBandsForAce(ace, rec.returnTier || 1);
    const wanted = crew.length;
    emit(this.bus, 'aceMemory:returnRequested', {
      aceId: ace.id,
      aceName: ace.name,
      requestId,
      returnTier: rec.returnTier || 1,
      wanted,
      levelBand: bands.current.slice(),
      previousLevelBand: bands.previous.slice(),
    });

    if (typeof spawnEntity !== 'function') {
      rec.nextReturnAttemptAt = now + 10;
      return;
    }

    let grant = wanted;
    if (budget && typeof budget.request === 'function') {
      grant = budget.request(wanted, requestId);
      if (grant <= 0) {
        rec.nextReturnAttemptAt = now + 10;
        return;
      }
    }

    const spawnedIds = [];
    for (let i = 0; i < crew.length && spawnedIds.length < grant; i++) {
      const ship = crew[i];
      const spec = this._returnShipSpec(ace, rec, requestId, ship, i);
      const entity = spawnEntity(spec);
      if (entity && entity.id != null) {
        spawnedIds.push(entity.id);
        rememberActiveReturn(this.state, entity.id, ace.id, requestId);
      }
    }
    if (budget && typeof budget.releaseSome === 'function' && spawnedIds.length < grant) {
      budget.releaseSome(requestId, grant - spawnedIds.length);
    }
    if (!spawnedIds.length) {
      if (budget && typeof budget.release === 'function') budget.release(requestId);
      rec.nextReturnAttemptAt = now + 10;
      return;
    }

    rec.returnScheduled = false;
    rec.returned = true;
    rec.returnedAt = now;
    rec.returnRequestId = requestId;
    rec.activeReturnIds = spawnedIds.slice();
    rec.levelBand = bands.current.slice();
    rec.previousLevelBand = bands.previous.slice();
    rec.spawnedCount = spawnedIds.length;
    this._speakReturnTaunt(ace, rec, requestId);
    emit(this.bus, 'aceMemory:returnSpawned', {
      aceId: ace.id,
      aceName: ace.name,
      requestId,
      returnTier: rec.returnTier || 1,
      levelBand: bands.current.slice(),
      previousLevelBand: bands.previous.slice(),
      spawnedIds: spawnedIds.slice(),
      t: now,
    });
  },

  _returnShipSpec(ace, rec, requestId, ship, index) {
    const pos = returnPosition(this.state, ace, rec, index);
    const style = rec.escalatedStyle || escalatedStyleFromMemory(ensureMemory(this.state), ace);
    const loadout = styleLoadoutForAce(ace, style);
    const spec = makeEnemySpawnSpec(ship.archetype, ship.level, pos, {
      factionId: ace.factionId || 'faction_reach',
      startedTick: this.state.tick,
    });
    spec.data = spec.data || {};
    spec.data.ai = spec.data.ai || {};
    const ai = spec.data.ai;
    const culture = reachCultureDoctrineById(ace.cultureId);
    const cultureProfile = normalizeFactionBehaviorProfile(
      culture && culture.factionPresenceDoctrine,
    );
    ai.squadId = requestId;
    ai.doctrine = 'scavenger';
    ai.formation = cultureProfile ? cultureProfile.liveFormation : 'wedge';
    ai.spawnContext = 'ace_return';
    ai.encounterKind = 'named_ace_return';
    ai.encounterRole = ship.role;
    ai.forcePlayerTarget = true;
    ai.hostileTeams = [0];
    ai.passive = false;
    if (cultureProfile) {
      ai.cultureId = culture.id;
      ai.combatDoctrineId = cultureProfile.combatDoctrineId;
      ai.factionPresenceDoctrine = cultureProfile;
      spec.data.reachCulture = {
        id: culture.id,
        label: culture.label,
      };
    }
    applyStyleLoadoutToSpec(spec, loadout);
    if (ship.role === 'boss') {
      ai.name = ace.name;
      spec.data.encounterBoss = true;
      spec.data.bountyCr = (spec.data.bountyCr || 0) + 250 * Math.max(1, rec.returnTier | 0);
    }
    const returnTag = {
      aceId: ace.id,
      aceName: ace.name,
      requestId,
      role: ship.role,
      promoted: true,
      returnTier: rec.returnTier || 1,
      level: ship.level,
      gimmickTag: loadout.gimmickTag || ace.gimmickTag || 'ace',
      style: loadout.style || null,
    };
    if (culture) returnTag.cultureId = culture.id;
    spec.data.aceMemory = returnTag;
    return spec;
  },

  _speakReturnTaunt(ace, rec, requestId) {
    if (rec.lastTauntRequestId === requestId) return;
    rec.lastTauntRequestId = requestId;
    const style = rec.escalatedStyle || escalatedStyleFromMemory(ensureMemory(this.state), ace);
    if (style) {
      rec.styleTauntSpoken = true;
      this._speakStyleTaunt(ace, style, requestId);
      return;
    }
    const bark = barkFor(
      ace.factionId || 'faction_reach',
      'taunt',
      hash32(seedOf(this.state), ace.id, requestId, 'taunt'),
    );
    const text = `${ace.name}: you should have finished me. ${bark}`;
    this._speakAceLine(ace, text, 'taunt', `aceMemory:${ace.id}:return-taunt`);
  },

  _speakStyleTaunt(ace, style, requestId = null) {
    const text = styleEscalationBark(ace, style);
    if (!text) return;
    this._speakAceLine(
      ace,
      text,
      'style-taunt',
      requestId ? `aceMemory:${ace.id}:style:${style}:${requestId}` : `aceMemory:${ace.id}:style:${style}`,
      style,
    );
  },

  _speakAceLine(ace, text, situation, id, style = null) {
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({
        channel: 'bark',
        text,
        kind: 'aceMemory',
        id,
        factionId: ace.factionId || 'faction_reach',
        ttl: 2,
      });
    }
    emit(this.bus, 'aceMemory:voice', {
      aceId: ace.id,
      aceName: ace.name,
      situation,
      style,
      text,
    });
  },

  _entityDestroyed(payload) {
    const id = payload && payload.id;
    if (id == null || !this.state) return;
    const memory = ensureMemory(this.state);
    const active = memory.activeReturns && memory.activeReturns[String(id)];
    if (!active) return;
    delete memory.activeReturns[String(id)];
    const rec = memory[active.aceId];
    if (rec && Array.isArray(rec.activeReturnIds)) {
      rec.activeReturnIds = rec.activeReturnIds.filter((entityId) => entityId !== id);
    }
    const budget = this.helpers && this.helpers.spawnBudget;
    if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(active.requestId, 1);
  },

  _completeTransition(transition, ace, rec) {
    this._emitTransition(transition, ace, rec);
    this._emitNews(transition, ace, rec);
  },

  _emitTransition(transition, ace, rec) {
    emit(this.bus, 'aceMemory:transition', {
      aceId: ace.id,
      aceName: ace.name,
      crew: ace.crew,
      transition,
      record: clonePlain(rec),
    });
  },

  _emitNews(transition, ace, rec) {
    const headline = newsForAceTransition(ace, transition);
    if (!headline) return;
    const key = `${ace.id}:${transition}`;
    const memory = ensureMemory(this.state);
    memory.news[key] = true;
    emit(this.bus, 'news:headline', {
      headline,
      text: headline,
      kind: `ace-${transition}`,
      aceId: ace.id,
      aceName: ace.name,
      crew: ace.crew,
      sectorId: rec.lastSectorId || null,
    });
  },

  _speakSignature(ace) {
    const voice = this.helpers && this.helpers.voice;
    const payload = {
      channel: 'bark',
      text: ace.signatureBark,
      kind: 'aceMemory',
      id: `aceMemory:${ace.id}:signature`,
      factionId: ace.factionId || 'faction_reach',
      ttl: 2,
    };
    if (voice && typeof voice.say === 'function') voice.say(payload);
    emit(this.bus, 'aceMemory:voice', {
      aceId: ace.id,
      aceName: ace.name,
      situation: 'signature',
      text: ace.signatureBark,
    });
  },
};

function freshPlayerStyle() {
  return {
    counts: { fling: 0, gun: 0, rock: 0 },
    factions: {},
    lastStyle: null,
    lastAt: 0,
    escalatedStyle: null,
  };
}

function normalizeStyleCounts(input) {
  const out = { fling: 0, gun: 0, rock: 0 };
  if (!input || typeof input !== 'object') return out;
  out.fling = input.fling | 0;
  out.gun = input.gun | 0;
  out.rock = input.rock | 0;
  return out;
}

function isStyleValue(value) {
  return value === 'fling' || value === 'gun' || value === 'rock';
}

function normalizePlayerStyle(input) {
  const out = freshPlayerStyle();
  if (!input || typeof input !== 'object') return out;
  out.counts = normalizeStyleCounts(input.counts);
  out.lastStyle = isStyleValue(input.lastStyle) ? input.lastStyle : null;
  out.lastAt = Number.isFinite(input.lastAt) ? Number(input.lastAt) : 0;
  out.escalatedStyle = isStyleValue(input.escalatedStyle) ? input.escalatedStyle : null;
  out.factions = {};
  const factions = input.factions && typeof input.factions === 'object' ? input.factions : {};
  for (const [factionId, raw] of Object.entries(factions)) {
    if (!raw || typeof raw !== 'object') continue;
    const row = normalizeStyleCounts(raw);
    row.escalated = isStyleValue(raw.escalated) ? raw.escalated : null;
    out.factions[factionId] = row;
  }
  return out;
}

function recordPlayerStyleKill(memory, { style, factionId, aceId, now }) {
  if (!isStyleValue(style) || !memory) return null;
  const playerStyle = memory.playerStyle && typeof memory.playerStyle === 'object'
    ? memory.playerStyle
    : (memory.playerStyle = freshPlayerStyle());
  if (!playerStyle.counts || typeof playerStyle.counts !== 'object') {
    playerStyle.counts = { fling: 0, gun: 0, rock: 0 };
  }
  if (!playerStyle.factions || typeof playerStyle.factions !== 'object') playerStyle.factions = {};
  playerStyle.counts[style] = (playerStyle.counts[style] | 0) + 1;
  playerStyle.lastStyle = style;
  playerStyle.lastAt = Number.isFinite(now) ? now : 0;
  if (factionId) {
    const row = playerStyle.factions[factionId] || (playerStyle.factions[factionId] = {
      fling: 0, gun: 0, rock: 0, escalated: null,
    });
    row[style] = (row[style] | 0) + 1;
    if (!row.escalated && (row[style] | 0) >= ACE_STYLE_ESCALATE_AT) {
      row.escalated = style;
      playerStyle.escalatedStyle = playerStyle.escalatedStyle || style;
      for (const ace of knownAces()) {
        if (ace.factionId !== factionId) continue;
        const rec = recordFor(memory, ace);
        if (!rec.escalatedStyle) rec.escalatedStyle = style;
      }
    }
  } else if (!playerStyle.escalatedStyle && (playerStyle.counts[style] | 0) >= ACE_STYLE_ESCALATE_AT) {
    playerStyle.escalatedStyle = style;
  }
  if (aceId) {
    const ace = aceById(aceId);
    if (ace) {
      const rec = recordFor(memory, ace);
      rec.styleKills = normalizeStyleCounts(rec.styleKills);
      rec.styleKills[style] = (rec.styleKills[style] | 0) + 1;
      if (!rec.escalatedStyle && rec.styleKills[style] >= ACE_STYLE_ESCALATE_AT) {
        rec.escalatedStyle = style;
      }
    }
  }
  return playerStyle;
}

function rememberRecentFlung(map, victimId, now) {
  if (!map || victimId == null) return;
  map.set(victimId, Number.isFinite(now) ? now : 0);
  while (map.size > MAX_RECENT_FLINGS) {
    const oldest = map.keys().next().value;
    map.delete(oldest);
  }
}

function wasRecentlyFlung(map, victimId, now) {
  if (!map || victimId == null || !map.has(victimId)) return false;
  const at = map.get(victimId);
  return (Number.isFinite(now) ? now : 0) - at <= FLING_STYLE_WINDOW_S;
}

function forgetRecentFlung(map, victimId) {
  if (map && victimId != null) map.delete(victimId);
}

function matchingRecentTrick(stunts, victimId) {
  const recent = stunts && Array.isArray(stunts.recentTricks) ? stunts.recentTricks : null;
  if (!recent || victimId == null) return null;
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const trick = recent[i];
    if (!trick) continue;
    if (trick.targetId === victimId) return trick;
    const secondary = trick.secondaryIds;
    if (Array.isArray(secondary) && secondary.includes(victimId)) return trick;
  }
  return null;
}

function applyStyleLoadoutToSpec(spec, loadout) {
  if (!spec || !loadout || !loadout.style) return;
  spec.data = spec.data || {};
  spec.data.ai = spec.data.ai || {};
  spec.data.styleKit = {
    style: loadout.style,
    gimmickTag: loadout.gimmickTag,
    doctrineId: loadout.doctrineId,
    weapons: Array.isArray(loadout.weapons) ? loadout.weapons.slice() : [],
    bossArchetype: loadout.bossArchetype,
    escortArchetype: loadout.escortArchetype,
  };
  spec.data.gimmickTag = loadout.gimmickTag;
  if (loadout.doctrineId) spec.data.ai.combatDoctrineId = loadout.doctrineId;
  if (Array.isArray(loadout.capabilities) && loadout.capabilities.length) {
    const caps = new Set(Array.isArray(spec.data.ai.capabilities) ? spec.data.ai.capabilities : []);
    for (const cap of loadout.capabilities) caps.add(cap);
    spec.data.ai.capabilities = [...caps];
  }
  if (Array.isArray(loadout.weapons) && loadout.weapons.length) {
    spec.data.styleWeapons = loadout.weapons.slice();
    const weapons = Array.isArray(spec.data.weapons) ? spec.data.weapons : (spec.data.weapons = []);
    for (const defId of loadout.weapons) {
      if (!defId || weapons.some((entry) => entry && entry.defId === defId)) continue;
      const base = WEAPONS.find((entry) => entry.id === defId);
      if (!base) continue;
      weapons.push({
        ...base,
        slotIndex: weapons.length,
        defId,
        facing: 'front',
        facingAngle: 0,
        gimbalArc: 22 * Math.PI / 180,
        muzzleOffset: [0.8, 0],
        _cooldown: 0,
        _heat: 0,
      });
    }
  }
}

function resolveAce(payload) {
  if (!payload) return null;
  return aceById(payload.aceId || payload.id || payload.captainId)
    || aceByName(payload.aceName || payload.name)
    || aceFromText(payload.text || payload.headline || '');
}

function resolveAceFromEntity(entity) {
  if (!entity || !entity.data) return null;
  const data = entity.data;
  const memory = data.aceMemory || {};
  const ai = data.ai || {};
  return aceById(memory.aceId || data.aceId || ai.aceId)
    || aceByName(memory.aceName || data.aceName || ai.name || data.name)
    || aceFromText(data.callsign || data.name || ai.name || '');
}

function freshMemory() {
  return {
    schemaVersion: ACE_MEMORY_VERSION,
    news: {},
    activeReturns: {},
    cultureIntros: {},
    planetChallenges: {},
    playerStyle: freshPlayerStyle(),
  };
}

function ensureMemory(state) {
  if (!state) return freshMemory();
  state.aceMemory = normalizeMemory(state.aceMemory);
  return state.aceMemory;
}

function normalizeMemory(input) {
  const out = freshMemory();
  if (!input || typeof input !== 'object') return out;
  out.news = clonePlain(input.news || {});
  out.activeReturns = clonePlain(input.activeReturns || {});
  out.cultureIntros = clonePlain(input.cultureIntros || {});
  out.planetChallenges = clonePlain(input.planetChallenges || {});
  out.playerStyle = normalizePlayerStyle(input.playerStyle);
  if (input.aces && typeof input.aces === 'object') {
    for (const [id, rec] of Object.entries(input.aces)) out[id] = normalizeRecord(id, rec);
  }
  for (const [id, rec] of Object.entries(input)) {
    if (META_KEYS.has(id) || id === 'aces') continue;
    if (!rec || typeof rec !== 'object') continue;
    out[id] = normalizeRecord(id, rec);
  }
  return out;
}

function recordFor(memory, ace) {
  const existing = memory[ace.id];
  const rec = normalizeRecord(ace.id, existing, ace);
  memory[ace.id] = rec;
  return rec;
}

function normalizeRecord(id, input, ace = null) {
  const source = ace || aceById(id) || {};
  const rec = input && typeof input === 'object' ? clonePlain(input) : {};
  rec.id = rec.id || id;
  rec.name = rec.name || source.name || id;
  rec.crew = rec.crew || source.crew || 'Unknown Crew';
  rec.gimmickTag = rec.gimmickTag || source.gimmickTag || 'ace';
  rec.encountered = rec.encountered === true;
  rec.fled = rec.fled === true;
  rec.defeated = rec.defeated === true;
  rec.returnScheduled = rec.returnScheduled === true;
  rec.returnsBigger = rec.returnsBigger === true;
  rec.encounterCount = rec.encounterCount | 0;
  rec.fleeCount = rec.fleeCount | 0;
  rec.flungCount = rec.flungCount | 0;
  rec.returnTier = rec.returnTier | 0;
  rec.styleTauntSpoken = rec.styleTauntSpoken === true;
  rec.escalatedStyle = isStyleValue(rec.escalatedStyle) ? rec.escalatedStyle : null;
  rec.styleKills = normalizeStyleCounts(rec.styleKills);
  return rec;
}

function cultureIntroEligible(memory, aceId) {
  if (!REACH_CULTURE_ACES[aceId]) return false;
  const rec = memory && memory[aceId];
  if (!rec || typeof rec !== 'object') return true;
  return rec.defeated !== true
    && rec.fled !== true
    && rec.returnScheduled !== true
    && rec.returned !== true;
}

function cultureIntroDelay(seed, route) {
  return 60 + (hash32(seed, route.aceId, route.sectorId, 'culture-intro') % 31);
}

function planetChallengeEligible(memory, aceId) {
  const ace = aceById(aceId);
  if (!ace) return false;
  const rec = memory && memory[aceId];
  if (!rec || typeof rec !== 'object') return true;
  return rec.encountered !== true
    && rec.fled !== true
    && rec.defeated !== true
    && rec.returnScheduled !== true
    && rec.returned !== true;
}

function planetChallengeDelay(seed, assignment, aceId) {
  return 8 + (hash32(seed, assignment.seed, aceId, 'planet-challenge') % 5);
}

function seedOf(state) {
  return state && state.meta && Number.isFinite(state.meta.seed) ? state.meta.seed >>> 0 : 0;
}

function nowOf(state, payload) {
  if (payload && Number.isFinite(payload.t)) return Number(payload.t);
  return state && Number.isFinite(state.simTime) ? state.simTime : 0;
}

function sectorOf(state, payload) {
  if (payload && payload.sectorId) return payload.sectorId;
  return state && state.world && state.world.currentSectorId || null;
}

function returnPosition(state, ace, rec, index) {
  const player = state && state.entities && state.entities.get(state.playerId);
  const anchor = player && player.pos || { x: 0, z: 0 };
  const seed = seedOf(state);
  const h = hash32(seed, ace.id, rec.returnSeed || 0, 'return-pos', index | 0);
  const angle = (h / 0x100000000) * Math.PI * 2;
  const radius = index === 0 ? 900 : 120 + index * 35;
  const bossH = hash32(seed, ace.id, rec.returnSeed || 0, 'return-pos', 0);
  const bossAngle = (bossH / 0x100000000) * Math.PI * 2;
  const center = {
    x: anchor.x + Math.cos(bossAngle) * 900,
    z: anchor.z + Math.sin(bossAngle) * 900,
  };
  if (index === 0) return center;
  return {
    x: center.x + Math.cos(angle) * radius,
    z: center.z + Math.sin(angle) * radius,
  };
}

function rememberActiveReturn(state, entityId, aceId, requestId) {
  const memory = state && state.aceMemory && typeof state.aceMemory === 'object'
    ? state.aceMemory
    : ensureMemory(state);
  if (!memory.activeReturns || typeof memory.activeReturns !== 'object') memory.activeReturns = {};
  memory.activeReturns[String(entityId)] = { aceId, requestId };
}

function emit(bus, evt, payload) {
  if (bus && typeof bus.emit === 'function') bus.emit(evt, payload);
}

function clonePlain(v) {
  if (v == null) return v;
  return JSON.parse(JSON.stringify(v));
}

export default aceMemory;
