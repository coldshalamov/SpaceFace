// Paint layouts use the model's coordinate frame, not its texture atlas or world position.
// One additional vertex attribute; no texture, draw, per-frame traversal or shader variant.
import { Float32BufferAttribute, Matrix4, Vector3 } from 'three';

const coordinates = new WeakMap();
const point = new Vector3();
const identity = new Matrix4();

export function hullLayoutForAsset(assetId = '') {
  const id = String(assetId).toLowerCase();
  if (/aftermath|dead_hulk|debris_chunk/.test(id)) return { kind: 8, strength: 0.96, accent: '#b69b72' };
  if (/weapon_/.test(id)) return { kind: 5, strength: 0.85, accent: '#efba68' };
  if (/gate_jump/.test(id)) return { kind: 7, strength: 0.9, accent: '#ddb878' };
  if (/station_military|support_gantry/.test(id)) return { kind: 6, strength: 0.9, accent: '#d7d7b9' };
  if (/station/.test(id)) return { kind: 4, strength: 0.9, accent: '#dda877' };
  if (/yard_tug|cradle|ore_barge|prospector|repair_tender|scrap_sweeper/.test(id)) return { kind: 2, strength: 0.95, accent: '#eedeb0' };
  if (/bastion|wasp|hornet|inspection_cutter/.test(id)) return { kind: 3, strength: 0.92, accent: '#dec793' };
  if (/kestrel|borrowed_time/.test(id)) return { kind: 1, strength: 0.46, accent: '#afd3c9' };
  if (/helios_|ashline_rig|survey_pin|rescue_lifter|apron_shuttle|salvage_cutter|express_liner|volatiles_tanker|drifter/.test(id)) return { kind: 1, strength: 0.86, accent: '#e6d5ae' };
  if (/aftermath|dead_hulk|debris|pod_|rescue_capsule|lane_|tally|claim_mark|cold_locker|ash_pin|whistle|memorial|mining_drone/.test(id)) return { kind: 2, strength: 0.65, accent: '#cbaa79' };
  return null;
}

export function prepareHullLayoutGeometry(geometry, matrix, assetId) {
  if (!geometry?.attributes?.position || !hullLayoutForAsset(assetId)) return geometry;
  const key = matrix.elements.join(',');
  const prior = coordinates.get(geometry);
  if (prior?.key === key) return geometry;
  if (prior?.variants.has(key)) return prior.variants.get(key);
  // Reused meshes can occupy different places in a source assembly. Only that case needs a clone.
  const target = prior ? geometry.clone() : geometry;
  const source = geometry.attributes.position;
  if (matrix.equals(identity)) {
    // Compiled hull batches are already in asset space. Alias their existing GPU buffer.
    target.setAttribute('sfHullPosition', source);
  } else {
    const array = new Float32Array(source.count * 3);
    for (let i = 0; i < source.count; i++) {
      // BufferAttribute accessors decode normalized/quantized release positions correctly.
      point.fromBufferAttribute(source, i).applyMatrix4(matrix).toArray(array, i * 3);
    }
    target.setAttribute('sfHullPosition', new Float32BufferAttribute(array, 3));
  }
  coordinates.set(target, { key, variants: new Map() });
  if (prior) prior.variants.set(key, target);
  return target;
}

export const HULL_LAYOUT_GLSL = /* glsl */`
  // The broad paint blocks survive the flight camera. Fine seams disappear through fwidth
  // instead of sparkling; they complement the source model's normal map and real geometry.
  vec3 sfP = (vSfHullPosition - sfHullCenter) / max(sfHullSize, vec3(0.001));
  vec3 sfFace = cross(dFdx(vSfHullPosition), dFdy(vSfHullPosition));
  float sfDeck = smoothstep(0.16, 0.65, abs(sfFace.y) / max(length(sfFace), 0.00001));
  float sfSpan = abs(sfP.z);
  float sfLong = sfP.x;
  float sfSpine = (1.0 - smoothstep(0.16, 0.21, sfSpan)) * (1.0 - smoothstep(0.14, 0.26, sfLong));
  float sfShoulder = smoothstep(0.31, 0.35, sfSpan);
  vec2 sfGrid = vec2((sfLong + 0.51) * 7.0, (sfP.z + 0.52) * 5.0);
  vec2 sfCell = fract(sfGrid);
  vec2 sfAA = max(fwidth(sfGrid) * 1.2, vec2(0.006));
  vec2 sfSeamAxes = 1.0 - smoothstep(vec2(0.012), vec2(0.012) + sfAA, min(sfCell, 1.0 - sfCell));
  float sfSeam = max(sfSeamAxes.x, sfSeamAxes.y) * sfDeck * sfFineVisibility;
  // Micro-fastener relief: subtle fastener impressions spaced along panel seams.
  vec2 sfFastenerPhase = fract(sfGrid * 4.0) - 0.5;
  float sfFastenerDist = length(sfFastenerPhase);
  float sfFastener = (1.0 - smoothstep(0.14, 0.28, sfFastenerDist)) * sfSeam * sfFineVisibility;
  sfSurfaceRelief = (-sfSeam * 0.00065 + sfFastener * 0.00030) * max(sfHullSize.x, sfHullSize.z)
    * sfLayoutStrength;
  float sfPanel = mod(floor(sfGrid.x) + floor(sfGrid.y) * 3.0, 4.0) / 3.0;
  float sfLeading = (1.0 - smoothstep(0.026, 0.026 + sfAA.x, sfCell.x)) * (1.0 - sfSeamAxes.x) * sfDeck * sfFineVisibility;
  float sfNoseBand = smoothstep(0.22, 0.23, sfLong) * (1.0 - smoothstep(0.29, 0.30, sfLong));
  float sfSternBand = smoothstep(-0.36, -0.35, sfLong) * (1.0 - smoothstep(-0.27, -0.26, sfLong));
  float sfStripe = 1.0 - smoothstep(0.013, 0.013 + fwidth(sfSpan), abs(sfSpan - 0.30));
  float sfMark = sfNoseBand * (0.32 + 0.68 * sfDeck) + sfStripe * 0.5;
  float sfUndercoat = 0.82 + sfPanel * 0.16 - sfSpine * 0.52 - sfShoulder * 0.23;
  // Two recessed equipment wells inside the central service deck. A wide bevel and louvres
  // describe manufacture at useful play distances, then fade together before becoming noise.
  float sfWellX = abs(fract((sfLong + 0.38) * 5.0) - 0.5) * 0.20;
  float sfWellEdge = max(sfWellX / 0.070, abs(sfP.z) / 0.115);
  float sfWellArea = sfDeck * smoothstep(-0.37, -0.35, sfLong)
    * (1.0 - smoothstep(0.015, 0.035, sfLong));
  float sfWellAA = max(fwidth(sfWellEdge), 0.025);
  float sfWell = (1.0 - smoothstep(0.85, 0.92 + sfWellAA, sfWellEdge)) * sfWellArea;
  float sfWellRim = (smoothstep(0.72, 0.82, sfWellEdge)
    - smoothstep(0.95, 1.02 + sfWellAA, sfWellEdge)) * sfWellArea;
  float sfLouvrePhase = sfLong * 75.0;
  float sfLouvreVisibility = 1.0 - smoothstep(0.25, 0.65, fwidth(sfLouvrePhase));
  float sfLouvre = pow(0.5 + 0.5 * cos(sfLouvrePhase * 6.283185), 2.0) * sfWell * sfLouvreVisibility;
  float sfEquipment = sfLayoutKind < 3.5 ? 1.0 : 0.0;
  sfSurfaceRelief += (sfWellRim * 0.002 - sfWell * 0.004 + sfLouvre * 0.0025)
    * max(sfHullSize.x, sfHullSize.z) * sfEquipment * sfLayoutStrength;
  if (sfLayoutKind > 1.5 && sfLayoutKind < 2.5) {
    // Working craft: diagonal safety comb at the power-pack, cream forward shoulder.
    float sfCombPhase = (sfLong + sfP.z * 0.30) * 36.0;
    float sfCombAA = max(fwidth(sfCombPhase), 0.01);
    float sfComb = smoothstep(-sfCombAA * 6.28, sfCombAA * 6.28, sin(sfCombPhase * 6.283185));
    float sfCombVisibility = 1.0 - smoothstep(0.15, 0.35, sfCombAA);
    sfMark = max(sfMark, sfSternBand * sfComb * sfDeck * sfCombVisibility);
    sfUndercoat -= sfSternBand * (1.0 - sfComb) * 0.38 * sfCombVisibility;
  } else if (sfLayoutKind > 2.5 && sfLayoutKind < 3.5) {
    // Patrol: swept chevrons and a dark armored central channel.
    float sfChevron = 1.0 - smoothstep(0.020, 0.030 + fwidth(sfLong), abs(sfLong - sfSpan * 0.65 - 0.11));
    sfMark = max(sfStripe * 0.8, sfChevron * sfDeck);
    sfUndercoat -= sfSpine * 0.12;
  } else if (sfLayoutKind > 3.5 && sfLayoutKind < 4.5) {
    // Habitats: concentric districts, radial access ways and warm docking aprons.
    float sfRadius = length(sfP.xz);
    float sfDistrict = fract(sfRadius * 8.0);
    float sfApron = 1.0 - smoothstep(0.06, 0.09 + fwidth(sfDistrict), abs(sfDistrict - 0.5));
    sfUndercoat = 0.65 + sfPanel * 0.22;
    sfMark = sfApron * sfDeck * 0.70;
  } else if (sfLayoutKind > 4.5 && sfLayoutKind < 5.5) {
    // Weapons: insulated dark barrel, service collar, forward emitter housing.
    sfUndercoat = 0.55 + (1.0 - smoothstep(-0.15, 0.12, sfLong)) * 0.35;
    sfMark = sfNoseBand + sfSternBand * 0.6;
  } else if (sfLayoutKind > 5.5 && sfLayoutKind < 6.5) {
    // Rectangular yards / military docks: access corridors between two equipment districts.
    float sfAccess = 1.0 - smoothstep(0.045, 0.065, abs(sfP.z - 0.14));
    float sfServiceBlock = (1.0 - smoothstep(-0.13, -0.08, sfLong)) * smoothstep(-0.18, -0.12, sfP.z);
    sfUndercoat = 0.72 + sfPanel * 0.16 - sfServiceBlock * 0.36;
    sfMark = sfAccess * sfDeck * 0.65 + sfNoseBand * sfShoulder;
  } else if (sfLayoutKind > 7.5) {
    // Wrecks: carbonized fracture ends and irregular surviving paint islands. Clean generic
    // service stripes would make salvage look like freshly manufactured traffic.
    float sfBreakup = sin(sfP.x * 37.0 + sin(sfP.z * 29.0)) * 0.08;
    float sfChar = smoothstep(0.12 + sfBreakup, 0.38 + sfBreakup, abs(sfLong));
    sfUndercoat = mix(0.58, 0.075, sfChar) + sfPanel * 0.08;
    sfMark = sfLeading * 0.15;
  } else if (sfLayoutKind > 6.5) {
    // Gate panels follow the upright aperture, never horizontal habitat rings.
    vec2 sfGatePlane = sfHullSize.z < min(sfHullSize.x, sfHullSize.y) ? sfP.xy
      : (sfHullSize.x < sfHullSize.y ? sfP.yz : sfP.xz);
    float sfGateAngle = atan(sfGatePlane.y, sfGatePlane.x);
    float sfGateWave = cos(sfGateAngle * 12.0);
    float sfGateAA = max(fwidth(sfGateWave), 0.02);
    float sfGateSegment = smoothstep(-sfGateAA, sfGateAA, sfGateWave);
    sfUndercoat = 0.48 + sfGateSegment * 0.32;
    sfMark = smoothstep(0.84 - sfGateAA, 0.95 + sfGateAA, sfGateWave) * 0.7;
  }
  vec3 sfPanelPaint = diffuseColor.rgb * max(0.12, sfUndercoat - sfSeam * 0.28);
  if (sfLayoutKind < 3.5) sfPanelPaint = mix(sfPanelPaint,
    vec3(0.015, 0.030, 0.050) * (0.65 + sfAlbedoY * 0.45), sfSpine * 0.72);
  sfPanelPaint = mix(sfPanelPaint, vec3(0.012, 0.023, 0.033) + sfLouvre * vec3(0.075, 0.11, 0.12),
    sfWell * sfEquipment * 0.92);
  sfPanelPaint += sfLayoutAccent * sfWellRim * sfEquipment * 0.095;
  sfPanelPaint = mix(sfPanelPaint, sfLayoutAccent * (0.42 + sfAlbedoY * 0.4), clamp(sfMark, 0.0, 1.0) * 0.83);
  sfPanelPaint += sfLayoutAccent * sfLeading * 0.045;
  // Saturated source decals survive. Explicit player paint changes the base, not the panel design.
  diffuseColor.rgb = mix(diffuseColor.rgb, sfPanelPaint, sfLayoutStrength * sfNeutralPaint);
`;
