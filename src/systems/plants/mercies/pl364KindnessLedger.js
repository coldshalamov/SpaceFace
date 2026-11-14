// PL-364 The kindness ledger — "A sealed ledger welded to a lane post records every unclaimed
// kindness done in that lane, and pays the whole book out once a year, in parts, to the names
// in it | Do the kindnesses and wait for the payout; or forge entries — the ledger pays what
// each entry weighs, and lies weigh nothing"
//
// Seams (verified): the lane post is a story prop on the lane through sector_sker_haven,
// anchored at a hash32-derived offset off the verified poi_claim_morrow
// (src/data/claimableBodies.js). "Every unclaimed kindness done in that lane" arrives as the
// exported events of this mercy bank's own modules — kept part (PL_370_KEPT_EVENT), accepted
// tithe (PL_371_TITHE_EVENT), wreckers' courtesy (PL_372_COURTESY_EVENT), warmed visitor
// (PL_373_WARMED_EVENT), restocked cache (PL_271_RESTOCKED_EVENT), left-forward gift
// (PL_272_LEFT_EVENT), real slate gift (PL_368_LEFT_EVENT), gift left at the long view
// (PL_367_GIFT_LEFT_EVENT) — each carrying sectorId or a pos; the ledger admits an entry when
// the sector matches or the pos falls inside its lane radius. Forging is physical: one of YOUR
// jettisoned junk pods (data.playerJettisonOrigin, the spawnJettisonedCargoPod stamp) at rest
// in the post's entry ring is a forged entry — it weighs nothing.
//
// The payout is physical PARTS only: honest entries mint part pods (cmdty_alloys /
// cmdty_comp_circuitry, hash32-mixed) at the post, each stamped with the book it settled. NO
// credits, ever (the row's rule and the batch's). The ledger pays once per mercyYearS
// (240 s day × 30 = one in-world year), then reseals with an empty book.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; hash32 mixes the parts. No Math.random(),
//   no Date.now(). No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes owned props/pods, clears Maps.
//   Durable verdicts ride story flags (`plantsPl364*`). Props respawn on sector re-entry.
// - The book is bounded (memoryCap); the payout is bounded (partCap); once a year, no sooner.
// - No economy mutation: entries are stamps, the payout is physical part pods.

import { hash32 } from '../../../core/rng.js';
import { spawnJettisonedCargoPod } from '../../lootShards.js';
import { PL_370_KEPT_EVENT } from './pl370HousewarmingPart.js';
import { PL_371_TITHE_EVENT } from './pl371LaneTithe.js';
import { PL_372_COURTESY_EVENT } from './pl372WreckersCourtesy.js';
import { PL_373_WARMED_EVENT } from './pl373HearthLamp.js';
import { PL_271_RESTOCKED_EVENT } from './pl271MapInTheLid.js';
import { PL_272_LEFT_EVENT } from './pl272ForwardBeacon.js';
import { PL_368_LEFT_EVENT } from './pl368ThankYouSlate.js';
import { PL_367_GIFT_LEFT_EVENT } from './pl367LingeringLift.js';

export const PL_364_ENTRY_EVENT = 'plants:pl364:entry';
export const PL_364_FORGED_EVENT = 'plants:pl364:forged';
export const PL_364_PAYOUT_EVENT = 'plants:pl364:payout';

export const KINDNESS_LEDGER_TUNING = Object.freeze({
  sectorId: 'sector_sker_haven',
  poiX: 2100,                 // verified claim-site POI poi_claim_morrow (sector-local)
  poiZ: -1450,
  postOffsetWu: 300,          // the lane post, off the POI at a hash32 offset
  laneRadiusWu: 900,          // kindnesses inside this of the post are "in that lane"
  entryRadiusWu: 40,          // junk dropped at rest inside this ring = a forged entry
  restSpeedWu: 6,
  mercyYearS: 240 * 30,       // the mercy-day convention: 240 s day; one year = 30 days
  partCap: 6,                 // the payout is bounded
  junkCmdtys: ['cmdty_scrap_metal', 'cmdty_salvage_electronics', 'cmdty_silicate'],
  partCmdtys: ['cmdty_alloys', 'cmdty_comp_circuitry'],
  memoryCap: 16,              // bounded book
});

export const PL_364_PAYOUT_COUNT_FLAG = 'plantsPl364Payouts';

/** Pure: the lane post's position — hash32 offset off the real POI, stable per POI. */
export function ledgerPostPos(t = KINDNESS_LEDGER_TUNING) {
  const roll = hash32('plantsPl364Post', t.poiX, t.poiZ);
  const ang = (roll % 3600) * (Math.PI * 2) / 3600;
  const rad = t.postOffsetWu * (0.8 + ((roll >>> 8) % 40) / 100);
  return { x: t.poiX + Math.cos(ang) * rad, z: t.poiZ + Math.sin(ang) * rad };
}

/** Pure: does a kindness payload name this lane? Sector match, or pos inside the lane radius. */
export function inLedgerLane(payload, postPos, sectorId, t = KINDNESS_LEDGER_TUNING) {
  if (!payload) return false;
  if (typeof payload.sectorId === 'string' && payload.sectorId === sectorId) return true;
  const x = Number(payload.pos && payload.pos.x);
  const z = Number(payload.pos && payload.pos.z);
  if (!Number.isFinite(x) || !Number.isFinite(z) || !postPos) return false;
  const dx = x - postPos.x;
  const dz = z - postPos.z;
  return dx * dx + dz * dz <= t.laneRadiusWu * t.laneRadiusWu;
}

/** Pure: the payout's part mix for n entries — deterministic per payout. */
export function payoutPartsFor(entryCount, t = KINDNESS_LEDGER_TUNING) {
  const count = Math.max(0, Math.min(t.partCap, Math.floor(Number(entryCount) || 0)));
  const parts = [];
  for (let i = 0; i < count; i++) {
    const roll = hash32('plantsPl364Part', i, entryCount);
    parts.push(t.partCmdtys[roll % t.partCmdtys.length]);
  }
  return parts;
}

/** Pure: the lane post's prop spec. */
export function postSpec(pos) {
  return {
    type: 'beacon',
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    radius: 5,
    mass: 1e6,
    hull: 1,
    hullMax: 1,
    flags: { persistent: true },
    data: {
      parentType: 'story_prop',
      storyPropKind: 'plants_kindness_ledger',
      plantsPl364Ledger: true,
      scanLabel: 'A sealed ledger, welded to the lane post. It pays what each entry weighs.',
      swarmFloorPad: { label: 'Kindness ledger' },
      lampLit: true,
    },
  };
}

const KINDNESS_EVENTS = [
  ['keptPart', PL_370_KEPT_EVENT],
  ['laneTithe', PL_371_TITHE_EVENT],
  ['wreckersCourtesy', PL_372_COURTESY_EVENT],
  ['hearthWarmth', PL_373_WARMED_EVENT],
  ['restockedCache', PL_271_RESTOCKED_EVENT],
  ['leftForward', PL_272_LEFT_EVENT],
  ['slateGift', PL_368_LEFT_EVENT],
  ['giftLeftAtView', PL_367_GIFT_LEFT_EVENT],
];

export function createPl364KindnessLedger() {
  return {
    name: 'plantsPl364',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._postId = null;
      this._podIds = [];
      this._book = [];          // { kind, at, weight }
      this._lastPayoutAt = null;
      this._forged = 0;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      for (const [kind, type] of KINDNESS_EVENTS) {
        on(type, (p = {}) => this._onKindness(kind, p));
      }
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
      this._forged = 0;
    },

    _hardReset() {
      this._despawnProps();
      this._book = [];
      this._forged = 0;
      this._lastPayoutAt = null;
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
        if (this._postId != null) rm(this._postId);
        for (const id of this._podIds || []) rm(id);
      }
      this._postId = null;
      this._podIds = [];
    },

    _onKindness(kind, payload) {
      const pos = ledgerPostPos();
      if (!inLedgerLane(payload, pos, KINDNESS_LEDGER_TUNING.sectorId)) return;
      const now = this._now();
      if (this._book.length >= KINDNESS_LEDGER_TUNING.memoryCap) this._book.shift();
      this._book.push({ kind, at: now, weight: 1 }); // honest entries weigh one
      this.bus?.emit(PL_364_ENTRY_EVENT, { kind, weight: 1, bookSize: this._book.length, t: now });
    },

    _playerPos() {
      const s = this.state;
      const ent = s?.entities?.get && s.playerId != null ? s.entities.get(s.playerId) : null;
      const px = Number((ent && ent.pos && ent.pos.x) ?? (s?.player?.pos && s.player.pos.x));
      const pz = Number((ent && ent.pos && ent.pos.z) ?? (s?.player?.pos && s.player.pos.z));
      if (!Number.isFinite(px) || !Number.isFinite(pz)) return null;
      return { x: px, z: pz };
    },

    update() {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const inSector = s.world?.currentSectorId === KINDNESS_LEDGER_TUNING.sectorId;
      if (!inSector) { if (this._postId != null) this._despawnProps(); return; }
      if (this._postId == null) {
        const spawn = this.helpers?.spawnEntity;
        if (typeof spawn === 'function') {
          const ent = spawn(postSpec(ledgerPostPos()));
          if (ent && ent.id != null) {
            this._postId = ent.id;
            this._lastPayoutAt = this._lastPayoutAt ?? this._now();
          }
        }
        if (this._postId == null) return;
      }
      const now = this._now();
      const pos = ledgerPostPos();

      // Forging: one of YOUR junk pods, at rest in the entry ring, tagged into the book.
      const playerPos = this._playerPos();
      if (playerPos && typeof this.helpers?.spawnEntity === 'function') {
        for (const ent of s.entities.values()) {
          if (!ent || ent.alive === false || !ent.data || !ent.pos) continue;
          if (ent.data.playerJettisonOrigin == null) continue; // yours, left at the post
          if (ent.data.plantsPl364Forged === true) continue;
          const vx = Number(ent.vel && ent.vel.x) || 0;
          const vz = Number(ent.vel && ent.vel.z) || 0;
          if (vx * vx + vz * vz > KINDNESS_LEDGER_TUNING.restSpeedWu * KINDNESS_LEDGER_TUNING.restSpeedWu) continue;
          const ex = ent.pos.x - pos.x;
          const ez = ent.pos.z - pos.z;
          if (ex * ex + ez * ez > KINDNESS_LEDGER_TUNING.entryRadiusWu * KINDNESS_LEDGER_TUNING.entryRadiusWu) continue;
          ent.data.plantsPl364Forged = true;
          ent.data.scanLabel = 'A forged entry. The ledger pays what it weighs: nothing.';
          this._forged += 1;
          this.bus?.emit('comms:popup', {
            id: `plants:pl364:forged:${Math.round(now)}`,
            sender: 'The ledger',
            category: 'story',
            text: 'Lies weigh nothing.',
            ttl: 8,
            persist: false,
          });
          this.bus?.emit('audio:cue', { id: 'ui_deny' });
          this.bus?.emit(PL_364_FORGED_EVENT, {
            podId: ent.id,
            forgedTotal: this._forged,
            pos: { x: pos.x, z: pos.z },
            t: now,
          });
          break; // one chalk per pass
        }
      }

      // The yearly payout: the whole book, in parts, to the names in it.
      if (this._lastPayoutAt != null
        && now >= this._lastPayoutAt + KINDNESS_LEDGER_TUNING.mercyYearS) {
        this._lastPayoutAt = now;
        const honest = this._book.length; // forged entries never entered the book
        const parts = payoutPartsFor(honest);
        const spawn = this.helpers?.spawnEntity;
        if (typeof spawn === 'function') {
          for (let i = 0; i < parts.length; i++) {
            if (this._podIds.length >= KINDNESS_LEDGER_TUNING.memoryCap) {
              const oldest = this._podIds.shift();
              this.helpers?.removeEntity?.(oldest);
            }
            const pod = spawnJettisonedCargoPod(s, {
              commodityId: parts[i],
              amount: 1,
              pos: { x: pos.x + 8 + i * 4, z: pos.z + 4 },
              vel: { x: 0, z: 0 },
              radius: 3,
              ownerId: null,
              ownerName: 'The kindness ledger',
            }, this.helpers);
            if (!pod || pod.id == null) continue;
            pod.data = pod.data || {};
            pod.data.plantsPl364Payout = true;
            pod.data.ledgerEntry = `entry ${i + 1} of ${honest}`;
            this._podIds.push(pod.id);
          }
        }
        const flags = this._flags();
        if (flags) flags[PL_364_PAYOUT_COUNT_FLAG] = (flags[PL_364_PAYOUT_COUNT_FLAG] || 0) + 1;
        if (honest > 0) {
          this.bus?.emit('comms:popup', {
            id: `plants:pl364:payout:${Math.round(now)}`,
            sender: 'The kindness ledger',
            category: 'story',
            text: 'The whole book, paid in parts.',
            ttl: 9,
            persist: false,
          });
        }
        this.bus?.emit(PL_364_PAYOUT_EVENT, {
          honestEntries: honest,
          forgedEntries: this._forged,
          parts,
          pos: { x: pos.x, z: pos.z },
          t: now,
        });
        this._book = []; // the book reseals, empty
        this._forged = 0;
      }
    },
  };
}

export const pl364KindnessLedger = createPl364KindnessLedger();
