// The words of a works contract. No imports on purpose: the simulation, the HUD, the chart and the
// mission log all read a live contract through these functions, and none of them should pull a
// catalog in to do it. Every name a line needs (the ore, the machine) is written onto the mission's
// `params.works` record when the offer is built (src/data/worksContracts.js).

export function worksObjectiveTarget(goal) {
  if (!goal) return 1;
  if (goal.kind === 'installSet') return goal.defs.length;
  if (goal.kind === 'install' || goal.kind === 'link' || goal.kind === 'defense' || goal.kind === 'power') return 1;
  return Math.max(1, Math.round(Number(goal.qty) || 1));
}

/** Whether a bonus term still stands, and the words that say so. Pure in the works record. */
export function worksBonusState(works, term) {
  if (!works || !term) return { ok: false, text: '' };
  if (term.kind === 'sealed') {
    const ok = !(works.breaches > 0);
    return { ok, text: ok ? 'no gas breached' : 'gas breached' };
  }
  if (term.kind === 'par') {
    const used = Math.max(0, works.cells | 0);
    return { ok: used <= term.cells, text: `${used}/${term.cells} cells opened` };
  }
  if (term.kind === 'unhurt') {
    const ok = !(works.hurt > 0);
    return { ok, text: ok ? 'rig clear of every blast' : 'rig caught in a blast' };
  }
  return { ok: false, text: '' };
}

const BONUS_NAME = Object.freeze({ sealed: 'No gas breached', par: 'Light dig', unhurt: 'Rig clear of every blast' });
export const worksBonusName = (term) => BONUS_NAME[term && term.kind] || 'Bonus';

/** Credits a bonus term adds when it stands at completion. */
export function worksBonusCr(works, term) {
  return Math.round((Number(works?.baseRewardCr) || 0) * (Number(term?.pct) || 0) / 10) * 10;
}

export function worksBonusTotal(works) {
  let total = 0;
  for (const term of (works && works.bonus) || []) if (worksBonusState(works, term).ok) total += worksBonusCr(works, term);
  return total;
}

const withArticle = (name) => `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
const machineName = (works, defId) => (works.machineNames && works.machineNames[defId]) || 'machine';

/** The one line the HUD, the log and the chart all show. */
export function worksObjectiveLine(mission) {
  const works = mission?.params?.works;
  if (!works) return mission?.title || 'Works contract';
  const goal = works.goal || {};
  const want = Math.max(1, Number(mission.objectiveTarget) || worksObjectiveTarget(goal));
  const have = Math.max(0, Math.min(want, Math.floor(Number(mission.objectiveProgress) || 0)));
  const good = works.goodName || 'ore';
  let line;
  switch (goal.kind) {
    case 'cut': line = `Cut ${have}/${want} ${good} with the rover`; break;
    case 'blast': line = `Open ${have}/${want} cells with bore charges`; break;
    case 'installSet': {
      const next = goal.defs.find((defId) => !(works.installed || []).includes(defId));
      line = next ? `Install ${withArticle(machineName(works, next))} inside a rock (${have}/${want})` : 'Claim staked';
      break;
    }
    case 'install': {
      const c = goal.contacts || {};
      const parts = [];
      if (c.solid) parts.push(`${c.solid} solid cells`);
      if (c.ore) parts.push(c.ore === 1 ? '1 ore vein' : `${c.ore} ore veins`);
      if (c.gas) parts.push(`${c.gas} gas cells`);
      line = `Install ${withArticle(machineName(works, goal.defId))} touching ${parts.join(' and ') || 'intact rock'}`;
      break;
    }
    case 'deliver': line = `Courier ${have}/${want} units from your own works`; break;
    case 'link': line = 'Join two of your claims with a cargo line (Field Build)'; break;
    case 'defense': line = 'Raise a turret pylon over one of your claims (Field Build)'; break;
    case 'skim': line = `Scoop ${have}/${want} ${good} from the Anvil`; break;
    case 'claims': line = `Hold ${have}/${want} claims in this sector at once`; break;
    case 'power': {
      const best = Math.max(0, Math.floor(Number(works.bestMw) || 0));
      line = `Get one claim here generating ${goal.mw} MW (best so far ${best} MW)`;
      break;
    }
    default: line = mission.title || 'Works contract';
  }
  const tails = (works.bonus || []).map((term) => worksBonusState(works, term).text).filter(Boolean);
  return tails.length ? `${line} · ${tails.join(' · ')}` : line;
}

/** What to do next, in one sentence, for the log and the pause screen. */
export function worksNextStep(mission) {
  const works = mission?.params?.works;
  if (!works) return 'Next: follow the tracked marker.';
  switch (works.goal && works.goal.kind) {
    case 'cut':
      return `Next: fly up to ${works.rockName ? withArticle(works.rockName) : 'a rock'}, press B to set the rover down, and dig to the ${works.goodName || 'ore'}.`;
    case 'blast': return 'Next: set the rover down in a rock, press R to arm a bore charge, and step out of the pattern.';
    case 'installSet':
    case 'install': return 'Next: set the rover down in a rock, dig a bay, press B to build, and pick the machine.';
    case 'deliver': return 'Next: on one of your claims, power a Cargo Port and set a good to Ship.';
    case 'link':
    case 'defense': return 'Next: fly to your claims and open Field Build (Shift+B).';
    case 'skim': return 'Next: fly the marked band of the planet with the scoop open, and climb out before the hull cooks.';
    case 'claims': return 'Next: set the rover down in a rock and install a machine. The first machine anchors the claim.';
    case 'power': return 'Next: on one claim, seat Gas Taps against sealed gas pockets, and add solar sails from Field Build, until it makes the power.';
    default: return 'Next: follow the tracked marker.';
  }
}
