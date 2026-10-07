import fs from 'node:fs';
const { runScenario, SCENARIOS, HULLS } = await import('/workspace/spaceface-scratch/lab/scripts/lab/benches/flightTurn.mjs');
const [cfgName, out] = process.argv.slice(2);
const lab = cfgName === 'master' ? {} : (process.env.TURN_LAB ? JSON.parse(process.env.TURN_LAB) : { yawFrac: true, commandSlip: true });
const fd = fs.openSync(out, 'w');
for (const ship of HULLS) for (const sc of Object.keys(SCENARIOS)) {
  try { const r = await runScenario(sc, { shipId: ship, params: { turnLab: lab } }); delete r._rates; fs.writeSync(fd, JSON.stringify({ cfg: cfgName, ...r }) + '\n'); }
  catch (e) { fs.writeSync(fd, JSON.stringify({ cfg: cfgName, scenario: sc, shipId: ship, error: String(e.message) }) + '\n'); }
}
