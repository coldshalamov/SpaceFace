// FB-110 — words for a repaired slot, a kept backup, and an imported profile.
// The save system already decided the outcome. These lines only say it.

const REASON_WORD = Object.freeze({
  checksum: 'the checksum failed',
  parse_failed: 'the file could not be read',
  bad_format: 'the format was wrong',
  no_save: 'the slot was empty',
  no_data: 'the slot had no data',
  newer_version: 'the version was newer than this game',
  migration_failed: 'migration failed',
  invalid_player: 'the pilot record was invalid',
  read_failed: 'the slot could not be read',
  no_backup: 'there was no backup',
  save_size_limit: 'the save was too large',
});

function slotWord(id) {
  if (id == null || id === '') return 'a slot';
  const key = String(id);
  if (key === 'quick' || key === 'autosave' || key === 'auto') return key.charAt(0).toUpperCase() + key.slice(1);
  return 'Slot ' + key;
}

function reasonWord(reason) {
  if (typeof reason === 'string' && REASON_WORD[reason]) return REASON_WORD[reason];
  return 'it could not be used';
}

/** How old the restored generation is, relative to now. */
export function generationAge(savedAt, now = Date.now()) {
  const t = Date.parse(savedAt || '');
  if (!Number.isFinite(t)) return 'an earlier generation';
  const days = Math.floor((now - t) / 86400000);
  if (days <= 0) return 'filed earlier today';
  if (days === 1) return '1 day older';
  return days + ' days older';
}

/** The slot card line after a backup restore. Names the loss and the generation. */
export function recoveryNotice(payload, now = Date.now()) {
  if (!payload || payload.slot == null) return null;
  const age = generationAge(payload.recoveredSavedAt, now);
  const version = Number.isInteger(payload.recoveredVersion) ? ', version ' + payload.recoveredVersion : '';
  return {
    slot: String(payload.slot),
    kind: 'recovered',
    text: 'Restored from the previous generation (' + age + version + ') because ' + reasonWord(payload.failedReason) + '.',
  };
}

/** save:backup had no reader. The card says the previous generation was kept. */
export function backupKeptLine(payload, now = Date.now()) {
  if (!payload || payload.slot == null) return null;
  return {
    slot: String(payload.slot),
    kind: 'backup',
    text: 'Previous generation kept (' + generationAge(payload.savedAt, now) + ').',
  };
}

/** Both copies failed. Say the two reasons. Do not invent a third. */
export function recoveryFailedLine(payload) {
  if (!payload || payload.slot == null || !payload.recoveryReason) return null;
  return {
    slot: String(payload.slot),
    kind: 'failed',
    text: 'Could not restore ' + slotWord(payload.slot) + '. Latest copy: ' + reasonWord(payload.reason) + '. Backup: ' + reasonWord(payload.recoveryReason) + '.',
  };
}

/** save:profile-imported had no reader. Toast this, and focus the slot. */
export function profileImportedLine(payload) {
  const slot = payload && payload.slot != null ? String(payload.slot) : '';
  const bits = [];
  if (payload && payload.achievements) bits.push(payload.achievements + ' medals');
  if (payload && payload.crucibleMeta) bits.push('crucible records');
  const what = bits.length ? bits.join(' and ') : 'profile records';
  return {
    slot,
    focus: slot,
    kind: 'profile',
    text: 'Imported ' + what + ' into ' + slotWord(slot) + '.',
  };
}

/** One result line. A profile merge already said what arrived; do not speak a second time. */
export function importResultLine(ok, slotWord, profileLine) {
  if (!ok) return 'Import failed';
  if (typeof profileLine === 'string' && profileLine.trim()) return profileLine.trim();
  const dest = slotWord && String(slotWord).trim() ? String(slotWord).trim() : 'the selected slot';
  return 'Imported into ' + dest + '.';
}
export function importDestination(selected, ids) {
  const list = Array.isArray(ids) && ids.length ? ids.map(String) : ['quick', '1', '2', '3', '4'];
  const want = selected != null ? String(selected) : '';
  if (want && list.includes(want)) return want;
  return list[0];
}
