/** Serialize late geometry uploads between presents. Loading owns its initial
 * set; rocks and payloads created afterwards need a route out of pending too.
 *
 * Pending roots drain one at a time — one root per present keeps GPU uploads
 * off the draw path — but the FIFO choice is a deadline choice: a hull that is
 * about to cross the glass must not wait behind a background prop that arrived
 * first. `priorityOf` re-grades the waiting set on every pick (lower wins,
 * sequence breaks ties) so the order reflects where entities are NOW, not the
 * order they happened to be noticed in. */
export function createLiveGeometryAdmissionQueue({ compile, prepare, yieldToMain, isActive, onReady, onError, priorityOf }) {
  const pending = [];
  const admissions = new WeakMap();
  let draining = false;
  let sequence = 0;

  const entryPriority = (entry) => {
    if (typeof priorityOf !== 'function') return 0;
    const value = Number(priorityOf(entry.entity, entry.root));
    return Number.isFinite(value) ? value : 0;
  };

  const pickNext = () => {
    let bestIndex = 0;
    let bestPriority = entryPriority(pending[0]);
    let bestSequence = pending[0].sequence;
    for (let index = 1; index < pending.length; index++) {
      const priority = entryPriority(pending[index]);
      if (priority < bestPriority
          || (priority === bestPriority && pending[index].sequence < bestSequence)) {
        bestIndex = index;
        bestPriority = priority;
        bestSequence = pending[index].sequence;
      }
    }
    return pending.splice(bestIndex, 1)[0];
  };

  const runEntry = async (entry) => {
    const active = entry.active;
    await yieldToMain();
    if (!active()) return false;
    await compile(entry.root);
    if (!active()) return false;
    const result = await prepare(entry.root, { isActive: active });
    if (!active() || result?.skipped === true) return false;
    onReady(entry.entity, entry.root);
    return true;
  };

  const drain = () => {
    if (draining || pending.length === 0) return;
    draining = true;
    (async () => {
      while (pending.length > 0) {
        const entry = pickNext();
        try {
          const ready = await runEntry(entry);
          // A pause or opening admission hold may interrupt the drain; the next
          // live frame re-enqueues the still-pending root. Genuine upload errors
          // stay in the map: retrying a failed upload every frame is a loop, not
          // a recovery.
          if (!ready) admissions.delete(entry.root);
          entry.resolve(ready);
        } catch (error) {
          if (entry.active()) onError(error, entry.entity);
          entry.resolve(false);
        }
      }
      draining = false;
    })();
  };

  return {
    enqueue(entity, root) {
      if (admissions.has(root)) return admissions.get(root);
      let resolve;
      const completion = new Promise((res) => { resolve = res; });
      pending.push({
        entity,
        root,
        sequence: ++sequence,
        active: () => isActive(entity, root),
        resolve,
      });
      admissions.set(root, completion);
      drain();
      return completion;
    },
  };
}
