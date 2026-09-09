// Reader for PQ-178 beat sheets. Not a campaign owner.
// Campaign 47-A stays in ./campaign47a/. This module only loads and checks
// docs/worldbuilding/beats/*.beat.json against leftover scenario facts.

import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, '..', '..');
export const BEAT_SHEET_DIR = join(REPO_ROOT, 'docs', 'worldbuilding', 'beats');
export const BEAT_SCHEMA = 'spaceface.beatStandard.v1';
export const OPENER_47A_ID = 'beat.47a.opener';
export const SCENARIO_47A_REL = 'src/data/scenarios/47a.scenario.json';
export const B0_CHAPTER_REL = 'docs/worldbuilding/sheets/chapters/B0.md';
export const TEMPLATE_ID = 'beat.template';
// Only this file may be a template sheet. Any other file that claims template
// kind is a beat trying to skip every content check.
export const TEMPLATE_FILENAME = 'TEMPLATE.beat.json';

export const REQUIRED_47A_ACTORS = Object.freeze([
  'player_kestrel',
  'evidence_spindle_47a',
  'carrier_wreck_bourse',
  'scavenger_interceptor',
  'scavenger_harasser',
  'scavenger_thief',
  'official_recovery_tug',
  'civilian_pod',
  // BEAT-STANDARD.md: "Kessler and the handoff beacon are leftover too — keep them."
  'contact_kessler',
  'kessler_handoff_beacon',
]);

export const PHYSICAL_VERBS = Object.freeze([
  'hitch', 'attach', 'reel', 'cut', 'sling', 'tow', 'fire', 'steer', 'fly',
]);

const NON_PHYSICAL_VERBS = Object.freeze([
  'choose', 'decide', 'talk', 'speak', 'watch', 'read', 'menu', 'dialogue',
  'cutscene', 'select', 'pick', 'discuss', 'narrate', 'explain', 'brief',
]);

const B0_COLLAPSE = /\b(?:mine\s+10u|veldspar|mine\s+and\s+dock|sample\s+the\s+variance\.?\s+dock)\b/i;

const REQUIRED_KEYS = Object.freeze([
  'schema', 'id', 'title', 'canon', 'register', 'setPiece', 'barks',
  'voiceNotes', 'seedCapture', 'forbidden',
]);

const SET_PIECE_KEYS = Object.freeze([
  'place', 'actors', 'headlineVerb', 'twist', 'solutions', 'provingFrame',
]);

export function readJsonFile(absPath) {
  return JSON.parse(readFileSync(absPath, 'utf8'));
}

export function loadBeatSheet(absPath) {
  return readJsonFile(absPath);
}

export function listBeatSheetFiles(dir = BEAT_SHEET_DIR) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.beat.json'))
    .map((name) => join(dir, name))
    .sort();
}

export function isPhysicalVerb(verb) {
  const token = String(verb || '').trim().toLowerCase();
  if (!token) return false;
  if (NON_PHYSICAL_VERBS.includes(token)) return false;
  return PHYSICAL_VERBS.includes(token);
}

export function load47aScenario() {
  return readJsonFile(join(REPO_ROOT, SCENARIO_47A_REL));
}

export function leftover47aMechanics(scenario) {
  const found = new Set();
  for (const actor of scenario.actors || []) {
    for (const cap of actor.capabilities || []) found.add(cap);
  }
  for (const beat of scenario.beats || []) {
    for (const mech of beat.requiredMechanics || []) found.add(mech);
  }
  return found;
}

function issue(code, message, path = '') {
  return { code, message, path };
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function actorIds(sheet) {
  const fromSet = (sheet.setPiece && sheet.setPiece.actors) || [];
  return fromSet.map((actor) => actor && actor.id).filter(Boolean);
}

function detectForbiddenForm(sheet) {
  const issues = [];
  if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) {
    issues.push(issue('prose_only', 'Sheet is not a beat object'));
    return issues;
  }
  if (sheet.kind === 'prose' || (nonEmptyString(sheet.prose) && !sheet.setPiece)) {
    issues.push(issue('prose_only', 'Prose-only sheet is not a beat', 'prose'));
  }
  const forbidden = sheet.forbidden || {};
  if (sheet.kind === 'choice_menu' || sheet.choiceMenu === true || forbidden.choiceMenu === true) {
    issues.push(issue('choice_menu', 'Choice menu is forbidden', 'choiceMenu'));
  }
  if (Array.isArray(sheet.choices) && sheet.choices.some((row) => row && (row.label || row.next))) {
    issues.push(issue('choice_menu', 'Choice menu entries are forbidden', 'choices'));
  }
  if (
    sheet.kind === 'cutscene'
    || sheet.cutsceneTakesStick === true
    || sheet.takesStick === true
    || forbidden.cutsceneTakesStick === true
  ) {
    issues.push(issue('cutscene_takes_stick', 'Cutscene that takes the stick is forbidden', 'cutsceneTakesStick'));
  }
  if (sheet.dialogueTree === true || forbidden.dialogueTree === true) {
    issues.push(issue('dialogue_tree', 'Dialogue tree is forbidden', 'dialogueTree'));
  }
  return issues;
}

function validateShape(sheet) {
  const issues = [];
  if (sheet.schema !== BEAT_SCHEMA) {
    issues.push(issue('schema', `schema must be ${BEAT_SCHEMA}`, 'schema'));
  }
  for (const key of REQUIRED_KEYS) {
    if (!(key in sheet)) issues.push(issue('missing_key', `missing ${key}`, key));
  }
  const setPiece = sheet.setPiece;
  if (!setPiece || typeof setPiece !== 'object') {
    issues.push(issue('missing_key', 'missing setPiece', 'setPiece'));
    return issues;
  }
  for (const key of SET_PIECE_KEYS) {
    if (!(key in setPiece)) issues.push(issue('missing_key', `missing setPiece.${key}`, `setPiece.${key}`));
  }
  return issues;
}

function validateLiveContent(sheet) {
  const issues = [];
  const canon = sheet.canon || {};
  const wants = Array.isArray(canon.whoWantsWhat) ? canon.whoWantsWhat : [];
  if (wants.length < 1) {
    issues.push(issue('canon', 'canon.whoWantsWhat must name who wants what', 'canon.whoWantsWhat'));
  }
  for (const [i, row] of wants.entries()) {
    if (!row || !nonEmptyString(row.actorId) || !nonEmptyString(row.wants)) {
      issues.push(issue('canon', 'each canon row needs actorId and wants', `canon.whoWantsWhat[${i}]`));
    }
  }

  const speakers = sheet.register && Array.isArray(sheet.register.speakers) ? sheet.register.speakers : [];
  if (speakers.length < 1) {
    issues.push(issue('register', 'register.speakers must list speaking factions', 'register.speakers'));
  }
  for (const [i, row] of speakers.entries()) {
    if (!row || !nonEmptyString(row.rule) || !nonEmptyString(row.example)) {
      issues.push(issue('register', 'each register needs a one-line rule and example', `register.speakers[${i}]`));
    }
  }

  const setPiece = sheet.setPiece || {};
  if (!nonEmptyString(setPiece.place)) {
    issues.push(issue('place', 'set-piece needs a place', 'setPiece.place'));
  }
  const actors = Array.isArray(setPiece.actors) ? setPiece.actors : [];
  if (actors.length < 2) {
    issues.push(issue('actors', 'set-piece needs leftover actors', 'setPiece.actors'));
  }

  if (!isPhysicalVerb(setPiece.headlineVerb)) {
    issues.push(issue('no_physical_verb', 'headline verb must be a leftover physical verb', 'setPiece.headlineVerb'));
  }

  if (!nonEmptyString(setPiece.twist)) {
    issues.push(issue('twist', 'set-piece needs a twist clause', 'setPiece.twist'));
  }

  const solutions = Array.isArray(setPiece.solutions) ? setPiece.solutions : [];
  if (solutions.length < 2) {
    issues.push(issue('single_solution', 'a beat needs two leftover physical solutions', 'setPiece.solutions'));
  }
  for (const [i, row] of solutions.entries()) {
    if (!row || !nonEmptyString(row.verb) || !isPhysicalVerb(row.verb) || !nonEmptyString(row.how)) {
      issues.push(issue('solution', 'each solution needs a physical verb and how', `setPiece.solutions[${i}]`));
    }
  }

  if (!nonEmptyString(setPiece.provingFrame)) {
    issues.push(issue('proving_frame', 'set-piece needs the frame that proves it', 'setPiece.provingFrame'));
  }

  const barks = Array.isArray(sheet.barks) ? sheet.barks : [];
  if (barks.length < 1) {
    issues.push(issue('barks', 'barks must be one line, one consequence', 'barks'));
  }
  for (const [i, row] of barks.entries()) {
    if (!row || !nonEmptyString(row.line) || !nonEmptyString(row.consequence)) {
      issues.push(issue('barks', 'each bark needs one line and one consequence', `barks[${i}]`));
    }
    if (row && nonEmptyString(row.line) && /[\n\r]/.test(row.line.trim())) {
      issues.push(issue('barks', 'a bark is one line', `barks[${i}].line`));
    }
  }

  const voice = sheet.voiceNotes || {};
  if (!nonEmptyString(voice.synthesis) && !nonEmptyString(voice.direction)) {
    issues.push(issue('voice', 'voice direction notes are required', 'voiceNotes'));
  }

  const seed = sheet.seedCapture || {};
  if (!Number.isFinite(seed.seed)) {
    issues.push(issue('seed', 'seedCapture.seed must be a leftover number', 'seedCapture.seed'));
  }
  if (!nonEmptyString(seed.captureContract)) {
    issues.push(issue('capture', 'seedCapture.captureContract is required even if headed capture is peeled', 'seedCapture.captureContract'));
  }

  return issues;
}

function validate47aWithoutLoss(sheet, scenario) {
  const issues = [];
  const leftoverActors = new Set((scenario.actors || []).map((actor) => actor.id));
  const leftoverMech = leftover47aMechanics(scenario);
  const named = new Set(actorIds(sheet));

  for (const id of REQUIRED_47A_ACTORS) {
    if (!leftoverActors.has(id)) {
      issues.push(issue('leftover_missing', `leftover scenario lost actor ${id}`, id));
    }
    if (!named.has(id)) {
      issues.push(issue('without_loss', `47-A sheet omitted leftover actor ${id}`, 'setPiece.actors'));
    }
  }

  const blob = JSON.stringify(sheet);
  if (B0_COLLAPSE.test(blob) || B0_COLLAPSE.test(String(sheet.setPiece && sheet.setPiece.headlineVerb))) {
    issues.push(issue('b0_collapse', '47-A opener collapsed to B0 mine-and-dock', 'setPiece'));
  }
  const headline = String(sheet.setPiece && sheet.setPiece.headlineVerb || '').toLowerCase();
  if (headline === 'mine' || headline === 'dock' || headline === 'sample') {
    issues.push(issue('b0_collapse', '47-A headline must not be the B0 mine/dock verb', 'setPiece.headlineVerb'));
  }

  const source = sheet.leftoverSource || {};
  if (source.scenario !== SCENARIO_47A_REL || source.scenarioId !== scenario.id) {
    issues.push(issue('leftover_source', `47-A must cite ${SCENARIO_47A_REL}`, 'leftoverSource.scenario'));
  }
  if (source.notTheOpener !== B0_CHAPTER_REL) {
    issues.push(issue('leftover_source', '47-A must name B0.md as not the playable opener', 'leftoverSource.notTheOpener'));
  }

  const solutions = (sheet.setPiece && sheet.setPiece.solutions) || [];
  const leftoverSolutionMech = new Set();
  for (const [i, row] of solutions.entries()) {
    const mech = row && row.leftoverMechanic;
    if (!mech || !leftoverMech.has(mech)) {
      issues.push(issue(
        'invented_solution',
        `solution leftoverMechanic is not in the leftover slice: ${mech || '(missing)'}`,
        `setPiece.solutions[${i}]`,
      ));
    } else {
      leftoverSolutionMech.add(mech);
    }
  }
  const hasHitch = leftoverSolutionMech.has('massline.attach');
  const hasCut = leftoverSolutionMech.has('massline.cut') || leftoverSolutionMech.has('massline.cut_or_reanchor');
  if (!hasHitch || !hasCut) {
    issues.push(issue(
      'without_loss',
      '47-A must keep leftover hitch (massline.attach) and cut/pod (massline.cut)',
      'setPiece.solutions',
    ));
  }

  if (Number(sheet.seedCapture && sheet.seedCapture.durationSeconds) !== Number(scenario.durationSeconds)) {
    issues.push(issue('duration', '47-A sheet must keep leftover durationSeconds', 'seedCapture.durationSeconds'));
  }

  // A bark is CITED, never rewritten. Any bark whose id resolves in the leftover
  // scenario must still read exactly as the game speaks it. Barks cited from
  // elsewhere (scenarioRuntime comms) are skipped, not assumed.
  const leftoverLines = new Map(
    (scenario.dialogue || []).map((row) => [row.id, String((row && (row.text ?? row.line)) || '')]),
  );
  const sheetBarks = Array.isArray(sheet.barks) ? sheet.barks : [];
  for (const [i, row] of sheetBarks.entries()) {
    if (!row || !nonEmptyString(row.id)) continue;
    const leftover = leftoverLines.get(row.id);
    if (leftover === undefined) continue;
    if (String(row.line || '').trim() !== leftover.trim()) {
      issues.push(issue(
        'rewritten_bark',
        `bark ${row.id} drifted from the leftover scenario line; cite it, do not rewrite it`,
        `barks[${i}].line`,
      ));
    }
  }

  // The seed is the leftover tape's seed, not a number the sheet chose.
  const tapeRel = sheet.seedCapture && sheet.seedCapture.inputTape;
  if (nonEmptyString(tapeRel)) {
    let tape = null;
    try {
      tape = readJsonFile(join(REPO_ROOT, tapeRel));
    } catch (error) {
      issues.push(issue('seed', `seedCapture.inputTape is not readable: ${tapeRel}`, 'seedCapture.inputTape'));
    }
    if (tape && Number.isFinite(tape.seed)
      && Number(tape.seed) !== Number(sheet.seedCapture && sheet.seedCapture.seed)) {
      issues.push(issue(
        'seed',
        `seedCapture.seed must be the leftover tape seed from ${tapeRel} (${tape.seed})`,
        'seedCapture.seed',
      ));
    }
  }

  return issues;
}

export function validateBeatSheet(sheet, options = {}) {
  const issues = detectForbiddenForm(sheet);
  if (issues.some((row) => row.code === 'prose_only' && !sheet)) return issues;
  if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) return issues;

  const claimsTemplate = sheet.kind === 'template' || sheet.id === TEMPLATE_ID;
  issues.push(...validateShape(sheet));
  if (claimsTemplate) {
    if (sheet.id !== TEMPLATE_ID) {
      issues.push(issue('template', 'template sheet id must be beat.template', 'id'));
    }
    // The blank template is exempt from content checks so it stays fillable.
    // That exemption is granted by filename, never by a field the sheet sets:
    // otherwise a real beat claims template kind and skips the whole standard.
    if (options.allowTemplate === true) return issues;
    issues.push(issue(
      'template',
      `only ${TEMPLATE_FILENAME} may be a template sheet; a beat cannot claim template kind`,
      'kind',
    ));
  }

  issues.push(...validateLiveContent(sheet));
  if (sheet.id === OPENER_47A_ID || options.require47a) {
    const scenario = options.scenario || load47aScenario();
    issues.push(...validate47aWithoutLoss(sheet, scenario));
  }
  return issues;
}

export function validateBeatFile(absPath, options = {}) {
  let sheet;
  try {
    sheet = loadBeatSheet(absPath);
  } catch (error) {
    return {
      path: absPath,
      rel: relative(REPO_ROOT, absPath).replaceAll('\\', '/'),
      sheet: null,
      issues: [issue('parse', `not machine-checkable JSON: ${error.message}`)],
    };
  }
  const allowTemplate = options.allowTemplate ?? (basename(absPath) === TEMPLATE_FILENAME);
  return {
    path: absPath,
    rel: relative(REPO_ROOT, absPath).replaceAll('\\', '/'),
    sheet,
    issues: validateBeatSheet(sheet, { ...options, allowTemplate }),
  };
}

export function validateBeatCorpus(dir = BEAT_SHEET_DIR, options = {}) {
  const files = listBeatSheetFiles(dir);
  return files.map((absPath) => validateBeatFile(absPath, options));
}
