// A person's recorded fate is not the later campaign branch's custody/force vocabulary.
const SUFFIX = ' — MAINTENANCE / PIT ENGINEERING';
const NOTES = Object.freeze({
  custody: `CUSTODY FILED (B2)${SUFFIX}`,
  force: `DECEASED (B2)${SUFFIX}`,
  unknown: `STATUS UNVERIFIED (B2)${SUFFIX}`,
});
export function elroyLedgerNote(story) {
  const outcome = story?.flags?.elroy_outcome;
  return outcome === 'custody' ? NOTES.custody : outcome === 'force' ? NOTES.force : NOTES.unknown;
}
export function reconcileElroyLedgerRows(rows, story) {
  if (!Array.isArray(rows)) return rows;
  const note = elroyLedgerNote(story);
  return rows.map(row => row?.column === 'COUNTERPARTY' && row.name === 'ELROY'
    && Object.values(NOTES).includes(row.note) && row.note !== note ? { ...row, note } : row);
}
