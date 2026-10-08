// Hasp keeps one skiff in a wash pocket off the Helios–Ceres chord.
// Sim only. The sheet is a rectangle, not an entity, and it is never cargo.

import { makeShipEntitySpec } from './ships.js';
import {
  LINES,
  SECOND_RINSE as C,
  blueSheetLocal,
  circleHitsPoly,
  localToWorld,
  localsToWorld,
  normalizeSecondRinse,
  pinCordLocal,
  secondRinsePocket,
  secondRinseResolve,
  sweptCircleHitsPoly,
  sweptCircleHitsSegment,
  whiteSheetLocal,
} from '../data/secondRinse.js';

const owners = new WeakMap();

function playerOf(state) {
  return state?.entities?.get(state.playerId) || null;
}

function findSkiff(state) {
  for (const e of state.entityList || []) {
    if (e && e.alive !== false && e.data?.worldRecordId === C.worldRecordId) return e;
  }
  return null;
}

export const secondRinseEncounter = Object.freeze({
  fire(d, live, state) {
    const owner = owners.get(state);
    if (owner) owner.place();
    if (typeof d.resolve === 'function') d.resolve(live, 'strung', { speak: false });
  },
  tick() {},
});

export const secondRinse = {
  name: 'secondRinse',
  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._unsubs = [];
    this._memory = normalizeSecondRinse(this.state.secondRinse);
    this.state.secondRinse = this._memory;
    this._wasOnBlue = false;
    this._wasOnWhite = false;
    this._inPocket = false;
    this._said = { tuesday: false, boat: false, hover: false, white: false, stay: false };
    this._clapAt = null;
    this._cutAt = null;
    this._prev = null;
    this._lastVoice = -Infinity;
    owners.set(this.state, this);
    const on = (event, fn) => this._unsubs.push(this.bus.on(event, fn));
    on('sector:exit', () => this._shelf());
    on('sector:enter', () => this._resetContact());
    on('world:playerRelocated', () => this._resetContact());
    on('save:restoring', () => this._shelf());
    on('save:loaded', () => this._resetContact());
    on('entity:killed', (p) => this._onLost(p));
    on('entity:destroyed', (p) => this._onLost(p));
    on('game:newGame', () => this.newGame());
  },
  update(_dt, state) {
    if (state.mode !== 'flight' || state.ui?.docked || state.timeScale === 0) { this._resetContact(); return; }
    if (!this._home()) { this._shelf(); return; }
    const skiff = this.place();
    if (!skiff) return;
    this._tickContact(skiff);
  },
  place() {
    const state = this.state;
    if (!this._home()) return null;
    const existing = findSkiff(state);
    if (existing) return existing;
    const pocket = secondRinsePocket();
    if (!pocket || !this.helpers?.spawnEntity) return null;
    const spec = makeShipEntitySpec(C.shipId, {
      team: 2,
      factionId: C.factionId,
      pos: { x: pocket.x, z: pocket.z },
      rot: pocket.rot,
      ai: { passive: true, allowPassiveManeuver: false, archetype: 'fleeing_trader' },
    });
    spec.radius = C.hullRadius;
    spec.vel = { x: 0, z: 0 };
    spec.angVel = 0;
    spec.flags = { ...(spec.flags || {}), persistent: true, invuln: true };
    // The wash is moored, not a disguised Kestrel collision skin that can sail away.
    spec.physicsBody = { dynamic: false, shape: 'ball', radius: C.hullRadius, useMeasuredSkin: false, material: 'ship' };
    spec.data = {
      ...spec.data,
      weapons: [],
      name: C.name,
      callsign: C.callsign,
      role: 'laundry',
      worldRecordId: C.worldRecordId,
      persistenceOwner: C.persistenceOwner,
      secondRinseId: 'hasp',
      visualRadius: 110,
      scannerSignalKind: 'anomaly',
      scanLabel: 'Second Rinse · loose blue sheet · short mast cord',
      homeSectorId: C.sectorId,
      sectorId: C.sectorId,
      transientSector: true,
      intent: { moveZ: 0, moveX: 0, turn: 0, brake: true },
    };
    const actor = this.helpers.spawnEntity(spec);
    if (actor) this._memory.introduced = true;
    return actor || null;
  },
  _onLost(payload) {
    const id = payload?.entityId ?? payload?.id ?? payload?.targetId;
    const e = id != null ? this.state.entities.get(id) : payload?.entity;
    if (e?.data?.worldRecordId !== C.worldRecordId) return;
    if (this.helpers?.removeEntity && e.alive !== false) this.helpers.removeEntity(e.id);
  },
  _shelf() {
    const e = findSkiff(this.state);
    if (e && this.helpers?.removeEntity) this.helpers.removeEntity(e.id);
    this._resetContact();
  },
  _home() {
    const kind = this.state?.run?.kind;
    return (!kind || kind === 'adventure' || kind === 'campaign') && this.state?.world?.currentSectorId === C.sectorId;
  },
  _resetContact() {
    this._prev = null;
    this._wasOnBlue = false;
    this._wasOnWhite = false;
    this._inPocket = false;
  },
  _speak(key) {
    const text = LINES[key];
    if (!text) return;
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ id: `second-rinse:${key}`, channel: 'comms', priority: 28, text, kind: 'encounter', factionId: C.factionId, ttl: 7 });
    } else {
      this.bus?.emit?.('toast', { text, kind: 'info', ttl: 7 });
    }
    this._lastVoice = this.state.simTime || 0;
  },
  _cue(id) {
    const e = findSkiff(this.state);
    this.bus?.emit?.('audio:cue', { id, position: e ? { x: e.pos.x, z: e.pos.z } : undefined });
  },
  _tickContact(skiff) {
    const player = playerOf(this.state);
    if (!player?.pos || player.alive === false) { this._resetContact(); return; }
    const origin = skiff.pos;
    const rot = skiff.rot || 0;
    const radius = player.radius || 8;
    const flag = this._memory.flag;
    const simTime = this.state.simTime || 0;
    // Sector entry, Continue, player replacement and time discontinuities are placements, not flight.
    const prior = this._prev;
    const continuous = prior?.player === player && prior?.skiff === skiff
      && simTime >= prior.time && simTime - prior.time <= 0.1;
    const prev = continuous ? prior.pos : player.pos;
    const blue = localsToWorld(origin, rot, blueSheetLocal(simTime, flag));
    const onBlue = flag === 'open' && circleHitsPoly(player.pos.x, player.pos.z, radius, blue);
    const sweptBlue = flag === 'open' && continuous && sweptCircleHitsPoly(prev, player.pos, radius, blue);
    let onWhite = false;
    if (flag === 'open') {
      for (let i = 0; i < 3; i++) {
        const sheet = localsToWorld(origin, rot, whiteSheetLocal(i));
        if (circleHitsPoly(player.pos.x, player.pos.z, radius, sheet)
          || (continuous && sweptCircleHitsPoly(prev, player.pos, radius, sheet))) { onWhite = true; break; }
      }
    }
    const pin = pinCordLocal();
    const a = localToWorld(origin, rot, pin.a);
    const b = localToWorld(origin, rot, pin.b);
    const cordCut = flag === 'open' && continuous && sweptCircleHitsSegment(prev, player.pos, radius, a, b);
    const hit = continuous ? secondRinseResolve(flag, {
      overlapsBlue: onBlue || sweptBlue,
      wasOnBlue: this._wasOnBlue,
      overlapsWhite: onWhite,
      wasOnWhite: this._wasOnWhite,
      cordCut,
    }) : null;
    const here = Math.hypot(player.pos.x - origin.x, player.pos.z - origin.z) < C.hailRadius;
    if (!hit && here && !this._inPocket) {
      if (flag === 'open' && !this._said.tuesday) { this._speak('tuesday'); this._said.tuesday = true; }
      else if (flag === 'crooked') this._speak('crookedAgain');
      else if (flag === 'cut') this._speak('cutAgain');
    }
    if (!hit && here && flag === 'open' && this._said.tuesday && !this._said.boat && simTime - this._lastVoice >= C.voiceInterval) {
      this._speak('boat');
      this._said.boat = true;
    } else if (!hit && here && flag === 'open' && this._said.boat && !this._said.hover && simTime - this._lastVoice >= C.voiceInterval) {
      this._speak('hover');
      this._said.hover = true;
    }
    if (hit === 'cut') {
      this._memory.flag = 'cut';
      this._cutAt = simTime;
      this._cue('sfx.secondRinse.pin');
      this._speak('cut');
    } else if (hit === 'crooked') {
      this._memory.flag = 'crooked';
      this._clapAt = simTime;
      this._speak('shut');
      this._cue('sfx.secondRinse.clap');
      this._cue('sfx.secondRinse.pin');
      this._cue('sfx.secondRinse.steam');
    } else if (hit === 'white' && !this._said.white) {
      this._said.white = true;
      this._speak('white');
    }
    if (!here && this._inPocket && (this._memory.flag === 'crooked' || this._memory.flag === 'cut') && !this._said.stay) {
      this._speak('stay');
      this._said.stay = true;
    }
    this._inPocket = here;
    this._wasOnBlue = onBlue;
    this._wasOnWhite = onWhite;
    this._prev = { player, skiff, time: simTime, pos: { x: player.pos.x, z: player.pos.z } };
    skiff.data.scanLabel = this._memory.flag === 'open' ? 'Second Rinse · catch the loose blue end · mind the mast cord'
      : this._memory.flag === 'crooked' ? 'Second Rinse · blue boat clipped upside down' : 'Second Rinse · empty blue pin · white wash still hung';
    this.state.secondRinse = this._memory;
  },
  serialize() {
    return normalizeSecondRinse(this._memory);
  },
  deserialize(raw) {
    this._memory = normalizeSecondRinse(raw);
    this.state.secondRinse = this._memory;
    this._resetContact();
    this._said = { tuesday: false, boat: false, hover: false, white: false, stay: false };
    this._lastVoice = -Infinity;
    this._clapAt = null;
    this._cutAt = null;
  },
  afterContinue() { this._resetContact(); this.place(); },
  newGame() {
    this._shelf();
    this._memory = normalizeSecondRinse(null);
    this.state.secondRinse = this._memory;
    this._said = { tuesday: false, boat: false, hover: false, white: false, stay: false };
    this._clapAt = null;
    this._cutAt = null;
    this._lastVoice = -Infinity;
  },
  destroy() {
    for (const off of this._unsubs || []) off?.();
    this._unsubs = [];
    if (this.state) owners.delete(this.state);
  },
};

export function secondRinsePresentation(state, entity) {
  if (!entity || entity.data?.secondRinseId !== 'hasp' || entity.alive === false) return null;
  const mem = state?.secondRinse;
  if (!mem || state.mode !== 'flight') return null;
  const owner = owners.get(state);
  return {
    flag: mem.flag === 'crooked' || mem.flag === 'cut' ? mem.flag : 'open',
    simTime: state.simTime || 0,
    tick: state.tick,
    clapAt: owner?._clapAt ?? null,
    cutAt: owner?._cutAt ?? null,
  };
}
