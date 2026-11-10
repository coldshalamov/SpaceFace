// Exact-file qualification for the unskinned occupational Helios Span.
// A chassis or role by itself is never enough: the shared renderer selector wins.
export const OCCUPATIONAL_HULK_FILE = 'wholeships/helios_span.glb';
export const OCCUPATIONAL_HULK_ROW = 'traffic:hauler';
export const OCCUPATIONAL_HULK_SHA256 = '4d7213c8faacbe826bee9f296849abcef563979677453453b38972e57b02c271';

export function occupationalHulkQualification(file, releaseHash, row) {
  if (file !== OCCUPATIONAL_HULK_FILE || releaseHash !== OCCUPATIONAL_HULK_SHA256
    || row?.id !== OCCUPATIONAL_HULK_ROW
    || row.url !== `assets/ships/release/parts/${file}`
    || row.proposedSkin?.adopted !== true) return null;
  return { defId: OCCUPATIONAL_HULK_ROW, row,
    proxyEntity: { type: 'ship', data: { trafficRole: 'hauler' } } };
}
