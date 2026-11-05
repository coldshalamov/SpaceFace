import assert from 'node:assert/strict';

// These campaign fixtures do not run the mining beam or world generation. Admit one
// explicitly synthetic live rock, then send the current player-yield fact at the
// mission owner's marked source. The mission owner still selects and accepts it.
export function admitMarkedSampleYield(h) {
  const { state, missions, helpers, bus } = h;
  const mission = state.missions.active.find(row => row?.status === 'active'
    && row.storyTag === 'campaign47a:b0:recovery');
  assert.ok(mission, 'the accepted 47-A recovery mission must exist');
  state.world.currentSectorId = mission.destSectorId;
  const marked = mission.params?.samplePos;
  const player = state.entities.get(state.playerId);
  const pos = marked && Number.isFinite(marked.x) && Number.isFinite(marked.z)
    ? { x: marked.x, z: marked.z }
    : { x: (player?.pos?.x || 0) + 40, z: player?.pos?.z || 0 };
  const binding = mission.params?.sampleSource;
  const fieldId = binding?.fieldId ?? 'fixture-47a-field';
  const slotId = binding?.slotId ?? 'fixture-47a-slot';
  const rock = helpers.spawnEntity({ type: 'asteroid', pos, vel: { x: 0, z: 0 },
    homeSectorId: mission.destSectorId,
    data: { homeSectorId: mission.destSectorId, fieldId, asteroidSlotId: slotId, oreHP: 100 } });
  assert.equal(missions._resolveContract47aSampleSource(mission), rock, 'the owner marks the staged live rock');
  assert.equal(mission.params.sampleSource?.fieldId, fieldId);
  assert.equal(mission.params.sampleSource?.slotId, slotId);
  bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 2,
    minerId: state.playerId, pos: { x: rock.pos.x, z: rock.pos.z } });
  assert.equal(mission.params.sampleRecovered, true, 'the owner accepts the marked player-yield fact');
}
