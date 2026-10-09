"""Read-only packed-image/source dependency census. Run in Blender."""
import bpy,json,sys,hashlib
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:]; manifest,out=map(Path,args)
rows=[]
for row in json.loads(manifest.read_text()):
 p=Path(row['source']);bpy.ops.wm.open_mainfile(filepath=str(p))
 images=[]
 for image in bpy.data.images:
  if image.type in {'RENDER_RESULT','COMPOSITING'}:continue
  packed=list(image.packed_files)
  images.append({'name':image.name,'source':image.source,'path':image.filepath,'size':list(image.size),'packed':bool(packed),'packedFiles':[{'bytes':item.packed_file.size,'sha256':hashlib.sha256(item.packed_file.data).hexdigest()}for item in packed]})
 rows.append({'path':row['path'],'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'libraries':[lib.filepath for lib in bpy.data.libraries],'images':images,'allImagesPacked':all(i['packed']for i in images),'actions':len(bpy.data.actions)})
out.write_text(json.dumps({'blender':bpy.app.version_string,'files':rows},indent=2)+'\n')
