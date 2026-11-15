// The cooled-casing return: three validated lot receipts entitle one empty shell kicked out
// of the quench tray. The entitlement itself is stamped by the receipt owner onto the
// worksite's finite material record (furnaceCasingRecord); this module only reconciles the
// physical body that record describes, so the casing can never be lost to a spawn fault or
// an uncertain restore: pending, or issued-without-a-live-body-and-not-collected, retries
// the spawn under a simTime backoff — a live casing or a collected one ends the ledger.
import { FURNACE_INTAKE } from '../data/furnace.js';
import { furnaceMouthGlobal, furnaceCasingRecord } from './furnaceWorksite.js';
import { spawnPayloadEntity } from '../combat/industrialBeam.js';

const RETRY_DELAY_S = 2;

/** One of the quench-tray pockets west of the mouth; null while every pocket is blocked. */
function pocket(state) {
  const mouth = furnaceMouthGlobal();
  for (const dx of [-300, -380, -460]) for (const dz of [-100, 100, -220, 220]) {
    const pos = { x: mouth.x + dx, z: mouth.z + dz };
    if ((state.entityList || []).some(e => e?.alive && e.physicsBody !== false && e.collides !== false
      && Number.isFinite(e.pos?.x) && Number.isFinite(e.pos?.z)
      && Math.hypot(pos.x - e.pos.x, pos.z - e.pos.z) < Math.max(0, Number(e.radius) || 0) + 100)) continue;
    if ((state.world?.dressing?.rows || []).some(e => e?.alive !== false && e.collides !== false
      && Number.isFinite(e.pos?.x) && Number.isFinite(e.pos?.z)
      && Math.hypot(pos.x - e.pos.x, pos.z - e.pos.z) < Math.max(0, Number(e.radius) || 0) + 100)) continue;
    return pos;
  }
  return null;
}

/** The player took from the issued casing — the return is spent; whatever remains of the
 *  body lives on as an ordinary persistent payload. Runs inside pickup:collected, which can
 *  fire mid-issue while the record is still pending, so the match is by material identity. */
export function noteFurnaceCasingPickup(state, payload) {
  const record = furnaceCasingRecord(state);
  if (!record || record.collected) return;
  if (payload?.collectorId && state.playerId && payload.collectorId !== state.playerId) return;
  if (record.entityId != null && payload?.pickupId !== record.entityId) return;
  const body = state.entities?.get(payload?.pickupId);
  if (!body || body.data?.furnaceCasingReturnId !== record.materialId) return;
  record.collected = 'player';
}

/** The intake burned its own returned casing — the shell came home; no second return. */
export function noteFurnaceCasingBurned(state, entity) {
  if (entity?.data?.furnaceCasingReturnId == null) return;
  const record = furnaceCasingRecord(state);
  if (!record || record.collected || entity.data.furnaceCasingReturnId !== record.materialId) return;
  record.collected = 'furnace';
}

/** Reconcile the physical casing against its record. Runs at the intake owner's update and
 *  restore seams: an absent or terminal record exits without touching the entity list; only
 *  an actually-owed spawn probes pockets, never sooner than RETRY_DELAY_S after the last try. */
export function reconcileFurnaceCasing(owner) {
  const state = owner.state;
  const record = furnaceCasingRecord(state);
  if (!record || record.collected || owner._casingIssuing) return;
  let body = record.entityId != null ? state.entities?.get(record.entityId) : null;
  const now = Number.isFinite(state.simTime) ? state.simTime : 0;
  const backedOff = Number.isFinite(record.nextAttemptAt) && now < record.nextAttemptAt;
  // A restored save remaps ids — adopt the live body carrying this return's identity before
  // concluding the issue never landed. One bounded scan, and only on the unproven path:
  // the missing-body search rides the same retry clock as the pocket probe, so a blocked
  // return performs no full-world search between retries.
  if (body && body.alive === false) body = null;
  if (!body && (owner._restoring || record.state !== 'pending' || !backedOff)) {
    body = (state.entityList || []).find(e => e?.alive !== false
      && e.data?.furnaceCasingReturnId === record.materialId) || null;
  }
  if (body) { record.entityId = body.id; record.state = 'issued'; return; }
  delete record.entityId;
  // No live casing proves the issue — pending, an unproven issued mark, or a salvaged
  // in-flight reservation all mean the return is still owed. One decision per pass: the
  // demoted record retries on the next reconcile instead of spawning inside the collapse.
  if (record.state !== 'pending') { record.state = 'pending'; return; }
  if (owner._restoring || state.mode !== 'flight'
      || state.world?.currentSectorId !== FURNACE_INTAKE.sectorId || state.run?.kind === 'survival') return;
  if (backedOff) return;
  const pos = pocket(state);
  if (!pos) { record.nextAttemptAt = now + RETRY_DELAY_S; return; }
  let spawned;
  owner._casingIssuing = true;
  try {
    spawned = spawnPayloadEntity(state, {
      pos, vel: { x: 0, z: 0 }, radius: 8, mass: 20,
      physicsBody: { shape: 'ball', radius: 8, mass: 20, dynamic: true, ccd: true },
      payloadType: 'cut_panel', salvagePool: { cmdty_scrap_metal: 2 },
      ownerId: state.playerId, factionId: 'player',
      homeSectorId: FURNACE_INTAKE.sectorId, transientSector: false,
    }, {
      spawnEntity: spec => owner.helpers?.spawnEntity?.({
        ...spec,
        flags: { persistent: true },
        data: {
          ...spec.data,
          furnaceCasingReturnId: record.materialId,
          scanLabel: 'CR-FEED · cooled empty casing · 2 scrap units · recover or leave',
          name: 'Cooled empty casing',
        },
      }),
    });
  } catch {
    record.nextAttemptAt = now + RETRY_DELAY_S;
    return;
  } finally {
    owner._casingIssuing = false;
  }
  if (!spawned) { record.nextAttemptAt = now + RETRY_DELAY_S; return; }
  record.state = 'issued';
  record.issuedAt = now;
  delete record.nextAttemptAt;
  if (record.collected) return; // collected inside the spawn emit — ledger already closed
  record.entityId = spawned.id;
  owner.bus?.emit('comms:popup', {
    id: 'furnace_casing_return', sender: 'CR-FEED', category: 'story', ttl: 10, persist: true,
    text: 'Three quarantine loads burned. The quench tray has kicked one empty casing out west, clear of the mouth. Two units of scrap if you want it. The ore is gone; this is only the shell.',
  });
}
