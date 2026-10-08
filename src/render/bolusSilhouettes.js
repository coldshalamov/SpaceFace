// Pure silhouette recipes for Bolus fauna. No Three.
// The collider stays a ball. These shapes are what the mesh builder wears.
// A stopped louse, fingerling, or mite gains two splayed cards and nothing else.

const TISSUE = 0x8a5048;
const TENDON = 0x5a2828;
const SUTURE = 0xf4f1ea;
const STONE = 0x6a5848;
const PALE = 0xc4b59a;

function quad(id, a, b, c, d, color, glow) {
  return {
    id,
    color,
    tissue: !glow,
    glow: !!glow,
    indices: null,
    positions: [
      a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2],
      a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2],
    ],
  };
}

function tri(id, a, b, c, color, glow) {
  return {
    id,
    color,
    tissue: !glow,
    glow: !!glow,
    indices: null,
    positions: [a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]],
  };
}

function clonePart(part) {
  return {
    id: part.id,
    color: part.color,
    tissue: part.tissue,
    glow: part.glow,
    indices: part.indices,
    positions: part.positions.slice(),
  };
}

function strap(id, color, length, thick, y) {
  const h = length / 2;
  const t = thick;
  return quad(id, [-h, y, -t], [h, y, -t], [h, y, t], [-h, y, t], color);
}

function bulb(id, color, r, x) {
  return quad(
    id,
    [x - r, r * 0.35, -r * 0.4],
    [x + r, r * 0.2, -r * 0.2],
    [x + r * 0.8, -r * 0.15, r * 0.45],
    [x - r * 0.7, -r * 0.3, r * 0.2],
    color,
  );
}

function buildKnob() {
  return {
    parts: [
      bulb('knob_bulb', TISSUE, 0.7, 0),
      strap('knob_root', TISSUE, 0.8, 0.12, -0.35),
    ],
  };
}

function buildTendon() {
  return { parts: [strap('tendon_strap', TENDON, 2.4, 0.08, 0)] };
}

function buildTooth() {
  const knob = buildKnob();
  const barb = quad(
    'tooth_barb',
    [0.35, 0.05, 0.02],
    [1.45, 0.22, 0.08],
    [1.2, -0.08, 0.18],
    [0.4, -0.02, 0.04],
    TISSUE,
  );
  return { parts: knob.parts.map(clonePart).concat([barb]) };
}

function buildSuture() {
  return {
    parts: [
      strap('suture_strap', SUTURE, 2.4, 0.08, 0),
      quad('suture_stitch', [-0.15, 0.22, 0], [0.15, 0.22, 0], [0.05, -0.22, 0.04], [-0.05, -0.22, 0.04], SUTURE),
    ],
  };
}

function buildTendril() {
  return {
    parts: [
      strap('tendril_stem', TISSUE, 1.6, 0.1, 0),
      quad('fork_a', [0.2, 0.05, 0], [1.3, 0.55, 0.4], [1.15, 0.15, 0.55], [0.25, -0.05, 0.08], TISSUE),
      quad('fork_b', [0.2, -0.05, 0], [1.25, -0.6, -0.35], [1.05, -0.2, -0.5], [0.22, 0.02, -0.06], TISSUE),
    ],
  };
}

function buildLantern() {
  return {
    parts: [
      strap('lantern_shaft', PALE, 0.15, 0.08, 0.9),
      bulb('lantern_sac', TISSUE, 0.45, 0),
      tri('lantern_glow', [0, 0.55, 0], [0.18, 0.15, 0.08], [-0.12, 0.15, -0.1], 0xffb090, true),
    ],
  };
}

function buildFingerling() {
  return {
    parts: [
      quad('fingerling_sliver', [-1.3, 0.02, -0.05], [1.3, 0.04, -0.04], [1.15, 0.02, 0.08], [-1.2, -0.02, 0.06], TISSUE),
    ],
  };
}

function buildLouse() {
  return {
    parts: [
      quad('louse_coin', [-0.7, 0.04, -0.55], [0.7, 0.05, -0.5], [0.62, 0.03, 0.58], [-0.66, 0.02, 0.52], 0x6a3038),
    ],
  };
}

function buildDrum() {
  return {
    parts: [
      quad('drum_skin', [-0.8, 0.05, -0.8], [0.8, 0.06, -0.75], [0.75, 0.04, 0.8], [-0.78, 0.03, 0.76], TISSUE),
      quad('drum_rim', [-0.85, 0.12, -0.1], [0.85, 0.12, -0.1], [0.85, -0.02, 0.1], [-0.85, -0.02, 0.1], 0x4a2428),
    ],
  };
}

function buildValve() {
  return {
    parts: [
      quad('valve_lip', [-0.9, 0.4, 0], [0.2, 0.55, 0.1], [0.4, -0.1, 0.25], [-0.7, -0.35, 0.05], 0x9a6070),
    ],
  };
}

function buildGlove() {
  return {
    parts: [
      quad('glove_palm', [-0.45, 0.05, -0.35], [0.35, 0.08, -0.3], [0.4, 0.02, 0.4], [-0.4, 0, 0.35], TISSUE),
      quad('glove_digit_0', [0.3, 0.1, -0.2], [0.95, 0.22, -0.28], [0.9, 0.05, -0.05], [0.28, 0.02, 0], TISSUE),
      quad('glove_digit_1', [0.32, 0.08, 0.05], [1.05, 0.12, 0.12], [0.98, 0.02, 0.28], [0.3, 0, 0.18], TISSUE),
      quad('glove_digit_2', [0.2, 0.06, 0.25], [0.8, 0.02, 0.55], [0.7, -0.04, 0.62], [0.15, -0.02, 0.3], TISSUE),
    ],
  };
}

function buildHauler() {
  const parts = [];
  const angles = [0.2, 0.9, 1.6, 2.3, 3.0, 3.7, 4.4];
  for (let i = 0; i < angles.length; i++) {
    const a = angles[i];
    const x = Math.cos(a) * 1.2;
    const z = Math.sin(a) * 1.2;
    const tx = Math.cos(a + 0.35) * 1.15;
    const tz = Math.sin(a + 0.35) * 1.15;
    parts.push(quad(
      `plate_${i}`,
      [x, 0.25, z],
      [tx, 0.25, tz],
      [tx * 0.7, -0.15, tz * 0.7],
      [x * 0.7, -0.15, z * 0.7],
      0x5c463c,
    ));
  }
  return { parts };
}

function buildRib() {
  return {
    parts: [
      quad('rib_hook', [-0.2, 0.9, 0], [0.55, 0.7, 0.1], [0.7, -0.4, 0.15], [-0.05, -0.2, 0], TISSUE),
      quad('rib_return', [0.55, 0.7, 0.1], [0.15, 0.95, -0.2], [-0.1, 0.4, -0.15], [0.4, 0.2, 0.05], TISSUE),
    ],
  };
}

function buildBezoar() {
  return {
    parts: [
      quad('bezoar_stone', [-1.15, 0.12, -0.35], [0.95, 0.28, -0.2], [0.8, -0.08, 0.25], [-0.9, -0.18, 0.15], STONE),
      tri('bezoar_lump', [0.1, 0.45, 0], [-0.2, 0.15, 0.2], [0.25, 0.1, -0.2], STONE),
    ],
  };
}

function buildMite() {
  return {
    parts: [
      tri('mite_body', [-0.18, 0.02, -0.08], [0.22, 0.03, 0], [-0.05, 0.01, 0.12], 0x4a2030),
    ],
  };
}

function buildNerve() {
  return {
    parts: [
      quad('nerve_cord', [-1.2, 0.08, -0.05], [-0.2, 0.2, 0.15], [0.7, -0.05, 0.2], [1.2, 0.1, -0.1], TISSUE),
    ],
  };
}

function buildRing() {
  const positions = [];
  const R = 0.9;
  const tube = 0.18;
  const U = 12;
  const V = 6;
  for (let i = 0; i < U; i++) {
    const u = (i / U) * Math.PI * 2;
    for (let j = 0; j < V; j++) {
      const v = (j / V) * Math.PI * 2;
      const cx = Math.cos(u) * R;
      const cz = Math.sin(u) * R;
      positions.push(
        cx + Math.cos(u) * Math.cos(v) * tube,
        Math.sin(v) * tube,
        cz + Math.sin(u) * Math.cos(v) * tube,
      );
    }
  }
  const indices = [];
  for (let i = 0; i < U; i++) {
    const i2 = (i + 1) % U;
    for (let j = 0; j < V; j++) {
      const j2 = (j + 1) % V;
      const a = i * V + j;
      const b = i2 * V + j;
      const c = i2 * V + j2;
      const d = i * V + j2;
      indices.push(a, b, c, a, c, d);
    }
  }
  return {
    parts: [{
      id: 'ring_torus',
      color: PALE,
      tissue: true,
      glow: false,
      positions,
      indices,
    }],
  };
}

function buildHairball() {
  return {
    parts: [
      strap('hair_0', TISSUE, 1.4, 0.06, 0.2),
      strap('hair_1', TISSUE, 1.1, 0.05, -0.15),
      quad('hair_knot', [-0.2, 0.3, -0.2], [0.3, 0.25, 0.1], [0.1, -0.2, 0.3], [-0.25, -0.1, -0.1], 0x3a1818),
    ],
  };
}

function buildBaleen() {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const z = -0.4 + i * 0.2;
    parts.push(quad(`baleen_plate_${i}`, [-0.15, 0.7, z], [0.15, 0.65, z], [0.12, -0.4, z + 0.04], [-0.12, -0.45, z + 0.02], 0x7a4038));
  }
  return { parts };
}

function buildFloater() {
  return {
    parts: [
      quad('floater_sac', [-0.35, 0.5, -0.2], [0.3, 0.45, -0.15], [0.45, -0.35, 0.2], [-0.4, -0.2, 0.25], TISSUE),
      tri('floater_nipple', [0, -0.35, 0], [0.12, -0.7, 0.05], [-0.1, -0.55, -0.04], TISSUE),
    ],
  };
}

function buildBlister() {
  const lantern = buildLantern();
  return {
    parts: lantern.parts.map(clonePart).concat([
      bulb('blister_cap', 0xc49890, 0.28, 0.35),
    ]),
  };
}

function buildCyst() {
  const floater = buildFloater();
  return {
    parts: floater.parts.map(clonePart).concat([
      bulb('cyst_node', PALE, 0.22, -0.4),
    ]),
  };
}

function buildPolyp() {
  return {
    parts: [
      strap('polyp_stalk', TISSUE, 0.4, 0.1, 0.3),
      bulb('polyp_head', 0x9a4060, 0.55, 0),
    ],
  };
}

function buildConcretion() {
  const stone = buildBezoar();
  return {
    parts: stone.parts.map(clonePart).concat([
      tri('concretion_grit', [0.45, 0.05, 0.1], [0.9, 0.2, 0.15], [0.7, -0.15, 0.35], STONE),
    ]),
  };
}

function buildPapilla() {
  return { parts: [bulb('papilla_bud', 0x9a6860, 0.4, 0.1), strap('papilla_neck', TISSUE, 0.5, 0.08, -0.3)] };
}

function buildHush() {
  return { parts: [strap('hush_pin', PALE, 0.3, 0.06, 0.4), quad('hush_head', [-0.18, 0.7, -0.08], [0.18, 0.72, -0.06], [0.1, 0.35, 0.08], [-0.1, 0.35, 0.06], PALE)] };
}

function buildSpur() {
  return { parts: [tri('spur_spike', [0, 0.9, 0], [0.16, -0.2, 0.08], [-0.14, -0.25, -0.06], TISSUE)] };
}

function buildFrenum() {
  return { parts: [strap('frenum_strap', 0x6a3838, 1.1, 0.07, 0.05)] };
}

function buildComb() {
  const parts = [strap('comb_back', TISSUE, 1.2, 0.08, 0)];
  for (let i = 0; i < 6; i++) {
    const x = -0.5 + i * 0.2;
    parts.push(tri(`comb_tooth_${i}`, [x, 0, 0], [x + 0.06, 0, 0], [x + 0.03, -0.45, 0.04], TISSUE));
  }
  return { parts };
}

function buildUvula() {
  return {
    parts: [
      strap('uvula_root', TISSUE, 0.4, 0.1, 0.6),
      quad('uvula_drop', [-0.28, 0.4, -0.1], [0.28, 0.35, -0.08], [0.12, -0.7, 0.05], [-0.1, -0.65, 0.08], 0x8a4060),
    ],
  };
}

function buildCrook() {
  return {
    parts: [
      quad('crook_staff', [-0.08, 0.9, 0], [0.08, 0.9, 0], [0.1, -0.8, 0.05], [-0.1, -0.8, 0.02], TISSUE),
      quad('crook_hook', [0.08, 0.85, 0], [0.7, 0.95, 0.1], [0.75, 0.45, 0.15], [0.1, 0.55, 0.02], TISSUE),
    ],
  };
}

function buildPleat() {
  return {
    parts: [
      quad('pleat_a', [-0.8, 0.15, -0.2], [0.8, 0.2, -0.15], [0.7, 0.05, 0.05], [-0.75, 0, 0], TISSUE),
      quad('pleat_b', [-0.7, 0, 0.02], [0.75, 0.05, 0.08], [0.6, -0.2, 0.35], [-0.65, -0.18, 0.28], 0x6a3040),
    ],
  };
}

const BUILDERS = {
  bolus_knob: buildKnob,
  bolus_tendon: buildTendon,
  bolus_tooth: buildTooth,
  bolus_suture: buildSuture,
  bolus_tendril: buildTendril,
  bolus_lantern: buildLantern,
  bolus_fingerling: buildFingerling,
  bolus_louse: buildLouse,
  bolus_drum: buildDrum,
  bolus_valve: buildValve,
  bolus_glove: buildGlove,
  bolus_hauler: buildHauler,
  bolus_rib: buildRib,
  bolus_bezoar: buildBezoar,
  bolus_mite: buildMite,
  bolus_nerve: buildNerve,
  bolus_ring: buildRing,
  bolus_hairball: buildHairball,
  bolus_baleen: buildBaleen,
  bolus_floater: buildFloater,
  bolus_blister: buildBlister,
  bolus_cyst: buildCyst,
  bolus_polyp: buildPolyp,
  bolus_concretion: buildConcretion,
  bolus_papilla: buildPapilla,
  bolus_hush: buildHush,
  bolus_spur: buildSpur,
  bolus_frenum: buildFrenum,
  bolus_comb: buildComb,
  bolus_uvula: buildUvula,
  bolus_crook: buildCrook,
  bolus_pleat: buildPleat,
};

const FREEZE = new Set(['bolus_louse', 'bolus_fingerling', 'bolus_mite']);

function splayCards() {
  return [
    quad('splay_card_0', [-0.9, 0.02, 0.05], [-0.15, 0.2, 0.1], [-0.2, -0.05, 0.35], [-0.85, -0.12, 0.2], PALE),
    quad('splay_card_1', [0.15, 0.18, 0.08], [0.95, 0.02, 0.12], [0.8, -0.1, 0.32], [0.2, -0.02, 0.28], PALE),
  ];
}

export function bolusSilhouette(speciesId, pose) {
  const build = BUILDERS[speciesId] || buildKnob;
  const recipe = build();
  const parts = recipe.parts.map(clonePart);
  if (pose && pose.stopped && FREEZE.has(speciesId)) parts.push(...splayCards());
  return { speciesId, parts };
}

export function bolusSilhouetteIds() {
  return Object.keys(BUILDERS);
}

export function partCentroid(mesh) {
  const p = mesh.positions;
  let x = 0;
  let y = 0;
  let z = 0;
  const n = p.length / 3;
  for (let i = 0; i < n; i++) {
    x += p[i * 3];
    y += p[i * 3 + 1];
    z += p[i * 3 + 2];
  }
  return { x: x / n, y: y / n, z: z / n };
}

export function colorChannelMax(hex) {
  return Math.max((hex >> 16) & 255, (hex >> 8) & 255, hex & 255) / 255;
}
