const { runScenario, SCENARIOS } = await import('/workspace/spaceface-scratch/lab/scripts/lab/benches/flightTurn.mjs');
const ship = process.argv[2] || 'ship_kestrel';
const lab = process.env.TURN_LAB ? JSON.parse(process.env.TURN_LAB) : {};
for (const sc of (process.argv[3] ? process.argv[3].split(',') : Object.keys(SCENARIOS))) {
  const r = await runScenario(sc, { shipId: ship, params: { turnLab: lab } });
  delete r._rates;
  console.log(JSON.stringify(r));
}
