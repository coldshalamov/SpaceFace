import { writeFileSync } from 'node:fs';
import { runCreditsPulseReflowAb } from '../../../../src/ui/hud.js';
const ab = runCreditsPulseReflowAb({ rounds: 8000 });
writeFileSync(new URL('./hud-credits-pulse-no-reflow-bench.json', import.meta.url), `${JSON.stringify(ab, null, 2)}\n`);
console.log(JSON.stringify(ab, null, 2));
