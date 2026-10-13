// Authored arena layouts. Separation, mass, and terrain are the tournament axes.
// Demonstration tapes use the doctrine silhouette. Matrix cells may swap hull mass.

import { hashUnit } from '../../src/ai/contracts.js';
import { counterplayDoctrineById } from '../../src/ai/counterplay/catalog.js';

export const DEV_SEEDS = Object.freeze([17, 43, 89]);
export const HELD_OUT_SEEDS = Object.freeze([101, 409, 1601]);

const RANGE_WU = Object.freeze({
  close: 160,
  mid: 280,
  far: 500,
  authored: 280,
});

const MASS_HULL = Object.freeze({
  light: 'ship_wasp',
  heavy: 'ship_mule',
});

function jitter(seed, salt) {
  return (hashUnit(seed, salt) - 0.5) * 18;
}

function face(pos) {
  return Math.atan2(-pos.z, -pos.x);
}

function fitting(hullId, fires) {
  if (!fires) return [];
  if (hullId === 'ship_wasp' || hullId === 'ship_pelican' || hullId === 'ship_kestrel') {
    return ['wpn_pulse_laser_s'];
  }
  return ['wpn_pulse_laser_m'];
}

function ship(role, hullId, pos, team, extra = {}) {
  return {
    role,
    hullId,
    pos: { x: pos.x, z: pos.z },
    rot: Number.isFinite(extra.rot) ? extra.rot : face(pos),
    team,
    isPlayer: role === 'player',
    fittings: extra.fittings || [],
    vel: extra.vel || { x: 0, z: 0 },
  };
}

function rock(role, pos, extra = {}) {
  return {
    role,
    pos: { x: pos.x, z: pos.z },
    radius: extra.radius ?? 24,
    mass: extra.mass ?? 900,
    dynamic: extra.dynamic === true,
    vel: extra.vel || { x: 0, z: 0 },
    hull: extra.hull ?? 800,
  };
}

/**
 * @param {string} doctrineId
 * @param {object} [options]
 */
export function buildCounterplayScene(doctrineId, options = {}) {
  const doctrine = counterplayDoctrineById(doctrineId);
  if (!doctrine) throw new Error(`unknown counterplay doctrine ${doctrineId}`);
  const seed = Number.isFinite(options.seed) ? options.seed : 1;
  const range = RANGE_WU[options.range] ? options.range : 'authored';
  const separation = RANGE_WU[range];
  const scale = Math.max(0.62, separation / 280);
  const jx = jitter(seed, 'x');
  const jz = jitter(seed, 'z');
  const mass = options.mass || 'canonical';
  const hullId = mass === 'canonical' || !MASS_HULL[mass] ? doctrine.silhouette : MASS_HULL[mass];
  const guns = fitting(
    hullId,
    doctrine.fires === true && (hullId === 'ship_wasp' || hullId === 'ship_drifter' || hullId === doctrine.silhouette),
  );
  const layout = layoutFor(doctrine.id, separation, scale, jx, jz);
  const opponent = ship('opponent', hullId, layout.opponent, 1, {
    fittings: guns,
    vel: layout.opponentVel,
    rot: layout.opponentRot,
  });
  const hulls = [
    ship('player', 'ship_kestrel', layout.player, 0, { rot: layout.playerRot }),
    opponent,
  ];
  if (doctrine.id === 'cp_corridor_pack_leader' && (options.tape === 'counter' || options.pilotId === 'counter')) {
    hulls[0].pos = { x: layout.objective.lane.x, z: layout.objective.lane.z };
  }
  for (const extra of layout.ships || []) hulls.push(extra);
  if (layout.shift) {
    const { x: sx, z: sz } = layout.shift;
    const move = (p) => { if (p) { p.x += sx; p.z += sz; } };
    for (const body of hulls) move(body.pos);
    for (const body of layout.rocks) move(body.pos);
    for (const value of Object.values(layout.objective)) {
      if (value && Number.isFinite(value.x) && Number.isFinite(value.z)) move(value);
    }
  }
  const rocks = layout.rocks.slice();
  if (options.terrain === 'cover') {
    rocks.push(rock('terrain_cover', {
      x: separation * 0.45 + jx * 0.2,
      z: 36 + jz * 0.2,
    }, { radius: 22, mass: 1200 }));
  } else if (options.terrain === 'corridor') {
    rocks.push(rock('terrain_a', { x: separation * 0.5, z: 48 }, { radius: 20, mass: 1100 }));
    rocks.push(rock('terrain_b', { x: separation * 0.5, z: -48 }, { radius: 20, mass: 1100 }));
  }
  const tape = options.tape || 'archetype';
  const pilotId = options.pilotId
    || (tape === 'counter' ? doctrine.counterPilot : tape === 'resists' ? doctrine.resistsPilot : options.pilotId)
    || 'close_booster';
  return {
    seed,
    doctrineId: doctrine.id,
    ticks: Number.isInteger(options.ticks) ? options.ticks : (tape === 'archetype' ? 170 : 340),
    pilotId,
    mass,
    range,
    terrain: options.terrain || 'open',
    tape,
    fires: doctrine.fires === true,
    silhouette: doctrine.silhouette,
    hullId,
    objective: layout.objective,
    hulls,
    rocks,
    initialTethers: layout.initialTethers || [],
    separation,
  };
}

function layoutFor(id, s, scale, jx, jz) {
  const player = { x: 0, z: 0 };
  if (id === 'cp_heavy_anchor_grappler') {
    const anchor = { x: s * 0.42 + jx, z: jz };
    return {
      player,
      opponent: { x: anchor.x, z: anchor.z + 90 },
      rocks: [rock('anchor', anchor, { radius: 28, mass: 4000 })],
      objective: {
        anchor,
        anchorId: null,
        flank: { x: anchor.x + 60, z: anchor.z },
        flankRadius: 36,
      },
    };
  }
  if (id === 'cp_feint_break_courier') {
    const gate = { x: 0, z: 210 };
    return {
      player: { x: 20, z: 40 },
      opponent: { x: 0, z: 0 },
      rocks: [rock('buoy', gate, { radius: 6, mass: 2000 })],
      objective: {
        feint: { x: 280, z: 30 },
        gate,
      },
      shift: { x: jx, z: jz },
    };
  }
  if (id === 'cp_corridor_pack_leader') {
    const lane = { x: 170 + jx, z: -20 + jz };
    const exit = { x: lane.x + 150, z: lane.z };
    const park = { x: 60 + jx, z: 160 + jz };
    return {
      player: { x: jx * 0.2, z: jz * 0.2 },
      opponent: { x: 30 + jx * 0.4, z: 50 + jz * 0.4 },
      ships: [ship('packmate', 'ship_wasp', { x: 24 + jx * 0.3, z: -70 + jz * 0.3 }, 1)],
      rocks: [],
      objective: { leaderPark: park, lane, exit },
    };
  }
  if (id === 'cp_rescue_tow') {
    const patient = { x: 70 + jx * 0.2, z: 16 };
    const gate = { x: patient.x + 200 * scale, z: 10 };
    return {
      player,
      opponent: { x: patient.x - 20, z: patient.z + 24 },
      ships: [ship('patient', 'ship_wasp', patient, 1)],
      rocks: [rock('buoy', gate, { radius: 8, mass: 2000 })],
      objective: { patient, patientId: null, gate },
    };
  }
  if (id === 'cp_prize_runner') {
    const prize = { x: 90 + jx * 0.3, z: jz * 0.2 };
    return {
      player: { x: -20, z: -30 },
      opponent: { x: 10, z: 80 },
      rocks: [rock('prize', prize, {
        radius: 12,
        mass: 90,
        dynamic: true,
        hull: 400,
        vel: { x: 12, z: 3 },
      })],
      objective: { prize },
    };
  }
  if (id === 'cp_release_orbit_hunter') {
    const anchor = { x: s * 0.35 + jx * 0.2, z: jz * 0.2 };
    const body = { x: anchor.x + 110, z: anchor.z };
    return {
      player: { x: -220, z: -180 },
      opponent: { x: anchor.x + 16, z: anchor.z + 150 },
      ships: [ship('orbit_body', 'ship_wasp', body, 2, { vel: { x: 0, z: 40 } })],
      rocks: [
        rock('orbit_anchor', anchor, { radius: 16, mass: 5000 }),
      ],
      initialTethers: [{ id: 'orbit-line', ownerRole: 'orbit_body', targetRole: 'orbit_anchor', restLength: 110 }],
      objective: {
        anchor,
        standoff: { x: anchor.x + 40, z: anchor.z + 160 },
      },
    };
  }
  if (id === 'cp_tether_bait_decoy') {
    return {
      player,
      opponent: { x: Math.max(190, s * 0.7), z: jz * 0.15 },
      rocks: [],
      objective: {},
    };
  }
  if (id === 'cp_collateral_hold') {
    const shooter = { x: 168 + jx, z: jz };
    const civilian = { x: shooter.x * 0.46, z: shooter.z * 0.46 };
    return {
      player: { x: jx * 0.15, z: jz * 0.15 },
      opponent: shooter,
      ships: [ship('civilian', 'ship_wasp', civilian, 2)],
      rocks: [],
      objective: { player: { x: 0, z: 0 }, civilian },
    };
  }
  if (id === 'cp_cover_peel') {
    const cover = { x: 130 * scale + jx, z: 0 };
    return {
      player: { x: cover.x - 90, z: cover.z },
      opponent: { x: cover.x + 90, z: cover.z },
      rocks: [rock('cover', cover, { radius: 30, mass: 3500 })],
      objective: {
        cover,
        coverRadius: 30,
        hide: { x: cover.x + 58, z: cover.z },
        peel: { x: cover.x + 40, z: cover.z + 150 },
        player: { x: cover.x - 90, z: cover.z },
      },
    };
  }
  const patient = { x: 96, z: 12 + jz * 0.2 };
  return {
    player: { x: 36, z: 12 },
    opponent: { x: patient.x - 42, z: patient.z + 6 },
    ships: [ship('patient', 'ship_wasp', patient, 1)],
    rocks: [],
    objective: { patient },
  };
}

export function demonstrationScene(doctrineId, seed, tape) {
  const doctrine = counterplayDoctrineById(doctrineId);
  const which = tape === 'counter' ? 'counter' : 'resists';
  return buildCounterplayScene(doctrineId, {
    seed,
    tape: which,
    pilotId: which === 'counter' ? doctrine.counterPilot : doctrine.resistsPilot,
    mass: 'canonical',
    range: 'authored',
    terrain: 'open',
    ticks: 340,
  });
}
