// Finite physical mining hazards. The environmental machinery owns their durable lots;
// ordinary physics owns impact and motion, and ordinary mining owns ore extraction.
export function updateWeatherMeteors(owner, volume, phase) {
  if (volume.role !== 'meteor_shower' || !volume.seasonal) return;
  const state = owner.state;
  const discovery = state.world.discovery || (state.world.discovery = {});
  const sector = discovery[volume.sectorId] || (discovery[volume.sectorId] = { pois: {}, fieldsDepleted: {} });
  const book = sector.weatherMeteors || (sector.weatherMeteors = {});
  let row = book[volume.id];
  if (row && !Array.isArray(row.slots)) row = null;
  if (!row && phase.phase !== 'surge') return;
  if (!row) row = book[volume.id] = { cycle: phase.cycleIndex, slots: [] };
  // There are at most six resident stones, across the current and previous shower.
  if (phase.phase === 'surge' && row.cycle !== phase.cycleIndex) {
    row.cycle = phase.cycleIndex;
    while (row.slots.length > 3) {
      const old = row.slots.shift();
      const entity = (state.entityList || []).find(e => e.data?.weatherMeteorKey === old.key);
      if (entity) entity.alive = false;
    }
  }
  if (phase.phase === 'surge' && !row.slots.some(slot => slot.cycle === row.cycle)) {
    for (let i = 0; i < 3; i++) {
      const key = `${volume.id}:${row.cycle}:${i}`;
      row.slots.push({ key, cycle: row.cycle, retired: false, hull: 180,
        pos: { x: volume.globalPos.x + volume.dir.x * (150 + i * 110) - volume.dir.z * (i - 1) * 85,
          z: volume.globalPos.z + volume.dir.z * (150 + i * 110) + volume.dir.x * (i - 1) * 85 },
        vel: { x: volume.dir.x * (70 + i * 9), z: volume.dir.z * (70 + i * 9) },
        data: { typeId: 'ast_metallic', tier: 1, tierCap: 2, oreHP: 180, oreHPMax: 180,
          yieldU: 18, size: 9, pctEjected: 0, isChunk: true, fieldId: volume.id,
          weatherMeteorKey: key, sectorId: volume.sectorId, masslineTetherable: true },
      });
    }
  }
  for (const slot of row.slots) {
    if (slot.retired) continue;
    if (slot.data?.oreHP <= 0 || slot.hull <= 0) { slot.retired = true; continue; }
    let e = (state.entityList || []).find(candidate => candidate.data?.weatherMeteorKey === slot.key);
    if (e && (e.alive === false || e.data.oreHP <= 0)) { slot.retired = true; continue; }
    if (!e && typeof owner._weatherHelpers?.spawnEntity === 'function') {
      e = owner._weatherHelpers.spawnEntity({ type: 'asteroid', pos: { ...slot.pos }, vel: { ...slot.vel },
        radius: 9, mass: 70, hull: slot.hull, hullMax: 180, collides: true, homeSectorId: volume.sectorId,
        physicsBody: { dynamic: true, mass: 70, radius: 9, material: 'rock', shape: 'ball' },
        data: slot.data,
      });
    }
    if (!e) continue;
    // Live plain-data references retain partial ore, position and momentum in ordinary saves.
    slot.pos = e.pos; slot.vel = e.vel; slot.hull = e.hull; slot.data = e.data;
  }
}

export function retireWeatherMeteor(state, entity) {
  const key = entity?.data?.weatherMeteorKey;
  if (!key) return;
  const book = state.world?.discovery?.[entity.data.sectorId]?.weatherMeteors;
  for (const row of Object.values(book || {})) {
    const slot = row.slots.find(s => s.key === key);
    if (slot) slot.retired = true;
  }
}
