"""Overlay a metre grid on a plan sheet. usage: grid_overlay.py name ox oz x0 z0 x1 z1 out  (ox,oz = sheet pt of plan origin)"""
import sys, pymupdf as fitz
from PIL import Image, ImageDraw, ImageFont
SRC={"gf":r"C:/Users/Administrator/Downloads/ASHIQ FINAL GF PLAN.pdf","ff":r"C:/Users/Administrator/Downloads/ASHIQ FINAL FF PLAN3.pdf"}
SC=28.54
name=sys.argv[1]; ox,oz,x0,z0,x1,z1=map(float,sys.argv[2:8]); out=sys.argv[8]
dpi=int(sys.argv[9]) if len(sys.argv)>9 else 400
p=fitz.open(SRC[name])[0]; k=dpi/72
pm=p.get_pixmap(dpi=dpi)
full=Image.frombytes("RGB",(pm.width,pm.height),pm.samples)
im=full.crop((round((ox+x0*SC)*k),round((oz+z0*SC)*k),round((ox+x1*SC)*k),round((oz+z1*SC)*k)))
d=ImageDraw.Draw(im,"RGBA")
f=ImageFont.load_default(size=14) if hasattr(ImageFont,'load_default') else None
def X(m): return (m-x0)*SC*k
def Z(m): return (m-z0)*SC*k
import math
m=math.floor(x0*10)/10
while m<=x1:
    i=round(m*10); col=(255,0,0,150) if i%10==0 else ((0,120,255,90) if i%5==0 else (0,180,0,40))
    d.line([(X(m),0),(X(m),im.height)],fill=col,width=1)
    if i%5==0: d.text((X(m)+2,2),f"{m:.1f}",fill=(255,0,0,255),font=f)
    m+=0.1
m=math.floor(z0*10)/10
while m<=z1:
    i=round(m*10); col=(255,0,0,150) if i%10==0 else ((0,120,255,90) if i%5==0 else (0,180,0,40))
    d.line([(0,Z(m)),(im.width,Z(m))],fill=col,width=1)
    if i%5==0: d.text((2,Z(m)+2),f"{m:.1f}",fill=(255,0,0,255),font=f)
    m+=0.1
im.save(out); print(im.size)
