// Collision-authoritative rescue components.
//
// These are the bodies the 60 Hz witness collides and the stages measure.
// They are not published Forge GLBs. Intact and damaged states change the
// part list the integrator uses. See ADAPTER.md for the withheld asset pass.

export const MERCY_MODELS = Object.freeze({
  SF_MERCY_BEACON: Object.freeze({
    name: 'Distress beacon',
    lod: Object.freeze([18, 70, 160]),
    publishedGlb: 'assets/ships/release/parts/places/place_nav_buoy.glb',
    states: Object.freeze({
      intact: Object.freeze({
        emits: true,
        parts: Object.freeze([
          Object.freeze({ x: 0, z: 0, r: 1.15 }),
          Object.freeze({ x: 0, z: 2.2, r: 0.45 }),
        ]),
      }),
      damaged: Object.freeze({
        emits: false,
        parts: Object.freeze([
          Object.freeze({ x: 0, z: 0, r: 0.7 }),
        ]),
      }),
      destroyed: Object.freeze({ emits: false, parts: Object.freeze([]) }),
    }),
  }),
  SF_MERCY_CAPSULE: Object.freeze({
    name: 'Winchable life capsule',
    lod: Object.freeze([16, 60, 140]),
    publishedGlb: 'assets/ships/release/parts/places/place_47a_rescue_capsule.glb',
    states: Object.freeze({
      intact: Object.freeze({
        emits: false,
        parts: Object.freeze([
          Object.freeze({ x: 0, z: -1.6, r: 1.7 }),
          Object.freeze({ x: 0, z: 1.6, r: 1.7 }),
        ]),
      }),
      damaged: Object.freeze({
        emits: false,
        parts: Object.freeze([
          Object.freeze({ x: 0, z: 0, r: 2.7 }),
          Object.freeze({ x: 1.4, z: 0.4, r: 0.8 }),
        ]),
      }),
      destroyed: Object.freeze({ emits: false, parts: Object.freeze([]) }),
    }),
  }),
  SF_MERCY_TRUSS: Object.freeze({
    name: 'Folding rescue truss',
    lod: Object.freeze([20, 80, 180]),
    publishedGlb: 'assets/ships/release/parts/places/place_conveyor_truss.glb',
    states: Object.freeze({
      intact: Object.freeze({
        emits: false,
        parts: Object.freeze([
          Object.freeze({ x: -4.5, z: 0, r: 1.3 }),
          Object.freeze({ x: 0, z: 0, r: 1.3 }),
          Object.freeze({ x: 4.5, z: 0, r: 1.3 }),
        ]),
      }),
      damaged: Object.freeze({
        emits: false,
        parts: Object.freeze([
          Object.freeze({ x: 0, z: 0, r: 1.6 }),
        ]),
      }),
      destroyed: Object.freeze({ emits: false, parts: Object.freeze([]) }),
    }),
  }),
  SF_MERCY_BERTH: Object.freeze({
    name: 'Rescue berth',
    lod: Object.freeze([30, 100, 220]),
    publishedGlb: 'assets/ships/release/parts/places/place_improvised_dock.glb',
    states: Object.freeze({
      intact: Object.freeze({
        emits: false,
        parts: Object.freeze([
          Object.freeze({ x: -11, z: -8, r: 1.25 }),
          Object.freeze({ x: 11, z: -8, r: 1.25 }),
          Object.freeze({ x: -11, z: 8, r: 1.25 }),
          Object.freeze({ x: 11, z: 8, r: 1.25 }),
        ]),
      }),
      damaged: Object.freeze({
        emits: false,
        parts: Object.freeze([
          Object.freeze({ x: -5, z: 0, r: 1.6 }),
          Object.freeze({ x: 5, z: 0, r: 1.6 }),
          Object.freeze({ x: 0, z: 4, r: 1.8 }),
        ]),
      }),
      destroyed: Object.freeze({ emits: false, parts: Object.freeze([]) }),
    }),
  }),
  SF_MERCY_BARGE: Object.freeze({
    name: 'Evacuation barge',
    lod: Object.freeze([28, 90, 200]),
    publishedGlb: 'assets/ships/release/parts/places/place_shuttle_dock.glb',
    states: Object.freeze({
      intact: Object.freeze({
        emits: false,
        parts: Object.freeze([
          Object.freeze({ x: 10, z: 0, r: 1.45 }),
          Object.freeze({ x: -10, z: 0, r: 1.45 }),
          Object.freeze({ x: 0, z: 10, r: 1.45 }),
          Object.freeze({ x: 0, z: -10, r: 1.45 }),
          Object.freeze({ x: 7, z: 7, r: 1.3 }),
          Object.freeze({ x: -7, z: 7, r: 1.3 }),
          Object.freeze({ x: 7, z: -7, r: 1.3 }),
          Object.freeze({ x: -7, z: -7, r: 1.3 }),
        ]),
      }),
      damaged: Object.freeze({
        emits: false,
        parts: Object.freeze([
          Object.freeze({ x: 0, z: 0, r: 6.5 }),
        ]),
      }),
      destroyed: Object.freeze({ emits: false, parts: Object.freeze([]) }),
    }),
  }),
  SF_MERCY_GANTRY: Object.freeze({
    name: 'Yard gantry arm',
    lod: Object.freeze([24, 90, 200]),
    publishedGlb: 'assets/ships/release/parts/places/place_maintenance_gantry.glb',
    states: Object.freeze({
      intact: Object.freeze({
        emits: false,
        parts: Object.freeze([
          Object.freeze({ x: 0, z: 0, r: 2.4 }),
          Object.freeze({ x: 6, z: 0, r: 1.8 }),
          Object.freeze({ x: 12, z: 0, r: 1.8 }),
          Object.freeze({ x: 18, z: 0, r: 2.1 }),
        ]),
      }),
      damaged: Object.freeze({
        emits: false,
        parts: Object.freeze([
          Object.freeze({ x: 0, z: 0, r: 2.2 }),
          Object.freeze({ x: 6, z: 0, r: 1.6 }),
        ]),
      }),
      destroyed: Object.freeze({ emits: false, parts: Object.freeze([]) }),
    }),
  }),
  SF_MERCY_TANK: Object.freeze({
    name: 'Volatile tank car',
    lod: Object.freeze([22, 80, 180]),
    publishedGlb: 'assets/ships/release/parts/places/place_cargo_pod_hazmat.glb',
    states: Object.freeze({
      intact: Object.freeze({
        emits: false,
        parts: Object.freeze([
          Object.freeze({ x: -3.2, z: 0, r: 3.1 }),
          Object.freeze({ x: 3.2, z: 0, r: 3.1 }),
        ]),
      }),
      damaged: Object.freeze({
        emits: false,
        parts: Object.freeze([
          Object.freeze({ x: 0, z: 0, r: 3.6 }),
          Object.freeze({ x: 2.4, z: 1.2, r: 1.1 }),
        ]),
      }),
      destroyed: Object.freeze({ emits: false, parts: Object.freeze([]) }),
    }),
  }),
  SF_MERCY_SHEAR: Object.freeze({
    name: 'Shear and crusher jaw',
    lod: Object.freeze([22, 80, 180]),
    publishedGlb: 'assets/ships/release/parts/places/place_aftermath_aft_cargo_module.glb',
    states: Object.freeze({
      intact: Object.freeze({
        emits: false,
        parts: Object.freeze([
          Object.freeze({ x: -2.4, z: 0, r: 2.6 }),
          Object.freeze({ x: 2.4, z: 0, r: 2.6 }),
        ]),
      }),
      damaged: Object.freeze({
        emits: false,
        parts: Object.freeze([
          Object.freeze({ x: 0, z: 0, r: 2.2 }),
        ]),
      }),
      destroyed: Object.freeze({ emits: false, parts: Object.freeze([]) }),
    }),
  }),
  SF_MERCY_WELL: Object.freeze({
    name: 'Gravity-shear mouth',
    lod: Object.freeze([30, 110, 240]),
    publishedGlb: 'assets/ships/release/parts/places/place_interdiction_buoy.glb',
    states: Object.freeze({
      intact: Object.freeze({
        emits: false,
        parts: Object.freeze([
          Object.freeze({ x: 0, z: 0, r: 4.5 }),
          Object.freeze({ x: 6.5, z: 0, r: 1.2 }),
          Object.freeze({ x: -6.5, z: 0, r: 1.2 }),
          Object.freeze({ x: 0, z: 6.5, r: 1.2 }),
          Object.freeze({ x: 0, z: -6.5, r: 1.2 }),
        ]),
      }),
      damaged: Object.freeze({
        emits: false,
        parts: Object.freeze([
          Object.freeze({ x: 0, z: 0, r: 3.2 }),
        ]),
      }),
      destroyed: Object.freeze({ emits: false, parts: Object.freeze([]) }),
    }),
  }),
});

export const MODEL_IDS = Object.freeze(Object.keys(MERCY_MODELS));

export function modelStateOf(hull, hullMax, alive) {
  if (!alive || !(hull > 0)) return 'destroyed';
  if (!(hullMax > 0)) return 'intact';
  return hull / hullMax < 0.5 ? 'damaged' : 'intact';
}

export function modelDef(modelId, state) {
  const model = MERCY_MODELS[modelId];
  if (!model) return null;
  return model.states[state] || model.states.intact;
}

export function refreshModel(body) {
  if (!body) return body;
  const next = modelStateOf(body.hull, body.hullMax, body.alive);
  if (body.modelLock === 'damaged' && next === 'intact') body.modelState = 'damaged';
  else body.modelState = next;
  const spec = modelDef(body.model, body.modelState);
  body.emits = !!(spec && spec.emits && body.role === 'beacon' && body.alive);
  return body;
}

export function worldParts(body) {
  const spec = modelDef(body.model, body.modelState || 'intact');
  const parts = spec && spec.parts ? spec.parts : [];
  const c = Math.cos(body.rot || 0);
  const s = Math.sin(body.rot || 0);
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    out.push({
      x: body.pos.x + c * p.x - s * p.z,
      z: body.pos.z + s * p.x + c * p.z,
      r: p.r,
    });
  }
  return out;
}

export function deepestOverlap(a, b) {
  const pa = worldParts(a);
  const pb = worldParts(b);
  let best = null;
  for (let i = 0; i < pa.length; i++) {
    for (let j = 0; j < pb.length; j++) {
      const p = pa[i];
      const q = pb[j];
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const rr = p.r + q.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 1e-6;
      const pen = rr - d;
      if (!best || pen > best.pen) best = { pen, nx: dx / d, nz: dz / d };
    }
  }
  return best;
}
