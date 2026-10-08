/** Optional PRESENTATION adapter. Kept out of the simulation owner and its save state. */
export function createChroniclerVoiceBridge({ bus, helpers = {} } = {}) {
  if (!bus || typeof bus.on !== 'function') throw new TypeError('Voice bridge requires a bus');
  const off = [];
  function offer(payload, channel) {
    if (!payload || typeof payload.text !== 'string') return;
    const accepted = !!(helpers.voice && typeof helpers.voice.say === 'function' && helpers.voice.say({
      id: `${channel}:${payload.sourceRef}`,
      channel, text: payload.text, kind: 'chronicler',
      ttl: 5, source: 'chronicler', sourceRef: payload.sourceRef,
      storyId: payload.storyId, sectorId: payload.sectorId,
    }));
    // Acceptance means the arbiter accepted the offer, NOT that audio was actually heard.
    bus.emit(accepted ? 'chronicler:voiceAccepted' : 'chronicler:voiceRejected', {
      storyId: payload.storyId, sourceRef: payload.sourceRef, channel,
    });
  }
  // Radio used to offer on 'band', which is not a voice channel, so the memorial
  // degraded toward info and the numbers-station carrier treated it as its own
  // line. News is the chronicle's channel. The id is the source ref, so a repeat
  // of the same story replaces the queued line instead of speaking twice.
  off.push(bus.on('chronicler:radio', p => offer(p, 'news')));
  off.push(bus.on('chronicler:recall', p => offer(p, 'comms')));
  return { name: 'chroniclerVoiceBridge', destroy() { for (const fn of off.splice(0)) if (typeof fn === 'function') fn(); } };
}
