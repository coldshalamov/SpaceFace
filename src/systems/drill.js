// Drill lens system (V2 §7 / cut-list #27). The ant-farm mining verb. When active, this owns a 2D
// vein cross-section the player drills into with WASD / Arrow keys. Yields real ore into cargo
// via the canonical addCargo writer. Hazards (gas pockets) have tells so they can be learned and
// avoided — the foundation of the hazard-taxonomy that automation will later program around.
//
// Single-writer: drill owns only state.drill (the field + avatar + accumulator). Ore grants route
// through cargo.addCargo. Determinism: the field is seeded by the asteroid's id (V2 §32 seed model)
// so the same asteroid drills the same way every visit.
import { addCargo } from './cargo.js';
import { ORES } from '../data/mining.js';

const ORE_TIER_BY_ID = new Map(ORES.map((o) => [o.id, o.tier]));

// Map authored ore tier (0-4) to drill-head requirement (1-4).
// Must stay stable per ore id — depth must never change whether a vein is mineable.
export function drillTierReqForOre(oreId) {
  const oreTier = ORE_TIER_BY_ID.get(oreId);
  if (oreTier == null || oreTier <= 0) return 1;
  if (oreTier === 1) return 2;
  return oreTier;
}

function updateCableTrail(d, col, row) {
  if (!d.cableTrail) d.cableTrail = [];
  const idx = d.cableTrail.findIndex(p => p.col === col && p.row === row);
  if (idx !== -1) {
    // Backtracked! Crop the cable trail to this taut point to avoid loops
    d.cableTrail = d.cableTrail.slice(0, idx + 1);
  } else {
    // Extended the cable
    d.cableTrail.push({ col, row });
  }
}

const COLS = 28;        // width of the cross-section (tiles)
const ROWS = 45;        // depth (surface at row 0, deeper = rarer/harder)
const TILE = 40;        // px per tile (render hint; the screen may scale)
const DRILL_DPS = 8;    // ore-units/sec the player's drill clears (tier 0 baseline)
const GAS_DAMAGE = 18;  // hull % lost if you drill into a gas pocket (the lesson)
const GAS_TELL_RADIUS = 2; // tiles — gas is hinted (discolored) within this radius of a cleared tile

// Tile archetypes by depth band. Deeper = harder rock + rarer ore + more gas. Surface is soft dirt.
function tileFor(col, row, rng) {
  const depth = row / ROWS; // 0 at surface, 1 at bottom

  // Surface rows (0 to 2) are always soft dirt, no gas, no rare veins
  if (row <= 2) {
    return { type: 'dirt', hp: 3, maxHp: 3, ore: null, hazard: false, tierReq: 1 };
  }

  // Gas pocket probability scales with depth
  // Disguised as dirt, warns player if adjacent
  if (rng() < 0.03 + depth * 0.08) {
    return { type: 'gas', hp: 1, maxHp: 1, ore: null, hazard: true, tierReq: 1 };
  }

  // Vein chance
  if (rng() < 0.10 + depth * 0.15) {
    let ore = 'cmdty_silicate';

    // Motherload mineral bands by depth (rarity), but tier gate follows ore id only.
    if (depth < 0.2) {
      const roll = rng();
      if (roll < 0.4) ore = 'cmdty_silicate';
      else if (roll < 0.8) ore = 'cmdty_ore_iron';
      else ore = 'cmdty_ore_bronzium';
    } else if (depth < 0.45) {
      const roll = rng();
      if (roll < 0.3) ore = 'cmdty_ore_bronzium';
      else if (roll < 0.6) ore = 'cmdty_ore_copper';
      else ore = 'cmdty_ore_silverium';
    } else if (depth < 0.7) {
      const roll = rng();
      if (roll < 0.3) ore = 'cmdty_ore_silverium';
      else if (roll < 0.6) ore = 'cmdty_ore_goldium';
      else if (roll < 0.8) ore = 'cmdty_ore_platinium';
      else ore = 'cmdty_ore_einsteinium';
    } else {
      const roll = rng();
      if (roll < 0.3) ore = 'cmdty_ore_einsteinium';
      else if (roll < 0.6) ore = 'cmdty_gem_emerald';
      else if (roll < 0.8) ore = 'cmdty_gem_ruby';
      else if (roll < 0.95) ore = 'cmdty_gem_diamond';
      else ore = 'cmdty_exotic_amazonite';
    }

    const tierReq = drillTierReqForOre(ore);
    const yieldU = 1 + Math.floor(rng() * (2 + depth * 5));
    const hp = 5 + Math.floor(depth * 15);
    return { type: 'vein', hp, maxHp: hp, ore, yieldU, hazard: false, tierReq };
  }

  // Rock vs Dirt
  // Rock is grey/solid stone, gets more common and harder deeper
  if (depth > 0.25 && rng() < 0.2 + depth * 0.5) {
    const hp = 8 + Math.floor(depth * 25);
    // Harder rocks require better drills to clear in reasonable time, but still drillable at Tier 1
    return { type: 'rock', hp, maxHp: hp, ore: null, hazard: false, tierReq: 1 };
  }

  // Dirt
  const hp = 3 + Math.floor(depth * 10);
  return { type: 'dirt', hp, maxHp: hp, ore: null, hazard: false, tierReq: 1 };
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
    field[startCol][0] = { type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1 };
    this.state.drill = {
      asteroidId,
      field,
      avatar: { col: startCol, row: 0, faceDir: 'down', isDrilling: false, drillTarget: null },
      drillDir: null,         // kept for compatibility
      moveCooldown: 0,
      drillTemp: 0,           // drill head temperature (0 to 100)
      overheated: false,      // is drill overheated?
      cableTrail: [{ col: startCol, row: 0 }], // active massline cable path trail
      accumulator: 0,         // fractional ore carry + drill damage carry
      gasHits: 0,             // how many gas pockets the player has triggered
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

  newGame() {
    this.state.drill = null;
  },

  // Legacy API wrapper for horizontal moves (if needed by external systems)
  move(dc) {
    const d = this.state.drill;
    if (!d || !d.active) return;
    const nc = d.avatar.col + dc;
    if (nc < 0 || nc >= COLS) return;
    const target = d.field[nc][d.avatar.row];
    if (target.type !== 'empty') return;
    d.avatar.col = nc;
  },

  // Legacy API wrapper for vertical moves
  drillVertical(dir, dt) {
    const d = this.state.drill;
    if (!d || !d.active) return;
    if (dir !== -1 && dir !== 1) return;
    if (!d.avatar || !Number.isFinite(d.avatar.col) || !Number.isFinite(d.avatar.row)) return;
    if (!Number.isFinite(d.moveCooldown)) d.moveCooldown = 0;
    if (!Number.isFinite(d.drillTemp)) d.drillTemp = 0;
    if (typeof d.overheated !== 'boolean') d.overheated = false;
    if (typeof d.avatar.isDrilling !== 'boolean') d.avatar.isDrilling = false;
    if (!d.avatar.drillTarget) d.avatar.drillTarget = null;
    if (!d.avatar.faceDir) d.avatar.faceDir = dir === 1 ? 'down' : 'up';
    if (!Array.isArray(d.cableTrail)) d.cableTrail = [{ col: d.avatar.col, row: d.avatar.row }];
    this.tickInput({ left: false, right: false, up: dir === -1, down: dir === 1 }, dt);
  },

  getDrillTier() {
    const player = this.state.entities.get(this.state.playerId);
    const beam = player ? (player.data?.miningBeam || this.state.player.miningBeam) : null;
    if (!beam) return 1;
    if (beam.tierId === 'beam_industrial') return 4;
    if (beam.tierId === 'beam_mk3') return 3;
    if (beam.tierId === 'beam_mk2') return 2;
    return 1; // beam_mk1
  },

  getDrillDPS() {
    const player = this.state.entities.get(this.state.playerId);
    const beam = player ? (player.data?.miningBeam || this.state.player.miningBeam) : null;
    // Scale minigame dps with player's beam dps
    return beam ? (beam.dps || 18) : 18;
  },

  // Unified tick input processor (WASD/Arrow control).
  // Processes motion, direction checks, and drilling action.
  tickInput(held, dt) {
    const d = this.state.drill;
    if (!d || !d.active) return;

    if (d.moveCooldown > 0) {
      d.moveCooldown -= dt;
    }

    // --- 1. Drill heat tracking ---
    if (d.avatar.isDrilling && d.avatar.drillTarget) {
      // If currently drilling, heat up!
      d.drillTemp = Math.min(100, d.drillTemp + 26 * dt); // heats up in ~3.8 seconds
      if (d.drillTemp >= 100 && !d.overheated) {
        d.overheated = true;
        d.avatar.isDrilling = false;
        d.avatar.drillTarget = null;
        this.bus.emit('drill:warn', { text: 'DRILL OVERHEATED! Cool down active.' });
      }
    } else {
      // If idle/cooling, reduce heat!
      d.drillTemp = Math.max(0, d.drillTemp - 36 * dt); // cools down in ~2.8 seconds
      if (d.overheated && d.drillTemp <= 10) {
        d.overheated = false;
        this.bus.emit('drill:warn', { text: 'Drill system cooled. Ready to dig.' });
      }
    }

    let dx = 0;
    let dy = 0;
    if (held.left) { dx = -1; d.avatar.faceDir = 'left'; }
    else if (held.right) { dx = 1; d.avatar.faceDir = 'right'; }
    else if (held.down) { dy = 1; d.avatar.faceDir = 'down'; }
    else if (held.up) { dy = -1; d.avatar.faceDir = 'up'; }

    if (dx === 0 && dy === 0) {
      d.avatar.isDrilling = false;
      d.avatar.drillTarget = null;
      d.avatar.drillBlocked = false;
      return;
    }

    const nc = d.avatar.col + dx;
    const nr = d.avatar.row + dy;

    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) {
      d.avatar.isDrilling = false;
      d.avatar.drillTarget = null;
      return;
    }

    // --- 2. Calculate cargo-load movement speed (inertia) ---
    const cargo = this.state.player.cargo;
    const loadFactor = cargo && cargo.capVolume > 0 ? (cargo.usedVolume / cargo.capVolume) : 0;
    // Base move cooldown is 0.12s. Moves up to 0.22s when completely full.
    const cooldownVal = 0.12 + Math.max(0, Math.min(0.10, loadFactor * 0.10));

    const target = d.field[nc][nr];
    if (target.type === 'empty') {
      d.avatar.isDrilling = false;
      d.avatar.drillTarget = null;
      if (d.moveCooldown <= 0) {
        d.avatar.col = nc;
        d.avatar.row = nr;
        d.moveCooldown = cooldownVal; // apply cargo-weighted cooldown
        updateCableTrail(d, nc, nr);
      }
    } else {
      // Solid tile! Cannot drill UP or if overheated
      if (dy === -1) {
        d.avatar.isDrilling = false;
        d.avatar.drillTarget = null;
        return;
      }

      if (d.overheated) {
        d.avatar.isDrilling = false;
        d.avatar.drillTarget = null;
        if (d.moveCooldown <= 0) {
          this.bus.emit('drill:warn', { text: 'Drill cooling down... Wait for system ready.' });
          d.moveCooldown = 1.0;
        }
        return;
      }

      // Check drill tier requirement
      const tier = this.getDrillTier();
      const req = target.tierReq || 1;
      if (tier < req) {
        d.avatar.isDrilling = false;
        d.avatar.drillTarget = { col: nc, row: nr };
        d.avatar.drillBlocked = true;
        if (d.moveCooldown <= 0) {
          const names = { 2: 'Drill MK2', 3: 'Drill MK3', 4: 'Industrial Drill' };
          this.bus.emit('drill:warn', { text: `Upgrade required! Need ${names[req] || 'a better drill'}.` });
          d.moveCooldown = 1.2; // throttle warnings
        }
        return;
      }

      // Active drilling
      d.avatar.isDrilling = true;
      d.avatar.drillTarget = { col: nc, row: nr };

      const dps = this.getDrillDPS();
      target.hp -= dps * dt;

      // Emit spark particles request
      this.bus.emit('drill:spark', { col: nc, row: nr, type: target.type, ore: target.ore });

      if (target.hp <= 0) {
        // Cleared!
        const wasVein = target.type === 'vein';
        const wasGas = target.type === 'gas';
        const ore = target.ore;
        const yieldU = target.yieldU || 0;

        d.field[nc][nr] = { type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false };
        d.avatar.col = nc;
        d.avatar.row = nr;
        d.avatar.isDrilling = false;
        d.avatar.drillTarget = null;
        d.moveCooldown = cooldownVal;
        updateCableTrail(d, nc, nr);

        if (wasVein && ore) {
          const added = addCargo(this.state, ore, yieldU);
          if (added > 0) {
            d.yieldLog[ore] = (d.yieldLog[ore] || 0) + added;
            this.bus.emit('drill:yield', { commodityId: ore, qty: added, pos: { col: nc, row: nr } });
          } else {
            this.bus.emit('drill:warn', { text: 'Cargo holds are full!' });
          }
        }

        if (wasGas) {
          d.gasHits++;
          const player = this.state.entities.get(this.state.playerId);
          if (player && player.hullMax > 0) {
            const dmg = Math.ceil(player.hullMax * (GAS_DAMAGE / 100));
            player.hull = Math.max(1, player.hull - dmg);
            this.bus.emit('drill:gasHit', { dmg, pos: { col: nc, row: nr } });
            this.bus.emit('camera:shake', { amount: 0.5 });
          }
        }
      }
    }
  },

  update(dt, state) {
    // Kept for registry interface compatibility
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
