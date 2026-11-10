import { renderBarkUtterancePcm } from './barkVoice.js';

// Context-local, bounded decoded line bodies. Destroying the host drops the entire cache.
export function cachedBarkBuffer(ctx, cache, resolved) {
  if (!ctx || typeof ctx.createBuffer !== 'function') return null;
  const key = `${resolved.registerId}:${resolved.hash}:${resolved.speech.durationS}`;
  if (cache.has(key)) {
    const buffer = cache.get(key);
    cache.delete(key); cache.set(key, buffer);
    return buffer;
  }
  const pcm = renderBarkUtterancePcm(resolved, { sampleRate: 16000 });
  const buffer = ctx.createBuffer(1, pcm.length, 16000);
  buffer.getChannelData(0).set(pcm);
  cache.set(key, buffer);
  while (cache.size > 8) cache.delete(cache.keys().next().value);
  return buffer;
}

export function barkPlaybackRate(resolved) {
  // Jitter is faction-crowd texture. A named contact (factionId null) has one authored cadence.
  if (resolved.factionId == null) return resolved.speech.rate;
  return resolved.speech.rate * (1 + ((resolved.hash % 17) - 8) / 400);
}
