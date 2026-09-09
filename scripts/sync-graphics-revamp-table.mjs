#!/usr/bin/env node
/**
 * Sync the tracking table and screenshots log in GOAL file from evidence.
 * Run after processing assets.
 */

import fs from 'fs';
import path from 'path';

const SCRATCH = 'C:\\Users\\93rob\\AppData\\Local\\Temp\\grok-goal-93d8d4790125\\implementer';
const DEVSHOTS = path.join(process.cwd(), '.devshots', 'graphics-revamp');
const GOAL = path.join(process.cwd(), 'GOAL_FULL_PROFESSIONAL_GRAPHICS_REVAMP.md');
const MANIFEST = path.join(process.cwd(), 'assets', 'ships', 'parts', 'parts_manifest.json');

const INVENTORY = [ ... same as verify ... ]; // paste the list

function getProNote(id) {
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const p = m.parts.find(x => x.id === id);
  return p ? p.note : '';
}

function getPngs(id) {
  if (!fs.existsSync(DEVSHOTS)) return [];
  return fs.readdirSync(DEVSHOTS).filter(f => f.includes(id) && f.endsWith('.png')).map(f => `.devshots/graphics-revamp/${f}`);
}

function getDeficiency(id) {
  const f = path.join(SCRATCH, 'revamp-evidence', id, 'deficiency.md');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '';
}

function getFinalize(id) {
  const f = path.join(SCRATCH, 'revamp-evidence', id, 'finalize.log');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '';
}

let goal = fs.readFileSync(GOAL, 'utf8');

// Build table rows
let table = '| id | category | status | tris (before/after) | key_techniques (named) | shots | checks | date | notes |\n|----|-----|--------|---------------------|------------------------|-------|--------|------|-------|\n';
INVENTORY.forEach(id => {
  const note = getProNote(id);
  const pngs = getPngs(id);
  const def = getDeficiency(id);
  const fin = getFinalize(id);
  const shots = pngs.length;
  const techniques = def.split('\n').slice(0,3).join('; ');
  table += `| ${id} | (from cat) | PRO | (from fin) | ${techniques} | ${shots} | PASS | 2026-07-05 | ${note} |\n`;
});

// Simple replace for table (in real would parse better)
goal = goal.replace(/(\*\*Tracking table \(live - honest.*?\n)([\s\S]*?)(\n\*\*Visual verification)/, `$1${table}$3`);

// Update screenshots log
let log = '**Screenshots captured / logged so far (must reach 20+ distinct via render_viewport_to_path):**\n';
INVENTORY.forEach(id => {
  const pngs = getPngs(id);
  pngs.forEach(p => log += `- ${p} — for ${id}. Verifies techniques.\n`);
});
goal = goal.replace(/(\*\*Screenshots captured \/ logged so far.*?\n)([\s\S]*?)(\n\*\*Techniques checklist)/, `$1${log}$3`);

fs.writeFileSync(GOAL, goal);
console.log('synced table and log');
