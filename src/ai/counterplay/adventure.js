import { counterplayDoctrineById } from './catalog.js';
import { makeShipEntitySpec } from '../../systems/ships.js';
import { sectorLocalToGlobalForSector } from '../../data/sectorCoordinates.js';
import { ensureCombatant, createCombatCatalog } from '../../combat/runtime.js';
import { getCombatKernel } from '../../combat/kernel.js';

// Approaching an authored situation is the public activation route. No debug flag.
export const COUNTERPLAY_ADVENTURE = Object.freeze([
  ['sector_helios_prime', 'cp_rescue_tow', -1700, 800],
  ['sector_helios_prime', 'cp_field_mechanic', 1700, -1800],
  ['sector_ceres_belt', 'cp_heavy_anchor_grappler', -1700, -1600],
  ['sector_ceres_belt', 'cp_prize_runner', 1700, -1600],
  ['sector_ceres_belt', 'cp_cover_peel', 1800, 1700],
  ['sector_vesta_forge', 'cp_feint_break_courier', -1700, 1600],
  ['sector_vesta_forge', 'cp_corridor_pack_leader', 1700, 1600],
  ['sector_vesta_forge', 'cp_collateral_hold', -1600, -1700],
  ['sector_tethys_junction', 'cp_release_orbit_hunter', -1700, -1600],
  ['sector_tethys_junction', 'cp_tether_bait_decoy', 1700, 1600],
].map(([sectorId, doctrineId, x, z]) => Object.freeze({ sectorId, doctrineId, x, z })));
const repairCatalog = createCombatCatalog();

export function placeCounterplayAdventure(ctx) {
  const state = ctx.state, player = state.entities?.get(state.playerId), sectorId = state.world?.currentSectorId;
  if (!ctx.helpers?.spawnEntity || !player?.pos || player.flags?.docked || state.mode !== 'flight' || !(state.timeScale > 0)
    || !['adventure', 'campaign'].includes(state.run?.kind || 'adventure')) return;
  const discovery = state.world.discovery || (state.world.discovery = {});
  const sector = discovery[sectorId] || (discovery[sectorId] = { discovered: true, visitedCount: 1, pois: {} });
  const seen = sector.pois || (sector.pois = {});
  for (const row of COUNTERPLAY_ADVENTURE) {
    if (row.sectorId !== sectorId) continue;
    const origin = sectorLocalToGlobalForSector(row, sectorId), key = `${sectorId}:${row.doctrineId}`;
    const journalKey = `counterplay:${key}`;
    if (seen[journalKey] || Math.hypot(player.pos.x - origin.x, player.pos.z - origin.z) > 700) continue;
    if (state.entityList.some((e) => e?.alive && e.data?.counterplayCaseKey === key)) { seen[journalKey] = { status: 'encountered' }; continue; }
    const doctrine = counterplayDoctrineById(row.doctrineId), cast = new Map();
    const point = (x, z) => ({ x: origin.x + x, z: origin.z + z });
    const objective = { gate: point(300, 0), feint: point(-50, 260), exit: point(330, 60),
      lane: point(180, 60), leaderPark: point(40, 170), anchor: point(80, 0), flank: point(90, -130),
      patient: point(70, 16), standoff: point(130, 170), cover: point(-60, 0), peel: point(10, 100) };
    const tag = (spec, role) => {
      spec.data ||= {};
      spec.flags = { ...spec.flags, persistent: true };
      Object.assign(spec.data, { counterplayCaseKey: key, counterplayRole: role, persistenceOwner: 'counterplay',
        homeSectorId: sectorId, scanLabel: `${doctrine.title.toUpperCase()} · ${role.toUpperCase()}` });
      const entity = ctx.helpers.spawnEntity(spec); cast.set(role, entity); return entity;
    };
    const ship = (role, hull, pos, ai, team = 1) => tag(makeShipEntitySpec(hull, { team, factionId: team === 2 ? 'faction_free' : 'faction_reach', pos,
      fittings: role === 'opponent' && doctrine.fires ? ['wpn_pulse_laser_s'] : [], ai }), role);
    const ai = { passive: false, roe: doctrine.roe, motive: doctrine.motive, counterplayDoctrineId: doctrine.id,
      zoneId: `counterplay:${sectorId}`, approachTelegraph: doctrine.telegraphKind,
      counterplayObjective: objective, noFireResponseWindowS: 1, engagementTrigger: doctrine.fires ? 'hostile_survey_lane' : 'conditional_job',
      combatDoctrineId: doctrine.legalFireDoctrineId || 'ranged_disengager', hostileTeams: doctrine.fires ? [0] : [],
      activity: { kind: doctrine.fires ? 'attack_run' : 'transit', startedTick: state.tick, targetId: doctrine.fires ? player.id : null,
        reason: `counterplay:${doctrine.id}`, anchor: origin, leashRadius: 900 } };
    const opponent = ship('opponent', doctrine.silhouette, point(40, 80), ai);
    const inert = { passive: false, roe: 'hold_fire', activity: { kind: 'loiter', startedTick: state.tick, anchor: origin, leashRadius: 900 } };
    if (['cp_rescue_tow', 'cp_field_mechanic'].includes(doctrine.id)) {
      const patient = ship('patient', 'ship_wasp', objective.patient, inert);
      patient.data.counterplayControllerId = opponent.id;
      const runtime = ensureCombatant(state, patient, repairCatalog);
      if (runtime.subsystems?.subsystem_drive) runtime.subsystems.subsystem_drive.health = Math.min(8, runtime.subsystems.subsystem_drive.health);
      objective.patientId = patient.id;
    }
    if (doctrine.id === 'cp_corridor_pack_leader') {
      const mate = ship('packmate', 'ship_wasp', point(20, -60), inert); mate.data.counterplayControllerId = opponent.id;
    }
    if (doctrine.id === 'cp_collateral_hold') ship('civilian', 'ship_mule', point(-70, 80), { ...inert, passive: true }, 2);
    const rock = (role, pos, dynamic, radius, mass, vel = { x: 0, z: 0 }) => tag({ type: 'asteroid', pos, vel, radius, mass, collides: true,
      hull: 400, hullMax: 400, physicsBody: { shape: 'ball', dynamic, radius, mass, material: 'asteroid' },
      data: { combatProfileId: 'combat_profile_tether_anchor', ...(dynamic ? {} : { isLandmark: true }) } }, role);
    if (doctrine.id === 'cp_heavy_anchor_grappler') objective.anchorId = rock('anchor', objective.anchor, false, 28, 4000).id;
    if (doctrine.id === 'cp_cover_peel') rock('cover', point(-60, 0), false, 30, 1000);
    if (doctrine.id === 'cp_prize_runner') rock('prize', point(90, 10), true, 12, 90, { x: 12, z: 3 });
    if (doctrine.id === 'cp_release_orbit_hunter') {
      const anchor = rock('orbit_anchor', objective.anchor, false, 16, 5000);
      const orbit = rock('orbit_body', point(190, 0), true, 8, 50, { x: 0, z: 40 });
      objective.anchorId = anchor.id;
      const attachment = getCombatKernel(ctx).attachments.create({ defId: 'attachment_massline', ownerId: orbit.id, targetId: anchor.id });
      if (attachment.ok) orbit.data.counterplayOrbitLine = attachment.attachment.id;
    }
    seen[journalKey] = { status: 'encountered', doctrineId: doctrine.id };
    ctx.bus?.emit('toast', { text: `${doctrine.title}: ${doctrine.playerPlan} ${doctrine.counter}`, kind: 'info', ttl: 8 });
  }
}

export function clearCounterplayAdventure(ctx) {
  for (const entity of [...(ctx.state?.entityList || [])]) if (entity.data?.persistenceOwner === 'counterplay') ctx.helpers?.removeEntity?.(entity.id);
}
