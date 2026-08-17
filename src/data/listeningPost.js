// Plan 30 — pure contract for the Listening Post log and its Codex coordinate puzzle.
// World owns durable discovery; Scanner owns the physical signal; Codex only emits attempts.

export const LISTENING_POST = Object.freeze({
  sourceSectorId: 'sector_dione_lane',
  sourceStationId: 'station_dione',
  sourcePoiId: 'poi_dione_relay',
  sourceName: 'Relay Monument',
  signalId: 'signal:poi:poi_dione_relay',
  rumorId: 'frontier-rumor:station_dione:relay-monument',
  rumorText: 'The old relay at Dione still pings five carriers, then fifteen, around one long pause. The lane crews say the pattern is a chart pair, not a fault.',
  targetSectorId: 'sector_sedna_dark',
  targetStationId: 'station_sedna_last_light',
  targetStationName: 'Last Light Station',
  chartCoordinate: Object.freeze({ x: 5, y: 15 }),
  pulseGroups: Object.freeze([5, 15]),
  pulsePattern: '•••••  /  ••••• ••••• •••••',
  puzzlePrompt: 'Two carrier groups repeat after the long pause. Enter the chart pair as X,Y.',
});

export function normalizeListeningPostAttempt(value) {
  const text = String(value == null ? '' : value).trim();
  const match = /^([+-]?\d{1,3})\s*(?:,|\/|:|\s)\s*([+-]?\d{1,3})$/.exec(text);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
}

export function validateListeningPostAttempt(value) {
  const coordinate = normalizeListeningPostAttempt(value);
  if (!coordinate) return { ok: false, reason: 'format', coordinate: null };
  const ok = coordinate.x === LISTENING_POST.chartCoordinate.x
    && coordinate.y === LISTENING_POST.chartCoordinate.y;
  return { ok, reason: ok ? null : 'mismatch', coordinate };
}

export function listeningPostRecord(state) {
  return state && state.world && state.world.discovery
    && state.world.discovery[LISTENING_POST.sourceSectorId]
    && state.world.discovery[LISTENING_POST.sourceSectorId].pois
    && state.world.discovery[LISTENING_POST.sourceSectorId].pois[LISTENING_POST.sourcePoiId]
    || null;
}

export function listeningPostPuzzleState(state) {
  const record = listeningPostRecord(state);
  const secret = record && record.listeningPost;
  if (!record || record.investigated !== true || !secret) {
    return { phase: 'locked', recovered: false, decoded: false, attemptCount: 0 };
  }
  return {
    phase: secret.decoded === true ? 'decoded' : 'recovered',
    recovered: true,
    decoded: secret.decoded === true,
    attemptCount: Math.max(0, Math.floor(Number(secret.attemptCount) || 0)),
    lastResult: secret.lastResult === 'mismatch' || secret.lastResult === 'format'
      ? secret.lastResult : null,
    decodedAt: secret.decoded === true ? Math.max(0, Number(secret.decodedAt) || 0) : null,
    targetSectorId: secret.decoded === true ? LISTENING_POST.targetSectorId : null,
    targetStationId: secret.decoded === true ? LISTENING_POST.targetStationId : null,
  };
}
