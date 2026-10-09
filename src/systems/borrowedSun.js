import { BORROWED_SUN as C, BORROWED_SUN_BERTHS as BERTHS,
  freshBorrowedSun, normalizeBorrowedSun } from '../data/borrowedSun.js';
import { SECTORS } from '../data/sectors.js';
import { COMMODITIES } from '../data/commodities.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { physicsBodyNativeReady } from '../core/physicsAuthority.js';

const owners = new WeakMap();
const labels = new Map(COMMODITIES.map(c => [c.id, c.name]));
const clone = v => structuredClone(v);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Shared read seam. Queries cannot create a visit, spend stock, move a body or advance a clock.
export function borrowedSunServiceStatus(state, stationId, { docking = false } = {}) {
  if (stationId !== C.stationId) return { ok: true };
  return owners.get(state)?.serviceStatus({ docking }) || { ok: false, reason: 'carrier_unavailable',
    text: 'BORROWED SUN — the carrier has no current service authority.' };
}
export function borrowedSunPresentation(state, entity) {
  const o = owners.get(state), r = o?._row;
  if (!r || o._find() !== entity || o._restoring || r.phaseStartTick > state.tick) return null;
  const age = Math.max(0, state.tick - r.phaseStartTick);
  const opening = r.phase === 'deploy' ? Math.min(1, age / C.deployTicks)
    : ['open', 'close_pending'].includes(r.phase) ? 1 : r.phase === 'fold' ? 1 - Math.min(1, age / C.foldTicks) : 0;
  return { carrierId: r.carrierId, visitId: r.visitId, phase: r.phase, phaseStartTick: r.phaseStartTick,
    tick: state.tick, ownerLife: entity.occupantGeneration, sourceRevision: entity.physicsBody?.revision || 0,
    nativeBodyReady: !!o._native(entity), serviceAvailable: o.serviceStatus().ok,
    petalPairs: [0, 1, 2].map(i => Math.max(0, Math.min(1, opening * 3 - i))), opening };
}

// Owns one fixed carrier and its visit record. Docking, trade, prices, stock, credits,
// hull/fuel delivery and traffic remain with their existing owners.
export const borrowedSun = {
  name: 'borrowedSun',
  init(ctx) {
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    this._row = freshBorrowedSun(); this._binding = null; this._restoring = false;
    this._retiring = false; this._lastTick = -1; this._restoreSerial = 0; this._continuedSerial = -1;
    this._subs = []; owners.set(ctx.state, this); this._registerProfile();
    const on = (event, fn) => this._subs.push(ctx.bus.on(event, fn));
    on('borrowedSun:inspect', () => this.offer());
    on('borrowedSun:route', p => { if (p?.visitId === this._row.visitId) this.plotBerth(); });
    on('scan:pulse', p => {
      if (p?.source === 'player-scanner' && p.scannerId === this.state.playerId) this.offer();
    });
    on('economy:tradeCompleted', p => this._trade(p));
    on('sector:exit', () => { if (!this._docked()) this._retire(); });
    on('entity:destroyed', p => this._lost(p?.id, p?.entity));
    on('entity:killed', p => this._lost(p?.targetId ?? p?.entityId ?? p?.id, p?.entity));
    on('save:restoring', () => { this._restoring = true; this._binding = null; });
    on('save:loaded', () => this.afterContinue());
  },
  _berth() { return BERTHS[this._row.itineraryLeg]; },
  _pos() { return sectorLocalToGlobalForSector(this._berth().local, this._berth().sectorId); },
  _registerProfile() {
    const content = this.state.content || (this.state.content = {});
    const existing = content.sectors || SECTORS;
    const list = Array.isArray(existing) ? existing : Object.values(existing);
    const berth = this._berth();
    // Additive authored metadata only. Existing market data is never copied into this owner.
    const projected = list.map(sector => ({ ...sector, stations: (sector.stations || []).filter(st => st.id !== C.stationId) }));
    const sector = projected.find(s => s.id === berth.sectorId);
    if (sector) sector.stations.push({ id: C.stationId, name: 'The Borrowed Sun', type: 'trade_hub',
      size: 'M', factionId: 'faction_mts', pos: { ...berth.local }, services: [...C.services],
      chartNote: 'One visiting carrier. Its next safe berth is recorded in simulated time.' });
    content.sectors = Array.isArray(existing) ? projected : Object.fromEntries(projected.map(s => [s.id, s]));
  },
  _find() {
    const old = this._binding;
    if (old) {
      if (this.state.entities.get(old.entity.id) === old.entity && old.entity.alive
        && old.entity.occupantGeneration === old.life && old.entity.data?.borrowedSunCarrierId === C.carrierId) return old.entity;
      return null;
    }
    const matches = this.state.entityList.filter(e => e.alive && e.data?.borrowedSunCarrierId === C.carrierId
      && e.data.persistenceOwner === C.owner && e.data.stationId === C.stationId);
    if (matches.length !== 1) return null;
    const entity = matches[0]; this._binding = { entity, life: entity.occupantGeneration }; return entity;
  },
  _native(entity = this._find()) {
    const p = this.ctx.registry?.get('physics'), n = p?._sg02, rec = n?.records.get(entity?.id);
    const age = this.state.tick - n?._simTick;
    const body = entity?.physicsBody;
    if (!entity || p?._nativeRestorePending || p?._nativeRestoreDeferred || !physicsBodyNativeReady(entity)
      || rec?.entity !== entity || !rec.body || rec.spec.dynamic !== false || !rec.colliders?.length
      || !Number.isInteger(n._simTick) || age < 0 || age > 2
      || rec.proxyId !== body?.collisionProxyManifest?.id || rec.revision !== (body.revision || 0)) return null;
    // Static records intentionally have no dynamic post-solve telemetry. Their actual fixed
    // native pose, current solved owner tick and source revision are the authority.
    const anchor = this._pos(), k = rec.kinematics, frame = n._frameOrigin || { x: 0, z: 0 };
    if (!k || distance({ x: k.x + frame.x, z: k.z + frame.z }, anchor) > .05
      || distance(entity.pos, anchor) > .01 || Math.abs(k.yaw) > .001) return null;
    return rec;
  },
  _player() { const p = this.state.entities.get(this.state.playerId); return p?.alive && p.hull > 0 ? p : null; },
  _docked() { const p = this._player(); return !!p && this.state.ui?.docked === true
    && this.state.ui.dockedStationId === C.stationId && this.state.world?.currentSectorId === this._berth().sectorId; },
  _busy() {
    if (this._docked()) return true;
    const economy = this.ctx.registry?.get('economy');
    if (economy?.state === this.state && economy._tradeExecutionInFlight === true) return true;
    // A stale saved job for a departed/dead occupant is not custody. The actual yard jobs
    // keep this visit only while their canonical current dock exists (_docked above).
    const entity = this._find();
    if (!entity) return false;
    return this.state.entityList.some(e => e !== entity && e.alive && e.physicsBody !== false
      && e.physicsBody?.dynamic !== false && ['ship', 'drone', 'payload', 'wreck'].includes(e.type)
      && distance(e.pos, entity.pos) < C.radius + Math.max(0, e.radius || 0) + 30);
  },
  _clearBerth() {
    const pos = this._pos();
    return !this.state.entityList.some(e => e.alive && e.collides !== false && e.physicsBody !== false
      && distance(e.pos, pos) < C.radius + Math.max(0, e.radius || 0) + 30);
  },
  _materialize() {
    if (this._row.lost || this._row.phase === 'transit' || this._restoring
      || this.state.world?.currentSectorId !== this._berth().sectorId || this._find()) return;
    if (this._binding || !this._clearBerth()) return;
    const budget = this.helpers.spawnBudget; if (!budget || budget.request(1, C.carrierId) !== 1) return;
    // Unwired checkpoint: the activation owner supplies this factory only after the
    // measured Forge body exists. Missing geometry admits no body or service.
    const body = this.helpers.borrowedSunPhysicalBody?.();
    if (body?.dynamic !== false || !body.collisionProxyManifest?.docking) { budget.release(C.carrierId); return; }
    const e = this.helpers.spawnEntity({ type: 'station', team: 0, factionId: 'faction_mts', pos: this._pos(),
      radius: body.radius, visualRadius: body.radius, mass: body.mass, physicsBody: body,
      hull: 1000000, hullMax: 1000000, collides: true, flags: { persistent: true },
      data: { stationId: C.stationId, stationTypeId: 'trade_hub', borrowedSunCarrierId: C.carrierId,
        persistenceOwner: C.owner, homeSectorId: this._berth().sectorId, sectorId: this._berth().sectorId,
        name: 'The Borrowed Sun', authoredAssetId: C.assetId, services: [...C.services], size: 'M',
        factionId: 'faction_mts', placeScale: 1, renderScale: 1, dockRadius: body.radius,
        landmark: true, scannable: true, chartNote: 'Nemi’s visiting market. Reflectors are outside its service approach.' } });
    if (!e) { budget.release(C.carrierId); return; }
    budget.bindEntity(e.id, C.carrierId); this._binding = { entity: e, life: e.occupantGeneration };
    const stations = this.state.world?.activeSector?.stations;
    if (Array.isArray(stations) && !stations.some(s => s.stationId === C.stationId))
      stations.push({ id: e.id, stationId: C.stationId, pos: { ...e.pos } });
    this.ctx.registry?.get('economy')?.ensureStationMarkets(C.stationId);
  },
  _retire() {
    const e = this._find(); this._retiring = true;
    try { if (e) this.helpers.removeEntity(e.id); } finally { this._retiring = false; }
    const stations = this.state.world?.activeSector?.stations;
    if (Array.isArray(stations)) for (let i = stations.length - 1; i >= 0; i--)
      if (stations[i].stationId === C.stationId) stations.splice(i, 1);
    this.helpers.spawnBudget?.release(C.carrierId); this._binding = null;
  },
  _phase(phase, duration = null) {
    const r = this._row; r.phase = phase; r.phaseStartTick = this.state.tick;
    r.deadlineTick = duration == null ? null : this.state.tick + duration;
    this.bus.emit('borrowedSun:phase', { carrierId: r.carrierId, visitId: r.visitId, phase, atTick: this.state.tick });
  },
  _notice(closing = false) {
    const r = this._row, key = closing ? 'closingNoticeVisit' : 'arrivalNoticeVisit';
    if (r[key] === r.visitId) return; r[key] = r.visitId;
    this.bus.emit('toast', { text: closing
      ? 'NEMI · BORROWED SUN — We are packing slowly. Finish your business; no one is racing the door.'
      : `NEMI · BORROWED SUN — Taking ${this._berth().name}. Bring something worth a conversation. Hail the carrier for its berth.`,
      kind: 'info', ttl: 7 });
    this.bus.emit('borrowedSun:notice', this.readout());
  },
  serviceStatus({ docking = false } = {}) {
    const r = this._row, entity = this._find();
    if (this._restoring || !entity || !this._native(entity) || r.lost)
      return { ok: false, reason: 'carrier_unavailable', text: 'BORROWED SUN — service awaits its current physical berth.' };
    if (r.phase === 'open' || (!docking && r.phase === 'close_pending' && this._docked())) return { ok: true };
    return { ok: false, reason: 'carrier_closed', text: r.phase === 'close_pending'
      ? 'NEMI — Finishing current visits. Next safe berth remains on our chart.'
      : 'NEMI — The service approach is closed while we deploy or fold. Ordinary ports still trade.' };
  },
  _trade(p) {
    if (p?.stationId !== C.stationId || !this._docked() || !this.serviceStatus().ok || !p.receiptId
      || !(p.qty > 0) || !['buy', 'sell'].includes(p.side)) return;
    this._row.lastTrade = { receiptId: String(p.receiptId), commodityId: p.commodityId,
      qty: p.qty, side: p.side, visitId: this._row.visitId };
  },
  readout() {
    const r = this._row, berth = this._berth(), next = BERTHS[(r.itineraryLeg + 1) % BERTHS.length];
    const market = this.state.economy?.markets?.[C.stationId] || {};
    const stock = C.showcase.filter(id => market[id]).map(id => ({ id, label: labels.get(id) || id,
      stock: Math.max(0, Math.floor(market[id].stock || 0)) }));
    return { carrierId: C.carrierId, visitId: r.visitId, phase: r.phase,
      serviceAvailable: this.serviceStatus().ok, berth: berth.name, sectorId: berth.sectorId,
      nextBerth: next.name, stock, status: r.phase === 'close_pending' ? 'FINISHING CURRENT VISITS'
        : this.serviceStatus().ok ? 'MARKET OPEN' : r.lost ? 'CARRIER LOST' : r.phase.toUpperCase(),
      detail: `${stock.map(s => `${s.label}: ${s.stock} units in the ordinary market`).join(' · ') || 'Stock remains in the ordinary market register.'} The light is free. Spare parts use the normal quote. Next berth: ${next.name}.`,
      rumor: r.lastTrade ? `Our last accepted business was ${r.lastTrade.side === 'buy' ? 'outgoing' : 'incoming'} ${r.lastTrade.qty} units of ${labels.get(r.lastTrade.commodityId) || r.lastTrade.commodityId}. Same ship, different cargo.`
        : 'No accepted trade has been recorded on this visit. We prefer being found.' };
  },
  offer() {
    const e = this._find(), p = this._player();
    if (this._restoring || this.state.mode !== 'flight' || !p || !e
      || this.state.player.targetId !== e.id || distance(p.pos, e.pos) > C.hailRange) return false;
    this.bus.emit('borrowedSun:offer', this.readout()); return true;
  },
  plotBerth() {
    if (this._row.lost) return false;
    this.bus.emit('ui:setCourse', { pos: this._pos(), sectorId: this._berth().sectorId,
      label: `Borrowed Sun · ${this._berth().name}`, waypointKind: 'station', autopilot: false }); return true;
  },
  _lost(id, entity) {
    if (this._restoring || this._retiring || this._row.lost) return;
    const bound = this._binding;
    if (!bound || id !== bound.entity.id || entity && entity !== bound.entity
      || bound.entity.occupantGeneration !== bound.life || bound.entity.alive && bound.entity.hull > 0) return;
    this._row.lost = true; this._phase('lost'); this.helpers.spawnBudget?.release(C.carrierId);
    this._binding = null; this.bus.emit('borrowedSun:lost', { carrierId: C.carrierId, visitId: this._row.visitId });
  },
  update(dt, state) {
    if (this._lastTick === state.tick) return; this._lastTick = state.tick;
    if (this._restoring || state.mode !== 'flight' || this._row.lost || state.run?.kind === 'survival' && state.run.phase !== 'inactive') return;
    const bound = this._binding;
    if (bound && (!bound.entity.alive || bound.entity.hull <= 0)) this._lost(bound.entity.id, bound.entity);
    const r = this._row; if (r.lost) return;
    // Eviction is not destruction; restore the same stationary visit on return.
    if (bound && state.entities.get(bound.entity.id) !== bound.entity) { this._binding = null; this.helpers.spawnBudget?.release(C.carrierId); }
    if (r.phase === 'transit') {
      if (state.tick >= r.deadlineTick) { r.itineraryLeg = (r.itineraryLeg + 1) % BERTHS.length;
        r.visitId++; this._registerProfile(); this._phase('arrive'); }
      return;
    }
    this._materialize(); const e = this._find();
    if (e) e.data.borrowedSunVisit = { visitId: r.visitId, phase: r.phase, phaseStartTick: r.phaseStartTick };
    if (this._docked()) r.firstServiceVisit = true;
    if (r.phase === 'arrive' && this._native(e)) { r.introduced = true; this._phase('deploy', C.deployTicks); this._notice(); }
    else if (r.phase === 'deploy' && state.tick >= r.deadlineTick && this._native(e)) this._phase('open', C.openTicks);
    else if (r.phase === 'open' && r.firstServiceVisit && state.tick >= r.deadlineTick) { this._phase('close_pending'); this._notice(true); }
    else if (r.phase === 'close_pending' && !this._busy()) this._phase('fold', C.foldTicks);
    else if (r.phase === 'fold' && state.tick >= r.deadlineTick && !this._busy()) { this._retire(); this._phase('transit', C.transitTicks); }
  },
  serialize() { return clone(this._row); },
  deserialize(raw) { this._row = normalizeBorrowedSun(raw, this.state.tick); this._binding = null;
    this._lastTick = -1; this._restoreSerial++; this._registerProfile(); },
  afterContinue() {
    if (this._continuedSerial === this._restoreSerial) { this._restoring = false; return; }
    this._continuedSerial = this._restoreSerial; this._restoring = false; this._binding = null;
    this._lastTick = -1; this._registerProfile();
    const e = this._find(); if (e && this.helpers.spawnBudget?.request(1, C.carrierId) === 1)
      this.helpers.spawnBudget.bindEntity(e.id, C.carrierId);
  },
  newGame() { this._retire(); this._row = freshBorrowedSun(); this._binding = null;
    this._lastTick = -1; this._restoring = false; this._registerProfile(); },
  destroy() { for (const off of this._subs) off(); this._subs = [];
    this.helpers.spawnBudget?.release(C.carrierId); owners.delete(this.state); },
};
