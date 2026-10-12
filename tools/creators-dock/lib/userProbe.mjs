import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROBE = fileURLToPath(new URL('./probeMain.mjs', import.meta.url));

export function probeUserContentDir(dir, { timeoutMs = 180000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [PROBE, dir], {
      env: { ...process.env, SPACEFACE_USER_CONTENT_DIR: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => {
      clearTimeout(timer);
      const line = stdout.trim().split('\n').filter(Boolean).pop();
      let parsed = null;
      try {
        parsed = line ? JSON.parse(line) : null;
      } catch {
        parsed = null;
      }
      resolve({
        ok: !!(parsed && parsed.ok) && code === 0,
        code,
        result: parsed,
        stderr: stderr.slice(0, 4000),
        stdout: stdout.slice(0, 2000),
      });
    });
  });
}

export async function probePackFiles(modId, files, { timeoutMs = 180000 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'creators-dock-'));
  const modDir = path.join(root, modId);
  try {
    for (const [rel, text] of Object.entries(files)) {
      if (rel.includes('..') || path.isAbsolute(rel)) {
        return { ok: false, result: null, stderr: `refusing pack path ${rel}`, code: 2 };
      }
      const file = path.join(modDir, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    }
    return await probeUserContentDir(root, { timeoutMs });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
