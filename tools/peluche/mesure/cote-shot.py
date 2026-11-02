"""Reference | capture du bac a sable, meme cadrage (boite du corps)."""
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'fit'))
from compose2 import REF, ZONES, bbox  # noqa: E402

def carre(im, bb, cote, marge=0.12):
    x0, y0, x1, y1 = bb
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    c = max(x1 - x0, y1 - y0) * (1 + 2 * marge) / 2
    return im.crop((int(cx - c), int(cy - c), int(cx + c), int(cy + c))).resize((cote, cote), Image.LANCZOS)
cote = 300
noms = sys.argv[2].split(',')
shots = sys.argv[3:]
out = Image.new('RGB', (cote * 2 + 10, (cote + 10) * len(noms)), (20, 20, 20))
for i, (nom, png) in enumerate(zip(noms, shots)):
    ref = REF.crop(ZONES[nom]).convert('RGB')
    out.paste(carre(ref, bbox(np.asarray(ref)), cote), (0, i * (cote + 10)))
    f = Image.open(png).convert('RGB')
    out.paste(carre(f, bbox(np.asarray(f)), cote), (cote + 10, i * (cote + 10)))
out.save(sys.argv[1])
