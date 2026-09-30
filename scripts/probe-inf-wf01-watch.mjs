// INFERENCE WF-01 look probe (unit #3). Boots the sim at seed 4242 in a given sector and
// logs what NPC actors visibly DO over sim minutes: role, activity signals, events.
// Untracked probe — not a production file.
import { createSimulation } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { traffic } from '../src/systems/traffic.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { mining } from '../src/systems/mining.js';

const sectorId = process.argv[2] || 'sector_helios_prime';
const SIM_MIN = Number(process.argv[3] || 6);

const DT = 1 / 60;
const sim = createSimulation({ seed: 4242, systems: [world, traffic, npcJobsRuntime, mining] });
sim.state.mode = 'flight';
const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, hull: 100, hullMax: 100 });
sim.state.playerId = player.id;
sim.registry.get('world').enterSector(sectorId);

const events = [];
const WATCHED = [
  'traffic:oreCollected', 'traffic:arrival', 'traffic:departed', 'traffic:manifest',
  'npcJob:phase', 'npcJob:complete', 'mining:beamLocked', 'rescue:claim', 'traffic:rescue',
  'cargo:spill', 'traffic:disabled', 'tender:service', 'traffic:oreDelivered',
];
for (const name of WATCHED) sim.bus.on(name, (p) => events.push({ t: sim.state.simTime, name, p: p && { id: p.id, role: p.role, kind: p.kind, phase: p.phase, sectorId: p.sectorId } }));

const steps = Math.round(SIM_MIN * 60 * 60);
const seen = new Map(); // role -> {count, movedSamples, workSignals}
let lastSample = -1;
for (let i = 0; i < steps; i++) {
  sim.step(DT);
  const t = sim.state.simTime;
  if (Math.floor(t) !== lastSample) {
    lastSample = Math.floor(t);
    for (const e of sim.state.entities.values()) {
      if (!e || e.alive === false) continue;
      const d = e.data || {};
      const role = d.trafficRole || d.role || (d.job && d.job.kind);
      if (!role) continue;
      const key = role;
      let row = seen.get(key);
      if (!row) { row = { count: 0, samples: 0, workSignals: 0, carryingSamples: 0, phases: new Map() }; seen.set(key, row); }
      row.samples++;
      if (d.cargoManifest?.totalQty > 0 || d.carrying) row.carryingSamples++;
      const signal = d.minerShiftRockId != null || d.towTargetId != null || d.tenderClientRef != null
        || d.workSignal || d.npcJobWorkSignal || d.salvageTargetId != null;
      if (signal) row.workSignals++;
      const phase = d.job?.phase || d.npcPhase;
      if (phase) row.phases.set(phase, (row.phases.get(phase) || 0) + 1);
    }
  }
}

console.log(`=== sector ${sectorId} seed 4242, ${SIM_MIN} sim minutes ===`);
for (const [role, row] of [...seen.entries()].sort((a, b) => b[1].samples - a[1].samples)) {
  const phases = [...row.phases.entries()].map(([p, n]) => `${p}:${n}`).join(' ') || '-';
  console.log(`${role.padEnd(12)} samples=${String(row.samples).padStart(5)} workSignals=${String(row.workSignals).padStart(4)} carrying=${String(row.carryingSamples).padStart(4)} phases=[${phases}]`);
}
console.log(`--- events (${events.length}) ---`);
for (const e of events.slice(0, 80)) console.log(`t=${e.t.toFixed(0)}s ${e.name} ${JSON.stringify(e.p || {}).slice(0, 160)}`);
