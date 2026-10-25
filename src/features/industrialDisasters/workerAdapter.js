import { laneBusEmit, laneCommandSink } from '../../core/simLaneCommands.js';
import { SITE, SCENARIO_IDS, getScenario } from './scenarios.js';

export const INDUSTRIAL_PRESENTATION_WIRE_VERSION = 1;
const MAX_BODIES = 12;
const MAX_EVENTS = 5;
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const text = (s, max = 600) => typeof s === 'string' ? s.slice(0, max) : '';
const cycleOf = (n) => Math.max(0, Math.min(1000000, Math.floor(finite(n))));
const rows = (value, limit) => Array.isArray(value) ? value.slice(0, limit) : [];
const counts = (value) => ({ total: finite(value?.total), saved: finite(value?.saved),
  lost: finite(value?.lost), recovered: finite(value?.recovered), recoverable: finite(value?.recoverable) });
const actions = new Set(['inspect', 'accept', 'decline', 'cancel', 'resume', 'finalize', 'next', 'drill', 'replay', 'finishDrill', 'markSite']);

/** One narrow request port in both modes. Direct laneBusEmit avoids the generated main-bus
 * census silently dropping a new feature event, and avoids forwarding a local decision twice. */
export function sendIndustrialDisasterRequest(bus, type, input = {}) {
  let payload;
  if (input.siteId && input.siteId !== SITE.id) return false;
  if (type === 'industrialDisasters:command') {
    if (!actions.has(input.action)) return false;
    if (input.scenarioId != null && !SCENARIO_IDS.includes(input.scenarioId)) return false;
    payload = { action: input.action, siteId: SITE.id, source: text(input.source || 'promptDeck', 40) };
    if (input.scenarioId) payload.scenarioId = input.scenarioId;
  } else if (type === 'industrialDisasters:requirePresentation') {
    if (input.required !== true) return false;
    payload = { siteId: SITE.id, required: true };
  } else if (type === 'industrialDisasters:presentationReady') {
    if (!Number.isInteger(input.cycle) || input.cycle < 0 || typeof input.ready !== 'boolean') return false;
    payload = { siteId: SITE.id, cycle: cycleOf(input.cycle), ready: input.ready, epoch: cycleOf(input.epoch) };
  } else return false;
  if (laneBusEmit(type, payload)) return true;
  if (!bus?.emit) return false;
  bus.emit(type, payload);
  return true;
}

/** Status uses shallow scalar rows: the existing depth-four event bridge otherwise treats a
 * numeric id + alive as an entity reference and drops deep aftermath history. No sim object,
 * Map, native handle, rendering object, save root or action closure crosses this seam. */
export function encodeIndustrialDisasterStatus(model = {}, state = null) {
  return {
    industrialWireVersion: INDUSTRIAL_PRESENTATION_WIRE_VERSION,
    siteId: SITE.id, sectorId: SITE.sectorId, title: text(model.title || SITE.label),
    phase: text(model.phase, 24), scenarioId: SCENARIO_IDS.includes(model.scenarioId) ? model.scenarioId : 'drift',
    cycle: cycleOf(model.cycle), attempt: cycleOf(model.attempt),
    presentationEpoch: cycleOf(model.presentationEpoch),
    discovered: model.discovered === true, inspected: model.inspected === true,
    near: model.near === true, hidden: model.hidden === true, drill: model.drill === true,
    hasNext: model.hasNext !== false, severity: finite(model.severity),
    ready: model.ready !== false, hint: text(model.hint), summary: text(model.summary), statusLine: text(model.statusLine),
    anchorX: finite(model.anchor?.x, SITE.anchor.x), anchorZ: finite(model.anchor?.z, SITE.anchor.z),
    radius: finite(model.radius, SITE.radius), safeX: finite(model.safeBerth?.x, SITE.anchor.x + SITE.safeBerth.x),
    safeZ: finite(model.safeBerth?.z, SITE.anchor.z + SITE.safeBerth.z), safeRadius: finite(model.safeRadius, SITE.safeRadius),
    people: counts(model.people), equipment: counts(model.equipment), cargo: counts(model.cargo),
    bodyRows: rows(model.bodies, MAX_BODIES).map((body) => ({
      entityId: body.id ?? body.entityId, role: text(body.role, 40), placeId: text(body.placeId, 100),
      x: finite(body.pos?.x), z: finite(body.pos?.z), radius: finite(body.radius),
      hull: finite(body.hull), live: body.alive !== false, status: text(body.status, 30), label: text(body.label, 100),
    })),
    hazardRows: rows(model.hazards, MAX_BODIES).map((h) => ({ role: text(h.role, 40),
      x: finite(h.pos?.x), z: finite(h.pos?.z), radius: finite(h.radius), intensity: finite(h.intensity) })),
    pathRows: rows(model.paths, 8).map((p) => ({ ax: finite(p.from?.x), az: finite(p.from?.z),
      bx: finite(p.to?.x), bz: finite(p.to?.z), blocked: p.blocked === true,
      halfWidth: finite(p.halfWidth, 9), kind: text(p.kind, 30) })),
    connectionRows: rows(model.connections, 8).map((p) => ({ fromRole: text(p.fromRole, 40), toRole: text(p.toRole, 40),
      ax: finite(p.from?.x), az: finite(p.from?.z), bx: finite(p.to?.x), bz: finite(p.to?.z), connected: p.connected === true })),
    historyRows: rows(model.history, 3).map((h) => ({ scenarioId: text(h.scenarioId, 30), cycle: cycleOf(h.cycle),
      summary: text(h.summary), amount: finite(h.amount), peopleSaved: finite(h.people?.saved), peopleLost: finite(h.people?.lost),
      equipmentSaved: finite(h.equipment?.saved), equipmentLost: finite(h.equipment?.lost),
      cargoSaved: finite(h.cargo?.saved), cargoLost: finite(h.cargo?.lost) })),
    eventRows: rows(model.events, MAX_EVENTS).map((event) => ({ id: text(String(event.id ?? ''), 80),
      text: text(event.text), kind: text(event.kind, 20), role: text(event.role, 40), at: finite(event.at) })),
  };
}

export function decodeIndustrialDisasterStatus(wire) {
  if (!wire || typeof wire !== 'object') return null;
  if (Object.hasOwn(wire, 'industrialWireVersion') && wire.industrialWireVersion !== INDUSTRIAL_PRESENTATION_WIRE_VERSION) return null;
  if (wire.industrialWireVersion !== INDUSTRIAL_PRESENTATION_WIRE_VERSION) return wire;
  if (wire.siteId !== SITE.id || !SCENARIO_IDS.includes(wire.scenarioId)) return null;
  return { ...wire, label: wire.title, anchor: { x: wire.anchorX, z: wire.anchorZ },
    safeBerth: { x: wire.safeX, z: wire.safeZ },
    bodies: rows(wire.bodyRows, MAX_BODIES).filter((b) => Number.isSafeInteger(b.entityId)).map((b) => ({
      id: b.entityId, role: b.role, placeId: b.placeId, pos: { x: b.x, z: b.z }, radius: b.radius,
      hull: b.hull, alive: b.live, status: b.status, label: b.label,
    })),
    hazards: rows(wire.hazardRows, MAX_BODIES).map((h) => ({ ...h, pos: { x: h.x, z: h.z } })),
    paths: rows(wire.pathRows, 8).map((p) => ({ from: { x: p.ax, z: p.az }, to: { x: p.bx, z: p.bz },
      blocked: p.blocked, halfWidth: p.halfWidth, kind: p.kind })),
    connections: rows(wire.connectionRows, 8).map((p) => ({ fromRole: p.fromRole, toRole: p.toRole,
      from: { x: p.ax, z: p.az }, to: { x: p.bx, z: p.bz }, connected: p.connected })),
    history: rows(wire.historyRows, 3).map((h) => ({ scenarioId: h.scenarioId, cycle: h.cycle, summary: h.summary, amount: h.amount,
      people: { saved: h.peopleSaved, lost: h.peopleLost }, equipment: { saved: h.equipmentSaved, lost: h.equipmentLost },
      cargo: { saved: h.cargoSaved, lost: h.cargoLost } })),
    events: rows(wire.eventRows, MAX_EVENTS),
  };
}

/** Call once after each authoritative fixed step, and once with {} on suspension/disposal.
 * _noMesh native bodies deliberately bypass the ordinary mesh journal. This small packet
 * transports their exact identities and poses; main never integrates or predicts their physics. */
export function publishIndustrialDisasterPoses({ state, bus, bodies = {}, cycle = 0, scenarioId = null } = {}) {
  if (!bus?.emit) return;
  const bodyRows = Object.entries(bodies).slice(0, MAX_BODIES).filter(([, b]) => b && b.alive !== false).map(([role, b]) => ({
    entityId: b.id, role, scenarioId: b.data?.industrialDisasterScenario,
    cycle: cycleOf(b.data?.industrialDisasterCycle ?? cycle),
    worldRecordId: text(b.data?.worldRecordId, 160), placeId: text(b.data?.placeId, 100),
    life: Number.isSafeInteger(b.occupantGeneration) ? b.occupantGeneration : null,
    x: finite(b.pos?.x), y: finite(b.pos?.y), z: finite(b.pos?.z),
    prevX: finite(b.prevPos?.x, finite(b.pos?.x)), prevY: finite(b.prevPos?.y, finite(b.pos?.y)),
    prevZ: finite(b.prevPos?.z, finite(b.pos?.z)), vx: finite(b.vel?.x), vz: finite(b.vel?.z),
    rot: finite(b.rot), prevRot: finite(b.prevRot, finite(b.rot)), angVel: finite(b.angVel),
    radius: finite(b.radius), mass: finite(b.mass), hull: finite(b.hull), hullMax: finite(b.hullMax),
    collides: b.collides !== false, status: text(b.data?.industrialDisasterStatus, 30),
    label: text(b.data?.scanLabel || b.data?.name || role, 100),
  }));
  bus.emit('industrialDisasters:poses', { industrialWireVersion: INDUSTRIAL_PRESENTATION_WIRE_VERSION,
    siteId: SITE.id, cycle: cycleOf(cycle), scenarioId: scenarioId || bodyRows[0]?.scenarioId || null,
    tick: Math.max(0, Math.floor(finite(state?.tick))), simTime: finite(state?.simTime),
    presentationEpoch: cycleOf(state?.industrialDisastersAdmissionEpoch), bodyRows });
}

/** Main-realm facade adapter only. In main-sim mode it is read-only and never copies bodies.
 * Worker copies retain numeric native IDs and durable role identities. They cannot mint native
 * entities or submit motion, and are excluded from the ordinary mesh collector with _noMesh. */
export function installIndustrialDisasterWorkerView({ state, bus } = {}) {
  const owned = new Map();
  let model = null, disposed = false, requiredSink = undefined, lastTick = -1, lastEpoch = -1;
  function indexFacade(entity, add) {
    // Only main-realm read arrays used by Tab/scanner are extended. Native physics/spatial
    // indices and their membership tokens are never manufactured on the presentation lane.
    const list = state?.entityList;
    if (Array.isArray(list)) {
      const at = list.indexOf(entity);
      if (add && at < 0) list.push(entity);
      else if (!add && at >= 0) list.splice(at, 1);
    }
    const index = state?.entityIndex;
    if (!index?.__spacefaceEntityIndexV1 || index.ready !== true) return;
    let changed = false;
    for (const key of ['payloads', 'movables', 'damageables', 'radarContacts']) {
      const lane = index[key];
      if (!Array.isArray(lane)) continue;
      const at = lane.indexOf(entity);
      if (add && at < 0) { lane.push(entity); changed = true; }
      else if (!add && at >= 0) { lane.splice(at, 1); changed = true; }
    }
    const key = entity.data.worldRecordId;
    if (index.byWorldRecordId instanceof Map) {
      if (add && !index.byWorldRecordId.has(key)) {
        index.byWorldRecordId.set(key, entity); index.byWorldRecordIdCount?.set?.(key, 1); changed = true;
      } else if (!add && index.byWorldRecordId.get(key) === entity) {
        index.byWorldRecordId.delete(key); index.byWorldRecordIdCount?.delete?.(key); changed = true;
      }
    }
    if (changed) {
      index.version = finite(index.version) + 1;
      if (index.laneVersions) {
        index.laneVersions.payloads = finite(index.laneVersions.payloads) + 1;
        index.laneVersions.worldRecordIds = finite(index.laneVersions.worldRecordIds) + 1;
      }
    }
  }
  function clear() {
    for (const [id, entity] of owned) {
      entity.alive = false;
      indexFacade(entity, false);
      if (state?.entities?.get(id) === entity) state.entities.delete(id);
    }
    owned.clear(); model = null; lastTick = -1; lastEpoch = -1;
  }
  function ensurePresentationRequired() {
    const sink = laneCommandSink();
    if (sink === requiredSink) return;
    requiredSink = sink;
    sendIndustrialDisasterRequest(bus, 'industrialDisasters:requirePresentation', { required: true });
  }
  function status(wire) {
    const next = decodeIndustrialDisasterStatus(wire);
    if (!next || (model && finite(next.presentationEpoch) < finite(model.presentationEpoch))) return;
    if (laneCommandSink() && finite(next.presentationEpoch) < lastEpoch) return;
    model = next;
  }
  function poses(packet) {
    if (disposed || !laneCommandSink() || !state?.entities?.set) return;
    if (packet?.industrialWireVersion !== INDUSTRIAL_PRESENTATION_WIRE_VERSION || packet.siteId !== SITE.id) return;
    if (packet.presentationEpoch < lastEpoch || (packet.presentationEpoch === lastEpoch && packet.tick < lastTick)) return;
    lastEpoch = packet.presentationEpoch; lastTick = packet.tick;
    const wanted = new Set();
    for (const p of rows(packet.bodyRows, MAX_BODIES)) {
      if (!Number.isSafeInteger(p.entityId) || p.entityId < 0 || !SCENARIO_IDS.includes(p.scenarioId)) continue;
      const spec = getScenario(p.scenarioId).bodies.find((body) => body.role === p.role);
      const identity = `${SITE.id}/${p.scenarioId}/${cycleOf(p.cycle)}/${p.role}`;
      if (!spec || p.placeId !== spec.assetId || p.worldRecordId !== identity) continue;
      if (![p.x, p.z, p.prevX, p.prevZ, p.vx, p.vz, p.rot, p.radius].every(Number.isFinite)) continue;
      const existing = state.entities.get(p.entityId);
      let entity = owned.get(p.entityId);
      if (existing && existing !== entity) {
        // A normal journal birth can reuse this numeric slot. Retire only our stale read copy;
        // a late feature packet may never overwrite the other owner's current occupant.
        if (entity) { entity.alive = false; indexFacade(entity, false); owned.delete(p.entityId); }
        continue;
      }
      if (entity && (entity.data.worldRecordId !== identity || entity.occupantGeneration !== p.life)) {
        entity.alive = false; indexFacade(entity, false);
        state.entities.delete(p.entityId); owned.delete(p.entityId); entity = null;
      }
      if (!entity) {
        entity = { id: p.entityId, type: 'payload', alive: true, _noMesh: true, pos: {}, prevPos: {}, vel: {},
          presentationAdmission: 'pending', occupantGeneration: p.life,
          flags: { missionPinned: true, masslineTetherable: true },
          data: { worldRecordId: identity, worldObjectId: identity, presentationOwnerWorldRecordId: identity,
            industrialDisasterSiteId: SITE.id, industrialDisasterRole: p.role, industrialDisasterScenario: p.scenarioId,
            industrialDisasterCycle: p.cycle, persistenceOwner: 'industrialDisasters',
            placeId: spec.assetId, placeTargetRadius: spec.radius, visualRadius: spec.radius,
            worldOneOff: true, worldSiteTargetable: true, masslineTetherable: true,
            sectorId: SITE.sectorId, homeSectorId: SITE.sectorId, salvagePool: {}, authoredSalvagePool: {} } };
        owned.set(p.entityId, entity); state.entities.set(p.entityId, entity);
      }
      // A full ordinary journal rebuild omits intentionally _noMesh bodies and removes their
      // facade map slots. The next native pose re-publishes the SAME owned read object, keeping
      // captured authored admissions alive instead of stranding them on an orphaned copy.
      if (!state.entities.has(p.entityId)) state.entities.set(p.entityId, entity);
      wanted.add(p.entityId);
      Object.assign(entity.pos, { x: p.x, y: p.y, z: p.z });
      Object.assign(entity.prevPos, { x: p.prevX, y: p.prevY, z: p.prevZ });
      Object.assign(entity.vel, { x: p.vx, z: p.vz });
      Object.assign(entity, { rot: p.rot, prevRot: p.prevRot, angVel: p.angVel, radius: p.radius,
        mass: p.mass, hull: p.hull, hullMax: p.hullMax, collides: p.collides, alive: true,
        factionId: SITE.factionId });
      Object.assign(entity.data, { name: p.label, scanLabel: p.label, industrialDisasterStatus: p.status });
      indexFacade(entity, true);
    }
    for (const [id, entity] of owned) if (!wanted.has(id)) {
      entity.alive = false;
      indexFacade(entity, false);
      if (state.entities.get(id) === entity) state.entities.delete(id);
      owned.delete(id);
    }
  }
  bus?.on?.('industrialDisasters:status', status);
  bus?.on?.('industrialDisasters:poses', poses);
  bus?.on?.('sector:exit', clear);
  bus?.on?.('save:loaded', clear);
  bus?.on?.('game:new', clear);
  bus?.on?.('game:newGame', clear);
  ensurePresentationRequired();
  return {
    update: ensurePresentationRequired,
    readModel: () => model,
    isWorker: () => !!laneCommandSink(),
    diagnostics: () => ({ mirroredBodies: owned.size, tick: lastTick }),
    dispose() {
      if (disposed) return;
      clear(); disposed = true;
      bus?.off?.('industrialDisasters:status', status);
      bus?.off?.('industrialDisasters:poses', poses);
      bus?.off?.('sector:exit', clear);
      bus?.off?.('save:loaded', clear);
      bus?.off?.('game:new', clear);
      bus?.off?.('game:newGame', clear);
    },
  };
}
