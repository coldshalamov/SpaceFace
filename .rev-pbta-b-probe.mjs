// PB-TAC-B live-stack probe (throwaway): drive the REAL tacticalAI + fields systems and watch
// the anchor controller's snare follow the doctrine cycle (SF-049), the quiet ghost's collapse
// respect the committed interval (SF-047), and the escort's custody bind (SF-048).
import { createSimulation } from './src/core/sim.js';
import { createBus } from './src/core/eventBus.js';
import { aiPorts } from './src/systems/aiPorts.js';
import { fields } from './src/systems/fields.js';
import { FIELD_FLAGS } from './src/data/fields.js';
import { createTacticalAISystem, PRODUCTION_ENEMY_MIND_CONFIG } from './src/systems/tacticalAI.js';
import { makeEnemySpawnSpec } from './src/systems/combat.js';

const bus = createBus();
const telegraphs = [];
bus.on('ai:telegraph', (p) => telegraphs.push({ tick: p.tick, kind: p.kind, id: p.entityId }));

const sim = createSimulation({
  seed: 88045,
  bus,
  systems: [aiPorts, fields, createTacticalAISystem({ config: { enemyMind: PRODUCTION_ENEMY_MIND_CONFIG } })],
});
const { state } = sim;
state.mode = 'flight';
state.world.currentSectorId = 'sector_ceres_belt';
state.input.actions = {};
const prevFlag = FIELD_FLAGS.enabled;
FIELD_FLAGS.enabled = true;

const player = sim.spawn({
  type: 'ship', team: 0, factionId: 'faction_free',
  pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
  radius: 12, hull: 400, hullMax: 400, cap: 100, capMax: 100,
  data: { ai: {} },
});
state.playerId = player.id;

const anchor = sim.spawn(makeEnemySpawnSpec('field_anchor_controller', 6, { x: 620, z: 0 }));
// Real spawns get their doctrine activity from the mind/encounter stamp; a bare fixture hull
// must carry the same ai posture the game gives a fighting anchor.
anchor.data.ai = anchor.data.ai || {};
anchor.data.ai.roe = 'weapons_free';
anchor.data.ai.activity = {
  kind: 'attack_run', reason: 'probe_interdiction',
  anchor: { x: 0, z: 0 }, leashRadius: 2800, startedTick: 0, targetId: player.id,
};
console.log('anchor spawned:', anchor.id, 'fieldAnchor:', !!anchor.data.fieldAnchor);

function sample(tickLabel) {
  const rt = state.fields;
  const recs = Object.values(rt && rt.anchored || {});
  const rec = recs.find((r) => r && r.sourceId === anchor.id);
  const kernelField = rec && sim.registry.get('fields')._kernel.get(rec.fieldId);
  const ai = sim.registry.get('tacticalAI');
  let phase = '-';
  let contacts = '-';
  try {
    const view = ai.inspect({ entityId: anchor.id });
    phase = view.combatDoctrine && view.combatDoctrine[anchor.id]
      ? `${view.combatDoctrine[anchor.id].phase}@${view.combatDoctrine[anchor.id].targetId}` : 'none';
    const perc = view.perception && view.perception.contacts;
    contacts = Array.isArray(perc) ? perc.length : perc;
  } catch (e) { phase = `err:${e.message}`; }
  console.log(
    `t=${String(tickLabel).padStart(5)} phase=${phase} contacts=${contacts}`
    + ` armed=${rec ? rec.armed : '-'}`
    + ` activate=${rec ? rec.activateTick : '-'} strength=${kernelField ? kernelField.strength : '-'}`
    + ` anchorPos.x=${Math.round(anchor.pos.x)} playerDist=${Math.round(Math.hypot(anchor.pos.x - player.pos.x, anchor.pos.z - player.pos.z))}`,
  );
}

const DT = 1 / 60;
for (let i = 0; i <= 1500; i++) {
  sim.step(DT);
  if (i % 150 === 0) sample(i);
  if (anchor.alive === false) { console.log('anchor died at tick', i); break; }
}
sample('end');
console.log('field_spool telegraphs:', telegraphs.filter((t) => t.kind === 'field_spool' && t.id === anchor.id).length);
console.log('all telegraph kinds for anchor:', [...new Set(telegraphs.filter((t) => t.id === anchor.id).map((t) => t.kind))]);
FIELD_FLAGS.enabled = prevFlag;
