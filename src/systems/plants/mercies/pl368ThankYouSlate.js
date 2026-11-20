// PL-368 The thank-you slate — "A slate at a dockside: leave anything on it with your tag, and
// one day the tag comes back engraved THANKS, with a small part you were short of | Leave
// something real; or leave junk tagged as treasure — slates engrave what they weigh, and
// everyone can read the slate"
//
// Seams (verified): the slate is a REAL story prop at a dockside offset off the verified
// sector_sker_haven claim-site POI (src/data/claimableBodies.js: poi_claim_morrow). Leaving is
// physical: a pod of YOURS (data.playerJettisonOrigin — the spawnJettisonedCargoPod stamp) at
// rest inside the slate's drop ring; the entry is stamped onto the slate itself (data.slate)
// so EVERYONE can read it on scan, capped by memoryCap. The return is a real pod: the tag
// plaque engraved THANKS plus one small part you were short of — a hash32 pick from verified
// part commodities, deterministic per tag. Junk tagged as treasure engraves what it weighs:
// the return pod's scan reads "N u of <junk>", no part, and the public slate says so.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; hash32 picks the part per tag.
//   No Math.random(), no Date.now(). No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes owned props/pods, clears Maps.
//   Props respawn on sector re-entry; the slate's public book is bounded (memoryCap).
// - One return per leave, after returnDelayS (one in-world day); leaves beyond the cap are
//   retired oldest-first so the slate never grows unbounded.
// - No economy mutation: gifts are physical pods; THANKS is an engraving stamp.

import { hash32 } from '../../../core/rng.js';
import { spawnJettisonedCargoPod } from '../../lootShards.js';

export const PL_368_LEFT_EVENT = 'plants:pl368:left';
export const PL_368_THANKS_EVENT = 'plants:pl368:thanks';

export const THANK_YOU_SLATE_TUNING = Object.freeze({
  sectorId: 'sector_sker_haven',
  poiX: 2100,                 // verified claim-site POI poi_claim_morrow (sector-local)
  poiZ: -1450,
  slateOffsetWu: 210,         // the dockside, off the POI at a hash32 offset
  dropRadiusWu: 40,
  restSpeedWu: 6,
  returnDelayS: 240,          // "one day" — a 240 s day
  partCmdtys: ['cmdty_alloys', 'cmdty_comp_circuitry', 'cmdty_fuel_cells'], // verified parts
  junkCmdtys: ['cmdty_scrap_metal', 'cmdty_salvage_electronics', 'cmdty_silicate'],
  memoryCap: 8,               // the public slate never grows unbounded
});

export const SLATE_THANKS_WORD = 'THANKS';

/** Pure: the slate's position — hash32 offset off the real POI, stable per POI. */
export function slatePos(t = THANK_YOU_SLATE_TUNING) {
  const roll = hash32('plantsPl368Slate', t.poiX, t.poiZ);
  const ang = (roll % 3600) * (Math.PI * 2) / 3600;
  const rad = t.slateOffsetWu * (0.8 + ((roll >>> 8) % 40) / 100);
  return { x: t.poiX + Math.cos(ang) * rad, z: t.poiZ + Math.sin(ang) * rad };
}

/** Pure: is this commodity honest ("real") or junk tagged as treasure? */
export function isJunkForSlate(commodityId, t = THANK_YOU_SLATE_TUNING) {
  return t.junkCmdtys.includes(String(commodityId));
}

/** Pure: the small part you were short of — deterministic per tag. */
export function shortPartFor(tag, t = THANK_YOU_SLATE_TUNING) {
  const roll = hash32('plantsPl368Part', String(tag));
  return t.partCmdtys[roll % t.partCmdtys.length];
}

/** Pure: the public engraving for a leave — slates engrave what they weigh. */
export function engravingFor(commodityId, amount, tag) {
  return `${commodityId} — ${amount} units — tag ${tag}`;
}

/** Pure: the slate's prop spec; its public book rides the data everyone scans. */
export function slateSpec(pos, book = []) {
  return {
    type: 'beacon',
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    radius: 6,
    mass: 1e6,
    hull: 1,
    hullMax: 1,
    flags: { persistent: true },
    data: {
      parentType: 'story_prop',
      storyPropKind: 'plants_thank_you_slate',
      plantsPl368Slate: true,
      scanLabel: 'A slate at the dockside. Leave anything with your tag; it answers in kind.',
      swarmFloorPad: { label: 'Thank-you slate' },
      lampLit: true,
      slate: book.slice(),    // public: everyone can read the slate
    },
  };
}

export function createPl368ThankYouSlate() {
  return {
    name: 'plantsPl368',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._slateId = null;
      this._book = [];          // public entries: { tag, commodityId, amount, junk, at }
      this._pending = [];       // returns in flight: { tag, commodityId, amount, junk, dueAt }
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
      this._book = [];
      this._pending = [];
    },

    _hardReset() {
      this._despawnProps();
      this._book = [];
      this._pending = [];
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
      if (typeof rm === 'function' && this._slateId != null) rm(this._slateId);
      this._slateId = null;
    },

    _stampSlate() {
      const slate = this.state?.entities?.get ? this.state.entities.get(this._slateId) : null;
      if (slate && slate.data) slate.data.slate = this._book.slice();
    },

    update() {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const inSector = s.world?.currentSectorId === THANK_YOU_SLATE_TUNING.sectorId;
      if (!inSector) { if (this._slateId != null) this._despawnProps(); return; }
      const now = this._now();
      const pos = slatePos();
      if (this._slateId == null) {
        const spawn = this.helpers?.spawnEntity;
        if (typeof spawn === 'function') {
          const ent = spawn(slateSpec(pos, this._book));
          if (ent && ent.id != null) this._slateId = ent.id;
        }
        if (this._slateId == null) return;
      }

      // Returns land one day later: the tag comes back engraved THANKS.
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn === 'function' && this._pending.length > 0) {
        const due = this._pending.filter((r) => now >= r.dueAt);
        for (const r of due) {
          this._pending.splice(this._pending.indexOf(r), 1);
          if (this._pending.length + this._book.length > THANK_YOU_SLATE_TUNING.memoryCap) {
            this._book.shift(); // the slate stays readable, never unbounded
          }
          const pod = spawnJettisonedCargoPod(s, {
            commodityId: r.junk ? r.commodityId : shortPartFor(r.tag),
            amount: r.junk ? r.amount : 1, // junk comes back as exactly what it weighed
            pos: { x: pos.x + 9, z: pos.z + 4 },
            vel: { x: 0, z: 0 },
            radius: 3,
            ownerId: null,
            ownerName: 'The thank-you slate',
          }, this.helpers);
          if (!pod || pod.id == null) continue;
          pod.data = pod.data || {};
          pod.data.plantsPl368Return = true;
          pod.data.engraving = SLATE_THANKS_WORD;
          pod.data.forTag = r.tag;
          pod.data.scanLabel = r.junk
            ? `The slate engraves what it weighs: ${r.amount} units of ${r.commodityId}. Tag: ${r.tag}.`
            : `Engraved ${SLATE_THANKS_WORD} — and the small part you were short of. Tag: ${r.tag}.`;
          pod.data.swarmFloorPad = { label: r.junk ? 'Weighs what it weighs' : 'Tag: THANKS' };
          if (r.junk) {
            this.bus?.emit('comms:popup', {
              id: `plants:pl368:junk:${Math.round(now)}`,
              sender: 'The thank-you slate',
              category: 'story',
              text: 'The slate engraves what it weighs.',
              ttl: 9,
              persist: false,
            });
            this.bus?.emit('audio:cue', { id: 'ui_deny' });
          } else {
            this.bus?.emit('comms:popup', {
              id: `plants:pl368:thanks:${Math.round(now)}`,
              sender: 'The thank-you slate',
              category: 'story',
              text: 'Your tag came back. THANKS.',
              ttl: 8,
              persist: false,
            });
            this.bus?.emit('audio:cue', { id: 'confirm' });
          }
          this.bus?.emit(PL_368_THANKS_EVENT, {
            returnPodId: pod.id,
            tag: r.tag,
            junk: r.junk,
            engraving: SLATE_THANKS_WORD,
            commodityId: pod.data.commodityId ?? pod.data.cargoIdentity?.commodityId ?? null,
            pos: { x: pos.x, z: pos.z },
            t: now,
          });
        }
      }

      // Leaving: your pod, at rest, in the drop ring.
      if (typeof spawn !== 'function') return;
      for (const ent of s.entities.values()) {
        if (!ent || ent.alive === false || !ent.data || !ent.pos) continue;
        if (ent.data.playerJettisonOrigin == null) continue; // yours, left with your tag on it
        if (ent.data.plantsPl368Left === true) continue;
        const vx = Number(ent.vel && ent.vel.x) || 0;
        const vz = Number(ent.vel && ent.vel.z) || 0;
        if (vx * vx + vz * vz > THANK_YOU_SLATE_TUNING.restSpeedWu * THANK_YOU_SLATE_TUNING.restSpeedWu) continue;
        const ex = ent.pos.x - pos.x;
        const ez = ent.pos.z - pos.z;
        if (ex * ex + ez * ez > THANK_YOU_SLATE_TUNING.dropRadiusWu * THANK_YOU_SLATE_TUNING.dropRadiusWu) continue;
        const commodityId = ent.data.cargoIdentity?.commodityId ?? ent.data.commodityId ?? 'cmdty_scrap_metal';
        const amount = Math.max(1, Math.floor(Number(ent.data.amount) || 1));
        ent.data.plantsPl368Left = true;
        const junk = isJunkForSlate(commodityId);
        const tag = ent.data.playerJettisonOrigin.ownerId ?? s.playerId ?? 'unknown';
        if (this._book.length >= THANK_YOU_SLATE_TUNING.memoryCap) this._book.shift();
        this._book.push({ tag, commodityId, amount, junk, at: now });
        this._stampSlate(); // everyone can read the slate
        this._pending.push({ tag, commodityId, amount, junk, dueAt: now + THANK_YOU_SLATE_TUNING.returnDelayS });
        this.bus?.emit('comms:popup', {
          id: `plants:pl368:left:${Math.round(now)}`,
          sender: 'The thank-you slate',
          category: 'story',
          text: junk ? 'On the slate. Everyone can read it.' : 'On the slate. It answers in kind.',
          ttl: 8,
          persist: false,
        });
        this.bus?.emit(PL_368_LEFT_EVENT, {
          tag,
          commodityId,
          amount,
          junk,
          engraving: engravingFor(commodityId, amount, tag),
          pos: { x: pos.x, z: pos.z },
          t: now,
        });
        break; // one leave per pass
      }
    },
  };
}

export const pl368ThankYouSlate = createPl368ThankYouSlate();
