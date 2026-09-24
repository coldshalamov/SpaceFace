// BP-05.1/BARK-01 situational radio cadence.
//
// Observer-only voice surfacing for already-live ship state. It reads AI/contact transitions,
// routes faction-specific lines through voiceArbiter's bark channel, and writes only its own
// state.barkDirector receipt cache so combat/AI/economy behavior stays unchanged.
import {
  BARK_SITUATIONS,
  barkFor,
  historyBarkFor,
  hullRecognitionBarkFor,
  pursuitBarkFor,
  surrenderBarkFor,
  witnessCrimeBarkFor,
} from '../data/barks.js';
import { aceTrophyBarkFor } from '../data/conflictReactions.js';
import { trophyFromFittings } from '../data/sectors.js';
import { aceById, factionHistoryFromMemory } from '../data/namedAces.js';
import {
  CARGO_OWNER_REACTIONS,
  cargoIdentityOf,
  identityFromManifest,
  reactionForSpill,
} from '../data/cargoIdentity.js';
import { contactGrammarFor } from '../data/factionContactGrammar.js';
import { hash32 } from '../core/rng.js';
import { isHostileToPlayer } from './scanner.js';
import { getOccupationalSilhouetteRule } from '../data/occupationalSilhouettes.js';
import { shouldOwnerThink } from '../core/activityScheduler.js';
import { tableSimAuthorityWuFromState } from '../render/tabletopPolicy.js';
import { ensureActivityClassified } from '../world/activityRuntime.js';
import { forEachLivingWorldActor, indexedTypeScan } from '../world/livingWorldViews.js';
import { activeHullIdentity } from '../data/hullIdentity.js';
import { livingHullNotoriety } from '../core/livingHull.js';
import { adventureStunts, completeWitness, incidentIdentity, knownStuntTitles, observerProfile, STUNT_SITUATION_LINES, STUNT_TITLE_RULES, witnessLineOfSight } from '../combat/stuntWitnesses.js';
import { HITSTUN_IMPULSE_EVENT } from '../combat/impulseKernel.js';

const BARK_SET = new Set(BARK_SITUATIONS);
const VOICE_TTL_S = 1.2;
const PLAYER_TEAM = 0;
export const POST_COMBAT_SILENCE_S = 8.0;
export const AMBIENT_BASE_GAP_S = 12.0;
export const AMBIENT_GAP_STEP_S = 12.0;
export const AMBIENT_QUIET_STEP_S = 60.0;
export const AMBIENT_MAX_GAP_S = 60.0;
export const BODY_NEAR_MISS_RADIUS_WU = 70;
export const BODY_NEAR_MISS_EXIT_WU = 90;
export const BODY_NEAR_MISS_WINDOW_TICKS = 480;
export const BODY_NEAR_MISS_COOLDOWN_TICKS = 120;

// PQ-142.01 hull recognition. `design/VISION.md` Part II: the ship earns "a reputation by hull —
// until it is my fucking ship." A witness who was in the room when the hull did something says the
// SHIP'S NAME, not "unidentified vessel".
//
// Deliberately exempt from the post-combat silence window: the silence exists so flavour chatter
// does not talk over a fight's tail, and this line IS the tail of the fight — the moment the act
// lands on the hull's name. It carries its own, much longer gap instead.
export const HULL_RECOGNITION_GAP_S = 24.0;
export const HULL_RECOGNITION_TTL_S = 3.0;
/** No witness, no recognition: a hull is only known by somebody who was close enough to see it. */
export const HULL_RECOGNITION_FALLBACK_RANGE_WU = 900;

// PQ-146.02 stunt recognition: an NPC witness speaks the title of a witnessed trick.
// Like hull recognition, exempt from post-combat silence.
export const STUNT_RECOGNITION_GAP_S = 8.0;
export const STUNT_RECOGNITION_TTL_S = 3.0;

export const STUNT_BARKS = Object.freeze({
  faction_scn: Object.freeze([
    'Concord advisory: telemetry confirms {title} maneuver. Incident logged. Ref 44-C.',
    'Maneuver classified as {title}. File the citation under non-standard kinetics.',
    'Visual confirmation: {title}. The incident log has been updated.',
    'That was a {title}. Ref 44-C citation pending review.',
  ]),
  faction_mts: Object.freeze([
    'Meridian floor: that {title} just moved the salvage spread.',
    'A clean {title}. That kind of flying carries a premium.',
    'Did you see that {title}? Put a price on that pilot.',
    'That {title} is going to cost somebody a fortune.',
  ]),
  faction_dmc: Object.freeze([
    'Looked like a {title} from here. Glad I am off-shift.',
    'A {title}... just what this shift needed.',
    'Saw that {title}. Somebody else can clean up the scrap.',
    'Drift channel: caught that {title}. Messy work, but it holds.',
  ]),
  faction_reach: Object.freeze([
    'Did you see that? A real {title} out in the black!',
    'Holy shit, that was a {title}! They actually pulled it off!',
    'That {title} was wicked! Watch your flank!',
    'Broke them with a {title}! That pilot does not play!',
  ]),
  faction_quiet: Object.freeze([
    '{title}. Clean.',
    'Witnessed: {title}.',
    '{title}. Done.',
    'Seen. {title}.',
  ]),
  faction_choir: Object.freeze([
    'The Pattern sings the {title}. A violent geometry.',
    'Witness the {title}: the arc completes itself.',
    'A {title} offered to the void. The chorus widens.',
    'Behold the {title}. The Pattern weaves the rupture.',
  ]),
  faction_free: Object.freeze([
    'Now that was a proper {title}! Hell of a throw!',
    'Never seen a {title} pulled off like that out here.',
    'Frontier net: somebody just landed a {title}. Good shooting.',
    'That was a {title} if I ever saw one. Clear the lane for them.',
  ]),
  faction_vael: Object.freeze([
    'Clause seven observed: the kinetics fulfill the definition of {title}.',
    'Maneuver registered as {title}. Accord terms acknowledged.',
    'The {title} is entered into the record without dispute.',
    'Kinetic clause satisfied: {title}. The terms stand amended.',
  ]),
});

export const CARGO_SPILL_BARKS = Object.freeze({
  restitution: '{owner} demands restitution for the spilled cargo.',
  bounty: '{owner} posted a bounty. That cargo had a name.',
  thanks: '{owner} sends thanks. The cargo is home.',
});

/** Map a live spill/jettison/kill seam onto a reactionForSpill cause. */
export function cargoSpillCauseOf(eventName, payload = {}) {
  const raw = payload && (payload.cause || payload.reason || payload.kind) || '';
  const c = String(raw).toLowerCase();
  if (c.includes('return') || c.includes('help') || c.includes('thanks') || c.includes('assist')) {
    return 'return';
  }
  if (eventName === 'entity:killed'
    || c.includes('kill')
    || c.includes('destroy')
    || c.includes('death')
    || c === 'carrier_destroyed') {
    return 'killed';
  }
  if (eventName === 'cargo:jettisoned' || c.includes('jettison')) return 'jettison';
  return 'spill';
}

export function cargoSpillBarkText(ownerName, reaction) {
  const template = CARGO_SPILL_BARKS[reaction] || '{owner} marked the spill.';
  return template.replace(/\{owner\}/g, String(ownerName || 'Unknown owner'));
}

export function cargoSpillLedgerText(ownerName, reaction) {
  const verb = (CARGO_OWNER_REACTIONS[reaction] && CARGO_OWNER_REACTIONS[reaction].ledgerVerb)
    || reaction
    || 'spill';
  return `${ownerName || 'Unknown owner'} — ${verb} after the spill.`;
}

export function stuntRecognitionBarkFor(factionId, rng, tokens = {}) {
  const faction = (factionId && STUNT_BARKS[factionId]) ? STUNT_BARKS[factionId] : STUNT_BARKS.faction_free;
  let idx = 0;
  if (typeof rng === 'number' && Number.isFinite(rng)) {
    idx = ((Math.floor(rng) % faction.length) + faction.length) % faction.length;
  } else if (typeof rng === 'function') {
    const v = rng();
    const f = (typeof v === 'number' && Number.isFinite(v)) ? v : 0;
    idx = Math.floor(Math.max(0, Math.min(0.9999999, f)) * faction.length);
  }
  const line = faction[idx] || faction[0];
  return line.replace(/\{title\}/g, String(tokens.title || 'Stunt'));
}

// Feature 18: neutral haulers/mining barges hail the player on a close pass. The bark budget
// (once per entity per situation + ambient sector decay + post-combat silence) is the spam gate;
// the foghorn only sounds when the chirp actually lands on the comms ribbon.
const PASS_HAIL_ROLES = new Set(['heavy', 'miner']);
const PASS_HAIL_RANGE_WU = 300;
const PASS_HAIL_RANGE_SQ = PASS_HAIL_RANGE_WU * PASS_HAIL_RANGE_WU;

const FLEE_FSMS = new Set(['flee', 'retreat', 'withdraw']);
const ATTACK_FSMS = new Set(['attack', 'strafe', 'engage', 'fight']);
const SCAN_FSMS = new Set(['scan', 'inspect', 'intercept', 'pursue', 'approach', 'patrol']);
const WARN_FSMS = new Set(['warn', 'challenge', 'blockade']);
const FLAVOR_SITUATIONS = new Set(['patrol-greeting', 'taunt']);

export const barkDirector = {
  name: 'barkDirector',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._bodyNearMisses = new Map();
    this._onFlee = (payload) => this._speakFromEvent(payload, 'flee', 'ai:flee');
    this._onReinforcement = (payload) => this._speakFromEvent(payload, 'reinforce', 'ai:reinforcementScheduled');
    this._onCombatOutcome = () => this._enterPostCombatSilence();
    // The ship-history owner (systems/ships.js) is the single writer of the living-hull record and
    // republishes it whenever a witnessed act attaches to the hull. Listening to that receipt keeps
    // this observer independent of system init order.
    this._onHullHistory = (payload) => this._speakHullRecognition(payload || {});
    this._onStuntTrick = payload => this._speakStunt(payload || {});
    this._onStuntSurface = payload => this._stuntSurface(payload || {});
    this._onStuntLoad = () => {
      const record=stuntRecognitionRecord(ensureState(this.state));
      for(const pending of record.pending)if(pending.status==='submitted')pending.status='queued';
      record.safeSince=null;this._voiceBusyUntil=0;this._stuntDangerUntil=0;
      if (this._bodyNearMisses) this._bodyNearMisses.clear();
    };
    this._onStuntLoad();
    this._onStuntDamage = payload => { if ((payload.targetId ?? payload.victimId) === this.state?.playerId) this._stuntDangerUntil = (this.state.tick || 0) + 72; };
    this._onCargoSpilled = (payload) => this._speakCargoSpill(payload || {}, 'freight:cargoSpilled');
    this._onCargoJettisoned = (payload) => this._speakCargoSpill(payload || {}, 'cargo:jettisoned');
    this._onCargoKilled = (payload) => this._speakCargoSpill(payload || {}, 'entity:killed');
    this._onBodyReleased = (payload) => this._trackBodyNearMiss(payload && payload.targetId, 'throw', this.state && this.state.playerId);
    this._onBodyShoved = (payload) => {
      if (!payload || payload.attackerId !== (this.state && this.state.playerId) || !(Number(payload.deltaV) > 0)) return;
      this._trackBodyNearMiss(payload.victimId, 'shove', payload.attackerId);
    };
    this._onBodyImpact = (payload) => this._markBodyNearMissHit(payload || {});
    // Heat/pursuit/witness moments are the law layer's natural radio cadence: a dispatched
    // patrol hails, the warrant hunter taunts, and a witness to a validated crime says what
    // they saw — each from the live entity that owns the voice.
    this._onLawDispatchStarted = (payload) => this._speakLawDispatch(payload || {});
    this._onLawWarrantPosted = (payload) => this._speakLawPursuit(payload || {});
    this._onLawCheckpointPosted = (payload) => this._speakLawSurrender(payload || {});
    this._onLawReportReceipt = (payload) => this._speakLawWitness(payload || {});
    this._onHeatWantedCrossed = (payload) => this._speakWantedCrossing(payload || {});
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('ai:flee', this._onFlee);
      this.bus.on('save:loaded', this._onStuntLoad);
      this.bus.on('ai:reinforcementScheduled', this._onReinforcement);
      this.bus.on('combat:outcome', this._onCombatOutcome);
      this.bus.on('ship:livingHullChanged', this._onHullHistory);
      this.bus.on('voice:surface', this._onStuntSurface);
      this.bus.on('combat:damage', this._onStuntDamage);
      this.bus.on('story:stuntIncidentUpdated', this._onStuntTrick);
      this.bus.on('story:stuntIncidentRecorded', this._onStuntTrick);
      this.bus.on('freight:cargoSpilled', this._onCargoSpilled);
      this.bus.on('cargo:jettisoned', this._onCargoJettisoned);
      this.bus.on('entity:killed', this._onCargoKilled);
      this.bus.on('law:dispatchStarted', this._onLawDispatchStarted);
      this.bus.on('law:wantedWarrantPosted', this._onLawWarrantPosted);
      this.bus.on('law:wantedCheckpointPosted', this._onLawCheckpointPosted);
      this.bus.on('law:reportIncidentReceipt', this._onLawReportReceipt);
      this.bus.on('heat:changed', this._onHeatWantedCrossed);
      this.bus.on('tether:released', this._onBodyReleased);
      this.bus.on(HITSTUN_IMPULSE_EVENT, this._onBodyShoved);
      this.bus.on('physics:impact', this._onBodyImpact);
    }
  },

  newGame() {
    if (this.state) this.state.barkDirector = freshState();
  },

  update(_dt, state) {
    if (state.mode && state.mode !== 'flight') return;
    ensureActivityClassified(state);
    ensureState(state);
    this._advanceStuntBarks();
    this._advanceBodyNearMisses(state);
    const player = state.entities && state.entities.get && state.entities.get(state.playerId);
    const thinkOpts = {
      playerId: state.playerId,
      playerTeam: PLAYER_TEAM,
      origin: player && player.pos,
      authorityRadius: tableSimAuthorityWuFromState(state),
      sleepPeriodTicks: 8,
      activePeriodTicks: 1,
    };
    forEachLivingWorldActor(state, (entity) => {
      if (!shouldOwnerThink(state.tick, entity, thinkOpts)) return;
      this._queueKnownStunt(entity);
      const situation = classifyBarkSituation(entity, state);
      if (situation) {
        this._speak(entity, situation, 'state');
        return;
      }
      this._hailPassingTraffic(entity, state, player);
    });
  },

  _speakFromEvent(payload, situation, reason) {
    if (!payload || !this.state) return false;
    const entityId = payload.entityId ?? payload.ownerId ?? payload.shipId ?? payload.id;
    if (entityId == null) return false;
    const entity = this.state.entities && this.state.entities.get && this.state.entities.get(entityId);
    if (!entity) return false;
    return this._speak(entity, situation, reason, payload);
  },

  _speak(entity, situation, reason, extra = null) {
    if (!BARK_SET.has(situation) || !entity || !this.state) return false;
    const state = this.state;
    const own = ensureState(state);
    const entityId = String(entity.id);
    const rec = own.entities[entityId] || (own.entities[entityId] = freshEntityRecord(entity));
    if (rec.lastSituation === situation || rec.said[situation]) return false;
    if (this._isSuppressed(entity, situation, rec)) return false;

    const factionId = factionFor(entity);
    const seed = state.meta && state.meta.seed;
    const index = hash32(seed == null ? 0 : seed, 'barkDirector', entityId, situation);
    // Recognition moments reference real history first: a faction whose hulls the player broke,
    // or whose named captains remember them, speaks the fact instead of a first-contact line.
    const identity = (situation === 'scan' || situation === 'warn' || situation === 'taunt')
      ? activeHullIdentity(state)
      : null;
    const history = identity
      ? factionHistoryFromMemory(state.aceMemory, factionId, identity.name)
      : { hasHistory: false };
    const trophy = situation === 'scan' && !history.hasHistory ? liveTrophyFromState(state) : null;
    const text = history.hasHistory
      ? historyBarkFor(factionId, history, index)
      : trophy
        ? aceTrophyBarkFor(factionId, index, { ace: trophy.aceName, head: trophy.name })
        : barkFor(factionId, situation, index);
    const voice = this.helpers && this.helpers.voice;
    if (!voice || typeof voice.say !== 'function') return false;

    rec.lastSituation = situation;
    rec.said[situation] = true;
    rec.lastSpokenAt = state.simTime || 0;
    rec.history.push({ situation, reason, t: rec.lastSpokenAt, text });
    if (rec.history.length > 8) rec.history.shift();

    const accepted = voice.say({
      channel: 'bark',
      text,
      kind: 'barkDirector',
      ttl: VOICE_TTL_S,
      id: `barkDirector:${entityId}:${situation}`,
      factionId,
    });
    if (accepted) {
      this._emit('barkDirector:voice', {
        entityId: entity.id,
        situation,
        reason,
        text,
        factionId,
        t: rec.lastSpokenAt,
        ...(extra ? { source: extra.sourceEvent || null } : {}),
      });
    }
    return !!accepted;
  },

  // ── Law radio cadence: heat, pursuit, and witnesses speak ────────────────────────────────
  //
  // The law layer emits receipts, not voices — these listeners give each law action leg an
  // audible line from the live entity that owns it. None of them move gameplay state; they
  // only spend the same per-entity-per-situation bark budget as ordinary contact chatter.

  _speakLawDispatch(payload) {
    const state = this.state;
    if (!state || !Array.isArray(payload.responderIds)) return false;
    for (const id of payload.responderIds) {
      const entity = state.entities && state.entities.get && state.entities.get(id);
      if (!entity || entity.alive === false) continue;
      return this._speak(entity, 'warn', 'law:dispatchStarted', payload)
        || this._speak(entity, 'attack', 'law:dispatchStarted', payload);
    }
    return false;
  },

  _speakLawPursuit(payload) {
    const state = this.state;
    const hunter = payload && payload.hunterId != null
      && state && state.entities && state.entities.get && state.entities.get(payload.hunterId);
    if (!hunter || hunter.alive === false) return false;
    // The authored pursuit corpus speaks first (the chasing faction prices the run); the generic
    // taunt/warn chain stays as the busy-channel fallback so the moment is never fully silent.
    return this._speakEventLine(hunter, 'law-pursuit', 'law:wantedWarrantPosted', pursuitBarkFor, payload)
      || this._speak(hunter, 'taunt', 'law:wantedWarrantPosted', payload)
      || this._speak(hunter, 'warn', 'law:wantedWarrantPosted', payload);
  },

  // A posted nets checkpoint IS the law's heave-to demand; the staffing cutter names the one term.
  _speakLawSurrender(payload) {
    const state = this.state;
    const cutter = payload && payload.cutterId != null
      && state && state.entities && state.entities.get && state.entities.get(payload.cutterId);
    if (!cutter || cutter.alive === false) return false;
    return this._speakEventLine(cutter, 'law-surrender', 'law:wantedCheckpointPosted', surrenderBarkFor, payload);
  },

  _speakLawWitness(payload) {
    const state = this.state;
    if (!state || !payload || payload.accepted !== true) return false;
    const witness = this._resolveReceiptWitness(payload);
    if (!witness) return false;
    return this._speakEventLine(witness, 'witness-crime', 'law:reportIncidentReceipt', witnessCrimeBarkFor, payload);
  },

  _speakWantedCrossing(payload) {
    const state = this.state;
    if (!state || !payload || payload.wantedCrossed !== true || payload.wanted !== true) return false;
    const player = state.entities && state.entities.get && state.entities.get(state.playerId);
    if (!player || !player.pos) return false;
    const voice = nearestEntityWhere(state, player.pos, LAW_BARK_RADIUS_WU,
      (entity) => isLawfulVoice(entity));
    if (!voice) return false;
    return this._speak(voice, 'warn', 'heat:changed', payload);
  },

  // The receipt names witnesses by STABLE id; `entity:N` rows resolve directly, and authored
  // ids (world records, stations) fall back to the nearest lawful-or-civilian hull close enough
  // to the scene to have actually seen the act. Kill receipts anchor on the victim; theft
  // receipts (the only accepted receipts before the kill-intake lane) anchor on the offender.
  _resolveReceiptWitness(payload) {
    const state = this.state;
    const entities = state && state.entities;
    if (!entities || typeof entities.get !== 'function') return null;
    const ids = Array.isArray(payload.witnessStableIds) ? payload.witnessStableIds : [];
    for (const stableId of ids) {
      if (typeof stableId !== 'string' || !stableId.startsWith('entity:')) continue;
      const raw = stableId.slice(7);
      const entity = entities.get(raw) || entities.get(Number(raw));
      if (entity && entity.alive !== false) return entity;
    }
    const byId = (id) => (id != null ? (entities.get(id) || entities.get(Number(id))) : null);
    const victim = byId(payload.victimEntityId);
    const offender = byId(payload.offenderEntityId);
    const anchor = (victim && victim.pos && victim) || (offender && offender.pos && offender) || null;
    if (!anchor || !anchor.pos) return null;
    return nearestEntityWhere(state, anchor.pos, LAW_BARK_RADIUS_WU,
      (entity) => entity.id !== anchor.id
        && !(offender && entity.id === offender.id)
        && (isLawfulVoice(entity) || isCivilianVoice(entity)));
  },

  // Event corpus, not a BARK_SITUATION — same carve-out as hull/stunt recognition. Dedup is
  // per-entity per-situation so a voice delivers its line once, then goes back to its own chatter.
  _speakEventLine(entity, situation, reason, lineFor, extra = null) {
    if (!entity || !this.state || typeof lineFor !== 'function') return false;
    const state = this.state;
    const own = ensureState(state);
    const entityId = String(entity.id);
    const rec = own.entities[entityId] || (own.entities[entityId] = freshEntityRecord(entity));
    if (rec.said[situation]) return false;
    const factionId = factionFor(entity);
    const seed = state.meta && state.meta.seed;
    const index = hash32(seed == null ? 0 : seed, 'barkDirector', entityId, situation);
    const text = lineFor(factionId, index);
    const voice = this.helpers && this.helpers.voice;
    if (!voice || typeof voice.say !== 'function') return false;
    rec.said[situation] = true;
    rec.lastSpokenAt = state.simTime || 0;
    rec.history.push({ situation, reason, t: rec.lastSpokenAt, text });
    if (rec.history.length > 8) rec.history.shift();
    const accepted = voice.say({
      channel: 'bark',
      text,
      kind: 'barkDirector',
      ttl: VOICE_TTL_S,
      id: `barkDirector:${entityId}:${situation}`,
      factionId,
    });
    if (accepted) {
      this._emit('barkDirector:voice', {
        entityId: entity.id,
        situation,
        reason,
        text,
        factionId,
        t: rec.lastSpokenAt,
        ...(extra ? { source: extra.sourceEvent || extra.incidentReceiptId || null } : {}),
      });
    }
    return !!accepted;
  },

  /**
   * One NPC who was close enough to watch says the hull's name. Returns the receipt it published,
   * or null with a reason recorded on the director's own state slice.
   */
  _speakHullRecognition(payload) {
    const state = this.state;
    if (!state || payload.source !== 'witnessed_kill') return null;
    if (state.mode && state.mode !== 'flight') return null;
    const notoriety = livingHullNotoriety(payload.livingHull);
    if (notoriety < 1) return null;
    const identity = activeHullIdentity(state);
    if (!identity) return null;

    const own = ensureState(state);
    const now = Number(state.simTime) || 0;
    const record = hullRecognitionRecord(own);
    if (Number(record.nextAt) > now) return null;

    const witness = this._nearestWitness();
    if (!witness) return null;

    const voice = this.helpers && this.helpers.voice;
    if (!voice || typeof voice.say !== 'function') return null;
    const factionId = factionFor(witness);
    const seed = state.meta && state.meta.seed;
    const index = hash32(seed == null ? 0 : seed, 'hullRecognition', String(witness.id), notoriety);
    const text = hullRecognitionBarkFor(factionId, index, {
      ship: identity.name,
      class: identity.className,
    });
    const accepted = voice.say({
      channel: 'bark',
      text,
      kind: 'hullRecognition',
      ttl: HULL_RECOGNITION_TTL_S,
      id: `hullRecognition:${witness.id}:${notoriety}`,
      factionId,
    });
    if (!accepted) return null;

    record.lastAt = now;
    record.nextAt = now + HULL_RECOGNITION_GAP_S;
    record.lastEntityId = witness.id;
    record.count = Math.min(Number.MAX_SAFE_INTEGER, (Number(record.count) || 0) + 1);
    const receipt = {
      entityId: witness.id,
      factionId,
      shipName: identity.name,
      shipClass: identity.className,
      shipIndex: identity.index,
      notoriety,
      text,
      t: now,
    };
    this._emit('barkDirector:hullRecognition', receipt);
    return receipt;
  },

  /**
   * One NPC witness reacts to a witnessed trick with a faction-specific line using the earned title.
   * Deliberately exempt from post-combat silence.
   */
  _speakStunt(payload) {
    const state = this.state;
    if (!state || !adventureStunts(state)) return null;
    const incident = payload.incident || findStuntIncident(state, payload.episodeId);
    if (!incident || !['witnessed', 'reported'].includes(incident.visibility)) return null;
    const record = stuntRecognitionRecord(ensureState(state));
    if (['delivered', 'suppressed'].includes(incident.barkStatus) || record.deliveredIds.includes(incident.id)) return null;
    if (record.pending.some(p => p.incidentId === incident.id)) return null;
    const witness = (incident.witnesses || []).find(w => {
      const profile=observerProfile(state, state.entities?.get?.(w.id));
      return completeWitness(w) && profile?.canSpeak && profile.lifeId===w.lifeId;
    });
    if (!witness) return null;
    const title = (incident.titleIds || []).map(id => state.story.titles.byId[id]).find(t => t?.knownWitnesses?.includes(witness.identity));
    const rule = title && STUNT_TITLE_RULES.find(r => r.id === title.titleId);
    const lines = STUNT_SITUATION_LINES[incident.trickId] || ['That changed the fight.', 'I saw that impact.', 'Keep clear.'];
    const text = rule?.bark || lines[witness.role === 'hostile' ? 2 : witness.role === 'patrol' ? 0 : 1];
    const first = !!title || !(state.story.titles.stuntIncidents || []).some(i => i.id !== incident.id && i.trickId === incident.trickId && i.barkDelivered);
    const queued = { id: `stunt:${incident.id}:${witness.identity}`, incidentId: incident.id, speakerId: witness.id,
      speakerIdentity: witness.identity, speakerLife: witness.lifeId, speakerName: witness.name, factionId: witness.factionId, trickId: incident.trickId,
      title: title?.title || null, titleId: title?.titleId || null, text, first, tick: state.tick,
      eligibleTick: state.tick, expiresTick: state.tick + (first ? 3600 : 720), status: 'queued', encounterId: incident.encounterId };
    if(!record.pending.length)record.safeSince=null;
    record.pending.push(queued);
    record.pending.sort((a,b) => Number(b.first) - Number(a.first) || a.tick - b.tick);
    if (record.pending.length > 8) {
      const dropped = record.pending.pop();
      const old = findStuntIncident(state, dropped.incidentId); if (old) old.barkStatus = 'expired';
    }
    incident.barkStatus = 'queued';
    return queued;
  },

  _queueKnownStunt(entity) {
    const state = this.state;
    if (!adventureStunts(state) || !entity?.alive || entity.id === state.playerId) return;
    const profile = observerProfile(state, entity), player = state.entities?.get?.(state.playerId);
    if (!profile?.canSpeak || !player?.pos || Math.hypot(entity.pos.x-player.pos.x, entity.pos.z-player.pos.z) > profile.range
      || !witnessLineOfSight(state, entity, player.pos, [player.id])) return;
    const record = stuntRecognitionRecord(ensureState(state));
    const encounter = incidentIdentity(state,{}).encounterId ?? entity.data?.encounter?.id ?? entity.data?.encounterId ?? null;
    if (encounter == null) return;
    const speaker = record.speakers[profile.identity] ||= { titleEncounter: null, lines: [] };
    if (speaker.titleEncounter === encounter || record.pending.some(p => p.speakerIdentity === profile.identity)) return;
    const known = knownStuntTitles(state, entity);
    const title = known.find(t => !speaker.lines.slice(-3).some(l => l.titleId === t.titleId));
    if (!title) return;
    const rule = STUNT_TITLE_RULES.find(r => r.id === title.titleId); if (!rule) return;
    if (record.pending.length >= 8) return;
    record.pending.push({ id: `stunt:recognition:${profile.identity}:${encounter}:${title.titleId}`,
      incidentId: title.citations?.[0]?.incidentId, recognition: true, speakerId: entity.id,
      speakerIdentity: profile.identity, speakerLife: profile.lifeId, speakerName: profile.name, factionId: profile.factionId,
      trickId: title.trickId, title: title.title, titleId: title.titleId, text: rule.bark,
      tick: state.tick, eligibleTick: state.tick, expiresTick: state.tick + 720, status: 'queued', encounterId: encounter });
    speaker.titleEncounter = encounter;
    const keys = Object.keys(record.speakers); if (keys.length > 32) delete record.speakers[keys[0]];
  },

  _advanceStuntBarks() {
    const state = this.state; if (!adventureStunts(state)) return;
    const record = stuntRecognitionRecord(ensureState(state)), tick = state.tick || 0;
    record.recentTicks = record.recentTicks.filter(t => tick-t < 3600);
    for (const queued of record.pending.slice()) if (tick > queued.expiresTick) {
      record.pending.splice(record.pending.indexOf(queued), 1);
      const incident = findStuntIncident(state, queued.incidentId); if (incident && !queued.recognition) incident.barkStatus = 'expired';
    }
    if (!record.pending.length || tick < (record.nextTick || 0) || record.recentTicks.length >= 3) return;
    const queued = record.pending[0];
    if (queued.status === 'submitted') {
      if(tick-(queued.submittedTick??tick)<=180)return;
      queued.status='queued';record.safeSince=null;
    }
    const speaker = state.entities?.get?.(queued.speakerId);
    const profile=observerProfile(state,speaker);
    if (!profile?.canSpeak || profile.lifeId!==queued.speakerLife) return;
    const audio = state.settings?.audio || {}, accessibility = state.settings?.accessibility || {};
    const voiceOn = audio.muted !== true && audio.master !== 0 && audio.voice !== 0 && audio.comms !== 0;
    const transcriptOn = accessibility.captions !== false;
    const incident = findStuntIncident(state, queued.incidentId);
    if (!voiceOn && !transcriptOn) {
      queued.status = 'suppressed'; record.pending.shift(); record.deliveredIds.push(queued.incidentId);
      if(record.deliveredIds.length>128)record.deliveredIds.shift();
      if (incident && !queued.recognition) { incident.barkStatus = 'suppressed'; incident.barkSuppression = 'suppressed by player setting'; }
      return;
    }
    const player = state.entities?.get?.(state.playerId);
    let danger = tick < (this._stuntDangerUntil || 0) || tick < (this._voiceBusyUntil || 0) || state.onboarding?.active && !state.onboarding?.finished;
    if (player?.pos) for (const e of state.entities.values()) {
      if (!e.alive || !['bullet','projectile','missile'].includes(e.type) || (e.ownerId ?? e.data?.ownerId) === state.playerId || !e.pos) continue;
      const rx=e.pos.x-player.pos.x, rz=e.pos.z-player.pos.z, vx=(e.vel?.x||0)-(player.vel?.x||0), vz=(e.vel?.z||0)-(player.vel?.z||0);
      const square=vx*vx+vz*vz, t=square?-(rx*vx+rz*vz)/square:-1;
      if (t>=0&&t<=2&&Math.hypot(rx+vx*t,rz+vz*t)<(player.radius||12)+(e.radius||2)) { danger=true;break; }
    }
    if (danger) { record.safeSince = null; return; }
    if (record.safeSince == null) record.safeSince = tick;
    if (tick-record.safeSince < 72 || tick < queued.eligibleTick) return;
    if (!voiceOn && transcriptOn) {
      this._emit('comms:popup', { sender: queued.speakerName, text: queued.text, category: 'ambient', factionId: queued.factionId });
      this._completeStuntBark(queued, 'transcript');
      return;
    }
    const voice = this.helpers?.voice;
    if (!voice?.say) return;
    queued.status = 'submitted';
    queued.submittedTick=tick;
    if (incident && !queued.recognition) incident.barkStatus = 'submitted';
    if (!voice.say({ channel: 'bark', text: queued.text, kind: 'stuntRecognition', ttl: 3, id: queued.id, factionId: queued.factionId })) {
      queued.status = 'queued'; if (incident && !queued.recognition) incident.barkStatus = 'queued';
    }
  },

  _stuntSurface(payload) {
    this._voiceBusyUntil = (this.state?.tick || 0) + Math.ceil((payload.ttl || 1.2)*60);
    const record = stuntRecognitionRecord(ensureState(this.state));
    const queued = record.pending.find(p => p.id === payload.id && p.status === 'submitted');
    if (queued) this._completeStuntBark(queued, 'voice');
  },

  _completeStuntBark(queued, channel) {
    const state = this.state, record = stuntRecognitionRecord(ensureState(state)), tick = state.tick || 0;
    if (!record.pending.includes(queued)) return;
    queued.status = 'delivered'; queued.deliveryTick = tick;
    record.pending.splice(record.pending.indexOf(queued), 1);
    record.lastAt = tick/60; record.nextAt = tick/60+8; record.nextTick = tick+480;
    record.count = (record.count || 0)+1; record.recentTicks.push(tick);
    if (!queued.recognition) record.deliveredIds.push(queued.incidentId);
    if (record.deliveredIds.length > 128) record.deliveredIds.shift();
    const speaker = record.speakers[queued.speakerIdentity] ||= { titleEncounter: null, lines: [] };
    speaker.titleEncounter = queued.encounterId; speaker.lines.push({ titleId: queued.titleId, text: queued.text, encounterId: queued.encounterId });
    if (speaker.lines.length>3) speaker.lines.shift();
    const incident = findStuntIncident(state, queued.incidentId);
    if (incident && !queued.recognition) { incident.barkDelivered = true; incident.barkStatus = 'delivered'; incident.barkDeliveryTick = tick; incident.barkChannel = channel; }
    const receipt = { entityId: queued.speakerId, factionId: queued.factionId, trickId: queued.trickId, title: queued.title,
      incidentId: queued.incidentId, text: queued.text, t: tick/60, channel };
    if (channel === 'voice') {
      this._emit('barkDirector:voice', { ...receipt, situation: 'stunt-recognition' });
      if (state.settings?.accessibility?.captions !== false) this._emit('comms:popup', { sender: queued.speakerName, text: queued.text, category: 'ambient', _viaVoice: true });
    }
    this._emit('barkDirector:stuntRecognition', receipt);
  },

  _trackBodyNearMiss(bodyId, source, actorId) {
    const state = this.state;
    if (!state || bodyId == null || actorId !== state.playerId) return false;
    const body = state.entities && state.entities.get && state.entities.get(bodyId);
    if (!body || body.alive === false || !body.pos) return false;
    if (body.type !== 'ship' && body.type !== 'drone' && body.type !== 'payload' && body.type !== 'wreck') return false;
    const existing = this._bodyNearMisses && this._bodyNearMisses.get(bodyId);
    const witnesses = existing ? existing.witnesses : new Map();
    const hitWitnesses = existing ? existing.hitWitnesses : new Set();
    this._bodyNearMisses.set(bodyId, {
      bodyId,
      source,
      expiresTick: (state.tick | 0) + BODY_NEAR_MISS_WINDOW_TICKS,
      witnesses,
      hitWitnesses,
    });
    return true;
  },

  _markBodyNearMissHit(payload) {
    const tracks = this._bodyNearMisses;
    if (!payload || !tracks || !tracks.size) return;
    for (const track of tracks.values()) {
      if (payload.aId === track.bodyId && payload.bId != null) track.hitWitnesses.add(payload.bId);
      else if (payload.bId === track.bodyId && payload.aId != null) track.hitWitnesses.add(payload.aId);
    }
  },

  _advanceBodyNearMisses(state) {
    const tracks = this._bodyNearMisses;
    if (!state || !tracks || !tracks.size) return;
    const tick = state.tick | 0;
    for (const [bodyId, track] of tracks) {
      const body = state.entities && state.entities.get && state.entities.get(bodyId);
      if (!body || body.alive === false || !body.pos || tick >= track.expiresTick) {
        tracks.delete(bodyId);
        continue;
      }
      for (const witness of indexedTypeScan(state, 'shipLike')) {
        if (!isBodyNearMissWitness(witness, state, body.id) || !witness.pos) continue;
        const distance = Math.hypot(witness.pos.x - body.pos.x, witness.pos.z - body.pos.z);
        const contactRadius = (Number(body.radius) || 0) + (Number(witness.radius) || 0);
        let sample = track.witnesses.get(witness.id);
        if (!sample) {
          sample = { lastDistance: distance, minDistance: distance, barkedAt: -Infinity, armed: true };
          track.witnesses.set(witness.id, sample);
        }
        if (distance > BODY_NEAR_MISS_EXIT_WU) {
          if (tick - sample.barkedAt >= BODY_NEAR_MISS_COOLDOWN_TICKS) {
            sample.armed = true;
            sample.minDistance = Infinity;
            track.hitWitnesses.delete(witness.id);
          }
          sample.lastDistance = distance;
          continue;
        }
        if (distance < sample.minDistance) sample.minDistance = distance;
        if (sample.armed
          && distance > sample.lastDistance + 0.01
          && sample.minDistance <= BODY_NEAR_MISS_RADIUS_WU
          && sample.minDistance > contactRadius + 1
          && !track.hitWitnesses.has(witness.id)) {
          this._speakBodyNearMiss(witness, track, sample.minDistance);
          sample.armed = false;
          sample.barkedAt = tick;
        }
        sample.lastDistance = distance;
      }
    }
  },

  _speakBodyNearMiss(witness, track, closestWu) {
    const state = this.state;
    const voice = this.helpers && this.helpers.voice;
    if (!state || !voice || typeof voice.say !== 'function') return false;
    const factionId = factionFor(witness);
    const text = track.source === 'throw'
      ? 'That thrown hull nearly hit us. Clear the lane!'
      : 'That loose hull nearly hit us. Clear the lane!';
    const t = Number(state.simTime) || 0;
    const accepted = voice.say({
      channel: 'bark',
      text,
      kind: 'bodyNearMiss',
      ttl: VOICE_TTL_S,
      id: `bodyNearMiss:${track.bodyId}:${witness.id}:${state.tick | 0}`,
      factionId,
    });
    if (!accepted) return false;
    const receipt = {
      entityId: witness.id,
      bodyId: track.bodyId,
      source: track.source,
      closestWu,
      text,
      factionId,
      t,
    };
    this._emit('barkDirector:voice', receipt);
    this._emit('barkDirector:bodyNearMiss', receipt);
    return true;
  },

  /** Closest eligible NPC hull inside the live authority radius; ties break on the lower id. */
  _nearestWitness() {
    const state = this.state;
    if (!state) return null;
    const player = (state.entities && typeof state.entities.get === 'function' ? state.entities.get(state.playerId) : null)
      || (state.entities && typeof state.entities === 'object' ? state.entities[state.playerId] : null);
    if (!player || !player.pos) return null;
    let radius = Number(tableSimAuthorityWuFromState(state));
    if (!Number.isFinite(radius) || radius <= 0) radius = HULL_RECOGNITION_FALLBACK_RANGE_WU;
    const limit = radius * radius;
    let best = null;
    let bestDistance = Infinity;
    forEachLivingWorldActor(state, (entity) => {
      if (!eligibleShip(entity, state) || !entity.pos) return;
      const dx = Number(entity.pos.x) - Number(player.pos.x);
      const dz = Number(entity.pos.z) - Number(player.pos.z);
      const distance = dx * dx + dz * dz;
      if (!Number.isFinite(distance) || distance > limit) return;
      if (distance < bestDistance || (distance === bestDistance && best && entity.id < best.id)) {
        best = entity;
        bestDistance = distance;
      }
    });
    return best;
  },

  _enterPostCombatSilence() {
    if (!this.state) return false;
    const own = ensureState(this.state);
    const now = this.state.simTime || 0;
    const until = now + POST_COMBAT_SILENCE_S;
    own.postCombatSilenceUntil = Math.max(Number(own.postCombatSilenceUntil) || 0, until);
    const sectorId = currentSectorId(this.state);
    const ambient = ambientRecord(own, sectorId);
    ambient.quietSince = now;
    ambient.nextAt = Math.max(Number(ambient.nextAt) || -Infinity, until);
    this._emit('barkDirector:silence', { sectorId, until, t: now, reason: 'combat:outcome' });
    return true;
  },

  // A neutral hauler/mining barge drifting inside pass range earns one friendly transponder
  // chirp plus its deep foghorn. Once per contact — the shared bark record is the gate.
  _hailPassingTraffic(entity, state, player) {
    if (!entity || !player || !player.pos || !entity.pos || entity === player) return false;
    if (!eligibleShip(entity, state)) return false;
    if (!PASS_HAIL_ROLES.has(occupationalRoleOf(entity))) return false;
    if (isHostileToPlayer(entity, PLAYER_TEAM, state)) return false;
    const dx = entity.pos.x - player.pos.x;
    const dz = entity.pos.z - player.pos.z;
    if (dx * dx + dz * dz > PASS_HAIL_RANGE_SQ) return false;
    const accepted = this._speak(entity, 'patrol-greeting', 'pass-by');
    if (accepted && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('audio:cue', {
        id: 'world.foghorn',
        position: { x: entity.pos.x, z: entity.pos.z },
        gain: 0.8,
      });
    }
    return !!accepted;
  },

  _isSuppressed(entity, situation, rec) {
    const state = this.state;
    const own = ensureState(state);
    const now = state.simTime || 0;
    let until = 0;
    if (FLAVOR_SITUATIONS.has(situation)) until = Number(own.postCombatSilenceUntil) || 0;
    if (until > now) {
      rememberSuppressed(own, entity, situation, now, until, 'post-combat-silence');
      return true;
    }
    if (situation !== 'patrol-greeting') return false;

    const sectorId = currentSectorId(state);
    const ambient = ambientRecord(own, sectorId);
    if (Number(ambient.nextAt) > now) {
      rememberSuppressed(own, entity, situation, now, ambient.nextAt, 'ambient-decay');
      return true;
    }
    const gap = ambientGap(ambient, now);
    ambient.lastAt = now;
    ambient.lastEntityId = entity && entity.id;
    ambient.lastGap = gap;
    ambient.nextAt = now + gap;
    rec.ambientGap = gap;
    return false;
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },

  /**
   * PQ-148.03 — one bark + ledger citation when a named pod spills, is jettisoned, or drops on kill.
   * Player jettison of their own hold is a null reaction (no self-bounty).
   */
  _speakCargoSpill(payload, eventName) {
    const state = this.state;
    if (!state || !payload) return null;

    const resolved = resolveNamedCargoIncident(state, payload, eventName);
    if (!resolved || !resolved.ownerName) return null;

    const reaction = resolved.reaction;
    if (!reaction || !CARGO_OWNER_REACTIONS[reaction]) return null;

    const own = ensureState(state);
    const now = Number(state.simTime) || 0;
    const record = cargoSpillRecord(own);
    const key = `${resolved.ownerId}|${reaction}|${state.tick || 0}`;
    if (record.lastKey === key) return null;

    const barkText = cargoSpillBarkText(resolved.ownerName, reaction);
    const ledgerText = cargoSpillLedgerText(resolved.ownerName, reaction);
    const barkKey = CARGO_OWNER_REACTIONS[reaction].barkKey;
    const voice = this.helpers && this.helpers.voice;
    let accepted = true;
    if (voice && typeof voice.say === 'function') {
      accepted = voice.say({
        channel: 'bark',
        text: barkText,
        kind: 'cargoSpill',
        ttl: VOICE_TTL_S,
        id: `cargoSpill:${resolved.ownerId}:${reaction}:${now}`,
        factionId: resolved.factionId,
      });
    }
    if (!accepted) return null;

    record.lastKey = key;
    record.lastAt = now;
    record.lastOwnerId = resolved.ownerId;
    record.count = Math.min(Number.MAX_SAFE_INTEGER, (Number(record.count) || 0) + 1);

    const receipt = {
      entityId: resolved.ownerId,
      situation: barkKey,
      reason: eventName,
      text: barkText,
      ledgerText,
      factionId: resolved.factionId,
      t: now,
      ownerId: resolved.ownerId,
      ownerName: resolved.ownerName,
      reaction,
      originId: resolved.originId,
      destinationId: resolved.destinationId,
    };
    this._emit('barkDirector:voice', receipt);
    this._emit('comms:log', {
      from: resolved.ownerName,
      text: ledgerText,
      kind: 'cargo',
      reaction,
      ownerId: resolved.ownerId,
      ownerName: resolved.ownerName,
    });
    return receipt;
  },

  destroy() {
    if (this.bus && typeof this.bus.off === 'function') {
      if (this._onFlee) this.bus.off('ai:flee', this._onFlee);
      if (this._onReinforcement) this.bus.off('ai:reinforcementScheduled', this._onReinforcement);
      if (this._onCombatOutcome) this.bus.off('combat:outcome', this._onCombatOutcome);
      if (this._onHullHistory) this.bus.off('ship:livingHullChanged', this._onHullHistory);
      if (this._onStuntSurface) this.bus.off('voice:surface', this._onStuntSurface);
      if (this._onStuntLoad) this.bus.off('save:loaded', this._onStuntLoad);
      if (this._onStuntDamage) this.bus.off('combat:damage', this._onStuntDamage);
      if (this._onStuntTrick) this.bus.off('story:stuntIncidentUpdated', this._onStuntTrick);
      if (this._onStuntTrick) this.bus.off('story:stuntIncidentRecorded', this._onStuntTrick);
      if (this._onCargoSpilled) this.bus.off('freight:cargoSpilled', this._onCargoSpilled);
      if (this._onCargoJettisoned) this.bus.off('cargo:jettisoned', this._onCargoJettisoned);
      if (this._onCargoKilled) this.bus.off('entity:killed', this._onCargoKilled);
      if (this._onLawDispatchStarted) this.bus.off('law:dispatchStarted', this._onLawDispatchStarted);
      if (this._onLawWarrantPosted) this.bus.off('law:wantedWarrantPosted', this._onLawWarrantPosted);
      if (this._onLawCheckpointPosted) this.bus.off('law:wantedCheckpointPosted', this._onLawCheckpointPosted);
      if (this._onLawReportReceipt) this.bus.off('law:reportIncidentReceipt', this._onLawReportReceipt);
      if (this._onHeatWantedCrossed) this.bus.off('heat:changed', this._onHeatWantedCrossed);
      if (this._onBodyReleased) this.bus.off('tether:released', this._onBodyReleased);
      if (this._onBodyShoved) this.bus.off(HITSTUN_IMPULSE_EVENT, this._onBodyShoved);
      if (this._onBodyImpact) this.bus.off('physics:impact', this._onBodyImpact);
    }
    this._onFlee = null;
    this._onReinforcement = null;
    this._onCombatOutcome = null;
    this._onHullHistory = null;
    this._onStuntTrick = null;
    this._onCargoSpilled = null;
    this._onCargoJettisoned = null;
    this._onCargoKilled = null;
    this._onLawDispatchStarted = null;
    this._onLawWarrantPosted = null;
    this._onLawCheckpointPosted = null;
    this._onLawReportReceipt = null;
    this._onHeatWantedCrossed = null;
    this._onBodyReleased = null;
    this._onBodyShoved = null;
    this._onBodyImpact = null;
    if (this._bodyNearMisses) this._bodyNearMisses.clear();
    this._bodyNearMisses = null;
  },
};

function liveTrophyFromState(state) {
  if (!state) return null;
  const player = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  const trophy = trophyFromFittings(
    player && player.data && player.data.fittings,
    state.claims && state.claims.legendaryHeads,
  );
  if (!trophy) return null;
  if (!trophy.aceName) {
    const ace = aceById(trophy.aceId);
    trophy.aceName = ace && ace.name || trophy.aceId || 'an ace';
  }
  return trophy;
}

export function classifyBarkSituation(entity, state) {
  if (!eligibleShip(entity, state)) return null;
  const data = entity.data || {};
  const ai = data.ai || {};
  const explicit = normalizeSituation(ai.barkSituation || data.barkSituation || data.radioSituation);
  if (explicit) return explicit;

  const fsm = String(ai.fsm || ai.state || ai.mode || '').toLowerCase();
  if (FLEE_FSMS.has(fsm) || ai.forceFlee === true) return 'flee';
  if (ai.requestingReinforcement || ai.reinforcing || data.reinforcements) return 'reinforce';
  // Demand: explicit AI flags OR faction contact grammar demand types that open with a tithe/cargo ask.
  if (ai.demandCargo || data.demandCargo || data.pirateDemand) return 'demand-cargo';
  const grammar = contactGrammarFor(factionFor(entity));
  if (grammar && grammar.demandType === 'tithe'
    && (WARN_FSMS.has(fsm) || SCAN_FSMS.has(fsm) || ai.openingContact || data.openingContact)) {
    return 'demand-cargo';
  }
  if (WARN_FSMS.has(fsm) || ai.warning || data.zoneWarning || data.customsWarning) return 'warn';
  if (isAttackingPlayer(entity, state, fsm)) return 'attack';
  if (isScanningPlayer(entity, state, fsm)) {
    // Concord grammar: first contact is paperwork (scan), not a taunt.
    if (grammar && grammar.primaryBark === 'scan') return 'scan';
    return 'scan';
  }
  if (ai.taunting || data.taunt) return 'taunt';
  // First passive contact: faction primary bark situation (Quiet terse scan, Reach demand, etc.).
  if (grammar && (ai.openingContact || data.openingContact || ai.firstContact)) {
    return normalizeSituation(grammar.primaryBark) || grammar.primaryBark;
  }
  return null;
}

function freshState() {
  return {
    entities: {},
    postCombatSilenceUntil: 0,
    ambientBySector: {},
    suppressed: [],
    hullRecognition: freshHullRecognition(),
    stuntRecognition: freshStuntRecognition(),
    cargoSpill: freshCargoSpill(),
  };
}

function freshCargoSpill() {
  return { lastKey: null, lastAt: 0, lastOwnerId: null, count: 0 };
}

function cargoSpillRecord(own) {
  if (!own.cargoSpill || typeof own.cargoSpill !== 'object') {
    own.cargoSpill = freshCargoSpill();
  }
  return own.cargoSpill;
}

function entityFromState(state, id) {
  if (id == null || !state) return null;
  if (state.entities && typeof state.entities.get === 'function') {
    return state.entities.get(id) || null;
  }
  return null;
}

function namedPodIdentity(entity) {
  if (!entity) return null;
  const identity = cargoIdentityOf(entity) || cargoIdentityOf(entity.data);
  if (!identity || !identity.ownerName) return null;
  return identity;
}

function resolveNamedCargoIncident(state, payload, eventName) {
  const playerId = state.playerId;
  const cause = cargoSpillCauseOf(eventName, payload);
  let identity = cargoIdentityOf(payload)
    || identityFromManifest(payload.manifest || payload, {
      ownerId: payload.ownerId,
      ownerName: payload.ownerName,
      originId: payload.originId,
      destinationId: payload.destinationId,
      playerId,
      cause,
      role: payload.role,
      isCivilian: payload.isCivilian,
    });

  if (eventName === 'cargo:jettisoned' && (!identity || identity.ownerId == null)) {
    identity = identityFromManifest({
      ownerId: payload.ownerId != null ? payload.ownerId : playerId,
      ownerName: payload.ownerName || null,
      originId: payload.originId,
      destinationId: payload.destinationId,
    }, { playerId, cause });
  }

  if ((!identity || !identity.ownerName) && eventName === 'entity:killed') {
    const victim = entityFromState(state, payload.id != null ? payload.id : payload.entityId);
    const manifest = victim && victim.data && victim.data.cargoManifest;
    identity = namedPodIdentity(victim)
      || identityFromManifest(manifest || {}, {
        ownerId: (manifest && manifest.ownerId) || (victim && victim.id),
        ownerName: (manifest && manifest.ownerName)
          || (victim && victim.data && (victim.data.displayName || victim.data.name)),
        playerId,
        cause,
        role: (manifest && manifest.role) || 'civilian',
        isCivilian: true,
      });
    if (!identity || !identity.ownerName) {
      const list = indexedTypeScan(state, 'payloads');
      for (let i = 0; i < list.length; i++) {
        const pod = namedPodIdentity(list[i]);
        if (pod && (list[i].data && list[i].data.sourceVictimId === (victim && victim.id))) {
          identity = pod;
          break;
        }
      }
    }
  }

  if ((!identity || !identity.ownerName) && eventName === 'freight:cargoSpilled') {
    const carrier = entityFromState(state, payload.carrierId);
    const manifest = (carrier && carrier.data && carrier.data.cargoManifest) || payload.manifest;
    identity = identityFromManifest(manifest || {}, {
      ownerId: payload.ownerId || (manifest && manifest.ownerId) || (carrier && carrier.id),
      ownerName: payload.ownerName
        || (manifest && manifest.ownerName)
        || (carrier && carrier.data && (carrier.data.displayName || carrier.data.name)),
      originId: payload.originId,
      destinationId: payload.destinationId,
      playerId,
      cause,
      role: (manifest && manifest.role) || payload.role || 'civilian',
      isCivilian: true,
    });
    if (!identity || !identity.ownerName) {
      const list = indexedTypeScan(state, 'payloads');
      for (let i = 0; i < list.length; i++) {
        const pod = namedPodIdentity(list[i]);
        if (!pod) continue;
        const data = list[i].data || {};
        const freight = data.freightCustodyPod;
        if ((freight && freight.custodyId === payload.custodyId)
          || data.sourceVictimId === payload.carrierId
          || String(pod.ownerId) === String(payload.ownerId || (carrier && carrier.id))) {
          identity = pod;
          break;
        }
      }
    }
  }

  if (!identity || !identity.ownerName) return null;

  const ownerId = identity.ownerId;
  const reaction = identity.reaction || reactionForSpill({
    ownerId,
    playerId,
    legality: payload.legality || identity.legality,
    cause,
    role: payload.role || identity.role,
    isCivilian: payload.isCivilian,
  });
  const ownerEntity = entityFromState(state, ownerId);
  return {
    ownerId,
    ownerName: identity.ownerName,
    originId: identity.originId || null,
    destinationId: identity.destinationId || null,
    reaction,
    factionId: (ownerEntity && (ownerEntity.factionId || (ownerEntity.data && ownerEntity.data.factionId)))
      || 'faction_free',
  };
}

// Law barks hail on an open channel — responders and warrant hunters speak regardless of how
// far their hull is from the player's. Only the wanted-crossing scan picks a nearby voice,
// and even that is generous: the law announcing itself is not a whisper.
const LAW_BARK_RADIUS_WU = 2400;

function nearestEntityWhere(state, pos, radiusWu, predicate) {
  const anchor = pos && Number.isFinite(pos.x) && Number.isFinite(pos.z) ? pos : null;
  if (!state || !anchor || typeof predicate !== 'function') return null;
  const limitSq = Math.max(0, Number(radiusWu) || 0) ** 2;
  let best = null;
  let bestD2 = limitSq;
  forEachLivingWorldActor(state, (entity) => {
    if (!entity || entity.alive === false || !entity.pos) return;
    if (entity.id === state.playerId) return;
    const dx = entity.pos.x - anchor.x;
    const dz = entity.pos.z - anchor.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > bestD2) return;
    if (!predicate(entity)) return;
    bestD2 = d2;
    best = entity;
  });
  return best;
}

// Light local predicates — barkDirector observes law state; it does not import the law owner.
// CIVILIAN_VOICE_ROLES mirrors the proven civilian-role list in combat/stuntContracts.js.
const CIVILIAN_VOICE_ROLES = Object.freeze(['hauler', 'courier', 'miner', 'trader', 'civilian', 'fleeing_trader']);

function isLawfulVoice(entity) {
  const data = entity && entity.data || {};
  const ai = data.ai || {};
  return ai.lawful === true || ai.motive === 'wanted_warrant' || ai.securityTargetId != null;
}

function isCivilianVoice(entity) {
  if (!entity || entity.type !== 'ship') return false;
  const data = entity.data || {};
  const ai = data.ai || {};
  const role = String(data.trafficRole || data.role || ai.role || ai.archetype || '').toLowerCase();
  return entity.team === 2 || ai.spawnContext === 'convoy_civilian'
    || CIVILIAN_VOICE_ROLES.some((word) => role.includes(word));
}

function isBodyNearMissWitness(entity, state, bodyId) {
  if (!entity || entity.alive === false || entity.id === bodyId || entity.id === state.playerId) return false;
  if (entity.type !== 'ship' && entity.type !== 'drone') return false;
  const data = entity.data || {};
  const ai = data.ai || {};
  return entity.team === 2 || ai.lawful === true || data.trafficRole === 'patrol' || data.role === 'patrol';
}

// Finite by construction. `postCombatSilenceUntil: 0` is the sibling convention in this same
// slice, and -Infinity does not survive JSON (it reads back as null), so the gate would silently
// change meaning the moment anything serialized this record. `nextAt: 0` reads as "never spoken":
// the gate is `nextAt > now` and sim time is never negative.
function freshHullRecognition() {
  return { lastAt: 0, nextAt: 0, lastEntityId: null, count: 0 };
}

function hullRecognitionRecord(own) {
  if (!own.hullRecognition || typeof own.hullRecognition !== 'object') {
    own.hullRecognition = freshHullRecognition();
  }
  return own.hullRecognition;
}

function freshStuntRecognition() {
  return { lastAt: 0, nextAt: 0, lastEntityId: null, count: 0, pending: [], recentTicks: [], deliveredIds: [], speakers: {}, safeSince: null };
}

function findStuntIncident(state, episodeId) {
  const list = state && state.story && state.story.titles && state.story.titles.stuntIncidents;
  if (!Array.isArray(list) || typeof episodeId !== 'string') return null;
  return list.find((record) => record && record.id === episodeId) || null;
}

function stuntRecognitionRecord(own) {
  if (!own.stuntRecognition || typeof own.stuntRecognition !== 'object') {
    own.stuntRecognition = freshStuntRecognition();
  }
  const record = own.stuntRecognition;
  record.pending ||= []; record.recentTicks ||= []; record.deliveredIds ||= []; record.speakers ||= {};
  return record;
}

function ensureState(state) {
  if (!state.barkDirector || typeof state.barkDirector !== 'object') state.barkDirector = freshState();
  if (!state.barkDirector.entities || typeof state.barkDirector.entities !== 'object') state.barkDirector.entities = {};
  if (!state.barkDirector.ambientBySector || typeof state.barkDirector.ambientBySector !== 'object') state.barkDirector.ambientBySector = {};
  if (!Array.isArray(state.barkDirector.suppressed)) state.barkDirector.suppressed = [];
  hullRecognitionRecord(state.barkDirector);
  stuntRecognitionRecord(state.barkDirector);
  cargoSpillRecord(state.barkDirector);
  return state.barkDirector;
}

function freshEntityRecord(entity) {
  return {
    entityId: entity && entity.id,
    factionId: factionFor(entity),
    lastSituation: null,
    lastSpokenAt: -Infinity,
    said: {},
    history: [],
  };
}

function occupationalRoleOf(entity) {
  if (!entity) return null;
  const data = entity.data || {};
  const candidates = [
    entity.occupationalRole, data.occupationalRole, entity.role, data.role,
    data.trafficRole, data.jobRole, data.craftId, entity.ship, data.ship,
  ];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (c && typeof c === 'string') {
      const rule = getOccupationalSilhouetteRule(c);
      if (rule) return rule.role;
    }
  }
  return null;
}

function eligibleShip(entity, state) {
  if (!entity || entity.alive === false) return false;
  if (entity.type !== 'ship' && entity.type !== 'drone') return false;
  if (state && entity.id === state.playerId) return false;
  if (entity.team === PLAYER_TEAM) return false;
  const data = entity.data || {};
  const ai = data.ai || {};
  if (data.barkDirectorSuppressed || ai.barkDirectorSuppressed) return false;
  return !!(data.ai || data.combat || data.intent || data.barkSituation || data.radioSituation);
}

function humanizeId(value, fallback = 'Stunt') {
  const s = String(value || fallback).replace(/^(?:trick_|title_)/, '').replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : fallback;
}

function normalizeSituation(value) {
  const situation = String(value || '').trim();
  return BARK_SET.has(situation) ? situation : null;
}

function factionFor(entity) {
  return entity && (entity.factionId || entity.data && entity.data.factionId) || 'faction_free';
}

function playerTeam(state) {
  const player = state && state.entities && state.entities.get && state.entities.get(state.playerId);
  return player && Number.isFinite(player.team) ? player.team : PLAYER_TEAM;
}

function targetsPlayer(entity, state) {
  const data = entity.data || {};
  const ai = data.ai || {};
  const combat = data.combat || {};
  const playerId = state && state.playerId;
  return playerId != null && (
    combat.targetId === playerId ||
    combat.lockTarget === playerId ||
    ai.forcePlayerTarget === true ||
    ai.huntPlayer === true
  );
}

function isAttackingPlayer(entity, state, fsm) {
  const data = entity.data || {};
  const intent = data.intent || {};
  const targeting = targetsPlayer(entity, state);
  if (targeting && ATTACK_FSMS.has(fsm)) return true;
  if (intent.fire === true && (targeting || isHostileToPlayer(entity, playerTeam(state), state))) return true;
  return false;
}

function isScanningPlayer(entity, state, fsm) {
  const data = entity.data || {};
  const ai = data.ai || {};
  const targeting = targetsPlayer(entity, state);
  if (SCAN_FSMS.has(fsm) && (targeting || ai.lawful || isHostileToPlayer(entity, playerTeam(state), state))) return true;
  if (targeting && !isAttackingPlayer(entity, state, fsm)) return true;
  if (isHostileToPlayer(entity, playerTeam(state), state) && !isAttackingPlayer(entity, state, fsm)) return true;
  return false;
}

function currentSectorId(state) {
  return state && state.world && state.world.currentSectorId || 'unknown';
}

function ambientRecord(own, sectorId) {
  const key = sectorId || 'unknown';
  let rec = own.ambientBySector[key];
  if (!rec || typeof rec !== 'object') {
    rec = {
      quietSince: 0,
      lastAt: -Infinity,
      nextAt: -Infinity,
      lastGap: AMBIENT_BASE_GAP_S,
    };
    own.ambientBySector[key] = rec;
  }
  return rec;
}

function ambientGap(rec, now) {
  const quietAge = Math.max(0, now - (Number(rec.quietSince) || 0));
  const steps = Math.floor(quietAge / AMBIENT_QUIET_STEP_S);
  return Math.min(AMBIENT_MAX_GAP_S, AMBIENT_BASE_GAP_S + steps * AMBIENT_GAP_STEP_S);
}

function rememberSuppressed(own, entity, situation, now, until, reason) {
  own.suppressed.push({
    entityId: entity && entity.id,
    situation,
    reason,
    t: now,
    until,
  });
  if (own.suppressed.length > 16) own.suppressed.shift();
}

export default barkDirector;
