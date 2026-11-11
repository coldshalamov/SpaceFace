// Read-only desk wording. The terminal outcome belongs to missions, not the reader.
export function ashfallElroyLedgerNote(story) {
  const outcome = story?.flags?.elroy_outcome;
  const status = outcome === 'custody' ? 'TAKEN INTO CUSTODY (B2)'
    : outcome === 'force' ? 'DECEASED (B2)'
      : 'OUTCOME UNRESOLVED';
  return `${status} — MAINTENANCE / PIT ENGINEERING`;
}
