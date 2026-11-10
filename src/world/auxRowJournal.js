// S1 Phase-B stage 6 — producer-side aux-row dirty journal.
//
// The aux diff channel (far actors, field rocks, dressing rows) previously
// re-signed every row of every table per tick. Producers now journal the row
// ids they mutate into a per-table `_auxJournal` block the differ drains each
// pass; unchanged rows never re-sign. `_auxJournal` names itself with a
// leading underscore deliberately: snapshot sanitizers and the far-table
// serializer strip `_`-prefixed keys, so the journal never reaches the golden
// snapshot or the save envelope — and since reset/restore swap the table
// object wholesale, a fresh table arrives unarmed and falls back to one full
// diff before its journal re-arms.
//
// Mark contract:
//   dirty   — row fields an upsert ships changed in place (pos/vel/rot/alive/
//             type/sector/lastExactT/liveEntityId/_noMesh), or a row inserted
//   removed — row left the table (splice/drop)
// Membership transitions (new table objects, restores) need no marks: the
// differ arms lazily and a missing journal means "diff everything once".

function journalOf(table) {
  return table && typeof table === 'object' ? table._auxJournal : null;
}

// Lazily attach the journal block. Called by the differ before each pass; a
// journal that exists but is unarmed means "not yet diffed once" — the differ
// owns flipping `armed` after its first full walk.
export function armAuxJournal(table) {
  if (!table || typeof table !== 'object') return null;
  let j = table._auxJournal;
  if (!j) {
    j = { armed: false, dirty: new Set(), removed: new Set() };
    table._auxJournal = j;
  }
  return j;
}

export function markAuxRowDirty(table, id) {
  const j = journalOf(table);
  if (!j || !j.armed || !Number.isSafeInteger(id)) return;
  j.removed.delete(id);
  j.dirty.add(id);
}

export function markAuxRowRemoved(table, id) {
  const j = journalOf(table);
  if (!j || !j.armed || !Number.isSafeInteger(id)) return;
  j.dirty.delete(id);
  j.removed.add(id);
}
