// M25 physical evidence. asteroidSites owns the durable record and calls this runtime;
// world/ecology still owns fauna motion. Coordinates are sector-local in the save.
import { ALIEN_SITES } from '../data/alienEcology.js';
import { faunaSpeciesById } from '../data/alienFauna.js';
import { fittedModuleDefs } from '../core/fittedModules.js';

export const MOTION_FOSSIL_SITE = 'warm_freighter';
export const MOTION_FOSSIL_SIGNAL = 'warm-freighter-docking-fragment';
const site = ALIEN_SITES[MOTION_FOSSIL_SITE];
const leases = new WeakMap();
const controlBodies = new WeakMap();
const emitterBodies = new WeakMap();
const offers = new WeakMap();
const reach = 160;
const controls = [
  { key: 'warm', strain: site.strainId, dx: -70 },
  { key: 'ice', strain: ALIEN_SITES.quiet_ice.strainId, dx: 70 },
];

function record(state) {
  state.sites ||= {};
  return state.sites.motionFossil ||= {
    compared: false, emitterOnline: false, status: 'unread', leg: 0,
    samples: [], path: [], outcome: null, destination: { salvage: { cmdty_alloys: 2 }, destroyed: false },
  };
}

function globalPoint(world, point) { return world._toGlobal(point, site.sectorId); }
function localPoint(world, point) {
  const origin = globalPoint(world, site.center);
  return { x: point.x - origin.x + site.center.x, z: point.z - origin.z + site.center.z };
}
function distance(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
function playerAtSite(world) {
  const player = world.state.entities.get(world.state.playerId);
  const portable = fittedModuleDefs(world.state).some(def => def?.mods?.echoRecorder === true);
  return player?.alive !== false && player?.pos
    && world.state.world?.currentSectorId === site.sectorId
    && distance(player.pos, globalPoint(world, site.center)) <= (portable ? site.arrivalBands.mid : site.arrivalBands.close);
}
function log(world, text) { world.bus.emit('comms:log', { from: 'Motion fossil', kind: 'ecology', text }); }
function hosts(world) {
  return (controlBodies.get(record(world.state)) || []).map(e => e?.alive !== false && e?.hull > 0 ? e : null);
}

function materialize(world, rec) {
  const state = world.state;
  captureMotionFossilState(state);
  const species = faunaSpeciesById('mourning_kite');
  let emitter = emitterBodies.get(rec);
  if (!emitter || emitter.alive === false || state.entities.get(emitter.id) !== emitter) {
    emitter = state.entityList.find(e => e.alive !== false && e.data?.motionFossilEmitter === site.siteId);
    if (!emitter) emitter = world.helpers.spawnEntity({ type: 'fx', pos: globalPoint(world, site.center), vel: { x: 0, z: 0 },
      radius: 12, rot: 0, collides: false, physicsBody: false, homeSectorId: site.sectorId,
      data: { placeId: 'machine_spine', motionFossilEmitter: site.siteId,
        name: 'Freighter archived-signal emitter', scannerSignalKind: 'anomaly' },
    });
    if (emitter) emitterBodies.set(rec, emitter);
  }
  if (emitter) emitter.data.scanLabel = `ARCHIVED SIGNAL EMITTER — ${rec.emitterOnline ? 'ONLINE' : 'RESTORE AT SITE'}`;
  const cast = controlBodies.get(rec) || [];
  for (let i = 0; i < controls.length; i++) {
    const control = controls[i];
    const key = `${site.siteId}:motion_fossil:${control.key}`;
    if (rec.deadControls?.[key] || state.world.alienEcology?.sites?.[site.siteId]?.deadFauna?.[key]) { cast[i] = null; continue; }
    if (cast[i]?.alive !== false && cast[i] && state.entities.get(cast[i].id) === cast[i]) continue;
    const existing = state.entityList.find(e => e.alive !== false && e.data?.ecology?.faunaKey === key);
    if (existing) { cast[i] = existing; continue; }
    const pos = globalPoint(world, { x: site.center.x + control.dx, z: site.center.z - 240 });
    cast[i] = world.helpers.spawnEntity({ type: 'fauna', pos, vel: { x: 0, z: 0 }, rot: 0,
      radius: species.radius, hull: 60, physicsBody: false, collides: false, homeSectorId: site.sectorId,
      data: { siteId: site.siteId, strainId: control.strain, name: `${control.key === 'ice' ? 'Quiet Ice' : 'Warm lane'} strain control`,
        scannerSignalKind: 'anomaly', ecology: { siteId: site.siteId, speciesId: species.id, faunaKey: key,
          anchor: { ...pos }, driveState: 'drift', driveT: 0, phase: 0, stim: {}, bornAt: Number(state.simTime) || 0 } },
    });
  }
  controlBodies.set(rec, cast);
  if (!rec.path.length || rec.destination.destroyed) return;
  const previous = leases.get(rec);
  let body = previous?.alive !== false && previous && state.entities.get(previous.id) === previous ? previous
    : state.entityList.find(e => e.alive !== false && e.data?.motionFossilDestination === site.siteId);
  if (!body && previous?.hull <= 0) { rec.destination.destroyed = true; return; }
  if (!body) body = world.helpers.spawnEntity({ type: 'wreck', pos: globalPoint(world, rec.path.at(-1)),
    vel: { x: 0, z: 0 }, rot: 0, radius: 26, hull: 200, hullMax: 200, mass: 80,
    flags: { persistent: true }, collides: true, homeSectorId: site.sectorId,
    physicsBody: { dynamic: false, radius: 26, material: 'wreck' },
    data: { name: 'Old docking recorder housing', motionFossilDestination: site.siteId,
      worldRecordId: 'motion_fossil/warm_freighter/dock', transientSector: false,
      scanLabel: 'OLD DOCK — RECORDED TIMING REGISTER', salvagePool: { ...rec.destination.salvage } },
  });
  if (body) {
    leases.set(rec, body);
    rec.destination.salvage = { ...(body.data.salvagePool || {}) };
  }
}

function publishPath(world, rec) {
  const active = world.active || world.state.world.activeSector;
  if (!active || !rec.path.length) return;
  active.pois ||= [];
  const id = 'motion_fossil_recorded_path';
  let poi = active.pois.find(p => p.poiId === id);
  if (!poi) { poi = { poiId: id, type: 'anomaly', runtimeOwned: true, scannerSignalKind: 'anomaly', claimable: false }; active.pois.push(poi); }
  poi.name = rec.outcome ? 'Motion fossil — timing evidence filed' : `Recorded docking path ${Math.min(rec.leg + 1, rec.path.length)}/${rec.path.length}`;
  poi.pos = globalPoint(world, rec.path[Math.min(rec.leg, rec.path.length - 1)]);
  poi.hidden = rec.outcome != null;
  poi.scanDescription = rec.path.map((p, i) => `${i + 1}: ${Math.round(p.x)}, ${Math.round(p.z)}`).join(' → ');
}

function offer(world, rec, force = false) {
  if (!playerAtSite(world)) {
    if (offers.has(rec)) { world.bus.emit('siteEvidence:closed', { siteId: site.siteId }); offers.delete(rec); }
    return;
  }
  if (rec.outcome || (!force && rec.declined)) return;
  const stamp = `${rec.status}:${rec.compared}:${rec.emitterOnline}`;
  if (!force && offers.get(rec) === stamp) return;
  rec.declined = false; offers.set(rec, stamp);
  world.bus.emit('siteEvidence:offer', { siteId: site.siteId, headline: 'A fossil made of motion',
    detail: 'Two strain controls carry the same old docking fragment. Compare their baseline, hold at least 480 WU clear of each animal (south of the emitter), then play the archived signal. Follow each recorded bearing within 160 WU. The freighter emitter needs no cargo or fee; a fitted Echo Recorder can substitute out to 1300 WU. Weapons interrupt observation; you can leave and retry. '
      + (rec.path.length ? `Recorded path: ${rec.path.map(p => `${Math.round(p.x)}, ${Math.round(p.z)}`).join(' → ')}.` : `Emitter ${rec.emitterOnline ? 'online' : 'offline — restore it here'}.`),
    choices: [
      { id: 'compare', label: 'Compare the two strain controls' },
      { id: 'stimulate', label: 'Play the archived docking signal' },
      { id: 'restore', label: 'Restore the site emitter' },
      { id: 'follow', label: 'Follow the recorded fragment' },
      { id: 'abort', label: 'Leave the evidence undisturbed' },
    ],
  });
}

export function handleMotionFossilAction(world, request = {}) {
  if (request.siteId !== site.siteId) return null;
  const rec = record(world.state);
  const refuse = reason => { log(world, reason); return { ok: false, reason }; };
  if (!playerAtSite(world)) {
    const reason = 'Move within 460 WU of the Warm Freighter emitter, or within 1300 WU with a fitted Echo Recorder.';
    return request.verb === 'observe' ? { ok: false, reason } : refuse(reason);
  }
  if (rec.outcome) return { ok: true, settled: true, outcome: { ...rec.outcome } };
  materialize(world, rec);
  if (request.verb === 'observe') { offer(world, rec, true); return { ok: true }; }
  if (request.verb === 'abort') {
    if (rec.status === 'observing') rec.status = 'interrupted';
    if (rec.status === 'following') rec.status = 'recorded';
    rec.declined = true;
    world.bus.emit('siteEvidence:closed', { siteId: site.siteId });
    return { ok: true };
  }
  if (request.verb === 'restore') {
    rec.emitterOnline = true;
    log(world, 'Site emitter restored. The ordinary relay will also wake nearby fauna.');
  } else if (request.verb === 'compare') {
    if (rec.path.length) {
      log(world, 'The recorded comparison is retained with the path. Both distinct strains repeated the archived fragment.');
      offer(world, rec, true);
      return { ok: true, recorded: true };
    }
    const pair = hosts(world);
    if (pair.some(e => !e) || pair[0].data.strainId === pair[1].data.strainId) return refuse('Two living, distinct strain controls are required; the same host twice is not a comparison.');
    if (Array.isArray(request.hostIds) && (request.hostIds.length !== 2 || request.hostIds[0] === request.hostIds[1]
        || !request.hostIds.every(id => pair.some(e => e.id === id)))) return refuse('Compare both distinct controls, not the same host twice.');
    if (rec.status === 'observing') return refuse('Let the controlled observation finish before sampling another baseline.');
    rec.samples = pair.map(e => ({ faunaKey: e.data.ecology.faunaKey, strainId: e.data.strainId,
      pos: localPoint(world, e.pos), reaction: 'baseline' }));
    rec.compared = true;
    log(world, 'Two different strains sampled. Baseline recorded; inherited origin remains unproven.');
  } else if (request.verb === 'stimulate') {
    if (rec.status === 'observing') return { ok: true, observing: true };
    if (rec.path.length) { offer(world, rec, true); return { ok: true, path: rec.path.map(p => ({ ...p })) }; }
    if (!rec.compared) return refuse('Compare both baseline controls before stimulation.');
    if (request.signalId != null && request.signalId !== MOTION_FOSSIL_SIGNAL) return refuse('Wrong recording: this is not the archived docking fragment.');
    const portable = fittedModuleDefs(world.state).some(def => def?.mods?.echoRecorder === true);
    if (!rec.emitterOnline && !portable) return refuse('Relay off. Restore the site emitter or fit an Echo Recorder.');
    const pair = hosts(world);
    if (pair.some(e => !e)) return refuse('A sampled host is unavailable. No response can be attributed to a missing host.');
    const player = world.state.entities.get(world.state.playerId);
    if (pair.some(e => distance(player.pos, e.pos) < 480)) return refuse('Hull proximity masks the signal. Hold at least 480 WU clear of each strain control, south of the emitter.');
    rec.signalId = MOTION_FOSSIL_SIGNAL; rec.status = 'observing'; rec.observedFor = 0;
    rec.samples = pair.map(e => ({ faunaKey: e.data.ecology.faunaKey, strainId: e.data.strainId,
      pos: localPoint(world, e.pos), reaction: 'pending' }));
    const route = site.routeEcho.waypoints.map(p => globalPoint(world, { x: site.center.x + p.x, z: site.center.z + p.z }));
    for (const host of pair) {
      host.data.ecology.migration = { route: route.map(p => ({ ...p })), index: 0 };
      host.data.ecology.driveState = 'migrate'; host.data.ecology.driveT = 0;
    }
    if (!portable) world.bus.emit('sectorsim:impulse', { sectorId: site.sectorId, kind: 'mining_noise', x: site.center.x, z: site.center.z, amount: 0.1 });
    world.bus.emit('audio:cue', { id: 'scan_resolve', position: globalPoint(world, site.center) });
    log(world, 'Archived docking fragment playing. Four seconds of controlled observation; hold fire.');
  } else if (request.verb === 'follow') {
    if (!rec.path.length) return refuse('No recorded path yet. Stimulate and observe the controls first.');
    rec.status = 'following';
    log(world, `Follow in order: ${rec.path.map(p => `${Math.round(p.x)}, ${Math.round(p.z)}`).join(' → ')}. The last bearing is a physical dock register, not a claim about the creators.`);
  } else return refuse('Unknown evidence operation.');
  offer(world, rec, true);
  return { ok: true };
}

export function interruptMotionFossil(world, payload = {}) {
  const rec = world?.state?.sites?.motionFossil;
  if (rec?.status !== 'observing' || payload.ownerId !== world.state.playerId) return;
  rec.status = 'interrupted'; rec.observedFor = 0;
  log(world, 'Weapons interrupted the controlled test. No motion evidence filed; compare and replay to retry.');
}

export function tickMotionFossil(world, dt) {
  if (!world?.state || dt <= 0 || world.state.world?.currentSectorId !== site.sectorId) return;
  const rec = record(world.state);
  materialize(world, rec);
  offer(world, rec);
  if (rec.status === 'observing') {
    const pair = hosts(world);
    if (!playerAtSite(world) || pair.some(e => !e || ['flee', 'charge', 'defend', 'attach'].includes(e.data.ecology.driveState))) {
      rec.status = 'interrupted'; rec.observedFor = 0;
      log(world, 'Observation interrupted. No response inferred; return and replay when the controls are calm.');
    } else {
      rec.observedFor += dt;
      if (rec.observedFor >= 4) {
        const first = globalPoint(world, { x: site.center.x + site.routeEcho.waypoints[0].x, z: site.center.z + site.routeEcho.waypoints[0].z });
        rec.samples.forEach((sample, i) => {
          const host = pair[i], eco = host.data.ecology;
          // Incidental flight and alarm motion are not a recorded reaction. The native
          // migration owner must have carried this same sampled host toward the archive.
          sample.reaction = eco.driveState === 'migrate' && eco.migration?.route?.length === site.routeEcho.waypoints.length
            && distance(globalPoint(world, sample.pos), first) - distance(host.pos, first) > 1 ? 'repeated-fragment' : 'no-response';
        });
        if (rec.samples.every(sample => sample.reaction === 'repeated-fragment')) {
          rec.path = site.routeEcho.waypoints.map(p => ({ x: site.center.x + p.x, z: site.center.z + p.z }));
          rec.status = 'recorded';
          log(world, `Repeated docking fragment recorded: ${rec.path.map(p => `${Math.round(p.x)}, ${Math.round(p.z)}`).join(' → ')}. Choose follow to trace it.`);
          world.bus.emit('ecology:fossilRecorded', { siteId: site.siteId, path: rec.path.map(p => ({ ...p })), signalId: rec.signalId });
        } else {
          rec.status = 'no-response';
          log(world, 'Controlled signal produced no shared motion fragment. No response is a valid finding; no route inferred.');
        }
        offer(world, rec, true);
      }
    }
  }
  publishPath(world, rec);
  if (rec.status !== 'following' || rec.outcome) return;
  const player = world.state.entities.get(world.state.playerId);
  if (!player?.pos || player.alive === false || !rec.path[rec.leg]) return;
  if (distance(player.pos, globalPoint(world, rec.path[rec.leg])) > reach) return;
  if (rec.leg === rec.path.length - 1 && (rec.destination.destroyed || !leases.get(rec)?.alive)) {
    log(world, 'The docking register was destroyed. The recorded path remains readable; no intact timing evidence can be filed.');
    rec.status = 'register-lost'; return;
  }
  rec.leg++;
  if (rec.leg < rec.path.length) { log(world, `Bearing ${rec.leg} matched. Follow the next recorded return.`); publishPath(world, rec); return; }
  rec.outcome = { id: 'motion-fossil-timing', settledAt: Number(world.state.simTime) || 0,
    place: { ...rec.path.at(-1) }, finding: 'Two strains repeat one docking fragment; the old register confirms its timing. Origin unknown.' };
  rec.status = 'filed';
  // Taxonomy is an ecology-owned unlock: the existing evidence intake files the native
  // Warm Freighter row and advances its ordinary research ladder, once at this boundary.
  world.bus.emit('ecology:evidence', { id: 'P06', sectorId: site.sectorId });
  world.bus.emit('ecology:fossilSettled', { siteId: site.siteId, ...rec.outcome });
  world.bus.emit('siteEvidence:closed', { siteId: site.siteId });
  log(world, rec.outcome.finding);
  publishPath(world, rec);
}

export function copyMotionFossilState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const next = JSON.parse(JSON.stringify(value));
  next.samples = Array.isArray(next.samples) ? next.samples : [];
  next.path = Array.isArray(next.path) && next.path.every(p => Number.isFinite(p?.x) && Number.isFinite(p?.z)) ? next.path : [];
  next.leg = Math.max(0, Math.min(next.path.length, Number.isInteger(next.leg) ? next.leg : 0));
  if (!next.destination || typeof next.destination !== 'object' || Array.isArray(next.destination)) next.destination = { salvage: {}, destroyed: false };
  if (!next.destination.salvage || typeof next.destination.salvage !== 'object' || Array.isArray(next.destination.salvage)) next.destination.salvage = {};
  return next;
}

// Save captures physical depletion/destruction even when requested before the next tick.
// This reads bodies; it never materializes a replacement or advances an observation.
export function captureMotionFossilState(state) {
  const rec = state.sites?.motionFossil;
  if (!rec) return null;
  // Normal ticks touch only our three leased bodies. A fresh save restore performs one
  // bounded discovery pass before the leases are rebuilt, rather than several world scans
  // per frame in this already fauna-heavy sector.
  const known = controlBodies.get(rec);
  const bodies = known ? [...known, leases.get(rec)].filter(Boolean) : state.entityList;
  for (const entity of bodies) {
    if (entity.data?.motionFossilDestination === site.siteId) {
      if (entity.hull <= 0) rec.destination.destroyed = true;
      else if (entity.alive !== false) rec.destination.salvage = { ...(entity.data.salvagePool || {}) };
    }
    const key = entity.data?.ecology?.faunaKey;
    if (key?.startsWith(`${site.siteId}:motion_fossil:`) && entity.hull <= 0) {
      (rec.deadControls ||= {})[key] = true;
    }
  }
  return rec;
}
