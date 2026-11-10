// WebM (VP8) and optional MP4 (H.264) export. A still image is never written in their place.

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, stat } from 'node:fs/promises';

export const EXPORT_LIMITS = Object.freeze({
  maxWidth: 1280,
  maxHeight: 720,
  minWidth: 160,
  minHeight: 90,
  maxFps: 30,
  minFps: 8,
  maxBitrate: 2_500_000,
  maxFileBytes: 8 * 1024 * 1024,
  minDurationS: 15,
  maxDurationS: 30.5,
});

function even(value) {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

function run(command, args, input) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => {
      stderr.push(chunk);
      if (stderr.length > 40) stderr.shift();
    });
    child.on('error', (error) => {
      resolve({ code: 127, stdout: Buffer.alloc(0), stderr: Buffer.from(String(error.message)), error });
    });
    child.on('close', (code) => {
      resolve({
        code: code == null ? 1 : code,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      });
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

export async function videoTooling() {
  const listed = await run('ffmpeg', ['-hide_banner', '-encoders']);
  const probe = await run('ffprobe', ['-version']);
  const text = listed.stdout.toString('utf8');
  return {
    ffmpeg: listed.code === 0,
    ffprobe: probe.code === 0,
    vpx: text.includes('libvpx'),
    x264: text.includes('libx264'),
    unverified: listed.code !== 0 || probe.code !== 0,
  };
}

function rgbaToRgb(frame) {
  const pixels = frame.length / 4;
  const out = Buffer.allocUnsafe(pixels * 3);
  for (let i = 0; i < pixels; i += 1) {
    out[i * 3] = frame[i * 4];
    out[i * 3 + 1] = frame[i * 4 + 1];
    out[i * 3 + 2] = frame[i * 4 + 2];
  }
  return out;
}

async function pipeFrames(child, frames) {
  let broken = false;
  child.stdin.on('error', () => {
    broken = true;
  });
  for (let i = 0; i < frames.length; i += 1) {
    if (broken || child.stdin.destroyed) break;
    const frame = rgbaToRgb(frames[i]);
    const ok = child.stdin.write(frame);
    if (!ok && !broken) {
      try {
        await once(child.stdin, 'drain');
      } catch {
        break;
      }
    }
  }
  if (!broken && !child.stdin.destroyed) child.stdin.end();
}

function ffmpegEncode(frames, { width, height, fps, outPath, codecArgs }) {
  return new Promise((resolve) => {
    const args = [
      '-y',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgb24',
      '-s', `${width}x${height}`,
      '-r', String(fps),
      '-i', 'pipe:0',
      ...codecArgs,
      '-an',
      outPath,
    ];
    const child = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    const stderr = [];
    child.stderr.on('data', (chunk) => {
      stderr.push(chunk);
      if (stderr.length > 50) stderr.shift();
    });
    child.on('error', (error) => {
      resolve({ code: 127, stderr: String(error.message) });
    });
    child.on('close', (code) => {
      resolve({ code: code == null ? 1 : code, stderr: Buffer.concat(stderr).toString('utf8') });
    });
    child.stdin.on('error', () => {});
    pipeFrames(child, frames).catch((error) => {
      child.kill('SIGKILL');
      resolve({ code: 1, stderr: String(error && error.message) });
    });
  });
}

export async function verifyMedia(filePath, expected) {
  const probed = await run('ffprobe', [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);
  if (probed.code !== 0) {
    return { ok: false, reason: 'ffprobe-failed', detail: probed.stderr.toString('utf8').slice(0, 400) };
  }
  const report = JSON.parse(probed.stdout.toString('utf8'));
  const streams = Array.isArray(report.streams) ? report.streams : [];
  const video = streams.find((item) => item.codec_type === 'video');
  const audio = streams.find((item) => item.codec_type === 'audio');
  const duration = Number(report.format && report.format.duration);
  const size = Number(report.format && report.format.size);
  const problems = [];
  if (!video) problems.push('no-video-stream');
  if (audio) problems.push('audio-present');
  if (streams.length !== 1) problems.push('stream-count');
  if (!Number.isFinite(duration)) problems.push('duration-missing');
  else if (Math.abs(duration - expected.seconds) > 0.4) problems.push('duration-mismatch');
  else if (duration < EXPORT_LIMITS.minDurationS || duration > EXPORT_LIMITS.maxDurationS) problems.push('duration-bounds');
  if (video && (video.width !== expected.width || video.height !== expected.height)) problems.push('resolution');
  if (video && video.width > EXPORT_LIMITS.maxWidth) problems.push('resolution-cap');
  if (video && video.height > EXPORT_LIMITS.maxHeight) problems.push('resolution-cap');
  const rate = video && typeof video.r_frame_rate === 'string' ? video.r_frame_rate.split('/') : [];
  const fps = rate.length === 2 && Number(rate[1]) !== 0 ? Number(rate[0]) / Number(rate[1]) : Number.NaN;
  if (!Number.isFinite(fps) || Math.abs(fps - expected.fps) > 0.05) problems.push('fps');
  if (Number.isFinite(fps) && (fps < EXPORT_LIMITS.minFps || fps > EXPORT_LIMITS.maxFps)) problems.push('fps-bounds');
  const fileStat = await stat(filePath);
  if (fileStat.size > EXPORT_LIMITS.maxFileBytes) problems.push('file-size');
  if (fileStat.size < 32) problems.push('file-empty');
  const bitrate = Number.isFinite(duration) && duration > 0 ? (fileStat.size * 8) / duration : Infinity;
  if (bitrate > EXPORT_LIMITS.maxBitrate) problems.push('bitrate');
  const packets = await run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'packet=pts_time',
    '-of', 'json',
    filePath,
  ]);
  let monotonic = false;
  let packetCount = 0;
  if (packets.code === 0) {
    const parsed = JSON.parse(packets.stdout.toString('utf8'));
    const rows = Array.isArray(parsed.packets) ? parsed.packets : [];
    packetCount = rows.length;
    monotonic = rows.length >= 2;
    let previous = -Infinity;
    for (let i = 0; i < rows.length; i += 1) {
      const pts = Number(rows[i].pts_time);
      if (!Number.isFinite(pts) || pts < previous) {
        monotonic = false;
        break;
      }
      previous = pts;
    }
  }
  if (!monotonic) problems.push('timestamps');
  const header = await readFile(filePath);
  if (expected.format === 'webm') {
    const magic = header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3;
    if (!magic) problems.push('webm-magic');
  }
  if (expected.format === 'mp4') {
    const tag = header.slice(4, 8).toString('ascii');
    if (tag !== 'ftyp') problems.push('mp4-ftyp');
  }
  return {
    ok: problems.length === 0,
    problems,
    duration,
    width: video && video.width,
    height: video && video.height,
    fps,
    codec: video && video.codec_name,
    bitrate,
    bytes: size || fileStat.size,
    packetCount,
    monotonic,
    audio: !!audio,
  };
}

/**
 * Encode one planned moment. Refuses unrecorded spans and sub-15s footage.
 * When MP4 is unavailable the same frames are written as WebM and marked fallback.
 */
export async function encodeMoment(plan, samples, options = {}) {
  if (options.framesArePlayback !== true) {
    return {
      ok: false,
      wroteFile: false,
      videoVerified: false,
      reason: 'playback-frames-required',
      error: 'playback-frames-required',
      unverified: true,
    };
  }
  const span = plan && plan.exportSpan;
  if (!span || span.exportable !== true) {
    const reason = span && span.reason ? span.reason : 'unrecorded';
    return {
      ok: false,
      wroteFile: false,
      videoVerified: false,
      reason,
      error: reason,
      missingPreTicks: span ? span.missingPreTicks : null,
      missingPostTicks: span ? span.missingPostTicks : null,
    };
  }
  if (span.seconds < EXPORT_LIMITS.minDurationS || span.seconds > EXPORT_LIMITS.maxDurationS) {
    return {
      ok: false,
      wroteFile: false,
      videoVerified: false,
      reason: 'duration-out-of-bounds',
      error: 'duration-out-of-bounds',
    };
  }
  const tooling = options.tooling || await videoTooling();
  if (!tooling.ffmpeg || !tooling.ffprobe || !tooling.vpx) {
    return {
      ok: false,
      wroteFile: false,
      videoVerified: false,
      reason: 'video-tooling-absent',
      error: 'video-tooling-absent',
      unverified: true,
    };
  }
  let format = options.format === 'mp4' ? 'mp4' : 'webm';
  let fallback = null;
  if (format === 'mp4' && (!tooling.x264 || options.allowMp4 === false)) {
    format = 'webm';
    fallback = 'mp4-unsupported';
  }
  const width = even(Math.min(EXPORT_LIMITS.maxWidth, Math.max(EXPORT_LIMITS.minWidth, options.width || 320)));
  const height = even(Math.min(EXPORT_LIMITS.maxHeight, Math.max(EXPORT_LIMITS.minHeight, options.height || 180)));
  const fps = Math.min(EXPORT_LIMITS.maxFps, Math.max(EXPORT_LIMITS.minFps, options.fps || 10));
  const rendered = {
    ok: Array.isArray(options.frames) && options.frames.length >= 2,
    frames: options.frames,
    seconds: span.seconds,
  };
  if (!rendered.ok) {
    return {
      ok: false,
      wroteFile: false,
      videoVerified: false,
      reason: 'no-playback-frames',
      error: 'no-playback-frames',
    };
  }
  const outPath = options.outPath;
  const codecArgs = format === 'mp4'
    ? ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-bf', '0', '-g', '10', '-b:v', '450k', '-maxrate', '700k', '-bufsize', '900k', '-movflags', '+faststart']
    : ['-c:v', 'libvpx', '-b:v', '450k', '-maxrate', '700k', '-bufsize', '900k', '-deadline', 'realtime', '-cpu-used', '8', '-auto-alt-ref', '0', '-f', 'webm'];
  const encoded = await ffmpegEncode(rendered.frames, {
    width,
    height,
    fps,
    outPath,
    codecArgs,
  });
  if (encoded.code !== 0) {
    const detail = String(encoded.stderr || '').slice(-500) || 'encode-failed';
    return {
      ok: false,
      wroteFile: false,
      videoVerified: false,
      reason: 'encode-failed',
      error: detail,
      detail,
    };
  }
  const verified = await verifyMedia(outPath, { seconds: rendered.seconds, width, height, fps, format });
  return {
    ok: verified.ok,
    wroteFile: true,
    format,
    fallback,
    outPath,
    width,
    height,
    fps,
    frames: rendered.frames.length,
    seconds: rendered.seconds,
    editorialSeconds: plan.moment.seconds,
    claimsUnrecorded: span.claimsUnrecorded === true,
    missingPreTicks: span.missingPreTicks,
    missingPostTicks: span.missingPostTicks,
    verified,
    videoVerified: options.framesArePlayback === true && verified.ok === true,
    error: verified.ok === true ? null : ((verified.problems && verified.problems.join(',')) || verified.reason || 'verify-failed'),
  };
}
