// src/ui/screens/bar.js -- STATION "Bar" tab panel.
// Dynamic, data-driven contact system. Generates 2-4 seeded NPCs per station
// with role-specific dialog that pulls real game data (economy events, market
// intel, mission boards, sector danger, asteroid fields). Read-only except for
// the mission-accept button which emits ui:acceptMission.
import { FACTION_META } from '../../data/factions.js';
import { escapeHtml } from '../comms.js';
import { BINDINGS } from '../bindings.js';
import { SECTORS, surveyDataPrice } from '../../data/sectors.js';
import { COMMODITIES }  from '../../data/commodities.js';
import { missionPreflight } from '../missionPreflight.js';
import { missionConsequenceSummary } from '../missionPreflight.js';
import { mountContactPortrait } from '../portraitArt.js';
import { CONTACT_VOICE_REGISTERS } from '../../data/barks.js';
import { stationSloganFor } from '../../data/stationSlogans.js';
import { depthContactsForStation } from '../../story/campaign47a/embodiedDialogue.js';
import {
  FIXER_CONTACT,
  fixerMemoryFor,
  stationContactCounterValue,
  stationContactMemoryFor,
  stationContactMemoryLine,
  stationContactStanding,
} from '../../data/stationContacts.js';
import {
  WINGMAN_PILOTS,
  effectiveWingmanDailyRate,
  wingmanPilotRecordFor,
} from '../../data/wingmanPilots.js';
import { uniqueWreckBarRumor } from '../uniqueWreckRumorSurface.js';
import {
  fixerCacheOffer,
  frontierRumorOffer,
  frontierRumorOwned,
  frontierRumorPurchaseOffer,
  TETHYS_BLACK_MARKET_DISCOVERY,
} from '../../data/frontierRumors.js';
import { isChoiceECourierReady } from '../../story/endings/eligibility.js';
import {
  DOSS_ARCHIVE_CONTACT_ID,
  dossArchiveEvidence,
  dossArchiveMapOffer,
} from '../../data/dossArchive.js';
import {
  VONN_FREIGHT_CONTACT_ID,
  vonnFreightLossDisposition,
  vonnFreightLossFor,
  vonnFreightLossMapOffer,
} from '../../data/vonnFreightLoss.js';
import {
  ORRIN_WITNESS_CONTACT_ID,
  ORRIN_WITNESS_STATION_ID,
  ORRIN_WITNESS_SUBMISSION_EVENT,
} from '../../data/orrinWitnessCase.js';
import { MAP_FOCUS, openGalaxyMap } from '../mapAuthority.js';
import { sellableSmugglingDropCaches } from '../../data/smugglingStealth.js';

/* ── lookup tables ──────────────────────────────────────────────────── */

const FACTION_BY_ID   = new Map(FACTION_META.map(f => [f.id, f]));
const SECTOR_BY_ID    = new Map(SECTORS.map(s => [s.id, s]));
const COMMODITY_BY_ID = new Map(COMMODITIES.map(c => [c.id, c]));

/** Route Orrin's physical-evidence control outside generic station-contact memory. */
export function emitBarContactChoice(bus, payload = {}) {
  if (!bus || typeof bus.emit !== 'function') return null;
  const event = String(payload.contactId || '').startsWith('wingman_hire:') && payload.choiceId === 'hire'
    ? 'ui:hireWingman'
    : String(payload.contactId || '').startsWith('wingman_memorial:') && payload.choiceId === 'raise_glass'
      ? 'ui:acknowledgeWingmanDeath'
      : payload.contactId === ORRIN_WITNESS_CONTACT_ID
    && payload.stationId === ORRIN_WITNESS_STATION_ID
    && payload.choiceId === 'evidence'
        ? ORRIN_WITNESS_SUBMISSION_EVENT
        : 'ui:talkContact';
  bus.emit(event, payload);
  return event;
}

// Flatten every station into a quick-lookup map: stationId -> { station, sector }
const STATION_INDEX = new Map();
for (const sec of SECTORS) {
  for (const st of sec.stations) {
    STATION_INDEX.set(st.id, { station: st, sector: sec });
  }
}

/* ── deterministic RNG (FNV-1a hash + mulberry32 PRNG) ──────────── */

function fnvHash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function mulberry32(seed) {
  let t = (seed >>> 0) + 0x6d2b79f5;
  return function next() {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── name pools ─────────────────────────────────────────────────────── */

const FIRST_NAMES = [
  'Orion','Kael','Voss','Mira','Juno','Sable','Ren','Thane','Lyra','Dax',
  'Cira','Nev','Soren','Tova','Zara','Calder','Rhea','Vek','Inara','Koda',
  'Maeve','Cassius','Lira','Draven','Ember','Tycho','Neve','Ash','Selene','Rook',
  'Brynn','Orin','Callum','Vesper','Idris','Sully','Kira','Jace','Nova','Petra',
];

const LAST_NAMES = [
  'Vance','Corsair','Ashford','Kellan','Drakon','Revik','Solari','Morrow',
  'Quade','Theron','Aldric','Craine','Falken','Nyxos','Stroud','Varek',
  'Holden','Rennick','Deckard','Torren','Briggs','Calloway','Sagan','Tull',
  'Graves','Huxley','Kepler','Madsen','Oakes','Stark',
];

const ROLES = ['barkeep','merchant','pilot','smuggler','engineer','bounty_hunter','miner'];

const ROLE_LABELS = {
  barkeep:       'Barkeep',
  merchant:      'Merchant',
  pilot:         'Pilot',
  smuggler:      'Smuggler',
  engineer:      'Engineer',
  bounty_hunter: 'Bounty Hunter',
  miner:         'Miner',
};

const ROLE_LINES = {
  barkeep:       'Pull up a stool. What can I do for you?',
  merchant:      'Credits talk. What are you looking to move?',
  pilot:         'Just docked. Got stories, if you\'ve got time.',
  smuggler:      'Keep your voice down. You need something off-book?',
  engineer:      'Rust and rivets. Everything on this station needs work.',
  bounty_hunter: 'I hunt for a living. You look like you can handle yourself.',
  miner:         'Rock dust and patience. That\'s the miner\'s life.',
};

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
];

const CANONICAL_BY_STATION = new Map();
for (const contact of CANONICAL_CONTACTS) {
  for (const stationId of contact.stationIds) {
    CANONICAL_BY_STATION.set(stationId, contact);
  }
}

/* ── contact generation ─────────────────────────────────────────────── */

function canonicalContactForStation(stationId, state) {
  const base = CANONICAL_BY_STATION.get(stationId);
  if (!base) return null;
  const regularLine = base.key === 'voss' && stationContactCounterValue(state, 'voss.purchases') >= 3
    ? 'Voss raises a chipped cup. "You keep buying my ore, I keep the cutter warm."'
    : base.key === 'hale' && stationContactCounterValue(state, 'hale.scanBreaks') >= 2
      ? 'Hale watches your hands instead of the manifest. "Twice is a habit. Third time is a charge."'
      : base.line;
  return {
    id: 'contact_' + stationId + '_' + base.key,
    name: base.name,
    role: base.role,
    roleLabel: base.roleLabel,
    factionId: base.factionId,
    line: regularLine,
    canonicalKey: base.key,
  };
}

export function authoredBarContactsForStation(stationId, state = {}) {
  return depthContactsForStation(stationId, state).map((card) => {
    const voice = CONTACT_VOICE_REGISTERS[card.id];
    return {
      id: card.id,
      name: card.name,
      role: card.role,
      roleLabel: card.roleLabel,
      factionId: card.factionId,
      line: card.blurb,
      canonicalKey: card.id,
      trackerId: card.trackerId,
      depthProgram: card.programId,
      voiceLines: voice ? voice.lines : [],
      choices: voice && voice.firstContact ? voice.firstContact.choices : [],
      dialogueComplete: !!(voice && voice.dialogueComplete),
      oneChoicePerVisit: card.id === 'contact_question',
    };
  });
}

function fixerContactForStation(stationId, state = {}) {
  const memory = fixerMemoryFor(state);
  if (!memory.unlocked || memory.homeStationId !== stationId) return null;
  const openCount = memory.openLeadIds.length;
  const line = memory.outcomeCount > 0
    ? `${memory.outcomeCount} cache lead${memory.outcomeCount === 1 ? '' : 's'} settled. ${openCount} still open.`
    : memory.purchaseCount > 0
      ? `${memory.purchaseCount} cache lead${memory.purchaseCount === 1 ? '' : 's'} sold. ${openCount} still open.`
      : 'She marked your first paid rumor card. Now she sells the source.';
  const stashed = sellableSmugglingDropCaches(state);
  return {
    ...FIXER_CONTACT,
    line,
    choices: [
      ...(stashed.length ? [{
        id: 'sell_drop',
        label: `Sell drop coordinates (${stashed[0].commodityName}, ${stashed[0].remainingQty}u)`,
      }] : []),
      { id: 'cache', label: 'Any cache work?' },
      { id: 'history', label: 'How did the last lead settle?' },
      { id: 'bye', label: 'Not today.' },
    ],
  };
}

export function generateContacts(stationId, state = {}) {
  const seed = fnvHash('bar_contacts_' + stationId);
  const rng  = mulberry32(seed);
  const count = 2 + Math.floor(rng() * 3); // 2-4 contacts

  const info = STATION_INDEX.get(stationId);
  const stationFactionId = info ? info.station.factionId : 'faction_scn';
  const sector = info ? info.sector : SECTORS[0];
  const localSlogan = stationSloganFor(stationId);

  // Gather nearby factions for variety
  const nearbyFactions = [stationFactionId];
  for (const nId of (sector.neighbors || [])) {
    const ns = SECTOR_BY_ID.get(nId);
    if (ns && !nearbyFactions.includes(ns.factionId)) nearbyFactions.push(ns.factionId);
  }

  const contacts = [];
  const usedNames = new Set();

  for (let i = 0; i < count; i++) {
    // Pick unique name
    let first, last, fullName;
    do {
      first = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
      last  = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
      fullName = first + ' ' + last;
    } while (usedNames.has(fullName));
    usedNames.add(fullName);

    // First contact always barkeep; rest random
    const role = i === 0
      ? 'barkeep'
      : ROLES[1 + Math.floor(rng() * (ROLES.length - 1))];

    const factionId = (role === 'barkeep')
      ? stationFactionId
      : nearbyFactions[Math.floor(rng() * nearbyFactions.length)];

    contacts.push({
      id: 'contact_' + stationId + '_' + i,
      name: fullName,
      role,
      factionId,
      line: role === 'barkeep' && localSlogan
        ? `${info && info.station && info.station.name || 'Station'}: "${localSlogan}"`
        : ROLE_LINES[role],
    });
  }

  const canonical = canonicalContactForStation(stationId, state);
  if (canonical) {
    if (canonical.role === 'barkeep') {
      contacts[0] = canonical;
    } else {
      contacts.splice(1, 0, canonical);
      if (contacts.length > 4) contacts.pop();
    }
  }

  const namedPilots = WINGMAN_PILOTS
    .filter((definition) => definition.stationId === stationId)
    .flatMap((definition) => {
      const record = wingmanPilotRecordFor(state, definition.id);
      if (!record) return [];
      if (record.status === 'dead' && record.deathAcknowledgement === 'pending') {
        return [{
          id: `wingman_memorial:${definition.id}`,
          wingmanPilotId: definition.id,
          name: definition.callsign,
          role: 'wingman_memorial',
          roleLabel: 'Empty Stool',
          factionId: null,
          line: `${definition.name} did not come back from the ${String(record.deathOrder || 'last').replace(/_/g, ' ')} order. The glass is still full.`,
          choices: [{ id: 'raise_glass', label: 'Raise the glass.' }],
        }];
      }
      if (record.status === 'hired') {
        const displayName = record.title || `${definition.name} “${definition.callsign}”`;
        return [{
          id: `wingman_roster:${definition.id}`,
          wingmanPilotId: definition.id,
          name: displayName,
          role: 'wingman_roster',
          roleLabel: record.title ? 'Veteran Wingman' : 'Contract Wingman',
          factionId: 'faction_scn',
          line: `${record.sortiesSurvived} surviving sorties · loyalty ${record.loyalty} · ${effectiveWingmanDailyRate(definition, record)} cr/day. ${definition.fit.label}.`,
          choices: [{ id: 'terms', label: 'Review the contract.' }],
        }];
      }
      if (record.status !== 'available') return [];
      return [{
        id: `wingman_hire:${definition.id}`,
        wingmanPilotId: definition.id,
        name: `${definition.name} “${definition.callsign}”`,
        role: 'wingman_hire',
        roleLabel: 'Pilot for Hire',
        factionId: 'faction_scn',
        line: `${definition.fit.label}. ${definition.voice.register} comms. ${effectiveWingmanDailyRate(definition, record)} cr/day · loyalty ${record.loyalty}.`,
        choices: [
          { id: 'hire', label: `Hire for ${effectiveWingmanDailyRate(definition, record)} cr/day.` },
          { id: 'decline', label: 'Not today.' },
        ],
      }];
    });

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
  const fixerContact = fixerContactForStation(stationId, state);
  return [
    ...(fixerContact ? [fixerContact] : []),
    ...namedPilots,
    ...endingCourier,
    ...authoredBarContactsForStation(stationId, state),
    ...contacts,
  ];
}

/* ── dialog option builders (per role) ────────────────────────────── */

export function getChoices(role, contact = null) {
  if (contact && Array.isArray(contact.choices) && contact.choices.length) return contact.choices;
  switch (role) {
    case 'barkeep':       return [
      { id: 'rumors',    label: 'Any rumors?' },
      { id: 'word',      label: 'What\'s the word?' },
      { id: 'drink',     label: 'Just a drink.' },
    ];
    case 'merchant':      return [
      { id: 'routes',    label: 'Any good trade routes?' },
      { id: 'market',    label: 'Market conditions?' },
      { id: 'dismiss',   label: 'Not interested.' },
    ];
    case 'pilot':         return [
      { id: 'work',      label: 'Heard of any work?' },
      { id: 'outside',   label: 'What\'s it like out there?' },
      { id: 'bye',       label: 'Safe flying.' },
    ];
    case 'smuggler':      return [
      { id: 'black',     label: 'Know any black markets?' },
      { id: 'contraband',label: 'Got any contraband?' },
      { id: 'clean',     label: 'I\'m clean.' },
    ];
    case 'engineer':      return [
      { id: 'tech',      label: 'Any tech recommendations?' },
      { id: 'fix',       label: 'What needs fixing around here?' },
      { id: 'thanks',    label: 'Thanks.' },
    ];
    case 'bounty_hunter': return [
      { id: 'bounties',  label: 'Any bounties worth chasing?' },
      { id: 'action',    label: 'Where\'s the action?' },
      { id: 'low',       label: 'Keep your head down.' },
    ];
    case 'miner':         return [
      { id: 'fields',    label: 'Where are the rich fields?' },
      { id: 'ore_price', label: 'Ore prices looking good?' },
      { id: 'rocks',     label: 'Back to the rocks.' },
    ];
    default:              return [
      { id: 'dismiss', label: 'See you around.' },
    ];
  }
}

/* ── reply generators (pull real game state) ──────────────────────── */

// Helpers to safely dig into ctx.state
function getEconEvents(state) {
  return (state && state.economy && state.economy.econEvents) || [];
}
function getMarketIntel(state) {
  return (state && state.economy && state.economy.marketIntel) || {};
}
function getMissionBoard(state, stationId) {
  if (!state || !state.missions || !state.missions.boards) return null;
  return state.missions.boards[stationId] || null;
}

function rewardCredits(mission) {
  const raw = mission && (mission.reward != null
    ? mission.reward
    : (mission.rewardCr != null ? mission.rewardCr : mission.reward_cr));
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function rewardCreditsText(mission) {
  return rewardCredits(mission).toLocaleString('en-US');
}

function prettyType(t) {
  if (!t) return 'Contract';
  return String(t).split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function missionOfferTitle(offer) {
  return (offer && (offer.title || prettyType(offer.type))) || 'Contract';
}

function missionOfferTrackCopy(offer) {
  const type = offer && offer.type;
  if (type === 'cargo_delivery' || type === 'bulk_trade' || type === 'smuggling_run') {
    return 'Accept + Track puts the route in your Mission Log and keeps cargo readiness visible.';
  }
  if (type === 'bounty_hunt' || type === 'patrol_clear' || type === 'escort') {
    return 'Accept + Track puts the target in your Mission Log and sets nav when the lead is known.';
  }
  return 'Accept + Track adds it to the Mission Log and sets nav guidance when a destination exists.';
}

function missionOfferAvailable(ctx, missionId) {
  const boards = ctx && ctx.state && ctx.state.missions && ctx.state.missions.boards;
  if (!missionId || !boards) return false;
  for (const board of Object.values(boards)) {
    const slots = board && board.slots;
    if (Array.isArray(slots) && slots.some((offer) => offer && offer.id === missionId)) return true;
  }
  return false;
}

function missionLogLabel() {
  return 'Mission Log (' + BINDINGS.missionLog.label + ')';
}

function getScreenManager(ctx) {
  if (ctx && ctx.screenManager) return ctx.screenManager;
  if (ctx && ctx.screens && ctx.screens.pushScreen) return ctx.screens;
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  if (ui && ui.screenManager) return ui.screenManager;
  if (ui && ui.manager) return ui.manager;
  return null;
}

function openMissionLog(ctx) {
  const mgr = getScreenManager(ctx);
  if (mgr && typeof mgr.pushScreen === 'function') {
    mgr.pushScreen('missionLog');
    return true;
  }
  if (ctx && ctx.bus && typeof ctx.bus.emit === 'function') {
    ctx.bus.emit('ui:pushScreen', { id: 'missionLog' });
    return true;
  }
  return false;
}

function commodityName(id) {
  const c = COMMODITY_BY_ID.get(id);
  return c ? c.name : id;
}
function stationName(id) {
  const info = STATION_INDEX.get(id);
  return info ? info.station.name : id;
}
function sectorForStation(id) {
  const info = STATION_INDEX.get(id);
  return info ? info.sector : null;
}

function stationFor(stationId) {
  const info = STATION_INDEX.get(stationId);
  return info ? info.station : null;
}

/** Find the sector this stationId belongs to */
function currentSector(stationId) {
  const info = STATION_INDEX.get(stationId);
  return info ? info.sector : SECTORS[0];
}

function sectorDiscovered(state, sectorId) {
  const disc = state && state.world && state.world.discovery && state.world.discovery[sectorId];
  return !!(disc && disc.discovered);
}

export function availableSurveyOffer(state, stationId) {
  const sec = currentSector(stationId);
  const candidates = [];
  for (const nId of (sec.neighbors || [])) {
    const ns = SECTOR_BY_ID.get(nId);
    if (!ns || ns.charted !== false) continue;
    if (sectorDiscovered(state, ns.id)) continue;
    candidates.push(ns);
  }
  candidates.sort((a, b) => (a.tier - b.tier) || a.name.localeCompare(b.name));
  const sector = candidates[0];
  return sector ? {
    sectorId: sector.id,
    sectorName: sector.name,
    price: surveyDataPrice(sector),
    tier: sector.tier,
  } : null;
}

export function surveyOfferLabel(offer) {
  return 'Survey Data: ' + (offer && offer.sectorName || 'Unknown Sector');
}

/** Find a dangerous neighbor sector */
function dangerousSector(stationId) {
  const sec = currentSector(stationId);
  let worst = null;
  for (const nId of (sec.neighbors || [])) {
    const ns = SECTOR_BY_ID.get(nId);
    if (ns && (!worst || ns.security < worst.security)) worst = ns;
  }
  return worst;
}

/** Find blackmarket stations across all sectors */
function findBlackmarkets() {
  const results = [];
  for (const sec of SECTORS) {
    for (const st of sec.stations) {
      if (st.type === 'blackmarket') results.push({ station: st, sector: sec });
    }
  }
  return results;
}

/** Find sectors with asteroid fields */
function findMiningFields() {
  const results = [];
  for (const sec of SECTORS) {
    if (sec.fields && sec.fields.length > 0) {
      results.push({ sector: sec, fields: sec.fields });
    }
  }
  return results;
}

/** Ore type human names */
function fieldTypeName(type) {
  const MAP = {
    ast_metallic:     'metallic',
    ast_common_rock:  'common rock',
    ast_icy:          'ice',
    ast_crystalline:  'crystalline',
    ast_rare_exotic:  'rare exotic',
    ast_gas_cloud:    'gas cloud',
  };
  return MAP[type] || type;
}

export function missionBoardSlots(state, stationId) {
  const board = getMissionBoard(state, stationId);
  return board && Array.isArray(board.slots) ? board.slots.filter(Boolean) : [];
}

function tethysBlackMarketContact(state, stationId) {
  const discovery = TETHYS_BLACK_MARKET_DISCOVERY;
  if (stationId !== discovery.stationId) return null;
  const record = state && state.world && state.world.frontierRumors && state.world.frontierRumors.byId
    && state.world.frontierRumors.byId[discovery.rumorId];
  return record && record.phase === 'contacted' ? record : null;
}

function tethysCapsuleRunOffer(state, stationId) {
  return missionBoardSlots(state, stationId).find((offer) => offer && offer.type === 'heist_intercept') || null;
}

function localEconEvent(state, stationId) {
  const events = getEconEvents(state);
  return events.find((ev) => ev && ev.stationId === stationId) || events[0] || null;
}

function securityLabel(sec) {
  if (!sec) return 'unknown lane';
  if (sec.security >= 0.72) return 'secure lane';
  if (sec.security >= 0.45) return 'watchful lane';
  if (sec.security >= 0.18) return 'rough lane';
  return 'lawless lane';
}

function combatSlots(slots) {
  return slots.filter((m) => m && (m.type === 'bounty_hunt' || m.type === 'patrol_clear' || m.type === 'escort'));
}

function blackmarketLead(stationId) {
  const here = currentSector(stationId);
  const markets = findBlackmarkets();
  return markets.find((m) => m.sector.id === here.id)
    || markets.find((m) => (here.neighbors || []).includes(m.sector.id))
    || markets[0]
    || null;
}

function miningLead(stationId) {
  const here = currentSector(stationId);
  const fields = findMiningFields();
  return fields.find((m) => m.sector.id === here.id)
    || fields.find((m) => (here.neighbors || []).includes(m.sector.id))
    || fields.find((m) => m.fields.some((f) => f.type === 'ast_rare_exotic' || f.type === 'ast_crystalline'))
    || fields[0]
    || null;
}

function serviceSummary(stationId) {
  const st = stationFor(stationId);
  const services = st && Array.isArray(st.services) ? st.services : [];
  if (!services.length) return 'field repairs only';
  const names = [];
  if (services.includes('shipyard')) names.push('shipyard');
  if (services.includes('module_craft') || services.includes('refine')) names.push('fabrication');
  if (services.includes('repair')) names.push('repair');
  if (services.includes('refuel')) names.push('fuel');
  if (services.includes('trade') || services.includes('black_market')) names.push('market');
  return names.slice(0, 3).join(' / ') || services.slice(0, 3).join(' / ');
}

export function barContactIntelTags(contact = {}, state = {}, stationId = '') {
  const role = contact.role || 'barkeep';
  const sec = currentSector(stationId);
  const slots = missionBoardSlots(state, stationId);
  const tags = [];
  const add = (label, text, kind = 'info') => {
    if (!text) return;
    tags.push({ label, text, kind });
  };

  const memory = stationContactMemoryFor(state, contact.id);
  if (memory && memory.met) add('Contact', stationContactStanding(memory), 'story');
  else if (contact.canonicalKey) add('Contact', 'New recurring contact', 'story');

  if (role === 'fixer') {
    const fixer = fixerMemoryFor(state);
    add('Open Leads', String(fixer.openLeadIds.length), fixer.openLeadIds.length ? 'warn' : 'ok');
    add('Settled', String(fixer.outcomeCount), fixer.outcomeCount ? 'story' : 'info');
  } else if (role === 'merchant') {
    const route = bestTradeRoute(state, stationId);
    if (route) add('Route', commodityName(route.cmdtyId) + ' -> ' + stationName(route.sellStationId) + ' +' + Math.round(route.spread) + '/u', 'ok');
    const ev = localEconEvent(state, stationId);
    if (ev) add('Market', commodityName(ev.commodityId) + ' ' + String(ev.type || 'event'), 'warn');
  } else if (role === 'pilot') {
    add('Board', slots.length ? slots.length + ' live contract' + (slots.length === 1 ? '' : 's') : 'board quiet', slots.length ? 'ok' : 'warn');
    const danger = dangerousSector(stationId);
    if (danger) add('Outside', danger.name + ' ' + securityLabel(danger), danger.security < 0.35 ? 'bad' : 'warn');
  } else if (role === 'smuggler') {
    const market = blackmarketLead(stationId);
    if (market) add('Black Market', market.station.name + ' / ' + market.sector.name, market.sector.security < 0.2 ? 'bad' : 'warn');
    add('Scan Risk', sec.security >= 0.6 ? 'high security customs' : 'patrol gaps', sec.security >= 0.6 ? 'bad' : 'ok');
  } else if (role === 'engineer') {
    add('Station', serviceSummary(stationId), 'ok');
    add('Hull Note', sec.hazards && sec.hazards.length ? 'hazards tax armor' : 'routine wear', sec.hazards && sec.hazards.length ? 'warn' : 'info');
  } else if (role === 'bounty_hunter') {
    const combat = combatSlots(slots);
    add('Targets', combat.length ? combat.length + ' combat posting' + (combat.length === 1 ? '' : 's') : 'no clean tags', combat.length ? 'ok' : 'warn');
    const danger = dangerousSector(stationId);
    if (danger) add('Heat', danger.name + ' density ' + Math.round((danger.enemyDensity || 0) * 100) + '%', (danger.enemyDensity || 0) > 0.45 ? 'bad' : 'warn');
  } else if (role === 'miner') {
    const field = miningLead(stationId);
    if (field && field.fields.length) add('Field', field.sector.name + ' / ' + fieldTypeName(field.fields[0].type), field.sector.security < 0.4 ? 'warn' : 'ok');
    const services = serviceSummary(stationId);
    add('Buyer', services.includes('market') ? 'sell ore here' : 'find ore buyer', services.includes('market') ? 'ok' : 'warn');
  } else {
    const ev = localEconEvent(state, stationId);
    if (ev) add('Rumor', commodityName(ev.commodityId) + ' ' + String(ev.type || 'event'), 'warn');
    else add('Lane', sec.name + ' / ' + securityLabel(sec), sec.security < 0.35 ? 'bad' : 'info');
  }

  if (role === 'barkeep') {
    const localSlogan = stationSloganFor(stationId);
    if (localSlogan) add('Hull', localSlogan, 'story');
    const survey = availableSurveyOffer(state, stationId);
    if (survey) add('Survey', survey.sectorName + ' ' + survey.price.toLocaleString('en-US') + ' cr', 'warn');
  }

  if (!tags.length) add('Local', sec.name + ' / ' + securityLabel(sec), 'info');
  return tags.slice(0, 2);
}

/** Find best trade spread from marketIntel */
function bestTradeRoute(state, currentStationId) {
  const intel = getMarketIntel(state);
  const stations = Object.keys(intel);
  if (stations.length < 2) return null;

  let best = null;
  const here = intel[currentStationId];
  if (!here || !here.snapshot) return null;

  for (const otherId of stations) {
    if (otherId === currentStationId) continue;
    const other = intel[otherId];
    if (!other || !other.snapshot) continue;

    for (const cmdtyId of Object.keys(here.snapshot)) {
      const buyInfo  = here.snapshot[cmdtyId];
      const sellInfo = other.snapshot[cmdtyId];
      if (!buyInfo || !sellInfo) continue;
      const buyPrice  = buyInfo.buy  || buyInfo.mid || 0;
      const sellPrice = sellInfo.sell || sellInfo.mid || 0;
      const spread = sellPrice - buyPrice;
      if (spread > 0 && (!best || spread > best.spread)) {
        best = { cmdtyId, buyStationId: currentStationId, sellStationId: otherId, spread, buyPrice, sellPrice };
      }
    }
  }
  return best;
}

/**
 * Build a reply for the given role + choiceId, pulling from ctx.state.
 * Returns { text, missionOffer? }.
 */
export function buildReply(role, choiceId, ctx, stationId, contact = null) {
  if (contact && contact.wingmanPilotId) {
    const definition = WINGMAN_PILOTS.find((pilot) => pilot.id === contact.wingmanPilotId);
    const record = wingmanPilotRecordFor(ctx && ctx.state, contact.wingmanPilotId);
    if (role === 'wingman_hire') {
      if (choiceId !== 'hire') return { text: `${definition && definition.callsign || 'The pilot'} leaves the berth open.` };
      return record && record.status === 'hired'
        ? { text: `${definition.callsign}: ${definition.voice.hire} Current loyalty ${record.loyalty}; ${effectiveWingmanDailyRate(definition, record)} cr/day.` }
        : { text: 'No wing berth is available. The pilot keeps the contract.' };
    }
    if (role === 'wingman_memorial') {
      return record && record.deathAcknowledgement === 'heard'
        ? { text: `The bar speaks ${definition && definition.name || 'the pilot'}'s name once. The stool is cleared.` }
        : { text: 'The untouched glass stays on the bar.' };
    }
    if (role === 'wingman_roster') {
      return record && record.status === 'hired'
        ? { text: `${record.title || definition.callsign}: ${record.sortiesSurvived} returns, loyalty ${record.loyalty}, ${effectiveWingmanDailyRate(definition, record)} cr/day.` }
        : { text: 'The contract is no longer active.' };
    }
  }
  if (contact && contact.endgameChoice === 'E') {
    if (choiceId === 'accept_next_run') {
      if (!isChoiceECourierReady(ctx && ctx.state, stationId)) {
        return { text: 'That settlement is already filed.', endgameResolved: true };
      }
      ctx.bus.emit('ui:endgameChoose', { choice: 'E', confirm: true, source: 'ashcache_courier' });
      return {
        text: '47-A closed. 47-B pending. The next manifest is already on the desk.',
        endgameResolved: true,
      };
    }
    return { text: "It stays open. The courier doesn't repeat the offer." };
  }
  const state = ctx.state || {};
  if (contact && contact.id === FIXER_CONTACT.id) {
    const memory = fixerMemoryFor(state);
    if (choiceId === 'sell_drop') {
      const world = ctx.registry?.get?.('world') || ctx.world || null;
      const offer = world && typeof world.dropCacheSaleOffers === 'function'
        ? world.dropCacheSaleOffers(stationId)[0]
        : null;
      const sale = offer && typeof world.sellDropCacheLocation === 'function'
        ? world.sellDropCacheLocation(offer.cacheId, stationId)
        : null;
      return sale && sale.ok
        ? { text: `${sale.payoutCr} credits. I bought the rock, not your history. Coordinates settle once.`, dropCacheSale: sale }
        : { text: 'No live drop is yours to sell from this berth.' };
    }
    if (choiceId === 'cache') {
      const offer = fixerCacheOffer(state, stationId);
      return offer
        ? {
            text: `A sealed discrepancy points to ${offer.sectorName}. I sell the ring; you find the cache.`,
            frontierRumorOffer: offer,
          }
        : { text: 'No clean cache source today. I do not sell repeats.' };
    }
    if (choiceId === 'history') {
      if (memory.outcomeCount > 0) {
        const reason = String(memory.lastOutcomeReason || 'confirmed').replace(/_/g, ' ');
        return {
          text: `${memory.outcomeCount} settled. ${memory.openLeadIds.length} still open. Last card ended ${reason}.`,
        };
      }
      if (memory.purchaseCount > 0) {
        return { text: `${memory.openLeadIds.length} sold lead${memory.openLeadIds.length === 1 ? '' : 's'} still open. Bring back a result.` };
      }
      return { text: 'You bought the introduction, not a result.' };
    }
    return { text: 'Nera folds the amber card back into her coat.' };
  }
  if (contact && contact.id === DOSS_ARCHIVE_CONTACT_ID) return buildDossArchiveReply(choiceId, state);
  if (contact && contact.id === VONN_FREIGHT_CONTACT_ID && choiceId === 'wrecks') {
    const reply = buildVonnFreightLossReply(state);
    if (reply) return reply;
  }
  if (contact && contact.depthProgram) return buildDepthContactReply(contact, choiceId, ctx);
  // At Sker the canonical barkeep is also the authored Nestbreaker source. Let an unseen physical
  // wreck lead answer the explicit Rumors choice first; once its bearing exists this fails closed
  // and the contact's normal canonical dialogue resumes.
  const wreckRumor = role === 'barkeep'
    ? uniqueWreckBarRumor(state, stationId, choiceId)
    : null;
  if (wreckRumor) return { text: wreckRumor.text, uniqueWreckRumor: wreckRumor };

  const canonical = contact && contact.canonicalKey
    ? buildCanonicalReply(contact, choiceId, ctx, stationId)
    : null;
  if (canonical) return canonical;

  switch (role) {
    /* ── BARKEEP ───────────────────────────────────────── */
    case 'barkeep': {
      if (choiceId === 'rumors') {
        const quietContact = tethysBlackMarketContact(state, stationId);
        if (quietContact) {
          const capsuleRun = tethysCapsuleRunOffer(state, stationId);
          if (capsuleRun) {
            return {
              text: 'Your Quiet contact confirms the Capsule Run is real: intercept a lawful cargo capsule and carry it to their fence. Law response, confiscation, heat, or a lost capsule can leave you with no payout. The contact does not make it safe.',
              missionOffer: capsuleRun,
            };
          }
          return {
            text: 'Your Quiet contact is remembered, but no Capsule Run packet is live on the Tethys board. There is no off-book promise to accept today.',
          };
        }
        const rumor = frontierRumorOffer(state, stationId);
        if (rumor) {
          return {
            text: rumor.text,
            frontierRumorOffer: rumor,
          };
        }
        const survey = availableSurveyOffer(state, stationId);
        if (survey) {
          return {
            text: 'A courier dropped partial nav data for ' + survey.sectorName + '. It is not free, but it will put the sector on your nav chart.',
            surveyOffer: survey,
          };
        }
        const events = getEconEvents(state);
        if (events.length > 0) {
          const ev = events[0];
          const cName = commodityName(ev.commodityId);
          const sName = stationName(ev.stationId);
          const dir = (ev.type === 'surplus' || ev.type === 'glut') ? 'down' : 'up';
          return { text: 'Word is there\'s a ' + ev.type + ' affecting ' + cName + ' at ' + sName + '. Prices are ' + dir + '.' };
        }
        return { text: 'Things have been quiet lately. Too quiet, if you ask me. Keep your eyes open out there.' };
      }
      if (choiceId === 'word') {
        const localSlogan = stationSloganFor(stationId);
        if (localSlogan) {
          return { text: 'Paint on the pressure door says: "' + localSlogan + '" Around here, that counts as the welcome speech.' };
        }
        const survey = availableSurveyOffer(state, stationId);
        if (survey) {
          return {
            text: survey.sectorName + ' is still off the public grid. Buy the survey packet and your nav chart will have enough of a fix to plot it.',
            surveyOffer: survey,
          };
        }
        const danger = dangerousSector(stationId);
        if (danger) {
          return { text: 'Watch the lanes near ' + danger.name + ' — security is thin out there. Patrols don\'t reach that far.' };
        }
        return { text: 'The usual. Ships come, ships go. Nobody says much around here.' };
      }
      const localSlogan = stationSloganFor(stationId);
      return localSlogan
        ? { text: 'Coming right up. The old hull stencil still reads: "' + localSlogan + '"' }
        : { text: 'Coming right up. Best synthale this side of the belt.' };
    }

    /* ── MERCHANT ──────────────────────────────────────── */
    case 'merchant': {
      if (choiceId === 'routes') {
        const route = bestTradeRoute(state, stationId);
        if (route) {
          return { text: 'Buy ' + commodityName(route.cmdtyId) + ' here, sell at ' + stationName(route.sellStationId) + ' — good margin right now. About ' + route.spread + ' credits per unit.' };
        }
        return { text: 'Markets are tight everywhere. Nothing jumps out right now. Check back after a supply event shakes things up.' };
      }
      if (choiceId === 'market') {
        const events = getEconEvents(state);
        const local = events.filter(e => e.stationId === stationId);
        if (local.length > 0) {
          const ev = local[0];
          const cName = commodityName(ev.commodityId);
          const dir = (ev.type === 'surplus' || ev.type === 'glut') ? 'dropping' : 'climbing';
          return { text: cName + ' prices are ' + dir + ' here thanks to a local ' + ev.type + '. Plan accordingly.' };
        }
        return { text: 'Steady as she goes. No big swings at this station — supply and demand in balance for now.' };
      }
      return { text: 'Your loss. Credits don\'t earn themselves.' };
    }

    /* ── PILOT ─────────────────────────────────────────── */
    case 'pilot': {
      if (choiceId === 'work') {
        const board = getMissionBoard(state, stationId);
        if (board && board.slots && board.slots.length > 0) {
          const offer = board.slots[0];
          const reward = rewardCreditsText(offer);
          return {
            text: 'There\'s a ' + missionOfferTitle(offer) + ' contract on the board - pays ' + reward + ' cr. ' + missionOfferTrackCopy(offer),
            missionOffer: offer,
          };
        }
        return { text: 'Board\'s empty right now. Try a bigger station or come back later — jobs cycle regularly.' };
      }
      if (choiceId === 'outside') {
        const danger = dangerousSector(stationId);
        if (danger) {
          const sec = danger.security < 0.3 ? 'lawless' : danger.security < 0.5 ? 'rough' : 'uneasy';
          return { text: danger.name + ' is ' + sec + ' space. Hostiles patrol the lanes — don\'t fly without shields charged.' };
        }
        return { text: 'It\'s calm in the core sectors, but further out the patrols thin and the pirates thicken.' };
      }
      return { text: 'Clear skies, friend. Watch your six.' };
    }

    /* ── SMUGGLER ──────────────────────────────────────── */
    case 'smuggler': {
      if (choiceId === 'black') {
        const bms = findBlackmarkets();
        if (bms.length > 0) {
          const pick = bms[0];
          return { text: pick.station.name + ' in ' + pick.sector.name + ' — they\'ll move anything, no questions asked. Don\'t mention my name.' };
        }
        return { text: 'Nothing running right now. The Concord has been cracking down. Check back when things cool off.' };
      }
      if (choiceId === 'contraband') {
        const bms = findBlackmarkets();
        if (bms.length > 0) {
          return { text: 'Narcotics, weapons, stolen goods — it all flows through the black markets. ' + bms[0].station.name + ' is your best bet. Margins are fat if you dodge the scans.' };
        }
        return { text: 'Supply lines are dry. Nobody\'s moving product with patrols this heavy.' };
      }
      return { text: 'Smart. Stay clean, stay alive. Mostly.' };
    }

    /* ── ENGINEER ──────────────────────────────────────── */
    case 'engineer': {
      if (choiceId === 'tech') {
        const sec = currentSector(stationId);
        if (sec.security < 0.5) {
          return { text: 'Out here? Shield boosters and hull reinforcement. You\'ll take hits — make sure you can soak them. A good reactor helps everything run smoother too.' };
        }
        return { text: 'Cargo expanders if you\'re trading, mining lasers if you\'re cracking rock. Match the module to the mission. Don\'t waste slots on weapons in safe space.' };
      }
      if (choiceId === 'fix') {
        const info = STATION_INDEX.get(stationId);
        const stType = info ? info.station.type : 'station';
        const typeDesc = {
          trade_hub:   'Half the docking clamps need recalibration. Trade hubs run hard.',
          refinery:    'The smelters overheat constantly. Refinery work never ends.',
          mining:      'Drill rigs break down weekly out here. We patch what we can.',
          fab:         'Fabrication arms drift out of alignment. Precision work, endless maintenance.',
          military:    'Everything runs tight on a military station. Can\'t afford failures.',
          blackmarket: 'Nothing works right because nothing was installed right. That\'s the price of off-grid.',
          research:    'Sensor arrays need constant tuning. Research gear is delicate stuff.',
        };
        return { text: typeDesc[stType] || 'Everything. If it has bolts, it needs tightening.' };
      }
      return { text: 'Anytime. Keep your ship in one piece out there.' };
    }

    /* ── BOUNTY HUNTER ────────────────────────────────── */
    case 'bounty_hunter': {
      if (choiceId === 'bounties') {
        const board = getMissionBoard(state, stationId);
        if (board && board.slots) {
          const bounty = board.slots.find(m => m.type === 'bounty_hunt' || m.type === 'patrol_clear');
          if (bounty) {
            const reward = rewardCreditsText(bounty);
            return {
              text: 'Got one - "' + missionOfferTitle(bounty) + '." Pays ' + reward + ' cr. Dangerous work, but Accept + Track will keep the target in your Mission Log.',
              missionOffer: bounty,
            };
          }
        }
        return { text: 'Board\'s dry for combat work. Try the frontier stations — more trouble out there means more bounties.' };
      }
      if (choiceId === 'action') {
        const sec = currentSector(stationId);
        let worst = null;
        for (const nId of (sec.neighbors || [])) {
          const ns = SECTOR_BY_ID.get(nId);
          if (ns && (!worst || ns.enemyDensity > worst.enemyDensity)) worst = ns;
        }
        if (worst && worst.enemyDensity > 0.3) {
          return { text: worst.name + ' is crawling with hostiles. Enemy density is high — good hunting if you can handle it.' };
        }
        return { text: 'Core sectors are too safe for real action. Push out toward the rim if you want a fight.' };
      }
      return { text: 'I never do. That\'s bad for business.' };
    }

    /* ── MINER ─────────────────────────────────────────── */
    case 'miner': {
      if (choiceId === 'fields') {
        const miningData = findMiningFields();
        // Prefer sectors with rare/exotic or crystalline fields
        const exotic = miningData.find(m => m.fields.some(f => f.type === 'ast_rare_exotic'));
        const crystal = miningData.find(m => m.fields.some(f => f.type === 'ast_crystalline'));
        const pick = exotic || crystal || (miningData.length > 0 ? miningData[0] : null);
        if (pick) {
          const fieldType = pick.fields[0].type;
          return { text: 'The ' + pick.sector.name + ' has good ' + fieldTypeName(fieldType) + ' deposits. Watch for rocks and raiders — the good fields attract both.' };
        }
        return { text: 'Slim pickings around here. You\'d have to range further out for decent ore.' };
      }
      if (choiceId === 'ore_price') {
        const intel = getMarketIntel(state);
        // Check if any station is buying ore well
        const oreIds = COMMODITIES.filter(c => c.category === 'raw ore').map(c => c.id);
        let bestOre = null;
        for (const sid of Object.keys(intel)) {
          const snap = intel[sid] && intel[sid].snapshot;
          if (!snap) continue;
          for (const oid of oreIds) {
            if (!snap[oid]) continue;
            const price = snap[oid].sell || snap[oid].mid || 0;
            const base  = (COMMODITY_BY_ID.get(oid) || {}).basePrice || 1;
            if (!bestOre || price / base > bestOre.ratio) {
              bestOre = { oreId: oid, stationId: sid, price, ratio: price / base };
            }
          }
        }
        if (bestOre) {
          return { text: commodityName(bestOre.oreId) + ' is fetching good prices at ' + stationName(bestOre.stationId) + ' — ' + Math.round(bestOre.price) + ' cr per unit. Worth the haul.' };
        }
        return { text: 'Ore prices are flat right now. Refineries aren\'t paying premium for anything. Just steady work.' };
      }
      return { text: 'Always. The belt doesn\'t mine itself.' };
    }

    default:
      return { text: 'Suit yourself.' };
  }
}

function dossSourceList(state) {
  return dossArchiveEvidence(state).map((entry) => entry.copy);
}

function dossRecordCopy(state) {
  const sources = dossSourceList(state);
  if (!sources.length) return 'No verified primary source is in the archive yet.';
  return `${sources.length} verified primary ${sources.length === 1 ? 'source' : 'sources'}: ${sources.join(' ')}`;
}

function buildDossArchiveReply(choiceId, state) {
  const sources = dossSourceList(state);
  const count = sources.length;
  if (choiceId === 'document') {
    if (!count) return { text: 'I cannot file a memory as a source. Bring a completed primary record, then I can cite it.' };
    return { text: `Filed without alteration. ${dossRecordCopy(state)}` };
  }
  if (choiceId === 'changes') {
    if (!count) return { text: 'Nothing in my copy has changed. The archive waits for a primary record, not a rumor.' };
    return { text: `The record changes only where a durable source says it does. ${dossRecordCopy(state)}` };
  }
  if (choiceId === 'reward') {
    const mapOffer = dossArchiveMapOffer(state);
    if (!mapOffer) {
      return {
        text: `There is no credit allotment or mission attached. The Candle Fleet cross-reference opens after all three sources are verified. ${dossRecordCopy(state)}`,
      };
    }
    return {
      text: `There is no credit allotment or mission attached. All three sources are filed; the Candle Fleet is the archive's next public cross-reference. ${dossRecordCopy(state)}`,
      dossArchiveMapOffer: mapOffer,
    };
  }
  return { text: 'Primary sources, please. I will not turn a rumor into a record.' };
}

/** Optional, map-only Doss archive handoff. Revalidates current durable sources at click time. */
export function openDossArchiveMap(ctx) {
  const offer = dossArchiveMapOffer(ctx && ctx.state);
  if (!offer) return false;
  return openGalaxyMap(ctx, {
    focus: MAP_FOCUS.SYSTEM,
    sectorId: offer.sectorId,
    pos: offer.pos,
    label: offer.label,
    source: 'station-bar:doss-archive',
  });
}

function buildVonnFreightLossReply(state) {
  const caseFile = vonnFreightLossFor(state);
  if (!caseFile) return null;
  const custody = vonnFreightLossDisposition(caseFile);
  if (caseFile.wreckStatus === 'completed') {
    return {
      text: `The Sker-Run freight loss is closed. ${custody} The wreck record is gone, so I will not point you at a ghost.`,
    };
  }
  const mapOffer = vonnFreightLossMapOffer(state);
  if (!mapOffer) {
    return {
      text: `I can corroborate the Sker-Run freight loss, but not a live wreck marker. ${custody}`,
    };
  }
  return {
    text: `The Sker-Run freight wreck is still where the aftermath record says it is. ${custody} I can show you the marker; it opens the map only and does not set a course.`,
    vonnFreightLossMapOffer: mapOffer,
  };
}

/** Optional, map-only Vonn handoff. The click rechecks the actual durable aftermath marker. */
export function openVonnFreightLossMap(ctx) {
  const offer = vonnFreightLossMapOffer(ctx && ctx.state);
  if (!offer) return false;
  return openGalaxyMap(ctx, {
    focus: MAP_FOCUS.SYSTEM,
    sectorId: offer.sectorId,
    pos: offer.pos,
    label: offer.label,
    source: 'station-bar:vonn-freight-loss',
  });
}

function buildDepthContactReply(contact, choiceId, ctx) {
  const choice = (contact.choices || []).find((entry) => entry.id === choiceId);
  if (!choice) return { text: contact.line || 'No answer.' };
  const indexes = Array.isArray(choice.lineIndexes) && choice.lineIndexes.length
    ? choice.lineIndexes
    : [choice.lineIndex];
  const memory = stationContactMemoryFor(ctx.state || {}, contact.id);
  const visit = Math.max(0, (memory && memory.talkCount || 1) - 1);
  const index = indexes[visit % indexes.length];
  return { text: contact.voiceLines[index] || contact.line || 'No answer.' };
}

function buildCanonicalReply(contact, choiceId, ctx, stationId) {
  const state = ctx.state || {};

  switch (contact.canonicalKey) {
    case 'kessler':
      if (choiceId === 'routes') {
        const route = bestTradeRoute(state, stationId);
        if (route) {
          return { text: 'Take ' + commodityName(route.cmdtyId) + ' to ' + stationName(route.sellStationId) + '. Keep the seal intact, let the spread explain itself, and do not ask why the weight changed.' };
        }
        return { text: 'No clean spread today. Contract 47-A is still the only line worth watching, and it is still pending.' };
      }
      if (choiceId === 'market') {
        return { text: 'The board says balanced. My ledger says the same manifest weighs less after every handoff. Both records are official if the right clerk initials them.' };
      }
      if (choiceId === 'dismiss') return { text: 'Then do not sign the seal. Pilots always sign the seal.' };
      return null;

    case 'rook':
      if (choiceId === 'bounties') {
        const board = getMissionBoard(state, stationId);
        const bounty = board && board.slots
          ? board.slots.find(m => m.type === 'bounty_hunt' || m.type === 'patrol_clear')
          : null;
        if (bounty) {
          const reward = rewardCreditsText(bounty);
          return {
            text: 'Target is already posted: "' + missionOfferTitle(bounty) + '." Pays ' + reward + ' cr. The tag is clean enough for accounting; Accept + Track if your ship is ready.',
            missionOffer: bounty,
          };
        }
        return { text: 'No open tag I like. That means the trouble has not been entered yet, not that it is gone.' };
      }
      if (choiceId === 'action') return { text: 'Follow the invoice trail. The fight is usually one jump behind the person who paid twice.' };
      if (choiceId === 'low') return { text: 'I never do. Low heads miss the posted names.' };
      return null;

    case 'voss':
      if (choiceId === 'fields') {
        const miningData = findMiningFields();
        const pick = miningData.find(m => m.sector.id === 'sector_charon_expanse') || miningData[0];
        if (pick) return { text: pick.sector.name + ' has the rich rock. File late and the claim will be exhausted before your cutter cools.' };
        return { text: 'No fields worth filing. Funny how a claim can be empty before anyone works it.' };
      }
      if (choiceId === 'ore_price') return { text: 'Ore is the decoy. The claim is the money. Watch who files the exhaustion notice.' };
      if (choiceId === 'rocks') return { text: 'The rock remembers who filed first. The board only remembers who filed last.' };
      return null;

    case 'hale':
      if (choiceId === 'work') return { text: 'There is always inspection work. Hold position, show the manifest, pay the second fine if the first one was inconvenient.' };
      if (choiceId === 'outside') {
        const danger = dangerousSector(stationId);
        const name = danger ? danger.name : 'the outer lanes';
        return { text: name + ' is not lawless. It is documented poorly, which is worse.' };
      }
      if (choiceId === 'bye') return { text: 'Scan complete. No flags. That is not the same as cleared.' };
      return null;

    case 'mira':
      if (choiceId === 'routes') {
        const route = bestTradeRoute(state, stationId);
        if (route) return { text: 'Route is clear to ' + stationName(route.sellStationId) + '. Payment on delivery. The seal code should look familiar by then.' };
        return { text: 'No route I would put my name on. Plenty I would put someone else on.' };
      }
      if (choiceId === 'market') return { text: 'Cargo insurance wants verified seals. Verification writes to the same database freight uses, so the seal becomes true when it arrives.' };
      if (choiceId === 'dismiss') return { text: 'The seal was never yours. That is why it can protect you.' };
      return null;

    case 'slate':
      if (choiceId === 'tech') return { text: 'Pulse Laser S keeps arguments short. Good shields keep repairs profitable. A bad weld keeps everybody employed.' };
      if (choiceId === 'fix') return { text: 'Berth four needs a clean seam and will get a fast one. This will hold till the next gate.' };
      if (choiceId === 'thanks') return { text: 'Do not thank the weld. Inspect it.' };
      return null;

    case 'drift':
      if (choiceId === 'routes') {
        const route = bestTradeRoute(state, stationId);
        if (route) return { text: commodityName(route.cmdtyId) + ' moves well to ' + stationName(route.sellStationId) + '. Quota met, credit transferred, loss rounded down.' };
        return { text: 'No margin today. Wait for the ledger to need a different answer.' };
      }
      if (choiceId === 'market') return { text: 'The exchange does not audit small losses. Enough small losses and a whole planet starts buying air.' };
      if (choiceId === 'dismiss') return { text: 'The vein pays the hand that weighs it.' };
      return null;

    case 'quinn':
      if (choiceId === 'rumors') return { text: 'Quinn\'s Place is under new management. Same rates. Funny how often new management knows where the old drawer is.' };
      if (choiceId === 'word') return { text: 'Count the stack once under bar light, once under UV. If the totals match, somebody else already paid.' };
      if (choiceId === 'drink') return { text: 'Rate is posted. No questions. The count ends when the drawer closes.' };
      return null;

    default:
      return null;
  }
}

/* ── main panel export ──────────────────────────────────────────────── */

export function createBarPanel(ctx) {
  const root = document.createElement('div');
  root.className = 'st-panel st-bar';
  root.innerHTML = '<div class="st-sub-h">The Bar</div><div class="st-bar-list"></div>';
  const list = root.querySelector('.st-bar-list');
  let currentStationId = null;
  let currentContacts  = [];

  /* ── click handler (dialog choices + mission accept) ──────────── */
  list.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-open-vonn-freight-loss-map]')) {
      if (openVonnFreightLossMap(ctx)) ctx.bus.emit('audio:cue', { id: 'ui_open' });
      return;
    }
    if (ev.target.closest('[data-open-doss-archive-map]')) {
      if (openDossArchiveMap(ctx)) ctx.bus.emit('audio:cue', { id: 'ui_open' });
      return;
    }
    const logBtn = ev.target.closest('[data-open-mission-log]');
    if (logBtn) {
      openMissionLog(ctx);
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
      return;
    }

    const rumorBtn = ev.target.closest('[data-buy-frontier-rumor]');
    if (rumorBtn) {
      const rumorId = rumorBtn.getAttribute('data-buy-frontier-rumor');
      const offer = frontierRumorPurchaseOffer(ctx.state || {}, currentStationId, rumorId);
      const card = rumorBtn.closest('.st-bar-card');
      const replyEl = card && card.querySelector('.st-bar-reply');
      if (!offer) {
        if (replyEl) {
          replyEl.textContent = 'That rumor card is no longer available.';
          replyEl.classList.add('show');
        }
        rumorBtn.disabled = true;
        rumorBtn.textContent = 'No Longer Available';
        return;
      }
      const credits = Math.max(0, Math.floor(Number(ctx.state && ctx.state.player && ctx.state.player.credits) || 0));
      if (credits < offer.price) {
        if (replyEl) {
          replyEl.textContent = 'You need ' + offer.price.toLocaleString('en-US') + ' cr for this rumor card.';
          replyEl.classList.add('show');
        }
        ctx.bus.emit('toast', { text: 'Insufficient credits for rumor card', kind: 'warn', ttl: 3 });
        return;
      }
      ctx.bus.emit('ui:purchaseFrontierRumor', { rumorId, stationId: currentStationId });
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
      if (frontierRumorOwned(ctx.state || {}, rumorId)) {
        if (replyEl) {
          replyEl.textContent = offer.kindLabel + ' added as an approximate amber search area. You still have to find it.';
          replyEl.classList.add('show');
        }
        rumorBtn.disabled = true;
        rumorBtn.textContent = 'Rumor Added';
      }
      return;
    }

    const surveyBtn = ev.target.closest('[data-buy-survey]');
    if (surveyBtn) {
      const sectorId = surveyBtn.getAttribute('data-buy-survey');
      const offer = availableSurveyOffer(ctx.state || {}, currentStationId);
      const card = surveyBtn.closest('.st-bar-card');
      const replyEl = card && card.querySelector('.st-bar-reply');
      if (!offer || offer.sectorId !== sectorId) {
        if (replyEl) {
          replyEl.textContent = 'That survey packet is no longer available.';
          replyEl.classList.add('show');
        }
        surveyBtn.disabled = true;
        surveyBtn.textContent = 'No Longer Available';
        return;
      }
      const credits = (ctx.state && ctx.state.player && ctx.state.player.credits) | 0;
      if (credits < offer.price) {
        if (replyEl) {
          replyEl.textContent = 'You need ' + offer.price.toLocaleString('en-US') + ' cr for ' + surveyOfferLabel(offer) + '.';
          replyEl.classList.add('show');
        }
        ctx.bus.emit('toast', { text: 'Insufficient credits for survey data', kind: 'warn', ttl: 3 });
        return;
      }
      ctx.bus.emit('ui:purchaseSurveyData', { sectorId, stationId: currentStationId });
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
      if (sectorDiscovered(ctx.state || {}, sectorId)) {
        if (replyEl) {
          replyEl.textContent = surveyOfferLabel(offer) + ' added to your nav chart.';
          replyEl.classList.add('show');
        }
        surveyBtn.disabled = true;
        surveyBtn.textContent = 'Survey Added';
      }
      return;
    }

    // Mission accept button
    const acceptBtn = ev.target.closest('[data-accept-mission]');
    if (acceptBtn) {
      const missionId = acceptBtn.getAttribute('data-accept-mission');
      const wasAvailable = missionOfferAvailable(ctx, missionId);
      ctx.bus.emit('ui:acceptMission', { missionId });
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
      const accepted = wasAvailable && !missionOfferAvailable(ctx, missionId);
      const replyEl = acceptBtn.closest('.st-bar-card').querySelector('.st-bar-reply');
      const offerEl = acceptBtn.closest('.st-bar-offer');
      if (accepted) {
        if (replyEl) {
          replyEl.textContent = 'Accepted + tracked. ' + missionLogLabel() + ' now carries route, timer, and progress. Undock when Departure Check is green.';
          replyEl.classList.add('show');
        }
        acceptBtn.disabled = false;
        acceptBtn.classList.add('st-bar-log-btn');
        acceptBtn.removeAttribute('data-accept-mission');
        acceptBtn.setAttribute('data-open-mission-log', missionId);
        acceptBtn.textContent = 'OPEN ' + missionLogLabel().toUpperCase();
        acceptBtn.title = 'Open ' + missionLogLabel() + ' for the tracked route, timer, and progress.';
        acceptBtn.setAttribute('aria-label', acceptBtn.title);
        if (offerEl) offerEl.classList.add('accepted');
      } else {
        if (replyEl) {
          replyEl.textContent = wasAvailable
            ? 'Mission still pending. Check the readiness chips, collateral, active mission limit, or requirements.'
            : 'That offer is no longer available.';
          replyEl.classList.add('show');
        }
        if (!wasAvailable) {
          acceptBtn.disabled = true;
          acceptBtn.textContent = 'No Longer Available';
          acceptBtn.title = 'This bar offer is no longer available.';
          acceptBtn.setAttribute('aria-label', acceptBtn.title);
        }
      }
      return;
    }

    // Dialog choice button
    const btn = ev.target.closest('[data-choice]');
    if (!btn) return;
    const card = btn.closest('[data-contact]');
    const contactId = card.getAttribute('data-contact');
    const choiceId  = btn.getAttribute('data-choice');
    const contact = currentContacts.find(c => c.id === contactId);
    const reply   = card.querySelector('.st-bar-reply');
    if (!reply || !contact) return;
    emitBarContactChoice(ctx.bus, {
      contactId,
      choiceId,
      stationId: currentStationId,
      canonicalKey: contact.canonicalKey || null,
      trackerId: contact.trackerId || null,
      pilotId: contact.wingmanPilotId || null,
      name: contact.name,
    });
    ctx.bus.emit('audio:cue', { id: 'ui_click' });

    // Find the contact and build a real reply

    const result = buildReply(contact.role, choiceId, ctx, currentStationId, contact);
    if (result.uniqueWreckRumor) {
      ctx.bus.emit('uniqueWreck:rumorHeard', result.uniqueWreckRumor);
    }

    // The contact system consumes synchronously, so reflect continuity immediately rather than
    // making the player leave/re-enter the Bar to see that this conversation happened.
    const memory = stationContactMemoryFor(ctx.state || {}, contactId);
    const memoryLine = card.querySelector('.st-bar-line');
    if (memoryLine) memoryLine.textContent = stationContactMemoryLine(memory, contact.line);
    const intel = card.querySelector('.st-bar-intel');
    if (intel) {
      intel.innerHTML = barContactIntelTags(contact, ctx.state || {}, currentStationId).map((tag) =>
        '<span class="st-bar-intel-chip st-bar-intel-chip--' + escapeHtml(tag.kind || 'info') + '">' +
          '<b>' + escapeHtml(tag.label) + '</b> ' + escapeHtml(tag.text) +
        '</span>'
      ).join('');
    }

    // Clear only the transient reply offer. Doss's all-sources map handoff is a durable, optional
    // archive reference and stays reachable after a different question is asked.
    const oldOffer = reply.parentNode.querySelector('.st-bar-offer:not([data-doss-archive-map-offer]):not([data-vonn-freight-loss-map-offer])');
    if (oldOffer) oldOffer.remove();

    reply.textContent = result.text;
    reply.classList.add('show');

    if (contact.oneChoicePerVisit) {
      for (const choiceButton of card.querySelectorAll('[data-choice]')) choiceButton.disabled = true;
    }

    if (result.missionOffer) {
      const offer = result.missionOffer;
      const preflight = missionPreflight(offer, ctx.state);
      const consequences = missionConsequenceSummary(offer);
      const unmet = offer.requirementUnmet || offer.lockedReason || preflight.blocker || null;
      const offerWrap = document.createElement('div');
      offerWrap.className = 'st-bar-offer';
      const chips = document.createElement('div');
      chips.className = 'st-mission-preflight st-bar-offer-preflight';
      chips.innerHTML = preflight.chips.map((chip) =>
        '<span class="st-mission-preflight-chip st-mission-preflight-chip--' + chip.kind + '">' + escapeHtml(chip.text) + '</span>'
      ).join('');
      offerWrap.appendChild(chips);
      const outcome = document.createElement('div');
      outcome.className = 'st-mission-consequences st-bar-offer-consequences';
      outcome.innerHTML = consequences.chips.map((chip) =>
        '<span class="st-mission-consequence st-mission-consequence--' + chip.kind + '"><b>' + escapeHtml(chip.label) + '</b> ' + escapeHtml(chip.text) + '</span>'
      ).join('');
      offerWrap.appendChild(outcome);
      if (preflight.warning) {
        const warning = document.createElement('div');
        warning.className = 'st-mission-preflight-warn st-bar-offer-warn';
        warning.textContent = preflight.warning;
        offerWrap.appendChild(warning);
      }
      if (unmet) {
        const blocker = document.createElement('div');
        blocker.className = 'st-mission-unmet st-bar-offer-blocker';
        blocker.textContent = unmet;
        offerWrap.appendChild(blocker);
      }
      const acceptButton = document.createElement('button');
      acceptButton.className = 'st-bar-accept-btn';
      acceptButton.setAttribute('data-accept-mission', offer.id);
      acceptButton.textContent = 'ACCEPT + TRACK';
      if (unmet) {
        acceptButton.disabled = true;
        acceptButton.title = unmet;
      } else {
        acceptButton.title = 'Accept, auto-track, and add to Mission Log';
      }
      acceptButton.setAttribute('aria-label', acceptButton.title);
      offerWrap.appendChild(acceptButton);
      reply.after(offerWrap);
    } else if (result.frontierRumorOffer) {
      const offer = result.frontierRumorOffer;
      const offerWrap = document.createElement('div');
      offerWrap.className = 'st-bar-offer';
      const chips = document.createElement('div');
      chips.className = 'st-mission-preflight st-bar-offer-preflight';
      chips.innerHTML =
        '<span class="st-mission-preflight-chip st-mission-preflight-chip--warn">' + escapeHtml(offer.kindLabel) + '</span>' +
        '<span class="st-mission-preflight-chip st-mission-preflight-chip--info">' + escapeHtml(offer.sectorName) + ' search area</span>' +
        '<span class="st-mission-preflight-chip st-mission-preflight-chip--info">' + escapeHtml(offer.price.toLocaleString('en-US')) + ' cr</span>';
      offerWrap.appendChild(chips);
      const warning = document.createElement('div');
      warning.className = 'st-mission-preflight-warn st-bar-offer-warn';
      warning.textContent = 'Approximate bearing only — no waypoint or automatic discovery.';
      offerWrap.appendChild(warning);
      const buyButton = document.createElement('button');
      buyButton.className = 'st-bar-accept-btn';
      buyButton.setAttribute('data-buy-frontier-rumor', offer.id);
      buyButton.textContent = 'BUY RUMOR CARD - ' + offer.price.toLocaleString('en-US') + ' CR';
      buyButton.title = 'Add an approximate amber search area to the Discovery map.';
      buyButton.setAttribute('aria-label', buyButton.title);
      offerWrap.appendChild(buyButton);
      reply.after(offerWrap);
    } else if (result.dossArchiveMapOffer) {
      if (!reply.parentNode.querySelector('[data-doss-archive-map-offer]')) {
        const offerWrap = document.createElement('div');
        offerWrap.className = 'st-bar-offer';
        offerWrap.setAttribute('data-doss-archive-map-offer', '');
        const note = document.createElement('div');
        note.className = 'st-mission-preflight-warn st-bar-offer-warn';
        note.textContent = 'Archive cross-reference only — opens the system map and does not set a course.';
        offerWrap.appendChild(note);
        const mapButton = document.createElement('button');
        mapButton.type = 'button';
        mapButton.className = 'st-bar-accept-btn';
        mapButton.setAttribute('data-open-doss-archive-map', '');
        mapButton.textContent = 'OPEN CANDLE FLEET MAP';
        mapButton.title = 'Open the system map at The Candle Fleet archive cross-reference.';
        mapButton.setAttribute('aria-label', mapButton.title);
        offerWrap.appendChild(mapButton);
        reply.after(offerWrap);
      }
    } else if (result.vonnFreightLossMapOffer) {
      if (!reply.parentNode.querySelector('[data-vonn-freight-loss-map-offer]')) {
        const offerWrap = document.createElement('section');
        offerWrap.className = 'st-bar-offer';
        offerWrap.setAttribute('data-vonn-freight-loss-map-offer', '');
        offerWrap.setAttribute('aria-label', 'Sker-Run freight wreck');
        const note = document.createElement('div');
        note.className = 'st-mission-preflight-warn st-bar-offer-warn';
        note.textContent = 'Evidence marker only — opens the system map and does not set a course or create a mission.';
        offerWrap.appendChild(note);
        const mapButton = document.createElement('button');
        mapButton.type = 'button';
        mapButton.className = 'st-bar-accept-btn';
        mapButton.setAttribute('data-open-vonn-freight-loss-map', '');
        mapButton.textContent = 'OPEN SKER-RUN WRECK MAP';
        mapButton.title = 'Open the system map at the verified Sker-Run freight wreck.';
        mapButton.setAttribute('aria-label', mapButton.title);
        offerWrap.appendChild(mapButton);
        reply.after(offerWrap);
      }
    } else if (result.surveyOffer) {
      const offer = result.surveyOffer;
      const offerWrap = document.createElement('div');
      offerWrap.className = 'st-bar-offer';
      const chips = document.createElement('div');
      chips.className = 'st-mission-preflight st-bar-offer-preflight';
      chips.innerHTML =
        '<span class="st-mission-preflight-chip st-mission-preflight-chip--warn">' + escapeHtml(surveyOfferLabel(offer)) + '</span>' +
        '<span class="st-mission-preflight-chip st-mission-preflight-chip--info">Tier ' + escapeHtml(offer.tier) + ' frontier chart</span>' +
        '<span class="st-mission-preflight-chip st-mission-preflight-chip--info">' + escapeHtml(offer.price.toLocaleString('en-US')) + ' cr</span>';
      offerWrap.appendChild(chips);
      const buyButton = document.createElement('button');
      buyButton.className = 'st-bar-accept-btn';
      buyButton.setAttribute('data-buy-survey', offer.sectorId);
      buyButton.textContent = 'BUY ' + surveyOfferLabel(offer).toUpperCase() + ' - ' + offer.price.toLocaleString('en-US') + ' CR';
      buyButton.title = 'Buy ' + surveyOfferLabel(offer) + ' and mark the sector discovered on the nav chart.';
      buyButton.setAttribute('aria-label', buyButton.title);
      offerWrap.appendChild(buyButton);
      reply.after(offerWrap);
    }
  });

  /* ── render ───────────────────────────────────────────────────── */
  function refresh() {
    if (!currentStationId) return;
    currentContacts = generateContacts(currentStationId, ctx.state || {});

    const frag = document.createDocumentFragment();
    for (const c of currentContacts) {
      const fac = c.factionId ? FACTION_BY_ID.get(c.factionId) : null;
      const choices = getChoices(c.role, c);
      const roleLabel = c.roleLabel || ROLE_LABELS[c.role] || c.role;

      const card = document.createElement('div');
      card.className = 'st-bar-card';
      card.setAttribute('data-contact', c.id);

      const avatarHost = document.createElement('div');
      avatarHost.className = 'st-bar-avatar-host';

      const body = document.createElement('div');
      body.className = 'st-bar-body';
      const memory = stationContactMemoryFor(ctx.state || {}, c.id);
      const dossMapOffer = c.id === DOSS_ARCHIVE_CONTACT_ID
        ? dossArchiveMapOffer(ctx.state || {})
        : null;
      const vonnMapOffer = c.id === VONN_FREIGHT_CONTACT_ID
        ? vonnFreightLossMapOffer(ctx.state || {})
        : null;
      body.innerHTML =
        '<div class="st-bar-name">' + escapeHtml(c.name) +
          ' <span class="st-bar-role mono">' + escapeHtml(roleLabel) +
          (fac ? ' · ' + escapeHtml(fac.short || fac.name) : '') +
          '</span></div>' +
        '<div class="st-bar-line">' + escapeHtml(stationContactMemoryLine(memory, c.line)) + '</div>' +
        '<div class="st-bar-intel">' +
          barContactIntelTags(c, ctx.state || {}, currentStationId).map((tag) =>
            '<span class="st-bar-intel-chip st-bar-intel-chip--' + escapeHtml(tag.kind || 'info') + '">' +
              '<b>' + escapeHtml(tag.label) + '</b> ' + escapeHtml(tag.text) +
            '</span>'
          ).join('') +
        '</div>' +
        '<div class="st-bar-choices">' +
        choices.map(ch => '<button data-choice="' + escapeHtml(ch.id) + '">' + escapeHtml(ch.label) + '</button>').join('') +
        '</div>' +
        (dossMapOffer
          ? '<div class="st-bar-offer" data-doss-archive-map-offer><div class="st-mission-preflight-warn st-bar-offer-warn">Archive cross-reference only — opens the system map and does not set a course.</div><button type="button" class="st-bar-accept-btn" data-open-doss-archive-map aria-label="Open the system map at The Candle Fleet archive cross-reference.">OPEN CANDLE FLEET MAP</button></div>'
          : '') +
        '<div class="st-bar-reply mono" role="status" aria-live="polite" aria-atomic="true"></div>';

      if (vonnMapOffer) {
        const reply = body.querySelector('.st-bar-reply');
        const offerWrap = document.createElement('section');
        offerWrap.className = 'st-bar-offer';
        offerWrap.setAttribute('data-vonn-freight-loss-map-offer', '');
        offerWrap.setAttribute('aria-label', 'Sker-Run freight wreck');
        const note = document.createElement('div');
        note.className = 'st-mission-preflight-warn st-bar-offer-warn';
        note.textContent = 'Evidence marker only — opens the system map and does not set a course or create a mission.';
        const mapButton = document.createElement('button');
        mapButton.type = 'button';
        mapButton.className = 'st-bar-accept-btn';
        mapButton.setAttribute('data-open-vonn-freight-loss-map', '');
        mapButton.textContent = 'OPEN SKER-RUN WRECK MAP';
        mapButton.title = 'Open the system map at the verified Sker-Run freight wreck.';
        mapButton.setAttribute('aria-label', mapButton.title);
        offerWrap.append(note, mapButton);
        if (reply) body.insertBefore(offerWrap, reply);
      }

      mountContactPortrait(avatarHost, c, { className: 'st-bar-avatar', size: 64, factionColor: fac && fac.color });
      card.appendChild(avatarHost);
      card.appendChild(body);
      frag.appendChild(card);
    }
    list.textContent = '';
    list.appendChild(frag);
  }

  return {
    el: root,
    stationId: null,
    onShow(c) {
      if (c && c.stationId) {
        this.stationId = c.stationId;
        currentStationId = c.stationId;
      }
      refresh();
    },
    refresh,
  };
}
