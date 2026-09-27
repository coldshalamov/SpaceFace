// The Pirate Who Got Away — deterministic identity minting for anonymous hostiles that
// break off through pirateDisengage. Same (seed, entity id) hashes to the same callsign,
// epithet and crew, so a promoted pilot keeps its name across sectors and save/load
// without ever spending an RNG draw. Pure data + pure readers: no runtime state.
import { hash32 } from '../core/rng.js';

/** Live (not defeated, not expired) promoted-pilot records kept per save. */
export const PROMOTED_PILOT_MAX = 8;
/** A fled pilot whose return never fired inside this window is written off — stale
 *  records cannot accumulate forever on a long save. */
export const PROMOTED_PILOT_EXPIRY_S = 3600;

// ── Name stock ────────────────────────────────────────────────────────────────
// Frontier-cant given names and epithet surnames. Epithets read as earned nicknames —
// the sort a crew gives the pilot who once ran and lived.
const GIVEN = Object.freeze([
  'Rex', 'Ves', 'Marn', 'Hollis', 'Ash', 'Deker', 'Lio', 'Sorren',
  'Pell', 'Nyra', 'Quill', 'Tamsin', 'Jory', 'Ivo', 'Sable', 'Ketch',
  'Rill', 'Mira', 'Doss', 'Wren', 'Brack', 'Edda', 'Fenn', 'Osla',
  'Corm', 'Pike', 'Rue', 'Sten', 'Halla', 'Vorn',
]);

const EPITHET = Object.freeze([
  'Hollow', 'Nine-Lives', 'Ashfall', 'Two-Turn', 'Coldwake', 'Half-Paid',
  'Rustline', 'Pale', 'Soot', 'Quickhand', 'Low-Luck', 'Starwise',
  'Deadeye-Second', 'Long-Odds', 'the Unpaid', 'Slip-Knot', 'Ember-Out',
  'Short-Count', 'the Wake', 'Bent-Transponder', 'Grey', 'Spare-Hull',
  'Tally', 'the Debtor', 'Scar-Luck', 'No-Witness', 'Driftwise', 'Half-Burn',
  'Ledger-Skip', 'the Returnee',
]);

const CREW_ADJ = Object.freeze([
  'Hollow', 'Bent', 'Cold', 'Red', 'Empty', 'Nine', 'Rust', 'Pale',
  'Ashen', 'Low', 'Long', 'Black', 'Quiet', 'Salt', 'Split', 'Grey',
]);

const CREW_NOUN = Object.freeze([
  'Wake', 'Ledger', 'Latch', 'Kettle', 'Tally', 'Slip', 'Hand', 'Claim',
  'Wager', 'Yield', 'Transponder', 'Column', 'Price', 'Due', 'Mark', 'Count',
]);

// ── Grudge contexts ───────────────────────────────────────────────────────────
// What the pilot carries home, keyed by the pirateDisengage reason that made them run.
// `violent === true` means the player's guns wrote the grudge — those pilots never come
// back friendly, no matter what the debt seed rolls.
export const PILOT_GRUDGES = Object.freeze({
  fled_fire: Object.freeze({
    label: 'fled your fire',
    violent: true,
    returns: Object.freeze([
      '{name}: ran from your guns once. The {crew} brought friends this time.',
      '{name}: your tracers burned my tail off. I came back heavier.',
      '{name}: you lit me up and let me burn out. The {crew} counted every hole.',
    ]),
  }),
  wing_loss: Object.freeze({
    label: 'watched you kill the wing',
    violent: true,
    returns: Object.freeze([
      '{name}: you chalked my wing. The {crew} came to settle the column.',
      '{name}: I watched my mates pop on your scopes. Your transponder never left mine.',
      '{name}: the wing is wreck-dust because of you. The {crew} collects tonight.',
    ]),
  }),
  lost_cargo: Object.freeze({
    label: 'lost the cargo',
    violent: false,
    returns: Object.freeze([
      '{name}: that haul you priced me out of? The {crew} collects it in hull.',
      '{name}: you were too expensive to rob once. The {crew} ran the numbers again.',
      '{name}: my margin died on your hull. The {crew} writes it off on you.',
    ]),
  }),
  patrol_scatter: Object.freeze({
    label: 'the law broke up the take',
    violent: false,
    returns: Object.freeze([
      '{name}: the law scattered my take with you in my sights. {crew} finishes it.',
      '{name}: the patrol wrote me off as nothing. You get to see what nothing does.',
      '{name}: we scattered for the law. I circled back for you.',
    ]),
  }),
  flung_wing: Object.freeze({
    label: 'you put a mate in a tumble',
    violent: true,
    returns: Object.freeze([
      '{name}: you spun my mate into the dark. The {crew} brought your tumble.',
      '{name}: flinging hulls — clever trick. The {crew} brought cutters for it.',
    ]),
  }),
  escaped: Object.freeze({
    label: 'got away clean',
    violent: false,
    returns: Object.freeze([
      '{name}: you let me burn out once. The {crew} does not forget a transponder.',
      '{name}: the one that got away signs back on.',
      '{name}: last lane, you watched me run. Watch closer this time.',
    ]),
  }),
});

// Spared pilots (surrendered, never fled) carry mercy, not a grudge — their return line
// is only used if one is ever promoted through the fled path later, so it reads as the
// second escape of a pilot the player already let live once.
const ALLY_RETURN_LINES = Object.freeze([
  '{name}: you let me run. The {crew} pays its debts — no toll on you today.',
  '{name}: mercy buys a pilot once. The {crew} remembers what bought.',
]);

/** Map a pirateDisengage reason to the pilot's stored grudge key. */
export function grudgeKeyForReason(reason) {
  switch (String(reason || '')) {
    case 'damage-retreat': return 'fled_fire';
    case 'wing-loss': return 'wing_loss';
    case 'profit-risk-bad': return 'lost_cargo';
    case 'lawful-patrol-nearby': return 'patrol_scatter';
    case 'massline-tumbled': return 'flung_wing';
    default: return 'escaped';
  }
}

export function promotedPilotIdFor(entityId) {
  return `pilot_${entityId}`;
}

/**
 * Mint the durable identity for one anonymous hostile: callsign, epithet, crew name and a
 * signature line. Deterministic on (seed, entityId) — the same hull mints the same pilot on
 * any tick, in any sector, before or after a save boundary.
 */
export function promotedPilotIdentity(seed, entityId) {
  const nameHash = hash32(seed >>> 0, 'pilot-callsign', entityId);
  const crewHash = hash32(seed >>> 0, 'pilot-crew', entityId);
  const given = GIVEN[nameHash % GIVEN.length];
  const epithet = EPITHET[(nameHash >>> 8) % EPITHET.length];
  const name = `${given} ${epithet}`;
  const crew = `The ${CREW_ADJ[crewHash % CREW_ADJ.length]} ${CREW_NOUN[(crewHash >>> 8) % CREW_NOUN.length]}`;
  const signatureBark = `${name}: the one that got away signs back on.`;
  return Object.freeze({ name, epithet, crew, signatureBark });
}

/**
 * The "you again" line spoken when a promoted pilot's return spawns. Ally-stance pilots
 * (the spared who chose to remember it kindly) get the debt line; everyone else gets a
 * line that names the grudge the record actually carries.
 */
export function promotedReturnLine(ace, rec, seed = 0) {
  if (!ace) return '';
  const stance = rec && rec.stance;
  let pool = null;
  if (stance === 'offers_work') {
    pool = ALLY_RETURN_LINES;
  } else {
    const grudge = PILOT_GRUDGES[rec && rec.grudgeKey] || PILOT_GRUDGES.escaped;
    pool = grudge.returns;
  }
  if (!pool || !pool.length) return '';
  const line = pool[hash32(seed >>> 0, ace.id, 'pilot-return-line') % pool.length];
  return String(line)
    .replace(/\{name\}/g, ace.name || 'The pilot')
    .replace(/\{crew\}/g, ace.crew || 'the crew');
}
