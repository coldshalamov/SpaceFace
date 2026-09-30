import { runTumbleCase } from './lib/bench/scenarios/feel.tumble_trail.mjs';
const r = await runTumbleCase({ seed: 4242, caseName: 'saturated_tumble', deltaV: 120, eventTrace: [] });
console.log(JSON.stringify(r, null, 1));
