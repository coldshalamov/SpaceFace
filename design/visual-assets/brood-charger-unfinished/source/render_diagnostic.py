scene=bpy.context.scene;center=(lo+hi)*.5;extent=max(hi-lo)
for name,loc,power,size in [('key',(.2,-.7,1),1700,.8),('fill',(-.8,.2,.5),800,1),('rim',(.5,.8,.6),1800,.6),('ventral',(.2,-.5,-1),650,.8)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power*extent*extent/100;d.shape='DISK';d.size=extent*size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=center+Vector(loc)*extent;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
w=bpy.data.worlds.new('Neutral diagnostic');w.use_nodes=True;w.node_tree.nodes['Background'].inputs[0].default_value=(.12,.12,.12,1);w.node_tree.nodes['Background'].inputs[1].default_value=.35;scene.world=w
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.resolution_x=840;scene.render.resolution_y=660;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True;scene.view_settings.view_transform='AgX'
cd=bpy.data.cameras.new('Diagnostic');cam=bpy.data.objects.new('Diagnostic',cd);scene.collection.objects.link(cam);scene.camera=cam;cd.type='ORTHO'
views=[('top',(0,0,3)),('chase60',(0,-1.5,2.598076)),('threequarter',(1.6,-2,1.8)),('fork',(3,-.65,.8)),('underside',(1.5,-1.5,-1.5)),('side',(.1,-3,.05))]
for view,pos in views:
 target=Vector((5.8,0,.2)) if view=='fork' else center;cd.ortho_scale=14 if view=='fork' else extent*1.18
 cam.location=target+Vector(pos)*extent;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/f'c{OUT.name.split("c")[-1]}-lod{LOD}-{view}.png');bpy.ops.render.render(write_still=True)
cd.ortho_scale=extent*1.18;cam.location=center+Vector((.4,-2,1.8))*extent;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
for phase,f in [('approach',0),('windup',1),('attack',.08),('recovery',.65)]:
 for sign,label in [(1,'PORT'),(-1,'STARBOARD')]:
  o=bpy.data.objects['MOTION_CHARGER_PADDLE_'+label];o.rotation_mode='QUATERNION';o.rotation_quaternion=Quaternion((1,0,0),sign*.42*f)
 bpy.data.objects['MOTION_CHARGER_ABDOMEN'].location.x=-2+.8*f
 bpy.context.view_layer.update();scene.render.filepath=str(OUT/f'c{OUT.name.split("c")[-1]}-lod{LOD}-pose-{phase}.png');bpy.ops.render.render(write_still=True)
