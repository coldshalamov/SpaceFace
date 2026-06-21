import { COMMODITIES } from '../commodities.js';
import { FACTION_META } from '../factions.js';
import { ORES } from '../mining.js';
import { SECTORS } from '../sectors.js';
import { SCENARIOS } from './index.js';

export const SCENARIO_SUBSYSTEMS = Object.freeze([
  'combat', 'npc', 'economy', 'faction', 'ui', 'locations', 'missions', 'world',
  'cargo', 'mining', 'automation', 'ships', 'audio', 'director', 'lore',
]);

export function buildSpaceFaceScenarioCatalog(scenarios = SCENARIOS) {
  const catalog = {
    actor: new Set(),
    subsystem: new Set(SCENARIO_SUBSYSTEMS),
    cue: new Set(),
    station: new Set(),
    faction: new Set(FACTION_META.map((item) => item.id)),
    lore: new Set(),
    localization: new Set(),
    sector: new Set(SECTORS.map((item) => item.id)),
    commodity: new Set([...COMMODITIES, ...ORES].map((item) => item.id)),
  };
  for (const sector of SECTORS) for (const station of sector.stations || []) catalog.station.add(station.id);
  for (const scenario of scenarios) {
    for (const actorId of Object.keys(scenario.actors || {})) catalog.actor.add(actorId);
    const manifest = scenario.referenceManifest || {};
    for (const cueId of manifest.cues || []) catalog.cue.add(cueId);
    for (const loreId of manifest.lore || []) catalog.lore.add(loreId);
    for (const localizationId of manifest.localization || []) catalog.localization.add(localizationId);
  }
  return catalog;
}
