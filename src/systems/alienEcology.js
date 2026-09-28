// src/systems/alienEcology.js — Vethari-linked ecology runtime library (doc 08).
// NOT a registered system: world.js owns the state field, the materialize call in
// _spawnDressing, the tick call in update(), and the bus subscriptions in init().
// Everything here is a plain function taking the world instance (or sim state) explicitly.
//
// Cadence: materialize on sector dressing (FULL tier only), tick every world.update (60 Hz
// fixed), persist via world.serialize field `alienEcology`.
//
// Phase 5+ (roadmap AE-050..079): extended species grammar (stimulus vocabulary, strain
// memory priors, carrier rupture, migration routes, capture latch, scan anatomy), dressing
// by contamination band, phantom scanner contacts, ship exposure, ecology mission offers.

import {
  ALIEN_SITES,
  alienSitesForSector,
  alienStrainById,
  ecologyMissionForSite,
  planAmbientGrowth,
  planFaunaCast,
  planInfestationModules,
  planPhantomContacts,
  pointContaminationAt,
  recordContaminationKnowledge,
  scannerBiologyLabel,
  EXPOSURE_MODEL,
} from '../data/alienEcology.js';
import { carrierSpecies, faunaSpeciesById } from '../data/alienFauna.js';
import { suppressionFieldAt } from '../data/precursorMachines.js';
import { insertDressingRow } from '../world/dressingTable.js';
import { fittedModuleDefs } from '../core/fittedModules.js';
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
      // Coherence is its own axis: a bloom after a sever must not restore the relay.
      relaySevered: false,
      objectiveDone: false,
      bloomAt: -1,
      beats: {},
      deadFauna: {},
      // AE-070: authored C baseline + event-driven bump accumulate here.
      siteC: 0,
      // AE-056 interaction buffer: recent ecological signals fauna react to.
      signals: [],
      offerEmitted: false,
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

    // AE-071 ambient dressing: contamination state spills loose growth beyond the ring.
    for (const a of planAmbientGrowth(state, site, rng)) {
      const row = insertDressingRow(state, {
        type: 'fx',
        pos: world._toGlobal({ x: site.center.x + a.dx, z: site.center.z + a.dz }, sector.id),
        rot: a.rot,
        radius: 8 * a.scale,
        homeSectorId: sector.id,
        data: {
          placeId: 'alien_growth_filament_sheet',
          moduleId: 'filament_sheet',
          scale: a.scale,
          strainId: strain.id,
          siteId: site.siteId,
          alienEcology: true,
          ambient: true,
        },
      });
      active.dressing.push({ id: row.id, placeId: 'alien_growth_filament_sheet', pos: row.pos, paletteClass: 'alien' });
    }

    // Fauna cast — kinematic entities; persistent dead set means kills never respawn.
    const ae0 = ensureAlienEcologyState(state);
    const cast = planFaunaCast(site, rng);
    for (const member of cast) {
      if (rec.deadFauna[member.faunaKey]) continue;
      const species = faunaSpeciesById(member.speciesId);
      if (!species) continue;
      const pos = world._toGlobal({ x: site.center.x + member.dx, z: site.center.z + member.dz }, sector.id);
      // Migration route: members of migrates species walk the waypoint loop.
      const migration = species.migrates && site.migrationRoute ? {
        route: site.migrationRoute.waypoints.map((w) => world._toGlobal({ x: site.center.x + w.x, z: site.center.z + w.z }, sector.id)),
        index: Math.floor(rng() * site.migrationRoute.waypoints.length),
      } : null;
      const ent = world.helpers.spawnEntity({
        type: 'fauna',
        pos,
        rot: member.phase,
        radius: species.radius,
        // Physics species (ram, glassback) get a real body — collisions ARE the gameplay.
        // Capturable organisms get a sensor body so a massline can latch them.
        collides: !!species.physicsBody,
        physicsBody: species.physicsBody
          ? { dynamic: true, material: 'fauna' }
          : (species.capturable ? { dynamic: true, material: 'massline_sensor' } : false),
        homeSectorId: sector.id,
        hull: species.sessile ? 400 : 60, // killable; sessile bodies are tougher
        data: {
          // Display name obeys the same reveal ladder as the scanner label: at low
          // revelation the target panel reads the generic scan term, not the taxonomy name.
          name: ae0.revelation >= 2 ? species.name
            : scannerBiologyLabel(ae0.revelation, species.signature),
          scanLabel: scannerBiologyLabel(ae0.revelation, species.signature),
          scannerSignalKind: 'anomaly',
          strainId: strain.id,
          siteId: site.siteId,
          // AE-058 scan anatomy — surfaced by the scanner at revelation >= 2.
          anatomy: species.anatomy || null,
          role: species.role || null,
          capturable: !!species.capturable,
          beamResist: species.beamResist || 0,
          ecology: {
            speciesId: species.id,
            siteId: site.siteId,
            faunaKey: member.faunaKey,
            driveState: species.dormant ? 'dormant' : (species.sessile ? 'anchored' : 'drift'),
            driveT: 0,
            anchor: { x: pos.x, z: pos.z },
            phase: member.phase,
            latency: 0,
            attachTargetId: null,
            migration: migration,
            // AE-051 stimulus accumulators (seconds of sustained stimulus).
            stim: {},
            feedTarget: null,
          },
        },
      });
      if (ent) active.dressing.push({ id: ent.id, placeId: null, pos: ent.pos, paletteClass: 'alien' });
    }

    // AE-073 phantom contacts: high-C sectors mint seeded anomaly pings that resolve to
    // nothing — the scanner surface distrusts itself before the player understands why.
    if (!Array.isArray(active.pois)) active.pois = [];
    for (const ph of planPhantomContacts(state, sector.id, rng)) {
      active.pois.push({
        id: null,                 // markerless — no entity, projection only
        poiId: ph.id,
        type: 'anomaly',
        pos: world._toGlobal({ x: site.center.x + ph.dx, z: site.center.z + ph.dz }, sector.id),
        name: 'UNRESOLVED SIGNAL',
        hidden: false,
        claimable: false,
        manualInvestigation: true,
        requiresActiveScan: true,
        scannerSignalKind: 'anomaly',
        scannerSignalPriority: 40,
        runtimeOwned: true,
        phantom: true,
        phantomSite: site.siteId,
      });
    }
  }
}

// ── Mission offers (AE-067..069, AE-087..089) ─────────────────────────────────────────────
// Site close-band fires emit a `mission:offered` row on the sector's station board — the
// same external-offer contract salvage uses, so the board/accept path needs no new code.
function emitEcologyOffer(world, site, sector) {
  const mission = site.surveyOfferId
    ? (ecologyMissionForSite(site.siteId) || null)
    : ecologyMissionForSite(site.siteId);
  if (!mission) return;
  const stations = (sector && sector.stations) || [];
  const station = stations[0] || null;
  const offer = {
    id: `ecology_${site.siteId}`,
    offerId: `ecology_${site.siteId}`,
    source: 'ecology',
    sectorId: site.sectorId,
    zoneId: site.zoneId || null,
    type: mission.type,
    stationId: station ? station.id : null,
    factionId: null,
    destStationId: station ? station.id : null,
    destSectorId: site.sectorId,
    distance: 800,
    riskTier: 2,
    collateral_cr: 0,
    duration_s: 3000,
    time_limit_s: 3000,
    title: mission.title,
    summary: mission.summary,
    brief: mission.log ? `"${mission.log.slice(0, 140)}"` : (mission.summary || null),
    giver: mission.giver,
    log: mission.log,
    reward_cr: mission.reward_cr || 0,
    params: {
      ...(mission.params || {}),
      ecologySiteId: site.siteId,
      ecologyPoiId: site.poiId || null,
      wreckPos: { x: site.center.x, z: site.center.z },
      wreckSectorId: site.sectorId,
    },
  };
  if (world.bus) {
    world.bus.emit('comms:log', { from: mission.giver || 'Field contact', text: mission.log, kind: 'ecology' });
    if (offer.stationId) world.bus.emit('mission:offered', offer);
    world.bus.emit('audio:cue', { id: 'scan_resolve' });
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
      if (rec) { rec.state = 'severed'; rec.relaySevered = true; }
      setRevelation(state, 2);
      toast('The pale emitter goes dark — the swarm loses its order.', 'warn', 5);
      refreshAlienLabels(world);
      break;
    }
    case 'alienEcology:nurseryBloom': {
      // 'severed' is a terminal stage label; the bloom still stamps bloomAt + taxonomy side
      // effects, but never un-severs the relay (coherence reads relaySevered, not state).
      if (rec && rec.state !== 'severed') rec.state = 'bloom';
      if (rec) rec.bloomAt = state.simTime || 0;
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
    case 'scan:completed': {
      // AE-079 — a sector scan in contaminated space is a revelation source: reading
      // anomaly returns at a live site teaches the taxonomy ladder once per site.
      const sectorId = payload.sectorId;
      if (!sectorId) break;
      const ae = ensureAlienEcologyState(state);
      for (const s of alienSitesForSector(sectorId)) {
        const r = ae.sites[s.siteId];
        if (!r) continue;
        if (!r.scanRevealed && (r.state === 'awake' || r.state === 'bloom' || r.state === 'severed')) {
          r.scanRevealed = true;
          setRevelation(state, 1);
          recordContaminationKnowledge(state, sectorId, `${s.name}: ${r.state} biological site`);
          refreshAlienLabels(world);
        }
      }
      break;
    }
    case 'sectorsim:impulse': {
      // AE-051 vibration stimulus: mining noise wakes dormant fauna (casket worms).
      if (!payload || payload.kind !== 'mining_noise') break;
      const sectorId = payload.sectorId;
      if (!sectorId) break;
      for (const e of state.entityList || []) {
        const eco = e && e.data && e.data.ecology;
        if (!eco || e.homeSectorId !== sectorId) continue;
        const species = faunaSpeciesById(eco.speciesId);
        if (species && species.dormant && eco.driveState === 'dormant') {
          const player = state.playerId != null ? state.entities.get(state.playerId) : null;
          if (player && player.pos
            && dist2(e.pos.x, e.pos.z, player.pos.x, player.pos.z) <= species.alertR * species.alertR * 2.5) {
            setDrive(eco, species.drives.curious);
            eco.stim.vibration = 1;
          }
        }
      }
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
        // AE-054 carrier rupture: killing a carrier seeds a bloom patch, releases juvenile
        // forms, pushes local C, and flips nearby fauna to feed.
        const carrier = carrierSpecies(eco.speciesId);
        if (carrier) ruptureCarrier(world, e, r, carrier, payload.pos);
      }
      break;
    }
    default:
      break;
  }
}

// AE-054 — carrier rupture. Seeds a growth patch at the kill point, spawns juveniles,
// bumps site contamination, and posts a 'feed' signal the local cast answers.
function ruptureCarrier(world, e, rec, species, pos) {
  const state = world.state;
  const site = ALIEN_SITES[rec && e.data.ecology.siteId] || ALIEN_SITES[e.data.ecology.siteId];
  const siteDef = site || null;
  const p = pos || { x: e.pos.x, z: e.pos.z };
  // Bloom dressing at the rupture point — visible scarring that persists for the visit.
  if (world.helpers) {
    const row = insertDressingRow(state, {
      type: 'fx',
      pos: { x: p.x, z: p.z },
      rot: (state.meta && state.meta.seed || 1) % 7,
      radius: 14,
      homeSectorId: e.homeSectorId,
      data: {
        placeId: 'alien_growth_cyst_cluster',
        moduleId: 'cyst_cluster',
        scale: 1.4,
        strainId: e.data.strainId || (siteDef && siteDef.strainId),
        siteId: e.data.ecology.siteId,
        alienEcology: true,
        ambient: true,
        scannerSignalKind: 'anomaly',
      },
    });
    if (row && world.active && Array.isArray(world.active.dressing)) {
      world.active.dressing.push({ id: row.id, placeId: 'alien_growth_cyst_cluster', pos: row.pos, paletteClass: 'alien' });
    }
    // Juvenile forms — small needle swarms released from the sac.
    const juvSpecies = faunaSpeciesById(species.carrier.juveniles) || null;
    const n = species.carrier.juvenileCount || 2;
    for (let i = 0; juvSpecies && i < n; i += 1) {
      const ang = (i / n) * TWO_PI;
      const juv = world.helpers.spawnEntity({
        type: 'fauna',
        pos: { x: p.x + Math.cos(ang) * 20, z: p.z + Math.sin(ang) * 20 },
        rot: ang,
        radius: juvSpecies.radius * 0.6,
        collides: false,
        physicsBody: false,
        homeSectorId: e.homeSectorId,
        hull: 30,
        data: {
          name: `${scannerBiologyLabel(ensureAlienEcologyState(state).revelation, 'fauna')} (juvenile)`,
          scanLabel: scannerBiologyLabel(ensureAlienEcologyState(state).revelation, 'fauna'),
          scannerSignalKind: 'anomaly',
          strainId: e.data.strainId,
          siteId: e.data.ecology.siteId,
          ecology: {
            speciesId: juvSpecies.id,
            siteId: e.data.ecology.siteId,
            faunaKey: null, // juveniles are transient — not persisted in deadFauna
            driveState: 'drift',
            driveT: 0,
            anchor: { x: p.x, z: p.z },
            phase: ang,
            latency: 0,
            attachTargetId: null,
            stim: {},
            transient: true,
          },
        },
      });
      if (juv && world.active && Array.isArray(world.active.dressing)) {
        world.active.dressing.push({ id: juv.id, placeId: null, pos: juv.pos, paletteClass: 'alien' });
      }
    }
  }
  // Site contamination bump + feed signal for the local cast.
  const r2 = e.data.ecology.siteId && siteRecord(state, e.data.ecology.siteId);
  if (r2) {
    r2.siteC = Math.min(0.2, (r2.siteC || 0) + (species.carrier.bloom || 0.05));
    r2.signals.push({ kind: 'spore_density', pos: { x: p.x, z: p.z }, t: state.simTime || 0 });
    if (r2.signals.length > 8) r2.signals.shift();
  }
  if (world.bus) {
    world.bus.emit('toast', { text: species.carrier.toast || 'The organism ruptures — particulate everywhere.', kind: 'warn', ttl: 5 });
    world.bus.emit('alienEcology:cystRupture', { siteId: e.data.ecology.siteId, pos: p });
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

  // ── AE-076 ship exposure: hull biofilm accrues with point contamination, throttled by
  // fitted filters (mods.bioFilterMult), decaying in clean space. Logistics pressure.
  const ae = ensureAlienEcologyState(state);
  if (player && player.pos) {
    const local = world._toLocal ? world._toLocal(player.pos, sectorId) : player.pos;
    const c = pointContaminationAt(state, sectorId, local.x, local.z);
    const filterMult = exposureFilterMult(state);
    if (c > 0.2) {
      ae.exposure = Math.min(1, (ae.exposure || 0) + c * EXPOSURE_MODEL.gainPerSecPerC * filterMult * dt);
    } else {
      ae.exposure = Math.max(0, (ae.exposure || 0) - EXPOSURE_MODEL.decayPerSec * dt);
    }
    if (!ae._exposureWarned && ae.exposure >= EXPOSURE_MODEL.warnAt) {
      ae._exposureWarned = true;
      world.bus.emit('toast', { text: 'Hull reads contaminated — residue on the scanner plates is degrading returns.', kind: 'warn', ttl: 5 });
    } else if (!ae._exposureSevere && ae.exposure >= EXPOSURE_MODEL.severeAt) {
      ae._exposureSevere = true;
      world.bus.emit('toast', { text: 'BIOLOGICAL FOULING — contact returns are unreliable. Filters overdue.', kind: 'warn', ttl: 6 });
    } else if (ae.exposure < 0.2) {
      ae._exposureWarned = false; ae._exposureSevere = false;
    }
  }

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

  const now = Number(state.simTime) || 0;
  for (const site of sites) {
    const rec = siteRecord(state, site.siteId);
    const siteGlobal = world._toGlobal({ x: site.center.x, z: site.center.z }, sectorId);
    const coherent = rec.relaySevered !== true && rec.state !== 'severed';

    // Staged arrival beats (doc 09): bands around the site trigger the reveal choreography.
    if (player && player.pos) {
      const dSite = Math.sqrt(dist2(player.pos.x, player.pos.z, siteGlobal.x, siteGlobal.z));
      const lines = site.arrivalLines || null;
      if (!rec.beats.long && dSite < site.arrivalBands.long) {
        rec.beats.long = true;
        world.bus.emit('toast', {
          text: (lines && lines.long) || 'Long-range return: wrecked DMC service barge — this hull is not in any registry.',
          kind: 'info', ttl: 5,
        });
      }
      if (!rec.beats.mid && dSite < site.arrivalBands.mid) {
        rec.beats.mid = true;
        world.bus.emit('toast', {
          text: (lines && lines.mid) || 'Multiple small contacts — unclassifiable. They turn together.',
          kind: 'warn', ttl: 5,
        });
        // The synchronized turn: coherent fauna pivot toward the player together. Dormant
        // species hold sleep — the turn is a coherent response; only their stimulus wakes them.
        if (coherent) {
          for (const e of fauna) {
            const eco = e.data.ecology;
            if (eco.siteId !== site.siteId) continue;
            const species = eco.speciesId && faunaSpeciesById(eco.speciesId);
            if (species && species.dormant && eco.driveState === 'dormant') continue;
            eco.driveState = 'investigate';
            eco.driveT = 0;
          }
        }
      }
      if (!rec.beats.close && dSite < site.arrivalBands.close) {
        rec.beats.close = true;
        setRevelation(state, 1);
        world.bus.emit('toast', {
          text: (lines && lines.close) || 'A pulse rolls across the hull — the organisms answer it.',
          kind: 'warn', ttl: 5.5,
        });
        refreshAlienLabels(world);
        recordContaminationKnowledge(state, sectorId, `${site.name}: active biological site`);
        // Ecology mission offer — the site emits its hook when the player is committed.
        if (!rec.offerEmitted && site.surveyOfferId) {
          rec.offerEmitted = true;
          const sector = (state.world.sectors && state.world.sectors[sectorId]) || null;
          emitEcologyOffer(world, site, sector);
        }
      }
    }

    // AE-056 signal decay: rupture/feed signals live ~30s in the record.
    if (rec.signals && rec.signals.length) {
      rec.signals = rec.signals.filter((s) => now - s.t < 30);
    }

    for (const e of fauna) {
      const eco = e.data.ecology;
      if (eco.siteId !== site.siteId) continue;
      tickFauna(world, e, site, rec, coherent, shepherds, player, now, dt, sectorId);
    }
  }
}

// AE-076 — fitted filter stacks (mods.bioFilterMult on utility modules) throttle accrual.
function exposureFilterMult(state) {
  try {
    let mult = 1;
    for (const def of fittedModuleDefs(state)) {
      const m = def && def.mods && def.mods.bioFilterMult;
      if (Number.isFinite(m) && m > 0) mult = Math.min(mult, m);
    }
    return mult;
  } catch (_) { return 1; }
}

function tickFauna(world, e, site, rec, coherent, shepherds, player, now, dt, sectorId) {
  const state = world && world.state;
  const eco = e.data.ecology;
  const species = faunaSpeciesById(eco.speciesId);
  if (!species || !state) return;
  eco.driveT = (eco.driveT || 0) + dt;

  // ── AE-059 capture: a massline latch immobilizes capturable species. ──
  const tether = state.player && state.player.tether;
  const latched = !!(species.capturable && tether && tether.active && tether.targetId === e.id);
  if (latched) {
    eco.driveState = 'captured';
    eco.driveT = 0;
    return; // physics tows it; no self-motion
  }
  if (eco.driveState === 'captured') eco.driveState = 'drift';

  // ── AE-096 precursor_tone: inside a suppression field, fauna scatter outward — the
  // machine's volume overrides every other drive. ──
  const local = world._toLocal ? world._toLocal(e.pos, sectorId) : e.pos;
  const sup = suppressionFieldAt(sectorId, local.x, local.z);
  if (sup) {
    const gx = site ? world._toGlobal({ x: sup.center.x, z: sup.center.z }, sectorId) : null;
    if (gx) {
      const ang = Math.atan2(e.pos.z - gx.z, e.pos.x - gx.x);
      const push = species.fleeSpeed || species.speed || 20;
      e.rot = angleLerp(e.rot, ang, Math.min(1, species.turnRate * dt * 2));
      e.pos.x += Math.cos(e.rot) * push * dt;
      e.pos.z += Math.sin(e.rot) * push * dt;
      eco.suppressedT = (eco.suppressedT || 0) + dt;
      return;
    }
  }
  eco.suppressedT = 0;

  const awake = rec.state === 'awake' || rec.state === 'bloom';
  const alertR = species.alertR * (awake ? 1.35 : 1) * (coherent ? 1 : species.coherenceLoss.alertMult);
  const px = player && player.pos ? player.pos.x : null;
  const pz = player && player.pos ? player.pos.z : null;
  const playerD = px != null ? Math.sqrt(dist2(e.pos.x, e.pos.z, px, pz)) : Infinity;

  // ── AE-051 stimulus accumulation ──
  // heat: sustained high speed close by (drive plume reads warm)
  const stim = eco.stim || (eco.stim = {});
  const playerSpeed = player && player.vel ? Math.sqrt(player.vel.x * player.vel.x + player.vel.z * player.vel.z) : 0;
  const sens = species.stimuli || {};
  stim.heat = clampStim(stim.heat, (sens.heat || 0) * (playerSpeed > 40 && playerD < alertR * 1.4 ? 1 : 0) * dt);
  stim.scan = clampStim(stim.scan, (sens.scan || 0) * (playerD < (species.alertR * 0.5) ? 1 : 0) * dt);
  stim.mass = clampStim(stim.mass, (sens.mass || 0) * (playerD < alertR ? 1 : 0) * dt);

  // Furnace Maw heat rule: shadow at range until the target is heat-saturated, then charge.
  if (species.heatHunter && px != null) {
    eco.heatSat = Math.max(0, (eco.heatSat || 0)
      + (playerSpeed > 55 ? dt * (sens.heat || 1) : -dt * 0.5));
  }

  // Relay broadcast: coherent fauna bias headings toward the shepherd's slow consensus turn.
  const shepherd = shepherds.find((s) => s.data.ecology.siteId === site.siteId);

  // ── stimulus → drive resolution (doc 02 grammar) ──
  const stimulated = playerD < alertR || (stim.heat || 0) > 0.8;
  if (stimulated) eco.stimulusT = (eco.stimulusT || 0) + dt;
  else eco.stimulusT = 0;
  const reacted = coherent || (eco.stimulusT || 0) >= species.coherenceLoss.latency;

  // Feed signal wins over curiosity: a fresh rupture pulls feeders toward it.
  const feedSignal = rec.signals && rec.signals.find((s) => s.kind === 'spore_density');
  if (feedSignal && (sens.spore_density || 0) > 0 && eco.driveState !== 'feed' && eco.driveState !== 'flee') {
    eco.feedTarget = { x: feedSignal.pos.x, z: feedSignal.pos.z };
    setDrive(eco, 'feed');
  }

  if (reacted && !species.dormant) {
    if (species.heatHunter && (eco.heatSat || 0) > 3 && playerD < alertR) {
      setDrive(eco, 'charge');
    } else if (playerD < species.threatenR) {
      setDrive(eco, species.drives.panic);
    } else if (playerD < alertR) {
      setDrive(eco, awake ? species.drives.tense : species.drives.curious);
    } else if (eco.driveState !== 'attach' && eco.driveState !== 'idle' && eco.driveState !== 'feed') {
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
    case 'dormant': {
      // Casket worm: holds still in the wreck cavity; vibration stimulus wakes it.
      targetX = e.pos.x; targetZ = e.pos.z; speed = 0;
      break;
    }
    case 'anchored': {
      // Anchor beast: sessile — only rotates to track the strongest stimulus.
      if (px != null && playerD < alertR) {
        e.rot = angleLerp(e.rot, Math.atan2(pz - e.pos.z, px - e.pos.x), Math.min(1, species.turnRate * dt));
      }
      return;
    }
    case 'drift': {
      // Slow meander around the anchor: deterministic wander from simTime + phase.
      const w = now * 0.05 + eco.phase;
      targetX = siteGlobalAnchor.x + Math.cos(w) * 60;
      targetZ = siteGlobalAnchor.z + Math.sin(w * 0.9) * 60;
      speed *= 0.45;
      // Lantern cysts drift toward heat sources instead.
      if ((sens.heat || 0) >= 0.9 && px != null && stim.heat > 0.5) { targetX = px; targetZ = pz; }
      break;
    }
    case 'forage': {
      const w = now * 0.08 + eco.phase;
      targetX = siteGlobalAnchor.x + Math.cos(w) * 110;
      targetZ = siteGlobalAnchor.z + Math.sin(w) * 110;
      speed *= 0.6;
      break;
    }
    case 'feed': {
      // Move to the rupture point and hold while the signal is fresh.
      if (!eco.feedTarget) { setDrive(eco, species.drives.idle); break; }
      targetX = eco.feedTarget.x; targetZ = eco.feedTarget.z;
      const d = Math.sqrt(dist2(e.pos.x, e.pos.z, targetX, targetZ));
      if (d < 24) { targetX = e.pos.x; targetZ = e.pos.z; speed *= 0.2; }
      break;
    }
    case 'migrate': {
      // Walk the waypoint loop — route memory, not intent (mourning kite).
      const mig = eco.migration;
      if (mig && mig.route && mig.route.length) {
        const wp = mig.route[mig.index % mig.route.length];
        targetX = wp.x; targetZ = wp.z;
        if (dist2(e.pos.x, e.pos.z, wp.x, wp.z) < 40 * 40) mig.index += 1;
        speed *= 0.55;
      } else {
        setDrive(eco, 'drift');
      }
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
    case 'trail': {
      // Wake eel: ride a moving hull's wake — behind it, never at it.
      if (px == null) { setDrive(eco, species.drives.idle); break; }
      const heading = player && player.rot != null ? player.rot : Math.atan2(e.pos.z - pz, e.pos.x - px);
      const back = heading + Math.PI;
      const ang = Math.atan2(e.pos.z - pz, e.pos.x - px) + dt * 0.3;
      targetX = px + Math.cos(back + Math.sin(now * 0.4 + eco.phase) * 0.3) * (species.preferredR || 120);
      targetZ = pz + Math.sin(back + Math.cos(now * 0.35 + eco.phase) * 0.3) * (species.preferredR || 120);
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
    case 'charge': {
      // Bristle ram / furnace maw: drive straight at the mass — for physics species the
      // collision is the message; for kinematic ones we stop just short.
      if (px == null) { setDrive(eco, species.drives.idle); break; }
      const ang = Math.atan2(pz - e.pos.z, px - e.pos.x);
      const stopAt = species.physicsBody ? 0 : species.radius + (player && player.radius || 10) + 4;
      const holdR = Math.max(stopAt, species.preferredR * 0.15);
      if (playerD > holdR) {
        targetX = px - Math.cos(ang) * holdR;
        targetZ = pz - Math.sin(ang) * holdR;
        speed = (species.fleeSpeed || species.speed) * speedMult;
      } else {
        targetX = e.pos.x; targetZ = e.pos.z; speed = 0;
      }
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

function clampStim(v, d) {
  return Math.min(2, Math.max(0, (v || 0) + d));
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
    exposure: ae.exposure || 0,
    machineAccess: ae.machineAccess ? { ...ae.machineAccess } : {},
    mapKnowledge: ae.mapKnowledge ? JSON.parse(JSON.stringify(ae.mapKnowledge)) : {},
  };
}

export function deserializeAlienEcologyState(state, data) {
  const ae = ensureAlienEcologyState(state);
  if (!data || typeof data !== 'object' || data.schema !== ALIEN_ECOLOGY_SCHEMA) return ae;
  ae.revelation = Math.max(0, Math.min(3, Math.trunc(data.revelation) || 0));
  ae.machineProtocol = typeof data.machineProtocol === 'string' ? data.machineProtocol : ae.machineProtocol;
  ae.exposure = Math.min(1, Math.max(0, Number(data.exposure) || 0));
  if (data.machineAccess && typeof data.machineAccess === 'object') {
    ae.machineAccess = { ...data.machineAccess };
  }
  if (data.mapKnowledge && typeof data.mapKnowledge === 'object') {
    ae.mapKnowledge = JSON.parse(JSON.stringify(data.mapKnowledge));
  }
  if (data.taxonomy && typeof data.taxonomy === 'object') Object.assign(ae.taxonomy, data.taxonomy);
  if (data.sites && typeof data.sites === 'object') {
    for (const [siteId, rec] of Object.entries(data.sites)) {
      if (!rec || typeof rec !== 'object') continue;
      ae.sites[siteId] = {
        state: typeof rec.state === 'string' ? rec.state : 'dormant',
        // Legacy saves encoded severance only in state; fold it into the flag.
        relaySevered: !!rec.relaySevered || rec.state === 'severed',
        objectiveDone: !!rec.objectiveDone,
        bloomAt: Number.isFinite(rec.bloomAt) ? rec.bloomAt : -1,
        beats: rec.beats && typeof rec.beats === 'object' ? { ...rec.beats } : {},
        deadFauna: rec.deadFauna && typeof rec.deadFauna === 'object' ? { ...rec.deadFauna } : {},
        siteC: Number.isFinite(rec.siteC) ? rec.siteC : 0,
        signals: [], // transient buffer — never persisted
        scanRevealed: !!rec.scanRevealed,
        offerEmitted: !!rec.offerEmitted,
      };
    }
  }
  return ae;
}
