import scn from './scn.js';
import mts from './mts.js';
import dmc from './dmc.js';
import reach from './reach.js';
import quiet from './quiet.js';
import vael from './vael.js';
import free from './free.js';
import choir from './choir.js';
import helix from './helix.js';
import understory from './understory.js';
import fulfillment from './fulfillment.js';
import archive from './archive.js';
import pitborn from './pitborn.js';
import vergelayers from './vergelayers.js';

export const FACTION_KITS = [
  scn,
  mts,
  dmc,
  reach,
  quiet,
  vael,
  free,
  choir,
  helix,
  understory,
  fulfillment,
  archive,
  pitborn,
  vergelayers,
];

function toLegacyMeta(faction) {
  const {
    palette: _palette,
    shipRoles: _shipRoles,
    illegalCommodities: _illegalCommodities,
    custom: _custom,
    voiceRegister: _voiceRegister,
    ...meta
  } = faction;
  return meta;
}

// Compatibility contract: existing imports receive exactly the pre-migration
// shape and ordering. Future kit fields stay available through FACTION_KITS.
export const FACTION_META = FACTION_KITS.map(toLegacyMeta);

// Station factions that project a lawful no-fire bubble. Literal on purpose:
// FACTION_META.filter(f => f.personality === 'lawful') yields only faction_scn.
// Meridian is personality 'corporate', Drift is 'blue-collar', and Free Frontier
// is 'independent', and those three still belong in this set.
export const LAWFUL_STATION_FACTIONS = Object.freeze(new Set([
  'faction_scn',
  'faction_mts',
  'faction_dmc',
  'faction_free',
]));
