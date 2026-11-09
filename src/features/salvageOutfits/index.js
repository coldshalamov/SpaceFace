import { hash32 } from '../../core/rng.js';
import { OUTFITS, SALVAGE_PIECES, SALVAGE_SITUATIONS, SALVAGE_OUTFITS_LIMITS as L,
  outfit, piece, situation, poolTotal, SALVAGE_YARDS, distrustsPlayer } from './catalog.js';
import { freshSalvageOutfits, makeSalvageMeeting, normalizeSalvageOutfits,
  cloneSalvageOutfits } from './persistence.js';
import { createSalvageOutfitsPhysical } from './physical.js';
import { discoverSalvageOutfits } from './discovery.js';

const distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
const activeBody = b => b?.status === 'live';
const activeCrew = c => c && !['destroyed', 'departed'].includes(c.status);
const safeId = id => typeof id === 'string' && /^[\w:./-]{1,120}$/.test(id)
  && !['__proto__', 'constructor', 'prototype'].includes(id);
const publicChoice = (id, label, title, cancel = false) => ({ id, label, title, cancel });

/** One finite source owner. Workers/ropes/physics/cargo/credits retain their existing writers.
 * Register before npcJobsRuntime's UPDATE so a receiver witnesses a live line before a job cuts it.
 */
export const salvageOutfits = {
  name: 'salvageOutfits',
  init(ctx) {
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.registry = ctx.registry;
    this.helpers = ctx.helpers; this._subs = []; this._busy = false; this._restoring = false;
    this._shelving = false; this._destroyed = false; this._retired = new WeakSet();
    this._lastOfferAt = -100; this._radioSequence = 0; this._lastDiscoveryAt = -100;
    this._row = normalizeSalvageOutfits(ctx.state.salvageOutfits);
    this.state.salvageOutfits = this._row;
    this.physical = createSalvageOutfitsPhysical(ctx);
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      this._subs.push(typeof off === 'function' ? off : () => this.bus.off?.(event, fn));
    };
    on('salvageOutfits:start', p => this.start(p));
    on('salvageOutfits:choose', p => {
      const result = this.choose(p);
      if (!result.ok && p?.meetingId && this._row.meetings[p.meetingId]) {
        this._say('keel', 'Those terms changed while we worked. Scan a crew for the current offer.', 'warn');
      }
    });
    on('scan:completed', p => this._scan(p?.targetId));
    on('scan:pulse', () => this._scan(this.state.player?.targetId));
    on('mining:yield', p => this._mined(p));
    on('salvage:completed', p => this._lost(this.state.entities.get(p?.wreckId), 'salvaged'));
    on('entity:killed', p => this._lost(this.state.entities.get(p?.targetId ?? p?.entityId ?? p?.id), 'destroyed'));
    on('entity:destroyed', p => this._lost(p?.entity, p?.entity?.data?._salvaged ? 'salvaged' : 'destroyed'));
    on('combat:damage', p => this._damage(p));
    on('sector:exit', p => this._shelve(p));
    on('sector:enter', () => { this._lastOfferAt = -100; });
    on('save:restoring', () => { this._restoring = true; this._closeOffers(); });
    on('save:loaded', () => this.afterContinue());
  },

  _player() {
    const p = this.state.entities.get(this.state.playerId);
    return p?.alive !== false ? p : null;
  },
  _now() { return Number.isFinite(this.state.simTime) ? this.state.simTime : 0; },
  _present(m) {
    return [...Object.values(m.bodies), ...Object.values(m.crews)].some(r => this.physical.find(r.key));
  },
  _reachable(m) {
    return (m.sectorId === this.state.world?.currentSectorId || this._present(m))
      && distance(this._player()?.pos, m.anchor) <= L.offerRange;
  },
  _say(id, text, kind = 'info') {
    const crew = outfit(id);
    if (!crew) return;
    this.bus.emit('salvageOutfits:radio', { id: `${this.state.tick || 0}:${++this._radioSequence}`,
      crewId: id, sender: crew.name, factionId: crew.factionId, text, kind });
    this.bus.emit('comms:log', { from: crew.name, text, kind: 'salvage' });
  },
  _memory(id, kind, m, cause = kind) {
    const memory = this._row.memory[id];
    const eventId = `${m.id}:memory:${id}:${kind}`;
    if (!memory || m.receipts[eventId]) return;
    const event = { id: eventId, meetingId: m.id, kind, cause, at: this._now() };
    m.receipts[eventId] = { id: eventId, amount: 0, kind, at: event.at };
    memory[kind]++;
    memory.events.push(event); memory.events = memory.events.slice(-L.memoryEvents);
    memory.lastEvent = event;
  },

  start(payload = {}) {
    if (this._destroyed || this._restoring || this._busy) return { ok: false, reason: 'owner_unavailable' };
    const id = payload.encounterId || payload.meetingId;
    if (!safeId(id) || !safeId(payload.sectorId) || !SALVAGE_YARDS[payload.sectorId] || !Number.isFinite(payload.anchor?.x)
      || !Number.isFinite(payload.anchor?.z)) return { ok: false, reason: 'invalid_site' };
    if (this.state.mode !== 'flight' || this.state.world?.currentSectorId !== payload.sectorId) {
      return { ok: false, reason: 'not_in_sector' };
    }
    const old = this._row.meetings[id];
    if (old) return { ok: true, duplicate: true, meetingId: id };
    const all = Object.values(this._row.meetings);
    if (all.length >= L.meetings || all.filter(m => m.status === 'working').length >= L.activeMeetings) {
      return { ok: false, reason: 'site_budget' };
    }
    if (!this.helpers.npcJobs || !this.helpers.spawnBudget || !this.registry.get('economy')) {
      return { ok: false, reason: 'production_owners_required' };
    }
    if (this.helpers.spawnBudget.available() < OUTFITS.length) {
      return { ok: false, reason: 'crew_budget' };
    }
    const variant = payload.variant || SALVAGE_SITUATIONS[hash32(this.state.meta?.seed ?? this.state.seed ?? 1, id) % SALVAGE_SITUATIONS.length].id;
    const m = makeSalvageMeeting({ id, sectorId: payload.sectorId, anchor: payload.anchor,
      variant, now: this._now(), memory: this._row.memory });
    this._row.meetings[id] = m;
    this._materialize(m);
    for (const def of OUTFITS) {
      const memory = this._row.memory[def.id];
      const unhappy = distrustsPlayer(memory);
      this._say(def.id, unhappy ? memory.lastEvent?.cause === 'player_damage' ? def.damaged : def.cheated
        : memory.lastEvent?.kind === 'kept' && def.kept ? def.kept : memory.helped > 0 ? def.helped : def.greeting);
    }
    this._say('keel', `${situation(m.variant).line} Receiver is marked nearby. Tow an original in slowly for payment, or beam it for ordinary salvage.`);
    this.offer(id);
    this.bus.emit('salvageOutfits:started', { meetingId: id, variant: m.variant, sectorId: m.sectorId });
    return { ok: true, meetingId: id };
  },

  _materialize(m) {
    if (this._restoring) return;
    // Continuous membership changes retain nearby original bodies. The adapter can adopt
    // those bodies anywhere, but admits NEW bodies only in their own current sector.
    for (const def of SALVAGE_PIECES) {
      const b = m.bodies[def.id];
      if (!activeBody(b) || poolTotal(b.pool) <= 0) continue;
      const e = this.physical.ensureCargo(m, b, def);
      if (e) { b.entityId = e.id; b.generation = e.occupantGeneration; this._label(m, b, e); }
    }
    for (const def of OUTFITS) {
      const c = m.crews[def.id];
      if (!activeCrew(c)) continue;
      const e = this.physical.ensureActor(m, c, def);
      if (e) { c.entityId = e.id; c.generation = e.occupantGeneration;
        e.data.scanLabel = `${def.name} · ${c.status} · ${m.bodies[c.targetId]?.label || 'awaiting the next load'}`; }
    }
  },
  _label(m, b, e) {
    const name = b.claim === 'player' ? 'YOUR AGREEMENT' : outfit(b.claim)?.name || 'OPEN';
    e.data.scanLabel = `${b.label} · ${name} · ${poolTotal(e.data.salvagePool)} salvage`;
    e.data.salvageOutfitClaim = b.claim;
    e.data.salvageOutfitReceiver = m.receiver;
  },
  _capture(m) {
    if (this._restoring || this._shelving) return;
    for (const b of Object.values(m.bodies)) {
      if (!activeBody(b)) continue;
      const e = this.physical.find(b.key);
      if (!e) continue;
      const snapshot = this.physical.capture(e);
      // The live source only loses units. A third-party annotation cannot refill this original.
      snapshot.pool = Object.fromEntries(Object.keys(piece(b.id).pool).map(id =>
        [id, Math.min(b.pool[id] || 0, snapshot.pool[id] || 0)]));
      Object.assign(b, snapshot); b.entityId = e.id; b.generation = e.occupantGeneration;
      if (this.physical.playerLine(e)) {
        if (b.claim !== 'player') this._breach(m, b, b.claim);
        b.claim = 'player'; b.claimUntil = this._now() + 10;
      } else if (b.claim === 'player' && !this._contractReserves(m, b)) {
        if (b.claimUntil == null) b.claimUntil = this._now() + 10;
        if (this._now() >= b.claimUntil && this.physical.nativeReady(e)) {
          // Touching and abandoning every cable must not freeze the whole finite race forever.
          b.claim = null; b.claimUntil = null;
        }
      }
      this._label(m, b, e);
      if (poolTotal(b.pool) === 0) this._lost(e, e.data._salvaged ? 'salvaged' : 'destroyed');
    }
    for (const c of Object.values(m.crews)) {
      const e = this.physical.find(c.key);
      if (!e) continue;
      const { pool, ...pose } = this.physical.capture(e);
      Object.assign(c, pose); c.entityId = e.id; c.generation = e.occupantGeneration;
    }
  },

  _contractReserves(m, b) {
    if (b.id === 'cache' && m.crews.latch.favorsPlayer) return true;
    const a = m.agreement;
    if (!a || a.status === 'broken') return false;
    return a.type === 'rescue' ? b.id === 'core' : b.id !== 'core';
  },

  update(dt) {
    if (this._destroyed || this._restoring || this.state.mode !== 'flight' || this.state.timeScale === 0) return;
    if (this._now() - this._lastDiscoveryAt >= 0.5) {
      this._lastDiscoveryAt = this._now(); discoverSalvageOutfits(this.ctx);
    }
    const sector = this.state.world?.currentSectorId;
    const step = Math.max(0, Math.min(0.25, Number(dt) || 0));
    for (const m of Object.values(this._row.meetings)) {
      if (m.sectorId !== sector && !this._present(m)) continue;
      this._materialize(m); this._capture(m);
      if (m.status === 'complete') { this._depart(m); continue; }
      for (const def of OUTFITS) this._work(m, def, step);
      this._receivePlayer(m);
      this._settleAgreement(m);
      if (Object.values(m.bodies).every(b => !activeBody(b))) {
        m.status = 'complete'; this._closeOffer(m);
        for (const c of Object.values(m.crews)) {
          const actor = this.physical.find(c.key);
          if (actor) this.physical.stop(actor);
          if (activeCrew(c)) { c.status = 'departing'; c.targetId = null; }
        }
        this._say('keel', 'That wreck is worked. What each of us recovered is in the receiving ledger; nothing will grow back here.');
        this.bus.emit('salvageOutfits:completed', { meetingId: m.id });
      }
      if (!m.offer && !m.agreement && this._now() - this._lastOfferAt > 45
        && distance(this._player()?.pos, m.anchor) <= L.offerRange) this.offer(m.id);
    }
  },

  _depart(m) {
    for (const c of Object.values(m.crews)) {
      if (!activeCrew(c)) continue;
      const actor = this.physical.find(c.key);
      if (!actor) continue;
      c.status = 'departing'; c.targetId = null;
      const destination = { x: m.receiver.x + 900, z: m.receiver.z + (c.id === 'keel' ? -120 : 120) };
      const result = this.physical.navigate(actor, destination);
      if (result.arrived && distance(this._player()?.pos, actor.pos) > 700
        && !this.physical.hasActiveLines?.(actor)) {
        const { pool, ...pose } = this.physical.capture(actor); Object.assign(c, pose);
        c.status = 'departed'; c.entityId = null; this._retired.add(actor);
        this.physical.remove(actor);
      }
    }
  },

  _retarget(m, c) {
    if (c.status === 'stalled') return;
    const order = c.id === 'keel' ? ['core', 'frame', 'cache'] : ['cache', 'frame', 'core'];
    const available = order.filter(id => {
      const b = m.bodies[id];
      if (!activeBody(b) || b.claim === 'player' || (c.favorsPlayer && id === 'cache')) return false;
      if (c.cautious && piece(id).mass > outfit(c.id).safeMass) return false;
      if (m.agreement?.status === 'active' && b.claim && b.claim !== c.id) return false;
      if (m.agreement?.status === 'active' && m.agreement.type === 'cooperate' && id !== 'core') return false;
      return !Object.values(m.crews).some(other => other !== c && other.targetId === id
        && ['approach', 'tow'].includes(other.status));
    });
    c.targetId = available[0] || null; c.towSeconds = 0;
    c.status = c.targetId ? 'approach' : 'idle';
    if (c.targetId) {
      m.bodies[c.targetId].claim = c.id;
      this._say(c.id, `Changing course: ${m.bodies[c.targetId].label}. You can see my approach.`);
    }
  },
  _work(m, def, dt) {
    const c = m.crews[def.id], actor = this.physical.find(c.key);
    if (!activeCrew(c) || !actor || this._now() < c.startsAt) return;
    if (c.status === 'stalled') { this.physical.stop(actor); return; }
    if (c.status === 'idle' || !activeBody(m.bodies[c.targetId])) {
      this.physical.cancelTow(actor); this._retarget(m, c);
    }
    const b = m.bodies[c.targetId], target = b && this.physical.find(b.key);
    if (!activeBody(b) || !target) { this.physical.stop(actor); return; }
    if (b.claim === 'player' || this.physical.playerLine(target)) {
      if (this.physical.playerLine(target) && b.claim !== 'player') {
        this._breach(m, b, c.id); b.claim = 'player';
        this._say(c.id, 'Your cable has the original. I am looking for another piece.');
      }
      this.physical.cancelTow(actor); this._retarget(m, c); return;
    }
    const line = this.physical.line(actor, target);
    if (line) {
      if (c.status !== 'tow') this._say(c.id, `${b.label} on the cable. Taking it to the marked receiver.`);
      c.status = 'tow'; c.towSeconds += dt;
      // Failure needs a real load on a real line. The mass limit is known before the attempt.
      if (c.id === 'latch' && piece(b.id).mass > def.safeMass && !c.overcommitted
        && c.towSeconds >= L.overloadSeconds) {
        c.overcommitted = true; c.stalls++; c.status = 'stalled';
        this.physical.cancelTow(actor); b.claim = null;
        this._say('latch', 'Too much cradle. Cable slipped. It is still there—bring that same piece in and I will pay for the rescue.', 'warn');
        this._closeOffer(m);
        this.offer(m.id, 'rescue');
        this.bus.emit('salvageOutfits:mistake', { meetingId: m.id, crewId: c.id, bodyKey: b.key });
        return;
      }
      if (this.physical.withinDelivery(actor, target, m.receiver)) this._deliver(m, b, c.id, actor);
      return;
    }
    if (c.status === 'tow') {
      c.status = 'approach'; c.stalls++;
      this._say(c.id, 'Lost the line. Reapproaching the same original; the cargo is still loose.');
    }
    if (this._now() - c.lastRequestAt >= 0.5) {
      c.lastRequestAt = this._now();
      const result = this.physical.requestTow(actor, target, m.receiver, `${m.id}:tow:${c.id}:${b.id}`);
      if (!result.granted && ['target_already_hired', 'target_claimed', 'crew_already_committed',
        'another_crew_is_working_this_original'].includes(result.reason)) {
        this._retarget(m, c);
      }
    }
  },

  _receivePlayer(m) {
    const player = this._player();
    if (!player) return;
    for (const b of Object.values(m.bodies)) {
      const e = activeBody(b) && this.physical.find(b.key);
      if (e && this.physical.withinDelivery(player, e, m.receiver)) this._deliver(m, b, 'player', player);
    }
  },
  _deliver(m, b, by, actor) {
    const receiptId = `${m.id}:delivery:${b.id}`;
    const entity = this.physical.find(b.key), economy = this.registry.get('economy');
    if (this._busy || !activeBody(b) || m.receipts[receiptId] || !entity || !economy?.grantCredits
      || !this.physical.withinDelivery(actor, entity, m.receiver)) return { ok: false, reason: 'physical_handover_required' };
    this._busy = true;
    try {
      if (by === 'player') this._breach(m, b, b.claim);
      const units = Object.entries(b.pool).reduce((sum, [id, remaining]) =>
        sum + Math.min(remaining, Math.max(0, Number(entity.data.salvagePool?.[id]) || 0)), 0);
      const amount = by === 'player' ? Math.floor(units * 8) : 0;
      // Reserve before a synchronous stock/payout callback can reenter this original.
      b.status = 'delivered'; b.deliveredBy = by;
      m.receipts[receiptId] = { id: receiptId, amount, at: this._now(), kind: 'delivery' };
      const result = this.physical.intake(m, b, entity);
      if (!result.ok) {
        b.status = 'live'; b.deliveredBy = null; delete m.receipts[receiptId];
        return { ok: false, reason: result.reason };
      }
      b.pool = {}; this._retired.add(entity);
      this.physical.cutLines(entity, 'salvage_outfit_received');
      this.physical.remove(entity); b.entityId = null;
      if (!m.agreement || m.agreement.status !== 'active') this._closeOffer(m);
      if (by === 'player') economy.grantCredits(amount, `salvageOutfits:${receiptId}`);
      else {
        const c = m.crews[by];
        if (c) { this.physical.cancelTow(actor); c.status = 'idle'; c.targetId = null; }
      }
      this._say(by === 'player' ? 'keel' : by, `${b.label} received${by === 'player' ? ` · ${amount} credits for ${units} remaining salvage` : ''}.`);
      this.bus.emit('salvageOutfits:delivered', { meetingId: m.id, pieceId: b.id, bodyKey: b.key,
        by, units, amount, intakeId: result.intakeId });
      return { ok: true, receiptId, amount };
    } finally { this._busy = false; }
  },

  offer(meetingId, kind = null) {
    const m = this._row.meetings[meetingId];
    if (!m || m.status === 'complete' || this._restoring || this.state.mode !== 'flight'
      || !this._reachable(m)) return false;
    if (m.offer) { this.bus.emit('salvageOutfits:offer', { ...m.offer, meetingId: m.id, offerId: m.offer.id }); return true; }
    if (m.agreement?.status === 'active') return false;
    const rescue = kind === 'rescue' || m.crews.latch.status === 'stalled';
    const distrust = distrustsPlayer(this._row.memory.keel);
    const bonus = rescue ? 50 + Math.min(40, this._row.memory.latch.helped * 10)
      : 80 + Math.min(60, this._row.memory.keel.helped * 15);
    let title, detail, choices, crewId;
    if (rescue && activeBody(m.bodies.core)) {
      crewId = 'latch'; title = 'A slipped cable, an honest bargain';
      detail = `Latchkey releases the drive cradle. Tow THAT original to the marked receiver, both ends slow. You keep its remaining salvage payment plus ${bonus} rescue credits. No delivery, no rescue fee. The other pieces remain available.`;
      choices = [publicChoice('rescue', 'TAKE THE RESCUE', 'No up-front fee. The original cradle must arrive intact enough to recover.'),
        publicChoice('refuse', 'LEAVE IT TO THEM', 'No hostility; the loose original stays in the world.'),
        publicChoice('cancel', 'CLOSE RADIO', 'Keep flying. No agreement.', true)];
    } else {
      crewId = 'keel'; title = 'Divide the work before the cables cross';
      detail = distrust
        ? 'Keel remembers the trouble at the last job. No joint contract this time. Work intentions are marked; the ordinary salvage and combat rules still apply.'
        : `SPLIT: Keel takes the drive cradle; radiator and tooling rack are yours. COOPERATE: deliver the radiator while Keel delivers the heavy cradle; earn its ordinary remaining-value payment plus ${bonus} credits ONLY if both originals arrive. Latchkey will respect the marked pieces. Beam work remains possible, but cannot fulfill an intact-delivery agreement.`;
      const canDivide = !distrust && activeBody(m.bodies.core) && activeBody(m.bodies.frame) && activeCrew(m.crews.keel);
      if (!distrust && !canDivide) detail = 'The first pieces have already changed hands. Remaining originals and work intentions are marked. Recover what is actually left; the ordinary salvage and combat rules apply.';
      choices = !canDivide ? [] : [publicChoice('split', 'SPLIT DISTINCT PIECES', 'Keel reserves the cradle; both smaller originals are yours.'),
        publicChoice('cooperate', 'WORK THE HEAVY LIFT', `Two physical deliveries. Joint bonus ${bonus} credits only after both arrive.`)];
      choices.push(publicChoice('refuse', 'RACE INDEPENDENTLY', 'No payment and no hostility. Crews continue working.'),
        publicChoice('cancel', 'CLOSE RADIO', 'No commitment; scan either crew to reopen.', true));
    }
    m.revision++;
    m.offer = { id: `${m.id}:offer:${m.revision}`, title, detail, choices, crewId, bonus, kind: rescue ? 'warn' : 'info' };
    this._lastOfferAt = this._now();
    this.bus.emit('salvageOutfits:offer', { ...m.offer, meetingId: m.id, offerId: m.offer.id });
    return true;
  },
  _closeOffer(m) {
    if (!m.offer) return;
    const id = m.offer.id; m.offer = null;
    this.bus.emit('salvageOutfits:offerClosed', { meetingId: m.id, offerId: id });
  },
  _closeOffers() { for (const m of Object.values(this._row.meetings)) this._closeOffer(m); },

  republishOffers() {
    for (const m of Object.values(this._row.meetings)) {
      if (m.offer && this._reachable(m)) {
        this.bus.emit('salvageOutfits:offer', { ...m.offer, meetingId: m.id, offerId: m.offer.id });
      }
    }
  },

  choose(payload = {}) {
    const m = this._row.meetings[payload.meetingId], offer = m?.offer;
    if (this._busy || this._restoring || this._destroyed || !m || !offer || payload.offerId !== offer.id
      || !offer.choices.some(c => c.id === payload.choiceId) || this.state.mode !== 'flight'
      || !this._reachable(m)) {
      return { ok: false, reason: 'stale_or_distant_offer' };
    }
    const choice = payload.choiceId;
    if (['cancel', 'refuse'].includes(choice)) {
      this._closeOffer(m); this._lastOfferAt = this._now();
      if (choice === 'refuse') this._say(offer.crewId, 'Understood. We keep working. Take your own line.');
      return { ok: true, committed: false };
    }
    if (choice === 'rescue' && (!activeBody(m.bodies.core) || m.crews.latch.status !== 'stalled')) {
      this._closeOffer(m); return { ok: false, reason: 'rescue_changed' };
    }
    if (['split', 'cooperate'].includes(choice) && (!activeBody(m.bodies.core)
      || !activeBody(m.bodies.frame) || !activeCrew(m.crews.keel))) {
      this._closeOffer(m); return { ok: false, reason: 'pieces_already_changed' };
    }
    this._busy = true;
    try {
      this._closeOffer(m);
      m.agreement = { type: choice, status: 'active', crewId: choice === 'rescue' ? 'latch' : 'keel',
        pieceId: choice === 'rescue' ? 'core' : 'frame', acceptedAt: this._now(), bonus: offer.bonus,
        receiptId: `${m.id}:agreement:${choice}` };
      for (const c of Object.values(m.crews)) {
        const actor = this.physical.find(c.key); if (actor) this.physical.cancelTow(actor);
      }
      if (choice === 'rescue') {
        m.bodies.core.claim = 'player';
        m.crews.keel.targetId = null; m.crews.keel.status = 'idle';
        this._say('latch', `The same cradle, slow at the receiver. ${offer.bonus} extra when it is actually home.`);
      } else {
        m.bodies.core.claim = 'keel'; m.bodies.frame.claim = 'player';
        if (activeBody(m.bodies.cache)) m.bodies.cache.claim = 'player';
        Object.assign(m.crews.keel, { targetId: 'core', status: 'approach', startsAt: this._now(), towSeconds: 0 });
        Object.assign(m.crews.latch, { targetId: null, status: 'idle' });
        this._say('keel', choice === 'split' ? 'Signed. Cradle for us, both small pieces for you. I will keep my cable out of your work.'
          : 'You bring the radiator. I will bring the cradle. Both originals across the receiver, then the bonus.');
      }
      this.bus.emit('salvageOutfits:agreement', { meetingId: m.id, ...m.agreement });
      return { ok: true, committed: true, agreement: cloneSalvageOutfits(m.agreement) };
    } finally { this._busy = false; }
  },

  _settleAgreement(m) {
    const a = m.agreement;
    if (!a || a.status !== 'active') return;
    const core = m.bodies.core, frame = m.bodies.frame;
    if (a.type === 'split') {
      if (core.status === 'delivered' && core.deliveredBy === 'keel'
        && [frame, m.bodies.cache].some(b => ['delivered', 'salvaged'].includes(b.status))) {
        a.status = 'complete'; this._memory('keel', 'kept', m, 'split_kept');
        this._say('keel', 'Clean split. You kept your word. That goes in our book.');
      } else if (!activeBody(core) && core.deliveredBy !== 'keel') a.status = 'broken';
      return;
    }
    const delivered = a.type === 'rescue'
      ? core.status === 'delivered' && core.deliveredBy === 'player'
      : core.status === 'delivered' && core.deliveredBy === 'keel' && frame.status === 'delivered' && frame.deliveredBy === 'player';
    const failed = a.type === 'rescue'
      ? !activeBody(core) && core.deliveredBy !== 'player'
      : ['destroyed', 'salvaged'].includes(core.status) || ['destroyed', 'salvaged'].includes(frame.status)
        || core.status === 'delivered' && core.deliveredBy !== 'keel'
        || frame.status === 'delivered' && frame.deliveredBy !== 'player'
        || m.crews.keel.status === 'destroyed';
    if (delivered && !m.receipts[a.receiptId]) {
      const economy = this.registry.get('economy');
      if (!economy?.grantCredits) return;
      a.status = 'complete'; m.receipts[a.receiptId] = { id: a.receiptId, amount: a.bonus, at: this._now(), kind: a.type };
      this._memory(a.crewId, 'helped', m, a.type);
      economy.grantCredits(a.bonus, `salvageOutfits:${a.receiptId}`);
      this._say(a.crewId, `${a.bonus} credits transferred. We recovered the actual load. Next time, you get better terms.`);
      if (a.type === 'rescue') { m.crews.latch.status = 'idle'; m.crews.latch.targetId = null; }
    } else if (failed) {
      a.status = 'broken';
      this._say(a.crewId, 'The joint job did not come home. Keep whatever you actually recovered; there is no completion bonus.');
    }
  },
  _breach(m, b, crewId) {
    const a = m.agreement;
    if (!a || a.status !== 'active' || !['split', 'cooperate'].includes(a.type) || b.id !== 'core' || crewId !== 'keel') return;
    a.status = 'broken'; this._memory('keel', 'cheated', m, 'promise_broken');
    this._say('keel', 'That was the cradle you promised us. I am cancelling the deal. We will remember; we are not starting a gunfight.', 'warn');
  },
  _mined(p) {
    if (this._restoring || p?.minerId !== this.state.playerId || !(p.qty > 0)) return;
    const candidates = [];
    for (const m of Object.values(this._row.meetings)) {
      if (m.sectorId !== this.state.world?.currentSectorId && !this._present(m)) continue;
      for (const b of Object.values(m.bodies)) {
        const e = activeBody(b) && this.physical.find(b.key);
        if (e && distance(e.pos, p.pos) < 0.01 && poolTotal(e.data.salvagePool) < poolTotal(b.pool)) {
          candidates.push({ m, b });
        }
      }
    }
    if (candidates.length !== 1) return; // A positional event cannot convict an ambiguous stacked original.
    const { m, b } = candidates[0];
    b.minedByPlayer = (b.minedByPlayer || 0) + p.qty;
    this._breach(m, b, b.claim);
    // mining:yield is emitted inside mining's transaction, before a refused pickup is
    // returned to the live pool. Capture at the next tick (or salvage:completed), not here.
  },
  _lost(e, status) {
    if (this._restoring || this._shelving || !e || this._retired.has(e) || e.data?.persistenceOwner !== 'salvageOutfits') return;
    const m = this._row.meetings[e.data.salvageOutfitMeetingId];
    if (!m) return;
    const isCrew = e.data.salvageOutfitKind === 'crew';
    const r = (isCrew ? m.crews : m.bodies)[e.data.salvageOutfitRecordId];
    if (!r || r.key !== e.data.salvageOutfitKey || r.entityId !== e.id
      || r.generation != null && r.generation !== e.occupantGeneration) return;
    if (isCrew) {
      if (r.status === 'destroyed') return;
      r.status = 'destroyed'; r.entityId = null; this.physical.cancelTow(e);
      for (const b of Object.values(m.bodies)) if (b.claim === r.id) b.claim = null;
      this._say(r.id, 'Hull lost. Our unreceived cargo is still out there.', 'warn');
    } else {
      if (!activeBody(r)) return;
      if (status === 'salvaged') this._breach(m, r, r.claim);
      r.status = status === 'salvaged' ? 'salvaged' : 'destroyed'; r.pool = {}; r.entityId = null;
      this.physical.cutLines(e, 'salvage_outfit_original_lost');
      this._say(r.claim === 'latch' ? 'latch' : 'keel', `${r.label} ${status === 'salvaged' ? 'was stripped into ordinary salvage' : 'is gone'}. Other pieces are still worth recovering.`);
    }
    this._closeOffer(m);
  },
  _damage(p) {
    if (this._restoring || (p?.sourceId ?? p?.attackerId) !== this.state.playerId) return;
    const e = this.state.entities.get(p?.targetId ?? p?.entityId);
    if (e?.data?.salvageOutfitKind !== 'crew') return;
    const m = this._row.meetings[e.data.salvageOutfitMeetingId], c = m?.crews[e.data.salvageOutfitCrewId];
    if (!c || c.lastProtestAt != null && this._now() - c.lastProtestAt < 12) return;
    c.lastProtestAt = this._now(); this._memory(c.id, 'cheated', m, 'player_damage');
    this._say(c.id, 'We are here for salvage. Stop firing. Your violence is still subject to the local law.', 'warn');
  },
  _scan(entityId) {
    const e = this.state.entities.get(entityId);
    let m = e?.data?.persistenceOwner === 'salvageOutfits' && this._row.meetings[e.data.salvageOutfitMeetingId];
    if (!m) m = Object.values(this._row.meetings).find(row => row.sectorId === this.state.world?.currentSectorId
      && distance(this._player()?.pos, row.anchor) <= L.offerRange);
    if (!m) return;
    if (m.status === 'complete') {
      if (!m.heardReturn) { m.heardReturn = true;
        const text = Object.values(m.bodies).map(b => `${b.label}: ${b.status === 'delivered' ? `received by ${outfit(b.deliveredBy)?.name || 'you'}` : b.status}`).join('; ');
        this._say('keel', text); }
    } else if (m.agreement?.status === 'active') {
      this._say(m.agreement.crewId, m.agreement.type === 'split' ? 'Your two small pieces are marked. Our cradle stays on our line.'
        : `Still waiting for the original ${piece(m.agreement.pieceId).label}. Receiver is marked; bring both ends in slowly.`);
    } else this.offer(m.id);
  },

  _shelve(payload) {
    if (this._restoring) return;
    if (payload?.continuous === true || payload?.continuousHandoff === true) {
      for (const m of Object.values(this._row.meetings)) {
        if (!this._present(m)) continue;
        this._capture(m); this._closeOffer(m);
      }
      return;
    }
    for (const m of Object.values(this._row.meetings)) {
      // An intentional jump also suspends surviving originals from a previous continuous
      // border crossing. Preserve their poses/pools, not an invisible stale throttle.
      if (!this._present(m)) continue;
      this._capture(m); this._closeOffer(m);
      this._shelving = true;
      try { for (const r of [...Object.values(m.bodies), ...Object.values(m.crews)]) {
        const e = this.physical.find(r.key);
        if (e) { this._retired.add(e); this.physical.cutLines(e, 'salvage_outfit_sector_suspend'); this.physical.remove(e); }
        r.entityId = null;
      } } finally { this._shelving = false; }
    }
  },
  serialize() {
    if (!this._restoring) for (const m of Object.values(this._row.meetings)) this._capture(m);
    const out = cloneSalvageOutfits(this._row);
    for (const m of Object.values(out.meetings)) {
      // A UI callback cannot survive Continue. The offer is recreated from the saved agreement.
      m.offer = null;
      for (const r of [...Object.values(m.bodies), ...Object.values(m.crews)]) {
        delete r.entityId; delete r.generation; delete r.jobId;
      }
    }
    return out;
  },
  deserialize(data) {
    this._closeOffers(); this._row = normalizeSalvageOutfits(data); this.state.salvageOutfits = this._row;
    this._lastOfferAt = -100;
  },
  afterContinue() {
    this.physical.resume?.({ clearBindings: true });
    this._restoring = false; this._lastOfferAt = -100; this._lastDiscoveryAt = -100;
    for (const m of Object.values(this._row.meetings)) {
      for (const r of [...Object.values(m.bodies), ...Object.values(m.crews)]) {
        if (r.status === 'live' || activeCrew(m.crews[r.id])) continue;
        const original = this.physical.find(r.key);
        if (original) {
          this._retired.add(original); this.physical.cutLines(original, 'salvage_outfit_terminal_restore');
          this.physical.remove(original); r.entityId = null;
        }
      }
      if (m.sectorId !== this.state.world?.currentSectorId && !this._present(m)) continue;
      this._materialize(m);
      if (!m.agreement || m.agreement.status !== 'active') this.offer(m.id);
    }
  },
  newGame() {
    this._closeOffers(); this._shelving = true;
    try { this.physical.dispose(); } finally { this._shelving = false; }
    this._row = freshSalvageOutfits(); this.state.salvageOutfits = this._row;
    this._retired = new WeakSet(); this._restoring = false; this._lastOfferAt = -100; this._lastDiscoveryAt = -100;
    this.physical = createSalvageOutfitsPhysical(this.ctx);
  },
  destroy() {
    if (this._destroyed) return;
    this._closeOffers(); this._shelving = true; this.physical.dispose();
    for (const off of this._subs.splice(0)) off();
    this._shelving = false; this._destroyed = true;
  },
};

export default salvageOutfits;
