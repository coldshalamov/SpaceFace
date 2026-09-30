// D89 probe: trace the Ceres miner→handoff→loaded-approach pipeline stage by stage.
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { globalToSectorLocalForSector } from '../src/data/sectorCoordinates.js';
import { zoneAt } from '../src/data/sectorZones.js';

const SECTOR_ID = 'sector_ceres_belt';
const ZONE_ID = 'zone_ceres_refinery';
const DT = 1 / 60;
const MAX_S = 600;

const runtime = createAuthoritativeRuntime({
  profileId: 'production', nodeSafeOnly: true, seed: 13805,
});
const { state, bus } = runtime;
state.mode = 'flight';
const player = runtime.spawn(makeShipEntitySpec('ship_hornet', {
  isPlayer: true, player: state.player, pos: { x: 0, z: 0 },
}));
state.playerId = player.id;
runtime.getSystem('world').enterSector(SECTOR_ID);
await runtime.getSystem('physics').prepareBackend(state, { reset: true });

const actor = (slotId) => state.entityList.find((e) => e.alive !== false
  && e.data?.activityActorSlotId === slotId);
const localZone = (e) => {
  const l = globalToSectorLocalForSector(e.pos, SECTOR_ID);
  return zoneAt(SECTOR_ID, l.x, l.z)?.id || null;
};

bus.on('traffic:ceresCausalChain', (p) => {
  if (p.kind === 'tick') return;
  console.log(`[${p.simTime.toFixed(1)}s] chain:${p.kind} ev=${p.eventId || '-'} phase=${p.phase || '-'} seeds=${JSON.stringify(p.seeds)} completed=${p.completed.length}`);
});
bus.on('mining:npcExtraction', (p) => {
  console.log(`[${state.simTime.toFixed(1)}s] npcExtraction miner=${p.minerId} qty=${p.extractedU} work=${p.workId}`);
});

let lastLog = -15;
let won = false;
for (let tick = 0; tick < MAX_S * 60 && !won; tick++) {
  runtime.step(DT);
  const t = state.simTime;
  const miner = actor('ceres_seam_miner');
  const hauler = actor('ceres_refinery_hauler');
  if (hauler?.data?.cargoManifest?.totalQty > 0 && localZone(hauler) === ZONE_ID) {
    console.log(`[${t.toFixed(1)}s] WIN: hauler in approach with qty=${hauler.data.cargoManifest.totalQty}`);
    won = true;
    break;
  }
  if (t - lastLog >= 15) {
    lastLog = t;
    const chain = runtime.getSystem('traffic').getCeresCausalChainSnapshot();
    const handoff = state.traffic?.ceresMinerHaulerHandoff;
    const d = miner && hauler
      ? Math.hypot(miner.pos.x - hauler.pos.x, miner.pos.z - hauler.pos.z).toFixed(0)
      : 'n/a';
    console.log(`[${t.toFixed(1)}s] active=${(chain?.active || []).map((l) => `${l.eventId}:${l.phase}`).join(',') || '-'} done=${(chain?.completed || []).length} seeds=${JSON.stringify(chain?.seeds || {})} handoff=${handoff?.state || '-'} miner=${miner ? `qty:${miner.data?.cargoManifest?.totalQty ?? 'no-mani'}@${localZone(miner)}` : 'ABSENT'} hauler=${hauler ? `qty:${hauler.data?.cargoManifest?.totalQty ?? 'no-mani'}@${localZone(hauler)}` : 'ABSENT'} dist=${d}`);
  }
  // Stall forensics: after the window opens, dump hauler kinematics + nearest obstacle.
  if (t > 80 && hauler && miner && Math.abs(t % 5) < DT * 0.9) {
    const dupes = state.entityList.filter((e) => e.alive !== false
      && e.data?.activityActorSlotId === 'ceres_refinery_hauler').map((e) => e.id);
    const i = hauler.data?.intent || null;
    let nearest = null;
    for (const e of state.entityList) {
      if (!e || e === hauler || e === miner || e.alive === false || e.collides !== true) continue;
      const dd = Math.hypot(e.pos.x - hauler.pos.x, e.pos.z - hauler.pos.z) - (e.radius || 0) - (hauler.radius || 0);
      if (!nearest || dd < nearest.dd) nearest = { dd, type: e.type, id: e.id, proxy: e.data?.collisionProxy || null };
    }
    const vmag = Math.hypot(hauler.vel?.x || 0, hauler.vel?.z || 0).toFixed(1);
    const jobs = runtime.getHelpers?.().npcJobs;
    const claim = jobs?.controlClaim ? jobs.controlClaim(hauler.data?.jobId) : null;
    console.log(`  [${t.toFixed(1)}s] hauler#${hauler.id} dupes=${JSON.stringify(dupes)} vel=${vmag} intent=${JSON.stringify(i)} status=${hauler.data?.ceresHandoffStatus} rot=${Number(hauler.rot).toFixed(2)} pos=(${hauler.pos.x.toFixed(0)},${hauler.pos.z.toFixed(0)}) minerPos=(${miner.pos.x.toFixed(0)},${miner.pos.z.toFixed(0)}) claim=${claim ? claim.claimId : 'NONE'} near=${nearest ? `${nearest.type}#${nearest.id}@${nearest.dd.toFixed(0)}wu` : '-'}`);
  }
}
console.log(won ? 'RESULT: pipeline delivered' : 'RESULT: starved within 600s');
runtime.dispose();
