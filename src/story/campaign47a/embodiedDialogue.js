// Concise canonical contact voice for Campaign 47-A. Story remains the presentation authority.
import { CAMPAIGN_BEATS, ENDINGS } from './campaignData.js';

export const EMBODIED_DIALOGUE_ID = 'campaign47a.embodiedDialogue.v2';
export const EMBODIED_DIALOGUE_SCHEMA_VERSION = 2;
export const MAX_COMMS_WORDS = 12;
export const MAX_CONTACT_BLURB_WORDS = 12;
export const DIALOGUE_VARIANTS = Object.freeze(['primary', 'failure_recovery']);
export const CAREER_CROSSOVER_IDS = Object.freeze(['hauler', 'hunter', 'prospector']);

const card = (id, name, roleLabel, stationHint, blurb, namedCaptainId = null, options = {}) => Object.freeze({
  id, name, callsign: name.toUpperCase(), roleLabel, stationHint, blurb, namedCaptainId,
  ...options,
  portrait: false, hudPortrait: false, visorMotif: false,
});

const depthCard = (programId, id, name, roleLabel, stationHints, blurb, trackerId, voiceRegister, options = {}) => card(
  id,
  name,
  roleLabel,
  stationHints[0],
  blurb,
  null,
  {
    programId,
    stationHints: Object.freeze(stationHints.slice()),
    trackerId,
    voiceRegister,
    gate: Object.freeze({ minBeat: 0, ...(options.gate || {}) }),
    role: options.role || 'barkeep',
    factionId: options.factionId || null,
    poiHint: options.poiHint || null,
  },
);

export const DEPTH_PROGRAM_CONTACTS = Object.freeze([
  depthCard('G1', 'contact_yune', 'Clerk Yune', 'Sealed-Evidence Broker', ['station_nyx_march'], 'Sealed files open for a fee. Then re-seal.', 'yune.trust', 'quiet-bureaucratic', { role: 'smuggler', factionId: 'faction_quiet', gate: { minBeat: 6, minRep: Object.freeze({ factionId: 'faction_quiet', value: 25 }) } }),
  depthCard('G2', 'contact_coldburn_rey', '“Coldburn” Rey', 'Named Rival', ['station_reach'], 'You took that lane. I remember which one.', 'coldburn.grudge', 'working-rival', { role: 'pilot', factionId: 'faction_free', gate: { minBeat: 2 } }),
  depthCard('G3', 'contact_iren_suhl', 'Dr. Iren Suhl', 'Xenolinguist', ['station_veil'], 'The clauses answer back. I keep the transcripts.', 'suhl.clauses', 'plain-clause', { role: 'engineer', factionId: 'faction_free', gate: { minBeat: 3 } }),
  depthCard('G4', 'contact_orrin', 'Warrant Orrin', 'Inspector General', ['station_coalition'], 'The audit is clean. The audit is always clean.', 'orrin.case', 'procedural-defeated', { role: 'bounty_hunter', factionId: 'faction_scn', gate: { minBeat: 4 } }),
  depthCard('G5', 'contact_sker_vane', 'Boss Sker Vane', 'Reach Kingpin', ['station_sker'], 'My lane. My toll. My cut of your apology.', 'vane.favor', 'patient-bravado', { role: 'smuggler', factionId: 'faction_reach', gate: { minBeat: 2 } }),
  depthCard('G6', 'contact_dustwife_senna', '“Dustwife” Senna', 'Wreck Elder', ['station_sedna'], 'The dark remembers. I write it down.', 'senna.names', 'soft-recordkeeper', { role: 'miner', factionId: 'faction_dmc', gate: { minBeat: 6, minUniqueWrecks: 3 } }),
  depthCard('G7', 'contact_latch_child', 'Latch-Child', 'Feral Salvage Automaton', ['station_smuggler'], 'Found. Held. Delivered. Found. Held. Delivered.', 'latch.child', 'automaton-loop', { role: 'merchant', factionId: 'faction_quiet', gate: { minBeat: 1 } }),
  depthCard('G8', 'contact_question', 'The Question', 'Precursor Interrogative', ['station_sedna'], 'What was carried. What was owed. Answer.', 'question.answers', 'precursor-interrogative', { role: 'engineer', gate: { minBeat: 6 } }),
  depthCard('G9', 'contact_filecleaver_dorin', '“Filecleaver” Dorin', 'Bounty Target → Ally', ['station_customs'], 'I stole the seal log. It proves a massacre.', 'dorin.trust', 'bureaucratic-panic', { role: 'bounty_hunter', factionId: 'faction_scn', gate: { minBeat: 4 } }),
  depthCard('G10', 'contact_lira_vonn', 'Lira Vonn, “The Margin”', 'Independent Correspondent', ['station_drift'], 'I print what happened. You happened. Talk.', 'vonn.interviews', 'plain-sourcework', { role: 'barkeep', factionId: 'faction_free', gate: { minBeat: 3 } }),
  depthCard('G11', 'contact_tinker_zell', 'Tinker Zell', 'Black-Market Mechanic', ['station_sker'], 'Stolen parts, fair prices, no warranty. Park it.', 'zell.work', 'fast-bravado', { role: 'engineer', factionId: 'faction_reach', gate: { minBeat: 2 } }),
  depthCard('G12', 'contact_mara_children', 'Mara and the Children', 'Refugee Convoy Lead', ['station_drift', 'station_beltout'], 'Three children, one hold, no destination. Take us.', 'mara.debt', 'plain-exhausted', { role: 'pilot', factionId: 'faction_free', gate: { minBeat: 3 } }),
  depthCard('G13', 'contact_wraith_kell', '“Wraith” Kell', 'Deep-Cover Operative', ['station_customs'], 'I file manifests by day, copy them by night. Burn?', 'kell.cover', 'split-clerk', { role: 'smuggler', factionId: 'faction_quiet', gate: { minBeat: 5 } }),
  depthCard('G14', 'contact_halev_doss', 'Prof. Halev Doss', 'University Archivist', ['station_helios'], 'The sector has a paper trail. I walk it daily.', 'doss.sources', 'precise-warm', { role: 'merchant', factionId: 'faction_scn', gate: { minBeat: 1 } }),
  depthCard('G15', 'contact_maera_vols', 'Captain Maera Vols', 'Hull Ghost', ['station_helios'], 'I left the engines warm. You fly her further than I did.', 'vols.business', 'tired-fragment', { role: 'pilot', factionId: 'faction_dmc', poiHint: 'poi_helios_yard' }),
]);

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
  ...DEPTH_PROGRAM_CONTACTS,
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
  line('comms.47a.b3.recovery', 3, 'failure_recovery', 'contact_slate', 'SLATE', 'Shipyard remains open. Earn the hull.'),
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
export function depthContactAvailable(cardEntry, state = {}) {
  const gate = cardEntry && cardEntry.gate || {};
  const beatIndex = Number(state.story && state.story.beatIndex) || 0;
  if (beatIndex < (Number(gate.minBeat) || 0)) return false;
  if (gate.minRep) {
    const faction = state.factions && state.factions[gate.minRep.factionId];
    if ((Number(faction && faction.rep) || 0) < (Number(gate.minRep.value) || 0)) return false;
  }
  if (gate.minUniqueWrecks) {
    const flags = state.player && state.player.flags || {};
    const visited = Array.isArray(flags.uniqueWrecksVisited) ? new Set(flags.uniqueWrecksVisited).size : 0;
    if (visited < gate.minUniqueWrecks) return false;
  }
  return true;
}
export function depthContactsForStation(stationId, state = {}) {
  return DEPTH_PROGRAM_CONTACTS.filter((entry) => entry.stationHints.includes(stationId) && depthContactAvailable(entry, state));
}
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

export function validateDepthProgramContacts() {
  const errors = [];
  const ids = new Set();
  const programIds = new Set();
  for (const entry of DEPTH_PROGRAM_CONTACTS) {
    if (ids.has(entry.id)) errors.push(`${entry.id}: duplicate id`);
    if (programIds.has(entry.programId)) errors.push(`${entry.programId}: duplicate program id`);
    ids.add(entry.id);
    programIds.add(entry.programId);
    if (!Array.isArray(entry.stationHints) || entry.stationHints.length === 0) errors.push(`${entry.id}: missing station hints`);
    if (!entry.trackerId) errors.push(`${entry.id}: missing tracker`);
    if (!entry.voiceRegister) errors.push(`${entry.id}: missing voice register`);
    if (wordCount(entry.blurb) > MAX_CONTACT_BLURB_WORDS) errors.push(`${entry.id}: blurb too long`);
  }
  return { ok: errors.length === 0, errors };
}
