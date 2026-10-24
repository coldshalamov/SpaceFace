// Traffic's bounded disposition cast. Rebuilt from the saved story choice on enter/load;
// identity keys dedupe envelope-restored bodies. No faction ownership or economy writes.
import { endingWorldFact } from '../story/endings/worldAfter.js';
import { makeShipEntitySpec } from './ships.js';

export function materializeEndingWorldPresence(state, helpers, activeIds = [], onSpawned = null) {
  const row = endingWorldFact(state, state?.world?.currentSectorId);
  if (!row || state?.world?.currentSectorId !== row.sectorId || !helpers?.spawnEntity) return [];
  const bodies = state.entityList || [...(state.entities?.values?.() || [])];
  const station = bodies.find(e => e?.alive !== false && e.type === 'station'
    && (e.data?.stationId === row.stationId || e.data?.id === row.stationId || e.stationId === row.stationId));
  if (!station?.pos) return [];
  const choice = state.story.endgameChoice;
  const out = [];
  // Two authored hulls keep both the traffic change and who holds the approach legible.
  for (let index = 0; index < 2 + row.beacons; index++) {
    const key = `ending-world:${choice}:${index}`;
    let entity = bodies.find(e => e?.alive !== false && e.data?.endingWorldKey === key);
    if (!entity) {
      const beacon = index >= 2;
      const label = index === 0 ? row.trafficLabel : index === 1 ? row.positionLabel
        : choice === 'B' ? `Syndicate quiet-route beacon ${index - 1}` : 'Loop return bearing';
      const pos = { x: station.pos.x + 200 + index * 85, z: station.pos.z + (index % 2 ? 120 : -120) };
      const spec = beacon ? { type: 'beacon', pos, radius: 5, mass: 1000, hull: 80, hullMax: 80,
        vel: { x: 0, z: 0 }, data: { parentType: 'story_prop', storyPropKind: 'claim_beacon' } }
        : makeShipEntitySpec(index === 0 && choice === 'E' ? 'ship_mule' : 'ship_hornet', {
          team: 2, factionId: row.factionId, pos,
          ai: { archetype: 'fleeing_trader', passive: true, lawful: choice === 'A',
            spawnContext: choice === 'A' ? 'patrol' : 'convoy_civilian' },
        });
      spec.homeSectorId = row.sectorId;
      spec.data = { ...spec.data, endingWorldKey: key, factionId: row.factionId,
        sectorId: row.sectorId, homeSectorId: row.sectorId, name: label, displayName: label,
        scanLabel: label, callsign: label, endingApproachWatch: true };
      entity = helpers.spawnEntity(spec);
      // A fresh mint mid-flight (endgame:chosen) is a watched spawn: the caller stamps the
      // arrival signature. Deduped bodies re-found above are not re-arrived.
      if (entity && typeof onSpawned === 'function') onSpawned(entity);
    }
    if (!entity) continue;
    if (!activeIds.includes(entity.id)) activeIds.push(entity.id);
    out.push(entity);
  }
  return out;
}
