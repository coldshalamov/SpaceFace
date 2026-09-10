// Read-only Crucible toy guidance. Fittings choose the toy; combat owns its readiness.
import { WEAPONS } from '../data/weapons.js';
import { MODULES } from '../data/modules.js';
import { ATTACK_TRAIT_BY_ID } from '../data/attackTraits.js';
import { resolveActionLabel } from '../systems/input.js';
import { el } from './kit/index.js';

const weapons = new Map(WEAPONS.map(def => [def.id, def]));
const modules = new Map(MODULES.map(def => [def.id, def]));
const FLIGHT_PHASES = new Set(['wave_intro', 'active', 'cleanup']);

function binding(state, action) {
  return resolveActionLabel(state || {}, action, { arrows: 'word', empty: 'unbound' });
}

/** Activation only: an offer is not fitted yet and must not claim to be ready. */
export function crucibleFittingDescription(defId, state) {
  const fire = () => binding(state, 'fire');
  if (defId === 'wpn_snarl_s') return `Snarl — fires with guns (${fire()})`;
  if (defId === 'mod_bank_shot') {
    return `Banking — primary fire (${fire()})`;
  }
  const mod = modules.get(defId);
  const mods = mod?.mods || {};
  if (mods.repulsionTrap) return `Trap — ${binding(state, 'chargeThrow')} drop behind you`;
  if (mods.impulseChargeCapacity) {
    return `Charges — ${binding(state, 'chargeThrow')} throw · ${binding(state, 'chargeDetonate')} detonate`;
  }
  if (weapons.has(defId) || ATTACK_TRAIT_BY_ID[defId]) return `Primary fire — ${fire()}`;
  if (mods.masslineHeadId || mods.tetherReelRateMult || mods.tetherSpoolMult) {
    return `Massline — ${binding(state, 'tether')} latch / hold to control`;
  }
  if (mods.boostTopSpeedPct) return `Boost — ${binding(state, 'boost')}`;
  if (mods.countermeasure) return `Countermeasure — ${binding(state, 'countermeasure')}`;
  if (mods.ramDamageDealtMult) return 'Ram — fly into a hull';
  return mod ? 'Always active while fitted' : '';
}

function gunReadiness(state, ship, accepts, emptyText = 'no primary weapon') {
  const guns = (ship?.data?.weapons || []).filter(w => accepts(w.defId));
  if (!guns.length) return { status: 'empty', text: emptyText };
  if ((ship.data.weaponVentUntil || 0) > (state.simTime || 0)) {
    return { status: 'cooldown', text: 'cooling' };
  }
  const ready = guns.some(w => {
    const def = weapons.get(w.defId) || {};
    const heatCost = w.heat ?? def.heatPerShot ?? def.heatPerSec ?? 0;
    const heatMax = w.heatMax ?? def.heatMax ?? Infinity;
    const cost = w.energyCost ?? def.energyCost ?? 0;
    const cap = ship.cap ?? ship.data.derived?.cap ?? 0;
    return !(w._cooldown > 0) && !(heatCost > 0 && (w._heat || 0) >= heatMax)
      && cap >= cost * ((w.continuous ?? def.continuous) ? 1 / 60 : 1);
  });
  return ready ? { status: 'armed', text: 'armed' } : { status: 'cooldown', text: 'recharging' };
}

function trapReadiness(state, ship) {
  const quantity = Number(state.player?.cargo?.items?.cmdty_impulse_charge);
  const remaining = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
  let deployed = 0;
  let arming = 0;
  for (const entity of state.entityList || []) {
    if (!entity.alive || entity.type !== 'charge' || entity.data?.ownerId !== state.playerId
      || entity.data?.chargeId !== 'charge_repulsion_trap') continue;
    if (entity.data.armed) deployed += 1;
    else arming += 1;
  }
  const status = remaining === 0 ? 'empty'
    : (ship?.data?.impulseCharges?.throwCdT > 0 ? 'cooldown' : 'armed');
  // Launcher readiness and charges already in the room are separate facts. An empty rack can
  // still have a live trap. Do not count down fractional seconds or announce every gun cycle.
  const parts = [`${remaining} remaining`, status];
  if (deployed) parts.push(`${deployed} deployed`);
  if (arming) parts.push(`${arming} arming`);
  return { status, text: parts.join(' · ') };
}

/** Small flight supplement for toys whose activation is otherwise easy to mistake. */
export function crucibleCombatLines(state) {
  if (state?.run?.kind !== 'survival' || !FLIGHT_PHASES.has(state.run.phase)
    || state.ui?.screenStack?.length) return [];
  const player = state.player;
  const fittings = player?.ownedShips?.[player.activeShipIndex || 0]?.fittings || [];
  const ship = state.entities?.get(state.playerId);
  if (!ship?.alive) return [];
  const rows = [];
  const addGun = (id, accepts, emptyText) => {
    const readiness = gunReadiness(state, ship, accepts, emptyText);
    rows.push({ id, status: readiness.status,
      text: `${crucibleFittingDescription(id, state)} · ${readiness.text}` });
  };
  if (fittings.includes('mod_bank_shot')) {
    addGun('mod_bank_shot', id => {
      const weapon = weapons.get(id);
      return fittings.includes(id) && weapon && !weapon.continuous && weapon.tracking !== 'hitscan';
    }, 'needs a projectile weapon');
  }
  if (fittings.includes('wpn_snarl_s')) addGun('wpn_snarl_s', id => id === 'wpn_snarl_s');
  if (fittings.some(id => modules.get(id)?.mods?.repulsionTrap)) {
    const readiness = trapReadiness(state, ship);
    rows.push({ id: 'trap', status: readiness.status,
      text: `Trap — ${binding(state, 'chargeThrow')} · ${readiness.text}` });
  }
  return rows;
}

/** Mounted and released by crucibleFocus, never a second animation loop or input owner. */
export function mountCrucibleCombatReadout(host) {
  const root = el('ul', 'k-text k-t-data sf-crucible-combat');
  root.setAttribute('aria-label', 'Crucible combat fittings');
  root.setAttribute('aria-live', 'off');
  root.hidden = true;
  host.appendChild(root);
  const rows = new Map();
  return {
    root,
    update(state) {
      const lines = crucibleCombatLines(state);
      let changed = false;
      const keep = new Set(lines.map(line => line.id));
      for (const [id, row] of rows) {
        if (keep.has(id)) continue;
        row.remove();
        rows.delete(id);
        changed = true;
      }
      for (const line of lines) {
        let row = rows.get(line.id);
        if (!row) {
          row = el('li', 'sf-crucible-combat__toy');
          rows.set(line.id, row);
          root.appendChild(row);
          changed = true;
        }
        if (row.textContent !== line.text) { row.textContent = line.text; changed = true; }
        if (row.dataset.state !== line.status) { row.dataset.state = line.status; changed = true; }
      }
      const hidden = lines.length === 0;
      if (root.hidden !== hidden) { root.hidden = hidden; changed = true; }
      return changed;
    },
    release() { root.remove(); rows.clear(); },
  };
}
