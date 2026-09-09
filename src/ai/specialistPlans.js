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
