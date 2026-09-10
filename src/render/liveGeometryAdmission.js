/** Serialize late geometry uploads between presents. Loading owns its initial
 * set; rocks and payloads created afterwards need a route out of pending too. */
export function createLiveGeometryAdmissionQueue({ compile, prepare, yieldToMain, isActive, onReady, onError }) {
  let tail = Promise.resolve();
  const admissions = new WeakMap();
  return {
    enqueue(entity, root) {
      if (admissions.has(root)) return admissions.get(root);
      const active = () => isActive(entity, root);
      const completion = tail.then(async () => {
        await yieldToMain();
        if (!active()) return false;
        await compile(root);
        if (!active()) return false;
        const result = await prepare(root, { isActive: active });
        if (!active() || result?.skipped === true) return false;
        onReady(entity, root);
        return true;
      }).then(ready => {
        // A pause or opening admission hold may interrupt a valid root. Let
        // the next live frame retry; genuine upload errors stay reported once.
        if (!ready) admissions.delete(root);
        return ready;
      }).catch(error => {
        if (active()) onError(error, entity);
        return false;
      });
      admissions.set(root, completion);
      tail = completion;
      return completion;
    },
  };
}
