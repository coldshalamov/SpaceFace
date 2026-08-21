// Long-session CPU/GPU residency governor.
//
// Extends ref-counted residency with explicit byte budgets and deterministic eviction order.
// Never evicts the player shell, the current-sector opening cohort, or an in-flight decode.
// Previous-sector warmth is lowest priority and is the first thing released when over budget.

export const GOVERNOR_ROLE_PRIORITY = Object.freeze({
  'in-flight': 0,
  player: 1,
  'opening-shell': 2,
  glass: 3,
  'current-sector': 3,
  runway: 4,
  'whole-ship-lod-family': 4,
  recent: 6,
  'save-restore-hold': 7,
  'warm-previous-sector': 8,
  evictable: 9,
  unused: 9,
});

export const GOVERNOR_PRESENTATION_PRIORITY = Object.freeze({
  R0_GLASS: 3,
  R1_RUNWAY: 4,
  R2_METADATA: 9,
  R3_UNLOADED: 10,
});

// These roles are part of the active presentation contract, not just high-priority cache entries.
// A byte budget may release metadata/warm resources around them, but evicting the role itself
// would force an Object3D/decode gap at the glass edge, runway, or player control boundary.
export const GOVERNOR_PINNED_ROLES = Object.freeze(new Set([
  'in-flight',
  'inflight',
  'player',
  'player-shell',
  'opening-shell',
  'gameplay-shell',
  'shell',
  'glass',
  'current-sector',
  'runway',
  'whole-ship-lod-family',
  'save-restore-hold',
  'current-interaction',
  'interaction',
  'active-interaction',
  'live-boundary',
  'render-package-instance',
  'flight-render-package-instance',
  'sector-prewarm',
  'sector-prepared-boundary',
  'sector-prepared-live-boundary',
  'bootstrap',
]));

// Only these roles are safe to release under byte pressure. Unknown live-boundary roles are
// intentionally conservative: the governor must not nominate something that the executor cannot
// release without removing an active presentation owner.
export const GOVERNOR_EVICTABLE_ROLES = Object.freeze(new Set([
  'warm-previous-sector',
  'unused',
  'evictable',
  'recent',
  'metadata-cache',
  'cache',
  'render-package-cache',
  'r2-metadata',
  'r3-unloaded',
]));

function numericBytes(entry, kind = 'gpu') {
  const preferred = kind === 'cpu' ? entry && entry.cpuBytes : entry && entry.gpuBytes;
  if (Number.isFinite(Number(preferred)) && Number(preferred) >= 0) return Number(preferred);
  return Number(entry && entry.bytes) >= 0 ? Number(entry.bytes) : 0;
}

function memoryUnitList(entry = {}) {
  if (!Array.isArray(entry.memoryUnits)) return null;
  const seen = new Set();
  const units = [];
  for (const unit of entry.memoryUnits) {
    if (!unit || unit.identity == null || seen.has(unit.identity)) continue;
    const bytes = Number(unit.bytes);
    if (!Number.isFinite(bytes) || bytes <= 0) continue;
    seen.add(unit.identity);
    units.push({ identity: unit.identity, bytes });
  }
  return units;
}

function buildMemoryUnitOwners(list, kind) {
  const owners = new Map();
  const hasMemoryModel = list.some((entry) => Array.isArray(entry.memoryUnits));
  if (!hasMemoryModel) return null;
  for (let index = 0; index < list.length; index++) {
    const entry = list[index];
    const units = memoryUnitList(entry);
    const effective = units && units.length > 0
      ? units
      : [{ identity: entry, bytes: numericBytes(entry, kind) }];
    for (const unit of effective) {
      if (!unit || unit.bytes <= 0) continue;
      let record = owners.get(unit.identity);
      if (!record) {
        record = { bytes: unit.bytes, entryIndexes: new Set() };
        owners.set(unit.identity, record);
      } else {
        record.bytes = Math.max(record.bytes, unit.bytes);
      }
      record.entryIndexes.add(index);
    }
  }
  return owners;
}

function residentBytesFromMemoryUnits(unitOwners, fallback) {
  if (!unitOwners) return fallback;
  let total = 0;
  for (const unit of unitOwners.values()) total += unit.bytes;
  return total;
}

function freedBytesForSelection(unitOwners, selectedIndexes) {
  if (!unitOwners) return 0;
  let freed = 0;
  for (const unit of unitOwners.values()) {
    let allSelected = true;
    for (const index of unit.entryIndexes) {
      if (!selectedIndexes.has(index)) {
        allSelected = false;
        break;
      }
    }
    if (allSelected) freed += unit.bytes;
  }
  return freed;
}

function normalizedToken(value) {
  return String(value == null ? '' : value).trim().toLowerCase().replace(/_/g, '-');
}

function roleList(entry = {}) {
  const values = Array.isArray(entry.roles)
    ? entry.roles
    : entry.role == null ? [] : [entry.role];
  return values.filter((role) => role != null && String(role).trim() !== '');
}

function tierList(entry = {}) {
  const values = Array.isArray(entry.presentationTiers)
    ? entry.presentationTiers
    : (entry.presentationTier || entry.tier) == null
      ? []
      : [entry.presentationTier || entry.tier];
  return values.filter((tier) => tier != null && String(tier).trim() !== '');
}

function ownerRecords(entry = {}) {
  if (Array.isArray(entry.ownerRecords)) return entry.ownerRecords;
  if (Array.isArray(entry.ownerMetadata)) return entry.ownerMetadata;
  if (Array.isArray(entry.owners)) return entry.owners;
  if (entry.owners instanceof Map) return [...entry.owners.values()];
  return null;
}

function activeRequest(entry = {}) {
  return entry.activeRequest === true
    || entry.requestActive === true
    || entry.hasActiveRequest === true
    || entry.inFlightRequest === true;
}

function ownerBlockReasons(owner = {}) {
  const reasons = new Set();
  const roles = roleList(owner).map(normalizedToken);
  const tiers = tierList(owner).map((tier) => String(tier).trim().toUpperCase());
  if (activeRequest(owner) || owner.inFlight === true || owner.isInFlight === true) {
    reasons.add('in-flight-request');
  }
  if (owner.player === true || owner.isPlayer === true || owner.playerOwned === true) {
    reasons.add('player');
  }
  if (
    owner.currentInteraction === true
    || owner.interactionActive === true
    || owner.activeInteraction === true
    || owner.gameplayShell === true
    || owner.isGameplayShell === true
    || owner.shell === true
  ) {
    if (owner.gameplayShell === true || owner.isGameplayShell === true || owner.shell === true) {
      reasons.add('gameplay-shell');
    }
    if (owner.currentInteraction === true || owner.interactionActive === true || owner.activeInteraction === true) {
      reasons.add('current-interaction');
    }
  }
  for (const tier of tiers) {
    if (tier === 'R0_GLASS' || tier === 'R1_RUNWAY') reasons.add(tier);
  }
  for (const role of roles) {
    if (GOVERNOR_PINNED_ROLES.has(role)) reasons.add(role);
    if (role === 'r0-glass' || role === 'r1-runway') reasons.add(role.toUpperCase().replace('-', '_'));
    if (!GOVERNOR_PINNED_ROLES.has(role)
      && !GOVERNOR_EVICTABLE_ROLES.has(role)
      && role !== 'r0-glass'
      && role !== 'r1-runway') {
      reasons.add(`role:${role}`);
    }
  }
  return [...reasons];
}

/**
 * Shared owner policy used by both planning and the live release executor.
 * An owner is evictable only when it is explicitly a cache/warmth owner (or has no role) and has
 * no active presentation/request protection. Unknown non-empty roles stay pinned by default.
 */
export function isGovernorOwnerEvictable(owner = {}) {
  if (owner == null) return true;
  if (ownerBlockReasons(owner).length > 0) return false;
  const roles = roleList(owner).map(normalizedToken);
  if (roles.length === 0) return true;
  return roles.every((role) => GOVERNOR_EVICTABLE_ROLES.has(role));
}

function entryRoles(entry = {}) {
  return roleList(entry).map(normalizedToken);
}

function tierPriority(entry = {}) {
  const tiers = tierList(entry);
  let best = null;
  for (const tier of tiers) {
    const rank = GOVERNOR_PRESENTATION_PRIORITY[String(tier).trim().toUpperCase()];
    if (Number.isInteger(rank) && (best == null || rank < best)) best = rank;
  }
  return best;
}

/** Return stable owner/request reasons for an entry that cannot be released. */
export function governorEntryBlockReasons(entry = {}) {
  const reasons = new Set();
  if (activeRequest(entry)) reasons.add('in-flight-request');
  for (const reason of ownerBlockReasons(entry)) reasons.add(reason);
  const records = ownerRecords(entry);
  if (records != null) {
    const blocked = records.flatMap((owner) => ownerBlockReasons(owner));
    for (const reason of blocked) reasons.add(reason);
    const hasProtectedOwner = records.some((owner) => !isGovernorOwnerEvictable(owner));
    const hasEvictableOwner = records.some((owner) => isGovernorOwnerEvictable(owner));
    if (hasProtectedOwner && hasEvictableOwner) reasons.add('mixed-protected-owner');
    // A registered asset can be ownerless between decode and its first retained boundary. That is
    // a cache candidate, not a mixed/protected asset, provided no decode is active.
    if (records.length === 0 && activeRequest(entry)) reasons.add('in-flight-request');
  } else {
    const tiers = tierList(entry).map((tier) => String(tier).trim().toUpperCase());
    if (tiers.includes('R0_GLASS')) reasons.add('R0_GLASS');
    if (tiers.includes('R1_RUNWAY')) reasons.add('R1_RUNWAY');
  }
  return [...reasons];
}

export function isGovernorEntryEvictable(entry = {}) {
  if (activeRequest(entry)) return false;
  if (ownerBlockReasons(entry).length > 0) return false;
  const records = ownerRecords(entry);
  if (records != null) return records.every((owner) => isGovernorOwnerEvictable(owner));
  return governorEntryBlockReasons(entry).length === 0
    && entryRoles(entry).every((role) => GOVERNOR_EVICTABLE_ROLES.has(role) || role === '')
    && tierPriority(entry) !== GOVERNOR_PRESENTATION_PRIORITY.R0_GLASS
    && tierPriority(entry) !== GOVERNOR_PRESENTATION_PRIORITY.R1_RUNWAY;
}

export function evictionPriority(entry = {}) {
  const roles = Array.isArray(entry.roles) ? entry.roles : [entry.role];
  let best = GOVERNOR_ROLE_PRIORITY.unused;
  for (const role of roles) {
    const rank = GOVERNOR_ROLE_PRIORITY[role];
    if (Number.isInteger(rank) && rank < best) best = rank;
  }
  const tier = tierPriority(entry);
  if (Number.isInteger(tier)) best = Math.min(best, tier);
  return best;
}

export function compareEvictionOrder(a, b) {
  const pa = evictionPriority(a);
  const pb = evictionPriority(b);
  if (pa !== pb) return pb - pa; // higher rank number evicts first
  const ba = numericBytes(a, a.kind || 'gpu');
  const bb = numericBytes(b, b.kind || 'gpu');
  if (ba !== bb) return bb - ba;
  return String(a.key || '').localeCompare(String(b.key || ''));
}

export function selectEvictions(entries, options = {}) {
  const maxBytes = Number(options.maxBytes);
  const budget = Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : Number.POSITIVE_INFINITY;
  const kind = options.kind === 'cpu' ? 'cpu' : 'gpu';
  const list = (entries || []).map((entry) => ({
    ...entry,
    kind,
    bytes: numericBytes(entry, kind),
  }));
  let summedEntryBytes = 0;
  for (const entry of list) summedEntryBytes += Number(entry.bytes) || 0;
  const memoryUnitOwners = buildMemoryUnitOwners(list, kind);
  const initialResidentBytes = Number.isFinite(Number(options.initialResidentBytes))
    ? Math.max(0, Number(options.initialResidentBytes))
    : residentBytesFromMemoryUnits(memoryUnitOwners, summedEntryBytes);
  let total = initialResidentBytes;
  const blockedBytesByRole = {};
  const blockedBytesByReason = {};
  for (const entry of list) {
    if (isGovernorEntryEvictable(entry)) continue;
    const bytes = numericBytes(entry, kind);
    const reasons = governorEntryBlockReasons(entry);
    const fallback = reasons.length > 0 ? reasons : ['protected'];
    for (const reason of fallback) {
      const role = reason.startsWith('role:') ? reason.slice(5) : reason;
      blockedBytesByRole[role] = (blockedBytesByRole[role] || 0) + bytes;
      blockedBytesByReason[reason] = (blockedBytesByReason[reason] || 0) + bytes;
    }
  }
  const freezeBreakdown = (value) => Object.freeze({ ...value });
  if (total <= budget) {
    return Object.freeze({
      overBudget: false,
      residentBytes: total,
      initialResidentBytes,
      remainingBytes: total,
      evictedBytes: 0,
      plannedEvictedBytes: 0,
      budgetBytes: budget,
      budgetSatisfied: true,
      protectedShortfallBytes: 0,
      kind,
      blockedBytesByRole: freezeBreakdown(blockedBytesByRole),
      blockedBytesByReason: freezeBreakdown(blockedBytesByReason),
      evict: Object.freeze([]),
    });
  }
  const ordered = [...list].sort(compareEvictionOrder);
  const evict = [];
  const selectedIndexes = new Set();
  const entryIndexes = new Map(list.map((entry, index) => [entry, index]));
  for (const entry of ordered) {
    if (!isGovernorEntryEvictable(entry)) continue;
    evict.push(entry.key);
    selectedIndexes.add(entryIndexes.get(entry));
    if (memoryUnitOwners) {
      total = initialResidentBytes - freedBytesForSelection(memoryUnitOwners, selectedIndexes);
    } else {
      total -= numericBytes(entry, kind);
    }
    if (total <= budget) break;
  }
  return Object.freeze({
    overBudget: total > budget,
    residentBytes: total,
    initialResidentBytes,
    remainingBytes: total,
    evictedBytes: initialResidentBytes - total,
    plannedEvictedBytes: initialResidentBytes - total,
    budgetBytes: budget,
    budgetSatisfied: total <= budget,
    protectedShortfallBytes: total > budget ? total - budget : 0,
    kind,
    blockedBytesByRole: freezeBreakdown(blockedBytesByRole),
    blockedBytesByReason: freezeBreakdown(blockedBytesByReason),
    evict: Object.freeze(evict),
  });
}

export function createResourceGovernor(options = {}) {
  const maxCpuBytes = Number(options.maxCpuBytes) > 0 ? Number(options.maxCpuBytes) : 512 * 1024 * 1024;
  const maxGpuBytes = Number(options.maxGpuBytes) > 0 ? Number(options.maxGpuBytes) : 384 * 1024 * 1024;
  let lastPlan = null;

  return {
    plan(entries, kind = 'gpu', options = {}) {
      const maxBytes = kind === 'cpu' ? maxCpuBytes : maxGpuBytes;
      lastPlan = selectEvictions(entries, { ...options, maxBytes, kind });
      return lastPlan;
    },
    get lastPlan() { return lastPlan; },
    get maxCpuBytes() { return maxCpuBytes; },
    get maxGpuBytes() { return maxGpuBytes; },
  };
}
