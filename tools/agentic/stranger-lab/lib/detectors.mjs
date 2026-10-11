// Causal detectors. A negative control is an explicit closure, not a silent skip.
// Intended settle, an initial berth, a detached renderer, and an idempotent trade
// must not become confirmed defects.

const UNRESPONSIVE_WINDOW = 24;
const TURN_WINDOW = 30;

export function detectFailures(input) {
  const samples = input.samples || [];
  const frames = input.frames || [];
  const commands = input.commands || [];
  const bus = input.bus || [];
  const fault = input.fault || null;
  const failures = [];
  const closures = [];

  const unresponsive = detectUnresponsive(samples, frames);
  if (unresponsive) failures.push(tag(unresponsive, fault));
  else closures.push(closure(
    'unresponsive-commands',
    'Thrust that was actually applied produced motion, or no thrust was applied.',
  ));

  const dropped = detectDroppedCommand(frames, fault);
  if (dropped) failures.push(tag(dropped, fault));

  const menu = detectMenuFallback(samples, frames);
  if (menu) failures.push(tag(menu, fault));
  else closures.push(closure('unexpected-menu-fallback', 'Mode stayed off the menu while the pilot was flying.'));

  const stalled = detectStalled(samples);
  if (stalled) failures.push(tag(stalled, fault));
  else closures.push(closure('stalled-loading', 'simTime advanced on flight ticks.'));

  const dock = detectImpossibleDock(samples);
  if (dock) failures.push(tag(dock, fault));
  else closures.push(closure(
    'impossible-docking',
    'No berth flag flipped on while the nearest station contact was far. A counter fixture that starts docked is not a flip.',
  ));

  const pay = detectDoublePayment(commands);
  if (pay.failure) failures.push(tag(pay.failure, fault));
  if (pay.closure) closures.push(pay.closure);

  const fake = detectFalseSuccess(commands);
  if (fake) failures.push(tag(fake, fault));
  else if (commands.some((row) => row.type === 'buy' || row.type === 'refit')) {
    closures.push(closure('false-success', 'A claimed purchase moved credits or was an honest refusal.'));
  }

  const stuck = detectStuckMission(samples, commands);
  if (stuck) failures.push(tag(stuck, fault));
  else if (commands.some((row) => row.type === 'abandon-mission' || row.type === 'accept-mission')) {
    closures.push(closure('stuck-missions', 'Accept and abandon matched the mission status that followed.'));
  }

  const controls = detectWrongControls(samples, frames);
  if (controls) failures.push(tag(controls, fault));
  else closures.push(closure(
    'wrong-ship-controls',
    'Sustained turn did not yaw the opposite way, or no sustained turn was applied.',
  ));

  if (!input.asset || input.asset.essentialModelCheck !== 'failed') {
    closures.push(closure(
      'missing-essential-model',
      'Headless stranger runs do not load renderer models. Absence of a GPU asset pass is not a missing-model defect.',
    ));
  } else {
    failures.push(tag({
      id: 'missing-essential-model',
      tick: 0,
      detail: input.asset.detail || 'essential model failed to load',
    }, fault));
  }

  const save = detectSaveDiscontinuity(commands);
  if (save.failure) failures.push(tag(save.failure, fault));
  if (save.closure) closures.push(save.closure);

  return {
    failures,
    closures,
    confirmed: failures.filter((row) => row.origin === 'product'),
  };
}

function tag(failure, fault) {
  return {
    id: failure.id,
    tick: failure.tick,
    detail: failure.detail,
    origin: fault ? 'canary' : 'product',
  };
}

function closure(id, detail) {
  return { id, status: 'closed', detail };
}

function frameAt(frames, tick) {
  let current = null;
  for (const frame of frames) {
    if ((frame.tick | 0) <= tick) current = frame;
    else break;
  }
  return current;
}

function detectUnresponsive(samples, frames) {
  for (let i = 0; i + UNRESPONSIVE_WINDOW < samples.length; i++) {
    const start = samples[i];
    const frame = frameAt(frames, start.tick);
    if (!frame || frame.moveZ < 0.5 || frame.brake) continue;
    if (!start.alive || start.mode !== 'flight' || start.docked || start.tetherActive) continue;
    if (start.dockPhase && start.dockPhase !== 'none') continue;
    if (start.nearest && start.nearest.kind === 'station' && start.nearest.dist < 160) continue;
    if (start.nearest && start.nearest.dist < 20) continue;
    const end = samples[i + UNRESPONSIVE_WINDOW];
    const moved = Math.hypot(end.x - start.x, end.z - start.z);
    const sped = end.speed - start.speed;
    if (moved < 0.25 && sped < 0.05) {
      return {
        id: 'unresponsive-commands',
        tick: start.tick,
        detail: `forward thrust for ${UNRESPONSIVE_WINDOW} ticks moved ${moved} and changed speed by ${sped}`,
      };
    }
  }
  return null;
}

function detectDroppedCommand(frames, fault) {
  if (fault !== 'drop-thrust') return null;
  const thrust = frames.find((frame) => frame.issuedMoveZ > 0.5 && frame.moveZ < 0.2);
  if (!thrust) return null;
  return {
    id: 'unresponsive-commands',
    tick: thrust.tick | 0,
    detail: 'issued forward thrust was dropped before the sim step',
  };
}

function detectMenuFallback(samples, frames) {
  for (const sample of samples) {
    if (sample.mode !== 'menu' && sample.mode !== 'title' && sample.mode !== 'boot') continue;
    const frame = frameAt(frames, sample.tick);
    const asked = frame && (frame.commands || []).some((command) => command.type === 'open-menu');
    if (!asked && sample.alive) {
      return {
        id: 'unexpected-menu-fallback',
        tick: sample.tick,
        detail: `mode became ${sample.mode} without a menu command or a wreck`,
      };
    }
  }
  return null;
}

function detectStalled(samples) {
  let stall = 0;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const sample = samples[i];
    if (sample.mode !== 'flight' || sample.docked) {
      stall = 0;
      continue;
    }
    if (sample.simTime === prev.simTime) stall += 1;
    else stall = 0;
    if (stall >= 10) {
      return {
        id: 'stalled-loading',
        tick: sample.tick,
        detail: 'simTime did not advance for 10 flight ticks',
      };
    }
  }
  return null;
}

function detectImpossibleDock(samples) {
  let wasDocked = samples[0] ? samples[0].docked : false;
  for (const sample of samples) {
    if (sample.docked && !wasDocked) {
      const dist = sample.nearest && sample.nearest.kind === 'station' ? sample.nearest.dist : null;
      if (dist != null && dist > 800) {
        return {
          id: 'impossible-docking',
          tick: sample.tick,
          detail: `berth flipped on ${dist} from the station`,
        };
      }
    }
    wasDocked = sample.docked;
  }
  return null;
}

function detectDoublePayment(commands) {
  const groups = new Map();
  for (const command of commands) {
    if (!command || (command.type !== 'buy' && command.type !== 'refit')) continue;
    if (!command.intentId) continue;
    const group = groups.get(command.intentId) || { charges: 0, duplicates: 0, tick: command.tick };
    if (command.duplicate) group.duplicates += 1;
    if (command.charged) group.charges += 1;
    groups.set(command.intentId, group);
  }
  for (const [intentId, group] of groups) {
    if (group.charges > 1) {
      return {
        failure: {
          id: 'double-payment',
          tick: group.tick,
          detail: `intent ${intentId} charged ${group.charges} times`,
        },
        closure: null,
      };
    }
  }
  if (groups.size) {
    return {
      failure: null,
      closure: closure(
        'double-payment',
        'Repeated intent ids charged once. An idempotent duplicate receipt is the negative control.',
      ),
    };
  }
  return { failure: null, closure: null };
}

function detectFalseSuccess(commands) {
  for (const command of commands) {
    if (!command || command.ok !== true) continue;
    if (command.type !== 'buy' && command.type !== 'refit') continue;
    if (command.duplicate) continue;
    if (command.refused) {
      return {
        id: 'false-success',
        tick: command.tick,
        detail: `${command.type} reported ok while the station writer refused it`,
      };
    }
    if (command.charged !== true && command.total > 0) {
      return {
        id: 'false-success',
        tick: command.tick,
        detail: `${command.type} reported ok without a credit charge`,
      };
    }
  }
  return null;
}

function detectStuckMission(samples, commands) {
  for (const command of commands) {
    if (!command || command.type !== 'abandon-mission') continue;
    const later = samples.find((sample) => sample.tick > command.tick + 3);
    if (!later) continue;
    if (later.missionStatus === 'active' && later.missionActiveId === command.missionId) {
      return {
        id: 'stuck-missions',
        tick: later.tick,
        detail: `abandon of ${command.missionId} left the contract active`,
      };
    }
  }
  for (const command of commands) {
    if (!command || command.type !== 'accept-mission' || command.ok !== true) continue;
    const later = samples.filter((sample) => sample.tick > command.tick);
    const progressed = later.some((sample) => (
      sample.missionStatus && sample.missionStatus !== 'active'
    ) || (sample.missionTarget != null && sample.missionProgress >= sample.missionTarget));
    const stillActive = later.length > 8 && later.every((sample) => sample.missionStatus === 'active');
    if (command.objectiveMet && stillActive && !progressed) {
      return {
        id: 'stuck-missions',
        tick: later[0].tick,
        detail: 'objective was met and the contract stayed active',
      };
    }
  }
  return null;
}

function detectWrongControls(samples, frames) {
  let opposite = 0;
  for (const sample of samples) {
    const frame = frameAt(frames, sample.tick);
    if (!frame || sample.tetherActive || !sample.alive) {
      opposite = 0;
      continue;
    }
    if (frame.turnIntent > 0.6 && sample.angVel < -0.05) opposite += 1;
    else if (frame.turnIntent < -0.6 && sample.angVel > 0.05) opposite += 1;
    else opposite = 0;
    if (opposite >= TURN_WINDOW) {
      return {
        id: 'wrong-ship-controls',
        tick: sample.tick,
        detail: 'yaw rate stayed opposite the turn command',
      };
    }
  }
  return null;
}

function detectSaveDiscontinuity(commands) {
  const save = commands.find((command) => command && command.type === 'save' && command.snapshot);
  const resume = commands.find((command) => command && command.type === 'continue' && command.snapshot);
  if (!save || !resume) return { failure: null, closure: null };
  const before = save.snapshot;
  const after = resume.snapshot;
  const sectorMismatch = before.sectorId !== after.sectorId;
  const creditMismatch = before.credits != null && after.credits != null
    && Math.abs(before.credits - after.credits) > 0.01;
  const posMismatch = Math.hypot((before.x || 0) - (after.x || 0), (before.z || 0) - (after.z || 0)) > 1;
  if (sectorMismatch || creditMismatch || posMismatch) {
    return {
      failure: {
        id: 'save-discontinuity',
        tick: resume.tick,
        detail: `continue diverged sector=${sectorMismatch} credits=${creditMismatch} pos=${posMismatch}`,
      },
      closure: null,
    };
  }
  return {
    failure: null,
    closure: closure('save-discontinuity', 'Continue restored sector, credits, and position from the envelope.'),
  };
}

export function compareDigests(left, right) {
  if (left === right) return null;
  return {
    id: 'determinism-drift',
    tick: 0,
    detail: 'replay digest differed from the recorded run',
    origin: 'product',
  };
}
