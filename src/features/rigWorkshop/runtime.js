// RATCHET: one simulation owner for the bench, its machines and work orders.
// All decisions arrive through promptDeck; movement and contacts stay with native physics.
import { PART_LIST, PARTS, MOUNTS } from './parts.js';
import { createRigPhysicsAdapter, connectedPartIds } from './physics.js';
import { createWorkshopJobs, RIG_JOB_DEFS } from './jobs.js';
import { captureRigWorkshop, restoreRigWorkshop } from './persistence.js';
import { explainWorkshopReason, PART_BUTTONS } from './text.js';

const owners = new WeakMap();
const dist = (a, b) => Math.hypot((a?.x || 0) - (b?.x || 0), (a?.z || 0) - (b?.z || 0));
const clone = value => JSON.parse(JSON.stringify(value));
const finite = n => typeof n === 'number' && Number.isFinite(n);
const at = e => e && e.alive !== false && e.pos;
const speed = e => Math.hypot(e?.vel?.x || 0, e?.vel?.z || 0);
const BENCH_RADIUS = 150;
const cleanName = name => String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 32);

export function freshRigWorkshop(state) {
  return { version: 1, schemaVersion: 1, ownerId: `rig-workshop:${state.meta?.seed ?? state.seed ?? state.run?.seed ?? 0}`,
    bench: null, rigs: [], activeRigId: null, stock: 8, jobs: {}, activeJobId: null, receipts: [],
    introduced: false, templatesSeeded: false, signatureDone: false, preview: null, undo: null,
    prompt: null, revision: 0, declinedUntil: 0 };
}

export function isWorkshopAdventure(state) {
  return state.mode === 'flight' && !state.ui?.docked && state.timeScale !== 0
    && (!state.run?.kind || ['adventure', 'campaign'].includes(state.run.kind))
    && !state.survival?.active && !state.racing?.active && !state.race?.active
    && !state.orbitalGallery?.active && !state.kineticLeague?.active
    && !state.tutorial?.active && !state.replay?.active && !state._ephemeralRacing
    && !state.physicsVenueSession && !state.physicsVenue?.active;
}

/** The director and guaranteed ordinary-flight approach use the same owner, never duplicate yards. */
export const rigWorkshopEncounter = Object.freeze({
  fire(director, live, state) {
    const owner = owners.get(state);
    if (owner) owner.discover();
    if (typeof director?.resolve === 'function') director.resolve(live, 'workshop_charted', { speak: false });
  },
  tick() {},
});

export function createRigWorkshopSystem() {
  return {
    name: 'rigWorkshop',
    init(ctx) {
      const sequenceFloor = Math.max(this._sequence || 0, owners.get(ctx.state)?._sequence || 0,
        ctx.state.rigWorkshop?.prompt?.revision || 0);
      this.destroy();
      const prior = owners.get(ctx.state);
      if (prior && prior !== this) prior.destroy();
      this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this.state.rigWorkshop ||= freshRigWorkshop(this.state);
      this.physics = createRigPhysicsAdapter(ctx);
      this.jobs = createWorkshopJobs({ state: this.state, bus: this.bus, physics: this.physics,
        feedback: (kind, text, position) => this.feedback(kind, text, position) });
      this._unsubs = []; this._actions = new Map(); this._sequence = sequenceFloor;
      this._lastRefresh = -Infinity; this._near = false; this._wasFlying = false; this._farPromptOffered = false;
      const on = (name, fn) => this._unsubs.push(this.bus.on(name, fn));
      on('rigWorkshop:choose', payload => this.choose(payload));
      on('rigWorkshop:edited', payload => {
        this.feedback('edit', payload?.text || 'Connection made. The new mass is real. Take it for a short pull before accepting a load.');
        this._showBench();
      });
      on('rigWorkshop:failed', payload => { this.feedback('reject', explainWorkshopReason(payload?.reason || 'Connection did not seat; no stock spent.')); this._showBench(); });
      on('rigWorkshop:strain', () => this.feedback('warning', 'Connection straining. Ease thrust, straighten the tow, or shorten the lever arm.'));
      on('rigWorkshop:jointBroken', () => this.feedback('warning', 'A joint let go. Cut power and recover the original loose part; the rest of the rig is still yours.'));
      on('entity:killed', receipt => this.jobs.recordLoss(this.workshop, receipt));
      on('sector:exit', () => this._close());
      on('player:docked', () => this._close());
      on('save:restoring', () => this._close());
      on('save:loaded', () => { this._near = false; this._lastRefresh = -Infinity; this._close(); });
      on('game:newGame', () => this.newGame());
      owners.set(this.state, this);
    },

    get workshop() { return this.state.rigWorkshop; },
    get activeRig() { return this.workshop.rigs.find(r => r.id === this.workshop.activeRigId) || this.workshop.rigs[0] || null; },
    get player() { return this.state.entities?.get(this.state.playerId); },
    _home() { return this.workshop.bench?.sectorId === this.state.world?.currentSectorId; },
    _atBench() { return this._home() && at(this.player) && dist(this.player.pos, this.workshop.bench.pos) <= BENCH_RADIUS; },
    _rigAtBench() {
      const rig = this.activeRig;
      return !!rig && rig.partIds.every(id => {
        const e = this.state.entities?.get(id);
        return !e || e.alive === false || dist(e.pos, this.workshop.bench.pos) <= BENCH_RADIUS + 50;
      });
    },
    _editable() {
      if (!this._atBench()) return 'Return to the physical bench to change a rig.';
      if (this.activeRig?.power) return 'Cut mover power before changing this rig.';
      if (!this._rigAtBench()) return 'The selected rig is still outside the yard. Recover and tow it back first.';
      if (speed(this.player) > 8) return 'Brake before changing connections.';
      return null;
    },

    discover() {
      if (!isWorkshopAdventure(this.state)) return false;
      this.place();
      if (!this.workshop.bench) return false;
      this.workshop.introduced = true;
      if (this._atBench()) this._showBench(); else this._showIntro();
      return true;
    },

    place() {
      const w = this.workshop;
      if (!w.bench) {
        const player = this.player, sectorId = this.state.world?.currentSectorId;
        if (!at(player) || !sectorId) return false;
        // A stable physical pocket near the first ordinary approach, found once and then saved.
        // We never chase the player with a moving workshop.
        const candidates = [];
        for (let ring = 0; ring < 3; ring += 1) for (let i = 0; i < 12; i += 1) {
          const angle = i * Math.PI / 6, radius = 190 + ring * 110;
          candidates.push({ x: player.pos.x + Math.cos(angle) * radius, z: player.pos.z + Math.sin(angle) * radius });
        }
        const clear = p => !(this.state.entityList || []).some(e => e.alive !== false && e.collides !== false
          && e.id !== this.state.playerId && dist(e.pos, p) < (e.radius || 1) + 110);
        const pos = candidates.find(clear);
        if (!pos) return false; // retry after the player leaves the crowded start pocket
        w.bench = { sectorId, pos, entityId: null };
      }
      if (!this._home()) return false;
      if (!w.bench.entityId) {
        const p = w.bench.pos;
        const e = this.physics.spawnBody({ type: 'payload', pos: { x: p.x, z: p.z + 90 },
          radius: 22, mass: 100000, hull: 10000, hullMax: 10000, collides: true,
          flags: { persistent: true, invuln: true },
          physicsBody: { schemaVersion: 1, dynamic: false, shape: 'ball', radius: 22, mass: 100000, material: 'wreck', revision: 0 },
          data: { name: 'RATCHET · Physical Rig Workshop', placeId: 'place_maintenance_gantry', placeTargetRadius: 22,
            poi: true, rigWorkshopOwner: w.ownerId, rigWorkshopRole: 'bench', persistenceOwner: 'rigWorkshop',
            sectorId: w.bench.sectorId, homeSectorId: w.bench.sectorId, transientSector: false, salvagePool: {}, payloadType: 'rig_workshop' } });
        if (e) w.bench.entityId = e.id;
      }
      // The physics adapter owns a durable creation latch. Re-entry cannot copy the loan machines.
      this.physics.ensureTemplates(w);
      if (!w.activeRigId && w.rigs.length) w.activeRigId = w.rigs[0].id;
      return true;
    },

    update(dt, state = this.state) {
      if (state !== this.state || !finite(dt) || dt <= 0) return;
      const flying = isWorkshopAdventure(state);
      if (!flying) { if (this._wasFlying) this._close(); this._wasFlying = false; this._near = false; return; }
      this._wasFlying = true;
      this.place();
      this.physics.update(dt, this.workshop);
      this.jobs.update(this.workshop);
      const now = state.simTime || 0;
      const near = this._atBench();
      if (near) this._farPromptOffered = false;
      if (near && !this._near && now >= (this.workshop.declinedUntil || 0)) {
        this.workshop.introduced = true;
        this._showBench();
      } else if (!this.workshop.introduced && this.workshop.bench && now >= (this.workshop.declinedUntil || 0)) {
        this.workshop.introduced = true;
        this._showIntro();
      } else if (!near && this._near && this._page !== 'intro') {
        this.physics.cancelPreview(this.workshop);
        this._close();
      }
      this._near = near;
      // Field verbs stay reachable through the same deck once the bench falls behind.
      if (!near && this.activeRig && !this.workshop.prompt && now >= (this.workshop.declinedUntil || 0)) {
        const body = this.activeRig.partIds.map(id => state.entities.get(id)).find(e => at(e));
        if (body && dist(body.pos, this.player?.pos) < 150) { this._farPromptOffered = false; this._showField(); }
        else if (!this._farPromptOffered) { this._farPromptOffered = true; this._showAway(); }
      }
      if (now - this._lastRefresh >= 0.75) {
        this._lastRefresh = now;
        if (this._page === 'field') this._showField();
        else if (this._page === 'bench') this._showBench();
        else if (this._page === 'preview') {
          const preview = this.workshop.preview;
          if (preview) this.physics.previewEdit(this.workshop, preview);
          this._showPreview();
        }
      }
    },

    choose(payload) {
      const prompt = this.workshop.prompt;
      if (!prompt || payload?.promptId !== prompt.id || payload.revision !== prompt.revision) return false;
      const action = this._actions.get(payload.choiceId);
      if (!action) return false;
      this._actions.clear(); // consume before action; repeated taps cannot commit twice
      action();
      // A refusal may occur between showing a choice and pressing it (the rig
      // moved, power changed, or the player crossed the yard edge). The deck has
      // consumed that page; always leave the pilot another usable route.
      if (this.workshop.prompt && !this._actions.size) {
        if (!isWorkshopAdventure(this.state)) { this._close(); this._near = false; }
        else this._atBench() ? this._showBench() : this._showField();
      }
      return true;
    },

    dispatch(action, args = {}) {
      if (!isWorkshopAdventure(this.state)) return { ok: false, reason: 'Workshop controls are available during Adventure flight.' };
      const w = this.workshop;
      const rig = this.activeRig;
      const previousNotice = w.notice;
      const editActions = new Set(['part', 'preview', 'commit', 'undo', 'repair', 'rename']);
      if (editActions.has(action)) {
        const reason = this._editable();
        if (reason) { this.feedback('reject', reason); this._showBench(); return { ok: false, reason }; }
      }
      let result = { ok: true };
      if (action === 'open') { this.place(); this._atBench() ? this._showBench() : this._showIntro(); }
      else if (action === 'visit') { this.jobs.guide(w, 'bench'); this._close(); }
      else if (action === 'later' || action === 'close') {
        this.physics.cancelPreview(w); w.declinedUntil = (this.state.simTime || 0) + 20; this._close();
      } else if (action === 'selectRig') {
        if (!w.rigs.some(r => r.id === args.rigId)) return { ok: false, reason: 'That rig is not in your workshop.' };
        this.physics.cancelPreview(w); w.activeRigId = args.rigId; this._atBench() ? this._showBench() : this._showField();
      } else if (action === 'part') {
        this._part = args.partType;
        if (rig && !rig.partIds.length && this._part === 'frame') {
          this._parent = null;
          result = this.physics.previewEdit(w, { rigId: rig.id, partType: 'frame', mount: 'front' });
          this._showPreview();
        } else this._showParents();
      }
      else if (action === 'preview') {
        result = this.physics.previewEdit(w, { rigId: rig?.id, partType: args.partType || this._part,
          parentId: args.parentId ?? this._parent, mount: args.mount || 'front' });
        this._showPreview();
      } else if (action === 'commit') { result = this.physics.commitPreview(w); this._showBench(); }
      else if (action === 'cancel') { result = this.physics.cancelPreview(w) || { ok: true }; this._showBench(); }
      else if (action === 'undo') { result = this.physics.undoEdit(w); if (result.ok) this.feedback('undo', 'Last edit undone. Its reclaimed part is back on the bench.'); this._showBench(); }
      else if (action === 'repair') { result = this.physics.repair(w, rig?.id); if (result.ok) this.feedback('repair', 'Repair work recorded. Nearby broken connections are being reseated; loose parts keep their identity.'); this._showBench(); }
      else if (action === 'couple') { result = this.physics.coupleShip(w, rig?.id); this._atBench() ? this._showBench() : this._showField(); }
      else if (action === 'release') { result = this.physics.releaseShip(w, rig?.id); this._atBench() ? this._showBench() : this._showField(); }
      else if (action === 'power') { result = this.physics.setPower(w, rig?.id, args.on ?? !rig?.power); this._atBench() ? this._showBench() : this._showField(); }
      else if (action === 'jobs') this._showJobs();
      else if (action === 'acceptJob') {
        if (!this._atBench()) return { ok: false, reason: 'Accept a work order at the bench.' };
        result = this.jobs.accept(w, args.id); this._showField();
      } else if (action === 'capture') {
        const job = w.jobs[w.activeJobId];
        const originalIds = new Set((job?.cargo || []).filter(c => !c.paid && !c.lost).map(c => c.id));
        const candidates = (this.state.entityList || []).filter(e => {
          if (!at(e) || e.type !== 'payload' || e.data?.rigWorkshop || e.physicsBody?.dynamic === false
            || e.data?.rigWorkshopCargo?.delivered || e.data?.rigWorkshopDelivered) return false;
          if (originalIds.has(e.id)) return true;
          const owner = e.data?.rigWorkshopCargo?.ownerId ?? e.data?.ownerId ?? e.ownerId;
          return !e.data?.rigWorkshopJob && (owner === w.ownerId || owner === this.state.playerId);
        });
        const rigBodies = (rig?.partIds || []).map(id => this.state.entities.get(id)).filter(e => at(e));
        const cargo = args.cargoId ? candidates.find(e => e.id === args.cargoId) : candidates
          .filter(e => !(w.rigs || []).some(r => this.physics.isCargoSecured(w, r.id, e.id)))
          .sort((a, b) => Math.min(...rigBodies.map(p => dist(p.pos, a.pos))) - Math.min(...rigBodies.map(p => dist(p.pos, b.pos))))[0];
        result = cargo ? this.physics.captureCargo(w, rig?.id, cargo.id) : { ok: false, reason: job
          ? 'No unsecured original cargo is available. Mark the remaining cargo, or bring your own loose payload to the rig.'
          : 'Approach a loose payload you own, or accept an outside job at the bench.' };
        if (result.ok) { this.jobs.update(w); this.feedback('edit', 'Cargo secured. The original body and its mass now pull through your connections.'); }
        this._showField();
      } else if (action === 'releaseCargo') {
        const cargoId = args.cargoId ?? rig?.cargoIds?.[rig.cargoIds.length - 1];
        result = this.physics.releaseCargo(w, rig?.id, cargoId); this._showField();
      } else if (action === 'deliver') { result = this.jobs.deliver(w); this._showField(); }
      else if (action === 'finishPartial') { result = this.jobs.settlePartial(w); this._showJobs(); }
      else if (action === 'guide') {
        if (!args.target && w.activeJobId) this._showGuide();
        else { result = this.jobs.guide(w, args.target); this._showField(); }
      }
      else if (action === 'recover') {
        const broken = (rig?.connections || []).find(c => c.state === 'broken' || c.state === 'detached');
        const joined = rig ? connectedPartIds(rig) : new Set();
        const loose = (rig?.partIds || []).map(id => this.state.entities.get(id))
          .filter(e => at(e) && !joined.has(e.id)).sort((a, b) => dist(a.pos, this.player?.pos) - dist(b.pos, this.player?.pos));
        const body = loose[0] || this.state.entities.get(broken?.childId ?? rig?.partIds?.[0]);
        const recovered = this.physics.recover?.(w, rig?.id);
        if (recovered?.ok) result = recovered;
        else if (body && body.alive !== false) {
          this.bus.emit('ui:setCourse', { pos: { x: body.pos.x, z: body.pos.z }, label: `${rig.name} · RECOVERY`,
            reason: 'Approach the surviving assembly, couple at low speed, and tow it back to the bench.', waypointKind: 'local', autopilot: false, targetEntityId: body.id });
          this.feedback('recover', 'Marked the original surviving body. Recovery moves the same machine; it does not copy it.');
        } else result = { ok: false, reason: 'No part survived. Mark the workshop and fit a new keel using reclaimed stock; this machine keeps its name and history.' };
        this._atBench() ? this._showBench() : this._showField();
      } else if (action === 'rename') {
        const name = cleanName(args.name);
        if (!rig || !name) return { ok: false, reason: 'Give the rig a readable name.' };
        rig.name = name; rig.revision = (rig.revision || 0) + 1; this._showBench();
      } else return { ok: false, reason: 'Unknown workshop action.' };
      if (result?.ok === false) this.feedback('reject', explainWorkshopReason(result.reason));
      else if (w.notice && w.notice !== previousNotice && ['commit', 'couple', 'power', 'recover'].includes(action))
        this.feedback(action === 'recover' ? 'recover' : 'edit', w.notice);
      w.revision = (w.revision || 0) + 1;
      this.bus.emit('rigWorkshop:changed', { revision: w.revision, action });
      return result || { ok: true };
    },

    feedback(kind, text, position) {
      this.bus.emit('rigWorkshop:feedback', { id: `rig-feedback:${++this._sequence}`, kind, text,
        ...(position ? { position: { x: position.x, z: position.z } } : {}) });
      this.workshop.lastFeedback = { kind, text, time: this.state.simTime || 0 };
    },
    _show(page, title, detail, options, status = null) {
      if (!isWorkshopAdventure(this.state)) return;
      const signature = JSON.stringify({ page, title, detail, status, options: options.map(({ id, label, disabled, cancel }) => ({ id, label, disabled, cancel })) });
      if (this._promptSignature === signature && this.workshop.prompt && this._actions.size) return;
      this._page = page; this._promptSignature = signature;
      const revision = ++this._sequence;
      this._actions = new Map(options.filter(o => !o.disabled).map(o => [o.id, o.run]));
      this.workshop.prompt = { id: 'rig-workshop', title, detail, status, revision,
        options: options.map(({ run, ...spec }) => spec) };
      this.bus.emit('rigWorkshop:prompt', clone(this.workshop.prompt));
    },
    _option(id, label, action, args, extra = {}) { return { id, label, run: () => this.dispatch(action, args), ...extra }; },
    _close() {
      if (this.workshop?.prompt) this.bus.emit('rigWorkshop:promptClosed', { id: this.workshop.prompt.id });
      if (this.workshop) this.workshop.prompt = null;
      this._actions?.clear(); this._page = null; this._promptSignature = null;
    },
    _showIntro() {
      this._show('intro', 'RATCHET · A workshop, two loan machines',
        'Build something useful out of six real parts. Inspect a salvage cradle or powered sled, change a connection, then take a paid job beyond the yard. No fitting fee; eight reclaimed parts are on the bench.', [
          this._option('visit', 'Mark the nearby bench', 'visit'),
          this._option('later', 'Not now', 'later', {}, { cancel: true }),
        ]);
    },
    _showBench() {
      if (!this._atBench()) { this._showField(); return; }
      const w = this.workshop, rig = this.activeRig;
      if (!rig) { this._show('bench', 'RATCHET · Bringing the rigs out', 'The original bodies are entering the yard. Hold position.', [this._option('close', 'Keep flying', 'close', {}, { cancel: true })]); return; }
      const live = rig.partIds.map(id => this.state.entities.get(id)).filter(e => at(e));
      const mass = Math.round(live.reduce((sum, e) => sum + (e.mass || 0), 0));
      const damaged = live.filter(e => e.hull < e.hullMax).length;
      this._show('bench', `${rig.name} · ${rig.partIds.length} real parts`,
        `${mass} mass units before cargo · ${w.stock} reclaimed parts available${damaged ? ` · ${damaged} damaged` : ''}. ${rig.template === 'sled' ? 'A powered mover helps carry the load; an uneven load still twists the hitch.' : 'A cradle catches awkward cargo; extending it makes the corners harder to clear.'}`,
        [
          { id: 'edit', label: 'Build · six parts', run: () => this._showParts() },
          this._option('couple', 'Couple ship', 'couple'),
          this._option('release', 'Release tow', 'release'),
          this._option('power', rig.power ? 'Cut mover power' : 'Enable movers', 'power'),
          { id: 'care', label: 'Repair · undo · name', run: () => this._showCare() },
          { id: 'rigs', label: 'Choose machine', run: () => this._showRigs() },
          this._option('jobs', 'Outside jobs', 'jobs'),
          this._option('close', 'Take a test pull', 'close', {}, { cancel: true }),
        ], 'Brake before editing');
    },
    _showParts() {
      const empty = !this.activeRig?.partIds.length;
      this._show('parts', empty ? 'A new keel · the same name' : 'Six parts · one honest machine',
        empty ? 'The original machine was lost. Fit one new keel from your reclaimed stock, then build around it. Its name and history stay with you.'
          : 'Choose a part, then an existing parent and a mounting position. Preview is free; stock is spent only after the native connection seats.',
        [...PART_LIST.map(p => this._option(`part:${p.id}`, PART_BUTTONS[p.id], 'part', { partType: p.id }, { disabled: empty && p.id !== 'frame' })),
          this._option('cancel', 'Back to rig', 'cancel', {}, { cancel: true })]);
    },
    _showParents() {
      const rig = this.activeRig, part = PARTS[this._part];
      if (!part || !rig) return this._showParts();
      this._show('parent', `${part.label} · choose a connection`, part.cue || part.purpose,
        [...rig.partIds.map((id, i) => ({ id: `parent:${id}`, label: `${i + 1}. ${PARTS[this.state.entities.get(id)?.data?.rigWorkshop?.partType]?.label || 'Surviving part'}`,
          run: () => { this._parent = id; this._showMounts(); } })), this._option('cancel', 'Cancel', 'cancel', {}, { cancel: true })]);
    },
    _showMounts() {
      const mounts = Array.isArray(MOUNTS) ? MOUNTS : Object.keys(MOUNTS).filter(m => !['left', 'right'].includes(m));
      this._show('mount', 'Where should it sit?', 'Front and rear keep the load in line. Side mounts add reach and twisting load. Extended reach buys clearance at the cost of leverage.',
        [...mounts.map(m => this._option(`mount:${typeof m === 'string' ? m : m.id}`, typeof m === 'string' ? ({ front: 'Front', rear: 'Rear', port: 'Left', starboard: 'Right', reach: 'Extended reach' }[m] || m) : m.label,
          'preview', { parentId: this._parent, mount: typeof m === 'string' ? m : m.id })), this._option('cancel', 'Cancel', 'cancel', {}, { cancel: true })]);
    },
    _showPreview() {
      const p = this.workshop.preview;
      if (!p) return this._showBench();
      this._show('preview', `${p.valid ? 'Connection preview' : 'Cannot connect here'} · ${PARTS[p.partType]?.label || 'Part'}`,
        p.valid ? `${(p.warnings || []).join(' ') || 'The outline shows the real collision footprint. This part will add mass at this exact location.'} Costs one reclaimed part after the connection seats.` : explainWorkshopReason(p.reason),
        [this._option('commit', 'Fit this part', 'commit', {}, { disabled: !p.valid }),
          { id: 'mounts', label: p.seed ? 'Choose a part' : 'Try another position', run: () => p.seed ? this._showParts() : this._showMounts() },
          this._option('cancel', 'Cancel · spend nothing', 'cancel', {}, { cancel: true })],
        p.valid ? 'Preview · no stock spent' : 'Invalid · no stock spent');
    },
    _showCare() {
      this._show('care', `${this.activeRig?.name || 'Rig'} · keep it working`,
        'Undo affects the most recent fitting across both rigs. Repair surviving parts, or locate the original loose assembly. Recovery keeps its scars and identity.', [
          this._option('undo', 'Undo last workshop fit', 'undo', {}, { disabled: !this.workshop.undo }),
          this._option('repair', 'Repair · reseat parts', 'repair'),
          this._option('recover', 'Recover originals', 'recover'),
          { id: 'name', label: 'Name this machine', run: () => this._show('name', 'Name your machine', 'Its identity remains the same through damage, repair, and Continue.',
            ['Little Mule', 'Bad Idea, Improved', 'The Patient Argument'].map(name => this._option(`name:${name}`, name, 'rename', { name })).concat(this._option('cancel', 'Keep current name', 'cancel', {}, { cancel: true }))) },
          this._option('back', 'Back to bench', 'cancel', {}, { cancel: true }),
        ]);
    },
    _showRigs() {
      this._show('rigs', 'Two originals · both yours to alter', 'Changing selection never spawns a copy. The other machine stays where you left it.',
        this.workshop.rigs.map(r => this._option(`rig:${r.id}`, `${r.name}${r.modified ? ' · modified' : ''}`, 'selectRig', { rigId: r.id })).concat(this._option('back', 'Back', 'cancel', {}, { cancel: true })));
    },
    _showJobs() {
      const w = this.workshop;
      this._show('jobs', 'RATCHET · useful trouble outside the yard',
        w.activeJobId ? 'An order is already open. Deliver what you can; partial payment is kept if you close the remainder.' : 'Both work orders are local flights beyond the bench. Damage reduces pay. Delivering original bodies pays once.',
        [...RIG_JOB_DEFS.map(d => ({ id: `job:${d.id}`, label: `${d.id === 'needle' ? 'Needle Orchard' : 'Bad Centre of Gravity'}${w.jobs[d.id]?.settled ? ' · done' : ''}`, disabled: !!w.jobs[d.id]?.settled,
          run: () => this._show('offer', d.title, `${d.description} ${d.lesson} Up to ${d.pay * d.count} cr, with payment for each surviving original.`,
            [this._option('accept', 'Accept this work order', 'acceptJob', { id: d.id }, { disabled: !!w.activeJobId }),
              this._option('refuse', 'Leave it on the board', 'cancel', {}, { cancel: true })]) })),
          ...(w.activeJobId ? [this._option('guide', 'Mark a destination', 'guide'),
            { id: 'partial', label: 'Settle partial work', run: () => this._show('close-order', 'Settle the work done?', 'You keep every recorded payment. Undelivered cargo stays in the world and cannot pay this contract later.',
              [this._option('finish', 'Close remaining work', 'finishPartial'), this._option('cancel', 'Keep recovering cargo', 'cancel', {}, { cancel: true })]) }] : []),
          this._option('back', 'Back to rig', 'cancel', {}, { cancel: true }),
        ]);
    },
    _showGuide() {
      const job = this.workshop.jobs[this.workshop.activeJobId];
      if (!job) { this.jobs.guide(this.workshop, 'bench'); this._showField(); return; }
      this._show('guide', 'Where next?', 'You can return for the remaining originals after a partial delivery. The marker guides your flight; you still move and brake the physical load.', [
        this._option('pickup', 'Remaining cargo', 'guide', { target: 'pickup' }),
        this._option('receiver', 'Receiving gantry', 'guide', { target: 'receiver' }),
        this._option('bench', 'Workshop bench', 'guide', { target: 'bench' }),
        this._option('back', 'Back to rig', 'cancel', {}, { cancel: true }),
      ]);
    },
    _showAway() {
      this._show('away', 'RATCHET · Your machine is still yours',
        'The workshop keeps its place, and a loose rig keeps its identity. Mark the bench or the original surviving machinery whenever you are ready to return.', [
          this._option('recover', 'Locate original rig', 'recover'),
          this._option('bench', 'Mark workshop', 'guide', { target: 'bench' }),
          ...(this.workshop.activeJobId ? [this._option('guide', 'Find remaining cargo', 'guide', { target: 'pickup' })] : []),
          this._option('close', 'Keep exploring', 'close', {}, { cancel: true }),
        ]);
    },
    _showField() {
      const rig = this.activeRig, w = this.workshop, job = w.jobs[w.activeJobId];
      if (!rig || !isWorkshopAdventure(this.state)) return;
      const broken = Math.max(rig.connections.filter(c => ['broken', 'detached'].includes(c.state)).length, rig.detachedCount || 0);
      const detail = job ? `${job.title} · ${job.delivered.length}/${job.cargo.length} delivered. ${job.stage === 'pickup' ? 'Follow the cargo marker, approach slowly, then secure an original.' : 'Brake well before the gantry and let the load settle below 6 WU/s and 0.4 rad/s.'}${job.id === 'kiln' ? ' Keep mover assist enabled while braking.' : ''}` : 'Test the rig or carry your own loose payloads. Fly and brake normally; the tow and mover respond through the existing physics.';
      this._show('field', `${rig.name}${broken ? ` · ${broken} broken connection${broken === 1 ? '' : 's'}` : ''}`, detail,
        [this._option('capture', 'Secure cargo', 'capture'),
          this._option('power', rig.power ? 'Cut mover power' : 'Enable movers', 'power'),
          this._option('couple', 'Couple ship', 'couple'),
          this._option('release', 'Release tow', 'release'),
          ...(job ? [this._option('deliver', 'Deliver originals', 'deliver'), this._option('guide', 'Mark a destination', 'guide')] : []),
          { id: 'more', label: 'Recovery · release', run: () => this._show('field-care', 'Recover the machine, keep the story',
            'Lost a connection? Find the original part, tow it home, and repair. You can release cargo to rebalance before securing it again.',
            [this._option('releaseCargo', 'Release last cargo', 'releaseCargo'), this._option('recover', 'Recover originals', 'recover'),
              this._option('bench', 'Mark workshop', 'guide', { target: 'bench' }), this._option('jobs', 'Job status · settle', 'jobs'),
              this._option('close', 'Keep flying', 'close', {}, { cancel: true })]) },
          this._option('close', 'Keep flying', 'close', {}, { cancel: true })],
        broken ? 'Connection separated' : null);
    },

    serialize() { return captureRigWorkshop(this.state, this.workshop); },
    deserialize(raw, options = {}) {
      this._close();
      const result = restoreRigWorkshop(this.state, raw, this.physics, options);
      if (result?.ok === false) return result;
      if (result?.workshop) this.state.rigWorkshop = result.workshop;
      else if (result?.version) this.state.rigWorkshop = result;
      else if (!this.state.rigWorkshop) this.state.rigWorkshop = freshRigWorkshop(this.state);
      this._near = false; this._lastRefresh = -Infinity; this._farPromptOffered = false;
      return { ok: true };
    },
    newGame() {
      this._close(); this.physics?.destroy?.({ removeBodies: true });
      this.state.rigWorkshop = freshRigWorkshop(this.state);
      this.physics = createRigPhysicsAdapter(this.ctx);
      this.jobs = createWorkshopJobs({ state: this.state, bus: this.bus, physics: this.physics, feedback: (kind, text, pos) => this.feedback(kind, text, pos) });
      this._near = false; this._lastRefresh = -Infinity; this._farPromptOffered = false;
    },
    destroy() {
      if (this.state) { this._close(); if (owners.get(this.state) === this) owners.delete(this.state); }
      for (const off of this._unsubs || []) if (typeof off === 'function') off();
      this._unsubs = []; this.physics?.destroy?.(); this._actions?.clear();
    },
  };
}

export const rigWorkshop = createRigWorkshopSystem();
export default rigWorkshop;
