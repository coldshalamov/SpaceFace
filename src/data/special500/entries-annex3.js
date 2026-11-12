// entries-annex3.js — annex wave 3: THE DOCK REMEMBERS (17 entries, SPX-F-*).
//
// The INFERENCE seed made concrete: dock somewhere twice and the berth acknowledges you
// in its own voice; dock at a signature port five times and the port stops pretending
// you are traffic. Every entry is a `receipt dock:docked` filtered by `where.stationId`
// and fired on the Nth matching receipt — the counter is the memory. `nth` itself orders
// second visit before fifth; no `after` gates (they defer counter accumulation).
//
// Stations named below are real ids in sectors.js. One acknowledgment per station keeps
// the surface honest — a port that gushes every visit is a port that means nothing.

export const ENTRIES_ANNEX_3 = Object.freeze([
  // ── Second docking: the berth files you as known ──
  {
    id: 'SPX-F-01',
    kind: 'comms-event',
    title: 'The Berth Ledger',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked', where: { stationId: 'station_helios' }, nth: 2 },
    channel: 'commsLog',
    payload: {
      from: 'Helios Station — berth control',
      text: 'Second berthing logged, Tessera. The board moved you to a remembered slot — same adapter, same pressure door, one bay closer to the good air. Helios keeps a page for every hull that comes back.',
    },
  },
  {
    id: 'SPX-F-02',
    kind: 'comms-event',
    title: 'The Thin File',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked', where: { stationId: 'station_coalition' }, nth: 2 },
    channel: 'commsLog',
    payload: {
      from: 'Coalition HQ — port adjutant',
      text: 'SECOND ENTRY, SAME CALL SIGN. FILE REMAINS THIN. THE ADJUTANT NOTES: THIN FILES ARE THE COMPLIMENT THIS SERVICE PAYS.',
    },
  },
  {
    id: 'SPX-F-03',
    kind: 'comms-event',
    title: 'The Weigh-Bridge\'s Memory',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked', where: { stationId: 'station_ceres' }, nth: 2 },
    channel: 'commsLog',
    payload: {
      from: 'Ceres Refinery — mass desk',
      text: 'Welcome back. The weigh-bridge kept your first hold\'s variance on record — it flagged nothing then, it flags nothing now. The refinery prices ore, not arithmetic.',
    },
  },
  {
    id: 'SPX-F-04',
    kind: 'comms-event',
    title: 'The Kettle Was On',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked', where: { stationId: 'station_beltout' }, nth: 2 },
    channel: 'commsLog',
    payload: {
      from: 'Belt Outpost — the deck hand',
      text: 'Knew your burn before your transponder cleared the dust. Second visit — the kettle was already on. Out here that is the entire welcome.',
    },
  },
  {
    id: 'SPX-F-05',
    kind: 'comms-event',
    title: 'Routing, They Call It',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked', where: { stationId: 'station_tethys' }, nth: 2 },
    channel: 'commsLog',
    payload: {
      from: 'Tethys Trade Hub — routing desk',
      text: 'Your last berth was assigned before you asked. The desk calls it routing. The desk calls everything routing. Second docking logged with preference.',
    },
  },
  {
    id: 'SPX-F-06',
    kind: 'comms-event',
    title: 'Papers Already Read',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked', where: { stationId: 'station_customs' }, nth: 2 },
    channel: 'commsLog',
    payload: {
      from: 'Customs Gate — inspection line',
      text: 'Your papers were read before you transmitted them. Second crossing, first nod from the inspector. Do not mistake it for warmth; the scanner is still on.',
    },
  },
  {
    id: 'SPX-F-07',
    kind: 'comms-event',
    title: 'The Unfiled Requisition',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked', where: { stationId: 'station_forge' }, nth: 2 },
    channel: 'commsLog',
    payload: {
      from: 'Forge Foundry — works queue',
      text: 'The forge queue is holding a requisition in your name you never filed — a returning hull gets a draft order made from its own service record. Check the spec. The yard is rarely wrong.',
    },
  },
  {
    id: 'SPX-F-08',
    kind: 'comms-event',
    title: 'Closer to the Good Air',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked', where: { stationId: 'station_drift' }, nth: 2 },
    channel: 'commsLog',
    payload: {
      from: 'Drift Market — berth master',
      text: 'Second visit and the board moved you nearer the good air. That is all the ceremony Drift runs — the stall that shorted you last time has been told, quietly, not to.',
    },
  },
  {
    id: 'SPX-F-09',
    kind: 'comms-event',
    title: 'Already Priced',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked', where: { stationId: 'station_smuggler' }, nth: 2 },
    channel: 'commsLog',
    payload: {
      from: 'Smuggler Den — no sender',
      text: 'The den did not greet you. The second visit was already priced into the board before your clamps bit. You are learning how this place works.',
    },
  },
  {
    id: 'SPX-F-10',
    kind: 'comms-event',
    title: 'The Warm Slot',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked', where: { stationId: 'station_reach' }, nth: 2 },
    channel: 'commsLog',
    payload: {
      from: 'Reach Station — harbor watch',
      text: 'Kept your wreck slot warm. Nobody believed you would take it twice, which is why nobody took it. Welcome back to the only honest port in the reach — do not quote us.',
    },
  },
  {
    id: 'SPX-F-11',
    kind: 'comms-event',
    title: 'The Bazaar\'s Doors',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked', where: { stationId: 'station_sker' }, nth: 2 },
    channel: 'commsLog',
    payload: {
      from: 'Sker Bazaar — door account',
      text: 'The doors knew your mass. Second entry, no questions asked, one witness paid to forget. The Bazaar remembers hulls the way pawnbrokers remember faces — accurately, and for money.',
    },
  },
  {
    id: 'SPX-F-12',
    kind: 'comms-event',
    title: 'The Ledger Says Less',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked', where: { stationId: 'station_ashcache' }, nth: 2 },
    channel: 'commsLog',
    payload: {
      from: 'Ruined Cache Station — the cache itself',
      text: 'Your second crossing was logged by a station that pretends to be dead. The Vael still say nothing. The ledger, which also says nothing, now says it about you specifically.',
    },
  },
  {
    id: 'SPX-F-13',
    kind: 'comms-event',
    title: 'The Standing Tally',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked', where: { stationId: 'station_vesta_outlying_yard' }, nth: 2 },
    channel: 'commsLog',
    payload: {
      from: 'Forge Outlying Yard — claims desk',
      text: 'Return tallied against open claims: none matched your hull, so the tally stands at zero and the desk is mildly disappointed. Second visit recorded with honest indifference.',
    },
  },
  {
    id: 'SPX-F-14',
    kind: 'comms-event',
    title: 'One Glass Poured',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked', where: { stationId: 'station_io_merc' }, nth: 2 },
    channel: 'commsLog',
    payload: {
      from: 'Mercenary Outpost — the bar',
      text: 'Nobody asks your business a second time. One glass was poured when your clamps bit — here that is not hospitality, it is a bet on which contract kills you. Drink it anyway.',
    },
  },

  // ── Fifth docking: the port stops pretending you are traffic ──
  {
    id: 'SPX-F-15',
    kind: 'comms-event',
    title: 'The Standing Berth',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked', where: { stationId: 'station_helios' }, nth: 5 },
    channel: 'commsLog',
    payload: {
      from: 'Helios Station — berth control',
      text: 'Fifth berthing, Tessera. Your slot is now listed as standing — it empties when you leave and waits when you are gone, like a coat hook. Helios does not do this for freight.',
    },
  },
  {
    id: 'SPX-F-16',
    kind: 'comms-event',
    title: 'The Regular\'s Tab',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked', where: { stationId: 'station_drift' }, nth: 5 },
    channel: 'commsLog',
    payload: {
      from: 'Drift Market — berth master',
      text: 'Five dockings. The market now carries a tab in your name — not a debt, a standing order the stalls pretend is a debt because regulars are owed honesty and strangers are owed a price.',
    },
  },
  {
    id: 'SPX-F-17',
    kind: 'comms-event',
    title: 'The Witness Retires',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked', where: { stationId: 'station_sker' }, nth: 5 },
    channel: 'commsLog',
    payload: {
      from: 'Sker Bazaar — door account',
      text: 'Fifth entry. The witness who forgets your arrivals has been paid a retainer to keep forgetting them — your face now costs the Bazaar a salary. Nobody here will tell you what that is worth.',
    },
  },
]);
