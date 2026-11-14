// Compatibility re-export — the dock-attention read model now lives in src/missions/ so the
// flight radio and the station dock share the same cargo/clauses/settlement truth.
export { missionDockAttention, default } from '../../missions/missionAttention.js';
