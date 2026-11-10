// Map a lab summary onto vocabulary ids.
// An atom fires only for a player-caused change. A pre-seeded line is not a latch.
// Hands-off motion without speed decay is not a coast. Shot drift is not a ram.

export function deriveHappened(summary, tape) {
  const s = summary || {};
  const input = tape || {};
  const happened = [];
  const loaded = Math.abs(input.moveZ || 0) >= 0.5 || !!input.boost || input.reelFrom != null;
  const holding = !!input.hold && input.tap == null;
  if (Math.abs(input.moveZ || 0) >= 0.5 && s.playerDisp >= 12) happened.push('ship.thrust');
  const released = !!(input.then && Math.abs(input.then.moveZ ?? 0) < 0.25 && Math.abs(input.moveZ || 0) >= 0.5);
  const handsOff = Math.abs(input.moveZ || 0) < 0.25 && !input.boost && input.reelFrom == null && input.payoutFrom == null;
  const decay = (s.launchSpeed || 0) - (s.endSpeed || 0);
  const releasedDecay = (s.maxSpeed || 0) - (s.endSpeed || 0);
  if ((handsOff && decay >= 8) || (released && releasedDecay >= 8)) {
    happened.push('ship.coast');
  }
  if (Math.abs(input.turnIntent || 0) >= 0.4 && s.rotDelta >= 0.35) happened.push('ship.turn');
  if (input.boost && s.speedAt10 >= 120) happened.push('ship.boost');
  if (s.attStart !== true && s.attEnd === true) happened.push('massline.latch');
  if (input.reelFrom != null && s.reelDrop >= 12) happened.push('massline.reel');
  if (input.payoutFrom != null && s.restDelta >= 12) happened.push('massline.payout');
  if (input.tap != null && s.cut === true) happened.push('massline.cut');
  if (s.maxTension >= 40 && s.attStart === true && (loaded || holding)) happened.push('massline.tension');
  if (s.maxAngular >= 0.25 && (s.attStart === true || s.cut === true)) happened.push('massline.orbit');
  if ((s.contacts || []).some((contact) => contact.playerInvolved === true
    && contact.impulse > 0 && (contact.aAlias === 'player' || contact.bAlias === 'player'))) {
    happened.push('physics.collision');
  }
  if (input.fire && (s.others || []).some((body) => body.hullDrop >= 8)) happened.push('weapons.fire');
  if (s.savePerformed === true) happened.push('save.restore');
  return happened;
}

export function deriveFired(summary, tape, mechanics) {
  const happened = deriveHappened(summary, tape);
  if (!Array.isArray(mechanics)) return happened;
  const want = new Set(mechanics);
  return happened.filter((id) => want.has(id));
}

export function readPath(summary, path) {
  if (!summary || !path) return null;
  if (path.startsWith('others.')) {
    const [, alias, field] = path.split('.');
    const body = (summary.others || []).find((row) => row.alias === alias);
    if (!body) return null;
    return body[field];
  }
  return summary[path];
}

export function checkExpect(summary, expect) {
  const failures = [];
  if (!expect) return failures;
  const cmp = (ok, label) => { if (!ok) failures.push(label); };
  if (expect.reelDropGt != null) cmp(summary.reelDrop > expect.reelDropGt, `reelDrop ${summary.reelDrop} > ${expect.reelDropGt}`);
  if (expect.coastDropGt != null) cmp((summary.maxSpeed - summary.endSpeed) > expect.coastDropGt, `coastDrop ${summary.maxSpeed - summary.endSpeed} > ${expect.coastDropGt}`);
  if (expect.restDeltaLt != null) cmp(summary.restDelta < expect.restDeltaLt, `restDelta ${summary.restDelta} < ${expect.restDeltaLt}`);
  if (expect.restDeltaGt != null) cmp(summary.restDelta > expect.restDeltaGt, `restDelta ${summary.restDelta} > ${expect.restDeltaGt}`);
  if (expect.playerDispGt != null) cmp(summary.playerDisp > expect.playerDispGt, `playerDisp ${summary.playerDisp} > ${expect.playerDispGt}`);
  if (expect.playerDispLt != null) cmp(summary.playerDisp < expect.playerDispLt, `playerDisp ${summary.playerDisp} < ${expect.playerDispLt}`);
  if (expect.endSpeedGt != null) cmp(summary.endSpeed > expect.endSpeedGt, `endSpeed ${summary.endSpeed} > ${expect.endSpeedGt}`);
  if (expect.endSpeedLt != null) cmp(summary.endSpeed < expect.endSpeedLt, `endSpeed ${summary.endSpeed} < ${expect.endSpeedLt}`);
  if (expect.maxSpeedGt != null) cmp(summary.maxSpeed > expect.maxSpeedGt, `maxSpeed ${summary.maxSpeed} > ${expect.maxSpeedGt}`);
  if (expect.speedAt10Gt != null) cmp(summary.speedAt10 > expect.speedAt10Gt, `speedAt10 ${summary.speedAt10} > ${expect.speedAt10Gt}`);
  if (expect.speedAt10Lt != null) cmp(summary.speedAt10 < expect.speedAt10Lt, `speedAt10 ${summary.speedAt10} < ${expect.speedAt10Lt}`);
  if (expect.attachmentEnd != null) cmp(summary.attEnd === expect.attachmentEnd, `attachmentEnd ${summary.attEnd} === ${expect.attachmentEnd}`);
  if (expect.cut != null) cmp(summary.cut === expect.cut, `cut ${summary.cut} === ${expect.cut}`);
  if (expect.tensionGt != null) cmp(summary.maxTension > expect.tensionGt, `tension ${summary.maxTension} > ${expect.tensionGt}`);
  if (expect.angularGt != null) cmp(summary.maxAngular > expect.angularGt, `angular ${summary.maxAngular} > ${expect.angularGt}`);
  if (expect.rotDeltaGt != null) cmp(summary.rotDelta > expect.rotDeltaGt, `rotDelta ${summary.rotDelta} > ${expect.rotDeltaGt}`);
  if (expect.rotDeltaLt != null) cmp(summary.rotDelta < expect.rotDeltaLt, `rotDelta ${summary.rotDelta} < ${expect.rotDeltaLt}`);
  if (expect.playerXLt != null) cmp(summary.playerX < expect.playerXLt, `playerX ${summary.playerX} < ${expect.playerXLt}`);
  if (expect.playerXGt != null) cmp(summary.playerX > expect.playerXGt, `playerX ${summary.playerX} > ${expect.playerXGt}`);
  if (expect.playerZGt != null) cmp(Math.abs(summary.playerZ) > expect.playerZGt, `|playerZ| ${summary.playerZ} > ${expect.playerZGt}`);
  if (expect.save != null) cmp(summary.savePerformed === expect.save, `save ${summary.savePerformed} === ${expect.save}`);
  checkOther(summary, expect.otherSpeedGt, 'speed', 'gt', failures);
  checkOther(summary, expect.otherSpeedLt, 'speed', 'lt', failures);
  checkOther(summary, expect.otherDispGt, 'disp', 'gt', failures);
  checkOther(summary, expect.otherDispLt, 'disp', 'lt', failures);
  checkOther(summary, expect.otherHullLt, 'hull', 'lt', failures);
  checkOther(summary, expect.otherHullDropGt, 'hullDrop', 'gt', failures);
  return failures;
}

function checkOther(summary, spec, field, op, failures) {
  if (!spec) return;
  const body = (summary.others || []).find((row) => row.alias === spec.alias);
  if (!body) {
    failures.push(`missing body ${spec.alias}`);
    return;
  }
  const value = body[field];
  const bound = spec.gt != null ? spec.gt : spec.lt;
  const ok = op === 'gt' ? value > (spec.gt != null ? spec.gt : bound) : value < (spec.lt != null ? spec.lt : bound);
  if (!ok) failures.push(`${spec.alias}.${field} ${value} ${op} ${op === 'gt' ? spec.gt : spec.lt}`);
}

export function contrastFails(primary, ablate, contrast) {
  if (!contrast) return [];
  const left = readPath(primary, contrast.path);
  const right = readPath(ablate, contrast.path);
  if (String(contrast.path).startsWith('others.') && left != null && right == null) {
    return [`contrast ${contrast.path} witness body is gone after ablation (${left})`];
  }
  if (left == null || right == null) return [`contrast ${contrast.path} missing (${left} vs ${right})`];
  if (typeof left === 'boolean' || typeof right === 'boolean') {
    if (left === right) return [`contrast ${contrast.path} did not change (${left})`];
    return [];
  }
  const delta = Number(left) - Number(right);
  if (contrast.primaryLtBy != null && !(Number(right) - Number(left) >= contrast.primaryLtBy)) {
    return [`contrast ${contrast.path} primary ${left} not lower than ablate ${right} by ${contrast.primaryLtBy}`];
  }
  if (contrast.primaryGtBy != null && !(delta >= contrast.primaryGtBy)) {
    return [`contrast ${contrast.path} primary ${left} not higher than ablate ${right} by ${contrast.primaryGtBy}`];
  }
  return [];
}

export function failureGap(primary, alt, failure) {
  if (!failure) return [];
  if (!alt) return ['failure has no alternate intervention'];
  const left = readPath(primary, failure.path);
  const right = readPath(alt, failure.path);
  const problems = [];
  if (failure.primaryGt != null && !(Number(left) > failure.primaryGt)) {
    problems.push(`failure ${failure.path} primary ${left} not > ${failure.primaryGt}`);
  }
  if (failure.primaryLt != null && !(Number(left) < failure.primaryLt)) {
    problems.push(`failure ${failure.path} primary ${left} not < ${failure.primaryLt}`);
  }
  if (failure.primaryEquals != null && left !== failure.primaryEquals) {
    problems.push(`failure ${failure.path} primary ${left} !== ${failure.primaryEquals}`);
  }
  if (failure.altLt != null && !(Number(right) < failure.altLt)) {
    problems.push(`failure ${failure.path} alt ${right} not < ${failure.altLt}`);
  }
  if (failure.altGt != null && !(Number(right) > failure.altGt)) {
    problems.push(`failure ${failure.path} alt ${right} not > ${failure.altGt}`);
  }
  if (failure.altEquals != null && right !== failure.altEquals) {
    problems.push(`failure ${failure.path} alt ${right} !== ${failure.altEquals}`);
  }
  if (left === right) problems.push(`failure ${failure.path} is the same on both tapes (${left})`);
  return problems;
}
