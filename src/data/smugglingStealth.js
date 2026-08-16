// Plan 49 smuggling is a physical visibility problem, not a menu roll. This module is pure policy:
// encounterScripts owns the patrol phase, Flight owns controls/velocity, anomalyRuntime owns storm
// markers, and the renderer only consumes the same immutable cone dimensions.

export const CUSTOMS_SCAN_CONE = Object.freeze({
  rangeWU: 720,
  visualReachWU: 120,
  halfAngleRad: Math.PI * 0.18,
  acquireThreshold: 1,
  hotAcquirePerS: 0.52,
  coldAcquirePerS: 0.075,
  outsideDecayPerS: 0.24,
  stormSignalMultiplier: 0.34,
  decoyCaptureRadiusWU: 92,
});

export const SMUGGLING_DROP_CACHE = Object.freeze({
  schemaVersion: 1,
  anchorRangeWU: 118,
  maxRelativeSpeedWUPerS: 8,
  pickupEmbargoS: 2.5,
  activeLimit: 8,
  historyLimit: 16,
  locationValueMult: 0.68,
});

const DROP_CACHE_STATUSES = new Set(['stashed', 'sold', 'recovered', 'lost']);

function safeRef(value, max = 160) {
  return String(value == null ? '' : value).trim().replace(/[^a-zA-Z0-9:_-]+/g, '_').slice(0, max);
}

function safeLabel(value, fallback = '') {
  const text = String(value == null ? '' : value).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, 96);
  return text || fallback;
}

function whole(value, fallback = 0) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

function safePoint(value) {
  return {
    x: finite(value && value.x),
    z: finite(value && value.z),
  };
}

function safeProvenance(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  for (const key of Object.keys(value).sort().slice(0, 24)) {
    const safeKey = safeRef(key, 48);
    const raw = value[key];
    if (!safeKey || raw == null) continue;
    if (typeof raw === 'string') out[safeKey] = raw.slice(0, 160);
    else if (typeof raw === 'number' && Number.isFinite(raw)) out[safeKey] = raw;
    else if (typeof raw === 'boolean') out[safeKey] = raw;
  }
  return Object.keys(out).length ? out : null;
}

function normalizeDropCachePod(value, index) {
  const amount = whole(value && value.amount);
  if (!(amount > 0)) return null;
  return {
    slot: whole(value && value.slot, index),
    amount,
    richLotSource: safeProvenance(value && value.richLotSource),
  };
}

function normalizeDropCacheRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = safeRef(value.id);
  const commodityId = safeRef(value.commodityId, 96);
  const sectorId = safeRef(value.sectorId, 96);
  const anchorId = safeRef(value.anchorId, 96);
  if (!id || !commodityId || !sectorId || !anchorId) return null;
  const pods = (Array.isArray(value.pods) ? value.pods : [])
    .map(normalizeDropCachePod)
    .filter(Boolean)
    .slice(0, 8);
  const podTotal = pods.reduce((sum, pod) => sum + pod.amount, 0);
  const quantity = whole(value.quantity, podTotal);
  const remainingQty = Math.min(quantity, whole(value.remainingQty, podTotal || quantity));
  if (!(quantity > 0)) return null;
  const status = DROP_CACHE_STATUSES.has(value.status) ? value.status : 'stashed';
  return {
    schemaVersion: SMUGGLING_DROP_CACHE.schemaVersion,
    id,
    owner: value.owner === 'external' ? 'external' : 'player',
    status,
    sectorId,
    sectorName: safeLabel(value.sectorName, sectorId),
    anchorId,
    anchorName: safeLabel(value.anchorName, 'unnamed rock'),
    fixedPos: safePoint(value.fixedPos),
    commodityId,
    commodityName: safeLabel(value.commodityName, commodityId),
    quantity,
    remainingQty,
    pods: pods.length ? pods : (status === 'stashed' && remainingQty > 0
      ? [{ slot: 0, amount: remainingQty, richLotSource: null }]
      : []),
    createdAt: Math.max(0, finite(value.createdAt)),
    soldAt: Math.max(0, finite(value.soldAt)),
    soldStationId: safeRef(value.soldStationId, 96) || null,
    payoutCr: whole(value.payoutCr),
    recoveredAt: Math.max(0, finite(value.recoveredAt)),
  };
}

export function createSmugglingDropCacheState() {
  return { schemaVersion: SMUGGLING_DROP_CACHE.schemaVersion, nextSequence: 1, records: [] };
}

export function normalizeSmugglingDropCacheState(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const records = [];
  const seen = new Set();
  for (const raw of Array.isArray(source.records) ? source.records : []) {
    const record = normalizeDropCacheRecord(raw);
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    records.push(record);
  }
  records.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  while (records.length > SMUGGLING_DROP_CACHE.historyLimit) {
    const completed = records.findIndex((record) => record.status !== 'stashed');
    records.splice(completed >= 0 ? completed : 0, 1);
  }
  return {
    schemaVersion: SMUGGLING_DROP_CACHE.schemaVersion,
    nextSequence: Math.max(1, whole(source.nextSequence, 1)),
    records,
  };
}

export function sellableSmugglingDropCaches(state) {
  const source = state && state.world && state.world.smugglingDropCaches;
  const records = source && Array.isArray(source.records) ? source.records : [];
  return records.filter((record) => record && record.owner === 'player'
    && record.status === 'stashed' && whole(record.remainingQty) > 0);
}

const INPUT_EPSILON = 0.08;

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function playerEnginesDark(state) {
  const input = state && state.input || {};
  const actions = input.actions || {};
  const hotAxis = Math.max(
    Math.abs(finite(input.thrust, finite(input.moveZ))),
    Math.abs(finite(input.strafe, finite(input.moveX))),
    Math.abs(finite(input.yaw)),
  );
  return hotAxis <= INPUT_EPSILON
    && input.boost !== true
    && input.afterburner !== true
    && input.brake !== true
    && actions.boost !== true
    && actions.afterburner !== true
    && actions.brake !== true;
}

export function ionStormSignalMultiplier(state, point) {
  if (!state || !point) return 1;
  const list = Array.isArray(state.entityList) ? state.entityList : [];
  for (const marker of list) {
    if (!marker || marker.alive === false || marker.data?.kind !== 'ionStormPocket' || !marker.pos) continue;
    const radius = Math.max(0, finite(marker.radius));
    const dx = finite(point.x) - finite(marker.pos.x);
    const dz = finite(point.z) - finite(marker.pos.z);
    if (radius > 0 && dx * dx + dz * dz <= radius * radius) {
      return CUSTOMS_SCAN_CONE.stormSignalMultiplier;
    }
  }
  return 1;
}

export function customsScanSample(state, observer, player, dtS = 1) {
  if (!observer?.pos || !player?.pos) {
    return Object.freeze({ insideCone: false, enginesDark: false, stormMultiplier: 1, exposureDelta: 0 });
  }
  const dx = finite(player.pos.x) - finite(observer.pos.x);
  const dz = finite(player.pos.z) - finite(observer.pos.z);
  const distanceWU = Math.hypot(dx, dz);
  const heading = finite(observer.rot);
  const forwardX = Math.cos(heading);
  const forwardZ = Math.sin(heading);
  const dot = distanceWU > 1e-6 ? (dx * forwardX + dz * forwardZ) / distanceWU : 1;
  const insideCone = distanceWU <= CUSTOMS_SCAN_CONE.rangeWU
    && dot >= Math.cos(CUSTOMS_SCAN_CONE.halfAngleRad);
  const enginesDark = playerEnginesDark(state);
  const stormMultiplier = ionStormSignalMultiplier(state, player.pos);
  const dt = Math.max(0, Math.min(2, finite(dtS)));
  const baseRate = enginesDark ? CUSTOMS_SCAN_CONE.coldAcquirePerS : CUSTOMS_SCAN_CONE.hotAcquirePerS;
  const exposureDelta = insideCone
    ? baseRate * stormMultiplier * dt
    : -CUSTOMS_SCAN_CONE.outsideDecayPerS * dt;
  return Object.freeze({
    insideCone,
    enginesDark,
    stormMultiplier,
    exposureDelta,
    distanceWU,
    bearingDot: dot,
  });
}

export function customsScanPresentation() {
  return Object.freeze({
    kind: 'customs_scan_lattice',
    rangeWU: CUSTOMS_SCAN_CONE.rangeWU,
    visualRangeWU: CUSTOMS_SCAN_CONE.visualReachWU,
    halfAngleRad: CUSTOMS_SCAN_CONE.halfAngleRad,
    technique: 'hard_line_fan',
  });
}
