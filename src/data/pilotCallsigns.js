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

// ── The last fight, named (U-D rivalry arcs) ──────────────────────────────────────────────────
//
// aceMemory keeps `lastSectorId`, `lastOutcome`, `lastStyle` on every record. The first line a
// returning ace speaks is built from those three: WHERE (the sector's name), HOW it ended, and
// WITH WHAT (the player's kill style). Pure readers over the persisted record — no state here.
// Registers group the cast by how they talk; the variant is picked by hash32 so a given ace
// repeats the same words inside one save and reads differently from the next ace.
//
// This lives in the leaf pilotCallsigns module (rng-only imports) rather than namedAces.js on
// purpose: contactHail.js reads the same lines for the hail opener, and namedAces -> encounters
// -> ... -> scanner -> contactHail is a live import cycle.

const KILL_STYLES = new Set(['fling', 'gun', 'rock', 'ram']);
function isKillStyle(value) {
  return typeof value === 'string' && KILL_STYLES.has(value);
}

export const FIGHT_OUTCOMES = Object.freeze([
  'you_fled', 'they_fled', 'netted', 'rammed', 'wingman_died', 'killed',
]);
const FIGHT_OUTCOME_SET = new Set(FIGHT_OUTCOMES);

/** A sector id as the player reads it ("Sker Haven"): the live world's name, else the id
 *  humanized — never blank. Kept off sectors.js on purpose: this module stays a light import. */
export function sectorDisplayName(sectorId, state = null) {
  if (!sectorId) return '';
  const live = state && state.world && state.world.sectors && state.world.sectors[sectorId];
  if (live && typeof live.name === 'string' && live.name) return live.name;
  return String(sectorId).replace(/^sector_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isFightOutcome(value) {
  return typeof value === 'string' && FIGHT_OUTCOME_SET.has(value);
}

/** Short all-caps read of an outcome, for the hail STATUS line. */
export const FIGHT_OUTCOME_LABELS = Object.freeze({
  you_fled: 'YOU RAN',
  they_fled: 'THEY RAN',
  netted: 'YOU NETTED THEM',
  rammed: 'YOU RAMMED THEM',
  wingman_died: 'YOU DROPPED THEIR WING',
  killed: 'YOU KILLED THEIR CAPTAIN',
});

/** The outcome, from the signals one fight leaves behind. Priority is the most personal first. */
export function fightOutcomeFromSignals({
  killed = false, flung = false, rammed = false, wingmanDown = false, bossHullFrac = null,
} = {}) {
  if (killed) return 'killed';
  if (flung) return 'netted';
  if (rammed) return 'rammed';
  if (wingmanDown) return 'wingman_died';
  if (Number.isFinite(bossHullFrac) && bossHullFrac <= 0.5) return 'they_fled';
  return 'you_fled';
}

const ACE_REGISTER = Object.freeze({
  ace_toll_saint_venn: 'ledger',
  ace_drell_short_fall: 'ledger',
  ace_mako_broken_ring: 'ledger',
  ace_cade_haltred: 'ledger',
  ace_yara_no_cut: 'blade',
  ace_maw_rake_veyra: 'blade',
  ace_brigga_two_turn: 'blade',
  ace_jex_wake_salt: 'blade',
  ace_ves_no_face: 'flat',
  ace_noll_curtain: 'flat',
  ace_drift_king_iona: 'flat',
  ace_serrat_clause: 'creed',
  ace_sere_pattern: 'creed',
  ace_voss_shaft_seven: 'yard',
  ace_rust_lord_orro: 'yard',
  ace_wick_blackwrench: 'yard',
});

// How each register names the player's way of killing: a bare noun, used as "your {how}".
const REGISTER_HOW = Object.freeze({
  ledger: Object.freeze({ fling: 'tow-line', gun: 'gunfire', rock: 'rock-work', ram: 'ramming' }),
  blade: Object.freeze({ fling: 'tether-work', gun: 'gunnery', rock: 'stone-play', ram: 'shoulder-charge' }),
  flat: Object.freeze({ fling: 'line', gun: 'fire', rock: 'rocks', ram: 'hull' }),
  creed: Object.freeze({ fling: 'tethering', gun: 'gunfire', rock: 'rock-fall', ram: 'collision' }),
  yard: Object.freeze({ fling: 'chain-work', gun: 'guns', rock: 'rocks', ram: 'mass' }),
});

const LAST_FIGHT_LINES = Object.freeze({
  ledger: Object.freeze({
    you_fled: Object.freeze([
      'you ran from {sector}. Your {how} left the count open.',
      'you left {sector} owing. Your {how} did not cover it.',
    ]),
    they_fled: Object.freeze([
      'I broke off at {sector}. Your {how} bought that lead - once.',
      'I ran from {sector}. Your {how} wrote it down; I write it back.',
    ]),
    netted: Object.freeze([
      'you netted me at {sector}. I priced your {how} twice.',
      'at {sector} you hung me in your {how}. The knot is on my ledger.',
    ]),
    rammed: Object.freeze([
      'you drove through me at {sector}. Your {how} is billed in full.',
      'at {sector} your {how} cracked my plate. I kept the receipt.',
    ]),
    wingman_died: Object.freeze([
      'you chalked my wing at {sector}. Your {how} is itemized.',
      'one of mine went to your {how} at {sector}. I have the name.',
    ]),
  }),
  blade: Object.freeze({
    you_fled: Object.freeze([
      'you cut and ran from {sector}. Your {how} was clean. Not clean enough.',
      'you backed off the edge at {sector}. I kept your {how}.',
    ]),
    they_fled: Object.freeze([
      'I took the cut and ran at {sector}. Your {how} found the seam. It will not twice.',
      'at {sector} I bled and broke off. Your {how} showed me where.',
    ]),
    netted: Object.freeze([
      'you netted me at {sector}. Your {how} is a good knot. I have the end of it.',
      'at {sector} you strung me up. I learned your {how}.',
    ]),
    rammed: Object.freeze([
      'at {sector} you put your hull through mine. Your {how} left a good dent.',
      'you hit me like a door at {sector}. Your {how} - noted, returned.',
    ]),
    wingman_died: Object.freeze([
      'at {sector} you cut my wing down. Your {how} took a name I liked.',
      'my second died at {sector}. Your {how} owes a blade.',
    ]),
  }),
  flat: Object.freeze({
    you_fled: Object.freeze([
      'you left {sector}. Your {how}, noted. We kept it.',
      'you ran from {sector}. We filed your {how}.',
    ]),
    they_fled: Object.freeze([
      'we left {sector} bleeding. Your {how}. Filed.',
      'we broke off at {sector}. Your {how} was the reason. Filed.',
    ]),
    netted: Object.freeze([
      'you netted us at {sector}. Your {how}. Filed.',
      'at {sector} you held us on a line. Your {how} is on file.',
    ]),
    rammed: Object.freeze([
      'you rammed us at {sector}. Your {how}. Filed.',
      'at {sector} you used your hull as a tool. Your {how}, on file.',
    ]),
    wingman_died: Object.freeze([
      'one of ours went down at {sector}. Your {how}. Filed.',
      'you removed a wing hull at {sector}. Your {how} has a file now.',
    ]),
  }),
  creed: Object.freeze({
    you_fled: Object.freeze([
      'you fled {sector}; the clause stands open. Your {how} is entered.',
      'at {sector} you walked out of the reading. Your {how} is entered.',
    ]),
    they_fled: Object.freeze([
      'we withdrew from {sector} under your {how}. The verse is unfinished.',
      'at {sector} the Pattern broke off. Your {how} is the dissonance.',
    ]),
    netted: Object.freeze([
      'at {sector} you bound us in your {how}. The clause remembers the knot.',
      'you netted us at {sector}. Your {how} is now part of the Pattern.',
    ]),
    rammed: Object.freeze([
      'at {sector} your {how} struck the verse. The clause remembers the blow.',
      'you collided with the Pattern at {sector}. Your {how} is sung back.',
    ]),
    wingman_died: Object.freeze([
      'at {sector} you silenced one voice of ours. Your {how} is entered.',
      'a voice fell at {sector} to your {how}. The verse names you.',
    ]),
  }),
  yard: Object.freeze({
    you_fled: Object.freeze([
      'you ran from {sector}. Your {how} was all noise. We counted it.',
      'at {sector} you bolted. Your {how} did not scare the yard.',
    ]),
    they_fled: Object.freeze([
      'we pulled out of {sector} hurting. Your {how} did that. The yard remembers.',
      'at {sector} we backed off. Your {how} hurt. The yard fixes what you broke.',
    ]),
    netted: Object.freeze([
      'you chained us up at {sector}. Your {how} - we kept the chain.',
      'at {sector} you hung us on your {how}. We brought a wrench.',
    ]),
    rammed: Object.freeze([
      'you slammed us at {sector}. Your {how} dented the yard. The dent goes on you.',
      'at {sector} you rammed. Your {how} cracked a good plate.',
    ]),
    wingman_died: Object.freeze([
      'at {sector} you killed one of ours. Your {how} cost the yard a hand.',
      'one of ours burned at {sector}. Your {how} - we owe you for it.',
    ]),
  }),
});
// Registers the generic table reads for an ace the roster does not tag (renamed captains).
const DEFAULT_REGISTER = 'blade';

export function aceRegisterFor(ace) {
  return (ace && ACE_REGISTER[ace.id]) || DEFAULT_REGISTER;
}

/** A fight line's table lookup, shared by aces (here) and promoted pilots (pilotCallsigns.js). */
export function fightLineFromTable(table, how, ace, rec, seed, sectorName, opts = {}) {
  if (!table || !ace || !rec || !isFightOutcome(rec.lastOutcome)) return '';
  const pool = table[rec.lastOutcome];
  if (!pool || !pool.length) return '';
  const style = isKillStyle(rec.lastStyle) ? rec.lastStyle : 'gun';
  const sector = String(sectorName || 'the last lane');
  const line = pool[hash32(seed >>> 0, ace.id, rec.lastOutcome, 'last-fight') % pool.length]
    .replace(/\{sector\}/g, sector)
    .replace(/\{how\}/g, (how && how[style]) || style);
  return opts.bare === true ? line : `${ace.name || 'Ace'}: ${line}`;
}

/** One seed for the variant pick, so the line spoken on return and the hail opener agree. */
export function grievanceSeedFor(saveSeed, ace, rec, requestId = '') {
  return hash32(saveSeed >>> 0, ace && ace.id, requestId || (rec && rec.returnRequestId) || 'grievance');
}

/** The ace's own words for the fight they carry — empty when no fight is on the record. */
export function lastFightLineFor(ace, rec, seed = 0, sectorName = '', opts = {}) {
  const register = aceRegisterFor(ace);
  return fightLineFromTable(LAST_FIGHT_LINES[register], REGISTER_HOW[register], ace, rec, seed, sectorName, opts);
}

/** The grievance is live from the moment a rival comes back until the fight ends it: a slain
 *  captain, or a loyal one (the work-offer stance owes the player a favor, not a grudge), has none. */
export function grievanceLive(rec) {
  return !!rec && isFightOutcome(rec.lastOutcome) && rec.returned === true
    && rec.defeated !== true && rec.stance !== 'offers_work';
}

/** All-caps status read for the hail deck: where, how it ended, with what. */
export function fightStatusText(rec, sectorName) {
  if (!rec || !isFightOutcome(rec.lastOutcome)) return '';
  const style = isKillStyle(rec.lastStyle) ? rec.lastStyle : 'gun';
  return `LAST MET ${String(sectorName || 'UNCHARTED').toUpperCase()} · ${FIGHT_OUTCOME_LABELS[rec.lastOutcome]} · ${style.toUpperCase()}`;
}

// ── Promoted pilots and heirs ─────────────────────────────────────────────────────────────────
// A promoted pilot's first words on return name WHERE it ended, HOW, and WITH WHAT - from the
// same record fields. Named aces speak from the register tables above; the pilots nobody named
// speak the raider register below, and the heir of a fallen ace names the one that was killed.

const RAIDER_HOW = Object.freeze({ fling: 'tow-line', gun: 'guns', rock: 'rock-work', ram: 'hull' });
const RAIDER_FIGHT_LINES = Object.freeze({
  you_fled: Object.freeze([
    'I watched your wake leave {sector}. Your {how} never got near.',
    'you were gone from {sector} before I finished counting. I kept the count.',
  ]),
  they_fled: Object.freeze([
    'I ran from {sector}. Your {how} lit my tail. I came back with a bigger crew.',
    'you let me burn out of {sector}. Your {how} left a mark; I brought friends.',
  ]),
  netted: Object.freeze([
    'you spun my mate into the dark at {sector}. Your {how} - we brought cutters.',
    'at {sector} you hung us on a line. We learned your {how}.',
  ]),
  rammed: Object.freeze([
    'you put your hull through ours at {sector}. Your {how} left a dent we kept.',
    'at {sector} you rammed. Your {how} earned this.',
  ]),
  wingman_died: Object.freeze([
    'you chalked my wing at {sector}. Your {how} is why I came back.',
    'my mates popped on your scopes at {sector}. Your {how} - I never forgot the sound.',
  ]),
});

/** The outcome a pirateDisengage escape reads as, from the grudge it wrote. They ran, so they
 *  carry it; only the wing-loss and flung-mate grudges name something the player did to a mate. */
export function fightOutcomeForGrudge(grudgeKey) {
  switch (String(grudgeKey || '')) {
    case 'wing_loss': return 'wingman_died';
    case 'flung_wing': return 'netted';
    default: return 'they_fled';
  }
}

// The lineage grudge: a named ace fell, the surviving wingman took the name. Its return line is
// the one about the one you killed. {fallen} {sector} {how} come from the fallen ace's record.
const LINEAGE_RETURN_LINES = Object.freeze([
  '{name}: you killed {fallen} at {sector} with your {how}. The {crew} flies under a second name now.',
  '{name}: {fallen} is dead at {sector}. I took the name. I took the grudge.',
  '{name}: I watched you drop {fallen} at {sector} - your {how}. The {crew} sent me.',
]);

/**
 * Mint the heir of a fallen named ace out of a surviving wingman: the hull's own given name (the
 * same deterministic mint as any promoted pilot) on the fallen captain's tail, "... the Second",
 * flying for the same crew. Never contains the fallen's full name, so no name-reader mistakes the
 * heir for the dead ace.
 */
export function heirIdentity(ace, seed, entityId) {
  const base = promotedPilotIdentity(seed, entityId);
  const given = base.name.split(' ')[0];
  const tail = String(ace && ace.name || 'Ace').trim().split(/\s+/).pop();
  const name = `${given} ${tail} the Second`;
  const crew = ace && ace.crew || base.crew;
  const epithet = 'the Second';
  const signatureBark = `${name}: the ${crew} is not finished.`;
  return Object.freeze({ name, epithet, crew, signatureBark });
}

/** The heir's return line, naming the fallen, the place and the way. */
export function lineageReturnLine(ace, rec, seed, sectorName) {
  if (!ace || !rec) return '';
  const style = ['fling', 'gun', 'rock', 'ram'].includes(rec.lastStyle) ? rec.lastStyle : 'gun';
  const line = LINEAGE_RETURN_LINES[hash32(seed >>> 0, ace.id, 'lineage-return') % LINEAGE_RETURN_LINES.length];
  return line
    .replace(/\{name\}/g, ace.name || 'The heir')
    .replace(/\{crew\}/g, ace.crew || 'the crew')
    .replace(/\{fallen\}/g, rec.predecessorName || 'the captain')
    .replace(/\{sector\}/g, String(sectorName || 'the last lane'))
    .replace(/\{how\}/g, RAIDER_HOW[style]);
}

/**
 * One reader for every returning rival's grievance: the heir names the one you killed, a promoted
 * pilot speaks the raider register, a named ace speaks its own. Empty when no fight is on record.
 */
export function grievanceLineFor(ace, rec, seed = 0, sectorName = '', opts = {}) {
  if (!ace || !rec) return '';
  if (rec.promoted === true) {
    if (rec.grudgeKey === 'lost_captain') {
      const line = lineageReturnLine(ace, rec, seed, sectorName);
      return opts.bare === true ? line.replace(/^[^:]*:\s*/, '') : line;
    }
    return fightLineFromTable(RAIDER_FIGHT_LINES, RAIDER_HOW, ace, rec, seed, sectorName, opts);
  }
  return lastFightLineFor(ace, rec, seed, sectorName, opts);
}
