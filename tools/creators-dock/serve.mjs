// Local editor host. Binds 127.0.0.1 only. No catalog writes.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyRequest } from './lib/agent.mjs';
import { getComposition, listCompositions } from './lib/compositions.mjs';
import { loadDialect } from './lib/dialect.mjs';
import { exportProject } from './lib/export.mjs';
import { writeExportTree } from './lib/io.mjs';
import { runProject, validateProject } from './lib/labRun.mjs';
import { resolveWorkspace, workspaceRoot } from './lib/paths.mjs';
import { PROJECT_SCHEMA } from './lib/scene.mjs';
import { stableStringify } from './lib/stableJson.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const PUBLIC = path.join(ROOT, 'public');
const MAX_BODY = 600 * 1024;
const FILES = new Map([
  ['/', path.join(PUBLIC, 'index.html')],
  ['/index.html', path.join(PUBLIC, 'index.html')],
  ['/editor.js', path.join(PUBLIC, 'editor.js')],
  ['/editor.css', path.join(PUBLIC, 'editor.css')],
  ['/lib/scene.mjs', path.join(ROOT, 'lib', 'scene.mjs')],
  ['/lib/stableJson.mjs', path.join(ROOT, 'lib', 'stableJson.mjs')],
  ['/lib/history.mjs', path.join(ROOT, 'lib', 'history.mjs')],
  ['/lib/security.mjs', path.join(ROOT, 'lib', 'security.mjs')],
]);

const TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
]);

export function startServer(port = 8765) {
  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => send(res, 500, { ok: false, issues: [error.message || String(error)] }));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function handle(req, res) {
  const localPort = req.socket.localPort;
  const allowedHosts = new Set([`127.0.0.1:${localPort}`, `localhost:${localPort}`]);
  if (!allowedHosts.has(req.headers.host)) {
    send(res, 403, { ok: false, issues: ['Host must name this local workstation'] });
    return;
  }
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
    send(res, 403, { ok: false, issues: ['Origin must match this local workstation'] });
    return;
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') {
    send(res, 403, { ok: false, issues: ['Cross-site requests are refused'] });
    return;
  }
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname.includes('..')) {
    send(res, 400, { ok: false, issues: ['path traversal'] });
    return;
  }
  if (req.method === 'GET' && FILES.has(url.pathname)) {
    const file = FILES.get(url.pathname);
    const body = fs.readFileSync(file);
    res.writeHead(200, {
      'content-type': TYPES.get(path.extname(file)) || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/health') {
    send(res, 200, { ok: true, schema: PROJECT_SCHEMA });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/examples') {
    send(res, 200, { ok: true, examples: listCompositions() });
    return;
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/examples/')) {
    const id = decodeURIComponent(url.pathname.slice('/api/examples/'.length));
    if (!/^dock\.[a-z0-9-]+$/.test(id)) {
      send(res, 400, { ok: false, issues: ['example id is not a dock id'] });
      return;
    }
    const project = getComposition(id);
    if (!project) {
      send(res, 404, { ok: false, issues: [`unknown example ${id}`] });
      return;
    }
    send(res, 200, { ok: true, project });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/dialect') {
    const dialect = await loadDialect();
    send(res, 200, {
      ok: true,
      profiles: dialect.profiles,
      profileCount: dialect.profiles.length,
      draw: dialect.draw,
      zoneTypes: dialect.zoneTypes,
      signals: dialect.signals,
      labOnly: ['trigger', 'objective', 'attachment', 'velocity', 'heading', 'input tape'],
      userContent: ['encounters', 'weapons', 'modules', 'places'],
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    const dir = path.join(workspaceRoot(), 'projects');
    fs.mkdirSync(dir, { recursive: true });
    const ids = fs.readdirSync(dir).filter((name) => name.endsWith('.dock.json')).sort();
    send(res, 200, { ok: true, projects: ids });
    return;
  }
  if (req.method === 'POST') {
    if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
      send(res, 415, { ok: false, issues: ['POST requires application/json'] });
      return;
    }
    const body = await readBody(req);
    if (!body.ok) {
      send(res, 400, { ok: false, issues: body.issues });
      return;
    }
    if (!body.value || typeof body.value !== 'object' || Array.isArray(body.value)) {
      send(res, 400, { ok: false, issues: ['Request must be a JSON object'] });
      return;
    }
    if (url.pathname === '/api/validate') {
      send(res, 200, await validateProject(body.value.project));
      return;
    }
    if (url.pathname === '/api/run') {
      const result = await runProject(body.value.project);
      send(res, 200, { ok: result.ok, certifying: result.certifying, issues: result.issues, manifest: result.manifest, run: result.run });
      return;
    }
    if (url.pathname === '/api/export') {
      let out = null;
      if (body.value.out) {
        const target = resolveWorkspace(String(body.value.out), 'out');
        if (!target.ok) {
          send(res, 400, { ok: false, issues: target.issues });
          return;
        }
        out = target.path;
      }
      const exported = await exportProject(body.value.project);
      if (!exported.ok) {
        send(res, 200, { ok: false, issues: exported.issues, manifest: exported.manifest });
        return;
      }
      if (out) writeExportTree(out, exported);
      send(res, 200, { ok: true, issues: [], manifest: exported.manifest, scenario: exported.scenario, out });
      return;
    }
    if (url.pathname === '/api/apply') {
      send(res, 200, applyRequest(body.value.request || body.value));
      return;
    }
    if (url.pathname === '/api/save') {
      const project = body.value.project;
      const validated = await validateProject(project);
      if (!validated.ok) {
        send(res, 400, { ok: false, issues: validated.issues });
        return;
      }
      const file = projectFile(project && project.id);
      if (!file) {
        send(res, 400, { ok: false, issues: ['project id cannot be saved'] });
        return;
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, stableStringify(project));
      send(res, 200, { ok: true, file });
      return;
    }
  }
  send(res, 404, { ok: false, issues: ['not found'] });
}

function projectFile(id) {
  if (typeof id !== 'string' || !/^[a-z][a-z0-9_.:-]{0,80}$/i.test(id)) return null;
  if (id.includes('..') || id.includes('/') || id.includes('\\')) return null;
  return path.join(workspaceRoot(), 'projects', `${id}.dock.json`);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        resolve({ ok: false, issues: ['body exceeds 600kb'] });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') });
      } catch (error) {
        resolve({ ok: false, issues: [`invalid JSON: ${error.message}`] });
      }
    });
    req.on('error', (error) => resolve({ ok: false, issues: [error.message] }));
  });
}

function send(res, status, value) {
  const body = stableStringify(value);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}
