export function saveSlotLabel(slot) {
  const id = slot || 'quick';
  if (id === 'auto' || id === 'autosave') return 'Autosave';
  if (id === 'latest') return 'latest save';
  if (id === 'quick') return 'Quick';
  return 'Slot ' + id;
}

function skippedNewerNotice(skippedNewer) {
  if (!skippedNewer || !skippedNewer.slot) return '';
  return ` Newest save (${saveSlotLabel(skippedNewer.slot)}) was damaged — not loaded.`;
}

export function saveErrorText(payload = {}) {
  return saveErrorReasonText(payload) + skippedNewerNotice(payload.skippedNewer);
}

function saveErrorReasonText(payload = {}) {
  const slot = saveSlotLabel(payload.slot);
  // Write-path receipts pack the verify sub-reason after a colon
  // ('write_verify_failed:save_size_limit(…)'); match the outer reason first, then let a
  // known inner reason carry its own actionable message.
  const rawReason = String(payload.reason || '');
  const reason = rawReason.split(':', 1)[0];
  const innerReason = rawReason.indexOf(':') >= 0
    ? rawReason.slice(rawReason.indexOf(':') + 1).split('(', 1)[0]
    : '';
  // _saveTiming receipts carry `trigger` — it separates "the write failed" from
  // "the file on disk failed to load" for the shared reason names below.
  const writeAttempt = payload.trigger != null;
  switch (reason) {
    case 'no_player': return writeAttempt ? 'Start or load a game before saving' : slot + ' has no playable ship';
    case 'no_save': return 'No save found for ' + slot;
    case 'read_failed': return 'Could not read ' + slot;
    case 'parse_failed':
    case 'bad_format':
    case 'no_data':
    case 'checksum':
      return slot + ' is corrupt or not a SpaceFace save';
    case 'newer_version': return slot + ' requires a newer game version';
    case 'migration_failed': return 'Could not upgrade ' + slot;
    case 'invalid_player': return slot + ' has no playable ship';
    case 'serialize_failed':
    case 'stringify_failed':
      return 'Could not prepare ' + slot + ' for saving';
    case 'no_storage': return 'Browser storage is unavailable';
    case 'quota':
    case 'backup_quota':
    case 'write_failed':
    case 'backup_write_failed':
      return 'Save storage is full; export a backup';
    case 'write_verify_parse':
    case 'write_verify_failed':
      if (innerReason === 'save_size_limit' || innerReason === 'import_too_large') {
        return slot + ' is too large to store — previous save kept';
      }
      if (innerReason === 'quota' || innerReason === 'backup_quota') {
        return 'Save storage is full; export a backup';
      }
      return 'Could not verify the ' + slot + ' write — previous save kept';
    // SF-281 — the write bound refuses rather than truncates, and the refused write leaves
    // the previous slot generation intact; name both facts so the receipt is actionable.
    case 'save_size_limit':
    case 'import_too_large':
      return writeAttempt
        ? slot + ' is too large to store — previous save kept'
        : slot + ' is too large to load';
    case 'import_depth_limit':
    case 'import_node_limit':
    case 'import_collection_limit':
    case 'import_cycle':
    case 'import_persistent_entity_limit':
      return writeAttempt
        ? 'Save data exceeds storage bounds — previous save kept'
        : slot + ' is too complex to load';
    case 'restoring': return 'Could not save ' + slot + ' — a load is in progress';
    case 'schedule_failed':
    case 'save_worker_failed':
    case 'save_worker_timeout':
    case 'player_capture_churn':
    case 'save_failed':
    case 'rollback_failed':
      return 'Could not finish saving ' + slot + ' — previous save kept';
    case 'settings_write_failed': return 'Could not save settings';
    case 'export_failed': return 'Export failed for ' + slot;
    case 'visual_gate_failed': return 'Loaded ' + slot + ', but visuals did not finish';
    case 'deferred_transition_failed': return 'Could not finish the sector switch';
    case 'load_failed': {
      // SFQ-B228: a failed load fails closed (rollback restored / save untouched) and the
      // receipt carries the restore cause — say it, plus the way out, instead of a bare
      // "failed". `region` names the damaged save region when the restore owner annotates it.
      const detail = (payload && typeof payload.region === 'string' && payload.region)
        ? 'damaged ' + payload.region + ' data'
        : (payload && typeof payload.error === 'string' && payload.error ? payload.error : null);
      if (!detail) return 'Save/load failed for ' + slot;
      return 'Load failed — ' + detail + '. Your save is untouched; try again, or export a backup from the Save screen.';
    }
    default:
      return 'Save/load failed for ' + slot;
  }
}

const titleSaveReadFailureReasons = new Set([
  'no_save', 'read_failed', 'parse_failed', 'bad_format', 'no_data', 'checksum',
  'newer_version', 'migration_failed', 'invalid_player', 'no_player',
  'invalid_orchard_history', 'invalid_orchard_custody', 'import_too_large',
  'import_depth_limit', 'import_node_limit', 'import_collection_limit', 'import_cycle',
  'import_persistent_entity_limit', 'compressed_envelope', 'restore_prepare_failed', 'load_failed',
]);

export function isTitleSaveReadFailure(payload) {
  if (!payload || typeof payload !== 'object' || payload.trigger != null
      || payload.reason === 'superseded' || payload.slot === 'import') return false;
  const reason = String(payload.reason || '').split(':', 1)[0];
  return titleSaveReadFailureReasons.has(reason);
}

export function shouldToastSaveError(payload, titleMenuActive = false) {
  if (payload && payload.reason === 'superseded') return false;
  return !(titleMenuActive === true && isTitleSaveReadFailure(payload));
}
