// Executable demonstration: node src/sports/kineticLeague/play.mjs --event=kl-01 --seed=1001
import { exhibitTrace, EVENTS, sportManifest } from './index.js';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [k, v] = arg.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));

if (args.list) {
  for (const event of EVENTS) {
    console.log(`${event.id}  ${event.sport.padEnd(8)} ${event.arena.padEnd(6)} ${event.tier.padEnd(14)} ${event.title}`);
  }
  process.exit(0);
}

const eventId = args.event || 'kl-01';
const seed = Number(args.seed || 1001);
const trace = exhibitTrace(eventId, seed);
console.log(JSON.stringify({ manifest: sportManifest(), trace }, null, 2));
process.exit(trace.won ? 0 : 1);
