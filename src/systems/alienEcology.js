// src/systems/alienEcology.js — Vethari-linked ecology runtime library (doc 08).
// NOT a registered system: world.js owns the state field, the materialize call in
// _spawnDressing, the tick call in update(), and the bus subscriptions in init().
// Everything here is a plain function taking the world instance (or sim state) explicitly.
//
// Cadence: materialize on sector dressing (FULL tier only), tick every world.update (60 Hz
// fixed), persist via world.serialize field `alienEcology`.

import {
  ALIEN_SITES,
  alienSitesForSector,
  alienStrainById,
  planFaunaCast,
  planInfestationModules,
  scannerBiologyLabel,
} from '../data/alienEcology.js';
import { faunaSpeciesById } from '../data/alienFauna.js';
import { insertDressingRow } from '../world/dressingTable.js';
import { ALIEN_ECOLOGY_SCHEMA, ensureAlienEcologyState } from '../data/alienEcologyState.js';

const TWO_PI = Math.PI * 2;

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function angleLerp(a, b, t) {
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return a + d * Math.min(1, Math.max(0, t));
}

function siteRecord(state, siteId) {
  const ae = ensureAlienEcologyState(state);
  if (!ae.sites[siteId]) {
    ae.sites[siteId] = {
      state: 'dormant',
      objectiveDone: false,
      bloomAt: -1,
      beats: {},
      deadFauna: {},
    };
  }
  return ae.sites[siteId];
}

export function setRevelation(state, tier) {
  const ae = ensureAlienEcologyState(state);
  const t = Math.max(0, Math.min(3, Math.trunc(tier)));
  if (t > ae.revelation) ae.revelation = t;
  return ae.revelation;
}

// ── Materialization (called from world._spawnDressing tail) ─────────────────────────────────
export function materializeAlienEcology(world, sector, active) {
  const state = world && world.state;
  const sites = alienSitesForSector(sector && sector.id);
  if (!sites.length || !world.helpers) return;
  const epoch = 0;
  for (const site of sites) {
    const rec = siteRecord(state, site.siteId);
    const rng = world.helpers.mulberry32(
      world.helpers.hash32(state.meta && state.meta.seed || 1, sector.id, epoch, 'alien-ecology', site.siteId));

    // Infestation ring — deterministic growth dressing around the world-site anchor.
    const strain = alienStrainById(site.strainId);
    const growth = planInfestationModules(site, rng);
    const bloom = rec.state === 'bloom';
    const growthCount = bloom ? growth.length + 8 : growth.length;
    for (let i = 0; i < growthCount; i += 1) {
      const g = growth[i % growth.length];
      const extra = i >= growth.length; // bloom ring spills wider
      const row = insertDressingRow(state, {
        type: 'fx',
        pos: world._toGlobal({
          x: site.center.x + g.dx * (extra ? 1.6 : 1),
          z: site.center.z + g.dz * (extra ? 1.6 : 1),
        }, sector.id),
        rot: g.rot,
        radius: 10 * g.scale,
        homeSectorId: sector.id,
        data: {
          placeId: `alien_growth_${g.moduleId}`,
          moduleId: g.moduleId,
          scale: g.scale,
          strainId: strain.id,
          siteId: site.siteId,
          alienEcology: true,
          scannerSignalKind: 'anomaly',
        },
      });
      active.dressing.push({ id: row.id, placeId: `alien_growth_${g.moduleId}`, pos: row.pos, paletteClass: 'alien' });
    }

    // Fauna cast — kinematic entities; persistent dead set means kills never respawn.
    const cast = planFaunaCast(site, rng);
    for (const member of cast) {
      if (rec.deadFauna[member.faunaKey]) continue;
      const species = faunaSpeciesById(member.speciesId);
      if (!species) continue;
      const pos = world._toGlobal({ x: site.center.x + member.dx, z: site.center.z + member.dz }, sector.id);
      const ent = world.helpers.spawnEntity({
        type: 'fauna',
        pos,
        rot: member.phase,
        radius: species.radius,
        collides: false,
        physicsBody: false,
        homeSectorId: sector.id,
        data: {
          name: species.name,
          scanLabel: scannerBiologyLabel(ensureAlienEcologyState(state).revelation, species.signature),
          scannerSignalKind: 'anomaly',
          strainId: strain.id,
          siteId: site.siteId,
          ecology: {
            speciesId: species.id,
            siteId: site.siteId,
            faunaKey: member.faunaKey,
            driveState: 'drift',
            driveT: 0,
            anchor: { x: pos.x, z: pos.z },
            phase: member.phase,
            latency: 0,
            attachTargetId: null,
          },
        },
      });
      if (ent) active.dressing.push({ id: ent.id, placeId: null, pos: ent.pos, paletteClass: 'alien' });
    }
  }
}

// ── Event intake (world.init wires these onto the bus) ──────────────────────────────────────
export function handleAlienEcologyEvent(world, type, payload) {
  const state = world && world.state;
  if (!state || !payload) return;
  const siteId = payload.siteId || 'cinder_nursery';
  const site = ALIEN_SITES[siteId];
  const rec = site ? siteRecord(state, siteId) : null;
  const toast = (text, kind = 'info', ttl = 4.5) => world.bus && world.bus.emit('toast', { text, kind, ttl });

  switch (type) {
    case 'alienEcology:nurseryPowered': {
      if (rec) rec.state = 'awake';
      setRevelation(state, 1);
      toast('Power restored to the barge — something under the hull is waking up.', 'warn', 5);
      refreshAlienLabels(world);
      break;
    }
    case 'alienEcology:relaySevered': {
      if (rec) rec.state = 'severed';
      setRevelation(state, 2);
      toast('The pale emitter goes dark — the swarm loses its order.', 'warn', 5);
      refreshAlienLabels(world);
      break;
    }
    case 'alienEcology:nurseryBloom': {
      if (rec) rec.state = 'bloom';
      rec.bloomAt = state.simTime || 0;
      setRevelation(state, 2);
      toast('Cysts rupture — the colony blooms outward.', 'warn', 5);
      refreshAlienLabels(world);
      break;
    }
    case 'alienEcology:blackBoxRecovered': {
      if (rec) rec.objectiveDone = true;
      const ae = ensureAlienEcologyState(state);
      ae.taxonomy.filamentousContamination = true;
      ae.machineProtocol = 'observed';
      setRevelation(state, 3);
      toast('DMC flight recorder secured. Research contact logged: FILAMENTOUS CONTAMINATION.', 'good', 6);
      refreshAlienLabels(world);
      break;
    }
    case 'entity:killed': {
      // Fauna death permanence — combat only emits entity:killed (residency despawn uses
      // entity:destroyed and never reaches here).
      const e = payload.id != null && state.entities.get(payload.id);
      const eco = e && e.data && e.data.ecology;
      if (eco && eco.faunaKey && eco.siteId) {
        const r = siteRecord(state, eco.siteId);
        r.deadFauna[eco.faunaKey] = true;
      }
      break;
    }
    default:
      break;
  }
}

// Reveal labels follow knowledge, not distance (doc 03 scanner language).
export function refreshAlienLabels(world) {
  const state = world && world.state;
  if (!state || !state.entityList) return;
  const ae = ensureAlienEcologyState(state);
  for (const e of state.entityList) {
    if (!e || !e.data || !e.data.ecology) continue;
    const species = faunaSpeciesById(e.data.ecology.speciesId);
    if (!species) continue;
    e.data.scanLabel = scannerBiologyLabel(ae.revelation, species.signature);
    e.data.name = ae.revelation >= 2 ? species.name : e.data.name;
  }
}

// ── Per-tick drive engine (called from world.update) ────────────────────────────────────────
export function tickAlienEcology(world, dt) {
  const state = world && world.state;
  if (!state || !state.entityList || dt <= 0) return;
  const sectorId = state.world && state.world.currentSectorId;
  if (!sectorId) return;
  const sites = alienSitesForSector(sectorId);
  if (!sites.length) return;
  const player = state.playerId != null ? state.entities.get(state.playerId) : null;

  // First collect fauna + relay coherence — relay severed = site record says severed.
  const fauna = [];
  const shepherds = [];
  for (const e of state.entityList) {
    if (!e || e.alive === false || e.type !== 'fauna' || !e.data || !e.data.ecology) continue;
    if (e.homeSectorId !== sectorId) continue;
    fauna.push(e);
    const sp = faunaSpeciesById(e.data.ecology.speciesId);
    if (sp && sp.relay) shepherds.push(e);
  }
  if (!fauna.length) return;

  for (const site of sites) {
    const rec = siteRecord(state, site.siteId);
    const siteGlobal = world._toGlobal({ x: site.center.x, z: site.center.z }, sectorId);
    const coherent = rec.state !== 'severed';

    // Staged arrival beats (doc 09): bands around the site trigger the reveal choreography.
    if (player && player.pos) {
      const dSite = Math.sqrt(dist2(player.pos.x, player.pos.z, siteGlobal.x, siteGlobal.z));
      if (!rec.beats.long && dSite < site.arrivalBands.long) {
        rec.beats.long = true;
        world.bus.emit('toast', { text: 'Long-range return: wrecked DMC service barge — this hull is not in any registry.', kind: 'info', ttl: 5 });
      }
      if (!rec.beats.mid && dSite < site.arrivalBands.mid) {
        rec.beats.mid = true;
        world.bus.emit('toast', { text: 'Multiple small contacts — unclassifiable. They turn together.', kind: 'warn', ttl: 5 });
        // The synchronized turn: coherent fauna pivot toward the player together.
        if (coherent) {
          for (const e of fauna) {
            const eco = e.data.ecology;
            if (eco.siteId !== site.siteId) continue;
            eco.driveState = 'investigate';
            eco.driveT = 0;
          }
        }
      }
      if (!rec.beats.close && dSite < site.arrivalBands.close) {
        rec.beats.close = true;
        setRevelation(state, 1);
        world.bus.emit('toast', { text: 'A pulse rolls across the hull — the organisms answer it.', kind: 'warn', ttl: 5.5 });
        refreshAlienLabels(world);
      }
    }

    const now = Number(state.simTime) || 0;
    for (const e of fauna) {
      const eco = e.data.ecology;
      if (eco.siteId !== site.siteId) continue;
      tickFauna(world, e, site, rec, coherent, shepherds, player, now, dt);
    }
  }
}

function tickFauna(world, e, site, rec, coherent, shepherds, player, now, dt) {
  const eco = e.data.ecology;
  const species = faunaSpeciesById(eco.speciesId);
  if (!species) return;
  eco.driveT = (eco.driveT || 0) + dt;

  const awake = rec.state === 'awake' || rec.state === 'bloom';
  const alertR = species.alertR * (awake ? 1.35 : 1) * (coherent ? 1 : species.coherenceLoss.alertMult);
  const px = player && player.pos ? player.pos.x : null;
  const pz = player && player.pos ? player.pos.z : null;
  const playerD = px != null ? Math.sqrt(dist2(e.pos.x, e.pos.z, px, pz)) : Infinity;

  // Relay broadcast: coherent fauna bias headings toward the shepherd's slow consensus turn.
  const shepherd = shepherds.find((s) => s.data.ecology.siteId === site.siteId);

  // ── stimulus → drive resolution (doc 02 grammar) ──
  // Latency: an incoherent fauna takes `coherenceLoss.latency` seconds of sustained stimulus
  // before it reacts. Track it per-entity.
  const stimulated = playerD < alertR;
  if (stimulated) eco.stimulusT = (eco.stimulusT || 0) + dt;
  else eco.stimulusT = 0;
  const reacted = coherent || (eco.stimulusT || 0) >= species.coherenceLoss.latency;

  if (reacted) {
    if (playerD < species.threatenR) {
      setDrive(eco, species.drives.panic);
    } else if (playerD < alertR) {
      setDrive(eco, awake ? species.drives.tense : species.drives.curious);
    } else if (eco.driveState !== 'attach' && eco.driveState !== 'idle') {
      setDrive(eco, species.drives.idle);
    }
  } else if (eco.driveState === 'idle') {
    setDrive(eco, species.drives.idle);
  }

  // ── drive behaviors: kinematic steering toward intent ──
  const speedMult = coherent ? 1 : species.coherenceLoss.speedMult;
  const siteGlobalAnchor = eco.anchor;
  let targetX = null;
  let targetZ = null;
  let speed = species.speed * speedMult;

  switch (eco.driveState) {
    case 'drift': {
      // Slow meander around the anchor: deterministic wander from simTime + phase.
      const w = now * 0.05 + eco.phase;
      targetX = siteGlobalAnchor.x + Math.cos(w) * 60;
      targetZ = siteGlobalAnchor.z + Math.sin(w * 0.9) * 60;
      speed *= 0.45;
      break;
    }
    case 'forage': {
      const w = now * 0.08 + eco.phase;
      targetX = siteGlobalAnchor.x + Math.cos(w) * 110;
      targetZ = siteGlobalAnchor.z + Math.sin(w) * 110;
      speed *= 0.6;
      break;
    }
    case 'investigate': {
      if (px == null) { setDrive(eco, species.drives.idle); break; }
      const ang = Math.atan2(pz - e.pos.z, px - e.pos.x);
      // Approach until preferredR, then orbit.
      if (playerD > species.preferredR * 1.15) {
        targetX = px - Math.cos(ang) * species.preferredR;
        targetZ = pz - Math.sin(ang) * species.preferredR;
      } else {
        const orb = ang + dt * 0.5 * (eco.phase > Math.PI ? 1 : -1);
        targetX = px + Math.cos(orb + Math.PI) * species.preferredR;
        targetZ = pz + Math.sin(orb + Math.PI) * species.preferredR;
      }
      break;
    }
    case 'shadow': {
      if (px == null) { setDrive(eco, species.drives.idle); break; }
      const ang = Math.atan2(e.pos.z - pz, e.pos.x - px) + dt * 0.4;
      targetX = px + Math.cos(ang) * species.preferredR;
      targetZ = pz + Math.sin(ang) * species.preferredR;
      break;
    }
    case 'defend': {
      // Menace posture: close to preferredR and hold — the ring tightens but never attacks.
      if (px == null) { setDrive(eco, species.drives.idle); break; }
      const ang = Math.atan2(e.pos.z - pz, e.pos.x - px);
      targetX = px + Math.cos(ang) * species.preferredR * 0.6;
      targetZ = pz + Math.sin(ang) * species.preferredR * 0.6;
      speed *= 0.9;
      break;
    }
    case 'flee': {
      if (px == null) { setDrive(eco, species.drives.idle); break; }
      const ang = Math.atan2(e.pos.z - pz, e.pos.x - px);
      targetX = e.pos.x + Math.cos(ang) * 300;
      targetZ = e.pos.z + Math.sin(ang) * 300;
      speed = species.fleeSpeed * speedMult;
      break;
    }
    case 'attach': {
      // Hull leech: creep toward the nearest hull (site anchor or player) and hold on it.
      let tx = siteGlobalAnchor.x;
      let tz = siteGlobalAnchor.z;
      if (px != null && playerD < (species.attachR || 70) + species.preferredR) { tx = px; tz = pz; }
      const d = Math.sqrt(dist2(e.pos.x, e.pos.z, tx, tz));
      if (d > 6) {
        targetX = tx;
        targetZ = tz;
        speed *= 0.5;
      } else {
        targetX = e.pos.x;
        targetZ = e.pos.z;
      }
      break;
    }
    case 'return': case 'idle': default: {
      const w = now * 0.03 + eco.phase;
      targetX = siteGlobalAnchor.x + Math.cos(w) * 30;
      targetZ = siteGlobalAnchor.z + Math.sin(w) * 30;
      speed *= 0.3;
      break;
    }
  }

  // Shepherd override: the relay organism just walks its wide patrol ring.
  if (species.relay) {
    const w = now * 0.02 + eco.phase;
    targetX = siteGlobalAnchor.x + Math.cos(w) * (species.orbitR || 300);
    targetZ = siteGlobalAnchor.z + Math.sin(w) * (species.orbitR || 300);
    speed = species.speed * speedMult;
  }

  if (targetX == null) return;
  const desired = Math.atan2(targetZ - e.pos.z, targetX - e.pos.x);
  // Coherent fauna conform their heading toward the relay's broadcast direction.
  let headingTarget = desired;
  if (shepherd && coherent && species.relayAffinity > 0) {
    headingTarget = angleLerp(desired, shepherd.rot, species.relayAffinity * 0.25);
  }
  e.rot = angleLerp(e.rot, headingTarget, Math.min(1, species.turnRate * dt));
  const d = Math.sqrt(dist2(e.pos.x, e.pos.z, targetX, targetZ));
  const step = Math.min(d, speed * dt);
  e.pos.x += Math.cos(e.rot) * step;
  e.pos.z += Math.sin(e.rot) * step;
}

function setDrive(eco, next) {
  if (!next || eco.driveState === next) return;
  eco.driveState = next;
  eco.driveT = 0;
}

// ── Persistence (world.serialize / deserialize fields) ──────────────────────────────────────
export function serializeAlienEcologyState(state) {
  const ae = ensureAlienEcologyState(state);
  return {
    schema: ae.schema,
    revelation: ae.revelation,
    machineProtocol: ae.machineProtocol,
    taxonomy: { ...ae.taxonomy },
    sites: JSON.parse(JSON.stringify(ae.sites)),
  };
}

export function deserializeAlienEcologyState(state, data) {
  const ae = ensureAlienEcologyState(state);
  if (!data || typeof data !== 'object' || data.schema !== ALIEN_ECOLOGY_SCHEMA) return ae;
  ae.revelation = Math.max(0, Math.min(3, Math.trunc(data.revelation) || 0));
  ae.machineProtocol = typeof data.machineProtocol === 'string' ? data.machineProtocol : ae.machineProtocol;
  if (data.taxonomy && typeof data.taxonomy === 'object') Object.assign(ae.taxonomy, data.taxonomy);
  if (data.sites && typeof data.sites === 'object') {
    for (const [siteId, rec] of Object.entries(data.sites)) {
      if (!rec || typeof rec !== 'object') continue;
      ae.sites[siteId] = {
        state: typeof rec.state === 'string' ? rec.state : 'dormant',
        objectiveDone: !!rec.objectiveDone,
        bloomAt: Number.isFinite(rec.bloomAt) ? rec.bloomAt : -1,
        beats: rec.beats && typeof rec.beats === 'object' ? { ...rec.beats } : {},
        deadFauna: rec.deadFauna && typeof rec.deadFauna === 'object' ? { ...rec.deadFauna } : {},
      };
    }
  }
  return ae;
}
