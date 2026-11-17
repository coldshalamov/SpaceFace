// Ship-first Swarm presentation. Hulls and equipment presets are different choices;
// this adapter keeps their identities separate without changing launch or unlock rules.
import { SHIPS } from '../../data/ships.js';
import { WEAPONS } from '../../data/weapons.js';
import { MODULES } from '../../data/modules.js';
import { COMBAT_LAB_STARTER_PACKAGES } from '../../data/combatLabSetups.js';
import { DOOR_PUBLIC_STARTERS } from '../../data/survivalUnlocks.js';
import { SAUCER_ID, SAUCER_WEAPON_SLOTS } from '../../data/saucer.js';
import { SWARM_THREAT_BY_ID, swarmThreatPurseMult } from '../../data/swarmThreats.js';
import { swarmStakeFor } from '../../data/swarmStakes.js';
import { swarmCheckpointPurseFor, swarmZoneIndexFor } from '../../data/swarmLadder.js';
import { purseBonusFor } from '../../data/swarmHangar.js';
import { buildSlotList } from '../../systems/ships.js';
import { applyWeaponsColdLoadout, compileChallenge } from '../../systems/survivalMutators.js';

const ships = new Map(SHIPS.map(ship => [ship.id, ship]));
const presets = new Map(COMBAT_LAB_STARTER_PACKAGES.map(kit => [kit.id, kit]));
const equipment = new Map([...WEAPONS, ...MODULES].map(def => [def.id, def]));
const publicKits = new Set(DOOR_PUBLIC_STARTERS);

const ROLE_LABELS = Object.freeze({
  starter: 'Light utility ship', fighter: 'Fighter', mining: 'Mining ship',
  freighter: 'Freighter', multirole: 'Multirole ship', frigate: 'Frigate',
  capital: 'Capital ship', scout: 'Scout', tug: 'Tug', alien: 'Alien ship',
  interceptor: 'Interceptor', mining_barge: 'Mining barge', corvette: 'Corvette',
  heavy_hauler: 'Heavy freighter', explorer: 'Explorer', gunship: 'Gunship',
  battlecruiser: 'Battlecruiser', flagship: 'Flagship', exotic: 'Alien ship',
});

// The ids remain the existing launch ids. A kit name describes its equipment;
// the hull name is shown separately and never disguised as another ship.
const KIT_LABELS = Object.freeze({
  energy_baseline: 'Pulse laser', kinetic_baseline: 'Autocannon',
  physics_toolkit: 'Gravity weapons', mirror_demonstrator: 'Reflector',
  storm_carom_forge: 'Storm carom',
});
const KIT_DESCRIPTIONS = Object.freeze({
  web_weaver: 'Bind enemies together, then push them into obstacles with a concussion cannon and repulsion trap.',
  ricochet_runner: 'Bounce bullets around cover. A concussion cannon and repulsion trap push enemies away.',
  energy_baseline: 'A single forward pulse laser. A simple starting fit with room for more equipment.',
  veil_step: 'Replace normal boost with a short teleport. Hold Boost to choose a position, then release to jump.',
  boomerang_bomb_run: 'Lock an enemy and use Bomb to make an attack run, release a bomb, and return to your starting position.',
  pinball_rush: 'Hold Boost to charge a dash toward an enemy. Release to ram it with your ship.',
  kinetic_baseline: 'A forward autocannon fires a continuous stream of bullets. Other mounts start empty.',
  physics_toolkit: 'Push enemies away, pull them toward gravity markers, or slow their movement with a momentum sink.',
  massline_rig: 'Grab objects with an elastic tether and throw them into enemies. Includes a concussion cannon and upgraded engine.',
  storm_carom_forge: 'Bouncing shots, chain lightning and ion damage. Combine the three utility parts in Equipment to free two mounts.',
  hornet_fast_clumsy: 'A powerful engine gives faster acceleration and top speed, with weaker turning and braking.',
  hornet_nimble_slow: 'Responsive turning and braking, with a slower engine. Uses the same concussion cannon as the fast preset.',
  mirror_demonstrator: 'Pulse shots bounce off obstacles and turn toward enemies after a bounce. Includes an upgraded engine.',
});

export function swarmHullIdForStarter(starterId) {
  const kit = presets.get(starterId);
  if (kit) return kit.hullId;
  const hullId = typeof starterId === 'string' && starterId.startsWith('hull:')
    ? starterId.slice(5) : null;
  return ships.has(hullId) ? hullId : null;
}

function choiceId(choice) { return choice?.id || choice?.starterId; }
function isAvailable(choice) {
  return choice?.available !== false && choice?.locked !== true && choice?.locked !== '1'
    && choice?.earned !== false;
}

function kitRows(kitChoices) {
  const choices = Array.isArray(kitChoices)
    ? new Map(kitChoices.map(choice => [choiceId(choice), choice])) : null;
  return COMBAT_LAB_STARTER_PACKAGES.map(kit => {
    const choice = choices?.get(kit.id);
    const available = choices ? !!choice && isAvailable(choice) : publicKits.has(kit.id);
    const names = kit.loadout.map(slot => equipment.get(slot.defId)?.name).filter(Boolean);
    return {
      id: kit.id, starterId: kit.id, hullId: kit.hullId,
      label: KIT_LABELS[kit.id] || kit.label,
      description: KIT_DESCRIPTIONS[kit.id] || kit.blurb || names.join(' · '),
      equipmentNames: names,
      available, locked: !available, bare: false,
      earnText: choice?.earnText || choice?.earn || '',
    };
  });
}

/**
 * Read-only projection of the screen owner's current availability snapshot.
 * `hullChoices` accepts crucibleHullChoices(); `kitChoices` accepts the existing
 * starter controls as [{id, available, earnText}]. Missing locks never grant a kit.
 */
export function swarmHangarRoster({ hullChoices, kitChoices, selectedStarterId } = {}) {
  const choices = Array.isArray(hullChoices)
    ? new Map(hullChoices.map(choice => [choice.hullId || choice.id?.replace(/^hull:/, ''), choice]))
    : null;
  const kits = kitRows(kitChoices);
  const selectedHullId = swarmHullIdForStarter(selectedStarterId);
  return SHIPS.filter(ship => !choices || choices.has(ship.id)).map(ship => {
    const choice = choices?.get(ship.id);
    const available = choices ? isAvailable(choice) : !ship.swarmEarned;
    const hullKits = kits.filter(kit => kit.hullId === ship.id).map(kit => ({
      ...kit, available: available && kit.available, locked: !available || kit.locked,
    }));
    const bare = {
      id: `hull:${ship.id}`, starterId: `hull:${ship.id}`, hullId: ship.id,
      label: 'Choose equipment',
      description: 'Start with an empty ship. Buy weapons and upgrades in Equipment before launching.',
      equipmentNames: [], available, locked: !available, bare: true,
      earnText: choice?.earnText || '',
    };
    return {
      id: ship.id, hullId: ship.id, name: ship.name, hull: ship, tier: ship.tier || 0,
      roleLabel: ROLE_LABELS[ship.role] || 'Ship',
      available, locked: !available, selected: selectedHullId === ship.id,
      earnText: choice?.earnText || '', kits: [...hullKits, bare],
      weaponSlots: buildSlotList(ship).filter(slot => slot.type === 'weapon').length,
      readyKitCount: hullKits.filter(kit => kit.available).length,
    };
  }).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
}

/** Keep a valid choice on this hull. Never move a kit onto incompatible slots. */
export function preferredSwarmStarterForHull(hullId, {
  currentStarterId, hullChoices, kitChoices,
} = {}) {
  const row = swarmHangarRoster({ hullChoices, kitChoices }).find(hull => hull.id === hullId);
  if (!row?.available) return null;
  const current = row.kits.find(kit => kit.id === currentStarterId && kit.available);
  if (current) return current.id;
  const ready = row.kits.find(kit => !kit.bare && kit.available);
  return ready?.id || `hull:${hullId}`;
}

/** A saved hull pick follows the same availability rules as a fresh selection. */
export function availableSwarmStarterId(starterId, options = {}) {
  const hullId = swarmHullIdForStarter(starterId);
  if (!hullId) return null;
  const row = swarmHangarRoster(options).find(hull => hull.id === hullId);
  return row?.kits.find(kit => kit.id === starterId && kit.available)?.id || null;
}

/** The primary action must describe the actual next stop, including draftless challenges. */
export function swarmPreparationReadiness({ starterId, ruleset = 'swarm', weeklyMutatorId = null,
  challengeMutators = [], threatIds = [], stake, daily = false, startWave = 1, hangar = null } = {}) {
  const loadout = swarmPreviewLoadout(starterId, weeklyMutatorId);
  if (!loadout) return { allowed: false, equipmentNext: false, message: 'Choose an available ship and loadout.' };
  const mutators = [...challengeMutators, weeklyMutatorId,
    ...threatIds.map(id => SWARM_THREAT_BY_ID[id]?.mutator)].filter(Boolean);
  const challenge = compileChallenge(0, mutators, ruleset);
  const equipmentNext = ruleset === 'swarm' && !challenge.skipDraft;
  const hasWeapon = loadout.weapons.length > 0;
  // Read the same award inputs as sandboxSetup/runSession; an earned war chest or checkpoint
  // can fund an otherwise zero-credit difficulty, and must not be rejected as an empty budget.
  const startingCredits = ruleset === 'swarm'
    ? Math.round(swarmStakeFor(daily ? 'contender' : stake).purse * swarmThreatPurseMult(daily ? [] : threatIds))
      + purseBonusFor(hangar) + (startWave > 1 ? swarmCheckpointPurseFor(swarmZoneIndexFor(startWave)) : 0)
    : 0;
  // Weapons Cold is an explicit physics challenge. Its intentional lack of guns must
  // never be confused with an accidentally empty ship in an ordinary challenge.
  const allowed = (equipmentNext && startingCredits > 0) || hasWeapon || challenge.physicsOnly;
  const message = allowed
    ? challenge.physicsOnly ? 'Weapons Cold starts without fitted guns. Use your tether and collisions; equipment stops are disabled.'
      : equipmentNext ? '' : 'This challenge starts immediately with the equipment shown.'
    : equipmentNext
      ? 'This ship has no weapon and this difficulty gives no starting credits. Choose an equipped preset or a difficulty with starting credits.'
    : ruleset === 'swarm'
      ? 'This challenge skips equipment. Choose a loadout with a weapon, or turn off the rule that removes equipment stops.'
      : 'This challenge starts immediately. Choose a loadout with a weapon, or switch Run type to Swarm to buy equipment.';
  return { allowed, equipmentNext, message, physicsOnly: challenge.physicsOnly, startingCredits };
}

/** Actual canonical slots for the displayed fit, including the launch's weekly mutation. */
export function swarmPreviewLoadout(starterId, weeklyMutatorId = null) {
  const hull = ships.get(swarmHullIdForStarter(starterId));
  if (!hull) return null;
  const starter = presets.get(starterId);
  const entries = (starter?.loadout || []).map(slot => ({ ...slot }));
  const effective = weeklyMutatorId === 'weapons_cold' ? applyWeaponsColdLoadout(entries) : entries;
  const fitted = new Map(effective.map(slot => [slot.slotIndex, slot.defId]));
  const slots = buildSlotList(hull).map(slot => {
    const defId = fitted.get(slot.index) || null;
    const intrinsicDefId = !defId && hull.id === SAUCER_ID && slot.type === 'weapon'
      ? SAUCER_WEAPON_SLOTS[slot.index] || null : null;
    return { ...slot, defId, name: equipment.get(defId)?.name || 'Empty',
      ...(intrinsicDefId ? { intrinsicDefId, intrinsicName: equipment.get(intrinsicDefId)?.name } : {}) };
  });
  return {
    hull, name: starter ? KIT_LABELS[starter.id] || starter.label : 'Choose equipment',
    slots, ...swarmPreviewFitFromRows(hull.id, slots),
  };
}

/**
 * Armory rows carry installed definitions, not the hovered offer. Rendering this
 * snapshot therefore follows successful purchases and never pretends an offer is owned.
 */
export function swarmPreviewFitFromRows(hullId, rows = []) {
  const hull = ships.get(hullId);
  if (!hull) return null;
  const byIndex = new Map(rows.map(row => [row.slotIndex ?? row.index, row]));
  const slots = buildSlotList(hull);
  const fittings = slots.map(slot => byIndex.get(slot.index)?.defId || null);
  const weapons = slots.filter(slot => slot.type === 'weapon').flatMap(slot => {
    const installed = fittings[slot.index];
    const intrinsic = !installed && hull.id === SAUCER_ID ? SAUCER_WEAPON_SLOTS[slot.index] : null;
    const defId = installed || intrinsic;
    if (!defId) return [];
    return [{ slotIndex: slot.index, defId, facing: intrinsic ? 'turret' : slot.facing || 'front',
      tracking: equipment.get(defId)?.tracking || 'fixed', ...(intrinsic ? { intrinsic: true } : {}) }];
  });
  return { fittings, weapons };
}
