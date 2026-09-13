// Telemetry monitor and anomaly detector for Three.js renderer.info.
// Measures draw calls, triangles, memory (geometries, textures), and shader program compilations.

const HISTORY_CAPACITY = 1800; // ~30 seconds at 60fps

export class RendererInfoMonitor {
  constructor() {
    this.enabled = typeof location !== 'undefined'
      ? (new URLSearchParams(location.search).has('perf')
         || new URLSearchParams(location.search).has('perfmonitor')
         || new URLSearchParams(location.search).has('stats')
         || new URLSearchParams(location.search).has('statsgl'))
      : false;
    this.history = [];
    this.anomalies = [];
    this.initialPrograms = null;
    this.isWarmupDone = false;
    this.totalFramesSampled = 0;
    this.lastProgramsCount = 0;
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  markWarmupComplete(currentPrograms = 0) {
    this.isWarmupDone = true;
    this.initialPrograms = currentPrograms;
  }

  /**
   * Sample renderer.info for the current frame.
   * @param {THREE.WebGLRenderer} renderer
   * @param {number} [frameDt]
   */
  sample(renderer, frameDt = 0.0166) {
    if (!this.enabled) return null;
    if (!renderer || !renderer.info) return null;

    const ri = renderer.info;
    const render = ri.render || {};
    const memory = ri.memory || {};
    const programsCount = ri.programs ? ri.programs.length : 0;

    const frameData = {
      timestamp: performance.now(),
      frameIndex: this.totalFramesSampled++,
      calls: render.calls || 0,
      triangles: render.triangles || 0,
      points: render.points || 0,
      lines: render.lines || 0,
      geometries: memory.geometries || 0,
      textures: memory.textures || 0,
      programs: programsCount,
      frameDtMs: frameDt * 1000,
    };

    // Detect late shader compilations (major cause of frame hitches)
    if (this.isWarmupDone && programsCount > this.lastProgramsCount && this.lastProgramsCount > 0) {
      const delta = programsCount - this.lastProgramsCount;
      const anomaly = {
        type: 'mid_flight_shader_compilation',
        frame: frameData.frameIndex,
        timestamp: frameData.timestamp,
        newPrograms: delta,
        totalPrograms: programsCount,
        description: `Late shader compile detected! ${delta} new program(s) compiled mid-gameplay (causes main-thread hitch).`,
      };
      this.anomalies.push(anomaly);
      console.warn(`[SpaceFace][renderer.info] ${anomaly.description}`);
    }

    // Detect high draw call spikes
    if (frameData.calls > 350) {
      this.anomalies.push({
        type: 'draw_call_spike',
        frame: frameData.frameIndex,
        timestamp: frameData.timestamp,
        calls: frameData.calls,
        description: `High draw call count: ${frameData.calls} calls in a single frame.`,
      });
    }

    this.lastProgramsCount = programsCount;
    this.history.push(frameData);
    if (this.history.length > HISTORY_CAPACITY) {
      this.history.shift();
    }

    return frameData;
  }

  /**
   * Compute percentile from array of numbers.
   * @param {number[]} arr
   * @param {number} p (0 to 100)
   */
  _percentile(arr, p) {
    if (!arr.length) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  /**
   * Returns statistically aggregated summary of recent frames.
   * @param {number} [recentCount] Number of recent frames to aggregate (default: all in history)
   * @returns {object}
   */
  getSummary(recentCount = 0) {
    const slice = recentCount > 0 ? this.history.slice(-recentCount) : this.history;
    if (!slice.length) {
      return {
        sampleCount: 0,
        drawCalls: { min: 0, avg: 0, p50: 0, p95: 0, max: 0 },
        triangles: { min: 0, avg: 0, p50: 0, p95: 0, max: 0 },
        memory: { geometries: 0, textures: 0, programs: 0 },
        anomalies: [],
      };
    }

    const calls = slice.map((f) => f.calls);
    const tris = slice.map((f) => f.triangles);
    const sum = (arr) => arr.reduce((a, b) => a + b, 0);

    const latest = slice[slice.length - 1];

    return {
      sampleCount: slice.length,
      drawCalls: {
        min: Math.min(...calls),
        avg: Math.round(sum(calls) / calls.length),
        p50: Math.round(this._percentile(calls, 50)),
        p95: Math.round(this._percentile(calls, 95)),
        p99: Math.round(this._percentile(calls, 99)),
        max: Math.max(...calls),
      },
      triangles: {
        min: Math.min(...tris),
        avg: Math.round(sum(tris) / tris.length),
        p50: Math.round(this._percentile(tris, 50)),
        p95: Math.round(this._percentile(tris, 95)),
        p99: Math.round(this._percentile(tris, 99)),
        max: Math.max(...tris),
      },
      memory: {
        geometries: latest.geometries,
        textures: latest.textures,
        programs: latest.programs,
      },
      anomalies: this.anomalies.slice(-20),
    };
  }

  dumpToConsole() {
    const summary = this.getSummary();
    console.group('[SpaceFace] Three.js renderer.info Performance Summary');
    console.table({
      'Draw Calls (Min / Avg / p95 / Max)': `${summary.drawCalls.min} / ${summary.drawCalls.avg} / ${summary.drawCalls.p95} / ${summary.drawCalls.max}`,
      'Triangles (Min / Avg / p95 / Max)': `${summary.triangles.min.toLocaleString()} / ${summary.triangles.avg.toLocaleString()} / ${summary.triangles.p95.toLocaleString()} / ${summary.triangles.max.toLocaleString()}`,
      'Active Geometries': summary.memory.geometries,
      'Active Textures': summary.memory.textures,
      'Compiled Programs': summary.memory.programs,
      'Anomalies Detected': summary.anomalies.length,
    });
    if (summary.anomalies.length > 0) {
      console.warn('Recent Anomalies:', summary.anomalies);
    }
    console.groupEnd();
    return summary;
  }

  reset() {
    this.history = [];
    this.anomalies = [];
    this.totalFramesSampled = 0;
  }
}

export const globalRendererInfoMonitor = new RendererInfoMonitor();
