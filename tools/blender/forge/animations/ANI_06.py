"""ANI-06 — Kestrel repair-pod hatch + two-link service arm deploy/stow.

Reference: assets/animation-references/videos/ANI-06.mp4 (97 frames @24fps, phases rest 1 ->
hatch-arm-deploy 27 -> service-pose 49 -> stow 80 -> park 97). The prompt's authoritative motion:
the small dark rectangular hatch on top of the green pod hinges up, a compact two-link metal
service arm unfolds from that hatch, holds its small tool tip just outside the opening, then
folds back inside and the hatch closes. Pod, band and hull never move; the deployed arm is no
longer than the green pod.

Geometry (allowed by proposedGeometry — "a compact two-joint service arm stowed inside the
existing fixed green repair pod, with a small tool head"): three new parts folded inside the
pod volume under the existing RepairPodHatch — SvcArmA (shoulder link), SvcArmB + SvcHead +
SvcTip (forearm and tool head). At rest the Z-fold sits fully inside the pod's solid box, so
the pod reads unchanged until the hatch swings.

Groups:
  kestrel_pod_hatch          hinge pivot on the hatch's outboard (y=3.75) edge — opens over the sponson
  kestrel_pod_arm_shoulder   pivot under the hatch opening — pitches the folded links up
  kestrel_pod_arm_elbow      nested inside the shoulder — unfolds the forearm + head

Clips:
  serviceArm   hatch opens, arm unfolds and holds its tip just outside (endMode 'hold' —
               parks deployed for as long as the repair job runs)
  serviceStow  arm folds back inside, hatch closes (endMode 'hold' — a rest-ended stow would
               park and re-expose serviceArm's held pose; holding at rest keeps the arm
               stowed until the next service:started re-deploys it)

Bank routes: kestrel:serviceArm -> serviceArm, kestrel:serviceDone -> serviceStow.
"""
import math
import os
import sys

from mathutils import Euler

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(HERE, '..')))
import motion_bank  # noqa: E402

RIG_ID = 'kestrel_pod'
# Lid hinges on its +X (fore) edge and stands open at the pod's front edge — any aft-hung
# pose would put the plate inside the arm's aft deploy plane and the forearm would clip it.
HATCH_RAD = math.radians(100)
# Low flat reach aft, not a tall inverted-V: the shoulder only pitches the folded chain
# clear of the opening, then the elbow counter-rotates the forearm horizontal so the tip
# lays back over the pod's aft edge — a compact work silhouette no longer than the pod.
SHOULDER_RAD = math.radians(55)   # folded -X-hanging chain pitches up just clear of the lid
ELBOW_RAD = math.radians(105)     # forearm counter-rotates flat aft — tip hovers the aft deck

EVENTS = {
    'kestrel:serviceArm': 'serviceArm',
    'kestrel:serviceDone': 'serviceStow',
}


def register(ship, parts):
    """parts: {'hatch': obj, 'arm_a': obj, 'arm_b': [obj, ...]}.

    The pod, band and hull are NOT in groups — only hatch + arm parts move, matching the
    reference where the green box stays welded to the shoulder.
    """
    # Hinge on the hatch's +X (fore) edge — rotY swings the lid up to stand at the pod's front
    # edge, out of the arm's aft deploy plane (an aft-hung lid is clipped by the forearm).
    ship.motion_group('kestrel_pod_hatch', pivot=(-1.5, 4.35, 1.92), objects=[parts['hatch']])
    # Shoulder at the opening's +X edge inside the pod — the -X-hanging chain swings up out.
    ship.motion_group('kestrel_pod_arm_shoulder', pivot=(-1.7, 4.35, 1.55),
                      objects=[parts['arm_a']])
    # Elbow at the chain's -X knuckle (the Z-fold apex), nested in the shoulder's frame.
    ship.motion_group('kestrel_pod_arm_elbow', pivot=(-2.9, 4.35, 1.55),
                      objects=list(parts['arm_b']), parent='kestrel_pod_arm_shoulder')


def author(bank):
    """Keyframe deploy/stow on the pod rig (reference-aligned)."""
    arm = next(c for c in bank.clips if c.name == 'serviceArm')
    for t, a in [(0.00, 0.0), (0.42, 0.9), (0.62, HATCH_RAD - 0.08), (0.78, HATCH_RAD)]:
        arm.key('kestrel_pod_hatch', t, rot=Euler((0.0, a, 0.0)))
    for t, a in [(0.00, 0.0), (0.72, 0.0), (1.55, SHOULDER_RAD * 0.82),
                 (2.05, SHOULDER_RAD + 0.04), (2.30, SHOULDER_RAD - 0.015),
                 (2.60, SHOULDER_RAD)]:
        arm.key('kestrel_pod_arm_shoulder', t, rot=Euler((0.0, a, 0.0)))
    for t, a in [(0.00, 0.0), (1.10, 0.0), (1.90, ELBOW_RAD * 0.8),
                 (2.30, ELBOW_RAD + 0.04), (2.60, ELBOW_RAD)]:
        arm.key('kestrel_pod_arm_elbow', t, rot=Euler((0.0, a, 0.0)))

    stow = next(c for c in bank.clips if c.name == 'serviceStow')
    for t, a in [(0.00, ELBOW_RAD), (0.55, ELBOW_RAD * 0.35), (1.05, -0.04), (1.35, 0.0)]:
        stow.key('kestrel_pod_arm_elbow', t, rot=Euler((0.0, a, 0.0)))
    for t, a in [(0.00, SHOULDER_RAD), (0.45, SHOULDER_RAD), (1.30, SHOULDER_RAD * 0.28),
                 (1.80, -0.03), (2.00, 0.0)]:
        stow.key('kestrel_pod_arm_shoulder', t, rot=Euler((0.0, a, 0.0)))
    for t, a in [(0.00, HATCH_RAD), (1.75, HATCH_RAD), (2.45, HATCH_RAD * 0.18),
                 (2.75, 0.04), (2.90, 0.0)]:
        stow.key('kestrel_pod_hatch', t, rot=Euler((0.0, a, 0.0)))


def build(ship, parts, source_asset_id, bank=None):
    """Register groups and author clips. `bank` is the ship's shared motion bank (ANI-01's);
    all Kestrel rigs live in kestrel.motion.json. Call before export_ship."""
    register(ship, parts)
    if bank is None:
        bank = motion_bank.MotionBank(ship, RIG_ID, source_asset_id, events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    bank.clip('serviceArm', 3.6, loop=False, end_mode='hold')
    bank.clip('serviceStow', 2.9, loop=False, end_mode='hold')
    author(bank)
    return bank
