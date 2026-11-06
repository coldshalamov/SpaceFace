// src/data/special500/entries.js — vertical-slice entries (first authored batch).
// Proves every delivery channel end to end; the mass-authored batches follow the
// same shape. Text is drawn from the ratified consensus entries verbatim where
// the entry promised a line, adapted to channel length where it promised a scene.

export const ENTRIES_SLICE = [
  // SP3-019 — Eclipse Bulletin: the teach that the umbra is scheduled, not random.
  // Fires on the wire one day before SP3-002's day-12 transit, every year.
  {
    id: 'SP3-019',
    kind: 'comms-event',
    title: 'Eclipse Bulletin',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 11, windowS: [0, 120] },
    recurring: true,
    channel: 'news',
    payload: {
      text: 'SECTOR WIRE: umbra transit tomorrow, second bell. Window glass down, work lights up.',
      kind: 'incidents',
    },
  },

  // SP3-002 — The Umbra Minute: once per 40-day year, a background moon crosses the
  // key-light line in Helios Prime for ~45 s. The light leg is bespoke (look overlay,
  // authored by the graphics follow-up); the director records the observed receipt so
  // the visual leg, codex page and wire follow-ups can gate on it.
  {
    id: 'SP3-002',
    kind: 'visual-setpiece',
    title: 'The Umbra Minute',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'calendar', dayOfYear: 12, windowS: [100, 145] },
    recurring: true,
    channel: 'spectacle',
    payload: {
      from: 'Helios Prime',
      text: 'The key light fails mid-stride — dimmed to embers for a full minute. Every window and nav lamp on the station suddenly carries the frame. Then the sun comes back in one clean ramp, like nothing happened.',
    },
  },

  // SP3-014 — The Sun Dogs: days 20-22 of every year, first watch, two mock suns.
  {
    id: 'SP3-014',
    kind: 'anomaly',
    title: 'The Sun Dogs',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'calendar', dayOfYear: 20, windowS: [0, 600] },
    recurring: true,
    channel: 'commsLog',
    payload: {
      from: 'Helios traffic',
      text: 'Optics check: two mock suns flanking the key at 22 degrees, holding formation while traffic flies through them. The bar is running its usual bet on which one goes out first.',
    },
  },

  // SP3-033 — The Fiddle Strings: eleven cargo tethers strung between two boulders
  // in the Ceres belt. First sector entry tells you they are there; the singing is
  // the solar-wind season's business (audio batch).
  {
    id: 'SP3-033',
    kind: 'world-oneoff',
    title: 'The Fiddle Strings',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'sectorEntry' },
    channel: 'commsLog',
    payload: {
      from: 'Belt chatter',
      text: 'Somewhere between the f_ceres_2 boulders, someone strung eleven real cargo tethers across the dark like a harp. Old-timers say they sing when the wind fronts come through.',
    },
  },

  // SP1-097 — The Favor Ledger: a plain buoy with a public ledger of favors owed and
  // owed-by. Proximity tell on the first close pass; the ledger's read/write logic is
  // the rescue/tow follow-up batch (story.flags['special500.SP1-097.ledger']).
  {
    id: 'SP1-097',
    kind: 'world-oneoff',
    title: 'The Favor Ledger',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'proximity', nearStation: 'station_tethys', wu: 1200 },
    channel: 'comms',
    payload: {
      from: 'Unregistered buoy',
      text: 'A plain station-grade buoy, screen face public: FAVORS OWED / OWED-BY, maintained by nobody, accurate about everybody. Your hull has a line on it now. It reads: "owes the belt one honest tow."',
      ttl: 7,
    },
  },
];
