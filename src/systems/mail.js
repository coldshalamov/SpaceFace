// mail.js — PULSE-MAIL (build_map row 435), the delivery half of data/mail.js.
//
// The pilot's mailbox. Every authored letter carries `triggers` — conjuncts over live state
// (story beats, days, rep, heat, cargo, deeds) or bus events this system witnessed. A letter
// delivers exactly once, when every conjunct holds — nothing arrives untriggered and nothing
// repeats. Delivery is a persistent `comms:popup`: the letter lands on the comms feed and in
// the backlog, which is the inbox the player re-reads with the comms-log key.
//
// Ownership: `state.mail` = { delivered, events } — the durable record of letters already
// sent and the bounded witness log of trigger events. Deterministic: evaluation runs on the
// fixed tick, event receipts are recorded at fire time, and delivery order is the authored
// letter order. No shared-RNG draws, no wall time.

import { MAIL_EVENT_NAMES, MAIL_LETTERS, MAIL_DAY_S } from '../data/mail.js';
import { deedTally } from './deedRecord.js';

const SCHEMA_VERSION = 1;
const EVENT_CAP = 96;
const LETTER_BY_ID = new Map(MAIL_LETTERS.map((letter) => [letter.id, letter]));

function freshState() {
  return { schemaVersion: SCHEMA_VERSION, delivered: [], events: [] };
}

function normalizeState(input) {
  const source = input && typeof input === 'object' ? input : {};
  const delivered = Array.isArray(source.delivered)
    ? source.delivered.filter((id) => LETTER_BY_ID.has(String(id))).map(String)
    : [];
  const events = Array.isArray(source.events)
    ? source.events.slice(-EVENT_CAP).map((row) => ({
      n: String(row && row.n || ''),
      t: Number.isFinite(Number(row && row.t)) ? Number(row.t) : 0,
      f: row && row.f && typeof row.f === 'object' ? { ...row.f } : {},
    })).filter((row) => row.n)
    : [];
  return { schemaVersion: SCHEMA_VERSION, delivered, events };
}

// Scalar payload fields worth remembering for trigger matching — one hop only, no nesting.
function eventScalars(payload) {
  const out = {};
  if (!payload || typeof payload !== 'object') return out;
  let count = 0;
  for (const [key, value] of Object.entries(payload)) {
    if (count >= 8) break;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
      count++;
    }
  }
  return out;
}

/** One conjunct against live state + the witnessed-event log. */
export function mailTriggerSatisfied(trigger, state, events) {
  if (!trigger || !state) return false;
  const day = Math.floor(((state && state.simTime) || 0) / MAIL_DAY_S);
  const player = state.player || {};
  const story = state.story || {};
  switch (trigger.type) {
    case 'day':
      return day >= (Number(trigger.at) || 0);
    case 'window':
      return day >= (Number(trigger.fromDay) || 0) && day <= (Number(trigger.toDay) || 0);
    case 'beat':
      return (Number(story.beatIndex) || 0) >= (Number(trigger.at) || 0);
    case 'stat': {
      const stats = player.stats || {};
      return (Number(stats[trigger.stat]) || 0) >= (Number(trigger.gte) || 0);
    }
    case 'deed':
      return deedTally(state, trigger.kind) > 0;
    case 'rep': {
      const rec = state.factions && state.factions[trigger.faction];
      return (rec && Number(rec.rep) || 0) >= (Number(trigger.gte) || 0);
    }
    case 'heat':
      return (Number(player.heat) || 0) >= (Number(trigger.gte) || 0);
    case 'flag':
      return !!(story.flags && story.flags[trigger.flag]);
    case 'cargo': {
      const items = player.cargo && player.cargo.items || {};
      return (Number(items[trigger.commodity]) || 0) >= (Number(trigger.gte) || 1);
    }
    case 'docked':
      return state.ui && state.ui.dockedStationId === trigger.station;
    case 'ship': {
      const ships = Array.isArray(player.ownedShips) ? player.ownedShips : [];
      return ships.some((row) => row && (row.shipId === trigger.ship || (row.def && row.def.id === trigger.ship)));
    }
    case 'credits':
      return (Number(player.credits) || 0) >= (Number(trigger.gte) || 0);
    case 'event': {
      if (!Array.isArray(events)) return false;
      for (const row of events) {
        if (!row || row.n !== trigger.name) continue;
        if (!trigger.match) return true;
        let ok = true;
        for (const [field, want] of Object.entries(trigger.match)) {
          const got = row.f ? row.f[field] : undefined;
          if (want && typeof want === 'object' && Number.isFinite(want.gte)) {
            if (!(Number(got) >= want.gte)) { ok = false; break; }
          } else if (got !== want) { ok = false; break; }
        }
        if (ok) return true;
      }
      return false;
    }
    default:
      return false;
  }
}

/** All conjuncts hold — the letter is due right now. */
export function mailLetterDue(letter, state, events) {
  if (!letter || !Array.isArray(letter.triggers) || letter.triggers.length === 0) return false;
  return letter.triggers.every((trigger) => mailTriggerSatisfied(trigger, state, events));
}

export const mail = {
  name: 'mail',

  init(ctx) {
    for (const off of this._unsubs || []) {
      try { off(); } catch (_) {}
    }
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._unsubs = [];
    this._accumS = 0;
    this._ensureState();
    for (const name of MAIL_EVENT_NAMES) this._listen(name);
  },

  newGame() {
    this.state.mail = freshState();
    this._accumS = 0;
  },

  serialize() {
    return JSON.parse(JSON.stringify(normalizeState(this._ensureState())));
  },

  deserialize(data) {
    this.state.mail = normalizeState(data);
    return this.state.mail;
  },

  destroy() {
    for (const off of this._unsubs || []) {
      try { off(); } catch (_) {}
    }
    this._unsubs = [];
  },

  _ensureState() {
    if (!this.state.mail || typeof this.state.mail !== 'object') {
      this.state.mail = freshState();
    }
    return this.state.mail;
  },

  _listen(name) {
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const off = this.bus.on(name, (payload) => this._witness(name, payload));
    if (typeof off === 'function') this._unsubs.push(off);
  },

  /** Record one witnessed trigger event. Deliveries evaluate on the next tick. */
  _witness(name, payload) {
    const own = this._ensureState();
    own.events.push({ n: name, t: (this.state && this.state.simTime) || 0, f: eventScalars(payload) });
    if (own.events.length > EVENT_CAP) own.events.splice(0, own.events.length - EVENT_CAP);
  },

  update(dt, state) {
    this._accumS = (this._accumS || 0) + Math.max(0, Number(dt) || 0);
    if (this._accumS < 1) return;         // a letter can wait one second
    this._accumS = 0;
    this._evaluate(state || this.state);
  },

  _evaluate(state) {
    const own = this._ensureState();
    const delivered = new Set(own.delivered);
    for (const letter of MAIL_LETTERS) {
      if (delivered.has(letter.id)) continue;
      if (!mailLetterDue(letter, state, own.events)) continue;
      this._deliver(letter, own);
      delivered.add(letter.id);
    }
  },

  _deliver(letter, own) {
    own.delivered.push(letter.id);
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('comms:popup', {
        id: `mail:${letter.id}`,
        sender: letter.from,
        text: letter.body,
        note: letter.subject,
        category: letter.kind === 'crew' ? 'story' : 'personal',
        persist: true,
      });
      this.bus.emit('mail:delivered', {
        id: letter.id, kind: letter.kind, from: letter.from,
        at: (this.state && this.state.simTime) || 0,
      });
    }
  },
};

export default mail;
