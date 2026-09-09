// Deterministic player-wing command contract. Pure data/helpers: no game-state authority.

export const WING_ORDER = Object.freeze({
  ATTACK: 'attack',
  SCREEN: 'screen',
  HOLD: 'hold',
  REGROUP: 'regroup',
});

export const WING_ORDER_SCOPE = Object.freeze({
  ALL: 'all',
  SELECTED: 'selected',
});

export const WING_ORDER_LIMITS = Object.freeze({
  attackLeashWu: 1800,
  screenArcWu: 180,
  holdRadiusWu: 40,
  regroupRadiusWu: 80,
});

const ORDER_VALUES = new Set(Object.values(WING_ORDER));
const SCOPE_VALUES = new Set(Object.values(WING_ORDER_SCOPE));

export function makeWingOrderCommand(input = {}) {
  const order = normalizeWingOrderKind(input.order);
  const scope = SCOPE_VALUES.has(String(input.scope)) ? String(input.scope) : WING_ORDER_SCOPE.ALL;
  const issuedTick = Math.max(0, Number.isInteger(input.issuedTick) ? input.issuedTick : 0);
  const sequence = Math.max(1, Number.isInteger(input.sequence) ? input.sequence : 1);
  const seed = (Number(input.seed) >>> 0) || 1;
  return Object.freeze({
    id: `wing:${seed.toString(16)}:${issuedTick}:${sequence}`,
    order,
    scope,
    selectedWingmanId: input.selectedWingmanId == null ? null : input.selectedWingmanId,
    targetId: input.targetId == null ? null : input.targetId,
    issuedTick,
    sequence,
  });
}

export function normalizeWingOrderKind(value, fallback = WING_ORDER.REGROUP) {
  const text = String(value || '');
  if (ORDER_VALUES.has(text)) return text;
  if (text === 'guard' || text === 'escort') return WING_ORDER.SCREEN;
  if (text === 'idle' || text === 'recall') return WING_ORDER.REGROUP;
  return fallback;
}

export function makeRecipientWingOrder(command, options = {}) {
  const kind = normalizeWingOrderKind(command && command.order);
  const anchor = point(options.anchor);
  const sectorId = options.sectorId == null ? null : String(options.sectorId);
  return Object.freeze({
    kind,
    commandId: command && command.id || null,
    targetId: kind === WING_ORDER.ATTACK && command && command.targetId != null ? command.targetId : null,
    anchor: kind === WING_ORDER.HOLD ? anchor : null,
    sectorId: kind === WING_ORDER.HOLD ? sectorId : null,
    issuedTick: Math.max(0, Number.isInteger(command && command.issuedTick) ? command.issuedTick : 0),
  });
}

export function normalizeLiveWingOrder(value, currentSectorId = null, legacyOrder = null) {
  const source = value && typeof value === 'object' ? value : {};
  const kind = normalizeWingOrderKind(source.kind || legacyOrder, WING_ORDER.SCREEN);
  const normalized = {
    kind,
    commandId: source.commandId == null ? null : String(source.commandId),
    targetId: kind === WING_ORDER.ATTACK && source.targetId != null ? source.targetId : null,
    anchor: kind === WING_ORDER.HOLD ? point(source.anchor) : null,
    sectorId: kind === WING_ORDER.HOLD
      ? (source.sectorId == null ? (currentSectorId == null ? null : String(currentSectorId)) : String(source.sectorId))
      : null,
    issuedTick: Math.max(0, Number.isInteger(source.issuedTick) ? source.issuedTick : 0),
  };
  if (kind === WING_ORDER.HOLD && !normalized.anchor) return regroupFrom(normalized);
  return Object.freeze(normalized);
}

export function normalizePersistedWingOrder(value, currentSectorId = null, legacyOrder = null) {
  const source = value && typeof value === 'object' ? value : {};
  const sourceKind = normalizeWingOrderKind(source.kind || legacyOrder, WING_ORDER.SCREEN);
  if (sourceKind === WING_ORDER.HOLD
    && (typeof source.sectorId !== 'string' || !source.sectorId.trim())) {
    return regroupFrom(source);
  }
  const live = normalizeLiveWingOrder(value, currentSectorId, legacyOrder);
  if (live.kind === WING_ORDER.ATTACK) return regroupFrom(live);
  if (live.kind === WING_ORDER.HOLD
    && (currentSectorId == null || live.sectorId !== String(currentSectorId))) {
    return regroupFrom(live);
  }
  return live;
}

export function wingOrderActivity(orderValue, options = {}) {
  const order = normalizeLiveWingOrder(orderValue, options.sectorId);
  const playerPos = point(options.playerPos) || Object.freeze({ x: 0, z: 0 });
  const recipientIndex = Math.max(0, Number.isInteger(options.recipientIndex) ? options.recipientIndex : 0);
  const recipientCount = Math.max(1, Number.isInteger(options.recipientCount) ? options.recipientCount : 1);
  if (order.kind === WING_ORDER.ATTACK) {
    return Object.freeze({
      kind: 'attack_run', reason: 'wing_order:attack', anchor: playerPos,
      leashRadius: WING_ORDER_LIMITS.attackLeashWu, preferredRange: 180,
      targetId: order.targetId, startedTick: order.issuedTick,
    });
  }
  if (order.kind === WING_ORDER.HOLD) {
    return Object.freeze({
      kind: 'hail_hold', reason: 'wing_order:hold', anchor: order.anchor,
      leashRadius: WING_ORDER_LIMITS.holdRadiusWu, preferredRange: WING_ORDER_LIMITS.holdRadiusWu,
      targetId: null, startedTick: order.issuedTick,
    });
  }
  const radius = order.kind === WING_ORDER.SCREEN
    ? WING_ORDER_LIMITS.screenArcWu : WING_ORDER_LIMITS.regroupRadiusWu;
  const angle = -Math.PI / 2 + recipientIndex * Math.PI * 2 / recipientCount;
  const anchor = Object.freeze({
    x: playerPos.x + Math.cos(angle) * radius,
    z: playerPos.z + Math.sin(angle) * radius,
  });
  return Object.freeze({
    kind: order.kind === WING_ORDER.SCREEN ? 'screen' : 'return_to_anchor',
    reason: `wing_order:${order.kind}`,
    anchor,
    leashRadius: radius,
    preferredRange: radius,
    targetId: null,
    startedTick: order.issuedTick,
  });
}

export function legacyFleetOrderFor(kindValue) {
  const kind = normalizeWingOrderKind(kindValue);
  if (kind === WING_ORDER.ATTACK) return 'attack';
  if (kind === WING_ORDER.SCREEN) return 'guard';
  if (kind === WING_ORDER.HOLD) return 'idle';
  return 'escort';
}

function regroupFrom(source) {
  return Object.freeze({
    kind: WING_ORDER.REGROUP,
    commandId: source.commandId == null ? null : String(source.commandId),
    targetId: null,
    anchor: null,
    sectorId: null,
    issuedTick: Math.max(0, Number.isInteger(source.issuedTick) ? source.issuedTick : 0),
  });
}

function point(value) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.z)) return null;
  return Object.freeze({ x: Number(value.x), z: Number(value.z) });
}
