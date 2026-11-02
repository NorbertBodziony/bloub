"""Corps gris d'une forme du personnaliseur, depuis une generation Higgsfield (corps a gauche, boule a droite).

    python3 -I forme.py <formes.json> <forme> <generation.png> <dossier-sortie> [--boule]

Pas de capture de reference pour ces corps : pas d'etalonnage contre une cible. Le corps
est recale boite a boite sur le contour du moteur (`formes.json`, ecrit par
`tools/peluche/formes.ts`) puis NORMALISE : luminance seule, mediane de l'interieur
ramenee a GRIS_CIBLE. C'est ce gris que `src/plush/tint.ts` teinte : une mediane fixe
veut dire qu'une meme couleur donne le meme corps, quelle que soit la generation.

--boule exporte aussi la petite boule (points de reflexion, pastille), meme normalisation.
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compose import detoure, boite, DEMI  # noqa: E402

GRIS_CIBLE = 0.55
T = 768


def masque(contour, T):
    c = np.array(contour, float)
    c = np.stack([ndimage.gaussian_filter1d(c[:, i], 2, mode='wrap') for i in range(2)], 1)
    ss = 4
    im = Image.new('L', (T * ss, T * ss), 0)
    ImageDraw.Draw(im).polygon([tuple((p + DEMI) * T / (2 * DEMI) * ss) for p in c], fill=255)
    return np.asarray(im.resize((T, T), Image.LANCZOS)) / 255


def blobs(src):
    """Le corps (le plus grand blob de la moitie gauche) et la boule (le plus grand a droite)."""
    a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
    rgba = detoure(a)
    al = rgba[..., 3] / 255
    lab, n = ndimage.label(al > 0.5)
    tailles = ndimage.sum(np.ones_like(al), lab, range(1, n + 1))
    cx = ndimage.mean(np.indices(al.shape)[1], lab, range(1, n + 1))
    gauche = [k for k in range(n) if cx[k] < a.shape[1] * 0.55]
    droite = [k for k in range(n) if cx[k] >= a.shape[1] * 0.55]
    def sprite(k, marge):
        z = ndimage.binary_dilation(lab == k + 1, iterations=60)
        s = rgba.copy(); s[~z, 3] = 0
        x0, y0, x1, y1 = boite(lab == k + 1)
        im = Image.fromarray(s.clip(0, 255).astype(np.uint8), 'RGBA')
        return im.crop((x0 - marge, y0 - marge, x1 + marge, y1 + marge)), (x1 - x0, y1 - y0)
    corps = sprite(max(gauche, key=lambda k: tailles[k]), 60)
    boule = sprite(max(droite, key=lambda k: tailles[k]), 40) if droite else None
    return corps, boule


def normalise(im):
    """Luminance seule, mediane de l'interieur (alpha plein) a GRIS_CIBLE."""
    o = np.asarray(im).astype(np.float32) / 255
    lum = o[..., :3] @ np.array([0.2126, 0.7152, 0.0722])
    plein = o[..., 3] > 0.98
    lum = np.clip(lum * (GRIS_CIBLE / np.median(lum[plein])), 0, 1)
    o[..., :3] = lum[..., None]
    return Image.fromarray((o * 255 + 0.5).astype(np.uint8), 'RGBA')


def main():
    fjson, nom, src, dossier = sys.argv[1:5]
    forme = next(f for f in json.load(open(fjson)) if f['nom'] == nom)
    (corps, (cw, ch)), boule = blobs(src)
    bn = boite(masque(forme['contour'], T))
    sx, sy = (bn[2] - bn[0]) / cw, (bn[3] - bn[1]) / ch
    out = corps.transform((T, T), Image.AFFINE, (1 / sx, 0, 60 - bn[0] / sx, 0, 1 / sy, 60 - bn[1] / sy), resample=Image.BICUBIC)
    os.makedirs(dossier, exist_ok=True)
    normalise(out).save(os.path.join(dossier, f'{nom}.webp'), quality=90, method=6)
    print(nom, 'echelle', round(sx, 3), round(sy, 3), 'anisotropie', round(sx / sy, 3))
    if '--boule' in sys.argv and boule:
        (b, (bw, bh)) = boule
        # carre, la boule au centre, diametre = 80 % du cote
        cote = 256
        k = 0.8 * cote / max(bw, bh)
        b = b.resize((round(b.width * k), round(b.height * k)), Image.LANCZOS)
        fond = Image.new('RGBA', (cote, cote), (0, 0, 0, 0))
        fond.alpha_composite(b, ((cote - b.width) // 2, (cote - b.height) // 2))
        normalise(fond).save(os.path.join(dossier, 'boule.webp'), quality=90, method=6)
        print('boule', bw, bh)


if __name__ == '__main__':
    main()
