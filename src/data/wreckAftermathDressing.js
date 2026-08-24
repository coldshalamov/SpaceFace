// PQ-136.00 — wreck & aftermath pack catalog and ordinary-sector placement.
//
// Forty-four legal release bodies (37 source + 7 authored-down). Place IDs resolve
// through partsLibrary behind the wreckAftermath flag. Dressing uses a dedicated
// sector-seeded stream so the world dressing/combat RNG (and therefore Save/Continue)
// does not shift. Wrecks are landmarks: one family per field, hero hulls rare,
// fragments shed from that family's fracture grammar, never station-apron confetti.

export const WRECK_AFTERMATH_SALT = 'wreckAftermath';
export const WRECK_AFTERMATH_MAX_PER_SECTOR = 4;
export const WRECK_AFTERMATH_MAX_BATTLE_PER_SECTOR = 6;
export const WRECK_AFTERMATH_MAX_CORE_PER_SECTOR = 2;
export const WRECK_AFTERMATH_STATION_APRON = 480;
export const WRECK_AFTERMATH_HEAVY_MESH_LIMIT = 90;
export const WRECK_AFTERMATH_SKIP_SECTORS = Object.freeze(['sector_helios_prime']);

const RELEASE_PLACES = 'assets/ships/release/parts/places';

// Complete `assets/...glb` literals so check:asset-reachability counts the pack.
export const WRECK_AFTERMATH_RELEASE_URL_BY_ID = Object.freeze({
  place_aftermath_wreck_ore_freighter_bow: 'assets/ships/release/parts/places/place_aftermath_wreck_ore_freighter_bow.glb',
  place_aftermath_wreck_ore_freighter_stern: 'assets/ships/release/parts/places/place_aftermath_wreck_ore_freighter_stern.glb',
  place_aftermath_wreck_ore_freighter_hopper: 'assets/ships/release/parts/places/place_aftermath_wreck_ore_freighter_hopper.glb',
  place_aftermath_wreck_ore_freighter_hopper_authored_down: 'assets/ships/release/parts/places/place_aftermath_wreck_ore_freighter_hopper_authored_down.glb',
  place_aftermath_wreck_ore_freighter_bow__fresh: 'assets/ships/release/parts/places/place_aftermath_wreck_ore_freighter_bow__fresh.glb',
  place_aftermath_wreck_ore_freighter_bow__derelict: 'assets/ships/release/parts/places/place_aftermath_wreck_ore_freighter_bow__derelict.glb',
  place_aftermath_wreck_ore_freighter_bow__stripped: 'assets/ships/release/parts/places/place_aftermath_wreck_ore_freighter_bow__stripped.glb',
  place_aftermath_deb_ore_freighter_ring_span: 'assets/ships/release/parts/places/place_aftermath_deb_ore_freighter_ring_span.glb',
  place_aftermath_deb_ore_freighter_hopper_lid: 'assets/ships/release/parts/places/place_aftermath_deb_ore_freighter_hopper_lid.glb',
  place_aftermath_deb_ore_freighter_hopper_lid_authored_down: 'assets/ships/release/parts/places/place_aftermath_deb_ore_freighter_hopper_lid_authored_down.glb',
  place_aftermath_deb_ore_freighter_drive_bell: 'assets/ships/release/parts/places/place_aftermath_deb_ore_freighter_drive_bell.glb',
  place_aftermath_wreck_corvette_forward: 'assets/ships/release/parts/places/place_aftermath_wreck_corvette_forward.glb',
  place_aftermath_wreck_corvette_engine: 'assets/ships/release/parts/places/place_aftermath_wreck_corvette_engine.glb',
  place_aftermath_wreck_corvette_turret: 'assets/ships/release/parts/places/place_aftermath_wreck_corvette_turret.glb',
  place_aftermath_wreck_corvette_forward__fresh: 'assets/ships/release/parts/places/place_aftermath_wreck_corvette_forward__fresh.glb',
  place_aftermath_wreck_corvette_forward__stripped_heavy: 'assets/ships/release/parts/places/place_aftermath_wreck_corvette_forward__stripped_heavy.glb',
  place_aftermath_deb_corvette_armor_belt: 'assets/ships/release/parts/places/place_aftermath_deb_corvette_armor_belt.glb',
  place_aftermath_deb_corvette_barbette_ring: 'assets/ships/release/parts/places/place_aftermath_deb_corvette_barbette_ring.glb',
  place_aftermath_wreck_liner_drum: 'assets/ships/release/parts/places/place_aftermath_wreck_liner_drum.glb',
  place_aftermath_wreck_liner_bow: 'assets/ships/release/parts/places/place_aftermath_wreck_liner_bow.glb',
  place_aftermath_wreck_liner_bow_authored_down: 'assets/ships/release/parts/places/place_aftermath_wreck_liner_bow_authored_down.glb',
  place_aftermath_wreck_liner_boatbay: 'assets/ships/release/parts/places/place_aftermath_wreck_liner_boatbay.glb',
  place_aftermath_wreck_liner_boatbay_authored_down: 'assets/ships/release/parts/places/place_aftermath_wreck_liner_boatbay_authored_down.glb',
  place_aftermath_wreck_liner_drum__fresh: 'assets/ships/release/parts/places/place_aftermath_wreck_liner_drum__fresh.glb',
  place_aftermath_wreck_liner_drum__derelict: 'assets/ships/release/parts/places/place_aftermath_wreck_liner_drum__derelict.glb',
  place_aftermath_deb_liner_hull_panel: 'assets/ships/release/parts/places/place_aftermath_deb_liner_hull_panel.glb',
  place_aftermath_deb_liner_hull_panel_authored_down: 'assets/ships/release/parts/places/place_aftermath_deb_liner_hull_panel_authored_down.glb',
  place_aftermath_deb_liner_drive_pod: 'assets/ships/release/parts/places/place_aftermath_deb_liner_drive_pod.glb',
  place_aftermath_aft_engine_section: 'assets/ships/release/parts/places/place_aftermath_aft_engine_section.glb',
  place_aftermath_aft_weapon_spar: 'assets/ships/release/parts/places/place_aftermath_aft_weapon_spar.glb',
  place_aftermath_aft_cargo_module: 'assets/ships/release/parts/places/place_aftermath_aft_cargo_module.glb',
  place_aftermath_aft_cockpit_section: 'assets/ships/release/parts/places/place_aftermath_aft_cockpit_section.glb',
  place_aftermath_aft_radiator_panel: 'assets/ships/release/parts/places/place_aftermath_aft_radiator_panel.glb',
  place_aftermath_aft_pressure_tank: 'assets/ships/release/parts/places/place_aftermath_aft_pressure_tank.glb',
  place_aftermath_aft_armor_slab: 'assets/ships/release/parts/places/place_aftermath_aft_armor_slab.glb',
  place_aftermath_aft_armor_slab_authored_down: 'assets/ships/release/parts/places/place_aftermath_aft_armor_slab_authored_down.glb',
  place_aftermath_aft_dock_collar: 'assets/ships/release/parts/places/place_aftermath_aft_dock_collar.glb',
  place_aftermath_frag_plate_curl: 'assets/ships/release/parts/places/place_aftermath_frag_plate_curl.glb',
  place_aftermath_frag_rib_cluster: 'assets/ships/release/parts/places/place_aftermath_frag_rib_cluster.glb',
  place_aftermath_frag_cable_bundle: 'assets/ships/release/parts/places/place_aftermath_frag_cable_bundle.glb',
  place_aftermath_frag_grating_sheet: 'assets/ships/release/parts/places/place_aftermath_frag_grating_sheet.glb',
  place_aftermath_frag_grating_sheet_authored_down: 'assets/ships/release/parts/places/place_aftermath_frag_grating_sheet_authored_down.glb',
  place_aftermath_frag_pipe_tangle: 'assets/ships/release/parts/places/place_aftermath_frag_pipe_tangle.glb',
  place_aftermath_frag_strut_shard: 'assets/ships/release/parts/places/place_aftermath_frag_strut_shard.glb',
});

function row(donorId, kind, family, grammar, longestM, meshes, opts = {}) {
  const authoredDown = opts.authoredDown === true;
  const id = authoredDown
    ? `place_aftermath_${donorId}_authored_down`
    : `place_aftermath_${donorId}`;
  const heavy = meshes > WRECK_AFTERMATH_HEAVY_MESH_LIMIT;
  const spawn = opts.spawn !== false && !heavy;
  const radius = Math.max(8, Math.min(90, Math.round(Number(longestM) * 0.5)));
  return Object.freeze({
    id,
    stem: donorId,
    kind,
    family,
    grammar,
    longestM,
    meshes,
    heavy,
    spawn,
    live: opts.live !== false,
    authoredDown,
    file: `places/${id}.glb`,
    releaseUrl: WRECK_AFTERMATH_RELEASE_URL_BY_ID[id],
    releasePath: `${RELEASE_PLACES}/${id}.glb`,
    radius,
    label: opts.label || donorId,
  });
}

// Live dressing prefers the seven authored-down bodies (PBR). Heavy hero hulls stay
// routed for reachability but are not ordinary-sector landmarks — their mesh counts
// are a documented draw-load class, not a quality cut of the visible field.
const LIVE_MODELS = Object.freeze([
  row('aft_armor_slab', 'component', 'corvette', 'plated', 18, 12, { authoredDown: true, label: 'Torn Armor Slab' }),
  row('aft_cargo_module', 'component', 'ore_freighter', 'truss', 15, 17, { label: 'Split Cargo Module' }),
  row('aft_cockpit_section', 'component', 'shared', 'plated', 21, 28, { label: 'Cockpit Section' }),
  row('aft_dock_collar', 'component', 'liner', 'pressure', 16, 28, { label: 'Severed Dock Collar' }),
  row('aft_engine_section', 'component', 'ore_freighter', 'truss', 25, 31, { label: 'Torn Engine Section' }),
  row('aft_pressure_tank', 'component', 'liner', 'pressure', 17, 23, { label: 'Burst Pressure Tank' }),
  row('aft_radiator_panel', 'component', 'ore_freighter', 'truss', 24, 17, { label: 'Shed Radiator Panel' }),
  row('aft_weapon_spar', 'component', 'corvette', 'plated', 28, 22, { label: 'Snapped Weapon Spar' }),

  row('deb_corvette_armor_belt', 'debris', 'corvette', 'plated', 23, 16, { label: 'Corvette Armor Belt' }),
  row('deb_corvette_barbette_ring', 'debris', 'corvette', 'plated', 11, 15, { label: 'Cut Barbette Ring' }),
  row('deb_liner_drive_pod', 'debris', 'liner', 'pressure', 18, 21, { label: 'Liner Drive Pod' }),
  row('deb_liner_hull_panel', 'debris', 'liner', 'pressure', 29, 11, { authoredDown: true, label: 'Liner Hull Panel' }),
  row('deb_ore_freighter_drive_bell', 'debris', 'ore_freighter', 'truss', 16, 15, { label: 'Freighter Drive Bell' }),
  row('deb_ore_freighter_hopper_lid', 'debris', 'ore_freighter', 'truss', 32, 12, { authoredDown: true, label: 'Hopper Lid' }),
  row('deb_ore_freighter_ring_span', 'debris', 'ore_freighter', 'truss', 53, 27, { label: 'Freighter Ring Span' }),

  row('frag_cable_bundle', 'fragment', 'shared', 'truss', 8, 8, { label: 'Cable Bundle' }),
  row('frag_grating_sheet', 'fragment', 'shared', 'plated', 8, 6, { authoredDown: true, label: 'Deck Grating' }),
  row('frag_pipe_tangle', 'fragment', 'shared', 'pressure', 5, 7, { label: 'Pipe Tangle' }),
  row('frag_plate_curl', 'fragment', 'shared', 'plated', 6, 3, { label: 'Curled Plate' }),
  row('frag_rib_cluster', 'fragment', 'shared', 'truss', 6, 6, { label: 'Rib Cluster' }),
  row('frag_strut_shard', 'fragment', 'shared', 'truss', 11, 10, { label: 'Strut Shard' }),

  row('wreck_corvette_engine', 'hero', 'corvette', 'plated', 73, 55, { label: 'Corvette Engine Hull' }),
  row('wreck_corvette_forward', 'hero', 'corvette', 'plated', 89, 81, { label: 'Corvette Forward Hull' }),
  row('wreck_corvette_forward__fresh', 'hero', 'corvette', 'plated', 89, 83, { label: 'Fresh Corvette Forward' }),
  row('wreck_corvette_forward__stripped_heavy', 'hero', 'corvette', 'plated', 89, 45, { label: 'Stripped Corvette Forward' }),
  row('wreck_corvette_turret', 'hero', 'corvette', 'plated', 16, 23, { label: 'Corvette Turret' }),
  row('wreck_liner_boatbay', 'hero', 'liner', 'pressure', 54, 13, { authoredDown: true, label: 'Liner Boat Bay' }),
  row('wreck_liner_bow', 'hero', 'liner', 'pressure', 69, 11, { authoredDown: true, label: 'Liner Bow' }),
  row('wreck_liner_drum', 'hero', 'liner', 'pressure', 87, 66, { label: 'Liner Hab Drum' }),
  row('wreck_liner_drum__derelict', 'hero', 'liner', 'pressure', 87, 48, { label: 'Derelict Liner Drum' }),
  row('wreck_liner_drum__fresh', 'hero', 'liner', 'pressure', 87, 66, { label: 'Fresh Liner Drum' }),
  row('wreck_ore_freighter_bow', 'hero', 'ore_freighter', 'truss', 179, 208, { label: 'Ore Freighter Bow' }),
  row('wreck_ore_freighter_bow__derelict', 'hero', 'ore_freighter', 'truss', 179, 177, { label: 'Derelict Freighter Bow' }),
  row('wreck_ore_freighter_bow__fresh', 'hero', 'ore_freighter', 'truss', 179, 211, { label: 'Fresh Freighter Bow' }),
  row('wreck_ore_freighter_bow__stripped', 'hero', 'ore_freighter', 'truss', 179, 177, { label: 'Stripped Freighter Bow' }),
  row('wreck_ore_freighter_hopper', 'hero', 'ore_freighter', 'truss', 49, 14, { authoredDown: true, label: 'Ore Hopper' }),
  row('wreck_ore_freighter_stern', 'hero', 'ore_freighter', 'truss', 145, 172, { label: 'Ore Freighter Stern' }),
]);

const SOURCE_TWINS = Object.freeze(
  LIVE_MODELS
    .filter((model) => model.authoredDown)
    .map((model) => row(model.stem, model.kind, model.family, model.grammar, model.longestM, model.meshes, {
      live: false,
      spawn: false,
      label: `${model.label} (source donor)`,
    })),
);

export const WRECK_AFTERMATH_MODELS = Object.freeze([...LIVE_MODELS, ...SOURCE_TWINS]);

export const WRECK_AFTERMATH_PLACE_FILE_BY_ID = Object.freeze(Object.fromEntries(
  WRECK_AFTERMATH_MODELS.map((model) => [model.id, model.file]),
));

export const WRECK_AFTERMATH_MODEL_BY_ID = Object.freeze(Object.fromEntries(
  WRECK_AFTERMATH_MODELS.map((model) => [model.id, model]),
));

export const WRECK_AFTERMATH_SPAWN_MODELS = Object.freeze(
  LIVE_MODELS.filter((model) => model.spawn),
);

export const WRECK_AFTERMATH_HERO_IDS = Object.freeze(
  WRECK_AFTERMATH_SPAWN_MODELS.filter((model) => model.kind === 'hero').map((model) => model.id),
);

const FAMILIES = Object.freeze(['ore_freighter', 'corvette', 'liner']);

export const WRECK_AFTERMATH_FAMILY_SHED = Object.freeze({
  ore_freighter: Object.freeze({
    grammar: 'truss',
    debris: Object.freeze(['deb_ore_freighter_ring_span', 'deb_ore_freighter_hopper_lid', 'deb_ore_freighter_drive_bell']),
    components: Object.freeze(['aft_cargo_module', 'aft_engine_section', 'aft_radiator_panel']),
    fragments: Object.freeze(['frag_strut_shard', 'frag_rib_cluster', 'frag_cable_bundle']),
  }),
  corvette: Object.freeze({
    grammar: 'plated',
    debris: Object.freeze(['deb_corvette_armor_belt', 'deb_corvette_barbette_ring']),
    components: Object.freeze(['aft_armor_slab', 'aft_weapon_spar', 'aft_cockpit_section']),
    fragments: Object.freeze(['frag_plate_curl', 'frag_grating_sheet', 'frag_rib_cluster']),
  }),
  liner: Object.freeze({
    grammar: 'pressure',
    debris: Object.freeze(['deb_liner_hull_panel', 'deb_liner_drive_pod']),
    components: Object.freeze(['aft_pressure_tank', 'aft_dock_collar', 'aft_cockpit_section']),
    fragments: Object.freeze(['frag_pipe_tangle', 'frag_plate_curl', 'frag_cable_bundle']),
  }),
});

export function isWreckAftermathPlaceId(placeId) {
  return Object.prototype.hasOwnProperty.call(
    WRECK_AFTERMATH_PLACE_FILE_BY_ID,
    String(placeId || ''),
  );
}

export function wreckAftermathFileForPlaceId(placeId) {
  return WRECK_AFTERMATH_PLACE_FILE_BY_ID[String(placeId || '')] || null;
}

function pickOne(rng, list) {
  if (!list.length) return null;
  return list[Math.floor(rng() * list.length) % list.length];
}

function pickMany(rng, list, count) {
  const pool = list.slice();
  const out = [];
  while (pool.length && out.length < count) {
    const index = Math.floor(rng() * pool.length) % pool.length;
    out.push(pool.splice(index, 1)[0]);
  }
  return out;
}

function modelsForStems(stems) {
  const wanted = new Set(stems);
  return WRECK_AFTERMATH_SPAWN_MODELS.filter((model) => wanted.has(model.stem));
}

function heroesFor(family) {
  return WRECK_AFTERMATH_SPAWN_MODELS.filter((model) => model.kind === 'hero' && model.family === family);
}

function offsetFrom(origin, angle, distance) {
  return {
    x: origin.x + Math.cos(angle) * distance,
    z: origin.z + Math.sin(angle) * distance,
  };
}

function dist2(a, b) {
  const dx = Number(a && a.x) - Number(b && b.x);
  const dz = Number(a && a.z) - Number(b && b.z);
  return dx * dx + dz * dz;
}

function finitePos(value) {
  return value
    && Number.isFinite(Number(value.x))
    && Number.isFinite(Number(value.z))
    ? { x: Number(value.x), z: Number(value.z) }
    : null;
}

function isLaneFurniturePoi(row) {
  const id = String((row && (row.poiId || row.id)) || '');
  return /lane_pin|tally|claim_mark|locker|ash_pin|whistle/.test(id);
}

function wreckFieldSites(anchors) {
  return (anchors.wrecks || [])
    .filter((row) => !isLaneFurniturePoi(row))
    .map((row) => finitePos(row && (row.pos || row)))
    .filter(Boolean);
}

function pushOffAprons(pos, stations, minDist) {
  let p = { x: pos.x, z: pos.z };
  for (let pass = 0; pass < 6; pass += 1) {
    let moved = false;
    for (const station of stations) {
      const gap = Math.sqrt(dist2(p, station));
      if (gap >= minDist) continue;
      if (gap < 1e-3) {
        p = { x: station.x + minDist, z: station.z };
      } else {
        const scale = minDist / gap;
        p = {
          x: station.x + (p.x - station.x) * scale,
          z: station.z + (p.z - station.z) * scale,
        };
      }
      moved = true;
    }
    if (!moved) break;
  }
  return p;
}

function clearOfStations(pos, stations, minDist) {
  const limit = minDist * minDist;
  return stations.every((station) => dist2(pos, station) >= limit);
}

function familyFromHints(rng, klass, battleSite, wreckName) {
  const name = String(wreckName || '').toLowerCase();
  if (/ore|hopper|freighter|driller|barge|seam/.test(name)) return 'ore_freighter';
  if (/pirate|corvette|cruiser|patrol|military|concord/.test(name)) return 'corvette';
  if (/liner|passenger|drum|boat|habitat/.test(name)) return 'liner';
  if (battleSite) return pickOne(rng, ['corvette', 'corvette', 'liner']);
  if (klass === 'belt') return pickOne(rng, ['ore_freighter', 'ore_freighter', 'liner']);
  return pickOne(rng, FAMILIES);
}

function asRow(model, pos, rot, family, center) {
  return Object.freeze({
    placeId: model.id,
    pos: Object.freeze({ x: pos.x, z: pos.z }),
    rot,
    name: model.label,
    radius: model.radius,
    family,
    grammar: model.grammar,
    kind: model.kind,
    wreckAftermath: true,
    fieldCenter: Object.freeze({ x: center.x, z: center.z }),
  });
}

function pickFieldCenter(rng, klass, stations, wreckSites, fields, origin, worldRadius) {
  const wr = Number.isFinite(worldRadius) && worldRadius > 0 ? worldRadius : 4000;
  const home = finitePos(origin) || { x: 0, z: 0 };
  const candidates = [];
  for (const site of wreckSites) candidates.push(site);
  for (const field of fields) candidates.push(field);
  if (!candidates.length) {
    const ang = rng() * Math.PI * 2;
    const dist = wr * (klass === 'core' ? 0.48 : 0.38 + rng() * 0.16);
    candidates.push(offsetFrom(home, ang, dist));
  }
  const shuffled = pickMany(rng, candidates, candidates.length);
  for (const raw of shuffled) {
    const pushed = pushOffAprons(raw, stations, WRECK_AFTERMATH_STATION_APRON);
    if (clearOfStations(pushed, stations, WRECK_AFTERMATH_STATION_APRON)) return pushed;
  }
  return null;
}

/**
 * Deterministic wreck field for one sector. `rng` must be the dedicated wreckAftermath
 * stream — never the world dressing/combat stream.
 */
export function wreckAftermathDressingForSector(sectorId, paletteClass, rng, anchors = {}) {
  if (WRECK_AFTERMATH_SKIP_SECTORS.includes(String(sectorId || ''))) return Object.freeze([]);
  const klass = String(paletteClass || 'belt');
  const stations = (anchors.stations || []).map((row) => finitePos(row && (row.pos || row))).filter(Boolean);
  const wreckSites = wreckFieldSites(anchors);
  const fields = (anchors.fields || []).map((row) => finitePos(row && (row.center || row.pos || row))).filter(Boolean);
  const battleSite = klass === 'fringe' || klass === 'anomaly' || Number(anchors.enemyDensity) >= 0.4;
  const cap = klass === 'core'
    ? WRECK_AFTERMATH_MAX_CORE_PER_SECTOR
    : (battleSite ? WRECK_AFTERMATH_MAX_BATTLE_PER_SECTOR : WRECK_AFTERMATH_MAX_PER_SECTOR);
  const center = pickFieldCenter(
    rng,
    klass,
    stations,
    wreckSites,
    fields,
    anchors.origin,
    anchors.worldRadius,
  );
  if (!center) return Object.freeze([]);

  const wreckName = String((anchors.wrecks || []).find((row) => !isLaneFurniturePoi(row) && (row.name || row.poiId))?.name
    || (anchors.wrecks || []).find((row) => !isLaneFurniturePoi(row))?.poiId
    || '');
  const family = familyFromHints(rng, klass, battleSite, wreckName);
  const shed = WRECK_AFTERMATH_FAMILY_SHED[family];
  const fieldAngle = rng() * Math.PI * 2;
  const rows = [];
  const wantsHero = klass !== 'core' && (battleSite || wreckSites.length > 0 || rng() < 0.45);
  if (wantsHero) {
    const hero = pickOne(rng, heroesFor(family));
    if (hero) rows.push(asRow(hero, center, rng() * Math.PI * 2, family, center));
  }

  const debris = pickOne(rng, modelsForStems(shed.debris));
  if (debris && rows.length < cap) {
    rows.push(asRow(
      debris,
      offsetFrom(center, fieldAngle + 0.7 + rng() * 0.35, 90 + rng() * 70),
      rng() * Math.PI * 2,
      family,
      center,
    ));
  }

  if (battleSite || (!wantsHero && klass !== 'core')) {
    const component = pickOne(rng, modelsForStems(shed.components));
    if (component && rows.length < cap) {
      rows.push(asRow(
        component,
        offsetFrom(center, fieldAngle + 2.2 + rng() * 0.4, 70 + rng() * 80),
        rng() * Math.PI * 2,
        family,
        center,
      ));
    }
  }

  const fragWanted = Math.min(
    modelsForStems(shed.fragments).length,
    Math.max(1, cap - rows.length),
    battleSite ? 3 : (klass === 'core' ? 1 : 2),
  );
  const frags = pickMany(rng, modelsForStems(shed.fragments), fragWanted);
  for (let i = 0; i < frags.length && rows.length < cap; i += 1) {
    const ang = fieldAngle + 1.8 + i * 0.85 + rng() * 0.2;
    rows.push(asRow(
      frags[i],
      offsetFrom(center, ang, 45 + rng() * 55 + i * 16),
      rng() * Math.PI * 2,
      family,
      center,
    ));
  }

  return Object.freeze(rows.filter((row) => clearOfStations(row.pos, stations, WRECK_AFTERMATH_STATION_APRON)).slice(0, cap));
}
