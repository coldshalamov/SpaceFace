#!/usr/bin/env node
import process from 'node:process';
import {
  claimFactoryJob,
  disposeFactoryJob,
  initializeFactory,
  listFactory,
  nextFactoryJob,
  recoverFactoryJob,
  recoverFactoryLock,
  returnFactoryJob,
} from './lib/finishFactory.mjs';

const usage = `Finish Factory: packet and local coordination ledger over the existing Finish boards.

  node scripts/finish-factory.mjs init --inventory=FILE --board=FILE --board-ref=REF --controller=ID [--batch-count=N] [--write-paths=a,b] [--input-paths=a,b] [--out=.devshots/finish/studio-NAME]
  node scripts/finish-factory.mjs list --run=RUN_DIR
  node scripts/finish-factory.mjs next --run=RUN_DIR
  node scripts/finish-factory.mjs claim --run=RUN_DIR --job=ID --owner=ID [--mode=readonly|writer] [--resources=gpu]
  node scripts/finish-factory.mjs return --run=RUN_DIR --job=ID --owner=ID --status=returned|blocked|failed --summary=TEXT [--artifact=PATH]
  node scripts/finish-factory.mjs disposition --run=RUN_DIR --job=ID --controller=ID --decision=accepted|rework|rejected --note=TEXT
  node scripts/finish-factory.mjs recover --run=RUN_DIR --job=ID --controller=ID --claim-nonce=NONCE --note=TEXT
  node scripts/finish-factory.mjs recover-lock --run=RUN_DIR --controller=ID --scope=run|resources --nonce=NONCE --note=TEXT

init consumes inventory.ships[] or inventory.rows[], records HEAD provenance and pins inventory/board/source bytes,
and writes under .devshots/finish/studio-*. next emits a compact packet for the configured native collaboration
dispatch; it does not launch an agent or select a model. A worker return is never acceptance. Only the controller
may disposition a returned job. GPU claims are exclusive across factory runs until the owner returns the job.
Declare relevant source modules with --input-paths or inventory/row inputPaths; referenced asset files and writer paths
are also pinned. Unrelated commits do not stale a packet. Own writer changes are captured on return and guarded
until disposition. Interrupted claims/returns retain their nonce and can be retried. recover abandons a stopped
native worker as failed (or completes its pending return); the controller must establish worker shutdown first.
Locks never auto-expire. list exposes lock nonces; recover-lock refuses live operation PIDs and serializes repair.
Finish boards remain authoritative; the existing agent-loop plan and agent-checkpoint/agent-run workflows are reused.\n`;

async function main(argv) {
  if (!argv.length || argv[0] === 'help' || argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write(usage);
    return 0;
  }
  const [command, ...tokens] = argv;
  const options = parseArgs(tokens);
  if (command === 'init') {
    const result = await initializeFactory({
      inventoryPath: required(options, 'inventory'),
      boardPath: required(options, 'board'),
      boardReference: options['board-ref'] || null,
      controller: required(options, 'controller'),
      batchCount: options['batch-count'] === undefined ? 1 : Number(options['batch-count']),
      writePaths: options['write-paths'] || [],
      inputPaths: options['input-paths'] || [],
      outDir: options.out || null,
      label: options.label || 'factory',
    });
    output({ runDir: result.runDir, runId: result.state.runId, baseHead: result.state.baseHead,
      inputHash: result.state.inputHash, batchCount: result.state.batchCount,
      rowCount: result.state.rowCount, freshness: result.freshness });
    return 0;
  }
  const runDir = required(options, 'run');
  if (command === 'list') {
    const result = await listFactory({ runDir });
    output({ runDir: result.runDir, freshness: result.freshness,
      runId: result.state.runId, controller: result.state.controllerId,
      baseHead: result.state.baseHead, inputHash: result.state.inputHash,
      factoryCodeSha256: result.state.factoryCodeSha256,
      activeGpuLease: result.state.activeGpuLease,
      globalResources: result.globalResources,
      locks: result.locks,
      jobFreshness: result.jobFreshness,
      jobs: result.state.jobs.map((job) => ({ ...job, packetPath: job.packetPath })),
      events: result.state.events });
    return 0;
  }
  if (command === 'next') {
    const result = await nextFactoryJob({ runDir });
    output(result);
    return result.job ? 0 : 1;
  }
  if (command === 'claim') {
    const result = await claimFactoryJob({ runDir,
      jobId: required(options, 'job'), owner: required(options, 'owner'),
      mode: options.mode || 'readonly', resources: options.resources || [] });
    output({ ...result, dispatch: 'Export this packet to the explicitly configured native collaboration mechanism; no hidden agent/model API is invoked.' });
    return 0;
  }
  if (command === 'return') {
    const result = await returnFactoryJob({ runDir,
      jobId: required(options, 'job'), owner: required(options, 'owner'),
      status: options.status || 'returned', summary: required(options, 'summary'),
      artifacts: options.artifact || [] });
    output(result);
    return 0;
  }
  if (command === 'disposition') {
    const result = await disposeFactoryJob({ runDir,
      jobId: required(options, 'job'), controller: required(options, 'controller'),
      decision: required(options, 'decision'), note: required(options, 'note') });
    output(result);
    return 0;
  }
  if (command === 'recover') {
    output(await recoverFactoryJob({ runDir, jobId: required(options, 'job'), controller: required(options, 'controller'),
      claimNonce: required(options, 'claim-nonce'), note: required(options, 'note') }));
    return 0;
  }
  if (command === 'recover-lock') {
    output(await recoverFactoryLock({ runDir, controller: required(options, 'controller'), scope: required(options, 'scope'),
      nonce: required(options, 'nonce'), note: required(options, 'note') }));
    return 0;
  }
  throw new Error(`unknown command: ${command}`);
}

function parseArgs(tokens) {
  const options = Object.create(null);
  const repeated = new Set(['write-paths', 'input-paths', 'artifact']);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) throw new Error(`unexpected positional argument: ${token}`);
    const at = token.indexOf('=');
    const key = token.slice(2, at < 0 ? undefined : at);
    const inline = at >= 0 ? token.slice(at + 1) : null;
    const value = inline ?? (tokens[index + 1] && !tokens[index + 1].startsWith('--') ? tokens[++index] : null);
    if (value == null || value === '') throw new Error(`--${key} requires a value`);
    if (Object.hasOwn(options, key) && !repeated.has(key)) throw new Error(`duplicate option --${key}`);
    if (repeated.has(key)) (options[key] ||= []).push(value);
    else options[key] = value;
  }
  return options;
}

function required(options, key) {
  const value = options[key];
  if (value == null || value === '') throw new Error(`--${key} is required`);
  return value;
}

function output(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }

if (process.argv[1] && process.argv[1].endsWith('finish-factory.mjs')) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; })
    .catch((error) => { console.error(`finish-factory: ${error.message}`); process.exitCode = 2; });
}
