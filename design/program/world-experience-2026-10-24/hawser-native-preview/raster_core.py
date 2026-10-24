import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont
def trans(meshes,scale=1,off=(0,0,0),rot=0,center=None,tint=None):
 c,s=math.cos(rot),math.sin(rot);mat=np.array([[c,0,-s],[0,1,0],[s,0,c]]);out=[]
 for m in meshes:
  v=m['v'].copy()
  if center is not None:v-=center
  v=(v*scale)@mat.T+np.array(off);n=m['n']@mat.T
  q={**m,'v':v,'n':n}
  if tint is not None:q['color']=(np.array(m['color'])*.42+np.array(tint)*.58).tolist();q['emissive']=(np.array(m['emissive'])*.3).tolist()
  out.append(q)
 return out
def render(rect,meshes,span,center=(0,0,0),cam=None,grid=False):
 x0,y0,w,h=rect
 if cam is None:B=np.array([[1,0,0],[0,0,1],[0,1,0]])
 else:
  f=np.array(cam,dtype=float);f/=np.linalg.norm(f);r=np.cross([0,1,0],f);r/=np.linalg.norm(r);u=np.cross(f,r);B=np.array([r,u,f])
 k=w/span;rgb=np.zeros((h,w,3),dtype=float)+np.array([19,30,41]);zbuf=np.full((h,w),-np.inf);light=np.array([-.3,.85,.4]);light/=np.linalg.norm(light)
 if grid:
  for q in np.arange(-1000,1500,100):
   xx=int((q-center[0])*k+w/2);yy=int(-(q-center[2])*k+h/2)
   if 0<=xx<w:rgb[:,xx:xx+1,:]=[29,44,57]
   if 0<=yy<h:rgb[yy:yy+1,:,:]=[29,44,57]
 for m in meshes:
  p=(m['v']-center)@B.T;p[:,:2]*=[k,-k];p[:,:2]+=[w/2,h/2];n=m['n'];color=np.array(m['color']);emi=np.array(m['emissive'])
  for ids in m['ix']:
   a,b,c=p[ids];xmin=max(0,int(np.floor(min(a[0],b[0],c[0]))));xmax=min(w-1,int(np.ceil(max(a[0],b[0],c[0]))));ymin=max(0,int(np.floor(min(a[1],b[1],c[1]))));ymax=min(h-1,int(np.ceil(max(a[1],b[1],c[1]))));den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
   if abs(den)<1e-9 or xmax<xmin or ymax<ymin:continue
   yy,xx=np.mgrid[ymin:ymax+1,xmin:xmax+1];xx=xx+.5;yy=yy+.5;wa=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den;wb=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;wc=1-wa-wb;zz=wa*a[2]+wb*b[2]+wc*c[2];sub=zbuf[ymin:ymax+1,xmin:xmax+1];mask=(wa>=0)&(wb>=0)&(wc>=0)&(zz>sub)
   if not mask.any():continue
   norm=wa[...,None]*n[ids[0]]+wb[...,None]*n[ids[1]]+wc[...,None]*n[ids[2]];norm/=np.maximum(np.linalg.norm(norm,axis=-1,keepdims=True),1e-8);lighting=.28+1.3*np.maximum(0,norm@light);col=np.clip(color*lighting[...,None]+emi*.36,0,1);col=np.where(col<=.0031308,col*12.92,1.055*np.power(col,1/2.4)-.055)*255;rgb[ymin:ymax+1,xmin:xmax+1][mask]=col[mask];sub[mask]=zz[mask]
 im.paste(Image.fromarray(rgb.astype('uint8')),(x0,y0));draw.rectangle((x0,y0,x0+w-1,y0+h-1),outline=line,width=2)
 return lambda x,z:(x0+(x-center[0])*k+w/2,y0-(z-center[2])*k+h/2),k
