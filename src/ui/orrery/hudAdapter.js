// ORRERY ↔ the live flight HUD (design/frontend/ORRERY.md §7 Phase 1).
//
// hud.js owns targeting, the roster scan and prompts. This adapter reads the authoritative
// instrument sources and hands the sole flight Cluster one plain model. Nothing here owns game state.
//
// Sources (each is the one the old HUD reads, so both always agree):
//   hull/shield/armour  p.hull/hullMax · p.shield/shieldMax · p.armorHp/armorMax
//   energy              p.cap/capMax                      (the live HUD reads cap, not energy)
//   heat                weaponHeatSummary(p.data.weapons)
//   speed / reference   |p.vel| · p.maxSpeed
//   speed ceiling       state.input.travelDrive.ceiling, else resolveTravelCeiling(profile) — the V-MAX the
//                       travel tape already prints, so the Speed Dial's last blade is the same number
//   boost               p.boost.energy / p.boost.max · p.flags.boosting (the afterburner is burning)
//   drift               atan2(vel) − p.rot                 (same frame as playerDefeat.impactDirection)
//   ordnance            readRailModel(state, simTime)     (slots 1..9, states ready/armed/cooling/…)
//   tether              masslineInstrumentReadout(tether) + the attached body's mass — for a
//                       declared manifest, only the measurement the loaded rope earned
import { weaponHeatSummary } from '../weaponHeat.js';
import { BOMB_SLOT_INDEX, readRailModel, RAIL_SLOTS, railSlotTip, resolveSlotKeys, resolveSlotLabels, slotDescription } from '../powerRail.js';
import { masslineInstrumentReadout } from '../hudAttention.js';
import { massDeclarationForTarget, physicalMassT } from '../../systems/cargoCustody.js';
import { SHIPS } from '../../data/ships.js';
import { resolvePropulsionProfile } from '../../core/flight/propulsionCatalog.js';
import { resolveTravelCeiling } from '../../core/flight/propulsionKernel.js';
import { travelFlag } from '../../data/featureFlags.js';
import { formatBindingCode, resolveActionCodes, resolveActionLabel } from '../../systems/input.js';
import { injectOrrery } from './tokens.js';
import { createFlightCluster } from './flightCluster.js';
import { applyOrreryHudSkin } from './hudSkin.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
// The five powers (owner 2026-10-22): each power is its own band, so each prints by name.
const GROUP_NAME = Object.freeze({ PULL: 'Pull', SHOVE: 'Shove', PIN: 'Pin', BAY: 'Bomb', RIG: 'Rig', LINE: 'Line' });
const GROUP_ICON = Object.freeze({ Pull: 'well', Shove: 'repel', Pin: 'seed', Bomb: 'munitions', Rig: 'cone', Line: 'line' });
// One tint per power (design/expansion/05_ASSET_ROSTER.md §7.2): the Cluster colours each key's
// mark so a glance tells the five apart. Armed/live states still override the tint.
const GROUP_POWER = Object.freeze({ PULL: 'pull', SHOVE: 'shove', PIN: 'pin', BAY: 'bomb', RIG: 'rig', LINE: 'line' });
// The rail's 24-px glyph names → the 48-px kit icon file names the Cluster masks.
const SLOT_ICON = Object.freeze({ munitions: 'munitions', blast: 'fire', tether: 'line', seed: 'seed', well: 'well', repel: 'repel', cone: 'cone', skim: 'skim', weapon: 'munitions' });
const SLOT_ARSENAL = Object.freeze({ 1: 'field_well_standard', 2: 'field_repulsor_standard',
  3: 'field_seed_standard', 5: 'field_cone_standard', 6: 'power_massline' });

/** The rail's slots grouped by band, each with a stable id (its rail index) and its live key label. */
export function buildOrdnanceGroups(bindings) {
  const labels = resolveSlotLabels(bindings);
  const keys = resolveSlotKeys(bindings);
  const groups = [];
  const byName = new Map();
  for (const slot of RAIL_SLOTS) {
    const name = GROUP_NAME[slot.band] || String(slot.band);
    const power = GROUP_POWER[slot.band] || '';
    let g = byName.get(name);
    if (!g) { g = { name, icon: GROUP_ICON[name] || 'weapon', power, slots: [] }; byName.set(name, g); groups.push(g); }
    g.slots.push({
      id: String(slot.index), key: labels[slot.index] || '—', name: slot.name,
      icon: SLOT_ICON[slot.glyph] || slot.glyph || 'weapon', power,
      keys: keys[slot.index] || '', description: slotDescription(slot.index),
    });
  }
  // A collapsed node answers "what is in this band" without unfolding it.
  for (const g of groups) g.tip = groupTip(g);
  return groups;
}

/** A folded node's tip: a one-power band explains that power; a wider band lists its keys. */
export function groupTip(group) {
  const only = group.slots.length === 1 ? group.slots[0] : null;
  if (only && only.description) return `${only.name} — ${only.description} (${only.key})`;
  return `${group.name} — ${group.slots.map((s) => `${s.name} ${s.key}`).join(' · ')}`;
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

function readClusterBindings(state) {
  const bindings = {};
  for (const slot of RAIL_SLOTS) if (slot.action) bindings[slot.action] = resolveActionCodes(state, slot.action);
  return bindings;
}

function activeLineControlHint(state) {
  const player = state.player || {};
  const tether = player.tether?.active ? player.tether : player.remoteMassline;
  if (!masslineInstrumentReadout(tether)) return '';
  const hold = resolveActionLabel(state, 'tether');
  if (!hold) return '';
  const first = action => formatBindingCode(resolveActionCodes(state, action)[0]);
  const forward = first('forward'); const reverse = first('reverse');
  const orbit = [first('yawLeft'), first('yawRight')].filter(Boolean).join('/');
  const boost = resolveActionLabel(state, 'boost');
  const parts = [];
  if (forward) parts.push(`${forward} REEL`);
  if (reverse) parts.push(`${reverse} PAY OUT`);
  if (orbit) parts.push(`${orbit} ORBIT`);
  if (boost) parts.push(`${boost} PUMP`);
  return parts.length ? `Hold ${hold} for line control: ${parts.join(' · ')}` : '';
}

export function readOrdnanceModel(state, tracker, bindings) {
  const rail = readRailModel(state, Number(state && state.simTime) || 0);
  bindings ??= readClusterBindings(state);
  const labels = resolveSlotLabels(bindings);
  const keys = resolveSlotKeys(bindings);
  const out = {};
  for (const slot of RAIL_SLOTS) {
    const r = rail[slot.index] || {};
    const st = RAIL_STATE[r.state] || 'ready';
    const isBomb = slot.index === BOMB_SLOT_INDEX;
    // The bomb key shows the chosen ordnance: the sticky charge, or the selected drift bomb.
    const bombArt = r.charge ? 'power_charge' : (r.glyph?.startsWith('bomb_') ? r.glyph : '');
    const entry = { state: st, key: labels[slot.index] || '', arsenalId: isBomb ? bombArt : SLOT_ARSENAL[slot.index] || '' };
    if (isBomb) entry.consumable = true;
    // SWARM-03: the rail's tactical-live flag rides beside the state so the Cluster can
    // breathe a key whose verb is real right now (latch in reach, ordnance armed, pack
    // inside the well) — a cue, not a new surface.
    if (r.live === true) entry.live = true;
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
    if (slot.action === 'tether') {
      const hint = activeLineControlHint(state);
      if (hint) entry.tip += `\n${hint}`;
    }
    out[String(slot.index)] = entry;
  }
  return out;
}

function finite(n, d = 0) { return Number.isFinite(n) ? n : d; }

/** The travel drive as the sim publishes it, or null when the drive axis is off. */
function travelDriveOf(state) {
  const drive = travelFlag('travelBurn') && state && state.input ? state.input.travelDrive : null;
  return drive && typeof drive === 'object' ? drive : null;
}

/**
 * The hull's V-MAX: the speed the travel drive tops out at, which is where the Speed Dial ends. 0 when
 * the drive axis is off (the dial then draws its own overdrive band). Profile resolution allocates, so
 * the live mount reads this on the HUD's slow clock, never per frame.
 */
export function readSpeedCeiling(state, p) {
  if (!travelFlag('travelBurn')) return 0;
  const drive = travelDriveOf(state);
  if (drive && Number.isFinite(drive.ceiling) && drive.ceiling > 0) return drive.ceiling;
  try { return finite(resolveTravelCeiling(resolvePropulsionProfile(p, state))); } catch { return 0; }
}

/** The Cluster's model for this frame; only the caller's tracker and heat scratch are updated. */
export function readClusterModel(state, p, { tracker = null, ordnance = null, bindings = null, speedMax = 0, weaponHeatScratch = null } = {}) {
  if (!p) return null;
  const drive = travelDriveOf(state);
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
  const heat = weaponHeatSummary(p.data && p.data.weapons, weaponHeatScratch);
  const player = (state && state.player) || {};
  const local = player.tether;
  const tether = local && local.active ? local : player.remoteMassline;
  const ml = masslineInstrumentReadout(tether);
  let tetherModel = null;
  if (ml) {
    // tether.attachmentId is an attachment identity (`att_000001`), never an entity id —
    // the body it names lives in the attachment ledger. tether.targetId/payloadId are
    // already entity ids, so they resolve directly as the fallback.
    const ledger = state.combat && state.combat.attachments && state.combat.attachments.byId;
    const attachment = tether.attachmentId != null && ledger ? ledger[String(tether.attachmentId)] : null;
    const attachedId = attachment && attachment.targetId != null
      ? attachment.targetId
      : (tether.targetId ?? tether.payloadId);
    const body = attachedId != null && state.entities && typeof state.entities.get === 'function' ? state.entities.get(attachedId) : null;
    let mass = physicalMassT(body);
    const decl = mass != null ? massDeclarationForTarget(state, body) : null;
    if (decl) {
      // The rope is a scale: for a declared manifest the only honest tonnage is the
      // measurement the loaded line earned — the durable slip is the record of it, and
      // the live telemetry projection mirrors the same slipId while the latch holds.
      // Before the dwell completes the readout is honestly unknown; the body's hidden
      // stamp and the manifest's claim are both kept off the glass.
      mass = null;
      const slipId = `mass-slip:${decl.sourceOfferId}:${decl.targetSlot}`;
      const slips = state.economyContracts && state.economyContracts.massScale
        ? state.economyContracts.massScale.slips : null;
      const slip = slips && slips[slipId];
      const slipMass = slip && Number(slip.measuredMassT);
      const mw = player.masslineTelemetry && player.masslineTelemetry.massWeighing;
      const mwMass = mw && mw.slipId === slipId && mw.targetId === body.id
        ? Number(mw.measuredMassT) : NaN;
      if (Number.isFinite(slipMass) && slipMass > 0) mass = slipMass;
      else if (Number.isFinite(mwMass) && mwMass > 0) mass = mwMass;
    }
    tetherModel = { state: 'Payload', mass: mass != null && mass > 0 ? Math.round(mass) : null, strain: ml.load };
  }
  return {
    hull: finite(p.hull), hullMax: finite(p.hullMax, 1),
    shield: finite(p.shield), shieldMax: finite(p.shieldMax, 0),
    armor: finite(p.armorHp), armorMax: finite(p.armorMax, 0),
    energy: finite(p.cap), energyMax: finite(p.capMax, 0),
    heat: finite(heat && heat.frac),
    speed, speedRef: finite(p.maxSpeed, 180), speedMax: finite(speedMax),
    boost: p.boost && p.boost.max > 0 ? Math.max(0, Math.min(1, p.boost.energy / p.boost.max)) : 0,
    boosting: !!(p.flags && p.flags.boosting),
    // burning, not recovering: the dial's DRIVE tag and halo belong to a spooling or engaged drive only
    driveActive: !!(drive && (drive.state === 'spooling' || drive.state === 'engaged')),
    drift,
    ordnance: ordnance || readOrdnanceModel(state, tracker, bindings),
    tether: tetherModel,
  };
}

const HOST_CSS = `
#hud .orr-hud-cluster { position:absolute; left:18px; bottom:24px; z-index:5; pointer-events:none; }
#hud .orr-hud-cluster .orr-cluster { --orr-cluster-scale:.85; }
@media (max-width:1700px) { #hud .orr-hud-cluster .orr-cluster { --orr-cluster-scale:.7; } }
@media (max-width:1400px) { #hud .orr-hud-cluster { left:8px; } }
@media (max-width:1300px) { #hud .orr-hud-cluster .orr-cluster { --orr-cluster-scale:.6; } }
`;

/**
 * Mount the ORRERY Cluster into the live HUD root. Returns { update(state, p, slow), dispose }.
 * `slow` gates the ordnance read (it scans charges) to the HUD's slow clock; everything else is
 * guarded by the Cluster's own change detection, so a settled frame writes nothing.
 */
export function mountOrreryCluster(root, state, { bus = null } = {}) {
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
  const defName = (def && def.name) || 'Hull';
  const classLine = `${def && def.role ? def.role : 'hull'} · tier ${def && Number.isFinite(def.tier) ? def.tier : 0}`;
  const customName = customNameForActiveHull(state);
  const host = document.createElement('div');
  host.className = 'orr-hud-cluster';
  const cluster = createFlightCluster({
    shipId: defId,
    name: customName || defName,
    classLine,
    groups: buildOrdnanceGroups(readClusterBindings(state)),
    // before anything is engaged the Hand rests on the Line: the game's signature verb
    restSlot: String(REST_SLOT_INDEX),
  });
  host.appendChild(cluster.el);
  root.appendChild(host);
  root.dataset.hud = 'orrery';
  const removeSkin = applyOrreryHudSkin(document);
  cluster.arrive();
  const tracker = createCooldownTracker();
  const weaponHeatScratch = {};
  let ordnance = null;
  let ceiling = null;
  const syncLegend = (liveState = state, livePlayer = liveState?.entities?.get?.(liveState.playerId)) => {
    cluster.setRingLegend(readActiveHullLegend(liveState, livePlayer));
  };
  // The cluster bakes the hull poster at create; a hull swap after mount (shipworks "Make active",
  // a save whose active hull differs) must restamp it or the HUD names the wrong ship all session.
  let syncedHullId = defId;
  const syncHull = (liveState = state, livePlayer = liveState?.entities?.get?.(liveState.playerId)) => {
    const liveDefId = (livePlayer && livePlayer.data && (livePlayer.data.defId || livePlayer.data.shipId)) || 'ship_kestrel';
    if (liveDefId === syncedHullId) return;
    syncedHullId = liveDefId;
    const liveDef = SHIP_BY_ID.get(liveDefId);
    cluster.setHull({
      shipId: liveDefId,
      name: customNameForActiveHull(liveState) || (liveDef && liveDef.name) || 'Hull',
      classLine: `${liveDef && liveDef.role ? liveDef.role : 'hull'} · tier ${liveDef && Number.isFinite(liveDef.tier) ? liveDef.tier : 0}`,
    });
  };
  let offName = null;
  if (bus && typeof bus.on === 'function' && typeof cluster.setRingLegend === 'function') {
    offName = bus.on('ship:nameChanged', (payload = {}) => {
      const active = activeHullIndex(state);
      if (payload.shipIndex != null && Number(payload.shipIndex) !== active) return;
      syncLegend();
    });
  }
  return {
    host,
    update(liveState, p, slow) {
      if (slow && typeof cluster.setRingLegend === 'function') syncLegend(liveState, p);
      if (slow && typeof cluster.setHull === 'function') syncHull(liveState, p);
      if (!p) return;
      if (slow || !ordnance) ordnance = readOrdnanceModel(liveState, tracker);
      if (slow || ceiling == null) ceiling = readSpeedCeiling(liveState, p);
      const model = readClusterModel(liveState, p, { ordnance, speedMax: ceiling, weaponHeatScratch });
      if (model) cluster.update(model);
    },
    dispose() {
      if (typeof offName === 'function') { try { offName(); } catch (_) {} }
      cluster.dispose();
      host.remove();
      removeSkin();
      if (root.dataset.hud === 'orrery') delete root.dataset.hud;
    },
  };
}

export function readActiveHullLegend(state, player = state?.entities?.get?.(state.playerId)) {
  const def = SHIP_BY_ID.get(player?.data?.defId || player?.data?.shipId);
  return { defName: def?.name || 'Hull',
    classLine: `${def?.role || 'hull'} · tier ${Number.isFinite(def?.tier) ? def.tier : 0}`,
    customName: customNameForActiveHull(state) };
}

function activeHullIndex(state) {
  const player = state && state.player;
  const index = Number(player && player.activeShipIndex);
  return Number.isFinite(index) ? index : 0;
}

function customNameForActiveHull(state) {
  const player = state && state.player;
  const owned = player && Array.isArray(player.ownedShips) ? player.ownedShips[activeHullIndex(state)] : null;
  return owned && typeof owned.name === 'string' ? owned.name.trim() : '';
}
