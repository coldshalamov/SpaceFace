import { bindSpectrumWorld, observeSpectrumTow } from './model.js';
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';

function pose(entity) {
  return entity?.alive !== false && Number.isFinite(entity?.pos?.x) && Number.isFinite(entity?.pos?.z)
    ? { x: entity.pos.x, z: entity.pos.z, vx: entity.vel?.x || 0, vz: entity.vel?.z || 0 } : null;
}

function bodySpec(model, key, at, radius, velocity, kind) {
  const immobile = kind === 'occluder' || kind === 'reflector';
  const placeId = kind === 'reflector' || kind === 'slab' ? 'place_aftermath_aft_armor_slab'
    : kind.startsWith('occluder') ? 'place_container_rack_abandoned' : 'place_lane_beacon';
  return { type: 'fx', team: 2, pos: { x: at.x, y: 0, z: at.z },
    vel: { x: velocity?.x || 0, y: 0, z: velocity?.z || 0 }, radius, mass: immobile ? 80 : 8,
    hull: 200, hullMax: 200, collides: true,
    physicsBody: { shape: 'ball', radius, mass: immobile ? 80 : 8, dynamic: !immobile, material: 'debris', ccd: true },
    data: { persistenceOwner: 'spectrum', spectrumKey: key, spectrumCaseId: model.caseId,
      sectorId: model.sectorId, placeId, isLandmark: immobile, landmarkId: key,
      masslineTetherable: !immobile,
      combatProfileId: 'combat_profile_tether_anchor',
      scanLabel: kind.startsWith('occluder') ? 'Survey obstruction · move around the shadow'
        : kind === 'reflector' ? 'Charted reflector · folded return'
          : kind === 'slab' ? 'Towable screening slab · Massline changes its shadow'
            : `${kind === 'relay' ? 'Towable survey relay' : 'Unclassified survey return'} · pulse from separated bearings`,
    } };
}

export function materializeSpectrum(model, state, helpers, saved = []) {
  if (!model?.liveBound || !helpers?.spawnEntity) return;
  const def = model.liveDefinition, records = new Map(saved.map((row) => [row.key, row]));
  const rows = [], keys = new Set();
  const add = (key, at, radius, velocity, kind) => {
    if (!at || keys.has(key)) return;
    keys.add(key);
    let entity = state.entityList.find((e) => e.alive !== false && e.data?.persistenceOwner === 'spectrum'
      && e.data.spectrumKey === key && e.data.spectrumCaseId === model.caseId);
    const prior = records.get(key);
    if (prior?.missing) return;
    if (!entity) entity = helpers.spawnEntity(bodySpec(model, key, prior?.pos || at, radius, prior?.vel || velocity, kind));
    if (entity) rows.push({ key, entityId: entity.id, generation: entity.occupantGeneration });
  };
  for (const prop of def.props) add(`prop:${prop.id}`, prop.pos, prop.kind === 'slab' ? 30 : 8, null, prop.kind);
  for (const emitter of def.emitters) {
    if (emitter.propId) continue;
    let at = emitter.pos, vel = emitter.vel;
    if (emitter.motion === 'arc') {
      const a = emitter.phase || 0;
      at = { x: emitter.center.x + Math.cos(a) * emitter.orbit, z: emitter.center.z + Math.sin(a) * emitter.orbit };
      vel = { x: -Math.sin(a) * emitter.orbit * emitter.omega, z: Math.cos(a) * emitter.orbit * emitter.omega };
    }
    add(`emitter:${emitter.id}`, at, 8, vel, emitter.role === 'jammer' ? 'jammer' : 'beacon');
  }
  for (const occ of def.occluders) {
    if (occ.propId) continue;
    const at = occ.pos || { x: occ.center.x + Math.cos(occ.phase || 0) * occ.orbit,
      z: occ.center.z + Math.sin(occ.phase || 0) * occ.orbit };
    const a = occ.phase || 0;
    const vel = occ.motion === 'sweep' ? { x: -Math.sin(a) * occ.orbit * occ.omega, z: Math.cos(a) * occ.orbit * occ.omega } : null;
    add(`occluder:${occ.id}`, at, occ.r, vel, occ.motion === 'sweep' ? 'occluder-moving' : 'occluder');
  }
  for (const wall of def.reflectors) add(`reflector:${wall.id}`,
    { x: (wall.a.x + wall.b.x) / 2, z: (wall.a.z + wall.b.z) / 2 }, 24, null, 'reflector');
  if (def.bodyId === 'sled') add('body:sled', def.sled, 12, null, 'beacon');
  model.bindings = rows;
  refreshSpectrumBodies(model, state);
}

export function refreshSpectrumBodies(model, state) {
  if (!model?.liveBound) return;
  const def = model.liveDefinition, rows = new Map();
  for (const binding of model.bindings || []) {
    const entity = state.entities.get(binding.entityId);
    if (entity?.data?.spectrumCaseId === model.caseId && entity.data.spectrumKey === binding.key
      && entity.occupantGeneration === binding.generation) rows.set(binding.key, entity);
  }
  const poses = { emitters: {}, occluders: {}, reflectors: [], body: null };
  for (const emitter of def.emitters) poses.emitters[emitter.id] = pose(rows.get(emitter.propId
    ? `prop:${emitter.propId}` : `emitter:${emitter.id}`));
  for (const occ of def.occluders) {
    const p = pose(rows.get(occ.propId ? `prop:${occ.propId}` : `occluder:${occ.id}`));
    if (p) poses.occluders[occ.id] = { ...p, r: occ.r };
  }
  for (const wall of def.reflectors) {
    const entity = rows.get(`reflector:${wall.id}`), p = pose(entity);
    if (!p) continue;
    const dx = (wall.b.x - wall.a.x) / 2, dz = (wall.b.z - wall.a.z) / 2;
    const c = Math.cos(entity.rot || 0), s = Math.sin(entity.rot || 0);
    const x = dx * c - dz * s, z = dx * s + dz * c;
    poses.reflectors.push({ ...wall, a: { x: p.x - x, z: p.z - z }, b: { x: p.x + x, z: p.z + z } });
  }
  poses.body = def.bodyId === 'sled' ? pose(rows.get('body:sled')) : poses.emitters[def.bodyId];
  model.livePoses = poses;
  const player = state.entities.get(state.playerId);
  for (const prop of def.props) {
    const entity = rows.get(`prop:${prop.id}`), p = pose(entity);
    if (!p || !player?.pos) continue;
    const latched = Object.values(state.combat?.attachments?.byId || {}).some((a) => a?.state === 'active'
      && a.targetId === entity.id && (a.ownerId === state.playerId || a.controllerId === state.playerId));
    observeSpectrumTow(model, prop.id, p, player.pos, state.simTime, latched);
  }
}

export function driveSpectrumBodies(model, state, dt) {
  if (!model?.liveBound || !Number.isFinite(dt) || dt <= 0) return;
  const def = model.liveDefinition;
  const arcs = [...def.emitters.filter((row) => row.motion === 'arc').map((row) => ({ ...row, key: `emitter:${row.id}` })),
    ...def.occluders.filter((row) => row.motion === 'sweep').map((row) => ({ ...row, key: `occluder:${row.id}` }))];
  for (const row of arcs) {
    const binding = model.bindings?.find((b) => b.key === row.key), entity = state.entities.get(binding?.entityId);
    if (!entity || entity.alive === false || entity.occupantGeneration !== binding.generation) continue;
    const dx = row.center.x - entity.pos.x, dz = row.center.z - entity.pos.z;
    const omega2 = row.omega * row.omega;
    queuePhysicsImpulse(entity, { x: dx * omega2 * entity.mass * dt, y: 0, z: dz * omega2 * entity.mass * dt },
      { source: 'spectrum-orbit', tick: state.tick, dt, continuous: true });
  }
}

export function captureSpectrumBodies(model, state) {
  return (model?.bindings || []).map((binding) => {
    const entity = state.entities.get(binding.entityId), p = pose(entity);
    const same = entity?.data?.spectrumKey === binding.key && entity.data.spectrumCaseId === model.caseId
      && entity.occupantGeneration === binding.generation;
    return p && same ? { key: binding.key, pos: { x: p.x, z: p.z }, vel: { x: p.vx, z: p.vz } }
      : { key: binding.key, missing: true };
  });
}

export function clearSpectrumBodies(state, helpers) {
  for (const entity of [...state.entityList]) if (entity.data?.persistenceOwner === 'spectrum') helpers?.removeEntity?.(entity.id);
}

export { bindSpectrumWorld };
