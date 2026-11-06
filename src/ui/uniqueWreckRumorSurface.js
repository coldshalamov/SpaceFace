// Pure carrier adapter for the four authored wreck rumors delivered in station bars.
// The Bar owns when the player hears the line; uniqueWrecks owns durable knowledge after the
// `uniqueWreck:rumorHeard` receipt is emitted. Keeping selection here prevents the runtime system
// from granting a bearing merely because a bar screen opened.

import { FLAVOR_SOURCE_BY_REF } from '../data/flavor/index.generated.js';
import { EXPANSION_ACTIVITY_WRECKS } from '../data/uniqueWrecks.js';

const BAR_SOURCE_BY_STATION = Object.freeze({
  station_sker: 'bar.sker.nestbreaker',
  station_haumea_rift: 'bar.rift_observatory.deepsurvey',
  station_reach: 'bar.io_mercenary.smokesong',
  station_helios: 'bar.helios_meridian.silver_draft',
});

// Berths whose enter-path does not already chart this hull. Veil charts the Vigilant,
// so Page Nine is only heard by asking. Ashfall charts the lighthouse, so the garden
// is a neighbor lead heard by asking — it outranks Big Ballast's repeating route rumor.
const EXPANSION_BAR_BY_STATION = Object.freeze({
  station_veil: 'wreck_vael_page_nine',
  station_ashcache: 'wreck_understory_what_the_wreck_became',
});

function knownBearings(state) {
  return state && state.player && state.player.uniqueWrecks
    && state.player.uniqueWrecks.bearings || {};
}

function sourceText(source) {
  return (source && Array.isArray(source.lines) ? source.lines : [])
    .map((line) => line && line.text)
    .filter((text) => typeof text === 'string' && text.trim())
    .join(' ');
}

function expansionBarRumor(state, stationId) {
  const wreckId = EXPANSION_BAR_BY_STATION[stationId];
  if (!wreckId || knownBearings(state)[wreckId]) return null;
  const def = EXPANSION_ACTIVITY_WRECKS.find((row) => row.id === wreckId);
  if (!def || !def.scanLabel || !def.bearingSourceRef) return null;
  return Object.freeze({
    wreckId: def.id,
    sourceRef: def.bearingSourceRef,
    channelId: 'bar',
    text: def.scanLabel,
  });
}

/** Return exact authored copy only when the player deliberately asks the station barkeep. */
export function uniqueWreckBarRumor(state, stationId, choiceId) {
  if (choiceId !== 'rumors') return null;
  const expansion = expansionBarRumor(state, stationId);
  if (expansion) return expansion;
  const sourceRef = BAR_SOURCE_BY_STATION[stationId];
  const source = sourceRef && FLAVOR_SOURCE_BY_REF[sourceRef];
  if (!source || knownBearings(state)[source.wreckId]) return null;
  const text = sourceText(source);
  if (!text) return null;
  return Object.freeze({
    wreckId: source.wreckId,
    sourceRef,
    channelId: 'bar',
    text,
  });
}

export default uniqueWreckBarRumor;
