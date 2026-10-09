// Hasp keeps one skiff in a wash pocket off the Helios–Ceres chord.
// Sim only. The sheet is a rectangle, not an entity, and it is never cargo.
// The skiff is a place: no guns, no collision, pinned to the pocket.

import { makeShipEntitySpec } from './ships.js';
import {
  LINES,
  SECOND_RINSE as C,
  normalizeSecondRinse,
  secondRinseBeat,
  secondRinsePocket,
  secondRinseReach,
  secondRinseSample,
} from '../data/secondRinse.js';

const owners = new WeakMap();

function playerOf(state) {
  return state?.entities?.get(state.playerId) || null;
}

function motionReduced(state) {
  return state?.settings?.video?.motionReduce === true;
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
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._unsubs = [];
    this._memory = normalizeSecondRinse(this.state.secondRinse);
    this.state.secondRinse = this._memory;
    this._resetContact();
    this._pocket = null;
    owners.set(this.state, this);
    const on = (event, fn) => this._unsubs.push(this.bus.on(event, fn));
    on('sector:exit', () => this._shelf());
    on('sector:enter', () => this._resetContact());
    on('entity:killed', (p) => this._onLost(p));
    on('entity:destroyed', (p) => this._onLost(p));
    on('game:newGame', () => this.newGame());
  },
  _resetContact() {
    this._wasOnBlue = false;
    this._wasOnWhite = false;
    this._inHail = false;
    this._hoverDwell = 0;
    this._againAt = -1e9;
    this._prev = null;
    this._clapAt = null;
    this._cutAt = null;
  },
  update(dt, state) {
    if (state.mode !== 'flight' || state.ui?.docked
      || (state.run?.kind === 'survival' && state.run.phase !== 'inactive')
      || state.world?.currentSectorId !== C.sectorId) {
      this._prev = null;
      return;
    }
    const skiff = this.place();
    if (!skiff) return;
    this._tickContact(skiff, dt);
  },
  place() {
    const state = this.state;
    if (state.world?.currentSectorId !== C.sectorId) return null;
    const pocket = this._pocket || (this._pocket = secondRinsePocket());
    if (!pocket) return null;
    const existing = findSkiff(state);
    if (existing) {
      this._hold(existing, pocket);
      return existing;
    }
    if (!this.helpers?.spawnEntity) return null;
    const spec = makeShipEntitySpec(C.shipId, {
      team: 2,
      factionId: C.factionId,
      pos: { x: pocket.x, z: pocket.z },
      rot: pocket.rot,
      ai: { passive: true, allowPassiveManeuver: false, identityStock: true, archetype: 'fleeing_trader' },
    });
    spec.radius = C.hullRadius;
    spec.vel = { x: 0, z: 0 };
    spec.angVel = 0;
    spec.collides = false;
    spec.physicsBody = false;
    spec.weapons = [];
    spec.shield = spec.shieldMax;
    spec.cap = spec.capMax;
    spec.flags = { ...(spec.flags || {}), persistent: true, invuln: true };
    spec.data = {
      ...spec.data,
      weapons: [],
      name: C.name,
      callsign: C.callsign,
      role: 'laundry',
      bountyCr: 0,
      lootTableId: null,
      visualRadius: secondRinseReach(),
      worldRecordId: C.worldRecordId,
      persistenceOwner: C.persistenceOwner,
      secondRinseId: 'hasp',
      homeSectorId: C.sectorId,
      sectorId: C.sectorId,
      transientSector: true,
      intent: { moveZ: 0, moveX: 0, turn: 0, brake: true },
    };
    const actor = this.helpers.spawnEntity(spec);
    if (!actor) return null;
    this._memory.introduced = true;
    this._hold(actor, pocket);
    return actor;
  },
  _hold(skiff, pocket) {
    skiff.pos.x = pocket.x;
    skiff.pos.z = pocket.z;
    skiff.rot = pocket.rot;
    skiff.angVel = 0;
    if (skiff.vel) { skiff.vel.x = 0; skiff.vel.z = 0; }
    skiff.collides = false;
    skiff.physicsBody = false;
    skiff.weapons = [];
    if (skiff.data) skiff.data.weapons = [];
    skiff.flags = { ...(skiff.flags || {}), persistent: true, invuln: true };
    if (skiff.data) skiff.data.visualRadius = secondRinseReach();
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
  _speak(key) {
    const text = LINES[key];
    if (!text) return;
    const voice = this.helpers && this.helpers.voice;
    const spoken = voice && typeof voice.say === 'function' && voice.say({
      id: `second-rinse:${key}:${this.state?.tick ?? 0}`,
      channel: 'comms',
      text,
      kind: 'encounter',
      factionId: C.factionId,
      ttl: 4.5,
    });
    if (!spoken) this.bus?.emit?.('toast', { text, kind: 'info', ttl: 4.5 });
  },
  _cue(id) {
    this.bus?.emit?.('audio:cue', { id });
  },
  _tickContact(skiff, dt) {
    const player = playerOf(this.state);
    if (!player?.pos) return;
    const frozen = motionReduced(this.state);
    const simTime = this.state.simTime || 0;
    const prev = this._prev;
    const step = prev ? Math.hypot(player.pos.x - prev.x, player.pos.z - prev.z) : Infinity;
    const sweepCap = Math.max(90, 1200 * Math.max(Number(dt) || 0, 1 / 60));
    const sample = secondRinseSample(
      skiff.pos,
      skiff.rot || 0,
      player.pos,
      prev && step <= sweepCap ? prev : null,
      Number.isFinite(player.radius) ? player.radius : 8,
      simTime,
      this._memory.flag,
      frozen,
    );
    sample.wasOnBlue = this._wasOnBlue;
    sample.wasOnWhite = this._wasOnWhite;
    const next = secondRinseBeat({
      flag: this._memory.flag,
      heard: this._memory.heard,
      inHail: this._inHail,
      hoverDwell: this._hoverDwell,
      againAt: this._againAt,
    }, sample, dt);
    this._memory.flag = next.flag;
    this._memory.heard = next.heard;
    this._inHail = next.inHail;
    this._hoverDwell = next.hoverDwell;
    this._againAt = next.againAt;
    if (next.line) this._speak(next.line);
    if (next.cue === 'clap') {
      this._clapAt = simTime;
      this._cue('sfx.secondRinse.clap');
      this._cue('sfx.secondRinse.steam');
    } else if (next.cue === 'pin') {
      this._cutAt = simTime;
      this._cue('sfx.secondRinse.pin');
    }
    this._wasOnBlue = sample.overlapsBlue;
    this._wasOnWhite = sample.overlapsWhite;
    this._prev = { x: player.pos.x, z: player.pos.z };
    this.state.secondRinse = this._memory;
  },
  serialize() {
    return normalizeSecondRinse(this._memory);
  },
  deserialize(raw) {
    this._memory = normalizeSecondRinse(raw);
    this.state.secondRinse = this._memory;
    this._resetContact();
  },
  afterContinue() {},
  newGame() {
    this._shelf();
    this._memory = normalizeSecondRinse(null);
    this.state.secondRinse = this._memory;
  },
  destroy() {
    for (const off of this._unsubs || []) off?.();
    this._unsubs = [];
    owners.delete(this.state);
  },
};

export function secondRinsePresentation(state, entity) {
  if (!entity || entity.data?.secondRinseId !== 'hasp' || entity.alive === false) return null;
  const mem = state?.secondRinse;
  if (!mem) return null;
  const owner = owners.get(state);
  return {
    flag: mem.flag === 'crooked' || mem.flag === 'cut' ? mem.flag : 'open',
    simTime: state.simTime || 0,
    frozen: motionReduced(state),
    tick: state.tick,
    clapAt: owner?._clapAt ?? null,
    cutAt: owner?._cutAt ?? null,
  };
}
