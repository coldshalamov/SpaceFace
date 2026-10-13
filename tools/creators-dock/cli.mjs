#!/usr/bin/env node
// Creator's Dock CLI. JSON in, JSON out. Does not write the game catalog.

import fs from 'node:fs';
import path from 'node:path';
import { applyRequest } from './lib/agent.mjs';
import { compositionIds, getComposition, listCompositions } from './lib/compositions.mjs';
import { exportProject } from './lib/export.mjs';
import { readJson, writeExportTree } from './lib/io.mjs';
import { runProject, validateProject } from './lib/labRun.mjs';
import { examplesRoot, resolveDockRead, resolveWorkspace } from './lib/paths.mjs';
import { safeStableStringify, stableStringify } from './lib/stableJson.mjs';
import { probeUserContentDir } from './lib/userProbe.mjs';
import { startServer } from './serve.mjs';

const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_USAGE = 2;

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return EXIT_OK;
  }
  if (command === 'list-examples') {
    process.stdout.write(stableStringify({ ok: true, examples: listCompositions() }));
    return EXIT_OK;
  }
  if (command === 'materialize-examples') {
    const dir = examplesRoot();
    const written = [];
    for (const id of compositionIds()) {
      const project = getComposition(id);
      const file = path.join(dir, `${id}.dock.json`);
      fs.writeFileSync(file, stableStringify(project));
      written.push(file);
    }
    process.stdout.write(stableStringify({ ok: true, written }));
    return EXIT_OK;
  }
  if (command === 'serve') {
    const port = Number(flags.port || process.env.CREATORS_DOCK_PORT || 8765);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      process.stdout.write(stableStringify({ ok: false, issues: ['port must be an integer 1-65535'] }));
      return EXIT_USAGE;
    }
    const server = await startServer(port);
    process.stdout.write(stableStringify({ ok: true, url: `http://127.0.0.1:${server.address().port}/` }));
    return EXIT_OK;
  }
  if (command === 'apply') {
    const loaded = readFlagFile(flags.request, 'request');
    if (!loaded.ok) return fail(loaded.issues);
    const result = applyRequest(loaded.value);
    if (flags.out) {
      if (!result.ok) return emit(result, EXIT_FAIL);
      const target = resolveWorkspace(flags.out, 'out');
      if (!target.ok) return fail(target.issues);
      fs.mkdirSync(path.dirname(target.path), { recursive: true });
      fs.writeFileSync(target.path, stableStringify(result.project));
      result.wrote = target.path;
    }
    return emit(result, result.ok ? EXIT_OK : EXIT_FAIL);
  }
  if (command === 'validate' || command === 'run' || command === 'export') {
    const loaded = loadProject(flags);
    if (!loaded.ok) return fail(loaded.issues);
    if (command === 'validate') {
      const result = await validateProject(loaded.project);
      return emit(result, result.ok ? EXIT_OK : EXIT_FAIL);
    }
    if (command === 'run') {
      const result = await runProject(loaded.project);
      return emit(result, result.ok ? EXIT_OK : EXIT_FAIL);
    }
    const exported = await exportProject(loaded.project);
    if (!exported.ok) return emit({ ok: false, issues: exported.issues, manifest: exported.manifest }, EXIT_FAIL);
    const outFlag = flags.out || path.join('exports', exported.scenario.id);
    const target = resolveWorkspace(outFlag, 'out');
    if (!target.ok) return fail(target.issues);
    writeExportTree(target.path, exported);
    let probe = null;
    if (exported.pack) {
      probe = await probeUserContentDir(path.join(target.path, 'mod'));
    }
    const ok = !probe || probe.ok;
    return emit({
      ok,
      issues: exported.issues,
      manifest: exported.manifest,
      out: target.path,
      probe: probe && { ok: probe.ok, result: probe.result, stderr: probe.stderr },
    }, ok ? EXIT_OK : EXIT_FAIL);
  }
  return fail([`unknown command "${command}"`]);
}

function loadProject(flags) {
  if (flags.example) {
    const project = getComposition(flags.example);
    if (!project) return { ok: false, issues: [`unknown example "${flags.example}"`] };
    return { ok: true, project };
  }
  if (!flags.project) return { ok: false, issues: ['--project or --example is required'] };
  const file = resolveDockRead(flags.project, 'project');
  if (!file.ok) return file;
  return { ok: true, project: readJson(file.path) };
}

function readFlagFile(userPath, label) {
  if (!userPath) return { ok: false, issues: [`--${label} is required`] };
  const file = resolveDockRead(userPath, label);
  if (!file.ok) return file;
  return { ok: true, value: readJson(file.path) };
}

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq >= 0) flags[body.slice(0, eq)] = body.slice(eq + 1);
    else if (args[i + 1] && !args[i + 1].startsWith('--')) flags[body] = args[++i];
    else flags[body] = true;
  }
  return flags;
}

function emit(value, code) {
  let text;
  try {
    text = stableStringify(value);
  } catch (error) {
    text = safeStableStringify({ ok: false, issues: ['scene could not be cloned'] });
    return writeEmit(text, EXIT_FAIL);
  }
  return writeEmit(text, code);
}

function writeEmit(text, code) {
  process.stdout.write(text);
  return code;
}

function fail(issues) {
  process.stdout.write(stableStringify({ ok: false, issues }));
  return EXIT_USAGE;
}

function printHelp() {
  process.stderr.write(`Creator's Dock

  node tools/creators-dock/cli.mjs list-examples
  node tools/creators-dock/cli.mjs validate --example dock.intercept-cargo
  node tools/creators-dock/cli.mjs run --example dock.intercept-cargo
  node tools/creators-dock/cli.mjs export --example dock.bank-shot --out exports/bank-shot
  node tools/creators-dock/cli.mjs apply --request examples/agent-requests/01-create.json
  node tools/creators-dock/cli.mjs serve --port 8765
  node tools/creators-dock/cli.mjs materialize-examples

Paths stay inside tools/creators-dock. Exports write under tools/creators-dock/workspace.
Validate and run call the shipped lab schema and runLabScenario. This tool does not simulate.
`);
}

main().then((code) => {
  if (code !== EXIT_OK || process.argv[2] !== 'serve') process.exit(code);
}).catch((error) => {
  process.stdout.write(stableStringify({ ok: false, issues: [error && error.message ? error.message : String(error)] }));
  process.exit(1);
});
