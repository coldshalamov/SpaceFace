#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const REMOTE_MASTER = 'refs/remotes/origin/master';
const INTEGRATION_BRANCH = 'integration/all-branches-20260824';
const OUT_DIR = 'design/program/branch-consolidation';
const MAX_SLICE_FILES = 260;
const MAX_SLICE_COMMITS = 100;

function git(args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const stderr = error?.stderr ? String(error.stderr).trim() : '';
    throw new Error(`git ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }
}

function lines(value) {
  return String(value || '').split(/\r?\n/).filter(Boolean);
}

function parseNameStatus(text) {
  return lines(text).map((line) => {
    const [status = '?', ...paths] = line.split('\t');
    return { status, path: paths.at(-1) || '' };
  }).filter((row) => row.path);
}

function parseTree(text) {
  const map = new Map();
  for (const line of lines(text)) {
    const match = /^(\d+)\s+(\w+)\s+([0-9a-f]+)\t(.+)$/.exec(line);
    if (match) map.set(match[4], { mode: match[1], type: match[2], sha: match[3] });
  }
  return map;
}

function sameEntry(a, b) {
  if (!a && !b) return true;
  return !!a && !!b && a.mode === b.mode && a.type === b.type && a.sha === b.sha;
}

function treeEntries(ref, paths) {
  const out = new Map();
  for (let i = 0; i < paths.length; i += 120) {
    const part = paths.slice(i, i + 120);
    if (!part.length) continue;
    for (const [path, entry] of parseTree(git(['ls-tree', '--full-tree', ref, '--', ...part]))) out.set(path, entry);
  }
  return out;
}

const master = git(['rev-parse', REMOTE_MASTER]);
const refRows = lines(git([
  'for-each-ref', '--sort=refname',
  '--format=%(refname:short)%09%(objectname)%09%(committerdate:iso8601-strict)%09%(subject)',
  'refs/remotes/origin',
]));
const refs = [];
for (const row of refRows) {
  const [short, sha, committedAt, ...subject] = row.split('\t');
  if (!short || short === 'origin/HEAD') continue;
  const name = short.replace(/^origin\//, '');
  if (name === INTEGRATION_BRANCH) continue;
  refs.push({ name, ref: `refs/remotes/origin/${name}`, sha, committedAt, subject: subject.join('\t') });
}

const namesByHead = new Map();
for (const ref of refs) {
  const group = namesByHead.get(ref.sha);
  if (group) group.push(ref.name);
  else namesByHead.set(ref.sha, [ref.name]);
}

const parentMap = new Map();
for (const row of lines(git(['rev-list', '--all', '--parents']))) {
  const [sha, ...parents] = row.split(' ');
  parentMap.set(sha, parents);
}

function nearestNamedAncestor(startSha) {
  const queue = (parentMap.get(startSha) || []).map((sha) => ({ sha, distance: 1 }));
  const visited = new Set([startSha]);
  let bestDistance = Infinity;
  const hits = [];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const item = queue[cursor];
    if (item.distance > bestDistance || visited.has(item.sha)) continue;
    visited.add(item.sha);
    const names = namesByHead.get(item.sha);
    if (names?.length) {
      bestDistance = item.distance;
      hits.push({ sha: item.sha, names: [...names].sort(), distance: item.distance });
      continue;
    }
    for (const parent of parentMap.get(item.sha) || []) queue.push({ sha: parent, distance: item.distance + 1 });
  }
  if (!hits.length) return { sha: master, names: ['master'], distance: null };
  hits.sort((a, b) => a.distance - b.distance || a.names.join(',').localeCompare(b.names.join(',')));
  return hits[0];
}

const masterTree = parseTree(git(['ls-tree', '-r', '--full-tree', REMOTE_MASTER]));
const rows = [];
for (const ref of refs) {
  if (ref.name === 'master') continue;
  const parent = nearestNamedAncestor(ref.sha);
  const sliceFiles = parseNameStatus(git([
    'diff-tree', '-r', '--no-commit-id', '--name-status', '--no-renames', parent.sha, ref.sha,
  ]));
  const paths = [...new Set(sliceFiles.map((file) => file.path))];
  const branchEntries = treeEntries(ref.ref, paths);
  let differentFromMaster = 0;
  const evidence = [];
  for (const file of sliceFiles) {
    const branchEntry = branchEntries.get(file.path) || null;
    const masterEntry = masterTree.get(file.path) || null;
    const matchesMaster = sameEntry(branchEntry, masterEntry);
    if (!matchesMaster) differentFromMaster += 1;
    evidence.push({
      ...file,
      matchesMaster,
      branchBlob: branchEntry?.sha || null,
      masterBlob: masterEntry?.sha || null,
    });
  }
  const commits = lines(git([
    'log', '--reverse', '--format=%H%x09%s', '--no-merges', `${parent.sha}..${ref.sha}`,
    `--max-count=${MAX_SLICE_COMMITS}`,
  ])).map((line) => {
    const [sha, ...subject] = line.split('\t');
    return { sha, subject: subject.join('\t') };
  });
  rows.push({
    branch: ref.name,
    head: ref.sha,
    committedAt: ref.committedAt,
    tipSubject: ref.subject,
    nearestNamedAncestor: parent,
    sliceCommitCount: Number(git(['rev-list', '--count', `${parent.sha}..${ref.sha}`])) || 0,
    sliceCommitsTruncated: commits.length >= MAX_SLICE_COMMITS,
    sliceCommits: commits,
    sliceFileCount: sliceFiles.length,
    sliceFilesTruncated: sliceFiles.length > MAX_SLICE_FILES,
    sliceFiles: evidence.slice(0, MAX_SLICE_FILES),
    sliceDifferentFromMaster: differentFromMaster,
    sliceOutcomeContained: sliceFiles.length > 0 && differentFromMaster === 0,
  });
}

const parentUse = new Map();
for (const row of rows) {
  for (const name of row.nearestNamedAncestor.names) parentUse.set(name, (parentUse.get(name) || 0) + 1);
}
for (const row of rows) row.namedChildCount = parentUse.get(row.branch) || 0;

rows.sort((a, b) => b.committedAt.localeCompare(a.committedAt) || a.branch.localeCompare(b.branch));
const leaves = rows.filter((row) => row.namedChildCount === 0);
const containedSlices = rows.filter((row) => row.sliceOutcomeContained);
const nonContainedSlices = rows.filter((row) => !row.sliceOutcomeContained && row.sliceFileCount > 0);
const emptySlices = rows.filter((row) => row.sliceFileCount === 0);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/topology.json`, `${JSON.stringify({
  schema: 1,
  generatedAt: new Date().toISOString(),
  master,
  branchCount: rows.length,
  leafCount: leaves.length,
  containedSliceCount: containedSlices.length,
  nonContainedSliceCount: nonContainedSlices.length,
  emptySliceCount: emptySlices.length,
  rows,
}, null, 2)}\n`);

const esc = (value) => String(value || '').replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
const md = [
  '# Branch-family topology',
  '',
  `Current master: \`${master}\``,
  '',
  `Named branches: **${rows.length}**`,
  `Leaf branches: **${leaves.length}**`,
  `Branch-specific slices already contained by master: **${containedSlices.length}**`,
  `Non-contained branch-specific slices: **${nonContainedSlices.length}**`,
  `Empty branch-specific slices: **${emptySlices.length}**`,
  '',
  'Each row is reduced to commits and files introduced since its nearest named ancestor, rather than the entire stale fork.',
  '',
  '## Non-contained branch-specific slices',
  '',
  '| Branch | Nearest named ancestor | Slice commits | Slice files | Children | Last commit | Tip subject |',
  '|---|---|---:|---:|---:|---|---|---|',
];
for (const row of nonContainedSlices) {
  md.push(`| \`${esc(row.branch)}\` | ${row.nearestNamedAncestor.names.map((name) => `\`${esc(name)}\``).join(', ')} | ${row.sliceCommitCount} | ${row.sliceFileCount} | ${row.namedChildCount} | ${row.committedAt.slice(0, 10)} | ${esc(row.tipSubject).slice(0, 120)} |`);
}
md.push('', '## Already-contained branch-specific slices', '');
for (const row of containedSlices) md.push(`- \`${row.branch}\` — ${row.sliceFileCount} path(s), nearest ancestor ${row.nearestNamedAncestor.names.map((name) => `\`${name}\``).join(', ')}`);
md.push('', 'Machine-readable commit and path/blob evidence is in `topology.json`.');
writeFileSync(`${OUT_DIR}/TOPOLOGY.md`, `${md.join('\n')}\n`);

console.log(JSON.stringify({
  master,
  branches: rows.length,
  leaves: leaves.length,
  containedSlices: containedSlices.length,
  nonContainedSlices: nonContainedSlices.length,
  emptySlices: emptySlices.length,
}, null, 2));
