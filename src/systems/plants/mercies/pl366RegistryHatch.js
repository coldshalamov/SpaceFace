// PL-366 The registry hatch — "A hatch that takes what you have and returns what you need —
// once, for anyone, ever | Post honestly once; or game it with a token — it returns exactly
// what you gave, and does not open again for you"
//
// Seam (verified): the hatch is a REAL story-prop hatch in the dark of sector_sedna_dark,
// anchored at a hash32-derived offset off the verified poi_claim_far_ledger
// (src/data/claimableBodies.js) — a distinct fixture from PL-155's fair-trade hatch, gated
// by the once-ever rule. Posting is physical: a pod of YOURS (data.playerJettisonOrigin, the
// spawnJettisonedCargoPod stamp) at rest inside the hatch ring. The return is a real pod of
// the SAME physics mass via spawnJettisonedCargoPod (src/systems/lootShards.js). "What you
// need" is a hash32 pick from verified useful commodities — never the commodity you posted.
// "A token" is a posting from the verified junk list: the hatch returns EXACTLY what you gave
// (same commodity, same amount, same mass — honest physics, no judgement), and it does not
// open again for anyone. Once-ever: after ANY post (honest or token) the hatch is spent.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; hash32 picks the need. No Math.random(),
//   no Date.now(). No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes owned props, clears bounded Maps.
//   The spent verdict is durable (flag `plantsPl366Spent`).
// - One post ever, for anyone; the return lands after returnDelayS.
// - No economy mutation: the trade is physical pods, weight for weight.

import { hash32 } from '../../../core/rng.js';
import { spawnJettisonedCargoPod } from '../../lootShards.js';

export const PL_366_POSTED_EVENT = 'plants:pl366:posted';
export const PL_366_TOKEN_EVENT = 'plants:pl366:token';
export const PL_366_CLOSED_EVENT = 'plants:pl366:closed';

export const REGISTRY_HATCH_TUNING = Object.freeze({
  sectorId: 'sector_sedna_dark',
  poiX: -2600,                // verified claim-site POI poi_claim_far_ledger (sector-local)
  poiZ: -1700,
  hatchOffsetWu: 2600,        // its own stretch of dark, away from PL-155's hatch
  ringRadiusWu: 60,
  restSpeedWu: 6,
  returnDelayS: 3,            // the hatch takes a beat
  needCmdtys: ['cmdty_alloys', 'cmdty_comp_circuitry', 'cmdty_fuel_cells'], // verified goods
  tokenJunk: ['cmdty_scrap_metal', 'cmdty_salvage_electronics', 'cmdty_silicate'],
  memoryCap: 4,               // bounded post ledger
});

export const PL_366_SPENT_FLAG = 'plantsPl366Spent';

/** Pure: the hatch's position — hash32 offset off the real POI, stable per POI. */
export function hatchPos(t = REGISTRY_HATCH_TUNING) {
  const roll = hash32('plantsPl366Hatch', t.poiX, t.poiZ);
  const ang = (roll % 3600) * (Math.PI * 2) / 3600;
  const rad = t.hatchOffsetWu * (0.85 + ((roll >>> 8) % 30) / 100);
  return { x: t.poiX + Math.cos(ang) * rad, z: t.poiZ + Math.sin(ang) * rad };
}

/** Pure: is this commodity a token (junk) posting? */
export function isTokenPosting(commodityId, t = REGISTRY_HATCH_TUNING) {
  return t.tokenJunk.includes(String(commodityId));
}

/** Pure: what the hatch returns for an honest post — a need, hash32-picked, never the posted one. */
export function neededCommodityFor(podId, postedCommodityId, t = REGISTRY_HATCH_TUNING) {
  const roll = hash32('plantsPl366Need', String(podId));
  const list = t.needCmdtys;
  const first = roll % list.length;
  if (postedCommodityId == null || list[first] !== postedCommodityId) return list[first];
  return list[(first + 1) % list.length]; // what you NEED is something you don't have
}

/** Pure: the hatch's prop spec; the spent chalk changes what everyone scans. */
export function hatchSpec(pos, spent = false) {
  return {
    type: 'beacon',
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    radius: 8,
    mass: 1e6,
    hull: 1,
    hullMax: 1,
    flags: { persistent: true },
    data: {
      parentType: 'story_prop',
      storyPropKind: 'plants_registry_hatch',
      plantsPl366Hatch: true,
      scanLabel: spent
        ? 'A registry hatch, spent. It does not open again.'
        : 'A registry hatch. It takes what you have and returns what you need — once, ever.',
      swarmFloorPad: { label: spent ? 'Spent hatch' : 'Registry hatch' },
      lampLit: !spent,
    },
  };
}

export function createPl366RegistryHatch() {
  return {
    name: 'plantsPl366',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._hatchId = null;
      this._pending = null;     // { podId, commodityId, amount, at, token }
      this._returnId = null;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:exit', () => this._despawnProps());
      on('save:loaded', () => this._despawnProps());
      on('game:newGame', () => this._hardReset());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._despawnProps();
      this._pending = null;
      this._returnId = null;
    },

    _hardReset() {
      this._despawnProps();
      this._pending = null;
      this._returnId = null;
    },

    _flags() {
      const flags = this.state?.story?.flags;
      return flags ? flags : (this.state?.story ? (this.state.story.flags = {}) : null);
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _despawnProps() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        if (this._hatchId != null) rm(this._hatchId);
        if (this._returnId != null) rm(this._returnId);
      }
      this._hatchId = null;
      this._returnId = null;
    },

    _spent() { return this._flags()?.[PL_366_SPENT_FLAG] === true; },

    update() {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const inSector = s.world?.currentSectorId === REGISTRY_HATCH_TUNING.sectorId;
      if (!inSector) { if (this._hatchId != null) this._despawnProps(); return; }
      const now = this._now();
      const pos = hatchPos();
      if (this._hatchId == null) {
        const spawn = this.helpers?.spawnEntity;
        if (typeof spawn === 'function') {
          const ent = spawn(hatchSpec(pos, this._spent()));
          if (ent && ent.id != null) this._hatchId = ent.id;
        }
        if (this._hatchId == null) return;
      }

      // The return lands after a beat.
      if (this._pending && now >= this._pending.at + REGISTRY_HATCH_TUNING.returnDelayS) {
        this._handBack(pos);
      }
      if (this._pending || this._spent()) return;

      // A posting: your pod, at rest, inside the ring.
      if (typeof this.helpers?.spawnEntity !== 'function') return;
      for (const ent of s.entities.values()) {
        if (!ent || ent.alive === false || !ent.data || !ent.pos) continue;
        if (ent.data.playerJettisonOrigin == null) continue; // yours
        if (ent.data.plantsPl366Posted === true) continue;
        const vx = Number(ent.vel && ent.vel.x) || 0;
        const vz = Number(ent.vel && ent.vel.z) || 0;
        if (vx * vx + vz * vz > REGISTRY_HATCH_TUNING.restSpeedWu * REGISTRY_HATCH_TUNING.restSpeedWu) continue;
        const ex = ent.pos.x - pos.x;
        const ez = ent.pos.z - pos.z;
        if (ex * ex + ez * ez > REGISTRY_HATCH_TUNING.ringRadiusWu * REGISTRY_HATCH_TUNING.ringRadiusWu) continue;
        const commodityId = ent.data.cargoIdentity?.commodityId ?? ent.data.commodityId ?? null;
        const amount = Math.max(1, Math.floor(Number(ent.data.amount) || 1));
        // The hatch swallows the posting: one physical body fewer in the world.
        this.helpers?.removeEntity?.(ent.id);
        const token = isTokenPosting(commodityId);
        const flags = this._flags();
        if (flags) flags[PL_366_SPENT_FLAG] = true; // once, for anyone, ever
        this._pending = { commodityId, amount, at: now, token };
        const hatch = s.entities?.get ? s.entities.get(this._hatchId) : null;
        if (hatch && hatch.data) {
          hatch.data.lampLit = false;
          hatch.data.scanLabel = token
            ? 'It returned exactly what you gave. It does not open again for you.'
            : 'It opened once. It does not open again.';
          hatch.data.swarmFloorPad = { label: token ? 'It knew' : 'Spent hatch' };
        }
        if (token) {
          this.bus?.emit('comms:popup', {
            id: `plants:pl366:token:${Math.round(now)}`,
            sender: 'The registry hatch',
            category: 'story',
            text: 'Exactly what you gave. It will not open again.',
            ttl: 9,
            persist: false,
          });
          this.bus?.emit('audio:cue', { id: 'ui_deny' });
          this.bus?.emit(PL_366_TOKEN_EVENT, { commodityId, amount, t: now });
        } else {
          this.bus?.emit('comms:popup', {
            id: `plants:pl366:posted:${Math.round(now)}`,
            sender: 'The registry hatch',
            category: 'story',
            text: 'It takes what you have.',
            ttl: 8,
            persist: false,
          });
          this.bus?.emit(PL_366_POSTED_EVENT, { commodityId, amount, t: now });
        }
        return; // one post, once, ever
      }
    },

    _handBack(pos) {
      const post = this._pending;
      this._pending = null;
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || !post) return;
      // Honest posts come back as a NEED; token posts come back as EXACTLY what you gave.
      const commodityId = post.token ? post.commodityId : neededCommodityFor(pos.x, post.commodityId);
      const pod = spawnJettisonedCargoPod(this.state, {
        commodityId,
        amount: post.amount,   // same amount, same mass — honest physics either way
        pos: { x: pos.x + 10, z: pos.z + 4 },
        vel: { x: 0, z: 0 },
        radius: 4,
        ownerId: null,
        ownerName: 'The registry hatch',
      }, this.helpers);
      if (!pod || pod.id == null) return;
      pod.data = pod.data || {};
      pod.data.plantsPl366Return = true;
      pod.data.scanLabel = post.token
        ? 'What you gave, returned. The hatch is shut.'
        : 'What you needed. The hatch is spent behind you.';
      if (post.token) this._returnId = pod.id;
      const now = this._now();
      this.bus?.emit('comms:popup', {
        id: `plants:pl366:return:${Math.round(now)}`,
        sender: 'The registry hatch',
        category: 'story',
        text: post.token ? 'Weighs the same. Means nothing.' : 'What you needed.',
        ttl: 8,
        persist: false,
      });
      this.bus?.emit('audio:cue', { id: 'confirm' });
      this.bus?.emit(PL_366_CLOSED_EVENT, {
        returnPodId: pod.id,
        commodityId,
        amount: post.amount,
        token: post.token,
        t: now,
      });
    },
  };
}

export const pl366RegistryHatch = createPl366RegistryHatch();
