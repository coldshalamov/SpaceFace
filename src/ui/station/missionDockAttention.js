// Pure station-dock attention for missions. UI-only: no bus, no DOM, no sim mutation.
// Decides which mission to surface when the player docks and whether the Missions tab
// should pulse / auto-open so they are not hunting for "Contracts".

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

function boardOffers(state, stationId) {
  const boards = state && state.missions && state.missions.boards;
  const board = boards && stationId && boards[stationId];
  return (board && Array.isArray(board.slots) ? board.slots : []).filter(Boolean);
}

function cargoReady(state, m) {
  const p = (m && m.params) || {};
  if (!p.cmdtyId) return true;
  const need = Math.max(1, Number(p.qty) || 1);
  const items = state && state.player && state.player.cargo && state.player.cargo.items;
  const have = Number(items && items[p.cmdtyId]) || 0;
  return have >= need;
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
export function missionDockAttention(state, stationId) {
  if (!state || !stationId) return null;
  const active = activeMissions(state);
  const tracked = state.ui && state.ui.trackedMissionId != null
    ? String(state.ui.trackedMissionId) : null;
  const offers = boardOffers(state, stationId);

  // 1) Destination berth for delivery-style work (ready to settle, or stuck missing cargo).
  const atDest = active.filter((m) => m.destStationId === stationId && TURN_IN_TYPES.has(m.type));
  const readyTurnIns = atDest.filter((m) => m.type === 'escort' || cargoReady(state, m));
  const ready = (tracked && readyTurnIns.find((m) => String(mid(m)) === tracked)) || readyTurnIns[0];
  if (ready) {
    return {
      focusMissionId: String(mid(ready)),
      kind: 'turn_in',
      reason: 'Mission objective can settle at this berth',
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
      reason: 'At destination — required cargo is not in the hold',
      autoOpen: true,
      badge: '!',
      title: titleOf(stuck),
      surface: 'active',
    };
  }

  // 2) Origin / recovery berth for an active job (load cargo, recover sample, etc.).
  const pickups = active.filter((m) => m.stationId === stationId && m.destStationId !== stationId);
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
  if (tracked) {
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
