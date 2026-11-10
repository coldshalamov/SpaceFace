// Shared authored station residents. Stable contact IDs are save identities; a berth is
// an address, not a second character. Both the dock and the flight hail read this catalog.

export const LANTERN_WARD_CONTACT_ID = 'contact_nessa_venn';

export const LANTERN_WARD_RESIDENT = Object.freeze({
  id: LANTERN_WARD_CONTACT_ID, canonicalKey: 'nessa_venn', name: 'Nessa Venn',
  role: 'engineer', roleLabel: 'Last Watch Electrical · field radio',
  factionId: 'faction_free', stationId: 'station_helios',
  line: 'My launch is in Lantern Ward. The family lamp still has an address.',
  choices: Object.freeze([
    Object.freeze({ id: 'ward_work', label: 'How is the family lamp?' }),
    Object.freeze({ id: 'ward_route', label: 'Where do you need me?' }),
  ]),
});

export const CANONICAL_CONTACTS = [
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
  // W-FACES (row 543, 03 §4.1 + §4.2): the rest of the canon cast and the eleven new faces, each at
  // the station their canon ties them to. First lines are the canon lines from 03 §4.2.
  {
    key: 'sula_dree',
    stationIds: ['station_dione_customs'],
    name: 'Inspector Sula Dree',
    role: 'pilot',
    roleLabel: 'Gate Inspector',
    factionId: 'faction_scn',
    line: 'Gate 3 is a weighing, not a court. An honest manifest keeps its fine unpaid.',
  },
  {
    key: 'callum',
    stationIds: ['station_dione'],
    name: 'Callum Oakes',
    role: 'merchant',
    roleLabel: 'Futures Broker',
    factionId: 'faction_mts',
    line: 'Futures settle at the tone. Everything else is sentiment.',
  },
  {
    key: 'wex',
    stationIds: ['station_helios'],
    name: 'Wex',
    role: 'engineer',
    roleLabel: 'Bay 7 Depot Keeper',
    factionId: 'faction_scn',
    line: 'Nineteen years of install-pending tags. I file them anyway.',
  },
  {
    key: 'sump',
    stationIds: ['station_ashcache'],
    name: 'Sump',
    role: 'engineer',
    roleLabel: 'Sweeper',
    factionId: 'faction_pitborn',
    line: 'Dust goes this side, then it goes that side. Someone has to push it.',
  },
  {
    key: 'ma_sprocket',
    stationIds: ['station_ashcache'],
    name: 'Ma Sprocket',
    role: 'merchant',
    roleLabel: 'Cull Announcer',
    factionId: 'faction_pitborn',
    line: "Heavy's honest, babies! COUNT 'EM!",
  },
  {
    key: 'clatter',
    stationIds: ['station_sker'],
    name: 'Clatter',
    role: 'pilot',
    roleLabel: 'Cull Rival Ace',
    factionId: 'faction_pitborn',
    line: 'That rock had my name on it. It has your hull on it now.',
  },
  {
    key: 'moss_keeps_moss',
    stationIds: ['station_eunomia'],
    name: 'Moss-Keeps-Moss',
    role: 'merchant',
    roleLabel: 'Garden Elder',
    factionId: 'faction_understory',
    line: 'Bring us what died. We will make it something.',
  },
  {
    key: 'brother_index',
    stationIds: ['station_orcus_shadow'],
    name: 'Brother Index',
    role: 'merchant',
    roleLabel: 'Reading-Room Keeper',
    factionId: 'faction_archive',
    line: 'That entry is sealed. Unseal one of yours.',
  },
  {
    key: 'addendum_seroy',
    stationIds: ['station_phoebe_echo'],
    name: 'Addendum Seroy',
    role: 'merchant',
    roleLabel: 'Contract Officer',
    factionId: 'faction_vael',
    line: 'Provided that you read it, the terms are fair.',
  },
  {
    key: 'cantor_lise',
    stationIds: ['station_depot3'],
    name: 'Cantor Lise',
    role: 'barkeep',
    roleLabel: 'Shrine Keeper',
    factionId: 'faction_choir',
    line: 'The relic was never inert. Only waiting.',
  },
  {
    key: 'mael_ost',
    stationIds: ['station_sedna'],
    name: 'Adjudicator Mael Ost',
    role: 'pilot',
    roleLabel: 'Audit Adjudicator',
    factionId: 'faction_helix',
    line: 'Lawful interdiction. Read the invoice.',
  },
  {
    key: 'petra_lusk',
    stationIds: ['station_dione_customs'],
    name: 'Commander Petra Lusk',
    role: 'pilot',
    roleLabel: 'Relief Captain',
    factionId: 'faction_scn',
    line: 'Hold for weight. I will not ask twice.',
  },
  {
    key: 'nine_finger_abe',
    stationIds: ['station_hyperion_claim'],
    name: 'Nine-Finger Abe',
    role: 'miner',
    roleLabel: 'Claim Boss',
    factionId: 'faction_dmc',
    line: "The rock took one. It won't take another.",
  },
  {
    key: 'tamsin',
    stationIds: ['station_reach'],
    name: 'Tamsin',
    role: 'pilot',
    roleLabel: 'Homestead Pilot',
    factionId: 'faction_free',
    line: 'Still temporary. Tell me where to put the wall.',
  },
  {
    key: 'clerk_0003',
    stationIds: ['station_tethys'],
    name: 'Clerk 0003',
    role: 'merchant',
    roleLabel: 'Routing Clerk',
    factionId: 'faction_fulfillment',
    line: 'Your order has always been important to us.',
  },
  // SP2-041 "The Previous Tenant's Mail": the cushion letter's author, drinking at Quinn's
  // under the same management. Six owners is the hull's count, not Rets's patience.
  {
    key: 'rets',
    stationIds: ['station_smuggler'],
    name: 'Rets',
    role: 'pilot',
    roleLabel: 'Retired Watch Regular',
    factionId: 'faction_quiet',
    line: '"You are sitting in the chair. The cushion before yours held better arguments than most crews."',
  },
  // SP1-193 "The Portrait Buoys": the corridor's shroud painter, findable at Reach Station.
  // The buoy line (src/data/special500/portraitBuoyLine.js) hangs her work; she takes
  // commissions and refuses payment in anything but a good story (settled by
  // src/systems/special500PortraitBuoys.js on ui:talkContact).
  {
    key: 'painter',
    stationIds: ['station_reach'],
    name: 'Vesper',
    role: 'pilot',
    roleLabel: 'Shroud Painter',
    factionId: 'faction_free',
    line: 'Your hull is the newest frame on the corridor line. It is not finished. It will be, if the story is worth the canvas.',
    choices: [
      { id: 'commission', label: 'Commission the portrait — pay in a story.' },
      { id: 'ask_paint', label: 'Ask why nobody signs them.' },
    ],
  },
  // SP2-065 "The Sommelier of Coolant": the depot bar's retired Choir censer machine, which
  // has rebranded its incense burn as "beverage temperature control" (settled by
  // src/systems/special500Sommelier.js on ui:talkContact).
  {
    key: 'sommelier',
    stationIds: ['station_depot3'],
    name: 'The Sommelier of Coolant',
    role: 'barkeep',
    roleLabel: 'Retired Censer',
    factionId: 'faction_choir',
    line: 'This cell — cast on a Thursday. You will taste the Thursday.',
    choices: [
      { id: 'the_thursday', label: 'Buy "the Thursday" — 12 cr.' },
      { id: 'ask_vintages', label: 'Ask what else is on the rail.' },
    ],
  },
];

const CANONICAL_BY_STATION = new Map();
for (const contact of CANONICAL_CONTACTS) {
  for (const stationId of contact.stationIds) {
    const list = CANONICAL_BY_STATION.get(stationId);
    if (list) list.push(contact);
    else CANONICAL_BY_STATION.set(stationId, [contact]);
  }
}

/* ── contact generation ─────────────────────────────────────────────── */

// Row 543: a station can keep more than one authored face (Wex shares Helios with Kessler; Sump,
// Ma Sprocket and Kurtz all live at the Pit; Sula Dree and Petra Lusk share Gate 3's customs post).
// List order is insertion order into the bar's line-up.
export function canonicalContactsForStation(stationId) {
  const bases = CANONICAL_BY_STATION.get(stationId);
  if (!bases || !bases.length) return [];
  return bases.map((base) => ({
    id: 'contact_' + stationId + '_' + base.key,
    name: base.name,
    role: base.role,
    roleLabel: base.roleLabel,
    factionId: base.factionId,
    line: base.line,
    canonicalKey: base.key,
    choices: Array.isArray(base.choices) ? base.choices.slice() : undefined,
  }));
}

