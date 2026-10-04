"""Neutral source QA only, not shipping-renderer acceptance."""
from pathlib import Path
import bpy,math,sys
from mathutils import Vector
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parent/'normal-route-v2'
ROOT.joinpath('previews').mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(REPO/'assets/ships/forge/sources/latch_nine/LatchNine.blend'))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=40;scene.cycles.use_denoising=False
scene.render.threads_mode='FIXED';scene.render.threads=2
scene.render.resolution_x=1300;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('LatchNeutral');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.09,.12,.15,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.55
scene.view_settings.view_transform='AgX'
for name,location,power,size in [('Key',(-8,-8,18),2400,12),('Fill',(8,3,12),1700,10),('Rim',(-4,9,8),1800,9)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=location;o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
cam=bpy.data.objects.new('ReviewCamera',bpy.data.cameras.new('ReviewCamera'));scene.collection.objects.link(cam);scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=23
for view,pos in [('close',(14,-18,16)),('rear',(-22,-12,12)),('chase',(1,-12,22))]:
 cam.location=pos;cam.rotation_euler=(Vector((-.5,-1,0))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(ROOT/'previews'/('latch-'+view+'.png'));bpy.ops.render.render(write_still=True)
print('LATCH_SOURCE_PREVIEWS_COMPLETE')
