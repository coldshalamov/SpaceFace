// Reflex trigger library (§21A combat-variety seam): the declarative spec table the reflex
// engine in src/ai/reflexes.js evaluates each tick. Pure data — gates and responses are
// records the engine interprets; no control flow lives here.
//
// A spec is a bounded trigger→impulse contract:
//   kind       — stable id (also the trace/inspect label)
//   priority   — lower evaluates first; first matching burst wins the window
//   windowTicks/cooldownTicks — burst duration / refractory (stance specs ignore both)
//   stance     — continuous channel while gates hold; stances merge instead of competing
//   gates      — AND-ed predicates over the ship's own sensor frame (keys documented below)
//   response   — channels the planner maps onto the desired point/velocity
//
// Gate keys (all optional, AND-ed):
//   Temperament bounds: minWeave maxWeave minDash maxDash minVerve maxVerve
//                       minAim maxAim minPoise maxPoise                    (0..1)
//   Self state:        minHull maxHull maxEnergy heatAbove heatBelow
//                      tetheredOnly tumblingOnly recoveringOnly disabledOnly
//                      ramAuthorizedOnly   capability  (string, self.capabilities must include)
//   Target:            minTargetDist maxTargetDist closingAbove recedingAbove
//                      targetDisabled targetFaster
//   Situation:         incomingAtLeast (near-miss projectile count) hitRecently
//                      allyLostRecently markedOnly unmarkedOnly markedLost
//                      hostileCloseWithin hostileBehindWithin hazardWithin hazardsAtLeast
//                      maxHazards tetherLineWithin minAllies maxAllies outnumberedBy
//                      wardThreatened calm
//   Whitelists:        intents (maneuver kinds)   activities (activity kinds)
//   Seeded draw:       seededChance {everyTicks, scale, field} →
//                      hashUnit(seed, id, kind, tick/everyTicks) < temperament[field] * scale
//
// Response keys:
//   curve  'step' | 'decay' | 'decay_soft' | 'ramp' | 'sine' (one wave) |
//          'alternating' (flipTicks) | 'sine_cont' (rate, phase-seeded)
//   amp ampField ampScale — lateral magnitude = amp + ampScale * temperament[ampField]
//   side   'incoming' | 'seeded' | 'awayThreat' | 'towardThreat' | 'towardAlly' | 'orbit'
//   speedScale brake boost dropAimBelow (dropAim when aim < n) holdAim simmer
//   away   — 0..1 blend of the desired direction away from the threat (break-off)
//   pull   — {which: 'nearestAlly'|'threatenedAlly'|'target', k: 0..1} blend toward a point
//   settle — dead-stick drift: strong brake + heavy speedScale + dropped aim

export const REFLEX_KIND = Object.freeze({
  // damage-state arbitration (these win — a broken hull does not fence)
  DISABLED_DRIFT: 'disabled_drift',
  TUMBLE_RIDE: 'tumble_ride',
  RECOVER_WOBBLE: 'recover_wobble',
  TETHER_SNAP: 'tether_snap',
  // incoming fire and the space itself
  SALVO_DODGE: 'salvo_dodge',
  VOLLEY_JINK: 'volley_jink',
  MINE_SWERVE: 'mine_swerve',
  DEBRIS_DRIFT: 'debris_drift',
  TETHER_LINE_SIDESTEP: 'tether_line_sidestep',
  // pursuit geometry
  TAIL_SHAKE: 'tail_shake',
  OVERSHOOT_SLIP: 'overshoot_slip',
  // damage reactions — panic first (narrow gate), quiet-death next, weave last
  PANIC_SNAP: 'panic_snap',
  AFTERMATH_DRIFT: 'aftermath_drift',
  HIT_WEAVE: 'hit_weave',
  LOW_HULL_SLIP: 'low_hull_slip',
  // wingmate loss — three diverging answers plus a scatter
  COVER_BREAK: 'cover_break',
  VENGEANCE_PRESS: 'vengeance_press',
  REGROUP_PULL: 'regroup_pull',
  SCATTER_LOSS: 'scatter_loss',
  // closing geometry
  BRAKE_CHECK: 'brake_check',
  CHARGE_SLAM: 'charge_slam',
  FEINT_BRAKE: 'feint_brake',
  POUNCE: 'pounce',
  CRIPPLE_PRESS: 'cripple_press',
  // presence and temperament
  HARASS_JINK: 'harass_jink',
  SPIRAL_IN: 'spiral_in',
  RAM_RESOLVE: 'ram_resolve',
  WAKE_SURF: 'wake_surf',
  WARD_SCREEN: 'ward_screen',
  FLANK_FADE: 'flank_fade',
  SPOOF_TURN: 'spoof_turn',
  ENERGY_SAVE: 'energy_save',
  // stances — sustained channels that merge instead of competing
  STEADY_PRESS: 'steady_press',
  SIMMER: 'simmer',
  ORBIT_HOLD: 'orbit_hold',
  MARKED_WEAVE: 'marked_weave',
  ESCORT_JOCKEY: 'escort_jockey',
  PICKET_DRIFT: 'picket_drift',
  HOT_DISCIPLINE: 'hot_discipline',
  BAIT_HOLD: 'bait_hold',
  OUTNUMBERED_CIRCLE: 'outnumbered_circle',
  LANE_WEAVE: 'lane_weave',
  IDLE_DRIFT: 'idle_drift',
});

// Intent kinds whose maneuver is itself the reaction — reflexes never fight them.
export const REFLEX_INTENT_EXCLUSIONS = Object.freeze(['retreat', 'escape_tether', 'clear_deadlock']);

const FROZEN = (spec) => Object.freeze({
  ...spec,
  gates: Object.freeze({ ...(spec.gates || {}) }),
  response: Object.freeze({ ...(spec.response || {}) }),
});

// Ordered by priority: damage-state arbiters first, weapon/hazard reactions next,
// pursuit geometry, damage reactions, wingmate loss, closing geometry, presence,
// and finally stances (which merge rather than compete).
export const REFLEX_SPECS = Object.freeze([
  // ── damage-state arbiters ────────────────────────────────────────────────
  // A crippled hull drifts and stops fencing — overrides everything else.
  FROZEN({ kind: REFLEX_KIND.DISABLED_DRIFT, priority: 1, windowTicks: 90, cooldownTicks: 60,
    gates: { disabledOnly: true },
    response: { settle: true } }),
  FROZEN({ kind: REFLEX_KIND.TUMBLE_RIDE, priority: 2, windowTicks: 60, cooldownTicks: 30,
    gates: { tumblingOnly: true },
    response: { settle: true } }),
  // Right after regaining control the ship porpoises — a wobble in the recovery arc.
  FROZEN({ kind: REFLEX_KIND.RECOVER_WOBBLE, priority: 3, windowTicks: 45, cooldownTicks: 20,
    gates: { recoveringOnly: true },
    response: { curve: 'sine_cont', amp: 34, ampField: 'weave', ampScale: 20, side: 'seeded',
      rate: 0.06, speedScale: 0.75 } }),
  // Tether snap: yaw hard across the tow line — the reflex that makes escapes read.
  FROZEN({ kind: REFLEX_KIND.TETHER_SNAP, priority: 4, windowTicks: 42, cooldownTicks: 200,
    gates: { tetheredOnly: true, minWeave: 0.4 },
    response: { curve: 'alternating', amp: 110, ampField: 'dash', ampScale: 50, side: 'seeded',
      flipTicks: 9, boost: true, dropAimBelow: 0.6 } }),

  // ── incoming fire and the space itself ───────────────────────────────────
  FROZEN({ kind: REFLEX_KIND.SALVO_DODGE, priority: 5, windowTicks: 30, cooldownTicks: 100,
    gates: { incomingAtLeast: 2 },
    response: { curve: 'decay', amp: 46, ampField: 'weave', ampScale: 46, side: 'incoming',
      speedScale: 0.85 } }),
  FROZEN({ kind: REFLEX_KIND.VOLLEY_JINK, priority: 6, windowTicks: 34, cooldownTicks: 120,
    gates: { incomingAtLeast: 1, minWeave: 0.15 },
    response: { curve: 'decay', amp: 34, ampField: 'weave', ampScale: 40, side: 'incoming' } }),
  // Mined lanes: anything with a hazard inside the skirt brakes wide of it.
  // A lone close contact is a mine — swerve hard. In a belt the drift owns the hull.
  FROZEN({ kind: REFLEX_KIND.MINE_SWERVE, priority: 7, windowTicks: 30, cooldownTicks: 90,
    gates: { hazardWithin: 250, maxHazards: 1 },
    response: { curve: 'decay', amp: 60, ampField: 'weave', ampScale: 30, side: 'seeded',
      brake: true, speedScale: 0.6 } }),
  FROZEN({ kind: REFLEX_KIND.DEBRIS_DRIFT, priority: 8, windowTicks: 50, cooldownTicks: 140,
    // A lone distant rock is the dodge system's job — drift reads as threading a
    // belt, so it needs multiple hazards close aboard.
    gates: { hazardWithin: 280, hazardsAtLeast: 2,
      intents: ['intercept', 'orbit', 'screen', 'hold', 'formation', 'approach_socket'] },
    response: { curve: 'decay_soft', amp: 34, ampField: 'poise', ampScale: 30, side: 'seeded',
      speedScale: 0.8 } }),
  FROZEN({ kind: REFLEX_KIND.TETHER_LINE_SIDESTEP, priority: 9, windowTicks: 40, cooldownTicks: 160,
    gates: { tetherLineWithin: 220, minWeave: 0.3 },
    response: { curve: 'decay', amp: 70, ampField: 'dash', ampScale: 30, side: 'seeded' } }),

  // ── pursuit geometry ─────────────────────────────────────────────────────
  // Something is parked on the six o'clock — brake and let geometry flip it.
  FROZEN({ kind: REFLEX_KIND.TAIL_SHAKE, priority: 10, windowTicks: 40, cooldownTicks: 160,
    gates: { hostileBehindWithin: 280, minWeave: 0.3 },
    response: { curve: 'alternating', amp: 70, ampField: 'dash', ampScale: 40, side: 'seeded',
      flipTicks: 11, brake: true } }),
  // The bandit is coming in too hot — slip sideways so the pass overshoots.
  FROZEN({ kind: REFLEX_KIND.OVERSHOOT_SLIP, priority: 11, windowTicks: 30, cooldownTicks: 220,
    gates: { closingAbove: 95, maxTargetDist: 320, markedOnly: true },
    response: { curve: 'ramp', amp: 55, ampField: 'dash', ampScale: 35, side: 'awayThreat',
      brake: true, speedScale: 0.5 } }),

  // ── damage reactions ─────────────────────────────────────────────────────
  // Panic pilots snap-turn under fire — louder and sloppier than a hit_weave.
  FROZEN({ kind: REFLEX_KIND.PANIC_SNAP, priority: 12, windowTicks: 40, cooldownTicks: 200,
    gates: { hitRecently: true, maxPoise: 0.3 },
    response: { curve: 'decay', amp: 80, ampField: 'dash', ampScale: 30, side: 'seeded',
      speedScale: 1.15, dropAimBelow: 0.8 } }),
  // The last shot landed and the sky went quiet: dead-stick drift while the crew checks.
  FROZEN({ kind: REFLEX_KIND.AFTERMATH_DRIFT, priority: 13, windowTicks: 50, cooldownTicks: 300,
    gates: { hitRecently: true, calm: true },
    response: { settle: true, dropAimBelow: 0.7 } }),
  FROZEN({ kind: REFLEX_KIND.HIT_WEAVE, priority: 14, windowTicks: 50, cooldownTicks: 160,
    gates: { hitRecently: true },
    response: { curve: 'sine', amp: 26, ampField: 'weave', ampScale: 44, side: 'seeded',
      dropAimBelow: 0.45 } }),
  // Crippled but still marked: limp sideways off the firing lane.
  FROZEN({ kind: REFLEX_KIND.LOW_HULL_SLIP, priority: 15, windowTicks: 50, cooldownTicks: 240,
    gates: { maxHull: 0.35, markedOnly: true },
    response: { curve: 'decay', amp: 60, ampField: 'weave', ampScale: 30, side: 'awayThreat',
      speedScale: 1.1, dropAimBelow: 0.5 } }),

  // ── wingmate loss — the same event, three different pilots ───────────────
  FROZEN({ kind: REFLEX_KIND.COVER_BREAK, priority: 16, windowTicks: 70, cooldownTicks: 400,
    gates: { allyLostRecently: true, maxHull: 0.5 },
    response: { away: 0.8, curve: 'decay', amp: 40, ampField: 'dash', ampScale: 30,
      side: 'awayThreat', speedScale: 1.2 } }),
  FROZEN({ kind: REFLEX_KIND.VENGEANCE_PRESS, priority: 17, windowTicks: 50, cooldownTicks: 380,
    gates: { allyLostRecently: true, minVerve: 0.55, maxTargetDist: 1200 },
    response: { boost: true, speedScale: 1.25, curve: 'step', amp: 14, side: 'towardThreat' } }),
  FROZEN({ kind: REFLEX_KIND.REGROUP_PULL, priority: 18, windowTicks: 60, cooldownTicks: 300,
    gates: { allyLostRecently: true, minPoise: 0.4, minAllies: 1 },
    response: { pull: { which: 'nearestAlly', k: 0.6 }, speedScale: 1.05 } }),
  FROZEN({ kind: REFLEX_KIND.SCATTER_LOSS, priority: 19, windowTicks: 44, cooldownTicks: 480,
    gates: { allyLostRecently: true },
    response: { curve: 'decay', amp: 90, ampField: 'dash', ampScale: 40, side: 'seeded',
      speedScale: 1.1, dropAimBelow: 0.55 } }),

  // ── closing geometry ─────────────────────────────────────────────────────
  // Closure rate too high for comfort — the pilot that would rather extend.
  FROZEN({ kind: REFLEX_KIND.BRAKE_CHECK, priority: 20, windowTicks: 26, cooldownTicks: 280,
    gates: { closingAbove: 78, maxTargetDist: 430,
      seededChance: { everyTicks: 90, scale: 0.9, field: 'dash' } },
    response: { brake: true, curve: 'ramp', amp: 44, ampField: 'dash', ampScale: 30,
      side: 'seeded', speedScale: 0.55 } }),
  // The inverse: closure is a gift — ram the throttle through it.
  FROZEN({ kind: REFLEX_KIND.CHARGE_SLAM, priority: 21, windowTicks: 30, cooldownTicks: 240,
    gates: { closingAbove: 150, minVerve: 0.55, minTargetDist: 260 },
    response: { boost: true, speedScale: 1.25 } }),
  // Brake mid-run so the defender overshoots, then go again.
  FROZEN({ kind: REFLEX_KIND.FEINT_BRAKE, priority: 22, windowTicks: 16, cooldownTicks: 140,
    gates: { minVerve: 0.6, maxAim: 0.5, minTargetDist: 180, maxTargetDist: 620,
      seededChance: { everyTicks: 120, scale: 0.5, field: 'verve' } },
    response: { brake: true, speedScale: 0.4, curve: 'step', amp: 20, side: 'towardThreat' } }),
  FROZEN({ kind: REFLEX_KIND.POUNCE, priority: 23, windowTicks: 55, cooldownTicks: 300,
    gates: { recedingAbove: 28, minVerve: 0.55, minTargetDist: 260, maxTargetDist: 900 },
    response: { boost: true, speedScale: 1.2, holdAim: true } }),
  FROZEN({ kind: REFLEX_KIND.CRIPPLE_PRESS, priority: 24, windowTicks: 55, cooldownTicks: 300,
    gates: { targetDisabled: true, minVerve: 0.5, minTargetDist: 200, maxTargetDist: 900 },
    response: { boost: true, speedScale: 1.15, holdAim: true } }),

  // ── presence and temperament ─────────────────────────────────────────────
  FROZEN({ kind: REFLEX_KIND.HARASS_JINK, priority: 25, windowTicks: 26, cooldownTicks: 90,
    gates: { hostileCloseWithin: 280, minDash: 0.55,
      seededChance: { everyTicks: 60, scale: 0.8, field: 'dash' } },
    response: { curve: 'alternating', amp: 50, ampField: 'dash', ampScale: 40, side: 'seeded',
      flipTicks: 8 } }),
  // Dashy pilots corkscrew down the attack lane instead of running it straight.
  FROZEN({ kind: REFLEX_KIND.SPIRAL_IN, priority: 26, windowTicks: 90, cooldownTicks: 260,
    gates: { minDash: 0.6, minTargetDist: 500, maxTargetDist: 2000,
      intents: ['intercept', 'orbit', 'approach_socket'] },
    response: { curve: 'sine_cont', amp: 26, ampField: 'dash', ampScale: 40, side: 'seeded',
      rate: 0.05, speedScale: 1.05 } }),
  FROZEN({ kind: REFLEX_KIND.RAM_RESOLVE, priority: 27, windowTicks: 80, cooldownTicks: 400,
    gates: { ramAuthorizedOnly: true },
    response: { boost: true, speedScale: 1.3, holdAim: true } }),
  // The marker just dropped and something still sits behind — surf the wake.
  FROZEN({ kind: REFLEX_KIND.WAKE_SURF, priority: 28, windowTicks: 40, cooldownTicks: 240,
    gates: { markedLost: true, hostileBehindWithin: 420 },
    response: { boost: true, speedScale: 1.15, curve: 'decay', amp: 30, side: 'awayThreat' } }),
  // Screen hulls lurch toward an ally under focus fire.
  FROZEN({ kind: REFLEX_KIND.WARD_SCREEN, priority: 29, windowTicks: 50, cooldownTicks: 160,
    gates: { capability: 'screen', wardThreatened: true },
    response: { pull: { which: 'threatenedAlly', k: 0.5 }, curve: 'step', amp: 26,
      side: 'towardAlly' } }),
  // Evasive pilots fold back inside the formation when painted.
  FROZEN({ kind: REFLEX_KIND.FLANK_FADE, priority: 30, windowTicks: 45, cooldownTicks: 200,
    gates: { markedOnly: true, minWeave: 0.55, minAllies: 1 },
    response: { curve: 'decay_soft', amp: 50, ampField: 'weave', ampScale: 40, side: 'towardAlly' } }),
  // Nobody is aiming at this hull — take a lazy unmarked turn, read the field.
  FROZEN({ kind: REFLEX_KIND.SPOOF_TURN, priority: 31, windowTicks: 30, cooldownTicks: 200,
    gates: { unmarkedOnly: true, minAllies: 1,
      seededChance: { everyTicks: 180, scale: 0.35, field: 'weave' } },
    response: { curve: 'step', amp: 36, side: 'seeded', speedScale: 0.95 } }),
  // Low capacitor: the pilot throttles down and coasts the weave.
  FROZEN({ kind: REFLEX_KIND.ENERGY_SAVE, priority: 32, windowTicks: 60, cooldownTicks: 240,
    gates: { maxEnergy: 0.25,
      seededChance: { everyTicks: 200, scale: 0.6, field: 'poise' } },
    response: { speedScale: 0.7, curve: 'decay_soft', amp: 24, side: 'seeded' } }),

  // ── stances — merge instead of competing ─────────────────────────────────
  FROZEN({ kind: REFLEX_KIND.STEADY_PRESS, priority: 40, stance: true,
    gates: { minPoise: 0.68, markedOnly: true, minAim: 0.5, maxTargetDist: 800 },
    response: { holdAim: true, speedScale: 1.05 } }),
  // Overheated plates throttle down and veto the boost lane until they cool.
  FROZEN({ kind: REFLEX_KIND.SIMMER, priority: 41, stance: true,
    gates: { heatAbove: 0.86 },
    response: { simmer: true, speedScale: 0.6 } }),
  FROZEN({ kind: REFLEX_KIND.ORBIT_HOLD, priority: 42, stance: true,
    gates: { minWeave: 0.55, intents: ['intercept', 'orbit', 'screen'],
      minTargetDist: 120, maxTargetDist: 470 },
    response: { curve: 'sine_cont', amp: 16, ampField: 'weave', ampScale: 30, side: 'orbit',
      rate: 0.035 } }),
  FROZEN({ kind: REFLEX_KIND.MARKED_WEAVE, priority: 43, stance: true,
    gates: { markedOnly: true, minWeave: 0.25, maxWeave: 0.95 },
    response: { curve: 'sine_cont', amp: 12, ampField: 'weave', ampScale: 30, side: 'seeded',
      rate: 0.028 } }),
  // Escorts keep station on their ward and jockey for the shot lane around it.
  FROZEN({ kind: REFLEX_KIND.ESCORT_JOCKEY, priority: 44, stance: true,
    gates: { capability: 'screen', minAllies: 1, hostileCloseWithin: 560, minWeave: 0.3 },
    response: { curve: 'sine_cont', amp: 20, ampField: 'weave', ampScale: 26, side: 'towardAlly',
      rate: 0.03 } }),
  FROZEN({ kind: REFLEX_KIND.PICKET_DRIFT, priority: 45, stance: true,
    gates: { capability: 'screen', intents: ['screen', 'hold'], hostileCloseWithin: 800 },
    response: { curve: 'sine_cont', amp: 14, ampField: 'poise', ampScale: 20, side: 'orbit',
      rate: 0.02 } }),
  FROZEN({ kind: REFLEX_KIND.HOT_DISCIPLINE, priority: 46, stance: true,
    gates: { heatAbove: 0.7, minPoise: 0.5 },
    response: { speedScale: 0.8, dropAimBelow: 0.3 } }),
  // Passive pilots let the fight come to them: settle where they are while marked.
  FROZEN({ kind: REFLEX_KIND.BAIT_HOLD, priority: 47, stance: true,
    gates: { maxVerve: 0.25, markedOnly: true, maxTargetDist: 700 },
    response: { settle: true } }),
  // Alone against numbers, an evasive hull circles rather than closes.
  FROZEN({ kind: REFLEX_KIND.OUTNUMBERED_CIRCLE, priority: 48, stance: true,
    gates: { outnumberedBy: 2, minWeave: 0.55 },
    response: { curve: 'sine_cont', amp: 24, ampField: 'weave', ampScale: 34, side: 'orbit',
      rate: 0.04, speedScale: 0.9 } }),
  // The world moving without the player — patrol and transit legs lean and sway.
  FROZEN({ kind: REFLEX_KIND.LANE_WEAVE, priority: 49, stance: true,
    gates: { calm: true, activities: ['patrol_route', 'transit', 'scan_approach'] },
    response: { curve: 'sine_cont', amp: 18, ampField: 'weave', ampScale: 26, side: 'orbit',
      rate: 0.012 } }),
  FROZEN({ kind: REFLEX_KIND.IDLE_DRIFT, priority: 50, stance: true,
    gates: { calm: true, intents: ['hold', 'formation', 'screen', 'orbit'] },
    response: { curve: 'sine_cont', amp: 10, ampField: 'poise', ampScale: 8, side: 'seeded',
      rate: 0.007 } }),
]);

// Fast lookup used by the engine and by tests asserting table integrity.
export const REFLEX_SPEC_BY_KIND = Object.freeze(
  Object.fromEntries(REFLEX_SPECS.map((spec) => [spec.kind, spec])),
);
