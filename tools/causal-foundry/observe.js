// Map a lab summary back onto vocabulary ids. A declared mechanic that did
// not move its observable is a zero-force claim, not a success.

export function deriveFired(summary, tape, mechanics) {
  const want = new Set(mechanics || []);
  const fired = [];
  const has = (id) => want.has(id);
  const s = summary || {};
  const input = tape || {};
  if (has('ship.thrust') && Math.abs(input.moveZ || 0) >= 0.5 && s.playerDisp >= 12) fired.push('ship.thrust');
  if (has('ship.coast')) {
    const released = input.then && Math.abs(input.then.moveZ ?? 0) < 0.25 && Math.abs(input.moveZ || 0) >= 0.5;
    const handsOff = Math.abs(input.moveZ || 0) < 0.25 && !input.boost && s.launchSpeed >= 15 && s.playerDisp >= 8;
    if ((released && s.maxSpeed - s.endSpeed >= 8 && s.playerDisp >= 12) || handsOff) fired.push('ship.coast');
  }
  if (has('ship.turn') && Math.abs(input.turnIntent || 0) >= 0.4 && s.rotDelta >= 0.35) fired.push('ship.turn');
  if (has('ship.boost') && input.boost && s.speedAt10 >= 120) fired.push('ship.boost');
  if (has('massline.latch') && s.attStart === true) fired.push('massline.latch');
  if (has('massline.reel') && s.reelDrop >= 12) fired.push('massline.reel');
  if (has('massline.payout') && s.restDelta >= 12) fired.push('massline.payout');
  if (has('massline.cut') && s.cut === true) fired.push('massline.cut');
  if (has('massline.tension') && s.maxTension >= 40 && s.attStart === true) fired.push('massline.tension');
  if (has('massline.orbit') && s.maxAngular >= 0.25) fired.push('massline.orbit');
  if (has('physics.collision') && (s.others || []).some((body) => Math.abs(body.speed - body.launchSpeed) >= 8 && body.disp >= 3)) {
    fired.push('physics.collision');
  }
  if (has('weapons.fire') && input.fire && (s.others || []).some((body) => body.hullDrop >= 8)) {
    fired.push('weapons.fire');
  }
  if (has('save.restore') && s.savePerformed === true) fired.push('save.restore');
  return fired;
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
  if (String(contrast.path).startsWith('others.') && left != null && right == null) return [];
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
