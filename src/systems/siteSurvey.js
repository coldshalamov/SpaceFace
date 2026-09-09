// Claim survey math — pure functions, no state mutation, no Three.js, no DOM.
// Owned by src/systems/asteroidSites.js; unit-tested directly in test/pq024-survey-claim.test.mjs.
//
// PQ-024 corridor: before a Massline Core is installed, the Survey pulse progressively reveals ONE
// deterministic same-material connected interior formation. That knowledge is volatile (session
// state only — never serialized). Core installation atomically commits the exact target/revealed
// cells into the durable site record; the first real positive output then moves the committed
// record to `producing` behind one authoritative receipt.
//
// Determinism contract: selection/reveal consume ONLY the field array (itself seeded — see
// drill.js generateDrillField) and fixed iteration order. No RNG, no wall time, no object/Set
// iteration order, no player camera. Same field state -> same targetId, same cells, same reveal.
import { hash32 } from '../core/rng.js';

// Declared selector band. Rows 0-2 are the guaranteed surface skin (drill.js tileFor), so the
// interior starts at row 3. The band reads discrete geological features (vein/gas clusters and
// bounded basalt pockets) and excludes the field-spanning matrix/basalt seas.
export const SURVEY_LIMITS = Object.freeze({
  minRow: 3,
  minArea: 3,
  maxArea: 48,
  revealBudget: 2,
});

// Material preference for the survey target: a readable feature beats anonymous mass.
// vein (any ore) > gas > basalt > matrix. Final tie-break is the stable cell key (min index).
const CLASS_RANK = Object.freeze({ vein: 0, gas: 1, basalt: 2, matrix: 3 });

export const SURVEY_RECORD_VERSION = 1;

/** Formation material key for one drill tile; null when the cell cannot join a formation. */
export function surveyMaterialOf(tile) {
  if (!tile || tile.type === 'empty') return null;
  if (tile.type === 'dirt') return 'matrix';
  if (tile.type === 'rock') return 'basalt';
  if (tile.type === 'gas') return 'gas';
  if (tile.type === 'vein' && tile.ore) return `vein:${tile.ore}`;
  return null;
}

function materialClass(material) {
  const at = String(material).indexOf(':');
  return at === -1 ? material : String(material).slice(0, at);
}

/**
 * Every same-material 4-connected component among valid interior cells, in stable order
 * (ascending min cell index). `cells` inside each component are ascending tile indices.
 */
export function collectSurveyComponents(field, cols, rows, limits = SURVEY_LIMITS) {
  const minRow = Math.max(0, Math.trunc(Number(limits.minRow) || 0));
  const seen = new Set();
  const out = [];
  for (let c = 0; c < cols; c++) {
    for (let r = minRow; r < rows; r++) {
      const idx = r * cols + c;
      if (seen.has(idx)) continue;
      const material = surveyMaterialOf(field[c] && field[c][r]);
      if (!material) continue;
      const cells = [];
      const queue = [idx];
      seen.add(idx);
      while (queue.length) {
        const cur = queue.pop();
        cells.push(cur);
        const cc = cur % cols;
        const cr = Math.floor(cur / cols);
        if (cr - 1 >= minRow) pushIf(queue, seen, field, cols, cur - cols, material);
        pushIf(queue, seen, field, cols, cc + 1 < cols ? cur + 1 : -1, material);
        if (cr + 1 < rows) pushIf(queue, seen, field, cols, cur + cols, material);
        pushIf(queue, seen, field, cols, cc > 0 ? cur - 1 : -1, material);
      }
      cells.sort((a, b) => a - b);
      out.push({ material, cells, size: cells.length });
    }
  }
  out.sort((a, b) => a.cells[0] - b.cells[0]);
  return out;
}

function pushIf(queue, seen, field, cols, nidx, material) {
  if (nidx < 0 || seen.has(nidx)) return;
  const nc = nidx % cols;
  const nr = Math.floor(nidx / cols);
  if (surveyMaterialOf(field[nc] && field[nc][nr]) !== material) return;
  seen.add(nidx);
  queue.push(nidx);
}

function compareComponents(a, b) {
  const rankDelta = CLASS_RANK[materialClass(a.material)] - CLASS_RANK[materialClass(b.material)];
  if (rankDelta) return rankDelta;
  if (a.size !== b.size) return b.size - a.size; // richer feature first
  return a.cells[0] - b.cells[0]; // stable cell-key tie-break
}


/**
 * Select THE one survey target for a field state. Total on any field with at least one valid
 * interior cell: primary band [minArea..maxArea] by (class rank, size desc, min index); then the
 * smallest component of at least minArea; then the single largest component. Returns null only
 * when the interior holds no solid cell at all.
 */
export function selectSurveyTarget(field, cols, rows, limits = SURVEY_LIMITS) {
  const components = collectSurveyComponents(field, cols, rows, limits);
  if (!components.length) return null;
  const minArea = Math.max(1, Math.trunc(Number(limits.minArea) || 1));
  const maxArea = Math.max(minArea, Math.trunc(Number(limits.maxArea) || minArea));
  const inBand = components.filter((c) => c.size >= minArea && c.size <= maxArea).sort(compareComponents);
  let pick = inBand[0] || null;
  if (!pick) {
    const atLeastMin = components.filter((c) => c.size >= minArea)
      .sort((a, b) => (a.size - b.size) || compareComponents(a, b));
    pick = atLeastMin[0] || null;
  }
  if (!pick) pick = [...components].sort((a, b) => (b.size - a.size) || compareComponents(a, b))[0];
  return {
    targetId: `frm_${hash32('pq024', pick.material, pick.cells.join(',')).toString(36)}`,
    material: pick.material,
    cells: pick.cells.slice(),
  };
}

/**
 * The next deterministic bounded frontier subset to reveal. Seeds at the component's stable cell
 * key when nothing is revealed; afterwards reveals unrevealed cells 4-adjacent to the revealed
 * set, ascending, capped at `budget`. Empty when the target is fully revealed.
 */
export function surveyRevealFrontier(cells, revealed, budget, cols) {
  const target = Array.isArray(cells) ? cells : [];
  const shown = new Set(Array.isArray(revealed) ? revealed : []);
  const remaining = Math.max(0, Math.trunc(Number(budget) || 0));
  if (!target.length || remaining <= 0) return [];
  const out = [];
  if (!shown.size) {
    out.push(target[0]);
    shown.add(target[0]);
  }
  if (out.length >= remaining) return out;
  const frontier = [];
  for (const idx of target) {
    if (shown.has(idx)) continue;
    const col = idx % cols;
    if (shown.has(idx - cols) || shown.has(idx + cols)
      || (col > 0 && shown.has(idx - 1)) || (col < cols - 1 && shown.has(idx + 1))) {
      frontier.push(idx);
    }
  }
  frontier.sort((a, b) => a - b);
  for (const idx of frontier) {
    if (out.length >= remaining) break;
    out.push(idx);
  }
  return out;
}

/**
 * Validate a frozen target against the CURRENT field: every recorded cell must still hold the
 * recorded material, and the recorded set must be exactly the same-material connected component
 * containing its own stable key. Drilling into the formation (or any material drift) makes the
 * adoption stale — the caller must refuse, never silently reroll.
 */
export function validateSurveyTarget(record, field, cols, rows) {
  if (!record || !Array.isArray(record.cells) || !record.cells.length) return false;
  const cells = [...record.cells].sort((a, b) => a - b);
  for (const idx of cells) {
    const c = idx % cols;
    const r = Math.floor(idx / cols);
    if (c < 0 || c >= cols || r < 0 || r >= rows) return false;
    if (surveyMaterialOf(field[c] && field[c][r]) !== record.material) return false;
  }
  // Exact component identity: re-derive the component containing the stable key and compare sets.
  const components = collectSurveyComponents(field, cols, rows, { ...SURVEY_LIMITS, minRow: 0 });
  const home = components.find((comp) => comp.material === record.material && comp.cells.includes(cells[0]));
  if (!home || home.cells.length !== cells.length) return false;
  for (let i = 0; i < cells.length; i++) if (home.cells[i] !== cells[i]) return false;
  return true;
}

/** Shape-check one durable production receipt. Returns the hardened copy or null. */
export function normalizeProductionReceipt(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.receiptId !== 'string' || !raw.receiptId) return null;
  if (typeof raw.siteId !== 'string' || !raw.siteId) return null;
  if (typeof raw.producerId !== 'string' || !raw.producerId) return null;
  if (typeof raw.defId !== 'string' || !raw.defId || raw.defId === 'sm_massline_core') return null;
  if (!(Number(raw.positiveQuantity) > 0)) return null;
  if (!Number.isFinite(raw.committedTick) || raw.committedTick < 0) return null;
  if (typeof raw.outputId !== 'string' || !raw.outputId) return null;
  return {
    receiptId: raw.receiptId,
    siteId: raw.siteId,
    producerId: raw.producerId,
    defId: raw.defId,
    recipeId: typeof raw.recipeId === 'string' && raw.recipeId ? raw.recipeId : null,
    outputId: raw.outputId,
    positiveQuantity: Math.round(Number(raw.positiveQuantity) * 1000) / 1000,
    committedTick: Math.max(0, Math.trunc(Number(raw.committedTick) || 0)),
    sourceMutationId: typeof raw.sourceMutationId === 'string' && raw.sourceMutationId
      ? raw.sourceMutationId : null,
  };
}

/**
 * Harden one durable survey record read from a save. Formation fields are all-or-nothing: a
 * malformed formation drops the whole record (the next real output re-derives it from the frozen
 * bore seed — fail closed, never invented). A `producing` record whose receipt fails validation
 * is demoted to `committed` rather than allowed to keep an unearned terminal state.
 */
export function normalizeSurveyRecord(raw, cols, rows) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const cells = [];
  const seen = new Set();
  for (const value of Array.isArray(raw.cells) ? raw.cells : []) {
    const idx = Math.trunc(Number(value));
    if (!Number.isFinite(idx) || idx < 0 || idx >= cols * rows || seen.has(idx)) continue;
    seen.add(idx);
    cells.push(idx);
  }
  cells.sort((a, b) => a - b);
  if (!cells.length) return null;
  if (typeof raw.targetId !== 'string' || !raw.targetId) return null;
  if (typeof raw.material !== 'string' || !raw.material) return null;
  const revealedCells = [];
  for (const value of Array.isArray(raw.revealedCells) ? raw.revealedCells : []) {
    const idx = Math.trunc(Number(value));
    if (!Number.isFinite(idx) || !seen.has(idx)) continue;
    revealedCells.push(idx);
  }
  revealedCells.sort((a, b) => a - b);
  const record = {
    version: SURVEY_RECORD_VERSION,
    targetId: raw.targetId,
    material: raw.material,
    cells,
    revealedCells,
    seed: Number.isFinite(raw.seed) ? (Math.trunc(Number(raw.seed)) >>> 0) : 0,
    committedTick: Math.max(0, Math.trunc(Number(raw.committedTick) || 0)),
    committedT: Math.max(0, Number(raw.committedT) || 0),
    lifecycle: raw.lifecycle === 'producing' ? 'producing' : 'committed',
    receipt: null,
  };
  const receipt = normalizeProductionReceipt(raw.receipt);
  if (record.lifecycle === 'producing') {
    if (receipt) record.receipt = receipt;
    else record.lifecycle = 'committed'; // demote a terminal state its receipt cannot prove
  }
  return record;
}

