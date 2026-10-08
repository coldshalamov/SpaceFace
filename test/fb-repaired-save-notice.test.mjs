// FB-110 — a restored backup says what it lost, and import uses the slot the player picked.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  backupKeptLine,
  generationAge,
  importDestination,
  profileImportedLine,
  recoveryFailedLine,
  recoveryNotice,
} from '../src/ui/screens/saveNotices.js';
import { armImportDestination, importConfirmBody } from '../src/ui/screens/saveLoad.js';

const NOW = Date.parse('2026-10-08T12:00:00.000Z');
const OLD = '2026-10-05T12:00:00.000Z';

test('FB-110 recovery names the reason and the generation', () => {
  assert.equal(generationAge(OLD, NOW), '3 days older');
  const notice = recoveryNotice({
    slot: '2',
    source: 'previous_generation',
    failedReason: 'checksum',
    recoveredSavedAt: OLD,
    recoveredVersion: 12,
    promoted: true,
  }, NOW);
  assert.equal(notice.slot, '2');
  assert.match(notice.text, /previous generation \(3 days older, version 12\)/);
  assert.match(notice.text, /because the checksum failed/);
  const failed = recoveryFailedLine({ slot: '2', reason: 'checksum', recoveryReason: 'no_backup' });
  assert.match(failed.text, /Slot 2/);
  assert.match(failed.text, /Backup: there was no backup/);
  const kept = backupKeptLine({ slot: 'quick', source: 'previous_generation', savedAt: OLD }, NOW);
  assert.match(kept.text, /Previous generation kept \(3 days older\)/);
  const imported = profileImportedLine({ slot: '3', achievements: 4, crucibleMeta: true });
  assert.equal(imported.focus, '3');
  assert.match(imported.text, /Imported 4 medals and crucible records into Slot 3/);
});

test('FB-110 import destination is the slot the player picked', () => {
  assert.equal(importDestination('2', ['quick', '1', '2', '3', '4']), '2');
  assert.equal(importDestination('nope', ['quick', '1', '2', '3', '4']), 'quick');
  assert.equal(importDestination(null, ['1', '2', '3', '4']), '1');
  armImportDestination('2');
  const body = importConfirmBody({ name: 'spaceface_quick_2026-06-28.json' });
  assert.match(body, /into Slot 2/);
  assert.match(body, /validate and load that save immediately/);
  assert.match(body, /Unsaved progress is lost/);
});
