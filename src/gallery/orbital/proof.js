// Serial proof runner. Hosts share singleton systems, so scenarios run one at a time.

import { SCENARIOS, PLAYABLE_SLICE, getScenario } from './catalog.js';
import { openSession, resetSession } from './session.js';
import { validateCatalog } from './validate.js';

export async function runScenario(scenario, strategyId, options = {}) {
  const session = await openSession(scenario.id, {
    strategyId, scenario, trace: !!options.trace, tape: options.tape, exhibit: true,
  });
  try {
    const result = await session.play();
    return {
      id: scenario.id,
      strategyId: session.strategyId,
      result,
      snapshot: session.snapshot(),
      trace: session.state.orbitalGallery && session.state.orbitalGallery.trace,
      proof: session.proof(),
      credits: session.state.player.credits,
      creditsAtOpen: session.state.orbitalGallery ? session.state.orbitalGallery.creditsAtOpen : null,
    };
  } finally {
    session.dispose();
  }
}

export async function runGalleryProof() {
  const catalogIssues = validateCatalog(SCENARIOS);
  const failures = [];
  const wins = [];
  if (catalogIssues.length) {
    return { ok: false, summary: catalogIssues.join('\n'), catalogIssues, wins, failures };
  }

  let physicsProof = null;
  for (const scenario of SCENARIOS) {
    for (const strategy of scenario.strategies) {
      let row;
      try {
        row = await runScenario(scenario, strategy.id, { trace: false });
      } catch (error) {
        failures.push({ id: scenario.id, strategyId: strategy.id, error: error.message });
        continue;
      }
      if (!physicsProof) physicsProof = row.proof;
      if (!row.result || !row.result.won) {
        failures.push({
          id: scenario.id,
          strategyId: strategy.id,
          reason: row.result && row.result.reason,
          snapshot: row.snapshot,
        });
        continue;
      }
      if (row.credits !== row.creditsAtOpen) {
        failures.push({ id: scenario.id, strategyId: strategy.id, reason: 'credits-mutated' });
        continue;
      }
      wins.push({
        id: scenario.id,
        strategyId: strategy.id,
        tick: row.result.tick,
        pocketId: row.result.pocketId,
        signature: row.result.signature,
        score: row.result.score,
        styleChip: row.snapshot.styleChip,
      });
    }
  }

  const dualIssues = [];
  const byId = new Map();
  for (const win of wins) {
    if (!byId.has(win.id)) byId.set(win.id, []);
    byId.get(win.id).push(win);
  }
  for (const scenario of SCENARIOS) {
    if (scenario.strategies.length < 2) continue;
    const rows = byId.get(scenario.id) || [];
    if (rows.length < 2) continue;
    if (JSON.stringify(rows[0].signature) === JSON.stringify(rows[1].signature)) {
      dualIssues.push(`${scenario.id} strategies share a signature ${JSON.stringify(rows[0].signature)}`);
    }
  }

  const idleIssues = [];
  for (const scenario of SCENARIOS) {
    let row;
    try {
      row = await runScenario(scenario, scenario.strategies[0].id, { tape: [] });
    } catch (error) {
      idleIssues.push(`${scenario.id} idle threw ${error.message}`);
      continue;
    }
    if (row.result && row.result.won) idleIssues.push(`${scenario.id} won with empty input`);
  }

  let determinism = null;
  const first = SCENARIOS[0];
  const a = await runScenario(first, first.strategies[0].id);
  const b = await runScenario(first, first.strategies[0].id);
  determinism = JSON.stringify(a.snapshot) === JSON.stringify(b.snapshot);
  if (!determinism) {
    failures.push({ id: first.id, strategyId: 'determinism', reason: 'snapshot-mismatch', a: a.snapshot, b: b.snapshot });
  }

  const retry = await runRetry(SCENARIOS[0]);
  if (!retry.ok) failures.push({ id: SCENARIOS[0].id, strategyId: 'retry', reason: retry.reason, detail: retry });

  const live = await runLiveControl(SCENARIOS[0]);
  if (!live.ok) failures.push({ id: SCENARIOS[0].id, strategyId: 'live', reason: live.reason });

  const sliceMissing = PLAYABLE_SLICE.filter((id) => !wins.some((win) => win.id === id));
  const expectedWins = SCENARIOS.reduce((count, scenario) => count + scenario.strategies.length, 0);
  const ok = failures.length === 0 && dualIssues.length === 0 && idleIssues.length === 0
    && sliceMissing.length === 0 && wins.length === expectedWins;

  const lines = [
    `wins ${wins.length}/${SCENARIOS.reduce((count, scenario) => count + scenario.strategies.length, 0)}`,
    `failures ${failures.length}`,
    `dualIssues ${dualIssues.length}`,
    `idleIssues ${idleIssues.length}`,
    `sliceMissing ${sliceMissing.join(',') || 'none'}`,
    `determinism ${determinism}`,
    `backend ${physicsProof && physicsProof.backend}`,
  ];
  if (failures.length) {
    for (const failure of failures) {
      lines.push(`FAIL ${failure.id} ${failure.strategyId} ${failure.reason || failure.error}`);
    }
  }
  for (const issue of dualIssues) lines.push(`DUAL ${issue}`);
  for (const issue of idleIssues) lines.push(`IDLE ${issue}`);

  return {
    ok,
    summary: lines.join('\n'),
    wins,
    failures,
    dualIssues,
    idleIssues,
    sliceMissing,
    determinism,
    physicsProof,
    retry,
    live,
  };
}

async function runRetry(scenario) {
  let session = await openSession(scenario.id, { scenario, tape: [], strategyId: scenario.strategies[0].id });
  try {
    const failed = await session.play();
    if (failed && failed.won) return { ok: false, reason: 'idle-won' };
    const credits = session.state.player.credits;
    session = await resetSession(session);
    const won = await session.play();
    if (!won || !won.won) return { ok: false, reason: 'retry-lost', result: won, snapshot: session.snapshot() };
    if (session.state.player.credits !== credits) return { ok: false, reason: 'credits' };
    if (!session.ledger.best[scenario.id]) return { ok: false, reason: 'ledger' };
    return { ok: true, score: won.score.total };
  } finally {
    session.dispose();
  }
}

async function runLiveControl(scenario) {
  const session = await openSession(scenario.id, { scenario, tape: [], strategyId: scenario.strategies[0].id });
  try {
    // Same verbs as the astern tape, issued live rather than from the authored tape.
    session.control({ moveZ: 1, moveX: 0, brake: false, boost: false });
    session.step(40);
    session.control({ moveZ: 0, moveX: 0, brake: true, boost: false });
    const result = await session.play();
    if (!result || !result.won) return { ok: false, reason: 'live-lost', result, snapshot: session.snapshot() };
    return { ok: true };
  } finally {
    session.dispose();
  }
}

export async function traceScenario(id, strategyId) {
  const scenario = getScenario(id);
  if (!scenario) throw new Error(`unknown ${id}`);
  const row = await runScenario(scenario, strategyId, { trace: true });
  return row;
}
