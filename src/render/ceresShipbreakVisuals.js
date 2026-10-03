import { ceresShipbreakCollisionAuthority } from '../data/ceresShipbreakCollision.js';
// Exact P03 anatomy. The three live structural wrecks are their original matched parts,
// never a canister, random corpse, or a re-centered/rescaled salvage proxy.
export const CERES_SHIPBREAK_FILES = Object.freeze(Object.fromEntries([
  'place_ceres_second_measure',
  'place_ceres_second_measure_long_plate',
  'place_ceres_second_measure_crossbeam',
  'place_ceres_second_measure_keel',
].map(id => [id, `places/${id}.glb`])));
export function isCeresShipbreakSection(entity) {
  return entity?.type === 'wreck' && entity.data?.worldSiteStructural === true
    && Object.hasOwn(CERES_SHIPBREAK_FILES, entity.data.placeId || '')
    && entity.data.placeId !== 'place_ceres_second_measure';
}
export function ceresShipbreakTransform(data) {
  return Object.hasOwn(CERES_SHIPBREAK_FILES, data?.placeId || '') ? { scale: 2, y: 0 } : null;
}

// Catalog measurement preserves the owner split used by the live world-site runtime.
export function ceresShipbreakCatalogCollision(placeId) {
  const authority = ceresShipbreakCollisionAuthority(placeId);
  return authority ? { colliderKind: 'world-site-bodies', collisionAuthority: authority } : null;
}
