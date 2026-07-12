// Drill lens system (V2 §7 / cut-list #27). The deep-core extraction verb. When active, this owns a 2D
// vein cross-section the player drills into with WASD / Arrow keys. Yields real ore into cargo
// via the canonical addCargo writer. Hazards (gas pockets) have tells so they can be learned and
// avoided — the foundation of the hazard-taxonomy that automation will later program around.
//
// Single-writer: drill owns only state.drill (the field + avatar + accumulator). Ore grants route
// through cargo.addCargo. Determinism: the field is seeded by the asteroid's id (V2 §32 seed model)
// so the same asteroid drills the same way every visit.
import { addCargo } from './cargo.js';
import { ORES } from '../data/mining.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';

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
export const DRILL_ENERGY_MAX = 100;
export const DRILL_ENERGY_RECOVERY = 28;
export const DRILL_ENERGY_RESUME = 24;
export const DRILL_HEAT_COOLING = 36;
export const SCAN_RADIUS = 5;
export const SCAN_COOLDOWN_S = 6;
export const SCAN_ACTIVE_S = 0.9;

// Empty-tile move cadence. Base 0.06s (~2× the prior 0.12s) so held travel samples twice as often;
// cargo load still slows movement proportionally (up to +0.05s when holds are full).
export const MOVE_COOLDOWN_BASE = 0.06;
export const MOVE_COOLDOWN_CARGO = 0.05;

/** Cargo-weighted move interval (seconds). loadFactor is usedVolume/capVolume in [0,1]. */
export function moveCooldownForLoad(loadFactor) {
  const lf = Math.max(0, Math.min(1, Number(loadFactor) || 0));
  return MOVE_COOLDOWN_BASE + Math.max(0, Math.min(MOVE_COOLDOWN_CARGO, lf * MOVE_COOLDOWN_CARGO));
}

/** Linear progress of the current visual step (0..1). 1 when idle / snap. */
export function avatarMoveProgress(avatar) {
  if (!avatar) return 1;
  const dur = avatar.moveDuration;
  if (!Number.isFinite(dur) || dur <= 0) return 1;
  const elapsed = Number.isFinite(avatar.moveElapsed) ? avatar.moveElapsed : 0;
  return Math.min(1, Math.max(0, elapsed / dur));
}

/** Pixel draw position for the rover (tile-space, not yet camera-scrolled). Time-interpolated. */
export function avatarDrawPos(avatar, tileSize = TILE) {
  const col = avatar?.col ?? 0;
  const row = avatar?.row ?? 0;
  const t = avatarMoveProgress(avatar);
  const fromCol = Number.isFinite(avatar?.fromCol) ? avatar.fromCol : col;
  const fromRow = Number.isFinite(avatar?.fromRow) ? avatar.fromRow : row;
  return {
    x: (fromCol + (col - fromCol) * t) * tileSize,
    y: (fromRow + (row - fromRow) * t) * tileSize,
    t,
  };
}

/** Explicit material resistance. Higher values mine slower and consume more rig power. */
export function materialHardness(tile) {
  if (!tile || tile.type === 'empty') return 0;
  if (Number.isFinite(tile.hardness)) return Math.max(0.35, tile.hardness);
  if (tile.type === 'gas') return 0.5;
  if (tile.type === 'dirt') return 0.75;
  if (tile.type === 'vein') return 1.15;
  return 1.45;
}

/** Read-only extraction receipt used by the HUD and deterministic checks. */
export function extractionTelemetry(tile, baseDps = DRILL_DPS) {
  const hardness = materialHardness(tile);
  if (!tile || tile.type === 'empty' || hardness <= 0) {
    return { hardness: 0, progress: 1, effectiveDps: 0, remainingS: 0, energyPerS: 0, heatPerS: 0 };
  }
  const effectiveDps = Math.max(0, Number(baseDps) || 0) / hardness;
  const maxHp = Math.max(0.001, Number(tile.maxHp) || Number(tile.hp) || 1);
  const hp = Math.max(0, Number(tile.hp) || 0);
  return {
    hardness,
    progress: Math.max(0, Math.min(1, 1 - hp / maxHp)),
    effectiveDps,
    remainingS: effectiveDps > 0 ? hp / effectiveDps : Infinity,
    energyPerS: 12 + hardness * 12,
    heatPerS: 17 + hardness * 7,
  };
}

function commitAvatarMove(d, nc, nr, cooldownVal) {
  const prevCol = d.avatar.col;
  const prevRow = d.avatar.row;
  d.avatar.fromCol = prevCol;
  d.avatar.fromRow = prevRow;
  d.avatar.col = nc;
  d.avatar.row = nr;
  d.avatar.moveDuration = cooldownVal;
  d.avatar.moveElapsed = 0;
  d.moveCooldown = cooldownVal;
  updateCableTrail(d, nc, nr);
}

// Tile archetypes by depth band. Deeper = harder rock + rarer ore + more gas. Surface is soft dirt.
function tileFor(col, row, rng) {
  const depth = row / ROWS; // 0 at surface, 1 at bottom

  // Surface rows (0 to 2) are always soft dirt, no gas, no rare veins
  if (row <= 2) {
    return { type: 'dirt', hp: 3, maxHp: 3, ore: null, hazard: false, tierReq: 1, hardness: 0.65, risk: 'low' };
  }

  // Gas pocket probability scales with depth
  // Disguised as dirt, warns player if adjacent
  if (rng() < 0.03 + depth * 0.08) {
    return { type: 'gas', hp: 1, maxHp: 1, ore: null, hazard: true, tierReq: 1, hardness: 0.5, risk: 'critical' };
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
    return {
      type: 'vein', hp, maxHp: hp, ore, yieldU, hazard: false, tierReq,
      hardness: Number((0.9 + depth * 0.65 + Math.max(0, tierReq - 1) * 0.12).toFixed(2)),
      risk: depth >= 0.7 ? 'high' : (depth >= 0.35 ? 'elevated' : 'low'),
    };
  }

  // Rock vs Dirt
  // Rock is grey/solid stone, gets more common and harder deeper
  if (depth > 0.25 && rng() < 0.2 + depth * 0.5) {
    const hp = 8 + Math.floor(depth * 25);
    // Harder rocks require better drills to clear in reasonable time, but still drillable at Tier 1
    return {
      type: 'rock', hp, maxHp: hp, ore: null, hazard: false, tierReq: 1,
      hardness: Number((1.15 + depth * 0.85).toFixed(2)),
      risk: depth >= 0.7 ? 'elevated' : 'low',
    };
  }

  // Dirt
  const hp = 3 + Math.floor(depth * 10);
  return {
    type: 'dirt', hp, maxHp: hp, ore: null, hazard: false, tierReq: 1,
    hardness: Number((0.65 + depth * 0.35).toFixed(2)), risk: 'low',
  };
}

function recoverRig(d, dt) {
  d.drillTemp = Math.max(0, d.drillTemp - DRILL_HEAT_COOLING * dt);
  d.drillEnergy = Math.min(DRILL_ENERGY_MAX, d.drillEnergy + DRILL_ENERGY_RECOVERY * dt);
  if (d.overheated && d.drillTemp <= 10) d.overheated = false;
  if (d.energyDepleted && d.drillEnergy >= DRILL_ENERGY_RESUME) d.energyDepleted = false;
}

function sessionResult(d, reason) {
  const yieldLog = { ...d.yieldLog };
  return Object.freeze({
    asteroidId: d.asteroidId,
    reason,
    aborted: reason === 'aborted',
    yieldLog,
    yieldUnits: Object.values(yieldLog).reduce((sum, qty) => sum + (Number(qty) || 0), 0),
    gasHits: Number(d.gasHits) || 0,
    tilesCleared: Number(d.tilesCleared) || 0,
    maxDepth: Number(d.maxDepth) || 0,
    elapsedS: Number((Number(d.sessionElapsed) || 0).toFixed(3)),
  });
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
    field[startCol][0] = { type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 };
    this.state.drill = {
      asteroidId,
      field,
      avatar: {
        col: startCol,
        row: 0,
        fromCol: startCol,
        fromRow: 0,
        moveDuration: 0,
        moveElapsed: 0,
        faceDir: 'down',
        isDrilling: false,
        drillTarget: null,
      },
      drillDir: null,         // kept for compatibility
      moveCooldown: 0,
      drillTemp: 0,           // drill head temperature (0 to 100)
      overheated: false,      // is drill overheated?
      drillEnergy: DRILL_ENERGY_MAX,
      energyDepleted: false,
      cableTrail: [{ col: startCol, row: 0 }], // active massline cable path trail
      accumulator: 0,         // fractional ore carry + drill damage carry
      gasHits: 0,             // how many gas pockets the player has triggered
      yieldLog: {},           // commodityId -> total units extracted this session (for the HUD + log)
      tilesCleared: 0,
      maxDepth: 0,
      sessionElapsed: 0,
      scan: {
        cooldown: 0,
        active: 0,
        serial: 0,
        contacts: 0,
      },
      active: true,
    };
    this.bus.emit('drill:start', { asteroidId });
    return true;
  },

  // End the session (player exits the screen). Keeps the yieldLog so a summary can show on exit.
  end({ reason = 'retracted' } = {}) {
    const d = this.state.drill;
    if (!d) return null;
    d.active = false;
    const result = sessionResult(d, reason);
    this.state.drill = null;
    this.bus.emit('drill:end', result);
    return result;
  },

  abort() {
    return this.end({ reason: 'aborted' });
  },

  retry() {
    const d = this.state.drill;
    if (!d) return false;
    const asteroidId = d.asteroidId;
    const previous = this.end({ reason: 'retry' });
    const started = this.begin(asteroidId);
    if (started) this.bus.emit('drill:retry', { asteroidId, previous });
    return started;
  },

  newGame() {
    this.state.drill = null;
  },

  // Drill sessions are intentionally transient. Cargo already lives under the canonical cargo
  // writer; resuming a half-cleared procedural bore after load would duplicate authority.
  serialize() {
    return null;
  },

  deserialize() {
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

  // Survey the nearby strata. A pulse permanently marks nearby tiles for this drill session, so
  // route planning has a real verb without adding another screen or any random outcome.
  pulseScan() {
    const d = this.state.drill;
    if (!d || !d.active) return false;
    if (!d.scan) d.scan = { cooldown: 0, active: 0, serial: 0, contacts: 0 };
    if (d.scan.cooldown > 0) return false;

    const ac = d.avatar.col;
    const ar = d.avatar.row;
    let contacts = 0;
    for (let dc = -SCAN_RADIUS; dc <= SCAN_RADIUS; dc++) {
      for (let dr = -SCAN_RADIUS; dr <= SCAN_RADIUS; dr++) {
        if ((dc * dc) + (dr * dr) > SCAN_RADIUS * SCAN_RADIUS) continue;
        const col = ac + dc;
        const row = ar + dr;
        if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue;
        const tile = d.field[col][row];
        if (!tile) continue;
        tile.surveyed = true;
        if (tile.type === 'vein' || tile.type === 'gas') contacts++;
      }
    }

    d.scan.cooldown = SCAN_COOLDOWN_S;
    d.scan.active = SCAN_ACTIVE_S;
    d.scan.serial++;
    d.scan.contacts = contacts;
    this.bus.emit('drill:scanPulse', {
      col: ac,
      row: ar,
      radius: SCAN_RADIUS,
      cooldown: SCAN_COOLDOWN_S,
      contacts,
      serial: d.scan.serial,
    });
    return true;
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

    if (!Number.isFinite(d.moveCooldown)) d.moveCooldown = 0;
    if (!Number.isFinite(d.avatar.moveElapsed)) d.avatar.moveElapsed = 0;
    if (!Number.isFinite(d.avatar.moveDuration)) d.avatar.moveDuration = 0;
    if (!Number.isFinite(d.avatar.fromCol)) d.avatar.fromCol = d.avatar.col;
    if (!Number.isFinite(d.avatar.fromRow)) d.avatar.fromRow = d.avatar.row;
    if (!d.scan) d.scan = { cooldown: 0, active: 0, serial: 0, contacts: 0 };
    if (!Number.isFinite(d.drillTemp)) d.drillTemp = 0;
    if (!Number.isFinite(d.drillEnergy)) d.drillEnergy = DRILL_ENERGY_MAX;
    if (typeof d.energyDepleted !== 'boolean') d.energyDepleted = false;
    if (!Number.isFinite(d.tilesCleared)) d.tilesCleared = 0;
    if (!Number.isFinite(d.maxDepth)) d.maxDepth = d.avatar.row || 0;
    if (!Number.isFinite(d.sessionElapsed)) d.sessionElapsed = 0;
    d.sessionElapsed += dt;

    d.scan.cooldown = Math.max(0, (Number(d.scan.cooldown) || 0) - dt);
    d.scan.active = Math.max(0, (Number(d.scan.active) || 0) - dt);

    if (d.moveCooldown > 0) {
      d.moveCooldown -= dt;
    }

    // Advance visual move window so presentation can lerp for the full step duration.
    if (d.avatar.moveDuration > 0 && d.avatar.moveElapsed < d.avatar.moveDuration) {
      d.avatar.moveElapsed = Math.min(d.avatar.moveDuration, d.avatar.moveElapsed + dt);
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
      recoverRig(d, dt);
      return;
    }

    const nc = d.avatar.col + dx;
    const nr = d.avatar.row + dy;

    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) {
      d.avatar.isDrilling = false;
      d.avatar.drillTarget = null;
      recoverRig(d, dt);
      return;
    }

    // --- 2. Calculate cargo-load movement speed (inertia) ---
    const cargo = this.state.player.cargo;
    const loadFactor = cargo && cargo.capVolume > 0 ? (cargo.usedVolume / cargo.capVolume) : 0;
    // Base move cooldown is 0.06s (~2× prior 0.12s). Moves up to 0.11s when completely full.
    const cooldownVal = moveCooldownForLoad(loadFactor);

    const target = d.field[nc][nr];
    if (target.type === 'empty') {
      d.avatar.isDrilling = false;
      d.avatar.drillTarget = null;
      d.avatar.drillBlocked = false;
      recoverRig(d, dt);
      if (d.moveCooldown <= 0) {
        commitAvatarMove(d, nc, nr, cooldownVal);
      }
    } else {
      // Solid tile! Cannot drill UP or if overheated
      if (dy === -1) {
        d.avatar.isDrilling = false;
        d.avatar.drillTarget = null;
        recoverRig(d, dt);
        return;
      }

      if (d.overheated || d.energyDepleted) {
        d.avatar.isDrilling = false;
        d.avatar.drillTarget = null;
        const wasOverheated = d.overheated;
        recoverRig(d, dt);
        if (d.moveCooldown <= 0) {
          this.bus.emit('drill:warn', {
            text: wasOverheated ? 'Drill cooling down — release the bore.' : 'Rig capacitor recharging — release the bore.',
          });
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
        recoverRig(d, dt);
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
      d.avatar.drillBlocked = false;

      const telemetry = extractionTelemetry(target, this.getDrillDPS());
      const energyWindow = telemetry.energyPerS > 0 ? d.drillEnergy / telemetry.energyPerS : dt;
      const heatWindow = telemetry.heatPerS > 0 ? (100 - d.drillTemp) / telemetry.heatPerS : dt;
      const workDt = Math.max(0, Math.min(dt, energyWindow, heatWindow));
      target.hp -= telemetry.effectiveDps * workDt;
      d.drillEnergy = Math.max(0, d.drillEnergy - telemetry.energyPerS * workDt);
      d.drillTemp = Math.min(100, d.drillTemp + telemetry.heatPerS * workDt);
      if (d.drillEnergy <= 0) d.energyDepleted = true;
      if (d.drillTemp >= 100) d.overheated = true;

      // Emit spark particles request
      this.bus.emit('drill:spark', {
        col: nc,
        row: nr,
        type: target.type,
        ore: target.ore,
        hpFrac: target.maxHp > 0 ? Math.max(0, target.hp / target.maxHp) : 0,
        hardness: telemetry.hardness,
        energy: d.drillEnergy,
      });

      if (target.hp <= 0) {
        // Cleared!
        const wasVein = target.type === 'vein';
        const wasGas = target.type === 'gas';
        const wasType = target.type;
        const ore = target.ore;
        const yieldU = target.yieldU || 0;

        d.field[nc][nr] = { type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false };
        d.avatar.isDrilling = false;
        d.avatar.drillTarget = null;
        commitAvatarMove(d, nc, nr, cooldownVal);
        d.tilesCleared++;
        d.maxDepth = Math.max(d.maxDepth, nr);

        this.bus.emit('drill:break', {
          col: nc,
          row: nr,
          type: wasType,
          ore: ore || null,
          wasVein,
          wasGas,
        });

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
            const packet = scalarHitToDamagePacket({
              damage: dmg,
              damageType: 'explosive',
              penetration: 1,
              shieldBypass: 0,
              source: { kind: 'deep_core_gas', asteroidId: d.asteroidId },
            });
            packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
            this._routeDamage({
              attackerId: null,
              targetId: this.state.playerId,
              packet,
              origin: { kind: 'deep_core_gas', asteroidId: d.asteroidId, col: nc, row: nr },
            });
            this.bus.emit('drill:gasHit', { dmg, pos: { col: nc, row: nr } });
            this.bus.emit('camera:shake', { amount: 0.5 });
          }
        }
      }
    }
  },

  _routeDamage(request) {
    const helpers = this.ctx && this.ctx.helpers;
    if (helpers && typeof helpers.routeCombatDamage === 'function') return helpers.routeCombatDamage(request);
    const combatSys = this.ctx?.registry?.get && this.ctx.registry.get('combat');
    if (combatSys && typeof combatSys.ensureKernel === 'function') return combatSys.ensureKernel().routeDamage(request);
    this.bus.emit('combat:routeDamage', request);
    return null;
  },

  getTargetTelemetry(col, row) {
    const d = this.state.drill;
    if (!d || col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
    const tile = d.field[col][row];
    return { tile, ...extractionTelemetry(tile, this.getDrillDPS()) };
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

  // Surveyed tiles stay legible for the remainder of the session. The two-tile local reveal keeps
  // basic movement usable even while the scan is cooling down.
  isTileSurveyed(col, row) {
    const d = this.state.drill;
    if (!d || col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
    const tile = d.field[col][row];
    if (!tile || tile.type === 'empty' || tile.surveyed) return true;
    const dc = col - d.avatar.col;
    const dr = row - d.avatar.row;
    return (dc * dc) + (dr * dr) <= GAS_TELL_RADIUS * GAS_TELL_RADIUS;
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

export const DRILL_CONST = {
  COLS,
  ROWS,
  TILE,
  MOVE_COOLDOWN_BASE,
  MOVE_COOLDOWN_CARGO,
  SCAN_RADIUS,
  SCAN_COOLDOWN_S,
  SCAN_ACTIVE_S,
  DRILL_ENERGY_MAX,
  DRILL_ENERGY_RECOVERY,
  DRILL_ENERGY_RESUME,
  DRILL_HEAT_COOLING,
};
