// Chains join an actual prior death to the exact live wreck life that carried the contact.
// Event-only and presentation-only: it grants no rewards and applies no law effects.

import { hash32 } from '../core/rng.js';
import { clearChainWreckWitnesses, CHAIN_WITNESS_WINDOW_S } from './killCausality.js';

/** Seconds a corpse's chain stays live — a hull that broke a moment ago, not a minute ago. */
export const CHAIN_KILL_WINDOW_S = CHAIN_WITNESS_WINDOW_S;
/** Rows the ring holds. Eight corpses is more than one fight can chain through. */
export const CHAIN_KILL_RING = 8;
/** Minimum seconds between wire lines — a triple chain says one line per link, not a storm. */
export const CHAIN_KILL_LINE_GAP_S = 4;
/** Bodies already receipted never receipt twice — one terminal observation per hull. */
export const CHAIN_KILL_LATCH_CAP = 32;

const CHAIN_CAUSES = new Set(['ship_collision', 'terrain_collision', 'generic']);

/**
 * Pure matcher. `rows` is the ring (oldest first), `facts` the fresh kill's own facts
 * ({ victimId, impactorId, cause, playerCaused, at }). Returns the ring row the kill
 * chained through, or null. The same rows and facts always answer the same way.
 */
export function matchChainKill(rows, facts) {
  if (!Array.isArray(rows) || !facts) return null;
  if (facts.playerCaused !== true) return null;
  if (!CHAIN_CAUSES.has(facts.cause)) return null;
  const witness = facts.witness;
  if (!witness || witness.wreckId !== facts.impactorId || witness.wreckGeneration !== facts.impactorGen) return null;
  const at = Number.isFinite(facts.at) ? facts.at : 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (!row || row.victimId !== witness.firstId || row.gen !== witness.firstGeneration
      || row.at !== witness.deathTime) continue;
    if (at - row.at > CHAIN_KILL_WINDOW_S || at - row.at <= 0) return null;
    return row;
  }
  return null;
}

/** Bounded ring push: newest kill in, stale rows and the cap out. Returns the next ring. */
export function pushChainRow(rows, row, cap = CHAIN_KILL_RING) {
  const next = Array.isArray(rows) ? rows.filter(Boolean) : [];
  next.push(row);
  while (next.length > cap) next.shift();
  return next;
}

/** Rows fall out of the ring on their own clock — a stale corpse cannot chain a fresh kill. */
export function pruneChainRows(rows, at, windowS = CHAIN_KILL_WINDOW_S) {
  return (Array.isArray(rows) ? rows : []).filter((row) => row && at - row.at <= windowS);
}

const CHAIN_LINES = Object.freeze([
  'The wreck of {first} just broke {second}.',
  '{second} met the wreck of {first}. The wire logs both.',
  'The hull you broke carried {second} with it. The wire logs the pair.',
  '{first} was still moving. {second} found out.',
]);

function chainLineFor(seed, firstId, secondId) {
  const pick = CHAIN_LINES[hash32(seed == null ? 0 : seed, firstId == null ? 0 : firstId, secondId == null ? 0 : secondId, 'chainKill') % CHAIN_LINES.length];
  return pick;
}

function victimLabel(state, id, fallback = 'a hull') {
  const e = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(id) : null;
  const data = e && e.data ? e.data : {};
  const raw = data.callsign || data.displayName || data.name || (data.def && data.def.name)
    || data.defId || (e && e.name);
  const text = String(raw || '').trim();
  return text ? text.slice(0, 64) : fallback;
}

export const chainKills = {
  name: 'chainKills',
  id: 'chainKills',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._unsubs = [];
    this._rows = [];
    this._lastLineAt = -Infinity;
    this._latched = [];
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._unsubs.push(this.bus.on('entity:killed', (p) => this._onKilled(p)));
    const clear = () => { this._clearWitnesses(); clearChainWreckWitnesses(this.state); };
    for (const event of ['game:new', 'game:newGame', 'save:restoring', 'save:loaded', 'player:death']) {
      this._unsubs.push(this.bus.on(event, clear));
    }
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._rows = [];
    this._latched = [];
  },

  _clearWitnesses() {
    this._rows = [];
    this._latched = [];
    this._lastLineAt = -Infinity;
  },

  /** Read-only, for the readout and tests. */
  chainRows() {
    return this._rows.map((row) => ({ ...row }));
  },

  _playerIdOf(state) {
    return state && state.playerId != null ? state.playerId : null;
  },

  _onKilled(payload) {
    const state = this.state;
    if (!state || !payload) return;
    // Hulls only, and only the pilot's own kills — a station or a mine is not a body that
    // ricochets, and an NPC's stray wreck is not the pilot's act.
    if (payload.type !== 'ship' || payload.id == null || payload.id === state.playerId) return;
    const playerId = this._playerIdOf(state);
    if (playerId == null || payload.killerId !== playerId) return;
    const presentation = payload.presentation && typeof payload.presentation === 'object'
      ? payload.presentation : null;
    const cause = (presentation && presentation.cause) || payload.cause || null;
    if (!Number.isFinite(state.simTime)) return;
    const now = state.simTime;
    const victim = state.entities?.get?.(payload.id);
    if (!victim || !Number.isSafeInteger(victim.occupantGeneration)) return;
    this._rows = pruneChainRows(this._rows, now);

    const row = {
      victimId: payload.id,
      gen: victim.occupantGeneration,
      label: victimLabel(state, payload.id, 'the first hull'),
      at: now,
      pos: payload.pos && Number.isFinite(payload.pos.x) ? { x: payload.pos.x, z: payload.pos.z } : null,
    };

    const impactor = payload.impactorId != null && state.entities
      && typeof state.entities.get === 'function'
      ? state.entities.get(payload.impactorId) : null;
    const facts = {
      victimId: payload.id,
      impactorId: payload.impactorId ?? null,
      witness: payload.chainWitness,
      impactorGen: impactor && Number.isFinite(impactor.occupantGeneration)
        ? impactor.occupantGeneration : null,
      cause,
      playerCaused: presentation && typeof presentation.playerCaused === 'boolean'
        ? presentation.playerCaused
        : true,
      at: now,
    };
    const matched = matchChainKill(this._rows, facts);
    const chained = matched && impactor
      && presentation?.impactLink?.actorId === playerId ? matched : null;
    // The fresh corpse joins the ring whether or not it chains — it may carry the next link.
    this._rows = pushChainRow(this._rows, row);

    if (!chained) return;
    // One receipt per second victim: a replayed terminal observation of the same hull is
    // observed, not acknowledged again (the same once-only law the swarm chain keeps).
    if (this._latched.some((entry) => entry.id === payload.id && entry.gen === row.gen)) return;
    this._latched.push({ id: payload.id, gen: row.gen });
    if (this._latched.length > CHAIN_KILL_LATCH_CAP) this._latched.shift();
    const receipt = {
      firstId: chained.victimId,
      secondId: payload.id,
      cause: 'wreck_collision',
      windowS: CHAIN_KILL_WINDOW_S,
      at: now,
      pos: payload.pos ? { x: payload.pos.x, z: payload.pos.z } : (chained.pos || null),
    };
    this._emit('combat:chainKill', receipt);
    this._speak(state, receipt, chained.label);
  },

  /** The wire's acknowledgment: one line per link, held to a slow cadence. */
  _speak(state, receipt, firstLabel) {
    if (receipt.at - this._lastLineAt < CHAIN_KILL_LINE_GAP_S) return;
    this._lastLineAt = receipt.at;
    const text = chainLineFor(state.meta && state.meta.seed, receipt.firstId, receipt.secondId)
      .replace('{first}', firstLabel || 'the first hull')
      .replace('{second}', victimLabel(state, receipt.secondId, 'another hull'));
    this._emit('comms:log', { text, speaker: 'The wire', kind: 'chainKill' });
  },

  _emit(evt, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(evt, payload);
  },
};

export default chainKills;
