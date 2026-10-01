"""ANI-16 — kestrel landing-strut deploy / dock settle / stow.

Docking is the most repeated verb in the game; the hull currently teleports to
'docked' with zero body language. The belly gear now drops on hydraulic rams
when the pilot enters dock range, loads and rebounds as the ship settles onto
the pad, and tucks back up on undock (or on leaving range without docking).

Groups
  kestrel_strut_f — nose skid under the bow (new NoseSkid part).
  kestrel_strut_p — port belly rail (existing Skid).
  kestrel_strut_s — starboard belly rail (existing Skid_m).

Clips
- struts_deploy (1.3s, hold): ram drop 0.35m with a mains splay, staggered nose,
  small overshoot into hold.
- dock_settle (1.5s, hold): weight loads the gear — compress, rebound, settle
  back to full extension (hold-ended so the gear stays down while docked).
- struts_stow (0.9s, rest): tuck back to flush.

Triggers: `dock:range` (deploy, render-side gate on payload.inRange),
`dock:docked` (settle), `dock:undocked` + synthetic `kestrel:strutsStow`
(range lost before docking) -> struts_stow.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

DROP_M = 0.35      # ram extension below the tucked line
SPLAY_RAD = 0.10   # mains toe-out under load


def register(ship, parts):
    """parts: {'skidP': obj, 'skidS': obj, 'skidF': obj} — belly gear."""
    ship.motion_group('kestrel_strut_p', pivot=(-4.0, 1.6, -2.15), objects=[parts['skidP']])
    ship.motion_group('kestrel_strut_s', pivot=(-4.0, -1.6, -2.15), objects=[parts['skidS']])
    ship.motion_group('kestrel_strut_f', pivot=(4.6, 0.0, -1.9), objects=[parts['skidF']])


STRUT_HOMES = {
    'kestrel_strut_p': (-4.0, 1.6, -2.15),
    'kestrel_strut_s': (-4.0, -1.6, -2.15),
    'kestrel_strut_f': (4.6, 0.0, -1.9),
}


def _strut_keys(clip, group, times, splay=0.0, splay_sign=1.0):
    # clip.key loc is the absolute local translation: extension rides the strut's
    # home offset so the ram extends from its mount instead of snapping to origin.
    hx, hy, hz = STRUT_HOMES[group]
    for t, f in times:
        kw = {'loc': (hx, hy, hz - DROP_M * f)}
        if splay:
            kw['rot'] = Euler((splay * splay_sign * f, 0.0, 0.0))
        clip.key(group, t, **kw)


def author(bank):
    deploy = bank.clip('struts_deploy', 1.3, loop=False, end_mode='hold')
    # Mains drop first and splay out; nose follows on a lag — heavy gear reads
    # staggered, not synchronous.
    _strut_keys(deploy, 'kestrel_strut_p', [
        (0.0, 0.0), (0.25, 0.28), (0.55, 0.72), (0.8, 1.0),
        (0.95, 1.06), (1.1, 0.99), (1.3, 1.0)], splay=SPLAY_RAD, splay_sign=1.0)
    _strut_keys(deploy, 'kestrel_strut_s', [
        (0.0, 0.0), (0.25, 0.28), (0.55, 0.72), (0.8, 1.0),
        (0.95, 1.06), (1.1, 0.99), (1.3, 1.0)], splay=SPLAY_RAD, splay_sign=-1.0)
    _strut_keys(deploy, 'kestrel_strut_f', [
        (0.0, 0.0), (0.18, 0.0), (0.45, 0.3), (0.75, 0.74),
        (1.0, 1.0), (1.15, 1.05), (1.3, 1.0)])

    settle = bank.clip('dock_settle', 1.5, loop=False, end_mode='hold')
    # f is extension fraction: 1.0 = fully deployed. Weight compresses the rams
    # (~30%), rebounds just past, then breathes out onto the gear. The nose skid
    # carries no splay channel.
    for group, splay_sign in (('kestrel_strut_p', 1.0), ('kestrel_strut_s', -1.0),
                              ('kestrel_strut_f', 0.0)):
        _strut_keys(settle, group, [
            (0.0, 1.0), (0.28, 0.70), (0.55, 1.04), (0.8, 0.96),
            (1.05, 1.01), (1.3, 0.99), (1.5, 1.0)],
            splay=SPLAY_RAD, splay_sign=splay_sign)

    stow = bank.clip('struts_stow', 0.9, loop=False, end_mode='rest')
    _strut_keys(stow, 'kestrel_strut_p', [
        (0.0, 1.0), (0.15, 1.03), (0.4, 0.72), (0.65, 0.3),
        (0.82, 0.08), (0.9, 0.0)], splay=SPLAY_RAD, splay_sign=1.0)
    _strut_keys(stow, 'kestrel_strut_s', [
        (0.0, 1.0), (0.15, 1.03), (0.4, 0.72), (0.65, 0.3),
        (0.82, 0.08), (0.9, 0.0)], splay=SPLAY_RAD, splay_sign=-1.0)
    _strut_keys(stow, 'kestrel_strut_f', [
        (0.0, 1.0), (0.15, 1.03), (0.4, 0.72), (0.65, 0.3),
        (0.82, 0.08), (0.9, 0.0)])


EVENTS = {
    'dock:range': 'struts_deploy',
    'dock:docked': 'dock_settle',
    'dock:undocked': 'struts_stow',
    'kestrel:strutsStow': 'struts_stow',
}


def build(ship, parts, source_asset_id, bank=None):
    register(ship, parts)
    if bank is None:
        bank = motion_bank.MotionBank(ship, 'kestrel_struts', source_asset_id,
                                    events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank
