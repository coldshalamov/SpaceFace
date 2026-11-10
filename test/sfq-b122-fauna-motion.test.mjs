import test from 'node:test';
import assert from 'node:assert/strict';
import { faunaSpeciesById } from '../src/data/alienFauna.js';
import { readFaunaMotion, resolveFaunaApproachDrive } from '../src/data/faunaMotionRead.js';
import { interactionClassLine } from '../src/data/entityInteractionProfiles.js';

const ram = faunaSpeciesById('bristle_ram');
const grazer = faunaSpeciesById('glassback');

function approach(species, playerD, extra = {}) {
  return resolveFaunaApproachDrive(species, {
    playerD,
    awake: false,
    heatSaturated: false,
    reacted: true,
    silenced: false,
    currentDrive: 'drift',
    ...extra,
  });
}

test('the same close approach is defense for a ram and retreat for a grazer', () => {
  const ramDrive = approach(ram, 40);
  const grazerDrive = approach(grazer, 40);
  assert.equal(ramDrive, 'charge');
  assert.equal(grazerDrive, 'flee');
  assert.equal(readFaunaMotion(ramDrive), 'defense');
  assert.equal(readFaunaMotion(grazerDrive), 'retreat');
  assert.notEqual(readFaunaMotion(ramDrive), readFaunaMotion(grazerDrive));
});

test('the same farther approach is alarm for the ram and quiet for the grazer', () => {
  const ramDrive = approach(ram, 320);
  const grazerDrive = approach(grazer, 320);
  assert.equal(readFaunaMotion(ramDrive), 'alarm');
  assert.equal(readFaunaMotion(grazerDrive), 'quiet');
  assert.notEqual(ramDrive, 'charge');
  assert.notEqual(grazerDrive, 'flee');
});

test('a wider notice ring alarms an animal that would stay quiet at its own ring', () => {
  const raw = approach(ram, 400);
  const widened = approach(ram, 400, { noticeR: 500 });
  assert.equal(readFaunaMotion(raw), 'quiet');
  assert.equal(widened, 'investigate');
  assert.equal(readFaunaMotion(widened), 'alarm');
});

test('a quiet watch does not turn either animal aggressive', () => {
  for (const species of [ram, grazer]) {
    const drive = approach(species, 10000);
    assert.equal(drive, species.drives.idle);
    assert.equal(readFaunaMotion(drive), 'quiet');
    assert.notEqual(readFaunaMotion(drive), 'defense');
    assert.notEqual(readFaunaMotion(drive), 'alarm');
  }
});

test('feeding stays feeding when the watcher is far, and silence or sleep chooses nothing', () => {
  assert.equal(approach(ram, 10000, { currentDrive: 'feed' }), 'feed');
  assert.equal(approach(ram, 10000, { currentDrive: 'attach' }), 'attach');
  assert.equal(approach(ram, 40, { silenced: true }), null);
  const worm = faunaSpeciesById('casket_worm');
  assert.equal(approach(worm, 40), null);
  assert.equal(readFaunaMotion('feed'), 'feeding');
  assert.equal(readFaunaMotion('defend'), 'defense');
  assert.equal(readFaunaMotion('flee'), 'retreat');
  assert.equal(readFaunaMotion(''), null);
});

test('the lock line names the motion and leaves other contacts alone', () => {
  assert.equal(interactionClassLine({
    type: 'fauna',
    data: { ecology: { driveState: 'feed' } },
  }), 'Fauna · feeding');
  assert.equal(interactionClassLine({
    type: 'fauna',
    data: { ecology: { driveState: 'investigate' } },
  }), 'Fauna · alarm');
  assert.equal(interactionClassLine({
    type: 'fauna',
    data: { ecology: { driveState: 'charge' } },
  }), 'Fauna · defense');
  assert.equal(interactionClassLine({
    type: 'fauna',
    data: { ecology: { driveState: 'flee' } },
  }), 'Fauna · retreat');
  assert.equal(interactionClassLine({
    type: 'fauna',
    data: { ecology: { driveState: 'forage' } },
  }), 'Fauna · quiet');
  assert.equal(interactionClassLine({ type: 'fauna', data: {} }), 'Fauna');
  assert.equal(interactionClassLine({ type: 'ship', data: {} }), '');
});
