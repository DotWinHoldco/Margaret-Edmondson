"""Export original Lumaprints PSD frame layers as reusable storefront WebPs.

Requires Pillow and psd-tools; source PSD URLs and marketing-use provenance are
recorded in public/frames/lumaprints/manifest.json. No API credentials required.
Set LUMAPRINTS_PSD_DIR to a folder containing the two downloaded source files.
"""
import json, re, os
from pathlib import Path
from PIL import Image, ImageDraw
from psd_tools import PSDImage

ROOT=Path(__file__).resolve().parents[1]
PSD_DIR=Path(os.environ.get('LUMAPRINTS_PSD_DIR', '/tmp'))
OUT=ROOT/'public/frames/lumaprints'
OUT.mkdir(parents=True,exist_ok=True)
URLS={
 'canvas':'https://lumaprints.s3.us-west-1.amazonaws.com/static/templates/Stretched+and+Framed+Canvas+Print+Mockup+Template+(S).psd',
 'paper':'https://lumaprints.s3.us-west-1.amazonaws.com/static/templates/Fine+Art+Paper+and+Framed+Fine+Art+Paper+Print+(no+Mat)+Mockup+Template.psd',
}
assets=[]
DECOR_ONLY=os.environ.get('DECOR_ONLY')=='1'
if DECOR_ONLY:assets=[x for x in json.loads((OUT/'manifest.json').read_text())['assets'] if 'decorative' not in x['family']]
def slug(name):
 name=name.lower()
 for pattern,value in [
  ('vintage','vintage-copper'),('slimwoods.*silver','slimwoods-black-silver'),('slimwoods.*gold','slimwoods-black-gold'),
  ('plein air.*espresso','plein-air-espresso-gold'),('framers choice','framers-choice-black-gold'),('concerto','concerto-black-gold'),
  ('driftwood white','barnwood-driftwood-white'),('driftwood gray','barnwood-driftwood-gray'),('gold plein','gold-plein-air'),
  ('black.*1.625','black-1.625'),('natural wood','natural-wood')]:
  if re.search(pattern,name):return value
 return name.split(' frame')[0].replace(' ','-')

def export(family,style,frame,art,back=None):
 if DECOR_ONLY and 'decorative' not in family:return
 im=frame.topil().convert('RGBA')
 # Preserve provider pixels; discard only exterior soft-shadow margin so frame
 # dimensions are not mistaken for the width of a drop shadow by nine-slicing.
 solid=im.getchannel('A').point(lambda v:255 if v>=240 else 0).getbbox()
 if solid is None:raise ValueError(frame.name)
 l,t,r,b=solid
 im=im.crop(solid)
 ax=art.left-frame.left-l;ay=art.top-frame.top-t
 aw=art.width;ah=art.height
 if min(ax,ay,im.width-ax-aw,im.height-ay-ah)<0:raise ValueError((style,solid,(ax,ay,aw,ah)))
 if 'decorative' in family:
  alpha=im.getchannel('A'); cx=im.width//2; cy=im.height//2
  left=cx; right=cx; top=cy; bottom=cy
  while left>0 and alpha.getpixel((left-1,cy))<=3:left-=1
  while right<im.width and alpha.getpixel((right,cy))<=3:right+=1
  while top>0 and alpha.getpixel((cx,top-1))<=3:top-=1
  while bottom<im.height and alpha.getpixel((cx,bottom))<=3:bottom+=1
  ax,ay,aw,ah=left,top,right-left,bottom-top
 ratio=min(1,1024/max(im.size))
 if ratio<1:im=im.resize((round(im.width*ratio),round(im.height*ratio)),Image.Resampling.LANCZOS)
 opening={'x':round(ax*ratio),'y':round(ay*ratio),'width':round((ax+aw)*ratio)-round(ax*ratio),'height':round((ay+ah)*ratio)-round(ay*ratio)}
 # Existing artwork remains a separate browser layer; clear its aperture exactly.
 x,y,w,h=opening.values()
 im.paste((0,0,0,0),(x,y,x+w,y+h))
 key=family+'-'+slug(style)
 dst=OUT/(key+'.webp')
 im.save(dst,'WEBP',quality=92,method=4,exact=True)
 mode='named-profile' if 'decorative' in family else 'finish-only'
 if slug(style)=='black-1.625':mode='named-profile'
 assets.append({'key':key,'family':family,'finish':style,'src':'/frames/lumaprints/'+dst.name,'width':im.width,'height':im.height,
  'opening':opening,'basisWidthIn':20,'basisHeightIn':20,'profileMatch':mode,
  'sourceProfileLabel':style,'sourceUrl':URLS['canvas' if family.startswith('canvas') else 'paper'],
  'sourceLayerPath': '/'.join([family,'20x20 Square',style,frame.name]),
  'sourceFrameBounds':[frame.left,frame.top,frame.right,frame.bottom],
  'sourceArtworkBounds':[art.left,art.top,art.right,art.bottom],
  'sourceSolidCrop':[l,t,r,b],'bytes':dst.stat().st_size})

p=PSDImage.open(PSD_DIR/'lumaprints-official-canvas-small.psd')
for family,group in [('canvas-floating',p[1][1][-1]),('canvas-gallery',p[2][-1])]:
 art=next(x for x in group if x.kind=='smartobject')
 for frame in group:
  if frame.kind=='pixel':export(family,frame.name,frame,art)
for style in p[1][0][-1]:
 export('canvas-decorative',style.name,list(style)[-1],next(x for x in style if x.kind=='smartobject'))
del p
p=PSDImage.open(PSD_DIR/'lumaprints-official-paper-no-mat.psd')
group=p[2][-1];art=next(x for x in group if x.kind=='smartobject')
for frame in group:
 if frame.kind=='pixel':export('paper-standard',frame.name,frame,art)
for style in p[1][-1]:
 export('paper-decorative',style.name,list(style)[-1],next(x for x in style if x.kind=='smartobject'))
manifest={'version':1,'sourcePage':'https://www.lumaprints.com/marketing-assets/',
 'licenseNote':'Lumaprints publishes these free marketing mockups for business product previews. Extracted original frame pixels; no claim of a broader redistribution license.',
 'exportNote':'20x20 provider presets; transparent artwork opening; cropped to solid frame outeredge excluding exterior soft shadow; preserve measured profile geometry when nine-slicing. Finish-only mappings are visual approximations for different physical profiles.',
 'assets':assets}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'assets':len(assets),'totalBytes':sum(x['bytes'] for x in assets),'keys':[x['key'] for x in assets]},indent=2))
