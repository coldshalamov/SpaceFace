import { ensureAlienEcologyState } from '../data/alienEcologyState.js';
import { recordContaminationKnowledge } from '../data/alienEcology.js';
import { fittedModuleDefs } from '../core/fittedModules.js';
import { nurseryShelterQualified } from './veilRayHabitat.js';

export const VEIL_NURSERY_ID = 'veil_ray_nursery';
const WATCH_SECONDS = 12;
const DISTURBED_SECONDS = 8;
const RECOVER_SECONDS = 18;
const range = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Sector-local substrate position; the ecology writer owns relocation in the same save bag.
export function nurserySiteCenter(state, site) {
  const center = state.world?.alienEcology?.sites?.[site.siteId]?.nursery?.relocation?.center;
  return center && Number.isFinite(center.x) && Number.isFinite(center.z) ? center : site.center;
}

// This record lives in world's existing ecology save bag. It owns no resources,
// population replenishment, mission reward, offscreen clock or juvenile AI.
export function veilNurseryMemory(state) {
  const sites = ensureAlienEcologyState(state).sites;
  const site = sites[VEIL_NURSERY_ID];
  if (!site) return null;
  const n = site.nursery || (site.nursery = {});
  n.mode = ['QUIET', 'DISTURBED', 'RECOVERING'].includes(n.mode) ? n.mode : 'QUIET';
  for (const key of ['disturbedRemaining', 'recoverRemaining', 'thrustSeconds', 'watchSeconds']) {
    n[key] = Math.max(0, Number.isFinite(n[key]) ? n[key] : 0);
  }
  n.disturbedRemaining = Math.min(DISTURBED_SECONDS, n.disturbedRemaining);
  n.recoverRemaining = Math.min(RECOVER_SECONDS, n.recoverRemaining);
  n.watchSeconds = Math.min(WATCH_SECONDS, n.watchSeconds);
  n.surveyed = n.surveyed === true;
  // Emitted attempts only: the HUD may suppress an ordinary receipt during combat.
  n.disturbanceNoted = n.disturbanceNoted === true;
  n.recoveryNoted = n.recoveryNoted === true;
  return n;
}

// Text uses the existing receipt lane, independent of sound and membrane animation.
// Keep the biology gate identical to effectiveRevelation without importing the
// ecology owner back into its helper. A fitted Bio-Spectral Pass counts here too.
function nurseryFeedback(world, site, n, latch, text) {
  const state = world.state, player = state.entities?.get(state.playerId);
  const bonus = fittedModuleDefs(state).reduce(
    (m, d) => Math.max(m, Number(d?.mods?.bioScanTier) || 0), 0);
  if (!player?.alive || state.world.currentSectorId !== site.sectorId
      || Math.min(ensureAlienEcologyState(state).revelation + bonus, 3) < site.requiresRevelation
      || !world.bus?.emit) return false;
  const center = world._toGlobal(nurserySiteCenter(state, site), site.sectorId);
  if (!(range(center, player.pos) <= 600)
      || !state.entityList.some(e => e.alive !== false && e.hull > 0
        && e.data?.ecology?.siteId === site.siteId && !e.data.ecology.aggregate
        && range(e.pos, player.pos) <= 600)) return false;
  // Bus subscribers may synchronously pulse again or Save/Continue. Publish the
  // episode latch first, and never write through this record after emitting.
  n[latch] = true;
  world.bus.emit('toast', { text: `Veil-Ray Nursery: ${text}`, kind: 'info', ttl: 5 });
  return true;
}

const DISTURBANCE_TEXT = Object.freeze({
  scan: 'Scan pulse disturbed the rays. Give the flock room.',
  weapons: 'Weapon fire disturbed the rays. Give the flock room.',
  // "Thrust" is a control-wall token in receipt admission; name the observed flare.
  thrust: 'Drive flare disturbed the rays. Drift quietly to let them settle.',
  loss: 'An adult was lost; the remaining rays are disturbed.',
});

export function nurseryDisturbance(world, site, kind, origin) {
  const state = world?.state;
  if (state?.world?.currentSectorId !== site.sectorId || !origin
      || !Number.isFinite(origin.x) || !Number.isFinite(origin.z)) return false;
  const center = world._toGlobal(nurserySiteCenter(state, site), site.sectorId);
  if (range(center, origin) > (kind === 'scan' ? 600 : 450)) return false;
  const n = veilNurseryMemory(state);
  if (!n) return false;
  // Recovery is still the same episode: repeated pulses, burns and Continue must
  // not replay its receipts. Only a fully quiet nursery starts a new episode.
  if (n.mode === 'QUIET') { n.disturbanceNoted = false; n.recoveryNoted = false; }
  n.mode = 'DISTURBED'; n.disturbedRemaining = DISTURBED_SECONDS;
  n.recoverRemaining = RECOVER_SECONDS; n.watchSeconds = 0;
  n.from = { x: origin.x, z: origin.z }; n.lastCause = kind;
  // Relocation already has an ecology-owned receipt. Loss is deliberately neutral:
  // entity:killed does not establish that the player caused the death.
  if (!n.disturbanceNoted && DISTURBANCE_TEXT[kind]) {
    nurseryFeedback(world, site, n, 'disturbanceNoted', DISTURBANCE_TEXT[kind]);
  }
  return true;
}

export function handleVeilNurseryEvent(world, site, type, payload) {
  const state = world?.state;
  const player = state?.entities?.get(state.playerId);
  if (!player?.alive || !payload) return;
  if (type === 'scan:pulse' && payload.source === 'player-scanner'
      && payload.scannerId === player.id && payload.pos && range(payload.pos, player.pos) < 2) {
    const center = world._toGlobal(nurserySiteCenter(state, site), site.sectorId);
    if (range(center, payload.pos) <= Math.max(0, Number(payload.radius) || 0) + 60) {
      nurseryDisturbance(world, site, 'scan', payload.pos);
    }
  } else if (type === 'combat:fire' && payload.ownerId === player.id) {
    nurseryDisturbance(world, site, 'weapons', payload.origin || player.pos);
  } else if (type === 'entity:killed') {
    const entity = state.entities.get(payload.id ?? payload.targetId ?? payload.entityId);
    if (entity?.data?.ecology?.siteId === site.siteId && entity.hull <= 0) {
      nurseryDisturbance(world, site, 'loss', entity.pos);
    }
  }
}

export function tickVeilNursery(world, site, rec, fauna, player, dt) {
  const state = world.state, n = veilNurseryMemory(state);
  if (!n) return;
  const center = world._toGlobal(nurserySiteCenter(state, site), site.sectorId);
  const near = !!player?.alive && range(center, player.pos) < 450;
  // Read the default physics owner's consumed native force, not an input request.
  const native = world.registry?.get('physics')?._sg02;
  const body = native?.records?.get(player?.id);
  const age = state.tick - native?._simTick;
  const force = body?.entity === player && body.body && body._postStepReadTick === native.tick
    && age >= 0 && age <= 2 && Number.isFinite(body.appliedForce?.x)
    ? Math.hypot(body.appliedForce.x, body.appliedForce.z) : 0;
  const burning = near && force > Math.max(1, (player.mass || 1) * 4);
  n.thrustSeconds = burning ? n.thrustSeconds + dt : Math.max(0, n.thrustSeconds - dt * 2);
  if (n.thrustSeconds >= 1.5) {
    n.thrustSeconds = 0;
    nurseryDisturbance(world, site, 'thrust', player.pos);
    if (state.world?.alienEcology?.sites?.[site.siteId]?.nursery !== n) return;
  }
  if (n.mode === 'DISTURBED') {
    n.disturbedRemaining = Math.max(0, n.disturbedRemaining - dt);
    if (n.disturbedRemaining < 1e-6) {
      n.disturbedRemaining = 0; n.mode = 'RECOVERING';
    }
  } else if (n.mode === 'RECOVERING') {
    n.recoverRemaining = Math.max(0, n.recoverRemaining - dt);
    if (n.recoverRemaining < 1e-6) { n.recoverRemaining = 0; n.mode = 'QUIET'; n.from = null; }
  }
  // A nearby witness can read the current recovery, not an offscreen transition.
  // This mode says nothing about formation positions or relocation success.
  if (n.mode === 'RECOVERING' && n.disturbanceNoted && !n.recoveryNoted) {
    const cause = { scan: 'the scan pulse', weapons: 'weapon fire',
      thrust: 'the drive flare', loss: 'the adult loss' }[n.lastCause];
    nurseryFeedback(world, site, n, 'recoveryNoted',
      `Disturbance${cause ? ` from ${cause}` : ''} is fading. Give the rays room to settle.`);
    if (state.world?.alienEcology?.sites?.[site.siteId]?.nursery !== n) return;
  }
  const adults = fauna.filter(e => e.alive !== false && e.hull > 0 && e.data?.ecology?.siteId === site.siteId
    && !e.data.ecology.aggregate);
  const speed = player?.vel ? Math.hypot(player.vel.x, player.vel.z) : Infinity;
  const watching = near && range(center, player.pos) >= 95 && speed <= 12 && !burning
    && n.mode === 'QUIET' && nurseryShelterQualified(adults, center, n);
  n.watchSeconds = watching ? Math.min(WATCH_SECONDS, n.watchSeconds + dt) : 0;
  if (n.watchSeconds >= WATCH_SECONDS && !n.surveyed) {
    n.surveyed = true;
    recordContaminationKnowledge(state, site.sectorId, 'Veil-Ray Nursery: passive survey recorded; juveniles shelter with adults inside the open mineral crescent.');
    world.bus?.emit('toast', { text: 'Veil-Ray nursery surveyed · the small membranes follow their elders. Observation logged; no specimens taken.', kind: 'info', ttl: 6 });
    world.bus?.emit('ecology:evidence', { sectorId: site.sectorId, siteId: site.siteId,
      evidenceId: 'veil_ray_nursery_passive_survey', text: 'Passive nursery observation: adults shelter one juvenile flock inside the mineral crescent.' });
  }
  for (const e of adults) e.data.ecology.nurseryMode = n.mode;
  // The flock is one visual body. It cannot die, yield loot, mature into new AI,
  // collide, be captured or write an adult population into the save.
  const flock = fauna.find(e => e.alive !== false && e.data?.ecology?.siteId === site.siteId
    && e.data.ecology.aggregate);
  if (flock) {
    flock.data.ecology.nurseryMode = n.mode;
    flock.data.ecology.visibleMembers = adults.length ? 8 : 0;
    const lead = adults[0];
    if (lead) {
      const shelter = n.relocation?.scattered ? lead.pos : center;
      flock.pos.x = shelter.x * 0.65 + lead.pos.x * 0.35;
      flock.pos.z = shelter.z * 0.65 + lead.pos.z * 0.35;
      flock.rot = lead.rot;
    }
  }
}

export function applyNurseryDrive(eco, rec) {
  const n = rec.nursery;
  if (!n) return;
  eco.driveState = n.mode === 'DISTURBED' ? 'flee' : n.mode === 'RECOVERING' ? 'return' : 'forage';
  eco.fleeFrom = n.mode === 'DISTURBED' && n.from ? n.from : null;
}

export function materializeNurseryDressing(world, site, active) {
  const state = world.state;
  const center = nurserySiteCenter(state, site);
  const existing = key => state.entityList.find(e => e.alive !== false && e.data?.nurseryDressingKey === key);
  const push = e => { if (e && !active.dressing.some(row => row.id === e.id)) active.dressing.push({ id: e.id, pos: e.pos, placeId: null, paletteClass: 'alien' }); };
  for (let i = 0; i < 7; i++) {
    const key = `${site.siteId}:rib:${i}`;
    let e = existing(key);
    if (!e) {
      // A crescent leaves its east mouth and an unbounded outer bypass open.
      const a = Math.PI * .48 + i * Math.PI * 1.04 / 6;
      const pos = world._toGlobal({ x: center.x + Math.cos(a) * 60,
        z: center.z + Math.sin(a) * 60 }, site.sectorId);
      // One existing rib is the tow point; the ecology owner carries the rest of
      // the connected substrate with its measured travel. No animal is tethered.
      e = world.helpers.spawnEntity({ type: 'prop', pos, rot: a + Math.PI / 2,
        radius: 13, ...(i === 0 ? {} : { mass: 0 }), hull: 1, collides: true, flags: { invuln: true },
        physicsBody: { dynamic: i === 0, material: 'asteroid', shape: 'compound',
          collisionProxyManifest: { schemaVersion: 1, id: 'veil-nursery:mineral-rib:v1', referenceRadius: 'radius',
            primitives: [{ id: 'mineral-rib', kind: 'obb', x: 0, z: 0, hx: 11 / 13, hz: 3 / 13, angle: 0 }] } },
        homeSectorId: site.sectorId, data: { nurseryDressingKey: key, veilNurseryRib: i,
          masslineTetherable: i === 0,
          ...(i === 0 ? { combatProfileId: 'combat_profile_tether_anchor',
            nurseryTowOffset: { x: Math.cos(a) * 60, z: Math.sin(a) * 60 } } : {}),
          siteId: site.siteId, homeSectorId: site.sectorId, scannerSignalKind: 'anomaly',
          scanLabel: i === 0
            ? 'Nursery substrate tow rib · Massline: move slowly in short stages; stop and cut to let the rays settle'
            : 'Fractured mineral rib · open eastern passage' } });
    }
    push(e);
  }
  const key = `${site.siteId}:juvenile-flock`;
  let flock = existing(key);
  if (!flock) flock = world.helpers.spawnEntity({ type: 'fauna',
    pos: world._toGlobal(center, site.sectorId), rot: 0, radius: 35, mass: 0,
    hull: 1, collides: false, physicsBody: false, flags: { invuln: true }, homeSectorId: site.sectorId,
    data: { nurseryDressingKey: key, siteId: site.siteId, strainId: site.strainId,
      homeSectorId: site.sectorId, scannerSignalKind: 'anomaly', scanLabel: 'Juvenile Veil-Rays · one sheltering flock',
      ecology: { speciesId: 'veil_ray', siteId: site.siteId, aggregate: true, visibleMembers: 8, nurseryMode: 'QUIET' } } });
  push(flock);
}
