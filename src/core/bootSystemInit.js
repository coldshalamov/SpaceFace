import { createBootScheduler } from './bootScheduler.js';

/** Ordered, cooperative counterpart to the existing synchronous init loop. Deliberately do NOT
 * await promises returned by init hooks: the original hook contract starts asynchronous resources
 * and the existing explicit readiness gates own those resources. No system runs concurrently here.
 * attempted is the lifecycle owner's rollback list, recorded before each possibly throwing hook.
 */
export async function runBootInitializers(systems, context, options = {}, attempted = []) {
  const ordered = systems.filter((system) => system && typeof system.init === 'function');
  const scheduler = createBootScheduler(options);
  const report = (completed, name) => {
    try { options.onProgress?.({ completed, total: ordered.length, name }); }
    catch { /* progress must not change initialization or rollback */ }
  };
  report(0, '');
  await scheduler.checkpoint(true);
  for (let index = 0; index < ordered.length; index++) {
    const system = ordered[index];
    attempted.push(system);
    scheduler.measure(system.name || `system-${index + 1}`, () => system.init(context));
    report(index + 1, system.name || '');
    const pending = scheduler.checkpoint();
    if (pending) await pending;
  }
  return scheduler.snapshot();
}
