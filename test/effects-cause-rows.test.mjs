import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { pictureForWeapon } from '../src/data/vfxProfiles.js';
import {
  resolveWeaponPresentationFamily,
  resolveProjectileTrailProfile,
  resolveImpactPresentationProfile,
} from '../src/render/vfxProfiles.js';
import { resolveWeaponRecipe, listWeaponRecipes } from '../src/render/weapons/recipes.js';
import { resolveDriveTarget, EMIT_FLOOR } from '../src/render/thruster/ribbon/driveEnvelope.js';
import {
  plumeAchievedPicture,
  collisionEventClass,
  createScarBook,
  noteHullScar,
  scarHalfLength,
  hullLocalHit,
  scarWorldEnds,
  createHandoffBook,
  noteKillHandoff,
  bindKillStreak,
  wreckStreakOn,
  createSpectacleBook,
  spectacleFor,
  duplicateBombDropsFlash,
  createProjectileBodies,
  stepProjectileBody,
  stopProjectileBody,
  fieldDodgeEdge,
  bombPhasePicture,
  attachedHazardPose,
  releaseCuePicture,
  releaseCutMark,
  machineryPicture,
  ricochetSecondPath,
  causeSilhouetteSegments,
  createEffectOwner,
  effectCreate,
  effectReuse,
  CAUSE_SILHOUETTES,
} from '../src/render/vfx/effectsCause.js';
import { CauseMarkLayer } from '../src/render/vfx/causeMarks.js';
import {
  ADDITIONAL_ACTION_VFX_RECIPES,
  resolveAdditionalActionVfxReceipt,
} from '../src/render/vfx/actionEventRecipes.js';
import {
  IMPACT_EVENT_GRAMMAR,
  IMPACT_REDUCED_FORM,
  impactClassDistinctions,
  resolveImpactPresentation,
} from '../src/presentation/causalVfxGrammar.js';
import { fragmentBandRect, FRAGMENT_FAMILY } from '../src/render/vfx/fragmentFamilies.js';

const NINE = [
  ['wpn_snarl_s', 'web', 'filament', 'kinetic'],
  ['wpn_gravity_marker_s', 'gravitic', 'field-ring', 'emp'],
  ['wpn_momentum_sink_s', 'latch', 'filament-latch', 'emp'],
  ['wpn_gravity_well_m', 'well', 'well-collar', 'mine'],
  ['wpn_inertial_shunt_s', 'ram', 'wedge', 'kinetic'],
  ['wpn_sticky_detonator', 'sticky', 'sticky-charge', 'kinetic'],
  ['wpn_conductive_primer', 'primer', 'primer-arc', 'emp'],
  ['wpn_thermal_cooker', 'cooker', 'cooker-seam', 'beam'],
  ['wpn_mass_driver', 'driver', 'driver-slug', 'kinetic'],
];

test('plume follows achieved actuator work, under the emit floor when the key is only held', () => {
  const idle = plumeAchievedPicture(
    { throttle: 0.8, drive: 0.8, speedDrive: 0.5, boost: 0 },
    { main: 0 },
  );
  assert.equal(idle.picture, 'idle-bell');
  assert.ok(resolveDriveTarget(idle.throttle, idle.speedDrive) < EMIT_FLOOR);
  const coast = plumeAchievedPicture({ throttle: 0.05, drive: 0.05, speedDrive: 0.4 }, { main: 0 });
  assert.equal(coast.picture, 'coast-dark');
  assert.equal(coast.drive, 0);
  assert.equal(resolveDriveTarget(coast.throttle, coast.speedDrive), 0);
  const work = plumeAchievedPicture({ throttle: 0.1, drive: 0.1, speedDrive: 0.2 }, { main: 0.7 });
  assert.equal(work.picture, 'work');
  assert.ok(resolveDriveTarget(work.throttle, work.speedDrive) > EMIT_FLOOR);
  const retro = plumeAchievedPicture({ throttle: 0.8, drive: 0.8, reverse: 0.4 }, { main: 0 });
  assert.equal(retro.picture, 'retro-dark');
  const published = plumeAchievedPicture({ throttle: 0.6, drive: 0.6 }, null);
  assert.equal(published.picture, 'jet');
  assert.equal(published.drive, 0.6);
});

test('impact severity is a class, and a scar grows in the hull frame', () => {
  assert.equal(collisionEventClass(0.1), 'graze');
  const eventClass = collisionEventClass(0.5);
  assert.equal(eventClass, 'slam');
  assert.equal(collisionEventClass(0.9), 'breakup');
  assert.ok(impactClassDistinctions('graze', 'slam').length > 0);
  assert.ok(impactClassDistinctions('slam', 'breakup').length > 0);
  assert.notEqual(IMPACT_EVENT_GRAMMAR.graze.beats[0].layout, IMPACT_EVENT_GRAMMAR.slam.beats[0].layout);
  assert.notEqual(IMPACT_EVENT_GRAMMAR.slam.beats[0].layout, IMPACT_EVENT_GRAMMAR.breakup.beats[0].layout);
  const reduced = resolveImpactPresentation({
    eventClass, materialId: 'hull', axisSigned: false, severity: 0.5,
  }, { reduced: true });
  const full = resolveImpactPresentation({
    eventClass, materialId: 'hull', axisSigned: false, severity: 0.5,
  });
  assert.equal(reduced.eventClass, 'slam');
  assert.equal(full.eventClass, 'slam');
  assert.ok(reduced.duration > full.duration);
  assert.equal(IMPACT_REDUCED_FORM.mode, 'static_shape');
  assert.ok(IMPACT_REDUCED_FORM.lightFloor >= 0.1);
  assert.equal(IMPACT_REDUCED_FORM.vanish, false);

  const hull = { id: 7, alive: true, rot: Math.PI / 2, pos: { x: 10, z: 20 } };
  const local = hullLocalHit(hull, 10, 23, 0, 1);
  const book = createScarBook(24);
  const scar = noteHullScar(book, { hullId: 7, ...local, severity: 0.4, now: 1 });
  const born = scarHalfLength(scar, 1);
  const grown = scarHalfLength(scar, 1.4);
  assert.ok(grown > born);
  const again = noteHullScar(book, { hullId: 7, lx: local.lx, lz: local.lz + 0.4, tx: 1, tz: 0, severity: 0.9, now: 2 });
  assert.equal(again, scar);
  assert.equal(book.slots.length, 1);
  assert.equal(scar.severity, 0.9);
  const ends = scarWorldEnds(scar, hull, 1.4);
  assert.ok(Math.hypot(ends.ax - hull.pos.x, ends.az - hull.pos.z) > 0);
  for (let i = 0; i < 30; i++) {
    noteHullScar(book, { hullId: 100 + i, lx: i * 5, lz: 0, tx: 1, tz: 0, severity: 0.2, now: i });
  }
  assert.equal(book.slots.length, 24);
  const before = book.slots.map((slot) => slot.hullId);
  noteHullScar(book, { hullId: 9999, lx: 500, lz: 500, tx: 1, tz: 0, severity: 0.2, now: 100 });
  assert.equal(book.slots.length, 24);
  assert.ok(book.slots.some((slot) => slot.hullId === 9999));
  assert.ok(before.some((id) => !book.slots.some((slot) => slot.hullId === id)));
});

test('a kill hands off once to a nearby wreck and keeps that velocity', () => {
  const wreck = { id: 9, type: 'wreck', alive: true, pos: { x: 6, z: 5 }, vel: { x: 1, z: 0 } };
  const entities = new Map([[wreck.id, wreck]]);
  const book = createHandoffBook();
  noteKillHandoff(book, { id: 3, pos: { x: 4, z: 5 }, vel: { x: 12, z: -3 } }, 10);
  const hand = bindKillStreak(book, entities, 10.2);
  assert.equal(hand.wreckId, wreck.id);
  assert.equal(hand.vx, 12);
  const streak = wreckStreakOn(book, entities, 10.2);
  assert.equal(streak.wreckId, wreck.id);
  assert.equal(streak.ax, wreck.pos.x);
  assert.equal(streak.az, wreck.pos.z);
  assert.ok(streak.bx > streak.ax);
  assert.equal(bindKillStreak(book, entities, 10.3), null);

  const empty = createHandoffBook();
  noteKillHandoff(empty, { id: 4, pos: { x: 0, z: 0 }, vel: { x: 1, z: 0 } }, 10.2);
  assert.equal(bindKillStreak(empty, new Map(), 10.3), null);
  assert.equal(wreckStreakOn(empty, new Map(), 10.3), null);
  const bare = new CauseMarkLayer({ add() {} });
  bare.noteKill({ id: 4, pos: { x: 0, z: 0 }, vel: { x: 1, z: 0 } }, 10.2);
  assert.equal(bare.update(10.3, () => null, false, new Map()), 0);
  bare.dispose();

  const drawn = new CauseMarkLayer({ add() {} });
  drawn.noteKill({ id: 3, pos: { x: 4, z: 5 }, vel: { x: 12, z: -3 } }, 10);
  bindKillStreak(drawn.handoff, entities, 10.2);
  const count = drawn.update(10.2, (id) => entities.get(id), false, entities);
  assert.ok(count >= 1);
  assert.equal(drawn.positions[0], wreck.pos.x);
  assert.equal(drawn.positions[2], wreck.pos.z);
  drawn.dispose();

  const far = { id: 10, type: 'wreck', alive: true, pos: { x: 400, z: 5 } };
  const farBook = createHandoffBook();
  noteKillHandoff(farBook, { id: 4, pos: { x: 0, z: 0 }, vel: { x: 1, z: 0 } }, 10.2);
  assert.equal(bindKillStreak(farBook, new Map([[far.id, far]]), 10.3), null);
});

test('bomb phases stay distinct and an attached hazard resets when the source jumps', () => {
  const phases = ['unarmed', 'armed', 'warning', 'field'].map((phase, i) => bombPhasePicture({
    phase: phase === 'unarmed' ? 'drift' : phase,
    armed: phase === 'armed' || phase === 'warning',
  }, i, false));
  const names = new Set(phases.map((row) => `${row.silhouette}:${row.motion}`));
  assert.equal(names.size, 4);
  assert.ok(phases.every((row) => row.vanish === false && row.colorOnly === false));
  const held = bombPhasePicture({ phase: 'warning', armed: true }, 1, true);
  assert.equal(held.motion, 'held-shiver');
  assert.equal(held.vanish, false);
  const pose = attachedHazardPose({ x: 3, z: 4 }, { x: 2, z: 4 });
  assert.equal(pose.reset, false);
  assert.equal(pose.trail, true);
  assert.equal(attachedHazardPose({ x: 200, z: 4 }, { x: 2, z: 4 }).reset, true);
  const bomb = readFileSync(new URL('../src/render/bombPresentation.js', import.meta.url), 'utf8');
  assert.match(bomb, /armedT/);
  assert.match(bomb, /phase\s*===\s*'warning'/);
});

test('a field edge is the real radius, a shot keeps its body, and a ricochet needs a real second path', () => {
  const edge = fieldDodgeEdge({ radius: 40, expireAt: 5, now: 1, dirX: 0, dirZ: 1 });
  assert.equal(edge.alive, true);
  assert.equal(edge.drawDisc, false);
  assert.equal(edge.radius, 40);
  assert.equal(fieldDodgeEdge({ radius: 40, expireAt: 5, now: 5 }).alive, false);
  assert.equal(fieldDodgeEdge({ radius: 0, now: 1 }).alive, false);
  const shots = createProjectileBodies();
  const shot = { id: 1, alive: true, pos: { x: 0, z: 0 }, vel: { x: 30, z: 0 } };
  assert.equal(stepProjectileBody(shots, shot, 0.016).span, 0);
  shot.pos = { x: 2, z: 0 };
  const bridged = stepProjectileBody(shots, shot, 0.05);
  assert.equal(bridged.reset, false);
  assert.ok(bridged.span > 1);
  shot.pos = { x: 400, z: 0 };
  assert.equal(stepProjectileBody(shots, shot, 0.016).reset, true);
  stopProjectileBody(shots, 1);
  shot.pos = { x: 401, z: 0 };
  assert.equal(stepProjectileBody(shots, shot, 0.016).stopped, true);
  assert.equal(ricochetSecondPath(0.2, true), null);
  assert.equal(ricochetSecondPath(0.5, false), null);
  assert.equal(ricochetSecondPath(0.2, false).showOutgoing, true);
  const capped = createProjectileBodies();
  for (let i = 0; i < 256; i++) {
    stepProjectileBody(capped, { id: i, alive: true, pos: { x: i, z: 0 }, vel: { x: 10, z: 0 } }, 0.016);
  }
  stepProjectileBody(capped, { id: 1000, alive: true, pos: { x: 0, z: 1 }, vel: { x: 10, z: 0 } }, 0.016);
  assert.equal(capped.size, 257);
  assert.equal(capped.has(0), true);
  assert.equal(capped.has(1000), true);
  stopProjectileBody(capped, 4);
  assert.equal(capped.has(4), false);
  assert.equal(capped.has(0), true);
  const room = createProjectileBodies();
  for (let i = 0; i < 256; i++) {
    stepProjectileBody(room, { id: i, alive: true, pos: { x: i, z: 0 }, vel: { x: 10, z: 0 } }, 0.016);
  }
  stopProjectileBody(room, 7);
  assert.equal(room.get(7).stopped, true);
  stepProjectileBody(room, { id: 1001, alive: true, pos: { x: 1, z: 1 }, vel: { x: 10, z: 0 } }, 0.016);
  assert.equal(room.has(7), false);
  assert.equal(room.has(0), true);
  assert.equal(room.has(1001), true);
  const vfx = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
  const grazeAt = vfx.indexOf('_emitRicochetIfGrazing(pos, p, recipe, scale, hitShield) {');
  const coneAt = vfx.indexOf('_impactParticleCone(x, z, base, spread', grazeAt);
  const grazeBody = vfx.slice(grazeAt, coneAt);
  const asked = grazeBody.indexOf('ricochetSecondPath(');
  const streak = grazeBody.indexOf('_spawnProjectileTrailStreak');
  assert.ok(asked >= 0 && streak > asked);
});

test('three verbs in one moment keep a shape and a duplicate flash is dropped', () => {
  const book = createSpectacleBook();
  const release = spectacleFor(book, 'release', 1, 0, 0, false);
  const field = spectacleFor(book, 'field', 1.1, 2, 0, false);
  const impact = spectacleFor(book, 'impact', 1.2, 3, 0, false);
  assert.equal(release.shape, true);
  assert.equal(field.vanish, false);
  assert.ok(impact.peakScale < release.peakScale);
  assert.equal(impact.crowded, true);
  const dup = spectacleFor(book, 'impact', 1.25, 3.2, 0, false);
  assert.equal(dup.drawSprites, false);
  assert.equal(dup.shape, true);
  const bombs = createSpectacleBook();
  assert.equal(duplicateBombDropsFlash(spectacleFor(bombs, 'field', 2, 0, 0, false)), false);
  const secondBomb = spectacleFor(bombs, 'field', 2.05, 1, 0, false);
  assert.equal(duplicateBombDropsFlash(secondBomb), true);
  assert.equal(secondBomb.shape, true);
  const vfx = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
  const bombAt = vfx.indexOf('_onBombDetonated(p) {');
  const bombBody = vfx.slice(bombAt, vfx.indexOf('_onBombFieldEnded(p)', bombAt));
  assert.doesNotMatch(bombBody, /if\s*\(\s*!gate\.drawSprites\s*\)\s*return false/);
  assert.match(bombBody, /_emitBombMaterial\('bombs:detonated'/);
  const actionAt = vfx.indexOf('_onActionVfx(name, payload) {');
  const actionBody = vfx.slice(actionAt, vfx.indexOf('_noteCauseSilhouette(name, payload) {', actionAt));
  assert.match(actionBody, /_bombFlashDropped\(payload\)/);
  assert.match(actionBody, /return false/);
  const quiet = createSpectacleBook();
  const dim = spectacleFor(quiet, 'release', 1, 0, 0, true);
  assert.ok(dim.peakScale >= 0.1);
  assert.equal(dim.vanish, false);
  const elsewhere = spectacleFor(book, 'field', 1.3, 40, 0, false);
  assert.equal(elsewhere.drawSprites, true);
});

test('weapon pictures follow provenance and stay off the collapsed families', () => {
  const families = new Set();
  for (const [id, family, variant, collapsed] of NINE) {
    const pictured = pictureForWeapon(id);
    const resolved = resolveWeaponPresentationFamily(id);
    const recipe = resolveWeaponRecipe(id);
    const trail = resolveProjectileTrailProfile(id);
    assert.equal(pictured.family, family);
    assert.equal(resolved.family, family);
    assert.equal(resolved.variant, variant);
    assert.notEqual(resolved.family, collapsed);
    assert.equal(recipe.variant, variant);
    assert.notEqual(recipe.variant, 'autocannon');
    assert.equal(trail.variant, variant);
    assert.notEqual(trail.variant, 'autocannon');
    families.add(family);
    const impact = resolveImpactPresentationProfile(id);
    assert.equal(impact.family, family);
    assert.notEqual(impact.primaryShape, 'ring');
  }
  assert.equal(families.size, NINE.length);
  assert.equal(resolveWeaponPresentationFamily('wpn_autocannon_m').variant, 'autocannon');
  assert.equal(resolveWeaponPresentationFamily('wpn_emp_disruptor_m').family, 'emp');
  assert.equal(resolveWeaponPresentationFamily('wpn_pulse_laser_s').variant, 'pulse-bolt');
  assert.equal(resolveWeaponPresentationFamily('wpn_thermal_cooker').family, 'cooker');
  assert.notEqual(resolveWeaponPresentationFamily('wpn_thermal_cooker').family, 'beam');
  assert.notEqual(resolveWeaponPresentationFamily('wpn_gravity_well_m').family, 'mine');
  const signatures = Object.values(listWeaponRecipes()).map((recipe) => [
    recipe.flight.mode, recipe.flight.boltVariant, recipe.flight.dashLength, recipe.flight.width,
    recipe.flight.ribbonWidth, recipe.muzzle.surface, recipe.muzzle.width, recipe.muzzle.height,
    recipe.shield.contact, recipe.hull.scorch, recipe.hull.scorchLife,
  ].join(':'));
  assert.equal(new Set(signatures).size, signatures.length);
});

test('a mine trigger is recorded before detonation', () => {
  const src = readFileSync(new URL('../src/render/vfx/actionEventRecipes.js', import.meta.url), 'utf8');
  const triggerAt = src.indexOf("'mines:triggered'");
  const blastAt = src.indexOf("'mines:detonated'");
  assert.ok(triggerAt > 0 && triggerAt < blastAt);
  assert.equal(ADDITIONAL_ACTION_VFX_RECIPES['mines:triggered'].verb, 'cut');
  assert.equal(ADDITIONAL_ACTION_VFX_RECIPES['mines:detonated'].verb, 'shove');
  const state = { entities: new Map() };
  assert.equal(resolveAdditionalActionVfxReceipt('mines:triggered', { pos: { x: 1, z: 2 }, mineId: 4 }, state).sourceId, 4);
  assert.equal(resolveAdditionalActionVfxReceipt('mines:triggered', {}, state), null);
});

test('release, machinery, undock, jettison and planet cues keep a shape', () => {
  const cut = releaseCuePicture(3, 0, 8, -2, false);
  assert.equal(cut.ghostRope, false);
  assert.equal(cut.aimDiamond, false);
  assert.equal(cut.tangent.x, 1);
  const dim = releaseCuePicture(0, 2, 0, 0, true);
  assert.equal(dim.vanish, false);
  assert.ok(dim.peakScale >= 0.1);
  assert.equal(dim.decay, 'static-tangent');
  const endpoints = { ax: 1, az: 2, bx: 5, bz: 2 };
  const mark = releaseCutMark(dim, endpoints);
  assert.equal(mark.sprite, false);
  assert.equal(mark.vanish, false);
  assert.ok(mark.gain >= 0.1);
  assert.equal(mark.ax, endpoints.ax);
  assert.equal(mark.az, endpoints.az);
  assert.equal(mark.bx, endpoints.bx);
  assert.equal(mark.bz, endpoints.bz);
  const cutLayer = new CauseMarkLayer({ add() {} });
  assert.equal(cutLayer.noteCut(mark, 1), true);
  assert.ok(cutLayer.update(1, () => null, true) >= 1);
  assert.equal(cutLayer.positions[0], mark.ax);
  assert.equal(cutLayer.positions[2], mark.az);
  assert.ok(cutLayer.colors[0] > 0.05);
  cutLayer.dispose();
  const vfx = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
  const releaseAt = vfx.indexOf('_onTetherRelease(p) {');
  const releaseBody = vfx.slice(releaseAt, vfx.indexOf('_onTetherReleaseRated(p) {', releaseAt));
  assert.match(releaseBody, /releaseCutMark\(/);
  assert.equal(releaseBody.includes('SPR_FLASH'), false);
  assert.equal(machineryPicture({ kind: 'sensor_sweep' }, false, false).advance, true);
  assert.equal(machineryPicture({ powered: false }, false, false).advance, false);
  assert.equal(machineryPicture({ powered: false }, false, false).vanish, false);
  assert.equal(machineryPicture({ jammed: true }, false, false).silhouette, 'bound-arm');
  assert.equal(machineryPicture({ kind: 'hauler_dock' }, true, false).advance, false);
  assert.equal(machineryPicture({}, false, true).silhouette, 'operating-still');
  const ship = { id: 1, alive: true, rot: 0, pos: { x: 12, z: 4 }, vel: { x: 0, z: 9 } };
  const state = { playerId: 1, entities: new Map([[1, ship]]) };
  const undock = resolveAdditionalActionVfxReceipt('dock:undocked', {}, state);
  assert.equal(undock.pos.x, 12);
  assert.ok(undock.direction.x > 0.9);
  const fling = resolveAdditionalActionVfxReceipt('cargo:jettisoned', { commodityId: 'ore', amount: 2 }, state);
  assert.equal(fling.direction.z, 9);
  assert.equal(fling.attachToTarget, false);
  assert.equal(resolveAdditionalActionVfxReceipt('cargo:jettisoned', {}, { playerId: 1, entities: new Map() }), null);
  const plunge = resolveAdditionalActionVfxReceipt('planet:plungeStage', { id: 1, stage: 'danger' }, state);
  assert.equal(plunge.pos.z, 4);
  assert.equal(plunge.direction.z, 9);
  const burn = resolveAdditionalActionVfxReceipt('planet:recoveryBurn', { on: true, siteId: 'a' }, state);
  assert.equal(burn.kind, 'on');
  assert.ok(burn.direction.x < 0);
  const denied = resolveAdditionalActionVfxReceipt('planet:harvestDenied', { reason: 'cargo_full' }, state);
  assert.equal(denied.pos.x, 12);
  assert.equal(ADDITIONAL_ACTION_VFX_RECIPES['planet:harvestDenied'].verb, 'cool');
  const cues = [
    ['dock:undocked', CAUSE_SILHOUETTES.undock],
    ['cargo:jettisoned', CAUSE_SILHOUETTES.jettison],
    ['planet:plungeStage', CAUSE_SILHOUETTES.planetPlunge],
    ['planet:recoveryBurn', CAUSE_SILHOUETTES.planetRecovery],
    ['planet:collector', CAUSE_SILHOUETTES.planetHarvest],
    ['planet:harvestDenied', CAUSE_SILHOUETTES.planetDeny],
  ];
  const shapes = [];
  for (const [name, spec] of cues) {
    const drawnCue = causeSilhouetteSegments(name, 12, 4, 1, 0);
    assert.equal(drawnCue.silhouette, spec.silhouette);
    assert.equal(drawnCue.motion, spec.motion);
    assert.equal(drawnCue.sprite, false);
    assert.equal(drawnCue.vanish, false);
    assert.ok(drawnCue.segments.length >= 2);
    shapes.push(drawnCue.segments);
  }
  assert.equal(causeSilhouetteSegments('planet:harvestDenied', 0, 0, 0, 1).hud, false);
  assert.equal(causeSilhouetteSegments('dock:undocked', 0, 0, 0, 0).silhouette, 'reversed-cradle');
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) assert.notDeepEqual(shapes[i], shapes[j]);
  }
  assert.match(vfx, /causeSilhouetteSegments\(/);
  assert.match(vfx, /layer\.noteSilhouette\(mark/);
  assert.notDeepEqual(
    fragmentBandRect(FRAGMENT_FAMILY.METAL, 'coat'),
    fragmentBandRect(FRAGMENT_FAMILY.ICE, 'clear'),
  );
  const harvest = readFileSync(new URL('../src/systems/planetRuntime.js', import.meta.url), 'utf8');
  assert.match(harvest, /planet\.harvest\.mote/);
  const owner = createEffectOwner();
  const slot = effectCreate(owner, 'scar');
  slot.payload = { leaked: true };
  slot.age = 3;
  const reused = effectReuse(owner, slot, 'scar');
  assert.equal(reused.payload, null);
  assert.equal(reused.age, 0);
  assert.equal(reused.kind, 'scar');
});
