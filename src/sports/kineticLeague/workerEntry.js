import { parentPort, workerData } from 'node:worker_threads';
import { exhibitTrace } from './session.js';

const eventId = workerData.eventId;
const seed = workerData.seed;
parentPort.postMessage(exhibitTrace(eventId, seed));
