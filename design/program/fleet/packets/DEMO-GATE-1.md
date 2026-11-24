# DEMO-GATE-1 — measure the demo route honestly (read-only)

**For:** a measurement agent. **Kind:** READ-ONLY. Change no tracked file; write RECEIPT.md.

Run, each through the game lock (`node scripts/fleet/game-lock.mjs run -- <cmd>`, never steal focus):
1. `npm run check:no-freeze -- --no-focus-steal`
2. `npm run check:smooth -- --routes=swarm-r2,swarm-r6`
3. `node scripts/probe-first-swarm-minute.mjs` (twice)
4. `npm run check:playable` (if it exists; read package.json)
5. `npm run check:sim`
Before each, note how loaded the machine is (other agents run here: record the CPU load the tools
print, or `Get-Counter '\Processor(_Total)\% Processor Time'` samples).
Report a table: route | world speed (overall / worst 10 s) | frame p50 / p95 | frames >100 ms |
longest gap | press->control s | Again->control s | pass/fail per gate; plus the machine load beside
each. Open the probe's contact sheets and list anything a stranger would notice (rings, white-outs,
jargon, overlap). No fixes.
