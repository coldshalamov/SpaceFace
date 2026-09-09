// Site production math — pure functions, no state mutation, no Three.js, no DOM.
// Owned by src/systems/asteroidSites.js; unit-tested directly in test/asteroid-sites.test.mjs.
//
// The sacred primitive (design/ASTEROID_SITES_BRIEF.md §1): a machine on a hollow cell reads its
// 8-cell contact ring. Solid neighbors feed it according to their material; hollow neighbors are
// access and pay nothing. Everything here recomputes from the ring — nothing may compensate a
// machine for a contact the player drilled away. Q = base * geology * min(power, input, export).
import { ORES } from '../data/mining.js';
import { CONTACT_YIELD, SITE_RECIPE_BY_ID } from '../data/sites.js';

const ORE_TIER_BY_ID = new Map(ORES.map((o) => [o.id, o.tier]));

const RING_OFFSETS = Object.freeze([
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
]);

/**
 * Read the 8-cell contact ring around (col,row) from a drill field (field[col][row] tiles).
 * Out-of-bounds neighbors count as empty (the asteroid boundary contributes nothing).
 * @returns {{ matrix:number, basalt:number, gas:number, empty:number, solid:number,
 *             ores:Object<string,number>, cells:Array }}
 */
export function contactProfile(field, col, row, cols, rows) {
  const profile = { matrix: 0, basalt: 0, gas: 0, empty: 0, solid: 0, ores: {}, cells: [] };
  for (const [dc, dr] of RING_OFFSETS) {
    const c = col + dc;
    const r = row + dr;
    const tile = (c >= 0 && c < cols && r >= 0 && r < rows && field[c]) ? field[c][r] : null;
    const kind = contactKind(tile);
    profile.cells.push({ col: c, row: r, kind, ore: kind === 'ore' ? tile.ore : null });
    if (kind === 'empty') { profile.empty++; continue; }
    profile.solid++;
    if (kind === 'matrix') profile.matrix++;
    else if (kind === 'basalt') profile.basalt++;
    else if (kind === 'gas') profile.gas++;
    else if (kind === 'ore') profile.ores[tile.ore] = (profile.ores[tile.ore] || 0) + 1;
  }
  return profile;
}

/** Classify one drill tile for contact purposes. Machines sit on hollow cells → 'empty'. */
export function contactKind(tile) {
  if (!tile || tile.type === 'empty') return 'empty';
  if (tile.type === 'dirt') return 'matrix';   // player-facing name: silicate matrix
  if (tile.type === 'rock') return 'basalt';   // dense basalt
  if (tile.type === 'gas') return 'gas';
  if (tile.type === 'vein' && tile.ore) return 'ore';
  return 'basalt';
}

/**
 * Per-minute gross production for one machine, given its contact profile and mode.
 * Pure capability statement — throttling by power/input/export happens in the tick, which
 * applies its own min() ladder. Returns rates BEFORE any throttle.
 * @returns {{ outputsPerMin:Object<string,number>, powerGen:number, powerDraw:number,
 *             usesGeology:boolean, geologyLive:boolean }}
 */
export function machineCapability(def, profile, mode) {
  const cap = {
    outputsPerMin: {},
    powerGen: Math.max(0, def.power || 0),
    powerDraw: Math.max(0, -(def.power || 0)),
    usesGeology: !!def.usesGeology,
    geologyLive: false,
  };
  if (!def) return cap;

  if (def.id === 'sm_extractor' && profile) {
    const silicate = profile.matrix * CONTACT_YIELD.matrixPerMin
      + profile.basalt * CONTACT_YIELD.basaltPerMin;
    if (silicate > 0) cap.outputsPerMin.cmdty_silicate = round3(silicate);
    for (const oreId of Object.keys(profile.ores).sort()) {
      const tier = Math.max(0, Math.min(4, ORE_TIER_BY_ID.get(oreId) ?? 0));
      const rate = profile.ores[oreId] * CONTACT_YIELD.orePerMinByTier[tier];
      if (rate > 0) cap.outputsPerMin[oreId] = round3((cap.outputsPerMin[oreId] || 0) + rate);
    }
    cap.geologyLive = Object.keys(cap.outputsPerMin).length > 0;
  } else if (def.id === 'sm_gas_tap' && profile) {
    const gas = profile.gas;
    cap.geologyLive = gas > 0;
    const genShare = mode === 'feedstock' ? 0 : (mode === 'split' ? 0.5 : 1);
    const feedShare = mode === 'generate' ? 0 : (mode === 'split' ? 0.5 : 1);
    cap.powerGen += gas * CONTACT_YIELD.gasPowerPerContact * genShare;
    const feed = gas * CONTACT_YIELD.gasFeedPerMinPerContact * feedShare;
    if (feed > 0) cap.outputsPerMin.cmdty_gas_hydrogen = round3(feed);
  }
  return cap;
}

/**
 * Advance one continuous recipe (refinery modes) by dtMin minutes against a shared store.
 * Consumes inputs and produces outputs with fractional carry held on `carry` (a plain object the
 * caller persists per machine). Bounded by power ratio, available inputs, output room, and the
 * lane throughput budget. Returns actual units moved (for throughput accounting) and a status.
 */
export function stepContinuousRecipe({
  recipeId, dtMin, powerRatio, store, roomFor, carry, throughputBudget,
}) {
  const recipe = SITE_RECIPE_BY_ID.get(recipeId);
  const result = { moved: 0, produced: {}, consumed: {}, status: 'idle', limit: null };
  if (!recipe || !(dtMin > 0)) return result;
  const inputs = Object.entries(recipe.inputs).sort(([a], [b]) => (a < b ? -1 : 1));
  const [outputId, outputPerBatch] = Object.entries(recipe.output)[0];
  const inputPerBatch = inputs.reduce((s, [, qty]) => s + qty, 0);

  // Requested batches this step from the machine's rated input throughput.
  let batches = (recipe.inputRatePerMin * dtMin * clamp01(powerRatio)) / inputPerBatch;
  if (!(batches > 0)) {
    result.status = powerRatio <= 0 ? 'no-power' : 'idle';
    result.limit = powerRatio <= 0 ? 'power' : null;
    return result;
  }
  let limit = powerRatio < 1 ? 'power' : null;

  // Input availability (fractional stock allowed in stores).
  for (const [goodId, perBatch] of inputs) {
    const avail = Math.max(0, Number(store[goodId]) || 0);
    const byInput = avail / perBatch;
    if (byInput < batches) { batches = byInput; limit = `input:${goodId}`; }
  }
  // Output room.
  const room = roomFor(outputId);
  const byRoom = room / outputPerBatch;
  if (byRoom < batches) { batches = byRoom; limit = 'export'; }
  // Lane throughput (units moved = inputs consumed + outputs produced).
  const unitsPerBatch = inputPerBatch + outputPerBatch;
  if (throughputBudget != null) {
    const byLane = Math.max(0, throughputBudget) / unitsPerBatch;
    if (byLane < batches) { batches = byLane; limit = 'lane'; }
  }

  if (!(batches > 0)) {
    result.status = limit && limit.startsWith('input') ? 'starved' : (limit === 'export' ? 'backlogged' : 'stalled');
    result.limit = limit;
    return result;
  }

  for (const [goodId, perBatch] of inputs) {
    const take = batches * perBatch;
    store[goodId] = Math.max(0, (Number(store[goodId]) || 0) - take);
    result.consumed[goodId] = take;
    result.moved += take;
  }
  // Whole units land in the store; the fractional remainder carries on the machine.
  const producedRaw = batches * outputPerBatch + (Number(carry[outputId]) || 0);
  const whole = Math.floor(producedRaw + 1e-9);
  carry[outputId] = Math.max(0, producedRaw - whole);
  if (whole > 0) store[outputId] = (Number(store[outputId]) || 0) + whole;
  result.produced[outputId] = producedRaw - (Number(carry[outputId]) || 0);
  result.moved += batches * outputPerBatch;
  result.status = limit ? (limit.startsWith('input') ? 'starved' : (limit === 'power' ? 'throttled' : 'limited')) : 'running';
  result.limit = limit;
  return result;
}

/**
 * Advance one discrete fabricator build. Inputs are consumed up front (a real committed batch),
 * progress accrues scaled by power ratio, output lands on completion. `job` is persisted on the
 * machine: { recipeId, progressS } or null.
 */
export function stepFabricator({
  machine, recipeId, dtS, powerRatio, store, roomFor, wantsBuild,
}) {
  const recipe = SITE_RECIPE_BY_ID.get(recipeId);
  const result = { completed: null, started: false, moved: 0, status: 'idle', limit: null, progress: 0 };
  if (!recipe) return result;

  // Finish/advance the running job first.
  if (machine.job && machine.job.recipeId === recipeId) {
    if (powerRatio <= 0) {
      result.status = 'no-power';
      result.limit = 'power';
      result.progress = machine.job.progressS / recipe.buildS;
      return result;
    }
    machine.job.progressS += dtS * clamp01(powerRatio);
    result.progress = Math.min(1, machine.job.progressS / recipe.buildS);
    if (machine.job.progressS + 1e-9 >= recipe.buildS) {
      const [outputId, qty] = Object.entries(recipe.output)[0];
      if (outputId !== 'pod') {
        store[outputId] = (Number(store[outputId]) || 0) + qty;
        result.moved += qty;
      }
      result.completed = { outputId, qty };
      machine.job = null;
      result.status = 'completed';
    } else {
      result.status = powerRatio < 1 ? 'throttled' : 'building';
      result.limit = powerRatio < 1 ? 'power' : null;
    }
    return result;
  }
  if (machine.job && machine.job.recipeId !== recipeId) {
    // Mode changed under a committed batch: the batch is abandoned (inputs already spent — a real
    // cost the inspector warns about). Deliberate: no free mode thrash.
    machine.job = null;
  }

  if (!wantsBuild) return result;
  if (powerRatio <= 0) {
    result.status = 'no-power';
    result.limit = 'power';
    return result;
  }
  // Start a new batch if every input is on hand.
  for (const [goodId, qty] of Object.entries(recipe.inputs)) {
    if ((Number(store[goodId]) || 0) < qty) {
      result.status = 'starved';
      result.limit = `input:${goodId}`;
      return result;
    }
  }
  const [outputId] = Object.entries(recipe.output)[0];
  if (outputId !== 'pod' && roomFor(outputId) < recipe.output[outputId]) {
    result.status = 'backlogged';
    result.limit = 'export';
    return result;
  }
  for (const [goodId, qty] of Object.entries(recipe.inputs)) {
    store[goodId] = Math.max(0, (Number(store[goodId]) || 0) - qty);
    result.moved += qty;
  }
  machine.job = { recipeId, progressS: 0 };
  result.started = true;
  result.status = 'building';
  return result;
}

export function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : (n > 1 ? 1 : n);
}

export function round3(v) {
  return Math.round((Number(v) || 0) * 1000) / 1000;
}
