// PL-123 Someone's course — Planted anchors dot a lane in a swing-line pattern; the builder watches from a rock with a timer.
// Row (design/program/INFERENCE_PLANTS.md §H):
//   What happens: Planted anchors dot a lane in a pattern that is plainly a swing line, and the
//   builder watches from a rock with a timer
//   What the player can do: Run it clean and get the nod; or cut one anchor loose — the builder
//   collects the pieces, and your description
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via SWING_LINE_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; the builder only
//   watches (one line of voice), so this plant steers nobody.
// - Cooldowns per line key. All session state lives on `this`, never module-level.

import { hash32 } from '../../core/rng.js';

export const PLANTS_SWING_LINE_PLANTED_EVENT = 'plants:swingLinePlanted';
export const PLANTS_SWING_LINE_NOD_EVENT = 'plants:swingLineNod';
export const PLANTS_SWING_LINE_CUT_EVENT = 'plants:swingLineCut';

export const SWING_LINE_TUNING = Object.freeze({
  anchorCount: 5,             // anchors dotting the swing line
  anchorSpacingWu: 160,       // distance between planted anchors
  passageRadiusWu: 70,        // the clean-run corridor through each anchor
  runWindowS: 120,            // the builder's timer: the whole line must fall inside this
  builderOffsetWu: 90,        // the builder watches from a rock this far off the line
  nodCooldownS: 60,           // one nod per line, per window
  debrisPerAnchor: 2,         // pieces the builder collects when an anchor is cut
  debrisRadius: 3,
  debrisMass: 12,
  debrisSpeedWu: 12,          // pieces drift to the builder
  memoryCap: 8,               // one line per sector; bounded anyway
});

export const SWING_LINE_NOD_LINE = 'Clean run.';
export const SWING_LINE_CUT_LINE = 'Noted. Got your plate.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Decision helper (pure): the line's origin — a live lane anchor when one is readable (the
 * first real station), else the sector anchor at the world origin.
 */
export function swingLineOrigin(stations) {
  const real = (Array.isArray(stations) ? stations : []).find(
    (s) => s && s.alive !== false && s.type === 'station' && s.pos && !(s.data && (s.data.isGate || s.data.isWormhole)),
  );
  return real ? { x: finite(real.pos.x), z: finite(real.pos.z) } : { x: 0, z: 0 };
}

/**
 * Decision helper (pure): the swing line's anchor positions for a sector — a plainly-patterned
 * line off the origin anchor, deterministic from the sector id.
 */
export function swingLineAnchors(sectorId, originPos, tuning = SWING_LINE_TUNING) {
  if (!originPos) return [];
  const ang = (hash32(String(sectorId), 'swingLineAngle', 'a') % 6283) / 1000;
  const dx = Math.cos(ang);
  const dz = Math.sin(ang);
  const anchors = [];
  for (let i = 0; i < tuning.anchorCount; i += 1) {
    anchors.push({
      id: `swing-anchor-${i}`,
      x: finite(originPos.x) + dx * tuning.anchorSpacingWu * i,
      z: finite(originPos.z) + dz * tuning.anchorSpacingWu * i,
    });
  }
  return anchors;
}

/**
 * Decision helper (pure): did this passage count — inside the corridor of the expected anchor?
 */
export function passageAt(anchor, pos, tuning = SWING_LINE_TUNING) {
  if (!anchor || !pos) return false;
  const d = Math.hypot(finite(pos.x) - finite(anchor.x), finite(pos.z) - finite(anchor.z));
  return d <= tuning.passageRadiusWu;
}

/**
 * Memory-row builder (pure): the line's run bookkeeping, FIFO + stale eviction at the cap.
 */
export function swingLineRowFor(memory, key, now, cap = SWING_LINE_TUNING.memoryCap) {
  if (!memory || !key) return null;
  let row = memory.get(key);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = {
      anchorIds: [],
      builderId: null,
      nextAnchor: 0,
      runStartAt: -Infinity,
      noddedAt: -Infinity,
      cutIds: [],
      lastAt: now,
    };
    memory.set(key, row);
  }
  return row;
}

/**
 * Standalone plant: plants the swing line each sector, times clean runs, and reacts to anchors
 * being cut loose. Player passage is read from the live player pose in update().
 */
export const someonesCoursePlant = {
  name: 'plantsPl123',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._swingMemory = new Map();
    this._swingPlanted = false;
    this._swingPlantAt = 0;
    if (this.bus && typeof this.bus.on === 'function') {
      this._swingOff = [
        this.bus.on('entity:destroyed', (p) => this._onSwingAnchorDestroyed(p)),
        this.bus.on('sector:enter', () => this._swingReset()),
        this.bus.on('sector:exit', () => this._swingReset()),
        this.bus.on('save:loaded', () => this._swingReset()),
      ];
    }
  },

  _swingReset() {
    this._swingMemory = new Map();
    this._swingPlanted = false;
    this._swingPlantAt = 0;
  },

  _swingEntityById(id) {
    if (id == null) return null;
    const entities = this.state && this.state.entities;
    if (!entities) return null;
    if (typeof entities.get === 'function') return entities.get(id) || null;
    if (Array.isArray(entities)) return entities.find((e) => e && e.id === id) || null;
    return null;
  },

  _swingPlayer() {
    return this._swingEntityById(this.state && this.state.playerId);
  },

  _swingPlantLine(now) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    const sectorId = (this.state.world && this.state.world.currentSectorId) || 's';
    // Anchor the line on a live lane: the first real station readable at plant time, else the
    // sector anchor. Either way the pattern is deterministic for the sector.
    const origin = swingLineOrigin(this.state.stations);
    const anchors = swingLineAnchors(sectorId, origin);
    if (!anchors.length) return;
    const ang = (hash32(String(sectorId), 'swingLineAngle', 'a') % 6283) / 1000;
    const row = swingLineRowFor(this._swingMemory, 'line', now);
    if (!row) return;
    row.lastAt = now;
    row.originX = origin.x;
    row.originZ = origin.z;

    const bx = anchors[anchors.length - 1].x + Math.cos(ang + Math.PI / 2) * SWING_LINE_TUNING.builderOffsetWu;
    const bz = anchors[anchors.length - 1].z + Math.sin(ang + Math.PI / 2) * SWING_LINE_TUNING.builderOffsetWu;

    for (const anchor of anchors) {
      const ent = spawnEntity({
        type: 'beacon',
        pos: { x: anchor.x, z: anchor.z },
        vel: { x: 0, z: 0 },
        radius: 5,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        data: {
          parentType: 'story_prop',
          scanLabel: 'Planted anchor',
          storyPropKind: 'swing_anchor',
          swingLine: true,
          tetherable: true,
          // The latch gate's real field (src/systems/tetherGameplay.js reads data.masslineTetherable).
          masslineTetherable: true,
        },
      });
      if (ent && ent.id != null) row.anchorIds.push(ent.id);
    }

    const builder = spawnEntity({
      type: 'beacon',
      pos: { x: bx, z: bz },
      vel: { x: 0, z: 0 },
      radius: 5,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      data: {
        parentType: 'story_prop',
        scanLabel: 'The builder',
        storyPropKind: 'swing_builder',
        swingBuilder: true,
        tetherable: true,
        masslineTetherable: true,
      },
    });
    row.builderId = builder && builder.id != null ? builder.id : null;
    this._swingPlanted = true;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_SWING_LINE_PLANTED_EVENT, {
        anchorIds: row.anchorIds,
        builderId: row.builderId,
        t: now,
      });
    }
  },

  _onSwingAnchorDestroyed(payload) {
    if (!payload || !this.state) return;
    const now = finite(this.state.simTime, 0);
    const row = this._swingMemory.get('line');
    if (!row || !row.anchorIds.length) return;
    if (!row.anchorIds.includes(payload.id)) return;
    row.lastAt = now;
    if (row.cutIds.includes(payload.id)) return;
    row.cutIds.push(payload.id);

    // Cut one anchor loose: the builder collects the pieces — and your description.
    const builder = this._swingEntityById(row.builderId);
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (builder && builder.pos && typeof spawnEntity === 'function') {
      for (let i = 0; i < SWING_LINE_TUNING.debrisPerAnchor; i += 1) {
        spawnEntity({
          type: 'cargo',
          pos: { x: builder.pos.x + (i - 0.5) * 8, z: builder.pos.z },
          vel: {
            x: Math.cos(i * 2.1) * SWING_LINE_TUNING.debrisSpeedWu,
            z: Math.sin(i * 2.1) * SWING_LINE_TUNING.debrisSpeedWu,
          },
          radius: SWING_LINE_TUNING.debrisRadius,
          mass: SWING_LINE_TUNING.debrisMass,
          physicsBody: { mass: SWING_LINE_TUNING.debrisMass },
          hull: 10,
          hullMax: 10,
          data: {
            swingDebris: true,
            anchorId: payload.id,
            scanLabel: 'Anchor pieces',
          },
        });
      }
    }
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_SWING_LINE_CUT_EVENT, { anchorId: payload.id, builderId: row.builderId, t: now });
      this.bus.emit('comms:popup', {
        id: 'plants:pl123:cut',
        sender: 'THE BUILDER',
        category: 'traffic',
        text: SWING_LINE_CUT_LINE,
        ttl: 6,
      });
    }
  },

  update() {
    if (!this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    const now = finite(this.state.simTime, 0);

    if (!this._swingPlanted) {
      if (!this._swingPlantAt) this._swingPlantAt = now + 10;
      if (now >= this._swingPlantAt) this._swingPlantLine(now);
      return;
    }

    const row = this._swingMemory.get('line');
    if (!row || !row.anchorIds.length) return;
    row.lastAt = now;

    const player = this._swingPlayer();
    if (!player || player.alive === false || !player.pos) return;

    // The builder's timer runs while a run is underway.
    if (row.runStartAt >= 0 && now - row.runStartAt > SWING_LINE_TUNING.runWindowS) {
      row.runStartAt = -Infinity;
      row.nextAnchor = 0;
    }

    // Run it clean: each anchor passed in order, inside the timer.
    if (row.noddedAt < 0 && row.nextAnchor < row.anchorIds.length) {
      const expected = this._swingEntityById(row.anchorIds[row.nextAnchor]);
      if (expected && expected.pos && passageAt(expected.pos, player.pos)) {
        if (row.runStartAt < 0) row.runStartAt = now;
        row.nextAnchor += 1;
        row.lastAt = now;
        if (row.nextAnchor >= row.anchorIds.length && now - row.runStartAt <= SWING_LINE_TUNING.runWindowS) {
          row.noddedAt = now;
          row.runStartAt = -Infinity;
          row.nextAnchor = 0;
          if (this.bus && typeof this.bus.emit === 'function') {
            this.bus.emit(PLANTS_SWING_LINE_NOD_EVENT, { builderId: row.builderId, t: now });
            this.bus.emit('audio:cue', {
              id: 'confirm',
              position: this._swingEntityById(row.builderId)?.pos
                ? { x: this._swingEntityById(row.builderId).pos.x, z: this._swingEntityById(row.builderId).pos.z }
                : null,
              gain: 0.6,
              rate: 0.9,
            });
            if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
              this.helpers.voice.say({
                channel: 'comms',
                id: 'plants:pl123:nod',
                text: SWING_LINE_NOD_LINE,
                kind: 'traffic',
                ttl: 4,
              });
            }
          }
        }
      }
    }
  },

  destroy() {
    if (this._swingOff) {
      for (const off of this._swingOff) {
        if (typeof off === 'function') off();
      }
      this._swingOff = null;
    }
  },
};
