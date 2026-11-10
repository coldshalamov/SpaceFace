#!/usr/bin/env node
// PQ-033.03 — Steamworks achievement export, generated from src/data/achievements.js.
//
// Writes (deterministic: no timestamps, LF line endings):
//   build/steam/achievements/achievements.csv   the checklist the owner pastes into the Steamworks
//                                               partner site, one row per achievement, in order
//   build/steam/achievements/achievements.vdf   the same table as Valve KeyValues text, for tooling
//   build/steam/achievements/achievements.json  machine-readable copy
//   electron/steamAchievements.json             the id -> Steam API name table the desktop shell
//                                               validates every renderer unlock request against
//
// The Steamworks partner site has no official bulk achievement importer, so the CSV is a paste list,
// not an upload. Each row names its achieved and unachieved icon files, which
// `npm run build:store-assets` draws from the kit glyph the definition names.
//
// Usage:
//   node scripts/export-steam-achievements.mjs          write the files
//   node scripts/export-steam-achievements.mjs --check  exit 1 when a file is missing or stale
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACHIEVEMENTS,
  describeAchievementRule,
  validateAchievementDefinitions,
} from '../src/data/achievements.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const STEAM_ACHIEVEMENT_TABLE_SCHEMA = 'spaceface.steamAchievements.v1';
export const EXPORT_SOURCE = 'src/data/achievements.js';

export const EXPORT_FILES = Object.freeze({
  csv: 'build/steam/achievements/achievements.csv',
  vdf: 'build/steam/achievements/achievements.vdf',
  json: 'build/steam/achievements/achievements.json',
  electronTable: 'electron/steamAchievements.json',
});

/** Where `npm run build:store-assets` writes every achievement's two Steam icons. */
export const ACHIEVEMENT_ICON_OUT_REL = 'build/store/steam/achievements';

/** The achieved and unachieved icon file names of one achievement (64x64 JPEG, named by API name). */
export function achievementIconFiles(def) {
  return Object.freeze({
    achieved: `${def.steamApiName}_achieved.jpg`,
    unachieved: `${def.steamApiName}_unachieved.jpg`,
  });
}

function csvCell(value) {
  const text = String(value == null ? '' : value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function renderAchievementCsv(defs = ACHIEVEMENTS) {
  const header = ['order', 'api_name', 'display_name', 'description', 'hidden', 'set_by', 'category', 'unlock_rule', 'achieved_icon', 'unachieved_icon'];
  const rows = defs.map((def, index) => {
    const icons = achievementIconFiles(def);
    return [
      index + 1,
      def.steamApiName,
      def.name,
      def.description,
      def.hidden ? 1 : 0,
      'Client',
      def.category,
      describeAchievementRule(def),
      `${ACHIEVEMENT_ICON_OUT_REL}/${icons.achieved}`,
      `${ACHIEVEMENT_ICON_OUT_REL}/${icons.unachieved}`,
    ];
  });
  return `${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

function vdfString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function renderAchievementVdf(defs = ACHIEVEMENTS) {
  const lines = [
    '"SpaceFaceAchievements"',
    '{',
    `\t"schema"\t\t${vdfString(STEAM_ACHIEVEMENT_TABLE_SCHEMA)}`,
    `\t"source"\t\t${vdfString(EXPORT_SOURCE)}`,
    '\t"achievements"',
    '\t{',
  ];
  defs.forEach((def, index) => {
    const icons = achievementIconFiles(def);
    lines.push(
      `\t\t${vdfString(index + 1)}`,
      '\t\t{',
      `\t\t\t"api_name"\t\t${vdfString(def.steamApiName)}`,
      `\t\t\t"hidden"\t\t${vdfString(def.hidden ? 1 : 0)}`,
      '\t\t\t"set_by"\t\t"client"',
      '\t\t\t"display"',
      '\t\t\t{',
      '\t\t\t\t"name"',
      '\t\t\t\t{',
      `\t\t\t\t\t"english"\t\t${vdfString(def.name)}`,
      '\t\t\t\t}',
      '\t\t\t\t"desc"',
      '\t\t\t\t{',
      `\t\t\t\t\t"english"\t\t${vdfString(def.description)}`,
      '\t\t\t\t}',
      `\t\t\t\t"icon"\t\t${vdfString(icons.achieved)}`,
      `\t\t\t\t"icon_gray"\t\t${vdfString(icons.unachieved)}`,
      '\t\t\t}',
      '\t\t}',
    );
  });
  lines.push('\t}', '}');
  return `${lines.join('\n')}\n`;
}

export function renderAchievementJson(defs = ACHIEVEMENTS) {
  return `${JSON.stringify({
    schema: STEAM_ACHIEVEMENT_TABLE_SCHEMA,
    source: EXPORT_SOURCE,
    count: defs.length,
    achievements: defs.map((def, index) => {
      const icons = achievementIconFiles(def);
      return {
        order: index + 1,
        id: def.id,
        apiName: def.steamApiName,
        name: def.name,
        description: def.description,
        hidden: def.hidden,
        category: def.category,
        rule: { ...def.rule },
        ruleText: describeAchievementRule(def),
        icon: def.icon,
        iconFiles: {
          achieved: `${ACHIEVEMENT_ICON_OUT_REL}/${icons.achieved}`,
          unachieved: `${ACHIEVEMENT_ICON_OUT_REL}/${icons.unachieved}`,
        },
      };
    }),
  }, null, 2)}\n`;
}

export function renderElectronTable(defs = ACHIEVEMENTS) {
  return `${JSON.stringify({
    schema: STEAM_ACHIEVEMENT_TABLE_SCHEMA,
    source: EXPORT_SOURCE,
    achievements: defs.map((def) => ({ id: def.id, apiName: def.steamApiName })),
  }, null, 2)}\n`;
}

export function renderExports(defs = ACHIEVEMENTS) {
  return {
    [EXPORT_FILES.csv]: renderAchievementCsv(defs),
    [EXPORT_FILES.vdf]: renderAchievementVdf(defs),
    [EXPORT_FILES.json]: renderAchievementJson(defs),
    [EXPORT_FILES.electronTable]: renderElectronTable(defs),
  };
}

const normalizeEol = (text) => String(text).replace(/\r\n/g, '\n');

/** Compare the rendered exports with the files under `root`. */
export function checkExports({ root = ROOT, defs = ACHIEVEMENTS } = {}) {
  const failures = [];
  const verdict = validateAchievementDefinitions(defs);
  if (!verdict.ok) failures.push(...verdict.issues.map((issue) => `definitions: ${issue}`));
  for (const [rel, expected] of Object.entries(renderExports(defs))) {
    const file = path.join(root, rel);
    if (!existsSync(file)) {
      failures.push(`${rel}: missing (run npm run steam:achievements)`);
      continue;
    }
    if (normalizeEol(readFileSync(file, 'utf8')) !== normalizeEol(expected)) {
      failures.push(`${rel}: stale against ${EXPORT_SOURCE} (run npm run steam:achievements)`);
    }
  }
  return { ok: failures.length === 0, failures };
}

export function writeExports({ root = ROOT, defs = ACHIEVEMENTS } = {}) {
  const verdict = validateAchievementDefinitions(defs);
  if (!verdict.ok) throw new Error(`achievement definitions are invalid:\n${verdict.issues.join('\n')}`);
  const written = [];
  for (const [rel, content] of Object.entries(renderExports(defs))) {
    const file = path.join(root, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    const current = existsSync(file) ? normalizeEol(readFileSync(file, 'utf8')) : null;
    if (current === normalizeEol(content)) continue;
    writeFileSync(file, content, 'utf8');
    written.push(rel);
  }
  return written;
}

function main(argv) {
  if (argv.includes('--check')) {
    const result = checkExports();
    if (!result.ok) {
      console.error(`[steam-achievements] FAIL ${result.failures.length} problem(s):`);
      for (const failure of result.failures) console.error(`  - ${failure}`);
      process.exitCode = 1;
      return;
    }
    console.log(`[steam-achievements] ok ${ACHIEVEMENTS.length} achievements; ${Object.keys(EXPORT_FILES).length} exports current`);
    return;
  }
  const written = writeExports();
  console.log(`[steam-achievements] ${ACHIEVEMENTS.length} achievements; wrote ${written.length ? written.join(', ') : 'nothing (already current)'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
