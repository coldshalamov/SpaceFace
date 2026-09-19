/** Optional PRESENTATION adapter. Kept out of the simulation owner and its save state. */
export function createChroniclerVoiceBridge({ bus, helpers = {} } = {}) {
  if (!bus || typeof bus.on !== 'function') throw new TypeError('Voice bridge requires a bus');
  const off = [];
  function offer(payload, channel) {
    if (!payload || typeof payload.text !== 'string') return;
    const accepted = !!(helpers.voice && typeof helpers.voice.say === 'function' && helpers.voice.say({
      id: `${channel}:${payload.sourceRef}`,
      channel, text: payload.text, kind: 'chronicler',
      priority: 12, ttl: 5, source: 'chronicler', sourceRef: payload.sourceRef,
      storyId: payload.storyId, sectorId: payload.sectorId,
    }));
    // Acceptance means the arbiter accepted the offer, NOT that audio was actually heard.
    bus.emit(accepted ? 'chronicler:voiceAccepted' : 'chronicler:voiceRejected', {
      storyId: payload.storyId, sourceRef: payload.sourceRef, channel,
    });
  }
  off.push(bus.on('chronicler:radio', p => offer(p, 'band')));
  off.push(bus.on('chronicler:recall', p => offer(p, 'comms')));
  return { name: 'chroniclerVoiceBridge', destroy() { for (const fn of off.splice(0)) if (typeof fn === 'function') fn(); } };
}
