// Software top-down frames for an offline shot plan. No HUD, no type, no title card.

import { createOfflineCameraLease, poseAt } from '../../src/presentation/momentMachine/shotPlan.js';

export const DRAWS_HUD = false;
export const BACKGROUND = Object.freeze({ r: 7, g: 11, b: 20 });

const SUBJECT = Object.freeze({ r: 120, g: 210, b: 220 });
const SECONDARY = Object.freeze({ r: 232, g: 164, b: 64 });
const OTHER = Object.freeze({ r: 170, g: 186, b: 198 });

function paintBackground(buf) {
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = BACKGROUND.r;
    buf[i + 1] = BACKGROUND.g;
    buf[i + 2] = BACKGROUND.b;
    buf[i + 3] = 255;
  }
}

function stamp(buf, width, height, x, y, rgb) {
  const radius = 4;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const sx = x + dx;
      const sy = y + dy;
      if (sx < 2 || sy < 2 || sx >= width - 2 || sy >= height - 2) continue;
      const offset = (sy * width + sx) * 4;
      buf[offset] = rgb.r;
      buf[offset + 1] = rgb.g;
      buf[offset + 2] = rgb.b;
      buf[offset + 3] = 255;
    }
  }
}

function bodiesAt(samples, tick, subject, secondary) {
  const found = new Map();
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    if (sample.tick > tick || tick - sample.tick > 24) continue;
    const key = `${sample.id}:${sample.generation}`;
    const held = found.get(key);
    if (!held || sample.tick > held.tick) found.set(key, sample);
  }
  const extras = [subject, secondary];
  for (let i = 0; i < extras.length; i += 1) {
    const actor = extras[i];
    if (!actor) continue;
    const key = `${actor.id}:${actor.generation}`;
    if (found.has(key)) continue;
    const pose = poseAt(samples, actor, tick);
    if (pose) found.set(key, pose);
  }
  return Array.from(found.values());
}

function roleColor(sample, subject, secondary) {
  if (subject && sample.id === subject.id && sample.generation === subject.generation) return SUBJECT;
  if (secondary && sample.id === secondary.id && sample.generation === secondary.generation) return SECONDARY;
  return OTHER;
}

export function renderFrame(plan, samples, tick, width, height, lease) {
  const buf = Buffer.alloc(width * height * 4);
  paintBackground(buf);
  const camera = lease.frameAt(tick);
  if (!camera || camera.recorded !== true || !camera.focus || camera.zoom == null) return buf;
  const scale = (height * 0.5) / camera.zoom;
  const drawn = bodiesAt(samples, tick, plan.subject, plan.secondary);
  for (let i = 0; i < drawn.length; i += 1) {
    const body = drawn[i];
    const sx = Math.round(width / 2 + (body.x - camera.focus.x) * scale);
    const sy = Math.round(height / 2 + (body.z - camera.focus.z) * scale);
    stamp(buf, width, height, sx, sy, roleColor(body, plan.subject, plan.secondary));
  }
  return buf;
}

export function frameTicks(span, fps) {
  const frameCount = Math.max(1, Math.round(span.seconds * fps));
  const ticks = new Array(frameCount);
  if (frameCount === 1) {
    ticks[0] = span.inTick;
    return ticks;
  }
  for (let i = 0; i < frameCount; i += 1) {
    const u = i / (frameCount - 1);
    ticks[i] = Math.round(span.inTick + u * (span.outTick - span.inTick));
  }
  return ticks;
}

export function renderMoment(plan, samples, options = {}) {
  const width = options.width || 320;
  const height = options.height || 180;
  const fps = options.fps || 10;
  const span = plan && plan.exportSpan;
  if (!span || span.exportable !== true) return { ok: false, reason: 'unrecorded', frames: [] };
  const ticks = frameTicks(span, fps);
  const lease = createOfflineCameraLease(plan);
  const frames = new Array(ticks.length);
  for (let i = 0; i < ticks.length; i += 1) {
    frames[i] = renderFrame(plan, samples, ticks[i], width, height, lease);
  }
  lease.release();
  return { ok: true, frames, ticks, width, height, fps, seconds: ticks.length / fps };
}

export function inkCount(frame, width, height) {
  let ink = 0;
  const area = width * height;
  for (let i = 0; i < area; i += 1) {
    const offset = i * 4;
    if (frame[offset] !== BACKGROUND.r || frame[offset + 1] !== BACKGROUND.g || frame[offset + 2] !== BACKGROUND.b) {
      ink += 1;
    }
  }
  return ink;
}
