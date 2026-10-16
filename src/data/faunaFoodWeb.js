// One pasture shared by a hunter, a grazer, and a scavenger.
// Stock and carcasses are capped. The step never spawns an animal.

export const PASTURE_CAP = 8;
export const CARCASS_CAP = 4;

const WEB_WORDS = Object.freeze({
  graze: 'grazing',
  flee: 'holding off',
  hungry: 'pasture bare',
  hunt: 'hunting',
  clean: 'cleaning',
  idle: 'waiting',
});

function clampInt(value, cap, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(cap, n));
}

export function foodWebWord(web) {
  return WEB_WORDS[web] || null;
}

export function emptyFoodWeb() {
  return { stock: PASTURE_CAP, carcass: 0, prey: 'absent', predator: 'absent', scavenger: 'absent', stepAt: null };
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export function normalizeFoodWeb(raw) {
  const base = emptyFoodWeb();
  if (!raw || typeof raw !== 'object') return base;
  return {
    stock: clampInt(raw.stock, PASTURE_CAP, base.stock),
    carcass: clampInt(raw.carcass, CARCASS_CAP, 0),
    prey: oneOf(raw.prey, ['graze', 'flee', 'hungry', 'absent'], 'absent'),
    predator: oneOf(raw.predator, ['hunt', 'idle', 'absent'], 'absent'),
    scavenger: oneOf(raw.scavenger, ['clean', 'idle', 'absent'], 'absent'),
    stepAt: Number.isFinite(raw.stepAt) ? Math.floor(raw.stepAt) : null,
  };
}

/**
 * One second of the web. Prey flees a predator instead of eating. A hunt leaves
 * one carcass. A scavenger cleans a carcass and does not touch the pasture.
 * With nobody grazing, the pasture regrows by one, and neither pile passes its cap.
 */
export function stepFoodWeb(input = {}) {
  const prev = normalizeFoodWeb(input);
  let stock = prev.stock;
  let carcass = prev.carcass;
  const hasPredator = !!input.hasPredator;
  const hasPrey = !!input.hasPrey;
  const hasScavenger = !!input.hasScavenger;
  let prey = 'absent';
  let predator = 'absent';
  let scavenger = 'absent';

  if (hasPrey) {
    if (hasPredator) prey = 'flee';
    else if (stock > 0) {
      prey = 'graze';
      stock -= 1;
    } else prey = 'hungry';
  }
  if (hasPredator) predator = hasPrey ? 'hunt' : 'idle';
  if (hasPredator && hasPrey && carcass < CARCASS_CAP) carcass += 1;
  if (hasScavenger) {
    if (carcass > 0) {
      scavenger = 'clean';
      carcass -= 1;
    } else scavenger = 'idle';
  }
  if (prey !== 'graze' && stock < PASTURE_CAP) stock += 1;

  return { stock, carcass, prey, predator, scavenger, stepAt: prev.stepAt };
}
