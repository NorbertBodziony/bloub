import sys, math, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'fit'))
from commun import REF_PNG  # noqa: E402
from PIL import Image
sys.argv += []
REF = Image.open(REF_PNG).convert('RGB')
ZONES = {'nexo': (60, 410, 215, 565), 'vita': (30, 815, 165, 965), 'cloe': (30, 1095, 165, 1240),
         'malu': (30, 1280, 165, 1430), 'yoshi': (40, 1490, 150, 1590), 'fred': (40, 1665, 150, 1785)}
def analyse(im, corps):
    """Blobs clairs (yeux) : centre, longueur, epaisseur, angle, en fraction de la largeur du corps."""
    px = im.load(); w, h = im.size
    x0, y0, x1, y1 = corps; L = x1 - x0
    clair = set()
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b = px[x, y][:3]
            if min(r, g, b) > 150 and max(r, g, b) - min(r, g, b) < 70: clair.add((x, y))
    blobs = []
    while clair:
        pile = [clair.pop()]; b = []
        while pile:
            p = pile.pop(); b.append(p)
            for d in ((1,0),(-1,0),(0,1),(0,-1)):
                q = (p[0]+d[0], p[1]+d[1])
                if q in clair: clair.remove(q); pile.append(q)
        if len(b) > 6: blobs.append(b)
    blobs.sort(key=len, reverse=True); blobs = sorted(blobs[:2], key=lambda b: sum(p[0] for p in b) / len(b))
    out = []
    for b in blobs:
        n = len(b); mx = sum(p[0] for p in b)/n; my = sum(p[1] for p in b)/n
        sxx = sum((p[0]-mx)**2 for p in b)/n; syy = sum((p[1]-my)**2 for p in b)/n; sxy = sum((p[0]-mx)*(p[1]-my) for p in b)/n
        t = math.sqrt(((sxx-syy)/2)**2 + sxy**2); l1 = (sxx+syy)/2 + t; l2 = (sxx+syy)/2 - t
        ang = math.degrees(0.5*math.atan2(2*sxy, sxx-syy))
        out.append(((mx-x0)/L, (my-y0)/L, math.sqrt(12*l1)/L, math.sqrt(12*max(l2,0))/L, ang))
    return out
def cadre(im):
    p = im.load(); xs=[];ys=[]
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r,g,b = p[x,y]
            if abs(r-20)+abs(g-20)+abs(b-20) > 120: xs.append(x); ys.append(y)
    return (min(xs), min(ys), max(xs)+1, max(ys)+1)
def corps_ref(n):
    im = REF.crop(ZONES[n]); return im, cadre(im)
def rendu(n):
    # notre rendu sur le fond de la capture, cadre par le MEME seuil
    o = Image.open(f'{sys.argv[1]}/{n}.png').convert('RGBA')
    f = Image.new('RGBA', o.size, (20, 20, 20, 255)); f.alpha_composite(o); o = f.convert('RGB')
    return o, cadre(o)
for n in [z for z in ZONES if os.path.exists(f'{sys.argv[1]}/{z}.png')]:
    im, bb = corps_ref(n)
    o, ob = rendu(n)
    f = lambda e: ' '.join(f'{v:+.3f}' if i<4 else f'{v:+5.0f}' for i, v in enumerate(e))
    for i, (a, b) in enumerate(zip(analyse(im, bb), analyse(o, ob))):
        print(f'{n:5} oeil{i}  ref {f(a)}   nous {f(b)}')

# --- en unites du moteur (rayon du corps = 1), via le cadrage de NOTRE rendu ---
import json
res = {}
for n in [z for z in ZONES if os.path.exists(f'{sys.argv[1]}/{z}.png')]:
    im, bb = corps_ref(n)
    o, (ox0, oy0, ox1, oy1) = rendu(n)
    k = 3.16 / o.size[0]; L = (ox1 - ox0) * k
    vers = lambda e: [ox0 * k - 1.58 + e[0] * L, oy0 * k - 1.58 + e[1] * L, e[2] * L, e[3] * L, e[4]]
    res[n] = {'ref': [vers(e) for e in analyse(im, bb)], 'nous': [vers(e) for e in analyse(o, (ox0, oy0, ox1, oy1))]}
json.dump(res, open(sys.argv[2], 'w'), indent=1)
