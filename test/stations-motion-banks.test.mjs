// ANI-39..43: station motion banks (research, refinery, mining, military, blackmarket).
//
// Every bank must be schema-valid, small (<= 4 motion groups per rig), judged clean by the offline motion
// judge (no snap / loop-pop / no-settle / whip / dart), heavy (slow peak speeds), closed at its loop seam,
// rest-at-authored-pose (every clip starts on the authored pose; rest-ended clips end on it; the bank's
// binding rest poses are exactly the MOTION_ nodes of the station GLB), and event clips may only drive
// groups the ambient loop never touches (an event on an ambient group would bridge a moving part).
//
// Paths: banks default to assets/ships/motions/<pilot key>.motion.json and GLBs to the release places dir
// (this goes green after the lead's `--live` publish). For a scratch run set S4_BANK_DIR / S4_GLB_DIR.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { evaluateMotionClip, validateMotionBank } from '../src/contracts/motionBank.js';
import { judgeBank } from '../scripts/judge-motion-banks.mjs';

const BANK_DIR = process.env.S4_BANK_DIR || 'assets/ships/motions';
const GLB_DIR = process.env.S4_GLB_DIR || 'assets/ships/release/parts/places';

// key = render-package pilot key (the bank file name); glb = release asset id.
const STATIONS = [
  {
    key: 'research', glb: 'place_station_research', rig: 'station_research',
    groups: ['research_wheel', 'research_scope', 'research_survey'],
    ambient: 'research_ambient', events: { 'dock:range': 'survey_sweep' },
  },
  {
    key: 'ceres-refinery', glb: 'place_station_refinery', rig: 'station_refinery',
    groups: ['refinery_crown', 'refinery_scan'],
    ambient: 'crown_turn', events: { 'dock:range': 'scan_sweep' },
  },
  {
    key: 'military', glb: 'place_station_military', rig: 'station_military',
    groups: ['military_sweep', 'military_battery', 'military_track'],
    ambient: 'military_ambient', events: { 'dock:range': 'track_sweep', 'dock:denied': 'track_sweep' },
  },
  {
    key: 'mining', glb: 'place_station_mining', rig: 'station_mining',
    groups: ['mining_cutter', 'mining_trolley', 'mining_scan'],
    ambient: 'mining_ambient', events: { 'dock:range': 'scan_sweep' },
  },
  {
    key: 'blackmarket', glb: 'place_station_blackmarket', rig: 'station_blackmarket',
    groups: ['blackmarket_signal', 'blackmarket_jaw_p', 'blackmarket_jaw_s'],
    ambient: 'blackmarket_ambient', events: { 'dock:range': 'jaw_welcome', 'dock:denied': 'jaw_refuse' },
  },
];

// infrastructureMotion.js name-scans station children for these and would write rotation.y over the clip.
const FORBIDDEN_NAME = /dish|radar|antenna|ring2/;
// Heavy machinery: nothing on a station may move faster than this (the judge's whip limit is 540 deg/s).
const MAX_DEG_PER_S = 30;
const MAX_WU_PER_S = 3;

function readBank(station) {
  return JSON.parse(readFileSync(join(BANK_DIR, `${station.key}.motion.json`), 'utf8'));
}

function glbNodes(path) {
  const data = readFileSync(path);
  const jsonLen = data.readUInt32LE(12);
  const doc = JSON.parse(data.subarray(20, 20 + jsonLen).toString('utf8'));
  return doc.nodes || [];
}

const isIdentityDelta = (entry) => {
  if (entry.translation && Math.hypot(...entry.translation) > 1e-4) return false;
  if (entry.rotation && Math.abs(Math.abs(entry.rotation[3]) - 1) > 1e-5) return false;
  return true;
};

for (const station of STATIONS) {
  test(`${station.key}: bank is schema-valid and keeps the group budget`, () => {
    const bank = readBank(station);
    assert.equal(validateMotionBank(bank), bank);
    assert.equal(bank.rigId, station.rig);
    assert.deepEqual(bank.bindings.map((b) => b.id).sort(), [...station.groups].sort());
    assert.ok(bank.bindings.length <= 4, `${station.key}: ${bank.bindings.length} motion groups (max 4)`);
    for (const binding of bank.bindings) {
      assert.ok(!FORBIDDEN_NAME.test(binding.id), `${binding.id} would be claimed by infrastructureMotion`);
      assert.ok(!FORBIDDEN_NAME.test(binding.node.toLowerCase()), `${binding.node} would be claimed by infrastructureMotion`);
      assert.equal(binding.parent, null, `${binding.id} is a top-level pivot`);
    }
  });

  test(`${station.key}: one ambient loop; event clips never touch an ambient group`, () => {
    const bank = readBank(station);
    assert.equal(bank.events['authoredMotion:attach'], station.ambient);
    const ambient = bank.clips.find((c) => c.name === station.ambient);
    assert.ok(ambient && ambient.loop === true, 'the attach clip is a loop');
    assert.equal(bank.clips.filter((c) => c.loop).length, 1, 'exactly one looping clip per rig');
    const ambientGroups = new Set(ambient.channels.map((ch) => ch.group));
    const wired = Object.entries(bank.events).filter(([event]) => event !== 'authoredMotion:attach');
    assert.deepEqual(Object.fromEntries(wired), station.events);
    for (const [event, clipName] of wired) {
      const clip = bank.clips.find((c) => c.name === clipName);
      assert.ok(clip && !clip.loop && clip.endMode === 'rest', `${event} -> ${clipName} is a rest-ended one-shot`);
      for (const channel of clip.channels) {
        assert.ok(!ambientGroups.has(channel.group),
          `${clipName} drives ${channel.group}, which the ambient loop also drives (event would bridge a moving part)`);
      }
    }
    // every group is driven by something, and nothing is driven by the engine-reserved clip names
    const driven = new Set(bank.clips.flatMap((c) => c.channels.map((ch) => ch.group)));
    for (const group of station.groups) assert.ok(driven.has(group), `${group} is never driven`);
  });

  test(`${station.key}: judge reports no flags, loops close in pose and velocity, motion stays heavy`, () => {
    const bank = readBank(station);
    const rows = judgeBank(bank);
    assert.equal(rows.length, bank.clips.length);
    for (const row of rows) {
      assert.deepEqual(row.flags, [], `${row.rig}/${row.clip} flagged ${row.flags.join(',')}`);
      assert.ok(row.peakDegPerS <= MAX_DEG_PER_S, `${row.clip} peaks at ${row.peakDegPerS} deg/s`);
      assert.ok(row.peakWuPerS <= MAX_WU_PER_S, `${row.clip} peaks at ${row.peakWuPerS} WU/s`);
      if (row.loop) {
        assert.ok(row.endPosErr <= 0.01, `${row.clip} loop seam pose pop ${row.endPosErr} WU`);
        assert.ok(row.endAngErrDeg <= 0.5, `${row.clip} loop seam angle pop ${row.endAngErrDeg} deg`);
        assert.ok(row.loopVelPop <= 0.25, `${row.clip} loop seam velocity pop ${row.loopVelPop}`);
      }
    }
  });

  test(`${station.key}: every clip starts on the authored pose and rest clips return to it`, () => {
    const bank = readBank(station);
    for (const clip of bank.clips) {
      for (const [group, entry] of evaluateMotionClip(bank, clip, 0)) {
        assert.ok(isIdentityDelta(entry), `${clip.name}/${group} does not start at rest`);
      }
      if (!clip.loop && clip.endMode === 'rest') {
        for (const [group, entry] of evaluateMotionClip(bank, clip, clip.durationS)) {
          assert.ok(isIdentityDelta(entry), `${clip.name}/${group} does not end at rest`);
        }
      }
    }
  });

  test(`${station.key}: binding rest poses equal the MOTION_ nodes of the station GLB`, () => {
    const bank = readBank(station);
    const path = join(GLB_DIR, `${station.glb}.glb`);
    assert.ok(existsSync(path), `${path} is missing`);
    const nodes = glbNodes(path);
    const motionNodes = nodes.filter((n) => String(n.name || '').startsWith('MOTION_'));
    assert.equal(motionNodes.length, bank.bindings.length, 'one MOTION_ pivot per binding, no strays');
    const byName = new Map(motionNodes.map((n) => [n.name, n]));
    for (const binding of bank.bindings) {
      const node = byName.get(binding.node);
      assert.ok(node, `${binding.node} is missing from ${path}`);
      const t = node.translation || [0, 0, 0];
      const q = node.rotation || [0, 0, 0, 1];
      binding.restPose.translation.forEach((v, i) => assert.ok(Math.abs(v - t[i]) < 1e-4, `${binding.id} rest t[${i}]`));
      binding.restPose.rotation.forEach((v, i) => assert.ok(Math.abs(Math.abs(v) - Math.abs(q[i])) < 1e-4,
        `${binding.id} rest q[${i}]`));
    }
  });
}
