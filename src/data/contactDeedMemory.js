// Read-only cast memory. stationContacts owns counters; these lines never advance them.
import { CONTACT_COUNTER_DEFS, normalizeStationContactCounters } from './stationContacts.js';

const memory = (name, empty, remembered) => Object.freeze({ name, empty, remembered });
export const CONTACT_DEED_LINES = Object.freeze({
  'yune.trust': memory('CLERK YUNE', 'No clean freight beside your name yet.', 'Your freight cleared Helios. I kept the seal.'),
  'coldburn.grudge': memory('COLDBURN REY', 'A clean race. Let us keep it that way.', 'I remember that hold. This time I take the outside.'),
  'suhl.clauses': memory('DR. IREN SUHL', 'Bring a clause the machine has actually accepted.', 'Your appeal was accepted. The transcript carries your breath.'),
  'orrin.case': memory('WARRANT ORRIN', 'Evidence first. A story cannot hold the case open.', 'Your original is filed. This inquiry stays open.'),
  'vane.favor': memory('BOSS SKER VANE', 'My lane has not earned from you yet.', 'You brought off-book freight to Sker. I keep accounts.'),
  'senna.names': memory('DUSTWIFE SENNA', 'The missing names still wait in the metal.', 'You returned a name from the wrecks. I wrote it.'),
  'latch.child': memory('LATCH-CHILD', 'Scrap expected. Delivery unconfirmed.', 'Scrap sold. Arrival remembered. Your name held.'),
  'question.answers': memory('THE QUESTION', 'What was carried? Answer with what you hold.', 'An answer carried. Not merely spoken. Recorded.'),
  'dorin.trust': memory('FILECLEAVER DORIN', 'My copy still needs a witness.', 'You carried the log beyond the people who buried it.'),
  'vonn.interviews': memory('LIRA VONN', 'You are not on the record yet.', 'Your interview is on the record. Keep your own copy.'),
  'zell.work': memory('TINKER ZELL', 'No illegal fit beside your name. Yet.', 'That illegal fit is in my book. No warranty.'),
  'mara.debt': memory('MARA', 'The medical berth is still waiting for survivors.', 'Your pod reached a medical berth. We counted everyone.'),
  'kell.cover': memory('WRAITH KELL', 'The desk has not forgotten my name.', 'Your handoff kept a little room between my two files.'),
  'doss.sources': memory('HALEV DOSS', 'Bring an original. Recollection is not a citation.', 'Your originals remain attached. Someone can check what we said.'),
  'vols.business': memory('CAPTAIN MAERA VOLS', 'My message is still somewhere out there.', 'You found what my crew left. The hull remembers.'),
});

export function contactDeedMemory(contactId, counters = {}) {
  const entry = Object.entries(CONTACT_COUNTER_DEFS).find(([, def]) => def.contactId === contactId);
  if (!entry) return null;
  const [trackerId, def] = entry, value = normalizeStationContactCounters(counters)[trackerId];
  const prose = CONTACT_DEED_LINES[trackerId];
  const band = value < 0 ? 'strained' : value === 0 ? 'unproven' : value >= def.max ? 'established' : 'remembered';
  return { trackerId, value, band, glyph: value < 0 ? '−' : value === 0 ? '○' : value >= def.max ? '●' : '◐',
    name: prose.name, opener: value > 0 ? prose.remembered : value < 0
      ? 'Your choice is in the file. Do not ask me to forget.' : prose.empty };
}

export function castLastCall(counters = {}) {
  return Object.values(CONTACT_COUNTER_DEFS).map(def => {
    const entry = contactDeedMemory(def.contactId, counters);
    return { sender: entry.name, text: entry.opener, trackerId: entry.trackerId, value: entry.value };
  });
}
