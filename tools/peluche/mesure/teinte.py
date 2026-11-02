import sys
import numpy as np
from PIL import Image
import os
# les images du paquet, depuis l'emplacement du script
A = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../src/plush/assets/')
GRIS = 0.55
lin = lambda c: np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
srgb = lambda c: np.where(c <= 0.0031308, c * 12.92, 1.055 * np.clip(c, 0, None) ** (1 / 2.4) - 0.055)
def ramp(hexa, gamma, sheen, expo=1.0):
    ink = lin(np.array([int(hexa[i:i + 2], 16) for i in (1, 3, 5)]) / 255)
    g = np.arange(256) / 255
    k = expo * (lin(g) / lin(np.array(GRIS))) ** gamma
    haut = sheen * np.clip((g - GRIS) / (1 - GRIS), 0, None) ** 2
    v = np.minimum(1, ink[None, :] * k[:, None])
    return np.round(srgb(v + (1 - v) * haut[:, None]) * 255)
def charge(f):
    a = np.asarray(Image.open(A + f).convert('RGBA')).astype(float)
    return a
paires = [(a.split(':')[0], a.split(':')[1], a.split(':')[2]) for a in sys.argv[1:]]
Q = np.linspace(0.03, 0.97, 33)
def pixels(a):
    m = a[..., 3] > 250
    return a[..., :3][m]
donnees = []
for perso, forme, hexa in paires:
    p = pixels(charge(f'{perso}-corps.webp'))
    g = pixels(charge(f'forme-{forme}.webp'))[:, 0].astype(int)
    donnees.append((perso, hexa, np.quantile(p, Q, axis=0), g))
def erreur(gamma, sheen, expo=1.0, detail=False):
    e = 0
    for perso, hexa, qp, g in donnees:
        t = ramp(hexa, gamma, sheen, expo)[g]
        qt = np.quantile(t, Q, axis=0)
        d = np.abs(qt - qp).mean()
        if detail: print(perso, 'ecart moyen', round(d, 2), 'mediane ref', qp[16].round(), 'teinte', qt[16].round(), 'q05', qp[1].round(), qt[1].round(), 'q95', qp[-2].round(), qt[-2].round())
        e += d
    return e / len(donnees)
print('actuel', round(erreur(1.25, 0.22, 1.0, True), 2))
for perso, hexa, qp, g in donnees: print(perso, 'gris q', np.quantile(g, [0.05, 0.25, 0.5, 0.75, 0.95]))
# l'exposition reste a 1 : la mediane est la couleur demandee (docs/plush.md, Tint).
# np.arange(0.5, 1.21, 0.05) pour la chercher quand meme.
EXPOS = [1.0]
best = min(((erreur(gm, sh, ex), gm, sh, ex) for gm in np.arange(0.4, 2.01, 0.05) for sh in np.arange(0, 0.41, 0.04) for ex in EXPOS))
print('meilleur', best)
erreur(best[1], best[2], best[3], True)
