// The Pilot Tree as pure frozen data (design/overhaul/06_PROGRESSION_AND_ECONOMY.md §2; rebuilt by
// the progression lead 2026-11-20 against the game as it plays today). No bus, no DOM, no RNG:
// eligibility and gates are pure functions of a pilot record; every random choice lives in the run
// owner (runSession.drawPilotOffer) on state.rng, so a seed always draws the same offer.
//
// Shape, so nobody re-derives it from prose:
//  * Six combat branches shared by both doors (Guns, Knockback, Line, Powers, Ramming, Stealth) and
//    three work branches that exist only in Adventure (Trading, Mining, Building).
//  * Each node is one plain line a player feels within thirty seconds. A node whose effect is not
//    in the build is not in this table (the old placeholders — the fifteen power bends, Second Line,
//    Free Hand, Deep Cast after powers began firing on the press, Unstoppable, Dozer Blade, the Ghost
//    nodes with no effect — were cut on 2026-11-20).
//  * Tier gates (06 §2.1): tier 2 opens at 2 points in the branch, tier 3 at 4, the capstone at 6,
//    counting the point in hand — so a tier-2 card appears with 1 point held, tier 3 with 3, the
//    capstone with 5. Every combat branch holds at least five non-capstone nodes, so every capstone
//    is reachable (pinned by test/progression-tree-reach.test.mjs).
//  * Evolutions are named builds across two branches: one opens when BOTH branches hold 4 points
//    (tier 3 reached in each). They join the pilot's node list but grant no branch point.
//  * The pilot record a node reads is resolved in ONE place (activePilotRecord): a Swarm run reads
//    its own run.pilot (it dies with the run); Adventure reads the saved state.player.pilot.

import { pilotLiveNodeIds } from './pilotLive.js';

function snake(name) {
  return name.replace(/['’]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function branchNodes(branch, rows) {
  return rows.map((row) => {
    const [tier, name, text, extra] = row;
    return Object.freeze({
      id: (extra && extra.id) || `${branch}_${snake(name)}`,
      branch,
      tier,
      name,
      text,
      ...(extra || {}),
    });
  });
}

// Branch NAMES are what a stranger reads on a card, the tree and Run Over: plain, short words for
// the fighting style (director ruling, 2026-11-20). Ids stay the code's own (saves, tests, effects).
export const PILOT_BRANCHES = Object.freeze([
  Object.freeze({ id: 'gunner', name: 'Guns', motto: 'nothing survives the stream' }),
  Object.freeze({ id: 'bruiser', name: 'Knockback', motto: 'one shot and he\'s across the room, through his friends' }),
  Object.freeze({ id: 'rigger', name: 'Line', motto: 'grab it, swing it, throw it' }),
  Object.freeze({ id: 'conjurer', name: 'Powers', motto: 'one press and the whole field moves' }),
  Object.freeze({ id: 'juggernaut', name: 'Ramming', motto: 'I don\'t dodge. I\'m the obstacle.' }),
  Object.freeze({ id: 'ghost', name: 'Stealth', motto: 'they never saw which way it came from' }),
  Object.freeze({ id: 'trader', name: 'Trading', motto: 'buy the rumour, sell the news', adventureOnly: true }),
  Object.freeze({ id: 'prospector', name: 'Mining', motto: 'the pick of the rock', adventureOnly: true }),
  Object.freeze({ id: 'builder', name: 'Building', motto: 'a yard that runs while you fly', adventureOnly: true }),
]);

// Points held in the branch (plus the point in hand) at which each tier opens — 06 §2.1.
export const PILOT_TIER_GATES = Object.freeze({ 1: 0, 2: 2, 3: 4, capstone: 6 });

// Evolution admission: the pilot's total point floor, and the points BOTH of an evolution's
// branches must hold (tier 3 reached in each).
export const PILOT_EVOLUTION_TOTAL_POINTS_FLOOR = 8;
export const PILOT_EVOLUTION_BRANCH_POINTS = 4;

// OVH-01b: re-rolling the dealt hand costs Scrap from the run purse (04 §3, starting price;
// tune by play). The constant lives here, not in the sim-side run owner, so the card UI can
// price a re-roll without pulling the simulation bundle into the presentation layer.
export const PILOT_REROLL_SCRAP = 150;

const GUNNER = branchNodes('gunner', [
  [1, 'Steady Hands', 'Your shots fly dead straight while you are moving.'],
  [1, 'Hollow Point', 'Once a ship\'s shield is down, your shots tear its hull half again as fast.'],
  [2, 'Drum', 'Your heat bar is twice as long.'],
  [2, 'Spin-Up', 'Hold the trigger and rapid-fire guns wind up to nearly double their rate in two seconds.'],
  [3, 'Execution', 'An enemy down to the last fifth of its hull dies to your next hit and bursts into chunks.'],
  [3, 'Ricochet', 'Your bullets bounce once off rock and walls.'],
  ['capstone', 'Gold Thread', 'Every shot you fire goes straight through the first ships it hits and keeps flying.'],
]);

const BRUISER = branchNodes('bruiser', [
  [1, 'Heavy Slugs', 'Heavy guns knock what they hit about a third further.'],
  [1, 'Stagger', 'Anything you knock back cannot fire for a second.'],
  [2, 'Billiards', 'Anything you knock flying kills the first enemy it hits, whatever its size.'],
  [3, 'Pass It On', 'When something you knocked hits another body, that one flies too.'],
  [3, 'Wall Splat', 'Anything you knock into a wall or a station dies.'],
  ['capstone', 'Newton\'s Cradle', 'What you knock flying hands all its speed to what it hits, body to body, five times over.'],
]);

const RIGGER = branchNodes('rigger', [
  [1, 'Long Reel', 'The Line reaches half again as far.'],
  [1, 'Quick Latch', 'Up close, the Line grabs the moment you press it.'],
  [2, 'Sweet Spot', 'The lit release window stays open twice as long, and a throw inside it leaves faster.'],
  [2, 'Crane', 'Whatever is on your Line hits as if it were twice as heavy.'],
  [3, 'Whip Snap', 'Throw a body while it is whipping round fast and it leaves half again as fast.'],
  ['capstone', 'Hurricane', 'Anything you throw with the Line leaves twice as fast.'],
]);

const CONJURER = branchNodes('conjurer', [
  [1, 'Quick Cast', 'Every power comes back a quarter sooner.'],
  [1, 'Wide Bore', 'Every power reaches further and covers more ground.'],
  [2, 'Implode', 'Pull makes a small, fierce well that crushes what it catches into each other.'],
  [2, 'Heavy Shove', 'Shove throws everything twice as far.'],
  [3, 'Echo', 'Pull, Shove and Bomb fire twice: the second half as strong, half a second later.'],
  [3, 'Combo', 'A body hit by two different powers within two seconds blows up.'],
  ['capstone', 'Landslide', 'The Plow holds twice as much, scoops up enemies lighter than you, and fires the lot twice as fast.', { id: 'conjurer_avalanche' }],
]);

const JUGGERNAUT = branchNodes('juggernaut', [
  [1, 'Ram Plate', 'Bumps at less than about half your cruise speed never hurt you.'],
  [1, 'Ballast', 'Your ship is a third heavier: you win every shoving match.'],
  [1, 'Thick Skin', 'Four seconds out of the fight and your armour starts growing back.'],
  [2, 'Snowplow', 'Ram an enemy no heavier than you at speed and it dies, its pieces thrown ahead of you.', { id: 'juggernaut_snowplough' }],
  [2, 'Run-Up', 'Hold boost and your top speed keeps climbing, up to double.'],
  [2, 'Shoulder Check', 'Boost into something and it is knocked away like a heavy-gun hit.'],
  [3, 'Last Stand', 'With your hull nearly gone, every ram you land repairs you.'],
  ['capstone', 'Juggernaut', 'Above cruise speed, nothing you hit hurts you, and everything you hit takes double.'],
]);

// Stealth's root is the cloak itself: taking it gives the ship a cloak on V (no module needed).
const GHOST = branchNodes('ghost', [
  [1, 'Cloak', 'Go dark (V): enemies outside your ring lose you and hunt where you were. Firing or a hull hit drops it.'],
  [1, 'Cold Drift', 'Coasting in the dark, your ring shrinks to half: slip right past them.', { needs: 'ghost_cloak' }],
  [2, 'Ambush', 'Your first shots out of the dark hit three times as hard.', { needs: 'ghost_cloak' }],
  [2, 'Deep Shroud', 'Your cloak drains half as fast and charges twice as fast.', { needs: 'ghost_cloak' }],
  [3, 'Vanish', 'A kill in the second after you fire from the dark puts you straight back in it.', { needs: 'ghost_cloak' }],
  ['capstone', 'Phantom', 'Firing no longer drops your cloak; each shot only shows you for a moment.', { needs: 'ghost_cloak' }],
]);

// The work branches: Adventure only (ruling R21 — each rung of the ladder is its own game).
const TRADER = branchNodes('trader', [
  [1, 'Long Memory', 'Price charts show twice as much history.'],
  [1, 'Market Sense', 'Price charts name what a market is doing and for how long: "Climbing for 12 min".'],
  [1, 'Best Buyer', 'Anything in your hold shows the best price you know for it, and where.'],
]);

const PROSPECTOR = branchNodes('prospector', [
  [1, 'Steady Beam', 'Your mining laser pulls twice the share of good ore and less of the slag.'],
  [1, 'Deep Bite', 'Your mining laser cuts through rock half again as fast.'],
  [1, 'Ore Magnet', 'Loose ore drifts to your ship from twice as far, even with no tractor fitted.'],
]);

const BUILDER = branchNodes('builder', [
  [1, 'Foundations', 'Your claims can build the Gas Tap, the Auto-Bore Head and the Fabricator.'],
  [1, 'Tight Packing', 'Your claims can build the Capacitor Bank, the Coolant Condenser and the Charge Press.', { needs: 'builder_foundations' }],
  [1, 'Yard Hand', 'Your claims can build the Pillar Brace, the Mass Driver, the Lattice Synthesizer and the Vein Exciter.', { needs: 'builder_tight_packing' }],
]);

export const PILOT_NODES = Object.freeze([
  ...GUNNER, ...BRUISER, ...RIGGER, ...CONJURER, ...JUGGERNAUT, ...GHOST,
  ...TRADER, ...PROSPECTOR, ...BUILDER,
]);

// The evolutions: named builds a player can describe, each opened by two branches at 4 points.
export const PILOT_EVOLUTIONS = Object.freeze([
  Object.freeze({ id: 'evolution_orbital_saw', kind: 'evolution', name: 'Orbital Saw', build: 'a light ship that swings on the Line and saws with its guns', text: 'While you are on the Line, every shot goes through every ship in its path.', requires: Object.freeze(['gunner', 'rigger']) }),
  Object.freeze({ id: 'evolution_wrecking_ball', kind: 'evolution', name: 'Wrecking Ball', build: 'everything you hit becomes the next shot', text: 'Anything you knock or throw flying keeps killing: it no longer stops at the first enemy.', requires: Object.freeze(['bruiser', 'rigger']) }),
  Object.freeze({ id: 'evolution_freight_train', kind: 'evolution', name: 'Freight Train', build: 'a heavy ram that tows and smashes', text: 'Whatever you tow on the Line smashes like a ram: it kills any enemy no heavier than you that it hits.', requires: Object.freeze(['juggernaut', 'rigger']) }),
  Object.freeze({ id: 'evolution_meteor_shower', kind: 'evolution', name: 'Meteor Shower', build: 'a bulldozer that shoots its own wall of rock', text: 'Rocks fired from the Plow kill every enemy they hit and keep going.', requires: Object.freeze(['conjurer', 'gunner']) }),
  Object.freeze({ id: 'evolution_black_hole', kind: 'evolution', name: 'Black Hole', build: 'a ghost that leaves a trap where it vanished', text: 'Going dark leaves a Pull well where you were; the pack chasing you falls into it.', requires: Object.freeze(['conjurer', 'ghost']) }),
]);

// The fifteen power bends were cut (2026-11-20): none had an effect in the build. The export stays
// (empty) so the lock machinery below keeps one code path if bends return as real nodes.
export const PILOT_BEND_GROUPS = Object.freeze([]);

const NODE_BY_ID = new Map(PILOT_NODES.map((node) => [node.id, node]));
const EVOLUTION_BY_ID = new Map(PILOT_EVOLUTIONS.map((node) => [node.id, node]));
const BRANCH_BY_ID = new Map(PILOT_BRANCHES.map((branch) => [branch.id, branch]));
const BEND_SIBLINGS_BY_ID = new Map(PILOT_BEND_GROUPS.flatMap((group) => group.bends.map((id) => [
  id,
  Object.freeze(group.bends.filter((sibling) => sibling !== id)),
])));

/** One card record by id — a branch node or an evolution — or null. Pure. */
export function getPilotCard(id) {
  return NODE_BY_ID.get(id) || EVOLUTION_BY_ID.get(id) || null;
}

/** One branch record by id, or null. */
export function getPilotBranch(id) {
  return BRANCH_BY_ID.get(id) || null;
}

/** Which door's tree a run reads: Swarm runs get the six combat branches, Adventure all nine. */
export function pilotDoorForRun(run) {
  return run && run.kind === 'survival' ? 'swarm' : 'adventure';
}

function branchAvailableInDoor(branchId, door) {
  const branch = BRANCH_BY_ID.get(branchId);
  if (!branch) return false;
  return door === 'adventure' || !branch.adventureOnly;
}

function nodeAvailableInDoor(node, door) {
  if (door === 'adventure') return true;
  if (node.adventureOnly) return false;
  return branchAvailableInDoor(node.branch, door);
}

/**
 * THE one resolver every effect site reads through: the pilot record that is in force right now.
 * A live Swarm (or lab) run carries its own run.pilot, which dies with the run; an Adventure game
 * reads the saved state.player.pilot. A non-Adventure run never falls back to the Adventure record,
 * so a Swarm run started from an Adventure save cannot inherit its skills.
 */
export function activePilotRecord(state) {
  if (!state) return null;
  const run = state.run;
  if (run && run.pilot && typeof run.pilot === 'object' && !Array.isArray(run.pilot)) return run.pilot;
  if (run && run.kind && run.kind !== 'adventure' && run.phase && run.phase !== 'inactive') return null;
  const pilot = state.player && state.player.pilot;
  return pilot && typeof pilot === 'object' && !Array.isArray(pilot) ? pilot : null;
}

/** Points the active pilot holds in one branch. The query API for effect sites. */
export function pilotPoints(state, branchId) {
  const pilot = activePilotRecord(state);
  const value = pilot && pilot.points ? pilot.points[branchId] : undefined;
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/** Whether the active pilot holds a node (branch node or evolution). The query API for effect sites. */
export function pilotHas(state, nodeId) {
  const pilot = activePilotRecord(state);
  const nodes = pilot ? pilot.nodes : null;
  return Array.isArray(nodes) && nodes.includes(nodeId);
}


/** Total points across branches (evolutions grant none and add none). */
export function pilotTotalPoints(pilot) {
  const points = pilot && pilot.points;
  if (!points || typeof points !== 'object') return 0;
  let total = 0;
  for (const branch of PILOT_BRANCHES) {
    const value = points[branch.id];
    if (Number.isInteger(value) && value > 0) total += value;
  }
  return total;
}

/** The branch with the most held points (first in branch order on a tie), or null at zero points. */
export function deepestPilotBranch(pilot, door) {
  let deepest = null;
  let deepestPoints = 0;
  for (const branch of PILOT_BRANCHES) {
    if (!branchAvailableInDoor(branch.id, door)) continue;
    const held = pilot && Number.isInteger(pilot.points?.[branch.id]) ? pilot.points[branch.id] : 0;
    if (held > deepestPoints) { deepest = branch.id; deepestPoints = held; }
  }
  return deepest;
}

/** Branches the door offers that hold no points yet. */
export function untouchedPilotBranches(pilot, door) {
  const out = [];
  for (const branch of PILOT_BRANCHES) {
    if (!branchAvailableInDoor(branch.id, door)) continue;
    const held = pilot && Number.isInteger(pilot.points?.[branch.id]) ? pilot.points[branch.id] : 0;
    if (held === 0) out.push(branch.id);
  }
  return out;
}

/** Bend ids locked for the run by a taken sibling (06 §2.1: one bend per power). */
export function lockedPilotNodeIds(pilot) {
  const taken = new Set(Array.isArray(pilot?.nodes) ? pilot.nodes : []);
  const locked = new Set();
  for (const [id, siblings] of BEND_SIBLINGS_BY_ID) {
    if (!taken.has(id)) continue;
    for (const sibling of siblings) locked.add(sibling);
  }
  return locked;
}

function tierGate(tier) {
  const gate = PILOT_TIER_GATES[tier];
  return Number.isInteger(gate) ? gate : 1;
}

/** A single card's eligibility under the run's pilot record and door. Pure; used by draw and choose alike. */
export function isPilotCardEligible(card, pilot, door) {
  if (!card) return false;
  // OVH-01a2: a node joins the tree only when its effect is built and tested (pilotLive.js).
  if (!pilotLiveNodeIds().has(card.id)) return false;
  const taken = new Set(Array.isArray(pilot?.nodes) ? pilot.nodes : []);
  if (taken.has(card.id)) return false;
  if (lockedPilotNodeIds(pilot).has(card.id)) return false;
  if (card.kind === 'evolution') {
    if (pilotTotalPoints(pilot) < PILOT_EVOLUTION_TOTAL_POINTS_FLOOR) return false;
    return card.requires.every((branch) => (Number.isInteger(pilot?.points?.[branch]) ? pilot.points[branch] : 0) >= PILOT_EVOLUTION_BRANCH_POINTS);
  }
  if (!nodeAvailableInDoor(card, door)) return false;
  // A node that builds on another (Stealth's nodes all need the Cloak) waits for it.
  if (card.needs && !taken.has(card.needs)) return false;
  const held = Number.isInteger(pilot?.points?.[card.branch]) ? pilot.points[card.branch] : 0;
  return held + 1 >= tierGate(card.tier);
}

function heldIn(pilot, branchId) {
  return Number.isInteger(pilot?.points?.[branchId]) ? pilot.points[branchId] : 0;
}

/**
 * How a node stands for this pilot, in words the tree screen prints: 'taken', 'open' (could be
 * taken with a point in hand) or 'locked', with the one line that says what it needs.
 */
export function pilotNodeStanding(card, pilot, door) {
  if (!card) return { state: 'locked', needs: '' };
  const taken = Array.isArray(pilot?.nodes) && pilot.nodes.includes(card.id);
  if (taken) return { state: 'taken', needs: '' };
  if (card.kind === 'evolution') {
    const names = card.requires.map((b) => (BRANCH_BY_ID.get(b) || { name: b }).name);
    const short = card.requires.filter((b) => heldIn(pilot, b) < PILOT_EVOLUTION_BRANCH_POINTS);
    const needs = `Needs ${PILOT_EVOLUTION_BRANCH_POINTS} points in ${names[0]} and in ${names[1]}`;
    return { state: short.length ? 'locked' : (isPilotCardEligible(card, pilot, door) ? 'open' : 'locked'), needs };
  }
  if (!nodeAvailableInDoor(card, door)) return { state: 'locked', needs: 'Adventure only' };
  const branchName = (BRANCH_BY_ID.get(card.branch) || { name: card.branch }).name;
  if (card.needs && !(Array.isArray(pilot?.nodes) && pilot.nodes.includes(card.needs))) {
    const first = NODE_BY_ID.get(card.needs);
    return { state: 'locked', needs: `Needs ${first ? first.name : card.needs} first` };
  }
  const gate = tierGate(card.tier);
  const held = heldIn(pilot, card.branch);
  if (held + 1 < gate) {
    const more = gate - 1 - held;
    return { state: 'locked', needs: `Needs ${more} more point${more === 1 ? '' : 's'} in ${branchName}` };
  }
  return { state: isPilotCardEligible(card, pilot, door) ? 'open' : 'locked', needs: '' };
}

/**
 * How many more picks this pilot could ever take in this door: live nodes not yet taken or locked,
 * tier gates ignored (taking picks opens them), one per bend group (a bend locks its siblings), plus
 * live evolutions not yet taken. The run owner never banks more picks than this — a level-up must
 * offer a real card or not promise one (release list, 2026-11-19).
 */
export function pilotPicksRemaining(pilot, door) {
  const live = pilotLiveNodeIds();
  const taken = new Set(Array.isArray(pilot?.nodes) ? pilot.nodes : []);
  const locked = lockedPilotNodeIds(pilot);
  const bendGroupOf = new Map();
  PILOT_BEND_GROUPS.forEach((group, i) => { for (const id of group.bends) bendGroupOf.set(id, i); });
  const groupsOpen = new Set();
  let count = 0;
  for (const node of PILOT_NODES) {
    if (!live.has(node.id) || taken.has(node.id) || locked.has(node.id) || !nodeAvailableInDoor(node, door)) continue;
    const group = bendGroupOf.get(node.id);
    if (group != null) {
      if ([...PILOT_BEND_GROUPS[group].bends].some((id) => taken.has(id)) || groupsOpen.has(group)) continue;
      groupsOpen.add(group);
    }
    count += 1;
  }
  for (const evolution of PILOT_EVOLUTIONS) {
    if (live.has(evolution.id) && !taken.has(evolution.id)) count += 1;
  }
  return count;
}

/** Every card the run may currently be offered, in tree order (branch nodes, then evolutions). */
export function eligiblePilotCards(pilot, door) {
  const out = [];
  for (const node of PILOT_NODES) {
    if (isPilotCardEligible(node, pilot, door)) out.push(node);
  }
  for (const evolution of PILOT_EVOLUTIONS) {
    if (isPilotCardEligible(evolution, pilot, door)) out.push(evolution);
  }
  return out;
}

/**
 * How strongly a card combines with the build (04 §3: the third card is weighted toward what
 * combines with what you have). Branch nodes ride their branch's investment; an evolution rides
 * the sum of its two prerequisites — the deepest commitment of all.
 */
export function pilotCardWeight(card, pilot) {
  if (card.kind === 'evolution') {
    return 1 + card.requires.reduce((sum, branch) => sum + (Number.isInteger(pilot?.points?.[branch]) ? pilot.points[branch] : 0), 0);
  }
  return 1 + (Number.isInteger(pilot?.points?.[card.branch]) ? pilot.points[card.branch] : 0);
}
