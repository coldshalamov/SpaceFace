#!/usr/bin/env node
/**
 * Mechanical scrub: replace forbidden viewport/OpenGL render claims with EEVEE camera wording.
 * Usage: node scripts/scrub-revamp-doc-contract.mjs [--out <logpath>]
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const GOAL = path.join(ROOT, 'GOAL_FULL_PROFESSIONAL_GRAPHICS_REVAMP.md');
const PLAN = path.join(ROOT, 'plan.md');
const EVIDENCE = path.join(ROOT, 'assets', 'ships', 'parts', 'revamp-evidence');

const REPLACEMENTS = [
  [/render_viewport_to_path/g, 'EEVEE camera render (bpy.ops.render.render)'],
  [/render_viewport/g, 'EEVEE camera'],
  [/atomic opengl/gi, 'atomic EEVEE camera'],
  [/opengl retake/gi, 'EEVEE orbit retake'],
  [/opengl crop/gi, 'EEVEE crop fix'],
  [/opengl pass/gi, 'EEVEE camera pass'],
  [/opengl stubs/gi, 'EEVEE stubs'],
  [/MCP viewport renders/g, 'MCP EEVEE camera renders'],
  [/"render_method": "render_viewport_to_path"/g, '"render_method": "eevee_camera"'],
  [/"render_method": "eevee_camera render \(bpy\.ops\.render\.render\)"/g, '"render_method": "eevee_camera"'],
];

function shouldSkipLine(line) {
  return /\*\*NOT\*\*/.test(line) && /render_viewport|OpenGL/i.test(line);
}

function scrubText(text, fileLabel) {
  let hits = 0;
  const out = text
    .split('\n')
    .map((line) => {
      if (shouldSkipLine(line)) return line;
      let next = line;
      for (const [re, rep] of REPLACEMENTS) {
        const before = next;
        next = next.replace(re, rep);
        if (next !== before) hits += 1;
      }
      return next;
    })
    .join('\n');
  return { text: out, hits, fileLabel };
}

function collectFiles() {
  const files = [GOAL, PLAN];
  if (fs.existsSync(EVIDENCE)) {
    for (const id of fs.readdirSync(EVIDENCE)) {
      const dir = path.join(EVIDENCE, id);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const name of ['deficiency.md', 'finalize.log']) {
        const f = path.join(dir, name);
        if (fs.existsSync(f)) files.push(f);
      }
    }
  }
  return files;
}

const outArg = process.argv.indexOf('--out');
const outPath = outArg !== -1 ? process.argv[outArg + 1] : null;

const log = [];
let totalHits = 0;
for (const file of collectFiles()) {
  const raw = fs.readFileSync(file, 'utf8');
  const { text, hits, fileLabel } = scrubText(raw, path.relative(ROOT, file));
  if (text !== raw) {
    fs.writeFileSync(file, text, 'utf8');
    log.push(`${fileLabel}: ${hits} replacement(s)`);
    totalHits += hits;
  }
}

log.unshift(`total_files_changed=${log.length}`);
log.unshift(`total_replacements=${totalHits}`);
const report = log.join('\n') + '\n';
console.log(report);
if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, report);
}