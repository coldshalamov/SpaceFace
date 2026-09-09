// scripts/lib/critic/frameSelect.mjs — which frames the critic is actually shown.
//
// WHY THIS EXISTS
// ---------------
// A repaired strip is 400+ PNGs. Handing a vision model 400 absolute paths does two bad things:
// it makes a 70 KB prompt that no model reads to the end, and it lets the model answer from the
// numbers in the frame list instead of from the pictures. A critic that never opened an image
// still produces a confident verdict with a plausible frame index — the exact failure this lane
// exists to end, one level up.
//
// So the critic is shown a BOUNDED set and may cite only what it was shown. The set is chosen the
// way a person reviewing a fight would choose it:
//
//   - the first and last frame (what the arena looked like before and after);
//   - for the biggest moments the player was actually in, a BEFORE / AT / AFTER triplet, because
//     "did the impact get an answer" (rubric q2, audit finding A11) is a question about the
//     half-second after contact and cannot be answered from a single frame;
//   - the remaining budget spread evenly over the strip, so a long quiet stretch is visible as a
//     long quiet stretch (rubric q9).
//
// Selection is deterministic: same manifest in, same frames out.

/** How many frames a vision model is shown by default. Twelve is the contact sheet; sixteen fits. */
export const DEFAULT_MAX_FRAMES = 16;

/** Seconds after a moment at which the world's answer should already be visible. */
export const MOMENT_ANSWER_LEAD_S = 0.15;
export const MOMENT_ANSWER_TAIL_S = 0.45;

/**
 * The frame whose simTime is nearest `t`.
 * @param {Array<object>} frames
 * @param {number} t
 * @returns {object|null}
 */
export function frameNearestTime(frames, t) {
  if (!Array.isArray(frames) || frames.length === 0) return null;
  let best = frames[0];
  let bestD = Math.abs((best.simTime ?? 0) - t);
  for (const f of frames) {
    const d = Math.abs((f.simTime ?? 0) - t);
    if (d < bestD) { best = f; bestD = d; }
  }
  return best;
}

/**
 * Chooses the frames the critic is shown.
 *
 * @param {object} manifest spaceface.frameStripManifest.v2
 * @param {object} [options]
 * @param {number} [options.maxFrames]
 * @returns {{ frames: Array<object>, reason: string }}
 */
export function selectCriticFrames(manifest, options = {}) {
  const all = Array.isArray(manifest?.frames) ? manifest.frames : [];
  const maxFrames = Math.max(2, Number(options.maxFrames) || DEFAULT_MAX_FRAMES);
  if (all.length <= maxFrames) {
    return { frames: all.slice(), reason: `the whole strip (${all.length} frames)` };
  }

  const byIndex = new Map();
  const take = (f) => { if (f && !byIndex.has(f.index)) byIndex.set(f.index, f); };

  take(all[0]);
  take(all[all.length - 1]);

  // Moments the player was in, biggest first. A moment nobody was in teaches the critic nothing
  // about whether the PLAYER's hits get an answer.
  const inSpan = Array.isArray(manifest?.momentsInSpan) && manifest.momentsInSpan.length > 0
    ? manifest.momentsInSpan
    : manifest?.moments;
  const moments = (Array.isArray(inSpan) ? inSpan : [])
    .filter((m) => m && m.playerInvolved)
    .slice()
    .sort((a, b) => (b.magnitude || 0) - (a.magnitude || 0));

  let momentsUsed = 0;
  for (const m of moments) {
    if (byIndex.size + 3 > maxFrames) break;
    const t = Number(m.simTime) || 0;
    take(frameNearestTime(all, t - MOMENT_ANSWER_LEAD_S));
    take(frameNearestTime(all, t));
    take(frameNearestTime(all, t + MOMENT_ANSWER_TAIL_S));
    momentsUsed += 1;
  }

  // Fill what is left with an even spread across the whole strip.
  const remaining = maxFrames - byIndex.size;
  if (remaining > 0) {
    for (let i = 0; i < remaining; i++) {
      const at = Math.round(((i + 0.5) / remaining) * (all.length - 1));
      // walk outward to the first frame not already chosen
      for (let step = 0; step < all.length; step++) {
        const a = all[at + step];
        const b = all[at - step];
        if (a && !byIndex.has(a.index)) { take(a); break; }
        if (b && !byIndex.has(b.index)) { take(b); break; }
      }
      if (byIndex.size >= maxFrames) break;
    }
  }

  const frames = [...byIndex.values()].sort((a, b) => a.index - b.index).slice(0, maxFrames);
  const reason = momentsUsed > 0
    ? `${frames.length} of ${all.length} frames: before/at/after each of the ${momentsUsed} biggest moments the ship was in, plus an even spread`
    : `${frames.length} of ${all.length} frames, evenly spread (no moment involved the ship)`;
  return { frames, reason };
}
