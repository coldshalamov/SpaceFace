// Predictive compile of the next real contact hull from traffic intent.
// Queues an existing mesh — never a dummy draw or dummy program key.

export function pickNextContactCompileSubject(state, meshes) {
  if (!state || !meshes || typeof meshes.get !== 'function') return null;
  const player = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  if (!player || !player.pos) return null;
  const ships = (state.entityIndex && state.entityIndex.shipLike) || [];
  let best = null;
  let bestScore = Infinity;
  for (let i = 0; i < ships.length; i++) {
    const entity = ships[i];
    if (!entity || entity.alive === false || entity.id === state.playerId) continue;
    const mesh = meshes.get(entity.id);
    if (!mesh || !mesh.userData) continue;
    if (mesh.userData.pipelinesPending !== true) continue;
    const intent = entity.data && entity.data.intent;
    const kind = intent && (intent.kind || intent.type);
    const inbound = kind === 'travel' || kind === 'hunt' || kind === 'intercept'
      || kind === 'attack' || kind === 'escort' || kind === 'patrol';
    const dx = (entity.pos.x || 0) - player.pos.x;
    const dz = (entity.pos.z || 0) - player.pos.z;
    const score = (dx * dx + dz * dz) * (inbound ? 0.25 : 1);
    if (score < bestScore) {
      bestScore = score;
      best = mesh;
    }
  }
  return best;
}
