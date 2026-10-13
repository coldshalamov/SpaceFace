import { flightPlaneToleranceWu } from '../../../src/data/modelTruthMath.js';
import { SCENE_TRUTH_TOLERANCE } from './constants.mjs';

const TOL = SCENE_TRUTH_TOLERANCE;

function issue(witness, kind, confidence, objectIds, expected, observed, summary) {
  return {
    schema: 'spaceface.sceneTruthIssue.v1',
    kind,
    confidence,
    failBuild: confidence === 'high',
    scenarioId: witness.scenarioId,
    seed: witness.seed,
    tick: witness.tick,
    zoom: witness.zoom,
    qualityTier: witness.qualityTier,
    objectIds: [...objectIds].sort(),
    expected,
    observed,
    summary,
    command: `node tools/scene-truth/cli.mjs --only=${witness.scenarioId}`,
  };
}

function dist(a, b) {
  const dx = a.pos.x - b.pos.x;
  const dz = a.pos.z - b.pos.z;
  return Math.hypot(dx, dz);
}

function finitePos(object) {
  return Number.isFinite(object.pos.x) && Number.isFinite(object.pos.z);
}

function packageReady(object) {
  return !!(object.package && object.package.sourceExists && object.package.metadataExists && object.package.key);
}

function sameRecord(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length === 0 || leftKeys.length !== rightKeys.length) return false;
  for (let i = 0; i < leftKeys.length; i += 1) {
    const key = leftKeys[i];
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
    const a = left[key];
    const b = right[key];
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      if (!sameRecord(a, b)) return false;
    } else if (a !== b) return false;
  }
  return true;
}

/** True when an observation record is the expected record, by reference or by field copy. */
export function copiedObservation(witness) {
  if (!witness || typeof witness !== 'object') return false;
  if (witness.observed && witness.expected && sameRecord(witness.observed, witness.expected)) return true;
  const objects = Array.isArray(witness.objects) ? witness.objects : [];
  for (let i = 0; i < objects.length; i += 1) {
    const object = objects[i];
    if (!object) continue;
    if (object.presentationSource === 'expected-copy') return true;
    if (object.observed && object.expected && sameRecord(object.observed, object.expected)) return true;
  }
  return false;
}

function hullReach(object) {
  if (object && object.presentationSource !== 'expected-copy'
    && Number.isFinite(object.presentedRadius) && object.presentedRadius > 0) {
    return object.presentedRadius;
  }
  return object && Number.isFinite(object.colliderRadius) ? object.colliderRadius : 0;
}

/**
 * Semantic detectors. They read object ids and package metadata.
 * A pixel-hash change with matching geometry is not a failure.
 */
export function analyzeWitness(witness, prior = null) {
  const found = [];
  const objects = Array.isArray(witness.objects) ? witness.objects : [];
  if (copiedObservation(witness)) {
    found.push(issue(
      witness,
      'copied-observation',
      'high',
      objects.map((object) => object && object.objectId).filter(Boolean).slice(0, 8),
      'observed fields measured independently of the expected fields',
      'observed fields are a copy of the expected fields',
      'The witness repeated the expected record as the observation.',
    ));
    return found;
  }
  const ids = new Map();

  if (witness.playerRequired !== false && !objects.some((object) => object.isPlayer && object.alive !== false)) {
    found.push(issue(
      witness,
      'entity-missing',
      'high',
      ['player'],
      'living player ship',
      'no living player object',
      'The witness has no living player ship.',
    ));
  }

  for (const object of objects) {
    if (ids.has(object.objectId)) {
      found.push(issue(
        witness,
        'bad-initialization',
        'high',
        [object.objectId],
        'unique object id',
        'duplicate object id',
        `${object.objectId} is listed more than once.`,
      ));
    }
    ids.set(object.objectId, object);

    if (!finitePos(object) || !Number.isFinite(object.colliderRadius) || object.boundsFinite === false) {
      found.push(issue(
        witness,
        'bad-bounds',
        'high',
        [object.objectId],
        'finite pose and package bounds',
        `pos=${object.pos.x},${object.pos.z} radius=${object.colliderRadius} boundsFinite=${object.boundsFinite}`,
        `${object.objectId} has non-finite pose, radius, or census bounds.`,
      ));
    }

    if (object.alive === false && object.visible === true) {
      found.push(issue(
        witness,
        'destroyed-still-drawn',
        'high',
        [object.objectId],
        'destroyed entity not drawn',
        'alive=false visible=true',
        `${object.objectId} is destroyed and still marked visible.`,
      ));
    }

    if (object.alive !== false && object.collidable && object.visible === false && object.colliderRadius > 0) {
      found.push(issue(
        witness,
        'invisible-collidable',
        'high',
        [object.objectId],
        'collidable body visible',
        'visible=false',
        `${object.objectId} collides and is invisible.`,
      ));
    }

    if (object.required && object.alive !== false && object.placeholder) {
      found.push(issue(
        witness,
        'unexpected-placeholder',
        'high',
        [object.objectId],
        object.expectedFile || 'packaged whole body',
        object.package && object.package.relativeFile,
        `${object.objectId} resolved to a placeholder or modular hull kit.`,
      ));
    }

    if (object.required && object.alive !== false && !packageReady(object)) {
      found.push(issue(
        witness,
        'missing-required-model',
        'high',
        [object.objectId],
        object.expectedFile || 'render package',
        object.package
          ? `sourceExists=${object.package.sourceExists} metadataExists=${object.package.metadataExists} key=${object.package.key}`
          : 'no package',
        `${object.objectId} requires ${object.expectedFile || 'a model'} and the release package is not ready.`,
      ));
    }

    if (object.required && object.alive !== false && object.expectedFile && object.package
      && object.package.relativeFile && object.package.relativeFile !== object.expectedFile) {
      found.push(issue(
        witness,
        'silhouette-identity-mismatch',
        'high',
        [object.objectId],
        object.expectedFile,
        object.package.relativeFile,
        `${object.objectId} package file does not match the production selector.`,
      ));
    }

    const scaleRatio = object.presentationSource === 'measured' && object.expectedRadius > 0
      ? object.presentedRadius / object.expectedRadius
      : (Number.isFinite(object.presentedRadius) && object.expectedRadius > 0
        ? object.presentedRadius / object.expectedRadius
        : null);
    if (object.alive !== false && object.required && Number.isFinite(scaleRatio) && scaleRatio > TOL.scaleMismatchRatio) {
      found.push(issue(
        witness,
        'silhouette-scale-mismatch',
        'high',
        [object.objectId],
        `presented/expected <= ${TOL.scaleMismatchRatio}`,
        `ratio=${round3(scaleRatio)} presented=${round3(object.presentedRadius)} expected=${round3(object.expectedRadius)}`,
        `${object.objectId} is drawn larger than its measured keep-out.`,
      ));
    }

    const lodOk = object.lodLevel === 'lod0' || object.lodLevel === 'lod1' || object.lodLevel === 'lod2';
    if (object.type === 'ship' && object.alive !== false && !lodOk) {
      found.push(issue(
        witness,
        'invalid-lod',
        'high',
        [object.objectId],
        'lod0|lod1|lod2',
        object.lodLevel,
        `${object.objectId} has an illegal LOD level.`,
      ));
    }
    if (object.isPlayer && object.lodLevel !== 'lod0') {
      found.push(issue(
        witness,
        'invalid-lod',
        'high',
        [object.objectId],
        'player lod0',
        object.lodLevel,
        'The player ship is not on LOD0. Runtime demotion does not apply to the player.',
      ));
    }

    if (object.required && object.package && object.package.sourceExists
      && Number.isFinite(object.firstDrawMs) && object.firstDrawMs > TOL.loadToFirstDrawMs) {
      found.push(issue(
        witness,
        'excessive-load-to-first-draw',
        'high',
        [object.objectId],
        `<= ${TOL.loadToFirstDrawMs} ms after the package is required`,
        `${object.firstDrawMs} ms`,
        `${object.objectId} was admitted and still had not drawn inside the load budget.`,
      ));
    }
  }

  const omitted = objects.filter((object) => object.identityOmitted === true && object.alive !== false);
  if (omitted.length) {
    const types = [...new Set(omitted.map((object) => object.type))].sort();
    found.push(issue(
      witness,
      'surface-identity-omitted',
      'review',
      ['checkpoint-surface'],
      'place or package id on the checkpoint',
      `${omitted.length} entities (${types.join(', ')})`,
      'The lab checkpoint keeps defId only. These entities have no package id on that surface, so a missing model is not claimed. ADAPTER.md names the live hook that would copy it.',
    ));
  }

  const live = objects.filter((object) => object.alive !== false && finitePos(object));
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const a = live[i];
      const b = live[j];
      const separation = dist(a, b);
      if (a.collidable && b.collidable) {
        const allow = Math.max(
          flightPlaneToleranceWu(a.colliderRadius),
          flightPlaneToleranceWu(b.colliderRadius),
        );
        const penetration = a.colliderRadius + b.colliderRadius - separation;
        if (penetration > allow) {
          found.push(issue(
            witness,
            'clipping-interpenetration',
            'high',
            [a.objectId, b.objectId],
            `penetration <= ${round3(allow)} WU (flight-plane stick)`,
            `penetration=${round3(penetration)} WU separation=${round3(separation)} WU`,
            `${a.objectId} and ${b.objectId} overlap past physical contact.`,
          ));
        }
        if (separation < TOL.zFightStackWu && a.depthTest !== false && b.depthTest !== false) {
          found.push(issue(
            witness,
            'severe-z-fight',
            'high',
            [a.objectId, b.objectId],
            `centers at least ${TOL.zFightStackWu} WU apart`,
            `separation=${round3(separation)} WU`,
            `${a.objectId} and ${b.objectId} occupy the same pose, so their opaque hulls z-fight.`,
          ));
        }
      }

      if (a.presentedRadius > a.expectedRadius * TOL.scaleMismatchRatio
        && b.required && separation < a.presentedRadius && separation > a.colliderRadius) {
        found.push(issue(
          witness,
          'prop-hidden-by-scaled-geometry',
          'high',
          [a.objectId, b.objectId],
          'scaled body does not swallow a neighbor outside its collider',
          `presented=${round3(a.presentedRadius)} collider=${round3(a.colliderRadius)} separation=${round3(separation)}`,
          `${a.objectId} is scaled past its keep-out and hides ${b.objectId}.`,
        ));
      }
      if (b.presentedRadius > b.expectedRadius * TOL.scaleMismatchRatio
        && a.required && separation < b.presentedRadius && separation > b.colliderRadius) {
        found.push(issue(
          witness,
          'prop-hidden-by-scaled-geometry',
          'high',
          [a.objectId, b.objectId],
          'scaled body does not swallow a neighbor outside its collider',
          `presented=${round3(b.presentedRadius)} collider=${round3(b.colliderRadius)} separation=${round3(separation)}`,
          `${b.objectId} is scaled past its keep-out and hides ${a.objectId}.`,
        ));
      }
    }
  }

  const player = live.find((object) => object.isPlayer);
  if (player) {
    for (const other of live) {
      if (other === player || !other.collidable) continue;
      const separation = dist(player, other);
      const insideCollider = separation + 0.5 < other.colliderRadius;
      const insideBloated = other.presentedRadius > other.expectedRadius * TOL.scaleMismatchRatio
        && separation < other.presentedRadius;
      if (insideCollider || insideBloated) {
        found.push(issue(
          witness,
          'camera-occlusion',
          'high',
          [player.objectId, other.objectId],
          'player outside other solids',
          `separation=${round3(separation)} collider=${round3(other.colliderRadius)} presented=${round3(other.presentedRadius)}`,
          `The chase focus sits inside ${other.objectId}.`,
        ));
      }
    }
  }

  found.push(...vfxIssues(witness, live));
  found.push(...depthIssues(witness, live));
  if (prior) found.push(...popIssues(witness, prior));
  return found;
}

function vfxIssues(witness, live) {
  const found = [];
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const a = live[i];
      const b = live[j];
      if (!a.collidable || !b.collidable) continue;
      const separation = dist(a, b);
      const touch = a.colliderRadius + b.colliderRadius + 4;
      if (separation > touch) continue;
      const mid = {
        pos: { x: (a.pos.x + b.pos.x) / 2, z: (a.pos.z + b.pos.z) / 2 },
      };
      for (const host of [a, b]) {
        for (const effect of host.effects || []) {
          if (effect.occludesContacts !== true) continue;
          if (!(effect.coverage >= TOL.vfxHideCoverage)) continue;
          const coverDist = Math.hypot(host.pos.x - mid.pos.x, host.pos.z - mid.pos.z);
          if (coverDist <= effect.radius) {
            found.push(issue(
              witness,
              'vfx-hides-contact',
              'high',
              [a.objectId, b.objectId],
              `effect coverage < ${TOL.vfxHideCoverage} or not occluding`,
              `${effect.kind} coverage=${effect.coverage} radius=${round3(effect.radius)}`,
              `${host.objectId} ${effect.kind} covers the contact between ${a.objectId} and ${b.objectId}.`,
            ));
          }
        }
      }
    }
  }
  return found;
}

function depthIssues(witness, live) {
  const found = [];
  const focus = witness.focus || { x: 0, z: 0 };
  for (const far of live) {
    if (far.depthTest !== false) continue;
    const farDist = Math.hypot(far.pos.x - focus.x, far.pos.z - focus.z);
    for (const near of live) {
      if (near === far) continue;
      const nearDist = Math.hypot(near.pos.x - focus.x, near.pos.z - focus.z);
      if (nearDist >= farDist) continue;
      if (far.renderOrder <= near.renderOrder) continue;
      const separation = dist(far, near);
      if (separation > hullReach(far) + hullReach(near)) continue;
      found.push(issue(
        witness,
        'impossible-depth-order',
        'high',
        [far.objectId, near.objectId],
        'depth-tested order, nearer body in front',
        `${far.objectId} depthTest=false renderOrder=${far.renderOrder} over nearer ${near.objectId}`,
        `${far.objectId} paints over the nearer ${near.objectId}.`,
      ));
    }
  }
  return found;
}

function popIssues(witness, prior) {
  const found = [];
  const before = new Map((prior.objects || []).map((object) => [object.objectId, object]));
  for (const object of witness.objects || []) {
    const prev = before.get(object.objectId);
    if (!prev || object.alive === false) continue;
    const hashNow = object.package && object.package.contentHash;
    const hashThen = prev.package && prev.package.contentHash;
    const fileNow = object.package && object.package.relativeFile;
    const fileThen = prev.package && prev.package.relativeFile;
    if (hashNow && hashThen && hashNow !== hashThen) {
      found.push(issue(
        witness,
        'asset-change-pop',
        'high',
        [object.objectId],
        hashThen,
        hashNow,
        `${object.objectId} changed package content between tick ${prior.tick} and tick ${witness.tick}.`,
      ));
    } else if (fileNow && fileThen && fileNow !== fileThen && object.lodRuntimeDemotion !== true) {
      found.push(issue(
        witness,
        'asset-change-pop',
        'high',
        [object.objectId],
        fileThen,
        fileNow,
        `${object.objectId} swapped files while whole-ship LOD demotion is off.`,
      ));
    }
  }
  return found;
}

/**
 * Wider zoom reveals an object the close zoom could not see.
 * The required package must already be the production file.
 */
export function analyzeZoomTransition(closeWitness, wideWitness) {
  const found = [];
  const close = new Map((closeWitness.objects || []).map((object) => [object.objectId, object]));
  for (const object of wideWitness.objects || []) {
    const near = close.get(object.objectId);
    if (!near || object.alive === false || !object.required) continue;
    if (near.screen && near.screen.onScreen) continue;
    if (!object.screen || !object.screen.onScreen) continue;
    if (!packageReady(object)) {
      found.push(issue(
        wideWitness,
        'late-model-admission',
        'high',
        [object.objectId],
        'package ready before the body enters the frame',
        object.package ? object.package.relativeFile : null,
        `${object.objectId} entered the wider frame without a ready render package.`,
      ));
    }
  }
  return found;
}

/**
 * GPU pixel drift is not a broken scene when object ids and files match.
 * Returned only as a review item.
 */
export function judgePixelDrift(input) {
  if (!input || input.geometryMatch !== true || input.pixelHashChanged !== true) return null;
  return {
    schema: 'spaceface.sceneTruthIssue.v1',
    kind: 'pixel-drift',
    confidence: 'review',
    failBuild: false,
    scenarioId: input.scenarioId || null,
    seed: input.seed ?? null,
    tick: input.tick ?? null,
    zoom: input.zoom ?? null,
    qualityTier: input.qualityTier || null,
    objectIds: input.objectIds || [],
    expected: 'stable object ids and package files',
    observed: 'pixel hash changed',
    summary: 'Pixel hash changed while object identity and package files matched. Exposure, AA, and compositor differences are not a scene failure.',
    command: input.scenarioId ? `node tools/scene-truth/cli.mjs --only=${input.scenarioId}` : 'node tools/scene-truth/cli.mjs',
  };
}

export function highFails(issues) {
  return (issues || []).filter((row) => row.failBuild === true && row.confidence === 'high');
}

function round3(n) {
  return Math.round(Number(n) * 1000) / 1000;
}
