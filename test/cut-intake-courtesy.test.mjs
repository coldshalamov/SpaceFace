// Focused owner integration. Stations/approach positions are staged at construction.
// Native witnesses use real ship hardware, Flight V3 and Rapier, not direct pose writes.
// Body Save/Continue reinstates only the identical static station fixture: no world system
// runs here, so this is not whole-sector lifecycle or browser/render acceptance.
import test from "node:test";
import assert from "node:assert/strict";
import { createSimulation } from "../src/core/sim.js";
import { missions } from "../src/systems/missions.js";
import { economy } from "../src/systems/economy.js";
import { economyContracts } from "../src/systems/economyContracts.js";
import { npcJobsRuntime } from "../src/systems/npcJobsRuntime.js";
import { factions } from "../src/systems/factions.js";
import { save } from "../src/save/saveSystem.js";
import { FENCES } from "../src/data/fences.js";
import { releasableContractUnits } from "../src/systems/cargo.js";
const CUT = "station_hyperion_cut", SECTOR = "sector_hyperion_cut", NYX = "station_nyx_march", DT = 1 / 60;
function boot({ native = false, playerX = 450, playerRot = null, ordinary = false, trafficOwner = false } = {}) {
  const sim = createSimulation({ seed: 4242, systems: [missions, economy, economyContracts, factions, ...trafficOwner ? [traffic] : [], npcJobsRuntime, ...native ? [flightV3, physics] : [], save] }), { state, bus } = sim;
  state.mode = "flight";
  state.simTime = 100;
  state.player.heat = 0;
  state.player.credits = 1e4;
  state.onboarding = { active: false, finished: true };
  Object.assign(state.player.cargo, { capVolume: 100, capMass: 100 });
  const player = sim.spawn(makeShipEntitySpec("ship_kestrel", { team: 0, isPlayer: true, player: state.player, rot: playerRot, pos: { x: playerX, z: 0 } }));
  state.playerId = player.id;
  state.world.currentSectorId = "sector_nyx_march";
  Object.assign(state.ui, { docked: true, dockedStationId: NYX });
  bus.emit("dock:docked", { stationId: NYX });
  const desk = sim.registry.get("economyContracts");
  const fence = FENCES.find((f) => f.id === "fence_hesper_quill");
  const info = { id: NYX, name: "Nyx Fence", sectorId: "sector_nyx_march", factionId: "faction_quiet", type: "blackmarket", tier: 2 };
  let offer;
  if (ordinary) {
    state.player.heat = 1;
    for (let epoch = 0; epoch < 32; epoch++) {
      const row = desk.planDeniableOffer(info, epoch);
      if (row?.destStationId === CUT && row.params?.cmdtyId === "cmdty_medical") {
        offer = row;
        break;
      }
    }
  } else offer = desk.planRouteLegOffer(fence, 1, info, 0);
  assert.ok(offer);
  state.missions.boards[NYX].slots.push(offer);
  assert.equal(sim.registry.get("missions").acceptMission(offer.id), true);
  const mission = state.missions.active.find((m) => m.sourceOfferId === offer.id);
  assert.ok(mission);
  assert.ok(releasableContractUnits(state, mission) > 0);
  state.player.heat = 0;
  state.world.currentSectorId = SECTOR;
  Object.assign(state.ui, { docked: false, dockedStationId: null });
  const station = sim.spawn({ type: "station", team: 2, pos: { x: 0, z: 0 }, radius: 34, hull: 1e6, hullMax: 1e6, data: { stationId: CUT, stationTypeId: "refinery", archetypeGlb: "place_station_refinery", dockRadius: 72, placeScale: 72 / 14, collisionRadius: 34, sectorId: SECTOR, collisionProxy: collisionProxyIdForStation(CUT) || "station_ring_hub", corridorBearingDeg: 0 } });
  const axis = resolveCorridorAxisWorld(station, resolveCollisionProxyManifest(station));
  player.pos.x = axis.x * playerX;
  player.pos.z = axis.z * playerX;
  player.rot = Math.atan2(axis.z, axis.x) + (playerRot || 0);
  sim.registry.get("economy").ensureMarket(CUT);
  state.economy.markets[CUT].cmdty_medical.stock = 1;
  const workerSpec = makeShipEntitySpec("ship_mule", { team: 2, pos: { x: 350, z: 50 }, rot: Math.PI, ai: { passive: true } });
  const worker = sim.spawn({ ...workerSpec, data: { ...workerSpec.data, trafficRole: "hauler", worldRecordId: "wr_cut_courtesy_test", sectorId: SECTOR, homeSectorId: SECTOR, durable: true, ai: { passive: true }, cargoManifest: { id: "cut-ore", lines: [{ commodityId: "cmdty_ore_iron", qty: 3 }], totalQty: 3 } } });
  worker.homeSectorId = SECTOR;
  const jobId = sim.helpers.npcJobs.assign(worker, { kind: "hauler", sectorId: SECTOR, route: [{ id: "origin:station_hyperion_claim", pos: { x: 1200, z: 0 } }, { id: "dest:" + CUT, pos: { x: 0, z: 0 } }], speed: 30, payload: { manifest: worker.data.cargoManifest } });
  const jobs = sim.registry.get("npcJobsRuntime");
  const entry = state.npcJobs.byId[jobId];
  entry.job.phase = "transit";
  entry.job.routeIndex = 0;
  entry.job.progress = 0.6;
  return { sim, state, bus, worker, entry, station, player, mission, jobs, close: () => sim.dispose() };
}
test("actual accepted Hesper medicine makes a loaded Cut hauler hold instead of advancing", () => {
  const t = boot();
  try {
    const before = t.entry.job.progress;
    t.sim.step(DT);
    assert.equal(t.entry.berthHold, true);
    assert.equal(t.entry.job.progress, before);
    assert.ok(t.entry.berthHoldPoint);
    assert.ok(t.worker.data.intent);
  } finally {
    t.close();
  }
});
import { removeCargo } from "../src/systems/cargo.js";
import { captureEntityRecord, spawnSpecFromRecord } from "../src/world/worldRecords.js";
import { traffic, TRAFFIC_ROLES } from "../src/systems/traffic.js";
import { flightV3 } from "../src/systems/flightV3.js";
import { physics } from "../src/core/physics.js";
import { makeShipEntitySpec } from "../src/systems/ships.js";
import { collisionProxyIdForStation, hullEnvelopeWu, resolveCollisionProxyManifest, proxyOuterRadiusWu, resolveCorridorAxisWorld } from "../src/data/collisionProxyManifests.js";
import { applyCutIntakeCourtesy, CUT_INTAKE_COURTESY_S } from "../src/world/cutIntakeCourtesy.js";
function hold(t) {
  t.jobs._updateBerthHold(t.entry, t.worker, t.state.simTime);
  return t.entry.berthHold;
}
function signature(t) {
  return JSON.stringify({ cargo: t.state.player.cargo, manifest: t.worker.data.cargoManifest, credits: t.state.player.credits, rep: t.state.factions, bodyCount: t.state.entities.size, worker: t.worker.id, record: t.worker.data.worldRecordId, job: t.entry.job.id });
}
function storage() {
  const rows = /* @__PURE__ */ new Map();
  globalThis.localStorage = { get length() {
    return rows.size;
  }, key: (i) => [...rows.keys()][i] ?? null, getItem: (k) => rows.get(k) ?? null, setItem: (k, v) => rows.set(k, String(v)), removeItem: (k) => rows.delete(k) };
  return () => delete globalThis.localStorage;
}
test("holding is the existing job pause, not freight settlement or a second writer", () => {
  const t = boot();
  try {
    const before = signature(t), progress = t.entry.job.progress, jobTime = t.entry.job.simTime, pos = { ...t.worker.pos };
    const lines = [];
    t.bus.on("toast", (p) => lines.push(p.text));
    for (let i = 0; i < 120; i++) t.sim.step(DT);
    assert.equal(t.entry.job.progress, progress);
    assert.equal(t.entry.job.simTime, jobTime);
    assert.equal(signature(t), before);
    assert.deepEqual({ ...t.worker.pos }, pos, "this owner emits steering, never teleports");
    assert.equal(lines.filter((s) => s.startsWith("Cut intake:")).length, 1);
    assert.ok(Math.abs(t.worker.data.intent.aimAngle - Math.PI) > 0.1, "intent aims off the original intake leg");
    assert.equal(t.worker.data.intent.fire, false);
  } finally {
    t.close();
  }
});
test("side hold clears the measured station envelope and the approach corridor", () => {
  const t = boot();
  try {
    assert.equal(hold(t), true);
    const hp = t.entry.berthHoldPoint, proxy = resolveCollisionProxyManifest(t.station), outer = proxyOuterRadiusWu(proxy, t.station), r = hullEnvelopeWu(t.worker), axis = resolveCorridorAxisWorld(t.station, proxy);
    assert.ok(Math.hypot(hp.x - t.station.pos.x, hp.z - t.station.pos.z) > outer + r + 48);
    assert.ok(Math.abs((hp.x - t.station.pos.x) * -axis.z + (hp.z - t.station.pos.z) * axis.x) > outer + r + 48);
    const dx = hp.x - t.worker.pos.x, dz = hp.z - t.worker.pos.z;
    const u = Math.max(0, Math.min(1, -(t.worker.pos.x * dx + t.worker.pos.z * dz) / (dx * dx + dz * dz)));
    assert.ok(Math.hypot(t.worker.pos.x + dx * u, t.worker.pos.z + dz * u) > outer + r);
    assert.equal(hp.reason, "medical_intake");
  } finally {
    t.close();
  }
});
test("real dock completion releases the original job without duplicating payment", () => {
  const t = boot();
  try {
    assert.equal(hold(t), true);
    const worker = t.worker, manifest = JSON.stringify(worker.data.cargoManifest), credits = t.state.player.credits;
    t.state.ui.docked = true;
    t.state.ui.dockedStationId = CUT;
    t.bus.emit("dock:docked", { stationId: CUT });
    assert.equal(t.state.missions.active.some((m) => m.id === t.mission.id), false);
    assert.ok(t.state.player.credits > credits);
    const paid = t.state.player.credits;
    t.state.ui.docked = false;
    t.state.ui.dockedStationId = null;
    const progress = t.entry.job.progress;
    t.sim.step(DT);
    assert.equal(t.entry.berthHold, false);
    assert.ok(t.entry.job.progress > progress);
    t.bus.emit("dock:docked", { stationId: CUT });
    assert.equal(t.state.player.credits, paid);
    assert.equal(t.state.entities.get(worker.id), worker);
    assert.equal(JSON.stringify(worker.data.cargoManifest), manifest);
  } finally {
    t.close();
  }
});
test("departure, cargo loss and restocked medicine release the current approach", () => {
  for (const change of [(t) => {
    t.player.pos.x = 2e3;
  }, (t) => removeCargo(t.state, "cmdty_medical", 999), (t) => {
    const m = t.state.economy.markets[CUT].cmdty_medical;
    m.stock = m.baseEq;
  }]) {
    const t = boot();
    try {
      assert.equal(hold(t), true);
      change(t);
      assert.equal(hold(t), false);
      const p = t.entry.job.progress;
      t.sim.step(DT);
      assert.ok(t.entry.job.progress > p);
    } finally {
      t.close();
    }
  }
});
const refusals = { empty_worker: (t) => {
  t.worker.data.cargoManifest = { lines: [], totalQty: 0 };
}, nonore: (t) => {
  t.worker.data.cargoManifest.lines[0].commodityId = "cmdty_food";
}, malformed_total: (t) => {
  t.worker.data.cargoManifest.totalQty = 4;
}, missing_patient_free_stock: (t) => {
  delete t.state.economy.markets[CUT].cmdty_medical;
}, nan_stock: (t) => {
  t.state.economy.markets[CUT].cmdty_medical.stock = NaN;
}, no_reference: (t) => {
  delete t.state.economy.markets[CUT].cmdty_medical.baseEq;
}, foreign_source: (t) => {
  t.mission.source = "story";
}, wrong_fence: (t) => {
  t.mission.cause.fenceRoute.fenceId = "fence_ilsa_greve";
}, wrong_leg: (t) => {
  t.mission.cause.fenceRoute.leg = 2;
}, unsealed: (t) => {
  t.mission.preloadedCargo = false;
}, food_only: (t) => {
  t.mission.params.cmdtyId = "cmdty_food";
}, empty_player: (t) => {
  removeCargo(t.state, "cmdty_medical", 999);
}, expired_mission: (t) => {
  t.mission.deadline_s = t.state.simTime;
}, future_acceptance: (t) => {
  t.mission.acceptedAt_s = t.state.simTime + 1;
}, wrong_destination: (t) => {
  t.mission.destStationId = "station_ceres";
}, wrong_route: (t) => {
  t.entry.job.route[1].id = "dest:station_ceres";
}, flee: (t) => {
  t.entry.job.phase = "flee";
}, threat: (t) => {
  t.entry.threatId = 999;
}, lease: (t) => {
  t.entry.control = { holder: "other" };
}, specialist: (t) => {
  t.worker.data.activityActorSlotId = "choir_relief_patient";
}, duplicate_mission_id: (t) => {
  t.state.missions.active.push({ ...t.mission });
}, saturated_ship_index: (t) => {
  t.state.entityIndex.shipLike = Array(129).fill(t.worker);
}, dead_worker: (t) => {
  t.worker.alive = false;
}, dead_station: (t) => {
  t.station.alive = false;
}, stale_body: (t) => {
  t.state.entities.set(t.worker.id, { ...t.worker });
}, stale_job: (t) => {
  t.state.npcJobs.byId[t.entry.job.id] = { ...t.entry };
}, unready_index: (t) => {
  t.state.entityIndex.ready = false;
}, wrong_sector: (t) => {
  t.state.world.currentSectorId = "sector_ceres_belt";
}, already_docked: (t) => {
  t.state.ui.docked = true;
}, oversized_missions: (t) => {
  t.state.missions.active = Array(33).fill(t.mission);
}, bad_token: (t) => {
  t.worker.data.ai.cutIntakeCourtesy = { missionId: t.mission.id, until_s: Infinity };
} };
for (const [name, change] of Object.entries(refusals)) test(`courtesy refuses ${name}`, () => {
  const t = boot();
  try {
    change(t);
    const before = signature(t);
    assert.equal(applyCutIntakeCourtesy(t.jobs, t.entry, t.worker, t.state.simTime), false);
    assert.equal(signature(t), before);
  } finally {
    t.close();
  }
});
test("canonical reservation prevents spending another medical contract's surviving cargo", () => {
  const t = boot();
  try {
    t.state.missions.active.push({ ...t.mission, id: "m_other", sourceOfferId: "unrelated", params: { ...t.mission.params, qty: t.mission.params.qty } });
    assert.equal(releasableContractUnits(t.state, t.mission), 0);
    assert.equal(hold(t), false);
  } finally {
    t.close();
  }
});
test("same mission consumes only one finite courtesy window across departure and job recommission", () => {
  const t = boot();
  try {
    const lines = [];
    t.bus.on("toast", (p) => lines.push(p.text));
    assert.equal(hold(t), true);
    const token = structuredClone(t.worker.data.ai.cutIntakeCourtesy);
    t.player.pos.x = 1500;
    assert.equal(hold(t), false);
    t.player.pos.x = 450;
    t.state.simTime += 5;
    assert.equal(hold(t), true);
    assert.deepEqual(t.worker.data.ai.cutIntakeCourtesy, token);
    const spec = { kind: "hauler", sectorId: SECTOR, route: structuredClone(t.entry.job.route), speed: 30, payload: { manifest: t.worker.data.cargoManifest } };
    t.jobs.release(t.entry.job.id);
    const id = t.sim.helpers.npcJobs.assign(t.worker, spec);
    t.entry = t.state.npcJobs.byId[id];
    t.entry.job.phase = "transit";
    t.entry.job.progress = 0.6;
    t.state.simTime = token.until_s;
    assert.equal(hold(t), false);
    assert.equal(lines.filter((s) => s.startsWith("Cut intake:")).length, 1);
    assert.deepEqual(t.worker.data.ai.cutIntakeCourtesy, token);
  } finally {
    t.close();
  }
});
test("same-id mission replacement and an older shipment cannot reset the window", () => {
  const t = boot();
  try {
    assert.equal(hold(t), true);
    t.mission.acceptedAt_s++;
    t.state.simTime++;
    assert.equal(hold(t), false);
    t.mission.id = "m_older";
    t.mission.acceptedAt_s = 0;
    assert.equal(hold(t), false);
  } finally {
    t.close();
  }
});
test("actual body-record capture and rematerialization retain only the same worker courtesy", () => {
  const t = boot();
  try {
    assert.equal(hold(t), true);
    const token = structuredClone(t.worker.data.ai.cutIntakeCourtesy);
    const record = captureEntityRecord(t.worker, { sectorId: SECTOR, seed: 4242, simTime: t.state.simTime });
    assert.deepEqual(record.ai.cutIntakeCourtesy, token);
    const spec = spawnSpecFromRecord(record);
    assert.deepEqual(spec.data.ai.cutIntakeCourtesy, token);
    assert.equal(spec.data.worldRecordId, t.worker.data.worldRecordId);
    assert.deepEqual(spec.data.cargoManifest, t.worker.data.cargoManifest);
    assert.ok(!spec.data.jobId || spec.data.jobId === t.entry.job.id);
  } finally {
    t.close();
  }
});
test("actual body Save/Continue preserves courtesy; identical static station fixture permits only the remaining window", async () => {
  const cleanup = storage(), t = boot();
  try {
    assert.equal(hold(t), true);
    const token = structuredClone(t.worker.data.ai.cutIntakeCourtesy), wr = t.worker.data.worldRecordId, manifest = structuredClone(t.worker.data.cargoManifest);
    const staticStation = { type: "station", pos: { ...t.station.pos }, rot: t.station.rot, radius: t.station.radius, hull: t.station.hull, hullMax: t.station.hullMax, data: structuredClone(t.station.data) };
    assert.equal(t.sim.registry.get("save").save("quick"), true);
    assert.equal(await t.sim.registry.get("save").load("latest"), true);
    const restored = t.state.entityList.filter((e) => e.alive && e.data?.worldRecordId === wr);
    assert.equal(restored.length, 1);
    t.worker = restored[0];
    assert.deepEqual(t.worker.data.ai.cutIntakeCourtesy, token);
    assert.deepEqual(t.worker.data.cargoManifest, manifest);
    t.entry = t.state.npcJobs.byId["job:" + wr];
    assert.ok(t.entry);
    t.jobs._tryRelink(t.entry, t.state.simTime);
    assert.equal(t.entry.entityId, t.worker.id);
    assert.equal(t.state.entityIndex.byStationId.has(CUT), false, "this body-focused save fixture has no world station producer");
    assert.equal(applyCutIntakeCourtesy(t.jobs, t.entry, t.worker, t.state.simTime), false, "missing static station fails closed");
    t.station = t.sim.spawn(staticStation);
    assert.equal(applyCutIntakeCourtesy(t.jobs, t.entry, t.worker, t.state.simTime), true, "same restored body resumes the remaining permission");
    t.state.simTime = token.until_s;
    assert.equal(applyCutIntakeCourtesy(t.jobs, t.entry, t.worker, t.state.simTime), false);
    assert.deepEqual(t.worker.data.ai.cutIntakeCourtesy, token);
  } finally {
    t.close();
    cleanup();
  }
});
test("production station index keeps large rock fields out of the courtesy read", () => {
  const t = boot();
  try {
    const list = t.state.entityList;
    t.state.entityList = new Proxy(list, { get(target, key) {
      if (key === Symbol.iterator || key === "find" || key === "filter") throw Error("fat world scan");
      return Reflect.get(target, key);
    } });
    assert.equal(hold(t), true);
    const before = signature(t), start = performance.now();
    for (let i = 0; i < 1e4; i++) assert.equal(hold(t), true);
    const ms = performance.now() - start;
    assert.equal(signature(t), before);
    console.log("CUT_COURTESY_BENCH " + JSON.stringify({ iterations: 1e4, totalMs: ms, meanUs: ms * 1e3 / 1e4, entityCount: t.state.entities.size }));
    t.state.entityList = list;
  } finally {
    t.close();
  }
});
test("occupied side path and a worker already deep in the berth are not diverted", () => {
  for (const setup of [(t) => {
    t.worker.pos.x = 50;
    t.worker.pos.z = 0;
  }, (t) => {
    const p = t.sim.spawn(makeShipEntitySpec("ship_mule", { team: 2, pos: { x: 420, z: 20 } }));
    assert.ok(p);
  }]) {
    const t = boot();
    try {
      setup(t);
      assert.equal(applyCutIntakeCourtesy(t.jobs, t.entry, t.worker, t.state.simTime), false);
      assert.equal(t.worker.data.ai.cutIntakeCourtesy, void 0);
    } finally {
      t.close();
    }
  }
});
test("multiple eligible haulers do not converge or repeat the clearance", () => {
  const t = boot();
  try {
    const lines = [];
    t.bus.on("toast", (p) => lines.push(p.text));
    t.entry.berthWaitSince = 90;
    assert.equal(hold(t), true);
    const spec = makeShipEntitySpec("ship_mule", { team: 2, pos: { x: 300, z: -100 }, ai: { passive: true } });
    Object.assign(spec.data, { trafficRole: "hauler", worldRecordId: "wr_cut_second", sectorId: SECTOR, homeSectorId: SECTOR, durable: true, cargoManifest: structuredClone(t.worker.data.cargoManifest) });
    const other = t.sim.spawn(spec);
    other.homeSectorId = SECTOR;
    const id = t.sim.helpers.npcJobs.assign(other, { kind: "hauler", sectorId: SECTOR, route: structuredClone(t.entry.job.route), speed: 30, payload: { manifest: other.data.cargoManifest } });
    const entry = t.state.npcJobs.byId[id];
    entry.job.phase = "transit";
    assert.equal(applyCutIntakeCourtesy(t.jobs, entry, other, t.state.simTime), false);
    assert.equal(other.data.ai.cutIntakeCourtesy, void 0);
    t.jobs._updateBerthHold(entry, other, t.state.simTime);
    assert.equal(entry.berthHold, false, "courtesy worker relinquishes its old queue claim");
    assert.equal(t.entry.berthWaitSince, null);
    assert.equal(lines.filter((s) => s.startsWith("Cut intake:")).length, 1);
  } finally {
    t.close();
  }
});
test("native Mule actuators move the original ore hull aside, then resume its job after departure", async () => {
  const t = boot({ native: true });
  try {
    Object.assign(t.state.settings.gameplay, { physicsBackend: "rapier-dynamic", flightBackend: "v3", aiBackend: "legacy" });
    assert.equal(await t.sim.registry.get("physics").prepareBackend(t.state, {}), true);
    assert.equal(t.state.physicsRuntime.diagnostics.sg02Ready, true);
    const start = { x: t.worker.pos.x, z: t.worker.pos.z, rot: t.worker.rot }, cargo = JSON.stringify(t.worker.data.cargoManifest), progress = t.entry.job.progress;
    assert.equal(hold(t), true);
    const hp = { ...t.entry.berthHoldPoint }, d0 = Math.hypot(start.x - hp.x, start.z - hp.z), trace = [];
    for (let i = 0; i < 600; i++) {
      t.sim.step(DT);
      if (i % 60 === 0) trace.push({ t: t.state.simTime, x: t.worker.pos.x, z: t.worker.pos.z, hold: t.entry.berthHold, progress: t.entry.job.progress });
      assert.equal(t.entry.berthHold, true);
      assert.equal(t.entry.job.progress, progress);
    }
    const body = t.sim.registry.get("physics")._sg02.records.get(t.worker.id)?.body;
    assert.ok(body);
    const distance = Math.hypot(t.worker.pos.x - hp.x, t.worker.pos.z - hp.z);
    console.log("CUT_NATIVE_TRACE " + JSON.stringify({ start, hold: hp, d0, distance, trace, final: { x: t.worker.pos.x, z: t.worker.pos.z, rot: t.worker.rot }, bodyMass: body.mass(), stationArchetype: t.station.data.archetypeGlb, proxyId: resolveCollisionProxyManifest(t.station).id, stationOuter: proxyOuterRadiusWu(resolveCollisionProxyManifest(t.station), t.station), workerEnvelope: hullEnvelopeWu(t.worker), corridorAxis: resolveCorridorAxisWorld(t.station, resolveCollisionProxyManifest(t.station)) }));
    assert.ok(Math.hypot(t.worker.pos.x - start.x, t.worker.pos.z - start.z) > 10, "real physical displacement");
    assert.ok(distance < d0 - 10, "moves toward the clear side point");
    assert.equal(JSON.stringify(t.worker.data.cargoManifest), cargo);
    const before = t.entry.job.progress;
    Object.assign(t.state.input, { moveZ: 1, moveX: 0, brake: false });
    for (let i = 0; i < 900 && Math.hypot(t.player.pos.x, t.player.pos.z) <= 900; i++) t.sim.step(DT);
    assert.ok(Math.hypot(t.player.pos.x, t.player.pos.z) > 900, "real player flight leaves the intake");
    assert.ok(t.state.simTime < t.worker.data.ai.cutIntakeCourtesy.until_s, "departure, not expiry, releases the job");
    t.sim.step(DT);
    assert.equal(t.entry.berthHold, false);
    assert.ok(t.entry.job.progress > before);
    console.log("CUT_NATIVE_DEPARTURE " + JSON.stringify({ t: t.state.simTime, player: { x: t.player.pos.x, z: t.player.pos.z }, worker: { x: t.worker.pos.x, z: t.worker.pos.z, rot: t.worker.rot }, progress: t.entry.job.progress }));
    assert.equal(JSON.stringify(t.worker.data.cargoManifest), cargo);
  } finally {
    t.close();
  }
});
test("native player approach enters the finite intake courtesy through ordinary flight input", async () => {
  const t = boot({ native: true, playerX: 1e3, playerRot: Math.PI });
  try {
    Object.assign(t.state.settings.gameplay, { physicsBackend: "rapier-dynamic", flightBackend: "v3", aiBackend: "legacy" });
    assert.equal(await t.sim.registry.get("physics").prepareBackend(t.state, {}), true);
    assert.equal(hold(t), false);
    Object.assign(t.state.input, { moveZ: 1, moveX: 0, brake: false });
    for (let i = 0; i < 600 && !t.entry.berthHold; i++) t.sim.step(DT);
    console.log("CUT_APPROACH_DIAGNOSTIC " + JSON.stringify({ t: t.state.simTime, player: { x: t.player.pos.x, z: t.player.pos.z }, worker: { x: t.worker.pos.x, z: t.worker.pos.z }, phase: t.entry.job.phase, hold: t.entry.berthHold }));
    assert.equal(t.entry.berthHold, true);
    assert.ok(Math.hypot(t.player.pos.x, t.player.pos.z) < 900 && Math.hypot(t.player.pos.x, t.player.pos.z) > 750);
    assert.ok(t.worker.data.ai.cutIntakeCourtesy.startedAt_s > 100);
    const progress = t.entry.job.progress;
    Object.assign(t.state.input, { moveZ: 0, brake: true });
    for (let i = 0; i < 120; i++) t.sim.step(DT);
    assert.equal(t.entry.berthHold, true);
    assert.equal(t.entry.job.progress, progress);
    console.log("CUT_NATIVE_APPROACH " + JSON.stringify({ t: t.state.simTime, player: { x: t.player.pos.x, z: t.player.pos.z }, worker: { x: t.worker.pos.x, z: t.worker.pos.z }, progress, token: t.worker.data.ai.cutIntakeCourtesy }));
  } finally {
    t.close();
  }
});
test("unexpired permission never diverts a worker that resumed into the berth or across its hull", () => {
  for (const pos of [{ x: 50, z: 0 }, { x: -350, z: -50 }]) {
    const t = boot();
    try {
      assert.equal(hold(t), true);
      const token = structuredClone(t.worker.data.ai.cutIntakeCourtesy);
      t.player.pos.x = 1500;
      assert.equal(hold(t), false);
      Object.assign(t.worker.pos, pos);
      t.player.pos.x = 450;
      t.state.simTime += 5;
      assert.equal(applyCutIntakeCourtesy(t.jobs, t.entry, t.worker, t.state.simTime), false);
      assert.deepEqual(t.worker.data.ai.cutIntakeCourtesy, token);
    } finally {
      t.close();
    }
  }
});
test("ordinary Hesper deniable medicine is generated, accepted and reserved by the real owners", () => {
  const t = boot({ ordinary: true });
  try {
    assert.equal(t.mission.cause.tag, "wanted_deniable");
    assert.match(t.mission.sourceOfferId, /^eco_station_nyx_march_\d+_deniable$/);
    assert.equal(t.mission.acceptedAt_s, 100);
    assert.ok(releasableContractUnits(t.state, t.mission) > 0);
    assert.equal(hold(t), true);
    console.log("CUT_ORDINARY_CONSIGNMENT " + JSON.stringify({ offer: t.mission.sourceOfferId, acceptedAt_s: t.mission.acceptedAt_s, quantity: t.mission.params.qty }));
  } finally {
    t.close();
  }
});
test("ordinary traffic producers book a real ore manifest without naming every hauler Ossa", () => {
  const t = boot({ trafficOwner: true });
  try {
    const owner = t.sim.registry.get("traffic");
    t.jobs.release(t.entry.job.id);
    t.worker.alive = false;
    const roster = [];
    for (let seq = 0; seq < 8; seq++) {
      const ship = t.sim.spawn(makeShipEntitySpec("ship_mule", { team: 2, pos: { x: 1400 + seq * 200, z: 800 }, ai: { passive: true } }));
      owner._stampTrafficDurableIdentity(ship, SECTOR, "hauler", TRAFFIC_ROLES.hauler, seq);
      const manifest = owner._assignManifest(ship, "hauler", t.station, SECTOR);
      roster.push({ ship, manifest });
    }
    const selected = roster.find((row) => row.manifest.lines.some((l) => l.commodityId.startsWith("cmdty_ore_")));
    assert.ok(selected, "bounded ordinary traffic production includes an ore consignment");
    t.worker = selected.ship;
    Object.assign(t.worker.pos, { x: 350, z: 50 });
    const origin = t.sim.spawn({ type: "station", pos: { x: 1200, z: 0 }, radius: 26, hull: 1e6, data: { stationId: "station_hyperion_claim", stationTypeId: "mining", dockRadius: 60, sectorId: SECTOR } });
    owner._maybeAssignJob(t.worker, "hauler", origin, t.station, [origin, t.station], SECTOR);
    t.entry = t.state.npcJobs.byId[t.worker.data.jobId];
    assert.ok(t.entry);
    t.entry.job.phase = "transit";
    t.entry.job.routeIndex = 0;
    const before = signature(t);
    assert.equal(hold(t), true);
    assert.equal(signature(t), before);
    assert.deepEqual(t.entry.job.payload.manifest, selected.manifest);
    assert.equal(t.worker.data.namedLaneContactId, void 0);
    console.log("CUT_TRAFFIC_PRODUCERS " + JSON.stringify({ record: t.worker.data.worldRecordId, manifest: selected.manifest, route: t.entry.job.route, namedContact: t.worker.data.namedLaneContactId || null }));
  } finally {
    t.close();
  }
});
test("fixture resolves the production Cut refinery skin, never the trade-hub fallback", () => {
  const t = boot();
  try {
    const proxy = resolveCollisionProxyManifest(t.station);
    assert.equal(proxy.id, "skin:place_station_refinery");
    assert.ok(proxyOuterRadiusWu(proxy, t.station) > 70);
    assert.equal(t.station.data.archetypeGlb, "place_station_refinery");
    assert.equal(t.station.data.placeScale, 72 / 14);
  } finally {
    t.close();
  }
});

test('remaining clinic medicine still earns priority and settles once at the real proportional rate', () => {
  const t = boot();
  try {
    removeCargo(t.state, 'cmdty_medical', 1);
    const remaining = releasableContractUnits(t.state, t.mission);
    const expected = Math.round(t.mission.reward_cr * remaining / t.mission.params.qty);
    assert.ok(remaining > 0 && remaining < t.mission.params.qty);
    assert.equal(hold(t), true);
    const credits = t.state.player.credits;
    const manifest = structuredClone(t.worker.data.cargoManifest);
    const receipts = [];
    t.bus.on('cargo:delivered', p => receipts.push(p));
    Object.assign(t.state.ui, {docked: true, dockedStationId: CUT});
    t.bus.emit('dock:docked', {stationId: CUT});
    assert.equal(t.mission.params.completionMethod, 'partial_delivery');
    assert.equal(t.state.player.credits, credits + expected);
    assert.equal(receipts.filter(p => p.missionId === t.mission.id).length, 1);
    assert.equal(receipts.find(p => p.missionId === t.mission.id).qty, remaining);
    t.state.ui.docked = false;
    t.state.ui.dockedStationId = null;
    const progress = t.entry.job.progress;
    t.sim.step(DT);
    assert.equal(t.entry.berthHold, false);
    assert.ok(t.entry.job.progress > progress);
    t.bus.emit('dock:docked', {stationId: CUT});
    assert.equal(t.state.player.credits, credits + expected);
    assert.equal(receipts.filter(p => p.missionId === t.mission.id).length, 1);
    assert.deepEqual(t.worker.data.cargoManifest, manifest);
  } finally { t.close(); }
});
