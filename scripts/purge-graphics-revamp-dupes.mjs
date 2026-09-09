#!/usr/bin/env node
/**
 * Purge duplicate PNGs and deficiency.md files.
 * Keep one per unique content (MD5 for PNG, SHA256 for def).
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DEVSHOTS = path.join(process.cwd(), '.devshots', 'graphics-revamp');
const SCRATCH = 'C:\\Users\\93rob\\AppData\\Local\\Temp\\grok-goal-93d8d4790125\\implementer';
const EVIDENCE = path.join(SCRATCH, 'revamp-evidence');

function hashFile(file) {
  const data = fs.readFileSync(file);
  return crypto.createHash('md5').update(data).digest('hex');
}

function hashFileSha(file) {
  const data = fs.readFileSync(file);
  return crypto.createHash('sha256').update(data).digest('hex');
}

let deletedPng = 0;
if (fs.existsSync(DEVSHOTS)) {
  const pngs = fs.readdirSync(DEVSHOTS).filter(f => f.endsWith('.png')).map(f => path.join(DEVSHOTS, f));
  const groups = {};
  pngs.forEach(p => {
    const h = hashFile(p);
    if (!groups[h]) groups[h] = [];
    groups[h].push(p);
  });
  Object.values(groups).forEach(g => {
    if (g.length > 1) {
      // keep first, delete rest
      g.slice(1).forEach(f => {
        fs.unlinkSync(f);
        deletedPng++;
      });
    }
  });
}

let deletedDef = 0;
if (fs.existsSync(EVIDENCE)) {
  const ids = fs.readdirSync(EVIDENCE).filter(d => fs.statSync(path.join(EVIDENCE, d)).isDirectory());
  const defGroups = {};
  ids.forEach(id => {
    const f = path.join(EVIDENCE, id, 'deficiency.md');
    if (fs.existsSync(f)) {
      const h = hashFileSha(f);
      if (!defGroups[h]) defGroups[h] = [];
      defGroups[h].push(f);
    }
  });
  Object.values(defGroups).forEach(g => {
    if (g.length > 1) {
      g.slice(1).forEach(f => {
        fs.unlinkSync(f);
        deletedDef++;
      });
    }
  });
}

console.log(`Deleted ${deletedPng} duplicate PNGs, ${deletedDef} duplicate defs.`);