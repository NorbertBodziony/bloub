"""Animation : reference fixe a gauche, colonne photo animee a droite, meme echelle par rangee."""
import os, sys, glob
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'fit'))
from compose2 import REF, ZONES, bbox  # noqa: E402
frames, sortie = sys.argv[1], sys.argv[2]
noms = ['nexo', 'vita', 'cloe', 'malu', 'yoshi', 'fred']
fs = sorted(glob.glob(f'{frames}/f*.png'))
f0 = Image.open(fs[0]).convert('RGB'); W, H = f0.size
x0 = int(W * 0.69); col = (x0, 0, W, H)
bande = H / len(noms)
fond = Image.new('RGB', (2 * (W - x0), H), (28, 28, 30))
for i, nom in enumerate(noms):
    zone = f0.crop((x0, int(i * bande), W, int((i + 1) * bande)))
    bb = bbox(np.asarray(zone))
    ref = REF.crop(ZONES[nom]).convert('RGB'); rb = bbox(np.asarray(ref))
    k = (bb[2] - bb[0]) / (rb[2] - rb[0])
    r = ref.resize((round(ref.width * k), round(ref.height * k)), Image.LANCZOS)
    cx, cy = (rb[0] + rb[2]) / 2 * k, (rb[1] + rb[3]) / 2 * k
    tx, ty = (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2 + i * bande
    # rangee de la reference : on decoupe autour du corps pour ne pas deborder
    m = Image.new('L', r.size, 0); m.paste(255, (int(rb[0] * k) - 12, int(rb[1] * k) - 12, int(rb[2] * k) + 12, int(rb[3] * k) + 12))
    from PIL import ImageFilter
    fond.paste(r, (round(tx - cx), round(ty - cy)), m.filter(ImageFilter.GaussianBlur(8)))
ims = []
for f in fs:
    o = fond.copy(); o.paste(Image.open(f).convert('RGB').crop(col), (W - x0, 0))
    ims.append(o.resize((int(o.width * 0.9), int(o.height * 0.9)), Image.LANCZOS))
ims[0].save(sortie, save_all=True, append_images=ims[1:], duration=67, loop=0, quality=72)
ims[30].save(sortie.replace('.webp', '.png'))
