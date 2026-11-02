import sys
import numpy as np
from PIL import Image, ImageDraw
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
    return np.round(srgb(v + (1 - v) * haut[:, None]) * 255).astype(np.uint8)
def teint(forme, hexa, *p):
    a = np.asarray(Image.open(A + f'forme-{forme}.webp').convert('RGBA'))
    out = a.copy(); out[..., :3] = ramp(hexa, *p)[a[..., 0]]
    return Image.fromarray(out)
variantes = [tuple(map(float, v.split(','))) for v in sys.argv[2].split(';')]
lignes = [l.split(':') for l in sys.argv[1].split()]
C = 300
img = Image.new('RGB', (C * (1 + len(variantes)), C * len(lignes)), (30, 30, 34))
for y, (perso, forme, hexa) in enumerate(lignes):
    for x, im in enumerate([Image.open(A + f'{perso}-corps.webp').convert('RGBA')] + [teint(forme, hexa, *v) for v in variantes]):
        bg = Image.new('RGBA', im.size, (30, 30, 34, 255)); bg.alpha_composite(im)
        img.paste(bg.convert('RGB').resize((C, C), Image.LANCZOS), (x * C, y * C))
img.save(sys.argv[3])
