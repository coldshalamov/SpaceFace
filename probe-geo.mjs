// Geometry map: where does the released load's lane sit vs the fork mouth?
import { projectBreakawayForkMouth, BREAKAWAY_CAPTURE_FORK, BREAKAWAY_CARRIER, BREAKAWAY_SP07 } from './src/data/heistFacilities.js';

const mouth = projectBreakawayForkMouth(BREAKAWAY_CAPTURE_FORK);
console.log('mouth', JSON.stringify(mouth));
console.log('fork', JSON.stringify(BREAKAWAY_CAPTURE_FORK));
console.log('carrier', JSON.stringify(BREAKAWAY_CARRIER));
console.log('sp07', JSON.stringify(BREAKAWAY_SP07));
