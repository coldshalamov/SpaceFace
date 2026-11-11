// A real cutter lowers its tool for a pilot crossing the cut. The NPC job owner
// holds its existing clock; this helper never moves a hull or extracts material.
import { hullEnvelopeWu } from '../data/collisionProxyManifests.js';
import { heliosCuttingTow } from './heliosCuttingTow.js';

const holds = new WeakMap();
const pausedTows = new WeakMap();
const heard = new WeakMap();
const finite = p => Number.isFinite(p?.x) && Number.isFinite(p?.z);
const generation = e => Number.isSafeInteger(e?.occupantGeneration) && e.occupantGeneration > 0;
const radius = e => Math.max(0, Number(e?.radius) || 0, hullEnvelopeWu(e) || 0);

function available(s, entry, worker, rock) {
  const player = s.entities?.get(s.playerId), job = entry?.job;
  return s.mode === 'flight' && !s.ui?.docked && !s.player?.flags?.docked
    && !s.save?.restoring && !s.physicsVenue?.active
    && (!s.run?.kind || ['adventure', 'campaign'].includes(s.run.kind))
    && s.world?.currentSectorId === 'sector_helios_prime'
    && player?.alive && player !== worker && generation(player) && finite(player.pos)
    && worker?.alive && worker.type === 'ship' && worker.team === 2
    && generation(worker) && finite(worker.pos) && s.entities.get(worker.id) === worker
    && ['helios_seam_miner', 'helios_starter_cutter'].includes(worker.data?.activityActorSlotId)
    && worker.data.worldRecordId === entry?.worldRecordId && entry.entityId === worker.id
    && s.npcJobs?.byId?.[worker.data.jobId] === entry && job?.id === worker.data.jobId
    && job.kind === 'miner' && job.phase === 'work' && job.materialized && !job.corrupt
    && !entry.control && !entry.towAssist && !entry.heliosShiftStopped
    && rock?.alive && rock.type === 'asteroid' && finite(rock.pos) && generation(rock)
    && s.entities.get(rock.id) === rock && rock.data?.oreHP > 0
    && worker.data.minerShiftRockId === rock.id
    && ![worker, player, rock].some(e => [e.homeSectorId, e.sectorId, e.data?.homeSectorId, e.data?.sectorId]
      .some(id => id && id !== 'sector_helios_prime'))
    ? player : null;
}

export function heliosCuttingCrossing(s, entry, worker, rock, margin = 0, tows = []) {
  const player = available(s, entry, worker, rock);
  if (!player) return false;
  if (heliosCuttingTow(s, player, worker, rock, margin, tows).blocked) return true;
  const dx = rock.pos.x - worker.pos.x, dz = rock.pos.z - worker.pos.z, length = Math.hypot(dx, dz);
  const range = Number(worker.data?.miningBeam?.range) || 240;
  if (!(length > 0) || length > range + radius(rock)) return false;
  // Stop at the near rock skin; a ship behind the face is not in this beam.
  const end = Math.max(0, length - radius(rock));
  const along = ((player.pos.x - worker.pos.x) * dx + (player.pos.z - worker.pos.z) * dz) / length;
  if (along < 0 || along > end + radius(player)) return false;
  const t = Math.max(0, Math.min(end, along));
  const gap = Math.hypot(player.pos.x - worker.pos.x - dx / length * t,
    player.pos.z - worker.pos.z - dz / length * t);
  return gap < radius(player) + 8 + margin;
}

function valid(s, row) {
  return row && row.owner.state === s && s.npcJobs === row.table
    && s.world.enterSerial === row.enterSerial && s.entities.get(s.playerId) === row.player
    && row.entry.job === row.job && row.worker.occupantGeneration === row.workerLife
    && row.player.occupantGeneration === row.playerLife && row.rock.occupantGeneration === row.rockLife
    && available(s, row.entry, row.worker, row.rock)
    && Number.isFinite(s.simTime) && s.simTime >= row.at && s.simTime - row.at <= .5;
}

export function heliosCuttingCourtesyRead(s, worker) {
  const row = holds.get(s);
  return row?.worker === worker && valid(s, row) ? { rockId: row.rock.id } : null;
}

export function clearHeliosCuttingCourtesy(owner) {
  if (pausedTows.get(owner.state)?.owner === owner) pausedTows.delete(owner.state);
  const row = holds.get(owner.state);
  if (row?.owner !== owner) return;
  holds.delete(owner.state);
  owner.helpers?.voice?.cancel?.(row.voiceId);
}

export function installHeliosCuttingCourtesy(owner) {
  const off = ['sector:exit', 'game:load', 'save:loaded'].map(name =>
    owner.bus.on(name, () => clearHeliosCuttingCourtesy(owner)));
  off.push(owner.bus.on('sim:pause', () => {
    const row = holds.get(owner.state) || pausedTows.get(owner.state);
    clearHeliosCuttingCourtesy(owner);
    // A normal pause changes no physical life. Hide the hold and cancel speech,
    // but recheck its observed loads when this same job next actually runs.
    if (row?.owner === owner && row.tows?.length) pausedTows.set(owner.state, row);
  }));
  off.push(owner.bus.on('voice:surface', event => {
    const row = holds.get(owner.state);
    if (row?.owner === owner && event?.id === row.voiceId && valid(owner.state, row))
      heard.set(row.worker, { at: owner.state.simTime, generation: row.workerLife });
  }));
  return () => { clearHeliosCuttingCourtesy(owner); for (const fn of off) fn?.(); };
}

export function stepHeliosCuttingCourtesy(owner, entry, worker, rock, dt) {
  const s = owner.state;
  const paused = pausedTows.get(s);
  const resumeTows = paused?.owner === owner && paused.entry === entry && paused.worker === worker
    && paused.rock === rock && valid(s, paused) ? paused.tows : [];
  if (paused?.owner === owner && (paused.entry === entry || !valid(s, paused))) pausedTows.delete(s);
  let row = holds.get(s);
  if (row && (!valid(s, row) || row.entry !== entry || row.worker !== worker || row.rock !== rock)) {
    clearHeliosCuttingCourtesy(owner); row = null;
  }
  if (!available(s, entry, worker, rock) || !(dt > 0)) return false;
  if (!row && heliosCuttingCrossing(s, entry, worker, rock, 0, resumeTows)) {
    owner._heliosCuttingVoiceSeq = (owner._heliosCuttingVoiceSeq || 0) + 1;
    const player = s.entities.get(s.playerId);
    row = { owner, entry, worker, rock, player, job: entry.job, table: s.npcJobs,
      enterSerial: s.world.enterSerial, workerLife: worker.occupantGeneration,
      playerLife: player.occupantGeneration, rockLife: rock.occupantGeneration,
      at: s.simTime, clearS: 0, tows: resumeTows, voiceId: `helios_cutting_courtesy:${owner._heliosCuttingVoiceSeq}` };
    holds.set(s, row);
  }
  if (!row) return false;
  row.at = s.simTime;
  row.tows = heliosCuttingTow(s, row.player, worker, rock, 10, row.tows).loads;
  row.clearS = heliosCuttingCrossing(s, entry, worker, rock, 10, row.tows) ? 0
    : row.clearS + Math.min(dt, .1);
  if (row.clearS >= .5) { clearHeliosCuttingCourtesy(owner); return false; }
  const receipt = heard.get(worker);
  if (!row.queued && (!receipt || receipt.generation !== row.workerLife || s.simTime < receipt.at
    || s.simTime - receipt.at >= 45)) {
    const until = s.simTime + 8;
    row.queued = !!owner.helpers?.voice?.say?.({ id: row.voiceId, channel: 'comms',
      kind: 'stationBroadcast', ttl: 8, resume: false,
      text: row.tows.length
        ? 'SEAM CUTTER · Beam down. Your tow is across my cut; take the whole load through. I will wait for the line and the tail, then finish this same face.'
        : 'SEAM CUTTER · Beam down. You are across my cut; take your hull through. I will finish this face when you are clear.',
      valid: () => holds.get(s) === row && valid(s, row) && s.simTime < until });
  }
  return true;
}
