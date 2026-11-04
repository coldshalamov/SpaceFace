// Fitted, measured collision for the fifteen qualified canonical full-hulk releases.
// Pure cached models/specs only. aftermathWrecks remains the sole body-binding writer.
import { modelTruthRow, modelTruthProxyManifest, modelTruthSkinHull,
  modelTruthSkinPolygon, isModelTruthCensusLoaded } from './modelTruth.js';
import { mergeConvexPlanarFan } from '../core/convexPlanarFan.js';
import { occupationalHulkQualification } from './occupationalWreckHulkFit.js';
import { RENDER_PACKAGE_PILOTS } from '../render/renderPackageManifest.js';
import { canonicalWholeHulkDefId, wholeHulkVisualForEntity, hasWholeHulkGeometry,
  WRECK_HULK_COLLISION_PROFILE, MULE_SITE_COLLISION_PROFILE } from './wholeShipVisualIdentity.js';

// Existing measured inventory releases; a changed release must be qualified again.
const QUALIFIED_RELEASES = Object.freeze({
  "traffic:hauler": "4d7213c8faacbe826bee9f296849abcef563979677453453b38972e57b02c271",
  "ship_atlas": "2fef2a59a023f441b8d5f14c9de4a070582c7bc9829cd991838ec53018eec454",
  "ship_bastion": "be0e1b50fd0a1f2ddb9dc566257be291c422d93eb706076988516e57b3c76598",
  "ship_colossus": "a458642ead8eb1e58c0028597a54553cb56aedc39fc023d65e8eb0c16004d042",
  "ship_drifter": "87a4be27ebd4c24430a7ddfd473c23d299be540a8820b9493bf6aebc13c61e66",
  "ship_hawser": "9f33875afb48a38986d1232a46f43857fe9255c7e7e9b308266b303e9fdd2003",
  "ship_hornet": "1508b3ce8e152915ffd9cab5fa73c5067e2313f57b3f0a8f4c308ff64791cd0a",
  "ship_ironback": "9b78d621ad0568d521c561be336a534238c69af89e6fc986d092d6bd57edc8a5",
  "ship_kestrel": "7f687fb1de2ee7cc190e1b600d4917eebcc905ba3f3f6bb4b93eb29930f84fbd",
  "ship_leviathan": "9d7434ade1160602dba168d1c29dd07a1bc27a39fd91346724d3d9391e3a4ff7",
  "ship_mule": "39d4e8f04e22cdaa94b1f7ceaeb365438620c9b183dac234478835df940c9b62",
  "ship_pelican": "da37b57a8a058635008ccd1d9cb46e0450f44644f007801455fa0bad21af56a8",
  "ship_ranger": "9c5f117f81a1a283be149fa820505b3cde0cfdb02bea103eff0cf5ced9d9dc20",
  "ship_saucer": "b61eded82a450503b8d90ad2ace9dda1ed145df724b2565dc3038f5a851b0ca0",
  "ship_warden": "7bd70363e78e85c53ded5b45f19e89f26cc97aab9b482d7d43c030fcd148d601",
  "ship_wasp": "58aa882b40036e3af8ec56f190180443a4a6e937e13c38f2cc2e7adf7dc896c3"
});
const RELEASE_BY_FILE = new Map(RENDER_PACKAGE_PILOTS.map(p => [
  p.sourceUrl.replace('assets/ships/release/parts/', ''), p.sourceSha256,
]));
const MODELS = new Map(); // bounded by the fifteen qualified files

function freezeModel(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeModel(child);
    Object.freeze(value);
  }
  return value;
}

export function wreckHulkCollisionModel(entity) {
  if (!hasWholeHulkGeometry(entity) || !isModelTruthCensusLoaded()) return null;
  const selected = wholeHulkVisualForEntity(entity), file = selected?.file;
  const defId = canonicalWholeHulkDefId(file);
  if (!defId || RELEASE_BY_FILE.get(file) !== QUALIFIED_RELEASES[defId]) return null;
  const row = modelTruthRow(defId);
  if (!row || row.url !== `assets/ships/release/parts/${file}`) return null;
  const occupational = defId === 'traffic:hauler'
    ? occupationalHulkQualification(file, RELEASE_BY_FILE.get(file), row) : null;
  if (defId === 'traffic:hauler' && !occupational) return null;
  const cached = MODELS.get(file);
  if (cached?.row === row) return cached.model;
  const measured = modelTruthProxyManifest(occupational?.proxyEntity || { type: 'ship', data: { defId } });
  const hull = modelTruthSkinHull(row), polygon = hull || modelTruthSkinPolygon(row);
  const reference = row.gameplay?.entityRadius || row.shell?.silhouetteRadius;
  const envelope = Math.max(...(row.worldSize || []));
  if (!measured || !polygon || !(reference > 0) || !(envelope > 0)
    || !row.bounds?.center?.every(Number.isFinite) || !Number.isFinite(row.drawScale)) return null;
  const scale = 2 * reference / envelope;
  const ox = row.bounds.center[0] * row.drawScale / reference;
  const oz = row.bounds.center[2] * row.drawScale / reference;
  const point = p => ({ x: (p.x - ox) * scale, z: (p.z - oz) * scale });
  const primitives = measured.primitives.map(p => {
    if (p.kind === 'capsule') return { ...p,
      ax: (p.ax - ox) * scale, az: (p.az - oz) * scale,
      bx: (p.bx - ox) * scale, bz: (p.bz - oz) * scale, r: p.r * scale };
    return { ...p, ...point(p), ...(p.kind === 'circle' ? { r: p.r * scale }
      : { hx: p.hx * scale, hz: p.hz * scale }) };
  });
  const outline = polygon.map(point);
  let area2 = 0, polar12 = 0, cx6 = 0, cz6 = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const cross = a.x * b.z - b.x * a.z;
    area2 += cross;
    cx6 += (a.x + b.x) * cross; cz6 += (a.z + b.z) * cross;
    polar12 += cross * (a.x*a.x + a.x*b.x + b.x*b.x + a.z*a.z + a.z*b.z + b.z*b.z);
  }
  const inertiaPerMassRadiusSquared = polar12 / (6 * area2);
  if (!(inertiaPerMassRadiusSquared > 0) || !Number.isFinite(inertiaPerMassRadiusSquared)) return null;
  // Decompose about the ORIGINAL radial origin before translating to packaged fit.
  // Transform its fan origin too; do not fill a concavity with a new convex union.
  const geometry = hull ? { compactHull: outline } : { convexParts:
    mergeConvexPlanarFan(polygon).map((part, i) => ({ id: `skin-${i}`, points: part.map(point) })) };
  const model = freezeModel({ file, defId, profile: WRECK_HULK_COLLISION_PROFILE,
    releaseHash: QUALIFIED_RELEASES[defId], outline,
    centroid: { x: cx6 / (3 * area2), z: cz6 / (3 * area2) }, inertiaPerMassRadiusSquared,
    manifest: { ...measured, id: `${WRECK_HULK_COLLISION_PROFILE}:${defId}`,
      referenceRadius: 'radius', primitives, ...geometry } });
  MODELS.set(file, { row, model });
  return model;
}

function ownedManifest(id) {
  return typeof id === 'string' && (id === MULE_SITE_COLLISION_PROFILE
    || Object.keys(QUALIFIED_RELEASES).some(def => id === `${WRECK_HULK_COLLISION_PROFILE}:${def}`));
}

/** Return an owner-applicable body spec, never mutate the entity/marker here.
 * Intentional custom geometry and geometry opt-outs remain authoritative. */
export function wreckHulkBodyUpgrade(entity) {
  if (entity?.alive === false || entity?.collides === false || entity?.physicsBody === false) return null;
  const model = wreckHulkCollisionModel(entity), body = entity.physicsBody || {};
  if (!model || body.useMeasuredSkin === false || entity.data?.collisionProxy
    || body.shape && body.shape !== 'capsule' && body.shape !== 'compound'
    || body.shape === 'compound' && !ownedManifest(body.collisionProxyManifest?.id)
    || body.collisionProxyManifest && !ownedManifest(body.collisionProxyManifest.id)) return null;
  const radius = Number(entity.radius), mass = Number(body.mass ?? entity.mass);
  if (!(radius > 0) || !(mass > 0) || !Number.isFinite(radius) || !Number.isFinite(mass)
    || body.radius != null && body.radius !== radius) return null;
  const com = body.centerOfMass || {}, x = (Number(com.x) || 0) / radius, z = (Number(com.z) || 0) / radius;
  const moment = model.inertiaPerMassRadiusSquared - 2 * (x * model.centroid.x + z * model.centroid.z) + x*x + z*z;
  const inertiaY = mass * radius * radius * moment;
  if (!(inertiaY > 0) || !Number.isFinite(inertiaY)) return null;
  const unchanged = body.shape === 'compound' && body.mass === mass && body.inertiaY === inertiaY
    && body.collisionProxyManifest?.id === model.manifest.id
    && (body.collisionProxyManifest === model.manifest
      || JSON.stringify(body.collisionProxyManifest) === JSON.stringify(model.manifest));
  return { model, changed: !unchanged, physicsBody: unchanged ? body : {
    ...body, shape: 'compound', mass, inertiaY, radius,
    collisionProxyManifest: model.manifest,
    revision: Math.max(0, Math.trunc(Number(body.revision) || 0)) + 1,
  } };
}
