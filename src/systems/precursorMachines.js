// src/systems/precursorMachines.js — Verge-Layer machine runtime (doc 07, AE-090..109).
// Same seam as alienEcology.js: NOT a registered system. world.js calls
// materializeMachineLayer from _spawnDressing and tickMachineLayer from update().
//
// Machines are kinematic entities (type 'machine') under faction_verge_layers IFF. They do
// not fight, chase, or take damage as combatants — they enact procedures. Everything they
// say is a directive line; the player's standing is ae.machineProtocol, not rep.

import {
  MACHINE_SITES,
  MACHINE_KINDS,
  machineSitesForSector,
  machineKindById,
  machineDirectiveLine,
  machineRevealsVerge,
  advanceMachineProtocol,
  grantWitnessMark,
  hasWitnessMark,
  scannerMachineLabel,
} from '../data/precursorMachines.js';
import { ensureAlienEcologyState } from '../data/alienEcologyState.js';
import { insertDressingRow } from '../world/dressingTable.js';
import { fittedModuleDefs } from '../core/fittedModules.js';

// AE-129 (K-table): a salvaged handshake transponder halves the protocol hold window —
// the machines read your compliance twice as fast.
function holdWindowS(state) {
  const fitted = fittedModuleDefs(state).some((d) => d && d.mods && d.mods.precursorHandshake === true);
  return fitted ? 6 : 12;
}

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

function machineSiteRec(state, siteId) {
  const ae = ensureAlienEcologyState(state);
  if (!ae.machineSites || typeof ae.machineSites !== 'object') ae.machineSites = {};
  if (!ae.machineSites[siteId]) {
    ae.machineSites[siteId] = { seen: false, beats: {}, directiveIssued: false };
  }
  return ae.machineSites[siteId];
}

// ── Materialization (world._spawnDressing) ────────────────────────────────────────────────
export function materializeMachineLayer(world, sector, active) {
  const state = world && world.state;
  const sites = machineSitesForSector(sector && sector.id);
  if (!sites.length || !world.helpers) return;
  const ae = ensureAlienEcologyState(state);

  for (const site of sites) {
    machineSiteRec(state, site.siteId);
    const rng = world.helpers.mulberry32(
      world.helpers.hash32(state.meta && state.meta.seed || 1, sector.id, 0, 'machine-layer', site.siteId));

    // Structure props — machine geometry rows (partsLibrary machine builders).
    const ring = site.propRing;
    if (ring) {
      for (let i = 0; i < ring.count; i += 1) {
        // `linear` rows chain a spine through space; `rows` pack ossuary ranks.
        const frac = ring.count > 1 ? i / (ring.count - 1) : 0;
        let dx;
        let dz;
        if (ring.linear) {
          dx = -ring.radius / 2 + ring.radius * frac;
          dz = Math.sin(frac * Math.PI * 2) * 60;
        } else if (ring.rows) {
          const row = Math.floor(i / Math.ceil(ring.count / ring.rows));
          const col = i % Math.ceil(ring.count / ring.rows);
          dx = -ring.radius / 2 + col * (ring.radius / Math.ceil(ring.count / ring.rows));
          dz = -ring.radius / 2 + row * (ring.radius / ring.rows);
        } else {
          const ang = rng() * TWO_PI;
          const r = ring.radius * (0.9 + rng() * 0.2);
          dx = Math.cos(ang) * r;
          dz = Math.sin(ang) * r;
        }
        const row = insertDressingRow(state, {
          type: 'fx',
          pos: world._toGlobal({ x: site.center.x + dx, z: site.center.z + dz }, sector.id),
          rot: rng() * TWO_PI,
          radius: site.kind === 'vault' ? 90 : 26,
          homeSectorId: sector.id,
          data: {
            placeId: ring.propId,
            machineSite: site.siteId,
            scannerSignalKind: 'anomaly',
          },
        });
        active.dressing.push({ id: row.id, placeId: ring.propId, pos: row.pos, paletteClass: 'machine' });
      }
    }

    // Machine entities — kinematic; IFF faction_verge_layers makes them neutral contacts.
    for (const spec of site.machines || []) {
      const kind = machineKindById(spec.kind);
      if (!kind) continue;
      const pos = world._toGlobal({ x: site.center.x + spec.dx, z: site.center.z + spec.dz }, sector.id);
      const ent = world.helpers.spawnEntity({
        type: 'machine',
        pos,
        rot: rng() * TWO_PI,
        radius: kind.radius,
        collides: false,
        physicsBody: false,
        homeSectorId: sector.id,
        hull: 400, // machines do not die to stray fire in this layer; they ignore damage events
        factionId: 'verge_layers',
        data: {
          name: scannerMachineLabel(ae.machineProtocol),
          scanLabel: scannerMachineLabel(ae.machineProtocol),
          scannerSignalKind: kind.scannerSignalKind,
          machine: {
            kind: spec.kind,
            siteId: site.siteId,
            phase: rng() * TWO_PI,
            t: 0,
            interrogated: false,
            anchor: { x: pos.x, z: pos.z },
            sweepT: 0,
          },
        },
      });
      if (ent) active.dressing.push({ id: ent.id, placeId: null, pos: ent.pos, paletteClass: 'machine' });
    }
  }
}

// ── Per-tick (world.update) ───────────────────────────────────────────────────────────────
export function tickMachineLayer(world, dt) {
  const state = world && world.state;
  if (!state || !state.entityList || dt <= 0) return;
  const sectorId = state.world && state.world.currentSectorId;
  if (!sectorId) return;
  const sites = machineSitesForSector(sectorId);
  if (!sites.length) return;
  const ae = ensureAlienEcologyState(state);
  const player = state.playerId != null && state.entities ? state.entities.get(state.playerId) : null;
  const now = Number(state.simTime) || 0;

  const machines = [];
  for (const e of state.entityList) {
    if (!e || e.alive === false || !e.data || !e.data.machine) continue;
    if (e.homeSectorId !== sectorId) continue;
    machines.push(e);
  }

  for (const site of sites) {
    const rec = machineSiteRec(state, site.siteId);
    const g = world._toGlobal({ x: site.center.x, z: site.center.z }, sectorId);

    // First observation: entering the site's radius is the 'seen' beat — protocol becomes
    // 'observed' and story.verge.revealed flips (galaxy map learns the layer exists).
    if (player && player.pos && !rec.seen) {
      const d = Math.sqrt(dist2(player.pos.x, player.pos.z, g.x, g.z));
      if (d < (site.radius + 400)) {
        rec.seen = true;
        const advanced = advanceMachineProtocol(state, 'seen');
        const revealed = machineRevealsVerge(state);
        if (site.beat) world.bus.emit('toast', { text: site.beat, kind: 'info', ttl: 6 });
        if (revealed) {
          world.bus.emit('toast', {
            text: 'Scanner catalogue revised: PREDECESSOR LATTICE — INSTRUMENT CLASS.',
            kind: 'info', ttl: 6,
          });
        }
        // First directive: the site's issued instruction (protocol ask).
        if (site.directive && !rec.directiveIssued) {
          rec.directiveIssued = true;
          world.bus.emit('comms:log', {
            from: site.name,
            text: machineDirectiveLine(site.directive),
            kind: 'machine',
          });
        }
        refreshMachineLabels(world);
      }
    }

    // Directive resolution — obeyed lines advance protocol; ignored VACATE/CLOSE → fault.
    if (player && player.pos && rec.directiveIssued && !rec.directiveResolved && site.directive) {
      const d = Math.sqrt(dist2(player.pos.x, player.pos.z, g.x, g.z));
      const windowS = 60; // a directive stands for a minute of player behavior
      rec.directiveT = (rec.directiveT || 0) + dt;
      if (site.directive === 'VACATE' || site.directive === 'CLOSE') {
        if (d > site.radius + 120) {
          rec.directiveResolved = true;
          advanceMachineProtocol(state, 'satisfied');
          refreshMachineLabels(world);
        } else if (rec.directiveT > windowS) {
          rec.directiveResolved = true;
          advanceMachineProtocol(state, 'violated');
          world.bus.emit('comms:log', {
            from: site.name,
            text: 'COMPLIANCE WINDOW EXPIRED. PROTOCOL VIOLATION LOGGED.',
            kind: 'machine',
          });
          refreshMachineLabels(world);
        }
      } else if (site.directive === 'HOLD' || site.directive === 'WITNESS') {
        const pv = player.vel ? Math.sqrt(player.vel.x * player.vel.x + player.vel.z * player.vel.z) : 0;
        if (d < site.radius + 120 && pv < 8) {
          rec.holdT = (rec.holdT || 0) + dt;
          if (rec.holdT > holdWindowS(state)) {
            rec.directiveResolved = true;
            advanceMachineProtocol(state, 'satisfied');
            if (site.directive === 'WITNESS') grantWitnessMark(state, site.siteId);
            if (hasWitnessMark(state) && !rec.witnessToast) {
              rec.witnessToast = true;
              world.bus.emit('comms:log', {
                from: site.name,
                text: 'WITNESS STATUS RECORDED.',
                kind: 'machine',
              });
            }
            refreshMachineLabels(world);
          }
        } else {
          rec.holdT = 0;
          if (rec.directiveT > windowS) {
            rec.directiveResolved = true;
            advanceMachineProtocol(state, 'violated');
            refreshMachineLabels(world);
          }
        }
      }
    }
  }

  // ── Machine kinematics ──
  for (const e of machines) {
    const m = e.data.machine;
    const kind = machineKindById(m.kind);
    if (!kind) continue;
    m.t += dt;
    switch (m.kind) {
      case 'surveyor_prism': {
        // Slow inspection sweep: orbit the anchor, periodic scan ping.
        const w = now * 0.12 + m.phase;
        const tx = m.anchor.x + Math.cos(w) * kind.orbitR;
        const tz = m.anchor.z + Math.sin(w) * kind.orbitR;
        const desired = Math.atan2(tz - e.pos.z, tx - e.pos.x);
        e.rot = angleLerp(e.rot, desired, Math.min(1, kind.turnRate * dt));
        e.pos.x += Math.cos(e.rot) * kind.speed * dt;
        e.pos.z += Math.sin(e.rot) * kind.speed * dt;
        m.sweepT += dt;
        if (m.sweepT >= kind.scanPeriodS) {
          m.sweepT = 0;
          world.bus.emit('audio:cue', { id: 'scan_resolve' });
        }
        break;
      }
      case 'custodian': {
        // Patrol the structure, pause for a repair beat.
        const w = now * 0.07 + m.phase;
        const tx = m.anchor.x + Math.cos(w) * kind.orbitR;
        const tz = m.anchor.z + Math.sin(w) * kind.orbitR;
        const desired = Math.atan2(tz - e.pos.z, tx - e.pos.x);
        e.rot = angleLerp(e.rot, desired, Math.min(1, kind.turnRate * dt));
        e.pos.x += Math.cos(e.rot) * kind.speed * dt;
        e.pos.z += Math.sin(e.rot) * kind.speed * dt;
        m.sweepT += dt;
        if (m.sweepT >= kind.repairPeriodS) m.sweepT = 0; // repair flash cadence marker
        break;
      }
      case 'auditor': {
        // Stationary protocol evaluation: face the player when near.
        if (player && player.pos) {
          const d = Math.sqrt(dist2(e.pos.x, e.pos.z, player.pos.x, player.pos.z));
          const desired = Math.atan2(player.pos.z - e.pos.z, player.pos.x - e.pos.x);
          e.rot = angleLerp(e.rot, desired, Math.min(1, kind.turnRate * dt));
          if (d < kind.interrogateR && !m.interrogated) {
            m.interrogated = true;
            const marked = hasWitnessMark(state);
            world.bus.emit('comms:log', {
              from: 'Gate Auditor',
              text: marked
                ? 'WITNESS STATUS ON FILE. PROCEED.'
                : `INTERROGATION. ${machineDirectiveLine('APPEAL')}`,
              kind: 'machine',
            });
            advanceMachineProtocol(state, 'seen');
            refreshMachineLabels(world);
          }
        }
        break;
      }
      default: break;
    }
  }
}

// Machine scan labels escalate with protocol state (AE-097).
export function refreshMachineLabels(world) {
  const state = world && world.state;
  if (!state || !state.entityList) return;
  const ae = ensureAlienEcologyState(state);
  for (const e of state.entityList) {
    if (!e || !e.data || !e.data.machine) continue;
    const label = scannerMachineLabel(ae.machineProtocol);
    e.data.scanLabel = label;
    e.data.name = label;
  }
}

// ── Route gate (AE-108) ───────────────────────────────────────────────────────────────────
// A revoked route refuses transit while the player's protocol is a fault state. world.js
// calls this inside _wormholeUnlocked for `machine:` gates.
export function machineRouteOpen(state, accessKey) {
  const ae = ensureAlienEcologyState(state);
  if (ae.machineAccess && ae.machineAccess[accessKey]) return true;
  const proto = ae.machineProtocol || 'unknown';
  return proto === 'compliant' || proto === 'witnessed' || proto === 'exception';
}
