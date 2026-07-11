// Concise canonical contact voice for Campaign 47-A. Story remains the presentation authority.
import { CAMPAIGN_BEATS, ENDINGS } from './campaignData.js';

export const EMBODIED_DIALOGUE_ID = 'campaign47a.embodiedDialogue.v2';
export const EMBODIED_DIALOGUE_SCHEMA_VERSION = 2;
export const MAX_COMMS_WORDS = 12;
export const MAX_CONTACT_BLURB_WORDS = 12;
export const DIALOGUE_VARIANTS = Object.freeze(['primary', 'failure_recovery']);
export const CAREER_CROSSOVER_IDS = Object.freeze(['hauler', 'hunter', 'prospector']);

const card = (id, name, roleLabel, stationHint, blurb, namedCaptainId = null) => Object.freeze({
  id, name, callsign: name.toUpperCase(), roleLabel, stationHint, blurb, namedCaptainId,
  portrait: false, hudPortrait: false, visorMotif: false,
});

export const CONTACT_CARDS = Object.freeze([
  card('contact_kessler', 'Kessler', 'Cargo Registrar', 'station_tethys', 'The variance file never closes.'),
  card('contact_mira', 'Mira', 'Freight Seal Clerk', 'station_tethys', 'The seal changes hands, never owners.'),
  card('contact_rook', 'Rook', 'Bounty Broker', 'station_tethys', 'One target. Two payers behind the board.'),
  card('contact_elroy', 'Elroy', 'Pit Maintenance', null, 'Filed the recycler report. Tagged hostile afterward.'),
  card('contact_slate', 'Slate', 'Shipyard Welder', 'station_tethys', 'The weld remembers both cuts.'),
  card('contact_callum', 'Callum', 'Meridian Broker', 'station_tethys', 'Prosperous, polite, and never punished.'),
  card('contact_vale', 'Director Vale', 'Mid-Sector Admin', null, 'Authorization appears on every sealed line.'),
  card('contact_kurtz', 'Kurtz', 'Ashfall Witness', 'station_ashcache', 'Eleven years counting the same mass.'),
  card('contact_sable_iask', 'Sable Iask', 'Named Captain', null, 'Long-range hunter. Leaves before the return shot.', 'cap_sable_iask'),
  card('contact_redcut_sorrel', 'Redcut Sorrel', 'Named Captain', null, 'Rammer. Closes before the warning finishes.', 'cap_redcut_sorrel'),
]);

const line = (id, beatIndex, variant, contactId, sender, text, choiceId = null) => Object.freeze({
  id, beatIndex, beatId: CAMPAIGN_BEATS[beatIndex].id, choiceId, variant, contactId, sender, channel: 'comms', text,
  careerId: null, branchId: null,
});

export const BEAT_COMMS = Object.freeze([
  line('comms.47a.b0.primary', 0, 'primary', 'contact_kessler', 'KESSLER', 'Sample the variance. Dock Helios afterward.'),
  line('comms.47a.b0.recovery', 0, 'failure_recovery', 'contact_kessler', 'KESSLER', 'Manifest remains open. Sample again, then dock.'),
  line('comms.47a.b1.primary', 1, 'primary', 'contact_kessler', 'KESSLER', 'Routine alloy run. Tycho pays when the seal clears.'),
  line('comms.47a.b1.recovery', 1, 'failure_recovery', 'contact_kessler', 'KESSLER', 'Honest work remains posted. Re-accept the run.'),
  line('comms.47a.b2.primary', 2, 'primary', 'contact_rook', 'ROOK', 'Target unknown. Board pays when the tag closes.'),
  line('comms.47a.b2.recovery', 2, 'failure_recovery', 'contact_rook', 'ROOK', 'Same tag reopened. Finish it or leave it.'),
  line('comms.47a.b3.primary', 3, 'primary', 'contact_slate', 'SLATE', 'Variance Adjustment is sound. The registry is not.'),
  line('comms.47a.b3.recovery', 3, 'failure_recovery', 'contact_slate', 'Shipyard remains open. Earn the hull.'),
  line('comms.47a.b4.primary', 4, 'primary', 'contact_vale', 'V. DIRECTOR', 'Three introductions. One administrator. Choose the work.'),
  line('comms.47a.b4.recovery', 4, 'failure_recovery', 'contact_vale', 'V. DIRECTOR', 'All three doors remain available.'),
  line('comms.47a.b5.primary', 5, 'primary', 'contact_callum', 'CALLUM', 'Not on the floor, Wren. The exchange listens.'),
  line('comms.47a.b5.recovery', 5, 'failure_recovery', 'contact_callum', 'CALLUM', 'The next proving leg remains posted.'),
  line('comms.47a.b6.primary', 6, 'primary', 'contact_vale', 'D. VALE', 'First remittance cleared through Vale Holdings.'),
  line('comms.47a.b6.recovery', 6, 'failure_recovery', 'contact_vale', 'D. VALE', 'The plot remains free. Deploy any asset.'),
  line('comms.47a.b7.primary', 7, 'primary', 'contact_kurtz', 'ASHFALL DESK', 'The mass stays. Only the manifest changes.'),
  line('comms.47a.b7.recovery', 7, 'failure_recovery', 'contact_kurtz', 'ASHFALL DESK', 'The count continues until you choose.'),
  line('comms.47a.choice.A', 7, 'primary', 'contact_vale', 'CONCORD ADMIN', 'Appointment confirmed. Record expunged.', 'A'),
  line('comms.47a.choice.B', 7, 'primary', 'contact_vale', 'QUIET ROUTING', 'Position confirmed. Traffic begins immediately.', 'B'),
  line('comms.47a.choice.C', 7, 'primary', 'contact_kurtz', 'ASHFALL DESK', 'Jump without destination. The system files return.', 'C'),
  line('comms.47a.choice.D', 7, 'primary', 'contact_kurtz', 'ASHFALL DESK', 'Keep the ledger. Stay. Become the desk.', 'D'),
  line('comms.47a.choice.E', 7, 'primary', 'contact_kessler', 'COURIER', 'Contract settled. New one is open.', 'E'),
]);

export function wordCount(text) { return String(text || '').trim().split(/\s+/).filter(Boolean).length; }
export function contactCardById(id) { return CONTACT_CARDS.find((entry) => entry.id === id) || null; }
export function listContactCards() { return CONTACT_CARDS.slice(); }
export function listBeatComms() { return BEAT_COMMS.slice(); }
export function commsForBeat(beatIndex, opts = {}) {
  return BEAT_COMMS.filter((entry) => entry.beatIndex === (Number(beatIndex) | 0)
    && (opts.choiceId === undefined ? entry.choiceId == null : entry.choiceId === opts.choiceId)
    && (!opts.variant || entry.variant === opts.variant));
}
export function commsForChoice(choiceId, opts = {}) {
  return BEAT_COMMS.filter((entry) => entry.choiceId === choiceId && (!opts.variant || entry.variant === opts.variant));
}
export function primaryCommsForBeat(beatIndex) { return commsForBeat(beatIndex, { variant: 'primary' })[0] || null; }
export function recoveryCommsForBeat(beatIndex) { return commsForBeat(beatIndex, { variant: 'failure_recovery' })[0] || null; }

export function validateEmbodiedDialogue() {
  const errors = [];
  const contacts = new Set(CONTACT_CARDS.map((entry) => entry.id));
  const endingIds = new Set(ENDINGS.map((entry) => entry.id));
  for (const entry of BEAT_COMMS) {
    if (!CAMPAIGN_BEATS[entry.beatIndex] || entry.beatId !== CAMPAIGN_BEATS[entry.beatIndex].id) errors.push(`${entry.id}: beat mismatch`);
    if (!contacts.has(entry.contactId)) errors.push(`${entry.id}: missing contact`);
    if (entry.choiceId && !endingIds.has(entry.choiceId)) errors.push(`${entry.id}: invalid ending`);
    if (wordCount(entry.text) > MAX_COMMS_WORDS) errors.push(`${entry.id}: exceeds ${MAX_COMMS_WORDS} words`);
  }
  for (const entry of CONTACT_CARDS) if (wordCount(entry.blurb) > MAX_CONTACT_BLURB_WORDS) errors.push(`${entry.id}: blurb too long`);
  return { ok: errors.length === 0, errors };
}
