// ORRERY ↔ the live flight HUD (design/frontend/ORRERY.md §7 Phase 1).
//
// hud.js owns targeting, the roster scan and prompts. This adapter reads the authoritative
// instrument sources and hands the sole flight Cluster one plain model. Nothing here owns game state.
//
// Sources (each is the one the old HUD reads, so both always agree):
//   hull/shield/armour  p.hull/hullMax · p.shield/shieldMax · p.armorHp/armorMax
//   energy              p.cap/capMax                      (the live HUD reads cap, not energy)
//   heat                weaponHeatSummary(p.data.weapons)
//   speed / reference   |p.vel| · governed combat speed (legacy maxSpeed only when the hull has no drive)
//   speed ceiling       state.input.travelDrive.ceiling, else resolveTravelCeiling(profile) — the V-MAX the
//                       travel tape already prints, so the Speed Dial's last blade is the same number
//   boost               p.boost.energy / p.boost.max · p.flags.boosting (the afterburner is burning)
//   drift               atan2(vel) − p.rot                 (same frame as playerDefeat.impactDirection)
//   ordnance            readRailModel(state, simTime)     (slots 1..9, states ready/armed/cooling/…)
//   tether              masslineInstrumentReadout(tether) + the attached body's mass — for a
//                       declared manifest, only the measurement the loaded rope earned
import { weaponHeatSummary } from '../weaponHeat.js';
import { BOMB_SLOT_INDEX, readRailModel, RAIL_SLOTS, SUPPORT_SLOTS, railSlotTip, resolveSlotKeys, resolveSlotLabels, slotDescription } from '../powerRail.js';
import { createArsenalPresentation, readArsenalBindings } from '../../data/arsenalPresentation.js';
import { masslineInstrumentReadout } from '../hudAttention.js';
import { massDeclarationForTarget, physicalMassT } from '../../systems/cargoCustody.js';
import { SHIPS } from '../../data/ships.js';
import { resolveGovernedCombatSpeed, resolvePropulsionProfile } from '../../core/flight/propulsionCatalog.js';
import { resolveTravelCeiling } from '../../core/flight/propulsionKernel.js';
import { travelFlag } from '../../data/featureFlags.js';
import { formatBindingCode, resolveActionCodes, resolveActionLabel } from '../../systems/input.js';
import { injectOrrery } from './tokens.js';
import { createFlightCluster } from './flightCluster.js';
import { applyOrreryHudSkin } from './hudSkin.js';
import { currentDenial, mountArsenalDenials } from '../arsenalDenials.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
// The five powers (owner 2026-10-22): each power is its own band, so each prints by name.
const GROUP_NAME = Object.freeze({ PULL: 'Pull', SHOVE: 'Shove', PIN: 'Pin', BAY: 'Bomb', RIG: 'Rig', LINE: 'Line', GYRE: 'Gyre', CLOAK: 'Cloak' });
const GROUP_ICON = Object.freeze({ Pull: 'well', Shove: 'repel', Pin: 'seed', Bomb: 'munitions', Rig: 'cone', Line: 'line', Gyre: 'well', Cloak: 'seed' });
// One tint per power (design/expansion/05_ASSET_ROSTER.md §7.2): the Cluster colours each key's
// mark so a glance tells the five apart. Armed/live states still override the tint.
const GROUP_POWER = Object.freeze({ PULL: 'pull', SHOVE: 'shove', PIN: 'pin', BAY: 'bomb', RIG: 'rig', LINE: 'line', GYRE: 'gyre', CLOAK: 'cloak' });
// The rail's 24-px glyph names → the 48-px kit icon file names the Cluster masks.
const SLOT_ICON = Object.freeze({ munitions: 'munitions', blast: 'fire', tether: 'line', seed: 'seed', well: 'well', repel: 'repel', cone: 'cone', skim: 'skim', weapon: 'munitions' });
const SLOT_ARSENAL = Object.freeze({ 0: 'power_travel_burn', 1: 'field_well_standard', 2: 'field_repulsor_standard',
  3: 'field_seed_standard', 5: 'field_cone_standard', 6: 'power_massline', 7: 'power_gyre' });
const PRESENTED_ID = Object.freeze({ 0: 'travel', 1: 'pull', 2: 'shove', 3: 'pin', 4: 'bomb', 5: 'rig', 6: 'line', 7: 'gyre', 8: 'cloak' });

/** The rail's slots grouped by band, each with a stable id (its rail index) and its live key label. */
export function buildOrdnanceGroups(bindings) {
  const labels = resolveSlotLabels(bindings);
  const keys = resolveSlotKeys(bindings);
  const groups = [];
  const byName = new Map();
  for (const slot of [...RAIL_SLOTS, ...SUPPORT_SLOTS]) {
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
  for (const slot of [...RAIL_SLOTS, ...SUPPORT_SLOTS]) if (slot.action) bindings[slot.action] = resolveActionCodes(state, slot.action);
  return bindings;
}

// One presentation reader per game state: its static part (text, glyphs, key labels) is cached on the
// fitting / mode / binding signature, so the slow HUD clock only recomputes readiness.
const PRESENTATION = new WeakMap();
function presentationFor(state) {
  let reader = PRESENTATION.get(state);
  if (!reader) { reader = createArsenalPresentation(); PRESENTATION.set(state, reader); }
  return reader;
}

/** The words under a socket: what it does now, its most relevant limit, and any hint (cycle key, denial). */
function presentedDescription(pe) {
  return [pe.sentence, pe.limits[0], ...(pe.hints || [])].filter(Boolean).join(' ');
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

export function readOrdnanceModel(state, tracker, bindings, options = {}) {
  const nowS = Number(state && state.simTime) || 0;
  const rail = readRailModel(state, nowS);
  bindings ??= readClusterBindings(state);
  const labels = resolveSlotLabels(bindings);
  const keys = resolveSlotKeys(bindings);
  // The presentation reads the same remappable binding table; a caller's override wins per action.
  const presented = presentationFor(state).read(state, {
    rail, nowS, bindings: { ...readArsenalBindings(state), ...bindings },
    // the owner's latest refusal ("Too big to take whole"), quoted while it still explains the dead net
    denial: currentDenial(options.denial, Number(state && state.tick)),
  });
  const out = {};
  for (const slot of [...RAIL_SLOTS, ...SUPPORT_SLOTS]) {
    const r = rail[slot.index] || {};
    const pe = presented.entries[PRESENTED_ID[slot.index]];
    const st = RAIL_STATE[r.state] || 'ready';
    const isBomb = slot.index === BOMB_SLOT_INDEX;
    // Which mark the socket draws: the effective function's own authored glyph (the bomb it will throw,
    // the rig it will toggle, the cloak module fitted), never a fixed per-socket symbol.
    const arsenalId = pe && (isBomb || slot.index === 5 || slot.index === 8) ? pe.glyph : (SLOT_ARSENAL[slot.index] || '');
    const entry = { state: st, key: labels[slot.index] || '', arsenalId };
    if (isBomb) entry.consumable = true;
    // SWARM-03: the rail's tactical-live flag rides beside the state so the Cluster can
    // breathe a key whose verb is real right now (latch in reach, ordnance armed, pack
    // inside the well) — a cue, not a new surface.
    if (r.live === true) entry.live = true;
    if (st === 'cooldown') entry.cooldown = tracker ? tracker(slot.index, r) ?? 0 : 0;
    if (r.absent === true) entry.hidden = true;
    if (slot.index === 8) entry.passive = true;
    // The socket's own words: the EFFECTIVE verb ("Rig · Scoop", "Line · Haul"), not the band
    // name — a bare "LINE" reads as jargon next to its key (owner 2026-10-28).
    if (pe && slot.index >= 1) entry.label = pe.label;
    if (pe && pe.charges && Number.isFinite(pe.charges.count)) entry.count = pe.charges.count;
    else {
      const count = /×(\d+)/.exec(String(r.name || ''));
      if (count) entry.count = Number(count[1]);
    }
    // The tier-2 reveal phrase for this verb: what the next press does, its limit, the live keys, the
    // live state. Composed here (not in the Cluster) so every surface explains a verb in the same words.
    entry.tip = pe && slot.index !== 0
      ? railSlotTip({
        name: pe.label, keys: keys[slot.index] || labels[slot.index] || '',
        description: presentedDescription(pe),
        why: [r.why, pe.denial && pe.denial.text].filter(Boolean).join(' — '),
      })
      : railSlotTip({
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

/** True when the hull published a drive. Live ships stamp propulsion, not driveId. */
function hullHasAuthoredDrive(p) {
  if (!p) return false;
  if (p.driveId || (p.data && p.data.driveId)) return true;
  const derived = p.data && p.data.derived;
  if (derived && (derived.driveId || derived.propulsion)) return true;
  if (p.propulsion) return true;
  if (p.flightModel && p.flightModel.propulsion) return true;
  return false;
}

/** The dial's Ref mark is the speed the governor holds, not the legacy derived top speed. */
function clusterSpeedRef(p, state) {
  const governed = hullHasAuthoredDrive(p) ? resolveGovernedCombatSpeed(p, state) : 0;
  return governed > 0 ? governed : (p && p.maxSpeed);
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
    speed, speedRef: finite(clusterSpeedRef(p, state), 180), speedMax: finite(speedMax),
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
/* Mirror of the cluster's scaled visual height (540px artboard × --orr-cluster-scale)
   as an #hud-level var so bottom-anchored siblings (the drive tape) can clear it. */
#hud { --orr-cluster-h: calc(540px * .85); }
@media (max-width:1700px) { #hud .orr-hud-cluster .orr-cluster { --orr-cluster-scale:.7; }
  #hud { --orr-cluster-h: calc(540px * .7); } }
@media (max-width:1400px) { #hud .orr-hud-cluster { left:8px; } }
@media (max-width:1300px) { #hud .orr-hud-cluster .orr-cluster { --orr-cluster-scale:.6; }
  #hud { --orr-cluster-h: calc(540px * .6); } }
`;

/** Pure: is a projected point over (or within `pad` px of) a measured instrument box? The
 *  crescent's floating labels read over open field, so "over the cluster" is what decides the
 *  under-ship dim (D240) — exported for the focused test. */
export function shipUnderInstrumentBox(screenPt, box, pad = 0) {
  if (!screenPt || !box || screenPt.onScreen === false) return false;
  return screenPt.x >= box.left - pad && screenPt.x <= box.right + pad
    && screenPt.y >= box.top - pad && screenPt.y <= box.bottom + pad;
}

/**
 * Mount the ORRERY Cluster into the live HUD root. Returns { update(state, p, slow), dispose }.
 * `slow` gates the ordnance read (it scans charges) to the HUD's slow clock; everything else is
 * guarded by the Cluster's own change detection, so a settled frame writes nothing.
 */
export function mountOrreryCluster(root, state, { bus = null, helpers = null } = {}) {
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
  // Refusals the matter tools publish reach the pilot as a toast and as the Gyre/Pull tip's last line.
  let lastDenial = null;
  const offDenials = mountArsenalDenials(bus, { onDenial: (record) => { lastDenial = record; } });
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
  // D240 — the crescent's keytags/payload/next line are floating text over open field: when the
  // player's hull projects beneath the instrument they ghost back instead of striking the ship.
  // The zone is the cluster's own scaled box, re-measured only when the layout step can have moved
  // it (resize); the per-frame cost is the one worldToScreen reuse below plus a class toggle that
  // only writes on change.
  const _shipWorld = { x: 0, y: 0, z: 0 };
  const _shipScreen = { x: 0, y: 0, onScreen: false };
  const SHIP_UNDER_PAD = 26; // ~half the player sprite plus a small berth
  let clusterBox = null;
  let clusterBoxStale = true;
  let shipUnder = null;
  const markClusterBoxStale = () => { clusterBoxStale = true; };
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('resize', markClusterBoxStale);
  }
  const syncShipUnder = (p) => {
    const w2s = helpers && helpers.worldToScreen;
    let under = false;
    if (w2s && p && p.pos && cluster.el && typeof cluster.el.getBoundingClientRect === 'function') {
      if (clusterBoxStale) {
        clusterBoxStale = false;
        const b = cluster.el.getBoundingClientRect();
        clusterBox = b && b.width > 0 && b.height > 0 ? b : null;
      }
      if (clusterBox) {
        _shipWorld.x = p.pos.x; _shipWorld.z = p.pos.z;
        under = shipUnderInstrumentBox(w2s(_shipWorld, _shipScreen), clusterBox, SHIP_UNDER_PAD);
      }
    }
    if (under !== shipUnder) {
      shipUnder = under;
      if (cluster.el && cluster.el.classList) cluster.el.classList.toggle('is-ship-under', under);
    }
  };
  return {
    host,
    update(liveState, p, slow) {
      if (slow && typeof cluster.setRingLegend === 'function') syncLegend(liveState, p);
      if (slow && typeof cluster.setHull === 'function') syncHull(liveState, p);
      if (!p) { syncShipUnder(null); return; }
      syncShipUnder(p);
      if (slow || !ordnance) ordnance = readOrdnanceModel(liveState, tracker, undefined, { denial: lastDenial });
      if (slow || ceiling == null) ceiling = readSpeedCeiling(liveState, p);
      const model = readClusterModel(liveState, p, { ordnance, speedMax: ceiling, weaponHeatScratch });
      if (model) cluster.update(model);
    },
    dispose() {
      if (typeof offName === 'function') { try { offName(); } catch (_) {} }
      try { offDenials(); } catch (_) {}
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('resize', markClusterBoxStale);
      }
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
