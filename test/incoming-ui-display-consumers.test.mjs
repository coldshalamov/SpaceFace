import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createComboState, recordTrick } from '../src/systems/stuntCombo.js';
import { createStuntCallout, calloutTextFor } from '../src/ui/stuntCallout.js';
import { applyOrreryHudSkin } from '../src/ui/orrery/hudSkin.js';
import { planObjectiveCue, planUnresolvedObjectiveCue } from '../src/ui/map/tacticalMapGrammar.js';
import { resolveRadarObjective } from '../src/ui/radar.js';

// Minimal DOM component host, matching the existing callout's Node-safe API. No CSS text pins,
// browser/GPU or invented gameplay outcome: real combo accounting and receipt consumers run.
function element(tag) {
  const classes = new Set();
  return { tag, children: [], className: '', textContent: '', hidden: false, dataset: {}, attributes: {},
    style: { display: '', opacity: '', left: '', setProperty(key, value) { this[key] = String(value); }, removeProperty(key) { delete this[key]; } },
    classList: { add(...names) { names.forEach((name) => classes.add(name)); }, remove(...names) { names.forEach((name) => classes.delete(name)); },
      contains(name) { return classes.has(name); }, toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } },
    setAttribute(key, value) { this.attributes[key] = String(value); },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    removeChild(child) { this.children = this.children.filter((row) => row !== child); child.parentNode = null; },
  };
}
function documentHost() {
  const doc = { head: element('head'), body: element('body'), documentElement: element('html'), createElement: element };
  doc.getElementById = (id) => doc.head.children.find((row) => row.id === id) || null;
  return doc;
}
function receipt(episodeId) {
  return { schemaVersion: 2, actorId: 1, trickId: 'wrecking_ball', name: 'Wrecking Ball', rarity: 'uncommon',
    family: 'tether', episodeId, tick: 600, modifiers: { razorRelease: null, collateralCount: 1, closeShave: false },
    victimLives: [{ lifeId: `victim-${episodeId}`, threatClass: 'boss', dead: true }],
    metrics: { payloadMass: 20, playerDryHullMass: 20, usefulDeltaV: 0, referenceCruise: 100 } };
}

test('real stunt view suppresses retained score content when a new Adventure receipt shows its parent', () => {
  const combo = createComboState(), first = receipt('survival');
  assert.ok(recordTrick(combo, first) > 0);
  const state = { mode: 'flight', run: { kind: 'survival', phase: 'active', ruleset: 'swarm' },
    ui: { screenStack: [] }, tick: 600, playerId: 1, stunts: { combo }, settings: { video: { motionReduce: false } } };
  const doc = documentHost(), bus = createBus(), owner = createStuntCallout({ state, bus, doc });
  bus.emit('stunt:trickDetected', first); owner.update(0);
  const meter = owner.root.children.find((row) => row.className === 'sf-stuntcall__meter');
  assert.equal(meter.hidden, false);
  assert.match(calloutTextFor(meter), /raw|banked|window/);
  assert.equal(meter.style.display, '', 'active meter uses the authored flex layout');
  state.run = null;
  bus.emit('save:loaded', {});
  bus.emit('stunt:trickDetected', receipt('adventure'));
  owner.update(1);
  assert.equal(owner.root.hidden, false, 'Adventure still names the physical act');
  assert.match(calloutTextFor(owner.root.children[0]), /Wrecking Ball/);
  assert.equal(meter.hidden, true);
  assert.equal(meter.style.display, 'none', 'the hidden score view must defeat its authored display:flex');
  state.settings.video.motionReduce = true;
  bus.emit('stunt:trickDetected', receipt('reduced'));
  assert.equal(owner.root.children[0].children.at(-1).classList.contains('sf-stuntcall__rise'), false);
  bus.emit('save:loaded', {});
  assert.equal(owner.root.hidden, true);
  assert.equal(meter.style.display, 'none', 'load clears visual score ownership immediately');
  state.run = { kind: 'survival', phase: 'active', ruleset: 'swarm' };
  state.stunts.combo = createComboState();
  const resumed = receipt('fresh-survival'); recordTrick(state.stunts.combo, resumed);
  bus.emit('stunt:trickDetected', resumed); owner.update(2);
  assert.equal(meter.hidden, false);
  assert.equal(meter.style.display, '', 'the next live Crucible meter returns to its authored layout');
  owner.destroy();
  assert.equal(owner.root.parentNode, null);
});

test('default skin mount and radar objective models keep display changes separate from navigation truth', () => {
  const doc = documentHost();
  const release = applyOrreryHudSkin(doc);
  assert.equal(doc.body.dataset.hudSkin, 'orrery');
  assert.equal(doc.head.children.length, 1);
  assert.ok(doc.head.children[0].textContent.length > 0);
  release();
  assert.equal(doc.body.dataset.hudSkin, undefined);
  const playerPos = { x: 0, z: 0 }, waypointPos = { x: 1000, z: 0 };
  const input = { playerPos, waypointPos, range: 500, hostileCount: 0, contactCount: 0,
    expanded: false, label: 'Tala Rook · Receiving mark' };
  const cue = planObjectiveCue(input);
  assert.ok(cue.label.length <= 22);
  assert.equal(cue.label, 'TALA ROOK · RECEIVING');
  assert.deepEqual(playerPos, { x: 0, z: 0 });
  assert.deepEqual(waypointPos, { x: 1000, z: 0 });
  const missing = planUnresolvedObjectiveCue({ label: input.label, expanded: false });
  assert.equal(missing.label, cue.label);
  assert.equal(planObjectiveCue({ ...input, label: 'Cracker Run' }).label, 'CRACKER RUN');
  const waypoint = { kind: 'local', sectorId: 'sector_helios_prime', label: input.label, pos: waypointPos };
  const objective = resolveRadarObjective({ world: { currentSectorId: waypoint.sectorId }, nav: { waypoint } });
  assert.equal(objective.label, 'TALA ROOK', 'the default radar key uses its actual 20-character budget');
  assert.equal(objective.cueOwner, waypoint);
  assert.deepEqual(objective.waypointPos, waypointPos);
  assert.equal(waypoint.label, input.label, 'the clipped display name never replaces the canonical waypoint name');
});
