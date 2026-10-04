"""NEW N4 deterministic organic palette/roughness; no sampled concept pixels or random noise."""
import bpy,math,json,hashlib
from pathlib import Path
CENTRES=(.12,.29,.47,.64,.80,.92)
def course(u,t):
    value=0
    for i in range(32):
        c=.025+(i+.12*math.sin(i*1.91))*.0304
        q=t+(.027+.006*math.sin(i*1.7))*math.sin(math.pi*u)+.006*math.sin(2*math.pi*u+i*.73)
        value+=(.15+.85*math.sin(math.pi*u+i*.29)**4)*math.exp(-((q-c)/(.0029+.00065*(i%3)))**2)
    return value
def write_atlas(out):
    out=Path(out);out.mkdir(parents=True,exist_ok=True);width,height=1024,512
    colors=[];rough=[]
    for y in range(height):
        v=y/(height-1)
        for x in range(width):
            u=x/(width-1)
            if .015<=v<=.585:
                t=(v-.015)/.570
                edge=max(math.exp(-((1-u)/.026)**2),.72*math.exp(-(min(t,1-t)/.025)**2)); edge*=.82+.18*math.sin(19*u+4*math.sin(8*t))**2
                crown=math.sin(math.pi*t)**2*math.sin(math.pi*u)**2
                base=(.345+.048*crown,.074+.020*crown,.145+.027*crown);rim=(.64,.355,.37)
                rgb=tuple(a+(b-a)*edge*.78 for a,b in zip(base,rim))
                r=.44+.04*math.sin(math.pi*u)**2+.06*edge-.035*min(1,course(u,t))
            elif .590<=v<=.614:
                rgb=(.19,.044,.068);r=.66
            elif .620<=v<=.795:
                rgb=(.135,.102,.148);r=.49+.055*math.sin(7*math.pi*u)**2
            elif .830<=v<=.985:
                t=(v-.830)/.155;rgb=(.785,.724,.636);r=.45+.025*math.sin(math.pi*u)**2
            else:rgb=(.20,.08,.11);r=.65
            colors.extend((*rgb,1));rough.extend((r,r,r,1))
    rows=[]
    for name,pixels,space in [('brood-anatomical-albedo.png',colors,'sRGB'),('brood-shared-anatomy-roughness.png',rough,'Non-Color')]:
        im=bpy.data.images.new(name,width=width,height=height,alpha=False);im.colorspace_settings.name=space;im.pixels.foreach_set(pixels);im.filepath_raw=str(out/name);im.file_format='PNG';im.save();im.pack();rows.append({'file':name,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest()})
    (out/'recovery-palette-receipt.json').write_text(json.dumps({'candidate':'N4 NEW bytes','recipe':'restrained terminal margin and body-underside contact zone; shell-only bowed directional roughness','randomNoise':False,'images':rows},indent=2)+'\n')
    return rows
if __name__=='__main__':write_atlas(Path(__file__).resolve().parent/'textures')
