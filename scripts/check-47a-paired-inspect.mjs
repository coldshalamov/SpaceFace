#!/usr/bin/env node
// The aggregate owns this process; standalone checks keep their normal entry points.
import { enablePairedInspectCache } from './lib/check-47a-common.mjs';

enablePairedInspectCache();
for (const [id, path] of [
  ['check:47a:spindle', './check-47a-spindle.mjs'],
  ['check:47a:scavenger-threat', './check-47a-scavenger-threat.mjs'],
]) {
  const started = Date.now();
  let error = null;
  try { await import(path); } catch (failure) { error = String(failure?.stack || failure); }
  const result = { id, ok: error === null, durationMs: Date.now() - started, error };
  if (process.send) await new Promise((resolve) => process.send(result, resolve));
  else console.log(JSON.stringify(result));
}
