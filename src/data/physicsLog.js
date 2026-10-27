// Row 502 (W-LOG): LOG — the physics narrator. A cause-aware one-line feed reads impact kills,
// throws, liens, deliveries and records in the house register. Copy lives here as data so
// INFERENCE EXP-12 can fill it out without touching the feed; the callout lane supplies the
// 3 s fade and the terminal-zone silence.
//
// THE REGISTER (design/expansion/01_TONE_AND_WORLD.md §3.2): LOG is a bored hangman doing
// paperwork. Short, declarative, always correct; a confession when the line is about a death.
// LOG never jokes on purpose. Every pool's index 0 is the row-502 launch line, so a caller that
// passes no pick reads exactly the line the golden pins.

/** Modes where LOG stays silent — terminal zones don't narrate. */
export const PHYSICS_LOG_SILENT_MODES = new Set(['gameover', 'debrief', 'dead', 'crash']);

/** True while LOG should not speak: terminal zones and non-flight surfaces. */
export function physicsLogSilent(state) {
  if (!state) return false;
  const mode = String(state.mode || '');
  if (PHYSICS_LOG_SILENT_MODES.has(mode)) return true;
  if (state.player && state.player.dead === true) return true;
  return false;
}

function nameOf(p, keys) {
  for (const k of keys) {
    const v = p && p[k];
    if (typeof v === 'string' && v.trim()) return v.trim().toUpperCase();
  }
  return null;
}

function tonnes(p, keys) {
  for (const k of keys) {
    const v = Number(p && p[k]);
    if (Number.isFinite(v) && v > 0) return Math.round(v);
  }
  return null;
}

/**
 * The pick for a variant pool: the caller's rotation index when it passes one, else 0 — the
 * launch line the goldens pin. Deterministic either way; LOG never improvises.
 */
function pickOf(p, pool) {
  const n = Number(p && p.pick);
  const i = Number.isInteger(n) && n > 0 ? n % pool.length : 0;
  return pool[i];
}

// ---- the copy tables ----------------------------------------------------------------------

const IMPACT_KILL_LINES = Object.freeze([
  (who, t) => (t ? `${who} RECLASSIFIED: PROJECTILE — ${t}t` : `${who} RECLASSIFIED: PROJECTILE`),
  (who) => `${who} FILED UNDER: AMMUNITION, INCOMING.`,
  (who) => `INCIDENT CLOSED. ${who} WAS THE PROJECTILE.`,
  (who) => `${who} STRUCK SOMETHING SOLID. SOMETHING SOLID WINS.`,
  (who) => `TRAJECTORY CONCLUDED. ${who} CONCLUDED WITH IT.`,
  (who) => `${who} LOGGED AS: MASS, MOVING, MISUSED.`,
  (who, t) => (t ? `${who} DISASSEMBLED ON IMPACT — ${t}t PARTS INVENTORY FOLLOWS` : `${who} DISASSEMBLED ON IMPACT`),
  (who) => `THE SPEED WAS LEGAL. THE PARKING WAS NOT. ${who} FILED.`,
  (who) => `${who} ATTEMPTED TERRAIN. TERRAIN SIGNED THE RECEIPT.`,
  (who) => `ONE HULL, ABRUPTLY TWO PILES. ${who} FILED AS BOTH.`,
  (who) => `CAUSE OF LOSS: GEOMETRY. ${who} DISAGREES. GEOMETRY DOES NOT.`,
  (who) => `${who} CONVERTED TO EVIDENCE AT FULL SPEED.`,
]);

const DEBRIS_LINES = Object.freeze([
  (who) => `${who} RECLASSIFIED: DEBRIS`,
  (who) => `${who} IS NOW A PLACE, NOT A SHIP.`,
  (who) => `${who} ADDED TO THE FIELD INDEX. LOCATION: WHERE IT LANDED.`,
  (who) => `${who} FILED. NO SURVIVORS SECTION REQUIRED.`,
  (who) => `${who} STOPPED BEING A VESSEL AT CONTACT.`,
  (who) => `SALVAGE RIGHTS PENDING. ${who} IS NOT PENDING.`,
]);

const IMPACT_LINES = Object.freeze([
  (t) => `IMPACT LOGGED — ${t} wu/s²`,
  () => 'CONTACT RECORDED. NOBODY BOUGHT IT YET.',
  () => 'TWO BODIES, ONE COORDINATE. REPORT FILED.',
  () => 'IMPACT SURVIVED. PAPERWORK ANYWAY.',
  () => 'THE WALL DID NOT MOVE. THIS IS ON RECORD.',
  () => 'COLLISION ANGLES MEASURED. NO COMMENT ISSUED.',
]);

const RELEASE_LINES = Object.freeze([
  (t, grade) => (t ? `LINE RELEASED ${t}t — ${grade || 'CLEAN'}` : `LINE RELEASED — ${grade || 'CLEAN'}`),
  (t, grade) => `THROW RATED: ${grade || 'CLEAN'}${t ? ` — ${t}t` : ''}. THE MANIFEST IS VOID.`,
  (t) => (t ? `${t}t RETURNED TO THE ROOM. GRADE PENDING REVIEW.` : 'LOAD RETURNED TO THE ROOM.'),
  (t, grade) => `RELEASE ${grade || 'CLEAN'}. ROPE RECOVERED. DIGNITY NOT AUDITED.`,
  () => 'THE LINE LET GO BEFORE PHYSICS DID. WISE.',
  (t) => (t ? `TONNAGE LOGGED: ${t}t. CORRECT.` : 'TONNAGE LOGGED. CORRECT.'),
  () => 'SWING FILED. THE ANCHOR DECLINES COMMENT.',
  () => 'RELEASE ON TIME. THE LAW NOTES THE COOPERATION.',
]);

const DELIVERY_LINES = Object.freeze([
  (t, dest) => (t && dest ? `${t}t DELIVERED — ${dest}` : 'CARGO DELIVERED'),
  (t, dest) => `CARGO POD DELIVERED. RECIPIENT: ${dest || 'THE BERTH'}. SIGNATURE NOT OBTAINED.`,
  (t, dest) => (dest ? `MANIFEST CLOSED AT ${dest}. COUNTS MATCHED.` : 'MANIFEST CLOSED. COUNTS MATCHED.'),
  () => 'DELIVERY FILED. THE CREDITS ARE THE RECEIPT.',
  () => 'CARGO LANDED. THE HOLD DENIES EVERYTHING ELSE.',
  (t) => (t ? `${t}t OFF THE BOOKS — ONTO THE OTHER BOOKS.` : 'OFF ONE MANIFEST, ONTO ANOTHER.'),
  (t, dest) => (dest ? `${dest} SIGNS. THE CRATE SAYS NOTHING.` : 'RECEIVED. THE CRATE SAYS NOTHING.'),
  () => 'CONTRACT FULFILLED. ANOMALIES: NONE THAT WERE ASKED ABOUT.',
  () => 'FREIGHT PLACED. THE SCALE AGREES WITH THE PAPERWORK.',
  (t) => (t ? `WEIGHED IN: ${t}t. THE BERTH TAKES ITS CUT.` : 'WEIGHED IN. THE BERTH TAKES ITS CUT.'),
]);

const LIEN_LINES = Object.freeze([
  () => 'LIEN ATTACHED — THE LEDGER OPENS',
  () => 'LIEN SETTLED — THE LEDGER CLOSES',
  () => 'LIEN CUT — THE LEDGER NOTES IT',
  () => 'LIEN TRANSFERRED — THE DEBT HAS A NEW NAME',
  () => 'A LIEN IS NOT A GRAUDGE. IT IS A FILE WITH INTEREST.',
  () => 'THE DEBT SURVIVED THE HULL IT RODE IN.',
  () => 'PAYMENT LOGGED. THE LEDGER DOES NOT SAY THANK YOU.',
  () => 'HELIX FILES THE FINE. HELIX FILES THE APPEAL FORM TOO.',
  () => 'FINE RECORDED. PAYMENT WINDOW: GENEROUS. BRIEFLY.',
  () => 'THE LEDGER REMEMBERS SO YOU DO NOT HAVE TO.',
]);

const RECORD_LINES = Object.freeze([
  () => 'LOSS RECORDED — THE LEDGER REMEMBERS',
  () => 'CUSTODY RECORDED',
  () => 'WRECK RECORDED — THE FIELD KEEPS IT',
  () => 'AUDIT LOGGED — LAW KNOWS',
  () => 'FILED: ONE MORE THING THE FIELD OWES SOMEBODY.',
  () => 'THE RECORD IS THE RECEIPT. THE RECEIPT IS THE RECORD.',
  () => 'ENTERED INTO EVIDENCE. THE FIELD TESTIFIES BY EXISTING.',
  () => 'ARCHIVED. THE VERGE COURTS MAY SEND A COPY.',
]);

const PERSONNEL_LINES = Object.freeze([
  () => 'MAIL — SOMETHING WAITING AT THE NEXT BERTH',
  () => 'SURVIVOR DELIVERED — ONE MORE NAME OFF THE LIST',
  () => 'PASSENGERS DELIVERED',
  () => 'PASSENGERS FILED UNDER: DELIVERED, UNBROKE.',
  () => 'THE POD SIGNED ITSELF OUT. PAPERWORK SPARED.',
  () => 'PERSONNEL ACCOUNTED FOR. COMPLAINTS FORWARDED TO MANAGEMENT.',
]);

/** LOG listens to these — one subscription surface for the feed owner. */
export const PHYSICS_LOG_EVENTS = Object.freeze([
  'combat:kill', 'entity:killed', 'physics:impact', 'tether:releaseRated',
  'cargo:delivered', 'vael:lienClamped', 'vael:lienPaid', 'vael:lienCut', 'vael:lienThrown',
  'helix:lienFiled', 'helix:lienStuck', 'lossLedger:recorded', 'custody:recorded',
  'aftermathWreck:recorded', 'law:recordAudit', 'mail:delivered', 'survivorPod:delivered',
  'occupation:delivered', 'swarm:killPopup',
  'line:recordStamped',
]);

/** Count of authored LOG lines across the outcome kinds (EXP-12's volume bar). */
export const PHYSICS_LOG_LINE_COUNT = Object.freeze(
  IMPACT_KILL_LINES.length + DEBRIS_LINES.length + IMPACT_LINES.length + RELEASE_LINES.length
  + DELIVERY_LINES.length + LIEN_LINES.length + RECORD_LINES.length + PERSONNEL_LINES.length,
);

/**
 * One LOG line for an event, or null when the event isn't LOG-worthy. Lines are short, plain,
 * and read with sound off — the register's voice is declarative: THING DID THING. A payload
 * `pick` rotates the variant pool; without one LOG says the launch line.
 */
export function physicsLogLine(eventName, payload = {}) {
  const p = payload || {};
  switch (eventName) {
    case 'line:recordStamped':
      return ['heaviest_hold', 'class_up', 'exact_mass'].includes(p.kind)
        && typeof p.text === 'string' && p.text.length <= 100 ? p.text : null;
    case 'combat:kill': {
      const cause = String(p.cause || '');
      if (cause === 'impact' || cause === 'collision' || cause === 'throw' || cause === 'physics') {
        const who = nameOf(p, ['victimName', 'targetName', 'name']) || 'CONTACT';
        const t = tonnes(p, ['mass', 'impactMass', 'bodyMass']);
        return pickOf(p, IMPACT_KILL_LINES)(who, t);
      }
      return null;
    }
    case 'entity:killed': {
      if (String(p.cause || '') === 'impact') {
        const who = nameOf(p, ['name', 'victimName']) || 'HULL';
        return pickOf(p, DEBRIS_LINES)(who);
      }
      return null;
    }
    case 'physics:impact': {
      const energy = tonnes(p, ['energy', 'impulse', 'damage']);
      if (energy != null && energy >= 40) return pickOf(p, IMPACT_LINES)(energy);
      return null;
    }
    case 'tether:releaseRated': {
      const grade = String(p.classification || '').toUpperCase();
      const t = tonnes(p, ['tonnageU', 'mass']);
      return pickOf(p, RELEASE_LINES)(t, grade);
    }
    case 'cargo:delivered': {
      const t = tonnes(p, ['tonnage', 'mass', 'units']);
      const dest = nameOf(p, ['destination', 'stationName', 'portName']);
      return pickOf(p, DELIVERY_LINES)(t, dest);
    }
    case 'vael:lienClamped': return pickOf(p, LIEN_LINES)();
    case 'vael:lienPaid': return LIEN_LINES[1]();
    case 'vael:lienCut': return LIEN_LINES[2]();
    case 'vael:lienThrown': return LIEN_LINES[3]();
    case 'helix:lienFiled': return LIEN_LINES[7]();
    case 'helix:lienStuck': return LIEN_LINES[8]();
    case 'lossLedger:recorded': return pickOf(p, RECORD_LINES)();
    case 'custody:recorded': return RECORD_LINES[1]();
    case 'aftermathWreck:recorded': return RECORD_LINES[2]();
    case 'law:recordAudit': return RECORD_LINES[3]();
    case 'mail:delivered': return pickOf(p, PERSONNEL_LINES)();
    case 'survivorPod:delivered': return PERSONNEL_LINES[1]();
    case 'occupation:delivered': return PERSONNEL_LINES[2]();
    case 'swarm:killPopup': {
      const word = String(p.word || '').toUpperCase();
      return word ? `ARENA: ${word}` : null;
    }
    default:
      return null;
  }
}
