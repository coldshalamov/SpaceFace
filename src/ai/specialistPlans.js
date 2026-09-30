// PQ-140.02 — four specialists, each breaking one player plan.
// Data only. Silhouette ids are the live enemy catalog; behaviour is the doctrine / verb.
// No new hulls (PQ-050 owns form). Two plans share bruiser_armor; mass and speed separate them.

export const SPECIALIST_PLANS = Object.freeze([
  Object.freeze({
    id: 'tether_cutter',
    enemyId: 'tether_control_raider',
    doctrineId: 'tether_control_raider',
    silhouette: 'corsair_blade',
    playerPlan: 'keep a loaded Massline on a rock',
    verb: 'cut_line',
    telegraphKind: 'attach_spool',
    cutRangeWu: 180,
    // SF-046 committed pass (PB-TAC-A): the blade commits once at the spool telegraph — a
    // snapshot of the rope's anchor and bearing — and may only cut that committed geometry.
    // Swinging the line's angle past sweepToleranceRad (or re-anchoring) turns the pass into
    // a miss and the blade into a vulnerable recovery. 45t spans the doctrine's own clock
    // (spool 30t + attach window 15t).
    commitTicks: 45,
    sweepToleranceRad: 0.6,
    missRecoveryTicks: 120,
  }),
  Object.freeze({
    id: 'field_disruptor',
    enemyId: 'quiet_ghost',
    doctrineId: 'ranged_disengager',
    silhouette: 'sniper_lance',
    playerPlan: 'park a well or cone and fight inside it',
    verb: 'disrupt_field',
    telegraphKind: 'weapon_charge',
    disruptRangeWu: 780,
    // SF-047 committed working interval (PB-TAC-B): the ghost acquires at the weapon_charge
    // telegraph and must hold that spot, unhit, for the whole wind-up before the collapse may
    // land in the fire window. 36t spans the doctrine's own clock (charge_cue 30t + the first
    // beats of the 18t fire window).
    disruptWorkTicks: 36,
    disruptHoldRadiusWu: 120,
  }),
  Object.freeze({
    id: 'anchor',
    enemyId: 'field_anchor_controller',
    doctrineId: 'field_anchor_controller',
    silhouette: 'bruiser_armor',
    playerPlan: 'kite freely around the room',
    verb: 'snare_field',
    telegraphKind: 'field_spool',
  }),
  Object.freeze({
    id: 'cargo_protector',
    enemyId: 'warden_escort',
    doctrineId: 'escort_screen',
    silhouette: 'bruiser_armor',
    playerPlan: 'snipe the mule / pack without fighting the screen',
    verb: 'ward_screen',
    telegraphKind: 'engine_flare',
  }),
  // The kamikaze dart is deliberately NOT a row here. These plans are counterplay VERBS the
  // applySpecialistCounterplay dispatcher owns (cut_line / disrupt_field / snare_field /
  // ward_screen) — the dart has no verb to dispatch: its counterplay is physical (shove it,
  // sling it, kill it before it arrives) and its blast is owned by impulseCharges. Its
  // plan-level integration is the combat doctrine, detonator_run, resolved like any other
  // doctrine by the tactical stack.
]);

export function specialistPlanById(id) {
  return SPECIALIST_PLANS.find((row) => row.id === id) || null;
}

export function specialistPlanByEnemyId(enemyId) {
  return SPECIALIST_PLANS.find((row) => row.enemyId === enemyId) || null;
}

export function specialistPlanByDoctrine(doctrineId) {
  return SPECIALIST_PLANS.find((row) => row.doctrineId === doctrineId) || null;
}

/**
 * PQ-030.02 blind-reviewer path: name the threat from silhouette + telegraph + verb
 * only — never from the plan id. The corsair-blade / attach-spool / cut-line read
 * uniquely names the tether-cutter.
 */
export function nameThreatFromVisibleRead(visible = {}) {
  const silhouette = visible.silhouette;
  const telegraphKind = visible.telegraphKind;
  const verb = visible.verb;
  const hits = SPECIALIST_PLANS.filter((row) => (
    row.silhouette === silhouette
    && row.telegraphKind === telegraphKind
    && row.verb === verb
  ));
  if (hits.length !== 1) return null;
  if (hits[0].id !== 'tether_cutter') return null;
  return 'corsair blade spools a Massline and cuts your taut line';
}

/** Silhouette-only read. corsair_blade is unique among specialist plans. */
export function nameThreatFromSilhouetteAlone(silhouette) {
  const hits = SPECIALIST_PLANS.filter((row) => row.silhouette === silhouette);
  if (hits.length !== 1 || hits[0].id !== 'tether_cutter') return null;
  return nameThreatFromVisibleRead({
    silhouette: hits[0].silhouette,
    telegraphKind: hits[0].telegraphKind,
    verb: hits[0].verb,
  });
}
