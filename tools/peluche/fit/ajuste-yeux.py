"""Recale les yeux d'une composition sur la capture : centre (oeil_d) et taille (oeil_ech), en 3 passes.

    python3 ajuste-yeux.py <Nom> <generation.png> <params.json> <sortie.png>
"""
import json, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import compose2 as C  # noqa: E402

src = open(os.path.join(C.ICI, '..', 'mesure', 'yeux.py')).read().split('def rendu')[0].replace('sys.argv += []', '')
G = {}
exec(src, G)
nom, gen_png, pfile, sortie = sys.argv[1:5]
P = json.load(open(pfile))
gen = C.decoupe(gen_png)
bot = C.BOTS[nom]
ref, rbb = G['corps_ref'](nom.lower())
A = G['analyse'](ref, rbb)
for passe in range(4):
    out = C.compose(nom, gen, P)
    f = Image.new('RGBA', out.size, (20, 20, 20, 255)); f.alpha_composite(out); o = f.convert('RGB')
    # mesure a l'echelle de la capture : son flou fait partie de ce qu'on compare
    ob = tuple(v * 4 for v in G['cadre'](o.resize((256, 256), Image.LANCZOS)))
    kk = (rbb[2] - rbb[0]) / (ob[2] - ob[0])
    petit = o.resize((round(o.width * kk), round(o.height * kk)), Image.LANCZOS)
    pb = G['cadre'](petit)
    B = G['analyse'](petit, pb)
    L = (ob[2] - ob[0]) * 3.16 / o.size[0]
    d = P.setdefault('oeil_d', [[0, 0], [0, 0]])
    e = P.setdefault('oeil_ech', [[1, 1], [1, 1]])
    # les blobs sont tries de gauche a droite, comme les yeux du moteur
    for i, (a, b) in enumerate(zip(A, B)):
        d[i] = [d[i][0] + (a[0] - b[0]) * L, d[i][1] + (a[1] - b[1]) * L]
        # longueur / epaisseur du blob -> axes du patin selon son orientation
        large = bot['yeux'][i]['w'] >= bot['yeux'][i]['h']
        kl, ke = a[2] / b[2], a[3] / max(b[3], 1e-6)
        kx, ky = (kl, ke) if large else (ke, kl)
        e[i] = [e[i][0] * kx, e[i][1] * ky]
    print(passe, ' '.join(f'{a[0]-b[0]:+.3f},{a[1]-b[1]:+.3f} x{a[2]/b[2]:.2f},{a[3]/max(b[3],1e-6):.2f}' for a, b in zip(A, B)), flush=True)
json.dump(P, open(sortie.replace('.png', '.json'), 'w'), indent=1)
C.compose(nom, gen, P).save(sortie)
Cb, lref = C.cible(nom)
print(nom, 'score', round(C.score(C.compose(nom, gen, P, 384), Cb, lref), 3))
