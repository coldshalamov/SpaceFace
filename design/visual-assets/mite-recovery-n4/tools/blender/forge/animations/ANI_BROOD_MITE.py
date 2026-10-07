"""P14 mite: explicit approach/windup/lunge/recovery, no ambient AI authority."""
from pathlib import Path
import sys
from mathutils import Euler
sys.path.insert(0,str(Path(__file__).resolve().parent))
from motion_bank import MotionBank

def build(ship,source_asset_id):
    bank=MotionBank(ship,'brood_mite',source_asset_id,events={})
    for state,fraction in ship.contract['motion']['poses'].items():
        clip=bank.clip('brood_'+state,1/60,loop=False,end_mode='hold')
        for rig in ship.contract['motion']['rigs']:
            rot=Euler((rig['foldRadians']*fraction,0,0))
            clip.key(rig['id'],0,rot=rot);clip.key(rig['id'],1/60,rot=rot)
    return bank
