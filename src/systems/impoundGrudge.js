// CRT-03 second slice, expanded — the lot hull's nemesis is an arc, not a visit.
// A used hull sells with its papers: scars, a deed, and the dead owner's callsign
// (impoundLot keeps that name on the listing). Somebody out there still holds the
// grudge — and reads the lot registry. While the player flies the marked hull, the
// grudge can find it again: a named hostile drops in on approach, hails the DEAD
// owner's callsign (they think the old hands still fly it), and opens fire.
//
// The arc, in shape:
//   * Escalation tiers. Every killing of the nemesis is written on the papers and
//     raises the tier — stalker (solo), hunter (a wingman), pack (two escorts, mine
//     wakes on ambush), apex (a hardened duel hull; killing THAT one ends it).
//   * Learned tactics. The grudge keeps a fight log. Kill it fast and it stops
//     stalking in the open — it ambushes on your velocity vector and brings a
//     point-defense screen. Run from it twice and it cuts the lane ahead of you.
//     Dock in the marked hull and its people work the berth.
//   * Ambushes. Tracked or learned surfacings spawn close, on the player's own
//     intercept course, weapons already free; the pack seeds mines on the line
//     the player is most likely to run down (through the mines owner's request
//     event — this module never writes a mine entity itself).
//   * Sabotage. Docked in the marked hull, the grudge's people find the berth:
//     a tracker wired in (the next find comes sooner and arrives as an ambush)
//     or a rigged berth fee skimmed through the economy's charge event.
//   * Settlement. From the first resurfacing the nemesis may come in under a
//     flag — a voiced blood-price offer. The physical verbs are the toll's: cut
//     thrust and hold inside handshake range to pay; open fire, walk out of the
//     window, or let the deadline lapse and it goes hot. Paying ends the arc.
//   * Resolution. 'settled' (the price is paid), 'avenged' (the apex duel hull
//     dies — a blood-prize posts through the economy's grant event), or
//     'outlasted' (run enough times and the vendetta starves). A resolved shadow
//     is dead paper: no more surfacings, sabotage, or hails.
//
// The shadow record lives on owned.impoundShadow so the grudge follows the hull —
// swap ships and it loses interest; sell the hull and it is gone for good.
// Single writers preserved: this module only requests a spawn through helpers and
// stamps its own shadow fields; credits move only through the economy events
// (economy:chargeCredits / economy:grantCredits), mines only through
// mines:placeRequest, and combat/AI outcomes stay with their owners.

import { hash32 } from '../core/rng.js';
import { ActivityKind, normalizeActivity, RulesOfEngagement } from '../ai/doctrine.js';

export const IMPOUND_GRUDGE_SCHEMA = 2;

// ── pacing ────────────────────────────────────────────────────────────────────
const FIRST_FIND_MIN_S = 75;
const FIRST_FIND_MAX_S = 180;
const REFIND_BASE_S = 240;
const REFIND_PER_DEATH_S = 120;
const REFIND_MIN_S = 120;           // escalation discounts can never push under this
const REFIND_TIER_DISCOUNT_S = 45;  // a hotter grudge circles back sooner
const ESCAPE_REFIND_S = 150;        // a warm trail resurfaces faster than a cold kill
const ESCAPE_REFIND_JITTER_S = 90;

// ── geometry ──────────────────────────────────────────────────────────────────
const APPROACH_MIN_WU = 1200;
const APPROACH_MAX_WU = 1700;
const AMBUSH_MIN_WU = 620;
const AMBUSH_MAX_WU = 900;
const AMBUSH_LEAD_S = 6;            // seconds of player velocity to lead on an ambush
const AMBUSH_MIN_SPEED = 20;        // below this the player's vector says nothing
const ESCORT_RING_MIN_WU = 110;
const ESCORT_RING_MAX_WU = 220;
const OFFER_ABANDON_WU = 3000;      // leaving the parley bubble reads as refusal

// ── escalation ────────────────────────────────────────────────────────────────
const LEVEL_BASE = 4;
const LEVEL_PER_DEATH = 2;
const LEVEL_FAST_KILL_BONUS = 2;    // learned: quick deaths buy it better steel
const LEVEL_DUEL_BONUS = 2;
const MAX_TIER = 3;
const FAST_KILL_S = 30;             // a fight this short is a lesson, not a battle
const LONG_FIGHT_S = 120;           // a fight this long invites the pack
const OUTLAST_ESCAPES = 4;          // this many clean getaways starves the vendetta
const DESPERATION_HULL = 0.35;      // tier>=2 speaks its last warning under this

// ── settlement ────────────────────────────────────────────────────────────────
const PARLEY_CHANCE = 0.35;         // per resurfacing while terms are still offered
const PARLEY_DEADLINE_S = 45;
const PARLEY_MIN_WU = 800;
const PARLEY_MAX_WU = 1100;
const PAY_RANGE_WU = 340;           // handshake range — cut thrust inside it to pay
const PAY_MAX_SPEED = 25;           // WU/s — paying is a deliberate, parked hull
const PAY_HOLD_S = 4;               // sim-seconds of held stillness that signs it
const BLOOD_PRICE_BASE_CR = 700;
const BLOOD_PRICE_PER_TIER_CR = 500;
const BLOOD_PRICE_PER_DEATH_CR = 200;
const AVENGE_PRIZE_BASE_CR = 600;
const AVENGE_PRIZE_PER_DEATH_CR = 300;
const AVENGE_PRIZE_PER_TIER_CR = 200;

// ── sabotage (docked in the marked hull) ──────────────────────────────────────
const SABOTAGE_MIN_TIER = 1;        // it only has pull in the yards once bloodied
const SABOTAGE_DELAY_MIN_S = 40;
const SABOTAGE_DELAY_MAX_S = 110;
const TRACKER_SHARE = 0.55;         // tracker vs rigged-fee split of the roll
const TRACKED_S = 900;              // a wired hull gives fast, close surfacings
const TRACKED_REFIND_MIN_S = 90;
const TRACKED_REFIND_JITTER_S = 90;
const SABOTAGE_FEE_BASE_CR = 140;
const SABOTAGE_FEE_PER_TIER_CR = 90;

// ── memory bounds (save-safe: everything below is plain JSON) ─────────────────
const FIGHT_LOG_MAX = 8;

// Personal vendettas — not law, not a squad. A small authored cast so each grudge
// keeps a face across resurfacings; the pick is deterministic per lot hull.
const GRUDGE_CAST = Object.freeze([
  Object.freeze({ name: 'Mara Vex', callsign: 'WIDOWMAKER', archetype: 'reaver_pirate' }),
  Object.freeze({ name: 'Colm Tarn', callsign: 'DEBT', archetype: 'corsair_raider' }),
  Object.freeze({ name: 'Isolde Brand', callsign: 'NINE LIVES', archetype: 'lancer_sniper' }),
  Object.freeze({ name: 'Ro Ashkettle', callsign: 'GRUDGE', archetype: 'bruiser_brawler' }),
]);

// The muscle the tiers buy. Escort picks stay deterministic per surfacing and
// answer the lesson log: fast deaths add a point-defense screen, escapes add a
// fast corsair, the apex duel brings killers, not bodies.
const ESCORT_COUNT = Object.freeze({ 0: 0, 1: 1, 2: 2, 3: 2 });
const ESCORT_POOLS = Object.freeze({
  1: Object.freeze(['wasp_swarmer', 'wasp_swarmer', 'corsair_raider']),
  2: Object.freeze(['wasp_swarmer', 'pd_screen_escort', 'corsair_raider', 'mine_layer_jackal']),
  3: Object.freeze(['corsair_raider', 'quiet_ghost', 'tether_control_raider']),
});
const AMBUSH_WAKE_MINES = 3;
const WAKE_DEPTH_STEP_WU = 70;
const WAKE_FLANK_WU = 46;

// ── voices — the nemesis talks like a person holding a debt, never like a quest ──
const GRUDGE_LINES = Object.freeze([
  (p) => `${p}. Those scars. I followed the lot papers — I know that hull.`,
  (p) => `${p}, you can't be dead. Not until I do it. Come out.`,
  (p) => `Same hull. Same marks. ${p}, this ends the way it should have.`,
]);

const HUNTER_LINES = Object.freeze([
  (p, name) => `${name} again, ${p}. You put me down once. Watch the lesson land.`,
  (p, name) => `I brought a friend, ${p}. ${name} doesn't come back alone.`,
  (p, name) => `The papers remember, ${p}. So do I. ${name} is on your hull.`,
]);

const PACK_LINES = Object.freeze([
  (p, name) => `Pack on your tail, ${p}. ${name} learned to stop arriving alone.`,
  (p, name) => `You keep killing the old debt, ${p}. I keep buying better knives.`,
  (p, name) => `${name} here, ${p}. This time the lane is mine before you fly it.`,
]);

const AMBUSH_LINES = Object.freeze([
  (p, name) => `No approach this time, ${p}. ${name} is already inside your vector.`,
  (p, name) => `You run well, ${p}. ${name} stopped chasing and started waiting.`,
  (p, name) => `Found the wake, found the hull. ${name} doesn't stalk you twice.`,
]);

const DUEL_LINES = Object.freeze([
  (p, name) => `Everything I have is on this pass, ${p}. ${name}. Last surfacing.`,
  (p, name) => `No more papers, ${p}. No more lot. ${name} — end this with me.`,
  (p, name) => `${p}! ${name} burned the ledger. One of us keeps flying.`,
]);

const PARLEY_LINES = Object.freeze([
  (p, name, price) => `${p} — whoever flies you now. ${price} credits buys ${name} off the hull. Hold still inside handshake range or burn the offer.`,
  (p, name, price) => `${name} here. The debt on that hull is ${price}. Cut your drive and hold — pay it, and the papers go cold.`,
  (p, name, price) => `Terms, ${p}: ${price} credits and ${name} forgets the scars. Hold still to pay. Run, and this reads as a no.`,
]);

const BROKE_LINES = Object.freeze([
  (p, name) => `Empty pockets, ${p}? Then the old way. ${name} takes it out of the hull.`,
  (p, name) => `You can't pay what you don't carry. ${name} collects in wreckage instead.`,
]);

const REFUSAL_LINES = Object.freeze([
  (p, name) => `That's an answer, ${p}. ${name} accepts it.`,
  (p, name) => `Silence and throttle. ${name} reads it plain — blood it is.`,
]);

const DESPERATION_LINES = Object.freeze([
  (p, name) => `Hulls burn, ${p}. Debts don't. ${name} comes back.`,
  (p, name) => `Break me again, ${p} — the papers will still know your name.`,
]);

const SETTLED_LINES = Object.freeze([
  (p, name) => `The price is paid. ${name} strikes ${p} off the page — fly easy.`,
  (p, name) => `${name} closes the book on ${p}. The lot keeps its secrets.`,
]);

const AVENGED_LINES = Object.freeze([
  (p, name) => `...tell the yard the debt dies with me, ${p}. ${name} out.`,
  (p, name) => `${name} spent everything on this hull. You were worth the bill.`,
]);

const OUTLASTED_LINES = Object.freeze([
  (p, name) => `Enough, ${p}. A debt nobody can collect isn't a debt. ${name} lets it go.`,
  (p, name) => `You outrun grief itself, ${p}. ${name} burns the papers and walks.`,
]);

const TRACKER_LINES = Object.freeze([
  (p, name) => `${name}'s people swept the berth and left a tracker on the marked hull. It will not stay lost.`,
  (p, name) => `A wire under the thruster bus, courtesy of ${name}. The next find will not wait long.`,
]);

const SABOTAGE_FEE_LINES = Object.freeze([
  (p, name) => `Berth fees come due at odd hours when ${name} owns the dock crew. The marked hull paid.`,
  (p, name) => `A rigged meter on the marked hull's berth — ${name} collects in small bills too.`,
]);

// ── schema ────────────────────────────────────────────────────────────────────

/** Mint the nemesis record for a purchased lot hull, or null when the papers name
 *  nobody (an anonymous wreck draws no grudge). Deterministic off the loss id. */
export function mintImpoundShadow(listing, simTime) {
  if (!listing || typeof listing.callsign !== 'string' || !listing.callsign) return null;
  const lossId = String(listing.lossId || listing.listingId || 'impound');
  const who = GRUDGE_CAST[hash32(lossId, 'impound-grudge') % GRUDGE_CAST.length];
  const now = Number(simTime) || 0;
  return {
    schemaVersion: IMPOUND_GRUDGE_SCHEMA,
    lossId,
    priorCallsign: listing.callsign,
    grudgeName: who.name,
    grudgeCallsign: who.callsign,
    archetype: who.archetype,
    deaths: 0,
    visits: 0,
    // The arc. `tier` is deaths-driven escalation; `learning` is the fight log the
    // grudge adapts to; `resolved` is the terminal ending (settled|avenged|outlasted).
    tier: 0,
    liveId: null,
    liveGen: null,           // occupantGeneration of the live nemesis — ids recycle, generations do not
    liveEscortIds: [],
    liveEscortGens: {},      // escortId -> occupantGeneration at spawn
    killedLiveId: null,      // set by the entity:killed forward before the id is recycled
    mode: null,              // 'hunt' | 'ambush' | 'parley' | 'duel' while live
    offer: null,             // live parley terms: {price, deadlineAt, holdS, needS, hull, shield, armor}
    spawnedAt: null,
    lastTickAt: null,
    learning: { kills: 0, escapes: 0, fastKills: 0, longFights: 0, fights: [] },
    trackedUntil: 0,
    sabotages: 0,
    dockArmedAt: null,
    dockSabotageDone: false,
    dockedSince: null,
    resolved: null,
    resolvedAt: null,
    cursed: false,
    nextAt: now + FIRST_FIND_MIN_S
      + (hash32(lossId, 'impound-first') / 0xffffffff) * (FIRST_FIND_MAX_S - FIRST_FIND_MIN_S),
  };
}

/** The impound shadow on the hull the player is flying right now, or null. */
export function activeImpoundShadow(state) {
  const p = state && state.player;
  if (!p || !Array.isArray(p.ownedShips)) return null;
  const idx = Number.isInteger(p.activeShipIndex) ? p.activeShipIndex : 0;
  const owned = p.ownedShips[idx];
  const shadow = owned && owned.impoundShadow;
  return shadow && typeof shadow === 'object' ? shadow : null;
}

// Older saves (schema 1) and hand-built records reach the tick missing the arc
// fields. Fill them in place — every value stays plain JSON — rather than fail.
function ensureShadow(shadow, now) {
  shadow.schemaVersion = IMPOUND_GRUDGE_SCHEMA;
  shadow.deaths = Math.max(0, shadow.deaths | 0);
  shadow.visits = Math.max(0, shadow.visits | 0);
  // Tier derives from remembered deaths when a schema-1 record never carried it.
  shadow.tier = Math.max(0, Math.min(MAX_TIER,
    Number.isFinite(shadow.tier) ? shadow.tier | 0 : shadow.deaths | 0));
  if (!Number.isFinite(shadow.nextAt) && !shadow.resolved) {
    shadow.nextAt = (Number(now) || 0) + FIRST_FIND_MIN_S;
  }
  if (!Array.isArray(shadow.liveEscortIds)) shadow.liveEscortIds = [];
  if (!shadow.liveEscortGens || typeof shadow.liveEscortGens !== 'object' || Array.isArray(shadow.liveEscortGens)) {
    shadow.liveEscortGens = {};
  }
  if (!Number.isFinite(shadow.liveGen)) shadow.liveGen = null;
  // A stamped kill is only proof while it names THIS trail — a stale or hostile
  // stamp that disagrees with liveId is paper noise, never a banked kill.
  if (shadow.killedLiveId != null && shadow.killedLiveId !== shadow.liveId) shadow.killedLiveId = null;
  if (typeof shadow.mode !== 'string') shadow.mode = null;
  if (!shadow.offer || typeof shadow.offer !== 'object') shadow.offer = null;
  if (!shadow.learning || typeof shadow.learning !== 'object') {
    shadow.learning = { kills: 0, escapes: 0, fastKills: 0, longFights: 0, fights: [] };
  }
  const l = shadow.learning;
  l.kills = Math.max(0, l.kills | 0);
  l.escapes = Math.max(0, l.escapes | 0);
  l.fastKills = Math.max(0, l.fastKills | 0);
  l.longFights = Math.max(0, l.longFights | 0);
  delete l.dockings;   // retired counters — kept nowhere, read nowhere
  delete l.paidOnce;
  if (!Array.isArray(l.fights)) l.fights = [];
  if (l.fights.length > FIGHT_LOG_MAX) l.fights.splice(0, l.fights.length - FIGHT_LOG_MAX);
  if (!Number.isFinite(shadow.trackedUntil)) shadow.trackedUntil = 0;
  shadow.sabotages = Math.max(0, shadow.sabotages | 0);
  if (!Number.isFinite(shadow.dockArmedAt)) shadow.dockArmedAt = null;
  if (typeof shadow.dockSabotageDone !== 'boolean') shadow.dockSabotageDone = false;
  if (!Number.isFinite(shadow.dockedSince)) shadow.dockedSince = null;
  if (typeof shadow.resolved !== 'string') shadow.resolved = null;
  if (!Number.isFinite(shadow.resolvedAt)) shadow.resolvedAt = null;
  if (typeof shadow.cursed !== 'boolean') shadow.cursed = false;
  if (!Number.isFinite(shadow.spawnedAt)) shadow.spawnedAt = null;
  if (!Number.isFinite(shadow.lastTickAt)) shadow.lastTickAt = null;
  return shadow;
}

// ── small deterministic helpers ───────────────────────────────────────────────

function unit(hash) { return (hash >>> 0) / 0xffffffff; }

function isDocked(state) {
  return !!((state.player && state.player.flags && state.player.flags.docked) || (state.ui && state.ui.docked));
}

function playerEntity(state) {
  const e = state.entities && state.entities.get(state.playerId);
  return e && e.alive !== false && e.pos ? e : null;
}

function liveEntity(state, id) {
  if (id == null || !state.entities || typeof state.entities.get !== 'function') return null;
  const e = state.entities.get(id);
  return e && e.alive !== false ? e : null;
}

/** An entity this module spawned and still owns. Ids recycle within seconds of a
 *  death — the generation stamp (when the world assigns one) plus the lossId tag
 *  keep a recycled patrol or trader from inheriting the grudge's writes. */
function ownedEntity(state, shadow, id, gen) {
  const e = liveEntity(state, id);
  if (!e) return null;
  if (gen != null && e.occupantGeneration !== gen) return null;
  const tag = e.data && e.data.impoundGrudge;
  if (!tag || tag.lossId !== shadow.lossId) return null;
  return e;
}

/**
 * Combat's `entity:killed` lands BEFORE the lifetime sweep deletes the body and
 * frees the id — the only moment a kill can be told from a clean escape. The
 * ~1 Hz tick would otherwise always find a missing id and read 'escaped'.
 * The director forwards its own entity:killed listener to this note at init;
 * ensureKillListener additionally self-subscribes through ctx.bus the first
 * tick it can, which covers bare harnesses that lack the director's wiring.
 * The exported notes are the seams test harnesses drive directly.
 */
export function noteImpoundGrudgeKill(state, payload) {
  if (!state || !payload) return;
  const shadow = activeImpoundShadow(state);
  if (!shadow || shadow.resolved) return;
  const id = payload.id != null ? payload.id : payload.entityId;
  if (id == null || shadow.liveId == null || id !== shadow.liveId) return;
  // entity:killed lands while the body is still in the map — prove the dead
  // thing is OUR nemesis (generation + lossId tag) so a recycled id's death
  // can never stamp a kill it did not earn.
  const e = state.entities && typeof state.entities.get === 'function' ? state.entities.get(id) : null;
  if (!e) return;
  if (shadow.liveGen != null && e.occupantGeneration !== shadow.liveGen) return;
  const tag = e.data && e.data.impoundGrudge;
  if (!tag || tag.lossId !== shadow.lossId) return;
  shadow.killedLiveId = id;
}

/** Save/continue drops the live trail without banking a getaway. Nemesis bodies
 *  are non-persistent, so a restored liveId can only read 'escaped' — a reload
 *  would otherwise be a free step toward 'outlasted'. A kill stamped before the
 *  save still lands on the papers: the stamp survives for the next tick. The
 *  director calls this from its own save:loaded handler (wired at init, before
 *  any flight tick) — and ensureKillListener covers bare harnesses. */
export function noteImpoundGrudgeSaveLoaded(state) {
  const shadow = activeImpoundShadow(state);
  if (!shadow) return;
  if (shadow.liveId == null) return;
  // The kill stamp survives the restore only while it names THIS live trail.
  // A mismatched stamp — stale row, corrupt save — is not a kill: clear it and
  // drop the trail like any other unload, or it would bank a free 'escaped'.
  if (shadow.killedLiveId === shadow.liveId) return;
  shadow.killedLiveId = null;
  const now = Number(state.simTime) || 0;
  const escapes = (shadow.learning && shadow.learning.escapes) | 0;
  shadow.liveId = null;
  shadow.liveGen = null;
  shadow.liveEscortIds = [];
  shadow.liveEscortGens = {};
  shadow.offer = null;
  shadow.mode = null;
  shadow.spawnedAt = null;
  shadow.nextAt = now + ESCAPE_REFIND_S
    + unit(hash32(shadow.lossId, 'impound-refind-esc', escapes)) * ESCAPE_REFIND_JITTER_S;
}

const _killWired = new WeakSet();
function ensureKillListener(state, ctx) {
  if (_killWired.has(state)) return;
  const bus = (ctx && ctx.bus) || state.bus;
  if (!bus || typeof bus.on !== 'function') return;
  _killWired.add(state);
  bus.on('entity:killed', (payload) => noteImpoundGrudgeKill(state, payload));
  bus.on('save:loaded', () => noteImpoundGrudgeSaveLoaded(state));
}

function playerSpeed(player) {
  if (!player || !player.vel) return 0;
  return Math.hypot(player.vel.x || 0, player.vel.z || 0);
}

function dist2(a, b) {
  const dx = (a.pos ? a.pos.x : 0) - (b.pos ? b.pos.x : 0);
  const dz = (a.pos ? a.pos.z : 0) - (b.pos ? b.pos.z : 0);
  return dx * dx + dz * dz;
}

/** Sim-seconds between director ticks (~1 Hz), for hold-to-pay accumulation. */
function tickDt(shadow, now) {
  const last = Number.isFinite(shadow.lastTickAt) ? shadow.lastTickAt : null;
  if (last == null) return 1;
  return Math.max(0, Math.min(5, now - last));
}

function computeTier(shadow) {
  return Math.max(0, Math.min(MAX_TIER, shadow.deaths | 0));
}

function bloodPrice(shadow) {
  const raw = BLOOD_PRICE_BASE_CR
    + BLOOD_PRICE_PER_TIER_CR * (shadow.tier | 0)
    + BLOOD_PRICE_PER_DEATH_CR * (shadow.deaths | 0);
  return Math.max(50, Math.round(raw / 50) * 50);
}

function avengePrize(shadow) {
  return AVENGE_PRIZE_BASE_CR
    + AVENGE_PRIZE_PER_DEATH_CR * (shadow.deaths | 0)
    + AVENGE_PRIZE_PER_TIER_CR * (shadow.tier | 0);
}

function nemesisLevel(shadow, mode) {
  let level = LEVEL_BASE + LEVEL_PER_DEATH * (shadow.deaths | 0);
  if (shadow.learning && shadow.learning.fastKills >= 2) level += LEVEL_FAST_KILL_BONUS;
  if (mode === 'duel') level += LEVEL_DUEL_BONUS;
  return level;
}

/** What this surfacing wants to be. Deterministic off the papers. */
function pickMode(shadow, now) {
  if (shadow.tier >= MAX_TIER) return 'duel';
  const tracked = now < (shadow.trackedUntil || 0);
  const roll = unit(hash32(shadow.lossId, 'impound-mode', shadow.visits | 0));
  const mayParley = shadow.tier >= 1 && shadow.deaths >= 1;
  if (mayParley && !tracked && roll < PARLEY_CHANCE) return 'parley';
  const learnedAmbush = shadow.learning.escapes >= 2 || shadow.learning.fastKills >= 2;
  if (tracked || learnedAmbush || (shadow.tier >= 2 && roll < 0.5)) return 'ambush';
  return 'hunt';
}

function pickEscortArchetype(shadow, slotIndex) {
  const tier = Math.max(1, Math.min(MAX_TIER, shadow.tier | 0));
  const pool = ESCORT_POOLS[tier] || ESCORT_POOLS[1];
  let pick = pool[hash32(shadow.lossId, 'impound-escort', shadow.visits | 0, slotIndex) % pool.length];
  // Learned counters ride over the roll: missile-fast deaths buy a screen,
  // repeated escapes buy the fast corsair that can hold the lane.
  if (slotIndex === 0 && shadow.learning.escapes >= 2) pick = 'corsair_raider';
  if (slotIndex === 1 && shadow.learning.fastKills >= 2) pick = 'pd_screen_escort';
  return pick;
}

// ── speech ────────────────────────────────────────────────────────────────────

function speak(state, ctx, shadow, text, ttl = 6) {
  const helpers = ctx.helpers || {};
  const voice = helpers.voice;
  // voice.say is an external helper on the same footing as spawnEntity — every
  // caller here has already latched (offer cleared, resolved set, surfacing
  // ended) before it speaks, so an unguarded throw would skip whatever writes
  // follow the line: a refused flag that never goes hot, a latched 'avenged'
  // whose prize never posts. A voice fault degrades to the comms popup only.
  let said = false;
  if (voice && typeof voice.say === 'function') {
    try {
      said = !!voice.say({
        channel: 'comms', text, kind: 'impoundGrudge', ttl,
        id: `impoundGrudge:${shadow.lossId}:${shadow.visits | 0}:${hash32(text, 'impound-line') % 997}`,
      });
    } catch (err) { said = false; }
  }
  if (typeof ctx.emit === 'function') {
    ctx.emit('comms:popup', { sender: shadow.grudgeName, text, category: 'personal', ttl, _viaVoice: said });
  }
  return said;
}

function hailLine(shadow, mode) {
  const p = shadow.priorCallsign;
  const name = shadow.grudgeName;
  const v = shadow.visits | 0;
  let table = GRUDGE_LINES;
  if (mode === 'ambush') table = AMBUSH_LINES;
  else if (mode === 'duel') table = DUEL_LINES;
  else if (shadow.tier === 1) table = HUNTER_LINES;
  else if (shadow.tier >= 2) table = PACK_LINES;
  const pick = table[hash32(shadow.lossId, `impound-hail:${mode}`, v) % table.length];
  return pick(p, name);
}

function sayLine(state, ctx, shadow, table, salt, arg) {
  const pick = table[hash32(shadow.lossId, `impound-${salt}`, shadow.visits | 0) % table.length];
  speak(state, ctx, shadow, pick(shadow.priorCallsign, shadow.grudgeName, arg));
}

// ── entity writes (only on entities this module spawned) ─────────────────────

/** Flip a spawned grudge entity to weapons-free on the player. */
function goHot(state, entity, player, trigger) {
  if (!entity) return;
  const data = entity.data || (entity.data = {});
  const ai = data.ai || (data.ai = {});
  ai.passive = false;
  ai.roe = RulesOfEngagement.WEAPONS_FREE;
  ai.motive = 'impound_grudge';
  ai.engagementTrigger = trigger || 'grudge_sighting';
  ai.motiveSatisfied = false;
  ai.forcePlayerTarget = true;
  ai.hostileTeams = [0];
  ai.activity = normalizeActivity({
    kind: ActivityKind.ATTACK_RUN,
    reason: `impound_grudge:${ai.squadId || 'hunt'}`,
    anchor: player && player.pos ? { x: player.pos.x, z: player.pos.z } : null,
    leashRadius: 9000,
    startedTick: state.tick | 0,
    targetId: player ? player.id : null,
    encounterId: ai.squadId || 'impound-grudge',
  });
  const combat = data.combat || (data.combat = {});
  combat.targetId = player ? player.id : null;
  const intent = data.intent || (data.intent = {});
  intent.targetId = player ? player.id : null;
  intent.mode = 'grudge_player';
}

/** Stand a spawned grudge entity down and send it running (paid, broken, or
 *  the arc is over). FLEE is a real activity; the director's stale-encounter
 *  sweep and the world despawn own what happens after it burns off. */
function standDown(state, entity) {
  if (!entity || entity.alive === false) return;
  const data = entity.data || (entity.data = {});
  // A stood-down hull must actually leave: the same despawnAt stamp the
  // encounter director's despawnAll writes, so it stops holding a spawn slot.
  if (!Number.isFinite(data.despawnAt)) data.despawnAt = (Number(state.simTime) || 0) + 20;
  const ai = data.ai || (data.ai = {});
  ai.passive = true;
  ai.roe = RulesOfEngagement.HOLD_FIRE;
  ai.motive = 'impound_grudge';
  ai.engagementTrigger = 'grudge_resolved';
  ai.motiveSatisfied = true;
  ai.forcePlayerTarget = false;
  ai.huntPlayer = false;
  ai.activity = normalizeActivity({
    kind: ActivityKind.FLEE,
    reason: 'impound_grudge_stand_down',
    anchor: entity.pos ? { x: entity.pos.x, z: entity.pos.z } : null,
    leashRadius: 12000,
    startedTick: state.tick | 0,
    targetId: null,
    encounterId: ai.squadId || 'impound-grudge',
  });
  const combat = data.combat || (data.combat = {});
  combat.targetId = null;
  combat.lockTarget = null;
  const intent = data.intent || (data.intent = {});
  intent.targetId = null;
  intent.fire = false;
  intent.fireGroup = null;
}

function standDownEscorts(state, shadow) {
  const gens = shadow.liveEscortGens || {};
  for (const id of shadow.liveEscortIds || []) {
    standDown(state, ownedEntity(state, shadow, id, gens[id]));
  }
  shadow.liveEscortIds = [];
  shadow.liveEscortGens = {};
}

// ── outcome bookkeeping ───────────────────────────────────────────────────────

function recordFight(shadow, now, end) {
  const dur = shadow.spawnedAt != null ? Math.max(0, now - shadow.spawnedAt) : 0;
  const log = shadow.learning.fights;
  log.push({ at: Math.round(now * 100) / 100, s: Math.round(dur * 10) / 10, end, tier: shadow.tier | 0 });
  if (log.length > FIGHT_LOG_MAX) log.splice(0, log.length - FIGHT_LOG_MAX);
  return dur;
}

function scheduleRefind(shadow, now, cause) {
  const jitter = (seed, tag, span) => unit(hash32(shadow.lossId, tag, seed)) * span;
  if (cause === 'escaped') {
    shadow.nextAt = now + ESCAPE_REFIND_S + jitter(shadow.learning.escapes, 'impound-refind-esc', ESCAPE_REFIND_JITTER_S);
    return;
  }
  const raw = REFIND_BASE_S + REFIND_PER_DEATH_S * shadow.deaths - REFIND_TIER_DISCOUNT_S * shadow.tier;
  shadow.nextAt = now + Math.max(REFIND_MIN_S, raw)
    + jitter(shadow.deaths, 'impound-refind', 120);
}

/** A surfacing ended: learn the lesson, stand the escorts down, reschedule.
 *  A kill is only ever proven by the entity:killed stamp — a body flagged dead
 *  without it is the despawn sweep's work, and a missing body is an escape. */
function endSurfacing(state, ctx, shadow, live, now) {
  const cause = shadow.killedLiveId != null && shadow.killedLiveId === shadow.liveId
    ? 'killed'
    : 'escaped';
  const dur = recordFight(shadow, now, cause);
  const wasTier = shadow.tier | 0;
  const wasMode = shadow.mode;
  standDownEscorts(state, shadow);
  shadow.liveId = null;
  shadow.liveGen = null;
  shadow.killedLiveId = null;
  shadow.mode = null;
  shadow.offer = null;
  shadow.spawnedAt = null;

  if (cause === 'killed') {
    shadow.deaths = (shadow.deaths | 0) + 1;
    shadow.learning.kills = (shadow.learning.kills | 0) + 1;
    if (dur <= FAST_KILL_S) shadow.learning.fastKills = (shadow.learning.fastKills | 0) + 1;
    if (dur >= LONG_FIGHT_S) shadow.learning.longFights = (shadow.learning.longFights | 0) + 1;
    shadow.tier = computeTier(shadow);
    if (wasTier >= MAX_TIER) {
      resolveArc(state, ctx, shadow, 'avenged', now);
      return;
    }
    if (typeof ctx.emit === 'function' && shadow.tier > wasTier) {
      ctx.emit('impoundGrudge:escalated', {
        lossId: shadow.lossId, tier: shadow.tier, deaths: shadow.deaths, at: now,
      });
    }
  } else {
    shadow.learning.escapes = (shadow.learning.escapes | 0) + 1;
    if (shadow.learning.escapes >= OUTLAST_ESCAPES) {
      resolveArc(state, ctx, shadow, 'outlasted', now);
      return;
    }
  }
  scheduleRefind(shadow, now, cause);
  // Keep the event legible for observers: how THIS surfacing ended.
  if (typeof ctx.emit === 'function') {
    ctx.emit('impoundGrudge:surfacingEnded', {
      lossId: shadow.lossId, cause, mode: wasMode, tier: wasTier,
      deaths: shadow.deaths, escapes: shadow.learning.escapes, at: now,
    });
  }
}

/** Terminal ending. `kind` is 'settled' | 'avenged' | 'outlasted'. */
function resolveArc(state, ctx, shadow, kind, now) {
  shadow.resolved = kind;
  shadow.resolvedAt = now;
  shadow.nextAt = null;
  shadow.offer = null;
  shadow.mode = null;
  const live = ownedEntity(state, shadow, shadow.liveId, shadow.liveGen);
  if (live) standDown(state, live);
  standDownEscorts(state, shadow);
  shadow.liveId = null;
  shadow.liveGen = null;
  shadow.killedLiveId = null;

  if (kind === 'settled') sayLine(state, ctx, shadow, SETTLED_LINES, 'settled');
  else if (kind === 'avenged') sayLine(state, ctx, shadow, AVENGED_LINES, 'avenged');
  else sayLine(state, ctx, shadow, OUTLASTED_LINES, 'outlasted');

  if (typeof ctx.emit === 'function') {
    if (kind === 'avenged') {
      ctx.emit('economy:grantCredits', {
        amount: avengePrize(shadow),
        reason: `impound_grudge:blood_prize:${shadow.lossId}`,
      });
    }
    ctx.emit('news:publish', {
      text: kind === 'settled'
        ? `The debt on the marked hull is paid. ${shadow.grudgeName} strikes ${shadow.priorCallsign} off the page.`
        : kind === 'avenged'
          ? `${shadow.grudgeName}, ${shadow.grudgeCallsign}, died on the final pass over a used hull's papers. The grudge is closed.`
          : `${shadow.grudgeName} burned the lot papers on ${shadow.priorCallsign}. Some debts starve before they collect.`,
      kind: 'impound_grudge',
      eventId: `impound-grudge:${shadow.lossId}:${kind}`,
      source: 'impoundGrudge',
      sourceRef: shadow.lossId,
    });
    ctx.emit('impoundGrudge:resolved', {
      lossId: shadow.lossId, kind, at: now,
      deaths: shadow.deaths, visits: shadow.visits,
    });
  }
}

// ── parley (the settlement offer) ────────────────────────────────────────────

function openOffer(state, ctx, shadow, entity, now) {
  const price = bloodPrice(shadow);
  shadow.offer = {
    price,
    deadlineAt: now + PARLEY_DEADLINE_S,
    holdS: 0,
    needS: PAY_HOLD_S,
    hull: Number(entity.hull) || 0,
    shield: Number(entity.shield) || 0,
    // Spawned hulls carry armorHp; plain `armor` is the fallback for fixtures.
    armor: Number(entity.armorHp != null ? entity.armorHp : entity.armor) || 0,
  };
  const table = PARLEY_LINES;
  const pick = table[hash32(shadow.lossId, 'impound-parley', shadow.visits | 0) % table.length];
  speak(state, ctx, shadow, pick(shadow.priorCallsign, shadow.grudgeName, price));
  if (typeof ctx.emit === 'function') {
    ctx.emit('impoundGrudge:offer', {
      lossId: shadow.lossId, entityId: entity.id, price,
      deadlineAt: shadow.offer.deadlineAt,
      payRangeWu: PAY_RANGE_WU, payHoldS: PAY_HOLD_S,
      hint: 'Cut thrust and hold inside handshake range to pay the blood price.',
    });
  }
}

function refuseOffer(state, ctx, shadow, entity, player, trigger, { silent = false } = {}) {
  if (!shadow.offer) return;
  shadow.offer = null;
  if (!silent) sayLine(state, ctx, shadow, REFUSAL_LINES, 'refusal');
  if (typeof ctx.emit === 'function') {
    ctx.emit('impoundGrudge:offerRefused', { lossId: shadow.lossId, trigger, entityId: entity && entity.id });
  }
  // A refused flag turns into the hunt on the same body — escorts stay home.
  shadow.mode = 'hunt';
  goHot(state, entity, player, trigger);
}

function payOffer(state, ctx, shadow, entity, now) {
  const price = shadow.offer ? shadow.offer.price : bloodPrice(shadow);
  const credits = state.player && Number.isFinite(state.player.credits) ? state.player.credits : 0;
  if (credits < price) {
    sayLine(state, ctx, shadow, BROKE_LINES, 'broke');
    refuseOffer(state, ctx, shadow, entity, playerEntity(state), 'broke_pockets', { silent: true });
    return;
  }
  if (typeof ctx.emit === 'function') {
    ctx.emit('economy:chargeCredits', {
      amount: price,
      reason: `impound_grudge:blood_price:${shadow.lossId}`,
    });
    ctx.emit('impoundGrudge:settled', { lossId: shadow.lossId, entityId: entity && entity.id, price, at: now });
  }
  resolveArc(state, ctx, shadow, 'settled', now);
}

/** While the flag is up: watch for the pay-hold, the fired shot, the walk-away. */
function tickOffer(state, ctx, shadow, live, player, now, dt) {
  const offer = shadow.offer;
  if (!offer) return;
  // Opening fire answers the demand — any layer drop is a refusal. Spawned
  // hulls carry armorHp; a bare `armor` field is the fixture fallback.
  const armorNow = live.armorHp != null ? live.armorHp : live.armor;
  if ((Number(live.hull) || 0) < offer.hull
    || (Number(live.shield) || 0) < offer.shield
    || (Number(armorNow) || 0) < offer.armor) {
    refuseOffer(state, ctx, shadow, live, player, 'player_attack');
    return;
  }
  if (!player) { refuseOffer(state, ctx, shadow, live, player, 'target_gone'); return; }
  const d2 = dist2(live, player);
  if (d2 > OFFER_ABANDON_WU * OFFER_ABANDON_WU || now >= offer.deadlineAt) {
    refuseOffer(state, ctx, shadow, live, player, now >= offer.deadlineAt ? 'ignored_demand' : 'target_departed');
    return;
  }
  if (d2 <= PAY_RANGE_WU * PAY_RANGE_WU && playerSpeed(player) <= PAY_MAX_SPEED) {
    offer.holdS += dt;
    if (offer.holdS >= offer.needS) payOffer(state, ctx, shadow, live, now);
  } else {
    offer.holdS = 0;
  }
}

// ── docked sabotage ───────────────────────────────────────────────────────────

function tickSabotage(state, ctx, shadow, now) {
  if ((shadow.tier | 0) < SABOTAGE_MIN_TIER) return;
  if (shadow.dockedSince == null) shadow.dockedSince = now;
  if (shadow.dockSabotageDone) return;
  if (shadow.dockArmedAt == null) {
    shadow.dockArmedAt = now + SABOTAGE_DELAY_MIN_S
      + unit(hash32(shadow.lossId, 'impound-sabotage-when', shadow.sabotages | 0))
        * (SABOTAGE_DELAY_MAX_S - SABOTAGE_DELAY_MIN_S);
    return;
  }
  if (now < shadow.dockArmedAt) return;
  const roll = unit(hash32(shadow.lossId, 'impound-sabotage-kind', shadow.sabotages | 0, Math.floor(shadow.dockedSince)));
  if (roll < TRACKER_SHARE) {
    // A tracker wired into the marked hull: the next find arrives sooner and
    // arrives as an ambush — the yard sold the berth's schedule.
    shadow.trackedUntil = now + TRACKED_S;
    const next = Number(shadow.nextAt);
    if (Number.isFinite(next)) {
      shadow.nextAt = Math.min(next, now + TRACKED_REFIND_MIN_S + roll * TRACKED_REFIND_JITTER_S);
    }
    if (typeof ctx.emit === 'function') {
      ctx.emit('toast', { kind: 'warn', ttl: 6, text: `Berth sweep found a tracker on the marked hull — ${shadow.grudgeName}'s crew knows your schedule.` });
      ctx.emit('impoundGrudge:tracked', { lossId: shadow.lossId, trackedUntil: shadow.trackedUntil, at: now });
    }
    sayLine(state, ctx, shadow, TRACKER_LINES, 'tracker');
  } else {
    // A rigged berth fee — petty, real, and it tells the player the marked
    // hull is watched even at dock. The charge goes through the economy event.
    const fee = SABOTAGE_FEE_BASE_CR + SABOTAGE_FEE_PER_TIER_CR * (shadow.tier | 0);
    if (typeof ctx.emit === 'function') {
      ctx.emit('economy:chargeCredits', { amount: fee, reason: `impound_grudge:berth_tamper:${shadow.lossId}` });
      ctx.emit('toast', { kind: 'warn', ttl: 6, text: `A rigged berth meter skimmed ${fee} credits. The tamper mark belongs to ${shadow.grudgeName}'s people.` });
      ctx.emit('impoundGrudge:sabotage', { lossId: shadow.lossId, kind: 'berth_fee', amount: fee, at: now });
    }
    sayLine(state, ctx, shadow, SABOTAGE_FEE_LINES, 'fee');
  }
  shadow.sabotages = (shadow.sabotages | 0) + 1;
  shadow.dockSabotageDone = true;
}

// ── spawning ──────────────────────────────────────────────────────────────────

function spawnPosFor(shadow, mode, player) {
  if (mode === 'ambush' || mode === 'duel') {
    // Cut the lane: lead the player's own velocity so the grudge is already on
    // the intercept course the player is about to fly.
    const dist = AMBUSH_MIN_WU
      + unit(hash32(shadow.lossId, 'impound-ambush-dist', shadow.visits | 0)) * (AMBUSH_MAX_WU - AMBUSH_MIN_WU);
    const speed = playerSpeed(player);
    if (speed >= AMBUSH_MIN_SPEED) {
      return {
        x: player.pos.x + player.vel.x * AMBUSH_LEAD_S + (player.vel.x / speed) * dist,
        z: player.pos.z + player.vel.z * AMBUSH_LEAD_S + (player.vel.z / speed) * dist,
      };
    }
    const bearing = unit(hash32(shadow.lossId, 'impound-ambush-bearing', shadow.visits | 0)) * Math.PI * 2;
    return { x: player.pos.x + Math.cos(bearing) * dist, z: player.pos.z + Math.sin(bearing) * dist };
  }
  if (mode === 'parley') {
    const dist = PARLEY_MIN_WU
      + unit(hash32(shadow.lossId, 'impound-parley-dist', shadow.visits | 0)) * (PARLEY_MAX_WU - PARLEY_MIN_WU);
    const bearing = unit(hash32(shadow.lossId, 'impound-parley-bearing', shadow.visits | 0)) * Math.PI * 2;
    return { x: player.pos.x + Math.cos(bearing) * dist, z: player.pos.z + Math.sin(bearing) * dist };
  }
  const bearing = unit(hash32(shadow.lossId, 'impound-bearing', shadow.visits | 0)) * Math.PI * 2;
  const dist = APPROACH_MIN_WU
    + unit(hash32(shadow.lossId, 'impound-dist', shadow.visits | 0)) * (APPROACH_MAX_WU - APPROACH_MIN_WU);
  return { x: player.pos.x + Math.cos(bearing) * dist, z: player.pos.z + Math.sin(bearing) * dist };
}

/** The nemesis spec: hot on contact for hunt/ambush/duel, under flag for parley. */
function buildNemesisSpec(state, ctx, shadow, mode, pos, player) {
  const level = nemesisLevel(shadow, mode);
  const spec = ctx.makeEnemySpec(shadow.archetype, level, pos, {
    factionId: 'faction_reach',
    motive: 'impound_grudge',
    engagementTrigger: mode === 'ambush' ? 'grudge_ambush'
      : mode === 'duel' ? 'grudge_duel'
        : mode === 'parley' ? 'grudge_flag'
          : 'grudge_sighting',
    startedTick: state.tick | 0,
  });
  spec.data = spec.data || {};
  if (mode === 'duel') {
    // The apex pass: the nemesis spent everything on this hull. Real buffs on the
    // spawned spec — hull, deflectors, flat armor and a faster drive. Computed off
    // the ORIGINAL maxima so the two fields can never double-buff each other.
    const hullMax0 = Number.isFinite(spec.hullMax) ? spec.hullMax : spec.hull;
    const shieldMax0 = Number.isFinite(spec.shieldMax) ? spec.shieldMax : spec.shield;
    if (Number.isFinite(hullMax0)) { spec.hullMax = Math.round(hullMax0 * 1.3); spec.hull = spec.hullMax; }
    if (Number.isFinite(shieldMax0)) { spec.shieldMax = Math.round(shieldMax0 * 1.25); spec.shield = spec.shieldMax; }
    if (Number.isFinite(spec.armorFlat)) spec.armorFlat += 2;
    if (Number.isFinite(spec.maxSpeed)) spec.maxSpeed = spec.maxSpeed * 1.08;
    if (Number.isFinite(spec.combatSpeed)) spec.combatSpeed = spec.combatSpeed * 1.08;
  }
  const ai = spec.data.ai || (spec.data.ai = {});
  ai.squadId = `impound-grudge:${shadow.lossId}`;
  ai.motive = 'impound_grudge';
  ai.spawnContext = mode === 'parley' ? 'grudge_parley'
    : mode === 'ambush' ? 'grudge_ambush'
      : mode === 'duel' ? 'grudge_duel' : 'grudge_hunt';
  ai.name = shadow.grudgeName;
  spec.data.name = shadow.grudgeName;
  spec.data.callsign = shadow.grudgeCallsign;
  spec.data.impoundGrudge = {
    schemaVersion: IMPOUND_GRUDGE_SCHEMA,
    lossId: shadow.lossId,
    priorCallsign: shadow.priorCallsign,
    tier: shadow.tier | 0,
    mode,
    role: 'nemesis',
  };
  if (mode === 'parley') {
    // Under flag: it parks on the player's anchor and talks. The offer's own
    // watcher flips it hot on a fired shot, a walked-away hull, or the deadline.
    ai.passive = true;
    ai.roe = RulesOfEngagement.HOLD_FIRE;
    ai.engagementTrigger = 'grudge_flag';
    ai.activity = normalizeActivity({
      kind: ActivityKind.HAIL_HOLD,
      reason: `impound_grudge_parley:${shadow.lossId}`,
      anchor: player.pos ? { x: player.pos.x, z: player.pos.z } : pos,
      leashRadius: 9000,
      startedTick: state.tick | 0,
      targetId: player.id,
      encounterId: ai.squadId,
    });
  } else {
    ai.engagementTrigger = spec.data.ai.engagementTrigger || 'grudge_sighting';
    ai.roe = RulesOfEngagement.WEAPONS_FREE;
    ai.passive = false;
    ai.forcePlayerTarget = true;
    ai.hostileTeams = [0];
    ai.activity = normalizeActivity({
      kind: ActivityKind.ATTACK_RUN,
      reason: `impound_grudge:${shadow.lossId}`,
      anchor: { x: player.pos.x, z: player.pos.z },
      leashRadius: 9000,
      startedTick: state.tick | 0,
      targetId: player.id,
      encounterId: ai.squadId,
    });
    const combat = spec.data.combat || (spec.data.combat = {});
    combat.targetId = player.id;
    const intent = spec.data.intent || (spec.data.intent = {});
    intent.targetId = player.id;
    intent.mode = 'grudge_player';
  }
  return spec;
}

function buildEscortSpec(state, ctx, shadow, archetype, pos, player) {
  const level = Math.max(1, nemesisLevel(shadow, shadow.mode) - 3);
  const spec = ctx.makeEnemySpec(archetype, level, pos, {
    factionId: 'faction_reach',
    motive: 'impound_grudge',
    engagementTrigger: 'grudge_escort',
    startedTick: state.tick | 0,
  });
  spec.data = spec.data || {};
  const ai = spec.data.ai || (spec.data.ai = {});
  ai.squadId = `impound-grudge:${shadow.lossId}`;
  ai.motive = 'impound_grudge';
  ai.engagementTrigger = 'grudge_escort';
  ai.spawnContext = 'grudge_escort';
  ai.roe = RulesOfEngagement.WEAPONS_FREE;
  ai.passive = false;
  ai.forcePlayerTarget = true;
  ai.hostileTeams = [0];
  ai.activity = normalizeActivity({
    kind: ActivityKind.ATTACK_RUN,
    reason: `impound_grudge:${shadow.lossId}`,
    anchor: { x: player.pos.x, z: player.pos.z },
    leashRadius: 9000,
    startedTick: state.tick | 0,
    targetId: player.id,
    encounterId: ai.squadId,
  });
  const combat = spec.data.combat || (spec.data.combat = {});
  combat.targetId = player.id;
  const intent = spec.data.intent || (spec.data.intent = {});
  intent.targetId = player.id;
  intent.mode = 'grudge_player';
  spec.data.impoundGrudge = {
    schemaVersion: IMPOUND_GRUDGE_SCHEMA,
    lossId: shadow.lossId,
    role: 'escort',
  };
  return spec;
}

/** Tier>=2 ambushes salt the player's most likely run line. The request goes
 *  through the mines owner's bus event; refusal just means a cleaner fight. */
function seedAmbushWake(state, ctx, shadow, nemesis, player) {
  if ((shadow.tier | 0) < 2 || typeof ctx.emit !== 'function' || !nemesis || !player) return;
  const dx = player.pos.x - nemesis.pos.x;
  const dz = player.pos.z - nemesis.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;
  const px = -uz, pz = ux;
  const side = hash32(shadow.lossId, 'impound-wake-side', shadow.visits | 0) % 2 === 0 ? 1 : -1;
  for (let i = 0; i < AMBUSH_WAKE_MINES; i++) {
    const along = 80 + i * WAKE_DEPTH_STEP_WU;
    const flank = (WAKE_FLANK_WU + i * 24) * side;
    ctx.emit('mines:placeRequest', {
      ownerId: nemesis.id,
      team: nemesis.team != null ? nemesis.team : 1,
      factionId: nemesis.factionId || 'faction_reach',
      telegraph: i === 0,
      pos: {
        x: player.pos.x + ux * along + px * flank,
        z: player.pos.z + uz * along + pz * flank,
      },
    });
  }
}

function spawnSurfacing(state, ctx, shadow, player, now) {
  const helpers = ctx.helpers || {};
  if (typeof helpers.spawnEntity !== 'function' || typeof ctx.makeEnemySpec !== 'function') return;
  const mode = pickMode(shadow, now);
  // A fight that ran long teaches it to bring a friend: one extra escort on top
  // of the tier's pack, still bounded by the same request/budget path.
  const wanted = mode === 'parley' ? 0
    : Math.min(3, (ESCORT_COUNT[Math.min(MAX_TIER, shadow.tier | 0)] || 0)
      + Math.min(1, shadow.learning.longFights | 0));
  const requesterId = `impound-grudge:${shadow.lossId}`;

  const budget = helpers.spawnBudget;
  let granted = 1 + wanted;
  if (budget && typeof budget.request === 'function') {
    granted = budget.request(1 + wanted, requesterId);
    if (granted < 1) { shadow.nextAt = now + 30; return; } // a crowded sky holds the grudge, never drops it
  }

  shadow.mode = mode;
  shadow.killedLiveId = null;
  const pos = spawnPosFor(shadow, mode, player);
  const spec = buildNemesisSpec(state, ctx, shadow, mode, pos, player);
  let entity = null;
  try { entity = helpers.spawnEntity(spec); } catch (err) { entity = null; }
  if (!entity || entity.id == null) {
    if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requesterId, granted);
    shadow.mode = null;
    shadow.nextAt = now + 30;
    return;
  }
  // The papers claim the body BEFORE budget bookkeeping: a bind fault after a
  // successful spawn must leave a tracked nemesis — an untracked one would read
  // as no surfacing at all and the next tick would double-spawn.
  shadow.liveId = entity.id;
  shadow.liveGen = entity.occupantGeneration != null ? entity.occupantGeneration : null;
  shadow.visits = (shadow.visits | 0) + 1;
  shadow.spawnedAt = now;
  shadow.liveEscortIds = [];
  shadow.liveEscortGens = {};
  if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(entity.id, requesterId);

  // The pack the tier bought. Escort spawn failures just lighten the pass.
  const escortsGranted = Math.max(0, Math.min(wanted, granted - 1));
  for (let i = 0; i < escortsGranted; i++) {
    const bearing = unit(hash32(shadow.lossId, 'impound-escort-bearing', shadow.visits | 0, i)) * Math.PI * 2;
    const ring = ESCORT_RING_MIN_WU
      + unit(hash32(shadow.lossId, 'impound-escort-ring', shadow.visits | 0, i)) * (ESCORT_RING_MAX_WU - ESCORT_RING_MIN_WU);
    const epos = { x: pos.x + Math.cos(bearing) * ring, z: pos.z + Math.sin(bearing) * ring };
    const espec = buildEscortSpec(state, ctx, shadow, pickEscortArchetype(shadow, i), epos, player);
    let escort = null;
    try { escort = helpers.spawnEntity(espec); } catch (err) { escort = null; }
    if (escort && escort.id != null) {
      // Tracked first, bound second — a bind fault cannot orphan the body.
      shadow.liveEscortIds.push(escort.id);
      if (escort.occupantGeneration != null) shadow.liveEscortGens[escort.id] = escort.occupantGeneration;
      if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(escort.id, requesterId);
    }
  }
  if (budget && typeof budget.releaseSome === 'function' && granted > 1 + shadow.liveEscortIds.length) {
    budget.releaseSome(requesterId, granted - 1 - shadow.liveEscortIds.length);
  }

  if (mode === 'ambush') seedAmbushWake(state, ctx, shadow, entity, player);

  if (mode === 'parley') {
    openOffer(state, ctx, shadow, entity, now);
  } else {
    speak(state, ctx, shadow, hailLine(shadow, mode));
  }
  if (typeof ctx.emit === 'function') {
    ctx.emit('impoundGrudge:surfaced', {
      lossId: shadow.lossId, mode, tier: shadow.tier | 0,
      entityId: entity.id, escorts: shadow.liveEscortIds.slice(), at: now,
    });
  }
}

// ── the tick ──────────────────────────────────────────────────────────────────

/**
 * One tick of the grudge lifecycle, hosted by the encounter director's ~1 Hz block.
 * ctx supplies the spawn/emit surface: { helpers, emit, makeEnemySpec, bus }.
 */
export function tickImpoundGrudge(state, ctx) {
  if (!state || !ctx) return;
  ensureKillListener(state, ctx);
  const shadow = activeImpoundShadow(state);
  if (!shadow) return;
  const now = Number(state.simTime) || 0;
  ensureShadow(shadow, now);
  if (shadow.resolved) return;
  const dt = tickDt(shadow, now);
  shadow.lastTickAt = now;

  // Track the live grudge hull: death/gone reschedules the next surfacing and the
  // count rides the papers — the grudge remembers how often it has died to this hull.
  if (shadow.liveId != null) {
    const live = ownedEntity(state, shadow, shadow.liveId, shadow.liveGen);
    if (!live || (shadow.killedLiveId != null && shadow.killedLiveId === shadow.liveId)) {
      endSurfacing(state, ctx, shadow, live, now);
      return;
    }
    // Docked while hunted: the berth swallows the trail. Counted as an escape —
    // the vendetta learns that running works until running stops working.
    if (isDocked(state)) {
      standDown(state, live);
      endSurfacing(state, ctx, shadow, live, now);
      return;
    }
    const gens = shadow.liveEscortGens || {};
    shadow.liveEscortIds = (shadow.liveEscortIds || []).filter(
      (id) => ownedEntity(state, shadow, id, gens[id]) != null,
    );
    const player = playerEntity(state);
    if (shadow.mode === 'parley' && shadow.offer) {
      tickOffer(state, ctx, shadow, live, player, now, dt);
      return;
    }
    // Tier>=2 keeps its word once: under a third of its hull it names the debt aloud.
    if (!shadow.cursed && (shadow.tier | 0) >= 2
      && Number.isFinite(live.hullMax) && live.hullMax > 0
      && Number.isFinite(live.hull) && live.hull < live.hullMax * DESPERATION_HULL) {
      shadow.cursed = true;
      sayLine(state, ctx, shadow, DESPERATION_LINES, 'curse');
    }
    return;
  }

  if (isDocked(state)) {
    tickSabotage(state, ctx, shadow, now);
    return;
  }
  // Undock clears the berth bookkeeping for the next stop.
  shadow.dockedSince = null;
  shadow.dockSabotageDone = false;
  shadow.dockArmedAt = null;
  if (!(now >= shadow.nextAt)) return;

  const player = playerEntity(state);
  if (!player) return;
  spawnSurfacing(state, ctx, shadow, player, now);
}
