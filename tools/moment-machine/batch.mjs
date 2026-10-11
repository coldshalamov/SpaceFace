// Rank every seeded situation and choose a diverse, encodable batch.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { analyzeMomentStream } from '../../src/presentation/momentMachine/index.js';
import { captionVtt } from '../../src/presentation/momentMachine/captions.js';
import { allSituations, SITUATION_COUNT } from './situations.mjs';
import { encodeMoment, videoTooling } from './encode.mjs';

export function chooseEncodeSet(rows, limit = 10) {
  const pool = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const ranked = row.analysis && row.analysis.selection ? row.analysis.selection.ranked : [];
    for (let m = 0; m < ranked.length; m += 1) {
      const moment = ranked[m];
      if (!moment.footage || moment.footage.status !== 'covered') continue;
      if (moment.seconds < 15 || moment.seconds > 30) continue;
      pool.push({ seed: row.seed, tone: moment.tone, moment, planIndex: m });
    }
  }
  pool.sort((a, b) => b.moment.score - a.moment.score || a.seed - b.seed || (a.moment.id < b.moment.id ? -1 : 1));
  const picked = [];
  const shapes = new Set();
  function take(predicate, cap) {
    for (let i = 0; i < pool.length && picked.length < limit; i += 1) {
      const item = pool[i];
      if (!predicate(item)) continue;
      if (picked.some((held) => held.moment.id === item.moment.id)) continue;
      if (shapes.has(item.moment.shape) && cap != null) continue;
      picked.push(item);
      shapes.add(item.moment.shape);
      if (cap != null && picked.filter(predicate).length >= cap) return;
    }
  }
  take((item) => item.tone === 'feat', 6);
  take((item) => item.tone === 'side-effect', 4);
  for (let i = 0; i < pool.length && picked.length < limit; i += 1) {
    const item = pool[i];
    if (picked.some((held) => held.moment.id === item.moment.id)) continue;
    if (shapes.has(item.moment.shape)) continue;
    picked.push(item);
    shapes.add(item.moment.shape);
  }
  return picked;
}

export function rankSituations(list = allSituations()) {
  const started = process.hrtime.bigint();
  const rows = [];
  for (let i = 0; i < list.length; i += 1) {
    const stream = list[i];
    const analysis = analyzeMomentStream(stream);
    rows.push({
      seed: stream.seed,
      tone: stream.tone,
      analysis,
    });
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  return { rows, elapsedMs, count: list.length };
}

function traceOf(analysis) {
  const ranked = analysis && analysis.selection ? analysis.selection.ranked : [];
  return ranked.map((moment) => ({
    id: moment.id,
    shape: moment.shape,
    rank: moment.rank,
    score: moment.score,
    inTick: moment.inTick,
    outTick: moment.outTick,
    payoffTick: moment.payoffTick,
    footage: moment.footage.status,
    tone: moment.tone,
  }));
}

export async function writeBatch(outDir, options = {}) {
  const ranked = options.ranked || rankSituations();
  const chosen = chooseEncodeSet(ranked.rows, options.limit || 10);
  await mkdir(outDir, { recursive: true });
  const tooling = options.encode === false ? null : await videoTooling();
  const clips = [];
  if (options.encode !== false && tooling && tooling.ffmpeg && tooling.vpx) {
    for (let i = 0; i < chosen.length; i += 1) {
      const item = chosen[i];
      const plan = item.moment && ranked.rows.find((row) => row.seed === item.seed);
      const analysis = plan.analysis;
      const shot = analysis.plans[item.planIndex];
      const caption = analysis.captions[item.planIndex];
      const stem = `seed-${item.seed}-${item.moment.shape}`;
      const webmPath = path.join(outDir, `${stem}.webm`);
      const encoded = await encodeMoment(shot, analysis.selection.stream.samples, {
        outPath: webmPath,
        format: 'webm',
        tooling,
        width: options.width || 320,
        height: options.height || 180,
        fps: options.fps || 10,
      });
      let mp4 = null;
      if (encoded.ok && tooling.x264 && options.mp4 !== false && i === 0) {
        mp4 = await encodeMoment(shot, analysis.selection.stream.samples, {
          outPath: path.join(outDir, `${stem}.mp4`),
          format: 'mp4',
          tooling,
          width: options.width || 320,
          height: options.height || 180,
          fps: options.fps || 10,
        });
      }
      const vttPath = path.join(outDir, `${stem}.vtt`);
      const captionPath = path.join(outDir, `${stem}.captions.json`);
      await writeFile(vttPath, captionVtt(caption));
      await writeFile(captionPath, JSON.stringify(caption, null, 2));
      clips.push({
        seed: item.seed,
        momentId: item.moment.id,
        shape: item.moment.shape,
        tone: item.moment.tone,
        webm: encoded.ok ? webmPath : null,
        mp4: mp4 && mp4.ok ? mp4.outPath : null,
        captions: captionPath,
        vtt: vttPath,
        encode: encoded,
        mp4Encode: mp4,
      });
    }
  }
  const categories = [];
  for (let i = 0; i < chosen.length; i += 1) {
    if (!categories.includes(chosen[i].moment.shape)) categories.push(chosen[i].moment.shape);
  }
  let boring = 0;
  let sideEffects = 0;
  let feats = 0;
  const traces = [];
  for (let i = 0; i < ranked.rows.length; i += 1) {
    const row = ranked.rows[i];
    if (row.analysis.selection && row.analysis.selection.boring) boring += 1;
    if (row.tone === 'side-effect' && row.analysis.selection && row.analysis.selection.ranked.length) sideEffects += 1;
    if (row.tone === 'feat' && row.analysis.selection && row.analysis.selection.ranked.length) feats += 1;
    traces.push({ seed: row.seed, tone: row.tone, ranked: traceOf(row.analysis) });
  }
  const index = {
    schema: 'spaceface.momentIndex.v1',
    situations: ranked.count || SITUATION_COUNT,
    selectMs: ranked.elapsedMs,
    boringRejected: boring,
    featsSelected: feats,
    sideEffectsSelected: sideEffects,
    categories,
    categoryCount: categories.length,
    clipCount: clips.filter((clip) => clip.encode && clip.encode.ok).length,
    tooling: tooling || { skipped: true },
    videoVerified: clips.length > 0 && clips.every((clip) => clip.encode && clip.encode.ok && clip.encode.verified && clip.encode.verified.ok),
    traces,
    clips,
  };
  await writeFile(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2));
  return index;
}
