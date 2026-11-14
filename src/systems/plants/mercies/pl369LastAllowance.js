// PL-369 The last allowance — "A dead man's standing order at a depot: one charge cell a month
// to whoever asks in person, code word required, asked once a month only | Learn the word the
// slow way, from the old regulars; or brute-force it — the order closes forever, and the depot
// chalks who closed it"
//
// Seams (verified): the depot is a REAL story prop off the verified sector_sker_haven
// claim-site POI (src/data/claimableBodies.js: poi_claim_morrow). Asking in person is physical:
// hold station inside the ask ring (askGapS between asks). The word is learned the slow way —
// loiter near the depot while an OLD REGULAR is present (any non-player hull within
// regularRangeWu: npcjobs traffic and yard visitors already exist as hulls); each such visit
// stamps one fragment of the word onto your durable flag; three fragments and you know it.
// Brute-forcing is physical too: three wordless asks inside one month and the order closes
// forever — the depot chalks you where everyone scans. The cell is a REAL physical charge-cell
// pod stamped to the combat pickup contract (combat.js owns the cap restore; this module only
// provides the physical cell — the documented handoff). No economy mutation; the allowance is
// once per mercyMonthS (mercyYearS / 12, on the 240 s day).
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; the word's fragments are hash32-stamped.
//   No Math.random(), no Date.now(). No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes owned props, clears bounded Maps.
//   Durable verdicts ride story flags (`plantsPl369*`). Props respawn on sector re-entry.
// - One cell per month; a closed order never reopens (durable flag).

import { hash32 } from '../../../core/rng.js';

export const PL_369_ASKED_EVENT = 'plants:pl369:asked';
export const PL_369_WORD_EVENT = 'plants:pl369:word';
export const PL_369_CLOSED_EVENT = 'plants:pl369:closed';

export const LAST_ALLOWANCE_TUNING = Object.freeze({
  sectorId: 'sector_sker_haven',
  poiX: 2100,                 // verified claim-site POI poi_claim_morrow (sector-local)
  poiZ: -1450,
  depotOffsetWu: 460,         // the depot, off the POI at a hash32 offset
  askRadiusWu: 36,
  askGapS: 20,                // one ask per visit
  regularRangeWu: 120,        // an old regular stands this close to the depot
  wordFragmentsNeeded: 3,     // the slow way: three quiet visits among the regulars
  bruteForceLimit: 3,         // three wordless asks inside a month: closed forever
  mercyMonthS: (240 * 30) / 12, // the mercy-day convention: a year is 240 s × 30; a month is a twelfth
  cellCharge: 40,
  cellGraceS: 5,              // combat.js: chargeCell.collectAfter grace before the scoop can take it
  cellLifetimeS: 600,         // combat.js requires a finite despawnAt on every collectable cell
  memoryCap: 8,               // bounded bookkeeping
});

export const PL_369_CLOSED_FLAG = 'plantsPl369Closed';
export const PL_369_CLOSED_BY = 'plantsPl369ClosedBy';
export const PL_369_WORD_FLAG = 'plantsPl369WordKnown';
export const PL_369_WORD_PARTS_FLAG = 'plantsPl369WordParts';
export const PL_369_WORD_CODE = 'plantsPl369WordCode';

/** Pure: the depot's position — hash32 offset off the real POI, stable per POI. */
export function depotPos(t = LAST_ALLOWANCE_TUNING) {
  const roll = hash32('plantsPl369Depot', t.poiX, t.poiZ);
  const ang = (roll % 3600) * (Math.PI * 2) / 3600;
  const rad = t.depotOffsetWu * (0.8 + ((roll >>> 8) % 40) / 100);
  return { x: t.poiX + Math.cos(ang) * rad, z: t.poiZ + Math.sin(ang) * rad };
}

/** Pure: the next word fragment for parts-so-far — deterministic, learnable only in order. */
export function nextWordFragment(partsSoFar, t = LAST_ALLOWANCE_TUNING) {
  const roll = hash32('plantsPl369Word', partsSoFar, t.poiX, t.poiZ);
  return `word-${(roll % 0xffff).toString(16)}`;
}

/** Pure: the depot's prop spec; the chalk changes what everyone scans. */
export function depotSpec(pos, closedBy = null) {
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
      storyPropKind: 'plants_last_allowance_depot',
      plantsPl369Depot: true,
      scanLabel: closedBy == null
        ? 'A dead man\u2019s standing order: one charge cell a month, in person, code word required.'
        : 'The order is closed forever. The chalk says who closed it.',
      swarmFloorPad: { label: closedBy == null ? 'The allowance' : 'Closed forever' },
      lampLit: closedBy == null,
      chalkedBy: closedBy,
    },
  };
}

export function createPl369LastAllowance() {
  return {
    name: 'plantsPl369',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._depotId = null;
      this._lastAskAt = -Infinity;
      this._monthStartAt = null;
      this._wordlessAsks = 0;
      this._lastCellAt = -Infinity;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:exit', () => this._despawnDepot());
      on('save:loaded', () => this._despawnDepot());
      on('game:newGame', () => this._hardReset());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._despawnDepot();
      this._lastAskAt = -Infinity;
      this._monthStartAt = null;
      this._wordlessAsks = 0;
      this._lastCellAt = -Infinity;
    },

    _hardReset() {
      this._despawnDepot();
      this._lastAskAt = -Infinity;
      this._monthStartAt = null;
      this._wordlessAsks = 0;
      this._lastCellAt = -Infinity;
    },

    _flags() {
      const flags = this.state?.story?.flags;
      return flags ? flags : (this.state?.story ? (this.state.story.flags = {}) : null);
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _despawnDepot() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function' && this._depotId != null) rm(this._depotId);
      this._depotId = null;
    },

    _closed() { return this._flags()?.[PL_369_CLOSED_FLAG] === true; },

    _wordKnown() { return this._flags()?.[PL_369_WORD_FLAG] === true; },

    _player() {
      const s = this.state;
      return s?.entities?.get && s.playerId != null ? s.entities.get(s.playerId) : null;
    },

    _regularsNear(pos) {
      // The old regulars: non-player hulls already loitering near the depot (npcjobs traffic,
      // yard visitors — hulls the world already runs). No new system, no new hulls.
      const s = this.state;
      if (!s?.entities || typeof s.entities.values !== 'function') return 0;
      let count = 0;
      for (const ent of s.entities.values()) {
        if (!ent || ent.alive === false || !ent.pos) continue;
        if (ent.id === s.playerId) continue;
        if (ent.id === this._depotId) continue; // the depot itself is not an old regular
        if (ent.type !== 'ship') continue; // real hulls only — npcjobs traffic, yard visitors
        const dx = ent.pos.x - pos.x;
        const dz = ent.pos.z - pos.z;
        if (dx * dx + dz * dz <= LAST_ALLOWANCE_TUNING.regularRangeWu * LAST_ALLOWANCE_TUNING.regularRangeWu) count += 1;
      }
      return count;
    },

    _closeForever(now) {
      const flags = this._flags();
      if (flags) {
        flags[PL_369_CLOSED_FLAG] = true;
        flags[PL_369_CLOSED_BY] = this.state?.playerId ?? 'someone';
      }
      const depot = this.state?.entities?.get ? this.state.entities.get(this._depotId) : null;
      if (depot && depot.data) {
        depot.data.lampLit = false;
        depot.data.chalkedBy = flags ? flags[PL_369_CLOSED_BY] : 'someone';
        depot.data.scanLabel = 'The order is closed forever. The chalk says who closed it.';
        depot.data.swarmFloorPad = { label: 'Closed forever' };
      }
      this.bus?.emit('comms:popup', {
        id: `plants:pl369:closed:${Math.round(now)}`,
        sender: 'The depot',
        category: 'story',
        text: 'The order closes. Chalked: you.',
        ttl: 9,
        persist: false,
      });
      this.bus?.emit('audio:cue', { id: 'ui_deny' });
      this.bus?.emit(PL_369_CLOSED_EVENT, {
        by: flags ? flags[PL_369_CLOSED_BY] : null,
        pos: depotPos(),
        t: now,
      });
    },

    update() {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const inSector = s.world?.currentSectorId === LAST_ALLOWANCE_TUNING.sectorId;
      if (!inSector) { if (this._depotId != null) this._despawnDepot(); return; }
      const now = this._now();
      const pos = depotPos();
      if (this._depotId == null) {
        const spawn = this.helpers?.spawnEntity;
        if (typeof spawn === 'function') {
          const ent = spawn(depotSpec(pos, this._closed()
            ? this._flags()?.[PL_369_CLOSED_BY] ?? 'someone'
            : null));
          if (ent && ent.id != null) this._depotId = ent.id;
        }
        if (this._depotId == null) return;
      }
      if (this._closed()) return;

      const player = this._player();
      if (!player || !player.pos) return;
      const dx = player.pos.x - pos.x;
      const dz = player.pos.z - pos.z;
      const near = (dx * dx + dz * dz) <= LAST_ALLOWANCE_TUNING.askRadiusWu * LAST_ALLOWANCE_TUNING.askRadiusWu;
      if (!near) return;
      if (now - this._lastAskAt < LAST_ALLOWANCE_TUNING.askGapS) return;
      this._lastAskAt = now;

      // The slow way: loiter among the old regulars and the word comes, fragment by fragment.
      const flags = this._flags();
      if (!this._wordKnown() && this._regularsNear(pos) > 0) {
        const parts = Number(flags?.[PL_369_WORD_PARTS_FLAG]) || 0;
        if (parts < LAST_ALLOWANCE_TUNING.wordFragmentsNeeded) {
          const next = parts + 1;
          if (flags) flags[PL_369_WORD_PARTS_FLAG] = next;
          if (next >= LAST_ALLOWANCE_TUNING.wordFragmentsNeeded) {
            if (flags) {
              flags[PL_369_WORD_FLAG] = true;
              flags[PL_369_WORD_CODE] = nextWordFragment(parts);
            }
            this.bus?.emit('comms:popup', {
              id: `plants:pl369:word:${Math.round(now)}`,
              sender: 'The old regulars',
              category: 'story',
              text: 'The old regulars told you the word.',
              ttl: 8,
              persist: false,
            });
            this.bus?.emit('audio:cue', { id: 'confirm' });
          }
          this.bus?.emit(PL_369_WORD_EVENT, {
            parts: next,
            known: next >= LAST_ALLOWANCE_TUNING.wordFragmentsNeeded,
            pos: { x: pos.x, z: pos.z },
            t: now,
          });
          return; // a learning visit is not an ask
        }
      }

      // The ask: wordless asks roll the brute-force window (one month).
      if (this._monthStartAt == null || now >= this._monthStartAt + LAST_ALLOWANCE_TUNING.mercyMonthS) {
        this._monthStartAt = now;
        this._wordlessAsks = 0;
      }
      if (!this._wordKnown()) {
        this._wordlessAsks += 1;
        if (this._wordlessAsks >= LAST_ALLOWANCE_TUNING.bruteForceLimit) {
          // The last wordless ask still gets its receipt before the order shuts.
          this.bus?.emit(PL_369_ASKED_EVENT, { granted: false, wordless: true, bruteForced: true, t: now });
          this._closeForever(now);
          return;
        }
        this.bus?.emit('comms:popup', {
          id: `plants:pl369:wordless:${Math.round(now)}`,
          sender: 'The depot',
          category: 'story',
          text: 'Code word. Ask the regulars, slowly.',
          ttl: 7,
          persist: false,
        });
        this.bus?.emit(PL_369_ASKED_EVENT, { granted: false, wordless: true, t: now });
        return;
      }

      // The granted ask: one charge cell a month, in person.
      if (this._lastCellAt >= 0 && now - this._lastCellAt < LAST_ALLOWANCE_TUNING.mercyMonthS) {
        this.bus?.emit('comms:popup', {
          id: `plants:pl369:month:${Math.round(now)}`,
          sender: 'The depot',
          category: 'story',
          text: 'Once a month. He insisted.',
          ttl: 7,
          persist: false,
        });
        this.bus?.emit(PL_369_ASKED_EVENT, { granted: false, reason: 'once_a_month', t: now });
        return;
      }
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      // The cell: a REAL physical charge-cell pod stamped to the combat pickup contract.
      // combat.js owns the cap restore (it pays collected cells into the player's cap);
      // this module only provides the physical cell — the documented handoff.
      const cell = spawn({
        type: 'payload',
        pos: { x: pos.x + 6, z: pos.z + 3 },
        vel: { x: 0, z: 0 },
        radius: 4,
        mass: 24,
        physicsBody: { mass: 24 },
        hull: 40,
        hullMax: 40,
        collides: true,
        flags: { persistent: true },
        data: {
          kind: 'payload',
          payloadType: 'charge_cell',
          // combat.js:106-114 contract: payloadType + chargeCell{version,charge>0,collectAfter}
          // + finite despawnAt, or the auto-collect walk skips the cell. (kind_pickup is inert.)
          chargeCell: {
            version: 1,
            charge: LAST_ALLOWANCE_TUNING.cellCharge,
            collectAfter: now + LAST_ALLOWANCE_TUNING.cellGraceS,
            createdTick: this.state?.tick ?? 0,
          },
          despawnAt: now + LAST_ALLOWANCE_TUNING.cellLifetimeS,
          charge: LAST_ALLOWANCE_TUNING.cellCharge,
          plantsPl369Cell: true,
          scanLabel: 'A charge cell from the dead man\u2019s standing order.',
          swarmFloorPad: { label: 'Charge cell' },
          ownerId: null,
          factionId: 'player',
        },
      });
      this._lastCellAt = now;
      this.bus?.emit('comms:popup', {
        id: `plants:pl369:cell:${Math.round(now)}`,
        sender: 'The depot',
        category: 'story',
        text: 'One cell. He insisted.',
        ttl: 8,
        persist: false,
      });
      this.bus?.emit('audio:cue', { id: 'confirm' });
      this.bus?.emit(PL_369_ASKED_EVENT, {
        granted: true,
        cellId: cell ? cell.id : null,
        t: now,
      });
    },
  };
}

export const pl369LastAllowance = createPl369LastAllowance();
