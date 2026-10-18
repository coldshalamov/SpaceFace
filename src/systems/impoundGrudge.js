// CRT-03 second slice — the lot hull's nemesis.
// A used hull sells with its papers: scars, a deed, and the dead owner's callsign
// (impoundLot keeps that name on the listing). Somebody out there still holds the
// grudge — and reads the lot registry. While the player flies the marked hull, the
// grudge can find it again: a named hostile drops in on approach, hails the DEAD
// owner's callsign (they think the old hands still fly it), and opens fire.
//
// The shadow record lives on owned.impoundShadow so the grudge follows the hull —
// swap ships and it loses interest; sell the hull and it is gone for good.
// Single writers preserved: this module only requests a spawn through helpers and
// stamps its own shadow fields; combat/AI outcomes stay with their owners.

import { hash32 } from '../core/rng.js';
import { ActivityKind, normalizeActivity } from '../ai/doctrine.js';

export const IMPOUND_GRUDGE_SCHEMA = 1;

const FIRST_FIND_MIN_S = 75;
const FIRST_FIND_MAX_S = 180;
const REFIND_BASE_S = 240;
const REFIND_PER_DEATH_S = 120;
const APPROACH_MIN_WU = 1200;
const APPROACH_MAX_WU = 1700;
const LEVEL_BASE = 4;
const LEVEL_PER_DEATH = 2;

// Personal vendettas — not law, not a squad. A small authored cast so each grudge
// keeps a face across resurfacings; the pick is deterministic per lot hull.
const GRUDGE_CAST = Object.freeze([
  Object.freeze({ name: 'Mara Vex', callsign: 'WIDOWMAKER', archetype: 'reaver_pirate' }),
  Object.freeze({ name: 'Colm Tarn', callsign: 'DEBT', archetype: 'corsair_raider' }),
  Object.freeze({ name: 'Isolde Brand', callsign: 'NINE LIVES', archetype: 'lancer_sniper' }),
  Object.freeze({ name: 'Ro Ashkettle', callsign: 'GRUDGE', archetype: 'bruiser_brawler' }),
]);

const GRUDGE_LINES = Object.freeze([
  (p) => `${p}. Those scars. I followed the lot papers — I know that hull.`,
  (p) => `${p}, you can't be dead. Not until I do it. Come out.`,
  (p) => `Same hull. Same marks. ${p}, this ends the way it should have.`,
]);

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
    liveId: null,
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

function hailLine(shadow) {
  const pick = GRUDGE_LINES[hash32(shadow.lossId, 'impound-hail', shadow.visits | 0) % GRUDGE_LINES.length];
  return pick(shadow.priorCallsign);
}

function isDocked(state) {
  return !!((state.player && state.player.flags && state.player.flags.docked) || (state.ui && state.ui.docked));
}

/**
 * One tick of the grudge lifecycle, hosted by the encounter director's ~1 Hz block.
 * ctx supplies the spawn/emit surface: { helpers, emit, makeEnemySpec }.
 */
export function tickImpoundGrudge(state, ctx) {
  if (!state || !ctx) return;
  const shadow = activeImpoundShadow(state);
  if (!shadow) return;
  const now = Number(state.simTime) || 0;

  // Track the live grudge hull: death/gone reschedules the next surfacing and the
  // count rides the papers — the grudge remembers how often it has died to this hull.
  if (shadow.liveId != null) {
    const live = state.entities && state.entities.get(shadow.liveId);
    if (!live || live.alive === false) {
      shadow.deaths = (shadow.deaths | 0) + 1;
      shadow.liveId = null;
      shadow.nextAt = now + REFIND_BASE_S + REFIND_PER_DEATH_S * shadow.deaths
        + (hash32(shadow.lossId, 'impound-refind', shadow.deaths) / 0xffffffff) * 120;
    }
    return;
  }
  if (isDocked(state)) return;
  if (!(now >= shadow.nextAt)) return;

  const player = state.entities && state.entities.get(state.playerId);
  if (!player || player.alive === false || !player.pos) return;
  const helpers = ctx.helpers || {};
  if (typeof helpers.spawnEntity !== 'function' || typeof ctx.makeEnemySpec !== 'function') return;

  const budget = helpers.spawnBudget;
  if (budget && typeof budget.request === 'function') {
    const grant = budget.request(1, `impound-grudge:${shadow.lossId}`);
    if (grant < 1) { shadow.nextAt = now + 30; return; } // a crowded sky holds the grudge, never drops it
  }

  const bearing = (hash32(shadow.lossId, 'impound-bearing', shadow.visits | 0) / 0xffffffff) * Math.PI * 2;
  const dist = APPROACH_MIN_WU
    + (hash32(shadow.lossId, 'impound-dist', shadow.visits | 0) / 0xffffffff) * (APPROACH_MAX_WU - APPROACH_MIN_WU);
  const pos = { x: player.pos.x + Math.cos(bearing) * dist, z: player.pos.z + Math.sin(bearing) * dist };
  const level = LEVEL_BASE + LEVEL_PER_DEATH * (shadow.deaths | 0);
  const spec = ctx.makeEnemySpec(shadow.archetype, level, pos, {
    factionId: 'faction_reach',
    motive: 'impound_grudge',
    engagementTrigger: 'grudge_sighting',
    startedTick: state.tick | 0,
  });
  spec.data = spec.data || {};
  const ai = spec.data.ai || (spec.data.ai = {});
  ai.squadId = `impound-grudge:${shadow.lossId}`;
  ai.motive = 'impound_grudge';
  ai.engagementTrigger = 'grudge_sighting';
  ai.spawnContext = 'grudge_hunt';
  ai.roe = 'weapons_free';
  ai.passive = false;
  ai.forcePlayerTarget = true;
  ai.hostileTeams = [0];
  ai.name = shadow.grudgeName;
  spec.data.name = shadow.grudgeName;
  spec.data.callsign = shadow.grudgeCallsign;
  spec.data.impoundGrudge = { schemaVersion: IMPOUND_GRUDGE_SCHEMA, lossId: shadow.lossId, priorCallsign: shadow.priorCallsign };
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

  let entity = null;
  try { entity = helpers.spawnEntity(spec); } catch (err) { entity = null; }
  if (!entity || entity.id == null) {
    if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(`impound-grudge:${shadow.lossId}`, 1);
    shadow.nextAt = now + 30;
    return;
  }
  if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(entity.id, `impound-grudge:${shadow.lossId}`);
  shadow.liveId = entity.id;
  shadow.visits = (shadow.visits | 0) + 1;

  const text = hailLine(shadow);
  const voice = helpers.voice;
  const said = !!(voice && typeof voice.say === 'function'
    && voice.say({ channel: 'comms', text, kind: 'impoundGrudge', ttl: 5, id: `impoundGrudge:${shadow.lossId}:${shadow.visits}` }));
  if (typeof ctx.emit === 'function') {
    ctx.emit('comms:popup', { sender: shadow.grudgeName, text, category: 'personal', ttl: 6, _viaVoice: said });
  }
}
