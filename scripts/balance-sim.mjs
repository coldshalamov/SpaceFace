// scripts/balance-sim.mjs — deterministic, headless balance audit for SpaceFace.
// Run: `node scripts/balance-sim.mjs`. Always exits 0 unless an import/runtime error occurs
// (a balance WARN/FAIL is a SUCCESSFUL audit run, not a process failure — see check-data.mjs
// for the opposite convention, deliberately NOT copied here).
//
// Imports ONLY pure data tables (weapons, ships, mining, commodities, missions, automation).
// Economy/automation SYSTEM formulas are re-implemented inline with file:line citations — the
// system modules transitively import three/DOM-coupled siblings (economy.js -> cargo.js) and the
// tunables we need are module-local, not exported. No DOM, no three, no Date, no Math.random:
// every number is derived by iterating the full data space, so output is byte-stable.
//
// Checks (each prints a PASS/WARN/FAIL row):
//   1. Per-slot (S/M/L) weapon DPS spread + dominant(>1.2x median)/dead(<0.8x median) flags.
//   2. Ship progression price/stat monotonicity across tiers (per-tier medians).
//   3. Earn-rate parity across mining / trading / missions (rough cr/min, flag >±25% from median).
//   4. Passive-income cap: assert a full automation stack's raw cr/min is bounded by the live cap.

import { WEAPONS } from '../src/data/weapons.js';
import { SHIPS } from '../src/data/ships.js';
import { ORES, ASTEROIDS, BEAMS } from '../src/data/mining.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { MISSION_TUNING, MISSION_TYPES } from '../src/data/missions.js';
import { DRONES, TRADERS, OUTPOSTS, AUTO_BALANCE } from '../src/data/automation.js';

// ---- tiny deterministic helpers -------------------------------------------------------------
const round = (n) => Math.round(n);
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US') : String(n));
const pad = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);

function median(nums) {
  const a = nums.slice().sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
function basePriceOf(id) { const c = CMDTY_BY_ID.get(id); return c ? c.basePrice : 0; }

// status helpers — worst() lets a check aggregate many sub-results into one row status.
const RANK = { PASS: 0, WARN: 1, FAIL: 2 };
const worst = (...s) => s.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'PASS');

const out = [];
const log = (s = '') => out.push(s);
const HR = '-'.repeat(78);
const summary = []; // { check, status, note }

// =============================================================================================
// CHECK 1 — Weapon DPS spread per SLOT SIZE (S/M/L). Weapons compete for a sized slot, so DPS is
// compared within size, not the unrelated `tier` field. Uses the authored `dps` (continuous beams
// have rof:0 so dmg*rof would zero them — weapons.js:41,65). Cross-checks dmg*rof for projectiles.
// =============================================================================================
function checkWeaponDps() {
  log(HR);
  log('CHECK 1 — Weapon DPS spread by slot size (dominant >1.2x median, dead <0.8x median)');
  log(HR);
  const sizes = ['S', 'M', 'L'];
  let status = 'PASS';
  const flagCounts = { dominant: 0, dead: 0 };

  for (const sz of sizes) {
    const group = WEAPONS.filter((w) => w.size === sz);
    if (!group.length) continue;
    const med = median(group.map((w) => w.dps));
    log(`\n  [${sz}] n=${group.length}  median DPS=${r1(med)}  (dominant>${r1(med * 1.2)}, dead<${r1(med * 0.8)})`);
    log('    ' + pad('weapon', 20) + padL('dps', 7) + padL('xMed', 8) + padL('dmg*rof', 9) + '  flag');
    for (const w of group.slice().sort((a, b) => b.dps - a.dps)) {
      const ratio = med > 0 ? w.dps / med : 1;
      const cont = w.rof === 0; // continuous (beam) — dmg IS dps/sec
      const dmgRof = cont ? w.dmg : r1(w.dmg * w.rof);
      let flag = '';
      if (ratio > 1.2) { flag = 'DOMINANT'; flagCounts.dominant++; status = worst(status, 'WARN'); }
      else if (ratio < 0.8) { flag = 'dead-pick'; flagCounts.dead++; status = worst(status, 'WARN'); }
      log('    ' + pad(w.name, 20) + padL(r1(w.dps), 7) + padL(r2(ratio) + 'x', 8) + padL(dmgRof, 9) + '  ' + flag);
    }
  }

  // Synthesis-claim verification (M slot): "spread ~3.3x, Plasma ~102 vs Railgun ~48".
  const m = WEAPONS.filter((w) => w.size === 'M');
  const mMed = median(m.map((w) => w.dps));
  const mMax = Math.max(...m.map((w) => w.dps));
  const mMin = Math.min(...m.map((w) => w.dps));
  const plasma = m.find((w) => w.id === 'wpn_plasma_cannon_m');
  const rail = m.find((w) => w.id === 'wpn_railgun_m');
  log('\n  SYNTHESIS CHECK (M slot): claim spread ~3.3x (Plasma ~102 vs Railgun ~48)');
  log(`    real: Plasma=${plasma.dps}  Railgun=${rail.dps}  Plasma/Railgun=${r2(plasma.dps / rail.dps)}x`);
  log(`    real: max/min spread = ${mMax}/${mMin} = ${r2(mMax / mMin)}x  (median ${r1(mMed)})`);
  log(`    => the 3.3x figure is OVERSTATED; true within-slot spread is ~${r2(mMax / mMin)}x.`);
  log('    NOTE: missile/torpedo splashDmg is excluded from dps, so AoE "dead-pick" flags understate them.');

  const note = `${flagCounts.dominant} dominant, ${flagCounts.dead} dead-pick; M-slot spread ${r2(mMax / mMin)}x (synthesis said 3.3x)`;
  summary.push({ check: '1 Weapon DPS spread', status, note });
  log('');
}

// =============================================================================================
// CHECK 2 — Ship progression. Aggregate per tier (median) so within-tier role variety (fighter vs
// freighter) doesn't false-flag monotonicity. T0 price=0 (ships.js:18) handled: ratios skip it.
// Flag non-monotonic price/hull/shield across tiers, and runaway price jumps (>6x tier-over-tier).
// =============================================================================================
function checkShipProgression() {
  log(HR);
  log('CHECK 2 — Ship progression (per-tier medians; monotonic + S-curve sanity)');
  log(HR);
  const tiers = [...new Set(SHIPS.map((s) => s.tier))].sort((a, b) => a - b);
  const rows = tiers.map((t) => {
    const g = SHIPS.filter((s) => s.tier === t);
    return {
      tier: t, n: g.length,
      price: median(g.map((s) => s.price)),
      hull: median(g.map((s) => s.hull)),
      shield: median(g.map((s) => s.shield)),
      ehp: median(g.map((s) => s.hull + s.shield)),
    };
  });

  log('    ' + pad('tier', 6) + padL('n', 3) + padL('med price', 12) + padL('med hull', 10) + padL('med shield', 11) + padL('med EHP', 9) + padL('price x', 9) + padL('EHP x', 8));
  let status = 'PASS';
  const issues = [];
  const RUNAWAY = 6.0; // tier-over-tier median price multiple above which we flag a wall
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const prev = rows[i - 1];
    const priceX = prev && prev.price > 0 ? row.price / prev.price : null;
    const ehpX = prev && prev.ehp > 0 ? row.ehp / prev.ehp : null;
    // monotonicity (price/hull/shield must not decrease tier-over-tier)
    if (prev) {
      if (row.price < prev.price) { issues.push(`T${row.tier} price < T${prev.tier}`); status = worst(status, 'FAIL'); }
      if (row.hull < prev.hull) { issues.push(`T${row.tier} hull < T${prev.tier}`); status = worst(status, 'FAIL'); }
      if (row.shield < prev.shield) { issues.push(`T${row.tier} shield < T${prev.tier}`); status = worst(status, 'FAIL'); }
      if (priceX != null && priceX > RUNAWAY) { issues.push(`T${prev.tier}->T${row.tier} price x${r1(priceX)} (>${RUNAWAY}x)`); status = worst(status, 'WARN'); }
    }
    log('    ' + pad('T' + row.tier, 6) + padL(row.n, 3) + padL(fmt(row.price), 12) + padL(fmt(row.hull), 10) +
        padL(fmt(row.shield), 11) + padL(fmt(row.ehp), 9) +
        padL(priceX != null ? r1(priceX) + 'x' : '-', 9) + padL(ehpX != null ? r1(ehpX) + 'x' : '-', 8));
  }
  // price-per-EHP curve: should trend UP (later EHP costs more per point) for an S-curve economy.
  log('\n  price / EHP point by tier (cost-efficiency curve):');
  for (const row of rows) {
    if (row.ehp > 0 && row.price > 0) log(`    T${row.tier}: ${r1(row.price / row.ehp)} cr/EHP`);
    else log(`    T${row.tier}: n/a (free starter)`);
  }
  log('\n  ' + (issues.length ? 'issues: ' + issues.join('; ') : 'no monotonicity or runaway violations'));
  summary.push({ check: '2 Ship progression', status, note: issues.length ? issues.join('; ') : 'monotonic, no runaway jumps' });
  log('');
}

// =============================================================================================
// CHECK 3 — Earn-rate parity: mining vs trading vs missions, rough cr/min.
// PRIMARY reference is the game's own A(T) = AUTO_BALANCE.activeRefByTier ("sustained active
// cr/min at tier T", automation.js:7) — each path is reported as a multiple of A(T) at its
// CHARACTERISTIC tier (mining beam_mk2 -> T2, trader freighter_m -> T2, missions riskTier1 -> T1),
// because median-of-three is fragile when one path is idealized. The task's ±25% cross-path flag
// is still computed (against the 3-path median), but the A(T) lens is the binding read.
// All three use ONE idealization stance (best-case loadout, no price-impact decay) so the numbers
// are PEAK first-cycle upper bounds, NOT steady-state — see the caveat printed below.
// =============================================================================================
function checkEarnRates() {
  log(HR);
  log('CHECK 3 — Earn-rate parity (cr/min vs A(T)=activeRefByTier; ±25% cross-path flag)');
  log(HR);

  // ---- shared assumptions (documented; held constant; ONE idealization stance for all paths) ----
  const A = {
    riskTier: 1,            // mid-low risk band (RISK_MULT index)
    missionDistance: 3000,  // nominal route distance (wu) for the mission distance term only
    fFaction: 1.0,          // neutral standing (no loyalty bonus / penalty)
    fTime: 1.0,             // no rush bonus
    cargoValueCr: 4000,     // representative cargo value for value-scaled mission rewards
  };
  const REF = AUTO_BALANCE.activeRefByTier; // A(T) anchor, index 0 = T1
  const aAt = (tier) => REF[Math.min(Math.max(tier, 1), REF.length) - 1];
  log('  A(T) anchor = activeRefByTier [' + REF.join(', ') + '] (sustained active cr/min by tier)');
  log('  ASSUMPTIONS: riskTier=' + A.riskTier + ' (RISK_MULT=' + MISSION_TUNING.RISK_MULT[A.riskTier] + '), ' +
      'f_faction=' + A.fFaction + ', f_time=' + A.fTime + ', distance=' + A.missionDistance + 'wu, ' +
      'cargoValue=' + A.cargoValueCr + 'cr');

  // ---- MINING: a mid mining beam (beam_mk2) chipping the expected-value asteroid ----
  // ore-HP/s = beam dps (mining.js:70-75). units/min from the average asteroid's HP-per-unit;
  // value/unit = sum(oreTable weight * ore basePrice). Average over all asteroid types (full space).
  const beam = BEAMS.find((b) => b.id === 'beam_mk2');
  let astSamples = [];
  for (const ast of ASTEROIDS) {
    const hpMid = (ast.hp[0] + ast.hp[1]) / 2;
    const yieldMid = (ast.yieldU[0] + ast.yieldU[1]) / 2;
    const hpPerUnit = yieldMid > 0 ? hpMid / yieldMid : 0;          // ore-HP consumed to free 1 unit
    let valuePerUnit = 0;
    for (const oreId in ast.oreTable) valuePerUnit += ast.oreTable[oreId] * basePriceOf(oreId);
    if (hpPerUnit > 0) astSamples.push({ id: ast.id, hpPerUnit, valuePerUnit });
  }
  // expected per-rock economics, averaged over asteroid types (deterministic full-space mean)
  const avgHpPerUnit = astSamples.reduce((s, x) => s + x.hpPerUnit, 0) / astSamples.length;
  const avgValuePerUnit = astSamples.reduce((s, x) => s + x.valuePerUnit, 0) / astSamples.length;
  const unitsPerMin = (beam.dps * 60) / avgHpPerUnit;              // ore-HP/min / HP-per-unit
  const miningCrPerMin = unitsPerMin * avgValuePerUnit;
  log('\n  MINING (' + beam.id + ', dps=' + beam.dps + ' ore-HP/s):');
  log('    avg HP/unit=' + r1(avgHpPerUnit) + '  avg value/unit=' + r1(avgValuePerUnit) + 'cr  units/min=' + r1(unitsPerMin));
  log('    => ' + fmt(round(miningCrPerMin)) + ' cr/min (sell at commodity basePrice)');

  // ---- TRADING: a producer->consumer cycle on a mid hauler (freighter_m, T2). ----
  // Throughput is anchored to the data's OWN cycle time (TRADERS.cycleTime, automation.js:25),
  // NOT an invented trip distance — this is exactly the basis check 4 uses, so the two checks agree.
  // Per-unit margin from the price model re-implemented from economy.js:29-34,117-119:
  //   producer stock = baseEq*2.0, consumer stock = baseEq*0.35 (ROLE_FACTOR, economy.js:30)
  //   mid = basePrice * clamp((stock/baseEq)^(-elasticity), 0.40, 2.60); buy/sell add ±spread/2.
  const ROLE_PRODUCE = 2.0, ROLE_CONSUME = 0.35;            // economy.js:30 (stock/baseEq ratios)
  const SPREAD = 0.08, MULT_LO = 0.40, MULT_HI = 2.60;      // economy.js:32-34
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  // pick the best legal commodity margin across the catalog (what a route-planner would chase)
  let best = null;
  for (const c of COMMODITIES) {
    if (c.legality !== 'legal') continue;
    const midBuy = c.basePrice * clamp(Math.pow(ROLE_PRODUCE, -c.elasticity), MULT_LO, MULT_HI);
    const midSell = c.basePrice * clamp(Math.pow(ROLE_CONSUME, -c.elasticity), MULT_LO, MULT_HI);
    const buy = midBuy * (1 + SPREAD / 2);   // buy cheap at producer (surplus stock -> low mid)
    const sell = midSell * (1 - SPREAD / 2); // sell dear at consumer (shortage stock -> high mid)
    const margin = sell - buy;               // cr per unit
    if (!best || margin > best.margin) best = { c, buy, sell, margin };
  }
  const tdr = TRADERS.find((t) => t.id === 'trader_freighter_m'); // T2 hauler, the characteristic hull
  const tradeTier = tdr.tier;
  const unitsPerLoad = tdr.cargoVol / (best.c.volPerU > 0 ? best.c.volPerU : 1);
  const profitPerCycle = unitsPerLoad * best.margin * tdr.tradeEff;
  const tradingCrPerMin = profitPerCycle / (tdr.cycleTime / 60);
  log('\n  TRADING (best legal margin = ' + best.c.name + '; hull ' + tdr.id + ', T' + tradeTier + '):');
  log('    buy=' + r1(best.buy) + '  sell=' + r1(best.sell) + '  margin=' + r1(best.margin) + 'cr/u  tradeEff=' + tdr.tradeEff);
  log('    hold=' + tdr.cargoVol + 'vol -> ' + r1(unitsPerLoad) + 'u  cycle=' + tdr.cycleTime + 's  profit/cycle=' + fmt(round(profitPerCycle)));
  log('    => ' + fmt(round(tradingCrPerMin)) + ' cr/min');

  // ---- MISSIONS: average cr/min over the 10 mission types using BASE + the reward/time formulas ----
  // reward = round(BASE * (1+dist/2000) * RISK_MULT[risk] * (1+cargoValue/8000) * f_faction * f_time)
  // time   = round((dist/cruiseRef + taskTime) * slack)   [taskTime is the constant part]
  // BASE is authoritative (the runtime reads MISSION_TUNING.BASE at missions.js:262). The rewardFormula
  //   strings are descriptive; their leading constant is parsed and checked against BASE below.
  const slack = MISSION_TUNING.slackDefault;
  const riskMult = MISSION_TUNING.RISK_MULT[A.riskTier];
  const distTerm = 1 + A.missionDistance / MISSION_TUNING.distDivisor;
  const valTerm = 1 + A.cargoValueCr / MISSION_TUNING.valueDivisor;
  // representative constant task-time per type (the non-quota constant in each timeFormula string).
  const TASK_T = {
    cargo_delivery: 20, bulk_trade: 30, bounty_hunt: 60, mining_quota: 30, salvage_retrieval: 30,
    escort: 90, patrol_clear: 90, smuggling_run: 20, passenger_transport: 20, recon_scan: 50,
  };
  let mSum = 0, mN = 0;
  const mRows = [];
  for (const id in MISSION_TUNING.BASE) {
    const base = MISSION_TUNING.BASE[id];
    const reward = round(base * distTerm * riskMult * valTerm * A.fFaction * A.fTime);
    const timeS = round((A.missionDistance / MISSION_TUNING.cruiseSpeedRef + (TASK_T[id] || 30)) * slack);
    const crMin = timeS > 0 ? reward / (timeS / 60) : 0;
    mRows.push({ id, reward, timeS, crMin });
    mSum += crMin; mN++;
  }
  const missionCrPerMin = mSum / mN;
  log('\n  MISSIONS (mean over ' + mN + ' types; BASE * dist * risk * value, reward/time):');
  for (const m of mRows.sort((a, b) => b.crMin - a.crMin).slice(0, 3))
    log('    top: ' + pad(m.id, 20) + ' reward=' + fmt(m.reward) + ' time=' + m.timeS + 's -> ' + fmt(round(m.crMin)) + ' cr/min');
  log('    => mean ' + fmt(round(missionCrPerMin)) + ' cr/min across all types');

  // ---- BASE vs formula-string consistency (parse the leading constant out of each rewardFormula) ----
  const FORMULA_BASE = {};
  for (const t of MISSION_TYPES) {
    const m = /round\(\s*(\d+(?:\.\d+)?)\s*\*/.exec(t.rewardFormula || '');
    if (m) FORMULA_BASE[t.type] = Number(m[1]);
  }
  const mism = Object.keys(MISSION_TUNING.BASE).filter((k) => k in FORMULA_BASE && MISSION_TUNING.BASE[k] !== FORMULA_BASE[k]);
  if (mism.length === 0) {
    log('\n  DATA CHECK: all ' + Object.keys(FORMULA_BASE).length + ' rewardFormula strings agree with MISSION_TUNING.BASE (authoritative). OK.');
  } else {
    log('\n  DATA FINDING: MISSION_TUNING.BASE disagrees with the constant in the rewardFormula string for ' +
        mism.length + '/' + Object.keys(FORMULA_BASE).length + ' types: ' +
        mism.map((k) => k + ' (BASE ' + MISSION_TUNING.BASE[k] + ' vs string ' + FORMULA_BASE[k] + ')').join(', ') + '.');
  }

  // ---- verdict: each path vs A(T) at its characteristic tier, AND the ±25% cross-path flag ----
  // characteristic tiers: mining beam_mk2 -> T2, trading freighter_m -> T2, missions riskTier1 -> T1.
  const paths = [
    { name: 'mining', crMin: miningCrPerMin, tier: 2 },
    { name: 'trading', crMin: tradingCrPerMin, tier: tradeTier },
    { name: 'missions', crMin: missionCrPerMin, tier: A.riskTier },
  ];
  let status = 'PASS';

  // PRIMARY read: multiple of A(T). A faithful active-play rate sits near 1x A(T); anything well
  // above is an idealized peak (and a soft "generous" finding), anything near/below is calibrated.
  log('\n  vs A(T) at each path\'s characteristic tier  (1x = the game\'s active-play anchor):');
  for (const p of paths) {
    const anchor = aAt(p.tier);
    const mult = anchor > 0 ? p.crMin / anchor : 0;
    log('    ' + pad(p.name, 10) + padL(fmt(round(p.crMin)), 9) + ' cr/min   A(T' + p.tier + ')=' +
        padL(fmt(anchor), 5) + '   ' + padL(r1(mult) + 'x', 7) + ' A(T)' +
        (mult > 2 ? '  <-- idealized peak (generous)' : mult < 1.25 ? '  <-- calibrated to active play' : ''));
  }

  // SECONDARY: the task's ±25% cross-path band (against the 3-path median).
  const med = median(paths.map((p) => p.crMin));
  log('\n  CROSS-PATH ±25% (median ' + fmt(round(med)) + ' cr/min; band [' + fmt(round(med * 0.75)) + ', ' + fmt(round(med * 1.25)) + ']):');
  const offenders = [];
  for (const p of paths) {
    const dev = med > 0 ? (p.crMin - med) / med : 0;
    const off = Math.abs(dev) > 0.25;
    if (off) { status = worst(status, 'WARN'); offenders.push(`${p.name} ${dev > 0 ? '+' : ''}${round(dev * 100)}%`); }
    log('    ' + pad(p.name, 10) + padL(fmt(round(p.crMin)), 9) + ' cr/min  ' + (dev >= 0 ? '+' : '') + round(dev * 100) + '%' + (off ? '  <-- out of band' : ''));
  }

  // CAVEAT — these are PEAK first-cycle upper bounds, not realized steady-state rates.
  log('\n  CAVEAT: mining/trading are best-case first-cycle PEAKS, not steady-state. The economy\'s');
  log('    price-impact integral (avgMid over the traded qty, economy.js:124-133) and stock drift +');
  log('    trader hotness collapse sustained rates well below these. Missions (~A(T)) is the');
  log('    calibrated path; mining/trading peaks read high precisely because no decay is modeled.');

  // lead the summary note with the A(T) read (the binding lens), not the fragile median band —
  // else "missions -88%" misreads as underpowered when it is actually the calibrated path.
  const mults = {};
  for (const p of paths) mults[p.name] = r1(p.crMin / aAt(p.tier));
  summary.push({ check: '3 Earn-rate parity', status,
    note: offenders.length
      ? `trading ${mults.trading}x A(T) & mining ${mults.mining}x are first-cycle peaks; missions ~${mults.missions}x A(T) is calibrated (cross-path band fails on the peaks)`
      : 'all paths within ±25% and ~A(T)' });
  log('');
}

// =============================================================================================
// CHECK 4 — Passive-income cap. Build a FULL automation stack (every drone + trader + outpost),
// compute its RAW cr/min (no cap), then apply the LIVE cap and assert it binds.
// Live cap: passiveCapPerMin() = activeRefByTier[tier-1] * passiveCapFrac  (automation.js:677-684).
// creditPassive HARD-CLAMPS to that per-minute bucket — overflowEff (0.25) is NOT applied in the
// live path; the spec's `cap + (net-cap)*overflowEff` clause was explicitly rejected
// (automation.js:653-666). So the effective ceiling = passiveCapFrac * A(T), full stop.
// =============================================================================================
function checkPassiveCap() {
  log(HR);
  log('CHECK 4 — Passive-income cap (assert full stack is bounded by the live cap)');
  log(HR);
  const bal = AUTO_BALANCE;
  log('  AUTO_BALANCE: passiveCapFrac=' + bal.passiveCapFrac + '  overflowEff=' + bal.overflowEff +
      '  activeRefByTier=[' + bal.activeRefByTier.join(', ') + ']');
  log('  VERIFY: synthesis cites passiveCapFrac 0.45 / overflowEff 0.25 — passiveCapFrac matches; but');
  log('          overflowEff is NOT used in the live cap path (creditPassive hard-clamps; the spec\'s');
  log('          overflow-credit clause was rejected, automation.js:653-666). Effective ceiling = frac*A(T).');

  // ore value the buffers bank at: cmdty_ore_iron basePrice (DRONE_ORE_ID, automation.js:49-50).
  const orePrice = basePriceOf('cmdty_ore_iron') || 28;

  // RAW passive cr/min from the whole catalog of assets (one of each tier of every kind):
  // - DRONES: mineRate is PER-SECOND (automation.js:179) -> *60 *orePrice cr/min (automation.js:351-353).
  // - TRADERS: ratePerMin ~ profit/cycle / (cycleTime/60); use the spec profit formula
  //     cargoVol * margin * tradeEff / (cycleTime/60). Margin from the same producer/consumer
  //     spread as check 3 (best legal commodity), since the live router chases the best pair.
  // - OUTPOSTS: outRate is per-second; passive hub banks creditGen directly, producers bank
  //     output*orePrice*0.8 (automation.js:510-515).
  let raw = 0;
  const lines = [];

  for (const d of DRONES) {
    const crMin = d.mineRate * 60 * orePrice;
    raw += crMin;
    lines.push('    drone   ' + pad(d.id, 16) + 'mineRate=' + d.mineRate + '/s -> ' + padL(fmt(round(crMin)), 8) + ' cr/min');
  }

  // best legal margin (mirror of check 3's producer->consumer spread) for trader profit.
  const BASE_EQ_DEFAULT = 1000, ROLE_PRODUCE = 2.0, ROLE_CONSUME = 0.35, SPREAD = 0.08, MULT_LO = 0.40, MULT_HI = 2.60;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const baseEq = BASE_EQ_DEFAULT;
  let bestMargin = 0;
  for (const c of COMMODITIES) {
    if (c.legality !== 'legal') continue;
    const midBuy = c.basePrice * clamp(Math.pow(ROLE_PRODUCE, -c.elasticity), MULT_LO, MULT_HI);
    const midSell = c.basePrice * clamp(Math.pow(ROLE_CONSUME, -c.elasticity), MULT_LO, MULT_HI);
    const margin = midSell * (1 - SPREAD / 2) - midBuy * (1 + SPREAD / 2);
    if (margin > bestMargin) bestMargin = margin;
  }
  for (const t of TRADERS) {
    const profitPerCycle = t.cargoVol * bestMargin * t.tradeEff;
    const crMin = profitPerCycle / (t.cycleTime / 60);
    raw += crMin;
    lines.push('    trader  ' + pad(t.id, 16) + 'cargo=' + t.cargoVol + ' cyc=' + t.cycleTime + 's -> ' + padL(fmt(round(crMin)), 8) + ' cr/min');
  }

  for (const o of OUTPOSTS) {
    let crMin;
    if (o.recipe && o.recipe.passive) crMin = o.outRate * 60;                 // hub: creditGen/s
    else crMin = o.outRate * 60 * orePrice * 0.8;                              // producer: -20% local sale
    raw += crMin;
    lines.push('    outpost ' + pad(o.id, 16) + 'outRate=' + o.outRate + '/s -> ' + padL(fmt(round(crMin)), 8) + ' cr/min');
  }

  log('\n  FULL STACK (raw, uncapped cr/min — one of every asset):');
  for (const l of lines) log(l);
  log('    ' + pad('TOTAL RAW', 24) + padL(fmt(round(raw)), 12) + ' cr/min');

  // Live cap per tier, and the binding check at the highest tier (T5, where raw is fully unlocked).
  log('\n  LIVE CAP per tier  (passiveCapFrac * activeRefByTier[T]):');
  let status = 'PASS';
  let topCap = 0;
  for (let tier = 1; tier <= bal.activeRefByTier.length; tier++) {
    const active = bal.activeRefByTier[tier - 1];
    const cap = active * bal.passiveCapFrac;
    topCap = cap;
    const bounds = raw > cap;
    log('    T' + tier + ': A=' + padL(fmt(active), 6) + ' cr/min  cap=' + padL(fmt(round(cap)), 6) +
        ' cr/min  (' + r2(cap / active * 100) + '% of active)' + (bounds ? '  [cap BINDS the raw stack]' : '  [stack under cap]'));
  }
  // The cap MUST bind (raw > cap) at the top tier, else it isn't doing its job; AND the capped
  // ceiling must stay strictly below the active reference (passive < active is the spec's target).
  const capBindsTop = raw > topCap;
  const capBelowActive = topCap < bal.activeRefByTier[bal.activeRefByTier.length - 1];
  if (!capBindsTop) status = worst(status, 'FAIL'); // a cap that never engages is dead balance
  if (!capBelowActive) status = worst(status, 'FAIL');
  log('\n  ASSERTIONS:');
  log('    raw stack (' + fmt(round(raw)) + ') > T5 cap (' + fmt(round(topCap)) + ')          -> ' + (capBindsTop ? 'PASS (cap engages)' : 'FAIL (cap never binds)'));
  log('    T5 cap (' + fmt(round(topCap)) + ') < T5 active (' + fmt(bal.activeRefByTier[bal.activeRefByTier.length - 1]) + ')  -> ' + (capBelowActive ? 'PASS (passive < active)' : 'FAIL'));
  log('\n  EFFECTIVE CEILING: passive income is hard-bounded at ' + fmt(round(topCap)) + ' cr/min at T5 (' +
      (bal.passiveCapFrac * 100) + '% of active), regardless of how many assets are stacked.');
  summary.push({ check: '4 Passive-income cap', status,
    note: 'cap ' + fmt(round(topCap)) + '/min binds raw ' + fmt(round(raw)) + '/min at T5; overflowEff unused in live path' });
  log('');
}

// =============================================================================================
// RUN
// =============================================================================================
function main() {
  log('');
  log('='.repeat(78));
  log('  SpaceFace — Balance Audit (deterministic, data-grounded)');
  log('='.repeat(78));

  checkWeaponDps();
  checkShipProgression();
  checkEarnRates();
  checkPassiveCap();

  // ---- PASS/WARN/FAIL summary table ----
  log('='.repeat(78));
  log('  SUMMARY');
  log('='.repeat(78));
  log('    ' + pad('check', 26) + pad('status', 8) + 'note');
  log('    ' + '-'.repeat(72));
  const counts = { PASS: 0, WARN: 0, FAIL: 0 };
  for (const s of summary) {
    counts[s.status]++;
    log('    ' + pad(s.check, 26) + pad(s.status, 8) + s.note);
  }
  log('    ' + '-'.repeat(72));
  log('    ' + counts.PASS + ' PASS   ' + counts.WARN + ' WARN   ' + counts.FAIL + ' FAIL');
  log('');

  process.stdout.write(out.join('\n') + '\n');
  // Always exit 0: a WARN/FAIL is a finding from a *successful* audit run, not a script failure.
  process.exit(0);
}

main();
