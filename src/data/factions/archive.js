export const faction = {
  id: 'faction_archive', name: 'The Archive', short: 'Archive', color: '#3A2A5A',
  personality: 'archivist', startingRep: 0,
  homeSectors: ['sector_pallas_drift', 'sector_orcus_shadow'],
  controls: ['the Severed Codex', 'reading-room stations', 'document exchange'],
  fleetClass: 'monastic', aggression: 0.1,
  relations: {
    faction_scn: 0.0, faction_mts: 0.0, faction_dmc: 0.0, faction_reach: 0.0,
    faction_quiet: 0.0, faction_vael: 0.0, faction_free: 0.0, faction_choir: 0.0,
    faction_helix: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0,
    faction_pitborn: 0.0, faction_verge_layers: 0.0,
  },
  palette: {
    primary: '#3A2A5A', secondary: '#1A0A2A', accent: '#B88830',
    hull: '#3A2A5A', emissive: '#B88830', thruster: '#8060C0',
  },
  shipRoles: [
    { role: 'censor-frigate', weight: 0.5, hullIds: ['ship_ranger', 'ship_bastion'] },
    { role: 'abbot-cruiser', weight: 0.25, hullIds: ['ship_warden', 'ship_colossus'] },
    { role: 'indexer-capital', weight: 0.1, hullIds: ['ship_leviathan'] },
    { role: 'page-drone', weight: 0.15, hullIds: ['ship_kestrel'], source: 'drone' },
  ],
  illegalCommodities: [],
  custom: {
    tradesOnlyInSecrets: true,
    neutralToAll: true,
    redactionEMP: true,
    burningAnArchiveUnitesTheGalaxyAgainstYou: true,
    neverDestroysOnlyRedacts: true,
    pageDronesCopyLogs: true,
    recordsYourDeedsAsTradeGoods: true,
  },
  voiceRegister: 'silent-script',
};

// ── W-ARCHIVE (build_map §34.5 row 527, expansion bible 02 §12) ─────────────────────────
// "A secret for a secret." The weapon is Redaction: your engines and HUD go dark and you
// steer by snagging rocks and swinging. The runtime owner is
// src/systems/faction_archive.js (manifest id 'archiveRedaction').

// E-29 Redacted: a censor pulse blacks out engines and HUD inside a debris field.
export const ARCHIVE_REDACTION = Object.freeze({
  id: 'E-29',
  pulsePeriodS: 9,          // a censor pulses on this beat while you are in its field
  pulseRadius: 900,         // the redaction field reaches this far from the frigate
  durationS: 12,            // darkness holds this long after the pulse lands
  escapeRadiusBonus: 120,   // get out past pulseRadius + this and the redaction lifts early
  enginesDark: true,        // no thrust while redacted — momentum and the Line only
  hudDark: true,
  sectors: Object.freeze(['sector_pallas_drift', 'sector_orcus_shadow']),
  pulseLine: 'That entry is sealed.',
  escapeLine: 'You swung out of the dark. The Archive took notes anyway.',
});

// Page drones: they drift in, hold close, and copy your logs. Copied secrets become
// trade goods the Archive offers back later.
export const ARCHIVE_PAGE_DRONES = Object.freeze({
  approachSpeed: 48,
  copyRange: 120,
  copyTimeS: 5,
  maxCopiesPerDrone: 2,
  copiedTradeGoodId: 'archive_copied_log',
  departRange: 1400,
  copyLine: 'A page drone is copying your logs.',
});

// The reading room: an Archive office on a research-station base. Interior spec data —
// the station kit lane owns the walls; this is the authored identity they hang on.
export const ARCHIVE_READING_ROOM = Object.freeze({
  baseStationKind: 'station_research',
  name: 'Reading Room',
  services: Object.freeze(['secret_trade', 'folio_racks', 'index_desk']),
  dressing: Object.freeze({
    lanternCount: 18, glyphPanelCount: 9, rackRows: 4,
    lightKind: 'candle_flicker',
  }),
  usherLine: 'Brother Index will see you. Bring something worth reading.',
});

// Signature toy: the Index Head — hold the Line on an object and scan it to read its
// whole provenance: owners, mass record, where it has been.
export const ARCHIVE_INDEX_HEAD = Object.freeze({
  id: 'head_index',
  name: 'Index Head',
  scanTimeS: 2,
  line: 'Provenance, owners, mass record. The Stacks read everything eventually.',
});

export const ARCHIVE_BARKS = Object.freeze({
  trade: 'A secret for a secret.',
  sealed: 'That entry is sealed.',
  usher: 'Brother Index will see you. Bring something worth reading.',
  recorded: 'The Archive records the correction.',
});

export default faction;
