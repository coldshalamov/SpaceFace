import { LAST_SHIFT_FAIRLEAD_PROXY } from '../data/lastShiftFairleadGeometry.js';
import { LAST_SHIFT as C, LAST_SHIFT_POS, LAST_SHIFT_LEGACY_POS, LAST_SHIFT_CLUES, lastShiftClue,
  lastShiftBodyKey, lastShiftFactIds, lastShiftReport, freshLastShiftRecord } from '../data/lastShift.js';
import { getCombatKernel } from '../combat/kernel.js';
import { resolveCollisionProxyManifest, resolveDockAnchor } from '../data/collisionProxyManifests.js';
import { resolveDockRange } from '../core/dockRange.js';
import { attachmentBindsOccupant } from '../combat/attachments.js';
import { refreshEntityPhysicsIndex } from '../core/coreSystem.js';
import { refreshPhysicsPartition, requestActivityReclassify } from '../world/activityRuntime.js';


const returnRefusal = Object.freeze({
  restoring: 'Return is paused while the saved world restores. Wait for the original recorder and its tow connection; reeling will not restore custody.',
  already_returned: 'The original recorder was already accepted by the archive. Read evidence remains yours; there is no second return or payment.',
  recorder_missing: 'The original recorder is not available for return here. That does not confirm it was lost. Any evidence you read can still be filed.',
  receiver_range: 'Bring your ship and the original recorder into the same slow exterior berth before docking. Slow both bodies gradually before reeling.',
  tow_required: 'There is no current tow joining your ship to the original recorder. Attach that recorder before requesting its return.',
  native_custody_pending: 'The tow connection is not confirmed yet. Wait for confirmation before retrying; reeling will not restore custody.',
  custody_changed: 'The recorder or berth changed during handoff. Check the original recorder and its current tow before retrying. No return was recorded.',
  detach_refused: 'The tow could not be released, so the archive did not accept the recorder. Check the current line before retrying; do not reel to fix this.',
  return_pending: 'The recorder handoff is already in progress. Wait for its result before requesting another return.',
});
function recorderReturnRefusal(reason, status) {
  if (reason === 'recorder_missing' && (status === 'destroyed' || status === 'salvaged')) {
    return 'The original recorder was destroyed or salvaged and cannot be returned. Any evidence you read can still be filed.';
  }
  return Object.hasOwn(returnRefusal, reason) ? returnRefusal[reason]
    : 'Recorder return is unavailable. Check the current source register and tow before retrying.';
}

const terminal = new Set(['destroyed', 'salvaged', 'returned']);
const distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
const bearingTo = (from, to) => (Math.round(Math.atan2(to.x - from.x, -(to.z - from.z)) * 180 / Math.PI) + 360) % 360;
const clone = value => JSON.parse(JSON.stringify(value));
const LEGACY_POSE_EPSILON = 0.02;
const nearPoint = (a, b) => a && b && Number.isFinite(a.x) && Number.isFinite(a.z)
  && Math.hypot(a.x - b.x, a.z - b.z) <= LEGACY_POSE_EPSILON;
const nearAngle = (a, b) => Number.isFinite(a) && Number.isFinite(b)
  && Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) <= 0.0001;
const stopped = value => value && Number.isFinite(value.x) && Number.isFinite(value.z)
  && Math.abs(value.x) <= 0.0001 && Math.abs(value.z) <= 0.0001;
function untouchedSalvagePool(pool, clue) {
  return !!pool && Object.entries(clue.pool).every(([id, qty]) => Number(pool[id]) === qty);
}
function authoredCluePosition(base, clue) {
  return { x: base.x + clue.offset.x, z: base.z + clue.offset.z };
}
function alignFairleadBody(entity) {
  if (entity?.type !== 'wreck' || entity.data?.persistenceOwner !== C.persistenceOwner
    || entity.data.lastShiftSiteId !== C.siteId || entity.data.lastShiftClueId !== 'fairlead'
    || entity.data.lastShiftBodyKey !== lastShiftBodyKey('fairlead')) return;
  const body = entity.physicsBody;
  if (!body || typeof body !== 'object' || body.shape !== 'ball' || body.dynamic !== false
    || body.radius !== 26 || body.mass !== 1800 || body.collisionProxyManifest) return;
  entity.physicsBody = { ...body, collisionProxyManifest: LAST_SHIFT_FAIRLEAD_PROXY, revision: (body.revision || 0) + 1 };
}
const position = (p, fallback) => p && Number.isFinite(p.x) && Number.isFinite(p.z)
  && Math.abs(p.x) < 1e7 && Math.abs(p.z) < 1e7 ? { x: p.x, z: p.z } : { ...fallback };

// Owns only this site's three physical records and accepted evidence/return receipts.
// Ordinary beam/cargo/economy and the canonical attachment owner retain their authority.
export const lastShift = {
  name: 'lastShift',
  init(ctx) {
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this._bindings = new Map();
    this._subs = []; this._restoring = false; this._nextTick = 0; this._lastReturnOffer = null; this._lastRecoveryState = null;
    this._adopt(ctx.state.world?.lastShift);
    const on = (event, fn) => this._subs.push(this.bus.on(event, fn));
    on('scan:pulse', p => this._scan(p));
    on('scan:completed', p => { if (p?.targetId != null) this.inspect(p.targetId); });
    on('salvage:completed', p => this._lost(p?.wreckId, 'salvaged'));
    on('entity:killed', p => this._lost(p?.targetId ?? p?.id ?? p?.victimId, 'destroyed'));
    on('entity:destroyed', p => this._lost(p?.id, p?.entity?.data?._salvaged ? 'salvaged' : 'destroyed', p?.entity));
    on('lastShift:readRecovery', p => this._offer(p?.view === 'sources' ? 'sources' : 'recovery', p?.requestId));
    on('lastShift:archive', p => {
      const result = this.archive(p?.revision);
      if (!result.ok) {
        this.bus.emit('toast', { text: 'LAST SHIFT — evidence changed. Read the current source register before filing.', kind: 'warn', ttl: 4 });
        this._offer();
      }
    });
    on('lastShift:recover', () => this.beginRecovery());
    on('lastShift:cancelRecovery', () => this.cancelRecovery());
    on('lastShift:cueSurfaced', p => {
      if (!this._cue || p?.id !== this._cue.id || this._restoring) return;
      if (p.id === `${C.siteId}:approach`) this._row.surfaced = true;
      else this._row.lastRevisitReceiptId = p.id;
      this._cue = null;
    });
    on('lastShift:returnRecorder', () => {
      const result = this.returnRecorder();
      if (!result.ok) this.bus.emit('toast', { text: `LAST SHIFT — ${recorderReturnRefusal(result.reason, this._row.bodies.recorder?.status)}`, kind: 'warn', ttl: 5 });
    });
    on('save:restoring', () => { this._restoring = true; this._bindings.clear(); });
    on('save:loaded', () => this.afterContinue());
    on('sector:enter', () => { this._nextTick = 0; this._nextCueAt = 0; this._lastReturnOffer = null; this._revisitPending = true; });
    on('sector:exit', () => { this._cue = null; });
  },
  _adopt(raw) {
    const row = freshLastShiftRecord();
    if (raw?.schema === 1 && raw.siteId === C.siteId) {
      row.discovered = raw.discovered === true; row.rumorHeard = raw.rumorHeard === true;
      row.surfaced = raw.surfaced === true || row.discovered || row.rumorHeard;
      row.knownClueIds = lastShiftFactIds(raw.knownClueIds);
      row.destroyedClueIds = lastShiftFactIds(raw.destroyedClueIds);
      row.revision = Math.max(row.knownClueIds.length, Math.min(16, Math.trunc(Number(raw.revision) || 0)));
      for (const clue of LAST_SHIFT_CLUES) {
        const saved = raw.bodies?.[clue.id];
        if (!saved) continue;
        const pool = {};
        for (const [id, qty] of Object.entries(clue.pool)) {
          pool[id] = Math.max(0, Math.min(qty, Math.trunc(Number(saved.remainingPool?.[id]) || 0)));
        }
        const spawn = { x: LAST_SHIFT_POS.x + clue.offset.x, z: LAST_SHIFT_POS.z + clue.offset.z };
        row.bodies[clue.id] = { status: terminal.has(saved.status) ? saved.status : 'live',
          pos: position(saved.pos, spawn), vel: position(saved.vel, { x: 0, z: 0 }),
          rot: Number.isFinite(saved.rot) ? saved.rot : 0, remainingPool: pool };
      }
      row.receipts = (Array.isArray(raw.receipts) ? raw.receipts : []).filter(r => r
        && Number.isInteger(r.revision) && r.revision > 0 && r.revision <= row.revision
        && r.id === `${C.siteId}:archive:r${r.revision}` && Number.isFinite(r.at) && r.at >= 0
        && JSON.stringify(lastShiftFactIds(r.clueIds)) === JSON.stringify(r.clueIds)
        && r.clueIds.length > 0 && r.clueIds.every(id => row.knownClueIds.includes(id))
        && r.text === lastShiftReport(r.clueIds, r.destroyedClueIds || [])).slice(-16).map(clone);
      if (raw.recorderReturn?.id === `${C.siteId}:recorder:return` && row.bodies.recorder?.status === 'returned'
        && typeof raw.recorderReturn.stationId === 'string' && Number.isFinite(raw.recorderReturn.at)) {
        row.recorderReturn = clone(raw.recorderReturn);
      }
    }
    row.surfaced ||= row.knownClueIds.length > 0;
    row.recoveryActive = raw?.recoveryActive === true && row.knownClueIds.includes('recorder')
      && !terminal.has(row.bodies.recorder?.status) && !row.recorderReturn;
    row.lastRevisitReceiptId = row.receipts.some(r => r.id === raw?.lastRevisitReceiptId) ? raw.lastRevisitReceiptId : null;
    this._cue = null; this._guidanceStation = null; this._guidanceStationCount = -1;
    this._row = row;
    const world = this.state.world || (this.state.world = {}); world.lastShift = row;
  },
  newGame() {
    for (const e of this.state.entities.values()) if (e.data?.lastShiftSiteId === C.siteId) this.ctx.helpers.removeEntity(e.id);
    this._bindings.clear(); this._adopt(null); this._nextTick = 0; this._lastReturnOffer = null; this._restoring = false; this._nextCueAt = 0; this._revisitPending = false;
  },
  serialize() { this._capture(); return clone(this._row); },
  deserialize(row) { this._bindings.clear(); this._adopt(row); this._nextTick = 0; },
  afterContinue() {
    this._find('fairlead');
    if (this._restoring) this._migrateUntouchedLegacyBodies();
    this._restoring = false; this._bindings.clear(); this._nextTick = 0; this._lastReturnOffer = null;
  },
  _migrateUntouchedLegacyBodies() {
    const attachments = getCombatKernel(this.ctx).attachments;
    for (const clue of LAST_SHIFT_CLUES) {
      const record = this._row.bodies[clue.id];
      if (!record || record.status !== 'live' || terminal.has(record.status)
        || this._row.destroyedClueIds.includes(clue.id)
        || (clue.id === 'recorder' && (this._row.recoveryActive || this._row.recorderReturn))
        || !untouchedSalvagePool(record.remainingPool, clue)
        || !nearPoint(record.pos, authoredCluePosition(LAST_SHIFT_LEGACY_POS, clue))
        || !stopped(record.vel)
        || !nearAngle(record.rot, clue.id === 'fairlead' ? 0.61 : -0.25)) continue;

      const entity = this._find(clue.id);
      const destination = authoredCluePosition(LAST_SHIFT_POS, clue);
      if (!entity) {
        // LastShift's row is the durable pose owner. A body can be absent from an older save's
        // persistent-entity envelope and materialize only when Ceres becomes resident again.
        // Do not adopt a row while any live semantic body is present under a mismatched key.
        const competingBody = [...this.state.entities.values()].some(candidate =>
          candidate.data?.lastShiftSiteId === C.siteId && candidate.data?.lastShiftClueId === clue.id);
        if (competingBody) continue;
        record.pos = { ...destination };
        continue;
      }
      if (entity.alive === false || this.state.entities.get(entity.id) !== entity
        || !nearPoint(entity.pos, record.pos) || !stopped(entity.vel)
        || !nearAngle(entity.rot, record.rot)
        || !untouchedSalvagePool(entity.data?.salvagePool, clue)
        || attachments.listForEntity(entity.id, false).length > 0) continue;

      record.pos = { ...destination };
      if (typeof entity.pos?.set === 'function') entity.pos.set(destination.x, entity.pos.y || 0, destination.z);
      else entity.pos = { ...(entity.pos || {}), ...destination };
      if (entity.prevPos) {
        if (typeof entity.prevPos.set === 'function') entity.prevPos.set(destination.x, entity.prevPos.y || 0, destination.z);
        else { entity.prevPos.x = destination.x; entity.prevPos.z = destination.z; }
      }
      if (entity.flags) entity.flags.noInterp = true;
      refreshEntityPhysicsIndex(this.state, entity, entity.occupantGeneration);
      refreshPhysicsPartition(entity);
      requestActivityReclassify(this.state, entity, { physicsPublication: true });
    }
  },
  _find(clueId) {
    const expected = lastShiftBodyKey(clueId);
    const bound = this._bindings.get(clueId);
    if (bound && this.state.entities.get(bound.id) === bound.entity && bound.entity.alive !== false
      && bound.entity.occupantGeneration === bound.life && bound.entity.data?.lastShiftBodyKey === expected) { alignFairleadBody(bound.entity); return bound.entity; }
    this._bindings.delete(clueId);
    for (const entity of this.state.entities.values()) {
      if (entity.alive !== false && entity.data?.lastShiftSiteId === C.siteId
        && entity.data?.lastShiftBodyKey === expected) {
        alignFairleadBody(entity);
        this._bindings.set(clueId, { id: entity.id, life: entity.occupantGeneration, entity }); return entity;
      }
    }
    return null;
  },
  _materialize() {
    if (this.state.world?.currentSectorId !== C.sectorId) return;
    // The three clues are a site you find by flying there. A quiet sector does not
    // carry them on the combat list until the player is inside the discovery range.
    const player = this.state.entities.get(this.state.playerId);
    if (!player || player.alive === false || !player.pos
      || distance(player.pos, LAST_SHIFT_POS) > C.discoveryRangeWu) return;
    for (const clue of LAST_SHIFT_CLUES) {
      const record = this._row.bodies[clue.id];
      if (terminal.has(record?.status) || this._find(clue.id)) continue;
      const pos = record?.pos || { x: LAST_SHIFT_POS.x + clue.offset.x, z: LAST_SHIFT_POS.z + clue.offset.z };
      const pool = record?.remainingPool || { ...clue.pool };
      const entity = this.ctx.helpers.spawnEntity({ type: 'wreck', team: 0, pos, vel: record?.vel || { x: 0, z: 0 },
        rot: record?.rot || (clue.id === 'fairlead' ? 0.61 : -0.25), radius: clue.radius,
        mass: clue.mass, hull: clue.id === 'fairlead' ? 360 : 80, hullMax: clue.id === 'fairlead' ? 360 : 80,
        flags: { persistent: true }, physicsBody: { schemaVersion: 1, dynamic: clue.dynamic,
          shape: 'ball', radius: clue.radius, mass: clue.mass, inertiaY: clue.mass * clue.radius ** 2 / 2, revision: 0,
          ...(clue.id === 'fairlead' ? { collisionProxyManifest: LAST_SHIFT_FAIRLEAD_PROXY } : {}) },
        data: { lastShiftSiteId: C.siteId, lastShiftBodyKey: lastShiftBodyKey(clue.id), lastShiftClueId: clue.id,
          persistenceOwner: C.persistenceOwner, homeSectorId: C.sectorId, scannable: true,
          authoredScanLabel: clue.label, scanLabel: clue.label, parentType: clue.parentType,
          authoredSalvagePool: { ...pool }, salvagePool: { ...pool }, debrisCache: { resolved: true },
          lifetimeS: Infinity, name: clue.label, wreckClass: 'battlefield' } });
      if (!entity) continue;
      this.ctx.registry?.get('salvageActions')?.configureAuthoredWreck(entity, { salvagePool: pool, scanLabel: clue.label });
      this._row.bodies[clue.id] = { status: 'live', pos: { ...pos }, vel: { x: 0, z: 0 }, rot: entity.rot,
        remainingPool: { ...pool } };
      this._bindings.set(clue.id, { id: entity.id, life: entity.occupantGeneration, entity });
    }
  },
  _capture() {
    if (this._restoring) return;
    for (const clue of LAST_SHIFT_CLUES) {
      const binding = this._bindings.get(clue.id);
      if (binding?.entity.alive === false) this._lost(binding.id, binding.entity.data?._salvaged ? 'salvaged' : 'destroyed', binding.entity);
      const e = this._find(clue.id), record = this._row.bodies[clue.id];
      if (!e || !record || terminal.has(record.status)) continue;
      record.pos = position(e.pos, record.pos); record.vel = position(e.vel, { x: 0, z: 0 }); record.rot = e.rot;
      record.remainingPool = Object.fromEntries(Object.entries(clue.pool).map(([id, qty]) =>
        [id, Math.max(0, Math.min(qty, Math.trunc(Number(e.data.salvagePool?.[id]) || 0)))]));
    }
  },
  _approach() {
    const player = this.state.entities.get(this.state.playerId);
    if (this.state.world?.currentSectorId !== C.sectorId || !player?.alive
      || distance(player.pos, LAST_SHIFT_POS) > C.discoveryRangeWu || this.state.simTime < this._nextCueAt) return;
    let cue = null;
    if (!this._row.surfaced) {
      cue = { id: `${C.siteId}:approach`, text: `LAST SHIFT — optional wreckage beside the working seam: bearing ${bearingTo(player.pos, LAST_SHIFT_POS)}°, ${Math.round(distance(player.pos, LAST_SHIFT_POS))} WU. Select a source and pulse scan within 320 WU, or keep mining.` };
    } else if (this._revisitPending) {
      const filed = this._row.receipts.at(-1);
      if (filed && filed.id !== this._row.lastRevisitReceiptId) cue = { id: filed.id,
        text: `LAST SHIFT — ${filed.clueIds.length}/3 sources filed. ${filed.clueIds.length === 3
          ? 'The filed evidence supports a cargo release to save the ships.'
          : 'The filed sequence remains incomplete.'}${LAST_SHIFT_CLUES.some(c => this._find(c.id))
            ? ' Select a source and scan to reopen the register.' : ' Your filed evidence is unchanged.'}` };
      else this._revisitPending = false;
    }
    if (!cue) return;
    this._nextCueAt = this.state.simTime + 5; this._cue = cue;
    // Only the receipt adapter's admission acknowledgement marks the cue surfaced.
    this.bus.emit('lastShift:cue', { ...cue });
  },
  _scan(payload) {
    if (this._restoring || this.state.mode !== 'flight') return;
    const player = this.state.entities.get(this.state.playerId);
    if (!player?.alive || !payload?.pos || distance(player.pos, payload.pos) > 1) return;
    if (distance(payload.pos, LAST_SHIFT_POS) <= C.discoveryRangeWu && this.state.world?.currentSectorId === C.sectorId) {
      this._row.discovered = true;
      if (!this._row.rumorHeard) {
        this._row.rumorHeard = true;
        this.bus.emit('toast', { text: 'LAST SHIFT — Yard report: probable pirate strike; no witnesses interviewed. Three marked wreck sources are nearby. Select each and pulse scan to read it.', kind: 'info', ttl: 7 });
      }
    }
    this.inspect(this.state.player?.targetId);
  },
  inspect(entityId) {
    if (this._restoring) return { ok: false, reason: 'restoring' };
    const e = this.state.entities.get(entityId), player = this.state.entities.get(this.state.playerId);
    const id = e?.data?.lastShiftClueId, clue = lastShiftClue(id);
    if (!player?.alive || !clue || e !== this._find(id) || distance(e?.pos, player?.pos) > C.scanRangeWu) return { ok: false, reason: 'out_of_range' };
    this._row.discovered = true;
    if (!this._row.knownClueIds.includes(id)) {
      this._row.knownClueIds = lastShiftFactIds([...this._row.knownClueIds, id]); this._row.revision++;
      this.bus.emit('toast', { text: `${clue.label}: ${clue.fact} ${clue.provisional}`, kind: 'info', ttl: 8 });
    }
    this._offer(); return { ok: true, clueId: id };
  },
  _lost(entityId, outcome, entity = null) {
    if (this._restoring || entityId == null) return;
    const binding = [...this._bindings.values()].find(b => b.id === entityId && (!entity || b.entity === entity));
    const e = entity || binding?.entity || this.state.entities.get(entityId);
    const id = e?.data?.lastShiftClueId, record = this._row.bodies[id];
    const owner = this._bindings.get(id);
    if (!record || !owner || owner.entity !== e || owner.life !== e.occupantGeneration
      || e?.data?.lastShiftSiteId !== C.siteId || e.data.lastShiftBodyKey !== lastShiftBodyKey(id)
      || terminal.has(record.status)) return;
    if (id === 'recorder') { this._row.recoveryActive = false; this._guidanceStation = null; }
    record.status = outcome; record.remainingPool = {}; this._row.revision++;
    if (!this._row.destroyedClueIds.includes(id)) this._row.destroyedClueIds = lastShiftFactIds([...this._row.destroyedClueIds, id]);
    this._bindings.delete(id); if (this._row.knownClueIds.length) this._offer();
  },
  beginRecovery() {
    if (this._restoring || !this._row.knownClueIds.includes('recorder') || !this._find('recorder')
      || terminal.has(this._row.bodies.recorder?.status)) return { ok: false, reason: 'recorder_unavailable' };
    this._row.recoveryActive = true;
    this._offer('guidance'); return { ok: true };
  },
  cancelRecovery() {
    this._row.recoveryActive = false; this._guidanceStation = null;
    this._offer('sources'); return { ok: true };
  },
  _recoveryReceiver() {
    const player = this.state.entities.get(this.state.playerId);
    if (!player?.alive) return null;
    let best = null;
    for (const station of this.state.entityIndex?.stations || []) {
      if (!station?.alive || station.type !== 'station' || station.data?.isGate || !station.data?.stationId
        || !Number.isFinite(station.pos?.x) || !Number.isFinite(station.pos?.z)) continue;
      const manifest = resolveCollisionProxyManifest(station);
      const anchor = manifest?.docking ? resolveDockAnchor(station, manifest, player) : station.pos;
      if (!anchor) continue;
      const range = distance(player.pos, anchor);
      if (!best || range < best.range) best = { station, anchor, range };
    }
    this._guidanceStation = best?.station || null;
    this._guidanceStationCount = this.state.entityIndex?.stations?.length || 0;
    return best;
  },
  _recoveryGuidance() {
    if (!this._row.recoveryActive || terminal.has(this._row.bodies.recorder?.status)) return null;
    const receiver = this._recoveryReceiver();
    const method = 'Keep the original recorder on your line. Reel both bodies into the same slow exterior berth; return before docking. Keep the evidence, give up hardware salvage value. No extra payment.';
    if (!receiver) return `No live archive berth is currently available. ${method}`;
    const { station, anchor, range } = receiver;
    const name = station.data.name || station.data.label || station.data.stationId;
    const speed = Number.isFinite(anchor.speedGate) ? ` Approach at or below ${anchor.speedGate} WU/s.` : '';
    const player = this.state.entities.get(this.state.playerId);
    const bearing = bearingTo(player.pos, anchor);
    return `${name}: ${anchor.kind || 'berth'} bearing ${bearing}°, ${Math.round(range)} WU at this reading.${speed} ${method}`;
  },
  // Presentation-only: evidence knowledge unlocks directions, never hardware or custody.
  _recorderRecovery(gate) {
    if (!this._row.knownClueIds.includes('recorder')) return null;
    const status = this._row.bodies.recorder?.status;
    if (this._row.recorderReturn || status === 'returned') return 'returned';
    if (status === 'destroyed' || status === 'salvaged') return 'lost';
    if (this._restoring) return 'unavailable';
    const recorder = this._find('recorder'), player = this.state.entities.get(this.state.playerId);
    if (!recorder || recorder.data.persistenceOwner !== C.persistenceOwner || !player?.alive) return 'unavailable';
    if (gate.ok) return 'berth-ready';
    const line = getCombatKernel(this.ctx).attachments.listForEntity(player.id).find(a => a.state === 'active'
      && ((a.ownerId === player.id && a.targetId === recorder.id) || (a.targetId === player.id && a.ownerId === recorder.id))
      && attachmentBindsOccupant(a, player.id, player.occupantGeneration)
      && attachmentBindsOccupant(a, recorder.id, recorder.occupantGeneration));
    if (!line) return 'available';
    if (this.state.settings?.gameplay?.physicsBackend === 'rapier-dynamic') {
      const physics = this.ctx.registry?.get('physics');
      if ((physics && (physics._nativeRestorePending || physics._nativeRestoreDeferred || !physics._sg02))
        || !this.ctx.helpers.combatPhysics?.getAttachmentTelemetry?.({ attachmentId: line.id, physicsHandle: line.physicsHandle })) return 'custody-pending';
    }
    return 'towing';
  },
  readout() {
    const gate = this._returnEligibility();
    return { siteId: C.siteId, revision: this._row.revision, clueIds: [...this._row.knownClueIds],
      text: lastShiftReport(this._row.knownClueIds, this._row.destroyedClueIds),
      canArchive: this._row.knownClueIds.length > 0, canReturnRecorder: gate.ok,
      recoveryActive: this._row.recoveryActive === true, recoveryGuidance: this._recoveryGuidance(),
      canRecoverRecorder: this._row.knownClueIds.includes('recorder') && !!this._find('recorder')
        && !terminal.has(this._row.bodies.recorder?.status),
      archiveFiled: this._row.receipts.some(receipt => receipt.id === `${C.siteId}:archive:r${this._row.revision}`),
      recorderRecovery: this._recorderRecovery(gate),
      recorderReturned: !!this._row.recorderReturn };
  },
  _offer(view = 'sources', requestId = null) { this.bus.emit('lastShift:offer', { ...this.readout(), view, requestId }); },
  archive(expectedRevision = null) {
    if (this._restoring || !this._row.knownClueIds.length) return { ok: false, reason: 'no_evidence' };
    if (expectedRevision != null && expectedRevision !== this._row.revision) return { ok: false, reason: 'evidence_changed' };
    const id = `${C.siteId}:archive:r${this._row.revision}`;
    const prior = this._row.receipts.find(r => r.id === id);
    if (prior) {
      this.bus.emit('toast', { text: `LAST SHIFT — this ${prior.clueIds.length}/3 source revision is already filed.`, kind: 'info', ttl: 3 });
      return { ok: true, duplicate: true, receipt: clone(prior) };
    }
    const receipt = { id, revision: this._row.revision, clueIds: [...this._row.knownClueIds],
      destroyedClueIds: [...this._row.destroyedClueIds], text: lastShiftReport(this._row.knownClueIds, this._row.destroyedClueIds),
      at: this.state.simTime || 0 };
    this._row.receipts.push(receipt);
    this.bus.emit('news:headline', { id, eventId: id, kind: 'last_shift_report', sourceRef: id, sectorId: C.sectorId,
      text: receipt.text, headline: receipt.clueIds.length === 3
        ? 'THE LAST SHIFT — three sources support a deliberate cargo release to save the tug and carrier.'
        : `THE LAST SHIFT — ${receipt.clueIds.length}/3 sources filed; final sequence remains incomplete.`,
      evidence: receipt.clueIds.map(clueId => ({ sourceId: lastShiftBodyKey(clueId) })) });
    this.bus.emit('lastShift:archived', clone(receipt));
    this.bus.emit('toast', { text: `LAST SHIFT filed — ${receipt.clueIds.length}/3 sources. No salvage or recovery payment was added.`, kind: 'good', ttl: 4 });
    return { ok: true, receipt: clone(receipt) };
  },
  _returnEligibility() {
    if (this._restoring) return { ok: false, reason: 'restoring' };
    if (this._row.recorderReturn) return { ok: false, reason: 'already_returned' };
    const recorder = this._find('recorder'), player = this.state.entities.get(this.state.playerId);
    if (!recorder || recorder.data.persistenceOwner !== C.persistenceOwner || !player?.alive) return { ok: false, reason: 'recorder_missing' };
    const receiver = resolveDockRange(this.state), recorderReceiver = resolveDockRange({ ...this.state, playerId: recorder.id });
    if (!receiver.station || recorderReceiver.station !== receiver.station) return { ok: false, reason: 'receiver_range' };
    const attachments = getCombatKernel(this.ctx).attachments;
    const line = attachments.listForEntity(player.id).find(a => a.state === 'active'
      && ((a.ownerId === player.id && a.targetId === recorder.id) || (a.targetId === player.id && a.ownerId === recorder.id))
      && attachmentBindsOccupant(a, player.id, player.occupantGeneration)
      && attachmentBindsOccupant(a, recorder.id, recorder.occupantGeneration));
    if (!line) return { ok: false, reason: 'tow_required' };
    if (this.state.settings?.gameplay?.physicsBackend === 'rapier-dynamic') {
      const physics = this.ctx.registry?.get('physics');
      if (physics && (physics._nativeRestorePending || physics._nativeRestoreDeferred || !physics._sg02)) return { ok: false, reason: 'native_custody_pending' };
      const port = this.ctx.helpers.combatPhysics;
      if (!port?.getAttachmentTelemetry?.({ attachmentId: line.id, physicsHandle: line.physicsHandle })) return { ok: false, reason: 'native_custody_pending' };
    }
    return { ok: true, recorder, player, receiver, attachments, line };
  },
  returnRecorder() {
    if (this._pendingReturn) return { ok: false, reason: 'return_pending' };
    const original = this._returnEligibility(); if (!original.ok) return original;
    this._pendingReturn = true;
    try {
      if (!this._row.knownClueIds.includes('recorder')) this.inspect(original.recorder.id);
      const gate = this._returnEligibility();
      if (!gate.ok || gate.recorder !== original.recorder || gate.receiver.station !== original.receiver.station) return { ok: false, reason: 'custody_changed' };
      const result = gate.attachments.cut(gate.line.id, gate.player.id);
      if (!result?.ok) return { ok: false, reason: 'detach_refused' };
      if (this._find('recorder') !== gate.recorder || gate.recorder.data.persistenceOwner !== C.persistenceOwner) return { ok: false, reason: 'custody_changed' };
      this._row.recoveryActive = false;
      this._row.bodies.recorder.status = 'returned'; this._row.bodies.recorder.remainingPool = {}; this._row.revision++;
      this._row.recorderReturn = { id: `${C.siteId}:recorder:return`, stationId: gate.receiver.stationId,
        bodyKey: lastShiftBodyKey('recorder'), at: this.state.simTime || 0 };
      this.ctx.helpers.removeEntity(gate.recorder.id); this._bindings.delete('recorder');
      this._guidanceStation = null;
      this.bus.emit('lastShift:recorderReturned', clone(this._row.recorderReturn));
      this.bus.emit('toast', { text: 'LAST SHIFT — original recorder accepted by the local archive. Its remaining salvage value was preserved as evidence; no second payment.', kind: 'good', ttl: 5 });
      this._offer(); return { ok: true, receipt: clone(this._row.recorderReturn) };
    } finally { this._pendingReturn = false; }
  },
  update(_dt, state) {
    if (this._restoring || state.mode !== 'flight' || (state.run?.kind === 'survival' && state.run.phase !== 'inactive')
      || state.simTime < this._nextTick) return;
    this._nextTick = state.simTime + 0.25;
    this._capture(); this._materialize();
    this._approach();
    const receiver = this._guidanceStation;
    if (this._row.recoveryActive && ((receiver && (receiver.alive === false
      || state.entities.get(receiver.id) !== receiver))
      || this._guidanceStationCount !== (state.entityIndex?.stations?.length || 0))) this._offer('recoveryUpdate');
    const gate = this._returnEligibility(), recovery = this._recorderRecovery(gate);
    if (recovery !== this._lastRecoveryState) {
      this._lastRecoveryState = recovery; this._offer('recoveryUpdate');
    }
    if (gate.ok && this._lastReturnOffer !== gate.receiver.stationId) {
      this._lastReturnOffer = gate.receiver.stationId; this._offer();
    } else if (!gate.ok) this._lastReturnOffer = null;
  },
  destroy() { for (const off of this._subs || []) off(); this._bindings?.clear(); },
};
