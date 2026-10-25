import { isBlackFlagAdventure } from '../../shipjack/model.js';
import { createTenderPhysical, TENDER_BODY_ID, TENDER_PHYSICAL } from './physical.js';
import { TENDER_CONFIG as C, TENDER_STAGES, freshSalvageTender, normalizeSalvageTender,
  discoverTenderState, recordTenderHistory } from './model.js';
import { tenderCostQuote, payTenderCost, tenderServiceQuote, bookTenderService,
  stepTenderService, cancelTenderService, repairTenderHull, rebindTenderService } from './services.js';
import { installSalvageTenderSaveAdapter } from './saveAdapter.js';
import { getSalvageTenderReadModel } from './readModel.js';

const owners = new WeakMap();
const distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
const speed = e => Math.hypot(e?.vel?.x || 0, e?.vel?.z || 0);
const fail = reason => ({ ok: false, reason });
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const commodityName = id => ({ cmdty_scrap_metal: 'scrap metal', cmdty_salvage_electronics: 'salvage electronics', cmdty_fuel_cells: 'fuel cells' })[id] || id;
const partsLabel = cost => Object.entries(cost.items).map(([id, n]) => `${n} ${commodityName(id)}`).join(' + ');
const availableLabel = quote => `Available unsealed: ${quote.items.map(i => `${i.available}/${i.qty} ${commodityName(i.id)}`).join(' · ')}. Credits: ${quote.balance}/${quote.credits}.`;
const readable = reason => String(reason || 'The operation is unavailable.').replaceAll('_', ' ');
const choice = (id, label, options = {}, available = true, reason = '') => ({ id, label, options, disabled: !available, title: reason });

/** The one simulation owner. Register after flight and before physics, at the table fixed clock.
 * The nearby decision adapter is separate; update never imports a DOM or a renderer. */
export const salvageTender = {
  name: 'salvageTender',
  init(ctx) {
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    this._row = normalizeSalvageTender(ctx.state.salvageTender);
    this.state.salvageTender = this._row;
    this.physical = createTenderPhysical(ctx); this._physical = this.physical;
    this._subs = []; this._busy = false; this._restoring = false;
    this._inside = false; this._insideCrateId = null; this._dismissed = false; this._page = 'home';
    this._shown = false; this._readyToSecure = false; this._lastPromptAt = -Infinity;
    this._offer = null; this.state.salvageTenderOffer = null;
    this._nextDiscoveryAt = 90;
    owners.set(this.state, this);
    this._releaseSaveAdapter = installSalvageTenderSaveAdapter(ctx.registry?.get?.('save'));
    const on = (event, fn) => this._subs.push(this.bus.on(event, fn));
    on('salvageTender:action', p => {
      if (!p) return;
      p.result = this.act(p.action, p.revision, p.options || {});
      // A worker command has no synchronous response on the main bus. Refresh here,
      // at the authoritative owner, so stale offers recover on either simulation lane.
      if (!p.result?.ok) this.inspect(this._page);
    });
    on('salvageTender:inspect', () => this.inspect());
    on('scan:completed', p => {
      if (p?.sectorId && p.sectorId !== this.state.world?.currentSectorId) return;
      // Production sector scans complete with targetId:null. Honor an explicitly
      // selected original, then reopen the nearby physical context after scanning.
      const e = this.state.entities?.get(p?.targetId ?? this.state.player?.targetId);
      if (e?.data?.persistenceOwner === C.owner) this.inspect(e.data.salvageTenderBody === 'recovery' ? 'cargo' : 'home');
      else if (this._near()) this.inspect('home');
      else if (this._nearbyCrate()) this.inspect('cargo');
    });
    on('combat:damage', p => this.physical.handleDamage(this._row, p));
    on('salvageTender:disabled', () => {
      if (!this._row.discovered) return;
      this._row.revision++;
      this._remember('damaged', 'The gantry is dark. Morrowlight is disabled, still yours; bring scrap for the hull.');
    });
    on('salvageTender:rackReleased', () => {
      this._row.revision++;
      this._remember('damaged', 'The rack line parted. The original supply pod is loose beside the barge.');
    });
    on('sector:exit', () => { if (!this._restoring) this.physical.shelve(this._row); this._hide(); this._inside = false; });
    on('sector:enter', () => { this._inside = false; this._dismissed = false; });
    on('save:restoring', () => { this._restoring = true; this._hide(); });
    on('save:loaded', () => this.afterContinue());
    on('dock:docked', () => this._hide());
  },

  _player() { const p = this.state.entities?.get(this.state.playerId); return p?.alive ? p : null; },
  _eligible() { return isBlackFlagAdventure(this.state) && this.state.mode === 'flight' && !this._restoring; },
  _sameSector() { return this.state.world?.currentSectorId === this._row.physical?.sectorId; },
  _near(range = C.offerRange) {
    return this._sameSector() && distance(this._player()?.pos, this.physical.find(this._row)?.pos) <= range;
  },
  _serviceGate({ allowDisabled = false } = {}) {
    const body = this.physical.find(this._row), player = this._player();
    if (!this._eligible() || !player || this.state.ui?.docked) return fail('Services need a live ship in flight.');
    if (!this._row.owned) return fail('Recover and claim Morrowlight first.');
    if (!this._sameSector() || !body || distance(player.pos, body.pos) > C.serviceRange) return fail('Come within 100 m of Morrowlight.');
    if (!this.physical.nativeReady(body) || !this.physical.nativeReady(player)) return fail('Waiting for the physical berth to reconnect.');
    if (this._row.physical.mode !== 'secured') return fail('Secure Morrowlight before using the workshop.');
    if (!allowDisabled && (this._row.physical.disabled || body.hull < C.serviceHullFloor)) return fail('Morrowlight needs a hull patch before its machinery can work.');
    if (Math.hypot(player.vel.x - body.vel.x, player.vel.z - body.vel.z) > C.serviceSpeed || speed(body) > C.serviceSpeed) return fail('Match the berth’s speed below 8 m/s.');
    return { ok: true, body, player };
  },
  _remember(kind, text) {
    recordTenderHistory(this._row, this.state.simTime, kind, text);
    const body = this.physical.find(this._row);
    this.bus.emit('salvageTender:cue', { kind, text, stage: this._row.stage, entityId: body?.id, pos: body?.pos && { ...body.pos } });
  },
  _hide() {
    this._offer = null; this.state.salvageTenderOffer = null;
    this.bus.emit('salvageTender:close', {}); this._shown = false;
  },
  readView() { return getSalvageTenderReadModel(this.state); },
  readOffer() { return this._offer ? JSON.parse(JSON.stringify(this._offer)) : null; },
  _feedback(result) {
    if (!result?.ok) this.bus.emit('toast', { text: `Morrowlight · ${readable(result?.reason)}`, kind: 'info', ttl: 4 });
    return result;
  },

  discover({ sectorId = this.state.world?.currentSectorId, anchor } = {}) {
    if (!this._eligible()) return fail('Adventure flight only.');
    if (this._row.discovered) return { ok: true, existing: true, worldRecordId: TENDER_BODY_ID };
    if (!anchor) anchor = this._discoveryAnchor();
    if (!discoverTenderState(this._row, { sectorId, anchor }, this.state.simTime)) return fail('No clear recovery pocket is available.');
    this.physical.ensure(this._row); this.physical.spawnRecovery(this._row);
    this.bus.emit('salvageTender:discovered', { worldRecordId: TENDER_BODY_ID, sectorId, pos: { ...anchor } });
    return { ok: true, worldRecordId: TENDER_BODY_ID };
  },
  _discoveryAnchor() {
    const player = this._player();
    if (!player) return null;
    const station = (this.state.entityList || []).find(e => e?.alive && e.type === 'station' && distance(e.pos, player.pos) < 1200);
    if (!station) return null;
    const ring = Math.max(100, finite(station.radius, 100)) + 260;
    for (const angle of [0.6, 1.8, 3.0, 4.2, 5.4]) {
      const point = { x: station.pos.x + Math.cos(angle) * ring, z: station.pos.z + Math.sin(angle) * ring };
      if (this._clearRecoveryCorridor(point)) return point;
    }
    return null;
  },
  _clearRecoveryCorridor(point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
    const pilot = this._player();
    if (distance(pilot?.pos, point) < (pilot?.radius || 0) + TENDER_PHYSICAL.radius + 15) return false;
    // Director anchors are zone centers, not collision-cleared spawn sites. Test
    // the complete 110 m rescue corridor before publishing the original body.
    return !(this.state.entityList || []).some(e => e?.alive && e !== pilot && e.collides !== false && e.pos
      && (e.physicsBody || ['station', 'asteroid', 'ship', 'payload', 'wreck', 'prop'].includes(e.type))
      && distance(e.pos, { x: Math.max(point.x, Math.min(point.x + 110, e.pos.x)), z: point.z })
        < Math.max(e.radius || 0, e.data?.collisionRadius || 0) + TENDER_PHYSICAL.radius + 45);
  },
  _encounterAnchor(origin) {
    if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.z)) return this._discoveryAnchor();
    const candidates = [{ x: origin.x, z: origin.z }];
    for (const radius of [180, 300, 450]) for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      candidates.push({ x: origin.x + Math.cos(angle) * radius, z: origin.z + Math.sin(angle) * radius });
    }
    return candidates.find(p => this._clearRecoveryCorridor(p)) || null;
  },

  update(dt) {
    if (!this._eligible() || !(dt > 0) || !Number.isFinite(dt) || this.state.timeScale === 0) return;
    const row = this._row;
    // Ordinary Adventure admission does not depend on a console command or a mission accept.
    if (!row.discovered && this.state.simTime >= this._nextDiscoveryAt
      && ['sector_helios_prime', 'sector_ceres_belt'].includes(this.state.world?.currentSectorId)) {
      this._nextDiscoveryAt = this.state.simTime + 3;
      this.discover();
    }
    if (!row.discovered) return;
    this.physical.ensure(row); this.physical.spawnRecovery(row); this.physical.step(dt, row);
    const body = this.physical.find(row), player = this._player();
    const d = this._sameSector() ? distance(body?.pos, player?.pos) : Infinity;
    if (row.owned && d > C.departureRange && !row.away) {
      row.away = true; row.everDeparted = true; row.departures++;
      recordTenderHistory(row, this.state.simTime, 'departed', 'The lamp stays behind. Bring something home.');
    }
    if (row.owned && row.away && d < C.serviceRange && speed(player) < 20) {
      row.away = false; row.arrivals++; row.revision++;
      this._remember('arrive', row.arrivals === 1 ? 'Morrowlight answers your approach. The light you repaired is still on.'
        : `Home again. Return ${row.arrivals}; the workshop remembers its unfinished work.`);
    }
    // Paid work pauses outside the physical berth, including leaving the sector. No remote healing.
    const service = stepTenderService(this.ctx, row, dt, this._serviceGate());
    if (service?.completed) this._remember(service.job.type === 'refuel' ? 'provision' : 'repair',
      service.job.type === 'refuel' ? 'The pump knocks twice. Your next departure is fueled.' : 'The tool falls quiet. That patch came from something you brought back.');
    const nearbyCrate = this._nearbyCrate();
    const inside = d <= C.offerRange;
    if (!inside && !nearbyCrate) { this._dismissed = false; if (this._inside || this._insideCrateId) this._hide(); }
    if (inside && !this._inside && this.state.simTime >= row.nextOfferAt && !this.state.ui?.docked) this.inspect('home');
    if (nearbyCrate && nearbyCrate.id !== this._insideCrateId && !this.state.ui?.docked
      && (!inside || this._page === 'cargo')) this.inspect('cargo');
    const movingHome = row.owned && row.physical.mode === 'released';
    const ready = (row.rescueAccepted || movingHome)
      && (!movingHome || distance(body?.pos, row.physical.anchor) >= 25)
      && this.physical.canSecure(row).ok;
    // Closing the card lets the pilot fly. The next actual safe stop brings the
    // claim/secure action back without requiring a hidden scan or a range re-entry.
    if (ready && !this._readyToSecure && !this._dismissed && !this.state.ui?.docked) {
      this.inspect(row.owned ? 'navigation' : 'home');
    }
    this._readyToSecure = ready;
    // Refresh the same deck entry, not its arrival announcement. Costs, disabled
    // reasons and partial service progress stay honest while the pilot is alongside.
    if (this._shown && this.state.simTime - this._lastPromptAt >= 1) this.inspect(this._page);
    this._inside = inside;
    this._insideCrateId = nearbyCrate?.id ?? null;
  },

  _nearbyCrate() {
    if (!this._sameSector()) return null;
    const player = this._player();
    return this.physical.recoveryBodies(this._row).filter(e => e.data.cargoManifest?.totalQty > 0
      && distance(player?.pos, e.pos) <= 110).sort((a, b) => distance(player.pos, a.pos) - distance(player.pos, b.pos))[0] || null;
  },

  inspect(page = 'home') {
    if (!this._eligible() || !this._row.discovered || (!this._near(C.offerRange)
      && !(page === 'cargo' && this._nearbyCrate()))) return fail('Approach or scan Morrowlight, or a nearby recovery crate.');
    this._page = ['home', 'service', 'restore', 'cargo', 'navigation', 'history'].includes(page) ? page : 'home';
    const row = this._row, body = this.physical.find(row), choices = [];
    const hull = `${Math.ceil(body?.hull || row.physical.tender.hull)}/${TENDER_PHYSICAL.hullMax}`;
    const stateWord = row.physical.disabled ? 'DISABLED' : row.physical.mode === 'released' ? 'MOVING · services paused' : 'SECURED';
    let headline = `${row.name} · ${TENDER_STAGES[row.stage].name}`;
    let detail = `${stateWord} · hull ${hull}. ${row.lastStatus}`;
    const gate = this._serviceGate();
    if (!row.owned && this._page !== 'cargo') {
      detail = `A stranded repair barge with an intact fuel pump. Tow this original hull 60 m clear into its marked berth, slow below 8 m/s, then claim it with 1 salvage electronics or 45 cr. Tap thrust gently: the tender keeps coasting after you brake. The emergency locker contains enough parts; inspection costs nothing. ${availableLabel(tenderCostQuote(this.state, TENDER_STAGES[1].cost))}`;
      if (!row.rescueAccepted) choices.push(choice('accept', 'Take the recovery line'));
      else {
        choices.push(choice('tow', 'Connect / resume Massline tow'));
        choices.push(choice('course', 'Mark the recovery berth', { destination: 'berth' }));
        const safe = this.physical.canSecure(row);
        const cost = tenderCostQuote(this.state, TENDER_STAGES[1].cost);
        choices.push(choice('claim', 'Secure & claim · 1 electronics', { payment: 'parts' }, safe.ok && cost.canUseParts, safe.reason || 'Bring one unsealed electronics.'));
        choices.push(choice('claim_cash', 'Secure & claim · 45 cr', { action: 'claim', payment: 'credits' }, safe.ok && cost.canUseCredits, safe.reason || '45 cr required.'));
        choices.push(choice('cancel', 'Suspend recovery · keep the original here'));
      }
      choices.push(choice('cargo_menu', 'Find / open the emergency locker', { action: 'menu', page: 'cargo' }));
      choices.push(choice('refuse', 'Leave it for now', {}, true));
    } else if (this._page === 'home') {
      choices.push(choice('service_menu', 'Prepare / service this ship', { action: 'menu', page: 'service' }));
      choices.push(choice('restore_menu', row.stage < 3 ? 'Restore the next machine' : 'Inspect installed machines', { action: 'menu', page: 'restore' }));
      choices.push(choice('cargo_menu', 'Physical supply crates / rack', { action: 'menu', page: 'cargo' }));
      choices.push(choice('navigation_menu', 'Home course / move the tender', { action: 'menu', page: 'navigation' }));
      const patchGate = this._serviceGate({ allowDisabled: true });
      const patchParts = tenderCostQuote(this.state, { items: { cmdty_scrap_metal: 1 } });
      choices.push(choice('patch', 'Patch Morrowlight · 1 scrap → 30 hull', {}, patchGate.ok && patchParts.canUseParts && (body?.hull || 0) < TENDER_PHYSICAL.hullMax,
        patchGate.reason || (!patchParts.canUseParts ? 'Bring one unsealed scrap metal.' : 'The hull is already intact.')));
      choices.push(choice('history_menu', 'Read the work log', { action: 'menu', page: 'history' }));
    } else if (this._page === 'service') {
      detail = `Supplies come from your existing hold. One fuel cell pumps up to ${C.fuelPerCell} fuel; one scrap restores up to ${C.repairPerScrap} hull/armor. Keep within 100 m at matched speed. Leaving pauses prepaid work.`;
      if (row.service) {
        detail += ` Booked ${row.service.type}: ${row.service.delivered.toFixed(1)}/${row.service.requested.toFixed(1)} delivered. ${row.service.paused ? row.service.pauseReason : 'Machinery is working.'}`;
        choices.push(choice('cancel_service', row.service.delivered <= 1e-9 ? 'Cancel · untouched supply returned' : 'Cancel · partially used supply is spent'));
      } else for (const [action, label] of [['refuel', 'Pump one fuel cell'], ['repair', 'Weld with one scrap'], ['emergency', 'Use starter emergency weld · free to 35% hull']]) {
        const q = tenderServiceQuote(this.state, row, action);
        choices.push(choice(action, label, {}, gate.ok && q.ok, gate.ok ? q.reason : gate.reason));
      }
      const supplies = tenderCostQuote(this.state, { items: { cmdty_fuel_cells: 1, cmdty_scrap_metal: 1 } }).items;
      detail += ` Unsealed hold: ${supplies[0].available} fuel cells · ${supplies[1].available} scrap. Sealed freight is never consumed.`;
    } else if (this._page === 'restore') {
      const next = TENDER_STAGES[row.stage + 1];
      detail = next ? `${next.name}: ${next.description} Install ${partsLabel(next.cost)} OR ${next.cost.credits} cr. Existing machines keep working.`
        : 'All three stages are live. The cell pump, repair bench and powered rack each occupy their own place on the deck.';
      if (next) {
        const q = tenderCostQuote(this.state, next.cost);
        detail += ` ${availableLabel(q)}`;
        choices.push(choice('restore', `Install recovered parts · ${partsLabel(next.cost)}`, { payment: 'parts' }, gate.ok && q.canUseParts, gate.reason || 'Bring the unsealed parts.'));
        choices.push(choice('restore_cash', `Buy installation supplies · ${next.cost.credits} cr`, { action: 'restore', payment: 'credits' }, gate.ok && q.canUseCredits, gate.reason || 'Insufficient credits.'));
      }
    } else if (this._page === 'cargo') {
      detail = 'These three finite recovery loads contain scrap metal, salvage electronics and fuel cells. Match a crate’s speed within 75 m to transfer what fits into your normal hold. Stage 3 clamps one of these original pods; unload it before using its supplies. Empty shells stay empty.';
      const crates = row.physical.recovery.filter(r => r.status !== 'lost' && r.manifest.totalQty > 0);
      for (const r of crates) {
        const e = this.physical.recoveryBodies(row).find(e => e.data.worldRecordId === r.id);
        const can = e && this.physical.canUnload(row, e.id);
        const contents = r.manifest.lines.filter(l => l.qty > 0).map(l => `${l.qty} ${commodityName(l.commodityId)}`).join(' · ');
        choices.push(choice(`crate_${r.key}`, `${r.name} · ${r.manifest.totalQty} units`, { action: can?.ok ? 'unload' : 'recovery', bodyId: e?.id, sourceId: r.id }, true,
          `${contents}. ${can?.ok ? 'Transfer what fits.' : 'Mark this original crate.'}`));
      }
      if (row.stage >= 3) {
        const target = this._rackCandidate();
        if (row.physical.rackId) choices.push(choice('release', 'Release the original rack pod', { bodyId: target?.id }));
        else choices.push(choice('stow', 'Clamp nearest supply pod into rack', { bodyId: target?.id }, !!target && gate.ok, 'Bring one stocked original slowly within 95 m.'));
      }
    } else if (this._page === 'navigation') {
      detail = 'Relocation moves this hull and its clamped cargo with your actual Massline. Release costs one scrap for the mooring brake; resuming an interrupted tow is free. Stop below 8 m/s to secure the new berth; scan the hull to inspect it at any time. Intersector relocation is not offered.';
      choices.push(choice('course', 'Mark Morrowlight on the chart', { destination: 'home' }));
      choices.push(choice('relocate', row.physical.mode === 'released' ? 'Resume the same tow · no extra cost' : 'Release & tow · 1 scrap', {}, this._near(TENDER_PHYSICAL.towRange)));
      choices.push(choice('secure', 'Secure at this physical location', {}, row.physical.mode === 'released' && this.physical.canSecure(row).ok));
    } else if (this._page === 'history') {
      detail = row.history.slice(-5).map(h => h.text).join(' ');
    }
    if (this._page !== 'home' && this._near(C.offerRange)) choices.push(choice('back', 'Back to Morrowlight', { action: 'menu', page: 'home' }));
    if (row.owned || this._page === 'cargo') choices.push(choice('leave', 'Return to flight', {}, true));
    const offer = { id: C.id, revision: row.revision, stage: row.stage, page: this._page, headline, detail,
      status: `${stateWord} · ${row.owned ? 'YOUR TENDER' : 'UNCLAIMED'}`, choices };
    this._dismissed = false;
    this._shown = true; this._lastPromptAt = this.state.simTime;
    this._offer = offer; this.state.salvageTenderOffer = this.readOffer();
    this.bus.emit('salvageTender:offer', offer);
    return { ok: true, offer };
  },

  _rackCandidate() {
    const bodies = this.physical.recoveryBodies(this._row), home = this.physical.find(this._row);
    if (this._row.physical.rackId) return bodies.find(e => e.data.worldRecordId === this._row.physical.rackId) || null;
    return bodies.filter(e => e.data.cargoManifest?.totalQty > 0)
      .sort((a, b) => distance(a.pos, home?.pos) - distance(b.pos, home?.pos) || a.id - b.id)[0] || null;
  },
  _course(destination = 'home', sourceId) {
    const p = this._row.physical;
    if (!p) return fail('Morrowlight has not been discovered.');
    const crate = sourceId && p.recovery.find(r => r.id === sourceId && r.status !== 'lost');
    const entity = crate ? this.physical.recoveryBodies(this._row).find(e => e.data.worldRecordId === crate.id)
      : destination !== 'berth' ? this.physical.find(this._row) : null;
    const target = destination === 'berth' ? p.rescueBerth : entity?.pos || (crate ? crate.pose : p.tender.pose);
    const label = destination === 'berth' ? 'Morrowlight recovery berth' : crate?.name || 'Morrowlight · home';
    // world treats a payload with pos as a LOCAL fix and defaults it to autopilot.
    // A recovery mark must leave manual towing in the pilot's hands. Remote home
    // routes use the owner's sector route branch without foreign coordinates.
    this.bus.emit('ui:setCourse', this._sameSector()
      ? { pos: { x: target.x, z: target.z }, targetEntityId: entity?.id, label,
        autopilot: false, arrivalRadius: crate ? 60 : 75 }
      : { sectorId: p.sectorId, label });
    return { ok: true, pos: { x: target.x, z: target.z }, sectorId: p.sectorId };
  },

  act(action, revision = this._row.revision, options = {}) {
    if (this._busy || this._restoring) return fail('The previous operation is still settling.');
    if (!this._eligible()) return fail('Adventure flight only.');
    if (revision !== this._row.revision) return this._feedback(fail('This offer changed. Inspect Morrowlight again.'));
    if (action === 'menu') return this.inspect(options.page);
    if (action === 'course') return this._course(options.destination, options.sourceId);
    if (action === 'leave' || action === 'refuse') {
      this._dismissed = true; this._row.nextOfferAt = this.state.simTime + 15; this._hide();
      return { ok: true, ownershipChanged: false };
    }
    if (!this._row.discovered) return fail('Discover the original tender first.');
    if (!['unload', 'recovery'].includes(action) && !this._near(C.offerRange)) return this._feedback(fail('Come back alongside Morrowlight.'));
    this._busy = true;
    let result;
    try { result = this._act(action, options); }
    finally { this._busy = false; }
    this._feedback(result);
    if (result?.ok) this.ctx.registry?.get?.('save')?.recordDirty?.('salvageTender', { action, revision: this._row.revision });
    if (result?.ok && !['recovery', 'tow', 'relocate', 'cancel'].includes(action)) this.inspect(this._page);
    return result;
  },
  _act(action, options) {
    const row = this._row;
    if (action === 'accept') {
      if (row.owned) return fail('Morrowlight is already yours.');
      if (!row.rescueAccepted) { row.rescueAccepted = true; row.revision++; this._remember('rescue', 'Recovery accepted. Take the original hull gently into the marked clear berth.'); }
      return { ok: true };
    }
    if (action === 'cancel') {
      if (row.owned) return fail('An owned home cannot be abandoned by closing a prompt.');
      const detached = this.physical.cancelTow(row);
      if (!detached.ok) return detached;
      row.rescueAccepted = false; row.revision++; this._hide();
      this._remember('rescue', 'Recovery suspended. The barge, supplies and damage remain where you left them.');
      return { ok: true };
    }
    if (action === 'tow') {
      const result = this.physical.beginTow(row);
      if (result.ok) { row.revision++; this._readyToSecure = false; this._course('berth'); this._hide(); }
      return result;
    }
    if (action === 'claim') {
      if (row.owned || !row.rescueAccepted) return fail('Accept the recovery of this unclaimed barge first.');
      const gate = this.physical.canSecure(row); if (!gate.ok) return gate;
      const result = payTenderCost(this.ctx, TENDER_STAGES[1].cost, options.payment, () => {
        const secured = this.physical.secure(row); if (!secured.ok) return false;
        row.owned = true; row.rescueAccepted = false; row.stage = 1; row.claimedAt = this.state.simTime;
        row.emergencyAvailable = true; row.revision++; return true;
      });
      if (result.ok) { this._course('home'); this._remember('restore', 'The berth lamp steadies. Morrowlight is yours; its cell pump and emergency weld now work.'); }
      return result;
    }
    if (action === 'restore') {
      const gate = this._serviceGate(); if (!gate.ok) return gate;
      const next = TENDER_STAGES[row.stage + 1]; if (!next) return fail('All three machines are restored.');
      const result = payTenderCost(this.ctx, next.cost, options.payment, () => {
        if (!this._serviceGate().ok || row.stage + 1 !== next.stage) return false;
        row.stage = next.stage; row.revision++; return true;
      });
      if (result.ok) this._remember('restore', next.stage === 2
        ? 'The dead repair bench turns once, catches, and keeps turning. Recovered scrap can now repair your ship.'
        : 'The gantry unfolds. One real supply pod can travel with your home; the twin repair tools work twice as fast.');
      return result;
    }
    if (['repair', 'refuel', 'emergency'].includes(action)) {
      const gate = this._serviceGate(); if (!gate.ok) return gate;
      const result = bookTenderService(this.ctx, row, action);
      if (result.ok) this._remember(action === 'refuel' ? 'provision' : 'repair', `${action === 'refuel' ? 'Fuel' : 'Repair'} work booked. Stay alongside; leaving pauses the work you paid for.`);
      return result;
    }
    if (action === 'cancel_service') return cancelTenderService(this.ctx, row);
    if (action === 'patch') {
      const gate = this._serviceGate({ allowDisabled: true }); if (!gate.ok) return gate;
      const result = repairTenderHull(this.ctx, row, gate.body);
      if (result.ok) { this.physical.capture(row); this.physical.step(0, row); this._remember('repair', `A recovered plate closes the old wound. Morrowlight regains ${result.restoredHull} hull.`); }
      return result;
    }
    if (action === 'recovery') {
      this.physical.capture(row); return this._course('crate', options.sourceId);
    }
    if (action === 'unload') {
      const result = this.physical.unloadRecovery(row, options.bodyId);
      if (result.ok) { row.revision++; this._remember('provision', `Recovered ${Object.values(result.moved).reduce((a, b) => a + b, 0)} units into your hold. ${result.remaining} remain in the original pod.`); }
      return result;
    }
    if (action === 'stow' || action === 'release') {
      const gate = this._serviceGate(); if (!gate.ok) return gate;
      const bodyId = options.bodyId ?? this._rackCandidate()?.id;
      const result = action === 'stow' ? this.physical.stowRecovery(row, bodyId) : this.physical.releaseRecovery(row, bodyId);
      if (result.ok) { row.revision++; this._remember('provision', action === 'stow' ? 'The gantry takes the actual supply pod. It will travel on a physical line with Morrowlight.' : 'The rack lets go. Your original pod is loose beside the hull.'); }
      return result;
    }
    if (action === 'relocate') {
      if (!row.owned) return fail('Claim the tender before relocating your home.');
      if (row.physical.mode === 'released') {
        const resumed = this.physical.beginTow(row);
        if (resumed.ok) { this._readyToSecure = false; this._hide(); }
        return resumed;
      }
      if (row.service) return fail('Finish or cancel the booked work before moving the berth.');
      const result = payTenderCost(this.ctx, { credits: 0, items: { cmdty_scrap_metal: 1 } }, 'parts', () => {
        const tow = this.physical.beginTow(row); if (!tow.ok) return false;
        row.revision++; return true;
      });
      if (result.ok) { this._readyToSecure = false; this._remember('relocate', 'Mooring brake released. Tow the same hull; stop slowly and secure when the new berth feels right.'); this._hide(); }
      return result;
    }
    if (action === 'secure') {
      if (!row.owned) return fail('Finish the recovery claim first.');
      const result = this.physical.secure(row);
      if (result.ok) { row.revision++; this._course('home'); this._remember('secured', 'The berth thrusters settle. Same home, new view.'); }
      return result;
    }
    return fail('Unknown workshop operation.');
  },

  serialize() { this.physical.capture(this._row); return normalizeSalvageTender(this._row); },
  deserialize(raw) {
    this._row = normalizeSalvageTender(raw); this.state.salvageTender = this._row;
    this._restoring = true; this._inside = false; this._insideCrateId = null; this._readyToSecure = false; this._dismissed = false; this._hide();
  },
  afterContinue() {
    this._restoring = false; this.physical.afterRestore(this._row);
    rebindTenderService(this.ctx, this._row); this._inside = false; this._insideCrateId = null; this._readyToSecure = false; this._dismissed = false;
  },
  newGame() {
    this.bus.emit('salvageTender:reset', { reason: 'new-game' });
    this.physical.destroy(this._row); this._row = freshSalvageTender(); this.state.salvageTender = this._row;
    this._nextDiscoveryAt = 90;
    this._restoring = false; this._inside = false; this._insideCrateId = null; this._readyToSecure = false; this._dismissed = false; this._page = 'home'; this._hide();
  },
  destroy() {
    this.bus.emit('salvageTender:reset', { reason: 'destroy' });
    this._hide(); this.physical.dispose(this._row);
    this._releaseSaveAdapter?.();
    for (const off of this._subs) if (typeof off === 'function') off();
    this._subs.length = 0; owners.delete(this.state);
  },
};

/** Production encounter dispatcher: an offer introduces the persistent owner, never owns its
 * hull/cargo and never despawns the barge when the minor encounter finishes or times out. */
export const SALVAGE_TENDER_ENCOUNTER_RUNTIME = {
  fire(d, live, state) {
    const owner = owners.get(state);
    if (!owner) return d.abort(live, 'tender_owner_unavailable');
    const anchor = owner._row.discovered ? live.anchor : owner._encounterAnchor(live.anchor);
    if (!owner._row.discovered && !anchor) return d.abort(live, 'no_recovery_pocket');
    const result = owner.discover({ sectorId: live.sectorId, anchor });
    if (!result.ok) return d.abort(live, 'no_recovery_pocket');
    if (owner._row.owned) return d.resolve(live, 'already_home', { speak: false });
    live.phase = 'offer';
    live.deadlineAt = (state.simTime || 0) + 45;
    if (live.shape?.primaryLine) d.say?.(live, 'info', live.shape.primaryLine, {}, { literal: true, primary: true });
    d.offerChoices(live, ['inspect', 'decline'], 'decline', live.deadlineAt);
  },
  tick(d, live, state, now) {
    if (live.phase === 'offer' && now >= live.deadlineAt) this.choose(d, live, state, 'decline');
  },
  event() {},
  choose(d, live, state, choiceId) {
    if (live.phase !== 'offer' || !['inspect', 'decline'].includes(choiceId)) return;
    const owner = owners.get(state);
    live.phase = 'done';
    d.resolve(live, choiceId === 'inspect' ? 'inspected' : 'left', { speak: false });
    if (choiceId === 'inspect') {
      const result = owner?.inspect();
      if (!result?.ok) owner?._course('home');
    }
  },
};

export function getSalvageTenderOwner(state) { return owners.get(state) || null; }

/** Browser registries use fresh instances; headless hosts may still fork the definition. */
export function createSalvageTenderSystem() { return Object.create(salvageTender); }
