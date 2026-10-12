// CR situations (encounters 1200-1299) — the small shared kit their self-registered runtimes use.
//
// Nothing here owns a force, a hull, a hold or a reputation: bodies move only through physics,
// cargo through the cargo system, credits/rep through the director's intents. The kit only reads
// world state, turns an authored wreck into a loose body, and writes the outcome into the same
// durable record (story.depthProgramEncounters) the save already carries for the depth program.

export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function alive(e) { return !!e && e.alive !== false; }

export function entityById(state, id) {
  if (id == null || !state || !state.entities) return null;
  return state.entities.get(id) || null;
}

/** spawnWreck authors dead mass; make it a real loose body the Massline can latch and drag. */
export function loosenBody(e, mass, radius) {
  if (!e) return e;
  e.mass = mass;
  e.radius = radius;
  e.physicsBody = { shape: 'capsule', mass, dynamic: true };
  e.data = e.data || {};
  e.data.masslineTetherable = true;
  return e;
}

/** The world's durable memory of a situation (saved with story; read by gates and the ship ledger). */
export function situationMemory(state) {
  const story = state.story || (state.story = { flags: {} });
  if (!story.flags || typeof story.flags !== 'object') story.flags = {};
  if (!story.depthProgramEncounters || typeof story.depthProgramEncounters !== 'object') {
    story.depthProgramEncounters = { schemaVersion: 1, completed: {}, history: [] };
  }
  const memory = story.depthProgramEncounters;
  if (!memory.completed || typeof memory.completed !== 'object') memory.completed = {};
  if (!Array.isArray(memory.history)) memory.history = [];
  return memory;
}

export function priorOutcome(state, shapeId) {
  const rec = state && state.story && state.story.depthProgramEncounters
    && state.story.depthProgramEncounters.completed
    && state.story.depthProgramEncounters.completed[shapeId];
  return rec || null;
}

/** Record the outcome (with the physical facts that produced it), then resolve through the director. */
export function settleSituation(d, live, state, outcome, facts = {}) {
  const memory = situationMemory(state);
  const rec = {
    outcome,
    at: d.now(),
    tick: state.tick | 0,
    encounterId: live.id,
    sectorId: live.sectorId,
    seed: state.meta && state.meta.seed,
    facts: { ...facts },
    visits: ((memory.completed[live.shapeId] && memory.completed[live.shapeId].visits) | 0) + 1,
  };
  memory.completed[live.shapeId] = rec;
  memory.history.push({ shapeId: live.shapeId, ...rec });
  if (memory.history.length > 64) memory.history.splice(0, memory.history.length - 64);
  return d.resolve(live, outcome, { speak: true, vars: live.vars });
}

/** A stable world fact for the news wire: the receipt the sector keeps after the player leaves. */
export function publishSituationNews(d, live, text) {
  d.emit('news:publish', {
    text, kind: 'incidents', source: 'watch-relay',
    sourceRef: `${live.shapeId}:${live.id}`, eventId: `${live.shapeId}:${live.id}`,
  });
}
