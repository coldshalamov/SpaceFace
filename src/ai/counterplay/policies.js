// One function per doctrine. They return intents. They do not move bodies, fire guns,
// or write subsystem health. Commitment snapshots ignore later sensor updates until the
// window ends; that is the mistake a counter is allowed to punish.

import { wrapAngle } from '../contracts.js';
import { TELEGRAPH_TICKS } from './catalog.js';
import { contactByRole, predictReleasePoint, segmentBlocked } from './observe.js';
import {
  holdManeuver,
  steerAway,
  steerHeading,
  steerPerpendicular,
  steerToward,
} from './steer.js';

function age(memory, tick) {
  return tick - (Number.isInteger(memory.phaseSince) ? memory.phaseSince : tick);
}

function enter(memory, tick, phase) {
  if (memory.phase !== phase) {
    memory.phase = phase;
    memory.phaseSince = tick;
  }
  return age(memory, tick);
}

function telegraph(kind, sinceTick) {
  return { kind, sinceTick, readable: true };
}

function goal(kind, progress) {
  const value = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  return { kind, progress: value, complete: value >= 0.97 };
}

function pack(doctrine, tick, phase, extra) {
  const intent = {
    doctrineId: doctrine.id,
    tick,
    phase,
    telegraph: null,
    maneuver: holdManeuver(extra && extra.self),
    attack: null,
    verb: null,
    companions: [],
    goal: goal(doctrine.physical, 0),
    explain: '',
    cue: null,
    fallback: null,
    ...extra,
  };
  intent.phase = phase;
  return intent;
}

function pointOf(value) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.z)) return null;
  return { x: value.x, z: value.z };
}

function dist(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function relSpeed(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot((a.vel?.x || 0) - (b.vel?.x || 0), (a.vel?.z || 0) - (b.vel?.z || 0));
}

export function policyHeavyAnchorGrappler(ctx) {
  const { doctrine, tick, self, objective, memory } = ctx;
  const anchor = pointOf(objective && objective.anchor);
  const flank = pointOf(objective && objective.flank);
  const approach = anchor ? { x: anchor.x, z: anchor.z + 90 } : null;
  if (!anchor) {
    enter(memory, tick, 'fallback');
    return pack(doctrine, tick, 'fallback', {
      self,
      maneuver: holdManeuver(self),
      fallback: 'no_anchor',
      explain: 'No heavy anchor was authored for this swing.',
      goal: goal('rope', 0),
    });
  }
  if (!memory.commit && dist(self.pos, approach) > 70) {
    const lived = enter(memory, tick, 'acquire');
    return pack(doctrine, tick, 'acquire', {
      self,
      maneuver: steerToward(self, approach, { boost: lived > 20, boostDist: 40 }),
      explain: 'Closing on the heavy anchor before the spool.',
      goal: goal('rope', Math.max(0, 1 - dist(self.pos, approach) / 220)),
    });
  }
  if (!memory.commit) {
    const lived = enter(memory, tick, 'spool');
    if (lived < TELEGRAPH_TICKS) {
      return pack(doctrine, tick, 'spool', {
        self,
        maneuver: holdManeuver(self),
        telegraph: telegraph(doctrine.telegraphKind, memory.phaseSince),
        cue: { kind: doctrine.telegraphKind, anchor },
        explain: 'Spooling onto the heavy anchor. The swing has not started.',
        goal: goal('rope', 0.2),
      });
    }
    memory.commit = {
      id: 'swing',
      untilTick: tick + Math.max(doctrine.commitTicks, 260),
      targetId: objective.anchorId ?? null,
      targetGeneration: 1,
      snapshot: { anchor, flank, heading: Math.atan2(-1, 0.15) },
    };
    memory.latchIssued = false;
  }
  const lived = enter(memory, tick, 'swing');
  const flankPoint = memory.commit.snapshot.flank || flank;
  const issue = memory.latchIssued !== true;
  if (issue) memory.latchIssued = true;
  if (tick < memory.commit.untilTick) {
    return pack(doctrine, tick, 'swing', {
      self,
      maneuver: flankPoint
        ? steerToward(self, flankPoint, { boost: true, arrive: 18, boostDist: 24 })
        : steerHeading(self, memory.commit.snapshot.heading, 1),
      verb: issue ? { kind: 'latch', targetRole: 'anchor', restScale: 1, maxRange: 200 } : null,
      telegraph: lived < 8 ? telegraph(doctrine.telegraphKind, memory.phaseSince) : null,
      cue: { kind: doctrine.telegraphKind, anchor, flank },
      explain: 'Committed swing on the anchor line. The flank is fixed for this window.',
      goal: goal('rope', Math.min(1, lived / doctrine.commitTicks)),
    });
  }
  enter(memory, tick, 'done');
  return pack(doctrine, tick, 'done', {
    self,
    maneuver: holdManeuver(self),
    explain: 'Swing window ended.',
    goal: goal('rope', 1),
  });
}

export function policyFeintBreakCourier(ctx) {
  const { doctrine, tick, self, objective, memory } = ctx;
  const feint = pointOf(objective && objective.feint);
  const gate = pointOf(objective && objective.gate);
  if (!feint || !gate) {
    enter(memory, tick, 'fallback');
    return pack(doctrine, tick, 'fallback', {
      self,
      fallback: 'no_gate',
      explain: 'Courier has no feint point or gate.',
      goal: goal('momentum', 0),
    });
  }
  if (!memory.notes.startGate) memory.notes.startGate = dist(self.pos, gate) || 1;
  const gateProgress = Math.max(0, 1 - dist(self.pos, gate) / memory.notes.startGate);
  if (!memory.commit) {
    const lived = enter(memory, tick, 'feint');
    if (lived < TELEGRAPH_TICKS + doctrine.commitTicks) {
      return pack(doctrine, tick, 'feint', {
        self,
        maneuver: steerToward(self, feint, { boost: lived > TELEGRAPH_TICKS, arrive: 80 }),
        telegraph: lived < TELEGRAPH_TICKS ? telegraph(doctrine.telegraphKind, memory.phaseSince) : null,
        cue: { kind: doctrine.telegraphKind, feint, gateVisible: lived >= TELEGRAPH_TICKS },
        explain: lived < TELEGRAPH_TICKS
          ? 'Showing the false burn.'
          : 'Committed to the feint heading.',
        goal: goal('momentum', gateProgress * 0.25),
      });
    }
    memory.commit = { id: 'break', untilTick: tick + 160, snapshot: { gate } };
  }
  const lived = enter(memory, tick, 'break');
  if (dist(self.pos, gate) > 36) {
    return pack(doctrine, tick, 'break', {
      self,
      maneuver: steerToward(self, gate, {
        boost: lived > 15 && dist(self.pos, gate) > 160,
        arrive: 28,
        brakeDist: 36,
        brakeSpeed: 6,
      }),
      cue: { kind: 'break_to_gate', gate },
      explain: 'Breaking off the feint toward the true gate.',
      goal: goal('momentum', gateProgress),
    });
  }
  enter(memory, tick, 'done');
  return pack(doctrine, tick, 'done', {
    self,
    maneuver: holdManeuver(self),
    explain: 'Courier reached the gate.',
    goal: goal('momentum', 1),
  });
}

export function policyCorridorPackLeader(ctx) {
  const { doctrine, tick, self, objective, memory } = ctx;
  const park = pointOf(objective && objective.leaderPark);
  const lane = pointOf(objective && objective.lane);
  const exit = pointOf(objective && objective.exit);
  const packmate = contactByRole(ctx.sensed, 'packmate');
  if (!park || !lane || !exit) {
    enter(memory, tick, 'fallback');
    return pack(doctrine, tick, 'fallback', {
      self,
      fallback: 'no_lane',
      explain: 'No escape lane was authored.',
      goal: goal('cover', 0),
    });
  }
  const lived = enter(memory, tick, memory.commit ? 'hold_park' : 'show_lane');
  if (!memory.commit) {
    if (lived < TELEGRAPH_TICKS || dist(self.pos, park) > 50) {
      return pack(doctrine, tick, 'show_lane', {
        self,
        maneuver: steerToward(self, park, { arrive: 24, brakeDist: 30 }),
        telegraph: telegraph(doctrine.telegraphKind, memory.phaseSince),
        cue: { kind: doctrine.telegraphKind, lane, park },
        companions: companionHold(packmate) ? [companionHold(packmate)] : [],
        explain: 'Showing the open lane before parking off it.',
        goal: goal('cover', Math.max(0.15, 1 - dist(self.pos, park) / 180)),
      });
    }
    memory.commit = { id: 'park', untilTick: tick + doctrine.commitTicks, snapshot: { lane, exit, park } };
  }
  const mateProgress = packmate ? Math.max(0, 1 - dist(packmate.pos, exit) / 280) : 0;
  const player = contactByRole(ctx.sensed, 'player');
  const mouthBlocked = !!(player && dist(player.pos, lane) < 34);
  const holdShort = { x: lane.x - 90, z: lane.z };
  const waypoint = mouthBlocked ? holdShort : (!packmate || dist(packmate.pos, lane) > 36 ? lane : exit);
  return pack(doctrine, tick, 'hold_park', {
    self,
    maneuver: steerToward(self, park, { arrive: 22, brakeDist: 34, brakeSpeed: 6 }),
    telegraph: age(memory, tick) < 6 ? telegraph(doctrine.telegraphKind, memory.phaseSince) : null,
    cue: { kind: doctrine.telegraphKind, lane, park, exit },
    companions: [{ role: 'packmate', waypoint }],
    explain: 'Holding off the lane so the packmate can take the telegraphed mouth.',
    goal: goal('cover', mateProgress),
  });
}

function companionHold(contact) {
  if (!contact) return null;
  return { role: 'packmate', id: contact.id, maneuver: { ...holdManeuver(contact), brake: true } };
}

export function policyRescueTow(ctx) {
  const { doctrine, tick, self, objective, memory } = ctx;
  const patientPoint = pointOf(objective && objective.patient);
  const gate = pointOf(objective && objective.gate);
  const patient = contactByRole(ctx.sensed, 'patient') || (patientPoint && { pos: patientPoint, id: objective.patientId });
  if (!gate || !patientPoint) {
    enter(memory, tick, 'fallback');
    return pack(doctrine, tick, 'fallback', {
      self,
      fallback: 'no_patient',
      explain: 'Nothing to tow.',
      goal: goal('rescue', 0),
    });
  }
  const near = dist(self.pos, patient.pos || patientPoint) < 80;
  if (!memory.commit) {
    if (!near) {
      enter(memory, tick, 'approach');
      return pack(doctrine, tick, 'approach', {
        self,
        maneuver: steerToward(self, patient.pos || patientPoint, { arrive: 40 }),
        explain: 'Closing to spool the disabled hull.',
        goal: goal('rescue', 0.1),
      });
    }
    const lived = enter(memory, tick, 'spool');
    if (lived < TELEGRAPH_TICKS) {
      return pack(doctrine, tick, 'spool', {
        self,
        maneuver: steerToward(self, patient.pos || patientPoint, { arrive: 36, brakeDist: 40 }),
        telegraph: telegraph(doctrine.telegraphKind, memory.phaseSince),
        cue: { kind: doctrine.telegraphKind, patient: patient.pos || patientPoint, gate },
        explain: 'Spooling the tow. The patient has not moved yet.',
        goal: goal('rescue', 0.15),
      });
    }
    memory.commit = { id: 'tow', untilTick: tick + doctrine.commitTicks, snapshot: { gate } };
    memory.latchIssued = false;
  }
  const issue = memory.latchIssued !== true;
  if (issue) memory.latchIssued = true;
  if (!memory.notes.startGate) memory.notes.startGate = dist(patientPoint, gate) || 1;
  const patientPos = patient.pos || patientPoint;
  const progress = Math.max(0, 1 - dist(patientPos, gate) / memory.notes.startGate);
  if (dist(patientPos, gate) > 40 && tick < memory.commit.untilTick) {
    return pack(doctrine, tick, 'tow', {
      self,
      maneuver: steerToward(self, gate, { boost: true, arrive: 40, boostDist: 30 }),
      verb: issue ? { kind: 'latch', targetRole: 'patient', restScale: 0.92, maxRange: 110 } : null,
      cue: { kind: doctrine.telegraphKind, gate },
      explain: 'Towing the disabled hull toward the gate.',
      goal: goal('rescue', progress),
    });
  }
  enter(memory, tick, 'done');
  return pack(doctrine, tick, 'done', {
    self,
    maneuver: holdManeuver(self),
    explain: 'Tow window finished.',
    goal: goal('rescue', progress),
  });
}

export function policyPrizeRunner(ctx) {
  const { doctrine, tick, self, memory } = ctx;
  const prize = contactByRole(ctx.sensed, 'prize');
  if (!prize) {
    const lived = enter(memory, tick, 'search');
    const guess = pointOf(ctx.objective && ctx.objective.prize);
    return pack(doctrine, tick, 'search', {
      self,
      maneuver: guess ? steerToward(self, guess, { boost: lived > 10 }) : holdManeuver(self),
      fallback: lived > 40 ? 'prize_unsensed' : null,
      explain: 'Prize is outside the delayed picture. Searching the last ordered drift.',
      goal: goal('momentum', 0),
    });
  }
  const lead = {
    x: prize.pos.x + (prize.vel?.x || 0) * 0.35,
    z: prize.pos.z + (prize.vel?.z || 0) * 0.35,
  };
  const gap = dist(self.pos, prize.pos);
  const slip = relSpeed(self, prize);
  if (!memory.commit) {
    if (gap > 75) {
      enter(memory, tick, 'match');
      return pack(doctrine, tick, 'match', {
        self,
        maneuver: steerToward(self, lead, { boost: gap > 90, arrive: 28, boostDist: 80 }),
        explain: 'Matching the prize velocity before any latch.',
        goal: goal('momentum', Math.max(0, 1 - gap / 200) * 0.4),
      });
    }
    const lived = enter(memory, tick, 'show_match');
    if (lived < TELEGRAPH_TICKS) {
      return pack(doctrine, tick, 'show_match', {
        self,
        maneuver: steerToward(self, prize.pos, { arrive: 22, brakeDist: 34, brakeSpeed: 8 }),
        telegraph: telegraph(doctrine.telegraphKind, memory.phaseSince),
        cue: { kind: doctrine.telegraphKind, prizeId: prize.id },
        explain: 'Velocity match is visible. The latch is not closed.',
        goal: goal('momentum', 0.45),
      });
    }
    memory.commit = {
      id: 'latch_prize',
      untilTick: tick + doctrine.commitTicks,
      targetId: prize.id,
      targetGeneration: prize.generation,
      snapshot: { id: prize.id },
    };
    memory.latchIssued = false;
  }
  const issue = memory.latchIssued !== true;
  if (issue) memory.latchIssued = true;
  const matched = gap < 48 && slip < 16;
  if (!memory.notes.matchedTicks) memory.notes.matchedTicks = 0;
  if (matched) memory.notes.matchedTicks += 1;
  return pack(doctrine, tick, 'latched', {
    self,
    maneuver: steerToward(self, prize.pos, { arrive: 18, brakeDist: 26, brakeSpeed: 6 }),
    verb: issue ? { kind: 'latch', targetRole: 'prize', restScale: 1, maxRange: 90 } : null,
    cue: { kind: doctrine.telegraphKind, prizeId: prize.id },
    explain: 'Holding the matched latch on the moving prize.',
    goal: goal('momentum', Math.min(1, memory.notes.matchedTicks / 24)),
  });
}

export function policyReleaseOrbitHunter(ctx) {
  const { doctrine, tick, self, objective, memory } = ctx;
  const body = contactByRole(ctx.sensed, 'orbit_body');
  const anchor = contactByRole(ctx.sensed, 'orbit_anchor')
    || (objective && objective.anchor ? { pos: objective.anchor, id: objective.anchorId } : null);
  if (!memory.commit) {
    if (!body || !anchor) {
      enter(memory, tick, 'search');
      const guess = pointOf(objective && objective.standoff);
      return pack(doctrine, tick, 'search', {
        self,
        maneuver: guess ? steerToward(self, guess) : holdManeuver(self),
        fallback: 'orbit_unsensed',
        explain: 'Orbit body is not in the delayed picture yet.',
        goal: goal('orbit', 0),
      });
    }
    const lived = enter(memory, tick, 'mark');
    if (lived < TELEGRAPH_TICKS) {
      return pack(doctrine, tick, 'mark', {
        self,
        maneuver: steerToward(self, body.pos, { arrive: 120, brakeDist: 80 }),
        telegraph: telegraph(doctrine.telegraphKind, memory.phaseSince),
        cue: { kind: doctrine.telegraphKind, bodyId: body.id },
        explain: 'Marking the release. The station point is not frozen yet.',
        goal: goal('orbit', 0.2),
      });
    }
    const predicted = predictReleasePoint(anchor, body, doctrine.commitTicks);
    memory.commit = {
      id: 'release',
      untilTick: tick + doctrine.commitTicks,
      targetId: body.id,
      targetGeneration: body.generation,
      snapshot: predicted,
    };
  }
  const point = memory.commit.snapshot;
  if (tick <= memory.commit.untilTick && point) {
    enter(memory, tick, 'station');
    const left = memory.commit.untilTick - tick;
    return pack(doctrine, tick, 'station', {
      self,
      maneuver: steerToward(self, point, { arrive: 30, brakeDist: 40, boost: dist(self.pos, point) > 80 }),
      cue: { kind: doctrine.telegraphKind, predicted: point, untilTick: memory.commit.untilTick, bodyId: memory.commit.targetId },
      explain: 'Committed to the release point from the mark. Later motion does not move the point.',
      goal: goal('orbit', Math.max(0, 1 - dist(self.pos, point) / 200) * (left < 15 ? 1 : 0.7)),
    });
  }
  const live = contactByRole(ctx.sensed, 'orbit_body');
  enter(memory, tick, 'fallback');
  return pack(doctrine, tick, 'fallback', {
    self,
    maneuver: live ? steerToward(self, live.pos, { arrive: 40 }) : holdManeuver(self),
    fallback: 'release_window_ended',
    explain: 'Release window ended. Chasing only the body that is still in view.',
    goal: goal('orbit', point ? Math.max(0, 1 - dist(self.pos, point) / 200) : 0),
  });
}

export function policyTetherBaitDecoy(ctx) {
  const { doctrine, tick, self, memory } = ctx;
  const long = (ctx.sensed.tethers || []).find((tether) => (
    tether && (tether.targetId === self.id || tether.ownerId === self.id) && tether.length > 180
  ));
  if (!memory.commit) {
    const lived = enter(memory, tick, 'drift');
    if (!long) {
      return pack(doctrine, tick, 'drift', {
        self,
        maneuver: { ...holdManeuver(self), brake: true, forward: 0.05 },
        telegraph: lived < TELEGRAPH_TICKS ? telegraph(doctrine.telegraphKind, memory.phaseSince) : null,
        cue: { kind: doctrine.telegraphKind, wantLongTether: true },
        explain: 'Drifting as bait. No long tether is in the delayed picture.',
        goal: goal('rope', 0.05),
      });
    }
    if (lived < TELEGRAPH_TICKS) {
      return pack(doctrine, tick, 'drift', {
        self,
        maneuver: holdManeuver(self),
        telegraph: telegraph(doctrine.telegraphKind, memory.phaseSince),
        cue: { kind: doctrine.telegraphKind, tetherId: long.id },
        explain: 'Long tether seen. Still showing the drift before the burn.',
        goal: goal('rope', 0.2),
      });
    }
    memory.commit = {
      id: 'bait_burn',
      untilTick: tick + doctrine.commitTicks,
      snapshot: { tetherId: long.id, sign: 1 },
    };
  }
  if (tick <= memory.commit.untilTick) {
    enter(memory, tick, 'burn');
    const origin = contactByRole(ctx.sensed, 'player');
    return pack(doctrine, tick, 'burn', {
      self,
      maneuver: steerPerpendicular(self, origin ? origin.pos : { x: self.pos.x - 1, z: self.pos.z }, 1),
      cue: { kind: 'bait_burn', tetherId: memory.commit.snapshot.tetherId },
      explain: 'Burning across the long tether that was taken.',
      goal: goal('rope', Math.min(1, age(memory, tick) / doctrine.commitTicks)),
    });
  }
  enter(memory, tick, 'done');
  return pack(doctrine, tick, 'done', {
    self,
    maneuver: steerHeading(self, self.rot || 0, 0.4),
    explain: 'Bait burn finished.',
    goal: goal('rope', 1),
  });
}

function laneClear(self, target, blocker, radiusPad) {
  if (!self || !target || !blocker) return true;
  return !segmentBlocked(self.pos, target.pos, [{ pos: blocker.pos, radius: (blocker.radius || 12) + radiusPad }], 0);
}

export function policyCollateralHold(ctx) {
  const { doctrine, tick, self, memory } = ctx;
  const player = contactByRole(ctx.sensed, 'player');
  const civilian = contactByRole(ctx.sensed, 'civilian');
  if (!player) {
    enter(memory, tick, 'search');
    const guess = pointOf(ctx.objective && ctx.objective.player);
    return pack(doctrine, tick, 'search', {
      self,
      maneuver: guess ? steerToward(self, guess, { arrive: 180 }) : holdManeuver(self),
      fallback: 'player_unsensed',
      explain: 'No delayed sighting of the player. Holding fire.',
      goal: goal('collateral', 0),
    });
  }
  const blocked = civilian ? !laneClear(self, player, civilian, 8) : false;
  const flankSign = memory.notes.flankSign || 1;
  const flank = {
    x: self.pos.x + flankSign * 70,
    z: self.pos.z,
  };
  if (blocked) {
    const lived = enter(memory, tick, 'show_flank');
    if (!memory.notes.flankSign) memory.notes.flankSign = 1;
    memory.commit = null;
    delete memory.notes.clearSince;
    return pack(doctrine, tick, 'show_flank', {
      self,
      maneuver: lived < TELEGRAPH_TICKS ? holdManeuver(self) : steerToward(self, flank, { arrive: 20, brakeDist: 28 }),
      telegraph: telegraph(doctrine.telegraphKind, memory.phaseSince),
      cue: { kind: doctrine.telegraphKind, flank, flankSign },
      explain: 'Civilian owns the live segment. The gun stays dark.',
      goal: goal('collateral', 0.15),
    });
  }
  if (!Number.isInteger(memory.notes.clearSince)) memory.notes.clearSince = tick;
  if (tick - memory.notes.clearSince < TELEGRAPH_TICKS) {
    enter(memory, tick, 'show_clear_lane');
    return pack(doctrine, tick, 'show_clear_lane', { self, maneuver: holdManeuver(self),
      telegraph: telegraph(doctrine.telegraphKind, memory.notes.clearSince),
      explain: 'Showing the clear lane before requesting a shot.', goal: goal('collateral', 0.3) });
  }
  enter(memory, tick, 'fire');
  const want = dist(self.pos, player.pos) < 230 && tick >= 60 && noseOn(self, player);
  return pack(doctrine, tick, 'fire', {
    self,
    maneuver: (want || dist(self.pos, player.pos) < 110) ? aimHold(self, player) : steerToward(self, player.pos, { arrive: 140, brakeDist: 100 }),
    attack: want ? fireAt(doctrine, self, player) : null,
    explain: want ? 'Clear lane. Requesting fire through the legal window.' : 'Clear, still closing inside the gun.',
    goal: goal('collateral', want ? 0.8 : 0.4),
  });
}

export function policyCoverPeel(ctx) {
  const { doctrine, tick, self, memory, objective } = ctx;
  const player = contactByRole(ctx.sensed, 'player');
  const rock = (ctx.sensed.obstacles || []).find((row) => row && row.role === 'cover')
    || (objective && objective.cover ? { pos: objective.cover, radius: objective.coverRadius || 26, role: 'cover' } : null);
  if (!player && rock && objective?.peel) {
    const lived = enter(memory, tick, 'probe_peel');
    return pack(doctrine, tick, 'probe_peel', {
      self, attack: null,
      maneuver: lived < TELEGRAPH_TICKS ? holdManeuver(self) : steerToward(self, objective.peel, { arrive: 24, brakeDist: 32 }),
      telegraph: lived < TELEGRAPH_TICKS ? telegraph(doctrine.telegraphKind, memory.phaseSince) : null,
      cue: { kind: doctrine.telegraphKind, peel: objective.peel },
      explain: 'No sighting through cover. Probing the charted peek without firing.',
      goal: goal('cover', Math.max(0, 1 - dist(self.pos, objective.peel) / 200) * 0.3),
    });
  }
  if (!player || !rock) {
    enter(memory, tick, 'search');
    const hide = pointOf(objective && objective.hide);
    return pack(doctrine, tick, 'search', {
      self,
      maneuver: hide ? steerToward(self, hide, { arrive: 30 }) : holdManeuver(self),
      fallback: 'cover_unsensed',
      explain: 'Cover or the player is outside the delayed picture. Not firing.',
      goal: goal('cover', 0),
    });
  }
  const hidden = !laneClear(self, player, rock, 22);
  const side = memory.notes.peelSign || 1;
  const peel = {
    x: rock.pos.x + 40,
    z: rock.pos.z + side * 150,
  };
  if (hidden && !memory.commit) {
    const lived = enter(memory, tick, 'show_peel');
    if (!memory.notes.peelSign) memory.notes.peelSign = 1;
    if (lived < TELEGRAPH_TICKS) {
      const hide = {
        x: rock.pos.x + (self.pos.x >= rock.pos.x ? 55 : -55),
        z: rock.pos.z,
      };
      return pack(doctrine, tick, 'show_peel', {
        self,
        maneuver: steerToward(self, hide, { arrive: 20, brakeDist: 24 }),
        telegraph: telegraph(doctrine.telegraphKind, memory.phaseSince),
        cue: { kind: doctrine.telegraphKind, peel, peelSign: side },
        explain: 'Behind the rock. Showing which side the peel will take.',
        goal: goal('cover', 0.15),
      });
    }
    memory.commit = { id: 'peel', untilTick: tick + Math.max(doctrine.commitTicks, 220), snapshot: { peel, peelSign: side } };
  }
  if (memory.commit && tick <= memory.commit.untilTick) {
    enter(memory, tick, 'peel');
    const point = memory.commit.snapshot.peel;
    const clear = laneClear(self, player, rock, 22);
    if (clear) {
      if (!Number.isInteger(memory.notes.peekSince)) memory.notes.peekSince = tick;
    } else {
      delete memory.notes.peekSince;
    }
    const peeked = Number.isInteger(memory.notes.peekSince) && tick - memory.notes.peekSince >= 45;
    const want = peeked && dist(self.pos, player.pos) < 230 && tick >= 60 && noseOn(self, player);
    return pack(doctrine, tick, 'peel', {
      self,
      maneuver: want
        ? { ...steerHeading(self, Math.atan2(player.pos.z - self.pos.z, player.pos.x - self.pos.x), 0), brake: true, forward: 0 }
        : steerToward(self, point, { arrive: 22, brakeDist: 28 }),
      attack: want ? fireAt(doctrine, self, player) : null,
      cue: { kind: doctrine.telegraphKind, peel: point, peelSign: memory.commit.snapshot.peelSign },
      explain: want ? 'Peeled clear of the rock. Requesting the window.' : 'Peel is committed. The gun stays dark in shadow.',
      goal: goal('cover', want ? 0.75 : 0.3),
    });
  }
  if (!hidden) {
    if (!Number.isInteger(memory.notes.clearSince)) memory.notes.clearSince = tick;
    const shown = tick - memory.notes.clearSince;
    if (shown < TELEGRAPH_TICKS) {
      enter(memory, tick, 'show_peel');
      return pack(doctrine, tick, 'show_peel', {
        self,
        maneuver: steerToward(self, player.pos, { arrive: 140, brakeDist: 80 }),
        telegraph: telegraph(doctrine.telegraphKind, memory.notes.clearSince),
        cue: { kind: doctrine.telegraphKind, peelSign: memory.notes.peelSign || 1 },
        explain: 'Line of sight is open. Showing the peel before any shot.',
        goal: goal('cover', 0.2),
      });
    }
    enter(memory, tick, 'fire');
    const want = shown >= 45 && dist(self.pos, player.pos) < 230 && tick >= 60 && noseOn(self, player);
    return pack(doctrine, tick, 'fire', {
      self,
      maneuver: (want || dist(self.pos, player.pos) < 110) ? aimHold(self, player) : steerToward(self, player.pos, { arrive: 150 }),
      attack: want ? fireAt(doctrine, self, player) : null,
      explain: 'Already out of shadow.',
      goal: goal('cover', want ? 0.7 : 0.35),
    });
  }
  memory.commit = null;
  memory.notes.peelSign = -(memory.notes.peelSign || 1);
  enter(memory, tick, 'show_peel');
  return pack(doctrine, tick, 'show_peel', {
    self,
    maneuver: holdManeuver(self),
    telegraph: telegraph(doctrine.telegraphKind, tick),
    explain: 'Back in shadow. Holding fire.',
    goal: goal('cover', 0.2),
  });
}

export function policyFieldMechanic(ctx) {
  const { doctrine, tick, self, memory, objective } = ctx;
  const patient = contactByRole(ctx.sensed, 'patient');
  const patientPoint = pointOf(objective && objective.patient) || (patient && patient.pos);
  if (memory.notes.aborted === true) {
    enter(memory, tick, 'fallback');
    return pack(doctrine, tick, 'fallback', {
      self,
      maneuver: steerAway(self, patientPoint || { x: 0, z: 0 }),
      fallback: 'work_aborted',
      explain: 'The work was broken. It does not resume.',
      goal: goal('repair', Math.min(0.95, (memory.notes.worked || 0) / 80)),
    });
  }
  if (!patientPoint) {
    enter(memory, tick, 'fallback');
    return pack(doctrine, tick, 'fallback', {
      self,
      fallback: 'no_patient',
      explain: 'No patient to repair.',
      goal: goal('repair', 0),
    });
  }
  const workPoint = { x: patientPoint.x - 36, z: patientPoint.z };
  if (!memory.commit) {
    if (dist(self.pos, workPoint) > 34) {
      enter(memory, tick, 'approach');
      return pack(doctrine, tick, 'approach', {
        self,
        maneuver: steerToward(self, workPoint, { arrive: 16, brakeDist: 22 }),
        explain: 'Moving to the repair spot. Not working yet.',
        goal: goal('repair', 0.1),
      });
    }
    const lived = enter(memory, tick, 'show_work');
    if (lived < TELEGRAPH_TICKS) {
      return pack(doctrine, tick, 'show_work', {
        self,
        maneuver: steerToward(self, workPoint, { arrive: 12, brakeDist: 18, brakeSpeed: 4 }),
        telegraph: telegraph(doctrine.telegraphKind, memory.phaseSince),
        cue: { kind: doctrine.telegraphKind, patient: patientPoint },
        explain: 'Work telegraph. The drive is not being written yet.',
        goal: goal('repair', 0.15),
      });
    }
    memory.commit = {
      id: 'repair',
      untilTick: tick + doctrine.commitTicks,
      snapshot: { x: self.pos.x, z: self.pos.z, hull: self.hull, shield: self.shield },
    };
    memory.notes.worked = 0;
  }
  const snap = memory.commit.snapshot;
  const shoved = dist(self.pos, snap) > 42;
  const hurt = (Number(self.hull) + 0.5 < Number(snap.hull)) || (Number(self.shield) + 0.5 < Number(snap.shield));
  if (shoved || hurt || tick > memory.commit.untilTick) {
    enter(memory, tick, 'fallback');
    memory.commit = null;
    memory.notes.aborted = true;
    return pack(doctrine, tick, 'fallback', {
      self,
      maneuver: steerAway(self, patientPoint),
      fallback: shoved ? 'shoved_off_work' : hurt ? 'hit_during_work' : 'work_window_ended',
      explain: shoved
        ? 'Shoved off the work spot. Repair stopped.'
        : hurt
          ? 'Hit during the work window. Repair stopped.'
          : 'Work window ended.',
      goal: goal('repair', Math.min(0.95, (memory.notes.worked || 0) / 80)),
    });
  }
  enter(memory, tick, 'work');
  memory.notes.worked = (memory.notes.worked || 0) + 1;
  return pack(doctrine, tick, 'work', {
    self,
    maneuver: steerToward(self, workPoint, { arrive: 10, brakeDist: 16, brakeSpeed: 3 }),
    verb: { kind: 'repair', targetRole: 'patient', subsystemId: 'subsystem_drive', amount: 0.25 },
    cue: { kind: doctrine.telegraphKind, patient: patientPoint },
    explain: 'Holding the work spot and writing field repair into the drive.',
    goal: goal('repair', Math.min(1, memory.notes.worked / 80)),
  });
}

function noseOn(self, target) {
  if (!self || !target || !target.pos) return false;
  const gap = dist(self.pos, target.pos);
  if (gap < 40 || gap > 220) return false;
  const desired = Math.atan2(target.pos.z - self.pos.z, target.pos.x - self.pos.x);
  return Math.abs(wrapAngle(desired - (self.rot || 0))) < 0.35;
}

function aimHold(self, target) {
  const dx = target.pos.x - self.pos.x;
  const dz = target.pos.z - self.pos.z;
  const gap = Math.hypot(dx, dz) || 1;
  const heading = Math.atan2(dz, dx);
  if (gap < 90 || gap > 160) {
    return steerToward(self, {
      x: target.pos.x - (dx / gap) * 120,
      z: target.pos.z - (dz / gap) * 120,
    }, { arrive: 18, brakeDist: 26, brakeSpeed: 8 });
  }
  return { ...steerHeading(self, heading, 0), brake: true, forward: 0 };
}

function fireAt(doctrine, self, target) {
  if (!self || !target || target.team === 2 || target.role === 'civilian' || target.role === 'patient') return null;
  const dx = target.pos.x - self.pos.x;
  const dz = target.pos.z - self.pos.z;
  const gap = Math.hypot(dx, dz) || 1;
  const lead = Math.min(0.5, gap / 320);
  return {
    targetId: target.id,
    targetRole: target.role || 'player',
    wantFire: true,
    legalDoctrineId: doctrine.legalFireDoctrineId,
    legalPhase: doctrine.legalFirePhase,
    aimAngle: Math.atan2(dz + (target.vel?.z || 0) * lead, dx + (target.vel?.x || 0) * lead),
  };
}

export const COUNTERPLAY_POLICIES = Object.freeze({
  cp_heavy_anchor_grappler: policyHeavyAnchorGrappler,
  cp_feint_break_courier: policyFeintBreakCourier,
  cp_corridor_pack_leader: policyCorridorPackLeader,
  cp_rescue_tow: policyRescueTow,
  cp_prize_runner: policyPrizeRunner,
  cp_release_orbit_hunter: policyReleaseOrbitHunter,
  cp_tether_bait_decoy: policyTetherBaitDecoy,
  cp_collateral_hold: policyCollateralHold,
  cp_cover_peel: policyCoverPeel,
  cp_field_mechanic: policyFieldMechanic,
});
