# Portable path-only adaptation. Historical original remains untouched.
"""Actual editable Blender actions and Forge bank sampled at every runtime tick."""
import bpy,sys,json,math,os
from pathlib import Path
from types import SimpleNamespace
from mathutils import Vector,Quaternion
sys.path.insert(0,str(Path(__file__).resolve().parents[1]));from context import INPUT as R,OUT as O,FORGE as F,CONTRACT;sys.path.insert(0,str(F/'animations'));import motion_bank as MB
MB.MOTIONS_DIR=str(O)
bpy.ops.wm.open_mainfile(filepath=str(O/'charger-LOD0-source.blend'));groups=[];pivots={};rests={}
for rid in ['charger_paddle_port','charger_paddle_starboard','charger_abdomen']:
 o=bpy.data.objects['MOTION_'+rid.upper()];o.rotation_mode='QUATERNION';o['forge_motion_rest']=[list(row)for row in o.matrix_basis];groups.append({'id':rid,'parent':None});pivots[rid]=o;rests[rid]=(o.location.copy(),o.rotation_quaternion.copy())
ship=SimpleNamespace(motion_groups=groups,motion_pivots=pivots);bank=MB.MotionBank(ship,'brood_charger','SF_BROOD_CHARGER_V01')
def smooth(t):
 t=max(0,min(1,t));return t*t*(3-2*t)
phases=[('approach',1,lambda t:0),('windup',45,lambda t:smooth(t/45)),('attack',144,lambda t:1+(.08-1)*smooth(t/8)),('recovery',84,lambda t:.08+(.65-.08)*smooth(t/8)if t<8 else .65*(1-smooth((t-8)/76)))]
for phase,ticks,fraction in phases:
 clip=bank.clip('brood_'+phase,ticks/60,end_mode='hold')
 for rid,o in pivots.items():
  action=bpy.data.actions.new('CHARGER_'+phase+'_'+rid);action.use_fake_user=True;o.animation_data_create();o.animation_data.action=action;p,q=rests[rid]
  for tick in range(ticks+1):
   f=fraction(tick)
   if rid=='charger_abdomen':
    value=p+Vector((.8*f,0,0));o.location=value;o.keyframe_insert('location',frame=tick);clip.key(rid,tick/60,loc=value)
   else:
    sign=1 if rid.endswith('port')else-1;value=q@Quaternion((1,0,0),sign*.42*f);o.rotation_quaternion=value;o.keyframe_insert('rotation_quaternion',frame=tick);clip.key(rid,tick/60,rot=value)
  for curve in action.fcurves:
   for point in curve.keyframe_points:point.interpolation='LINEAR'
  o.animation_data.action=None;o.location=p;o.rotation_quaternion=q
result=bank.bake([str(O/'brood_charger_v01.glb')],str(O/'brood-charger.motion.json'))
for b in result['bindings']:b['requiredAtLod']=[0,1,2]
result['driverAuthority']='Brood simulation-tick driver remains the sole final transform writer; clips mirror its exact sampled curve for editing and inspection.'
(O/'brood-charger.motion.json').write_text(json.dumps(result,indent=1)+'\n');bpy.context.scene.frame_set(0);bpy.ops.wm.save_as_mainfile(filepath=str(O/'charger-animated-source.blend'))
