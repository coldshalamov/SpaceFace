// What a scan from the cockpit says about the inside of a rock before the rover goes down:
// "Inside: iron shallow · copper mid (Mk II) · titanium deep (Mk II) · 3 gas pockets".
// It is the same interior the rover will open (same seed, same geology family), read with the pure
// generator, so the line is a promise the board keeps. One entry per stratum: the material there
// is most of. An ore the fitted beam cannot cut says so, which is how a pilot learns what the next
// beam is for.
import { assayRock, resolveBoreFamily } from '../../systems/drillFieldModel.js';

const DEPTH_WORDS = Object.freeze({ cap: 'shallow', spine: 'mid', heart: 'deep' });
const STRATA = Object.freeze(['cap', 'spine', 'heart']);
const CACHE_MAX = 96;
const cache = new Map();

function beamTierOf(state) {
  const player = state && state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  const beam = (player && player.data && player.data.miningBeam) || (state && state.player && state.player.miningBeam) || null;
  if (!beam) return 1;
  if (beam.tierId === 'beam_industrial') return 4;
  if (beam.tierId === 'beam_mk3') return 3;
  if (beam.tierId === 'beam_mk2') return 2;
  return 1;
}
const BEAM_NAME = Object.freeze({ 2: 'Mk II', 3: 'Mk III', 4: 'Industrial' });

/** The assay record for one rock, cached: `{ strata: [{ ore, stratum, tierReq }], gasPockets, hardness }`. */
export function rockAssay(entity) {
  if (!entity || entity.type !== 'asteroid') return null;
  const data = entity.data || {};
  const seed = ((Number.isFinite(data.boreSeed) ? data.boreSeed : entity.id) >>> 0) || 1;
  const family = resolveBoreFamily(data);
  const key = `${seed}:${family}`;
  let hit = cache.get(key);
  if (!hit) {
    const assay = assayRock(seed, family);
    const strata = [];
    for (const stratum of STRATA) {
      let best = null;
      for (const material of assay.materials) {
        if (material.stratum !== stratum) continue;
        if (!best || material.units > best.units) best = material;
      }
      if (best && !strata.some((row) => row.ore === best.ore)) {
        strata.push({ ore: best.ore, stratum, tierReq: best.tierReq });
      }
    }
    hit = Object.freeze({ strata: Object.freeze(strata), gasPockets: assay.gasPockets, hardness: assay.hardness });
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, hit);
  }
  return hit;
}

/** One line for the target card. `nameOf(commodityId)` supplies the display name. */
export function rockAssayLine(entity, state, nameOf) {
  const assay = rockAssay(entity);
  if (!assay || !assay.strata.length) return null;
  const tier = beamTierOf(state);
  const parts = assay.strata.map((row) => {
    // "Iron Ore" reads as "iron" in a list of what is in the rock; the beam it needs rides in
    // brackets only when the fitted beam cannot cut it.
    const full = (typeof nameOf === 'function' && nameOf(row.ore)) || 'ore';
    const name = String(full).replace(/ Ore$/i, '').toLowerCase();
    const needs = row.tierReq > tier && BEAM_NAME[row.tierReq] ? ` (${BEAM_NAME[row.tierReq]})` : '';
    return `${name} ${DEPTH_WORDS[row.stratum]}${needs}`;
  });
  if (assay.gasPockets === 1) parts.push('1 gas pocket');
  else if (assay.gasPockets > 1) parts.push(`${assay.gasPockets} gas pockets`);
  return `Inside: ${parts.join(' · ')}`;
}
