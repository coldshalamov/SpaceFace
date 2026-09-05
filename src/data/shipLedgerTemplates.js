// A2 Ship's Ledger prose bank. The ledger is a read-only projection over durable receipts;
// this file owns voice variety only. Every source type carries at least four deterministic
// variants so repeated cargo runs or wreck discoveries do not produce a stuttering log.

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

const variants = (type, lines) => lines.map((text, index) => ({
  id: `${type}.${String(index + 1).padStart(2, '0')}`,
  text,
}));

export const SHIP_LEDGER_ENTRY_TYPES = Object.freeze([
  'loss',
  'trade',
  'rumor',
  'bearing',
  'unique',
  'witness',
  'title',
  'name',
  // PQ-142.01 — the hull's own history. `design/VISION.md` Part II: the ship accumulates "scars,
  // repairs, odd fittings, a reputation by hull — until it is my fucking ship."
  'scar',
  'patch',
  'renown',
]);

export const SHIP_LEDGER_TEMPLATES = deepFreeze({
  loss: variants('loss', [
    '{ship} went dark in {sector}. {cargo} stayed on the manifest.',
    '{sector} kept {ship}. The loss file says {cargo}.',
    'Closed the line on {ship}, last carried through {sector}.',
    '{ship} did not clear {sector}. The ledger kept the name.',
  ]),
  trade: variants('trade', [
    '{verb} {qty}u {commodity} at {station}. {credits} cr changed hands.',
    '{station} stamped {qty}u {commodity}: {verbPast}, {credits} cr.',
    '{commodity}, {qty}u. {station} took the cargo and kept the decimals.',
    '{verb} the {commodity} lot at {station}. Receipt: {credits} cr.',
  ]),
  rumor: variants('rumor', [
    'A voice put {wreck} somewhere beyond {sector}. No coordinates yet.',
    '{wreck} entered the book as hearsay from {source}.',
    'Rumor carried a name: {wreck}. The dark kept the rest.',
    '{source} spoke of {wreck}. Marked unverified, not forgotten.',
  ]),
  bearing: variants('bearing', [
    'Fixed {wreck} to a {radius}u bearing in {sector}.',
    '{wreck} stopped being a rumor. Search ring: {radius}u.',
    'The scanner narrowed {wreck} to {sector}. The line now points somewhere.',
    'Bearing resolved for {wreck}. {sector} has one less unnamed dark place.',
  ]),
  unique: variants('unique', [
    'Opened {wreck}. Chose {choice}. The receipt survived.',
    '{wreck} yielded its last decision: {choice}.',
    'Closed the recovery on {wreck}. Outcome filed as {outcome}.',
    '{wreck} is no longer waiting. {choice} remains in the manifest.',
  ]),
  witness: variants('witness', [
    'Witnessed {event}. The record says {outcome}.',
    '{event} ended as {outcome}. No clerk can make that neutral.',
    'Filed what happened at {event}: {outcome}.',
    '{event}. Saw it through. Kept the outcome: {outcome}.',
  ]),
  title: variants('title', [
    'The title {title} crossed the scope. The hull did not need to.',
    'Saw {title} pass. Some names travel ahead of ships.',
    '{title} entered sensor range and left the story larger.',
    'Traffic record: {title}. A title with enough weight to cast a wake.',
  ]),
  name: variants('name', [
    'Senna returned one name: {name}. Keep it found.',
    '{name} made it home in ink. Senna witnessed the line.',
    'Registry omitted {name}. Senna and this ledger did not.',
    'Wrote {name} where erasure could not pass for loss.',
  ]),
  // An OPEN mark: the impact happened, nothing has covered it. {band} severity, {facing} the side
  // of the hull in the hull's own frame, {what} what it hit.
  scar: variants('scar', [
    'Took a {band} mark on the {facing} from {what}. Still open.',
    '{what} left a {band} scar across the {facing}. Nobody has covered it.',
    'The {facing} carries a {band} mark now. {what}, at speed.',
    'New on the hull: {band} damage, {facing}, {what}. Left as is.',
  ]),
  // A CLOSED mark: the yard patched it, and the seam stays on the record.
  patch: variants('patch', [
    'The yard covered the {band} mark on the {facing}. The seam still shows.',
    'Patched: {facing}, {band}, from {what}. The plate does not match.',
    'A yard closed the {facing} {band} scar. {what} is still in the paperwork.',
    'Repair filed over the {band} {facing} mark. The hull remembers {what}.',
  ]),
  // A witnessed act, attached to THIS hull. {ship} is the hull's name, not the pilot's.
  renown: variants('renown', [
    'The {ship} was seen finishing it in {sector}. {faction} was watching.',
    '{faction} logged the {ship} at work over {sector}.',
    'They said the name out loud in {sector}: the {ship}.',
    '{sector} now knows the {ship} by hull, not by transponder. {faction} saw to that.',
  ]),
});

export const VOLS_LEDGER_ANNOTATIONS = deepFreeze([
  { id: 'vols.01', text: 'Second hand: We kept the engines warm.' },
  { id: 'vols.02', text: 'Second hand: Four souls were here before the manifest.' },
  { id: 'vols.03', text: 'Second hand: The Tessera remembers farther than people do.' },
  { id: 'vols.04', text: 'Second hand: If you read this, carry us one line farther.' },
]);

export function validateShipLedgerTemplates() {
  const errors = [];
  for (const type of SHIP_LEDGER_ENTRY_TYPES) {
    const bank = SHIP_LEDGER_TEMPLATES[type];
    if (!Array.isArray(bank) || bank.length < 4) {
      errors.push(`${type}: expected at least four prose variants`);
      continue;
    }
    const ids = new Set();
    const copy = new Set();
    for (const entry of bank) {
      if (!entry || typeof entry.id !== 'string' || ids.has(entry.id)) errors.push(`${type}: duplicate/missing template id`);
      if (!entry || typeof entry.text !== 'string' || entry.text.trim().length < 18) errors.push(`${type}: incomplete template copy`);
      if (entry && copy.has(entry.text)) errors.push(`${type}: duplicate template copy`);
      if (entry) {
        ids.add(entry.id);
        copy.add(entry.text);
      }
    }
  }
  if (VOLS_LEDGER_ANNOTATIONS.length < 4) errors.push('vols: expected at least four second-hand annotations');
  return { ok: errors.length === 0, errors };
}

export default SHIP_LEDGER_TEMPLATES;
