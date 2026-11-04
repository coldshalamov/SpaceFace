// The hull registry — a proper name and a captain for otherwise anonymous traffic.
//
// Hailing a hauler used to answer with its job description: "CARGO HAULER · CIVILIAN FREIGHT".
// Every other hull in the sector was anonymous, so the lane read as machinery, not as people.
// The registry mints the name painted on the hull and the captain who signs the manifest,
// hashed from (save seed, entity identity) so the same hull keeps its name across ticks,
// sectors and save/load — without spending an RNG draw or persisting a field. Same
// pure-data + pure-reader contract as pilotCallsigns.js, and like that module it never
// overwrites a writer's name: authored identity (callsign, scanLabel, data.name, an ace
// boss's name) always wins, and a specific traffic label (an authored route hook such as
// "EXPRESS LINER · …") is not anonymity either. Only the plain role labels — the ones
// traffic.js stamps from TRAFFIC_ROLES — mint.

import { hash32 } from '../core/rng.js';

// Painted hull names: traded-craft names in the ledger-and-wake cant the world already
// speaks. Recognized `name` fields so the localization extractor carries the corpus.
export const SHIP_NAME_STOCK = Object.freeze([
  { name: 'Slow Verdict' }, { name: 'Patient Ledger' }, { name: 'Second Utility' },
  { name: 'Kindly Tide' }, { name: 'Break-Even' }, { name: 'Last Installment' },
  { name: 'Quiet Margin' }, { name: 'Honest Weight' }, { name: 'Third Provision' },
  { name: 'Mollys Rebate' }, { name: 'Carried Forward' }, { name: 'Small Mercies' },
  { name: 'Paid-in-Full' }, { name: 'Winter Account' }, { name: 'The Long Credit' },
  { name: 'Doubled Back' }, { name: 'Spared Rudder' }, { name: 'Quietly Held' },
  { name: 'Old Assurance' }, { name: 'Final Notice' }, { name: 'Interest Accrued' },
  { name: 'Ballast & Kin' }, { name: 'First Balance' }, { name: 'Carried Over' },
  { name: 'Weatherproof' }, { name: 'Working Title' }, { name: 'Kind Regrets' },
  { name: 'The Cold Store' }, { name: 'Eleventh Hour' }, { name: 'Signed Receipt' },
  { name: 'Modest Fortune' }, { name: 'Still Solvent' }, { name: 'Turn of Tide' },
  { name: 'Held in Trust' }, { name: 'The Second Mate' }, { name: 'Wide Berth' },
]);

// Captains: frontier given name plus an earned, traded-family surname — the person the
// manifest names, not a raider epithet (that stock lives in pilotCallsigns.js).
export const CAPTAIN_NAME_STOCK = Object.freeze([
  { name: 'Halden Mirth' }, { name: 'Petra Cole' }, { name: 'Ossian Wade' },
  { name: 'Marta Vell' }, { name: 'Ruthor Openshaw' }, { name: 'Lida Crane' },
  { name: 'Emory Salt' }, { name: 'Brigid Tell' }, { name: 'Corwin Hale' },
  { name: 'Ansel Merrin' }, { name: 'Yova Brandt' }, { name: 'Tiber Root' },
  { name: 'Nessa Fairweather' }, { name: 'Dagny Holt' }, { name: 'Rafe Culver' },
  { name: 'Imogen Sparks' }, { name: 'Osric Tanner' }, { name: 'Vera Latch' },
  { name: 'Silas Penny' }, { name: 'Hark Cooper' }, { name: 'Wren Osgood' },
  { name: 'Calla Durance' }, { name: 'Edmun Grange' }, { name: 'Thessa Moor' },
  { name: 'Jasper Quill' }, { name: 'Ruthie Amble' }, { name: 'Garin Voss' },
  { name: 'Petra Winslow' }, { name: 'Aldous Ferry' }, { name: 'Mirelle Sedge' },
  { name: 'Oren Tally' }, { name: 'Sunniva Parr' }, { name: 'Dexter Rill' },
  { name: 'Harlow Beam' }, { name: 'Costa Meade' }, { name: 'Fenwick Rose' },
]);

// The honorific is player-facing copy: a recognized text field so the extractor carries it,
// and the {name} placeholder survives translation (hasPlaceholderParity checks it).
export const CAPTAIN_HONORIFIC_COPY = Object.freeze({ text: 'CAPT. {name}' });

/** Deterministic mint: same (seed, entityId) always reads the same ship and captain. */
export function registryIdentityFor(seed, entityId) {
  const id = String(entityId == null ? '' : entityId);
  const nameHash = hash32(seed >>> 0, 'ship-registry-name', id);
  const captainHash = hash32(seed >>> 0, 'ship-registry-captain', id);
  const shipName = SHIP_NAME_STOCK[nameHash % SHIP_NAME_STOCK.length].name;
  const captain = CAPTAIN_NAME_STOCK[captainHash % CAPTAIN_NAME_STOCK.length].name;
  return Object.freeze({ shipName, captain });
}

/** The durable identity a hull is minted from: its world record, else its live id. */
function registryEntityId(entity) {
  const data = (entity && entity.data) || {};
  if (typeof data.worldRecordId === 'string' && data.worldRecordId) return data.worldRecordId;
  if (typeof data.identityKey === 'string' && data.identityKey) return data.identityKey;
  return entity && entity.id != null ? String(entity.id) : '';
}

/**
 * The registry slot a hail header should carry: "SLOW VERDICT · CAPT. WREN OSGOOD", or null
 * when the hull already has an authored name. `genericLabels` is the set of plain role labels
 * (TRAFFIC_ROLES labels); a traffic label outside that set is an authored line and never mints.
 */
export function hailRegistrySlot(entity, seed, genericLabels = null) {
  const data = (entity && entity.data) || {};
  const aceBoss = data.aceMemory && data.aceMemory.role === 'boss'
    ? data.aceMemory.aceName : null;
  if (data.callsign || data.scanLabel || data.name || aceBoss) return null;
  const label = typeof data.trafficLabel === 'string' ? data.trafficLabel.trim() : '';
  if (label && !(genericLabels && typeof genericLabels.has === 'function' && genericLabels.has(label))) {
    return null;
  }
  const id = registryEntityId(entity);
  if (!id) return null;
  const { shipName, captain } = registryIdentityFor(seed, id);
  const honorific = String(CAPTAIN_HONORIFIC_COPY.text).replace('{name}', captain);
  return `${shipName} · ${honorific}`;
}
