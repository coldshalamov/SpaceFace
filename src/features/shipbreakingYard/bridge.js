/** Bounded primitive projection for the existing worker→main event bridge.
 * Only this event exceeds its generic depth limit. Never raise the shared depth limit
 * or send the authoritative ledger, entities, closures, native bodies, or Maps. */
const text = (value, max = 160) => typeof value === 'string' ? value.slice(0, max) : null;
const number = (value, fallback = 0, cap = 1e8) => Number.isFinite(value)
  ? Math.max(-cap, Math.min(cap, value)) : fallback;
const point = value => value && Number.isFinite(value.x) && Number.isFinite(value.z)
  ? { x: number(value.x), z: number(value.z) } : null;
const list = (value, limit) => Array.isArray(value) ? value.slice(0, limit) : [];
const entityId = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const partStatus = value => ['attached', 'free', 'delivered', 'lost'].includes(value) ? value : 'lost';
const linkStatus = value => ['connected', 'released', 'broken'].includes(value) ? value : 'broken';

export function projectShipbreakingYardView(raw) {
  const visible = raw?.visible === true;
  const receiverPos = point(raw?.receiver?.pos || raw?.receiver);
  return {
    visible,
    revision: Math.max(0, Math.floor(number(raw?.revision, 0, Number.MAX_SAFE_INTEGER))),
    anchor: point(raw?.anchor),
    receiver: receiverPos ? {
      ...receiverPos, pos: receiverPos, radius: Math.max(0, number(raw.receiver.radius, 38, 1000)),
      maxSpeed: Math.max(0, number(raw.receiver.maxSpeed, 7, 1000)), stationId: text(raw.receiver.stationId),
    } : null,
    selectedModuleId: text(raw?.selectedModuleId, 64), selectedJobId: text(raw?.selectedJobId, 100),
    selectedEntityId: entityId(raw?.selectedEntityId),
    jobs: visible ? list(raw?.jobs, 3).filter(job => job && typeof job.id === 'string').map(job => ({
      id: text(job.id, 100), title: text(job.title), status: text(job.status, 20),
      modules: list(job.modules, 6).filter(module => module && typeof module.id === 'string').map(module => ({
        id: text(module.id, 64), jobId: text(module.jobId, 100), entityId: entityId(module.entityId),
        label: text(module.label), condition: Math.max(0, Math.min(1, number(module.condition))),
        status: partStatus(module.status), valueCr: Math.max(0, Math.floor(number(module.valueCr, 0, 1e6))),
        pos: point(module.pos), radius: Math.max(0, number(module.radius, 0, 1000)),
        fragile: module.fragile === true, hazardous: module.hazardous === true,
      })),
      couplings: list(job.couplings, 6).filter(link => link && typeof link.id === 'string').map(link => ({
        id: text(link.id, 64), a: text(link.a, 64), b: text(link.b, 64), status: linkStatus(link.status),
        posA: point(link.posA), posB: point(link.posB), safe: link.safe === true,
        strained: link.strained === true, reason: text(link.reason, 320),
      })),
    })) : [],
  };
}

/** Spread into scripts/lib/simEventBridge.mjs EVENT_BRIDGE_ADAPTERS. */
export const SHIPBREAKING_YARD_EVENT_BRIDGE_ADAPTERS = Object.freeze({
  'shipbreakingYard:view': projectShipbreakingYardView,
});
