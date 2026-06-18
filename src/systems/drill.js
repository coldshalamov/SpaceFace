// Drill lens system (V2 §7 / cut-list #27). The ant-farm mining verb. When active, this owns a 2D
// vein cross-section the player drills into with L/R + up/down controls. Yields real ore into cargo
// via the canonical addCargo writer. Hazards (gas pockets) have tells so they can be learned and
// avoided — the foundation of the hazard-taxonomy that automation will later program around.
//
// SCOPE (per IMPROVEMENT_IDEAS #27 refinement): a self-contained 2D overlay screen, NOT the full
// continuous-zoom 3D descent. That's a later milestone. This delivers the *verb*: mining is a real
// tactile action, not a button. Automation (#28) builds on it.
//
// Field model: a 2D grid [cols x rows] of tiles. Each tile is {type, hp, maxHp, ore, hazard}.
//   type: 'empty' (already drilled), 'dirt' (drillable, low hp), 'rock' (harder), 'vein' (ore!),
//         'gas' (hazard — explodes if drilled, with a tell: a faint discoloration revealed when an
//         adjacent tile is cleared, so an alert player sees it before drilling into it).
//   The player avatar sits on a tile; L/R moves it, up/down attempts to drill the tile in that
//   direction (clearing it if the drill dps overcomes its hp over time).
//
// Single-writer: drill owns only state.drill (the field + avatar + accumulator). Ore grants route
// through cargo.addCargo. Determinism: the field is seeded by the asteroid's id (V2 §32 seed model)
// so the same asteroid drills the same way every visit.
import { addCargo } from './cargo.js';

const COLS = 28;        // width of the cross-section (tiles)
const ROWS = 18;        // depth (surface at row 0, deeper = rarer/harder)
const TILE = 22;        // px per tile (render hint; the screen may scale)
const DRILL_DPS = 8;    // ore-units/sec the player's drill clears (tier 0 baseline)
const GAS_DAMAGE = 18;  // hull % lost if you drill into a gas pocket (the lesson)
const GAS_TELL_RADIUS = 2; // tiles — gas is hinted (discolored) within this radius of a cleared tile

// Tile archetypes by depth band. Deeper = harder rock + rarer ore + more gas. Surface is soft dirt.
function tileFor(col, row, rng) {
  const depth = row / ROWS; // 0 at surface, 1 at bottom
  // Gas pockets: clustered, rarer near the surface, more common (and more dangerous) deeper.
  // We place gas with a per-tile probability that scales with depth.
  if (rng() < 0.04 + depth * 0.10) return { type: 'gas', hp: 1, maxHp: 1, ore: null, hazard: true };

  // Veins: ore-bearing tiles. Probability + richness scale with depth (the Motherload risk/reward).
  if (rng() < 0.12 + depth * 0.18) {
    const oreRoll = rng();
    let ore;
    if (depth < 0.33) ore = 'cmdty_ore_iron';              // surface: common iron
    else if (depth < 0.66) ore = oreRoll < 0.6 ? 'cmdty_ore_copper' : 'cmdty_ore_silicon';
    else ore = oreRoll < 0.4 ? 'cmdty_ore_titanium' : (oreRoll < 0.75 ? 'cmdty_ore_platinoid' : 'cmdty_ore_ice');
    const yieldU = 1 + Math.floor(rng() * (2 + depth * 4)); // deeper veins are richer
    const hp = 6 + Math.floor(depth * 10);                 // deeper veins are harder
    return { type: 'vein', hp, maxHp: hp, ore, yieldU, hazard: false };
  }

  // Rock vs dirt: dirt near surface (fast), rock deeper (slow).
  if (depth > 0.3 && rng() < 0.3 + depth * 0.4) {
    const hp = 10 + Math.floor(depth * 18);
    return { type: 'rock', hp, maxHp: hp, ore: null, hazard: false };
  }
  const hp = 3 + Math.floor(depth * 6);
  return { type: 'dirt', hp, maxHp: hp, ore: null, hazard: false };
}

export const drill = {
  name: 'drill',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.ctx = ctx;
    ctx.drill = this;
    // live drill state; null when inactive (no asteroid being drilled)
    this.state.drill = null;
  },

  // Begin a drilling session on an asteroid. Seeds the field from the asteroid's stable id so the
  // same rock yields the same layout every visit (V2 §32). Emits drill:start so the screen opens.
  begin(asteroidId) {
    if (!asteroidId) return false;
    const rng = this._seededRng(asteroidId);
    const field = [];
    for (let c = 0; c < COLS; c++) {
      field[c] = [];
      for (let r = 0; r < ROWS; r++) field[c][r] = tileFor(c, r, rng);
    }
    // Carve an entry shaft at the surface center so the avatar starts in a cleared tile.
    const startCol = Math.floor(COLS / 2);
    field[startCol][0] = { type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false };
    this.state.drill = {
      asteroidId,
      field,
      avatar: { col: startCol, row: 0 },
      drillDir: null,         // null | 'up' | 'down' (the direction we're currently drilling)
      accumulator: 0,         // fractional ore carry + drill damage carry
      gasHits: 0,             // how many gas pockets the player has triggered (a "lessons learned" tally)
      yieldLog: {},           // commodityId -> total units extracted this session (for the HUD + log)
      active: true,
    };
    this.bus.emit('drill:start', { asteroidId });
    return true;
  },

  // End the session (player exits the screen). Keeps the yieldLog so a summary can show on exit.
  end() {
    const d = this.state.drill;
    if (!d) return;
    d.active = false;
    const yieldLog = d.yieldLog;
    this.state.drill = null;
    this.bus.emit('drill:end', { asteroidId: d.asteroidId, yieldLog });
  },

  // Move the avatar left/right by dc columns (clamped; can't move into uncleared tiles horizontally
  // — you must drill down/around to open a path. This is the Motherload constraint that makes
  // routing matter).
  move(dc) {
    const d = this.state.drill;
    if (!d || !d.active) return;
    const nc = d.avatar.col + dc;
    if (nc < 0 || nc >= COLS) return;
    const target = d.field[nc][d.avatar.row];
    if (target.type !== 'empty') return; // solid wall — must drill, not push through
    d.avatar.col = nc;
    d.drillDir = null;
  },

  // Drill in a vertical direction (-1 up, +1 down). If the adjacent tile is solid, accumulate dps
  // against it; when its hp hits 0, clear it (move the avatar there, grant ore if it was a vein,
  // trigger gas if it was a gas pocket). `dt` is seconds.
  drillVertical(dir, dt) {
    const d = this.state.drill;
    if (!d || !d.active) return;
    if (dir !== -1 && dir !== 1) return;
    const nr = d.avatar.row + dir;
    if (nr < 0 || nr >= ROWS) return;
    const target = d.field[d.avatar.col][nr];
    if (target.type === 'empty') {
      // already clear — just move into it
      d.avatar.row = nr;
      d.drillDir = null;
      return;
    }
    d.drillDir = dir > 0 ? 'down' : 'up';
    target.hp -= DRILL_DPS * dt;
    if (target.hp <= 0) {
      // cleared!
      const wasVein = target.type === 'vein';
      const wasGas = target.type === 'gas';
      const ore = target.ore;
      const yieldU = target.yieldU || 0;
      // mark empty
      d.field[d.avatar.col][nr] = { type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false };
      d.avatar.row = nr;
      d.drillDir = null;
      if (wasVein && ore) {
        // grant real ore into cargo via the canonical writer
        const added = addCargo(this.state, ore, yieldU);
        if (added > 0) {
          d.accumulator += 0; // carry already cleared
          d.yieldLog[ore] = (d.yieldLog[ore] || 0) + added;
          this.bus.emit('drill:yield', { commodityId: ore, qty: added, pos: { col: d.avatar.col, row: nr } });
        }
      }
      if (wasGas) {
        // the lesson: drilling a gas pocket hurts. Damage the player ship (read live) + record the
        // hit so the player learns the tell. This is the "pain that teaches the automation shape."
        d.gasHits++;
        const player = this.state.entities.get(this.state.playerId);
        if (player && player.hullMax > 0) {
          const dmg = Math.ceil(player.hullMax * (GAS_DAMAGE / 100));
          player.hull = Math.max(1, player.hull - dmg);
          this.bus.emit('drill:gasHit', { dmg, pos: { col: d.avatar.col, row: nr } });
          this.bus.emit('camera:shake', { amount: 0.5 });
        }
      }
    }
  },

  // Per-tick update: the screen calls this with the held drill direction while open. Drilling only
  // progresses while the player holds a direction; otherwise the avatar is idle.
  update(dt, state) {
    // The screen forwards input via drillVertical directly (it knows the held direction); this
    // update() is a no-op kept for registry contract symmetry. Hazard decay / animation lives in the
    // screen's own rAF, not the sim loop (the screen pauses the sim — V2 §34 view-gated sim).
  },

  // Is a tile's hazard "revealed" (its tell visible) given the current cleared tiles? Gas tiles
  // show a faint discoloration when within GAS_TELL_RADIUS of a cleared tile, so an alert player
  // sees the danger before drilling into it. This is the legibility law (V2 §3) in miniature.
  isHazardRevealed(col, row) {
    const d = this.state.drill;
    if (!d) return false;
    for (let dc = -GAS_TELL_RADIUS; dc <= GAS_TELL_RADIUS; dc++) {
      for (let dr = -GAS_TELL_RADIUS; dr <= GAS_TELL_RADIUS; dr++) {
        const c = col + dc, r = row + dr;
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
        if (d.field[c][r].type === 'empty') return true;
      }
    }
    return false;
  },

  // Deterministic mulberry32 RNG seeded by the asteroid id — same id, same field, every visit.
  _seededRng(seed) {
    let a = (seed | 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
};

export const DRILL_CONST = { COLS, ROWS, TILE };
