import assert from 'node:assert/strict';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, isAbsolute, relative, resolve, sep, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SCHEMA_PATH = resolve(ROOT, 'design/production/schemas/asset-classification.schema.json');
const CLASSIFICATION_DIR = resolve(ROOT, 'design/production/asset-classifications');
const EXPECTED_SCHEMA_ID = 'spaceface://production/asset-classification.schema.json';
const TEMP_PREFIX = 'spaceface-asset-classifications-';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function matchesType(value, expected) {
  if (expected === 'null') return value === null;
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'object') return isPlainObject(value);
  if (expected === 'integer') return Number.isInteger(value);
  if (expected === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === expected;
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year, month) {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1] || 0;
}

// JSON Schema draft-07 delegates date-time to RFC3339. Its ABNF permits lowercase t/z
// and leap-second 60, while calendar fields and numeric timezone components remain bounded.
function isRfc3339DateTime(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/,
  );
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zoneHourText, zoneMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const zoneHour = zoneHourText === undefined ? 0 : Number(zoneHourText);
  const zoneMinute = zoneMinuteText === undefined ? 0 : Number(zoneMinuteText);
  return month >= 1
    && month <= 12
    && day >= 1
    && day <= daysInMonth(year, month)
    && hour <= 23
    && minute <= 59
    && second <= 60
    && zoneHour <= 23
    && zoneMinute <= 59;
}

function validateSchema(value, schema, dataPath = '$') {
  const errors = [];
  const add = (message) => errors.push(`${dataPath}: ${message}`);

  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowed.some((candidate) => matchesType(value, candidate))) {
      add(`expected type ${allowed.join('|')}`);
      return errors;
    }
  }

  if (schema.const !== undefined && !sameValue(value, schema.const)) {
    add(`must equal ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.some((candidate) => sameValue(value, candidate))) {
    add(`must be one of ${schema.enum.map((candidate) => JSON.stringify(candidate)).join(', ')}`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) add(`must have length >= ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) add(`must match ${schema.pattern}`);
    if (schema.format === 'date-time' && !isRfc3339DateTime(value)) add('must be an RFC3339 date-time');
  }
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
    add(`must be >= ${schema.minimum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) add(`must contain at least ${schema.minItems} item(s)`);
    if (schema.items) {
      value.forEach((item, index) => errors.push(...validateSchema(item, schema.items, `${dataPath}[${index}]`)));
    }
  }
  if (isPlainObject(value)) {
    const properties = schema.properties || {};
    for (const key of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${dataPath}.${key}: required field is missing`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) errors.push(`${dataPath}.${key}: additional field is not allowed`);
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(...validateSchema(value[key], childSchema, `${dataPath}.${key}`));
      }
    }
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((candidate) => validateSchema(value, candidate, dataPath).length === 0).length;
    if (matches !== 1) add(`must match exactly one oneOf branch (matched ${matches})`);
  }
  for (const clause of schema.allOf || []) {
    const conditionMatches = !clause.if || validateSchema(value, clause.if, dataPath).length === 0;
    if (conditionMatches && clause.then) errors.push(...validateSchema(value, clause.then, dataPath));
  }

  return errors;
}

function isContained(rootPath, candidatePath, { allowRoot = true } = {}) {
  const rel = relative(rootPath, candidatePath);
  if (rel === '') return allowRoot;
  return !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel);
}

function validateRelativePathSyntax(repoRoot, repoRelativePath, fieldPath) {
  const errors = [];
  if (typeof repoRelativePath !== 'string' || repoRelativePath.length === 0) {
    return { errors: [`${fieldPath}: path must be a non-empty string`], resolvedPath: null };
  }
  if (repoRelativePath !== repoRelativePath.trim()) errors.push(`${fieldPath}: path must not have surrounding whitespace`);
  if (/[\u0000-\u001f\u007f]/.test(repoRelativePath)) errors.push(`${fieldPath}: control characters are forbidden`);
  if (repoRelativePath.includes('\\')) errors.push(`${fieldPath}: use repository-relative forward slashes`);
  if (repoRelativePath.includes(':')) errors.push(`${fieldPath}: URI/drive/ADS paths are forbidden`);
  if (isAbsolute(repoRelativePath) || win32.isAbsolute(repoRelativePath)) errors.push(`${fieldPath}: absolute paths are forbidden`);
  const segments = repoRelativePath.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    errors.push(`${fieldPath}: empty, dot, and traversal segments are forbidden`);
  }
  if (errors.length > 0) return { errors, resolvedPath: null };

  const resolvedRoot = resolve(repoRoot);
  const resolvedPath = resolve(resolvedRoot, ...segments);
  if (!isContained(resolvedRoot, resolvedPath, { allowRoot: false })) {
    errors.push(`${fieldPath}: path escapes the repository root`);
  }
  return { errors, resolvedPath };
}

function validateReferencedFile(repoRoot, repoRelativePath, fieldPath, { requireExists }) {
  const syntax = validateRelativePathSyntax(repoRoot, repoRelativePath, fieldPath);
  if (syntax.errors.length > 0) return syntax.errors;

  let stat;
  try {
    stat = lstatSync(syntax.resolvedPath);
  } catch (error) {
    if (error && error.code === 'ENOENT' && !requireExists) return [];
    const reason = error && error.code === 'ENOENT' ? 'does not exist' : `is unreadable: ${error.message}`;
    return [`${fieldPath}: referenced file ${reason}: ${repoRelativePath}`];
  }
  if (stat.isSymbolicLink()) return [`${fieldPath}: symbolic-link/junction evidence is forbidden: ${repoRelativePath}`];
  if (!stat.isFile()) return [`${fieldPath}: referenced path is not a regular file: ${repoRelativePath}`];

  try {
    const realRoot = realpathSync(resolve(repoRoot));
    const realFile = realpathSync(syntax.resolvedPath);
    if (!isContained(realRoot, realFile, { allowRoot: false })) {
      return [`${fieldPath}: resolved file escapes the repository root`];
    }
  } catch (error) {
    return [`${fieldPath}: referenced file cannot be resolved: ${error.message}`];
  }
  return [];
}

function validateEntries(entries, repoRoot, schema, { requireEvidence = false } = {}) {
  const errors = [];
  const seenAssetIds = new Map();

  for (const entry of entries) {
    const label = entry.sourcePath || '<memory>';
    errors.push(...validateSchema(entry.record, schema, label));
    if (!isPlainObject(entry.record)) continue;

    const expectedAssetId = basename(label, extname(label));
    if (entry.record.assetId !== expectedAssetId) {
      errors.push(`${label}: filename must equal assetId (${JSON.stringify(entry.record.assetId)})`);
    }
    if (typeof entry.record.assetId === 'string') {
      const previous = seenAssetIds.get(entry.record.assetId);
      if (previous) errors.push(`${label}: duplicate assetId ${JSON.stringify(entry.record.assetId)} also appears in ${previous}`);
      else seenAssetIds.set(entry.record.assetId, label);
    }

    const recordRequiresEvidence = requireEvidence || entry.record.classification === 'accepted';
    if (Array.isArray(entry.record.evidencePaths)) {
      entry.record.evidencePaths.forEach((evidencePath, index) => {
        errors.push(...validateReferencedFile(repoRoot, evidencePath, `${label}.evidencePaths[${index}]`, {
          requireExists: recordRequiresEvidence,
        }));
      });
    }
    if (typeof entry.record.campaignStatePath === 'string') {
      errors.push(...validateReferencedFile(repoRoot, entry.record.campaignStatePath, `${label}.campaignStatePath`, {
        requireExists: recordRequiresEvidence,
      }));
    }
  }
  return errors;
}

function loadSchema() {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
  assert.equal(schema.$id, EXPECTED_SCHEMA_ID, `unexpected asset-classification schema: ${schema.$id}`);
  assert.equal(schema.additionalProperties, false, 'asset-classification schema must remain closed');
  return schema;
}

function validateCorpusRoot(directory, repoRoot) {
  const errors = [];
  const resolvedRepoRoot = resolve(repoRoot);
  const resolvedDirectory = resolve(directory);

  let repoStat;
  try {
    repoStat = lstatSync(resolvedRepoRoot);
  } catch (error) {
    return { errors: [`${resolvedRepoRoot}: supplied repository root is unreadable: ${error.message}`], resolvedDirectory };
  }
  if (repoStat.isSymbolicLink()) errors.push(`${resolvedRepoRoot}: supplied repository root may not be a symbolic link or junction`);
  if (!repoStat.isDirectory()) errors.push(`${resolvedRepoRoot}: supplied repository root is not a directory`);
  if (!isContained(resolvedRepoRoot, resolvedDirectory, { allowRoot: false })) {
    errors.push(`${resolvedDirectory}: classification corpus must be a contained child of the supplied repository root`);
  }
  if (errors.length > 0) return { errors, resolvedDirectory };

  let corpusStat;
  try {
    corpusStat = lstatSync(resolvedDirectory);
  } catch (error) {
    return { errors: [`${resolvedDirectory}: classification directory is unreadable: ${error.message}`], resolvedDirectory };
  }
  if (corpusStat.isSymbolicLink()) errors.push(`${resolvedDirectory}: classification corpus root may not be a symbolic link or junction`);
  if (!corpusStat.isDirectory()) errors.push(`${resolvedDirectory}: classification corpus root is not a directory`);
  if (errors.length > 0) return { errors, resolvedDirectory };

  try {
    const realRepoRoot = realpathSync(resolvedRepoRoot);
    const realDirectory = realpathSync(resolvedDirectory);
    if (!isContained(realRepoRoot, realDirectory, { allowRoot: false })) {
      errors.push(`${resolvedDirectory}: resolved classification corpus escapes the supplied repository root`);
    }
  } catch (error) {
    errors.push(`${resolvedDirectory}: classification corpus cannot be resolved: ${error.message}`);
  }
  return { errors, resolvedDirectory };
}

function loadCorpus(directory, repoRoot) {
  const entries = [];
  const rootCheck = validateCorpusRoot(directory, repoRoot);
  if (rootCheck.errors.length > 0) return { entries, errors: rootCheck.errors };

  let children;
  try {
    children = readdirSync(rootCheck.resolvedDirectory, { withFileTypes: true });
  } catch (error) {
    return { entries, errors: [`${rootCheck.resolvedDirectory}: classification directory is unreadable: ${error.message}`] };
  }
  const errors = [];
  for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
    const sourcePath = resolve(rootCheck.resolvedDirectory, child.name);
    let stat;
    try {
      stat = lstatSync(sourcePath);
    } catch (error) {
      errors.push(`${sourcePath}: classification entry is unreadable: ${error.message}`);
      continue;
    }
    if (child.isSymbolicLink() || stat.isSymbolicLink()) {
      errors.push(`${sourcePath}: symbolic-link/junction corpus entries are forbidden`);
      continue;
    }
    if (!child.isFile() || !stat.isFile()) {
      errors.push(`${sourcePath}: only regular JSON files are allowed in the classification corpus`);
      continue;
    }
    if (extname(child.name) !== '.json') {
      errors.push(`${sourcePath}: classification records must use the .json extension`);
      continue;
    }
    try {
      entries.push({ sourcePath, record: JSON.parse(readFileSync(sourcePath, 'utf8')) });
    } catch (error) {
      errors.push(`${sourcePath}: invalid JSON: ${error.message}`);
    }
  }
  if (entries.length === 0) errors.push(`${rootCheck.resolvedDirectory}: classification corpus contains no JSON records`);
  return { entries, errors };
}

function validateCorpus(
  directory = CLASSIFICATION_DIR,
  repoRoot = ROOT,
  schema = loadSchema(),
  options = {},
) {
  const loaded = loadCorpus(directory, repoRoot);
  return {
    entries: loaded.entries,
    errors: [...loaded.errors, ...validateEntries(loaded.entries, repoRoot, schema, options)],
  };
}

function makeRecord(assetId, overrides = {}) {
  return {
    schemaVersion: 1,
    assetId,
    classification: 'candidate',
    reasonCode: 'evidence_incomplete',
    candidateHash: null,
    evidencePaths: ['evidence/proof.txt'],
    campaignStatePath: null,
    openCriticalMajorCount: 0,
    authorityRole: 'orchestrator',
    classifiedBy: 'self-test',
    classifiedAt: '2026-07-10T12:00:00.000Z',
    ...overrides,
  };
}

function writeCorpusRecord(directory, record, fileName = `${record.assetId}.json`) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, fileName), `${JSON.stringify(record, null, 2)}\n`);
}

function assertFixtureRemovalSafe(fixtureRoot) {
  const resolvedFixture = resolve(fixtureRoot);
  const resolvedTemp = resolve(tmpdir());
  const fixtureStat = lstatSync(resolvedFixture);
  assert(fixtureStat.isDirectory(), 'self-test fixture must remain a directory before cleanup');
  assert(!fixtureStat.isSymbolicLink(), 'self-test fixture root must not be a symbolic link or junction');
  assert(basename(resolvedFixture).startsWith(TEMP_PREFIX), `fixture basename must start with ${TEMP_PREFIX}`);
  const realTemp = realpathSync(resolvedTemp);
  const realFixture = realpathSync(resolvedFixture);
  assert.notEqual(realFixture, realTemp, 'self-test fixture must never resolve to the OS temp root');
  assert(isContained(realTemp, realFixture, { allowRoot: false }), 'self-test fixture must resolve inside the real OS temp root');
  assert(basename(realFixture).startsWith(TEMP_PREFIX), `real fixture basename must start with ${TEMP_PREFIX}`);
}

function runSelfTest() {
  const schema = loadSchema();
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), TEMP_PREFIX));
  const repoRoot = resolve(fixtureRoot, 'repo');
  const platformNotes = [];
  mkdirSync(resolve(repoRoot, 'evidence'), { recursive: true });
  mkdirSync(resolve(repoRoot, 'campaign'), { recursive: true });
  writeFileSync(resolve(repoRoot, 'evidence/proof.txt'), 'fixture evidence\n');
  writeFileSync(resolve(repoRoot, 'campaign/state.json'), '{}\n');

  const entry = (assetId, record = makeRecord(assetId), sourceName = `${assetId}.json`) => ({
    sourcePath: resolve(repoRoot, sourceName),
    record,
  });
  const expectEntriesPass = (label, options, ...entries) => {
    const errors = validateEntries(entries, repoRoot, schema, options);
    assert.deepEqual(errors, [], `${label} should pass:\n${errors.join('\n')}`);
  };
  const expectEntriesFail = (label, expectedPattern, options, ...entries) => {
    const errors = validateEntries(entries, repoRoot, schema, options);
    assert(errors.length > 0, `${label} should fail`);
    assert(errors.some((message) => expectedPattern.test(message)), `${label} missing ${expectedPattern}:\n${errors.join('\n')}`);
  };
  const expectCorpusPass = (label, directory, options = {}) => {
    const result = validateCorpus(directory, repoRoot, schema, options);
    assert.deepEqual(result.errors, [], `${label} should pass:\n${result.errors.join('\n')}`);
  };
  const expectCorpusFail = (label, directory, expectedPattern, options = {}, suppliedRoot = repoRoot) => {
    const result = validateCorpus(directory, suppliedRoot, schema, options);
    assert(result.errors.length > 0, `${label} should fail`);
    assert(result.errors.some((message) => expectedPattern.test(message)), `${label} missing ${expectedPattern}:\n${result.errors.join('\n')}`);
  };

  try {
    expectEntriesPass('valid candidate', {}, entry('candidate'));
    expectEntriesPass('valid candidate with strict evidence', { requireEvidence: true }, entry('candidate'));
    expectEntriesPass('valid missing-evidence', { requireEvidence: true }, entry('missing', makeRecord('missing', {
      classification: 'missing_evidence',
      evidencePaths: [],
    })));
    expectEntriesPass('valid rejected', {}, entry('rejected', makeRecord('rejected', {
      classification: 'rejected',
      reasonCode: 'critical_or_major_defect',
      evidencePaths: [],
      openCriticalMajorCount: 1,
    })));
    expectEntriesPass('fully gated accepted', {}, entry('accepted', makeRecord('accepted', {
      classification: 'accepted',
      reasonCode: 'all_gates_passed',
      candidateHash: 'a'.repeat(64),
      campaignStatePath: 'campaign/state.json',
    })));
    expectEntriesPass('lowercase RFC3339 t/z', {}, entry('lowercase-date', makeRecord('lowercase-date', {
      classifiedAt: '2026-07-10t12:00:00z',
    })));
    expectEntriesPass('RFC3339 leap second', {}, entry('leap-second', makeRecord('leap-second', {
      classifiedAt: '2016-12-31T23:59:60Z',
    })));

    const cleanMissing = entry('clean-missing', makeRecord('clean-missing', {
      evidencePaths: ['.devshots/ignored/nonaccepted.png'],
    }));
    expectEntriesPass('clean mode permits missing non-accepted evidence', {}, cleanMissing);
    expectEntriesFail('strict mode requires non-accepted evidence', /does not exist/, { requireEvidence: true }, cleanMissing);
    expectEntriesFail('accepted evidence remains mandatory in clean mode', /does not exist/, {}, entry(
      'accepted-missing-files',
      makeRecord('accepted-missing-files', {
        classification: 'accepted',
        reasonCode: 'all_gates_passed',
        candidateHash: 'c'.repeat(64),
        evidencePaths: ['.devshots/ignored/accepted.png'],
        campaignStatePath: 'campaign/missing-state.json',
      }),
    ));

    const missingField = makeRecord('missing-field');
    delete missingField.reasonCode;
    expectEntriesFail('missing field', /required field is missing/, {}, entry('missing-field', missingField));
    expectEntriesFail('extra field', /additional field is not allowed/, {}, entry('extra-field', { ...makeRecord('extra-field'), surprise: true }));
    expectEntriesFail('bad classification enum', /must be one of/, {}, entry('bad-enum', makeRecord('bad-enum', { classification: 'approved' })));
    expectEntriesFail('bad hash', /must match exactly one oneOf branch/, {}, entry('bad-hash', makeRecord('bad-hash', { candidateHash: 'abc' })));
    expectEntriesFail('bad calendar date', /RFC3339 date-time/, {}, entry('bad-date', makeRecord('bad-date', { classifiedAt: '2026-02-30T12:00:00Z' })));
    expectEntriesFail('bad timezone range', /RFC3339 date-time/, {}, entry('bad-zone', makeRecord('bad-zone', { classifiedAt: '2026-07-10T12:00:00+24:00' })));
    expectEntriesFail('path traversal', /traversal segments are forbidden/, {}, entry('traversal', makeRecord('traversal', { evidencePaths: ['../escape.txt'] })));
    expectEntriesFail('absolute POSIX path', /absolute paths are forbidden/, {}, entry('absolute-posix', makeRecord('absolute-posix', { evidencePaths: ['/tmp/evidence.txt'] })));
    expectEntriesFail('absolute Windows path', /URI\/drive\/ADS paths are forbidden|absolute paths are forbidden/, {}, entry('absolute-win', makeRecord('absolute-win', { evidencePaths: ['C:/evidence.txt'] })));
    expectEntriesFail('URI path', /URI\/drive\/ADS paths are forbidden/, {}, entry('uri', makeRecord('uri', { evidencePaths: ['https://example.test/proof.png'] })));
    expectEntriesFail('duplicate asset IDs', /duplicate assetId/, {}, entry('duplicate'), entry('duplicate'));
    expectEntriesFail('filename/asset mismatch', /filename must equal assetId/, {}, entry('record-id', makeRecord('other-id'), 'record-id.json'));

    for (const [label, overrides] of [
      ['accepted wrong reason', { reasonCode: 'review_ready' }],
      ['accepted missing hash', { candidateHash: null }],
      ['accepted missing evidence', { evidencePaths: [] }],
      ['accepted missing campaign', { campaignStatePath: null }],
      ['accepted open defect', { openCriticalMajorCount: 1 }],
    ]) {
      const assetId = label.replaceAll(' ', '-');
      expectEntriesFail(label, /must equal|expected type|at least 1|oneOf branch/, {}, entry(assetId, makeRecord(assetId, {
        classification: 'accepted',
        reasonCode: 'all_gates_passed',
        candidateHash: 'b'.repeat(64),
        campaignStatePath: 'campaign/state.json',
        ...overrides,
      })));
    }

    const validCorpus = resolve(repoRoot, 'corpus-valid');
    writeCorpusRecord(validCorpus, makeRecord('valid-record'));
    expectCorpusPass('real valid corpus', validCorpus);
    expectCorpusPass('real valid corpus with strict evidence', validCorpus, { requireEvidence: true });

    const cleanCorpus = resolve(repoRoot, 'corpus-clean-artifact');
    writeCorpusRecord(cleanCorpus, makeRecord('clean-record', {
      evidencePaths: ['.devshots/not-present-in-clean-clone.png'],
    }));
    expectCorpusPass('clean artifact corpus with ignored non-accepted evidence', cleanCorpus);
    expectCorpusFail('strict clean artifact corpus', cleanCorpus, /does not exist/, { requireEvidence: true });

    const acceptedMissingCorpus = resolve(repoRoot, 'corpus-accepted-missing');
    writeCorpusRecord(acceptedMissingCorpus, makeRecord('accepted-missing', {
      classification: 'accepted',
      reasonCode: 'all_gates_passed',
      candidateHash: 'd'.repeat(64),
      evidencePaths: ['.devshots/missing-accepted.png'],
      campaignStatePath: 'campaign/missing-accepted.json',
    }));
    expectCorpusFail('clean artifact accepted record still needs evidence', acceptedMissingCorpus, /does not exist/);

    const malformedCorpus = resolve(repoRoot, 'corpus-malformed');
    mkdirSync(malformedCorpus, { recursive: true });
    writeFileSync(resolve(malformedCorpus, 'broken.json'), '{ nope');
    expectCorpusFail('malformed JSON corpus', malformedCorpus, /invalid JSON/);

    const emptyCorpus = resolve(repoRoot, 'corpus-empty');
    mkdirSync(emptyCorpus, { recursive: true });
    expectCorpusFail('empty corpus', emptyCorpus, /contains no JSON records/);

    const nonJsonCorpus = resolve(repoRoot, 'corpus-non-json');
    mkdirSync(nonJsonCorpus, { recursive: true });
    writeFileSync(resolve(nonJsonCorpus, 'README.txt'), 'not a record\n');
    expectCorpusFail('non-JSON corpus entry', nonJsonCorpus, /must use the .json extension/);

    const subdirectoryCorpus = resolve(repoRoot, 'corpus-subdirectory');
    mkdirSync(resolve(subdirectoryCorpus, 'nested'), { recursive: true });
    expectCorpusFail('subdirectory corpus entry', subdirectoryCorpus, /only regular JSON files/);

    expectCorpusFail('missing corpus root', resolve(repoRoot, 'corpus-missing'), /classification directory is unreadable/);
    const fileCorpusRoot = resolve(repoRoot, 'corpus-file-root.json');
    writeFileSync(fileCorpusRoot, '{}\n');
    expectCorpusFail('file-as-corpus root', fileCorpusRoot, /corpus root is not a directory/);

    const externalCorpus = resolve(fixtureRoot, 'external-corpus');
    writeCorpusRecord(externalCorpus, makeRecord('external-record'));
    expectCorpusFail('external corpus root', externalCorpus, /contained child/);
    expectCorpusFail('missing supplied repository root', validCorpus, /supplied repository root is unreadable/, {}, resolve(fixtureRoot, 'missing-repo'));

    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    const rootLink = resolve(repoRoot, 'corpus-root-link');
    try {
      symlinkSync(validCorpus, rootLink, linkType);
      expectCorpusFail('symlink/junction corpus root', rootLink, /root may not be a symbolic link or junction/);
    } catch (error) {
      platformNotes.push(`SKIP corpus-root symlink/junction fixture (${process.platform}): ${error.code || error.message}`);
    }

    const symlinkEntryCorpus = resolve(repoRoot, 'corpus-symlink-entry');
    writeCorpusRecord(symlinkEntryCorpus, makeRecord('real-entry'));
    try {
      symlinkSync(resolve(repoRoot, 'evidence'), resolve(symlinkEntryCorpus, 'linked-entry'), linkType);
      expectCorpusFail('symlink/junction corpus entry', symlinkEntryCorpus, /symbolic-link\/junction corpus entries are forbidden/);
    } catch (error) {
      platformNotes.push(`SKIP corpus-entry symlink/junction fixture (${process.platform}): ${error.code || error.message}`);
    }
  } finally {
    assertFixtureRemovalSafe(fixtureRoot);
    rmSync(fixtureRoot, { recursive: true, force: true });
  }

  console.log('Asset classification self-test OK: clean fixture allowed missing non-accepted artifacts, strict mode rejected them, and clean mode rejected accepted missing evidence; RFC3339 and corpus trust boundaries also passed.');
  for (const note of platformNotes) console.log(note);
}

function printCorpusSummary(entries, { requireEvidence }) {
  const counts = new Map();
  for (const { record } of entries) counts.set(record.classification, (counts.get(record.classification) || 0) + 1);
  const summary = [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
  const mode = requireEvidence ? 'evidence required' : 'clean mode; missing non-accepted artifacts allowed';
  console.log(`Asset classifications OK: ${entries.length} record(s) (${mode}).`);
  for (const [classification, count] of summary) console.log(`  ${classification}: ${count}`);
}

const args = process.argv.slice(2);
const allowedArgs = new Set(['--self-test', '--require-evidence']);
if (args.length > 1 || args.some((arg) => !allowedArgs.has(arg))) {
  console.error('Usage: node scripts/check-asset-classifications.mjs [--self-test | --require-evidence]');
  process.exit(2);
}

if (args[0] === '--self-test') {
  runSelfTest();
} else {
  const options = { requireEvidence: args[0] === '--require-evidence' };
  const result = validateCorpus(CLASSIFICATION_DIR, ROOT, loadSchema(), options);
  if (result.errors.length > 0) {
    console.error(`Asset classification validation failed with ${result.errors.length} error(s):`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  printCorpusSummary(result.entries, options);
}
