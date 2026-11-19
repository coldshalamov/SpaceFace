// OVH-01a — the Pilot Tree as pure frozen data (design/overhaul/06_PROGRESSION_AND_ECONOMY.md §2.2,
// transcribed node for node). No bus, no DOM, no RNG: eligibility, gates and bend locks are pure
// functions of a run's pilot record; every random choice lives in the run owner
// (runSession.drawPilotOffer) on state.rng, so a seed always draws the same offer.
//
// Shape notes, so nobody re-derives them from prose:
//  * Six combat branches shared by both doors, plus Industry (Adventure only) — 06 §2.1.
//  * Tier gates are 06 §2.1's "tier 2 opens at 2 points in the branch, tier 3 at 4, the capstone
//    at 6". A card is eligible when the branch's held points PLUS THE POINT IN HAND reach the
//    gate: a tier-2 card first appears with 1 point in the branch (taking it makes 2), a tier-3
//    card with 3, and a capstone with 5 — which is exactly 04_SWARM §3's "a capstone card appears
//    only once a branch holds 5 points". The two documents say the same thing.
//  * Conjurer's fifteen bends are one table row in 06 §2.2 ("2–3", tier spanned, per-power split
//    not authored), so each bend carries tier '2-3' and gates at the tier-2 bound. Taking one
//    bend of a power locks that power's other two for the run (06 §2.1 "mutually exclusive
//    bends"). 06 gives the bends as a group row; each bend's card text below states only what the
//    document commits that card to — its power and the one-per-power rule. Per-bend effect
//    sentences arrive with the bends' own spec (doc 11 §3) in the node-effects packets.
//  * Evolutions are named cross-branch cards (06 §2.2 tail): offered only once the run holds
//    8 total points (04 §3 "can appear from 8 points") with both prerequisite branches at 5
//    (06 §2.1 "two branches each hold 5 points"). They join the run's node list but grant no
//    branch points.
//  * Door restrictions are transcribed per node: Industry lives only in Adventure, and the four
//    Ghost nodes 06 §2.2 marks *(Adventure)* are Adventure-only, so Swarm offers Ghost tiers 1–2
//    and the capstone exactly as the branch header promises.

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

function bendRows(power, names) {
  return names.map((name) => [ '2-3', name, `A ${power} bend — one bend per power.`, {
    id: `conjurer_${snake(power)}_${snake(name)}`,
    bendPower: power,
  } ]);
}

export const PILOT_BRANCHES = Object.freeze([
  Object.freeze({ id: 'gunner', name: 'Gunner', motto: 'nothing survives the stream' }),
  Object.freeze({ id: 'bruiser', name: 'Bruiser', motto: 'one shot and he\'s across the room, through his friends' }),
  Object.freeze({ id: 'rigger', name: 'Rigger', motto: 'the rope (reads your hull\'s mass)' }),
  Object.freeze({ id: 'conjurer', name: 'Conjurer', motto: 'one press and the whole field moves' }),
  Object.freeze({ id: 'juggernaut', name: 'Juggernaut', motto: 'I don\'t dodge. I\'m the obstacle.' }),
  Object.freeze({ id: 'ghost', name: 'Ghost', motto: 'they never saw which way it came from' }),
  Object.freeze({ id: 'industry', name: 'Industry', motto: 'Adventure only', adventureOnly: true }),
]);

// Points held in the branch (plus the point in hand) at which each tier opens — 06 §2.1.
export const PILOT_TIER_GATES = Object.freeze({ 1: 0, 2: 2, 3: 4, '2-3': 2, capstone: 6 });

// 04 §3 / 06 §2.1 evolution admission: the run's total point floor, and the per-branch
// prerequisite both of an evolution's branches must hold.
export const PILOT_EVOLUTION_TOTAL_POINTS_FLOOR = 8;
export const PILOT_EVOLUTION_BRANCH_POINTS = 5;

const GUNNER = branchNodes('gunner', [
  [1, 'Steady Hands', 'Your fire does not spread while you move.'],
  [1, 'Quick Vent', 'The amber feathering band is twice as wide.'],
  [1, 'Hollow Point', 'Shots tear unshielded hulls 50 % faster.'],
  [2, 'Shred', 'A target under your fire for a full second starts shedding armour plates — throwable debris.'],
  [2, 'Spin-Up', 'Hose guns fire faster the longer you hold, up to ×1.8 at two seconds.'],
  [2, 'Drum', 'Your heat bar is twice as long.'],
  [3, 'Ricochet', 'Your bullets bounce once off rock and walls.'],
  [3, 'Both Hands', 'Both weapon groups fire together without extra heat.'],
  [3, 'Execution', 'A hull below 20 % dies to your next hit and bursts into chunks.'],
  ['capstone', 'Gold Thread', 'Your Hose stream pierces everything in a line; held for three seconds it becomes a beam that lights the room.'],
]);

const BRUISER = branchNodes('bruiser', [
  [1, 'Heavy Slugs', 'Thump shots carry 30 % more kick.'],
  [1, 'Cue Sight', 'The cue line on a rock shows its second bounce too.'],
  [1, 'Stagger', 'A body you kick cannot fire for one second.'],
  [2, 'Billiards', 'A rock you shot kills the first enemy it meets at speed, whatever its hull.'],
  [2, 'Through and Through', 'Needle shots nail the last body they reach to whatever is behind it for two seconds.'],
  [2, 'Bowling', 'A body you kicked stays energised for six seconds and keeps its speed through the first kill.'],
  [3, 'Breaker Rounds', 'A Thump hit on a rock splits it into three throwable chunks.'],
  [3, 'Wall Splat', 'Anything you kick into a wall dies and leaves its scorch on the wall.'],
  [3, 'Pass It On', 'When a body you kicked hits another, the second takes the full kick too.'],
  ['capstone', 'Newton\'s Cradle', 'Momentum you give passes from body to body without loss, up to five times.'],
]);

const RIGGER = branchNodes('rigger', [
  [1, 'Long Reel', 'The line reaches 50 % further.'],
  [1, 'Quick Latch', 'Inside 120 WU the latch is instant.'],
  [1, 'Free Hand', 'Firing while latched has no aim penalty.'],
  [2, 'Hummingbird', 'Orbiting an ANCHOR, you move and fire 30 % faster. (best on light hulls)'],
  [2, 'Crane', 'A body you tow hits as if it were twice as heavy. (best on heavy hulls)'],
  [2, 'Sweet Spot', 'The release window doubles; a perfect release adds a burst of speed to the thrown body.'],
  [3, 'Second Line', 'Two lines at once (twin_bridle).'],
  [3, 'Whip Snap', 'Tap reel mid-swing to snap the line and fling the body at 1.5× without finishing the swing.'],
  [3, 'Coupler', 'Your next latch ties two bodies together (the Coupler head, 03 §2.4).'],
  ['capstone', 'Untouchable / Wrecking Train', 'Light: shots that would hit you while you orbit an ANCHOR hit the anchor instead. Heavy: tow up to four bodies chained behind you.', { id: 'rigger_untouchable_wrecking_train' }],
]);

const CONJURER = branchNodes('conjurer', [
  [1, 'Quick Cast', 'Powers recover 25 % faster.'],
  [1, 'Wide Bore', 'Powers reach 40 % further.'],
  [1, 'Deep Cast', 'Hold a power key to deepen its effect while you keep steering.'],
  ...bendRows('Pull', ['Vortex', 'Leash', 'Implode']),
  ...bendRows('Shove', ['Wave', 'Hammer', 'Avalanche']),
  ...bendRows('Pin', ['Nail', 'Post', 'Stasis']),
  ...bendRows('Bomb', ['Sticky', 'Cluster', 'Sinker']),
  ...bendRows('Rig', ['Plough', 'Sluice', 'Scoop']),
  [3, 'Echo', 'Every power fires twice, the second at half strength half a second later.'],
  [3, 'Combo', 'A body touched by two different powers within two seconds detonates.'],
  ['capstone', 'Avalanche', 'The plough holds twice as many bodies, captures enemies as well as rocks, and launches them at double speed.'],
]);

const JUGGERNAUT = branchNodes('juggernaut', [
  [1, 'Ram Plate', 'Your bow takes no collision damage below 60 % of your cruise.'],
  [1, 'Ballast', 'You are 30 % heavier: you win collisions — and the rope\'s ANCHOR/TOW lines move for you.'],
  [1, 'Thick Skin', 'Armour regrows out of combat.'],
  [2, 'Snowplough', 'Ramming a light enemy kills it and throws its pieces forward as shrapnel.'],
  [2, 'Run-Up', 'Each second of unbroken boost raises your top speed, up to double.'],
  [2, 'Shoulder Check', 'Boosting into something kicks it like a Thump hit.'],
  [3, 'Unstoppable', 'Collisions never take your helm.'],
  [3, 'Dozer Blade', 'While boosting, the Rig\'s wedge rides your bow by itself.'],
  [3, 'Last Stand', 'Below 15 % hull, collisions you cause repair you.'],
  ['capstone', 'Juggernaut', 'Above cruise speed, you take no damage from anything you hit, and everything you hit takes double.'],
]);

const GHOST = branchNodes('ghost', [
  [1, 'Cold Drift', 'Cutting your drive drops your signature to almost nothing; your lights go out.'],
  [1, 'Decoy', 'Drop a flare that draws fire and missiles for three seconds.'],
  [1, 'Quiet Guns', 'Firing does not reveal you for one second.'],
  [2, 'Ambush', 'The first attack out of stealth does triple damage and kick.'],
  [2, 'Shadow Walker', 'Inside a real shadow, sensors cannot see you.', { adventureOnly: true }],
  [2, 'Saboteur', 'Plant a charge on an unaware ship without breaking stealth.'],
  [3, 'Ghost Line', 'Your line is invisible; a latched ship does not react for one second.', { adventureOnly: true }],
  [3, 'Puppeteer', 'Fire the thrusters of a ship on your line (the Override head).', { adventureOnly: true }],
  [3, 'Vanish', 'A kill from stealth returns you to stealth.', { adventureOnly: true }],
  ['capstone', 'Undertaker', 'Bodies you tumble do not recover their helm until they hit something.'],
]);

const INDUSTRY = branchNodes('industry', [
  [1, 'Prospector', 'Your scanner shows a rock\'s deep strata from space.'],
  [1, 'Rover Licence', 'The rover; you can set down and dig.'],
  [1, 'Smelter', 'You can refine iron and silica.'],
  [2, 'Gas Work', 'Gas taps and generators.'],
  [2, 'Fabrication', 'The fabricator: parts and synthetic backfill.'],
  [2, 'Haulers', 'Transport drones.'],
  [3, 'Ice Work', 'Ice-cooled machines run twice as fast.'],
  [3, 'Conduits', 'Power along crystal and copper veins.'],
  [3, 'Security', 'Security drones and towed defences.'],
  ['capstone', 'Foreman', 'Mark a module on the board and your yard builds it from its own stock.'],
]);

// Conjurer carries the fifteen bends alongside its authored tiers (21 nodes); every other branch
// is 06 §2.1's ten (three tiers of three plus the capstone). 7 × 10 = 70 is §2.1's idealised
// shape — the bends are §2.2's stated exception, and they must be nodes for the bend locks to
// exist at all. Total: 81.
export const PILOT_NODES = Object.freeze([...GUNNER, ...BRUISER, ...RIGGER, ...CONJURER, ...JUGGERNAUT, ...GHOST, ...INDUSTRY]);

// The five evolutions 06 §2.2 names, with the exact prerequisite pairs it gives.
export const PILOT_EVOLUTIONS = Object.freeze([
  Object.freeze({ id: 'evolution_orbital_saw', kind: 'evolution', name: 'Orbital Saw', text: 'Orbiting an anchor, your bullets ricochet between it and its friends.', requires: Object.freeze(['gunner', 'rigger']) }),
  Object.freeze({ id: 'evolution_molten_avalanche', kind: 'evolution', name: 'Molten Avalanche', text: 'Plough-captured rocks glow white-hot and ignite what they hit.', requires: Object.freeze(['conjurer', 'gunner']) }),
  Object.freeze({ id: 'evolution_wrecking_ball', kind: 'evolution', name: 'Wrecking Ball', text: 'A thrown body does not stop at the first kill.', requires: Object.freeze(['bruiser', 'rigger']) }),
  Object.freeze({ id: 'evolution_black_hole', kind: 'evolution', name: 'Black Hole', text: 'Pull and Bomb on one point make a well that eats everything for three seconds.', requires: Object.freeze(['conjurer', 'ghost']) }),
  Object.freeze({ id: 'evolution_meteor', kind: 'evolution', name: 'Meteor', text: 'Boost through the plough and the whole pack rides your bow.', requires: Object.freeze(['juggernaut', 'conjurer']) }),
]);

// Each power's three bends; one taken locks its siblings (06 §2.1 / §2.2's "One per power").
export const PILOT_BEND_GROUPS = Object.freeze([
  Object.freeze({ power: 'Pull', bends: Object.freeze(['conjurer_pull_vortex', 'conjurer_pull_leash', 'conjurer_pull_implode']) }),
  Object.freeze({ power: 'Shove', bends: Object.freeze(['conjurer_shove_wave', 'conjurer_shove_hammer', 'conjurer_shove_avalanche']) }),
  Object.freeze({ power: 'Pin', bends: Object.freeze(['conjurer_pin_nail', 'conjurer_pin_post', 'conjurer_pin_stasis']) }),
  Object.freeze({ power: 'Bomb', bends: Object.freeze(['conjurer_bomb_sticky', 'conjurer_bomb_cluster', 'conjurer_bomb_sinker']) }),
  Object.freeze({ power: 'Rig', bends: Object.freeze(['conjurer_rig_plough', 'conjurer_rig_sluice', 'conjurer_rig_scoop']) }),
]);

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

/** Which door's tree a run reads: Swarm runs get six branches (Ghost partial), Adventure all seven. */
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

/** Points a run's pilot holds in one branch. The query API for effect sites — never read run.pilot directly. */
export function pilotPoints(state, branchId) {
  const value = state && state.run && state.run.pilot && state.run.pilot.points
    ? state.run.pilot.points[branchId] : undefined;
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/** Whether a run's pilot holds a node (branch node or evolution). The query API for effect sites. */
export function pilotHas(state, nodeId) {
  const nodes = state && state.run && state.run.pilot ? state.run.pilot.nodes : null;
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
  const taken = new Set(Array.isArray(pilot?.nodes) ? pilot.nodes : []);
  if (taken.has(card.id)) return false;
  if (lockedPilotNodeIds(pilot).has(card.id)) return false;
  if (card.kind === 'evolution') {
    if (pilotTotalPoints(pilot) < PILOT_EVOLUTION_TOTAL_POINTS_FLOOR) return false;
    return card.requires.every((branch) => (Number.isInteger(pilot?.points?.[branch]) ? pilot.points[branch] : 0) >= PILOT_EVOLUTION_BRANCH_POINTS);
  }
  if (!nodeAvailableInDoor(card, door)) return false;
  const held = Number.isInteger(pilot?.points?.[card.branch]) ? pilot.points[card.branch] : 0;
  return held + 1 >= tierGate(card.tier);
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
