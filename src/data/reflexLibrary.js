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
//                      targetDisabled targetFaster targetSlower targetHullBelow
//   Situation:         incomingAtLeast (near-miss projectile count) hitRecently
//                      allyLostRecently markedOnly unmarkedOnly markedLost
//                      hostileCloseWithin hostileBehindWithin hazardWithin hazardsAtLeast
//                      maxHazards tetherLineWithin minAllies maxAllies outnumberedBy
//                      wardThreatened calm maxHostiles hostilesAtLeast
//                      targetedByAtLeast untargetedOnly allyCloseWithin allyFarBeyond
//                      allyHurtBelow subsystemLost
//   Squad registers:   integrityBelow matesLostAtLeast leaderLost leadingNow
//                      roles (frame role whitelist)
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
  // focus fire and pincers — the hull feels a crosshair before the hull hits
  CROSSFIRE_WEAVE: 'crossfire_weave',
  SANDWICH_SPLIT: 'sandwich_split',
  COVER_HUG: 'cover_hug',
  // trauma — a blown subsystem is a wound the pilot keeps favoring
  WEAPON_LOST_SCRAMBLE: 'weapon_lost_scramble',
  WOUNDED_LIMP: 'wounded_limp',
  DEATH_BLOOM: 'death_bloom',
  // hit reactions — three more temperamental answers
  SCAR_TWITCH: 'scar_twitch',
  DEFIANT_PRESS: 'defiant_press',
  COLD_FEET: 'cold_feet',
  // command loss and frame morale
  WING_SHRINK: 'wing_shrink',
  HEIR_STEP_UP: 'heir_step_up',
  ADRIFT_FLOUNDER: 'adrift_flounder',
  VOW_PRESS: 'vow_press',
  WING_BROKEN: 'wing_broken',
  RALLY_SHIVER: 'rally_shiver',
  // last pilot standing — three diverging answers
  LONE_FRENZY: 'lone_frenzy',
  LONE_FADE: 'lone_fade',
  LONE_GHOST: 'lone_ghost',
  // execution — the kill read
  KILL_PRESS: 'kill_press',
  COUP_CIRCLE: 'coup_circle',
  PREY_SNAP: 'prey_snap',
  // dueling and pack work
  DUEL_STRAFE: 'duel_strafe',
  JOUST_TURN: 'joust_turn',
  SWARM_FRENZY: 'swarm_frenzy',
  // screen work and lane etiquette
  BODY_BLOCK: 'body_block',
  HERD_PUSH: 'herd_push',
  SHOULDER_CHECK: 'shoulder_check',
  // capacitor and reactor temperament
  COLD_SURGE: 'cold_surge',
  DRY_LIMP: 'dry_limp',
  // aftermath — the post-fight tells
  CATCH_BREATH: 'catch_breath',
  VICTORY_ROLL: 'victory_roll',
  STRUT: 'strut',
  SHAKE_OFF: 'shake_off',
  // the approach itself is character
  HUNTER_STALK: 'hunter_stalk',
  HERALD_ROLL: 'herald_roll',
  // stances round two — sustained registers
  EXECUTION_LUST: 'execution_lust',
  DANCE_CIRCLE: 'dance_circle',
  SWARM_BRAID: 'swarm_braid',
  SCREEN_HOVER: 'screen_hover',
  VANGUARD_EDGE: 'vanguard_edge',
  LAST_STAND_FAN: 'last_stand_fan',
  ROUT_SWEEP: 'rout_sweep',
  OVERWATCHED: 'overwatched',
  VENT_SWAY: 'vent_sway',
  NERVOUS_SCAN: 'nervous_scan',
  GRAVE_DRIFT: 'grave_drift',
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
// and finally stances (which merge rather than compete). Fractional priorities
// sit between whole-number bands without renumbering the table.
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

  // ── focus fire and pincers — the hull reads the crosshair before impact ──
  // Two or more guns tracking this hull: a fast alternating weave to split their lead.
  FROZEN({ kind: REFLEX_KIND.CROSSFIRE_WEAVE, priority: 9.5, windowTicks: 44, cooldownTicks: 150,
    gates: { targetedByAtLeast: 2, minWeave: 0.2 },
    response: { curve: 'alternating', amp: 60, ampField: 'weave', ampScale: 40, side: 'seeded',
      flipTicks: 10, speedScale: 0.9, dropAimBelow: 0.5 } }),
  // Pincered: one contact close ahead and another behind — snap out of the bisector.
  FROZEN({ kind: REFLEX_KIND.SANDWICH_SPLIT, priority: 9.6, windowTicks: 36, cooldownTicks: 220,
    gates: { hostileBehindWithin: 300, hostileCloseWithin: 360, hostilesAtLeast: 2, minWeave: 0.25 },
    response: { curve: 'decay', amp: 85, ampField: 'dash', ampScale: 35, side: 'seeded',
      speedScale: 1.1, dropAimBelow: 0.6 } }),
  // Rock and incoming fire at once: tuck to the cover side and brake — hiding, not dodging.
  FROZEN({ kind: REFLEX_KIND.COVER_HUG, priority: 9.7, windowTicks: 60, cooldownTicks: 260,
    gates: { hazardWithin: 300, hitRecently: true, minPoise: 0.3 },
    response: { pull: { which: 'nearestHazard', k: 0.4 }, brake: true, speedScale: 0.55,
      curve: 'decay_soft', amp: 20, side: 'seeded' } }),

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
  // A gun or thruster just died: the pilot flinches off the firing lane, still dazed.
  FROZEN({ kind: REFLEX_KIND.WEAPON_LOST_SCRAMBLE, priority: 12.5, windowTicks: 46, cooldownTicks: 400,
    gates: { subsystemLost: true, minWeave: 0.2 },
    response: { curve: 'decay', amp: 70, ampField: 'dash', ampScale: 30, side: 'seeded',
      speedScale: 0.8, dropAimBelow: 0.7 } }),
  // A wounded hull that lost hardware slows to a limp — the pilot nursing it home.
  FROZEN({ kind: REFLEX_KIND.WOUNDED_LIMP, priority: 12.6, windowTicks: 70, cooldownTicks: 400,
    gates: { subsystemLost: true, maxHull: 0.5 },
    response: { settle: true, curve: 'decay_soft', amp: 18, side: 'awayThreat' } }),
  // Cornered and nearly dead, the berserker runs the throttle forward anyway.
  FROZEN({ kind: REFLEX_KIND.DEATH_BLOOM, priority: 13.5, windowTicks: 70, cooldownTicks: 600,
    gates: { maxHull: 0.3, minVerve: 0.7, outnumberedBy: 1, hostilesAtLeast: 2, hostileCloseWithin: 600 },
    response: { boost: true, speedScale: 1.3, curve: 'step', amp: 16, side: 'towardThreat',
      holdAim: true } }),
  // The last shot landed and the sky went quiet: dead-stick drift while the crew checks.
  FROZEN({ kind: REFLEX_KIND.AFTERMATH_DRIFT, priority: 13, windowTicks: 50, cooldownTicks: 300,
    gates: { hitRecently: true, calm: true },
    response: { settle: true, dropAimBelow: 0.7 } }),
  FROZEN({ kind: REFLEX_KIND.HIT_WEAVE, priority: 14, windowTicks: 50, cooldownTicks: 160,
    gates: { hitRecently: true },
    response: { curve: 'sine', amp: 26, ampField: 'weave', ampScale: 44, side: 'seeded',
      dropAimBelow: 0.45 } }),
  // Scar tissue: hit while marked — a reflexive twitch layered onto the weave.
  FROZEN({ kind: REFLEX_KIND.SCAR_TWITCH, priority: 14.5, windowTicks: 24, cooldownTicks: 130,
    gates: { hitRecently: true, markedOnly: true, minWeave: 0.3 },
    response: { curve: 'step', amp: 40, ampField: 'weave', ampScale: 30, side: 'seeded',
      speedScale: 1.05 } }),
  // Insult, not injury: the aggressive pilot turns into the hit and presses back.
  FROZEN({ kind: REFLEX_KIND.DEFIANT_PRESS, priority: 14.6, windowTicks: 50, cooldownTicks: 300,
    gates: { hitRecently: true, minVerve: 0.8, maxHull: 0.85, hostileCloseWithin: 700 },
    response: { curve: 'sine', amp: 30, ampField: 'dash', ampScale: 30, side: 'towardThreat',
      boost: true, holdAim: true } }),
  // Fragile nerve: a hit undoes the timid pilot — drift off the threat and brake.
  FROZEN({ kind: REFLEX_KIND.COLD_FEET, priority: 14.7, windowTicks: 55, cooldownTicks: 260,
    gates: { hitRecently: true, maxVerve: 0.25, maxPoise: 0.45 },
    response: { away: 0.5, brake: true, speedScale: 0.7, curve: 'decay_soft', amp: 30,
      side: 'awayThreat' } }),

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

  // ── command loss and frame morale — the squad as a nervous system ────────
  // Two+ wingmates gone and still counting: survivors pull toward whoever is left.
  FROZEN({ kind: REFLEX_KIND.WING_SHRINK, priority: 16.5, windowTicks: 70, cooldownTicks: 500,
    gates: { matesLostAtLeast: 2, minAllies: 1 },
    response: { pull: { which: 'nearestAlly', k: 0.45 }, brake: true,
      curve: 'decay_soft', amp: 26, side: 'towardAlly' } }),
  // The leader just died and the frame named this pilot — it steps up hard.
  FROZEN({ kind: REFLEX_KIND.HEIR_STEP_UP, priority: 17.5, windowTicks: 80, cooldownTicks: 600,
    gates: { leaderLost: true, leadingNow: true, minPoise: 0.4 },
    response: { boost: true, speedScale: 1.2, curve: 'step', amp: 18, side: 'towardThreat',
      holdAim: true } }),
  // Decapitated: low-poise pilots drift leaderless for a beat before doctrine regrabs.
  FROZEN({ kind: REFLEX_KIND.ADRIFT_FLOUNDER, priority: 17.6, windowTicks: 60, cooldownTicks: 500,
    gates: { leaderLost: true, maxPoise: 0.4 },
    response: { settle: true, curve: 'decay_soft', amp: 22, side: 'seeded' } }),
  // Grief as fuel: the hot pilot answers a dead leader by pressing the kill lane.
  FROZEN({ kind: REFLEX_KIND.VOW_PRESS, priority: 18.5, windowTicks: 60, cooldownTicks: 420,
    gates: { leaderLost: true, minVerve: 0.55 },
    response: { curve: 'sine', amp: 36, ampField: 'dash', ampScale: 26, side: 'towardThreat',
      boost: true, speedScale: 1.15 } }),
  // Frame integrity collapsing — the nervous pilot breaks for open water.
  FROZEN({ kind: REFLEX_KIND.WING_BROKEN, priority: 18.6, windowTicks: 80, cooldownTicks: 500,
    gates: { integrityBelow: 0.45, maxVerve: 0.6 },
    response: { away: 0.65, curve: 'decay', amp: 46, ampField: 'dash', ampScale: 30,
      side: 'awayThreat', speedScale: 1.15 } }),
  // Frame wounded, discipline holds: the steady pilot tightens on the nearest wing.
  FROZEN({ kind: REFLEX_KIND.RALLY_SHIVER, priority: 18.7, windowTicks: 70, cooldownTicks: 400,
    gates: { integrityBelow: 0.55, minPoise: 0.5, maxVerve: 0.6, minAllies: 1 },
    response: { pull: { which: 'nearestAlly', k: 0.4 },
      curve: 'sine', amp: 26, ampField: 'poise', ampScale: 20, side: 'towardAlly' } }),

  // ── last pilot standing — a wing reduced to one reads completely differently
  FROZEN({ kind: REFLEX_KIND.LONE_FRENZY, priority: 19.5, windowTicks: 90, cooldownTicks: 900,
    gates: { matesLostAtLeast: 1, maxAllies: 0, minVerve: 0.6, hostileCloseWithin: 800 },
    response: { boost: true, curve: 'sine', amp: 44, ampField: 'dash', ampScale: 36,
      side: 'seeded', holdAim: true, speedScale: 1.15 } }),
  FROZEN({ kind: REFLEX_KIND.LONE_FADE, priority: 19.6, windowTicks: 90, cooldownTicks: 900,
    gates: { matesLostAtLeast: 1, maxAllies: 0, maxVerve: 0.4 },
    response: { away: 0.7, speedScale: 1.2, curve: 'decay', amp: 40, side: 'awayThreat' } }),
  FROZEN({ kind: REFLEX_KIND.LONE_GHOST, priority: 19.7, windowTicks: 110, cooldownTicks: 900,
    gates: { matesLostAtLeast: 1, maxAllies: 0, minPoise: 0.6, minVerve: 0.4 },
    response: { settle: true, curve: 'sine_cont', amp: 20, side: 'orbit', rate: 0.03 } }),

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

  // ── execution — the kill read: wounded prey changes what a hunter does ────
  // Hull low on the target: the aggressive pilot drives straight in for the finish.
  FROZEN({ kind: REFLEX_KIND.KILL_PRESS, priority: 21.5, windowTicks: 60, cooldownTicks: 260,
    gates: { targetHullBelow: 0.3, minVerve: 0.5, maxTargetDist: 420 },
    response: { boost: true, speedScale: 1.25, holdAim: true, curve: 'step', amp: 12,
      side: 'towardThreat' } }),
  // The prey is nearly dead: the technical pilot orbits close and saws it apart.
  FROZEN({ kind: REFLEX_KIND.COUP_CIRCLE, priority: 21.6, windowTicks: 80, cooldownTicks: 300,
    gates: { targetHullBelow: 0.25, minWeave: 0.4, maxTargetDist: 220 },
    response: { curve: 'sine_cont', amp: 30, ampField: 'weave', ampScale: 24, side: 'orbit',
      rate: 0.07, holdAim: true } }),
  // Faster than the prey: hunt instinct — slam the intercept the moment it falls behind.
  FROZEN({ kind: REFLEX_KIND.PREY_SNAP, priority: 21.7, windowTicks: 50, cooldownTicks: 220,
    gates: { targetSlower: true, minVerve: 0.55, maxTargetDist: 520,
      seededChance: { everyTicks: 120, scale: 0.7, field: 'verve' } },
    response: { boost: true, speedScale: 1.2, curve: 'step', amp: 14, side: 'towardThreat' } }),

  // ── dueling and pack work ────────────────────────────────────────────────
  // One-on-one at knife range: the circle dance — sustained lateral swagger.
  FROZEN({ kind: REFLEX_KIND.DUEL_STRAFE, priority: 25.5, windowTicks: 80, cooldownTicks: 180,
    gates: { maxHostiles: 1, markedOnly: true, minTargetDist: 110, maxTargetDist: 520, minWeave: 0.35,
      maxAim: 0.6 },
    response: { curve: 'sine_cont', amp: 44, ampField: 'weave', ampScale: 34, side: 'orbit',
      rate: 0.06, speedScale: 0.95, holdAim: true } }),
  // The duelist overshot — brake, spin, boost back for the second pass like a joust.
  FROZEN({ kind: REFLEX_KIND.JOUST_TURN, priority: 21.8, windowTicks: 60, cooldownTicks: 300,
    gates: { maxHostiles: 1, recedingAbove: 30, maxTargetDist: 900, minVerve: 0.4 },
    response: { brake: true, curve: 'ramp', amp: 50, ampField: 'dash', ampScale: 30,
      side: 'seeded', speedScale: 0.6 } }),
  // The pack smells blood: when the wing is in close, the pushy pilot piles on.
  FROZEN({ kind: REFLEX_KIND.SWARM_FRENZY, priority: 25.7, windowTicks: 60, cooldownTicks: 200,
    gates: { minAllies: 3, hostileCloseWithin: 460, minVerve: 0.4,
      seededChance: { everyTicks: 90, scale: 0.8, field: 'verve' } },
    response: { boost: true, curve: 'sine', amp: 36, ampField: 'dash', ampScale: 28,
      side: 'towardThreat', speedScale: 1.15 } }),

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
  // Frame-assigned escorts interpose hard — body between the ward and the guns.
  FROZEN({ kind: REFLEX_KIND.BODY_BLOCK, priority: 29.5, windowTicks: 55, cooldownTicks: 200,
    gates: { wardThreatened: true, roles: ['support', 'gunner'], minPoise: 0.4 },
    response: { pull: { which: 'threatenedAlly', k: 0.7 }, brake: true,
      curve: 'step', amp: 20, side: 'towardAlly', holdAim: true } }),
  // A nervous escort crowds the ward itself — herding, not shielding.
  FROZEN({ kind: REFLEX_KIND.HERD_PUSH, priority: 29.6, windowTicks: 50, cooldownTicks: 240,
    gates: { wardThreatened: true, maxPoise: 0.35, minAllies: 1 },
    response: { pull: { which: 'nearestAlly', k: 0.5 }, speedScale: 1.1,
      curve: 'decay_soft', amp: 22, side: 'towardAlly' } }),
  // Lane etiquette: a wingmate crowding the intake gets a polite drift off.
  FROZEN({ kind: REFLEX_KIND.SHOULDER_CHECK, priority: 29.7, windowTicks: 40, cooldownTicks: 200,
    gates: { allyCloseWithin: 60, minPoise: 0.3,
      seededChance: { everyTicks: 150, scale: 0.5, field: 'weave' } },
    response: { curve: 'decay', amp: 30, side: 'awayThreat', speedScale: 0.9 } }),
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
  // Full capacitor, cold reactor, hostile in reach — the hot pilot spends it.
  FROZEN({ kind: REFLEX_KIND.COLD_SURGE, priority: 32.5, windowTicks: 50, cooldownTicks: 300,
    gates: { minEnergy: 0.7, heatBelow: 0.25, hostileCloseWithin: 540, minVerve: 0.5,
      untargetedOnly: true, intents: ['intercept', 'orbit', 'approach_socket', 'formation', 'retreat'] },
    response: { boost: true, speedScale: 1.2, curve: 'step', amp: 12, side: 'towardThreat' } }),
  // Tanks dry: the hull coasts on momentum, guns quiet, drift only.
  FROZEN({ kind: REFLEX_KIND.DRY_LIMP, priority: 32.6, windowTicks: 80, cooldownTicks: 300,
    gates: { maxEnergy: 0.15, minPoise: 0.25 },
    response: { settle: true, curve: 'decay_soft', amp: 14, side: 'seeded' } }),

  // ── aftermath — what a hull does the moment the shooting stops ────────────
  // Shot to pieces and the sky is quiet: kill thrust and breathe. No hit gate — the
  // aftermath drift owns the first moments; this owns what is left after.
  FROZEN({ kind: REFLEX_KIND.CATCH_BREATH, priority: 32.7, windowTicks: 80, cooldownTicks: 400,
    gates: { calm: true, maxHull: 0.45 },
    response: { settle: true, curve: 'decay_soft', amp: 16, side: 'seeded' } }),
  // Post-fight roll — the victorious pilot flies a small celebration wing-rock.
  FROZEN({ kind: REFLEX_KIND.VICTORY_ROLL, priority: 32.8, windowTicks: 60, cooldownTicks: 700,
    gates: { calm: true, minVerve: 0.7, heatBelow: 0.55,
      seededChance: { everyTicks: 240, scale: 0.4, field: 'verve' } },
    response: { curve: 'alternating', amp: 40, ampField: 'dash', ampScale: 30, side: 'seeded',
      flipTicks: 14, speedScale: 0.8 } }),
  // Nobody has this hull locked and it knows it — struts a flourish on the transit.
  FROZEN({ kind: REFLEX_KIND.STRUT, priority: 32.9, windowTicks: 70, cooldownTicks: 600,
    gates: { calm: true, untargetedOnly: true, minVerve: 0.75, heatBelow: 0.55,
      seededChance: { everyTicks: 200, scale: 0.5, field: 'verve' } },
    response: { curve: 'sine_cont', amp: 42, ampField: 'dash', ampScale: 30, side: 'seeded',
      rate: 0.04, speedScale: 0.85 } }),
  // The lock just dropped: a shiver roll sheds the adrenaline.
  FROZEN({ kind: REFLEX_KIND.SHAKE_OFF, priority: 32.4, windowTicks: 40, cooldownTicks: 300,
    gates: { markedLost: true, minWeave: 0.3 },
    response: { curve: 'alternating', amp: 50, ampField: 'weave', ampScale: 30, side: 'seeded',
      flipTicks: 9, speedScale: 0.9 } }),

  // ── the approach itself is character ──────────────────────────────────────
  // Locked on nothing yet: the hunter throttles down and stalks the closing lane.
  FROZEN({ kind: REFLEX_KIND.HUNTER_STALK, priority: 33.5, windowTicks: 90, cooldownTicks: 400,
    gates: { untargetedOnly: true, minTargetDist: 550, maxTargetDist: 1400, minVerve: 0.4,
      hostileCloseWithin: 1500 },
    response: { speedScale: 0.55, holdAim: true, curve: 'sine_cont', amp: 14,
      side: 'seeded', rate: 0.02 } }),
  // Announcing the run: marked from far off, the showboat rolls the approach.
  FROZEN({ kind: REFLEX_KIND.HERALD_ROLL, priority: 33.6, windowTicks: 60, cooldownTicks: 500,
    gates: { markedOnly: true, minTargetDist: 700, minVerve: 0.6,
      seededChance: { everyTicks: 200, scale: 0.6, field: 'verve' } },
    response: { curve: 'alternating', amp: 54, ampField: 'dash', ampScale: 34, side: 'seeded',
      flipTicks: 12, speedScale: 1.05 } }),

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
  // Blood scent: the finish is visible, the hunter's aim never leaves it.
  FROZEN({ kind: REFLEX_KIND.EXECUTION_LUST, priority: 51, stance: true,
    gates: { targetHullBelow: 0.22, minVerve: 0.55 },
    response: { holdAim: true, speedScale: 1.05,
      curve: 'sine_cont', amp: 12, ampField: 'verve', ampScale: 14, side: 'seeded', rate: 0.03 } }),
  // One opponent, mid-band: a duelist dances the circle the whole exchange.
  FROZEN({ kind: REFLEX_KIND.DANCE_CIRCLE, priority: 52, stance: true,
    gates: { maxHostiles: 1, minTargetDist: 100, maxTargetDist: 620, minWeave: 0.5,
      intents: ['intercept', 'orbit', 'approach_socket', 'formation'] },
    response: { curve: 'sine_cont', amp: 20, ampField: 'weave', ampScale: 22, side: 'orbit',
      rate: 0.045 } }),
  // The pack in close together: members braid lanes so the swarm reads as one animal.
  FROZEN({ kind: REFLEX_KIND.SWARM_BRAID, priority: 53, stance: true,
    gates: { minAllies: 2, hostileCloseWithin: 560, minWeave: 0.45,
      intents: ['intercept', 'orbit', 'formation', 'approach_socket'] },
    response: { curve: 'sine_cont', amp: 18, ampField: 'weave', ampScale: 22, side: 'orbit',
      rate: 0.05 } }),
  // Support sockets hover near their wing — escorts that were never the spearhead.
  FROZEN({ kind: REFLEX_KIND.SCREEN_HOVER, priority: 54, stance: true,
    gates: { roles: ['support', 'gunner'], minAllies: 1, hostileCloseWithin: 700 },
    response: { curve: 'sine_cont', amp: 16, ampField: 'poise', ampScale: 14, side: 'towardAlly',
      rate: 0.025, speedScale: 0.9 } }),
  // The ship the frame named: a leader on point leans the whole line forward.
  FROZEN({ kind: REFLEX_KIND.VANGUARD_EDGE, priority: 55, stance: true,
    gates: { leadingNow: true, minPoise: 0.4, maxTargetDist: 900 },
    response: { speedScale: 1.08, curve: 'sine_cont', amp: 10, ampField: 'poise',
      ampScale: 12, side: 'towardThreat', rate: 0.02 } }),
  // Frame integrity collapsing, nerve intact — the cornered hull fights wide open.
  FROZEN({ kind: REFLEX_KIND.LAST_STAND_FAN, priority: 56, stance: true,
    gates: { integrityBelow: 0.42, minVerve: 0.5 },
    response: { curve: 'sine_cont', amp: 34, ampField: 'dash', ampScale: 26, side: 'seeded',
      rate: 0.055, speedScale: 1.1, holdAim: true } }),
  // The same collapse on a frightened pilot: a slow slide off the fight axis.
  FROZEN({ kind: REFLEX_KIND.ROUT_SWEEP, priority: 57, stance: true,
    gates: { integrityBelow: 0.35, maxVerve: 0.45 },
    response: { away: 0.35, speedScale: 0.9, curve: 'sine_cont', amp: 18, side: 'awayThreat',
      rate: 0.02 } }),
  // Every gun in the sky is on this hull — survival slide until the locks spread.
  FROZEN({ kind: REFLEX_KIND.OVERWATCHED, priority: 42.5, stance: true,
    gates: { targetedByAtLeast: 2, maxVerve: 0.6 },
    response: { speedScale: 0.8, curve: 'sine_cont', amp: 26, ampField: 'weave',
      ampScale: 26, side: 'seeded', rate: 0.04, dropAimBelow: 0.55 } }),
  // Cooking: an unsteady pilot sways while the plates vent.
  FROZEN({ kind: REFLEX_KIND.VENT_SWAY, priority: 59, stance: true,
    gates: { heatAbove: 0.72, maxPoise: 0.5 },
    response: { curve: 'sine_cont', amp: 16, ampField: 'weave', ampScale: 18, side: 'seeded',
      rate: 0.03, speedScale: 0.85 } }),
  // Quiet sky, jumpy pilot — it still scans, and the scan is visible motion.
  FROZEN({ kind: REFLEX_KIND.NERVOUS_SCAN, priority: 60, stance: true,
    gates: { calm: true, maxPoise: 0.45, minWeave: 0.2 },
    response: { curve: 'alternating', amp: 16, ampField: 'weave', ampScale: 14,
      side: 'seeded', flipTicks: 46, speedScale: 0.9 } }),
  // Drifting a graveyard: pilots orbit the hulks they pass — the world notices.
  FROZEN({ kind: REFLEX_KIND.GRAVE_DRIFT, priority: 61, stance: true,
    gates: { calm: true, hazardWithin: 420, hazardsAtLeast: 1, minWeave: 0.2,
      intents: ['hold', 'formation', 'screen', 'orbit'] },
    response: { curve: 'sine_cont', amp: 20, ampField: 'poise', ampScale: 16, side: 'orbit',
      rate: 0.018, speedScale: 0.8 } }),
]);

// Fast lookup used by the engine and by tests asserting table integrity.
export const REFLEX_SPEC_BY_KIND = Object.freeze(
  Object.fromEntries(REFLEX_SPECS.map((spec) => [spec.kind, spec])),
);
