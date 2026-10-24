// Verbatim excerpts from public master 0ebaf5d32603707ba765498e6c8c7b5c8eea2eb1.
// barContacts.js blob 58150974985a21faadce3965b96b4357d3aedcb1; comms.js blob 1236dc2d2a6ed3e094d3ef9453e3a865629d99aa.
const CANONICAL_CONTACTS = [
  {
    key: 'kessler',
    stationIds: ['station_helios'],
    name: 'Kessler',
    role: 'merchant',
    roleLabel: 'Cargo Registrar',
    factionId: 'faction_scn',
    line: '"Weight matches prior haul." Contract 47-A is still under review.',
  },
  {
    key: 'rook',
    stationIds: ['station_coalition'],
    name: 'Rook',
    role: 'bounty_hunter',
    roleLabel: 'Bounty Broker',
    factionId: 'faction_scn',
    line: 'One name on the board, two payers in the back room.',
  },
  {
    key: 'voss',
    stationIds: ['station_beltout'],
    name: 'Voss',
    role: 'miner',
    roleLabel: 'Claim Recorder',
    factionId: 'faction_dmc',
    line: '"Vein looks played out." His cutter is already warm.',
  },
  {
    key: 'hale',
    stationIds: ['station_customs'],
    name: 'Hale',
    role: 'pilot',
    roleLabel: 'Customs Officer',
    factionId: 'faction_scn',
    line: 'Scan complete. No flags. The second fine is procedural.',
  },
  {
    key: 'mira',
    stationIds: ['station_tethys'],
    name: 'Mira',
    role: 'merchant',
    roleLabel: 'Freight Seal Clerk',
    factionId: 'faction_mts',
    line: 'Route is clear. Payment on delivery. The seal stays closed.',
  },
  {
    key: 'slate',
    stationIds: ['station_forge'],
    name: 'Slate',
    role: 'engineer',
    roleLabel: 'Shipyard Welder',
    factionId: 'faction_dmc',
    line: '"This will hold till the next gate." The weld knows which seam.',
  },
  {
    key: 'drift',
    stationIds: ['station_drift'],
    name: 'Drift',
    role: 'merchant',
    roleLabel: 'Ore Ledger',
    factionId: 'faction_mts',
    line: 'Quota met. Credit transferred. The decimals can wait.',
  },
  {
    key: 'quinn',
    stationIds: ['station_smuggler', 'station_sker'],
    name: 'Quinn',
    role: 'barkeep',
    roleLabel: 'Proprietor',
    factionId: 'faction_quiet',
    line: 'Same rates. Same management. Same drawer under the bar.',
  },
  {
    key: 'sallow',
    stationIds: ['station_io_merc'],
    name: 'Sallow',
    role: 'bounty_hunter',
    roleLabel: 'Contract Broker',
    factionId: 'faction_quiet',
    line: 'Writs on the wall. The Quiet price is the quiet price.',
  },
  {
    // Charon Expanse hunter exchange: the writ wall gets a face. Ferrow files the tags
    // the board pays on and knows which distress squawks nobody will.
    key: 'ferrow',
    stationIds: ['station_expanse'],
    name: 'Ferrow',
    role: 'bounty_hunter',
    roleLabel: 'Writ Clerk',
    factionId: 'faction_dmc',
    line: 'The writ wall tracks raiders, wrecks, and radiation lanes. Pick a name; the ledger does the rest.',
  },
  {
    key: 'kurtz',
    stationIds: ['station_ashcache'],
    name: 'Kurtz',
    role: 'merchant',
    roleLabel: 'Ashfall Witness',
    factionId: 'faction_vael',
    line: 'Eleven years counting the same mass.',
    choices: [
      { id: 'openLedger', label: 'Open the desk ledger.' },
      { id: 'takeLedger', label: 'Take the ledger.' },
      { id: 'approach', label: 'Ask what he is counting.' },
    ],
  },
];

const CANONICAL_BY_STATION = new Map();
for (const contact of CANONICAL_CONTACTS) {
  for (const stationId of contact.stationIds) {
    CANONICAL_BY_STATION.set(stationId, contact);
  }
}

/* ── contact generation ─────────────────────────────────────────────── */

function canonicalContactForStation(stationId) {
  const base = CANONICAL_BY_STATION.get(stationId);
  if (!base) return null;
  return {
    id: 'contact_' + stationId + '_' + base.key,
    name: base.name,
    role: base.role,
    roleLabel: base.roleLabel,
    factionId: base.factionId,
    line: base.line,
    canonicalKey: base.key,
    choices: Array.isArray(base.choices) ? base.choices.slice() : undefined,
  };
}


export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export { CANONICAL_CONTACTS, canonicalContactForStation };

const isChoiceECourierReady = () => true;
const state = {}; const stationId = 'station_ashcache';
  const endingCourier = isChoiceECourierReady(state, stationId)
    ? [{
      id: 'contact_ashcache_next_run_courier',
      name: 'Settlement Courier',
      role: 'courier',
      roleLabel: 'Contract Courier',
      factionId: null,
      line: "Contract settled. New one's open.",
      canonicalKey: 'next_run_courier',
      endgameChoice: 'E',
      choices: [
        { id: 'accept_next_run', label: 'Accept.' },
        { id: 'not_yet', label: 'Not yet.' },
      ],
    }]
    : [];

export { endingCourier };
