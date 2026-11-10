// One first-visit opportunity in the EXISTING Helios claim, not a tutorial or a board job.
// Traffic's authored survey chain makes the claim available; fieldDepletion/mining own work and save memory.
import { openRichSeamOpportunity, richSeamOpportunityReadout } from './fieldDepletion.js';

export const HELIOS_CLAIM_OPENING = Object.freeze({
  sectorId: 'sector_helios_prime', fieldId: 'f_helios_starter',
  slotId: 'helios_seam_ore_face', approachWU: 360, durationS: 180, bonusU: 8,
  opportunityId: 'helios:first-claim-face',
  visualPulseS: 6,
});

const visualEpochs = new WeakMap();
let nextVisualEpoch = 0;
// A deferred presentation fact cannot cross deserialize/New Game into a new owner table.
export function heliosClaimVisualEpoch(state) {
  const table = state?.fieldDepletion?.opportunities;
  if (!table || typeof table !== 'object') return null;
  if (!visualEpochs.has(table)) visualEpochs.set(table, ++nextVisualEpoch);
  return visualEpochs.get(table);
}

// The existing starter cutter and authored claim miner both use mining.applyMining, not a
// cargo-minting work timer. Only the worker actually assigned this clast may finish its face.
export function isHeliosClaimCutter(state, miner, asteroid) {
  const def = HELIOS_CLAIM_OPENING;
  const data = miner?.data;
  return state?.world?.currentSectorId === def.sectorId && miner?.alive !== false
    && miner?.type === 'ship' && typeof data?.worldRecordId === 'string'
    && data.worldRecordId.length > 0 && data.minerShiftRockId === asteroid?.id
    && (data.activityActorSlotId === 'helios_seam_miner'
      || data.activityActorSlotId === 'helios_starter_cutter')
    && asteroid?.data?.fieldId === def.fieldId
    && asteroid?.data?.activityObjectSlotId === def.slotId;
}

/** The starter work owner takes another existing rock until this introductory survey is seen. */
export function heliosClaimAwaitingWitness(state, rock) {
  const def = HELIOS_CLAIM_OPENING;
  return state?.world?.currentSectorId === def.sectorId
    && rock?.data?.fieldId === def.fieldId && rock?.data?.activityObjectSlotId === def.slotId
    && !richSeamOpportunityReadout(state, def.fieldId, def.slotId);
}

export function heliosClaimOpeningLine(record) {
  if (!record) return '';
  if (record.state === 'open') return 'Sanctioned Claim: bright face exposed. Cut the whole marked rock before it cools; eight extra units are in the face, not in your hold. Helios buys the ore.';
  if (record.state === 'worked' && record.claimedByKind === 'player') return 'Sanctioned Claim remembers your cut. The extra ore came out with the rock; collect it, then Helios Station buys the load. Kessler works the cargo desk.';
  if (record.state === 'worked') return 'The Sanctioned Claim crew finished that bright face. Ordinary seams still cut; Helios Station buys the ore. Kessler works the cargo desk.';
  return 'The bright face at Sanctioned Claim cooled before the cut finished. No bonus load was recovered. Ordinary seams still cut; Helios Station buys the ore.';
}

/** Called by the ordinary traffic chain, regardless of tutorial settings or completion. */
export function stepHeliosClaimOpening(owner, findFace) {
  const state = owner.state;
  const def = HELIOS_CLAIM_OPENING;
  if (state?.world?.currentSectorId !== def.sectorId) return null;
  const player = state.entities?.get(state.playerId);
  if (!player?.pos || player.alive === false) return null;
  const face = findFace();
  // Never open a reward against an absent, exhausted, or merely imagined field slot.
  let record = richSeamOpportunityReadout(state, def.fieldId, def.slotId);
  // New Game and deserialize replace this owner table. Session-local speech/glint suppression
  // must not survive either boundary even when the next record has the same stable identity.
  if (owner._heliosClaimOpeningLedger !== state.fieldDepletion.opportunities) {
    owner._heliosClaimOpeningLedger = state.fieldDepletion.opportunities;
    owner._heliosClaimOpeningRead = null;
    owner._heliosClaimVisualAt = -Infinity;
    owner._heliosClaimSurveyRead = false;
  }
  const pos = face?.pos;
  if (!pos || Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z) > def.approachWU) return record;
  if (!record) {
    if (face.alive === false || !(face.data?.oreHP > 0) || face.data.fieldId !== def.fieldId
      || face.data.activityObjectSlotId !== def.slotId) return null;
    // The optional rail already owns one verb. Don't spend this first-visit window offscreen
    // while the pilot is learning the rescue; skipping/finishing the rail leaves it available.
    if (state.onboarding?.active === true && state.onboarding.finished !== true) return null;
    if (!owner._ceresCausal?.seeds?.claim_staked) {
      // A fast direct-berth pass can beat the chain's 20-second survey. Name the nearby
      // ordinary work without opening a timer, promising a bonus, or making the pilot wait.
      if (!owner._heliosClaimSurveyRead) {
        owner._heliosClaimSurveyRead = true;
        owner.bus.emit('news:publish', {
          text: 'Sanctioned Claim: first survey pending. Ordinary seams are open to cut; Helios Station buys the ore.',
          kind: 'helios_claim_survey', sourceRef: def.opportunityId, channelId: 'news',
          stationId: 'station_helios', sectorId: def.sectorId,
        });
      }
      return null;
    }
    record = openRichSeamOpportunity(state, {
      fieldId: def.fieldId, activityObjectSlotId: def.slotId, sectorId: def.sectorId,
      opportunityId: def.opportunityId, sourceEventId: 'ev_prospector_stakes_claim',
      sourceCycle: 0, durationS: def.durationS, bonusU: def.bonusU, simTime: state.simTime,
    });
  }
  if (!record) return null;
  const now = Number(state.simTime) || 0;
  if (record.state === 'open' && now < record.expiresAtT && face.alive !== false
    && face.type === 'asteroid' && face.data?.fieldId === def.fieldId
    && face.data?.activityObjectSlotId === def.slotId
    && state.entities?.get(face.id) === face
    && !(state.onboarding?.active === true && state.onboarding.finished !== true)
    && now - (owner._heliosClaimVisualAt ?? -Infinity) >= def.visualPulseS) {
    const announce = owner._heliosClaimVisualAt === -Infinity;
    owner._heliosClaimVisualAt = now;
    owner.bus.emit('field:richSeamVisible', {
      opportunityId: record.opportunityId, targetId: face.id, sectorId: def.sectorId,
      visualEpoch: heliosClaimVisualEpoch(state), atS: now, announce,
    });
  }
  // A stable finite window: later choreography cycles and Continue cannot farm/re-arm it.
  // News is proximity-scoped, uses the existing channel, and never takes the player's waypoint.
  const read = `${record.opportunityId}:${record.state}:${record.claimedByKind || ''}`;
  if (owner._heliosClaimOpeningRead !== read) {
    owner._heliosClaimOpeningRead = read;
    // Rebind the existing glint after Continue; never reopen or extend the saved deadline.
    if (record.state === 'open') owner.bus.emit('field:richSeamOpened', record);
    owner.bus.emit('news:publish', {
      text: heliosClaimOpeningLine(record), kind: 'helios_claim_opening',
      sourceRef: def.opportunityId, channelId: 'news', stationId: 'station_helios',
      sectorId: def.sectorId,
    });
  }
  return record;
}
