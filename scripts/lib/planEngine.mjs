import fs from 'node:fs';
import path from 'node:path';

const ROTATION = ['C1', 'C2', 'C3', 'C7', 'C1', 'C4', 'C5', 'C6'];

// Read-only admission advice. A dispatch never mints rows or changes the cycle log.
export function readPlanEngine(root) {
  const relative = 'design/program/PLAN_ENGINE.md';
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) return { available: false, due: false };
  const program = fs.readFileSync(file, 'utf8');
  const map = fs.readFileSync(path.join(root, 'build_map.md'), 'utf8');
  const start = map.indexOf('## 1C.');
  const end = map.indexOf('\n## 2.', start);
  if (start < 0 || end < start) throw new Error('plan engine cannot read §1C');
  const counted = map.slice(start, end).split(/\r?\n/).filter((line) => {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    return /^\d+$/.test(cells[0] || '') && /^(BUILD|ART|FIX)$/.test(cells[3] || '')
      && /^OPEN\b/.test(cells.at(-1) || '');
  }).length;
  const catalog = fs.readFileSync(path.join(root, 'design/program/INFERENCE_IDEAS.md'), 'utf8');
  const inference = catalog.split(/\r?\n/).filter((line) => line.startsWith('|')
    && /^OPEN\b/.test(line.split('|').at(-2)?.trim() || '')).length;
  const logStart = program.indexOf('## 5. Cycle log');
  if (logStart < 0) throw new Error('plan engine cycle log missing');
  const cycles = program.slice(logStart).split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\|\s*\d{4}-\d{2}-\d{2}\s*\|\s*(C[1-8])\b/);
    return match && match[1] !== 'C8' ? [match[1]] : [];
  });
  // Replay the log so the two C1 slots retain their place in the rotation.
  let index = 0;
  for (const cycle of cycles) {
    let distance = 0;
    while (distance < ROTATION.length && ROTATION[(index + distance) % ROTATION.length] !== cycle) distance++;
    if (distance < ROTATION.length) index = (index + distance + 1) % ROTATION.length;
  }
  const overCap = counted > 120 || inference > 200;
  const low = counted < 25 || inference < 30;
  return {
    available: true, due: overCap || low, cycle: overCap ? 'C8' : ROTATION[index],
    countedRows: counted, inferenceLines: inference,
    reason: overCap ? 'plan exceeds its cap; prune with evidence' : low ? 'plan is below its refill threshold' : 'plan is saturated',
    program: relative,
  };
}

export function planEngineUnit(engine) {
  return {
    source: 'plan-engine', id: `PLAN-ENGINE-${engine.cycle}`, kind: 'planning-support',
    title: `Run plan engine ${engine.cycle}: ${engine.reason}`,
    ...engine,
    instruction: `Read ${engine.program} and run ${engine.cycle}. This is planning support and does not count as a production implementation. Verify missing claims in live code; never re-mint existing work. Outputs belong on the existing board/catalog only. Record the completed cycle in §5, run the named plan checks, and publish exact paths to origin master.`,
  };
}
