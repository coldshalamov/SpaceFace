// One authored character; no runtime state or procedural imitation of a person.
// Hardware comes from SpaceFace's existing enemy catalogue. No stacked HP multipliers.
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export const NEMESIS_RIVAL = freeze({
  id: 'ace_sile_orra', name: 'Sile Orra', crew: 'The Revision',
  shipName: 'Counterexample', factionId: 'faction_quiet', role: 'rival',
  lifecycleOwner: 'nemesis', gimmickTag: 'fallible-observer',
  returnArchetype: 'lancer_sniper', escortArchetype: 'quiet_ghost', baseReturnLevel: 5,
  signatureBark: 'ORRA: I have your flight recorder. I would prefer not to need another.',
  premise: 'A former evacuation-route analyst who mistook a reliable prediction for a promise. '
    + 'The convoy followed the model. Orra alone came back. Now every dangerous pilot is an '
    + 'unfinished explanation: learn them, contain them, make the next catastrophe predictable.',
  flaw: 'Orra buys certainty with flexibility. A strong inference becomes a committed refit, '
    + 'and a pilot who changes their mind becomes the thing Orra cannot forgive.',
  voiceDirection: 'Quiet, exact, increasingly personal. No laughing villain, no omniscient '
    + 'taunts, no claims about evidence the engine did not actually admit.',
  dossier: [
    'COUNTEREXAMPLE / QUIET REGISTRY / CAPTAIN SILE ORRA',
    'Orra does not hate improvisation. Orra has seen what certainty can do, and learned the wrong lesson.',
    'Hardware tells the truth. Every refit leaves a weakness. Read the transmission before choosing the fight.',
  ],
});

export const NEMESIS_STYLES = freeze(['tether', 'ordnance', 'gunnery', 'terrain', 'field', 'kite']);
export const NEMESIS_CHAPTERS = freeze([
  { id: 'reading', title: 'The first reading',
    arrival: 'ORRA: No conclusion yet. Show me the part you think nobody notices.' },
  { id: 'revision', title: 'A corrected assumption',
    arrival: 'ORRA: I changed the ship. You may wish to do the same.' },
  { id: 'reprisal', title: 'The cost of certainty',
    arrival: 'ORRA: I used to write the names beside the numbers. Yours is becoming difficult to erase.' },
  { id: 'final', title: 'The missing variable',
    arrival: 'ORRA: This is everything I learned about you. It had better be enough.' },
]);

// Each kit spends one boss choice + at most one specialist escort choice. No universal immunity.
// A secondary counter can occupy the second escort seat, never become a third hidden boss gun.
export const NEMESIS_KITS = freeze({
  open: {
    id: 'open', label: 'Open question', counter: null,
    bossArchetype: 'lancer_sniper', escortArchetype: 'quiet_ghost',
    doctrineId: 'ranged_disengager', formation: 'wedge', range: 620,
    tactic: 'baseline', capabilities: ['ranged'],
    tell: 'Standard lance fit. No committed countermeasure.',
    opening: 'The ordinary lance reset is your approach window.',
    weakness: 'tether', response: 'The sample is too small. I will not pretend otherwise.',
  },
  tether: {
    id: 'tether', label: 'Broken parallel', counter: 'tether',
    bossArchetype: 'tether_control_raider', escortArchetype: 'field_anchor_controller',
    doctrineId: 'tether_control_raider', formation: 'line', range: 440,
    tactic: 'cross_wake', capabilities: ['counter_tether_cut', 'tug'],
    tell: 'Counter-Massline spool; a lateral approach instead of a ship sitting in your wake.',
    opening: 'The lateral commitment exposes the bow to direct fire. Reverse the sling after it commits.',
    weakness: 'gunnery', response: 'You turn pursuit into a lever. I will not be the far end again.',
  },
  ordnance: {
    id: 'ordnance', label: 'The curtain', counter: 'ordnance',
    bossArchetype: 'pd_screen_escort', escortArchetype: 'bruiser_brawler',
    doctrineId: 'escort_screen', formation: 'wedge', range: 380,
    tactic: 'screen_advance', capabilities: ['ranged', 'screen'],
    tell: 'Point-defense hull and a close escort. Interception is a physical weapon, not missile immunity.',
    opening: 'PD occupies the specialist seat. Terrain impacts and a close Massline attack remain dangerous.',
    weakness: 'tether', response: 'Explosions are persuasive. I have brought an editor.',
  },
  gunnery: {
    id: 'gunnery', label: 'Oblique answer', counter: 'gunnery',
    bossArchetype: 'bruiser_brawler', escortArchetype: 'pd_screen_escort',
    doctrineId: 'brawler_commit', formation: 'line', range: 260,
    tactic: 'oblique_close', capabilities: ['disable', 'ranged'],
    tell: 'Armored brawler; an oblique closing run rather than a stationary damage sponge.',
    opening: 'The heavier hull commits to a crossing line. Sling it, use terrain, or bait the overrun.',
    weakness: 'tether', response: 'You solve distance with a firing solution. Let us change the distance.',
  },
  terrain: {
    id: 'terrain', label: 'Open water', counter: 'terrain',
    bossArchetype: 'lancer_sniper', escortArchetype: 'quiet_ghost',
    doctrineId: 'ranged_disengager', formation: 'line', range: 820,
    tactic: 'wide_orbit', capabilities: ['ranged'],
    tell: 'Long standoff and a separated wing. No formation queued behind a single rock.',
    opening: 'The dispersed wing cannot screen both approaches; close during the lance reset.',
    weakness: 'ordnance', response: 'You have been using the landscape as a weapon. I have stopped volunteering.',
  },
  field: {
    id: 'field', label: 'Outside the room', counter: 'field',
    bossArchetype: 'quiet_ghost', escortArchetype: 'lancer_sniper',
    doctrineId: 'ranged_disengager', formation: 'line', range: 800,
    tactic: 'wide_orbit', capabilities: ['ranged'],
    tell: 'EMP and railgun fit. Long arcs around the engagement band.',
    opening: 'The disruption fit is fragile at close range; move the field after the approach commits.',
    weakness: 'gunnery', response: 'You built a room and asked me to die in it. I have found the door.',
  },
  kite: {
    id: 'kite', label: 'Short horizon', counter: 'kite',
    bossArchetype: 'field_anchor_controller', escortArchetype: 'tether_control_raider',
    doctrineId: 'field_anchor_controller', formation: 'line', range: 520,
    tactic: 'screen_advance', capabilities: ['disable', 'ranged'],
    tell: 'Anchor-controller hull. The pursuit is being shortened, not given impossible engine speed.',
    opening: 'Anchor deployment commits the controller. Turn inward before the lane closes.',
    weakness: 'ordnance', response: 'You win by choosing when the fight exists. I am narrowing the choice.',
  },
});

export const NEMESIS_LINES = freeze({
  escaped: 'ORRA: Keep the wreckage. I need the mistake.',
  playerEscaped: 'ORRA: Leaving is an answer. Not the one I expected.',
  contradicted: 'ORRA: That was not in the model. No. That is a defect in the model.',
  retreat: 'ORRA: Enough. I have confused another theory with a ship.',
  surrendered: 'ORRA: The guns are cooling. I have no argument left. Your choice.',
  spared: 'ORRA: You had the shot. I accounted for everything except that.',
  destroyed: 'Counterexample goes silent. There is no second captain behind the transmission.',
  lost: 'Counterexample was lost to another cause. The record does not call it your victory.',
  victory: 'ORRA: A prediction is not a person. I keep having to learn that.',
  act2: 'ORRA: Second proposition. A different approach; the same ship.',
  act3: 'ORRA: No more propositions. Just us.',
});
