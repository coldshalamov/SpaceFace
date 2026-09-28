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
  ecologyMissionsForSite,
  planAmbientGrowth,
  planFaunaCast,
  planInfestationModules,
  planPhantomContacts,
  pointContaminationAt,
  recordContaminationKnowledge,
  scannerBiologyLabel,
  EXPOSURE_MODEL,
  DEEP_FILTER_GATE,
  DOMAIN_THRESHOLD,
  WREN_RECOGNITION,
  LIVE_SPECIMEN_CMDTY,
  FIELD_LANGUAGE,
  FAUNA_DROPS,
  SUPPRESSION_DROPS,
  RIPENING,
  pickEcologyEncounter,
  EVIDENCE_TABLE,
  SETPIECE_DEFS,
} from '../data/alienEcology.js';
import { carrierSpecies, faunaSpeciesById } from '../data/alienFauna.js';
import { suppressionFieldAt, MACHINE_SITES } from '../data/precursorMachines.js';
import { shepherdFieldAt } from './precursorMachines.js';
import { insertDressingRow } from '../world/dressingTable.js';
import { fittedModuleDefs } from '../core/fittedModules.js';
import { addCargo, removeCargo } from './cargo.js';
import { commodityIsBiohazard } from '../data/commodities.js';
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
      // AE-130..137: each authored ecology mission emits once — a per-mission ledger.
      offersEmitted: {},
      deepTraceDone: false,
    };
  }
  if (!ae.sites[siteId].offersEmitted || typeof ae.sites[siteId].offersEmitted !== 'object') {
    ae.sites[siteId].offersEmitted = {};
  }
  return ae.sites[siteId];
}

// AE-121 (G01): a fitted Bio-Spectral Pass resolves BIOLOGICAL signatures one rung further
// up the reveal ladder — the scan head knows what the hull doesn't. Machine/gate readings
// stay on the raw axis; the K-table handshake covers protocol, not biology.
export function effectiveRevelation(state) {
  const ae = ensureAlienEcologyState(state);
  const bonus = fittedModuleDefs(state).reduce(
    (m, d) => Math.max(m, Number(d && d.mods && d.mods.bioScanTier) || 0), 0,
  );
  return Math.min(ae.revelation + bonus, 3);
}

function fittedFlag(state, key) {
  return fittedModuleDefs(state).some((d) => d && d.mods && d.mods[key] === true);
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
    // AE-175/176: morphology fingerprint per site; severed sites draw the dead palette.
    const growth = site.sterile ? [] : planInfestationModules(site, rng, rec.state);
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
          strainId: strain ? strain.id : null,
          siteId: site.siteId,
          alienEcology: true,
          scannerSignalKind: 'anomaly',
        },
      });
      active.dressing.push({ id: row.id, placeId: `alien_growth_${g.moduleId}`, pos: row.pos, paletteClass: 'alien' });
    }

    // AE-071 ambient dressing: contamination state spills loose growth beyond the ring.
    for (const a of (site.sterile ? [] : planAmbientGrowth(state, site, rng))) {
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
          strainId: strain ? strain.id : null,
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
      // Migration route: members of migrates species walk the waypoint loop. AE-165:
      // a site's authored routeEcho waypoints count as the route when no full
      // migrationRoute block is authored.
      const routeDef = site.migrationRoute || site.routeEcho || null;
      const migration = species.migrates && routeDef ? {
        route: routeDef.waypoints.map((w) => world._toGlobal({ x: site.center.x + w.x, z: site.center.z + w.z }, sector.id)),
        index: Math.floor(rng() * routeDef.waypoints.length),
      } : null;
      // AE-162: a disguised species (black sail) reads as debris on the board until a
      // completed close scan flips it broadside.
      const disguised = !!species.disguise;
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
          name: disguised ? 'Debris field fragment'
            : effectiveRevelation(state) >= 2 ? species.name
            : scannerBiologyLabel(effectiveRevelation(state), species.signature),
          scanLabel: disguised ? 'debris'
            : scannerBiologyLabel(effectiveRevelation(state), species.signature),
          scannerSignalKind: disguised ? 'debris' : 'anomaly',
          strainId: strain ? strain.id : null,
          siteId: site.siteId,
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
            disguised: disguised,
            chainTo: null,
            bornAt: state.simTime || 0,
          },
        },
      });
      if (ent) active.dressing.push({ id: ent.id, placeId: null, pos: ent.pos, paletteClass: 'alien' });
    }

    // AE-073 phantom contacts: high-C sectors mint seeded anomaly pings that resolve to
    // nothing — the scanner surface distrusts itself before the player understands why.
    // AE-188 false-fauna sites mint their own pings even below the sector threshold —
    // the scanner reports organisms the Empty Skin never had.
    if (!Array.isArray(active.pois)) active.pois = [];
    const contrast = fittedFlag(state, 'filamentContrast');
    const phantomPlan = planPhantomContacts(state, sector.id, rng);
    if (site.falseFauna) {
      for (let i = 0; i < 3; i += 1) {
        const ang = rng() * TWO_PI;
        phantomPlan.push({
          id: `phantom_false_${site.siteId}_${i}`,
          dx: Math.cos(ang) * 260,
          dz: Math.sin(ang) * 260,
          phantom: true,
        });
      }
    }
    for (const ph of phantomPlan) {
      active.pois.push({
        id: null,                 // markerless — no entity, projection only
        poiId: ph.id,
        type: 'anomaly',
        pos: world._toGlobal({ x: site.center.x + ph.dx, z: site.center.z + ph.dz }, sector.id),
        // G02 filament contrast: fitted filter marks probable echoes on the board.
        name: contrast ? 'UNRESOLVED SIGNAL ?' : 'UNRESOLVED SIGNAL',
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
  const state = world && world.state;
  const rec = siteRecord(state, site.siteId);
  const missions = ecologyMissionsForSite(site.siteId);
  if (!missions.length) return;
  const stations = (sector && sector.stations) || [];
  const station = stations[0] || null;
  let emitted = 0;
  // AE-130..137 — every authored faction desk at the site emits once, each under its own
  // offersEmitted key; a site carrying multiple contracts surfaces all of them.
  for (const mission of missions) {
    if (rec.offersEmitted[mission.id]) continue;
    rec.offersEmitted[mission.id] = true;
    const offer = {
      id: `ecology_${mission.id}`,
      offerId: `ecology_${mission.id}`,
      source: 'ecology',
      sectorId: site.sectorId,
      zoneId: site.zoneId || null,
      type: mission.type,
      stationId: station ? station.id : null,
      factionId: mission.factionId || null,
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
      emitted += 1;
    }
  }
  if (emitted > 0 && world.bus) world.bus.emit('audio:cue', { id: 'scan_resolve' });
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
      // AE-162 — a completed scan on a disguised organism resolves the debris read:
      // the sail turns broadside and the label climbs the reveal ladder.
      const tgt = payload.targetId != null && state.entities.get(payload.targetId);
      const teco = tgt && tgt.data && tgt.data.ecology;
      if (teco && teco.disguised) {
        teco.disguised = false;
        const tspecies = faunaSpeciesById(teco.speciesId);
        const label = scannerBiologyLabel(effectiveRevelation(state), (tspecies && tspecies.signature) || 'fauna');
        tgt.data.scanLabel = label;
        tgt.data.scannerSignalKind = 'anomaly';
        tgt.data.name = effectiveRevelation(state) >= 2 && tspecies ? tspecies.name : label;
        world.bus.emit('toast', {
          text: 'The debris fragment turns broadside — photophore membrane, alive. It was never debris.',
          kind: 'warn', ttl: 6,
        });
        refreshAlienLabels(world);
      }
      break;
    }
    case 'economy:tradeCompleted': {
      // AE-229: a spore catalyst lot applies itself at the point of sale — the intake
      // manifold fires it through the seams and the hull purge is the fee.
      if (!payload || payload.side !== 'sell' || payload.commodityId !== 'cmdty_spore_catalyst') break;
      const ae = ensureAlienEcologyState(state);
      if ((ae.exposure || 0) > 0) {
        ae.exposure = 0;
        ae._exposureWarned = false;
        ae._exposureSevere = false;
        toast('Catalyst lot fires at intake — hull biofilm purged through the seams.', 'good', 5);
      }
      break;
    }
    case 'sectorsim:impulse': {
      // AE-051 vibration stimulus: mining noise wakes dormant fauna (casket worms).
      if (!payload || payload.kind !== 'mining_noise') break;
      // AE-168 (G14): a Resonant Massline's strike carries a dead-matter signature —
      // dormant fauna do not read the beam as a threat.
      if (fittedFlag(state, 'resonantMassline')) break;
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
      if (eco && eco.speciesId) {
        const r = eco.siteId ? siteRecord(state, eco.siteId) : null;
        const now = Number(state.simTime) || 0;
        if (eco.faunaKey && r) r.deadFauna[eco.faunaKey] = true;
        // AE-172/D09 panic cascade: the kill posts a panic signal — the site cast scatters
        // now; after the propagation delay the wave reaches every species on the field.
        if (r) {
          r.fleeWave = {
            x: e.pos.x, z: e.pos.z, t: now,
            delayUntil: now + FIELD_LANGUAGE.fleeWaveDelayS,
            until: now + FIELD_LANGUAGE.fleeWaveTtlS,
            speciesId: eco.speciesId,
          };
          r.signals.push({ kind: 'panic', pos: { x: e.pos.x, z: e.pos.z }, t: now });
        }
        // AE-226..228 harvest: dead fauna shed bio-resource pickups; inside a machine
        // suppression pocket the roll swaps to the sterile-shell table (AE-227).
        dropFaunaHarvest(world, e, eco);
        // AE-054 carrier rupture: killing a carrier seeds a bloom patch, releases juvenile
        // forms, pushes local C, and flips nearby fauna to feed.
        const carrier = carrierSpecies(eco.speciesId);
        if (carrier && r) ruptureCarrier(world, e, r, carrier, payload.pos);
      }
      break;
    }
    case 'alienEcology:lureDropped': {
      // AE-124 (G10): a charge-thrown lure registers on the sector — heat-sensitive drives
      // prefer it over the player plume until it burns out (transient; not serialized).
      const ae = ensureAlienEcologyState(state);
      if (!Array.isArray(ae.lures)) ae.lures = [];
      ae.lures.push({
        x: Number(payload.x) || 0,
        z: Number(payload.z) || 0,
        sectorId: payload.sectorId || (state.world && state.world.currentSectorId),
        until: (Number(state.simTime) || 0) + (payload.burnS || 60),
      });
      if (ae.lures.length > 8) ae.lures.shift();
      toast('Lure beacon burning hot — the predators hear it.', 'info', 3);
      break;
    }
    case 'tether:released': {
      // AE-167 + G13: releasing a latched organism while a Capture Cradle is fitted puts a
      // live specimen in the hold instead of letting the animal drift away.
      const e = payload.targetId != null && state.entities.get(payload.targetId);
      const eco = e && e.data && e.data.ecology;
      if (!eco || !eco.faunaKey) break;
      if (eco.driveState !== 'captured') break;
      const cradle = fittedModuleDefs(state).reduce(
        (m, d) => Math.max(m, Number(d && d.mods && d.mods.captureSurvivalMult) || 0), 0,
      );
      if (cradle <= 0) break;
      eco.driveState = 'captured'; // keep latched state consistent for despawn
      const added = addCargo(state, LIVE_SPECIMEN_CMDTY, 1, 'capture_cradle');
      if (added <= 0) {
        toast('Hold full — the cradled specimen could not be berthed.', 'warn', 4);
        break;
      }
      const species = faunaSpeciesById(eco.speciesId);
      if (world.helpers && typeof world.helpers.removeEntity === 'function') {
        world.helpers.removeEntity(e.id, { immediate: true });
      } else {
        e.alive = false;
      }
      const r = eco.siteId && siteRecord(state, eco.siteId);
      if (r) r.deadFauna[eco.faunaKey] = true; // it leaves the ecosystem permanently
      setRevelation(state, 2);
      toast(`Live specimen secured — ${species ? species.name : 'organism'} cradled in the hold.`, 'good', 5);
      recordContaminationKnowledge(state, e.homeSectorId, 'a live organism carried in cradle custody');
      break;
    }
    case 'dock:docked': {
      // AE-125 (G08): a fitted Hull Purge Ring fires once per berth — fouled hulls leave clean.
      const ae = ensureAlienEcologyState(state);
      if (!fittedFlag(state, 'hullPurgeRing')) break;
      if ((ae.exposure || 0) <= 0.02) break;
      ae.exposure = 0;
      ae._exposureWarned = false;
      ae._exposureSevere = false;
      toast('Purge ring cycle — biofilm burned off the plate seams. Hull reads clean.', 'good', 5);
      break;
    }
    case 'ecology:evidence': {
      // Phase 27 (L-table): anything may file an evidence row — machines, setpieces,
      // deep traces. The ledger gates revelation pacing (T2 = 3 rows, T3 = any deep row).
      recordEvidence(state, payload.id, payload.sectorId || null);
      break;
    }
    case 'ecology:quarantinePulse': {
      // M09: the executor's pulse already destroyed the lots — the ledger learns the loss.
      if (payload && payload.scrubbed > 0) {
        const ae = ensureAlienEcologyState(state);
        ae._pulseScrubbed = (ae._pulseScrubbed || 0) + payload.scrubbed;
        toast('Quarantine pulse — biohazard manifest scrubbed in transit.', 'warn', 6);
      }
      break;
    }
    case 'ecology:factionOutcome': {
      // AE-138/139: custody refusals and biohazard sales are remembered per faction.
      const ae = ensureAlienEcologyState(state);
      if (!ae.factionConsequences || typeof ae.factionConsequences !== 'object') {
        ae.factionConsequences = {};
      }
      const fid = payload.factionId || 'unfiled';
      const entry = ae.factionConsequences[fid] || (ae.factionConsequences[fid] = { refused: 0, sold: 0, sealed: 0 });
      if (payload.outcome === 'custody_refused') entry.refused += 1;
      else if (payload.outcome === 'sealed_sale') entry.sealed += 1;
      else if (payload.outcome === 'biohazard_sale') entry.sold += 1;
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
            juvenile: true,
            bornAt: state.simTime || 0,
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
    e.data.scanLabel = scannerBiologyLabel(effectiveRevelation(state), species.signature);
    e.data.name = ae.revelation >= 2 ? species.name : e.data.name;
    // AE-127 (G12): a fitted Relay Needle resolves coherent emitters — relay organisms
    // report their broadcast status instead of a bare contact tier.
    if (species.relay && fittedFlag(state, 'relayNeedle')) {
      const r = e.data.ecology.siteId && ae.sites[e.data.ecology.siteId];
      const coherent = r ? (r.relaySevered !== true && r.state !== 'severed') : true;
      e.data.scanLabel = `${e.data.scanLabel} — RELAY ${coherent ? 'COHERENT' : 'SEVERED'}`;
    }
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
  // Note: no early return on empty fauna — vignettes, tolls, and relay pulses still fire
  // in contaminated sectors whose cast is empty (falseFauna sites, harvested-out sites).

  const now = Number(state.simTime) || 0;

  // ── Phase 11/12 field instruments (AE-114, AE-117, AE-119, AE-122, AE-124) ──
  if (!Array.isArray(ae.lures)) ae.lures = [];
  if (ae.lures.length) ae.lures = ae.lures.filter((l) => l.until > now);
  if (!ae.sectorFlags || typeof ae.sectorFlags !== 'object') ae.sectorFlags = {};
  if (player && player.pos) {
    const localP = world._toLocal ? world._toLocal(player.pos, sectorId) : player.pos;
    const sectorC = pointContaminationAt(state, sectorId, localP.x, localP.z);
    const sectorDef = (state.world.sectors && state.world.sectors[sectorId]) || null;

    // AE-114 — deep filter route gate: entering a contaminated deep sector unfiltered
    // earns one advisory per sector visit; the field notices an open hull.
    if (sectorDef && (sectorDef.tier || 0) >= DEEP_FILTER_GATE.minTier
        && sectorC >= DEEP_FILTER_GATE.minLean && !ae.sectorFlags[`${sectorId}:advised`]
        && exposureFilterMult(state) >= 1) {
      ae.sectorFlags[`${sectorId}:advised`] = true;
      world.bus.emit('toast', { text: DEEP_FILTER_GATE.advisory, kind: 'warn', ttl: 7 });
      recordContaminationKnowledge(state, sectorId, 'unfiltered hull inside a contaminated sector');
    }

    // AE-119 — domain threshold: at C>=0.8 the field itself reads different.
    if (sectorC >= DOMAIN_THRESHOLD.minC && !ae.sectorFlags[`${sectorId}:domain`]) {
      ae.sectorFlags[`${sectorId}:domain`] = true;
      world.bus.emit('toast', { text: DOMAIN_THRESHOLD.toast, kind: 'warn', ttl: 7 });
      recordContaminationKnowledge(state, sectorId, DOMAIN_THRESHOLD.knowledge);
    }

    // AE-117 — Wren's first field recognition, once per save.
    if (sectorC >= WREN_RECOGNITION.minC && !ae.wrenRecognized) {
      ae.wrenRecognized = true;
      world.bus.emit('comms:log', { from: 'Wren (personal log)', text: WREN_RECOGNITION.text, kind: 'ecology' });
    }

    // AE-122 (G06): a fitted coherence meter reports the local field once a second.
    if (fittedFlag(state, 'coherenceMeter')) {
      ae._cohT = (ae._cohT || 0) + dt;
      if (ae._cohT >= 1) {
        ae._cohT = 0;
        let meterSite = null;
        for (const s of sites) {
          const g = world._toGlobal({ x: s.center.x, z: s.center.z }, sectorId);
          if (dist2(player.pos.x, player.pos.z, g.x, g.z)
              < Math.pow((s.arrivalBands && s.arrivalBands.mid) || 800, 2)) { meterSite = s; break; }
        }
        if (meterSite) {
          const r = siteRecord(state, meterSite.siteId);
          world.bus.emit('ecology:coherence', {
            siteId: meterSite.siteId,
            coherent: r.relaySevered !== true && r.state !== 'severed',
            contamination: sectorC,
            t: now,
          });
        }
      }
    }

    // AE-077/122 — biohazard lots breathe on the manifest: unsealed custody feeds hull
    // exposure. A Quarantine Locker makes the hold airtight.
    if (!fittedFlag(state, 'quarantineLocker')) {
      const cargo = state.player && state.player.cargo;
      if (cargo && cargo.items) {
        let bioUnits = 0;
        for (const cid of Object.keys(cargo.items)) {
          if (commodityIsBiohazard(cid)) bioUnits += cargo.items[cid] || 0;
        }
        if (bioUnits > 0) {
          ae.exposure = Math.min(1, (ae.exposure || 0) + bioUnits * 0.0004 * dt);
        }
      }

      // AE-230 — ripening: unsealed biohazard lots held through high-C space mature into
      // rarer tissue. The hold is a slow incubator; the chain tops out at interface tissue.
      ae._ripenT = (ae._ripenT || 0) + dt;
      if (ae._ripenT >= RIPENING.periodS) {
        ae._ripenT = 0;
        if (sectorC >= RIPENING.minC) ripenCargo(world, sectorId);
      }
    }

    // ── Phase 21 — wired vignette deck: the ecology pulls human-scale encounters on a
    // throttle. Bark rows post to the comms log; edge rows carry a systemic effect. ──
    ae._encT = (ae._encT || 0) + dt;
    if (ae._encT >= 16 && sectorC >= 0.25) {
      ae._encT = 0;
      const row = pickEcologyEncounter(state, sectorId, null,
        (state.world && state.world.rng) || state.rng);
      if (row && row.bark && row.shape !== ae._lastEnc) {
        ae._lastEnc = row.shape;
        world.bus.emit('comms:log', { from: 'Local traffic', kind: 'ecology', text: row.bark });
        if (row.edge) applyEncounterEdge(world, row, sectorId, fauna);
      }
    }

    // AE-160 — cold bell toll: sectors carrying a live radiation hazard let
    // weather-listener fauna ring ahead of the front. One toll per period, only while a
    // bell is actually on the field.
    ae._tollT = (ae._tollT || 0) + dt;
    if (ae._tollT >= FIELD_LANGUAGE.weatherFrontPeriodS) {
      ae._tollT = 0;
      const hasFront = sectorDef && Array.isArray(sectorDef.hazards)
        && sectorDef.hazards.some((h) => h && h.type === 'radiation');
      const bells = hasFront && fauna.some((f) => {
        const sp = f.data && f.data.ecology && faunaSpeciesById(f.data.ecology.speciesId);
        return sp && sp.weatherListener && f.alive !== false;
      });
      if (bells) {
        world.bus.emit('comms:log', {
          from: 'Band intercept', kind: 'ecology',
          text: 'A low electromagnetic toll rolls across the band — something out there rings before the radiation front arrives.',
        });
      }
    }

    // ── Phase 28 (M-table) + Phase 29 (N-table): hazards and one-shot setpieces. ──
    runSetpieces(world, sectorId, now, dt, sites);
    runEcologyHazards(world, sectorId, now, dt, sites);

    // AE-180 (D02) — relay pulse: sites with live relays broadcast in phase on a sector
    // cadence. An Echo Recorder logs each pulse into the field notebook.
    ae._pulseT = (ae._pulseT || 0) + dt;
    if (ae._pulseT >= FIELD_LANGUAGE.relayPulsePeriodS) {
      ae._pulseT = 0;
      const pulsing = sites.filter((s) => {
        const r = siteRecord(state, s.siteId);
        return r.relaySevered !== true && r.state !== 'severed';
      });
      if (pulsing.length) {
        world.bus.emit('ecology:relayPulse', {
          sectorId, t: now, siteIds: pulsing.map((s) => s.siteId),
        });
        // M06 — relay induction: standing inside a pulsing site when it fires charges the
        // hull — a measurable exposure bump, not free coherence.
        for (const s of pulsing) {
          if (!player || !player.pos) break;
          const sg = world._toGlobal({ x: s.center.x, z: s.center.z }, sectorId);
          if (dist2(player.pos.x, player.pos.z, sg.x, sg.z) < s.radius * s.radius) {
            ae.exposure = Math.min(1, (ae.exposure || 0) + 0.03);
            if (!siteRecord(state, s.siteId).beats.induction) {
              siteRecord(state, s.siteId).beats.induction = true;
              world.bus.emit('toast', {
                text: 'Relay induction — the pulse reads you back. Hull residue climbing.',
                kind: 'warn', ttl: 5,
              });
            }
          }
          // N03 — a pylon pulse inside the dead triangle flinches every organism in sector.
          if (s.siteId === 'charon_pylon_field'
            && !ae.setpieces.N03_pylon_pulse
            && dist2(player.pos.x, player.pos.z, sg.x, sg.z) < 360 * 360) {
            ae.setpieces.N03_pylon_pulse = true;
            for (const f of fauna) {
              const eco = f.data && f.data.ecology;
              if (eco) { eco.driveState = 'flee'; eco.fleeFrom = { x: sg.x, z: sg.z }; eco.driveT = 0; }
            }
            world.bus.emit('toast', {
              text: 'A pulse crosses the dead triangle — every organism in the sector flinches at once.',
              kind: 'warn', ttl: 5,
            });
          }
        }
        if (fittedFlag(state, 'echoRecorder')) {
          if (!Array.isArray(ae.echoLog)) ae.echoLog = [];
          ae.echoLog.push({ sectorId, t: now, sites: pulsing.map((s) => s.siteId) });
          if (ae.echoLog.length > 32) ae.echoLog.shift();
          world.bus.emit('comms:log', {
            from: 'Echo Recorder', kind: 'ecology',
            text: `Relay pulse logged — ${pulsing.length} site(s) fired in phase. Coherence signature filed.`,
          });
        }
      }
    }
  }

  // D07 predator silence / D08 weather drag are computed once per tick, not per animal.
  const weatherSlow = sectorDefWeatherSlow(state, sectorId);
  const predatorsOn = fauna.filter((f) => {
    const sp = f.data && f.data.ecology && faunaSpeciesById(f.data.ecology.speciesId);
    return sp && sp.heatHunter && f.alive !== false;
  });

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
        // AE-116/118 — deep-trace evidence: close read on a C4 site teaches the deep
        // ladder rung (Vethari-scale architecture) once, on top of the generic reveal.
        if (site.deepTraceEvidence && !rec.deepTraceDone) {
          rec.deepTraceDone = true;
          setRevelation(state, 3);
          recordContaminationKnowledge(state, sectorId, `${site.name}: deep-trace architecture`);
          world.bus.emit('comms:log', {
            from: 'Instrument note', kind: 'ecology',
            text: 'The ring structures under the growth are load-bearing and geometric — organized, machined, and old. DEEP-TRACE evidence logged.',
          });
        }
        // Ecology mission offers — the site emits each of its authored hooks once.
        const sector = (state.world.sectors && state.world.sectors[sectorId]) || null;
        emitEcologyOffer(world, site, sector);
        // AE-177 module beats: a memory knot bleeds an archive fragment on close approach;
        // a mirror membrane keeps the board fogged with phantoms while the player is close.
        const mix = Array.isArray(site.morphologyMix) ? site.morphologyMix : [];
        if (mix.includes('memory_knot') && !rec.beats.memoryKnot) {
          rec.beats.memoryKnot = true;
          setRevelation(state, 2);
          world.bus.emit('comms:log', {
            from: 'Archive fragment', kind: 'ecology',
            text: 'A knot of dense tissue replays the site’s construction — thermal signatures of a crew that stopped answering decades ago.',
          });
        }
        if (mix.includes('mirror_membrane') && !rec.beats.membrane) {
          rec.beats.membrane = true;
          // Phantom echo: two mirrored anomaly pings surface near the site — the scanner
          // distrusts itself in the membrane's reflection.
          if (world.active && Array.isArray(world.active.pois)) {
            for (let i = 0; i < 2; i += 1) {
              const ang = (now * 0.13 + i * Math.PI) % TWO_PI;
              world.active.pois.push({
                id: null,
                poiId: `phantom_membrane_${site.siteId}_${i}`,
                type: 'anomaly',
                pos: world._toGlobal({
                  x: site.center.x + Math.cos(ang) * 700,
                  z: site.center.z + Math.sin(ang) * 700,
                }, sectorId),
                name: 'UNRESOLVED SIGNAL',
                hidden: false,
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
      }
      // AE-171 (G03): a fitted Host-Memory Cartography module resolves the site’s host
      // structure the first time the long band is crossed.
      if (fittedFlag(state, 'hostMapReveal') && dSite < site.arrivalBands.long && !rec.beats.hostMap) {
        rec.beats.hostMap = true;
        recordContaminationKnowledge(state, sectorId,
          `${site.name}: host hull mapped — ${site.strainId || 'strainless'} architecture`);
        world.bus.emit('toast', {
          text: `Cartography resolves the host under the growth — ${site.name}.`, kind: 'info', ttl: 5,
        });
      }
    }

    // AE-056 signal decay: rupture/feed signals live ~30s in the record.
    if (rec.signals && rec.signals.length) {
      rec.signals = rec.signals.filter((s) => now - s.t < 30);
    }

    const predatorAlive = predatorsOn.some((f) => f.data.ecology.siteId === site.siteId);
    for (const e of fauna) {
      const eco = e.data.ecology;
      if (eco.siteId !== site.siteId) continue;
      tickFauna(world, e, site, rec, coherent, shepherds, player, now, dt, sectorId,
        predatorAlive, weatherSlow);
    }
  }
}

// AE-123 (G11) — fitted Quiet Mask (mods.stealthBioMult) shrinks the hull's biological
// signature: alert radii and stimulus accrual both scale down.
function stealthMult(state) {
  try {
    let mult = 1;
    for (const def of fittedModuleDefs(state)) {
      const m = def && def.mods && def.mods.stealthBioMult;
      if (Number.isFinite(m) && m > 0) mult = Math.min(mult, m);
    }
    // AE-207 quiet-passage edge: a bought signal profile masks the hull for its window.
    const ae = state && state.world && state.world.alienEcology;
    if (ae && ae.stealthWindowUntil > (Number(state.simTime) || 0)) mult *= 0.35;
    return mult;
  } catch (_) { return 1; }
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

function tickFauna(world, e, site, rec, coherent, shepherds, player, now, dt, sectorId,
  predatorAlive = false, weatherSlow = false) {
  const state = world && world.state;
  const eco = e.data.ecology;
  const species = faunaSpeciesById(eco.speciesId);
  if (!species || !state) return;
  eco.driveT = (eco.driveT || 0) + dt;

  // AE-171 — juvenile promotion: rupture-spawned juveniles that survive on an awake/bloom
  // site mature into full adults (transient — they still never persist in deadFauna).
  if (eco.juvenile && (now - (eco.bornAt || now)) > 120
      && (rec.state === 'awake' || rec.state === 'bloom')) {
    eco.juvenile = false;
    e.radius = species.radius;
    const label = scannerBiologyLabel(effectiveRevelation(state), species.signature);
    e.data.scanLabel = label;
    e.data.name = effectiveRevelation(state) >= 2 ? species.name : `${label} (adult)`;
  }

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
  const sup = suppressionFieldAt(sectorId, local.x, local.z)
    || shepherdFieldAt(state, sectorId, local.x, local.z); // AE-233: moving pocket
  if (sup) {
    const supCx = sup.center ? sup.center.x : sup.pos.x;
    const supCz = sup.center ? sup.center.z : sup.pos.z;
    const gx = site ? world._toGlobal({ x: supCx, z: supCz }, sectorId) : null;
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
  // AE-123 (G11) — Quiet Mask: a damped hull presents a smaller signature; fauna notice
  // you later and accrue stimulus slower.
  const stealthM = stealthMult(state);
  const alertR = species.alertR * stealthM * (awake ? 1.35 : 1) * (coherent ? 1 : species.coherenceLoss.alertMult);
  const px = player && player.pos ? player.pos.x : null;
  const pz = player && player.pos ? player.pos.z : null;
  const playerD = px != null ? Math.sqrt(dist2(e.pos.x, e.pos.z, px, pz)) : Infinity;

  // ── AE-051 stimulus accumulation ──
  // heat: sustained high speed close by (drive plume reads warm)
  const stim = eco.stim || (eco.stim = {});
  const playerSpeed = player && player.vel ? Math.sqrt(player.vel.x * player.vel.x + player.vel.z * player.vel.z) : 0;
  const sens = species.stimuli || {};
  stim.heat = clampStim(stim.heat, (sens.heat || 0) * stealthM * (playerSpeed > 40 && playerD < alertR * 1.4 ? 1 : 0) * dt);
  stim.scan = clampStim(stim.scan, (sens.scan || 0) * stealthM * (playerD < (species.alertR * stealthM * 0.5) ? 1 : 0) * dt);
  stim.mass = clampStim(stim.mass, (sens.mass || 0) * stealthM * (playerD < alertR ? 1 : 0) * dt);

  // Furnace Maw heat rule: shadow at range until the target is heat-saturated, then charge.
  if (species.heatHunter && px != null) {
    eco.heatSat = Math.max(0, (eco.heatSat || 0)
      + (playerSpeed > 55 ? dt * (sens.heat || 1) : -dt * 0.5));
  }

  // Relay broadcast: coherent fauna bias headings toward the shepherd's slow consensus turn.
  const shepherd = shepherds.find((s) => s.data.ecology.siteId === site.siteId);

  // ── AE-124 (G10) lure override: a burning lure outranks the player plume for
  // heat-sensitive drives until it burns out. ──
  const aeL = ensureAlienEcologyState(state);
  const lure = (aeL.lures || []).find((l) => l.sectorId === sectorId && l.until > now
    && dist2(e.pos.x, e.pos.z, l.x, l.z) < Math.pow(alertR * 4, 2));
  if (lure && ((sens.heat || 0) >= 0.6 || species.heatHunter)) {
    eco.lureTarget = { x: lure.x, z: lure.z };
    if (eco.driveState !== 'flee' && eco.driveState !== 'feed' && eco.driveState !== 'captured') {
      setDrive(eco, 'investigate');
    }
  } else {
    eco.lureTarget = null;
  }

  // ── stimulus → drive resolution (doc 02 grammar) ──
  const stimulated = playerD < alertR || (stim.heat || 0) > 0.8 || !!eco.lureTarget;
  if (stimulated) eco.stimulusT = (eco.stimulusT || 0) + dt;
  else eco.stimulusT = 0;
  const reacted = coherent || (eco.stimulusT || 0) >= species.coherenceLoss.latency;

  // Feed signal wins over curiosity: a fresh rupture pulls feeders toward it.
  const feedSignal = rec.signals && rec.signals.find((s) => s.kind === 'spore_density');
  if (feedSignal && (sens.spore_density || 0) > 0 && eco.driveState !== 'feed' && eco.driveState !== 'flee') {
    eco.feedTarget = { x: feedSignal.pos.x, z: feedSignal.pos.z };
    setDrive(eco, 'feed');
  }

  // AE-169 — heatWakes sites: dormant fauna also read a sustained warm plume as a wake
  // stimulus (the yard/cable sites rise on drive heat, not just the beam).
  if (species.dormant && eco.driveState === 'dormant' && site && site.heatWakes
      && (stim.heat || 0) > 0.8) {
    setDrive(eco, species.drives.curious);
    stim.vibration = 1;
  }

  // D07 predator silence: a live heat-hunter on the field flattens every smaller drive —
  // prey species hold station instead of investigating while the hunter patrols.
  const silenced = predatorAlive && !species.heatHunter
    && playerD >= species.threatenR && eco.driveState !== 'flee'
    && eco.driveState !== 'feed' && eco.driveState !== 'captured';
  if (silenced) {
    eco.stimulusT = 0;
    if (eco.driveState !== species.drives.idle) setDrive(eco, species.drives.idle);
  }

  if (reacted && !species.dormant && !silenced) {
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

  // AE-172 flee wave (D09): a kill at this site scatters the whole cast — the killed
  // species panics instantly; unrelated species flip after the propagation delay. Applied
  // after stimulus resolution so the panic cascade outranks curiosity/defend overrides.
  const wave = rec.fleeWave;
  if (wave && now < wave.until && !species.dormant
      && eco.driveState !== 'captured' && eco.driveState !== 'feed') {
    if (now >= wave.delayUntil || eco.speciesId === wave.speciesId) {
      eco.fleeFrom = { x: wave.x, z: wave.z };
      if (eco.driveState !== 'flee') setDrive(eco, 'flee');
    }
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
      // AE-163 stone lung exhale: sessile filters vent aerosol on a period — each exhale
      // nudges the site C reading and reads as a plume on the band.
      if (species.ventPeriodS) {
        eco.nextVentAt = eco.nextVentAt
          || now + species.ventPeriodS * (0.4 + (eco.phase % 1) * 0.6);
        if (now >= eco.nextVentAt) {
          eco.nextVentAt = now + species.ventPeriodS;
          rec.siteC = Math.min(0.2, (rec.siteC || 0) + 0.003);
          if (world.bus) {
            world.bus.emit('alienEcology:vented', { siteId: site.siteId, x: e.pos.x, z: e.pos.z });
            if (playerD < 700) {
              world.bus.emit('toast', {
                text: 'The rock exhales — a spore plume rolls off the buried mantle.', kind: 'info', ttl: 4,
              });
            }
          }
        }
      }
      if (px != null && playerD < alertR) {
        e.rot = angleLerp(e.rot, Math.atan2(pz - e.pos.z, px - e.pos.x), Math.min(1, species.turnRate * dt));
      }
      return;
    }
    case 'repair': {
      // Suture mite: slow seam orbit around the anchor — the organism is knitting the
      // colony's breaches, so its circuit hugs the hull line.
      const w = now * 0.12 + eco.phase;
      targetX = siteGlobalAnchor.x + Math.cos(w) * 26;
      targetZ = siteGlobalAnchor.z + Math.sin(w) * 20;
      speed *= 0.5;
      break;
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
      // AE-164 chainFollow: a pilgrim segment steers to the segment ahead, not to the
      // route — the line is the unit, not the waypoint.
      if (species.chainFollow) {
        let leader = eco.chainTo != null && state.entities.get(eco.chainTo);
        if (!leader || leader.alive === false
            || !leader.data || !leader.data.ecology || leader.data.ecology.speciesId !== species.id) {
          // re-acquire the nearest same-species segment on this site
          leader = null;
          let bestD = Infinity;
          for (const f of state.entityList) {
            if (!f || f === e || f.alive === false || !f.data || !f.data.ecology) continue;
            if (f.data.ecology.speciesId !== species.id || f.data.ecology.siteId !== site.siteId) continue;
            const d = dist2(e.pos.x, e.pos.z, f.pos.x, f.pos.z);
            if (d < bestD) { bestD = d; leader = f; }
          }
          eco.chainTo = leader ? leader.id : null;
        }
        if (leader) {
          targetX = leader.pos.x - Math.cos(leader.rot) * species.preferredR * 0.4;
          targetZ = leader.pos.z - Math.sin(leader.rot) * species.preferredR * 0.4;
          speed *= 0.9;
          break;
        }
      }
      if (mig && mig.route && mig.route.length) {
        const wp = mig.route[mig.index % mig.route.length];
        targetX = wp.x; targetZ = wp.z;
        if (dist2(e.pos.x, e.pos.z, wp.x, wp.z) < 40 * 40) mig.index += 1;
        // D08: a live front slows the march — procession speed drops on weather.
        speed *= 0.55 * (weatherSlow ? FIELD_LANGUAGE.weatherMigrateMult : 1);
      } else {
        setDrive(eco, 'drift');
      }
      break;
    }
    case 'investigate': {
      // AE-124: a live lure target replaces the player as the stimulus point.
      const tx = eco.lureTarget ? eco.lureTarget.x : px;
      const tz = eco.lureTarget ? eco.lureTarget.z : pz;
      const td = eco.lureTarget ? Math.sqrt(dist2(e.pos.x, e.pos.z, tx, tz)) : playerD;
      if (tx == null) { setDrive(eco, species.drives.idle); break; }
      const ang = Math.atan2(tz - e.pos.z, tx - e.pos.x);
      // Approach until preferredR, then orbit.
      if (td > species.preferredR * 1.15) {
        targetX = tx - Math.cos(ang) * species.preferredR;
        targetZ = tz - Math.sin(ang) * species.preferredR;
      } else {
        const orb = ang + dt * 0.5 * (eco.phase > Math.PI ? 1 : -1);
        targetX = tx + Math.cos(orb + Math.PI) * species.preferredR;
        targetZ = tz + Math.sin(orb + Math.PI) * species.preferredR;
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
      // collision is the message; for kinematic ones we stop just short. AE-124: a lure
      // can substitute as the mass point.
      const tx = eco.lureTarget ? eco.lureTarget.x : px;
      const tz = eco.lureTarget ? eco.lureTarget.z : pz;
      if (tx == null) { setDrive(eco, species.drives.idle); break; }
      const ang = Math.atan2(tz - e.pos.z, tx - e.pos.x);
      const cd = eco.lureTarget ? Math.sqrt(dist2(e.pos.x, e.pos.z, tx, tz)) : playerD;
      const stopAt = species.physicsBody ? 0 : species.radius + (player && player.radius || 10) + 4;
      const holdR = Math.max(stopAt, species.preferredR * 0.15);
      if (cd > holdR) {
        targetX = tx - Math.cos(ang) * holdR;
        targetZ = tz - Math.sin(ang) * holdR;
        speed = (species.fleeSpeed || species.speed) * speedMult;
      } else {
        targetX = e.pos.x; targetZ = e.pos.z; speed = 0;
      }
      break;
    }
    case 'flee': {
      // AE-172: a flee-wave victim runs from the kill point, not necessarily the player.
      const fx = eco.fleeFrom ? eco.fleeFrom.x : px;
      const fz = eco.fleeFrom ? eco.fleeFrom.z : pz;
      if (fx == null) { setDrive(eco, species.drives.idle); break; }
      const ang = Math.atan2(e.pos.z - fz, e.pos.x - fx);
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

// ── Phase 27 (L-table): the evidence ledger — what the player has proven, persisted. ────
export function recordEvidence(state, id, sectorId = null) {
  const ae = ensureAlienEcologyState(state);
  const def = EVIDENCE_TABLE[id];
  if (!def) return false;
  if (!ae.evidence || typeof ae.evidence !== 'object') ae.evidence = {};
  if (ae.evidence[id]) return false; // evidence never refires
  ae.evidence[id] = { tier: def.tier, sectorId, t: Number(state.simTime) || 0 };
  // Revelation pacing (AE-256): tier-2 disclosure needs 3 filed rows; tier-3 needs a deep row.
  const count = Object.keys(ae.evidence).length;
  if (count >= 3) setRevelation(state, 2);
  if (def.tier >= 3) setRevelation(state, 3);
  if (sectorId) recordContaminationKnowledge(state, sectorId, `evidence ${id}: ${def.text.slice(0, 60)}`);
  return true;
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
    // AE-114/117/119/138 — field beats + custody ledger persist; lures do not.
    sectorFlags: JSON.parse(JSON.stringify(ae.sectorFlags || {})),
    wrenRecognized: ae.wrenRecognized === true,
    factionConsequences: JSON.parse(JSON.stringify(ae.factionConsequences || {})),
    // AE-170 (G05): the echo recorder's pulse log persists across saves.
    echoLog: Array.isArray(ae.echoLog) ? ae.echoLog.slice(-32) : [],
    // AE-291 (P-table): machine-site records, the evidence ledger, and fired setpieces
    // all persist — a reload must not reset the mystery.
    machineSites: JSON.parse(JSON.stringify(ae.machineSites || {})),
    evidence: JSON.parse(JSON.stringify(ae.evidence || {})),
    setpieces: JSON.parse(JSON.stringify(ae.setpieces || {})),
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
  if (data.machineSites && typeof data.machineSites === 'object') {
    ae.machineSites = JSON.parse(JSON.stringify(data.machineSites));
  }
  if (data.evidence && typeof data.evidence === 'object') {
    ae.evidence = JSON.parse(JSON.stringify(data.evidence));
  }
  if (data.setpieces && typeof data.setpieces === 'object') {
    ae.setpieces = JSON.parse(JSON.stringify(data.setpieces));
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
        offersEmitted: rec.offersEmitted && typeof rec.offersEmitted === 'object'
          ? { ...rec.offersEmitted } : {},
        deepTraceDone: !!rec.deepTraceDone,
      };
    }
  }
  if (data.sectorFlags && typeof data.sectorFlags === 'object') {
    ae.sectorFlags = JSON.parse(JSON.stringify(data.sectorFlags));
  }
  if (data.factionConsequences && typeof data.factionConsequences === 'object') {
    ae.factionConsequences = JSON.parse(JSON.stringify(data.factionConsequences));
  }
  ae.wrenRecognized = data.wrenRecognized === true;
  if (Array.isArray(data.echoLog)) ae.echoLog = data.echoLog.slice(-32);
  return ae;
}

// ── Phase 18/23 helpers ───────────────────────────────────────────────────────────

// D08: does the sector carry a live radiation/storm front? Weather-read is static on the
// sector def (hazards table); fronts are a field condition, not a clock.
function sectorDefWeatherSlow(state, sectorId) {
  const def = (state.world && state.world.sectors && state.world.sectors[sectorId]) || null;
  return !!(def && Array.isArray(def.hazards)
    && def.hazards.some((h) => h && (h.type === 'radiation' || h.type === 'nebula')));
}

// AE-226..228 — fauna harvest: killed organisms shed bio-resource pickups. Inside a
// machine suppression pocket the roll swaps to SUPPRESSION_DROPS — sterile shell and
// nerve glass exist nowhere else, which is why the dead pockets pay.
function dropFaunaHarvest(world, e, eco) {
  const state = world.state;
  if (!world.helpers || typeof world.helpers.spawnEntity !== 'function') return;
  const local = world._toLocal ? world._toLocal(e.pos, e.homeSectorId) : e.pos;
  const suppressed = !!suppressionFieldAt(e.homeSectorId, local.x, local.z)
    || !!shepherdFieldAt(state, e.homeSectorId, local.x, local.z); // AE-233
  const rng = (state.world && state.world.rng) || state.rng;
  const roll = typeof rng === 'function' ? rng : () => 0.5;
  if (suppressed) {
    for (const row of SUPPRESSION_DROPS) {
      if (roll() < row.chance) spawnDrop(world, e, row.commodityId, row.qty, roll);
    }
    return;
  }
  const row = FAUNA_DROPS[eco.speciesId] || FAUNA_DROPS.default;
  if (row && roll() < row.chance) spawnDrop(world, e, row.commodityId, row.qty, roll);
}

// ── Phase 29 / AE-282..AE-290 — N-table setpiece engine. One flag per id in ae.setpieces;
// each fires exactly once, records its evidence row, and never refires. Triggers that live
// in other systems ('cross' in the boundary walker, 'interact' in the courier, 'pulseInside'
// in the relay block) are honored there and skipped here.
function runSetpieces(world, sectorId, now, dt, sites) {
  const state = world.state;
  const ae = ensureAlienEcologyState(state);
  const player = state.playerId != null && state.entities ? state.entities.get(state.playerId) : null;
  if (!player || !player.pos) return;
  for (const def of SETPIECE_DEFS) {
    if (ae.setpieces[def.id]) continue;
    if (def.trigger === 'cross' || def.trigger === 'interact' || def.trigger === 'pulseInside') continue;
    // Resolve the anchor: an ecology site, then a machine site. Sector must match.
    const ecoSite = ALIEN_SITES[def.siteId];
    const machSite = MACHINE_SITES[def.siteId];
    const site = ecoSite || machSite;
    if (!site || site.sectorId !== sectorId) continue;
    if (def.needsSevered && ecoSite) {
      const r = siteRecord(state, ecoSite.siteId);
      if (r.relaySevered !== true && r.state !== 'severed') continue;
    }
    if (def.needsRevelation != null && ae.revelation < def.needsRevelation) continue;
    if (def.needsProtocol && ae.machineProtocol !== def.needsProtocol) continue;
    const g = world._toGlobal({ x: site.center.x, z: site.center.z }, sectorId);
    const d = Math.sqrt(dist2(player.pos.x, player.pos.z, g.x, g.z));
    if (d > def.radius) continue;
    let fired = false;
    switch (def.trigger) {
      case 'approach':
      case 'close': fired = true; break;
      case 'hold': {
        const pv = player.vel ? Math.sqrt(player.vel.x * player.vel.x + player.vel.z * player.vel.z) : 0;
        if (pv < 10) {
          ae.setpieces[`${def.id}__holdT`] = (ae.setpieces[`${def.id}__holdT`] || 0) + dt;
          fired = ae.setpieces[`${def.id}__holdT`] >= (def.holdS || 6);
        } else {
          ae.setpieces[`${def.id}__holdT`] = 0;
        }
        break;
      }
      case 'exposed': fired = (ae.exposure || 0) >= (def.exposure || 0.5); break;
      default: break;
    }
    if (!fired) continue;
    ae.setpieces[def.id] = true;
    delete ae.setpieces[`${def.id}__holdT`];
    world.bus.emit('toast', { text: def.text, kind: 'warn', ttl: 7 });
    if (def.evidence) recordEvidence(state, def.evidence, sectorId);
    world.bus.emit('ecology:setpiece', { id: def.id, sectorId, t: now });
    // N12 — red-snow kin protocol: the cast reads a fouled hull as kin and holds dormant.
    if (def.id === 'N12_red_snow_kin') ae.stealthWindowUntil = now + 45;
    // N04 — the containment bloom: a growth bloom + fauna wake inside the ring.
    if (def.id === 'N04_containment_breach') {
      const rng = (state.world && state.world.rng) || state.rng || (() => 0.5);
      for (let i = 0; i < 5; i += 1) {
        const ang = rng() * TWO_PI;
        const rr = 60 + rng() * 140;
        insertDressingRow(state, {
          type: 'fx',
          pos: world._toGlobal({ x: site.center.x + Math.cos(ang) * rr, z: site.center.z + Math.sin(ang) * rr }, sectorId),
          rot: rng() * TWO_PI,
          radius: 14,
          homeSectorId: sectorId,
          data: { placeId: 'infestation_nerve_lace', alienSite: site.siteId, scannerSignalKind: 'anomaly' },
        });
      }
    }
  }
}

// ── Phase 28 / AE-261..AE-270 — M-table hazards: field pressure the player can feel. ──────
function runEcologyHazards(world, sectorId, now, dt, sites) {
  const state = world.state;
  const ae = ensureAlienEcologyState(state);
  const player = state.playerId != null && state.entities ? state.entities.get(state.playerId) : null;
  if (!player || !player.pos) return;

  for (const site of sites) {
    const rec = siteRecord(state, site.siteId);
    const g = world._toGlobal({ x: site.center.x, z: site.center.z }, sectorId);
    const d = Math.sqrt(dist2(player.pos.x, player.pos.z, g.x, g.z));
    const inside = d < site.radius;

    // M02 — adhesive tendrils: sites seeded with nerve_lace drag the hull while it is
    // inside the ring (a slow field, never a stop — the field wants you slow, not caught).
    if (inside && !site.sterile && Array.isArray(site.morphologyMix) && site.morphologyMix.includes('nerve_lace')) {
      const awake = rec.state === 'awake' || rec.state === 'bloom';
      if (awake && player.vel) {
        const damp = Math.max(0, 1 - 0.35 * dt);
        player.vel.x *= damp;
        player.vel.z *= damp;
        if (!rec.beats.tendrilGrip) {
          rec.beats.tendrilGrip = true;
          world.bus.emit('toast', {
            text: 'Adhesive tendrils — the field grips the hull. Thrust is arguments, not escape.',
            kind: 'warn', ttl: 5,
          });
        }
      }
    }

    // M07 — dormant cyst heat: dormant sites radiate a low thermal bloom the scanner
    // reports once; it is the reason heat-hunting fauna already know you are here.
    if (inside && rec.state === 'dormant' && !rec.beats.heatBloom) {
      rec.beats.heatBloom = true;
      world.bus.emit('comms:log', {
        from: 'Thermal watch', kind: 'ecology',
        text: 'The dormant field below reads warm — parked cysts radiating at idle. Predators cue on this signature.',
      });
    }

    // M05 — spore wake decoy: leaving a live contaminated site seeds a phantom return
    // trailing the hull — the scanner carries the site with you for a while.
    if (inside) rec.wasInside = true;
    else if (rec.wasInside) {
      rec.wasInside = false;
      if ((ae.exposure || 0) > 0.3 && !rec.beats.sporeWake && world.active && Array.isArray(world.active.pois)) {
        rec.beats.sporeWake = true;
        world.active.pois.push({
          id: null, label: 'Spore wake echo', kind: 'anomaly', sectorId,
          pos: { x: player.pos.x - (player.vel ? player.vel.x : 0) * 2,
                 z: player.pos.z - (player.vel ? player.vel.z : 0) * 2 },
          ttl: now + 25, phantom: true,
        });
      }
    }
  }

  // M10 — memory panic: at severe exposure the scanner stops trusting clean contacts —
  // phantom anomalies resolve as hostile for the fouled hull.
  if ((ae.exposure || 0) >= 0.85 && !ae._memoryPanic) {
    ae._memoryPanic = true;
    world.bus.emit('toast', {
      text: 'MEMORY PANIC — every return on the board reads hostile. None of them are real.',
      kind: 'warn', ttl: 6,
    });
  } else if ((ae.exposure || 0) < 0.6) {
    ae._memoryPanic = false;
  }
}

function spawnDrop(world, e, commodityId, qty, roll) {
  const state = world.state;
  const ang = roll() * TWO_PI;
  const sp = 10 + roll() * 20;
  world.helpers.spawnEntity({
    type: 'pickup',
    pos: { x: e.pos.x + Math.cos(ang) * 6, z: e.pos.z + Math.sin(ang) * 6 },
    vel: { x: Math.cos(ang) * sp, z: Math.sin(ang) * sp },
    radius: 2.2,
    homeSectorId: e.homeSectorId,
    data: { kind: 'cargo', commodityId, amount: qty, despawnAt: (state.simTime || 0) + 45 },
  });
}

// Phase 21 edge rows: the vignette's systemic hook. Bark-only rows never reach here.
function applyEncounterEdge(world, row, sectorId, fauna) {
  const state = world.state;
  const ae = ensureAlienEcologyState(state);
  const now = Number(state.simTime) || 0;
  switch (row.edge) {
    case 'stealth_window':
      // Quiet broker sold a signal profile — the hull reads dead to the field for a window.
      ae.stealthWindowUntil = now + 60;
      break;
    case 'bait_trap': {
      // The lure is already answering: wake the nearest live cast toward the beacon.
      const player = state.playerId != null ? state.entities.get(state.playerId) : null;
      if (!player || !player.pos) break;
      let best = null;
      let bestD = Infinity;
      for (const f of fauna || []) {
        const d = dist2(f.pos.x, f.pos.z, player.pos.x, player.pos.z);
        if (d < bestD) { bestD = d; best = f; }
      }
      const eco = best && best.data && best.data.ecology;
      if (eco && eco.driveState !== 'flee' && eco.driveState !== 'captured') {
        eco.lureTarget = { x: player.pos.x + 300, z: player.pos.z + 120 };
        setDrive(eco, 'investigate');
      }
      break;
    }
    case 'quarantine_hold':
      // The checkpoint flags the hull — a timed flag other surfaces can read.
      ae.quarantineFlagUntil = now + 90;
      break;
    default:
      break;
  }
}

// AE-230 — field ripening: one unsealed biohazard unit matures per period while the hull
// sits in high-C space. Remove-then-add through the cargo API so hold math stays correct.
function ripenCargo(world, sectorId) {
  const state = world.state;
  const cargo = state.player && state.player.cargo;
  if (!cargo || !cargo.items) return;
  for (const [from, to] of Object.entries(RIPENING.chain)) {
    if ((cargo.items[from] || 0) <= 0) continue;
    if (removeCargo(state, from, 1) > 0) {
      addCargo(state, to, 1, 'field_ripening');
      world.bus.emit('toast', {
        text: 'The lot in the hold matured — the tissue reads rarer on the manifest now.',
        kind: 'info', ttl: 5,
      });
      recordContaminationKnowledge(state, sectorId, 'biohazard lot field-ripened in the hold');
      return;
    }
  }
}
