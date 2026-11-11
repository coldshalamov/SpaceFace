// Shared read-only work attention. Dock and physical-contact readers use the same
// cargo/clauses/settlement truth; this module owns no gameplay mutation.
// Decides which mission to surface when the player docks and whether the Missions tab
// should pulse / auto-open so they are not hunting for "Contracts".
import { releasableContractUnits, sellableCargoQuantity } from '../systems/cargo.js';
import { unsatisfiedRequiredConditions } from '../data/contractClauses.js';
import { partialDeliverySettlement, isMutationRecovery, mutationPartialSettlement } from '../systems/missionShared.js';

const TURN_IN_TYPES = new Set([
  'cargo_delivery',
  'passenger_transport',
  'salvage_retrieval',
  'smuggling_run',
  'escort',
]);

function mid(m) {
  if (!m) return null;
  return m.id != null ? m.id : m.missionId;
}

function activeMissions(state) {
  const list = state && state.missions && state.missions.active;
  return (Array.isArray(list) ? list : []).filter((m) => m && (m.status == null || m.status === 'active'));
}

function boardOffers(state, stationId, eligibility) {
  const boards = state && state.missions && state.missions.boards;
  const board = boards && stationId && boards[stationId];
  return (board && Array.isArray(board.slots) ? board.slots : []).filter((offer) => (
    offer && (offer.status == null || offer.status === 'offered' || offer.status === 'available')
    && (!eligibility || eligibility(offer))
  ));
}

function berthReadiness(state, m) {
  const blocked = unsatisfiedRequiredConditions(m);
  if (blocked.length) return { ready: false, reason: blocked[0].pendingText || 'Required contract condition is not yet satisfied' };
  let p = (m && m.params) || {};
  if (m.type === 'escort' || !p.cmdtyId) return { ready: true };
  const tracked = m.preloadedCargo === true && (Number(p.qty) > 0 || p.sealAccounted === true);
  // Docking accounts an old/uninitialized seal before checking delivery. Mirror that
  // normalization in a read-only view; stale remaining/delivered fields are not authority.
  if (tracked && p.sealAccounted !== true && Number(p.qty) > 0) {
    p = { ...p, sealedRemaining: Math.floor(Number(p.qty)),
      sealedDelivered: Math.max(0, Math.floor(Number(p.sealedDelivered) || 0)), sealAccounted: true };
    m = { ...m, params: p };
  }
  const need = tracked
    ? Math.max(0, Math.floor(Number(p.sealedRemaining) || 0))
    : Math.max(1, Number(p.qty) || 1);
  const items = state && state.player && state.player.cargo && state.player.cargo.items;
  // The assay sample is the owner's explicit persistent-cargo exception. Other jobs
  // cannot spend a sibling contract's seals, even when raw hold totals look sufficient.
  const have = tracked ? releasableContractUnits(state, m)
    : m.storyTag === 'campaign47a:b0:recovery' && p.cmdtyId === 'cmdty_47a_assay_sample'
      ? Number(items && items[p.cmdtyId]) || 0
      : sellableCargoQuantity(state, p.cmdtyId);
  if (need === 0) return { ready: tracked && Number(p.sealedDelivered) > 0 };
  if (have >= need) return { ready: true };
  const partial = partialDeliverySettlement(m, state)
    || (m.type === 'salvage_retrieval' && isMutationRecovery(m)
      ? mutationPartialSettlement(have, need, m.reward_cr) : null);
  if (partial && partial.deliverQty > 0) return {
    ready: true,
    reason: `Short delivery: ${partial.deliverQty}/${need} units can settle on the recorded terms`,
  };
  return { ready: false, reason: 'At destination — required cargo is missing or reserved for another contract' };
}

function titleOf(m) {
  if (!m) return 'Mission';
  if (m.title) return String(m.title);
  return String(m.type || 'mission').replace(/_/g, ' ');
}

/**
 * @returns {null|{
 *   focusMissionId: string,
 *   kind: 'turn_in'|'pickup'|'accept'|'active',
 *   reason: string,
 *   autoOpen: boolean,
 *   badge: string|number,
 *   title: string,
 *   surface: 'active'|'board',
 * }}
 */
export function missionDockAttention(state, stationId, options = {}) {
  if (!state || !stationId) return null;
  const active = activeMissions(state);
  const tracked = state.ui && state.ui.trackedMissionId != null
    ? String(state.ui.trackedMissionId) : null;
  const offers = boardOffers(state, stationId, options.offerEligible);

  // 1) Destination berth for delivery-style work (ready to settle, or stuck missing cargo).
  const atDest = active.filter((m) => m.destStationId === stationId && TURN_IN_TYPES.has(m.type));
  const readiness = new Map(atDest.map((m) => [m, berthReadiness(state, m)]));
  const readyTurnIns = atDest.filter((m) => readiness.get(m).ready);
  const ready = (tracked && readyTurnIns.find((m) => String(mid(m)) === tracked)) || readyTurnIns[0];
  if (ready) {
    return {
      focusMissionId: String(mid(ready)),
      kind: 'turn_in',
      reason: readiness.get(ready).reason || 'Mission objective can settle at this berth',
      autoOpen: true,
      badge: '!',
      title: titleOf(ready),
      surface: 'active',
    };
  }
  const stuck = (tracked && atDest.find((m) => String(mid(m)) === tracked)) || atDest[0];
  if (stuck) {
    return {
      focusMissionId: String(mid(stuck)),
      kind: 'active',
      reason: readiness.get(stuck).reason || 'At destination — required cargo is not in the hold',
      autoOpen: true,
      badge: '!',
      title: titleOf(stuck),
      surface: 'active',
    };
  }

  // 2) Origin / recovery berth for an active job (load cargo, recover sample, etc.).
  const pickups = active.filter((m) => options.localOnly === true
    ? m.stationId === stationId || m.destStationId === stationId
    : m.stationId === stationId && m.destStationId !== stationId);
  const pickup = (tracked && pickups.find((m) => String(mid(m)) === tracked)) || pickups[0];
  if (pickup) {
    return {
      focusMissionId: String(mid(pickup)),
      kind: 'pickup',
      reason: 'Active mission starts or resupplies at this station',
      autoOpen: true,
      badge: '!',
      title: titleOf(pickup),
      surface: 'active',
    };
  }

  // 3) Tracked job is simply active — still point them at Missions so it is not buried.
  if (tracked && options.localOnly !== true) {
    const trackedMission = active.find((m) => String(mid(m)) === tracked);
    if (trackedMission) {
      return {
        focusMissionId: tracked,
        kind: 'active',
        reason: 'Tracked mission',
        autoOpen: false,
        badge: 1,
        title: titleOf(trackedMission),
        surface: 'active',
      };
    }
  }

  // 4) First-hour / empty log: board has work and the player has none — invite accept.
  // Auto-open only when the hold is empty so a cargo-sell first-dock step is not yanked away.
  if (!active.length && offers.length) {
    const offer = offers[0];
    const holdUsed = Number(state.player && state.player.cargo && state.player.cargo.usedVolume) || 0;
    return {
      focusMissionId: String(mid(offer)),
      kind: 'accept',
      reason: 'Jobs posted at this berth — accept one to bind a route',
      autoOpen: holdUsed <= 0,
      badge: offers.length,
      title: titleOf(offer),
      surface: 'board',
    };
  }

  // 5) Soft: board has offers while already flying jobs — badge only, do not auto-open.
  if (offers.length) {
    return {
      focusMissionId: String(mid(offers[0])),
      kind: 'accept',
      reason: 'Additional jobs on the board',
      autoOpen: false,
      badge: offers.length,
      title: titleOf(offers[0]),
      surface: 'board',
    };
  }

  return null;
}

export default missionDockAttention;
