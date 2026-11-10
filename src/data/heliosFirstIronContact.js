// Read-only, request-time advice from the actual working cutter. Navigation, mining,
// cargo and mission settlement keep their existing owners.
import { activeOwnedShip, shipCarriesModule } from './starterJobs.js';
import { ASTEROIDS, BEAMS } from './mining.js';
import { nearestMiningResourceFace } from '../missions/starterWorkday.js';
import { forEachFieldRock } from '../world/livingWorldViews.js';
import { modelTruthPlanarRadius } from './modelTruth.js';
import { playerBearingHyphen } from '../core/playerCompass.js';
import { sellableCargoQuantity } from '../systems/cargoReadModel.js';

const SECTOR = 'sector_helios_prime';
const finite = p => Number.isFinite(p?.x) && Number.isFinite(p?.z);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const radius = e => Math.max(Number(e?.radius) || 0, modelTruthPlanarRadius(e) || 0);

function workingCutterIdentity(s, e) {
  const p = s?.entities?.get(s.playerId), d = e?.data, entry = s?.npcJobs?.byId?.[d?.jobId], job = entry?.job;
  if (s?.mode !== 'flight' || s.ui?.docked || s.player?.flags?.docked || s.save?.restoring || s.physicsVenue?.active
    || (s.run?.kind && !['adventure', 'campaign'].includes(s.run.kind))
    || s.world?.currentSectorId !== SECTOR || s.player?.targetId !== e?.id
    || !p?.alive || !e?.alive || e.team !== 2 || e.type !== 'ship' || s.entities.get(e.id) !== e
    || !Number.isSafeInteger(e.occupantGeneration) || e.occupantGeneration < 1
    || !['helios_seam_miner', 'helios_starter_cutter'].includes(d?.activityActorSlotId)
    || typeof d.worldRecordId !== 'string' || d.jobId !== `job:${d.worldRecordId}`
    || entry?.entityId !== e.id || entry.worldRecordId !== d.worldRecordId || job?.id !== d.jobId
    || job.kind !== 'miner' || !job.materialized || job.corrupt || job.phase === 'flee' || entry.control || entry.towAssist
    || !finite(p.pos) || !finite(e.pos) || distance(p.pos, e.pos) > 900
    || [p, e].some(body => [body.homeSectorId, body.sectorId, body.data?.homeSectorId, body.data?.sectorId]
      .some(id => id && id !== SECTOR))) return null;
  return { worldRecordId: d.worldRecordId, generation: e.occupantGeneration,
    playerId: p.id, playerGeneration: p.occupantGeneration };
}

function homeboundReceipt(state) {
  if (state.missions?.starterJobStep?.starter_hitch !== 1
    || state.missions?.active?.some(m => m.status === 'active' && m.params?.starterJobId === 'starter_hitch')
    || !(sellableCargoQuantity(state, 'cmdty_ore_iron') > 0)) return null;
  const rows = (state.missions?.receipts || []).filter(r => r.source === 'starterJob'
    && r.sourceOfferId === 'starter-starter_hitch-1' && r.type === 'mining_quota'
    && r.outcome === 'completed' && r.stationId === 'station_helios' && r.destSectorId === SECTOR
    && typeof r.missionId === 'string' && r.missionId.length > 0
    && Number.isFinite(r.at_s) && r.at_s >= 0 && r.at_s <= state.simTime);
  return rows.length === 1 ? rows[0] : null;
}

function ironBuyer(state) {
  const buyers = [...(state.entities?.values?.() || [])].filter(e => e.alive && e.type === 'station'
    && e.data?.stationId === 'station_helios' && finite(e.pos)
    && Number.isSafeInteger(e.occupantGeneration) && e.occupantGeneration > 0
    && ![e.homeSectorId, e.sectorId, e.data?.homeSectorId, e.data?.sectorId].some(id => id && id !== SECTOR));
  return buyers.length === 1 ? buyers[0] : null;
}

export function firstIronContactIdentity(state, worker) {
  const identity = workingCutterIdentity(state, worker), ship = activeOwnedShip(state);
  if (!identity || !Number.isSafeInteger(identity.playerGeneration) || identity.playerGeneration < 1
    || state.onboarding?.active && !state.onboarding.finished
    || ship?.defId !== 'ship_kestrel' || !shipCarriesModule(ship, 'mod_drill_amp')
    || !shipCarriesModule(ship, 'mod_mining_laser_s')) return null;
  const missions = (state.missions?.active || []).filter(m => m.status === 'active'
    && m.source === 'starterJob' && m.type === 'mining_quota' && m.destSectorId === SECTOR
    && m.params?.starterJobId === 'starter_hitch' && m.params.starterStep === 1
    && m.params.starterWorkdayVersion === 1 && m.params.cmdtyId === 'cmdty_ore_iron');
  if (missions.length === 1) return { ...identity, missionId: missions[0].id,
    enterSerial: state.world.enterSerial ?? 0 };
  const receipt = homeboundReceipt(state), station = receipt && ironBuyer(state);
  return station ? { ...identity, missionId: receipt.missionId, phase: 'homebound',
    buyerId: station.id, buyerGeneration: station.occupantGeneration,
    // Advice describes free stock, not merely a nonempty hold. Bind the quantity
    // so removal, reservation or pickup invalidates a queued offer or reply.
    freeIronQuantity: sellableCargoQuantity(state, 'cmdty_ore_iron'),
    enterSerial: state.world.enterSerial ?? 0 } : null;
}

function workingPosition(state, player, face, worker = null) {
  const beam = player.data?.miningBeam || state.player.miningBeam;
  const range = beam?.range || BEAMS.find(b => b.id === beam?.tierId)?.range || 240;
  const hullRadius = radius(player), standOff = radius(face) + hullRadius + 35;
  if (!Number.isFinite(standOff) || standOff > range + (Number(face.radius) || 0) - 20) return null;
  const bodies = [...(state.entityList || []), ...(state.world?.dressing?.rows || [])];
  forEachFieldRock(state, rock => { if (rock.fieldResident) bodies.push(rock); });
  const bearing = Math.atan2(player.pos.z - face.pos.z, player.pos.x - face.pos.x);
  for (let i = 0; i < 12; i++) {
    const angle = bearing + i * Math.PI / 6;
    const pos = { x: face.pos.x + Math.cos(angle) * standOff, z: face.pos.z + Math.sin(angle) * standOff };
    if (worker) {
      const dx = face.pos.x - worker.pos.x, dz = face.pos.z - worker.pos.z, length2 = dx * dx + dz * dz;
      const t = length2 > 0 ? Math.max(0, Math.min(1, ((pos.x - worker.pos.x) * dx + (pos.z - worker.pos.z) * dz) / length2)) : 0;
      if (distance(pos, { x: worker.pos.x + t * dx, z: worker.pos.z + t * dz }) < hullRadius + 35) continue;
    }
    if (!bodies.some(e => e !== player && e !== face && e?.alive !== false
      && e.collides !== false && e.physicsBody !== false && finite(e.pos)
      && !['pickup', 'projectile'].includes(e.type)
      && distance(pos, e.pos) < radius(e) + hullRadius + 20)) return pos;
  }
  return null;
}

export function firstIronWorkingPosition(state, worker) {
  const player = state.entities?.get(state.playerId);
  if (!finite(player?.pos) || !finite(worker?.pos)) return null;
  const current = state.entities?.get(worker.data?.minerShiftRockId);
  const entry = state.npcJobs?.byId?.[worker.data?.jobId];
  // Prefer the actual live cut, whose published owner yields to real extraction.
  // Reading a face never starts a reservation or interrupts the worker.
  if (current && entry?.job?.phase === 'work' && !entry.heliosShiftStopped) {
    let place;
    const { face } = nearestMiningResourceFace(state, { sectorId: SECTOR, center: current.pos,
      commodityId: 'cmdty_ore_iron' }, ASTEROIDS, candidate => {
      if (candidate !== current || candidate.fieldResident || distance(candidate.pos, worker.pos) > 240 + radius(candidate)) return false;
      place = workingPosition(state, player, candidate, worker); return !!place;
    });
    if (face) return { pos: place, facePos: { x: face.pos.x, z: face.pos.z }, sharedFace: true,
      faceId: face.id, faceGeneration: face.occupantGeneration };
  }
  let pos;
  const { face } = nearestMiningResourceFace(state, { sectorId: SECTOR,
    center: player.pos, commodityId: 'cmdty_ore_iron' }, ASTEROIDS, candidate => {
    if (candidate === current || distance(candidate.pos, worker.pos) > 900) return false;
    const place = workingPosition(state, player, candidate);
    if (!place) return false;
    pos = place; return true;
  });
  return face ? { pos, facePos: { x: face.pos.x, z: face.pos.z },
    faceId: face.id, faceGeneration: face.occupantGeneration ?? null } : null;
}

export function firstIronContactReply(state, worker, offer) {
  const identity = firstIronContactIdentity(state, worker), offered = offer?.firstIronHail;
  if (!identity || !offered || Object.keys(identity).some(k => identity[k] !== offered[k])
    || !(offer.expiresAt > state.simTime) || !offer.actions?.some(a => a.id === 'route')) return null;
  if (identity.phase === 'homebound') {
    const station = ironBuyer(state), qty = identity.freeIronQuantity;
    const reason = `Your first cutting ticket is complete. You still have ${qty}u unsealed iron aboard. Fly to Helios, dock, then choose Market to review and sell it. The sale is separate from your ticket pay. Then find Kessler at the Bar and ask about your first iron ticket.`;
    return { lines: ['SEAM CUTTER · The ticket pays for your cut. The iron in your hold is still yours; Helios buys it when you choose to sell.', reason],
      firstIronCourse: { ...identity, pos: { x: station.pos.x, z: station.pos.z }, sectorId: SECTOR,
        targetEntityId: station.id, label: 'Helios · sell held iron', reason, autopilot: false } };
  }
  const fix = firstIronWorkingPosition(state, worker);
  if (!fix) return { lines: ['SEAM CUTTER · No clear iron working position close to me right now.',
    'Your ticket still accepts any iron you cut in Helios. Keep your current course; try another face.'] };
  const bearing = playerBearingHyphen(fix.facePos.x - fix.pos.x, fix.facePos.z - fix.pos.z);
  const mission = state.missions.active.find(row => row.id === identity.missionId);
  const target = Number(mission?.objectiveTarget), progress = Number(mission?.objectiveProgress);
  const tally = Number.isFinite(target) && target > 0 && Number.isFinite(progress) && progress >= 0
    ? ` Ticket: ${Math.min(target, progress)}/${target}u iron cut. A small face may run out; track the ticket for another Helios iron face.` : '';
  const reason = `Brake at this working position, then aim ${bearing} at the nearby iron face. Hold the mining beam; collect the loose ore. Watch for moving traffic.${tally}`;
  return { lines: [fix.sharedFace
      ? 'SEAM CUTTER · Kessler pays for your cut, not mine. Take this side of my face; I lower my beam while you actually cut and resume when you stop. The loose iron is yours to collect.'
      : 'SEAM CUTTER · Here is a working position beside an iron face. I will keep my own cut.', reason],
    firstIronCourse: { ...identity, ...fix, sectorId: SECTOR,
      label: 'First iron · cutter’s working position', reason, autopilot: false } };
}

// A route is a snapshot, not a lease. Recheck it at the presentation/intent boundary
// so a queued reply cannot mark a replaced/depleted face or a newly occupied stand-off.
export function firstIronCourseCurrent(state, worker, course) {
  const identity = firstIronContactIdentity(state, worker);
  if (!identity || !course || Object.keys(identity).some(k => course[k] !== identity[k])) return false;
  if (identity.phase === 'homebound') {
    const buyer = ironBuyer(state);
    return course.targetEntityId === buyer?.id && finite(course.pos) && distance(course.pos, buyer.pos) < .01;
  }
  const current = firstIronWorkingPosition(state, worker);
  return !!(current && current.faceId === course.faceId && current.faceGeneration === course.faceGeneration
    && !!current.sharedFace === !!course.sharedFace && finite(course.pos) && finite(course.facePos)
    && distance(current.pos, course.pos) < .01 && distance(current.facePos, course.facePos) < .01);
}
