// PQ-146 §6.2 Open Line Contracts: optional physical puzzles with more than one answer. Completion
// is derived only from causal trick receipts — the detector decides, never a scripted exception.
// Cards are persistent recognition records (a proven route and a name), never score or pay.

export const LINE_CONTRACTS = Object.freeze([
  Object.freeze({
    id: 'wrong_side_of_cover', name: 'Wrong Side of Cover',
    brief: 'Defeat a finite target whose direct line to you was occluded when the proved chain opened.',
    approaches: Object.freeze(['Bank Job around the cover', 'Well Golf / Slingshot Golf into the occluded corridor']),
  }),
  Object.freeze({
    id: 'second_hand_violence', name: 'Second-Hand Violence',
    brief: 'Use an already dead substantial hull in a consequential defeat of a live target.',
    approaches: Object.freeze(["Dead Man's Mass throw", 'An attached Wrecking Ball rigged after death']),
  }),
  Object.freeze({
    id: 'leave_with_it', name: 'Leave With It',
    brief: 'Escape a real hostile interception while retaining a specific independently acquired cargo pod, causing no new civilian harm.',
    approaches: Object.freeze(['Kickstart the blast clear', 'Needle Thread through the closing pair']),
  }),
]);
export const LINE_CONTRACT_IDS = Object.freeze(LINE_CONTRACTS.map((c) => c.id));
const CONTRACT_BY_ID = Object.freeze(Object.fromEntries(LINE_CONTRACTS.map((c) => [c.id, c])));
const CIVILIAN_ROLES = ['hauler', 'courier', 'miner', 'trader', 'civilian', 'fleeing_trader'];

/** Same civilian test the law layer applies (team, convoy context or a civilian traffic role). */
export function isCivilianEntity(entity) {
  if (!entity || entity.type !== 'ship') return false;
  const data = entity.data || {}, ai = data.ai || {};
  const role = String(data.trafficRole || data.role || data.presentationRole || ai.role || ai.archetype || '').toLowerCase();
  return entity.team === 2 || ai.spawnContext === 'convoy_civilian'
    || CIVILIAN_ROLES.some((word) => role.includes(word));
}

/** A specific independently acquired pod: a provenance-tracked cargo lot, never generic stock. */
export function heldCargoPodLot(state) {
  const lots = state?.player?.cargo?.richLots;
  if (!Array.isArray(lots)) return null;
  return lots.find((lot) => lot && lot.qty > 0 && lot.lotId) ?? null;
}

/** Persistent card book. Lives under state.story so it survives run boundaries and saves. */
export function contractBook(state) {
  if (!state) return null;
  state.story ||= {};
  const book = state.story.lineContracts ||= { version: 1, active: null, completed: [] };
  if (!Array.isArray(book.completed)) book.completed = [];
  return book;
}

export function setActiveContract(state, contractId) {
  const book = contractBook(state);
  if (!book) return null;
  book.active = contractId != null && CONTRACT_BY_ID[contractId] && !book.completed.some((c) => c.contractId === contractId)
    ? contractId : null;
  return book.active;
}

export function civilianHarmInWindow(harm, fromTick, toTick) {
  if (!Array.isArray(harm) || !Number.isFinite(fromTick) || !Number.isFinite(toTick)) return false;
  return harm.some((row) => row && Number.isFinite(row.tick) && row.tick >= fromTick && row.tick <= toTick);
}

/**
 * Evaluate one detected trick against the three open contracts. Returns every contract the trick
 * proves — a single physical episode can satisfy more than one puzzle. `ctx.cargoPodHeld` and
 * `ctx.civilianHarm` are supplied by the caller, which owns live state.
 */
export function contractCompletionsFor(trick, ctx = {}) {
  if (!trick || trick.role !== 'primary') return [];
  const out = [], killed = trick.consequence?.killed === true;
  const metrics = trick.metrics || {};
  // Wrong Side of Cover: a defeat whose proved chain opened with the victim's direct line to the
  // player occluded. Bank Job requires that occlusion by definition; other causal routes carry it
  // as measured evidence. A victim recorded as impelled reads unknown, never assumed covered.
  if (killed && (trick.trickId === 'bank_job' || metrics.occludedAtRoot === true)) out.push('wrong_side_of_cover');
  // Second-Hand Violence: an already dead substantial hull defeats a live target. Dead Man's Mass
  // is that by definition; an attached Wrecking Ball qualifies when its hull died before the chain
  // opened and it still carried substantial mass.
  if (killed && (trick.trickId === 'dead_mans_mass'
    || (trick.trickId === 'wrecking_ball' && metrics.sourceDeadBeforeRoot === true
      && (metrics.payloadMass ?? 0) >= 0.2 * (metrics.sceneReferenceMass ?? Infinity)))) out.push('second_hand_violence');
  // Leave With It: a real escape trick while still holding a specific acquired pod, and no new
  // civilian harm anywhere in the escape episode's window.
  if (trick.pureEscape === true && ['kickstart', 'needle_thread'].includes(trick.trickId)
    && ctx.cargoPodHeld === true
    && !civilianHarmInWindow(ctx.civilianHarm, trick.rootTick, trick.tick)) out.push('leave_with_it');
  return out;
}

/**
 * Record a completion. At most one card per contract; a repeat proves the same technique under the
 * ordinary rules and earns nothing extra. Returns the awarded card or null.
 */
export function awardContractCompletion(state, contractId, trick, tick) {
  const book = contractBook(state);
  const def = contractId && CONTRACT_BY_ID[contractId];
  if (!book || !def || !trick || book.completed.some((c) => c.contractId === contractId)) return null;
  const card = {
    contractId, name: def.name,
    trickId: trick.trickId, trickName: trick.name ?? trick.trickId,
    episodeId: trick.episodeId ?? null, tick: Number.isFinite(tick) ? tick : trick.tick ?? 0,
    encounterId: trick.encounterId ?? null,
    runKind: state.run?.kind ?? 'adventure',
  };
  book.completed.push(card);
  if (book.active === contractId) book.active = null;
  return card;
}

/** Ledger-facing rows: every contract stays visible; a completion shows its proven route. */
export function contractLedgerRows(state) {
  const book = contractBook(state);
  return LINE_CONTRACTS.map((def) => {
    const done = book?.completed.find((c) => c.contractId === def.id) ?? null;
    return {
      id: def.id, name: def.name, brief: def.brief, approaches: def.approaches.slice(),
      status: done ? 'completed' : book?.active === def.id ? 'active' : 'open',
      completion: done ? { trickId: done.trickId, trickName: done.trickName, tick: done.tick, episodeId: done.episodeId } : null,
    };
  });
}
