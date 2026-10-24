// Docket owns ONLY state.docket, its own entity, and its transient interaction state.
// No renderer, inventory, economy, or ambient random stream. Station-keeping and the approach
// trim cross the same additive impulse membrane used by Massline; the parcel never teleports.
//
// The play is positional (03 §4.3): the drone asks to be carried to the dead relay at
// Shepherd's Ring, by any physical means the player has — tether swing, shove, blast, tow.
// The latch grants delivery to what ARRIVES AND STOPS inside the cradle; a fast pass is an
// overshoot the drone calls out and survives.
import { DOCKET, DOCKET_LINES, DOCKET_TOLD, freshDocketMemory, normalizeDocketMemory } from '../data/docket.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { deferSectorEnterMaterialization, deferredEnterNow } from '../core/sectorEnterDefer.js';
import {
  deliveryCheck, distanceXZ, finiteXZ, inApproachShelf, boundedServo, playerHoldsLine, speedOf,
} from '../characters/docketRules.js';

export function docketEntitySpec(memory = freshDocketMemory()) {
  return {
    type: 'drone', team: 2, factionId: 'faction_fulfillment', name: DOCKET.name,
    pos: memory.delivered ? { ...DOCKET.depot } : { ...DOCKET.anchor },
    radius: DOCKET.radius, mass: DOCKET.mass,
    hull: memory.hull, hullMax: DOCKET.hull, collides: true,
    // Explicit solid body; no giant invisible halo collider. ccd is on because the whole point of
    // the encounter is that this body gets thrown across a sector at speed.
    physicsBody: { dynamic: true, shape: 'ball', radius: DOCKET.radius, mass: DOCKET.mass,
      useMeasuredSkin: false, material: 'debris', ccd: true,
      contact: { friction: 0.2, restitution: 0.45, angularDamping: 0.5 } },
    data: { docket: true, authoredCharacter: 'docket', visualRadius: 90, callsign: DOCKET.callsign,
      scanLabel: 'Docket · parcel drone', scannerSignalKind: 'anomaly', homeSectorId: DOCKET.sectorId,
      identityKey: DOCKET.id, ai: { passive: true },
      docketPose: { phase: memory.delivered ? 'parked' : 'adrift', gaze: 0, gesture: '',
        gestureAt: -100, transitAt: -100 } },
  };
}

export function createDocket() {
  return {
    name: 'docket',
    init(ctx) {
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this.state.docket = normalizeDocketMemory(this.state.docket);
      this._reset();
      this._unsubs = [];
      const on = (event, fn) => {
        const off = this.bus?.on(event, fn); if (typeof off === 'function') this._unsubs.push(off);
      };
      on('scan:pulse', (p) => this._scan(p));
      on('combat:damage', (p) => this._damage(p));
      on('entity:killed', (p) => this._killed(p));
      on('game:newGame', () => this.newGame());
      on('save:restoring', () => this._reset());
      on('save:loaded', () => { this._reset(); this._syncEntity(); });
      // Live GPU + flight + hard enter: defer into the cook's FIFO — the census
      // drains the same reset+sync under its slice clock in listener order.
      on('sector:enter', (p) => {
        if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
        this._scanSeq = 0; this._syncEntity();
      });
      // Census arm: the docket entity materializes inside the sector cook deterministically.
      this._cookProvider = () => { this._scanSeq = 0; return this._syncEntitySteps(); };
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
        .push(this._cookProvider);
    },
    _reset() {
      this._id = null; this._nextSync = 0; this._scanSeq = 0; this._scanSource = null;
      this._lastVoice = -100; this._lastOvershoot = -100; this._lastTransit = -100; this._lastQuiet = -100;
      this._insideDepot = false; this._discoverySaid = false; this._inside = false;
      this._touchedAt = -100; this._held = false; this._quietIdx = 0;
      this._poseGestureAt = -100; this._poseGesture = ''; this._transitAt = -100;
    },
    newGame() {
      this._removeOwned(); this.state.docket = freshDocketMemory(); this._reset();
    },
    serialize() {
      const e = this._entity();
      const raw = { ...this.state.docket, hull: e?.alive ? e.hull : this.state.docket.hull };
      return normalizeDocketMemory(raw);
    },
    deserialize(raw) {
      this._removeOwned();
      this.state.docket = normalizeDocketMemory(raw);
      this._reset();
    },
    destroy() {
      for (const off of this._unsubs || []) off();
      this._unsubs = [];
      // Unregister the census arm like rubric/ruud: a re-init must not stack a second
      // provider that drains the same sync twice, and a queued deferred entry must not
      // call back into a system whose entity was just retired.
      const providers = this.helpers?.sectorCookProviders;
      if (providers && this._cookProvider) {
        const i = providers.indexOf(this._cookProvider);
        if (i >= 0) providers.splice(i, 1);
      }
      const q = this.state?.render?.deferredEnterMaterializers;
      if (q) for (let i = q.length - 1; i >= 0; i--) if (q[i].provider === this._cookProvider) q.splice(i, 1);
      this._cookProvider = null;
      this._removeOwned();
    },
    _entity() {
      const e = this.state?.entities?.get(this._id);
      return e?.alive && e.data?.docket === true ? e : null;
    },
    _player() { return this.state?.entities?.get(this.state.playerId); },
    _adventure() {
      const run = this.state.run;
      return (!run || !run.kind || run.kind === 'adventure' || run.kind === 'campaign')
        && this.state.world?.currentSectorId === DOCKET.sectorId;
    },
    _removeOwned() {
      // Rare lifecycle pass, not a per-frame scan; repair duplicates from stale/imported entities.
      for (const e of this.state?.entityList || []) {
        if (e?.data?.docket === true && e.alive) this.helpers?.removeEntity?.(e.id);
      }
      this._id = null;
    },
    _syncEntity() {
      // Sync lane (emit listener, save:loaded, tick sweep): drain the chunked steps
      // inline — the census drive holds the same generator across its slices.
      for (const _ of this._syncEntitySteps()) { /* inline */ }
    },
    *_syncEntitySteps() {
      if (!this._adventure() || this.state.docket.destroyed) {
        this._removeOwned(); this._inside = false; return;
      }
      let found = null;
      for (const e of (this.state.entityList || []).slice()) {
        yield;
        if (!e?.alive || e.data?.docket !== true) continue;
        if (found) this.helpers.removeEntity?.(e.id);
        else found = e;
      }
      // D189-class custody: no anonymous-twin adoption pass is needed here — the marker was
      // shipped with the character, so no save old enough to carry markerless shells exists.
      if (!found) found = this._entity();
      if (!found && this.helpers.spawnEntity) found = this.helpers.spawnEntity(docketEntitySpec(this.state.docket));
      if (found?.data?.docket === true) {
        found.data.authoredCharacter = 'docket';
        // A stale/imported marked body may lack the pose block update() writes every tick.
        if (!found.data.docketPose) found.data.docketPose = docketEntitySpec(this.state.docket).data.docketPose;
      }
      this._id = found?.id ?? null;
    },
    _say(key, important = false) {
      const now = Number(deferredEnterNow(this.state)) || 0;
      if (!important && now - this._lastVoice < DOCKET.voiceCooldown) return;
      const text = DOCKET_LINES[key]; if (!text) return;
      this._lastVoice = now;
      const m = this.state.docket;
      if (m && DOCKET_TOLD.includes(key) && !m.told.includes(key)) m.told.push(key);
      if (this.helpers.voice?.say) this.helpers.voice.say({ id: `docket:${key}`, priority: important ? 65 : 25, channel: 'comms', text, ttl: DOCKET.voiceTtl });
      else this.bus?.emit('toast', { text, kind: 'info', ttl: 7 });
      // Observability only: comms:log also toasts, which would duplicate the voice arbiter.
      this.bus?.emit('docket:voice', { from: DOCKET.callsign, key, text });
    },
    _sound(id, rate = 1) {
      const e = this._entity();
      this.bus?.emit('audio:cue', { id, position: e ? { x: e.pos.x, z: e.pos.z } : DOCKET.anchor,
        gain: 0.7, rate });
    },
    _scan(p) {
      if (this.state.mode !== 'flight' || !(this.state.timeScale > 0) || !this._adventure()) return;
      const player = this._player(), e = this._entity();
      if (!player?.alive || player.flags?.docked || !finiteXZ(player.pos)) return;
      // Scanner-issued pulse only. Duplicate deliveries cannot arm/cancel twice.
      if (!p || p.source !== 'player-scanner' || p.scannerId !== player.id
        || !Number.isSafeInteger(p.seq) || p.seq < 1 || !finiteXZ(p.pos)
        || distanceXZ(p.pos, player.pos) > 2 || !Number.isFinite(p.radius) || p.radius <= 0) return;
      if (this._scanSource === player && p.seq <= this._scanSeq) return;
      this._scanSource = player; this._scanSeq = p.seq;
      const m = this.state.docket, reach = Math.min(p.radius, DOCKET.scanRadius);
      if (!e) {
        // The drone is gone; the paperwork is not. Scanning the berth it drifted at — or the
        // address that is still on the chart — finds the dark manifest instead of a body.
        if (m?.destroyed && (distanceXZ(player.pos, DOCKET.anchor) <= reach
            || distanceXZ(player.pos, DOCKET.depot) <= reach)) this._say('memorialScan', true);
        return;
      }
      if (distanceXZ(e.pos, player.pos) > reach) return;
      if (m.delivered) {
        // Delivered before first contact: the scan reads the closed manifest, not the intro.
        if (!m.met) { m.met = true; this._sound('sfx_docket_stamp'); this.bus?.emit('docket:met', { id: e.id }); }
        this._say('deliveredHello'); return;
      }
      if (!m.met) {
        m.met = true; this._sound('sfx_docket_stamp'); this._say('hello', true);
        this.bus?.emit('docket:met', { id: e.id });
        return;
      }
      this._say(m.told.includes('brief') ? 'inTransit' : 'brief');
    },
    _damage(p) {
      if (!p || p.targetId !== this._id || !((p.applied ?? p.amount) > 0)) return;
      const e = this._entity(); if (!e) return;
      this._touchedAt = this.state.simTime || 0;
      const m = this.state.docket;
      m.hull = e.hull;
      m.wronged += 1;
      this._poseGesture = 'thud'; this._poseGestureAt = this._touchedAt;
      this._sound('sfx_docket_thud');
      this._say(m.told.includes('wronged') ? 'shy' : 'wronged');
    },
    _killed(p) {
      if (!p || p.id !== this._id) return;
      const m = this.state.docket;
      m.destroyed = true; m.hull = 0;
      this._id = null;
      // A delivered parcel was not undelivered — the memorial files the receipt, not the miss.
      const text = m.delivered ? DOCKET_LINES.memorialDelivered : DOCKET_LINES.memorial;
      this.bus?.emit('comms:log', { from: DOCKET.callsign, text, kind: 'character' });
    },
    _deliver(e) {
      const m = this.state.docket;
      m.delivered = true;
      e.data.docketPose.phase = 'parked';
      this._poseGesture = 'stamped'; this._poseGestureAt = this.state.simTime || 0;
      this._sound('sfx_docket_arrived');
      this._say('arrived', true);
      this.bus?.emit('docket:delivered', { id: e.id, playerId: this.state.playerId });
      this.bus?.emit('comms:log', { from: DOCKET.callsign, text: DOCKET_LINES.news, kind: 'news' });
    },
    _servoToward(e, goal, accelCap, speedCap, dt) {
      const dv = boundedServo(e, goal, dt, {}, accelCap, speedCap);
      if (dv) queuePhysicsImpulse(e, { x: dv.x * DOCKET.mass, y: 0, z: dv.z * DOCKET.mass });
      return dv;
    },
    update(dt, state = this.state) {
      if (!state || !Number.isFinite(dt) || dt <= 0 || state.mode !== 'flight' || !(state.timeScale > 0)) return;
      dt = Math.min(dt, 0.1);
      const now = state.simTime || 0;
      if (now >= this._nextSync) { this._syncEntity(); this._nextSync = now + 2; }
      const e = this._entity(), player = this._player();
      if (!e || !player?.alive || !finiteXZ(player.pos)) return;
      if (!this._adventure() || player.flags?.docked) return;
      const m = state.docket, r = distanceXZ(e.pos, player.pos);
      const held = playerHoldsLine(state, e);
      if (held && !this._held && !m.told.includes('lineOn') && !m.delivered) this._say('lineOn', true);
      if (held) this._touchedAt = now;
      this._held = held;
      const speed = speedOf(e);
      // In transit: a carried or thrown parcel says so once, then rides quiet.
      if (!m.delivered && speed > 60 && now - this._lastTransit > DOCKET.transitCooldown) {
        this._lastTransit = now; this._transitAt = now;
        if (!m.told.includes('inTransit')) this._say('inTransit');
        this._sound('sfx_docket_print');
      }
      if (!m.delivered) {
        const check = deliveryCheck(e);
        // The latch: inside the cradle and at rest. A fast pass is an overshoot, called on exit.
        if (check.inZone && !this._insideDepot) this._insideDepot = true;
        if (check.arrived) { this._deliver(e); }
        else {
          if (!check.inZone && this._insideDepot) {
            this._insideDepot = false;
            if (now - this._lastOvershoot > DOCKET.overshootCooldown) {
              this._lastOvershoot = now; m.overshoots += 1;
              this._say('overshoot');
            }
          }
          // It trims its own final approach inside the shelf — weak, capped, address-ward only.
          if (inApproachShelf(e)) {
            this._servoToward(e, DOCKET.depot, DOCKET.approachAccel, DOCKET.approachSpeed, dt);
            // Once ever, while the trim is actually working the cradle. _insideDepot is already
            // set by the time we get here, so the gate is the told record, not the transition.
            if (check.inZone && !m.told.includes('close')) this._say('close');
          } else if (now - this._touchedAt > DOCKET.touchedQuietSeconds
              && distanceXZ(e.pos, DOCKET.anchor) < DOCKET.anchorLeash) {
            // Undelivered and untouched: drift home so the encounter stays findable.
            this._servoToward(e, DOCKET.anchor, DOCKET.anchorAccel, DOCKET.maxSpeed, dt);
          }
          // Wrong manifest leg: so far off the route the parcel itself calls it — but only to
          // a manifest the pilot opened, and only within earshot; a flung parcel 5000 WU off
          // route does not fill the comms feed forever.
          if (!held && m.met && r < DOCKET.discoverRadius
              && distanceXZ(e.pos, DOCKET.depot) > 2.4 * distanceXZ(DOCKET.anchor, DOCKET.depot)) {
            this._say('wrongway');
          }
        }
      } else {
        // Delivered: the parcel holds the dock. Its job was arriving; staying is the receipt.
        this._servoToward(e, DOCKET.depot, DOCKET.approachAccel, DOCKET.approachSpeed, dt);
      }
      if (r < DOCKET.discoverRadius && !this._discoverySaid) {
        this._discoverySaid = true;
        if (!m.met) this._say('discover');
      }
      if (r < DOCKET.nearRadius && !this._inside) {
        this._inside = true; m.visits += 1;
      } else if (r > DOCKET.discoverRadius + 50) { this._inside = false; }
      // Ambient manifest commentary while the player sits near the parcel.
      const quietPool = m.delivered
        ? ['deliveredQuiet']
        : ['quiet1', 'quiet2', 'quiet3', 'quiet4', 'quiet5'];
      if (m.met && r < DOCKET.nearRadius && now - this._lastQuiet > DOCKET.quietSeconds) {
        this._lastQuiet = now;
        this._say(quietPool[this._quietIdx++ % quietPool.length]);
      }
      const pose = e.data.docketPose;
      pose.simTime = now; // Renderer authored clock advances through pause; our latch must not.
      pose.phase = m.delivered ? 'parked' : (held || speed > 60) ? 'transit' : 'adrift';
      pose.gaze = Math.atan2(player.pos.z - e.pos.z, player.pos.x - e.pos.x);
      pose.gesture = this._poseGesture; pose.gestureAt = this._poseGestureAt;
      pose.transitAt = this._transitAt;
      m.hull = e.hull;
    },
  };
}

export const docket = createDocket();
