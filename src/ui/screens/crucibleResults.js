// Crucible results screen module (PQ-133.02 / CRU-018).
//
// The queue row for PQ-133.02 names `src/ui/screens/crucibleResults.js` as the
// results owner. The surface itself lives in `src/ui/screens/crucible.js` as
// `crucibleResultsScreen` (id `crucibleResults`); uiRoot registers that module
// directly, so this file is deliberately only the named alias that lets the queue
// path resolve to the live surface — never a second implementation.

export { crucibleResultsScreen } from './crucible.js';
