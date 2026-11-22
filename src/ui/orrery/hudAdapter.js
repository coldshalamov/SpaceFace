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
import { BOMB_SLOT_INDEX, FLIGHT_POWER_COPY, readRailModel, RAIL_SLOTS, SUPPORT_SLOTS, railSlotTip, resolveSlotKeys, resolveSlotLabels, slotDescription } from '../powerRail.js';
import { createArsenalPresentation, readArsenalBindings } from '../../data/arsenalPresentation.js';
import { masslineInstrumentReadout } from '../hudAttention.js';
import { isAdventureFlight } from '../attentionGlass.js';
import { isSwarmGlass } from '../swarmGlass.js';
import { loadCrucibleMeta } from '../../systems/survivalRecords.js';
import { massDeclarationForTarget, physicalMassT } from '../../systems/cargoCustody.js';
import { SHIPS } from '../../data/ships.js';
import { targetDisplayName } from '../targetPanel.js';
import { couplingBodyMass, resolveMassInterpretation } from '../masslineHud.js';
import { resolveGovernedCombatSpeed, resolvePropulsionProfile } from '../../core/flight/propulsionCatalog.js';
import { resolveTravelCeiling } from '../../core/flight/propulsionKernel.js';
import { swarmRailSlotAllowed } from '../../data/swarmControls.js';
import { runPerkIds, SWARM_PERK_BY_ID } from '../../data/swarmPerks.js';
import { travelFlag } from '../../data/featureFlags.js';
import { formatBindingCode, MOUSE_ACTION_LABELS, resolveActionCodes, resolveActionLabel } from '../../systems/input.js';
import { heldPower, powerUsesReleasePreview } from '../../systems/powerVerbs.js';
import { injectOrrery } from './tokens.js';
import { createFlightCluster, FLIGHT_CLUSTER_SIZE } from './flightCluster.js';
import { applyOrreryHudSkin } from './hudSkin.js';
import { currentDenial, mountArsenalDenials } from '../arsenalDenials.js';
import { digitIndex, getPromptDeck } from '../promptDeck.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));

/** S12 — the perk chip's glyph per catalog id. An unknown id falls back to `spark`. */
const SWARM_PERK_ICON = Object.freeze({
  scavenger: 'credits',
  overclock: 'boost',
  gambler: 'spark',
  ram_plate: 'hull',
  bounty_hunter: 'target',
  chain_reactor: 'fire',
});
// The six flight powers: one name per power everywhere on the flight HUD.
const GROUP_NAME = Object.freeze({ PULL: 'Pull', SHOVE: 'Shove', PIN: 'Pin', BAY: 'Bomb', RIG: 'Plow', LINE: 'Line', GYRE: 'Gyre', CLOAK: 'Cloak' });
const GROUP_ICON = Object.freeze({ Pull: 'well', Shove: 'repel', Pin: 'seed', Bomb: 'munitions', Plow: 'cone', Line: 'line', Gyre: 'well', Cloak: 'seed' });
// One tint per power: the Cluster colours each key's mark so a glance tells them apart.
const GROUP_POWER = Object.freeze({ PULL: 'pull', SHOVE: 'shove', PIN: 'pin', BAY: 'bomb', RIG: 'plow', LINE: 'line', GYRE: 'gyre', CLOAK: 'cloak' });
// The rail's 24-px glyph names → the 48-px kit icon file names the Cluster masks.
const SLOT_ICON = Object.freeze({ munitions: 'munitions', blast: 'fire', tether: 'line', seed: 'seed', well: 'well', repel: 'repel', cone: 'cone', skim: 'skim', weapon: 'munitions' });
const SLOT_ARSENAL = Object.freeze({ 0: 'power_travel_burn', 1: 'field_well_standard', 2: 'field_repulsor_standard',
  3: 'field_seed_standard', 4: 'power_charge', 5: 'field_cone_standard', 6: 'power_massline', 7: 'power_gyre' });
const PRESENTED_ID = Object.freeze({ 0: 'travel', 1: 'pull', 2: 'shove', 3: 'pin', 4: 'bomb', 5: 'rig', 6: 'line', 7: 'gyre', 8: 'cloak' });
const VERB_TO_SLOT = Object.freeze({
  travel: 0, travelBurn: 0,
  pull: 1, deployWell: 1,
  shove: 2, deployRepulsor: 2,
  pin: 3, deployMassSeed: 3,
  bomb: 4, chargeThrow: 4, dropBomb: 4, swarmBombThrow: 4, chargeDetonate: 4,
  rig: 5, plow: 5, toggleClearingCone: 5, toggleSkimCollector: 5,
  line: 6, tether: 6,
  gyre: 7, gyreSnare: 7,
  cloak: 8,
});

export const POWER_CAPTION_LIMIT = 3;
export const POWER_CAPTION_DURATION_MS = 2500;

/**
 * True during a player's first Swarm run on this profile (zero completed Swarm runs in history).
 * Every power key press in that first Swarm run shows the one-line caption over the power bar.
 */
export function isFirstSwarmRunOnProfile(state, profile = null) {
  const inSwarm = isSwarmGlass(state)
    || !!(state?.run && state.run.kind === 'survival' && state.run.phase && state.run.phase !== 'inactive' && state.run.phase !== 'ended');
  if (!inSwarm) return false;
  if (!profile) return true;
  const history = Array.isArray(profile.history) ? profile.history : [];
  return history.length === 0;
}

/**
 * Consume one press of a flight power key (`1`..`6`) for the first-use caption strip.
 * Shows the power's one-line caption on the first 3 presses per key in a save, and on every
 * press during the first Swarm run on a profile. Returns `{ power, name, text }` or `null`.
 */
export function consumePowerCaption(state, slotIndex, { profile = null } = {}) {
  const copy = FLIGHT_POWER_COPY[slotIndex];
  if (!copy || !state) return null;
  if (isFirstSwarmRunOnProfile(state, profile)) {
    return { power: copy.power, name: copy.name, text: copy.caption };
  }
  const player = state.player;
  if (!player || typeof player !== 'object') return null;
  if (!player.hints || typeof player.hints !== 'object') player.hints = {};
  const key = `powerCaption_${copy.power}`;
  const used = Number(player.hints[key]) || 0;
  if (used >= POWER_CAPTION_LIMIT) return null;
  player.hints[key] = used + 1;
  return { power: copy.power, name: copy.name, text: copy.caption };
}


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

function availableCodes(codes, claimedDigits) {
  const list = Array.isArray(codes) ? codes : (codes ? [codes] : []);
  return claimedDigits?.length ? list.filter(code => !claimedDigits.includes(digitIndex(code) + 1)) : list;
}

function activeLineControlHint(state, claimedDigits) {
  const player = state.player || {};
  const tether = player.tether?.active ? player.tether : player.remoteMassline;
  if (!masslineInstrumentReadout(tether)) return '';
  const label = action => {
    const codes = resolveActionCodes(state, action);
    const available = availableCodes(codes, claimedDigits);
    if (available.length === codes.length) return resolveActionLabel(state, action);
    return available.map(code => formatBindingCode(code)).join('/') || MOUSE_ACTION_LABELS[action] || '';
  };
  const hold = label('tether');
  if (!hold) return '';
  const first = action => formatBindingCode(availableCodes(resolveActionCodes(state, action), claimedDigits)[0]);
  const forward = first('forward'); const reverse = first('reverse');
  const orbit = [first('yawLeft'), first('yawRight')].filter(Boolean).join('/');
  const boost = label('boost');
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
  const claimedDigits = options.claimedDigits;
  const displayBindings = claimedDigits?.length
    ? Object.fromEntries(Object.entries(bindings).map(([action, codes]) => [action, availableCodes(codes, claimedDigits)]))
    : bindings;
  const labels = resolveSlotLabels(displayBindings);
  const keys = resolveSlotKeys(displayBindings);
  const held = options.held !== undefined ? options.held : heldPower(state);
  const firingUntil = options.firingUntil;
  const nowWall = options.nowWall || (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
  const acts = state && state.input && state.input.actions;
  // The presentation reads the same remappable binding table; a caller's override wins per action.
  const presented = presentationFor(state).read(state, {
    rail, nowS, bindings: { ...readArsenalBindings(state), ...displayBindings },
    // the owner's latest refusal ("Too big to take whole"), quoted while it still explains the dead net
    denial: currentDenial(options.denial, Number(state && state.tick)),
  });
  const out = {};
  for (const slot of [...RAIL_SLOTS, ...SUPPORT_SLOTS]) {
    // S5: the Swarm bar is six icons — the five powers and the Line; travel/gyre/cloak stay off it.
    if (!swarmRailSlotAllowed(state, slot.index)) continue;
    const r = rail[slot.index] || {};
    const pe = presented.entries[PRESENTED_ID[slot.index]];
    const copy = FLIGHT_POWER_COPY[slot.index] || null;
    const st = RAIL_STATE[r.state] || 'ready';
    const isBomb = slot.index === BOMB_SLOT_INDEX;
    const arsenalId = copy
      ? (SLOT_ARSENAL[slot.index] || '')
      : (pe && slot.index === 8 ? pe.glyph : (SLOT_ARSENAL[slot.index] || ''));
    const kbLabel = labels[slot.index] || '';
    const slotKeyLabel = slot.index === 6
      ? (kbLabel && kbLabel !== 'RMB' ? `RMB / ${kbLabel}` : (kbLabel || 'RMB'))
      : (kbLabel || MOUSE_ACTION_LABELS[slot.action] || '');
    const entry = {
      state: st,
      key: slotKeyLabel,
      arsenalId,
    };
    entry.iconOnly = false;
    if (isBomb) entry.consumable = true;
    if (r.live === true) entry.live = true;
    if (st === 'cooldown') {
      entry.cooldown = tracker ? tracker(slot.index, r) ?? 0 : 0;
      const ms = Math.max(0, Number(r.cooldownMs) || 0);
      entry.cooldownSec = ms > 0 ? Math.max(1, Math.ceil(ms / 1000)) : 0;
    }
    const unlockedMap = state?.player?.unlockedPowers;
    const powerLockedOut = !!(copy && unlockedMap && unlockedMap[copy.power] === false);
    if (r.absent === true || r.unowned === true || powerLockedOut) entry.hidden = true;
    if (slot.index === 8) entry.passive = true;

    const canHold = slot.index < 1 || slot.index > 5 || powerUsesReleasePreview(state, slot.action);
    const isHeld = canHold && ((held && VERB_TO_SLOT[held] === slot.index)
      || (slot.index === 1 && acts?.pull?.held === true)
      || (slot.index === 3 && acts?.pin?.held === true)
      || (slot.index === 4 && acts?.bomb?.held === true)
      || (slot.index === 6 && (acts?.massline?.held === true || acts?.massline?.source != null))
      || (slot.index === 7 && acts?.gyreSnare === true));

    const isFiring = slot.index !== 5 && ((firingUntil && firingUntil.has(slot.index) && nowWall < firingUntil.get(slot.index))
      || (slot.index === 1 && (acts?.pull?.pressed === true || acts?.deployWell === true))
      || (slot.index === 2 && (acts?.shove?.pressed === true || acts?.deployRepulsor === true))
      || (slot.index === 3 && (acts?.pin?.pressed === true || acts?.deployMassSeed === true))
      || (slot.index === 4 && (acts?.bomb?.pressed === true || acts?.chargeThrow === true || acts?.dropBomb === true || acts?.swarmBombThrow === true || acts?.chargeDetonate === true))
      || (slot.index === 6 && (acts?.tetherFire === true || acts?.massline?.latch === true))
      || (slot.index === 7 && acts?.gyreSnare === true)
      || (slot.index === 8 && acts?.cloakToggle === true));

    if (isHeld) entry.held = true;
    if (isFiring) entry.firing = true;
    if (r.running === true) entry.running = true;
    if (isHeld || isFiring || r.running === true) entry.active = true;

    if (copy) {
      if (isBomb) {
        const detonate = r.detonate === true || st === 'armed';
        entry.detonate = detonate;
        entry.label = detonate ? 'Detonate' : copy.name;
      } else if (slot.index === 5) {
        const plowRocks = Number(r.plowRocks) > 0 ? Math.floor(Number(r.plowRocks)) : 0;
        entry.active = r.running === true || st === 'armed';
        entry.running = entry.active;
        if (plowRocks > 0) entry.plowCount = plowRocks;
        entry.label = plowRocks > 0 ? 'Launch' : copy.name;
        entry.shortLabel = entry.label;
      } else {
        entry.label = copy.name;
      }
    } else if (pe && slot.index >= 1) {
      entry.label = pe.label;
    }

    if (Number.isFinite(r.stock)) entry.count = r.stock;
    else if (pe && pe.charges && Number.isFinite(pe.charges.count)) entry.count = pe.charges.count;
    else {
      const count = /×(\d+)/.exec(String(r.name || ''));
      if (count) entry.count = Number(count[1]);
    }

    const cleanWhy = (st !== 'ready' && st !== 'armed') ? (r.why || '') : (pe?.denial?.text || '');
    if (copy) {
      const tipKeyLine = slot.index === 6
        ? entry.key
        : (keys[slot.index] || entry.key || '');
      entry.tip = railSlotTip({
        name: entry.label,
        keys: tipKeyLine,
        description: copy.caption,
        why: cleanWhy,
      });
      if (slot.action === 'tether') {
        const hint = activeLineControlHint(state, claimedDigits);
        if (hint) entry.tip += `\n${hint}`;
      }
      entry.briefTip = [entry.key ? `${entry.label} · ${entry.key}` : entry.label, copy.caption].filter(Boolean).join('\n');
    } else {
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
      const title = pe?.label || r.name || slot.name;
      const binding = labels[slot.index] || entry.key;
      const description = pe?.sentence || r.description || slotDescription(slot.index);
      const summary = pe?.denial?.text || (st !== 'ready' && st !== 'armed' ? r.why : '')
        || description.match(/^.*?[.!?](?=\s+[A-Z]|$)/)?.[0] || description;
      entry.briefTip = [binding ? `${title} · ${binding}` : title, summary].filter(Boolean).join('\n');
    }
    if (claimedDigits?.length && !kbLabel && bindings[slot.action]?.length && slot.index !== 6) {
      const notice = 'Use this button while the number key answers the call.';
      entry.key = '—';
      entry.tip += `\n${notice}`;
      entry.briefTip = [entry.label || slot.name, notice].filter(Boolean).join('\n');
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
    // X3 Adventure glass: the beam and strain dial are instruments, the payload's
    // label/tonnage/strain words are telemetry. The Cluster drops only the words.
    quietTelemetry: isAdventureFlight(state),
    ordnance: ordnance || readOrdnanceModel(state, tracker, bindings),
    tether: tetherModel,
  };
}

const HOST_CSS = `
/* Scale the instrument once. Bottom-anchored siblings use the same visual height.
   z-index:14 keeps HUD instrument panels above world markers (#sf-ml2 z-index:6, .sf-lockdiamond z-index:13)
   so the aim/tether white diamond never paints over the power bar or vitals. */
#hud[data-hud="orrery"] .orr-hud-cluster { position:absolute; left:calc(12px + var(--sf-safe-inset-x, 0px)); bottom:24px; z-index:14; pointer-events:none; transform:none; }
#hud[data-hud="orrery"] .orr-hud-cluster.orr-hud-cluster--visor { left:calc(clamp(12px, 1.435vw, 24px) + var(--sf-safe-inset-x, 0px)); bottom:clamp(24px, 4.36vh, 43px); }
#hud { --orr-cluster-scale:.85; --orr-cluster-h:calc(${FLIGHT_CLUSTER_SIZE.height}px * var(--orr-cluster-scale)); }
@media (max-width:1700px), (max-height:850px) { #hud { --orr-cluster-scale:.71; } }
@media (max-width:1100px), (max-height:660px) { #hud { --orr-cluster-scale:.64; } }
@media (max-width:640px) { #hud { --orr-cluster-scale:min(.64, calc((100vw - 24px) / ${FLIGHT_CLUSTER_SIZE.width}px)); } }
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
  const variantId = player?.data?.appearance?.variantId ?? null;
  const def = SHIP_BY_ID.get(defId);
  const defName = (def && def.name) || 'Hull';
  const classLine = `${def && def.role ? def.role : 'hull'} · tier ${def && Number.isFinite(def.tier) ? def.tier : 0}`;
  const customName = customNameForActiveHull(state);
  const host = document.createElement('div');
  host.className = 'orr-hud-cluster';

  const firingUntil = new Map();
  const FLASH_DURATION_MS = 400;
  let lastActiveSig = '';
  // First-use power caption strip: 2.5 s one-shot timer (no rAF loop).
  let activeCaption = null;
  let captionUntilWall = 0;
  let captionTimer = null;
  let cachedProfile = null;
  let cachedProfileRunId = null;
  const prevPressedSlots = new Set();

  const readProfileForRun = (liveState) => {
    const runKey = liveState?.run ? `${liveState.run.kind || ''}:${liveState.run.phase || ''}:${liveState.run.seed || ''}` : 'adventure';
    if (runKey !== cachedProfileRunId) {
      cachedProfileRunId = runKey;
      try { cachedProfile = loadCrucibleMeta(); } catch { cachedProfile = null; }
    }
    return cachedProfile;
  };

  const triggerPowerCaption = (liveState, slotIdx) => {
    const shown = consumePowerCaption(liveState, slotIdx, { profile: readProfileForRun(liveState) });
    if (!shown) return;
    const nowWall = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
    activeCaption = shown;
    captionUntilWall = nowWall + POWER_CAPTION_DURATION_MS;
    if (captionTimer) clearTimeout(captionTimer);
    captionTimer = setTimeout(() => {
      captionTimer = null;
      activeCaption = null;
      captionUntilWall = 0;
      cluster.setPowerCaption?.(null);
    }, POWER_CAPTION_DURATION_MS);
    cluster.setPowerCaption?.(activeCaption);
  };

  const onActivateSocket = ({ id, power, slot }) => {
    const slotIdx = Number(id) || (slot && Number(slot.id)) || 0;
    if (slotIdx >= 1 && slotIdx <= 6) triggerPowerCaption(state, slotIdx);
    const action = slot?.action || power || (slotIdx === 1 ? 'pull' : slotIdx === 2 ? 'shove' : slotIdx === 3 ? 'pin' : slotIdx === 4 ? 'bomb' : slotIdx === 5 ? 'rig' : slotIdx === 6 ? 'tether' : '');
    if (action && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      const codes = resolveActionCodes(state, action);
      const code = codes && codes[0];
      if (code) {
        if (slotIdx > 0 && slotIdx !== 5) {
          const nowWall = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
          firingUntil.set(slotIdx, nowWall + FLASH_DURATION_MS);
        }
        const Ctor = typeof KeyboardEvent === 'function' ? KeyboardEvent
          : (typeof window.KeyboardEvent === 'function' ? window.KeyboardEvent : null);
        const downEvt = Ctor ? new Ctor('keydown', { code, bubbles: true }) : { type: 'keydown', code, bubbles: true };
        window.dispatchEvent(downEvt);
        setTimeout(() => {
          if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            const upEvt = Ctor ? new Ctor('keyup', { code, bubbles: true }) : { type: 'keyup', code, bubbles: true };
            window.dispatchEvent(upEvt);
          }
        }, 120);
      }
    }
  };

  const onOpenMore = () => {
    if (bus && typeof bus.emit === 'function') {
      bus.emit('ui:contextWheelToggle', { source: 'power-bar' });
    }
  };

  const cluster = createFlightCluster({
    shipId: defId,
    variantId,
    name: customName || defName,
    classLine,
    groups: buildOrdnanceGroups(readClusterBindings(state)),
    // before anything is engaged the Hand rests on the Line: the game's signature verb
    restSlot: String(REST_SLOT_INDEX),
    onActivateSocket,
    onOpenMore,
    layout: 'visor',
  });
  cluster.el.setAttribute('data-why-above', '');
  host.appendChild(cluster.el);
  // The visor layout names itself on the host and on #hud (the rules that used :has() to find it
  // made every HUD text write re-check them).
  host.classList.add('orr-hud-cluster--visor');
  root.appendChild(host);
  root.dataset.hud = 'orrery';
  root.dataset.hudCluster = 'visor';
  const removeSkin = applyOrreryHudSkin(document);
  cluster.arrive();
  const tracker = createCooldownTracker();
  const weaponHeatScratch = {};
  let ordnance = null;
  let lastClaimedDigits = null;
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
  let syncedVariantId = variantId;
  const syncHull = (liveState = state, livePlayer = liveState?.entities?.get?.(liveState.playerId)) => {
    const liveDefId = (livePlayer && livePlayer.data && (livePlayer.data.defId || livePlayer.data.shipId)) || 'ship_kestrel';
    const liveVariantId = livePlayer?.data?.appearance?.variantId ?? null;
    if (liveDefId === syncedHullId && liveVariantId === syncedVariantId) return;
    syncedHullId = liveDefId;
    syncedVariantId = liveVariantId;
    const liveDef = SHIP_BY_ID.get(liveDefId);
    cluster.setHull({
      shipId: liveDefId,
      variantId: liveVariantId,
      name: customNameForActiveHull(liveState) || (liveDef && liveDef.name) || 'Hull',
      classLine: `${liveDef && liveDef.role ? liveDef.role : 'hull'} · tier ${liveDef && Number.isFinite(liveDef.tier) ? liveDef.tier : 0}`,
    });
  };
  // S12 — the run's perk pick rides the cluster model; a fired trigger bumps that chip's pulse.
  const perkPulseCounts = {};
  let offPerkTrigger = null;
  // HUD-2 Item 5 — live ship-panel status: directional hull-hit flashes (0.65 s decay) and weapon fire flash.
  const HIT_FLASH_MS = 650;
  const WEAPON_FLASH_MS = 220;
  const hitUntilWall = { bow: 0, starboard: 0, port: 0, stern: 0 };
  const weaponFireUntil = new Map();
  let offShipDmg = null;
  let offShipImpact = null;
  let offShipFire = null;
  const nowWallMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
  const recordHitFromPos = (liveState, srcPos) => {
    const me = liveState?.entities?.get?.(liveState.playerId);
    const until = nowWallMs() + HIT_FLASH_MS;
    if (!me?.pos || !srcPos || !Number.isFinite(srcPos.x) || !Number.isFinite(srcPos.z)) {
      hitUntilWall.bow = Math.max(hitUntilWall.bow, until);
      return;
    }
    const dx = srcPos.x - me.pos.x;
    const dz = srcPos.z - me.pos.z;
    if (dx * dx + dz * dz < 1e-4) {
      hitUntilWall.bow = Math.max(hitUntilWall.bow, until);
      return;
    }
    const rot = Number.isFinite(me.rot) ? me.rot : 0;
    let rel = Math.atan2(dz, dx) - rot;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel <= -Math.PI) rel += Math.PI * 2;
    const deg = rel * 180 / Math.PI;
    const side = Math.abs(deg) <= 45 ? 'bow' : Math.abs(deg) >= 135 ? 'stern' : (deg > 0 ? 'starboard' : 'port');
    hitUntilWall[side] = Math.max(hitUntilWall[side], until);
  };
  if (bus && typeof bus.on === 'function') {
    offPerkTrigger = bus.on('swarm:perkTrigger', (p) => {
      const id = p && p.perkId;
      if (typeof id === 'string' && id) perkPulseCounts[id] = (perkPulseCounts[id] || 0) + 1;
    });
    offShipDmg = bus.on('combat:damage', (ev) => {
      if (!ev) return;
      if (ev.targetId !== state.playerId && ev.isPlayer !== true) return;
      const attacker = ev.attackerId != null ? state.entities?.get?.(ev.attackerId) : null;
      recordHitFromPos(state, attacker?.pos || ev.sourcePos || ev.pos);
    });
    offShipImpact = bus.on('physics:impact', (ev) => {
      if (!ev) return;
      const pid = state.playerId;
      if (ev.entityId !== pid && ev.aId !== pid && ev.bId !== pid) return;
      const otherId = ev.aId === pid ? ev.bId : (ev.bId === pid ? ev.aId : ev.otherId);
      const other = otherId != null ? state.entities?.get?.(otherId) : null;
      recordHitFromPos(state, other?.pos || ev.pos);
    });
    offShipFire = bus.on('combat:fire', (ev) => {
      if (!ev || ev.ownerId !== state.playerId) return;
      const key = ev.slotIndex != null ? ev.slotIndex : (ev.weaponIndex != null ? ev.weaponIndex : 0);
      weaponFireUntil.set(key, nowWallMs() + WEAPON_FLASH_MS);
    });
  }
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
      const acts = liveState && liveState.input && liveState.input.actions;
      const held = heldPower(liveState);
      const nowWall = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

      let firingEdge = false;
      const nowPressed = new Set();
      if (acts) {
        if (acts.pull?.pressed || acts.deployWell) { firingUntil.set(1, nowWall + FLASH_DURATION_MS); firingEdge = true; nowPressed.add(1); }
        if (acts.shove?.pressed || acts.deployRepulsor) { firingUntil.set(2, nowWall + FLASH_DURATION_MS); firingEdge = true; nowPressed.add(2); }
        if (acts.pin?.pressed || acts.deployMassSeed) { firingUntil.set(3, nowWall + FLASH_DURATION_MS); firingEdge = true; nowPressed.add(3); }
        if (acts.bomb?.pressed || acts.chargeThrow || acts.dropBomb || acts.swarmBombThrow || acts.chargeDetonate) { firingUntil.set(4, nowWall + FLASH_DURATION_MS); firingEdge = true; nowPressed.add(4); }
        if (acts.rig?.pressed || acts.toggleClearingCone || acts.toggleSkimCollector) { firingUntil.set(5, nowWall + FLASH_DURATION_MS); firingEdge = true; nowPressed.add(5); }
        if (acts.tetherFire || acts.massline?.latch) { firingUntil.set(6, nowWall + FLASH_DURATION_MS); firingEdge = true; nowPressed.add(6); }
        if (acts.gyreSnare) { firingUntil.set(7, nowWall + FLASH_DURATION_MS); firingEdge = true; }
        if (acts.cloakToggle) { firingUntil.set(8, nowWall + FLASH_DURATION_MS); firingEdge = true; }
      }
      for (const slotIdx of nowPressed) {
        if (!prevPressedSlots.has(slotIdx)) triggerPowerCaption(liveState, slotIdx);
      }
      prevPressedSlots.clear();
      for (const slotIdx of nowPressed) prevPressedSlots.add(slotIdx);

      if (activeCaption && nowWall >= captionUntilWall) {
        activeCaption = null;
        captionUntilWall = 0;
      }

      let firingExpired = false;
      for (const [idx, until] of firingUntil.entries()) {
        if (nowWall >= until) {
          firingUntil.delete(idx);
          firingExpired = true;
        }
      }

      const activeSig = `${held || ''}|${Array.from(firingUntil.keys()).sort().join(',')}`;
      const activeChanged = activeSig !== lastActiveSig;
      lastActiveSig = activeSig;
      const claimedDigits = getPromptDeck()?.claimedDigits ?? null;

      if (slow || !ordnance || activeChanged || firingEdge || firingExpired || firingUntil.size > 0 || held != null
        || claimedDigits !== lastClaimedDigits) {
        ordnance = readOrdnanceModel(liveState, tracker, undefined, { denial: lastDenial, firingUntil, held, nowWall, claimedDigits });
        lastClaimedDigits = claimedDigits;
      }
      if (slow || ceiling == null) ceiling = readSpeedCeiling(liveState, p);
      const model = readClusterModel(liveState, p, { ordnance, speedMax: ceiling, weaponHeatScratch });
      if (model) {
        model.perks = runPerkIds(liveState && liveState.run).map((id) => ({
          id,
          name: (SWARM_PERK_BY_ID[id] && SWARM_PERK_BY_ID[id].name) || id,
          icon: SWARM_PERK_ICON[id] || 'spark',
        }));
        model.perkPulses = perkPulseCounts;
        model.moreKey = resolveActionLabel(liveState, 'contextWheel') || 'Q';
        model.powerCaption = liveState?._uiBenchPowerCaption || activeCaption;
        // HUD-2 Item 5: live ship-panel status (directional hull hits, hardpoint pips, held Line tag).
        const benchShip = liveState?._uiBenchShipStatus || null;
        const hits = benchShip?.hits || {
          bow: hitUntilWall.bow > nowWall ? (hitUntilWall.bow - nowWall) / HIT_FLASH_MS : 0,
          starboard: hitUntilWall.starboard > nowWall ? (hitUntilWall.starboard - nowWall) / HIT_FLASH_MS : 0,
          port: hitUntilWall.port > nowWall ? (hitUntilWall.port - nowWall) / HIT_FLASH_MS : 0,
          stern: hitUntilWall.stern > nowWall ? (hitUntilWall.stern - nowWall) / HIT_FLASH_MS : 0,
        };
        const weapons = Array.isArray(p.data?.weapons) ? p.data.weapons : [];
        const hardpoints = benchShip?.hardpoints || weapons.slice(0, 4).map((w, idx) => {
          const heatMax = Number(w?.heatMax) || 100;
          const heatFrac = Number.isFinite(w?._heat) && heatMax > 0 ? w._heat / heatMax : 0;
          const slotKey = w?.slotIndex != null ? w.slotIndex : idx;
          const firing = !!(w?._firing || (weaponFireUntil.get(slotKey) > nowWall) || (weaponFireUntil.get(idx) > nowWall));
          const hot = !!(w?._overheated || w?._venting || heatFrac >= 0.8);
          return { firing, hot };
        });
        let lineTag = benchShip?.lineTag || '';
        if (!lineTag && model.tether && model.tether.state && model.tether.state !== 'Idle') {
          const local = liveState.player?.tether;
          const activeLine = local && local.active ? local : liveState.player?.remoteMassline;
          const ledger = liveState.combat?.attachments?.byId;
          const att = activeLine?.attachmentId != null && ledger ? ledger[String(activeLine.attachmentId)] : null;
          const bodyId = att?.targetId != null ? att.targetId : (activeLine?.targetId ?? activeLine?.payloadId);
          const body = bodyId != null ? liveState.entities?.get?.(bodyId) : null;
          const rawName = body
            ? (body.type === 'asteroid' ? 'Rock' : (targetDisplayName(body, { state: liveState }) || 'Payload'))
            : 'Payload';
          const shortName = rawName.length > 14 ? `${rawName.slice(0, 13).trim()}…` : rawName;
          const interp = body ? resolveMassInterpretation(couplingBodyMass(p), couplingBodyMass(body)) : null;
          const band = interp?.key === 'likely-payload' ? 'Light'
            : interp?.key === 'likely-anchor' ? 'Heavy'
            : interp?.key === 'comparable' ? 'Even' : '';
          lineTag = band ? `${shortName} · ${band}` : shortName;
        }
        model.shipStatus = { hits, hardpoints, lineTag };
        cluster.update(model);
      }
    },
    // HUD-FRAME-BREADTH: the scheduler job calls exactly the reads the old `slow` flag armed —
    // ring legend, hull, ordnance scan and the speed ceiling — so update(false) can run every
    // frame without doing them twice.
    updateSlow(liveState, p) {
      if (typeof cluster.setRingLegend === 'function') syncLegend(liveState, p);
      if (typeof cluster.setHull === 'function') syncHull(liveState, p);
      if (!p) return;
      const held = heldPower(liveState);
      const nowWall = typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now() : Date.now();
      const claimedDigits = getPromptDeck()?.claimedDigits ?? null;
      ordnance = readOrdnanceModel(liveState, tracker, undefined,
        { denial: lastDenial, firingUntil, held, nowWall, claimedDigits });
      lastClaimedDigits = claimedDigits;
      ceiling = readSpeedCeiling(liveState, p);
    },
    dispose() {
      if (captionTimer) { clearTimeout(captionTimer); captionTimer = null; }
      if (typeof offName === 'function') { try { offName(); } catch (_) {} }
      if (typeof offPerkTrigger === 'function') { try { offPerkTrigger(); } catch (_) {} }
      if (typeof offShipDmg === 'function') { try { offShipDmg(); } catch (_) {} }
      if (typeof offShipImpact === 'function') { try { offShipImpact(); } catch (_) {} }
      if (typeof offShipFire === 'function') { try { offShipFire(); } catch (_) {} }
      try { offDenials(); } catch (_) {}
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('resize', markClusterBoxStale);
      }
      cluster.dispose();
      host.remove();
      removeSkin();
      if (root.dataset.hud === 'orrery') delete root.dataset.hud;
      delete root.dataset.hudCluster;
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
