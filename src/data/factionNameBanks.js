// Plan 29 ordinary-contact names.
//
// These banks are intentionally small, hand-authored, and deterministic. Spawn owners provide one
// stable hash; this module only projects it into a faction ship name and a role-readable callsign.
// Named aces, mission actors, bosses, and authored lane contacts keep their explicit identities.

const ROLE_FAMILY_BY_ROLE = Object.freeze({
  patrol: 'patrol',
  escort: 'patrol',
  passive: 'patrol',
  hauler: 'freight',
  courier: 'freight',
  express: 'freight',
  ore_carrier: 'freight',
  fleeing_trader: 'freight',
  miner: 'industry',
  salvor: 'industry',
  tender: 'service',
  rescue: 'service',
  surveyor: 'survey',
  sniper: 'survey',
  pirate: 'combat',
  brawler: 'combat',
  rammer: 'combat',
  swarmer: 'combat',
  miniboss_capital: 'heavy',
});

export const ROLE_CALLSIGN_BANKS = Object.freeze({
  patrol: Object.freeze(['WATCH', 'GATE', 'PICKET']),
  freight: Object.freeze(['LOAD', 'AXLE', 'MANIFEST']),
  industry: Object.freeze(['SHIFT', 'CUT', 'RIG']),
  service: Object.freeze(['TOW', 'PATCH', 'LIFELINE']),
  survey: Object.freeze(['MARK', 'RANGE', 'NEEDLE']),
  combat: Object.freeze(['LANCE', 'HOOK', 'KNOCK']),
  heavy: Object.freeze(['ANVIL', 'YARD', 'BLOCK']),
});

function bank(prefix, shipNames, registryPrefix = null) {
  return Object.freeze({
    callsignPrefix: prefix,
    shipNames: Object.freeze(shipNames),
    registryPrefix,
  });
}

export const FACTION_NAME_BANKS = Object.freeze({
  faction_scn: bank('SCN', ['Concord Auxiliary'], 'SCN'),
  faction_mts: bank('MER', ['Aunt Miri', 'Old Calder', 'Nan Toma', 'Uncle Venn', 'Rosa Mercer', 'Jory Pell']),
  faction_dmc: bank('DMC', ['Shift Bell', 'Last Load', 'Sixth Seam', 'Rock Wages', 'Dust Ledger', 'Cut Face']),
  faction_reach: bank('KNIFE', ['Last Debt', 'Red Knife', 'Borrowed Time', 'No Witness', 'Cutpurse', 'Owed Blood']),
  faction_quiet: bank('HUSH', ['No Receipt', 'Back Door', 'Loose Seal', 'Night Cargo', 'Wrong Manifest', 'Soft Knock']),
  faction_vael: bank('VAEL', ['Hollow Witness', 'Still Orchard', 'Glass Root', 'Third Silence', 'Pale Measure', 'Open Hand']),
  faction_free: bank('FREE', ['Blue Wrench', 'Long Mile', 'Second Shift', 'Tin Promise', 'Back Forty', 'Good Enough']),
  faction_choir: bank('CHOIR', ['Second Voice', 'Low Hymn', 'Open Chorus', 'Last Refrain', 'Working Song', 'Quiet Verse']),
  faction_helix: bank('HELIX', ['Spare Nerve', 'Good Tissue', 'Third Growth', 'Clean Culture', 'Soft Graft', 'Old Sample']),
  faction_understory: bank('MOSS', ['Rot Lantern', 'Moss Freight', 'Old Bloom', 'Wet Timber', 'Green Wake', 'Root Cellar']),
  faction_fulfillment: bank('FORM', ['Form Complete', 'Due Process', 'Final Notice', 'Queue Seven', 'Claim Denied', 'Service Window']),
  faction_archive: bank('FILE', ['Filed Copy', 'Redacted Line', 'Margin Note', 'Box Twelve', 'Return Slip', 'Index Card']),
  faction_pitborn: bank('PIT', ['Patch Job', 'Three Welds', 'Bent Axle', 'Spare Teeth', 'Yard Dog', 'Still Pulling']),
  faction_verge_layers: bank('VERGE', ['Outer Mark', 'Thin Place', 'Last Survey', 'Far Marker', 'Far Sound', 'Blank Mile']),
});

function unsigned(value) {
  return Number(value) >>> 0;
}

export function ordinaryRoleFamily(role) {
  return ROLE_FAMILY_BY_ROLE[String(role || '').toLowerCase()] || 'combat';
}

/** Project a caller-owned stable hash into one authored ordinary-contact identity. */
export function ordinaryShipIdentity(factionId, role, stableHash) {
  const bankDef = FACTION_NAME_BANKS[factionId] || FACTION_NAME_BANKS.faction_free;
  const hash = unsigned(stableHash);
  const roleFamily = ordinaryRoleFamily(role);
  const roleWords = ROLE_CALLSIGN_BANKS[roleFamily];
  const serial = 10 + ((hash >>> 16) % 90);
  const name = bankDef.registryPrefix
    ? `${bankDef.registryPrefix}-${100 + (hash % 900)}`
    : bankDef.shipNames[hash % bankDef.shipNames.length];
  const roleWord = roleWords[(hash >>> 8) % roleWords.length];
  return Object.freeze({
    name,
    callsign: `${bankDef.callsignPrefix}-${roleWord}-${serial}`,
    factionId: FACTION_NAME_BANKS[factionId] ? factionId : 'faction_free',
    role: String(role || 'contact'),
    roleFamily,
  });
}
