import assert from 'node:assert/strict';
import test from 'node:test';
import { vfx } from '../src/render/vfx.js';
import { indexedShipLikeScan, indexedTypeScan } from '../src/world/livingWorldViews.js';
import { npcPropulsionVisible } from '../src/render/npcPropulsionOwnership.js';
import { engineWashSlot, shouldEmitEngineWash, resolveEngineWashContact, engineWashEmitPayload, ENGINE_WASH_SURFACE_KINDS, ENGINE_WASH_RANGE_WU } from '../src/render/engineWash.js';

// Exact pre-change owner method, frozen from source69b3060b; independent of ignored artifacts.
// The production method below runs through the same real drive/contact/index adapters.
const original = {
  _updateEngineWash() {
    const gas = this._suppressBreakupGas ? null : this._gas;
    const state = this.state;
    if (!gas || !state || !state.entities || !state.entities.get) return false;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const slot = engineWashSlot(now);
    // Candidates: ships whose plume is actually working. `_engineDriveFor` is the same read the
    // nozzles draw with, so the wash can never burn harder than the bell it belongs to.
    const ships = indexedShipLikeScan(state);
    const candidates = this._engineWashCandidates || (this._engineWashCandidates = []);
    candidates.length = 0;
    for (const e of ships) {
      if (!e || (e.type !== 'ship' && e.type !== 'drone') || e.alive === false
        || !e.pos || !Number.isFinite(e.pos.x) || !Number.isFinite(e.pos.z)) continue;
      if (e.id === state.playerId) {
        if ((state.ui && state.ui.docked === true) || e.flags?.docked) continue;
      } else if (e.flags?.docked || !npcPropulsionVisible(state, e, this._scene)) continue;
      const drive = this._engineDriveFor(e, this._engineWashDriveScratch ||= {}).drive;
      if (!(drive > 0.3)) continue; // below the resolver's own floor: skip the surface walk too
      candidates.push(e);
      if (candidates.length >= 8) break;
    }
    if (candidates.length === 0) return false;
    const slots = this._engineWashSlots || (this._engineWashSlots = new Map());
    if (slots.size > 48) slots.clear(); // bounded: an id churn burst resets the cadence book
    const surfaces = this._engineWashSurface || (this._engineWashSurface = { pos: { x: 0, z: 0 }, radius: 0, kind: 'rock' });
    const contact = this._engineWashContact || (this._engineWashContact = {});
    const payload = this._engineWashPayload || (this._engineWashPayload = {});
    let emitted = 0;
    // One pass per surface bucket per frame: each thrusting ship tests the surfaces in range.
    // Squared-distance rejects keep the common frame (ship far from everything) at a few hypots.
    for (const bucketName of ['asteroids', 'stations', 'wrecks']) {
      const bucket = indexedTypeScan(state, bucketName);
      if (!Array.isArray(bucket)) continue;
      for (let i = 0; i < bucket.length; i++) {
        const surf = bucket[i];
        if (!surf || surf.alive === false || !surf.pos
          || !Number.isFinite(surf.pos.x) || !Number.isFinite(surf.pos.z)) continue;
        const kind = surf.type === 'station' ? 'station'
          : surf.type === 'wreck' ? 'wreck' : 'rock';
        if (!ENGINE_WASH_SURFACE_KINDS.includes(kind)) continue;
        const surfR = Math.max(2, Number(surf.radius) || 10);
        for (let c = 0; c < candidates.length; c++) {
          const ship = candidates[c];
          const drive = this._engineDriveFor(ship, this._engineWashDriveScratch ||= {}).drive;
          const dx = surf.pos.x - ship.pos.x, dz = surf.pos.z - ship.pos.z;
          const range = ENGINE_WASH_RANGE_WU + ship.radius * 2;
          if (dx * dx + dz * dz > range * range) continue;
          surfaces.pos.x = surf.pos.x; surfaces.pos.z = surf.pos.z;
          surfaces.radius = surfR; surfaces.kind = kind;
          const wash = resolveEngineWashContact(ship, drive, surfaces, contact);
          if (!wash.hit) continue;
          const shipId = ship.id != null ? ship.id : c;
          if (slots.get(shipId) === slot) continue; // this slot already washed
          if (!shouldEmitEngineWash(drive, slot, shipId)) continue;
          slots.set(shipId, slot);
          engineWashEmitPayload(wash, shipId, slot, payload);
          gas.emitFractureDust({
            ...payload,
            occluderX: surf.pos.x,
            occluderY: 0,
            occluderZ: surf.pos.z,
            occluderRadius: surfR * 0.9,
          });
          emitted += 1;
        }
      }
    }
    return emitted > 0;
  },

}._updateEngineWash;

function fixture({ drives = [1, 0.5], now = 0, shipX = 0, farOnly = false, presetSlots = [] } = {}) {
  const stats = { drive: 0, surfaceReads: 0 }, scene = { parent: null }, emitted = [];
  const ships = drives.map((drive, i) => ({ id: i + 1, type: 'ship', alive: true,
    radius: 10, pos: { x: shipX, z: i * 120 }, vel: { x: 0, z: 0 }, rot: 0,
    maxSpeed: 120, flags: {}, hull: 100, hullMax: 100, _flightFrame: { throttle: drive, forwardSpeed: 0 },
    mesh: { visible: true, parent: scene } }));
  const surface = (id, type, x, z, radius = 40) => ({ id, type, alive: true, radius,
    pos: { get x() { stats.surfaceReads++; return x; }, get z() { stats.surfaceReads++; return z; } } });
  const asteroids = [surface(100, 'asteroid', 8000, 0), surface(101, 'asteroid', 60, 0),
    ...ships.map((ship, i) => surface(110 + i, 'asteroid', farOnly ? 8000 : -60, ship.pos.z)),
    ...ships.map((ship, i) => surface(120 + i, 'asteroid', farOnly ? 9000 : -62, ship.pos.z))];
  const stations = [surface(200, 'station', -60, 0)], wrecks = [surface(201, 'wreck', -60, 120)];
  const state = { playerId: 1, simTime: now, ui: {}, input: { moveZ: 0 }, player: {},
    rng: { state: 42, draws: 0 }, render: { scene }, entities: new Map(), entityList: [],
    entityIndex: { __spacefaceEntityIndexV1: true, ready: true, shipLike: ships, asteroids, stations, wrecks } };
  state.entityList = [...ships, ...asteroids, ...stations, ...wrecks];
  for (const e of state.entityList) state.entities.set(e.id, e);
  const owner = { state, _scene: scene, _plumeDashPending: true,
    _gas: { emitFractureDust: payload => emitted.push(structuredClone(payload)) },
    _engineWashSlots: new Map(presetSlots), _actuatorsFor: () => null, _rcsScaleFor: () => 1,
    _engineDriveFor(entity, out) { stats.drive++; return vfx._engineDriveFor.call(this, entity, out); } };
  return { owner, state, ships, stats, emitted };
}
function facts(f) {
  return { simTime: f.state.simTime, rng: { ...f.state.rng }, ships: f.ships.map(e => ({
    id: e.id, pos: { ...e.pos }, vel: { ...e.vel }, rot: e.rot, hull: e.hull, flags: { ...e.flags },
    frame: { ...e._flightFrame } })) };
}
function pair(options) { return { old: fixture(options), candidate: fixture(options) }; }
function step(p) {
  const beforeOld = facts(p.old), beforeCandidate = facts(p.candidate);
  const oldResult = original.call(p.old.owner), candidateResult = vfx._updateEngineWash.call(p.candidate.owner);
  assert.equal(candidateResult, oldResult);
  assert.deepEqual(p.candidate.emitted, p.old.emitted, 'ordered actual owner gas emission stream is identical');
  assert.deepEqual([...p.candidate.owner._engineWashSlots], [...p.old.owner._engineWashSlots]);
  assert.equal(p.candidate.owner._plumeDashPending, p.old.owner._plumeDashPending, 'actual drive dash latch agrees');
  assert.deepEqual(facts(p.old), beforeOld, 'old adapter leaves canonical state/RNG untouched');
  assert.deepEqual(facts(p.candidate), beforeCandidate, 'candidate leaves canonical state/RNG untouched');
  return { oldResult, candidateResult };
}

test('competing and unequal-distance contacts preserve the first actual surface and per-ship scratch values', () => {
  const p = pair();
  step(p);
  assert.equal(p.candidate.emitted.length, 2);
  assert.equal(p.candidate.emitted[0].occluderX, -60);
  assert.equal(p.candidate.emitted[1].occluderZ, 120);
  assert.notEqual(p.candidate.emitted[0].severity, p.candidate.emitted[1].severity, 'drive scalars do not alias shared scratch');
  assert.equal(p.candidate.stats.drive, 2, 'one actual drive calculation per gathered ship');
  assert.ok(p.old.stats.drive > p.candidate.stats.drive * 5, 'all repeated ship/surface drive calculations disappear');
  assert.equal(p.candidate.owner._plumeDashPending, false);
});

test('already-emitted slot never walks surfaces, but the next slot still emits with identical seeds', () => {
  const p = pair(); step(p);
  for (const f of Object.values(p)) { f.stats.drive = 0; f.stats.surfaceReads = 0; f.state.simTime = 0.1; }
  assert.equal(step(p).candidateResult, false);
  assert.equal(p.candidate.stats.surfaceReads, 0);
  assert.ok(p.old.stats.surfaceReads > 0);
  assert.equal(p.candidate.stats.drive, 2);
  for (const f of Object.values(p)) f.state.simTime = 0.81;
  assert.equal(step(p).candidateResult, true);
  assert.equal(p.candidate.emitted.length, 4);
});

test('parity-rejected working drive skips the surface walk while a later allowed slot remains live', () => {
  const p = pair({ drives: [0.5], now: 0.41 });
  assert.equal(step(p).candidateResult, false);
  assert.equal(p.candidate.stats.surfaceReads, 0);
  assert.ok(p.old.stats.surfaceReads > 0);
  for (const f of Object.values(p)) f.state.simTime = 0.81;
  assert.equal(step(p).candidateResult, true);
  assert.equal(p.candidate.emitted.length, 1);
});

test('zero drive and hidden/docked NPCs retain the current propulsion admission policy', () => {
  const p = pair({ drives: [0, 1, 1] });
  for (const f of Object.values(p)) { f.ships[1].mesh.visible = false; f.ships[2].flags.docked = true; }
  assert.equal(step(p).candidateResult, false);
  assert.equal(p.candidate.emitted.length, 0);
  assert.equal(p.candidate.stats.surfaceReads, 0);
  assert.equal(p.candidate.stats.drive, p.old.stats.drive);
});

test('a missed-contact ship can move back inside and wash during the same slot', () => {
  const p = pair({ drives: [1], shipX: 5000 });
  assert.equal(step(p).candidateResult, false);
  for (const f of Object.values(p)) { f.ships[0].pos.x = 0; f.state.simTime = 0.1; }
  assert.equal(step(p).candidateResult, true);
  assert.equal(p.candidate.emitted.length, 1);
  assert.equal(engineWashSlot(p.candidate.state.simTime), 0);
});

test('the original first-eight ceiling and slot-book reset are preserved before eligibility rejection', () => {
  const p = pair({ drives: Array(9).fill(1), presetSlots: Array.from({ length: 8 }, (_, i) => [i + 1, 0]) });
  assert.equal(step(p).candidateResult, false, 'a ninth ship does not replace a spent candidate');
  assert.equal(p.candidate.stats.drive, 8);
  assert.equal(p.candidate.stats.surfaceReads, 0);
  for (const f of Object.values(p)) for (let i = 0; i < 49; i++) f.owner._engineWashSlots.set(1000 + i, 0);
  assert.equal(step(p).candidateResult, true, 'bounded book reset rearms the same first eight');
  assert.equal(p.candidate.emitted.length, 8);
});
