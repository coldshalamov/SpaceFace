import { SWARM_FORTIFY_DEVICES } from './swarmFortify.js';

// Explicit bounded DTOs for the paused builder. The generic event bridge deliberately refuses
// deeply nested payloads; this adapter sends only presentation facts, never the run ledger,
// entity objects, native bodies, callbacks or mutable Maps.
const number = value => Number.isFinite(value) ? value : null;
const text = value => typeof value === 'string' ? value.slice(0, 160) : null;
const id = value => Number.isSafeInteger(value) ? value : text(value);
const list = (value, cap) => Array.isArray(value) ? value.slice(0, cap) : [];
const point = value => Number.isFinite(value?.x) && Number.isFinite(value?.z)
  ? { x: value.x, z: value.z } : null;
const pose = value => {
  const p = point(value);
  return p ? { ...p, rotation: number(value.rotation) || 0 } : null;
};
const positions = value => list(value, 2).map(point).filter(Boolean);

export function projectSwarmFortifyView(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  return {
    requestId: id(raw.requestId), runToken: id(raw.runToken), phase: text(raw.phase),
    wave: number(raw.wave), credits: number(raw.credits), fortified: raw.fortified === true,
    player: pose(raw.player), arena: pose(raw.arena),
    sockets: list(raw.sockets, 6).map(slot => ({
      id: id(slot.id), label: text(slot.label), x: number(slot.x), z: number(slot.z),
      occupied: slot.occupied === true, blocked: slot.blocked === true,
      devices: Object.fromEntries(Object.keys(SWARM_FORTIFY_DEVICES).flatMap(deviceId => {
        const device = slot.devices?.[deviceId];
        return device ? [[deviceId, { blocked: device.blocked === true, reason: text(device.reason),
          positions: positions(device.positions) }]] : [];
      })),
    })),
    structures: list(raw.structures, 6).map(row => ({
      id: id(row.id), entityId: id(row.entityId), requestId: id(row.requestId),
      deviceId: text(row.deviceId), socketId: text(row.socketId),
      entityIds: list(row.entityIds, 2).map(id), positions: positions(row.positions),
      hull: number(row.hull), hullMax: number(row.hullMax), heat: number(row.heat), ammo: number(row.ammo),
      operational: row.operational === true, repairCost: number(row.repairCost),
      ammoMax: number(row.ammoMax), serviceCostPerRound: number(row.serviceCostPerRound),
      serviceCost: number(row.serviceCost),
    })),
    terrain: list(raw.terrain, 48).map(body => ({
      id: id(body.id), type: text(body.type), x: number(body.x), z: number(body.z), radius: number(body.radius),
    })),
  };
}

export function projectSwarmFortifyReceipt(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  return {
    requestId: id(raw.requestId), runToken: id(raw.runToken),
    accepted: raw.accepted === true, reason: text(raw.reason),
    credits: number(raw.credits), totalCredits: number(raw.totalCredits),
    repaired: raw.repaired === true, serviced: raw.serviced === true, modeActivated: raw.modeActivated === true,
    deviceId: text(raw.deviceId), socketId: text(raw.socketId), entityId: id(raw.entityId),
    structureId: id(raw.structureId), structureIds: list(raw.structureIds, 2).map(id),
    readModel: projectSwarmFortifyView(raw.readModel),
  };
}

export const SWARM_FORTIFY_EVENT_BRIDGE_ADAPTERS = Object.freeze({
  'swarm:fortifyState': projectSwarmFortifyView,
  'swarm:fortifyBuildResolved': projectSwarmFortifyReceipt,
});
