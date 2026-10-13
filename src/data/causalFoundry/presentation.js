// Cards for the ten scenes the public lab run operates.
// `document` is the compiled spaceface.simScenario.v1 for that scene's primary tape.
// `controls` name every input on that tape.
// `verified` on the stored card stays false at import. certifyPresentationCard runs
// runLabScenario on the document it is given and returns verified true only when
// that document is the full compileScene result for the scene (seed, entities,
// attachments, systems, assertions, title, and input tape — not the input tape
// alone), the public run of that document returns pass with certifying true, and
// the card controls name that scene's primary tape.
// The shipping CLI writes that result for the stored card document.

import { ACCEPTED_SCENES } from './accepted.js';
import { runLabScenario } from '../../testing/lab/runScenario.js';
import { compileScene } from '../../../tools/causal-foundry/compileScene.js';

const INPUT_NAMES = Object.freeze([
  ['hold', (tape) => tape.hold === true],
  ['reel', (tape) => tape.reelFrom != null],
  ['payout', (tape) => tape.payoutFrom != null],
  ['tap', (tape) => tape.tap != null],
  ['release', (tape) => tape.releaseAt != null],
  ['thrust', (tape) => Math.abs(Number(tape.moveZ) || 0) > 0 || Math.abs(Number(tape.moveX) || 0) > 0],
  ['turn', (tape) => Math.abs(Number(tape.turnIntent) || 0) > 0],
  ['boost', (tape) => tape.boost === true],
  ['fire', (tape) => tape.fire === true],
  ['aim', (tape) => tape.aimAngle != null],
]);

export const PRESENTATION_SCENES = Object.freeze([
  row('cf.reel-berth', ['ship.starter', 'asteroid.heavy'], ['KeyF hold', 'KeyQ reel']),
  row('cf.tow-light', ['ship.starter', 'asteroid.light'], ['KeyF hold', 'KeyQ reel']),
  row('cf.swing-cut', ['ship.starter', 'asteroid.heavy'], ['KeyF tap']),
  row('cf.payout-strand', ['ship.starter', 'asteroid.heavy'], ['KeyF hold', 'KeyE payout', 'thrust']),
  row('cf.cut-into-pod', ['ship.starter', 'asteroid.heavy', 'asteroid.light'], ['KeyF tap']),
  row('cf.boost-arrest', ['ship.starter', 'asteroid.heavy'], ['KeyF hold', 'boost', 'thrust']),
  row('cf.taut-catch', ['ship.starter', 'asteroid.heavy'], ['KeyF hold', 'thrust']),
  row('cf.orbit-hold', ['ship.starter', 'asteroid.heavy'], ['KeyF hold', 'thrust']),
  row('cf.boost-cut', ['ship.starter', 'asteroid.heavy'], ['KeyF hold', 'thrust', 'boost', 'release', 'KeyF tap']),
  row('cf.moving-fire', ['ship.starter', 'wasp_swarmer'], ['thrust', 'fire', 'aim']),
]);

export function requiredControlNames(tape) {
  const names = [];
  const layers = tapeLayers(tape);
  for (const [name, used] of INPUT_NAMES) {
    if (layers.some((layer) => used(layer))) names.push(name);
  }
  return names;
}

export function controlsCoverTape(controls, tape) {
  const have = controlTokens(controls);
  return requiredControlNames(tape).every((name) => have.has(name));
}

export async function certifyPresentationCard(card) {
  return certifyPresentationDocument(card, card && card.document);
}

export async function certifyPresentationDocument(card, document) {
  const scene = sceneFor(card);
  const tape = scene && scene.primary;
  const sameDocument = isPrimaryCompile(document, scene);
  let lab;
  try {
    lab = await runLabScenario(document);
  } catch (err) {
    lab = {
      ok: false,
      status: 'infra',
      certifying: false,
      error: err && err.message ? err.message : String(err),
    };
  }
  const accepted = !!(lab && lab.ok === true && lab.status === 'pass' && lab.certifying === true);
  const named = !!(tape && card && controlsCoverTape(card.controls, tape) && sameDocument);
  return {
    id: card && card.id,
    verified: accepted && named && sameDocument,
    ok: !!(lab && lab.ok === true),
    status: lab && lab.status ? lab.status : 'invalid-config',
    certifying: !!(lab && lab.certifying === true),
    traceHash: lab && lab.traceHash ? lab.traceHash : null,
    error: lab && lab.error ? lab.error : null,
  };
}

function isPrimaryCompile(document, scene) {
  if (!scene || !document || typeof document !== 'object') return false;
  let expected;
  try {
    expected = compileScene(scene);
  } catch {
    return false;
  }
  return sameStructure(document, expected);
}

function sameStructure(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!sameStructure(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i += 1) {
    if (aKeys[i] !== bKeys[i]) return false;
    if (!sameStructure(a[aKeys[i]], b[bKeys[i]])) return false;
  }
  return true;
}

function sceneFor(card) {
  if (!card || !card.id) return null;
  return ACCEPTED_SCENES.find((entry) => entry.id === card.id) || null;
}

function row(id, profiles, controls) {
  const scene = ACCEPTED_SCENES.find((entry) => entry.id === id);
  const document = scene ? compileScene(scene) : null;
  return Object.freeze({
    id,
    profiles: Object.freeze(profiles),
    controls: Object.freeze(controls.slice()),
    document,
    verified: false,
  });
}

function tapeLayers(tape) {
  if (!tape || typeof tape !== 'object') return [];
  const layers = [tape];
  if (tape.then && typeof tape.then === 'object') layers.push(tape.then);
  return layers;
}

function controlTokens(controls) {
  const have = new Set();
  for (const label of controls || []) {
    for (const token of String(label).toLowerCase().split(/[^a-z]+/)) {
      if (token) have.add(token);
    }
  }
  return have;
}

export const PRESENTATION_IDS = Object.freeze(PRESENTATION_SCENES.map((entry) => entry.id));
