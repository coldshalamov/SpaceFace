import { queuePhysicsImpulse, queuePhysicsTorqueImpulse } from '../../core/physicsAuthority.js';
import {
  createExpeditionRecord, acceptExpedition, abandonExpedition, resumeExpedition,
  markBodyMaterialized, observeExpeditionBody, suspendExpedition,
  stepExpedition, isExpeditionTerminal, pendingExpeditionRewards,
  commitExpeditionReward, normalizeExpeditionRecord, serializeExpeditionRecord,
} from './model.js';
import { validateExpeditionLayout } from './layout.js';
import { BLACKBOX_RUNS_SITE, getExpeditionSiteLayout } from './site.js';
import { authoredExpeditionBodyData, buildExpeditionPresentation } from './presentation.js';
import {
  sampleExpeditionHazards, pointInExpeditionJet, distanceToPolyline,
  expeditionImpulse, expeditionMachineAcceleration, EXPEDITION_CHOREOGRAPHY,
} from './choreography.js';

const OWNER = 'derelictExpedition';
const SITE_ID = BLACKBOX_RUNS_SITE.id;
const KINDS = ['blackbox', 'core'];
const MATERIALIZE_BUDGET = 8;
const MAX_NOTICE_KEYS = 24;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
const clone = (value) => JSON.parse(JSON.stringify(value));
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const entityAlive = (e) => !!e && e.alive !== false && e.hull > 0;
const owned = (e, key = null) => e?.data?.persistenceOwner === OWNER
  && e.data.derelictExpedition?.siteId === SITE_ID
  && (key == null || e.data.derelictExpedition.key === key);

function freshMechanics() {
  return {
    clamps: { blackbox: { released: false }, core: { released: false } },
    collapseReleased: { rack_one: false, rack_two: false },
    collapseArmedAt: { rack_one: null, rack_two: null },
    notices: {}, lastVentWarningCycle: -1, ventApproached: false,
  };
}

function normalizeMechanics(raw, record) {
  const out = freshMechanics();
  for (const kind of KINDS) {
    out.clamps[kind].released = raw?.clamps?.[kind]?.released === true
      || ['recovered', 'delivered', 'lost'].includes(record.cargo[kind].status);
  }
  for (const key of ['rack_one', 'rack_two']) {
    out.collapseReleased[key] = raw?.collapseReleased?.[key] === true;
    // Reentry starts a fresh audible warning for an unconsumed collapse.
    out.collapseArmedAt[key] = null;
  }
  out.lastVentWarningCycle = Math.max(-1, Math.min(1e8, Math.floor(finite(raw?.lastVentWarningCycle, -1))));
  out.ventApproached = raw?.ventApproached === true;
  // Notices contain no player text and no unbounded event history.
  for (const key of Object.keys(raw?.notices || {}).slice(0, MAX_NOTICE_KEYS)) {
    if (/^[a-z0-9_]{1,64}$/.test(key) && raw.notices[key] === true) out.notices[key] = true;
  }
  return out;
}

function bodySnapshot(entity) {
  if (!entityAlive(entity)) return null;
  return {
    id: entity.id, alive: true,
    pos: { x: entity.pos.x, z: entity.pos.z },
    vel: { x: entity.vel.x, z: entity.vel.z },
    rot: finite(entity.rot), angVel: finite(entity.angVel),
    hull: entity.hull, hullMax: entity.hullMax,
    integrity: Math.max(0, Math.min(1, entity.hull / Math.max(1, entity.hullMax))),
  };
}

/** Canonical entity specs, using only existing authored visual assets. */
export function expeditionEntitySpec(body, snapshot, site = BLACKBOX_RUNS_SITE) {
  const data = authoredExpeditionBodyData(body, site.id);
  return {
    type: body.type,
    homeSectorId: site.sectorId,
    pos: { x: snapshot.pos.x, y: 0, z: snapshot.pos.z },
    vel: { x: snapshot.vel.x, y: 0, z: snapshot.vel.z },
    rot: snapshot.rot, angVel: snapshot.angVel,
    radius: body.radius, mass: body.mass,
    hull: snapshot.hull, hullMax: snapshot.hullMax,
    collides: true, team: 0,
    // Pinned against far-actor/dressing adoption, NOT pinned against physical forces.
    flags: { persistent: true, missionPinned: true, invuln: body.anchored === true },
    physicsBody: {
      schemaVersion: 1, revision: 0,
      shape: body.shape || 'ball', radius: body.radius, mass: body.mass,
      inertiaY: Math.max(1, 0.5 * body.mass * body.radius * body.radius),
      dynamic: body.anchored !== true, ccd: body.anchored !== true,
      material: 'debris', impactDamageScale: body.role === 'blackbox' || body.role === 'core' ? 0.25 : 0.5,
    },
    data: {
      ...data,
      persistenceOwner: OWNER,
      derelictExpedition: { siteId: site.id, key: body.key, role: body.role },
      homeSectorId: site.sectorId, sectorId: site.sectorId,
      transientSector: false, missionPinned: true,
      masslineTetherable: true,
      // The anchor's explicit profile gives an authored static fx body a genuine
      // tether socket without impersonating any other mission owner.
      combatProfileId: body.anchored ? 'combat_profile_tether_anchor' : 'combat_profile_tether_payload',
      ...(body.proportions ? { proportions: { ...body.proportions } } : {}),
      loot: [], salvagePool: {},
    },
  };
}

/** Registered production owner. One factory instance per game state. */
export class DerelictExpeditionSystem {
  constructor() {
    this.name = OWNER;
    this.state = null; this.bus = null; this.helpers = null; this.registry = null;
    this._subs = []; this._rt = null; this._restoring = false; this._lastUpdateTick = null;
  }

  init(ctx) {
    this.dispose();
    this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers; this.registry = ctx.registry;
    if (!this.state || !this.bus?.on || !this.helpers) throw new TypeError('BLACKBOX RUNS requires the game context');
    this._restoring = false;
    this._ensure();
    this._api = {
      start: (siteId) => this.start(siteId), resume: (siteId) => this.resume(siteId),
      abandon: (siteId) => this.abandon(siteId), getStatus: (siteId) => this.getStatus(siteId),
      presentation: () => this.presentation(),
    };
    this.helpers.derelictExpedition = this._api;
    this._subs.push(this.bus.on('sector:exit', (p) => {
      if (p?.sectorId === BLACKBOX_RUNS_SITE.sectorId) this._unload(true);
    }));
    this._subs.push(this.bus.on('sector:enter', (p) => {
      if (!this._restoring && p?.sectorId === BLACKBOX_RUNS_SITE.sectorId) this._materialize();
    }));
    this._subs.push(this.bus.on('save:restoring', () => {
      // A failed restore may return to this live state without deserialize().
      // Preserve physical custody before releasing bodies; successful restores
      // replace these snapshots through the normal save owner transaction.
      this._restoring = true; this._unload(true); this._lastUpdateTick = null;
    }));
    this._subs.push(this.bus.on('save:loaded', () => {
      // Generic persistent bodies and combat references finish in later save
      // chunks. Adopt their complete final set, never a partially projected set.
      this._restoring = false; this._rt = null; this._lastUpdateTick = null; this._materialize();
    }));
    this._subs.push(this.bus.on('save:error', () => {
      if (!this._restoring) return;
      this._restoring = false; this._rt = null; this._lastUpdateTick = null; this._materialize();
    }));
    this._subs.push(this.bus.on('game:newGame', () => this.newGame()));
    this._rt = null;
    this._lastUpdateTick = null;
    return this;
  }

  dispose() {
    for (const unsub of this._subs) if (typeof unsub === 'function') unsub();
    this._subs = [];
    if (this.helpers && this.helpers.derelictExpedition === this._api) delete this.helpers.derelictExpedition;
  }

  destroy() { this.dispose(); }

  _ensure() {
    const current = this.state.derelictExpedition;
    if (!current || current.schemaVersion !== 1 || !current.sites || typeof current.sites !== 'object') {
      this.state.derelictExpedition = { schemaVersion: 1, sites: {}, ...(current != null ? { quarantined: true } : {}) };
    }
    return this.state.derelictExpedition;
  }

  _site() { return this._ensure().sites[SITE_ID] || null; }
  _player() { return this.state.entities?.get?.(this.state.playerId) || null; }
  _inSector() { return this.state.world?.currentSectorId === BLACKBOX_RUNS_SITE.sectorId; }
  _attachments() {
    const actions = this.registry?.get?.('actions');
    const combat = this.registry?.get?.('combat');
    return actions?.kernel?.attachments || combat?.kernel?.attachments || null;
  }

  start(siteId = SITE_ID) {
    if (siteId !== SITE_ID) return { ok: false, reason: 'unknown_site' };
    if (this._ensure().quarantined) return { ok: false, reason: 'source_record_invalid' };
    if (!this._inSector()) return { ok: false, reason: 'wrong_sector' };
    if (this._restoring || (this.state.mode && this.state.mode !== 'flight')) return { ok: false, reason: 'not_in_flight' };
    if (this._site()) return this.resume(siteId);
    const layout = getExpeditionSiteLayout(this.state.meta?.seed ?? this.state.seed ?? 0);
    const player = this._player();
    if (!entityAlive(player) || distance(player.pos, layout.entry) > BLACKBOX_RUNS_SITE.invitationRadius) {
      return { ok: false, reason: 'approach_derelict' };
    }
    if (typeof this.helpers.spawnEntity !== 'function' || typeof this.helpers.removeEntity !== 'function') {
      return { ok: false, reason: 'entity_owner_unavailable' };
    }
    const validation = validateExpeditionLayout(layout);
    if (!validation.ok) return { ok: false, reason: 'layout_invalid' };
    // No machine may materialize on top of the ship that accepted the offer.
    if (layout.bodies.some((b) => distance(b.position, player.pos) < b.radius + (player.radius || 12) + 8)) {
      return { ok: false, reason: 'clear_spawn_area' };
    }
    const record = createExpeditionRecord({ seed: layout.seed, siteId, sectorId: BLACKBOX_RUNS_SITE.sectorId, layout, now: this.state.simTime });
    acceptExpedition(record);
    this._ensure().sites[siteId] = { record, mechanics: freshMechanics() };
    this._rt = null;
    this._materialize();
    this._say('accepted', 'BLACKBOX RUNS: three holds, one flight recorder. Tow the recorder to the open receiver. The deeper reactor core is optional. Keep the outer service lane for your return.');
    return { ok: true, siteId };
  }

  resume(siteId = SITE_ID) {
    const site = this._site();
    if (siteId !== SITE_ID || !site?.record.accepted) return { ok: false, reason: 'not_started' };
    if (isExpeditionTerminal(site.record)) return { ok: false, reason: 'site_spent' };
    if (!this._inSector() || this._restoring) return { ok: false, reason: 'wrong_sector' };
    const layout = this._layout();
    if (distance(this._player()?.pos, layout.bounds.center) > BLACKBOX_RUNS_SITE.resumeRadius) return { ok: false, reason: 'approach_derelict' };
    resumeExpedition(site.record);
    this._materialize();
    this._say(null, 'Same wreck, same cargo. The reactor has kept heating. Your cleared access and any lost cargo remain as you left them.');
    return { ok: true, siteId, resumed: true };
  }

  abandon(siteId = SITE_ID) {
    const site = this._site();
    if (siteId !== SITE_ID || !site) return { ok: false, reason: 'not_started' };
    this._capture();
    const changed = abandonExpedition(site.record);
    if (changed) this._say(null, 'Run left open. The wreck keeps its damage and cargo; returning does not reset it.');
    return { ok: changed, siteId };
  }

  _layout() {
    const record = this._site()?.record;
    if (!record) return null;
    if (!this._rt || this._rt.record !== record) {
      const layout = getExpeditionSiteLayout(record.seed, record);
      this._rt = { record, layout, ids: {}, attachmentIds: {}, nextMaterializeAt: 0 };
      // Reinitialization may adopt its own living bodies, but cannot adopt a new
      // occupant of a recycled entity ID or a second copy of a terminal body.
      for (const e of this.state.entityList || []) {
        if (!entityAlive(e) || !owned(e)) continue;
        const key = e.data.derelictExpedition.key;
        const saved = record.bodies[key];
        if (!saved || ['lost', 'delivered'].includes(saved.lifecycle) || this._rt.ids[key]) {
          this.helpers.removeEntity?.(e.id); continue;
        }
        if (!markBodyMaterialized(record, key, bodySnapshot(e))) {
          this.helpers.removeEntity?.(e.id); continue;
        }
        this._rt.ids[key] = { id: e.id, generation: e.occupantGeneration };
      }
      this._adoptClampBindings();
    }
    return this._rt.layout;
  }

  _entity(key) {
    const binding = this._rt?.ids[key];
    if (!binding) return null;
    const entity = this.state.entities?.get?.(binding.id);
    return owned(entity, key) && (binding.generation == null || entity.occupantGeneration === binding.generation) ? entity : null;
  }

  _capture() {
    const site = this._site();
    if (!site) return;
    this._layout();
    for (const key of Object.keys(site.record.bodies)) {
      if (site.record.bodies[key].lifecycle !== 'live') continue;
      const priorStatus = site.record.cargo[key]?.status;
      observeExpeditionBody(site.record, key, bodySnapshot(this._entity(key)));
      if (priorStatus && priorStatus !== 'lost' && site.record.cargo[key].status === 'lost') {
        this._onTransition({ type: 'cargo_lost', cargo: key });
      }
    }
  }

  _materialize() {
    const site = this._site();
    if (!site?.record.accepted || !this._inSector() || this._restoring || isExpeditionTerminal(site.record)) return;
    const layout = this._layout(), record = site.record;
    const now = finite(this.state.simTime);
    if (now < this._rt.nextMaterializeAt) return;
    this._capture();
    let count = 0, failed = false;
    for (const body of layout.bodies) {
      const snapshot = record.bodies[body.key];
      if (!snapshot || !['unspawned', 'suspended'].includes(snapshot.lifecycle)) continue;
      if (count >= MATERIALIZE_BUDGET) break;
      const cargo = layout.loot.find((row) => row.bodyKey === body.key);
      // Real clamps need both a native endpoint and the existing attachment owner.
      if (cargo && !site.mechanics.clamps[cargo.id].released
        && (!this._attachments()?.create || !entityAlive(this._entity(cargo.anchorKey)))) continue;
      let entity = null;
      try { entity = this.helpers.spawnEntity(expeditionEntitySpec(body, snapshot)); }
      catch { failed = true; continue; }
      count++;
      if (!entityAlive(entity) || !owned(entity, body.key)) { failed = true; continue; }
      this._rt.ids[body.key] = { id: entity.id, generation: entity.occupantGeneration };
      markBodyMaterialized(record, body.key, bodySnapshot(entity));
      if (cargo && !site.mechanics.clamps[cargo.id].released && !this._bindClamp(cargo.id)) {
        // The physics port may not have created the anchor native body yet. This
        // spawn never survives into a physics step free of its required clamp.
        snapshot.lifecycle = 'suspended'; snapshot.entityId = null;
        this.helpers.removeEntity(entity.id); delete this._rt.ids[body.key]; failed = true;
      }
    }
    if (failed) this._rt.nextMaterializeAt = now + 0.5;
  }

  _bindClamp(kind) {
    const site = this._site(), layout = this._layout(), attachments = this._attachments();
    const loot = layout.loot.find((row) => row.id === kind);
    const anchor = this._entity(loot.anchorKey), cargo = this._entity(loot.bodyKey);
    if (!attachments?.create || !entityAlive(anchor) || !entityAlive(cargo)) return false;
    const identity = `${OWNER}:${SITE_ID}:${kind}`;
    // Adoption is bounded to the endpoints' existing attachments, not the world's ledger.
    const prior = attachments.listForEntity?.(cargo.id)?.find((a) => a.state === 'active'
      && a.actionInstanceId === identity && a.ownerId === anchor.id && a.targetId === cargo.id);
    if (prior) { this._rt.attachmentIds[kind] = prior.id; return true; }
    const result = attachments.create({
      defId: 'attachment_salvage_clamp', ownerId: anchor.id, targetId: cargo.id,
      sourceWorld: { x: anchor.pos.x, y: 0, z: anchor.pos.z },
      targetWorld: { x: cargo.pos.x, y: 0, z: cargo.pos.z }, actionInstanceId: identity,
    });
    if (!result?.ok) return false;
    this._rt.attachmentIds[kind] = result.attachment?.id || result.id;
    return !!this._rt.attachmentIds[kind];
  }

  _adoptClampBindings() {
    const attachments = this._attachments();
    if (!attachments?.listForEntity || !this._rt) return;
    for (const kind of KINDS) {
      const cargo = this._entity(kind);
      if (!entityAlive(cargo)) continue;
      const loot = this._rt.layout.loot.find((row) => row.id === kind);
      const anchor = this._entity(loot.anchorKey);
      const prior = attachments.listForEntity(cargo.id).find((a) => a.state === 'active'
        && a.actionInstanceId === `${OWNER}:${SITE_ID}:${kind}`
        && a.ownerId === anchor?.id && a.targetId === cargo.id);
      if (prior) this._rt.attachmentIds[kind] = prior.id;
    }
  }

  _releaseClamp(kind, reason) {
    const site = this._site(), clamp = site.mechanics.clamps[kind];
    if (clamp.released) return true;
    this._adoptClampBindings();
    const id = this._rt?.attachmentIds[kind], attachments = this._attachments();
    if (id) {
      const existing = attachments?.get?.(id);
      if (existing?.state === 'active' && !attachments.breakAttachment?.(id, reason)?.ok) return false;
    } else if (!attachments) return false;
    clamp.released = true;
    delete this._rt.attachmentIds[kind];
    return true;
  }

  _observeClampBreaks() {
    const site = this._site(), attachments = this._attachments();
    if (!attachments?.get) return;
    for (const kind of KINDS) {
      const id = this._rt.attachmentIds[kind];
      if (!id || site.mechanics.clamps[kind].released) continue;
      const clamp = attachments.get(id);
      if (!clamp || clamp.state !== 'active') {
        site.mechanics.clamps[kind].released = true;
        delete this._rt.attachmentIds[kind];
      }
    }
  }

  _obstacleFacts() {
    const { record, mechanics } = this._site(), layout = this._layout();
    const gate = this._entity('shutter');
    const valve = this._entity('vent_baffle'), relay = this._entity('relay');
    const g = layout.obstacles.shutter, v = layout.obstacles.vent, r = layout.obstacles.relay;
    const initial = (key) => layout.bodies.find((body) => body.key === key);
    const gone = (key) => record.bodies[key]?.lifecycle === 'lost';
    const shutterClear = entityAlive(gate) && (distance(gate.pos, g.pivot) >= g.clearDisplacement
      || Math.abs(angleDelta(gate.rot, initial('shutter').rot)) >= g.openAngle);
    const ventClear = entityAlive(valve) && distance(valve.pos, initial('vent_baffle').position) >= v.clearDisplacement;
    const relayClear = entityAlive(relay) && distance(relay.pos, r.origin) >= r.displacementToCut;
    const facts = {
      shutter: { opened: gone('shutter') || shutterClear, method: gone('shutter') ? 'destroyed' : 'displaced' },
      vent: { opened: gone('vent_baffle') || ventClear, method: gone('vent_baffle') ? 'destroyed' : 'displaced' },
      relay: { opened: gone('relay') || gone('vault_gate') || relayClear,
        method: gone('relay') || gone('vault_gate') ? 'destroyed' : 'displaced' },
    };
    // A physical breakaway tow through the torn service side is a legitimate
    // alternative, never an invisible key check after the cargo is already free.
    for (const kind of KINDS) {
      const cargo = this._entity(kind), item = record.cargo[kind];
      if (!mechanics.clamps[kind].released || !entityAlive(cargo)
        || distance(cargo.pos, item.sourcePos) < item.recoveryRadius) continue;
      if (!facts.shutter.opened) facts.shutter = { opened: true, method: record.obstacles.shutter.method || 'bypass' };
      if (!facts.vent.opened) facts.vent = { opened: true, method: record.obstacles.vent.method || 'bypass' };
      if (kind === 'core' && !facts.relay.opened) facts.relay = { opened: true, method: record.obstacles.relay.method || 'bypass' };
    }
    return facts;
  }

  _impulse(entity, acceleration, dt, kind, maxSpeed) {
    const impulse = expeditionImpulse(entity, acceleration, dt, maxSpeed);
    if (impulse) queuePhysicsImpulse(entity, impulse, {
      kind: `${OWNER}:${kind}`, externalEffect: true, isPlayerTarget: entity.id === this.state.playerId,
      continuous: true, tick: this.state.tick, dt: Math.min(dt, EXPEDITION_CHOREOGRAPHY.maxStepS),
    });
  }

  _choreograph(dt, hazards) {
    const { record, mechanics } = this._site(), layout = this._layout();
    const gate = this._entity('shutter'), weight = this._entity('counterweight');
    const bodySpec = (key) => layout.bodies.find((b) => b.key === key);
    const physicallyOpened = (key) => record.obstacles[key].opened
      && !['bypass', 'timed'].includes(record.obstacles[key].method);
    if (!physicallyOpened('shutter') && entityAlive(gate)) {
      const offset = distance(weight?.pos, layout.obstacles.shutter.counterweightOrigin);
      const assist = entityAlive(weight) ? Math.min(1.55, offset / 25) : 1.55;
      const target = bodySpec('shutter').rot + hazards.shutterAngle + assist;
      const acceleration = Math.max(-0.45, Math.min(0.45, angleDelta(target, gate.rot) * 0.8 - finite(gate.angVel) * 1.2));
      const inertia = finite(gate.physicsBody?.inertiaY, 0.5 * gate.mass * gate.radius * gate.radius);
      queuePhysicsTorqueImpulse(gate, { x: 0, y: inertia * acceleration * Math.min(dt, 0.1), z: 0 }, { kind: `${OWNER}:shutter_motor`, tick: this.state.tick });
      this._impulse(gate, expeditionMachineAcceleration(gate, layout.obstacles.shutter.pivot, 0.16, 0.7), dt, 'shutter_bearing');
    }
    for (const [key, obstacle] of [['counterweight', 'shutter'], ['vent_baffle', 'vent'], ['relay', 'relay']]) {
      const e = this._entity(key);
      if (entityAlive(e) && !physicallyOpened(obstacle)) {
        this._impulse(e, expeditionMachineAcceleration(e, bodySpec(key).position, 0.035, 0.08), dt, 'loaded_mount');
      }
    }
    const vault = this._entity('vault_gate');
    if (entityAlive(vault)) {
      const spec = bodySpec('vault_gate');
      const target = physicallyOpened('relay')
        ? { x: spec.position.x - Math.sin(layout.rotation) * 70, z: spec.position.z + Math.cos(layout.rotation) * 70 }
        : spec.position;
      this._impulse(vault, expeditionMachineAcceleration(vault, target, 0.12, 1), dt, 'vault_motor', 12);
    }
    if (hazards.vent.phase === 'warning' && hazards.vent.cycle !== mechanics.lastVentWarningCycle) {
      mechanics.lastVentWarningCycle = hazards.vent.cycle;
      this._say(null, 'PRESSURE HOLD: jet in 3 seconds. Move sideways out of the fragment stream; the outer lane stays open.');
      this._cue('salvage.cooker.tracked', this._entity('vent_baffle'));
    }
    if (hazards.vent.phase === 'active') {
      const candidates = Object.keys(this._rt.ids).map((key) => this._entity(key)).filter(entityAlive);
      const player = this._player();
      if (entityAlive(player)) candidates.push(player);
      const seen = new Set();
      for (const entity of candidates.slice(0, EXPEDITION_CHOREOGRAPHY.maxAffectedBodies)) {
        if (seen.has(entity.id)) continue;
        seen.add(entity.id);
        if (!pointInExpeditionJet(entity.pos, hazards.vent, entity.radius || 0)) continue;
        if (distanceToPolyline(entity.pos, layout.safeExterior) <= 28 + (entity.radius || 0)) continue;
        this._impulse(entity, { x: hazards.vent.direction.x * hazards.vent.acceleration, z: hazards.vent.direction.z * hazards.vent.acceleration }, dt, 'pressure_jet');
      }
    }
    for (const batch of hazards.collapse) {
      if (record.elapsedS < batch.warningAtS || mechanics.collapseReleased[batch.id]) continue;
      const keys = layout.returnDebrisKeys.slice(batch.id === 'rack_one' ? 0 : 3, batch.id === 'rack_one' ? 3 : 6);
      if (!keys.every((key) => entityAlive(this._entity(key)) || ['lost', 'delivered'].includes(record.bodies[key]?.lifecycle))) continue;
      if (mechanics.collapseArmedAt[batch.id] == null) {
        mechanics.collapseArmedAt[batch.id] = record.elapsedS;
        this._say(null, 'RETURN RACK CREAKING: loose plating will cross the inner shortcut in five seconds. Follow the wide outer service lane or clear the pieces with Shove.');
      }
      if (record.elapsedS - mechanics.collapseArmedAt[batch.id] < EXPEDITION_CHOREOGRAPHY.collapseWarningS) continue;
      // Mark before queuing, so catch-up or reentry cannot fire a second burst.
      mechanics.collapseReleased[batch.id] = true;
      const authoredDirection = layout.returnChoreography.direction;
      const directionLength = Math.hypot(authoredDirection.x, authoredDirection.z);
      const dir = { x: authoredDirection.x / Math.max(1e-9, directionLength), z: authoredDirection.z / Math.max(1e-9, directionLength) };
      for (const key of keys) {
        const e = this._entity(key);
        if (!entityAlive(e)) continue;
        // A finite release, not an engine which accelerates debris forever.
        const mass = finite(e.physicsBody?.mass, e.mass);
        queuePhysicsImpulse(e, { x: dir.x * mass * 5, y: 0, z: dir.z * mass * 5 }, { kind: `${OWNER}:rack_release`, tick: this.state.tick });
        this._cue('wreck.scavenge.cut', e);
      }
    }
    // A redirected fragment can approach the outer lane. Nudge our own stock
    // back inward before it reaches that corridor, while preserving player and
    // cargo authority. No teleport or collision suppression is involved.
    for (const key of [...layout.obstacles.vent.debrisKeys, ...layout.returnDebrisKeys]) {
      const e = this._entity(key);
      if (!entityAlive(e) || distanceToPolyline(e.pos, layout.safeExterior) > 55) continue;
      const inward = { x: Math.sin(layout.rotation), z: -Math.cos(layout.rotation) };
      this._impulse(e, { x: inward.x * 14, z: inward.z * 14 }, dt, 'outer_lane_baffle', 24);
    }
  }

  update(dt, state = this.state) {
    if (state !== this.state || this._restoring || !Number.isFinite(dt) || dt <= 0) return;
    if ((state.mode && state.mode !== 'flight') || state.paused === true) return;
    // The authoritative manifest must schedule this once, but duplicate callers
    // cannot double the impulse budget or receiver dwell in a fixed tick.
    const tick = Number.isFinite(state.tick) ? state.tick : null;
    if (tick != null && this._lastUpdateTick === tick) return;
    this._lastUpdateTick = tick;
    const site = this._site();
    if (!site?.record.accepted) return;
    const { record } = site;
    const layout = this._layout();
    const present = this._inSector();
    if (present) { this._materialize(); this._capture(); this._observeClampBreaks(); }
    const facts = present ? this._obstacleFacts() : {};
    const access = (record.obstacles.shutter.opened || facts.shutter?.opened)
      && (record.obstacles.vent.opened || facts.vent?.opened);
    if (present && access) this._releaseClamp('blackbox', 'blackbox_access_open');
    if (present && access && (record.obstacles.relay.opened || facts.relay?.opened)) this._releaseClamp('core', 'blackbox_vault_open');
    const cargo = {};
    for (const kind of KINDS) {
      if (present && site.mechanics.clamps[kind].released) cargo[kind] = bodySnapshot(this._entity(kind));
    }
    const result = stepExpedition(record, { present, playerPos: present ? this._player()?.pos : null, obstacles: facts, cargo }, dt);
    for (const event of result.events) this._onTransition(event);
    if (present && !isExpeditionTerminal(record)) this._choreograph(dt, sampleExpeditionHazards(record, layout));
    this._settleRewards();
  }

  _onTransition(event) {
    if (event.type === 'cargo_delivered') {
      const e = this._entity(event.cargo);
      if (e) { this._cue('mining.yield.collected', e); this.helpers.removeEntity(e.id); }
      delete this._rt.ids[event.cargo];
      this._say(`delivered_${event.cargo}`, event.cargo === 'blackbox'
        ? 'RECORDER RECEIVED. Your primary run is secured. The deeper core remains optional; its reward needs its own physical return.'
        : 'REACTOR CORE RECEIVED. Its custody is settled; this wreck cannot issue another core.');
    } else if (event.type === 'cargo_lost') {
      const coreSurvives = !['lost', 'delivered'].includes(this._site()?.record.cargo.core.status);
      this._say(`lost_${event.cargo}`, event.cargo === 'blackbox'
        ? `RECORDER LOST. Its source is spent. ${coreSurvives ? 'The surviving core can still be salvaged, or leave through the outer service lane.' : 'Leave through the outer service lane; any completed settlement is secure.'}`
        : 'CORE LOST. Its source is spent. The recorder and any completed settlement remain independent.');
    } else if (event.type === 'cargo_recovered') {
      this._say(`recovered_${event.cargo}`, event.cargo === 'blackbox'
        ? 'RECORDER CLEAR. Return to the receiver, or go deeper for the reactor core. Brake the cargo inside the cradle; passing through at speed will not settle it.'
        : 'CORE CLEAR. Heavy tow, rising pressure. The outer service lane is the safe route back.');
    } else if (event.type === 'obstacle_opened') {
      const lines = {
        shutter: 'SHUTTER ACCESS OPEN. The next hold vents loose fragments. Pull its pressure baffle clear or cut it with ordinary guns.',
        vent: 'PRESSURE HOLD OPEN. Recover the recorder. The relay vault beyond it is optional.',
        relay: 'VAULT POWER CUT. The plate is opening and the optional core is free to tow. Pressure rises with the extra load.',
      };
      this._say(`opened_${event.obstacle}`, lines[event.obstacle]);
    } else if (event.type === 'pressure_stage') {
      this._say(`pressure_${event.stage}`, event.stage === 3
        ? 'REACTOR CRITICAL: the inner route is turbulent. The outer service lane remains open. Line up the tow before committing.'
        : 'REACTOR PRESSURE RISING. More cargo means a harder return. The receiver is outside the wreck.');
    }
  }

  _settleRewards() {
    const site = this._site();
    if (!site) return;
    const writer = this.registry?.get?.('economy');
    // No absent-writer fallback which directly edits player.credits.
    if (typeof writer?.grantCredits !== 'function' || writer.state !== this.state) return;
    for (const intent of pendingExpeditionRewards(site.record)) {
      const committed = commitExpeditionReward(site.record, intent.id);
      if (!committed) continue;
      // Directly invoke the verified registered owner. A telemetry listener on
      // the intent bus is not proof that a credit writer exists.
      writer.grantCredits(committed.amount, committed.reason);
      this._say(`paid_${committed.kind}`, `${committed.kind === 'blackbox' ? 'Recorder' : 'Core'} settled: ${committed.amount} credits, adjusted for delivered integrity.`);
    }
  }

  _say(onceKey, text) {
    const site = this._site();
    if (!text || !site) return;
    if (onceKey && site.mechanics.notices[onceKey]) return;
    if (onceKey && Object.keys(site.mechanics.notices).length < MAX_NOTICE_KEYS) site.mechanics.notices[onceKey] = true;
    this.bus.emit('comms:log', { from: 'MORROWGLASS RECOVERY', text, kind: 'salvage' });
    this.bus.emit('toast', { text, kind: 'info', ttl: 7 });
  }

  _cue(id, entity) {
    if (!entityAlive(entity)) return;
    const a11y = this.state.settings?.accessibility || {};
    if (a11y.flashReduce === true || a11y.reducedFlash === true || a11y.reducedFlashes === true) return;
    // These are existing worldCueRecipes IDs, with real position/direction.
    this.bus.emit('presentation:cue', {
      id, sourceId: entity.id, targetId: entity.id,
      position: { x: entity.pos.x, z: entity.pos.z },
      direction: { x: Math.cos(finite(entity.rot)), z: Math.sin(finite(entity.rot)) },
    });
  }

  _unload(capture) {
    const site = this._site();
    if (!site) { this._rt = null; return; }
    this._layout();
    if (capture) {
      const snapshots = {};
      for (const key of Object.keys(site.record.bodies)) snapshots[key] = bodySnapshot(this._entity(key));
      suspendExpedition(site.record, snapshots);
      for (const key of ['rack_one', 'rack_two']) site.mechanics.collapseArmedAt[key] = null;
    }
    const attachments = this._attachments();
    for (const id of Object.values(this._rt.attachmentIds)) attachments?.breakAttachment?.(id, 'blackbox_suspend');
    for (const binding of Object.values(this._rt.ids)) {
      const e = this.state.entities?.get?.(binding.id);
      if (owned(e)) this.helpers.removeEntity?.(binding.id);
    }
    this._rt = null;
  }

  serialize() {
    this._capture();
    const site = this._site();
    if (!site) return { schemaVersion: 1, sites: {}, ...(this._ensure().quarantined ? { quarantined: true } : {}) };
    return { schemaVersion: 1, sites: { [SITE_ID]: {
      record: serializeExpeditionRecord(site.record), mechanics: clone(site.mechanics),
    } } };
  }

  deserialize(data) {
    this._unload(false);
    this.state.derelictExpedition = { schemaVersion: 1, sites: {} };
    this._rt = null; this._lastUpdateTick = null;
    if (data == null) return; // Existing saves made before this feature have no site.
    const quarantine = () => { this.state.derelictExpedition.quarantined = true; };
    if (data.schemaVersion !== 1 || data.quarantined === true || !data.sites || typeof data.sites !== 'object') { quarantine(); return; }
    const raw = data.sites[SITE_ID];
    if (raw == null && !Object.hasOwn(data.sites, SITE_ID)) return;
    if (!raw?.record || raw.record.accepted !== true || raw.record.siteId !== SITE_ID || raw.record.sectorId !== BLACKBOX_RUNS_SITE.sectorId) { quarantine(); return; }
    try {
      const descriptor = raw.record;
      const expected = getExpeditionSiteLayout(descriptor.seed, descriptor);
      // A malformed save cannot relocate the mission into Helios or arbitrary coordinates.
      const canonical = getExpeditionSiteLayout(descriptor.seed);
      if (!Number.isSafeInteger(descriptor.seed) || descriptor.seed < 0 || descriptor.seed > 0xffffffff
        || descriptor.variant !== canonical.variant || distance(expected.origin, canonical.origin) > 0.01
        || Math.abs(angleDelta(expected.rotation, canonical.rotation)) > 0.0001) { quarantine(); return; }
      const record = normalizeExpeditionRecord(raw.record, { layout: expected, siteId: SITE_ID, sectorId: BLACKBOX_RUNS_SITE.sectorId, rehydrate: true });
      if (!record) { quarantine(); return; }
      this.state.derelictExpedition.sites[SITE_ID] = { record, mechanics: normalizeMechanics(raw.mechanics, record) };
    } catch { quarantine(); }
  }

  newGame() {
    if (!this.state) return;
    this._unload(false);
    this.state.derelictExpedition = { schemaVersion: 1, sites: {} };
    this._rt = null; this._lastUpdateTick = null; this._restoring = false;
  }

  presentation() {
    const site = this._site();
    if (!site) return null;
    const layout = this._restoring ? getExpeditionSiteLayout(site.record.seed, site.record) : this._layout();
    const bodies = {};
    if (!this._restoring) for (const key of Object.keys(this._rt.ids)) bodies[key] = this._entity(key);
    return buildExpeditionPresentation(site.record, layout, {
      settings: this.state.settings, bodyByKey: bodies, playerPosition: this._player()?.pos,
    });
  }

  getStatus(siteId = SITE_ID) {
    if (siteId !== SITE_ID || !this._site()) return null;
    const record = this._site().record;
    const layout = this._restoring ? getExpeditionSiteLayout(record.seed, record) : this._layout();
    const ids = this._restoring ? {} : Object.fromEntries(Object.entries(this._rt.ids).map(([key, value]) => [key, value.id]));
    return { record: clone(this._site().record), layout: clone(layout), entityIds: ids,
      mechanics: clone(this._site().mechanics), presentation: this.presentation() };
  }
}

export function createDerelictExpeditionSystem() { return new DerelictExpeditionSystem(); }
export const derelictExpedition = createDerelictExpeditionSystem();
export { BLACKBOX_RUNS_SITE, getExpeditionSiteLayout } from './site.js';
export { BLACKBOX_RUNS_RUNTIME } from './encounterRuntime.js';
