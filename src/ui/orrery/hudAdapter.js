// ORRERY ↔ the live flight HUD (design/frontend/ORRERY.md §7 Phase 1).
//
// hud.js keeps every system it already runs (targeting, the roster scan, prompts, the slot-claim
// protocol); this adapter only READS the same sources the old instruments read and hands the ORRERY
// Cluster one plain model. Nothing here owns game state. The old cluster chassis and power rail stay
// mounted and hidden while ORRERY is on (their DOM contracts are pinned by tests); they are deleted in
// a later commit once the live route has been checked.
//
// Sources (each is the one the old HUD reads, so both always agree):
//   hull/shield/armour  p.hull/hullMax · p.shield/shieldMax · p.armorHp/armorMax
//   energy              p.cap/capMax                      (the live HUD reads cap, not energy)
//   heat                weaponHeatSummary(p.data.weapons)
//   speed / reference   |p.vel| · p.maxSpeed
//   boost               p.boost.energy / p.boost.max
//   drift               atan2(vel) − p.rot                 (same frame as playerDefeat.impactDirection)
//   ordnance            readRailModel(state, simTime)     (slots 1..9, states ready/armed/cooling/…)
//   tether              masslineInstrumentReadout(tether) + the attached body's mass
import { weaponHeatSummary } from '../weaponHeat.js';
import { readRailModel, RAIL_SLOTS, railSlotTip, resolveSlotKeys, resolveSlotLabels, slotDescription } from '../powerRail.js';
import { masslineInstrumentReadout } from '../hudAttention.js';
import { SHIPS } from '../../data/ships.js';
import { injectOrrery } from './tokens.js';
import { createFlightCluster } from './flightCluster.js';
import { applyOrreryHudSkin } from './hudSkin.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const GROUP_NAME = Object.freeze({ ORDNANCE: 'Ordnance', FIELDWORK: 'Fieldwork', RIG: 'Rig', BAY: 'Bay' });
const GROUP_ICON = Object.freeze({ Ordnance: 'weapon', Fieldwork: 'well', Rig: 'cone', Bay: 'munitions' });
// The rail's 24-px glyph names → the 48-px kit icon file names the Cluster masks.
const SLOT_ICON = Object.freeze({ munitions: 'munitions', blast: 'fire', tether: 'line', seed: 'seed', well: 'well', repel: 'repel', cone: 'cone', skim: 'skim', weapon: 'munitions' });

/** The rail's slots grouped by band, each with a stable id (its rail index) and its live key label. */
export function buildOrdnanceGroups(bindings) {
  const labels = resolveSlotLabels(bindings);
  const keys = resolveSlotKeys(bindings);
  const groups = [];
  const byName = new Map();
  for (const slot of RAIL_SLOTS) {
    const name = GROUP_NAME[slot.band] || String(slot.band);
    let g = byName.get(name);
    if (!g) { g = { name, icon: GROUP_ICON[name] || 'weapon', slots: [] }; byName.set(name, g); groups.push(g); }
    g.slots.push({
      id: String(slot.index), key: labels[slot.index] || '—', name: slot.name,
      icon: SLOT_ICON[slot.glyph] || slot.glyph || 'weapon',
      keys: keys[slot.index] || '', description: slotDescription(slot.index),
    });
  }
  // A collapsed node answers "what is in this band" without unfolding it.
  for (const g of groups) {
    g.tip = `${g.name} — ${g.slots.map((s) => `${s.name} ${s.key}`).join(' · ')}`;
  }
  return groups;
}

/**
 * Remembers each cooling slot's first-seen remaining time so a cooldown can be drawn as a fraction
 * (the rail model reports only the time left).
 */
export function createCooldownTracker() {
  const started = new Map();
  return function fraction(index, slot) {
    if (!slot || slot.state !== 'cooling') { started.delete(index); return null; }
    const left = Math.max(0, Number(slot.cooldownMs) || 0);
    const prev = started.get(index);
    if (prev == null || left > prev) started.set(index, left);
    const total = started.get(index) || 1;
    return Math.max(0, Math.min(1, 1 - left / total));
  };
}

const REST_SLOT_INDEX = (RAIL_SLOTS.find((slot) => slot.action === 'tether') || RAIL_SLOTS[0] || { index: 1 }).index;
const RAIL_STATE = Object.freeze({ ready: 'ready', armed: 'armed', cooling: 'cooldown', empty: 'empty', locked: 'locked', unaffordable: 'locked' });

export function readOrdnanceModel(state, tracker, bindings) {
  const rail = readRailModel(state, Number(state && state.simTime) || 0);
  const labels = resolveSlotLabels(bindings);
  const keys = resolveSlotKeys(bindings);
  const out = {};
  for (const slot of RAIL_SLOTS) {
    const r = rail[slot.index] || {};
    const st = RAIL_STATE[r.state] || 'ready';
    const entry = { state: st };
    if (st === 'cooldown') entry.cooldown = tracker ? tracker(slot.index, r) ?? 0 : 0;
    const count = /×(\d+)/.exec(String(r.name || ''));
    if (count) entry.count = Number(count[1]);
    // The tier-2 reveal phrase for this verb: the bank sentence, the live keys, the live state.
    // Composed here (not in the Cluster) so every surface explains a verb in the same words.
    entry.tip = railSlotTip({
      name: r.name || slot.name,
      keys: keys[slot.index] || labels[slot.index] || '',
      description: r.description || slotDescription(slot.index),
      why: r.why || '',
    });
    out[String(slot.index)] = entry;
  }
  return out;
}

function finite(n, d = 0) { return Number.isFinite(n) ? n : d; }

/** The Cluster's model for this frame, from the player entity and state. Pure apart from `tracker`. */
export function readClusterModel(state, p, { tracker = null, ordnance = null, bindings = null } = {}) {
  if (!p) return null;
  const vx = finite(p.vel && p.vel.x);
  const vz = finite(p.vel && p.vel.z);
  const speed = Math.hypot(vx, vz);
  let drift = 0;
  if (speed > 8 && Number.isFinite(p.rot)) {
    let rel = (Math.atan2(vz, vx) - p.rot) * 180 / Math.PI;
    while (rel > 180) rel -= 360;
    while (rel <= -180) rel += 360;
    drift = rel;
  }
  const heat = weaponHeatSummary(p.data && p.data.weapons);
  const player = (state && state.player) || {};
  const local = player.tether;
  const tether = local && local.active ? local : player.remoteMassline;
  const ml = masslineInstrumentReadout(tether);
  let tetherModel = null;
  if (ml) {
    const attachedId = tether.attachmentId ?? tether.targetId ?? tether.payloadId;
    const body = attachedId != null && state.entities && typeof state.entities.get === 'function' ? state.entities.get(attachedId) : null;
    const mass = Math.round(finite((body && ((body.physicsBody && body.physicsBody.mass) || body.mass)) || 0));
    tetherModel = { state: 'Payload', mass: mass > 0 ? mass : 1, strain: ml.load };
  }
  return {
    hull: finite(p.hull), hullMax: finite(p.hullMax, 1),
    shield: finite(p.shield), shieldMax: finite(p.shieldMax, 0),
    armor: finite(p.armorHp), armorMax: finite(p.armorMax, 0),
    energy: finite(p.cap), energyMax: finite(p.capMax, 0),
    heat: finite(heat && heat.frac),
    speed, speedRef: finite(p.maxSpeed, 180),
    boost: p.boost && p.boost.max > 0 ? Math.max(0, Math.min(1, p.boost.energy / p.boost.max)) : 0,
    drift,
    ordnance: ordnance || readOrdnanceModel(state, tracker, bindings),
    tether: tetherModel,
  };
}

const HOST_CSS = `
#hud .orr-hud-cluster { position:absolute; left:18px; bottom:24px; z-index:5; pointer-events:none; }
#hud .orr-hud-cluster .orr-cluster { --orr-cluster-scale:1; }
@media (max-width:1700px) { #hud .orr-hud-cluster .orr-cluster { --orr-cluster-scale:.82; } }
@media (max-width:1300px) { #hud .orr-hud-cluster .orr-cluster { --orr-cluster-scale:.7; } }
/* ORRERY owns the bottom-left and the ordnance: the old chassis and rail stay mounted, hidden. */
#hud[data-hud="orrery"] .sf-leftstack, #hud[data-hud="orrery"] .sf-prail { visibility:hidden !important; pointer-events:none !important; }
`;

/**
 * Mount the ORRERY Cluster into the live HUD root. Returns { update(state, p, slow), dispose }.
 * `slow` gates the ordnance read (it scans charges) to the HUD's slow clock; everything else is
 * guarded by the Cluster's own change detection, so a settled frame writes nothing.
 */
export function mountOrreryCluster(root, state, { bindings = null } = {}) {
  if (!root || typeof document === 'undefined') return null;
  injectOrrery();
  if (!document.getElementById('sf-orrery-hud-host')) {
    const style = document.createElement('style');
    style.id = 'sf-orrery-hud-host';
    style.textContent = HOST_CSS;
    document.head.appendChild(style);
  }
  const player = state && state.entities && typeof state.entities.get === 'function' ? state.entities.get(state.playerId) : null;
  const defId = (player && player.data && (player.data.defId || player.data.shipId)) || 'ship_kestrel';
  const def = SHIP_BY_ID.get(defId);
  const host = document.createElement('div');
  host.className = 'orr-hud-cluster';
  const cluster = createFlightCluster({
    shipId: defId,
    name: (def && def.name) || 'Hull',
    classLine: `${def && def.role ? def.role : 'hull'} · tier ${def && Number.isFinite(def.tier) ? def.tier : 0}`,
    groups: buildOrdnanceGroups(bindings),
    // before anything is engaged the Hand rests on the Line: the game's signature verb
    restSlot: String(REST_SLOT_INDEX),
  });
  host.appendChild(cluster.el);
  root.appendChild(host);
  root.dataset.hud = 'orrery';
  const removeSkin = applyOrreryHudSkin(document);
  cluster.arrive();
  const tracker = createCooldownTracker();
  let ordnance = null;
  return {
    host,
    update(liveState, p, slow) {
      if (!p) return;
      if (slow || !ordnance) ordnance = readOrdnanceModel(liveState, tracker, bindings);
      const model = readClusterModel(liveState, p, { ordnance });
      if (model) cluster.update(model);
    },
    dispose() { cluster.dispose(); host.remove(); removeSkin(); if (root.dataset.hud === 'orrery') delete root.dataset.hud; },
  };
}
