// CDP child-target profiling for the real game's dedicated simulation Worker.
// Explicit opt-in diagnostic; no gameplay flags or simulation mutations.
export async function startSimulationWorkerProfile(cdp, interval = 4000) {
  const { targetInfos } = await cdp.send('Target.getTargets');
  const target = targetInfos.find(t => t.type === 'worker' && /wholeSimBrowserWorker|simLane\.js/.test(t.url));
  if (!target) throw new Error('Simulation worker CDP target unavailable');
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
  let nextId = 1;
  const pending = new Map();
  const receive = event => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message);
    const wait = pending.get(message.id);
    if (!wait) return;
    pending.delete(message.id); clearTimeout(wait.timer);
    if (message.error) wait.reject(new Error(message.error.message)); else wait.resolve(message.result);
  };
  cdp.on('Target.receivedMessageFromTarget', receive);
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Worker profiler timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) })
      .catch(error => { clearTimeout(timer); pending.delete(id); reject(error); });
  });
  async function dispose() {
    cdp.off('Target.receivedMessageFromTarget', receive);
    for (const wait of pending.values()) { clearTimeout(wait.timer); wait.reject(new Error('Worker profiler closed')); }
    pending.clear();
    await cdp.send('Target.detachFromTarget', { sessionId }).catch(() => {});
  }
  try {
    await send('Profiler.enable');
    await send('Profiler.setSamplingInterval', { interval });
    await send('Profiler.start');
    return {
      targetUrl: target.url,
      async stop() {
        try { return (await send('Profiler.stop')).profile; }
        finally { await dispose(); }
      },
    };
  } catch (error) { await dispose(); throw error; }
}
