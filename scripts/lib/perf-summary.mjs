// Pure Markdown formatter for spaceface.performanceProfile.v1 JSON reports.

const BOTTLENECK_ATTACK = {
  'render-submit-present': 'Attack **GPU/WebGL submit + present**: batch materials, reduce shader variants, cheaper transparent/fullscreen compositing. Keep authored visuals enabled.',
  'game-js-frame-callback': 'Attack **game JS frame callback**: split the rAF owner and remove the largest per-frame JS work before touching renderer or assets.',
  'untracked-frame-callback-work': 'Attack **uninstrumented JS**: add named phase counters around remaining callback work before optimizing blind.',
  'loop-backlog-shedding': 'Attack **fixed-step catch-up**: bound sim backlog shedding so 30fps presentation does not discard simulation time.',
  'material-fragmentation': 'Attack **material fragmentation**: canonical material roles and export sharing to cut visible shader/draw churn.',
  'ui-compositor-effects-secondary': 'Attack **UI compositor effects** (secondary): containment, fewer full-viewport filters/shadows; preserve HUD styling.',
  'ui-root-overlay-compositor-secondary': 'Attack **root overlay compositor** (secondary): hide/unmount faded fullscreen/blur layers after transitions.',
  'ui-layer-compositor-secondary': 'Attack **HUD shell compositor** (secondary): cheaper flight HUD layers without hiding the HUD.',
  'ui-region-compositor-secondary': 'Attack **specific HUD regions** (secondary): simplify the expensive overlay identified by isolation variants.',
  'post-processing-secondary': 'Attack **post pipeline structure** (secondary): optimize bloom/render-target graph; bloom-off is not shippable.',
  'post-composite-shader-secondary': 'Attack **full-screen composite shader** (secondary): cheaper grade/grain path, not disabling grade.',
  'render-graph-candidate': 'Attack **duplicate post paths**: promote one maintained render graph if diagnostics consistently win.',
  'unclassified-frame-pacing': 'Attack **unknown bucket**: run one more diagnostic variant at a time until the failing frame bucket isolates.',
  'within-budget': 'No primary bottleneck — maintain budgets and watch regressions.',
};

const UI_SHELL_BUDGET_NAMES = [
  'ui.hiddenBackdropActive.max',
  'ui.inactiveDockFadeDisplayed.max',
  'ui.deadVignetteShells.max',
  'ui.inactiveFullscreenShellsDisplayed.max',
  'ui.inactiveBootOverlayDisplayed.max',
];

export function performanceProfileMarkdownPath(jsonPath) {
  const path = String(jsonPath || '');
  if (path.endsWith('.json')) return `${path.slice(0, -5)}.md`;
  return path.endsWith('.md') ? path : `${path}.md`;
}

export function formatPerformanceProfileMarkdown(report) {
  if (!report || typeof report !== 'object') {
    throw new TypeError('formatPerformanceProfileMarkdown expects a report object');
  }

  const lines = [];
  const summary = report.summary || summarizeFromScenarios(report.scenarios || []);
  const scenarios = Array.isArray(report.scenarios) ? report.scenarios : [];
  const scenarioByName = new Map(scenarios.map((scenario) => [scenario.name, scenario]));

  lines.push('# SpaceFace Performance Profile Summary');
  lines.push('');
  lines.push(`- Schema: \`${report.schema || 'unknown'}\``);
  if (report.generatedAt) lines.push(`- Generated: ${report.generatedAt}`);
  if (report.runner) {
    const r = report.runner;
    lines.push(`- Viewport: ${r.width}×${r.height}, seed ${r.seed}, warmup ${r.warmupMs}ms, duration ${r.durationMs}ms`);
    if (r.strict) lines.push('- Strict mode: **on** (probe exits non-zero on budget failure)');
    if (r.diagnosticVariants) lines.push('- Diagnostic variants: **enabled**');
  }
  lines.push('');

  lines.push('## Overall');
  lines.push('');
  lines.push(`**Result: ${summary.pass ? 'PASS' : 'FAIL'}**`);
  lines.push('');
  if (summary.failedBudgets?.length) {
    lines.push('### Failed budgets');
    lines.push('');
    lines.push('| Scenario | Budget | Value | Limit |');
    lines.push('| --- | --- | ---: | ---: |');
    for (const row of summary.failedBudgets) {
      lines.push(`| ${row.scenario} | ${row.budget} | ${fmt(row.value)} | ${fmt(row.limit)} |`);
    }
    lines.push('');
  } else {
    lines.push('All required budgets passed.');
    lines.push('');
  }

  const summaryScenarios = summary.scenarios || [];
  for (const condensed of summaryScenarios) {
    const full = scenarioByName.get(condensed.name) || null;
    appendScenarioSection(lines, condensed, full, report.qualityPreserving);
  }

  if (!summaryScenarios.length && scenarios.length) {
    for (const scenario of scenarios) {
      appendScenarioSection(lines, null, scenario, report.qualityPreserving);
    }
  }

  lines.push('## How to read variants');
  lines.push('');
  lines.push('- **diagnostic-only variant** — probe isolation toggle; proves which subsystem costs frames. **Not** a shippable gameplay or quality fix.');
  lines.push('- **player-facing fix** — structural optimization that preserves default visuals/settings (see bottleneck next contracts and `design/PERF_BUDGET.md`).');
  lines.push('');

  if (report.environment?.notes?.length) {
    lines.push('## Environment notes');
    lines.push('');
    for (const note of report.environment.notes) lines.push(`- ${note}`);
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

function appendScenarioSection(lines, condensed, full, qualityPreserving) {
  const name = (condensed && condensed.name) || (full && full.name) || 'unknown';
  const bottleneck = (condensed && condensed.bottleneck) || (full && full.bottleneck) || null;
  const pass = condensed ? condensed.pass : (full && full.pass);
  const rafP95 = pick(condensed, full, 'rafFrameP95', () => full?.rafFrameMs?.p95);
  const hitches32 = pick(condensed, full, 'rafHitchesOver32', () => full?.rafFrameMs?.over32);
  const hitchesBudget = pick(condensed, full, 'rafHitchesOverBudget', () => full?.rafFrameMs?.overHitchBudget);
  const diagP95 = pick(condensed, full, 'diagnosticFrameP95', () => full?.diagnosticFrameMs?.p95);
  const renderCallsPeak = pick(condensed, full, 'renderCallsPeak', () => full?.render?.calls?.max);
  const trianglesPeak = pick(condensed, full, 'trianglesPeak', () => full?.render?.triangles?.max);

  lines.push(`## Scenario: ${name}`);
  lines.push('');
  if (pass != null) lines.push(`Scenario budgets: **${pass ? 'PASS' : 'FAIL'}**`);
  lines.push('');

  if (bottleneck) {
    lines.push('### Bottleneck (attack this next)');
    lines.push('');
    lines.push(`- **Primary:** \`${bottleneck.primary}\``);
    if (bottleneck.labels?.length) {
      lines.push(`- **Labels:** ${bottleneck.labels.map((l) => `\`${l}\``).join(', ')}`);
    }
    lines.push(`- **Confidence:** ${bottleneck.confidence || 'unknown'}`);
    const attack = BOTTLENECK_ATTACK[bottleneck.primary] || `Investigate bottleneck class \`${bottleneck.primary}\`.`;
    lines.push(`- **Next agent action:** ${attack}`);
    if (bottleneck.ruledOut?.length) {
      lines.push(`- **Ruled out:** ${bottleneck.ruledOut.map((l) => `\`${l}\``).join(', ')}`);
    }
    if (bottleneck.nextContracts?.length) {
      lines.push('- **Contracts:**');
      for (const contract of bottleneck.nextContracts) lines.push(`  - ${contract}`);
    }
    lines.push('');
  }

  lines.push('### Frame pacing');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | ---: |');
  lines.push(`| rAF p95 (ms) | ${fmt(rafP95)} |`);
  lines.push(`| Hitches >32 ms | ${fmt(hitches32)} |`);
  lines.push(`| Hitches over budget | ${fmt(hitchesBudget)} |`);
  lines.push(`| Diagnostic frame p95 (ms) | ${fmt(diagP95)} |`);
  lines.push('');

  const phases = full?.phases || null;
  if (phases) {
    lines.push('### Phase p95 (ms)');
    lines.push('');
    lines.push('| Phase | p95 |');
    lines.push('| --- | ---: |');
    for (const key of ['sim', 'simFrame', 'render', 'vfx', 'feel', 'ui']) {
      if (phases[key] != null) lines.push(`| ${key} | ${fmt(phases[key])} |`);
    }
    lines.push('');
  }

  const callback = full?.callback || condensed?.callback || null;
  if (callback) {
    lines.push('### Frame callback (ms p95)');
    lines.push('');
    lines.push('| Bucket | p95 |');
    lines.push('| --- | ---: |');
    lines.push(`| callback | ${fmt(callback.callback)} |`);
    lines.push(`| untracked | ${fmt(callback.untracked)} |`);
    lines.push('');
  }

  lines.push('### Render load');
  lines.push('');
  lines.push('| Metric | Peak |');
  lines.push('| --- | ---: |');
  lines.push(`| draw calls | ${fmt(renderCallsPeak)} |`);
  lines.push(`| triangles | ${fmt(trianglesPeak)} |`);
  lines.push('');

  const scene = condensed?.sceneStructure || null;
  const sceneStats = full?.sceneStats || null;
  const visibleMeshes = scene?.visibleMeshes ?? sceneStats?.visibleMeshes;
  const shipDynamic = scene?.shipDynamicMeshes ?? countShipMeshes(sceneStats);
  const materialKeys = scene?.materialKeys ?? sceneStats?.visibleMaterialKeyCount;
  if (visibleMeshes != null || shipDynamic != null || materialKeys != null) {
    lines.push('### Scene structure');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('| --- | ---: |');
    if (materialKeys != null) lines.push(`| material keys (visible) | ${fmt(materialKeys)} |`);
    if (visibleMeshes != null) lines.push(`| visible meshes | ${fmt(visibleMeshes)} |`);
    if (shipDynamic != null) lines.push(`| ship dynamic meshes | ${fmt(shipDynamic)} |`);
    if (scene?.shipCanopySurfaces != null) lines.push(`| ship canopy surfaces | ${fmt(scene.shipCanopySurfaces)} |`);
    if (scene?.shipFanSurfaces != null) lines.push(`| ship fan surfaces | ${fmt(scene.shipFanSurfaces)} |`);
    lines.push('');
  }

  const post = full?.post || null;
  if (post) {
    lines.push('### Post-processing');
    lines.push('');
    lines.push(`- Active path: \`${post.activePath ?? 'unknown'}\``);
    lines.push(`- Render graph: ${post.renderGraph ? 'on' : 'off'}`);
    if (post.bufferWidth != null && post.bufferHeight != null) {
      lines.push(`- Internal buffer: ${fmt(post.bufferWidth)}×${fmt(post.bufferHeight)}`);
    }
    if (post.fullFramePasses != null || post.bloomPasses != null) {
      lines.push(`- Passes: full-frame ${fmt(post.fullFramePasses)}, bloom ${fmt(post.bloomPasses)}`);
    }
    if (post.renderTargetCount != null) {
      lines.push(`- Render targets: ${fmt(post.renderTargetCount)} (alloc during sample: ${fmt(post.renderTargetAllocationsDuringSample)})`);
    }
    if (post.grainSource) lines.push(`- Grain: \`${post.grainSource}\` @ ${fmt(post.grainFps)} fps`);
    if (post.bloom) {
      const b = post.bloom;
      lines.push('- Bloom details:');
      lines.push(`  - resolution: ${fmt(b.width)}×${fmt(b.height)}, levels ${fmt(b.levels)}`);
      lines.push(`  - targets: ${fmt(b.targets ?? b.renderTargetCount)}`);
    }
    lines.push('');
  }

  const uiShell = extractUiShellBudgets(full?.budgets);
  if (uiShell.length) {
    lines.push('### UI compositor shell flags');
    lines.push('');
    lines.push('| Flag | Peak value | Pass |');
    lines.push('| --- | ---: | :---: |');
    for (const row of uiShell) {
      lines.push(`| ${row.name} | ${fmt(row.value)} | ${row.pass ? 'yes' : '**no**'} |`);
    }
    lines.push('');
  }

  const broadphase = condensed?.broadphase || spatialRatesFromScenario(full);
  if (broadphase) {
    lines.push('### Spatial hash rates');
    lines.push('');
    lines.push('| Metric | /sec |');
    lines.push('| --- | ---: |');
    lines.push(`| rebuilds | ${fmt(broadphase.rebuildsPerSecond)} |`);
    lines.push(`| dynamic rebuilds | ${fmt(broadphase.dynamicRebuildsPerSecond)} |`);
    lines.push(`| queries | ${fmt(broadphase.queriesPerSecond)} |`);
    lines.push(`| candidates | ${fmt(broadphase.candidatesPerSecond)} |`);
    lines.push('');
  }

  const topSystems = full?.perf?.topSystems || [];
  if (topSystems.length) {
    lines.push('### Top systems by p95 (ms)');
    lines.push('');
    lines.push('| System | p95 | avg | max |');
    lines.push('| --- | ---: | ---: | ---: |');
    const sorted = [...topSystems].sort((a, b) => (b.p95 || 0) - (a.p95 || 0));
    for (const sys of sorted.slice(0, 12)) {
      lines.push(`| ${sys.name} | ${fmt(sys.p95)} | ${fmt(sys.avg)} | ${fmt(sys.max)} |`);
    }
    lines.push('');
  }

  const variants = full?.diagnosticVariants || [];
  if (variants.length && Number.isFinite(rafP95)) {
    lines.push('### Diagnostic variant deltas (vs baseline rAF p95)');
    lines.push('');
    lines.push('Sorted by largest frame-time improvement. Variants are **diagnostic-only** unless noted otherwise.');
    lines.push('');
    lines.push('| Variant | Kind | Baseline p95 | Variant p95 | Δ ms | Note |');
    lines.push('| --- | --- | ---: | ---: | ---: | --- |');
    const rows = variants
      .map((variant) => {
        const variantP95 = variant?.rafFrameMs?.p95;
        const delta = Number.isFinite(variantP95) ? round(rafP95 - variantP95) : NaN;
        return {
          name: variant.name,
          kind: classifyVariantKind(variant, qualityPreserving),
          baseline: rafP95,
          variantP95,
          delta,
          note: shorten(variant.note, 80),
        };
      })
      .filter((row) => Number.isFinite(row.variantP95))
      .sort((a, b) => (b.delta || 0) - (a.delta || 0));
    for (const row of rows) {
      lines.push(`| ${row.name} | ${row.kind} | ${fmt(row.baseline)} | ${fmt(row.variantP95)} | ${fmtSigned(row.delta)} | ${row.note} |`);
    }
    lines.push('');
  }
}

function summarizeFromScenarios(scenarios) {
  const failedBudgets = [];
  for (const scenario of scenarios) {
    for (const budget of scenario.budgets || []) {
      if (budget.severity === 'required' && !budget.pass) {
        failedBudgets.push({
          scenario: scenario.name,
          budget: budget.name,
          value: budget.value,
          limit: budget.limit,
        });
      }
    }
  }
  return {
    pass: failedBudgets.length === 0,
    failedBudgets,
    scenarios: scenarios.map((scenario) => ({
      name: scenario.name,
      pass: scenario.pass,
      rafFrameP95: scenario.rafFrameMs?.p95,
      rafHitchesOver32: scenario.rafFrameMs?.over32,
      rafHitchesOverBudget: scenario.rafFrameMs?.overHitchBudget,
      diagnosticFrameP95: scenario.diagnosticFrameMs?.p95,
      renderCallsPeak: scenario.render?.calls?.max,
      trianglesPeak: scenario.render?.triangles?.max,
      bottleneck: scenario.bottleneck || null,
      sceneStructure: scenario.sceneStats ? {
        visibleMeshes: scenario.sceneStats.visibleMeshes,
        shipDynamicMeshes: countShipMeshes(scenario.sceneStats),
        materialKeys: scenario.sceneStats.visibleMaterialKeyCount,
      } : null,
      broadphase: spatialRatesFromScenario(scenario),
      callback: scenario.callback || null,
    })),
  };
}

function spatialRatesFromScenario(scenario) {
  const hash = scenario?.perf?.counters?.spatialHash;
  if (!hash) return null;
  const durationSec = Math.max(0.001, (scenario?.sampleWindow?.durationMs || 7000) / 1000);
  return {
    rebuildsPerSecond: round((hash.rebuilds || 0) / durationSec),
    dynamicRebuildsPerSecond: round((hash.dynamicRebuilds || 0) / durationSec),
    queriesPerSecond: round((hash.queries || 0) / durationSec),
    candidatesPerSecond: round((hash.candidates || 0) / durationSec),
  };
}

function countShipMeshes(sceneStats) {
  if (!sceneStats?.visibleMeshByCategory) return null;
  const ship = sceneStats.visibleMeshByCategory.ship;
  return ship != null ? ship : null;
}

function extractUiShellBudgets(budgets) {
  if (!Array.isArray(budgets)) return [];
  return budgets
    .filter((b) => UI_SHELL_BUDGET_NAMES.includes(b.name))
    .map((b) => ({ name: b.name, value: b.value, pass: b.pass }));
}

function classifyVariantKind(variant, qualityPreserving) {
  const note = String(variant?.note || '').toLowerCase();
  if (note.includes('diagnostic only') || note.includes('diagnostic-only') || note.includes('not a visual-quality fix')
    || note.includes('not a gameplay') || note.includes('not a quality-preserving fix')) {
    return 'diagnostic-only variant';
  }
  if (qualityPreserving?.forbiddenShortcuts?.some((s) => note.includes(String(s).toLowerCase()))) {
    return 'diagnostic-only variant';
  }
  return 'player-facing fix candidate';
}

function pick(condensed, full, condensedKey, fallback) {
  if (condensed && condensed[condensedKey] != null) return condensed[condensedKey];
  return fallback();
}

function fmt(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function fmtSigned(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const rounded = Number.isInteger(n) ? n : Number(n.toFixed(1));
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function round(value) {
  if (!Number.isFinite(value)) return value;
  return Number(value.toFixed(2));
}

function shorten(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}