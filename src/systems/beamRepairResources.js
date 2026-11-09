// Explicit beam policy: credits first, then one unsealed scrap buys 20 combined HP.
// Paid material remainder belongs to the player, not a target/beam hold. Ordinary
// player serialization preserves it across pauses, target changes and Continue.
import {removeCargo, sellableCargoQuantity} from './cargo.js';

export const BEAM_REPAIR_HP_PER_SCRAP = 20;
export const BEAM_REPAIR_CR_PER_HP = 1.5;
const KEY = 'beamRepairMaterialHp';
const busy = new WeakSet();
export function beamRepairReserve(state) {
  const n = state?.player?.[KEY];
  return Number.isFinite(n) && n >= 0 && n <= BEAM_REPAIR_HP_PER_SCRAP ? n : 0;
}
export function beamRepairScrap(state) {
  const n = sellableCargoQuantity(state, 'cmdty_scrap_metal');
  return Number.isSafeInteger(n) && n >= 1 ? n : 0;
}

// No notifications in this plan's commit. Payment observers must see BOTH the
// health change and its debit. Subsystem mutation remains with the combat kernel.
function repairPlan(owner, target, componentId, requested) {
  const s = owner.state;
  if (s.entities?.get(target?.id) !== target || !target.alive) return null;
  const life = target.occupantGeneration;
  const stillLive = () => s.entities.get(target.id) === target && target.alive
    && target.occupantGeneration === life;
  if (componentId) {
    const combat = owner.registry?.get('combat');
    const kernel = combat?.kernel;
    const row = s.combat?.entities?.[String(target.id)]?.subsystems?.[componentId];
    if (!kernel?.repair || !row || !Number.isFinite(row.health) || !Number.isFinite(row.maxHealth)) return null;
    const before = row.health, max = row.maxHealth;
    const amount = Math.min(requested, Math.max(0, max - before));
    return amount > 0 ? {amount, commit() {
      if (!stillLive() || s.combat?.entities?.[String(target.id)]?.subsystems?.[componentId] !== row
        || row.health !== before || row.maxHealth !== max) return false;
      const result = kernel.repair(target.id, componentId, amount, 'beam_repair');
      return result?.ok === true && Math.abs(result.applied - amount) < 1e-8;
    }} : null;
  }
  const rows = [['hull','hullMax'], ['armorHp','armorMax']].filter(([k,m]) =>
    Number.isFinite(target[k]) && Number.isFinite(target[m]) && target[k] >= 0 && target[m] >= target[k]);
  let remaining = requested;
  const changes = rows.map(([k,m]) => {
    const before = target[k], max = target[m], delta = Math.min(remaining, max - before);
    remaining -= delta; return {k,m,before,max,delta};
  });
  const amount = requested - remaining;
  return amount > 0 ? {amount, commit() {
    if (!stillLive() || changes.some(r => target[r.k] !== r.before || target[r.m] !== r.max)) return false;
    for (const r of changes) target[r.k] = r.before + r.delta;
    return true;
  }} : null;
}

export function applyFundedBeamRepair(owner, player, target, componentId, requested) {
  const s = owner.state, wallet = s?.player;
  if (!wallet || busy.has(s) || s.entities?.get(s.playerId) !== player || !player?.alive
    || s.mode !== 'flight' || s.save?.restoring || s.ui?.docked
    || !Number.isFinite(requested) || requested <= 0) return 0;
  const playerLife = player.occupantGeneration, targetLife = target?.occupantGeneration;
  const currentScope = () => s.player === wallet && s.mode === 'flight' && !s.save?.restoring && !s.ui?.docked
    && !s.player?.flags?.docked && s.entities.get(s.playerId) === player && player.alive
    && player.occupantGeneration === playerLife && s.entities.get(target?.id) === target
    && target?.alive && target.occupantGeneration === targetLife;
  if (!currentScope()) return 0;
  busy.add(s);
  try {
    let reserve = beamRepairReserve(s);
    const credits = Number.isSafeInteger(wallet.credits) && wallet.credits > 0 ? wallet.credits : 0;
    // Never combine a cargo callback with a credit payment. An exhausted wallet
    // buys material in its own transaction; already-paid remainder is used first.
    if (!reserve && !credits) {
      if (!beamRepairScrap(s) || !repairPlan(owner, target, componentId, requested)) return 0;
      // removeCargo mutates the hold before its cargo:changed notification. The
      // reserve is installed first so saves at that notification capture both.
      wallet[KEY] = BEAM_REPAIR_HP_PER_SCRAP;
      if (removeCargo(s, 'cmdty_scrap_metal', 1) !== 1) { wallet[KEY] = 0; return 0; }
      // Observers may change mode, target or load a save. Keep paid work, do not
      // heal an obsolete body. Re-entered repair is blocked by the per-state guard.
      if (!currentScope()) return 0;
      reserve = beamRepairReserve(s);
    }
    const budget = reserve || credits / BEAM_REPAIR_CR_PER_HP;
    const plan = repairPlan(owner, target, componentId, Math.min(requested, budget));
    if (!plan) return 0;
    if (reserve) {
      if (beamRepairReserve(s) !== reserve || !plan.commit()) return 0;
      wallet[KEY] = Math.max(0, reserve - plan.amount);
      if (!owner._beamRepairMaterialNotice) {
        owner._beamRepairMaterialNotice = true;
        owner.bus.emit('toast', {text:'Repair material: 1 unsealed scrap buys 20 total HP. Unused repair is kept when you stop.',kind:'info',ttl:6});
      }
      return plan.amount;
    }
    const request = {amount:Math.min(credits,Math.ceil(plan.amount * BEAM_REPAIR_CR_PER_HP)), expectedCredits:credits,
      requireFull:true, reason:'beam:repair', result:false, commit:() =>
        currentScope() && plan.commit()};
    owner.bus.emit('economy:chargeCredits', request);
    return request.result === true ? plan.amount : 0;
  } finally { busy.delete(s); }
}
