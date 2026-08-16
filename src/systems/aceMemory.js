// BP-13/B10 Named Crews & Aces.
//
// Durable lifecycle owner: records named-ace outcomes, schedules director-owned first contacts,
// spawns its established promoted-return crews and the bounded neutral Rival peer, and emits the
// station-news seam. It never owns hostile first-contact entities or changes hostility.
import {
  PIRATE_PROMOTION_MAX_TIER,
  RECURRING_RIVAL,
  REACH_CULTURE_ACES,
  aceById,
  aceByName,
  aceFromText,
  newsForAceTransition,
  returnPlanForAce,
} from '../data/namedAces.js';
import { timeTrialCourseById } from '../data/timeTrialCourses.js';
import { planetStatesForSector } from '../data/planetStates.js';
import { hash32 } from '../core/rng.js';
import { makeShipEntitySpec } from './ships.js';
import { resolveTimeTrialPoint } from './timeTrials.js';

export const ACE_MEMORY_VERSION = 3;

const META_KEYS = new Set(['schemaVersion', 'news', 'activeReturns', 'cultureIntros', 'planetChallenges', 'rival']);
const RETURN_CHECK_S = 0.5;
const RIVAL_RECORD_SCHEMA = 'spaceface.recurringRival.v1';
const RIVAL_WORLD_RECORD_ID = `recurring-rival:${RECURRING_RIVAL.id}`;
const RIVAL_FINISH_RADIUS_WU = 110;
const RIVAL_DEPART_DELAY_S = 10;
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
    this._listen('sector:exit', () => this._retireRival('sector_exit'));
    this._listen('timeTrial:started', (p) => this._rivalTrialStarted(p));
    this._listen('timeTrial:completed', (p) => this._rivalTrialCompleted(p));
    this._listen('timeTrial:invalidated', (p) => this._rivalTrialInvalidated(p));
    this._listen('save:loaded', () => {
      this._rearmCultureIntroAfterLoad();
      this._rearmPlanetChallengesAfterLoad();
      this._adoptRivalEntity();
    });
    this._listen('entity:killed', (p) => this._namedAceKilled(p));
    this._listen('law:custodyTransfer', (p) => this._namedAceCustody(p));
    this._listen('massline:tumbled', (p) => this._flung(p));
    this._listen('aceMemory:playerKilled', (p) => this._playerKilled(p));
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
    this._processRival(state);
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
    let rec = recordFor(ensureMemory(this.state), ace);
    const first = rec.encountered !== true;
    rec.encountered = true;
    rec.encounterCount = (rec.encounterCount | 0) + 1;
    rec.lastSeenAt = nowOf(this.state, payload);
    rec.lastSectorId = sectorOf(this.state, payload);
    this._completePlanetChallenge(ace.id, 'appeared', payload);
    // Planet-challenge normalization replaces the saved memory bag. Re-adopt the live record before
    // consuming one-shot voice latches so the cleared bit is not written onto a detached clone.
    rec = recordFor(ensureMemory(this.state), ace);
    if (first) this._emitTransition('encountered', ace, rec);
    if (payload && payload.signatureSpoken === true) rec.signatureSpoken = true;
    if (!rec.signatureSpoken) {
      rec.signatureSpoken = true;
      this._speakSignature(ace);
    }
    if (rec.playerKillAcknowledgmentPending === true) {
      rec.playerKillAcknowledgmentPending = false;
      rec.playerKillAcknowledgedAt = nowOf(this.state, payload);
      rec.playerKillAcknowledgedCount = (rec.playerKillAcknowledgedCount | 0) + 1;
      this._speakPlayerKillAcknowledgment(ace, rec);
    }
  },

  _playerKilled(payload) {
    const killer = payload && payload.killerId != null && this.state && this.state.entities
      ? this.state.entities.get(payload.killerId) : null;
    const ace = resolveAceFromEntity(killer);
    if (!ace) return false;
    const rec = recordFor(ensureMemory(this.state), ace);
    rec.encountered = true;
    rec.playerKillCount = (rec.playerKillCount | 0) + 1;
    rec.playerKillAcknowledgmentPending = true;
    rec.lastPlayerKillAt = nowOf(this.state, payload);
    rec.lastPlayerLossId = payload.lossId || null;
    rec.lastSeenAt = rec.lastPlayerKillAt;
    rec.lastSectorId = sectorOf(this.state, payload);
    emit(this.bus, 'aceMemory:playerKillRemembered', {
      aceId: ace.id,
      aceName: ace.name,
      lossId: rec.lastPlayerLossId,
      t: rec.lastPlayerKillAt,
    });
    return true;
  },

  _namedAceKilled(payload) {
    if (!payload || payload.killerId !== this.state.playerId || payload.id == null) return false;
    const entity = this.state.entities && this.state.entities.get(payload.id);
    const ace = resolveAceFromEntity(entity);
    const reward = ace && ace.reward;
    if (!ace || !reward) return false;
    const rec = recordFor(ensureMemory(this.state), ace);
    return this._claimAceReward(ace, rec, payload, { physicalClaimed: true });
  },

  _namedAceCustody(payload) {
    if (!payload || payload.entityId == null) return false;
    const entity = this.state.entities && this.state.entities.get(payload.entityId);
    const ace = resolveAceFromEntity(entity);
    if (!ace || !ace.reward) return false;
    this._transition('defeated', {
      aceId: ace.id,
      sectorId: sectorOf(this.state, payload),
      t: payload.t,
    });
    const rec = recordFor(ensureMemory(this.state), ace);
    rec.captured = true;
    rec.capturedAt = nowOf(this.state, payload);
    rec.custodyReceiptId = payload.custodyReceiptId || payload.id || null;
    return this._claimAceReward(ace, rec, payload, {
      physicalClaimed: false,
      custodyReceiptId: rec.custodyReceiptId,
    });
  },

  _claimAceReward(ace, rec, payload, options = {}) {
    const reward = ace && ace.reward;
    if (!reward || rec.rewardClaimed === true) return false;
    rec.rewardClaimed = true;
    rec.rewardClaimedAt = nowOf(this.state, payload);
    rec.physicalRewardId = options.physicalClaimed === false ? null : (reward.uniqueItemId || null);
    rec.physicalRewardSecuredByCustody = options.physicalClaimed === false;
    rec.namedTechId = reward.techId || null;
    rec.namedTechLabel = reward.techLabel || null;
    if (reward.researchPoints > 0 && reward.techId) {
      emit(this.bus, 'research:grant', {
        amount: reward.researchPoints,
        source: reward.techId,
        receiptId: `named-ace:${ace.id}:tech`,
      });
    }
    emit(this.bus, 'aceMemory:rewardUnlocked', {
      aceId: ace.id,
      aceName: ace.name,
      uniqueItemId: reward.uniqueItemId || null,
      physicalLabel: reward.physicalLabel || null,
      physicalClaimed: options.physicalClaimed !== false,
      custodyReceiptId: options.custodyReceiptId || null,
      techId: reward.techId || null,
      techLabel: reward.techLabel || null,
      researchPoints: reward.researchPoints || 0,
      t: rec.rewardClaimedAt,
    });
    return true;
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
    const entity = victimId != null && this.state && this.state.entities
      ? this.state.entities.get(victimId)
      : null;
    const ace = resolveAceFromEntity(entity);
    if (!ace) return;
    const rec = recordFor(ensureMemory(this.state), ace);
    rec.encountered = true;
    rec.flungCount = (rec.flungCount | 0) + 1;
    rec.lastFlungAt = nowOf(this.state, payload);
    rec.lastFlungCause = String(payload.cause || 'massline');
    rec.lastFlungSpin = Number.isFinite(payload.spin) ? payload.spin : 0;
    rec.lastSeenAt = rec.lastFlungAt;
    rec.lastSectorId = sectorOf(this.state, payload);
    this._emitTransition('flung', ace, rec);
  },

  // ── Plan 52 recurring peer ────────────────────────────────────────────────────────────────
  // A completed physical course is the history gate. The resulting memory owns only Kei's own
  // appearances and head-to-head outcomes; it never mirrors the player's general history.
  _rivalTrialCompleted(payload) {
    const course = timeTrialCourseById(payload && payload.courseId);
    if (!course) return false;
    const rival = rivalRecordFor(ensureMemory(this.state));
    if (rival.unlocked !== true) {
      rival.unlocked = true;
      rival.triggerCourseId = course.id;
      rival.unlockedAt = nowOf(this.state, payload);
      const entity = this._spawnRival(course, 'intro', rival);
      if (!entity) {
        rival.lastSpawnFailure = 'intro_unavailable';
        return false;
      }
      rival.introSeen = true;
      this._speakRival('intro');
      emit(this.bus, 'recurringRival:unlocked', {
        rivalId: RECURRING_RIVAL.id,
        rivalName: RECURRING_RIVAL.name,
        courseId: course.id,
        entityId: entity.id,
      });
      return true;
    }
    const race = rival.activeRace;
    if (!race || race.courseId !== course.id || race.status !== 'running') return false;
    return this._finishRivalRace('player', payload);
  },

  _rivalTrialStarted(payload) {
    const course = timeTrialCourseById(payload && payload.courseId);
    const rival = rivalRecordFor(ensureMemory(this.state));
    if (!course || rival.unlocked !== true || rival.activeRace) return false;
    rival.activeRace = {
      courseId: course.id,
      status: 'running',
      startedAt: nowOf(this.state, payload),
      startedTick: Number.isInteger(payload && payload.startedTick)
        ? payload.startedTick : (this.state && this.state.tick) || 0,
      entityId: null,
    };
    const entity = this._spawnRival(course, 'race', rival);
    if (!entity) {
      rival.lastSpawnFailure = 'race_unavailable';
      rival.activeRace = null;
      return false;
    }
    rival.racesStarted += 1;
    rival.activeRace.entityId = entity.id;
    this._speakRival('challenge');
    emit(this.bus, 'recurringRival:raceStarted', {
      rivalId: RECURRING_RIVAL.id,
      rivalName: RECURRING_RIVAL.name,
      courseId: course.id,
      entityId: entity.id,
    });
    return true;
  },

  _rivalTrialInvalidated(payload) {
    const rival = rivalRecordFor(ensureMemory(this.state));
    const race = rival.activeRace;
    if (!race || race.status !== 'running' || race.courseId !== (payload && payload.courseId)) return false;
    return this._finishRivalRace('rival', { ...payload, invalidated: true });
  },

  _processRival(state) {
    const rival = rivalRecordFor(ensureMemory(state));
    const now = nowOf(state);
    if (Number.isFinite(rival.retireAt) && rival.retireAt <= now) {
      this._retireRival('appearance_complete');
      return;
    }
    const race = rival.activeRace;
    if (!race || race.status !== 'running') return;
    const entity = this._rivalEntity(rival);
    const course = timeTrialCourseById(race.courseId);
    if (!entity || !course || !course.gates.length) return;
    const finish = resolveTimeTrialPoint(course, course.gates[course.gates.length - 1].center, state);
    if (!finish) return;
    const dx = entity.pos.x - finish.x;
    const dz = entity.pos.z - finish.z;
    if (dx * dx + dz * dz <= RIVAL_FINISH_RADIUS_WU * RIVAL_FINISH_RADIUS_WU) {
      this._finishRivalRace('rival', { physicalFinish: true });
    }
  },

  _spawnRival(course, context, rivalRecord = null) {
    if (!course || !this.helpers || typeof this.helpers.spawnEntity !== 'function') return null;
    const rival = rivalRecord || rivalRecordFor(ensureMemory(this.state));
    let entity = this._rivalEntity(rival);
    const spawnPos = rivalSpawnPosition(course, this.state, context);
    const jobs = this.helpers.npcJobs;
    // A fresh race appearance must enter beside Gate 1. Retire the post-finish intro hull through
    // the same job/entity owners instead of teleporting a live Rapier body across the sector.
    if (context === 'race' && entity && entity.data && entity.data.rivalAppearance !== 'race') {
      if (entity.data.jobId && jobs && typeof jobs.release === 'function') jobs.release(entity.data.jobId);
      this._removeRivalEntity(entity);
      entity = null;
    }
    const appearanceWorldRecordId = entity && entity.data && entity.data.worldRecordId
      || `${RIVAL_WORLD_RECORD_ID}:appearance:${rival.appearances + 1}`;
    if (!entity) {
      const spec = makeShipEntitySpec(RECURRING_RIVAL.shipDefId, {
        team: 2,
        factionId: RECURRING_RIVAL.factionId,
        pos: spawnPos,
        appearance: RECURRING_RIVAL.appearance,
        ai: { archetype: 'harrier_kiter', passive: true, spawnContext: 'recurring_rival' },
      });
      spec.collides = true;
      spec.flags = { persistent: true };
      spec.data = {
        ...spec.data,
        name: RECURRING_RIVAL.name,
        callsign: RECURRING_RIVAL.name,
        scanLabel: `${RECURRING_RIVAL.name} / SECOND LINE`,
        namedRivalId: RECURRING_RIVAL.id,
        aceTierPeer: true,
        worldRecordId: appearanceWorldRecordId,
        sectorId: course.sectorId,
        homeSectorId: course.sectorId,
        jobKind: 'patrol',
      };
      entity = this.helpers.spawnEntity(spec);
      if (!entity) return null;
    }
    entity.team = 2;
    entity.factionId = RECURRING_RIVAL.factionId;
    entity.flags = { ...(entity.flags || {}), persistent: true };
    entity.data = {
      ...(entity.data || {}),
      namedRivalId: RECURRING_RIVAL.id,
      worldRecordId: appearanceWorldRecordId,
      sectorId: course.sectorId,
      homeSectorId: course.sectorId,
      jobKind: 'patrol',
      rivalAppearance: context,
    };
    entity.data.ai = { ...(entity.data.ai || {}), passive: true, spawnContext: 'recurring_rival' };

    if (!jobs || typeof jobs.assign !== 'function') {
      this._removeRivalEntity(entity);
      return null;
    }
    if (entity.data.jobId && typeof jobs.release === 'function') jobs.release(entity.data.jobId);
    delete entity.data.jobId;
    const route = rivalRouteForCourse(course, this.state, spawnPos);
    const jobId = jobs.assign(entity, {
      kind: 'patrol',
      sectorId: course.sectorId,
      route,
      speed: 170,
      commissionS: 0.1,
      approachS: 0.1,
      dwellS: 0.1,
    });
    if (!jobId) {
      this._removeRivalEntity(entity);
      return null;
    }
    entity.data.jobId = jobId;
    rival.activeEntityId = entity.id;
    rival.activeWorldRecordId = appearanceWorldRecordId;
    rival.appearances += 1;
    rival.lastAppearance = context;
    rival.lastCourseId = course.id;
    rival.lastSeenAt = nowOf(this.state);
    rival.retireAt = context === 'intro' ? rival.lastSeenAt + RIVAL_DEPART_DELAY_S : null;
    emit(this.bus, 'recurringRival:appeared', {
      rivalId: RECURRING_RIVAL.id,
      rivalName: RECURRING_RIVAL.name,
      courseId: course.id,
      context,
      entityId: entity.id,
      jobId,
      physical: true,
      hostile: false,
    });
    return entity;
  },

  _finishRivalRace(winner, payload = {}) {
    const rival = rivalRecordFor(ensureMemory(this.state));
    const race = rival.activeRace;
    if (!race || race.status !== 'running' || (winner !== 'player' && winner !== 'rival')) return false;
    race.status = 'finished';
    race.winner = winner;
    race.finishedAt = nowOf(this.state, payload);
    race.physicalRivalFinish = payload.physicalFinish === true;
    race.playerInvalidated = payload.invalidated === true;
    if (winner === 'player') rival.playerWins += 1;
    else rival.rivalWins += 1;
    rival.lastRace = clonePlain(race);
    rival.retireAt = race.finishedAt + RIVAL_DEPART_DELAY_S;
    this._speakRival(winner === 'player' ? 'playerWon'
      : (payload.invalidated === true ? 'invalidated' : 'rivalWon'));
    emit(this.bus, 'recurringRival:raceResolved', {
      rivalId: RECURRING_RIVAL.id,
      rivalName: RECURRING_RIVAL.name,
      courseId: race.courseId,
      winner,
      entityId: rival.activeEntityId,
      physicalRivalFinish: race.physicalRivalFinish,
      playerInvalidated: race.playerInvalidated,
    });
    return true;
  },

  _rivalEntity(rivalRecord = null) {
    const rival = rivalRecord || rivalRecordFor(ensureMemory(this.state));
    const entities = this.state && this.state.entities;
    if (!entities || typeof entities.values !== 'function') return null;
    const direct = rival.activeEntityId != null && typeof entities.get === 'function'
      ? entities.get(rival.activeEntityId) : null;
    if (direct && direct.alive !== false && direct.data && direct.data.namedRivalId === RECURRING_RIVAL.id) {
      return direct;
    }
    for (const entity of entities.values()) {
      if (entity && entity.alive !== false && entity.data
        && (entity.data.namedRivalId === RECURRING_RIVAL.id
          || (typeof entity.data.worldRecordId === 'string'
            && entity.data.worldRecordId.startsWith(`${RIVAL_WORLD_RECORD_ID}:appearance:`)))) {
        rival.activeEntityId = entity.id;
        return entity;
      }
    }
    rival.activeEntityId = null;
    return null;
  },

  _adoptRivalEntity() {
    const rival = rivalRecordFor(ensureMemory(this.state));
    const entity = this._rivalEntity(rival);
    if (rival.activeRace && rival.activeRace.status === 'running') {
      rival.lastRace = { ...clonePlain(rival.activeRace), status: 'interrupted', reason: 'continue' };
      rival.activeRace = null;
    }
    if (entity) rival.retireAt = nowOf(this.state) + 1;
    return entity;
  },

  _retireRival(reason) {
    const rival = rivalRecordFor(ensureMemory(this.state));
    const entity = this._rivalEntity(rival);
    if (entity && entity.data && entity.data.jobId) {
      const release = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.release;
      if (typeof release === 'function') release(entity.data.jobId);
      delete entity.data.jobId;
    }
    if (entity) this._removeRivalEntity(entity);
    if (rival.activeRace && rival.activeRace.status === 'running') {
      rival.lastRace = { ...clonePlain(rival.activeRace), status: 'interrupted', reason };
    }
    rival.activeRace = null;
    rival.activeEntityId = null;
    rival.activeWorldRecordId = null;
    rival.retireAt = null;
    return !!entity;
  },

  _removeRivalEntity(entity) {
    if (!entity) return;
    if (this.helpers && typeof this.helpers.removeEntity === 'function') this.helpers.removeEntity(entity.id);
    else entity.alive = false;
  },

  _speakRival(situation) {
    const text = RECURRING_RIVAL.barks && RECURRING_RIVAL.barks[situation];
    if (!text) return;
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') voice.say({
      channel: 'bark',
      text,
      kind: 'recurringRival',
      id: `recurringRival:${RECURRING_RIVAL.id}:${situation}`,
      factionId: RECURRING_RIVAL.factionId,
      ttl: 2,
    });
    emit(this.bus, 'recurringRival:voice', {
      rivalId: RECURRING_RIVAL.id,
      rivalName: RECURRING_RIVAL.name,
      situation,
      text,
    });
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
    const requestId = `aceReturn:${ace.id}:${rec.returnSeed || 0}:${rec.returnTier || 1}`;
    emit(this.bus, 'aceMemory:returnRequested', {
      aceId: ace.id,
      aceName: ace.name,
      requestId,
      returnTier: rec.returnTier || 1,
    });
    const director = this.registry && this.registry.get('encounterDirector');
    if (!director || typeof director.requestAuthoredEncounter !== 'function') {
      rec.nextReturnAttemptAt = now + 10;
      return;
    }
    const result = director.requestAuthoredEncounter({
      shapeId: 'named_hunter',
      encounterId: requestId,
      sectorId: sectorOf(this.state),
      force: true,
      // The deterministic 6-13 minute return plan is already the recurrence pacing gate. Reapplying
      // the generic encounter cooldown here can postpone the authored return indefinitely.
      respectPacing: false,
      data: {
        aceId: ace.id,
        recurrence: true,
        returnTier: rec.returnTier || 1,
      },
    });
    if (!result || result.ok !== true) {
      rec.nextReturnAttemptAt = now + 10;
      rec.lastReturnRejectReason = result && result.reason || 'unavailable';
      return;
    }
    // `namedAce:appeared` is synchronous and its planet-challenge normalizer may replace the saved
    // memory bag. Re-adopt the current record before clearing the recurrence latch.
    rec = recordFor(ensureMemory(this.state), ace);
    const live = this.state.encounterDirector
      && this.state.encounterDirector.live
      && this.state.encounterDirector.live[requestId];
    const spawnedIds = live && Array.isArray(live.ids) ? live.ids.slice() : [];
    rec.returnScheduled = false;
    rec.returned = true;
    rec.returnedAt = now;
    rec.returnRequestId = requestId;
    rec.returnEncounterId = requestId;
    rec.spawnedCount = spawnedIds.length;
    emit(this.bus, 'aceMemory:returnSpawned', {
      aceId: ace.id,
      aceName: ace.name,
      requestId,
      returnTier: rec.returnTier || 1,
      spawnedIds: spawnedIds.slice(),
      t: now,
    });
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

  _speakPlayerKillAcknowledgment(ace, rec) {
    const text = ace.barks && ace.barks.playerLoss
      || `${ace.name}: back in another hull? I remember how the last one opened.`;
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({
        channel: 'bark',
        text,
        kind: 'aceMemory',
        id: `aceMemory:${ace.id}:player-loss:${rec.playerKillAcknowledgedCount | 0}`,
        factionId: ace.factionId || 'faction_reach',
        ttl: 2.5,
      });
    }
    emit(this.bus, 'aceMemory:voice', {
      aceId: ace.id,
      aceName: ace.name,
      situation: 'player_loss_acknowledgment',
      lossId: rec.lastPlayerLossId || null,
      text,
    });
  },
};

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
  return aceById(memory.aceId || data.namedAceId || data.aceId || ai.namedAceId || ai.aceId)
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
    rival: freshRivalRecord(),
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
  out.rival = normalizeRivalRecord(input.rival);
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

function rivalRecordFor(memory) {
  const record = normalizeRivalRecord(memory && memory.rival);
  if (memory) memory.rival = record;
  return record;
}

function freshRivalRecord() {
  return {
    schema: RIVAL_RECORD_SCHEMA,
    rivalId: RECURRING_RIVAL.id,
    rivalName: RECURRING_RIVAL.name,
    unlocked: false,
    introSeen: false,
    appearances: 0,
    racesStarted: 0,
    playerWins: 0,
    rivalWins: 0,
    activeEntityId: null,
    activeWorldRecordId: null,
    activeRace: null,
    lastRace: null,
    retireAt: null,
  };
}

function normalizeRivalRecord(input) {
  const out = freshRivalRecord();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  out.unlocked = input.unlocked === true;
  out.introSeen = input.introSeen === true;
  out.appearances = Math.max(0, Math.floor(Number(input.appearances) || 0));
  out.racesStarted = Math.max(0, Math.floor(Number(input.racesStarted) || 0));
  out.playerWins = Math.max(0, Math.floor(Number(input.playerWins) || 0));
  out.rivalWins = Math.max(0, Math.floor(Number(input.rivalWins) || 0));
  out.triggerCourseId = typeof input.triggerCourseId === 'string' ? input.triggerCourseId : null;
  out.lastCourseId = typeof input.lastCourseId === 'string' ? input.lastCourseId : null;
  out.lastAppearance = typeof input.lastAppearance === 'string' ? input.lastAppearance : null;
  out.unlockedAt = Number.isFinite(input.unlockedAt) ? input.unlockedAt : null;
  out.lastSeenAt = Number.isFinite(input.lastSeenAt) ? input.lastSeenAt : null;
  out.retireAt = Number.isFinite(input.retireAt) ? input.retireAt : null;
  out.activeEntityId = input.activeEntityId != null ? input.activeEntityId : null;
  out.activeWorldRecordId = typeof input.activeWorldRecordId === 'string'
    ? input.activeWorldRecordId : null;
  out.activeRace = normalizeRivalRace(input.activeRace);
  out.lastRace = normalizeRivalRace(input.lastRace, true);
  out.lastSpawnFailure = typeof input.lastSpawnFailure === 'string' ? input.lastSpawnFailure : null;
  return out;
}

function normalizeRivalRace(input, allowTerminal = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || typeof input.courseId !== 'string') return null;
  const legalStatus = allowTerminal
    ? new Set(['running', 'finished', 'interrupted'])
    : new Set(['running', 'finished']);
  const status = legalStatus.has(input.status) ? input.status : 'running';
  return {
    courseId: input.courseId,
    status,
    startedAt: Number.isFinite(input.startedAt) ? input.startedAt : 0,
    startedTick: Number.isInteger(input.startedTick) ? input.startedTick : 0,
    entityId: input.entityId != null ? input.entityId : null,
    winner: input.winner === 'player' || input.winner === 'rival' ? input.winner : null,
    finishedAt: Number.isFinite(input.finishedAt) ? input.finishedAt : null,
    physicalRivalFinish: input.physicalRivalFinish === true,
    playerInvalidated: input.playerInvalidated === true,
    reason: typeof input.reason === 'string' ? input.reason : null,
  };
}

function rivalSpawnPosition(course, state, context) {
  const player = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId) : null;
  const first = course && course.gates && course.gates[0]
    ? resolveTimeTrialPoint(course, course.gates[0].center, state) : null;
  const second = course && course.gates && course.gates[1]
    ? resolveTimeTrialPoint(course, course.gates[1].center, state) : null;
  if (context === 'race' && first && second) {
    const dx = second.x - first.x;
    const dz = second.z - first.z;
    const length = Math.max(1, Math.hypot(dx, dz));
    return {
      x: first.x - (dx / length) * 70 - (dz / length) * 72,
      z: first.z - (dz / length) * 70 + (dx / length) * 72,
    };
  }
  const anchor = player && player.pos || first || { x: 0, z: 0 };
  const angle = (hash32(seedOf(state), RECURRING_RIVAL.id, 'intro-bearing') / 0x100000000)
    * Math.PI * 2;
  return { x: anchor.x + Math.cos(angle) * 150, z: anchor.z + Math.sin(angle) * 150 };
}

function rivalRouteForCourse(course, state, spawnPos) {
  const route = [];
  for (let index = 0; index < (course.gates || []).length; index += 1) {
    const point = resolveTimeTrialPoint(course, course.gates[index].center, state);
    if (!point) continue;
    route.push({
      id: `rival-gate:${course.id}:${index}`,
      pos: { x: point.x, z: point.z },
      label: `Gate ${index + 1}`,
    });
  }
  if (route.length >= 2) return route;
  return [
    { id: `rival-hold:${course.id}:0`, pos: { x: spawnPos.x, z: spawnPos.z }, label: 'Second Line' },
    { id: `rival-hold:${course.id}:1`, pos: { x: spawnPos.x + 140, z: spawnPos.z + 60 }, label: 'Warm Line' },
  ];
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

function emit(bus, evt, payload) {
  if (bus && typeof bus.emit === 'function') bus.emit(evt, payload);
}

function clonePlain(v) {
  if (v == null) return v;
  return JSON.parse(JSON.stringify(v));
}

export default aceMemory;
