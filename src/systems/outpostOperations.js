// Owned-facility readers and normalization. Automation owns these records; economy owns
// market/credit settlement, cargo owns the pilot hold. No independent tick or save ledger.
import { OUTPOSTS } from '../data/automation.js';
import { CLAIM_REFINERY_RECIPES, CLAIM_REFINERY_INPUT_IDS } from '../data/sites.js';

const DEFINITIONS = new Map(OUTPOSTS.map(def => [def.id, def]));
export const OUTPOST_TRANSFER_RANGE = 450;
export const OUTPOST_MAX_LEVEL = 3;
const finite = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

export function outpostDefinition(outpost = {}) {
  return DEFINITIONS.get(outpost.defId) || outpost;
}

export function outpostLevel(outpost = {}) {
  return Math.max(1, Math.min(OUTPOST_MAX_LEVEL, Math.floor(finite(outpost.level)) || 1));
}

export function outpostInputIds(outpost, def = outpostDefinition(outpost)) {
  const recipe = def.recipe || outpost.recipe;
  return recipe?.book === 'claim_refinery' ? CLAIM_REFINERY_INPUT_IDS
    : Object.keys(recipe?.inputs || {}).filter(id => finite(recipe.inputs[id]) > 0).sort();
}

export function outpostInputCapacity(outpost, def = outpostDefinition(outpost)) {
  return Math.max(0, Math.floor(finite(def.storageCap) * Math.pow(1.7, outpostLevel(outpost) - 1)));
}

export function outpostInputUsed(outpost = {}) {
  return Object.values(outpost.inputStock || {}).reduce((sum, qty) => sum + finite(qty), 0);
}

export function outpostCommodity(outpost, def = outpostDefinition(outpost)) {
  const recipe = def.recipe || outpost.recipe;
  if (recipe?.passive) return null;
  const outputIds = recipe?.book === 'claim_refinery'
    ? CLAIM_REFINERY_RECIPES.flatMap(row => Object.keys(row.output))
    : Object.keys(recipe?.output || {});
  if (outputIds.includes(outpost.storageGoodId)) return outpost.storageGoodId;
  if (outpost.storageGoodId != null) return null;
  return outputIds[0] || null;
}

export function outpostUpgradeCost(outpost, def = outpostDefinition(outpost)) {
  return outpostLevel(outpost) >= OUTPOST_MAX_LEVEL ? null
    : Math.round(finite(def.buildCost) * 0.6 * outpostLevel(outpost));
}

export function outpostTransferAccess(state, outpost) {
  if (!outpost || state?.world?.currentSectorId !== outpost.sectorId) return false;
  const pilot = state.entities?.get?.(state.playerId);
  if (!pilot || pilot.alive === false || !pilot.pos || !outpost.pos) return false;
  const values = [pilot.pos.x, pilot.pos.z, outpost.pos.x, outpost.pos.z];
  return values.every(Number.isFinite)
    && Math.hypot(pilot.pos.x - outpost.pos.x, pilot.pos.z - outpost.pos.z) <= OUTPOST_TRANSFER_RANGE;
}

export function normalizeOutpostOperation(outpost) {
  const def = outpostDefinition(outpost);
  outpost.level = outpostLevel(outpost);
  outpost.storage = finite(outpost.storage);
  const validInputs = new Set(outpostInputIds(outpost, def));
  const inputStock = {};
  let room = outpostInputCapacity(outpost, def);
  for (const id of [...validInputs].sort()) {
    const qty = Math.min(room, finite(outpost.inputStock?.[id]));
    if (qty > 0) { inputStock[id] = qty; room -= qty; }
  }
  outpost.inputStock = inputStock;
  outpost.saleSequence = Math.min(Number.MAX_SAFE_INTEGER - 1, Math.floor(finite(outpost.saleSequence)));
  outpost.totalSoldUnits = finite(outpost.totalSoldUnits);
  outpost.totalSaleCredits = Math.floor(finite(outpost.totalSaleCredits));
  if (typeof outpost.saleStationId !== 'string' || outpost.saleStationId.length > 120) outpost.saleStationId = null;
  if (typeof outpost.saleBlock !== 'string' || outpost.saleBlock.length > 80) outpost.saleBlock = null;
  const sale = outpost.lastSale;
  if (sale && (typeof sale !== 'object' || typeof sale.id !== 'string'
      || !Number.isSafeInteger(sale.sequence) || sale.sequence < 1
      || !Number.isSafeInteger(sale.quantity) || sale.quantity < (sale.kind === 'service' ? 0 : 1)
      || !Number.isSafeInteger(sale.credited) || sale.credited < 1)) outpost.lastSale = null;
  if (outpost.lastSale) outpost.saleSequence = Math.max(outpost.saleSequence, outpost.lastSale.sequence);
  return outpost;
}

export function outpostSaleExplanation(outpost) {
  const block = outpost.saleBlock;
  if (block === 'demand_saturation') return 'Buyer storage is full. Output stays here; choose another local buyer or collect it yourself.';
  if (block === 'passive_limit') return 'The shared income allowance is spent. Unsold output stays here for the next cycle or collection.';
  if (block === 'credit_limit' || block === 'credits_cap') return 'Your credit account is full. Spend credits or collect the output; nothing was sold.';
  if (block === 'no_buyer' || block === 'untraded') return 'No local buyer accepts this output. Collect it for another market.';
  if (block === 'economy_unavailable') return 'The receiving market is not ready. Output is retained; the next cycle will retry.';
  if (block === 'partial') return 'Only the accepted load was sold. Remaining output stays in storage.';
  if (block === 'retired') return 'This facility has moved to the claim workshop. Its existing stock is retained.';
  if (block) return 'The buyer refused this shipment. Output is retained; change buyer or collect it.';
  return outpost.autoSell === false ? 'Automatic sales paused. Collect output here or enable local sales.'
    : 'Local sales run each minute. Only accepted output leaves storage.';
}
