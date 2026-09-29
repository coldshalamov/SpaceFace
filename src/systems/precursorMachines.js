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
  MACHINE_DIRECTIVES,
  machineDirectiveLine,
  machineRevealsVerge,
  advanceMachineProtocol,
  grantWitnessMark,
  hasWitnessMark,
  scannerMachineLabel,
} from '../data/precursorMachines.js';
import { ensureAlienEcologyState } from '../data/alienEcologyState.js';
import { grantAlienUnique } from '../data/alienEcology.js';
import { insertDressingRow } from '../world/dressingTable.js';
import { fittedModuleDefs } from '../core/fittedModules.js';
import { addCargo, removeCargo } from './cargo.js';
import { commodityIsBiohazard } from '../data/commodities.js';

// AE-129 (K-table): a salvaged handshake transponder halves the protocol hold window —
// the machines read your compliance twice as fast.
function holdWindowS(state) {
  const fitted = fittedModuleDefs(state).some((d) => d && d.mods && d.mods.precursorHandshake === true);
  return fitted ? 6 : 12;
}

// AE-170 (G15) — a fitted Quiet Equation decodes directive grammar into intent: the
// comms line keeps the machine's own words, then appends the human read.
function directiveText(state, id) {
  const line = machineDirectiveLine(id);
  const decoded = fittedModuleDefs(state).some((d) => d && d.mods && d.mods.quietEquation === true);
  if (!decoded) return line;
  const d = MACHINE_DIRECTIVES[id];
  return d && d.resolves ? `${line} — ${d.resolves}.` : line;
}

// AE-296 — the first resolved directive mints the handshake transponder once per save.
function grantProtocolSatisfiedUnique(world) {
  if (!grantAlienUnique(world, 'mod_precursor_handshake_s', 'protocol_satisfied')) return;
  world.bus.emit('comms:log', {
    from: 'Verge Layer', kind: 'machine',
    text: 'COMPLIANCE LOGGED. A RESPONDER IS ISSUED — YOUR WINDOWS WILL READ SHORTER.',
  });
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
            text: directiveText(state, site.directive),
            kind: 'machine',
          });
        }
        // AE-251 (L-table): the site's evidence row files itself on first observation.
        if (site.evidence) {
          world.bus.emit('ecology:evidence', { id: site.evidence, sectorId });
        }
        // AE-296 — the broken shepherd's sensor spine is the lattice coupler grant.
        if (site.siteId === 'charon_broken_shepherd'
          && grantAlienUnique(world, 'mod_lattice_coupler_s', 'machine_site_seen')) {
          world.bus.emit('comms:log', {
            from: site.name, kind: 'machine',
            text: 'The shepherd\'s sensor spine hangs loose. You pry free a tap into site memory.',
          });
        }
        refreshMachineLabels(world);
      }
    }

    // K05 lattice coupler: a fitted coupler echoes the site's standing directive through
    // comms on first approach even before the site's own line fires — grammar by listening.
    if (player && player.pos && !rec.couplerEcho
      && fittedModuleDefs(state).some((d) => d && d.mods && d.mods.latticeCoupler === true)) {
      const dC = Math.sqrt(dist2(player.pos.x, player.pos.z, g.x, g.z));
      if (dC < site.radius + 260) {
        rec.couplerEcho = true;
        const dir = site.directive && MACHINE_DIRECTIVES[site.directive];
        world.bus.emit('comms:log', {
          from: 'Lattice Coupler', kind: 'machine',
          text: dir
            ? `Site memory read: standing directive ${site.directive} — ${dir.resolves}.`
            : 'Site memory read: no standing directive. This site observes only.',
        });
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
          grantProtocolSatisfiedUnique(world);
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
            grantProtocolSatisfiedUnique(world);
            if (site.directive === 'WITNESS') {
              grantWitnessMark(state, site.siteId);
              // AE-296 — holding through a full witness procedure teaches the decode
              // lattice: the Quiet Equation lands with the first witness mark.
              if (grantAlienUnique(world, 'mod_quiet_equation_s', 'protocol_witnessed')) {
                world.bus.emit('comms:log', {
                  from: site.name, kind: 'machine',
                  text: 'The directive stream resolves into grammar — the sentence underneath is yours now.',
                });
              }
            }
            // K09/K10 (Phase 26): satisfying the exception chamber's witness hold mints
            // the endgame credentials — route authority and the unbroken lens.
            if (site.siteId === 'veil_exception_chamber' && !rec.exceptionMinted) {
              rec.exceptionMinted = true;
              if (!ae.machineAccess) ae.machineAccess = {};
              ae.machineAccess.gates_exception = true;
              advanceMachineProtocol(state, 'excepted');
              addCargo(state, 'cmdty_unbroken_lens', 1, 'exception_chamber');
              world.bus.emit('comms:log', {
                from: site.name, kind: 'machine',
                text: 'EXCEPTION RECORDED. TRANSIT AUTHORITY RESTORED. THE LENS IS YOURS — DO NOT BREAK IT.',
              });
              world.bus.emit('ecology:evidence', { id: 'L10', sectorId });
              world.bus.emit('ecology:evidence', { id: 'P10', sectorId });
            }
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
                : `INTERROGATION. ${directiveText(state, 'APPEAL')}`,
              kind: 'machine',
            });
            advanceMachineProtocol(state, 'seen');
            refreshMachineLabels(world);
          }
        }
        break;
      }
      // ── Phase 24 machine wave B ────────────────────────────────────────────────
      case 'witness': {
        // AE-232 (I05): zero motion — it has watched one site for millennia. The only
        // beat is the slow pupil-track on the player inside observeR.
        if (player && player.pos) {
          const d = Math.sqrt(dist2(e.pos.x, e.pos.z, player.pos.x, player.pos.z));
          if (d < kind.observeR) {
            const desired = Math.atan2(player.pos.z - e.pos.z, player.pos.x - e.pos.x);
            e.rot = angleLerp(e.rot, desired, Math.min(1, kind.turnRate * dt));
          }
        }
        break;
      }
      case 'shepherd': {
        // AE-233 (I06): patrols its corridor between anchor and counter-anchor —
        // a moving suppression pocket (see shepherdFieldAt).
        const w = (now / kind.patrolPeriodS + m.phase / TWO_PI) % 1;
        const t = w < 0.5 ? w * 2 : (1 - w) * 2; // ping-pong
        const tx = m.anchor.x - 300 + t * 600;
        const tz = m.anchor.z - 300 + t * 600;
        const desired = Math.atan2(tz - e.pos.z, tx - e.pos.x);
        e.rot = angleLerp(e.rot, desired, Math.min(1, kind.turnRate * dt));
        e.pos.x += Math.cos(e.rot) * kind.speed * dt;
        e.pos.z += Math.sin(e.rot) * kind.speed * dt;
        break;
      }
      case 'mason': {
        // AE-234 (I07): orbits its workpiece; the weld cadence emits a ping beat.
        const w = now * 0.10 + m.phase;
        const tx = m.anchor.x + Math.cos(w) * kind.orbitR;
        const tz = m.anchor.z + Math.sin(w) * kind.orbitR;
        const desired = Math.atan2(tz - e.pos.z, tx - e.pos.x);
        e.rot = angleLerp(e.rot, desired, Math.min(1, kind.turnRate * dt));
        e.pos.x += Math.cos(e.rot) * kind.speed * dt;
        e.pos.z += Math.sin(e.rot) * kind.speed * dt;
        m.sweepT += dt;
        if (m.sweepT >= kind.weldPeriodS) {
          m.sweepT = 0;
          world.bus.emit('audio:cue', { id: 'scan_resolve' });
        }
        break;
      }
      case 'executor': {
        // AE-235 (I08): dormant until the protocol reads a fault — then it shadows the
        // revoking hull at standoff and runs the quarantine pulse (M09).
        const fault = ae.machineProtocol === 'revoked' || ae.machineProtocol === 'violation';
        if (!fault) {
          m.awakened = false;
          break;
        }
        if (!m.awakened) {
          m.awakened = true;
          world.bus.emit('comms:log', {
            from: 'Verge lattice', kind: 'machine',
            text: 'ENFORCEMENT FRAME ACTIVE. REMAIN WITHIN COMPLIANCE RADIUS.',
          });
        }
        if (player && player.pos) {
          const d = Math.sqrt(dist2(e.pos.x, e.pos.z, player.pos.x, player.pos.z));
          const desired = Math.atan2(player.pos.z - e.pos.z, player.pos.x - e.pos.x);
          e.rot = angleLerp(e.rot, desired, Math.min(1, kind.turnRate * dt));
          if (d > kind.shadowR) {
            e.pos.x += Math.cos(e.rot) * kind.speed * dt;
            e.pos.z += Math.sin(e.rot) * kind.speed * dt;
          }
          m.sweepT += dt;
          if (m.sweepT >= kind.pulsePeriodS && d < kind.quarantinePulseR) {
            m.sweepT = 0;
            // M09 quarantine pulse: biohazard cargo in radius is scrubbed without sale.
            const cargo = state.player && state.player.cargo;
            let scrubbed = 0;
            if (cargo && cargo.items) {
              for (const cid of Object.keys(cargo.items)) {
                if (commodityIsBiohazard(cid) && cargo.items[cid] > 0) {
                  scrubbed += cargo.items[cid];
                  removeCargo(state, cid, cargo.items[cid], 'quarantine_pulse');
                }
              }
            }
            world.bus.emit('comms:log', {
              from: 'Executor', kind: 'machine',
              text: scrubbed > 0
                ? `QUARANTINE PULSE. ${scrubbed} BIOLOGICAL LOT(S) DESTROYED IN TRANSIT.`
                : 'QUARANTINE PULSE. MANIFEST CLEAN.',
            });
            world.bus.emit('ecology:quarantinePulse', { sectorId, scrubbed, t: now });
          }
        }
        break;
      }
      case 'courier': {
        // AE-236 (I09): shuttles a protocol token between the sector's machine sites —
        // in a single-site sector it runs legs between its siblings' anchors instead.
        const targets = sites.filter((s) => s.siteId !== m.siteId)
          .map((s) => world._toGlobal({ x: s.center.x, z: s.center.z }, sectorId));
        for (const sib of machines) {
          if (sib !== e && sib.data.machine.siteId === m.siteId && sib.data.machine.anchor) {
            targets.push(sib.data.machine.anchor);
          }
        }
        if (!targets.length) break;
        const legIdx = Math.floor(m.t / kind.routePeriodS) % targets.length;
        const lg = targets[legIdx];
        const desired = Math.atan2(lg.z - e.pos.z, lg.x - e.pos.x);
        e.rot = angleLerp(e.rot, desired, Math.min(1, kind.turnRate * dt));
        e.pos.x += Math.cos(e.rot) * kind.speed * dt;
        e.pos.z += Math.sin(e.rot) * kind.speed * dt;
        if (player && player.pos && !m.intercepted
          && dist2(e.pos.x, e.pos.z, player.pos.x, player.pos.z) < 160 * 160) {
          m.intercepted = true;
          addCargo(state, 'cmdty_gate_handshake', 1, 'courier_intercept');
          world.bus.emit('comms:log', {
            from: 'Courier frame', kind: 'machine',
            text: 'TOKEN JETTISONED — ROUTE AUTHORITY INSTRUMENT IN YOUR HOLD.',
          });
          world.bus.emit('ecology:evidence', { id: 'L06', sectorId });
          const sRec = machineSiteRec(state, m.siteId);
          sRec.setpieces = sRec.setpieces || {};
          sRec.setpieces.N08 = true;
        }
        break;
      }
      case 'conservator': {
        // AE-237 (I10): refuses release of what it keeps — a polite denial on approach.
        if (player && player.pos && !m.refused) {
          const d = Math.sqrt(dist2(e.pos.x, e.pos.z, player.pos.x, player.pos.z));
          if (d < kind.refuseR) {
            m.refused = true;
            world.bus.emit('comms:log', {
              from: 'Conservator', kind: 'machine',
              text: 'OPEN REQUEST NOTED. RELEASE IS NOT IN SCOPE. PRESERVATION IS.',
            });
          }
        }
        break;
      }
      case 'measure': {
        // AE-237 (I11): its reading files an instrument anomaly + the K04 datum.
        if (player && player.pos && !m.read) {
          const d = Math.sqrt(dist2(e.pos.x, e.pos.z, player.pos.x, player.pos.z));
          if (d < kind.readR) {
            m.read = true;
            addCargo(state, 'cmdty_inertial_datum', 1, 'measure_engine');
            world.bus.emit('comms:log', {
              from: 'Measure engine', kind: 'machine',
              text: 'REFERENCE FRAME EMITTED. YOUR COORDINATE SYSTEM NOW OWNS A SECOND ZERO.',
            });
            world.bus.emit('ecology:evidence', { id: 'L02', sectorId });
          }
        }
        break;
      }
      case 'boundary_walker': {
        // AE-238 (I12): walks the quarantine line; a watched crossing is a violation.
        const w = (now / 90 + m.phase / TWO_PI) % 1;
        const t = w < 0.5 ? w * 2 : (1 - w) * 2;
        const site = MACHINE_SITES[m.siteId];
        const base = site ? world._toGlobal({ x: site.center.x, z: site.center.z }, sectorId) : m.anchor;
        const tx = base.x - kind.patrolLen / 2 + t * kind.patrolLen;
        const tz = base.z;
        const desired = Math.atan2(tz - e.pos.z, tx - e.pos.x);
        e.rot = angleLerp(e.rot, desired, Math.min(1, kind.turnRate * dt));
        e.pos.x += Math.cos(e.rot) * kind.speed * dt;
        e.pos.z += Math.sin(e.rot) * kind.speed * dt;
        if (player && player.pos && site) {
          const insideX = Math.abs(player.pos.x - base.x) < kind.patrolLen / 2;
          const side = Math.sign(player.pos.z - base.z);
          const sRec = machineSiteRec(state, site.siteId);
          const watched = dist2(e.pos.x, e.pos.z, player.pos.x, player.pos.z)
            < kind.watchR * kind.watchR;
          if (insideX && sRec.lineSide && sRec.lineSide !== side && watched
            && !sRec.setpieces?.N09) {
            sRec.setpieces = sRec.setpieces || {};
            sRec.setpieces.N09 = true;
            advanceMachineProtocol(state, 'violated');
            world.bus.emit('comms:log', {
              from: site.name, kind: 'machine',
              text: 'BOUNDARY CROSSING LOGGED UNDER OBSERVATION. VIOLATION STANDS.',
            });
            world.bus.emit('ecology:evidence', { id: 'L08', sectorId });
            refreshMachineLabels(world);
          }
          if (insideX) sRec.lineSide = side;
        }
        break;
      }
      case 'appeals_clerk': {
        // AE-239 (I13): bring tier-3 evidence within range and a revoked verdict flips.
        if (player && player.pos && ae.machineProtocol === 'revoked') {
          const d = Math.sqrt(dist2(e.pos.x, e.pos.z, player.pos.x, player.pos.z));
          if (d < kind.counterR && !m.appealHeard) {
            const evidence = ae.evidence || {};
            const hasDeep = Object.keys(evidence).some((k) => /^L0(9|10)|^P/.test(k));
            if (hasDeep) {
              m.appealHeard = true;
              advanceMachineProtocol(state, 'excepted');
              world.bus.emit('comms:log', {
                from: 'Appeals clerk', kind: 'machine',
                text: 'COUNTER-EVIDENCE ACCEPTED. VERDICT REVISED: EXCEPTION. CARRY THE LENS.',
              });
              refreshMachineLabels(world);
            } else if (!m.appealHinted) {
              m.appealHinted = true;
              world.bus.emit('comms:log', {
                from: 'Appeals clerk', kind: 'machine',
                text: 'APPEAL FILED. COUNTER-EVIDENCE INSUFFICIENT — BRING A DEEP FINDING.',
              });
            }
          }
        }
        break;
      }
      case 'debris_sorter': {
        // AE-240 (I14): drifts to the nearest wreck/pickup and collects it on a delay —
        // salvage you want is on a timer while the sorter works the field.
        if (m.collectAt && now >= m.collectAt) {
          const target = m.collectId != null && state.entities ? state.entities.get(m.collectId) : null;
          if (target && target.alive !== false) {
            target.alive = false;
            world.bus.emit('comms:log', {
              from: 'Debris sorter', kind: 'machine',
              text: 'MAINTENANCE WASTE RECOVERED.',
            });
          }
          m.collectId = null;
          m.collectAt = 0;
        }
        if (!m.collectId) {
          let best = null;
          let bestD = Infinity;
          for (const t2 of state.entityList) {
            if (!t2 || t2.alive === false || !t2.pos) continue;
            if (t2.homeSectorId !== sectorId) continue;
            if (t2.type !== 'wreck' && t2.type !== 'pickup' && t2.type !== 'debris') continue;
            if (t2.data && t2.data.machineClaimed) continue;
            const dd = dist2(e.pos.x, e.pos.z, t2.pos.x, t2.pos.z);
            if (dd < kind.sweepR * kind.sweepR && dd < bestD) { bestD = dd; best = t2; }
          }
          if (best) {
            const desired = Math.atan2(best.pos.z - e.pos.z, best.pos.x - e.pos.x);
            e.rot = angleLerp(e.rot, desired, Math.min(1, kind.turnRate * dt));
            if (Math.sqrt(bestD) > 60) {
              e.pos.x += Math.cos(e.rot) * kind.speed * dt;
              e.pos.z += Math.sin(e.rot) * kind.speed * dt;
            } else {
              best.data = best.data || {};
              best.data.machineClaimed = true;
              m.collectId = best.id;
              m.collectAt = now + kind.collectDelayS;
            }
          }
        }
        break;
      }
      case 'sleeping_jury': {
        // AE-241 (I15): the jury convenes when protocol is at fault AND the player carries
        // a witness mark AND a revoked-route site was seen anywhere — then it waits for
        // the chamber's WITNESS hold to mint the exception.
        if (!m.awake && hasWitnessMark(state)) {
          const revokedSeen = Object.values(ae.machineSites || {}).some((r) => r && r.seen)
            && (ae.machineProtocol === 'revoked' || ae.machineProtocol === 'violation');
          if (revokedSeen) {
            m.awake = true;
            world.bus.emit('comms:log', {
              from: 'Sleeping jury', kind: 'machine',
              text: 'THE JURY CONVENES. STAND WITNESS OR BE RECORDED IN ABSENTIA.',
            });
          }
        }
        if (m.awake && player && player.pos) {
          const desired = Math.atan2(player.pos.z - e.pos.z, player.pos.x - e.pos.x);
          e.rot = angleLerp(e.rot, desired, Math.min(1, kind.turnRate * dt));
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

// ── Moving suppression (AE-233/M08) — shepherd engines carry a dead pocket with them. ────
// Called from alienEcology.js wherever the static suppression field is consulted: if a
// live shepherd entity is within its suppressionRadius of the point, the point is dead.
export function shepherdFieldAt(state, sectorId, x, z) {
  if (!state || !state.entityList) return null;
  for (const e of state.entityList) {
    const m = e && e.data && e.data.machine;
    if (!m || m.kind !== 'shepherd' || e.alive === false || e.homeSectorId !== sectorId) continue;
    const kind = machineKindById('shepherd');
    const r = (kind && kind.suppressionRadius) || 400;
    if (dist2(e.pos.x, e.pos.z, x, z) <= r * r) return e;
  }
  return null;
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
