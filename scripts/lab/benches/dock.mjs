// Phase 2b system #9 bench: docking corridor + autopilot approach. REAL flightV3 autopilot
// (state.nav.autopilot -> station berth via the manifest corridor), dockingCorridor capture assist,
// physics.updateDockRange (the public dock prompt), rapier station proxy colliders.
// Station: procedural M ring hub (collisionProxy station_ring_hub, dockRadius 72) at the origin,
// corridor bearing 0° (snapped to the manifest lane). The player (starter Hitch unless shipId)
// starts at range D, bearing B (degrees from the corridor axis), initial velocity mode:
//   rest | inbound (60 wu/s at the station) | cross (60 wu/s tangential)
// Autopilot is engaged on tick 1 with no pilot input. Cap 120 s.
// Metrics: arrived (autopilot status), dockS (first dock:range inRange), arriveS, station contacts
// + worst contact closing speed, mouth speed (speed when entering the corridor), overshoot (wu
// the hull passes the berth along the axis), path length / straight-line, final status.
import { createLabWorld, SIM_DT } from '../labWorld.mjs';
import * as fv3 from '../../../src/systems/flightV3.js';
import { resolveCollisionProxyManifest, resolveBerthWorld, resolveCorridorAxisWorld } from '../../../src/data/collisionProxyManifests.js';

export const SCENARIOS = {};
for (const D of [600, 1500]) for (const B of [0, 45, 90, 135, 180]) for (const V of ['rest', 'inbound', 'cross']) {
  SCENARIOS[`hitch|${D}|${B}|${V}`] = { shipId: null, D, B, V };
}
for (const ship of ['ship_drifter', 'ship_bastion']) for (const B of [0, 90, 180]) SCENARIOS[`${ship.replace('ship_', '')}|1500|${B}|rest`] = { shipId: ship, D: 1500, B, V: 'rest' };
export const DEFAULT_SCENARIOS = Object.keys(SCENARIOS);

export const VARIANTS = {};
for (const r of [1.0, 1.3, 1.6]) for (const st of [45, 60, 75]) VARIANTS[`orbit${r}x${st}`] = { dockOrbit: { radiusMult: r, stepDeg: st } };
export async function runScenario(id, { seed = 1, bundle = 'focused', params = {} } = {}) {
  if (typeof fv3.setAutopilotDockLab === 'function') fv3.setAutopilotDockLab(params);
  const sc = typeof id === 'object' ? id : SCENARIOS[id];
  if (!sc) throw new Error(`unknown scenario ${id}`);
  const world = await createLabWorld({ seed, bundle, settings: { controlScheme: 'pilot' }, extraSystems: ['dockingCorridor', 'dockingCradle', 'autopilotSystem'] });
  try {
    const st = world.state; const rt = world.runtime;
    const station = rt.spawn({
      type: 'station', factionId: 'faction_free', pos: { x: 0, z: 0 }, radius: 34, mass: 1e6, hull: 1e6, hullMax: 1e6, collides: true,
      data: { stationId: 'station_lab', dockRadius: 72, placeScale: 72 / 14, collisionRadius: 34, collisionProxy: 'station_ring_hub', corridorBearingDeg: 0, services: [], name: 'Lab Hub', size: 'M' },
      flags: { persistent: true },
    });
    const manifest = resolveCollisionProxyManifest(station);
    const axis = resolveCorridorAxisWorld(station, manifest);
    const berth = resolveBerthWorld(station, manifest);
    const axAng = Math.atan2(axis.z, axis.x); const ang = axAng + sc.B * Math.PI / 180;
    const pos = { x: Math.cos(ang) * sc.D, z: Math.sin(ang) * sc.D };
    const inb = { x: -Math.cos(ang), z: -Math.sin(ang) };
    const vel = sc.V === 'inbound' ? { x: inb.x * 60, z: inb.z * 60 } : sc.V === 'cross' ? { x: -inb.z * 60, z: inb.x * 60 } : { x: 0, z: 0 };
    const opts = { pos, rot: Math.atan2(inb.z, inb.x), vel };
    if (sc.shipId) { opts.shipId = sc.shipId; opts.modules = []; }
    const pl = world.spawnPlayer(opts);
    await world.prepare();
    st.nav = st.nav || {};
    st.nav.autopilot = { active: true, targetEntityId: station.id, label: 'Lab Hub', status: 'engaged' };
    let dockTick = null, contacts = 0, worstContact = 0, mouthSpeed = null, wasInCorridor = false, maxPast = 0, pathLen = 0, maxSpeed = 0;
    rt.bus.on('dock:range', (e) => { if (e && e.inRange && dockTick == null) dockTick = st.tick; });
    rt.bus.on('physics:impact', (p) => { if (p && (p.aId === station.id || p.bId === station.id) && (p.aId === pl.id || p.bId === pl.id)) { contacts++; worstContact = Math.max(worstContact, p.preSolveClosingSpeed || 0); } });
    const t0 = st.tick; let arriveTick = null; let status = null;
    let prev = { x: pl.pos.x, z: pl.pos.z };
    const cap = Math.round(120 / SIM_DT);
    for (let t = 0; t < cap; t++) {
      world.keys([]);
      world.step();
      const ap = st.nav && st.nav.autopilot;
      status = ap && ap.status;
      if (ap && ap.active !== true && arriveTick == null) { arriveTick = st.tick; }
      pathLen += Math.hypot(pl.pos.x - prev.x, pl.pos.z - prev.z); prev = { x: pl.pos.x, z: pl.pos.z };
      const sp = Math.hypot(pl.vel.x, pl.vel.z); maxSpeed = Math.max(maxSpeed, sp);
      const dc = st.dockingCorridor; const inC = !!(dc && (dc.inCorridor || dc.inCapture));
      if (inC && !wasInCorridor && mouthSpeed == null) mouthSpeed = sp;
      wasInCorridor = inC;
      // overshoot: distance past the berth toward the station core, along the corridor axis
      const along = (pl.pos.x - berth.x) * axis.x + (pl.pos.z - berth.z) * axis.z; // + = outside (mouth side)
      if (mouthSpeed != null) maxPast = Math.max(maxPast, -along);
      if (arriveTick != null && dockTick != null) break;
      if (arriveTick != null && st.tick - arriveTick > 120) break;
      if (pl.alive === false) break;
    }
    const straight = Math.max(1, Math.hypot(pos.x - berth.x, pos.z - berth.z));
    return {
      key: `${(sc.shipId || 'ship_hitch').replace('ship_', '')}|${sc.D}|${sc.B}|${sc.V}`, ship: sc.shipId || 'hitch', D: sc.D, B: sc.B, V: sc.V, seed,
      status, docked: dockTick != null, dockS: dockTick == null ? null : +((dockTick - t0) * SIM_DT).toFixed(2),
      arriveS: arriveTick == null ? null : +((arriveTick - t0) * SIM_DT).toFixed(2),
      contacts, worstContact: +worstContact.toFixed(1), mouthSpeed: mouthSpeed == null ? null : +mouthSpeed.toFixed(1),
      overshoot: +maxPast.toFixed(1), pathRatio: +(pathLen / straight).toFixed(2), maxSpeed: +maxSpeed.toFixed(0),
      endDist: +Math.hypot(pl.pos.x - berth.x, pl.pos.z - berth.z).toFixed(1),
    };
  } finally { world.dispose(); if (typeof fv3.setAutopilotDockLab === 'function') fv3.setAutopilotDockLab({}); }
}
