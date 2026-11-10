// Worker-lane parity for one counterplay decision. The parent posts a plain input.
// The decision must match the same call on the main thread.

import { parentPort } from 'node:worker_threads';
import { decideCounterplay } from '../../src/ai/counterplay/decide.js';

parentPort.on('message', (input) => {
  const decision = decideCounterplay(input);
  parentPort.postMessage({ decision, memory: input.memory });
});
