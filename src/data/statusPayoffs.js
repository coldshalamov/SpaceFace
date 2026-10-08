// SFQ-B033 — words for states the catalog already applies. Not a second status engine.
// Unknown ids stay quiet so a gravity mark or a cryo lock does not grow a new sentence here.

const LINES = Object.freeze({
  status_pinned: Object.freeze({ key: 'status:pinned', name: 'PINNED', detail: 'HEAVIER', clears: Object.freeze(['status:unmoored']) }),
  status_unmoored: Object.freeze({ key: 'status:unmoored', name: 'UNMOORED', detail: 'LIGHTER', clears: Object.freeze(['status:pinned']) }),
  // The player hull never keeps status_tumbling — tumbleStates strips it as player_immune.
  status_burning: Object.freeze({ key: 'status:burning', name: 'BURNING', detail: 'HEAT TICKS' }),
  status_goo: Object.freeze({ key: 'status:goo', name: 'GOOED', detail: 'WALLOWS' }),
  // The worn effect is a dead lock, not the ion+heat recipe that minted it.
  status_scrambled: Object.freeze({ key: 'status:scrambled', name: 'SCRAMBLED', detail: 'NO LOCK' }),
});

const PRIME_TRIGGERS = Object.freeze({
  proximity: 'PROXIMITY',
  fuze: 'FUZE',
  command: 'COMMAND',
  chain: 'CHAIN',
  collapse: 'COLLAPSE',
});

/** Readable payoff for a status the player is wearing. Null when this catalog has no sentence. */
export function statusPayoffLine(statusId) {
  return LINES[statusId] || null;
}

/** The bay just committed a fuse. One line, named by the trigger that cooked it. */
export function bombPrimeLine(payload) {
  const p = payload || {};
  const raw = typeof p.trigger === 'string' ? p.trigger : '';
  const detail = PRIME_TRIGGERS[raw] || (raw ? raw.toUpperCase() : '');
  const id = p.bombId != null ? String(p.bombId) : 'bomb';
  return { key: `prime:${id}`, name: 'PRIMED', detail };
}
