// The existing job owner yields its finite cut to actual player extraction on
// the same face. Mining remains the sole owner of ore, pickups and attribution.
const SECTOR = 'sector_helios_prime';
const GAP_S = .75;
const holds = new WeakMap();
const heard = new WeakMap();
const finite = p => Number.isFinite(p?.x) && Number.isFinite(p?.z);
const life = e => Number.isSafeInteger(e?.occupantGeneration) && e.occupantGeneration > 0;

function available(s, entry, worker, rock) {
  const p = s.entities?.get(s.playerId), job = entry?.job;
  return s.mode === 'flight' && !s.ui?.docked && !s.player?.flags?.docked
    && !s.save?.restoring && !s.physicsVenue?.active
    && (!s.run?.kind || ['adventure', 'campaign'].includes(s.run.kind))
    && s.world?.currentSectorId === SECTOR && Number.isFinite(s.simTime)
    && p?.alive && p !== worker && life(p) && finite(p.pos)
    && worker?.alive && worker.type === 'ship' && worker.team === 2 && life(worker)
    && finite(worker.pos) && s.entities.get(worker.id) === worker
    && ['helios_seam_miner', 'helios_starter_cutter'].includes(worker.data?.activityActorSlotId)
    && worker.data.worldRecordId === entry?.worldRecordId && entry.entityId === worker.id
    && s.npcJobs?.byId?.[worker.data.jobId] === entry && job?.id === worker.data.jobId
    && job.kind === 'miner' && job.phase === 'work' && job.materialized && !job.corrupt
    && !entry.control && !entry.towAssist && !entry.heliosShiftStopped
    && rock?.alive && rock.type === 'asteroid' && life(rock) && finite(rock.pos)
    && s.entities.get(rock.id) === rock && rock.data?.oreHP > 0
    && worker.data.minerShiftRockId === rock.id
    && Math.hypot(worker.pos.x - rock.pos.x, worker.pos.z - rock.pos.z)
      <= (Number(worker.data.miningBeam?.range) || 240) + (Number(rock.radius) || 0)
    && ![p, worker, rock].some(e => [e.homeSectorId, e.sectorId, e.data?.homeSectorId, e.data?.sectorId]
      .some(id => id && id !== SECTOR)) ? p : null;
}

function valid(s, row) {
  return row && row.owner.state === s && s.npcJobs === row.table
    && s.world.enterSerial === row.enterSerial && s.entities.get(s.playerId) === row.player
    && row.entry.job === row.job && row.worker.occupantGeneration === row.workerLife
    && row.player.occupantGeneration === row.playerLife && row.rock.occupantGeneration === row.rockLife
    && available(s, row.entry, row.worker, row.rock)
    && s.simTime >= row.lastCutAt && s.simTime - row.lastCutAt < GAP_S;
}

export function heliosSharedCutRead(s, worker) {
  const row = holds.get(s);
  return row?.worker === worker && valid(s, row) ? { rockId: row.rock.id } : null;
}

export function clearHeliosSharedCut(owner) {
  const row = holds.get(owner.state);
  if (row?.owner !== owner) return;
  holds.delete(owner.state);
  owner.helpers?.voice?.cancel?.(row.voiceId);
}

export function installHeliosSharedCut(owner) {
  const off = ['sector:exit', 'game:new', 'game:load', 'save:loaded', 'sim:pause'].map(name =>
    owner.bus.on(name, () => clearHeliosSharedCut(owner)));
  off.push(owner.bus.on('voice:surface', event => {
    const row = holds.get(owner.state);
    if (row?.owner === owner && event?.id === row.voiceId && valid(owner.state, row))
      heard.set(row.worker, { at: owner.state.simTime, generation: row.workerLife });
  }));
  off.push(owner.bus.on('mining:tick', event => {
    const s = owner.state, mining = owner.registry?.get('mining');
    // A selected target, a button held into empty space, or another worker's cut
    // cannot reserve a rock. Require the successful live player beam's receipt.
    if (event?.sourceEntityId !== s.playerId || s.input?.fireGroup !== 2
      || !mining?._beaming || mining._activeVerb !== 'extract'
      || mining._lockTargetId !== event.targetId) return;
    const entry = s.npcJobs?.byId?.[`job:${owner._heliosStarterMinerRecordId}`];
    const worker = s.entities?.get(entry?.entityId), rock = s.entities?.get(event.targetId);
    const player = available(s, entry, worker, rock);
    if (!player) return;
    let row = holds.get(s);
    if (row && (!valid(s, row) || row.owner !== owner || row.entry !== entry
      || row.worker !== worker || row.rock !== rock)) { clearHeliosSharedCut(owner); row = null; }
    if (!row) {
      owner._heliosSharedCutSeq = (owner._heliosSharedCutSeq || 0) + 1;
      row = { owner, entry, worker, rock, player, job: entry.job, table: s.npcJobs,
        enterSerial: s.world.enterSerial, workerLife: worker.occupantGeneration,
        playerLife: player.occupantGeneration, rockLife: rock.occupantGeneration,
        voiceId: `helios_shared_cut:${owner._heliosSharedCutSeq}` };
      holds.set(s, row);
    }
    row.lastCutAt = s.simTime;
  }));
  return () => { clearHeliosSharedCut(owner); for (const fn of off) fn?.(); };
}

export function stepHeliosSharedCut(owner, entry, worker, rock, quiet = false) {
  const s = owner.state, row = holds.get(s);
  if (!row) return false;
  if (!valid(s, row) || row.entry !== entry || row.worker !== worker || row.rock !== rock) {
    clearHeliosSharedCut(owner); return false;
  }
  const receipt = heard.get(worker);
  if (!quiet && !row.queued && (!receipt || receipt.generation !== row.workerLife
    || s.simTime < receipt.at || s.simTime - receipt.at >= 45)) {
    row.queued = !!owner.helpers?.voice?.say?.({ id: row.voiceId, channel: 'comms',
      kind: 'stationBroadcast', ttl: 8, resume: false,
      text: 'SEAM CUTTER · You have that face. My beam is down while you cut; I will take over if you leave it unfinished. The iron you cut is yours to collect.',
      valid: () => holds.get(s) === row && valid(s, row) });
  }
  return true;
}
