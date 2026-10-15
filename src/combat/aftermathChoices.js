// After a fight the field names the verbs that are actually there. The recorder publishes this
// offer on the same tick as the outcome. Nothing here pauses the sim or writes heat, credits,
// cargo, or reputation.

const ORDER = ['rescue', 'salvage', 'pursuit', 'escape'];

const LABELS = Object.freeze({
  rescue: 'Rescue the living.',
  salvage: 'Salvage the wreck.',
  pursuit: 'Pursue the ship that fled.',
  escape: 'Leave the field.',
});

function list(value) {
  return Array.isArray(value) ? value : [];
}

function inSector(outcome, sectorId) {
  if (!outcome) return false;
  if (sectorId == null || outcome.sectorId == null) return true;
  return outcome.sectorId === sectorId;
}

function firstId(outcomes, pred) {
  for (const outcome of outcomes) {
    if (pred(outcome) && outcome.entityId != null) return outcome.entityId;
  }
  return null;
}

/**
 * @param {object} [facts]
 * @param {Array} [facts.outcomes] outcome, entityId, sectorId, alive
 * @param {string|null} [facts.sectorId]
 * @param {Array} [facts.wreckIds] non-player wreck ids already in this sector
 * @returns {{ paused: false, sectorId: string|null, choices: Array, targets: object }}
 */
export function aftermathChoices(facts) {
  const sectorId = facts && facts.sectorId != null ? facts.sectorId : null;
  const outcomes = list(facts && facts.outcomes).filter((outcome) => inSector(outcome, sectorId));
  const wreckIds = list(facts && facts.wreckIds).filter((id) => id != null);

  const rescueId = firstId(outcomes, (outcome) => (
    (outcome.outcome === 'disabled' || outcome.outcome === 'surrendered')
    && outcome.alive === true
    && outcome.dead !== true
  ));
  // Salvage is a kill, a body a death event already marked dead, or a wreck marker.
  // A ship that only despawned (fled off the field, removed without a death) is not a wreck.
  const killedId = firstId(outcomes, (outcome) => outcome.outcome === 'killed' || outcome.dead === true);
  const salvageId = killedId != null ? killedId : (wreckIds[0] ?? null);
  const pursuitId = firstId(outcomes, (outcome) => (
    outcome.outcome === 'fled' && outcome.alive === true && outcome.dead !== true
  ));

  const open = {
    rescue: rescueId != null,
    salvage: salvageId != null,
    pursuit: pursuitId != null,
    escape: true,
  };
  const targets = {
    rescue: open.rescue ? rescueId : null,
    salvage: open.salvage ? salvageId : null,
    pursuit: open.pursuit ? pursuitId : null,
    escape: null,
  };
  const choices = ORDER.filter((id) => open[id]).map((id) => Object.freeze({
    id,
    viable: true,
    label: LABELS[id],
  }));
  return Object.freeze({
    paused: false,
    sectorId,
    choices: Object.freeze(choices),
    targets: Object.freeze(targets),
  });
}

/**
 * Record a viable pick. Never writes state.paused, and never clears a pause that is already set.
 * Returns null when the id is not one of the published choices.
 */
export function applyAftermathChoice(state, choiceId) {
  const own = state && state.combatOutcome;
  const offer = own && own.aftermath;
  if (!offer || !Array.isArray(offer.choices)) return null;
  const id = String(choiceId || '');
  const match = offer.choices.find((choice) => choice && choice.id === id && choice.viable !== false);
  if (!match) return null;
  const entityId = id === 'escape' || !offer.targets ? null : (offer.targets[id] ?? null);
  const chosen = {
    id,
    label: match.label,
    tick: state.tick || 0,
    sectorId: offer.sectorId != null ? offer.sectorId : null,
    entityId,
    paused: false,
  };
  own.chosen = chosen;
  own.aftermath = {
    paused: false,
    sectorId: offer.sectorId != null ? offer.sectorId : null,
    choices: offer.choices,
    targets: offer.targets,
    focus: id === 'escape' ? null : { id, entityId },
    departing: id === 'escape',
  };
  return chosen;
}
